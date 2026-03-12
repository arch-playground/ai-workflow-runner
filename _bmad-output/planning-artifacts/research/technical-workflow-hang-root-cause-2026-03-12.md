# Technical Research: Workflow Hang Root Cause Analysis

**Date:** 2026-03-12
**Researcher:** TanNT + AI
**Status:** Complete

---

## Executive Summary

The workflow hanging issue persists despite implementing the heartbeat detection fix (tech-spec-fix-event-stream-silent-disconnect). Investigation reveals the fix was built on a **fundamentally wrong assumption**. The SSE stream is never silently disconnecting — the OpenCode server sends `server.heartbeat` events every 10 seconds, keeping the stream alive and preventing our heartbeat timeout from ever firing. The real cause is the AI session hanging server-side (upstream LLM API timeout or infinite processing), while the SSE stream remains healthy.

---

## Problem Statement

After implementing the heartbeat detection fix (PR #59, released v1.4.0), workflow runs on GitHub Actions continue to hang and timeout after ~30 minutes. The heartbeat detection mechanism never fires, as confirmed by the complete absence of heartbeat timeout warnings in production logs.

**Evidence from run [22951141878](https://github.com/ocean-network-express/om-blk-knowledge-base/actions/runs/22951141878/job/66615836632):**

- Last event at `11:54:54Z` (Tool: read `.env.dev` + text "Now I have enough information...")
- Workflow timeout at `12:21:04Z` — 26-minute gap
- Zero heartbeat timeout warnings in logs
- Confirmed running on v1.4.0 Docker image (SHA: `a32a159`)

---

## Investigation

### Phase 1: Verify Heartbeat Mechanism Works

Tested the `Promise.race` heartbeat pattern in isolation:

1. **Bare async generator with hanging `next()`** — heartbeat fires correctly after timeout
2. **Real SSE reader with hanging `reader.read()`** — heartbeat fires correctly
3. **Actual SDK `createSseClient` async generator** — heartbeat fires correctly
4. **Unit tests** — all 7 heartbeat tests pass

**Conclusion:** The heartbeat mechanism is correct. The code works. Something in production prevents it from triggering.

### Phase 2: Analyze Production Logs

The GitHub Actions log shows:

```
11:54:54.433Z  [OpenCode] Tool: read - running - .env.dev
11:54:54.433Z  [OpenCode] Now I have enough information...
              ← 26 MINUTES OF SILENCE →
12:21:04.627Z  ##[error]Workflow execution timed out after 1800000ms
12:21:04.627Z  [OpenCode] Shutting down server...
```

No `Event stream heartbeat timeout` warning. No `Attempting to reconnect`. No event loop errors. The event loop is alive and processing events — it just never logs anything visible.

### Phase 3: Discover Root Cause — OpenCode Server Heartbeat

Examined the OpenCode server source code at `packages/opencode/src/server/server.ts`:

```typescript
// Lines 534-542 — /event endpoint
// Send heartbeat every 10s to prevent stalled proxy streams.
const heartbeat = setInterval(() => {
  stream.writeSSE({
    data: JSON.stringify({
      type: 'server.heartbeat',
      properties: {},
    }),
  });
}, 10_000);
```

**The OpenCode server sends `server.heartbeat` SSE events every 10 seconds.** These are full data events (`data: {"type":"server.heartbeat","properties":{}}`) that the SDK's SSE client parses and yields through the async generator.

Our event loop receives these events:

1. `iterator.next()` resolves with the heartbeat event
2. `Promise.race` resolves (heartbeat wins over our timer)
3. Our heartbeat timer is cleared in the `finally` block
4. `handleEvent()` receives the event — it doesn't match any case in the switch, so it's silently ignored
5. The loop continues, setting a new 90-second heartbeat timer
6. 10 seconds later, another `server.heartbeat` arrives, resetting the timer again

**Our heartbeat timeout can never fire because the stream receives events every 10 seconds.**

---

## Root Cause

```
ASSUMED FAILURE MODE (wrong):
  SSE stream silently disconnects → reader.read() hangs → no events
  → heartbeat timeout fires → reconnect

ACTUAL FAILURE MODE:
  AI session hangs server-side (LLM API timeout / infinite processing)
  → OpenCode server keeps sending heartbeat events every 10s
  → SSE stream is ALIVE and HEALTHY
  → Our heartbeat timer resets every 10s (never fires)
  → No session.idle event arrives
  → waitForSessionIdle() waits until 30-min workflow timeout
```

The issue is NOT at the transport layer (SSE stream). It's at the application layer: the AI session never completes.

---

## Additional Bug: Infinite Heartbeat Retry

A secondary bug exists in the current implementation at `src/opencode.ts:387`:

```typescript
const nextAttempt = heartbeat ? 0 : attempt + 1;
```

If the heartbeat timeout were to fire, it would reset the attempt counter to 0, creating an infinite retry loop. This contradicts the tech spec's AC6 which states "heartbeat timeouts should exhaust reconnection attempts after 3 failures."

---

## Proposed Solutions

### Option A: Session-Level Activity Timeout (Recommended)

Instead of monitoring SSE stream health, monitor **session-level activity**. Track the timestamp of the last "meaningful" event (tool calls, text output, session status changes) and timeout if no meaningful activity occurs within a threshold.

**Implementation sketch:**

```typescript
// Track last meaningful event timestamp per session
private lastMeaningfulEventTimestamp: Map<string, number> = new Map();

// In handleEvent(), update timestamp for meaningful events
private handleEvent(event: unknown, client: OpencodeClient): void {
  // ... existing switch ...
  // Update timestamp for all handled event types (not server.heartbeat)
  if (matchedEventType && sessionId) {
    this.lastMeaningfulEventTimestamp.set(sessionId, Date.now());
  }
}

// In waitForSessionIdle(), add an activity check interval
const activityCheckInterval = setInterval(() => {
  const lastActivity = this.lastMeaningfulEventTimestamp.get(sessionId);
  if (lastActivity && Date.now() - lastActivity > ACTIVITY_TIMEOUT_MS) {
    reject(new Error(`Session ${sessionId} stalled — no activity for ${ACTIVITY_TIMEOUT_MS}ms`));
  }
}, CHECK_INTERVAL_MS);
```

**Pros:**

- Detects the actual failure mode (stalled AI session)
- Independent of SSE stream health
- Can use a shorter timeout (e.g., 5 minutes) since LLM inference rarely exceeds 2-3 minutes

**Cons:**

- Requires defining "meaningful" event (what about long LLM thinking pauses?)
- Risk of false positives during legitimate long inference

### Option B: Filter Server Heartbeat Events in Heartbeat Detection

Modify the heartbeat detection to only reset on non-heartbeat events:

```typescript
const result = await raceNextEventAgainstHeartbeat(iterator);
if (result.done) break;

const event = result.value as ParsedEvent;
// Don't count server heartbeats as "real" events
if (event?.type !== 'server.heartbeat') {
  this.handleEvent(result.value, client);
} else {
  // Server heartbeat — don't reset our heartbeat timer
  // But we need to re-structure: currently the timer IS reset in the finally block
}
```

**Problem:** This requires restructuring the heartbeat logic because the timer is currently cleared in the `finally` block of `raceNextEventAgainstHeartbeat()`. To skip resetting on server heartbeats, we'd need to move the timer management outside the race function, which adds complexity.

**Simpler variant:** Keep the race pattern but add a separate "meaningful event" timer:

```typescript
// Two timers:
// 1. SSE heartbeat (existing) — detects stream disconnect (90s)
// 2. Activity timeout (new) — detects stalled session (5min)
```

### Option C: Hybrid Approach (Recommended Implementation)

Keep the existing SSE heartbeat detection (for genuine stream disconnects) and add a session-level activity timeout:

1. **SSE heartbeat** (existing, 90s): Detects genuine SSE stream disconnection. Still useful if the OpenCode server crashes.
2. **Session activity timeout** (new, configurable): Detects stalled AI sessions. Monitors time since last tool call or text output event.

When the session activity timeout fires:

- Log a clear warning
- Attempt to query the session status via the API (`client.session.get()`)
- If the session is still "busy" but no events flow, abort the session and fail with a descriptive error

---

## Recommended Next Steps

1. **Fix the immediate bug**: Add session-level activity timeout (Option C hybrid)
2. **Fix the secondary bug**: Make heartbeat timeouts count toward reconnection attempts (`nextAttempt = attempt + 1` regardless)
3. **Add diagnostic logging**: Log `server.heartbeat` events at `core.debug()` level so we can see stream health in debug logs
4. **Consider configurable timeout**: Allow users to set session activity timeout via action input (default: 5 minutes)

---

## Files Referenced

| File                         | Location                                                                                                                   | Purpose                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| OpenCode server SSE endpoint | `opencode/packages/opencode/src/server/server.ts:498-553`                                                                  | Sends `server.heartbeat` every 10s        |
| Heartbeat detection code     | `ai-workflow-runner/src/opencode.ts:334-406`                                                                               | Current (ineffective) heartbeat mechanism |
| Event handler                | `ai-workflow-runner/src/opencode.ts:432-451`                                                                               | Doesn't handle `server.heartbeat` type    |
| Session idle detection       | `ai-workflow-runner/src/opencode.ts:582-627`                                                                               | Waits for `session.idle` event            |
| Failing GitHub Action run    | [Run 22951141878](https://github.com/ocean-network-express/om-blk-knowledge-base/actions/runs/22951141878/job/66615836632) | Evidence of the hang                      |
| Previous tech spec           | `_bmad-output/implementation-artifacts/tech-spec-fix-event-stream-silent-disconnect.md`                                    | Wrong assumption about failure mode       |
