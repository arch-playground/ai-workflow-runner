---
title: 'Debug Log File for OpenCode Tool Calls'
slug: 'debug-log-file'
created: '2026-03-11'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', '@actions/core', '@opencode-ai/sdk ^1.2.18', 'Node.js fs', 'Jest ^30.2']
files_to_modify:
  [
    'action.yml',
    'src/types.ts',
    'src/config.ts',
    'src/opencode.ts',
    'src/runner.ts',
    'src/debug-log-writer.ts (new)',
    'src/tool-loggers/tool-logger.interface.ts',
    'src/tool-loggers/impl/bash.tool-logger.ts',
    'src/tool-loggers/impl/read.tool-logger.ts',
    'src/tool-loggers/impl/write.tool-logger.ts',
    'src/tool-loggers/impl/edit.tool-logger.ts',
    'src/tool-loggers/impl/grep.tool-logger.ts',
    'src/tool-loggers/impl/glob.tool-logger.ts',
    'src/tool-loggers/impl/todowrite.tool-logger.ts',
    'src/tool-loggers/impl/default.tool-logger.ts',
  ]
code_patterns:
  [
    'singleton',
    'factory pattern',
    'tool logger interface',
    'IToolLogger with formatDebugLog',
    'null object pattern',
  ]
test_patterns:
  ['co-located *.spec.ts', 'jest.mock @actions/core', 'AAA pattern', 'ToolState literal objects']
---

# Tech-Spec: Debug Log File for OpenCode Tool Calls

**Created:** 2026-03-11

## Overview

### Problem Statement

When debugging AI workflow runs, the current logging only provides summary statistics (e.g., "bash - completed - 42 lines"). The full tool input/output content is lost, making it difficult to diagnose issues with tool calls. Users need a way to enable verbose debug logging that writes full tool call details (input, output, AI text messages) to a file for post-run analysis.

### Solution

Add a `debug_log` action input (also activatable via `ACTIONS_STEP_DEBUG` / `RUNNER_DEBUG` environment variables) that, when enabled, writes verbose OpenCode session logs to a file. The file contains full, human-readable tool call input/output (no truncation) and AI assistant text messages. Console output remains unchanged (summary-only). Each tool logger provides its own `formatDebugLog()` method returning tool-specific formatted debug output.

### Scope

**In Scope:**

- New `debug_log` action input (boolean, default `false`)
- New `debug_log_path` action input (optional, default `$RUNNER_TEMP/opencode-debug.log`)
- Activation via `ACTIONS_STEP_DEBUG=true` or `RUNNER_DEBUG=1` as alternative triggers
- Extend `IToolLogger` with `formatDebugLog()` — tool-specific verbose formatting
- Per-tool debug formats: bash (command output), read (file content), write/edit (diff format), grep/glob (full results), todowrite (task list with status), default (raw input/output)
- Verbose file logging of AI assistant text messages (buffered per complete message, not streaming chunks)
- Session lifecycle events in the log file (session start, idle, error)
- New `DebugLogWriter` class for file I/O (with no-op implementation when disabled)
- Console output stays as-is (summary only)

**Out of Scope:**

- Changing the existing console log format
- Log rotation or size limits on the debug file
- Streaming the debug log to an external service
- Debug logging for validation script execution

## Context for Development

### Codebase Patterns

- All logging goes through `@actions/core` (`core.info`, `core.debug`, `core.warning`)
- Tool events are processed in `OpenCodeService.handleMessagePartUpdated()` method in `src/opencode.ts`
- Tool loggers implement `IToolLogger` interface with `support(): string` and `formatLog(): string`
- `ToolState` from SDK has 4 variants:
  - `pending`: `{ status, input, raw }`
  - `running`: `{ status, input, title?, metadata?, time: { start } }`
  - `completed`: `{ status, input, output, title, metadata, time: { start, end, compacted? }, attachments? }`
  - `error`: `{ status, input, error, metadata?, time: { start, end } }`
