# Story 9.2: Ration GitHub Annotations

Status: done

## Story

As a **GitHub Actions user**,
I want **only run-level outcomes surfaced as annotations**,
So that **the real failure isn't buried under dozens of per-tool warnings that silently hit GitHub's 10-warning/step and 50/job caps**.

## Background / problem

Today, every tool **error** part is routed to `core.warning()` in `handleMessagePartUpdated()` (the branch Story 9-1 left intentionally unchanged). On a long agent run with many tool calls, routine tool errors (a failed grep, a non-zero bash exit the agent recovers from) each emit a warning annotation. GitHub Actions displays at most **10 warnings/step and 50 annotations/job**, silently dropping the rest — so the _one_ annotation that matters (the actual run failure) gets buried or dropped. This story rations annotations: routine tool errors become ordinary log lines; annotations are reserved for run-level outcomes.

## Acceptance Criteria

1. **Given** a tool part with `state.status === 'error'` **When** `handleMessagePartUpdated()` processes it **Then** the error line is emitted via `core.info()` **inside its log group** (the group from Story 9-1) — NOT via `core.warning()`. Routine per-tool errors no longer create annotations.

2. **Given** a run-level failure the leader/runner surfaces (session error that ends the run, validation-retries-exhausted, fatal SDK/event-loop error) **When** it is reported **Then** it uses `core.error()` (or `core.warning()` for non-fatal run-level issues) **with a `title`** — these are the only paths that should create annotations.

3. **Given** the existing `handleSessionError()` / event-loop-failure / validation paths **When** reviewed **Then** at most a bounded, run-level number of annotations are produced (no per-tool fan-out), keeping well under the 10/type/step and 50/job caps for a normal run.

4. **Given** the tool error still needs to be visible **When** routed to `core.info` **Then** it remains inside the tool's log group (Story 9-1 behavior preserved) and the `getDebugLogWriter().writeToolEvent(...)` call is unchanged, so no diagnostic information is lost.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] Read `.knowledge-base/technical/standards/backend/logging.md` - Logging channels & minimalism
  - [ ] Read `.knowledge-base/technical/standards/backend/coding-style.md`
  - [ ] Read `.knowledge-base/technical/standards/global/commenting.md`
  - [ ] Read `.knowledge-base/technical/standards/testing/unit-testing.md`
  - [ ] Load skill `typescript-clean-code` and `typescript-unit-testing`

- [ ] **Task 2: Re-route per-tool error from core.warning to core.info** (AC: 1, 4)
  - [ ] In `src/opencode.ts` → `handleMessagePartUpdated()`, the tool branch (the `else` block Story 9-1 wrapped in start/endGroup), change the `status === 'error'` sub-branch from `core.warning(logLine)` to `core.info(logLine)` — keeping it inside the existing `core.startGroup`/`core.endGroup`
  - [ ] Leave `completed` on `core.info`, `pending` on `core.debug` unchanged
  - [ ] Keep the `getDebugLogWriter().writeToolEvent(debugLog)` block unchanged

- [ ] **Task 3: Confirm run-level annotations carry a title** (AC: 2, 3)
  - [ ] Audit run-level error paths in `src/opencode.ts` (`handleSessionError`, `handleEventLoopFailure`) and `src/runner.ts` (validation-retries-exhausted, top-level failure). These already use `core.error`/`core.warning`.
  - [ ] Where a run-level annotation is emitted, ensure it passes a `title` via `AnnotationProperties` (e.g. `core.error(msg, { title: 'Session error' })`) so it's a clear, single, top-of-run annotation. If a path already lacks a title, add one. Do NOT add new annotations — only ensure the existing run-level ones are titled.
  - [ ] Do NOT convert these run-level paths to info — they SHOULD annotate.

- [ ] **Task 4: Unit tests** (AC: 1, 2, 3, 4)
  - [ ] Update/extend `src/opencode-session.spec.ts`: the Story 9-1 test "error tool log ... keeps core.warning channel" must be updated — error tool parts now assert `core.info` is used and `core.warning` is NOT called for per-tool errors (still inside a group).
  - [ ] Test: a simulated `session.error` event → `core.error` (or warning) called WITH a `title`, exactly once per run-level failure.
  - [ ] Assert no per-tool `core.warning` fan-out: emitting N error tool parts produces 0 `core.warning` calls.

