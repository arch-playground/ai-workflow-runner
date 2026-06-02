# Story 13.5: Global Wall-Clock Timeout

---

## baseline_commit: 3fa00b852c11d66d8fa121cb97275ead5e220168

Status: review

## Story

As an **operator**,
I want **`timeout_minutes` to be a hard ceiling on the entire run including the validation-retry loop**,
So that **a malicious or buggy validation script cannot keep a runner busy far past the configured timeout (closes FINDING-2 — runner-minute DoS)**.

## Background

**Red-team finding (verified, MEDIUM):** `timeout_minutes` (→ `timeoutMs`) is passed only as a _per-OpenCode-call_ deadline; `shutdownController.abort()` fires ONLY on SIGTERM/SIGINT (`index.ts:104,123-124`), never on a timer. So `runValidationLoop` can retry `validation_max_retry` (up to 20) times, each costing a per-call timeout + AI round-trip — total runtime ≈ `retries × (script timeout + round-trip)`, _independent of_ `timeout_minutes`.

**Design (MEDIUM-1, M1):** add a single global deadline `AbortSignal.timeout(timeoutMs)`, merge it with `shutdownController.signal` via `AbortSignal.any`, thread the combined signal everywhere the shutdown signal flows, and guard the retry-loop head. Map the timeout to status `timeout` (distinct from `cancelled`). Node 20 (the runtime) supports both `AbortSignal.timeout()` and `AbortSignal.any()`.

**Scope boundary:** timeout enforcement ONLY. Do NOT touch permissions/env/container/baseURL (done) or summary (13-6).

## Acceptance Criteria

1. **Global deadline signal.** `index.ts` creates `const deadlineSignal = AbortSignal.timeout(inputs.timeoutMs)` and `const combined = AbortSignal.any([shutdownController.signal, deadlineSignal])`, passing `combined` to `runWorkflow` in place of `shutdownController.signal` (both call sites if more than one).

2. **Deadline propagates.** The combined signal threads everywhere `abortSignal` currently flows (runSession, sendFollowUp, validation child processes, runValidationLoop) — no new plumbing needed since they already honor `abortSignal`. In-flight provider calls + validation scripts abort when the deadline fires.

3. **Retry loop guarded.** `runValidationLoop` checks `abortSignal?.aborted` at the top of each iteration (cheap guard) and stops spawning new attempts once the deadline (or shutdown) has fired — it does NOT start attempt N+1 after the deadline.