- `state.input` is `Record<string, unknown>` — keys defined in `TOOL_INPUT_KEYS` constant
- `state.output` is a plain string (can be very large, no truncation in debug mode)
- Text messages arrive as streaming chunks via `handleTextPart()` in `src/opencode.ts` — chunks are accumulated in `messageBuffer` and finalized into `lastCompleteMessage` when a new message starts or session goes idle
- Action inputs are parsed in `config.ts:getInputs()` and stored in `ActionInputs` interface
- The project uses `.js` extensions in all local imports (NodeNext resolution)
- Security: temp files must use `0o600` permissions
- Logging prefix: `[OpenCode]` for all SDK operations
- SDK `Todo` type (verified in `@opencode-ai/sdk` `types.gen.d.ts:561`): `{ content: string, status: string, priority: string, id: string }`. The existing `TodoWriteToolLogger` only extracts `content` — this spec extends extraction to include `status` and `priority` for debug formatting.
- Test pattern: co-located `*.spec.ts`, AAA pattern, `ToolState` constructed as literal objects
- The `write` tool's `state.output` contains a confirmation message, NOT the file content. The actual file content is in `state.input.content`. Since `content` is not yet in `TOOL_INPUT_KEYS`, it must be added.
- The `edit` tool's `state.input` contains `oldString` and `newString` (already in `TOOL_INPUT_KEYS`).

### Files to Reference

