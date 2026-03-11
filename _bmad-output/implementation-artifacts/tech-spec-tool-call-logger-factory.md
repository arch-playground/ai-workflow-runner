---
title: 'Tool Call Logger Factory Pattern'
slug: 'tool-call-logger-factory'
created: '2026-03-10'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['typescript', 'node', '@opencode-ai/sdk', '@actions/core', 'jest']
files_to_modify:
  [
    'src/opencode.ts',
    'src/tool-loggers/tool-logger.interface.ts',
    'src/tool-loggers/tool-logger.factory.ts',
    'src/tool-loggers/tool-input-keys.ts',
    'src/tool-loggers/impl/default.tool-logger.ts',
    'src/tool-loggers/impl/read.tool-logger.ts',
    'src/tool-loggers/impl/write.tool-logger.ts',
    'src/tool-loggers/impl/edit.tool-logger.ts',
    'src/tool-loggers/impl/bash.tool-logger.ts',
    'src/tool-loggers/impl/grep.tool-logger.ts',
    'src/tool-loggers/impl/glob.tool-logger.ts',
    'src/tool-loggers/index.ts',
  ]
code_patterns: ['factory-pattern', 'singleton', 'event-driven', 'discriminated-union']
test_patterns: ['jest', 'AAA-pattern', 'mock-core-info', 'co-located-spec-files']
---

# Tech-Spec: Tool Call Logger Factory Pattern

**Created:** 2026-03-10

## Overview

### Problem Statement

The current tool call logging in `src/opencode.ts` method `handleMessagePartUpdated()` is a single inline `core.info()` call that logs minimal info (`Tool: {name} - {status}`). It lacks:

1. Tool-specific input/output statistics (e.g., file path for read, command for bash, line count for output)
2. Error cause logging when tool calls fail (the SDK provides an `error` field in the error state, currently ignored)
3. Extensibility — adding new tool-specific formatting requires modifying the same method
4. Timestamp at the beginning of log output

The OpenCode SDK's `ToolPart` provides rich data (`input`, `output`, `error`, `time`, `metadata`) across 4 states (`pending`, `running`, `completed`, `error`) — all currently ignored due to narrow type casting.

### Solution

Apply the Factory Pattern to create a `ToolLoggerFactory` with separate logger classes per tool type. Each logger implements a `formatLog()` method that extracts tool-specific info from the `ToolPart` state (input args, output stats, error cause). The factory selects the right logger based on `part.tool` name with O(1) Map lookup and a default fallback.

### Scope

**In Scope:**

- Factory pattern for tool loggers with `support()` + `formatLog()` interface
- Separate logger classes per known tool type (read, write, edit, bash, grep, glob)
- Default fallback logger for unknown tools
- Proper `ToolPart` typing using SDK types (`ToolState`, `ToolStatePending`, `ToolStateRunning`, `ToolStateCompleted`, `ToolStateError`)
- Error cause logging when tool status is `error` (using `state.error` field)
- Tool input statistics (file path, command, pattern, etc.)
- Tool output statistics on completed (output length, line count)
- Timestamp at session start log line
- `pending` state logged at `core.debug()` level (not `core.info()`) to reduce log noise

**Out of Scope:**

- Changes to the SSE event subscription mechanism
- Changes to text message logging
- Log file writing (still uses `core.info()`)
- NestJS DI (this project is a GitHub Action, not NestJS — use plain constructors)

## Context for Development

### Codebase Patterns

- **GitHub Action project** — no DI container, plain class instantiation
- **Logging**: `@actions/core` (`core.info()`, `core.warning()`, `core.error()`, `core.debug()`) — never `console.log`
- **Never log server URLs at info level** — use `core.debug()` only
- **File naming**: `kebab-case.ts`, classes `PascalCase`, functions `camelCase`, constants `UPPER_SNAKE_CASE`
- **Import extensions**: `.js` suffix required on all local imports (NodeNext resolution)
- **Named exports only** — no default exports
- **Dependency graph**: `index → runner → opencode/validation/config → security → types` — new `tool-loggers/` module sits below `opencode.ts` in the chain
- **Singleton pattern**: `OpenCodeService` uses module-level singleton via `getOpenCodeService()` with `resetOpenCodeService()` for test isolation
- **Event handling**: Type-guard all SDK events with runtime checks, each event type has dedicated private handler method
- **Factory pattern** (from project standard): Map-based registry, `support()` method, mandatory default fallback, O(1) lookup — adapted for non-NestJS (no `@Injectable()`, no Symbol tokens)
- **SDK types available**: `ToolPart`, `ToolState`, `ToolStatePending`, `ToolStateRunning`, `ToolStateCompleted`, `ToolStateError` from `@opencode-ai/sdk`
- **`noUncheckedIndexedAccess` enabled** — always narrow `T | undefined` before use
- **String truncation**: Use `truncateString()` from `./security.js` for truncating long strings (appends `...[truncated]`)

