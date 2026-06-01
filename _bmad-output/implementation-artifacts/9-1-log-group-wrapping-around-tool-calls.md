# Story 9.1: Add Log-Group Wrapping Around Tool Calls

Status: done

## Story

As a **GitHub Actions user running long AI workflows**,
I want **each tool call collapsed into a GitHub Actions log group**,
So that **the console timeline stays scannable and verbose tool output is one click away instead of flooding the log**.

## Acceptance Criteria

1. **Given** a `message.part.updated` event with `part.type === 'tool'` and a non-pending `state.status` **When** `handleMessagePartUpdated()` processes it **Then** the tool's log line is emitted inside a GitHub Actions log group — `core.startGroup(<formatLog title>)` is called before the line and `core.endGroup()` after — so the verbose body collapses by default.

2. **Given** a tool part with `state.status === 'pending'` **When** processed **Then** it continues to go to `core.debug()` (no group — pending states are noise) exactly as today.

3. **Given** assistant **text** parts (`part.type === 'text'`) **When** processed **Then** they remain **top-level** `core.info()` lines — NOT wrapped in a group — so the assistant narrative reads as a continuous transcript.

4. **Given** GitHub Actions does not support nested groups **When** a tool group is open **Then** no second `startGroup` is emitted before its `endGroup` (one group per tool call, opened and closed within the same event handling).

5. **Given** the existing debug-log-writer and tool-logger behavior **When** the change is made **Then** `getDebugLogWriter().writeToolEvent(...)` and the per-tool `formatLog`/`formatDebugLog` outputs are unchanged — only the console grouping is added.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID, TypeScript
  - [ ] Read `.knowledge-base/technical/standards/backend/logging.md` - Minimal logging, prefix conventions
  - [ ] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [ ] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern, @golevelup/ts-jest
  - [ ] Load skill `typescript-clean-code` (writing/refactoring) and `typescript-unit-testing` (tests)

- [ ] **Task 2: Wrap completed/error tool parts in a log group** (AC: 1, 2, 4, 5)
  - [ ] In `src/opencode.ts` → `handleMessagePartUpdated()`, locate the `part?.type === 'tool'` branch (~lines 577-595)
  - [ ] For non-pending statuses (`completed`/`error` — the branch that currently calls `core.info`/`core.warning`), emit the log line between `core.startGroup(<title>)` and `core.endGroup()`
  - [ ] Use the tool logger's one-line summary as the group title: `getToolLoggerFactory().getLogger(part.tool).formatLog(part.tool, part.state)` (the same value currently logged), wrapped via `formatTimestampedLog`
  - [ ] Keep `pending` → `core.debug()` unchanged (no group)
  - [ ] Preserve the existing `getDebugLogWriter().writeToolEvent(debugLog)` call for non-pending states
  - [ ] Ensure exactly one group per tool call — open then close within the same branch; no nesting

- [ ] **Task 3: Confirm text parts stay top-level** (AC: 3)
  - [ ] Verify `handleTextPart()` is untouched — assistant text continues via top-level `core.info()` with no group wrapping

- [ ] **Task 4: Unit tests** (AC: 1, 2, 3, 4)
  - [ ] In `src/opencode.spec.ts`, mock `@actions/core` `startGroup`/`endGroup` (already mapped via moduleNameMapper at `test/mocks/@actions/core.ts`)
  - [ ] Test: completed tool part → `startGroup` called once with the formatLog title, log line emitted, `endGroup` called once
  - [ ] Test: error tool part → wrapped in a group (start/end balanced)
  - [ ] Test: pending tool part → NO `startGroup`/`endGroup`, goes to `core.debug`
  - [ ] Test: text part → NO group wrapping (top-level `core.info`)
  - [ ] Assert `startGroup`/`endGroup` call counts are balanced (no nesting/leak)

- [ ] **Final Task: Quality Checks**
  - [ ] Run `npm run lint` - Fix any linting issues (zero warnings)
  - [ ] Run `npm run format` - Verify code formatting
  - [ ] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Design reference

- `_bmad-output/planning-artifacts/research/opencode-upgrade-design-2026-05-29.md` §3a — "Console experience (live log)". The tool-logger `formatLog` (short summary) is the **group title**; `formatDebugLog` (verbose body) already routes to the debug-log file. This story only adds the console grouping around the existing tool log line.
- Research finding: GitHub Actions groups **cannot nest**, and there is no "pre-collapsed-but-expandable" API — a group is open while streaming and collapsed after `endGroup`. One group per tool call.