| File                                             | Purpose                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/opencode.ts`                                | Main event handling — `handleMessagePartUpdated()` and `finalizeSession()` are injection points  |
| `src/types.ts`                                   | `ActionInputs` interface — add `debugLog` and `debugLogPath` fields                              |
| `src/config.ts`                                  | `getInputs()` — parse new inputs, detect `ACTIONS_STEP_DEBUG`/`RUNNER_DEBUG`                     |
| `action.yml`                                     | Action metadata — add `debug_log` and `debug_log_path` inputs                                    |
| `src/tool-loggers/tool-logger.interface.ts`      | `IToolLogger` interface — add `formatDebugLog()` method                                          |
| `src/tool-loggers/impl/bash.tool-logger.ts`      | Bash logger — debug format: full command + full output                                           |
| `src/tool-loggers/impl/read.tool-logger.ts`      | Read logger — debug format: file path + full file content                                        |
| `src/tool-loggers/impl/write.tool-logger.ts`     | Write logger — debug format: file path + full content from `state.input.content`                 |
| `src/tool-loggers/impl/edit.tool-logger.ts`      | Edit logger — debug format: file path + oldString/newString as unified diff                      |
| `src/tool-loggers/impl/grep.tool-logger.ts`      | Grep logger — debug format: pattern + full match results                                         |
| `src/tool-loggers/impl/glob.tool-logger.ts`      | Glob logger — debug format: pattern + full file list                                             |
| `src/tool-loggers/impl/todowrite.tool-logger.ts` | TodoWrite logger — debug format: task list with status/priority (extends existing extraction)    |
| `src/tool-loggers/impl/default.tool-logger.ts`   | Default logger — debug format: raw JSON input + full output                                      |
| `src/tool-loggers/tool-input-keys.ts`            | `TOOL_INPUT_KEYS` and `TOOL_METADATA_KEYS` constants — add `CONTENT` key                         |
| `src/security.ts`                                | `validateConfigPath()` — reference only, NOT reused for debug_log_path (see Technical Decisions) |
| `src/tool-loggers/impl/bash.tool-logger.spec.ts` | Reference test pattern for tool loggers                                                          |
| `src/runner.ts`                                  | `runWorkflow()` — pass debug config to `OpenCodeService`                                         |

### Technical Decisions

1. **Extend `IToolLogger` with `formatDebugLog()`**: Each tool logger provides its own verbose debug format via a new `formatDebugLog(tool: string, state: ToolState): string` method. This keeps tool-specific formatting knowledge co-located with each logger rather than centralizing it in the `DebugLogWriter`.

2. **`DebugLogWriter` with null object pattern**: New file `src/debug-log-writer.ts`. Define an `IDebugLogWriter` interface and two implementations:
   - `DebugLogWriter` — real implementation that writes to file
   - `NoOpDebugLogWriter` — does nothing (all methods are no-ops)
     The module exports `getDebugLogWriter(): IDebugLogWriter` which always returns a valid object (never null). When debug is disabled, it returns the no-op instance. This eliminates null checks at every call site.

3. **Activation precedence**: `debug_log: 'true'` input OR `ACTIONS_STEP_DEBUG=true` OR `RUNNER_DEBUG=1` — any one triggers debug mode. Resolved once in `config.ts:getInputs()`.

4. **Debug log path validation — dedicated function, NOT `validateConfigPath()`**: `validateConfigPath()` is designed for _read_ paths and calls `fs.realpathSync` (requires file to exist). For the debug log _write_ path, create a new `validateDebugLogPath()` function in `config.ts` that:
   - For absolute paths: checks the parent directory is under `RUNNER_TEMP`, `/tmp`, or `/github/runner_temp` (same safe prefixes as `validateConfigPath`)
   - For relative paths: resolves against workspace, checks the resolved path stays within workspace
   - Does NOT call `fs.realpathSync` (file doesn't exist yet)
   - Creates parent directories with `fs.mkdirSync(dir, { recursive: true })`

5. **File creation with explicit permissions**: On construction, use `fs.writeFileSync(path, '', { mode: 0o600 })` to create the file with correct permissions. Subsequent writes use async `fs.promises.appendFile()`. The `mode` option in `appendFileSync` only applies at creation time — explicit initial creation guarantees permissions.

6. **Error handling for file writes — graceful degradation**: All `DebugLogWriter` write methods wrap file I/O in try-catch. On failure, log a warning via `core.warning('[OpenCode] Debug log write failed: ...')` and continue. After the first failure, set an internal `disabled` flag to prevent further write attempts (avoids log spam). The debug feature must never crash the main workflow.

7. **Async file writes to avoid blocking the event loop**: Use `fs.promises.appendFile()` (async) instead of `fs.appendFileSync()`. The write methods are fire-and-forget — callers don't await. Internally, writes are chained via a promise queue to preserve ordering.

8. **Text message debug logging — write complete messages, not streaming chunks**: Do NOT write each text chunk from `handleTextPart()`. Instead, write the _complete_ assistant message from `finalizeSession()` using `lastCompleteMessage`. This produces readable output instead of fragmented streaming chunks.

9. **Tool-specific debug formats**:
   - **bash**: `$ {command}\n{full output}` — shows the command and its complete stdout
   - **read**: `File: {path}\n{full content}` — shows the complete file content read
   - **write**: `File: {path}\n+++ {path}\n+ {content lines}` — shows new file content from `state.input.content` (via `TOOL_INPUT_KEYS.CONTENT`) in diff-like `+ ` prefix format. If `state.input.content` is unavailable (not a string), fall back to `state.output` with a `[content from output]` label.
   - **edit**: `File: {path}\n--- a/{path}\n+++ b/{path}\n- {old lines}\n+ {new lines}` — unified diff format
   - **grep**: `Pattern: {pattern}\nInclude: {TOOL_INPUT_KEYS.INCLUDE value or "all files"}\n{full results}` — complete grep output using constant reference
   - **glob**: `Pattern: {pattern}\n{full file list}` — complete file listing
   - **todowrite**: Status-formatted task list with checkboxes (`[x]`, `[ ]`, `[>]`, `[-]`, `[?]`) and priority
   - **default**: `Input:\n{JSON.stringify(input, null, 2)}\nOutput:\n{output}` — raw fallback

10. **Console unchanged**: Debug mode only writes to file. Console stays summary-only.

11. **`formatDebugLog` only called for `completed` and `error` states**: `pending` and `running` states have no output to debug-log. The summary `formatLog()` line is still written for all states.

12. **Fallback for missing input keys**: All `formatDebugLog()` implementations must handle empty/missing input values gracefully using `extractStringInput()` (returns `''` for missing keys). When `filePath` is empty, show `File: (unknown)`. When command is empty, show `$ (no command)`.

13. **Entry separator**: Use `\n===\n` between log entries (not `\n---\n` which conflicts with YAML front matter).

## Implementation Plan

### Tasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] Read `.knowledge-base/technical/standards/backend/error-handling.md`
  - [ ] Read `.knowledge-base/technical/standards/backend/coding-style.md`
  - [ ] Read `.knowledge-base/technical/standards/global/commenting.md`
  - [ ] Read `.knowledge-base/technical/standards/backend/logging.md`
  - [ ] Read `.knowledge-base/technical/standards/testing/unit-testing.md`
  - [ ] Load skill `typescript-clean-code`
  - [ ] Load skill `typescript-unit-testing`

- [ ] **Task 2: Add `debug_log` and `debug_log_path` inputs to `action.yml`** (AC: 1)
  - File: `action.yml`
  - Action: Add two new inputs after `list_models`:
    ```yaml
    debug_log:
      description: 'Enable verbose debug logging to file. Also activated by ACTIONS_STEP_DEBUG=true or RUNNER_DEBUG=1.'
      required: false
      default: 'false'
    debug_log_path:
      description: 'Path for debug log file. Defaults to $RUNNER_TEMP/opencode-debug.log. Accepts workspace-relative or absolute paths under RUNNER_TEMP/tmp.'
      required: false
      default: ''
    ```

- [ ] **Task 3: Add `debugLog` and `debugLogPath` to `ActionInputs` and parse in config** (AC: 1, 2, 14)
  - File: `src/types.ts`
  - Action: Add to `ActionInputs` interface:
    ```typescript
    debugLog: boolean;
    debugLogPath: string;
    ```
  - File: `src/config.ts`
  - Action:
    - Add a new `validateDebugLogPath(workspacePath: string, debugLogPath: string): string` function:
      - For absolute paths: check parent directory is under safe prefixes (`RUNNER_TEMP`, `/tmp`, `/github/runner_temp`) — same logic as `validateConfigPath` but without `fs.realpathSync`
      - For relative paths: resolve against workspace, check resolved path stays within workspace (without `fs.realpathSync`)
      - Create parent directories: `fs.mkdirSync(path.dirname(resolved), { recursive: true })`
      - Return the resolved absolute path
    - In `getInputs()`, after `listModels` parsing:
      - Parse `debug_log` input: `core.getInput('debug_log')` — trim, lowercase, compare to `'true'`
      - Check `ACTIONS_STEP_DEBUG` env var: `process.env.ACTIONS_STEP_DEBUG === 'true'`
      - Check `RUNNER_DEBUG` env var: `process.env.RUNNER_DEBUG === '1'`
      - `debugLog = debugLogInput || actionsStepDebug || runnerDebug`
      - Only when `debugLog` is true: resolve `debugLogPath` — if provided, validate with `validateDebugLogPath()`; if empty, default to `path.join(process.env.RUNNER_TEMP || '/tmp', 'opencode-debug.log')`
      - When `debugLog` is false: set `debugLogPath` to `''` (skip all path validation)
    - If `validateDebugLogPath` throws (invalid path), throw with clear error message that includes allowed path prefixes
  - File: `src/config.spec.ts`
  - Action: Add tests for:
    - `debug_log: 'true'` sets `debugLog: true`
    - `debug_log: 'false'` (default) sets `debugLog: false`
    - `ACTIONS_STEP_DEBUG=true` triggers `debugLog: true` even when input is `'false'`
    - `RUNNER_DEBUG=1` triggers `debugLog: true` even when input is `'false'`
    - `debug_log_path` defaults to `$RUNNER_TEMP/opencode-debug.log`
    - `debug_log_path` with custom absolute path under `RUNNER_TEMP` validates successfully
    - `debug_log_path` with custom relative path resolves against workspace
    - `debug_log_path` with disallowed absolute path throws error
    - `debug_log_path` is not validated when `debugLog` is false
    - Parent directories are created when they don't exist

- [ ] **Task 4: Add `CONTENT` key to `TOOL_INPUT_KEYS`** (AC: 6)
  - File: `src/tool-loggers/tool-input-keys.ts`
  - Action: Add `CONTENT: 'content'` to the `TOOL_INPUT_KEYS` constant
  - Notes: The write tool sends file content via `state.input.content`. This key is used by `WriteToolLogger.formatDebugLog()` to extract the written content for diff-like formatting.

- [ ] **Task 5: Extend `IToolLogger` with `formatDebugLog()` method** (AC: 3)
  - File: `src/tool-loggers/tool-logger.interface.ts`
  - Action: Add to `IToolLogger` interface:
    ```typescript
    formatDebugLog(tool: string, state: ToolState): string;
    ```

    - Contract: returns verbose, untruncated debug string for `completed` and `error` states. For `pending` and `running`, returns empty string (caller skips writing).
    - MUST NOT include `[OpenCode]` prefix or timestamp — the `DebugLogWriter` adds those.
    - MUST handle missing input keys gracefully — use `extractStringInput()` and show `(unknown)` for empty file paths.

- [ ] **Task 6: Implement `formatDebugLog()` in `DefaultToolLogger`** (AC: 3)
  - File: `src/tool-loggers/impl/default.tool-logger.ts`
  - Action: Add `formatDebugLog()` method — raw fallback format:
    - `pending`/`running` → return `''`
    - `completed` → `"Tool: {tool}\nInput:\n{JSON.stringify(input, null, 2)}\nOutput:\n{output}"`
    - `error` → `"Tool: {tool}\nInput:\n{JSON.stringify(input, null, 2)}\nError:\n{error}"`
  - File: `src/tool-loggers/impl/default.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests for all 4 states

