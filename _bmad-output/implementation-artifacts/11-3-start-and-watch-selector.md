# Story 11.3: Start-and-Watch Provider Selector

Status: done

## Story

As the **runner**,
I want **to select the first viable fallback-chain provider by starting a session on it and advancing to the next entry if it fails before producing output**,
So that **a run automatically uses the first working provider in the chain (D2: selection at conversation start, no mid-run failover) — exactly the behavior the §7 spike validated**.

## Background (spike-validated)

The §7 spike (design doc) confirmed on a real server: when a provider fails to start (bad/expired auth, quota, unknown model), a `session.error` event fires **before any assistant content** — the early `message.part.updated` events carry only the echoed user prompt, not assistant output. So "start-and-watch" is viable: pin the session to chain[i]'s model, send the prompt, and if `session.error` arrives before the first ASSISTANT part, abort and try chain[i+1]. Once a real assistant part flows, we are COMMITTED (no further switching — D2).

11-1 parses the chain; 11-2 preflights it to viable (authenticated) entries. This story drives the selection loop over the preflighted entries. (11-4 hardens the exact "first assistant part" commit-boundary detection; 11-5 handles full-chain exhaustion + precedence vs `model`. This story can use a straightforward boundary and lean on 11-4 to refine it — coordinate via the AC.)

## Acceptance Criteria

1. **Given** a preflighted viable chain `[p0, p1, ...]` **When** the selector runs **Then** it attempts p0 first: create a session, send the first prompt pinned to p0's model, and watch the event stream.

2. **Given** the attempt on chain[i] receives a `session.error` (any error in the session.error union: APIError/ProviderAuthError/UnknownError/etc.) BEFORE the first assistant-role part **When** observed **Then** the selector abandons that session (abort/cleanup) and retries with chain[i+1] from scratch (new session, same prompt).

3. **Given** chain[i] produces a real assistant part (text/tool/reasoning) — i.e. the conversation has COMMITTED **When** that happens **Then** the selector stops switching: chain[i] is the chosen provider and the run continues normally on it (D2 — no mid-run failover even if a later error occurs).

4. **Given** all viable entries are exhausted (each failed at startup) **When** the loop ends **Then** the selector reports failure clearly (the aggregated chain-exhausted error is finalized in 11-5; for 11-3, return a structured "all providers failed" result/throw with per-entry reasons collected).

5. **Given** NO `fallback_config` is set **When** runWorkflow runs **Then** the selector is NOT engaged — the existing single-provider path (`inputs.model`) runs unchanged (backward compatible). Selector only activates when a fallback chain is present.

6. **Given** the selector reuses existing session machinery **When** implemented **Then** it builds on `OpenCodeService.runSession` / the event loop rather than duplicating session/event handling. Per-attempt model pinning uses the SDK's per-prompt model option (the `model: {providerID, modelID}` shape `promptAsync` already accepts).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — coding-style, error-handling, logging, AbortSignal usage, testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Selector entry point** (AC: 1, 5, 6)
  - [x] Add a selector — recommend `OpenCodeService.runSessionWithFallback(prompt, viableChain, timeoutMs, abortSignal?)` OR a `src/provider-chain.ts` orchestrator that drives `OpenCodeService`. Pick the seam that best reuses `runSession`; document it. It must NOT duplicate the event loop — reuse the existing one.
  - [x] In `runWorkflow` (runner.ts): if a fallback chain is present (loaded + preflighted), call the selector; else call `runSession` as today (AC5 backward compat).

- [x] **Task 3: Per-attempt start + early-failure detection** (AC: 1, 2, 6)
  - [x] For each viable entry: create a session pinned to that provider/model (per-prompt `model: {providerID, modelID}`), send the prompt, and watch for the FIRST of: (a) `session.error` → this attempt failed, advance; (b) first assistant-role part → committed, stop (AC3).
  - [x] On advance: clean up the failed session (abort/cancel callbacks, clear state) so it doesn't leak — reuse the existing finalize/cleanup paths.
  - [x] Collect the failure reason per failed entry (provider + error message) for the exhaustion report.

