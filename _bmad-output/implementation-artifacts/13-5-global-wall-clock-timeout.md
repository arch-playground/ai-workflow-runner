# Story 13.5: Global Wall-Clock Timeout

Status: ready-for-dev

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

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, error-handling, commenting, logging, unit-testing standards. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [ ] Read design `security-hardening-design-2026-06-02.md` → MEDIUM-1; research → MEDIUM-1 (AbortSignal.timeout/any pattern, TimeoutError reason).

- [ ] **Task 2: Combined deadline signal in `index.ts`** (AC: 1, 4)
  - [ ] Build `deadlineSignal = AbortSignal.timeout(inputs.timeoutMs)`; `combined = AbortSignal.any([shutdownController.signal, deadlineSignal])`. Pass `combined` to `runWorkflow`.
  - [ ] Status mapping: when the run aborts, check `combined.reason?.name === 'TimeoutError'` (or `deadlineSignal.aborted && !shutdownController.signal.aborted`) → status `timeout`; SIGTERM/SIGINT path → `cancelled`. Update the `status = shutdownController.signal.aborted ? 'cancelled' : 'failure'` logic to also account for `timeout`.
  - [ ] Keep `shutdownController` for the signal path (handleShutdown still calls `.abort()`); the deadline is additive.

- [ ] **Task 3: Guard the retry loop + confirm propagation in `runner.ts`** (AC: 2, 3, 5)
  - [ ] `runValidationLoop`: at the top of the `for` loop (each attempt), `if (abortSignal?.aborted) break/return` so it stops once the deadline fires. The combined signal is already threaded via the existing `abortSignal` param — confirm `runWorkflow(inputs, timeoutMs, combined)` flows it through (no signature change needed; `combined` is just the `abortSignal` value now).
  - [ ] Map the abort to the right result: if `abortSignal.aborted` and reason is TimeoutError → the runner returns an error/result that index.ts maps to `timeout` (or surface the reason). Keep the existing `cancelled` result message for the signal case; add a timeout case.

- [ ] **Task 4: Unit tests** (AC: 1–6)
  - [ ] index.spec.ts: combined signal built from shutdown + AbortSignal.timeout; status maps to `timeout` when the deadline fires (mock/fake a TimeoutError-reason abort) and `cancelled` on signal-abort.
  - [ ] runner.spec.ts: runValidationLoop stops at the top of an iteration when `abortSignal.aborted` is true (does not start a new attempt); pre-aborted signal short-circuits.
  - [ ] Use fake timers or a pre-aborted AbortSignal to make the deadline deterministic (don't rely on real wall-clock).

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

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

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