- [ ] **Task 7: Implement `formatDebugLog()` in `BashToolLogger`** (AC: 3, 4)
  - File: `src/tool-loggers/impl/bash.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - `pending`/`running` → return `''`
    - `completed` → format:
      ```
      Tool: bash
      $ {full command, no truncation}
      {full output}
      ```
      If exit code is non-zero, append `\nExit code: {code}`
    - `error` → format:
      ```
      Tool: bash
      $ {full command}
      Error: {full error, no truncation}
      ```
    - When command is empty: show `$ (no command)`
  - File: `src/tool-loggers/impl/bash.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests — full command (no truncation), full output, exit code, missing command

- [ ] **Task 8: Implement `formatDebugLog()` in `ReadToolLogger`** (AC: 3, 5)
  - File: `src/tool-loggers/impl/read.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - `pending`/`running` → return `''`
    - `completed` → format:
      ```
      Tool: read
      File: {filePath or "(unknown)"}
      {full file content from state.output}
      ```
    - `error` → format:
      ```
      Tool: read
      File: {filePath or "(unknown)"}
      Error: {full error}
      ```
  - File: `src/tool-loggers/impl/read.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests including missing filePath fallback

- [ ] **Task 9: Implement `formatDebugLog()` in `WriteToolLogger`** (AC: 3, 6)
  - File: `src/tool-loggers/impl/write.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - Import `TOOL_INPUT_KEYS` (add to existing import if not present)
    - `pending`/`running` → return `''`
    - `completed` → format showing new file content with `+ ` prefix per line (like `git diff` for new files):
      ```
      Tool: write
      File: {filePath or "(unknown)"}
      +++ {filePath or "(unknown)"}
      + line 1 of content
      + line 2 of content
      ```
      Extract content from `extractStringInput(state.input, TOOL_INPUT_KEYS.CONTENT)`. If content is empty string (key absent or not a string), fall back to `state.output` with label `[content from output]` before the prefixed lines.
    - `error` → format:
      ```
      Tool: write
      File: {filePath or "(unknown)"}
      Error: {full error}
      ```
  - File: `src/tool-loggers/impl/write.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests — verify diff-like `+ ` prefix format, content from input, fallback to output, missing filePath

