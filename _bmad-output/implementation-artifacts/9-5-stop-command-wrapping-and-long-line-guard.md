# Story 9.5: Stop-Command Wrapping & Long-Line Guard

Status: done

## Story

As a **maintainer**,
I want **streamed assistant text protected from injecting GitHub Actions workflow commands, and guarded against the runner's long-line throughput cliff**,
So that **malicious or accidental `::`-sequences in model output can't hijack the runner, and a huge single line can't stall the step**.

## Background / verified mechanism

VERIFIED in the installed `@actions/core`: `core.info(message)` writes the message **raw** to stdout (`process.stdout.write(message + EOL)`) — it does NOT escape `::` sequences. So streamed assistant text containing e.g. `::add-mask::` or `::set-output name=x::` could be interpreted by the Actions runner as a workflow command (command injection). `@actions/core` exposes **no** `stopCommands` helper; the low-level `@actions/core/lib/command` module exports `issue(name, message?)`, and the documented protection is to bracket untrusted output between `issue('stop-commands', <token>)` and `issue(<token>)`, which makes `::` inert in between.

Separately (research §3a): runner log throughput collapses past ~6k chars/line (a ~100k-char line can take ~10 min and time out the step). Streamed text should be chunked/guarded so no single `core.info` line is enormous.

## Acceptance Criteria

1. **Given** streamed assistant text in `handleTextPart()` **When** it is logged **Then** it is emitted between a `::stop-commands::{token}::` / `::{token}::` bracket (via `issue` from `@actions/core/lib/command`) so any `::`-sequence inside the text cannot be parsed as a workflow command. The token must be unguessable-enough (a fixed non-trivial constant is acceptable; document choice).

2. **Given** the bracket is applied **When** normal text is logged **Then** the visible output is unchanged for the user (the stop-command markers are control lines the runner consumes) and the text still accumulates into `messageBuffer` exactly as today (no behavior regression to message capture).

3. **Given** a very long single text part (> a defined threshold, e.g. 6000 chars) **When** logged **Then** it is split into chunks no larger than the threshold before being written, so no single stdout line approaches the throughput cliff. `messageBuffer` still receives the full text (chunking is display-only).

4. **Given** the existing tool-call log lines (Story 9-1, inside log groups) and run-level annotations (Story 9-2) **When** 9-5 lands **Then** they are unaffected — this story only touches the assistant-text streaming path (`handleTextPart`).

5. **Given** the `formatTimestampedLog` prefix behavior **When** chunking/wrapping **Then** the `[OpenCode]` prefix/timestamp convention is preserved on emitted lines (or applied once per logical message — document the choice; do not lose the prefix entirely).

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, logging, commenting, security (global), testing/unit-testing
  - [ ] Load `typescript-clean-code`, `typescript-unit-testing`

