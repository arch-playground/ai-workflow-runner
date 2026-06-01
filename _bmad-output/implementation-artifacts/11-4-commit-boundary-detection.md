# Story 11.4: Commit-Boundary Detection (harden)

Status: done

## Story

As the **runner**,
I want **the fallback selector's "committed" signal to fire ONLY on a genuine assistant-role part, never on the echoed user prompt**,
So that **a provider is never wrongly considered "committed" before it has actually produced output — the exact subtlety the §7 spike flagged as nearly inverting the selection verdict**.

## Background

11-3 implemented the selector with a basic commit boundary (`notifyCommitWatcher` fires `onCommit` when `sessionMessageState.currentMessageId` is set). The §7 spike found that the server emits an early `message.part.updated` carrying the **echoed user prompt** as a `text` part _before_ any assistant output — and `message.updated` sets `currentMessageId` for the **assistant** message. This story rigorously verifies (and hardens if needed) that the commit fires on a real assistant part, not the echo, with explicit tests covering the spike's exact event ordering.

## Acceptance Criteria

1. **Given** the real server event ordering (session.created → user-prompt echo as a text part → assistant message.updated → assistant text part → … or session.error) **When** the selector watches **Then** `onCommit` fires ONLY at the first ASSISTANT-role part — NOT when the echoed user prompt's text part arrives.

2. **Given** a `message.part.updated` `text` part whose content equals the prompt and arrives before any assistant `message.updated` **When** processed **Then** it does NOT trigger commit (no `currentMessageId` for an assistant message yet, OR an explicit role check).

3. **Given** a `session.error` arrives after the user-echo part but before any assistant part **When** processed **Then** it correctly triggers `onEarlyError` (advance) — the echo did not falsely commit the provider.

4. **Given** the commit detection **When** hardened **Then** it keys off **assistant** message state specifically (the `message.updated` handler only sets `currentMessageId` for `info.role === 'assistant'` — confirm this is what gates `notifyCommitWatcher`), so the boundary is provably assistant-only. Add an explicit role assertion/guard if the current gating is incidental rather than intentional.

5. **Given** existing 11-3 selector tests **When** 11-4 lands **Then** they still pass, plus new tests reproduce the spike's exact ordering (echo-then-error and echo-then-assistant) and assert the correct outcome.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — coding-style, testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Audit + harden the commit gate** (AC: 1, 2, 4)
  - [x] Trace: `message.updated` (assistant) sets `currentMessageId` (handleMessageUpdated — confirm it's gated on `info.role === 'assistant'`); `notifyCommitWatcher` fires `onCommit` only when `currentMessageId` is set. Confirm the user-prompt echo (a `message.part.updated` text part) does NOT set `currentMessageId` and does NOT call `notifyCommitWatcher` in a way that commits.
  - [x] If the gating is correct-by-accident (e.g. relies on ordering), make it explicit: commit only on an assistant-role signal. If a `notifyCommitWatcher` call sits in the text-part path, ensure it only commits for assistant parts (check role / that an assistant message is active), not the echo.
  - [x] Keep behavior identical for the committed case; this is a correctness-hardening, not a feature change.

- [x] **Task 3: Spike-ordering tests** (AC: 1, 2, 3, 5)
  - [x] In opencode-fallback.spec.ts (or the session spec), add tests emitting the spike's exact sequence via the eventControl harness:
    - session.created → text part = prompt echo → session.error ⇒ onEarlyError (advance), NOT commit.
    - session.created → text part = prompt echo → assistant message.updated → assistant text part ⇒ onCommit at the assistant part, not the echo.
    - assert `onCommit` is NOT called after only the echo part.
  - [x] Verify all existing 11-3 tests still pass.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **The spike subtlety (load-bearing):** the leader's §7 spike initially mis-counted the user-prompt echo as "progress" and nearly concluded start-and-watch was unviable. The fix was scoping "progress" to assistant-role parts. This story makes that scoping provable in the fallback selector with explicit tests — it's the single most important correctness property of the commit boundary.
- This is hardening + tests. If the 11-3 gating is already correct (commit keyed on assistant `currentMessageId`), this story may be mostly NEW TESTS that prove it + a small explicit guard/comment. If a real gap exists (echo can commit), FIX it and report. Either way, the deliverable is: provably assistant-only commit + spike-ordering tests.
- Do NOT change the selection loop (11-3), exhaustion/precedence (11-5). Just the commit-boundary correctness.
- Conventions: clearMocks global; coverage 80%/75%; named exports, `.js` imports.

### References

- [Source: epics.md#Story 11.4] · [Source: prd.md#FR61] · [Source: research/opencode-upgrade-design-2026-05-29.md §7 spike finding #3 + §5.2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2 — Audit (Gap found: NO)**: `handleMessageUpdated` gates `currentMessageId` on `info.role === 'assistant'` (line 784 opencode.ts) — NOT incidental, intentional from day 1. `notifyCommitWatcher` checks `state?.currentMessageId` before firing `onCommit` (line 861). User-prompt echo arrives as `message.part.updated` with no preceding assistant `message.updated` → `currentMessageId` is null → `notifyCommitWatcher` is a no-op. The gating is structurally correct.
- **Task 2 — Hardening**: Added explicit comment in `notifyCommitWatcher` documenting the invariant: "currentMessageId is ONLY set by handleMessageUpdated when info.role === 'assistant'. The echoed user-prompt text part arrives before any assistant message.updated, so currentMessageId is null at that point — this guard ensures the echo never commits." No logic change needed.
- **Task 3 — 4 spike-ordering tests** added to `opencode-fallback.spec.ts` in new `Commit boundary — spike-ordering tests (11-4)` describe: AC1/AC3 (echo-then-error→advance-not-commit); AC2 (echo-only-then-error→watcher still active→advance); AC1 positive (echo-then-assistant-message.updated-then-assistant-text→commit at assistant part); AC4 (user-role message.updated does NOT set currentMessageId, subsequent text part does NOT commit). All 6 existing 11-3 tests still pass.
- **Quality**: lint zero, typecheck clean, format no changes, 674/674 tests pass (+4 new), coverage thresholds met.

### File List

- `src/opencode.ts` — added explicit comment in `notifyCommitWatcher` documenting assistant-only invariant
- `src/opencode-fallback.spec.ts` — added 4 spike-ordering tests (11-4 describe block)
- `_bmad-output/implementation-artifacts/11-4-commit-boundary-detection.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