- [ ] **Task 10: Implement `formatDebugLog()` in `EditToolLogger`** (AC: 3, 7)
  - File: `src/tool-loggers/impl/edit.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - `pending`/`running` → return `''`
    - `completed` → unified diff format:
      ```
      Tool: edit
      File: {filePath or "(unknown)"}
      --- a/{filePath}
      +++ b/{filePath}
      - old line 1
      - old line 2
      + new line 1
      + new line 2
      ```
      Extract `oldString` and `newString` from `state.input` using `TOOL_INPUT_KEYS.OLD_STRING` and `TOOL_INPUT_KEYS.NEW_STRING`.
    - `error` → format:
      ```
      Tool: edit
      File: {filePath or "(unknown)"}
      Error: {full error}
      ```
  - File: `src/tool-loggers/impl/edit.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests — verify unified diff format, multi-line edits, missing filePath

- [ ] **Task 11: Implement `formatDebugLog()` in `GrepToolLogger`** (AC: 3, 8)
  - File: `src/tool-loggers/impl/grep.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - `pending`/`running` → return `''`
    - `completed` → format:
      ```
      Tool: grep
      Pattern: {extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN)}
      Include: {extractStringInput(state.input, TOOL_INPUT_KEYS.INCLUDE) || "all files"}
      {full output from state.output}
      ```
    - `error` → format:
      ```
      Tool: grep
      Pattern: {pattern}
      Error: {full error}
      ```
  - File: `src/tool-loggers/impl/grep.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests — with and without include filter