### Files to Reference

| File                                                    | Purpose                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/opencode.ts` — `handleMessagePartUpdated()`        | Current tool logging, narrow type cast to replace                                                |
| `src/opencode.ts` — `OpenCodeService` class             | Where factory will be consumed                                                                   |
| `src/opencode.ts` — `runSession()`                      | Where session start timestamp log should go                                                      |
| `src/opencode-session.spec.ts`                          | Existing session/message tests — pattern to follow for tool logger tests                         |
| `src/opencode-test-helpers.ts`                          | `createEventGenerator()`, `flushMicrotasks()`, `createMockClient()`, `setupMockCreateOpencode()` |
| `src/types.ts`                                          | Project type definitions (definition-only, no logic)                                             |
| `src/security.ts`                                       | `truncateString()` utility — leaf node, cannot add imports to it                                 |
| `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` | SDK `ToolPart`, `ToolState*`, `EventMessagePartUpdated` types                                    |

### Technical Decisions

1. **No NestJS DI**: Factory instantiated directly — loggers passed as plain array to factory constructor
2. **SDK Types**: Import `ToolPart`, `ToolState` types from `@opencode-ai/sdk` for proper typing in interface
3. **File structure**: New `src/tool-loggers/` directory following factory pattern standard (interface, factory, impl/, index.ts)
4. **Adaptation for non-NestJS**: No `@Injectable()`, no Symbol tokens, no providers array — factory created with `new ToolLoggerFactory([...loggers])`
5. **ToolState discriminated union**: Use `state.status` as discriminant for type narrowing in logger implementations
6. **Error logging**: Use `core.warning()` for tool errors (recoverable issues), not `core.error()` (reserved for fatal errors)
7. **Output line count**: Use helper `countLines(output)` that returns `0` for empty string, otherwise `output.split('\n').length` (fixes off-by-one)
8. **Timestamp**: Add ISO timestamp to session start log line in `runSession()` via `new Date().toISOString()`
9. **Centralized input key constants**: Tool input key names (e.g., `filePath`, `command`, `oldString`) and metadata keys (e.g., `matches`, `count`, `exit`) defined in `src/tool-loggers/tool-input-keys.ts` — verified against OpenCode source, single place to update if OpenCode changes
10. **Factory with reset for testing**: Export `createToolLoggerFactory()` function and `resetToolLoggerFactory()` for test isolation, following the `getOpenCodeService()` / `resetOpenCodeService()` pattern
11. **`pending` state at debug level**: `pending` events are high-frequency noise — log at `core.debug()`, not `core.info()`
12. **Error message truncation**: Truncate `state.error` to 200 chars using `truncateString()` before logging to prevent log flooding and sensitive data leaks
13. **Duplicate `support()` detection**: Factory constructor throws if two loggers return the same `support()` value
14. **`formatLog` contract**: Every `IToolLogger.formatLog()` MUST return a non-empty string for all 4 `ToolState` variants. This is enforced by requiring all loggers to handle all 4 states with a switch + exhaustive default.
15. **`[OpenCode]` prefix ownership**: `formatLog()` must NOT include the `[OpenCode]` prefix — the caller (`handleMessagePartUpdated`) adds it. Documented in the interface JSDoc.

### SDK ToolPart Type Reference

```typescript
// ToolPart
type ToolPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'tool';
  callID: string;
  tool: string; // tool name: "read", "write", "bash", etc.
  state: ToolState;
  metadata?: Record<string, unknown>;
};

// ToolState discriminated union
type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

// ToolStatePending
type ToolStatePending = {
  status: 'pending';
  input: Record<string, unknown>;
  raw: string;
};

// ToolStateRunning
type ToolStateRunning = {
  status: 'running';
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: { start: number };
};

// ToolStateCompleted
type ToolStateCompleted = {
  status: 'completed';
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { start: number; end: number; compacted?: number };
  attachments?: Array<FilePart>;
};

