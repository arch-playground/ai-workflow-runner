---
title: 'Fix Silent Event Stream Disconnection Causing Workflow Hang'
slug: 'fix-event-stream-silent-disconnect'
created: '2026-03-11'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'TypeScript 5.3+',
    '@opencode-ai/sdk 1.2.15+',
    '@actions/core 3.0+',
    'Jest 30+',
    'esbuild',
    'Docker (debian:bookworm-slim)',
  ]
files_to_modify:
  ['src/opencode.ts', 'src/types.ts', 'src/opencode-config.spec.ts', 'src/opencode-test-helpers.ts']
code_patterns:
  [
    'singleton via getOpenCodeService()',
    'AbortSignal as last optional param',
    'fire-and-forget void runLoop()',
    'callback maps with resolve/reject',
    'core.info for user-visible logs / core.debug for internals',
    'named exports only',
    '.js extension in imports',
  ]
test_patterns:
  [
    'co-located *.spec.ts',
    'EventControl mock for async generator',
    'flushMicrotasks() for async settling',
    'jest.mock for @opencode-ai/sdk and @actions/core',
    'AAA pattern',
  ]
---

# Tech-Spec: Fix Silent Event Stream Disconnection Causing Workflow Hang

**Created:** 2026-03-11

## Overview

### Problem Statement

The OpenCode SDK event stream (SSE) silently disconnects after ~3 minutes of active tool processing in Docker containers. The `for await (const event of eventResult.stream)` loop in `src/opencode.ts` hangs indefinitely because the stream neither throws an error nor closes the iterator. This prevents session idle detection, causing every workflow run to fail by timeout (~30 minutes).

Evidence from multiple workflow runs:

- 100% reproducible across all runs (never worked)
- Always hangs after ~220-270 tool events (~3-4 minutes of active processing)
- Last event is always a `read` tool in "running" state that never shows "completed"
- The AI session likely continues working on the server, but events stop being received
- The only exit mechanism is the 30-minute workflow timeout

### Solution

Add event stream health monitoring with heartbeat/liveness detection to the event loop. When no events are received within a configurable threshold, proactively tear down and reconnect the event stream using a `Promise.race` pattern that races each event against a heartbeat timeout. This works around the silent SSE disconnection without requiring changes to the OpenCode SDK itself.

### Scope

**In Scope:**

- Add heartbeat/liveness detection to the event loop (no events in X seconds → reconnect)
- Reconnect the event stream when silent disconnection is detected
- Add logging for stream health (last event timestamp, reconnection attempts)
- Unit tests for the new heartbeat logic

**Out of Scope:**