- [ ] **Task 12: Implement `formatDebugLog()` in `GlobToolLogger`** (AC: 3, 9)
  - File: `src/tool-loggers/impl/glob.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - `pending`/`running` → return `''`
    - `completed` → format:
      ```
      Tool: glob
      Pattern: {extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN)}
      {full output — complete file listing from state.output}
      ```
    - `error` → format:
      ```
      Tool: glob
      Pattern: {pattern}
      Error: {full error}
      ```
  - File: `src/tool-loggers/impl/glob.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests

- [ ] **Task 13: Implement `formatDebugLog()` in `TodoWriteToolLogger`** (AC: 3, 10)
  - File: `src/tool-loggers/impl/todowrite.tool-logger.ts`
  - Action: Add `formatDebugLog()`:
    - Extend the existing `TodoItem` interface to include `status` and `priority` fields: `{ content?: string; status?: string; priority?: string }`
    - Add a new `extractTodoItems()` helper (similar to existing `extractTodoTitles()`) that extracts full todo objects with `content`, `status`, `priority` using proper type guards from `unknown`
    - `pending`/`running` → return `''`
    - `completed` → task list format matching opencode CLI style:
      ```
      Tool: todowrite
      Tasks:
        [x] (high) Task content here
        [>] (medium) Another task
        [ ] (low) Pending task
        [-] Cancelled task
      ```
      Status icon mapping: `completed` → `[x]`, `in_progress` → `[>]`, `pending` → `[ ]`, `cancelled` → `[-]`, unknown → `[?]`
      Priority shown in parentheses. If priority is missing, omit the parenthesized label.
      SDK `Todo` type (verified in `@opencode-ai/sdk` `types.gen.d.ts:561`): `{ content: string, status: string, priority: string, id: string }`
    - `error` → format:
      ```
      Tool: todowrite
      Error: {full error}
      ```
  - File: `src/tool-loggers/impl/todowrite.tool-logger.spec.ts`
  - Action: Add `formatDebugLog` tests — verify status icons, priority labels, multiple todos, missing priority, unknown status

- [ ] **Task 14: Create `DebugLogWriter` class with null object pattern** (AC: 11, 12, 13, 15)
  - File: `src/debug-log-writer.ts` (new)
  - Action: Create interface and two implementations:

    ```typescript
    export interface IDebugLogWriter {
      writeToolEvent(debugLog: string): void;
      writeCompleteMessage(text: string): void;
      writeSessionEvent(message: string): void;
    }
    ```

    **`DebugLogWriter`** (real implementation):
    - Constructor: takes `filePath`, creates the file with `fs.writeFileSync(filePath, '', { mode: 0o600 })` to guarantee permissions
    - All write methods use `fs.promises.appendFile()` (async, fire-and-forget) with an internal promise chain to preserve ordering
    - Wrap all file I/O in try-catch: on failure, log `core.warning('[OpenCode] Debug log write failed: ...')` and set an internal `disabled` flag to prevent further attempts (avoids log spam)
    - `writeToolEvent(debugLog)`: writes `\n===\n[{ISO timestamp}] [Tool]\n{debugLog}\n`
    - `writeCompleteMessage(text)`: writes `\n===\n[{ISO timestamp}] [Assistant]\n{text}\n`
    - `writeSessionEvent(message)`: writes `\n===\n[{ISO timestamp}] [Session] {message}\n`

    **`NoOpDebugLogWriter`** (null object):
    - All methods are empty no-ops

    **Module-level singleton access:**

    ```typescript
    let instance: IDebugLogWriter = new NoOpDebugLogWriter();

    export function initDebugLogWriter(filePath: string): void {
      instance = new DebugLogWriter(filePath);
    }
    export function getDebugLogWriter(): IDebugLogWriter {
      return instance;
    }
    export function resetDebugLogWriter(): void {
      instance = new NoOpDebugLogWriter();
    }
    ```

    `getDebugLogWriter()` always returns a valid object — never null.

  - File: `src/debug-log-writer.spec.ts` (new)
  - Action: Unit tests:
    - `DebugLogWriter.writeToolEvent` appends formatted entry to file
    - `DebugLogWriter.writeCompleteMessage` appends assistant text to file
    - `DebugLogWriter.writeSessionEvent` appends session lifecycle event
    - File created with `0o600` permissions on construction
    - Multiple writes append (not overwrite)
    - Write failure logs warning via `core.warning()` and disables further writes
    - `NoOpDebugLogWriter` methods do nothing (no file created)
    - Singleton init/get/reset lifecycle — `getDebugLogWriter()` returns `NoOpDebugLogWriter` before init