// ToolStateError
type ToolStateError = {
  status: 'error';
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  time: { start: number; end: number };
};

// EventMessagePartUpdated
type EventMessagePartUpdated = {
  type: 'message.part.updated';
  properties: { part: Part; delta?: string };
};
```

### Current Code to Replace

```typescript
// src/opencode.ts — handleMessagePartUpdated()
private handleMessagePartUpdated(event: ParsedEvent): void {
  const part = (
    event.properties as {
      part?: {
        type?: string;
        text?: string;
        messageID?: string;
        sessionID?: string;
        tool?: string;
        state?: { status?: string };  // ← Too narrow, loses input/output/error/time
      };
    }
  )?.part;

  if (part?.type === 'text' && part.text && part.sessionID) {
    this.handleTextPart(part);
  }

  if (part?.type === 'tool' && part.tool && part.state?.status) {
    core.info(`[OpenCode] Tool: ${part.tool} - ${part.state.status}`);  // ← Replace with factory
  }
}
```

## Implementation Plan

### Tasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] Read `.knowledge-base/technical/standards/backend/error-handling.md` - NO try-catch in use cases, errors bubble
  - [ ] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID, TypeScript
  - [ ] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [ ] Read `.knowledge-base/technical/standards/backend/logging.md` - Minimal logging only
  - [ ] Read `.knowledge-base/technical/standards/backend/design-pattern-factory.md` - Factory pattern with Map registry
  - [ ] Load skill: `typescript-clean-code`
  - [ ] Load skill: `typescript-unit-testing`

- [ ] **Task 2: Create tool input key constants** (AC: 1, 9)
  - File: `src/tool-loggers/tool-input-keys.ts`
  - Action: Define centralized constants for tool input key names:

    ```typescript
    /**
     * Tool input key names as defined in OpenCode tool parameter schemas.
     * Verified against OpenCode source (packages/opencode/src/tool/*.ts).
     * Update here if OpenCode changes tool parameter names.
     */
    export const TOOL_INPUT_KEYS = {
      FILE_PATH: 'filePath',
      COMMAND: 'command',
      DESCRIPTION: 'description',
      PATTERN: 'pattern',
      INCLUDE: 'include',
      PATH: 'path',
      OLD_STRING: 'oldString',
      NEW_STRING: 'newString',
      OFFSET: 'offset',
      LIMIT: 'limit',
    } as const;

    /**
     * Tool metadata key names available in completed state.
     * Verified against OpenCode source (packages/opencode/src/tool/*.ts).
     */
    export const TOOL_METADATA_KEYS = {
      MATCHES: 'matches',
      COUNT: 'count',
      TRUNCATED: 'truncated',
      EXIT: 'exit',
    } as const;
    ```

  - Notes:
    - Key names verified against OpenCode source code (`packages/opencode/src/tool/*.ts`)
    - Centralizing here means exactly one place to update if OpenCode changes key names
    - `TOOL_METADATA_KEYS` enables loggers to extract pre-computed stats from metadata (grep match count, glob file count, bash exit code)

- [ ] **Task 3: Create tool logger interface** (AC: 1, 2, 10)
  - File: `src/tool-loggers/tool-logger.interface.ts`
  - Action: Define `IToolLogger` interface with two methods:
    - `support(): string` — returns the tool name this logger handles (e.g., `'read'`, `'bash'`) or `'default'` for fallback
    - `formatLog(tool: string, state: ToolState): string` — returns the formatted log string for the given tool state
  - Notes:
    - Import `ToolState` type from `@opencode-ai/sdk`
    - Named export only, no default export
    - The `tool` parameter is passed so the default logger can include the tool name
    - **JSDoc on `formatLog`**: "MUST return a non-empty string for all 4 ToolState variants. MUST NOT include the `[OpenCode]` prefix — the caller adds it."
    - Also export a `countLines(output: string): number` helper function: returns `0` for empty string, otherwise `output.split('\n').length`
    - Also export a `extractStringInput(input: Record<string, unknown>, key: string): string` helper: returns the value if `typeof === 'string'`, otherwise empty string
    - Also export a `extractNumberMetadata(metadata: Record<string, unknown> | undefined, key: string): number | undefined` helper: returns the value if `typeof === 'number'`, otherwise `undefined`

- [ ] **Task 4: Create tool logger factory** (AC: 1, 3, 4, 8)
  - File: `src/tool-loggers/tool-logger.factory.ts`
  - Action: Create `ToolLoggerFactory` class following project's factory pattern standard:
    - Constructor accepts `IToolLogger[]`, builds `Map<string, IToolLogger>` registry
    - Stores default logger separately (exactly one must return `'default'` from `support()`)
    - **Throws `Error` if no default logger found**
    - **Throws `Error` if duplicate `support()` value detected** (e.g., two loggers both return `'read'`)
    - `getLogger(tool: string): IToolLogger` — O(1) Map lookup with default fallback
  - Notes:
    - No `@Injectable()` decorator (not NestJS)
    - No Symbol token (not NestJS)
    - Export class and nothing else from this file

- [ ] **Task 5: Create default tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/default.tool-logger.ts`
  - Action: Create `DefaultToolLogger` implementing `IToolLogger`:
    - `support()` returns `'default'`
    - `formatLog(tool, state)` handles ALL 4 states via switch on `state.status`:
      - `pending`: `"Tool: {tool} - pending"`
      - `running`: `"Tool: {tool} - running"` (append `" - {state.title}"` if `state.title` is present)
      - `completed`: `"Tool: {tool} - completed - {lineCount} lines"` (use `countLines()` helper; if 0 lines: `"Tool: {tool} - completed - empty output"`)
      - `error`: `"Tool: {tool} - error - {truncatedError}"` (truncate `state.error` to 200 chars using `truncateString()`)
      - `default`: exhaustive check — return `"Tool: {tool} - {state.status}"` as safety net
  - Notes:
    - **MUST NOT include `[OpenCode]` prefix** in output
    - This handles all unknown tools with generic formatting
    - Import `truncateString` from `../security.js` — wait, `security.ts` is a leaf node, cannot import FROM it. Instead, inline a simple truncation: `error.length > 200 ? error.substring(0, 200) + '...' : error`

- [ ] **Task 6: Create read tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/read.tool-logger.ts`
  - Action: Create `ReadToolLogger` implementing `IToolLogger`:
    - `support()` returns `'read'`
    - `formatLog(tool, state)` handles ALL 4 states via switch on `state.status`:
      - `pending`: `"Tool: read - pending"`
      - `running`: `"Tool: read - running - {filePath}"` (use `extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH)`)
      - `completed`: `"Tool: read - completed - {filePath} - {lineCount} lines"` (use `countLines()`; if 0: `"empty output"`)
      - `error`: `"Tool: read - error - {filePath} - {truncatedError}"`
      - `default`: exhaustive safety net
  - Notes:
    - `filePath` may be undefined — `extractStringInput` falls back to empty string
    - **MUST NOT include `[OpenCode]` prefix**
    - Import `TOOL_INPUT_KEYS` from `../tool-input-keys.js`

- [ ] **Task 7: Create write tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/write.tool-logger.ts`
  - Action: Create `WriteToolLogger` implementing `IToolLogger`:
    - `support()` returns `'write'`
    - `formatLog(tool, state)` handles ALL 4 states via switch:
      - `pending`: `"Tool: write - pending"`
      - `running`: `"Tool: write - running - {filePath}"`
      - `completed`: `"Tool: write - completed - {filePath}"`
      - `error`: `"Tool: write - error - {filePath} - {truncatedError}"`
      - `default`: exhaustive safety net

- [ ] **Task 8: Create edit tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/edit.tool-logger.ts`
  - Action: Create `EditToolLogger` implementing `IToolLogger`:
    - `support()` returns `'edit'`
    - `formatLog(tool, state)` handles ALL 4 states via switch:
      - `pending`: `"Tool: edit - pending"`
      - `running`: `"Tool: edit - running - {filePath}"`
      - `completed`: `"Tool: edit - completed - {filePath}"`
      - `error`: `"Tool: edit - error - {filePath} - {truncatedError}"`
      - `default`: exhaustive safety net

- [ ] **Task 9: Create bash tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/bash.tool-logger.ts`
  - Action: Create `BashToolLogger` implementing `IToolLogger`:
    - `support()` returns `'bash'`
    - `formatLog(tool, state)` extracts `command` from `state.input` using `extractStringInput()`. Truncate command to 80 chars with `...` suffix if longer:
      ```typescript
      const rawCommand = extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND);
      const command = rawCommand.length > 80 ? rawCommand.substring(0, 80) + '...' : rawCommand;
      ```
    - Handles ALL 4 states via switch:
      - `pending`: `"Tool: bash - pending"`
      - `running`: `"Tool: bash - running - {command}"`
      - `completed`: `"Tool: bash - completed - {command} - {lineCount} lines"` (use `countLines()`; if 0: `"empty output"`). Append `" (exit {exitCode})"` if `extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.EXIT)` is defined and non-zero
      - `error`: `"Tool: bash - error - {command} - {truncatedError}"`
      - `default`: exhaustive safety net
  - Notes: Bash metadata provides `{ output, description, exit? }` — `exit` is the process exit code

- [ ] **Task 10: Create grep tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/grep.tool-logger.ts`
  - Action: Create `GrepToolLogger` implementing `IToolLogger`:
    - `support()` returns `'grep'`
    - `formatLog(tool, state)` extracts `pattern` and `include` from `state.input` using `extractStringInput()` and `TOOL_INPUT_KEYS`:
    - Handles ALL 4 states via switch:
      - `pending`: `"Tool: grep - pending"`
      - `running`: `"Tool: grep - running - {pattern}"` (append `" in {include}"` if include is non-empty)
      - `completed`: Use `extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.MATCHES)` if available → `"Tool: grep - completed - {pattern} - {matches} matches"`. Fall back to `countLines()` → `"{lineCount} lines"` if metadata unavailable
      - `error`: `"Tool: grep - error - {pattern} - {truncatedError}"`
      - `default`: exhaustive safety net
  - Notes: Grep metadata provides `{ matches: number, truncated: boolean }` — `matches` is pre-computed match count, more accurate than line counting

- [ ] **Task 11: Create glob tool logger** (AC: 2, 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/glob.tool-logger.ts`
  - Action: Create `GlobToolLogger` implementing `IToolLogger`:
    - `support()` returns `'glob'`
    - `formatLog(tool, state)` extracts `pattern` from `state.input`:
    - Handles ALL 4 states via switch:
      - `pending`: `"Tool: glob - pending"`
      - `running`: `"Tool: glob - running - {pattern}"`
      - `completed`: Use `extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.COUNT)` if available → `"Tool: glob - completed - {pattern} - {count} files"`. Fall back to `countLines()` → `"{lineCount} lines"` if metadata unavailable
      - `error`: `"Tool: glob - error - {pattern} - {truncatedError}"`
      - `default`: exhaustive safety net
  - Notes: Glob metadata provides `{ count: number, truncated: boolean }` — `count` is pre-computed file count, more accurate than line counting

- [ ] **Task 12: Create index.ts barrel export with reset support** (AC: 1, 8)
  - File: `src/tool-loggers/index.ts`
  - Action: Create barrel file that:
    - Imports all logger implementations
    - Creates `ToolLoggerImpls` array with all loggers (instantiated)
    - Exports factory via getter/reset pattern (matching `getOpenCodeService()` / `resetOpenCodeService()` pattern):

      ```typescript
      let toolLoggerFactoryInstance: ToolLoggerFactory | null = null;

      export function getToolLoggerFactory(): ToolLoggerFactory {
        if (!toolLoggerFactoryInstance) {
          toolLoggerFactoryInstance = new ToolLoggerFactory(ToolLoggerImpls);
        }
        return toolLoggerFactoryInstance;
      }

      export function resetToolLoggerFactory(): void {
        toolLoggerFactoryInstance = null;
      }
      ```

    - Re-exports `IToolLogger` interface and `ToolLoggerFactory` class

- [ ] **Task 13: Integrate factory into OpenCodeService** (AC: 1, 2, 3, 5, 6, 7, 10, 11, 12)
  - File: `src/opencode.ts`
  - Action:
    1. Add import: `import { getToolLoggerFactory } from './tool-loggers/index.js'`
    2. Add import: `import type { ToolState } from '@opencode-ai/sdk'`
    3. **Widen the type cast** in `handleMessagePartUpdated()` for the `state` field. Change from:
       ```typescript
       state?: { status?: string };
       ```
       To:
       ```typescript
       state?: ToolState;
       ```
       This ensures `input`, `output`, `error`, and `time` are available at the type level — no unsafe `as ToolState` cast needed downstream.
    4. Replace the tool logging block:

       ```typescript
       // Before:
       if (part?.type === 'tool' && part.tool && part.state?.status) {
         core.info(`[OpenCode] Tool: ${part.tool} - ${part.state.status}`);
       }

       // After:
       if (part?.type === 'tool' && part.tool && part.state) {
         const logger = getToolLoggerFactory().getLogger(part.tool);
         const message = logger.formatLog(part.tool, part.state);
         if (part.state.status === 'pending') {
           core.debug(`[OpenCode] ${message}`);
         } else if (part.state.status === 'error') {
           core.warning(`[OpenCode] ${message}`);
         } else {
           core.info(`[OpenCode] ${message}`);
         }
       }
       ```

    5. Add timestamp log in `runSession()` after session creation log:
       ```typescript
       core.info(`[OpenCode] Session started at ${new Date().toISOString()}`);
       ```

  - Notes:
    - The guard changes from `part.state?.status` to `part.state` — `ToolState` always has `status`, so checking `part.state` existence is sufficient
    - `pending` → `core.debug()` (reduces log noise — F12)
    - `error` → `core.warning()`
    - `running`/`completed` → `core.info()`

- [ ] **Task 14: Write unit tests for factory** (AC: 3, 4, 8)
  - File: `src/tool-loggers/tool-logger.factory.spec.ts`
  - Action: Test `ToolLoggerFactory`:
    - Initializes Map with tool-specific loggers
    - Stores default logger separately
    - Throws error if no default logger provided
    - **Throws error if duplicate `support()` value detected**
    - Returns correct logger for known tool (O(1) lookup)
    - Returns default logger for unknown tool
    - Returns default logger for empty string tool name

- [ ] **Task 15: Write unit tests for default tool logger** (AC: 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/default.tool-logger.spec.ts`
  - Action: Test `DefaultToolLogger`:
    - `support()` returns `'default'`
    - Formats pending state with tool name
    - Formats running state with tool name
    - **Formats running state with title when title is present**
    - **Formats running state without title when title is absent**
    - Formats completed state with tool name and output line count
    - **Formats completed state with "empty output" when output is empty string**
    - Formats error state with tool name and error message
    - **Formats error state with truncated error when error > 200 chars**
    - **Output never includes `[OpenCode]` prefix**
    - **Output is never empty string**

- [ ] **Task 16: Write unit tests for read tool logger** (AC: 5, 6, 10, 11)
  - File: `src/tool-loggers/impl/read.tool-logger.spec.ts`
  - Action: Test `ReadToolLogger`:
    - `support()` returns `'read'`
    - Formats all 4 states correctly with filePath extraction
    - Formats completed state with filePath and line count
    - **Formats completed state with "empty output" when output is empty**
    - Formats error state with filePath and truncated error cause
    - Handles missing filePath in input gracefully (empty string fallback)
    - **Output never includes `[OpenCode]` prefix**

- [ ] **Task 17: Write unit tests for remaining tool loggers** (AC: 5, 6, 10, 11)
  - Files: `src/tool-loggers/impl/write.tool-logger.spec.ts`, `edit.tool-logger.spec.ts`, `bash.tool-logger.spec.ts`, `grep.tool-logger.spec.ts`, `glob.tool-logger.spec.ts`
  - Action: Test each logger:
    - `support()` returns correct tool name
    - **Formats ALL 4 states correctly** (including pending)
    - Formats each state with tool-specific input extraction
    - Handles missing input fields gracefully
    - **BashToolLogger: truncates command to 80 chars with `...` suffix**
    - **BashToolLogger: does NOT truncate command <= 80 chars**
    - **BashToolLogger: appends `(exit {code})` when exit code is non-zero in metadata**
    - **BashToolLogger: omits exit code when metadata.exit is 0 or undefined**
    - GrepToolLogger: appends `in {include}` when include is present
    - GrepToolLogger: omits include portion when include is absent
    - **GrepToolLogger: uses `metadata.matches` for match count when available**
    - **GrepToolLogger: falls back to `countLines()` when metadata unavailable**
    - **GlobToolLogger: uses `metadata.count` for file count when available**
    - **GlobToolLogger: falls back to `countLines()` when metadata unavailable**
    - **Output never includes `[OpenCode]` prefix**
    - **Error state truncates long error messages**

- [ ] **Task 18: Write integration test for tool logging in OpenCodeService** (AC: 7, 12)
  - File: `src/opencode-session.spec.ts`
  - Action: Add test case(s) in the existing session spec:
    - Emit `message.part.updated` event with `type: 'tool'` part containing full `ToolState` data (running state with input)
    - Verify `core.info()` called with formatted message including tool-specific details (e.g., filePath)
    - Emit tool error event, verify `core.warning()` called with error cause
    - **Emit tool pending event, verify `core.debug()` called (not `core.info()`)**
    - Emit session start, verify timestamp log line present
  - Notes: Use `resetToolLoggerFactory()` in `afterEach` for test isolation

- [ ] **Task 19: Write unit tests for helper functions** (AC: 5)
  - File: `src/tool-loggers/tool-logger.interface.spec.ts`
  - Action: Test `countLines()`, `extractStringInput()`, and `extractNumberMetadata()`:
    - `countLines("")` returns `0`
    - `countLines("single line")` returns `1`
    - `countLines("line1\nline2\nline3")` returns `3`
    - `extractStringInput({ filePath: "./foo.ts" }, "filePath")` returns `"./foo.ts"`
    - `extractStringInput({}, "filePath")` returns `""`
    - `extractStringInput({ filePath: 123 }, "filePath")` returns `""` (not a string)
    - `extractNumberMetadata({ matches: 42 }, "matches")` returns `42`
    - `extractNumberMetadata({}, "matches")` returns `undefined`
    - `extractNumberMetadata(undefined, "matches")` returns `undefined`
    - `extractNumberMetadata({ matches: "not a number" }, "matches")` returns `undefined`

- [ ] **Final Task: Quality Checks**
  - [ ] Run `npm run lint` - Fix any linting issues
  - [ ] Run `npm run format` - Verify code formatting
  - [ ] Run `npm run typecheck` - Ensure type safety

### Acceptance Criteria

- [ ] **AC 1**: Given the factory pattern is implemented, when a new tool type needs logging support, then a developer can add a new logger class in `impl/` and add it to `ToolLoggerImpls` without modifying the factory or `OpenCodeService`
- [ ] **AC 2**: Given a tool event with `status: "running"` and `input: { filePath: "./config.json" }`, when the read tool logger formats the log, then the output is `"Tool: read - running - ./config.json"` (without `[OpenCode]` prefix)
- [ ] **AC 3**: Given no default logger is provided to the factory constructor, when the factory is instantiated, then it throws an Error with message indicating no default logger found
- [ ] **AC 4**: Given a tool name not registered in the factory, when `getLogger()` is called, then the default logger is returned (O(1) fallback)
- [ ] **AC 5**: Given a tool event with `status: "completed"` and `output` containing 250 lines, when the logger formats the log, then the output includes `"250 lines"`. Given empty output, the log includes `"empty output"` (not `"1 lines"`)
- [ ] **AC 6**: Given a tool event with `status: "error"` and `error: "File not found"`, when the logger formats the log, then the output includes `"error - File not found"` and is logged via `core.warning()` (not `core.info()`). Given an error > 200 chars, it is truncated with `...` suffix
- [ ] **AC 7**: Given a session is started via `runSession()`, when the session is created, then a log line with ISO timestamp is emitted (e.g., `"[OpenCode] Session started at 2026-03-10T14:30:00.000Z"`)
- [ ] **AC 8**: Given two loggers return the same value from `support()`, when the factory is instantiated, then it throws an Error indicating duplicate registration
- [ ] **AC 9**: Given the SDK changes a tool input key name, when the developer updates `TOOL_INPUT_KEYS` in `tool-input-keys.ts`, then all loggers automatically use the new key name (single update point)
- [ ] **AC 10**: Given a tool event with `status: "pending"`, when it is processed by `handleMessagePartUpdated`, then it is logged at `core.debug()` level (not `core.info()`)
- [ ] **AC 11**: Given any `IToolLogger.formatLog()` call with any of the 4 `ToolState` variants, when the method returns, then the result is a non-empty string that does NOT contain the `[OpenCode]` prefix
- [ ] **AC 12**: Given tests need to mock the factory, when `resetToolLoggerFactory()` is called in `afterEach`, then the factory instance is cleared and rebuilt on next access

## Additional Context

### Dependencies

- `@opencode-ai/sdk` — `ToolState`, `ToolStatePending`, `ToolStateRunning`, `ToolStateCompleted`, `ToolStateError` types (already installed)
- `@actions/core` — `core.info()`, `core.warning()`, `core.debug()` for logging (already installed)
- No new dependencies required

### Testing Strategy

**Unit Tests (per-class isolation):**

- `tool-logger.factory.spec.ts` — Factory constructor, Map building, default validation, duplicate detection, O(1) lookup, unknown tool fallback
- `tool-logger.interface.spec.ts` — `countLines()` and `extractStringInput()` helpers
- `default.tool-logger.spec.ts` — Default logger formats all 4 states correctly, title handling, empty output, error truncation
- `read.tool-logger.spec.ts` — Read logger extracts filePath, counts output lines, handles missing filePath
- `write.tool-logger.spec.ts` — Write logger extracts filePath, all 4 states
- `edit.tool-logger.spec.ts` — Edit logger extracts filePath, all 4 states
- `bash.tool-logger.spec.ts` — Bash logger extracts command, truncates to 80 chars with `...`, exit code from metadata, all 4 states
- `grep.tool-logger.spec.ts` — Grep logger extracts pattern and optional include, uses metadata.matches for match count, all 4 states
- `glob.tool-logger.spec.ts` — Glob logger extracts pattern, uses metadata.count for file count, all 4 states

**Integration Tests (in existing spec):**

- `opencode-session.spec.ts` — Verify tool events flow through factory and produce correct `core.info()` / `core.warning()` / `core.debug()` calls

**Edge Cases to Test:**

- Missing `input` fields (undefined filePath, undefined command) → empty string fallback
- Empty `output` string on completed state → `"empty output"` (not `"1 lines"`)
- Very long command string (>80 chars) → truncated with `...`
- Very long error string (>200 chars) → truncated with `...`
- Tool name not in registry → default fallback
- Duplicate `support()` values → throws Error
- Non-string input values (e.g., `filePath: 123`) → `extractStringInput` returns empty string
- All loggers return non-empty string for all 4 states
- Grep completed with metadata.matches present → `"42 matches"` instead of line count
- Grep completed without metadata → falls back to line count
- Glob completed with metadata.count present → `"15 files"` instead of line count
- Glob completed without metadata → falls back to line count
- Bash completed with metadata.exit = 1 → appends `"(exit 1)"`
- Bash completed with metadata.exit = 0 or undefined → no exit code shown

### Notes

- **Input key names verified against OpenCode source**: Key names (`filePath`, `command`, `pattern`, `include`, `oldString`, `newString`, etc.) verified against OpenCode tool parameter schemas in `packages/opencode/src/tool/*.ts`. While the `input` field is typed as `Record<string, unknown>` in the SDK, the actual keys are stable Zod schemas in the OpenCode source. Centralized in `TOOL_INPUT_KEYS` for easy updates if OpenCode changes them.
- **Verified tool input schemas** (from OpenCode source `packages/opencode/src/tool/*.ts`):
  - `read`: `{ filePath: string, offset?: number, limit?: number }`
  - `write`: `{ filePath: string, content: string }`
  - `edit`: `{ filePath: string, oldString: string, newString: string, replaceAll?: boolean }`
  - `bash`: `{ command: string, description: string, timeout?: number, workdir?: string }`
  - `grep`: `{ pattern: string, path?: string, include?: string }`
  - `glob`: `{ pattern: string, path?: string }`
- **Verified tool metadata schemas** (from OpenCode source `packages/opencode/src/tool/*.ts`):
  - `read`: `{ preview: string, truncated: boolean, loaded: string[] }`
  - `write`: `{ diagnostics: Record<string, LSPIssue[]>, filepath: string, exists: boolean }`
  - `edit`: `{ diff: string, filediff: FileDiff, diagnostics: Record<string, LSPIssue[]> }`
  - `bash`: `{ output: string, description: string, exit?: number }`
  - `grep`: `{ matches: number, truncated: boolean }`
  - `glob`: `{ count: number, truncated: boolean }`
- **`security.ts` is a leaf node**: Cannot import `truncateString` from `security.ts` into tool loggers (would violate dependency graph). Use inline truncation (`str.substring(0, N) + '...'`) instead.
- **Type widening in `opencode.ts`**: The `state` field in the type cast must be widened from `{ status?: string }` to `ToolState` from the SDK. This eliminates the need for an unsafe `as ToolState` cast downstream and ensures `input`, `output`, `error`, `time` are available at compile time.
- Future tool loggers can be added by: (1) create new class in `impl/`, (2) add to `ToolLoggerImpls` array in `index.ts` — zero changes to factory or OpenCodeService