- [x] **Task 4: Commit boundary (basic; 11-4 refines)** (AC: 3)
  - [x] Use "first assistant-role text/tool/reasoning part" as the commit signal. Coordinate with the existing message-state tracking (currentMessageId / message.part.updated). 11-4 will harden the exact detection (esp. excluding the user-prompt echo per the spike finding) — for 11-3, a correct-but-simple boundary is acceptable; note the dependency.

- [x] **Task 5: Unit tests** (AC: 1–6)
  - [x] Use MockClient + the event-emit test harness (the existing eventControl pattern in opencode-session.spec.ts).
  - [x] p0 errors at start → advances to p1 which commits → run proceeds on p1.
  - [x] p0 commits (assistant part) → never tries p1, even if a later error occurs (D2 no mid-run failover).
  - [x] all entries error at start → structured all-failed result with per-entry reasons.
  - [x] no fallback chain → runSession used as today (selector not engaged).
  - [x] failed-attempt session is cleaned up (callbacks/aborts) before the next attempt.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **Spike finding (load-bearing):** early `message.part.updated` events include the echoed USER prompt — do NOT treat that as "committed". The commit boundary is the first ASSISTANT-role part. 11-4 hardens this; for 11-3 scope the boundary to assistant-role parts and note 11-4 will verify it rigorously.
- **D2:** selection is start-of-conversation ONLY. Once committed, a later session.error ends the run as today (no switching). Do NOT add mid-run failover.
- **Reuse:** build on `runSession` + the existing event loop / sessionMessageState. The per-attempt difference is the pinned model and the early-failure watch. Don't re-implement event subscription.
- **Cleanup matters:** a failed attempt must not leak a session/callbacks. Reuse finalizeSession/abortCleanup.
- Scope: NO exhaustion-error finalization or precedence-vs-`model` (11-5); NO rigorous commit-boundary edge cases (11-4). Drive the loop + basic boundary + cleanup + per-entry reasons.
- Conventions: AbortSignal last optional param; Result pattern for the all-failed outcome; named exports, `.js` imports, noUncheckedIndexedAccess; clearMocks global; coverage 80%/75%.

### References