- Changes to the OpenCode SDK itself
- Debug log writer improvements
- Changing the overall timeout architecture
- Root cause fix in SSE transport layer (that's in the SDK)

## Context for Development

### Codebase Patterns

- **Event loop architecture**: `startEventLoop()` (line 324) uses `void runLoop()` — fire-and-forget async function that iterates over `client.event.subscribe().stream` using `for await`. The loop promise is never stored or awaited.
- **Reconnection on error**: If the `for await` loop throws, it reconnects up to 3 times with 1s delay. But if the stream silently stops yielding (no error, no close), the loop just hangs forever — this is the bug.
- **Session idle detection**: `waitForSessionIdle()` (line 533) creates a Promise with a timeout. The only way it resolves is via `handleSessionStatusChange()` being called when a `session.idle` or `session.status` event arrives. If events stop flowing, this Promise just waits until timeout.
- **Abort signal propagation**: The `eventLoopAbortController` is used to break the `for await` loop via `if (signal?.aborted) break`. But this only works if the loop is actively yielding events to check the condition.
- **`dispose()` is synchronous**: It aborts the controller and closes the server, but never waits for the event loop to actually stop.

### Files to Reference

| File                           | Purpose                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/opencode.ts`              | Main file to modify — contains `startEventLoop()`, `handleEvent()`, `waitForSessionIdle()`, `dispose()` |
| `src/opencode-config.spec.ts`  | Tests for event loop reconnection (lines 52-101), config loading — heartbeat tests go here              |
| `src/opencode.spec.ts`         | Tests for init, dispose, singleton, listModels                                                          |
| `src/opencode-session.spec.ts` | Tests for session management, event handling, tool logging                                              |
| `src/opencode-test-helpers.ts` | `EventControl` mock with `emit()` and `stop()` — needs new `hang()` method                              |
| `src/types.ts`                 | `INPUT_LIMITS` constants — add heartbeat constant                                                       |
| `src/index.ts`                 | Shutdown handler — calls `dispose()` synchronously                                                      |

### Technical Decisions

1. **`Promise.race` approach (not flag+break)**: A `setTimeout` callback cannot break a hung `for await` loop because the loop is suspended waiting for the async generator's `next()` promise — the callback runs on the macro-task queue but the `for await` body never re-executes to check a flag. Instead, replace the `for await` loop with a manual `while` loop that calls `iterator.next()` and races it against a heartbeat timeout via `Promise.race`. When the heartbeat wins the race, call `iterator.return()` to clean up the stream, then throw to trigger reconnection.
2. **Heartbeat counts toward reconnection attempts**: Each heartbeat timeout counts as one reconnection attempt toward the existing `maxReconnectAttempts=3` limit. This prevents infinite reconnection loops if the server is permanently broken. After 3 failed attempts (whether from errors or heartbeat timeouts), `handleEventLoopFailure()` is called.
3. **Heartbeat interval: 90 seconds**: LLM inference can take 30-60s before emitting tokens, especially on large context windows. A 30s interval would cause false positives during normal AI "thinking" pauses. 90s is conservative enough to avoid false positives while still detecting the ~3-min disconnect pattern within 2 minutes. The investigation data shows the stream works fine for 3+ minutes with hundreds of events spaced ~2-3s apart, then dies completely — there are no 90s gaps during normal operation.
4. **Class-level heartbeat timer property**: The heartbeat `timeoutId` must be accessible from `dispose()` for cleanup. Add `private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null` as a class property on `OpenCodeService`. This allows `dispose()` to call `clearTimeout(this.heartbeatTimeoutId)` directly.
5. **Guard against stale client reference on reconnection**: The `runLoop` closure captures `const client = this.client` at the start. If `dispose()` nullifies `this.client` while a heartbeat reconnection is in the `abortableDelay`, the reconnection will use the captured (stale) reference. Add a `this.isDisposed` check at the top of each `runLoop` iteration before calling `client.event.subscribe()`.
6. **New constant in `INPUT_LIMITS`**: `EVENT_STREAM_HEARTBEAT_MS: 90_000` — centralizes the value for testing and configuration.

## Implementation Plan

### Tasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] Read `.knowledge-base/technical/standards/backend/coding-style.md`
  - [ ] Read `.knowledge-base/technical/standards/backend/error-handling.md`
  - [ ] Read `.knowledge-base/technical/standards/global/commenting.md`
  - [ ] Read `.knowledge-base/technical/standards/backend/logging.md`
  - [ ] Read `.knowledge-base/technical/standards/testing/unit-testing.md`
  - [ ] Load skill: `typescript-clean-code`
  - [ ] Load skill: `typescript-unit-testing`

- [ ] **Task 2: Add heartbeat constant to INPUT_LIMITS** (AC: 1)
  - File: `src/types.ts`
  - Action: Add `EVENT_STREAM_HEARTBEAT_MS: 90_000` to the `INPUT_LIMITS` constant object
  - Notes: Place it after `SHUTDOWN_TIMEOUT_MS`. This is the interval (in ms) after which the event stream is considered silently disconnected if no events are received.

- [ ] **Task 3: Add class-level heartbeat timer property** (AC: 4)
  - File: `src/opencode.ts`
  - Action: Add `private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null;` to the `OpenCodeService` class, alongside other private properties (after `sessionMessageState`)
  - Also update `dispose()` to clear the heartbeat timer:
    ```typescript
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
    ```
    Place this before the `eventController.abort()` call in `dispose()`.

- [ ] **Task 4: Replace `for await` loop with `Promise.race` heartbeat pattern** (AC: 1, 2, 3, 4, 5)
  - File: `src/opencode.ts`
  - Action: Rewrite the `startEventLoop()` method's `runLoop()` inner function
  - **Critical implementation detail — why `for await` cannot work:**
    A `setTimeout` callback cannot break a hung `for await` loop. The loop is suspended on `iterator.next()`, which returns a Promise that never resolves. The `setTimeout` fires on the macro-task queue, but no code inside the `for await` body runs to check a flag or `break`. The only way to unblock is to race the iterator's `next()` call against a timeout Promise.
  - Implementation (pseudocode structure):

    ```typescript
    const runLoop = async (attempt: number = 0): Promise<void> => {
      try {
        if (this.isDisposed) return; // Guard against stale client (F6)
        const eventResult = await client.event.subscribe();
        const iterator = eventResult.stream[Symbol.asyncIterator]();

        const processEvents = async (): Promise<void> => {
          while (true) {
            if (signal?.aborted) break;

            // Race iterator.next() against heartbeat timeout
            const heartbeatPromise = new Promise<{ done: true }>((_, reject) => {
              this.heartbeatTimeoutId = setTimeout(() => {
                reject(new Error('Event stream heartbeat timeout'));
              }, INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS);
            });

            let result: IteratorResult<unknown, void>;
            try {
              result = (await Promise.race([iterator.next(), heartbeatPromise])) as IteratorResult<
                unknown,
                void
              >;
            } catch (heartbeatError) {
              // Heartbeat won the race — stream is silent
              core.warning(
                `[OpenCode] Event stream heartbeat timeout - no events in ${INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS}ms, reconnecting...`
              );
              // Clean up the hung iterator
              void iterator.return?.();
              throw heartbeatError; // Falls through to catch block for reconnection
            } finally {
              // Always clear heartbeat after each race resolves
              if (this.heartbeatTimeoutId) {
                clearTimeout(this.heartbeatTimeoutId);
                this.heartbeatTimeoutId = null;
              }
            }

            if (result.done) break;

            this.handleEvent(result.value, client);
          }
        };

        await processEvents();
      } catch (error) {
        if (signal?.aborted) return;

        core.warning(
          `[OpenCode] Event loop error (attempt ${attempt + 1}/${maxReconnectAttempts}): ${String(error)}`
        );

        if (attempt < maxReconnectAttempts - 1) {
          core.info(`[OpenCode] Attempting to reconnect event loop in ${reconnectDelayMs}ms...`);
          await this.abortableDelay(reconnectDelayMs, signal);
          if (!signal?.aborted && !this.isDisposed) {
            void runLoop(attempt + 1);
          }
        } else {
          this.handleEventLoopFailure();
        }
      }
    };
    ```

  - Key constraints:
    - Heartbeat timer is cleared in `finally` after every `Promise.race` — no leak
    - `iterator.return()` is called on heartbeat timeout to clean up the stream
    - `this.isDisposed` check at start of `runLoop` and before reconnection prevents stale-client race condition
    - Heartbeat timeout counts as a regular reconnection attempt (increments `attempt` counter)
    - Each event received naturally clears/resets the heartbeat because the `Promise.race` resolves and the `finally` block runs, then a new timer is set on the next iteration

- [ ] **Task 5: Add `hang()` method to `EventControl` test helper** (AC: 1, 6)
  - File: `src/opencode-test-helpers.ts`
  - Action: Add a `hang()` method to the `EventControl` interface and implementation
  - Purpose: The existing `stop()` method resolves the pending promise with `done: true` (clean close). But the bug we're testing is when `next()` never resolves (hang). We need a method that simply stops emitting without resolving — leaving the generator's `next()` promise permanently pending.
  - Implementation: `hang()` should set `done = true` but NOT resolve any pending promise. This simulates the exact failure mode: the `for await` / `iterator.next()` call hangs indefinitely.
  - Update `EventControl` interface:
    ```typescript
    export interface EventControl {
      generator: AsyncGenerator<unknown, void, unknown>;
      emit: (event: unknown) => void;
      stop: () => void;
      hang: () => void; // New: simulate silent disconnect (next() never resolves)
    }
    ```
  - Implementation in `createEventGenerator()`:
    ```typescript
    hang: (): void => {
      done = true;
      // Intentionally do NOT resolve pendingResolve — this simulates the stream hanging
    },
    ```

- [ ] **Task 6: Write unit tests for heartbeat detection** (AC: 1, 2, 3, 4, 6)
  - File: `src/opencode-config.spec.ts` (add new `describe('event stream heartbeat')` block after the existing `event loop reconnection` section)
  - **Timer strategy**: Use `jest.useFakeTimers()` at the `describe` level for heartbeat tests. Replace `flushMicrotasks()` calls within these tests with `await jest.advanceTimersByTimeAsync(10)` since `flushMicrotasks()` uses a real `setTimeout(resolve, 10)` which won't fire under fake timers.
  - Tests to write:
    1. **Heartbeat triggers reconnection on silent disconnect**: Create an `EventControl`, emit a few events, then call `hang()` (not `stop()` — `stop()` closes the iterator cleanly which doesn't test the bug). Advance fake timers by `EVENT_STREAM_HEARTBEAT_MS`. Verify `core.warning()` was called with heartbeat timeout message and `client.event.subscribe` was called again (reconnect).
    2. **Heartbeat resets on each event — no false positives**: Emit events at intervals shorter than heartbeat (advance timers in between). Verify no reconnection occurs after total elapsed time exceeding heartbeat period, as long as events keep flowing.
    3. **Heartbeat cleared on dispose**: Initialize, start receiving events, call `dispose()`. Advance fake timers past heartbeat interval. Verify no heartbeat warning is logged after disposal.
    4. **Heartbeat cleared on abort signal**: Initialize with abort controller, start receiving events, abort. Advance timers past heartbeat interval. Verify no heartbeat warning is logged.
    5. **Reconnection after heartbeat timeout re-establishes event flow**: Set up first `EventControl` that hangs, and second `EventControl` for reconnected stream. After heartbeat-triggered reconnection, emit events on the new stream including `session.idle`. Verify session idle detection works (callback resolves).
    6. **Multiple heartbeat timeouts exhaust reconnection attempts**: Mock `client.event.subscribe` to return hanging streams on every call. Advance fake timers by `EVENT_STREAM_HEARTBEAT_MS` for each attempt. Verify `handleEventLoopFailure()` is called after 3 attempts (via `core.error()` log check).
  - Notes: Use `jest.useFakeTimers()` and `jest.advanceTimersByTimeAsync()`. Use `EventControl` with new `hang()` method. Follow AAA pattern. Use `afterEach(() => jest.useRealTimers())` to prevent timer pollution.

- [ ] **Task 7: Verify existing reconnection tests still pass** (AC: 2)
  - File: `src/opencode-config.spec.ts`
  - Action: The existing reconnection tests use real `setTimeout` for delays (e.g., `await new Promise(resolve => setTimeout(resolve, 1200))`). Since heartbeat tests use `jest.useFakeTimers()` in their own `describe` block, existing tests in the sibling `describe` block should be unaffected. Run tests to confirm. If any fail due to the heartbeat timer firing during test execution, wrap the heartbeat-affected tests in their own `describe` with `jest.useFakeTimers()`.

- [ ] **Final Task: Quality Checks**
  - [ ] Run `npm run lint` - Fix any linting issues
  - [ ] Run `npm run format` - Verify code formatting
  - [ ] Run `npm run typecheck` - Ensure type safety

### Acceptance Criteria

- [ ] **AC 1**: Given the event stream is active and receiving events, when no events are received for `EVENT_STREAM_HEARTBEAT_MS` (90s), then the event loop logs a warning and initiates a reconnection attempt by re-subscribing to `client.event.subscribe()`
- [ ] **AC 2**: Given the event stream reconnects after a heartbeat timeout, when the new stream starts receiving events, then session idle detection continues to work (events are processed, `session.idle` resolves the session callback)
- [ ] **AC 3**: Given events are being received at regular intervals (shorter than heartbeat), when the heartbeat timer is continuously reset, then no reconnection is triggered (no false positives)
- [ ] **AC 4**: Given `dispose()` is called while the heartbeat timer is active, when the event loop is torn down, then the heartbeat timer is cleared and no reconnection is attempted after disposal
- [ ] **AC 5**: Given a heartbeat timeout occurs, when the reconnection is initiated, then a warning log `[OpenCode] Event stream heartbeat timeout - no events in {ms}ms, reconnecting...` is emitted via `core.warning()`
- [ ] **AC 6**: Given heartbeat timeouts occur on every reconnection attempt, when the maximum reconnection attempts (3) are exhausted, then `handleEventLoopFailure()` is called and all pending session callbacks are rejected

## Additional Context

### Dependencies

- No new external dependencies required
- Relies on existing `@opencode-ai/sdk` event subscription API (`client.event.subscribe()`)
- Uses built-in `setTimeout`/`clearTimeout` for heartbeat timer
- Uses `Promise.race` (built-in) for racing events against heartbeat

### Testing Strategy

**Unit Tests (Task 6-7):**

- 6 new test cases in `src/opencode-config.spec.ts` under new `describe('event stream heartbeat')` block
- Use `jest.useFakeTimers()` scoped to the heartbeat describe block (not global) to avoid breaking existing tests that use real timers
- Replace `flushMicrotasks()` with `jest.advanceTimersByTimeAsync(10)` inside heartbeat tests
- New `hang()` method on `EventControl` to simulate the exact failure mode (iterator.next() never resolves)
- Existing reconnection tests verified to still pass (they run in a separate describe block with real timers)

**Manual/Integration Testing:**

- After implementation, trigger a workflow run on `ocean-network-express/om-blk-knowledge-base` to verify the fix
- Expected behavior: After ~90s of no events, the stream reconnects and the workflow completes successfully instead of hanging for 30 minutes
- Monitor logs for `Event stream heartbeat timeout` and `reconnected` messages
- If reconnection doesn't fix the problem (server dropped session state), the 3-attempt limit will exhaust and `handleEventLoopFailure()` will reject callbacks, causing a clear error instead of a silent 30-minute hang

### Notes

**Adversarial Review Fixes Applied:**

- F1 (Critical): Replaced flag+break approach with `Promise.race` pattern — a `setTimeout` cannot break a hung `for await` loop
- F2/F7: Resolved contradiction — heartbeat timeouts now count toward the 3-attempt limit (no reset)
- F3: Changed heartbeat interval from 30s to 90s — LLM inference can take 30-60s before emitting tokens
- F4: Added `hang()` method to `EventControl` to simulate actual failure mode (vs `stop()` which is a clean close)
- F5: Added class-level `heartbeatTimeoutId` property so `dispose()` can access and clear it
- F6: Added `this.isDisposed` guard at start of `runLoop` and before reconnection to prevent stale-client race
- F8/F10: Fixed `files_to_modify` frontmatter to match actual plan (config spec + test helpers, not session spec)
- F11: Scoped `jest.useFakeTimers()` to heartbeat describe block only; use `jest.advanceTimersByTimeAsync()` instead of `flushMicrotasks()`
- F12: Added fallback note — if reconnection doesn't help, the 3-attempt limit will surface a clear error instead of silent hang

**Investigation Data:**

| Run ID      | Active Work | Last Event                  | Gap to Shutdown     | Tool Events |
| ----------- | ----------- | --------------------------- | ------------------- | ----------- |
| 22938572602 | 3 min       | `read - running` (.env.dev) | ~27 min             | 221         |
| 22897637498 | 3.4 min     | `read - running`            | ~26.5 min           | 271         |
| 22894631255 | 3.3 min     | `read - completed`          | ~14 min (cancelled) | 272         |
