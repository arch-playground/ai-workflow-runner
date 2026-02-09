# Story 7.3: Load Config Files and Pass to SDK

Status: done

## Story

As a **developer**,
I want **config and auth files loaded and passed to the OpenCode SDK**,
So that **users can customize provider settings, authentication, and model selection**.

## Acceptance Criteria

1. **Given** `opencodeConfig` path provided in ActionInputs, **When** `OpenCodeService.initialize()` is called, **Then** the config file is read and parsed as JSON, and passed as `config` in `createOpencode()` ServerOptions.

2. **Given** `authConfig` path provided in ActionInputs, **When** `OpenCodeService.initialize()` is called, **Then** the auth file is read and parsed as JSON, and its contents are merged into the config object's `provider` section before passing to `createOpencode()`.

3. **Given** `model` input provided in ActionInputs, **When** `OpenCodeService.initialize()` is called, **Then** `model` is set in the config object (`config.model`) passed to `createOpencode()`.

4. **Given** config file path does not exist, **When** `initialize()` is called, **Then** error is thrown: `'Config file not found: {basename}'`.

5. **Given** auth file path does not exist, **When** `initialize()` is called, **Then** error is thrown: `'Auth file not found: {basename}'`.

6. **Given** config file contains invalid JSON, **When** `initialize()` is called, **Then** error is thrown: `'Invalid JSON in config file: {basename}'`.

7. **Given** auth file contains invalid JSON, **When** `initialize()` is called, **Then** error is thrown: `'Invalid JSON in auth file: {basename}'`.

8. **Given** neither `opencodeConfig` nor `authConfig` nor `model` is provided, **When** `initialize()` is called, **Then** `createOpencode()` is called without a `config` option (current behavior preserved).

9. **Given** error messages from config loading, **Then** absolute paths are never exposed (use `path.basename()` only).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md`
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md`
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md`
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md`
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md`
  - [x] Load `typescript-unit-testing` skill before writing tests

- [x] **Task 2: Update `OpenCodeService.initialize()` signature** (AC: 1, 2, 3, 8)
  - [x] Add optional `config` parameter to `initialize()`: `initialize(options?: { opencodeConfig?: string; authConfig?: string; model?: string })`
  - [x] This parameter carries the **resolved file paths** (already validated by config.ts in Story 7.2)

- [x] **Task 3: Implement config file loading** (AC: 1, 4, 6, 9)
  - [x] Add private method `loadJsonFile(filePath: string, label: string): Promise<Record<string, unknown>>`
  - [x] Check file existence with `fs.existsSync()` — throw `'{Label} file not found: {basename}'` if missing
  - [x] Read file with `fs.promises.readFile(filePath, 'utf-8')`
  - [x] Parse JSON with `JSON.parse()` — wrap in try-catch, throw `'Invalid JSON in {label} file: {basename}'`
  - [x] Use `path.basename()` in all error messages (AC 9)

- [x] **Task 4: Build SDK config and pass to `createOpencode()`** (AC: 1, 2, 3, 8)
  - [x] If `opencodeConfig` path provided: load JSON via `loadJsonFile()`, use as base config
  - [x] If `authConfig` path provided: load JSON via `loadJsonFile()`, merge into config (spread into config object — the auth.json contains provider auth that maps directly to `Config.provider` entries)
  - [x] If `model` provided: set `config.model = model`
  - [x] Pass assembled config to `createOpencode({ hostname, port, config })` via `ServerOptions.config`
  - [x] If none provided: call `createOpencode({ hostname, port })` without config (preserves current behavior)

- [x] **Task 5: Update `runner.ts` to pass config options through** (AC: 1, 2, 3)
  - [x] In `runWorkflow()`, pass `inputs.opencodeConfig`, `inputs.authConfig`, `inputs.model` to `opencode.initialize()`
  - [x] Update the call site: `await opencode.initialize({ opencodeConfig: inputs.opencodeConfig, authConfig: inputs.authConfig, model: inputs.model })`

- [x] **Task 6: Write unit tests for config loading** (AC: 1-9)
  - [x] 7.3-UNIT-001: `initialize()` reads opencode_config file as JSON
  - [x] 7.3-UNIT-002: `initialize()` passes config to `createOpencode()` options
  - [x] 7.3-UNIT-003: `initialize()` reads auth_config file as JSON
  - [x] 7.3-UNIT-004: `initialize()` passes auth to `createOpencode()` options (merged into config)
  - [x] 7.3-UNIT-005: `initialize()` sets `config.model` when model input provided
  - [x] 7.3-UNIT-006: `initialize()` throws `'Config file not found: {basename}'` for missing file
  - [x] 7.3-UNIT-007: `initialize()` throws `'Auth file not found: {basename}'` for missing file
  - [x] 7.3-UNIT-008: `initialize()` throws `'Invalid JSON in config file: {basename}'`
  - [x] 7.3-UNIT-009: `initialize()` throws `'Invalid JSON in auth file: {basename}'`
  - [x] 7.3-UNIT-010: Error messages contain only basename, not absolute paths
  - [x] 7.3-UNIT-011: `initialize()` without any config options calls `createOpencode()` without config (backward compat)
  - [x] 7.3-UNIT-012: `initialize()` with model only sets `config.model` without loading files
  - [x] 7.3-UNIT-013: `initialize()` with all three options (config + auth + model) merges correctly

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety (pre-existing js-yaml type error only)

## Dev Notes

### SDK API Reality (CRITICAL - differs from epics assumptions)

The OpenCode SDK API (`@opencode-ai/sdk@^1.1.53`) works differently than the epics document assumed:

**`createOpencode()` signature:**

```typescript
function createOpencode(options?: ServerOptions): Promise<{ client; server }>;