- [Source: epics.md#Story 11.3] · [Source: prd.md#FR61, FR62] · [Source: research/opencode-upgrade-design-2026-05-29.md §5.2 + §7 spike + D2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Types** (`src/types.ts`): Added `FallbackAttemptFailure {provider, model, error}` and `FallbackSelectionResult {success, session?, failures}` (used as return type of the selector).
- **Task 2** (`src/opencode.ts` + `src/runner.ts`): Added `OpenCodeService.runSessionWithFallback(prompt, viableChain, timeoutMs, abortSignal?)→Promise<FallbackSelectionResult>`. In `runWorkflow`: branches on `inputs.fallbackConfig` — if set, loads chain, preflights (logs warnings per skipped entry), calls selector; else `runSession` as before (AC5 backward compat).
- **Tasks 3+4** (`src/opencode.ts`): Mechanism: added `sessionStartWatchers: Map<sessionId, {onCommit, onEarlyError}>`. Per attempt: creates session, sets watcher, calls `promptAsync` with `model: {providerID, modelID}`. `handleSessionError` checks watcher first (calls `onEarlyError`, returns early — no normal finalize). `handleMessagePartUpdated` calls `notifyCommitWatcher()` on text/tool parts when `currentMessageId` is set (meaning assistant-role message is active). Commit path: watcher calls `onCommit`, selector then calls `waitForSessionIdleAfterCommit` (=`waitForSessionIdle`) to let session run normally. Failed-attempt cleanup: `onEarlyError` clears callbacks + watcher before advancing; `sessionMessageState` deleted for failed sessions.
- **Task 5** (`src/opencode-fallback.spec.ts` — new, 6 tests): AC1/AC2 p0-errors→advance→p1-commits; AC3/D2 p0-commits→p1-never-tried; AC4 all-fail→structured-result; AC5 no-chain→runSession-unchanged; AC2 cleanup (stale session.error after cleanup doesn't crash); warning logged per failed provider. Uses eventControl.emit harness exactly as session.spec.ts.
- **Dev Note — commit boundary (11-4 dependency)**: `notifyCommitWatcher` fires when `state.currentMessageId` is set (i.e. after `message.updated` with `role='assistant'` arrived). The spike finding says early `message.part.updated` carries the echoed USER prompt — this is handled because `handleMessageUpdated` only sets `currentMessageId` for `role='assistant'` messages. The user-prompt echo arrives without a preceding `message.updated` setting a current assistant message id, so `state.currentMessageId` is null and `notifyCommitWatcher` is a no-op. 11-4 will add rigorous tests for this edge.
- **Quality**: lint zero, typecheck clean, format applied (opencode.ts), 670/670 tests pass (+6 new), coverage 91.24%/84.5%.

### File List

- `src/types.ts` — added `FallbackAttemptFailure`, `FallbackSelectionResult` interfaces
- `src/opencode.ts` — added `sessionStartWatchers` field; `runSessionWithFallback()`, `watchForCommitOrEarlyError()`, `waitForSessionIdleAfterCommit()`, `notifyCommitWatcher()` methods; patched `handleSessionError` + `handleMessagePartUpdated`
- `src/runner.ts` — import `loadFallbackConfig`, `preflightFallbackChain`; fallbackConfig branch in `runWorkflow`
- `src/opencode-fallback.spec.ts` — new: 6 selector integration tests
- `_bmad-output/implementation-artifacts/11-3-start-and-watch-selector.md` — this file

### Round 1/2 Fix (R2)

- **R2 applied** (`src/opencode.ts` `watchForCommitOrEarlyError`): Before building `promptModel`, derives `bareModelId` by stripping `entry.provider + "/"` prefix when `entry.model` is provider-qualified (e.g. `"github-copilot/gpt-5-mini"` → `"gpt-5-mini"`). Falls through to `entry.model` unchanged for bare-id entries. One line of logic; comment documents the tolerance for both forms. `promptModel = { providerID: entry.provider, modelID: bareModelId }`.
- **Tests** (`src/opencode-fallback.spec.ts`): Added 3 R2 tests: (1) `"prov/mod"` entry → promptAsync `{providerID:'prov', modelID:'mod'}`; (2) bare `"gpt-5-mini"` → `{providerID:'github-copilot', modelID:'gpt-5-mini'}`; (3) `"github-copilot/gpt-5-mini"` → bare `{modelID:'gpt-5-mini'}` + explicit negative assertion that `modelID:'github-copilot/gpt-5-mini'` was NOT used. All via fresh MockClient with promptAsync call-arg inspection.
- **Quality**: lint zero, typecheck clean, format no changes, 692/692 tests pass (+3 new).

## Review Notes

**Round 2 (leader, 2026-06-01) — HIGH defect found during Epic 11 functional/e2e validation:**

Finding R2 — **double provider-prefix in per-prompt model pinning.** `runSessionWithFallback` builds `const promptModel = { providerID: entry.provider, modelID: entry.model }` (opencode.ts ~line 477). But `entry.model` is **provider-qualified** (`"github-copilot/gpt-5-mini"`) per the design doc's own `fallback_config` examples — so the SDK gets `modelID: "github-copilot/gpt-5-mini"` under `providerID: "github-copilot"`, resolving to invalid `github-copilot/github-copilot/gpt-5-mini`. A real, authenticated, working provider (proven in Epic 10 e2e) FAILS at startup → the whole fallback run fails. The fallback feature cannot run a provider-qualified chain entry — exactly the format the docs show. Caught by the Epic 11 fallback e2e; unit tests used bare modelIDs so missed it.

**Fix (Round 1/2):** derive the BARE modelID when building promptModel — strip `entry.provider + "/"` prefix if present, else use as-is (tolerant of both forms):

```ts
const bareModelId = entry.model.startsWith(`${entry.provider}/`)
  ? entry.model.slice(entry.provider.length + 1)
  : entry.model;
const promptModel = { providerID: entry.provider, modelID: bareModelId };
```

Add a unit test asserting a provider-qualified entry produces `{providerID:'prov', modelID:'mod'}` (via MockClient promptAsync call args), and a bare entry still works. Re-run full suite.

Note: preflight-skip, advance, and aggregated exhaustion all worked correctly in the real container — only model-pinning was wrong.

## QA Results

_(tester fills in during functional validation)_