4. **Status mapping: timeout vs cancelled.** When the run ends due to the deadline, status is `timeout`; when due to SIGTERM/SIGINT, status is `cancelled`. `AbortSignal.timeout` aborts with a `reason` whose `name === 'TimeoutError'` — distinguish on that. (The combined signal's `.reason` reflects whichever fired.) Existing `cancelled` behavior on signal-abort is preserved.

5. **Per-call timeouts preserved.** The existing per-OpenCode-call `timeoutMs` behavior is unchanged (additive). The global deadline is a NEW outer bound, not a replacement.

6. **Verified bound.** A validation script that loops/times out repeatedly is aborted at ≈`timeout_minutes`, NOT after `retries × per-call`. (Unit-testable by asserting the loop stops once `combined.aborted` is true; funcval can confirm wall-clock at epic end.)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, error-handling, commenting, logging, unit-testing standards. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [x] Read design `security-hardening-design-2026-06-02.md` → MEDIUM-1; research → MEDIUM-1 (AbortSignal.timeout/any pattern, TimeoutError reason).

- [x] **Task 2: Combined deadline signal in `index.ts`** (AC: 1, 4)
  - [x] Build `deadlineSignal = AbortSignal.timeout(inputs.timeoutMs)`; `combined = AbortSignal.any([shutdownController.signal, deadlineSignal])`. Pass `combined` to `runWorkflow`.
  - [x] Status mapping: check `error.name === 'TimeoutError'` → status `timeout`; `shutdownController.signal.aborted` → `cancelled`. Updated the catch block to distinguish all three outcomes.
  - [x] Keep `shutdownController` for the signal path (handleShutdown still calls `.abort()`); the deadline is additive.

- [x] **Task 3: Guard the retry loop + confirm propagation in `runner.ts`** (AC: 2, 3, 5)
  - [x] `runValidationLoop`: added `if (abortSignal?.aborted) throw new Error('Workflow execution was cancelled')` at the top of each for-loop iteration. Combined signal already threads via existing `abortSignal` param — no signature change.
  - [x] Abort propagates to the right status: loop guard throws → `runWorkflow` catch sees `abortSignal?.aborted` → returns `cancelled` result → `index.ts` maps to `timeout` or `cancelled` based on `deadlineSignal.aborted` / `shutdownController.signal.aborted`.

- [x] **Task 4: Unit tests** (AC: 1–6)
  - [x] `index.spec.ts`: 5 new tests in `describe('13-5: global wall-clock timeout')` — combined signal is AbortSignal; TimeoutError maps to `timeout`; SIGTERM maps to `cancelled`; setFailed not called for timeout; setFailed not called for cancelled. Used `Object.assign(new Error(), { name: 'TimeoutError' })` for deterministic mocking (no real wall-clock).
  - [x] `runner.spec.ts`: 3 new tests in `describe('13-5: runValidationLoop abort guard')` — pre-aborted signal stops loop before first attempt (executeValidationScript never called); mid-loop abort stops at attempt 2; live (non-aborted) signal allows normal completion.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`
  - [x] `npm run lint` — clean (0 errors, 0 warnings)
  - [x] `npm run format` — applied (1 formatting fix in index.ts)
  - [x] `npm run typecheck` — clean (0 type errors)
  - [x] `npm run test:unit` — 799/799 passing, 27 suites

## Dev Notes

- **`AbortSignal.timeout` self-clears** (no dangling timer keeping the loop alive) — preferred over a manual `setTimeout(() => controller.abort())`. If you use a manual controller instead, you MUST `clearTimeout` on normal completion.
- **`AbortSignal.any`** combines sources — the combined signal fires when EITHER the shutdown or the deadline fires; `.reason` reflects the one that fired. Node 20.3+ supports both (runtime is Node 20). Confirm available; if a polyfill is needed, flag to leader (it shouldn't be).
- **Distinguish timeout from cancel** for the output status (`action.yml` already declares both `timeout` and `cancelled`). `TimeoutError` is the reason name from `AbortSignal.timeout`.
- **Don't double-count:** the per-call `timeoutMs` still passes to runSession/sendFollowUp as before; the new global deadline is the outer bound. Both coexist.
- **DEFAULT_TIMEOUT_MS** in runner.ts is a fallback when no timeout passed; the real value is `inputs.timeoutMs`.
- Conventions: named exports, `.js` imports; coverage ≥80%/75%. Backward compatible (a run that finishes before the deadline behaves exactly as before).

### References

- [Source: epics.md#Story 13.5] · [Source: prd.md#FR71]
- [Source: research/security-hardening-design-2026-06-02.md → MEDIUM-1 (M1)]
- [Source: research/security-hardening-research-2026-06-01.md → MEDIUM-1]
- [Source: docs/tests/test-run-redteam-2026-06-01.md → FINDING-2]
- Current: `src/index.ts` (shutdownController, status mapping), `src/runner.ts` (runValidationLoop, abortSignal threading)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (bmad-auto sub-agent)

### Completion Notes List

- AC1 ✅: `index.ts` creates `deadlineSignal = AbortSignal.timeout(inputs.timeoutMs)` and `combined = AbortSignal.any([shutdownController.signal, deadlineSignal])`; passes `combined` to `runWorkflow`.
- AC2 ✅: Combined signal flows through existing `abortSignal` parameter chain (runWorkflow → runValidationLoop → executeValidationScript / runSession / sendFollowUp) — zero signature changes.
- AC3 ✅: `runValidationLoop` guards each iteration head with `if (abortSignal?.aborted) throw` — loop cannot start attempt N+1 after deadline fires.
- AC4 ✅: Status mapping distinguishes `timeout` (error.name === 'TimeoutError') from `cancelled` (shutdownController.signal.aborted) from `failure` (neither). Both paths skip `setFailed`.
- AC5 ✅: Per-call `timeoutMs` unchanged — still passed to `runSession`/`sendFollowUp`/`runSessionWithFallback` as before; global deadline is additive outer bound.
- AC6 ✅: Unit tests verify loop stops when signal is pre-aborted (executeValidationScript never called) and mid-loop (only 1 attempt when abort fires after attempt 1).
- `AbortSignal.any()` confirmed available in Node 20 — no polyfill needed.
- Used `Object.assign(new Error(), { name: 'TimeoutError' })` in tests for deterministic TimeoutError simulation without real timers.

### File List

- `src/index.ts` — added `deadlineSignal`/`combined` signals; updated `runWorkflow` call; updated post-run abort check; updated catch block status mapping
- `src/runner.ts` — added `abortSignal?.aborted` guard at top of `runValidationLoop` for-loop
- `src/index.spec.ts` — 5 new unit tests for 13-5 (combined signal, timeout/cancelled status, setFailed suppression)
- `src/runner.spec.ts` — 3 new unit tests for 13-5 (pre-aborted stops loop, mid-loop abort, live signal allows completion)

### Change Log

- 2026-06-02: Implemented Story 13-5 — global wall-clock timeout via `AbortSignal.timeout` + `AbortSignal.any`; retry loop guard; `timeout` status distinct from `cancelled`; 8 new unit tests; 799 passing total.

## QA Results (leader code review + light funcval, 2026-06-02)

**Code review: PASS.** index.ts: `AbortSignal.timeout` + `AbortSignal.any([shutdown, deadline])`, combined passed to runWorkflow; abort path distinguishes deadline→`timeout` vs shutdown→`cancelled`; catch-block maps `TimeoutError` name→timeout; `setFailed` only on `failure` (timeout/cancelled don't double-report). runner.ts: retry-loop head guard stops new attempts on abort. Clean, well-commented.

**Light funcval: PASS** — bundle builds clean. Timeout logic is pure (no infra dep); the 8 deterministic unit tests (combined-signal, timeout vs cancelled, setFailed-suppression, loop-guard pre/mid/non-abort) fully exercise it. A real wall-clock timeout test is deferred to the epic-end funcval per the validation policy. 799/799 tests pass.

**FINDING-2 closed:** `timeout_minutes` now bounds the whole run including the validation-retry loop.