type ServerOptions = {
  hostname?: string;
  port?: number;
  signal?: AbortSignal;
  timeout?: number;
  config?: Config; // <-- Config goes HERE
};
```

**Model is NOT passed at session creation.** The Session.create() API only accepts `title`, `directory`, `parentID`, and `permission`. Model must be set in `Config.model` before SDK initialization.

**Auth is part of Config.** There is no separate auth parameter. Provider credentials go into:

```typescript
config.provider = {
  anthropic: { options: { apiKey: 'sk-...' } },
  copilot: { options: { apiKey: '...' } },
};
```

**Therefore:** Both config.json and auth.json content should be merged into a single `Config` object passed to `createOpencode()`.

### Config Merging Strategy

```typescript
// Pseudo-code for config assembly
let sdkConfig: Record<string, unknown> = {};

if (opencodeConfig) {
  sdkConfig = await loadJsonFile(opencodeConfig, 'config');
}
if (authConfig) {
  const authData = await loadJsonFile(authConfig, 'auth');
  sdkConfig = { ...sdkConfig, ...authData };
}
if (model) {
  sdkConfig.model = model;
}

// Pass to SDK
await createOpencode({ hostname: '127.0.0.1', port: 0, config: sdkConfig });
```

**Model override precedence:** If both config.json contains a `model` field AND the `model` input is provided, the input takes precedence (applied last via spread).

### Files to Modify

| File                   | Change                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/opencode.ts`      | Add `loadJsonFile()` helper, update `initialize()` to accept and process config options, pass `config` to `createOpencode()` |
| `src/runner.ts`        | Pass `inputs.opencodeConfig`, `inputs.authConfig`, `inputs.model` to `opencode.initialize()`                                 |
| `src/opencode.spec.ts` | Add 13 new unit tests for config loading scenarios                                                                           |

### Files NOT to Modify

| File            | Reason                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| `src/types.ts`  | Already has `opencodeConfig`, `authConfig`, `model`, `listModels` fields (Story 7.1) |
| `src/config.ts` | Already parses and validates these inputs (Story 7.1 + 7.2)                          |
| `action.yml`    | Already has the input definitions (Story 7.1)                                        |

### Existing Patterns to Follow

- **Singleton pattern:** `OpenCodeService` is a singleton via `getOpenCodeService()` — maintain this
- **Error handling:** Throw errors for config loading failures (they are unexpected failures, not expected results). The entry point in `index.ts` catches these.
- **Logging prefix:** Use `[OpenCode]` prefix for all logs in `opencode.ts`
- **Import style:** ESM with `.js` extensions: `import { something } from './types.js'`
- **File I/O:** Use `fs.existsSync()` for existence check, `fs.promises.readFile()` for async read
- **Error sanitization:** Use `path.basename()` in error messages, never expose absolute paths