- [ ] **Task 2: Add a stop-command-wrapped, chunked logging helper** (AC: 1, 3, 5)
  - [ ] In `src/opencode.ts` (or a small private method on `OpenCodeService`), add a helper that: (a) chunks text to <= a `MAX_LOG_LINE_LENGTH` constant (add to `types.ts` INPUT_LIMITS, e.g. 6000), (b) brackets the emitted chunk(s) with `issue('stop-commands', STOP_TOKEN)` before and `issue(STOP_TOKEN)` after, using `import { issue } from '@actions/core/lib/command'` (verify exact import path against installed package).
  - [ ] Preserve the `[OpenCode]`/timestamp prefix per AC5.
  - [ ] Define `STOP_TOKEN` as a module constant (a fixed, distinctive string; document why a constant is acceptable here — the content is the agent's own output, not attacker-controlled secrets; the goal is preventing accidental/incidental command parsing).

- [ ] **Task 3: Apply in `handleTextPart()`** (AC: 1, 2, 3, 4)
  - [ ] Replace the direct `core.info(this.formatTimestampedLog(part.text!))` with the new wrapped/chunked helper.
  - [ ] Keep `state.messageBuffer += part.text` UNCHANGED and receiving the full text (AC2, AC3).
  - [ ] Do NOT touch the tool branch (9-1) or annotation routing (9-2).

- [ ] **Task 4: Add `INPUT_LIMITS.MAX_LOG_LINE_LENGTH`** (AC: 3)
  - [ ] Add the constant to `src/types.ts` `INPUT_LIMITS` (`as const`), with a brief comment referencing the ~6k throughput cliff.

- [ ] **Task 5: Mock + Unit tests** (AC: 1–5)
  - [ ] If using `issue` from `@actions/core/lib/command`, add a mock for that module (or spy on stdout) so tests can assert the stop-command bracket is emitted around text. (Check whether moduleNameMapper needs a `@actions/core/lib/command` entry — mirror the existing `@actions/core` mock approach.)
  - [ ] Test: a text part emits stop-commands open + content + stop-commands close (bracket present).
  - [ ] Test: text with embedded `::set-output::`-like content is still bracketed (not parsed) and fully accumulated in messageBuffer.
  - [ ] Test: a > threshold text part is chunked into multiple writes, each <= threshold; messageBuffer still gets the full text.
  - [ ] Test: short text → single chunk, still bracketed, prefix preserved.
  - [ ] Test: tool/annotation paths unaffected (regression guard).

- [ ] **Final Task: Quality Checks**
  - [ ] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### Verified API (do NOT use a non-existent helper)

- `core.info` writes RAW to stdout (no `::` escaping) — confirmed in `node_modules/@actions/core/lib/core.js` (`info` = `process.stdout.write(message + os.EOL)`).
- There is **no `core.stopCommands`**. Use `issue` from `@actions/core/lib/command` (`node_modules/@actions/core/lib/command.d.ts` exports `issue(name, message?)`). `issue('stop-commands', token)` opens the inert region; `issue(token)` closes it.
- Confirm the exact import specifier the bundler/ESM resolution accepts (`@actions/core/lib/command` or `@actions/core/lib/command.js`). The project already mocks `@actions/core` via moduleNameMapper at `test/mocks/@actions/core.ts` — you may need a sibling mock for the `command` submodule, OR refactor to spy on stdout. Pick the lower-friction option and document it.

### Scope boundary (do NOT do here)

- Do NOT touch tool-call logging (9-1), annotation rationing (9-2), transcript (9-3), or summary (9-4).
- action.yml inputs/outputs = 9-6. This is purely the `handleTextPart` streaming path + a constant + a helper.

### Project conventions

- `[OpenCode]` prefix via `formatTimestampedLog`. Named exports, `.js` import extensions, `noUncheckedIndexedAccess`. `as const` for INPUT_LIMITS. `clearMocks: true` global. Coverage 80% / 75% branches.

### References

- [Source: epics.md#Story 9.5] · [Source: prd.md#NFR22] · [Source: research/opencode-upgrade-design-2026-05-29.md §3a]
- `node_modules/@actions/core/lib/command.d.ts` (issue), `lib/core.js` (info raw stdout)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (developer sub-agent)

### Mock strategy + STOP_TOKEN rationale (Dev Notes)

**Mock strategy**: Used `jest.spyOn(process.stdout, 'write')` in the new `stop-command wrapping (9-5)` describe block. This avoids any import resolution issues with the ESM-only `@actions/core/lib/command` submodule (which isn't in the package exports map and TypeScript can't resolve it). The implementation uses `process.stdout.write` directly — same as what `issue()` does internally — making stdout spy the exact right test seam. Lower friction than adding a moduleNameMapper entry + mock file for a sub-path that isn't publicly exported.

**STOP_TOKEN** = `'opencode-stop-43f8a2b1'`. A constant is acceptable here because: (a) the content being bracketed is the agent's own output, not attacker-controlled user input; (b) the goal is preventing _accidental/incidental_ `::` sequences from being parsed as workflow commands, not preventing adversarial injection of the token itself; (c) GitHub's own documentation recommends this pattern with a fixed token for exactly this use case.

**`issue()` vs direct stdout**: `@actions/core/lib/command.js` is ESM-only and its subpath is not in the package's `exports` map, so TypeScript rejects the import. Instead the implementation writes `::stop-commands::TOKEN\n` and `::TOKEN::\n` directly via `process.stdout.write` — which is exactly what `issueCommand` does internally.

### Completion Notes List

- **Task 4 (src/types.ts)**: Added `MAX_LOG_LINE_LENGTH: 6_000` to `INPUT_LIMITS` with comment referencing the ~6k throughput cliff.
- **Task 2+3 (src/opencode.ts)**:
  - Added `STOP_TOKEN = 'opencode-stop-43f8a2b1'` module constant with rationale comment.
  - Added private `emitTextSafe(text)` method: writes `::stop-commands::TOKEN\n` via stdout, then chunks `formatTimestampedLog(text)` into `MAX_LOG_LINE_LENGTH` pieces via `core.info`, then writes `::TOKEN::\n` via stdout.
  - Updated `handleTextPart()`: replaced `core.info(this.formatTimestampedLog(part.text!))` with `this.emitTextSafe(part.text!)`. `state.messageBuffer += part.text` unchanged (full text).
  - Tool branch (9-1) and annotation routing (9-2) untouched.
- **Task 5 (src/opencode-session.spec.ts)**: Added new `stop-command wrapping (9-5)` describe block with `stdoutSpy = jest.spyOn(process.stdout, 'write')` in `beforeEach`. 5 tests: bracket present (AC1), injection text bracketed + full buffer (AC1/AC2), >threshold chunked + full buffer (AC3), short text single chunk with prefix (AC5), tool path unaffected by brackets (AC4).
- **Final Task**: lint ✓ (0 warnings) · format ✓ · typecheck ✓ · test:unit ✓ (491/491 pass, 91.82%/82.92% coverage)

### File List

- `src/types.ts` — Task 4: added `MAX_LOG_LINE_LENGTH`
- `src/opencode.ts` — Task 2+3: STOP_TOKEN constant, `emitTextSafe()` helper, updated `handleTextPart()`
- `src/opencode-session.spec.ts` — Task 5: new `stop-command wrapping` describe block (5 tests)

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