- [ ] **Final Task: Quality Checks**
  - [ ] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### Design reference

- `research/opencode-upgrade-design-2026-05-29.md` §3a — annotation rationing. Caps: **10 notice + 10 warning + 10 error per step, 50 annotations per job** (silently dropped beyond). The current code's per-tool `core.warning` on every tool error is the exact anti-pattern that blows these caps. Reserve `core.error/warning/notice` (with `title=`) for run-level outcomes only.

### The change (depends on Story 9-1's group wrapping — already committed)

After Story 9-1, the tool branch in `handleMessagePartUpdated()` looks like:

```typescript
} else {
  core.startGroup(logLine);
  if (part.state.status === 'error') {
    core.warning(logLine);   // <-- THIS becomes core.info(logLine) in 9-2
  } else {
    core.info(logLine);
  }
  core.endGroup();
}
```

Change only the `core.warning(logLine)` → `core.info(logLine)`. The group wrapping stays.

### Scope boundary (do NOT do here)

- Do NOT touch transcript export, job summary, or stop-command wrapping (9.3/9.4/9.5).
- Do NOT remove run-level annotations — they are the ones we WANT. Only add `title` where missing.
- Do NOT change the debug-log-writer behavior.

### Project conventions (from project-context.md)

- `core.info()` for user-visible logs, `core.debug()` for internal detail; never `console.log`.
- Set outputs before `core.setFailed()`. `[OpenCode]` prefix via `formatTimestampedLog`.
- `clearMocks: true` global — no `jest.clearAllMocks()` in beforeEach. Coverage 80% / 75% branches.

### References

- [Source: epics.md#Story 9.2] · [Source: prd.md#FR51] · [Source: research/opencode-upgrade-design-2026-05-29.md §3a]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (developer sub-agent)

### Completion Notes List

- **Task 2 (src/opencode.ts line 585-590)**: Removed `if (part.state.status === 'error') { core.warning(logLine) } else { core.info(logLine) }` — replaced with single `core.info(logLine)`. Error tool parts now emit via `core.info` inside the existing `startGroup`/`endGroup` (Story 9-1 behavior preserved). `getDebugLogWriter().writeToolEvent()` block unchanged.
- **Task 3 (src/opencode.ts)**:
  - `handleSessionError()` line ~516: `core.error(msg)` → `core.error(msg, { title: 'Session error' })`
  - `handleEventLoopFailure()` line ~442: `core.error(msg)` → `core.error(msg, { title: 'Event loop failure' })`
  - Audited all `core.warning` calls in opencode.ts (lines 310, 379, 409, 500) — all are intermediate recovery paths (heartbeat reconnect, permission approval failure), NOT run-level annotations. No changes required per scope boundary.
  - Audited `src/runner.ts` line 275: `core.warning` for per-attempt validation errors is intermediate. Final throw bubbles to caller. No change required.
- **Task 4 (src/opencode-session.spec.ts)**:
  - Updated `tool logging` → "logs tool error event" test: now asserts `core.info` called (not `core.warning`) for error tool parts
  - Updated `log-group wrapping` → "9-1-AC1: wraps error tool log" test: renamed, asserts `core.info` used, `core.warning` NOT called with Tool error pattern
  - Added `9-2-AC1: N error tool parts produce 0 core.warning calls` — emits 3 error parts, verifies 0 warning calls, 3 info calls matching tool pattern
  - Added `9-2-AC2: session.error emits core.error with a title annotation` — emits session.error, verifies `core.error` called with `{ title: 'Session error' }`
- **Task 4 (src/opencode-config.spec.ts)**: Updated 2 pre-existing tests asserting `core.error` for event-loop-failure — added `{ title: 'Event loop failure' }` to match new signature (lines ~97, ~255)
- **Final Task**: lint ✓ (0 warnings) · format ✓ · typecheck ✓ · test:unit ✓ (447/447 pass, 91.27%/82.82% coverage)

### File List

- `src/opencode.ts` — Task 2 (warning→info), Task 3 (session error + event loop failure titles)
- `src/opencode-session.spec.ts` — Task 4 (updated 2 tests, added 2 new tests)
- `src/opencode-config.spec.ts` — Task 4 (updated 2 existing tests to match new `core.error` signature)

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