### Previous Story Intelligence

**Story 7-1 (Done):**

- Added `opencodeConfig`, `authConfig`, `model`, `listModels` to `ActionInputs` interface
- Added inputs to `action.yml`
- Extended `getInputs()` to parse new inputs
- Fixed Jest config for `@actions/core` ESM mocking
- Agent: claude-sonnet-4-5, 184 tests passing

**Story 7-2 (Done):**

- Added `validateWorkspacePath()` calls for `opencodeConfig` and `authConfig` in `getInputs()`
- Paths are validated BEFORE they reach `OpenCodeService.initialize()`
- Agent: claude-opus-4-6, 189 tests passing

### Testing Approach

- Mock `fs.existsSync` and `fs.promises.readFile` for file I/O
- Assert `createOpencode()` mock receives correct `config` in its options
- Use `path.basename()` assertions on error messages
- Follow AAA (Arrange-Act-Assert) pattern per project standards
- Test IDs reference test-design-epic-7.md (7.3-UNIT-001 through 7.3-UNIT-013)

### Anti-Patterns to Avoid

- Do NOT pass model at session creation (SDK doesn't support it)
- Do NOT create a separate "auth" parameter for `createOpencode()` (it doesn't exist)
- Do NOT log config file contents (may contain secrets)
- Do NOT use `require()` for JSON loading (use `fs.readFile` + `JSON.parse`)
- Do NOT modify `process.env` with config values
- Do NOT add try-catch in runner.ts — errors from `initialize()` should bubble up to `index.ts`

### Project Structure Notes

- All source in `src/` flat structure — no subdirectories
- Unit tests co-located: `src/opencode.spec.ts`
- SDK mock at `test/mocks/@opencode-ai/sdk.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Configuration Strategy]
- [Source: _bmad-output/implementation-artifacts/test-design-epic-7.md]
- [Source: node_modules/@opencode-ai/sdk/dist/v2/server.d.ts - ServerOptions type]
- [Source: node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts - Config type]
- [Source: node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts - Session.create() API]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

None required - implementation was clean with no debugging needed.

### Completion Notes List

- Added `InitializeOptions` interface and updated `initialize()` to accept optional config options
- Implemented `loadJsonFile()` private method for reading and parsing JSON config/auth files with proper error handling (ENOENT catch, JSON parse validation, basename-only error messages)
- Implemented `buildSdkConfig()` private method that assembles the SDK config object by deep-merging config file, auth file, and model input with correct precedence (model input overrides config file's model)
- Added `mergeConfigs()` private method for one-level deep merge of object keys (preserves overlapping provider entries)
- Updated `runner.ts` to explicitly call `opencode.initialize()` with config options before `runSession()`
- Added 14 unit tests (7.3-UNIT-001 through 7.3-UNIT-014) covering all 9 acceptance criteria plus deep merge
- Added 3 runner tests for config pass-through verification
- All 219 unit/integration tests pass across 8 test suites (42 opencode tests, 28 runner tests, rest unchanged)
- Lint, format, and typecheck all pass clean (only pre-existing js-yaml type error)

### File List

- `src/opencode.ts` - Added `InitializeOptions` interface, `fs`/`path` imports, `loadJsonFile()`, `buildSdkConfig()`, `mergeConfigs()`, updated `initialize()` and `doInitialize()` signatures, removed redundant `initialize()` call from `runSession()`
- `src/runner.ts` - Added explicit `opencode.initialize()` call with config options in `runWorkflow()`
- `src/opencode.spec.ts` - Added `fs` mock setup, `mockReadFile` reference, 14 config loading unit tests
- `src/runner.spec.ts` - Added 3 tests for config options pass-through and initialize error handling

### Change Log

- 2026-02-06: Implemented story 7-3 - config file loading and SDK config assembly with 13 unit tests
- 2026-02-06: Code review fixes (claude-opus-4-6) - H1: removed redundant initialize() in runSession(), H2: added 3 runner config pass-through tests, H3: replaced shallow spread with deep merge for provider keys (added mergeConfigs + UNIT-014), M1: restored accidentally deleted UPPERCASE.PY fixture, M2: replaced existsSync TOCTOU with async readFile ENOENT catch