### Current code (the exact branch to change)

`src/opencode.ts` → `handleMessagePartUpdated()`, tool branch (~577-595):

```typescript
if (part?.type === 'tool' && part.tool && part.state) {
  const logger = getToolLoggerFactory().getLogger(part.tool);
  const message = logger.formatLog(part.tool, part.state);
  const logLine = this.formatTimestampedLog(message);
  if (part.state.status === 'pending') {
    core.debug(logLine);
  } else if (part.state.status === 'error') {
    core.warning(logLine); // NOTE: Story 9.2 will re-route this off core.warning
  } else {
    core.info(logLine);
  }

  if (part.state.status !== 'pending') {
    const debugLog = logger.formatDebugLog(part.tool, part.state);
    if (debugLog) {
      getDebugLogWriter().writeToolEvent(debugLog);
    }
  }
}
```

### Scope boundary (do NOT do here)

- **Annotation rationing (the `core.warning` on error) is Story 9.2, not 9.1.** For 9.1, keep the current `core.warning` for error status but wrap it in the group. 9.2 will change the channel. Touching it here would collide with 9.2.
- No transcript export, no job summary, no stop-command wrapping — those are 9.3/9.4/9.5.

### Project conventions (from project-context.md)

- `[OpenCode]` logging prefix (via existing `formatTimestampedLog`).
- Named exports only; `.js` extensions on local imports; `noUncheckedIndexedAccess` — narrow before use.
- `clearMocks: true` is global — do NOT call `jest.clearAllMocks()` in `beforeEach`.
- Coverage thresholds: 80% functions/lines/statements, 75% branches.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.1]
- [Source: _bmad-output/planning-artifacts/prd.md#FR50]
- [Source: research/opencode-upgrade-design-2026-05-29.md §3a]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (developer sub-agent)

### Completion Notes List

1. **`test/mocks/@actions/core.ts`** — Added `startGroup` and `endGroup` jest.fn() exports (lines 10–11) so the mock matches the real `@actions/core` API used by the new implementation.

2. **`src/opencode.ts` lines 581–590** — In `handleMessagePartUpdated()`, refactored the non-pending tool branch:
   - Before the log line is emitted, call `core.startGroup(logLine)` to open a GHA log group titled with the formatted tool summary.
   - `core.info(logLine)` (completed) and `core.warning(logLine)` (error) remain on their existing channels — scope boundary respected; Story 9.2 will re-route the error channel.
   - After the log line, call `core.endGroup()` to close the group.
   - `core.debug(logLine)` for `pending` is untouched (no group wrapping).
   - The `getDebugLogWriter().writeToolEvent(debugLog)` block is fully preserved.

3. **`src/opencode-session.spec.ts`** — Added new `describe('log-group wrapping', ...)` block (lines 451–591, 5 new tests):
   - `9-1-AC1: wraps completed tool log in startGroup/endGroup` — asserts startGroup called once with correct title, endGroup called once, info called.
   - `9-1-AC1: wraps error tool log in startGroup/endGroup and keeps core.warning channel` — asserts balanced start/endGroup, warning still called.
   - `9-1-AC2: pending tool part goes to core.debug with no startGroup/endGroup` — asserts no group calls, debug called.
   - `9-1-AC3: text parts are not wrapped in a group` — asserts no group calls, info called with text.
   - `9-1-AC4: exactly one startGroup/endGroup per tool call — no nesting` — emits two completed tool events, asserts startGroup×2 endGroup×2.

### Quality check results

- `npm run lint`: 0 warnings ✅
- `npm run format`: all unchanged ✅
- `npm run typecheck`: no errors ✅
- `npm run test:unit`: 445 passed, 0 failed ✅ — coverage global 91.29% stmts / 82.87% branches (above 80%/75% thresholds)

### File List

- `test/mocks/@actions/core.ts` — modified (added startGroup, endGroup)
- `src/opencode.ts` — modified (wrap non-pending tool log lines in startGroup/endGroup)
- `src/opencode-session.spec.ts` — modified (added log-group wrapping describe block with 5 tests)

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