- [ ] **Task 15: Integrate `DebugLogWriter` into `OpenCodeService`** (AC: 12, 13)
  - File: `src/opencode.ts`
  - Action:
    - Import `getDebugLogWriter` from `./debug-log-writer.js`
    - In `handleMessagePartUpdated()` (tool events): after existing `core.info`/`core.debug` call, when state is `completed` or `error`:
      - Get debug log: `const debugLog = logger.formatDebugLog(part.tool, part.state)`
      - If `debugLog` is non-empty: call `getDebugLogWriter().writeToolEvent(debugLog)`
      - No null check needed — `getDebugLogWriter()` returns no-op when disabled
    - In `finalizeSession()`: after setting `lastCompleteMessage`, call `getDebugLogWriter().writeCompleteMessage(state.lastCompleteMessage)` to write the complete assistant message (NOT from `handleTextPart()` which only has streaming chunks)
    - In `handleSessionStatusChange()` / `finalizeSession()`: call `getDebugLogWriter().writeSessionEvent()` for idle/error/disconnected events
  - File: `src/opencode-session.spec.ts`
  - Action: Add tests verifying:
    - `writeToolEvent` is called via `getDebugLogWriter()` for completed/error tool states
    - `writeCompleteMessage` is called with full message text at session finalization
    - `writeSessionEvent` is called for session lifecycle events
    - When `NoOpDebugLogWriter` is active (default), no file operations occur

- [ ] **Task 16: Wire debug config through `runner.ts`** (AC: 13)
  - File: `src/runner.ts`
  - Action: In `runWorkflow()`, after `getOpenCodeService()` and before `opencode.initialize()`:
    - If `inputs.debugLog` is true:
      - Call `initDebugLogWriter(inputs.debugLogPath)`
      - Log: `core.info('[OpenCode] Debug logging enabled: {path}')`
  - File: `src/runner.spec.ts` (if exists — check)
  - Action: Add test verifying `initDebugLogWriter` is called when `debugLog: true`

- [ ] **Final Task: Quality Checks**
  - [ ] Run `npm run lint` - Fix any linting issues
  - [ ] Run `npm run format` - Verify code formatting
  - [ ] Run `npm run typecheck` - Ensure type safety

### Acceptance Criteria

**AC 1: Action inputs are defined and parsed**

- Given the `action.yml` file
- When a user sets `debug_log: 'true'`
- Then `ActionInputs.debugLog` is `true` and `ActionInputs.debugLogPath` defaults to `$RUNNER_TEMP/opencode-debug.log`

**AC 2: Debug mode activates via environment variables**

- Given `debug_log` input is not set (default `'false'`)
- When `ACTIONS_STEP_DEBUG=true` OR `RUNNER_DEBUG=1` is set
- Then `ActionInputs.debugLog` is `true`

**AC 3: `IToolLogger.formatDebugLog()` exists and returns tool-specific format**

- Given any `IToolLogger` implementation
- When `formatDebugLog()` is called with a `completed` or `error` state
- Then it returns a non-empty, tool-specific formatted string without `[OpenCode]` prefix
- And when called with `pending` or `running` state, it returns empty string
- And when input keys are missing, it shows `(unknown)` instead of empty string for file paths

**AC 4: Bash debug log shows full command and output**

- Given a `completed` bash tool state with command `npm run build` and multi-line output
- When `formatDebugLog()` is called
- Then the result contains the full untruncated command prefixed with `$` and the full output
- And if exit code is non-zero, it shows `Exit code: {code}`

**AC 5: Read debug log shows full file content**

- Given a `completed` read tool state with file path and content
- When `formatDebugLog()` is called
- Then the result contains `File: {path}` and the full file content from `state.output`

**AC 6: Write debug log shows new content in diff format**

- Given a `completed` write tool state with file path and content in `state.input.content`
- When `formatDebugLog()` is called
- Then the result shows the file path and each line of content prefixed with `+ `
- And if `state.input.content` is missing, it falls back to `state.output` with a `[content from output]` label

**AC 7: Edit debug log shows unified diff format**

- Given a `completed` edit tool state with `oldString` and `newString`
- When `formatDebugLog()` is called
- Then the result shows `--- a/{path}` / `+++ b/{path}` headers with old lines prefixed `- ` and new lines prefixed `+ `

**AC 8: Grep debug log shows pattern and full results**

- Given a `completed` grep tool state with pattern and matching output
- When `formatDebugLog()` is called
- Then the result contains `Pattern: {pattern}`, `Include:` line, and the full untruncated output

**AC 9: Glob debug log shows pattern and full file list**

- Given a `completed` glob tool state with pattern and file list output
- When `formatDebugLog()` is called
- Then the result contains `Pattern: {pattern}` and the full file listing

**AC 10: TodoWrite debug log shows task list with status icons**

- Given a `completed` todowrite tool state with todos array containing mixed statuses
- When `formatDebugLog()` is called
- Then the result shows each task with status icon (`[x]`/`[>]`/`[ ]`/`[-]`/`[?]`) and priority label
- And missing priority omits the parenthesized label

**AC 11: DebugLogWriter writes formatted entries to file**

- Given a `DebugLogWriter` initialized with a file path
- When `writeToolEvent()`, `writeCompleteMessage()`, or `writeSessionEvent()` is called
- Then the entry is appended to the file with ISO timestamp and `===` entry separator
- And the file is created with `0o600` permissions on construction

**AC 12: Debug log captures tool events and complete messages during session**

- Given `debugLog` is `true` and `DebugLogWriter` is initialized
- When the OpenCode session processes tool events and completes messages
- Then `completed`/`error` tool events are written to the debug file via `formatDebugLog()`
- And complete assistant messages are written at session finalization (not as streaming chunks)
- And session lifecycle events (start, idle, error) are written

**AC 13: Debug log is not written when disabled**

- Given `debugLog` is `false` (default)
- When the OpenCode session processes events
- Then `getDebugLogWriter()` returns `NoOpDebugLogWriter` and no file operations occur

**AC 14: Invalid debug_log_path is rejected with clear error**

- Given `debug_log: 'true'` and `debug_log_path` set to a disallowed absolute path (e.g., `/etc/debug.log`)
- When `getInputs()` parses the config
- Then it throws an error mentioning the allowed path prefixes (RUNNER_TEMP, /tmp)

**AC 15: Debug log write failures do not crash the workflow**

- Given a `DebugLogWriter` initialized with a valid path
- When a file write fails (e.g., disk full)
- Then the error is logged via `core.warning()` and the writer disables itself
- And the main workflow continues executing normally

## Additional Context

### Dependencies

- No new npm dependencies required
- Uses existing `@opencode-ai/sdk` `ToolState` types (v1.2.18)
- SDK `Todo` type verified at `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:561`

### Testing Strategy

- **Unit tests for each tool logger**: Test `formatDebugLog()` for all 4 states per logger (co-located `*.spec.ts`), including missing input key fallbacks
- **Unit tests for `DebugLogWriter`**: Mock `fs.promises.appendFile` and `fs.writeFileSync`, test formatting, file operations, error handling, and no-op behavior
- **Unit tests for config parsing**: Test `debug_log`/`debug_log_path` input parsing, env var detection, path validation, invalid path rejection, parent directory creation
- **Unit tests for integration**: Verify `handleMessagePartUpdated` calls debug writer for completed/error states, `finalizeSession` writes complete messages
- **No E2E tests**: Debug logging is a side effect (file write) — unit tests provide sufficient coverage

### Notes

- The `write` tool sends file content via `state.input.content`. The existing `WriteToolLogger` does not use this key — only `formatDebugLog()` needs it. Added `CONTENT: 'content'` to `TOOL_INPUT_KEYS` in Task 4.
- The `edit` tool's `state.input` contains `oldString` and `newString` — already in `TOOL_INPUT_KEYS`.
- The existing `TodoWriteToolLogger` defines `TodoItem` with only `{ content?: string }`. This spec extends it to `{ content?: string; status?: string; priority?: string }` for `formatDebugLog()`. The SDK `Todo` type (verified) has all four fields (`content`, `status`, `priority`, `id`).
- Debug log file can grow unbounded for long sessions — this is intentional (no truncation requirement). Users should be aware when enabling for very long workflows.
- The `$RUNNER_TEMP` directory is automatically cleaned up by GitHub Actions after the job completes.
- Async writes (`fs.promises.appendFile`) are fire-and-forget with internal promise chain for ordering. If the action exits before all writes flush, some tail entries may be lost — acceptable for debug logging.
