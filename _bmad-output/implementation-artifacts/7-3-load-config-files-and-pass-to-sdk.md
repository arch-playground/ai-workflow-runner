# Story 7.3: Load Config Files and Pass to SDK

Status: done

## Story

As a **developer**,
I want **config and auth files loaded and passed to the OpenCode SDK**,
So that **users can customize provider settings, authentication, and model selection**.

## Acceptance Criteria

1. **Given** `opencodeConfig` path provided in ActionInputs, **When** `OpenCodeService.initialize()` is called, **Then** the config file is read and parsed as JSON, and passed as `config` in `createOpencode()` ServerOptions.

2. **Given** `authConfig` path provided in ActionInputs, **When** `OpenCodeService.initialize()` is called, **Then** the auth file is read and parsed as JSON, and each provider entry is passed to `client.auth.set()` API after SDK initialization (auth is applied post-init, not merged into config).

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
  - [x] If `authConfig` path provided: load JSON via `loadJsonFile()`, apply via `client.auth.set()` per provider entry AFTER `createOpencode()` completes (auth requires a running client)
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
  - [x] 7.3-UNIT-004: `initialize()` calls `client.auth.set()` for each provider in auth_config
  - [x] 7.3-UNIT-005: `initialize()` sets `config.model` when model input provided
  - [x] 7.3-UNIT-006: `initialize()` throws `'Config file not found: {basename}'` for missing file
  - [x] 7.3-UNIT-007: `initialize()` throws `'Auth file not found: {basename}'` for missing file
  - [x] 7.3-UNIT-008: `initialize()` throws `'Invalid JSON in config file: {basename}'`
  - [x] 7.3-UNIT-009: `initialize()` throws `'Invalid JSON in auth file: {basename}'`
  - [x] 7.3-UNIT-010: Error messages contain only basename, not absolute paths
  - [x] 7.3-UNIT-011: `initialize()` without any config options calls `createOpencode()` without config (backward compat)
  - [x] 7.3-UNIT-012: `initialize()` with model only sets `config.model` without loading files
  - [x] 7.3-UNIT-013: `initialize()` with all three options passes config+model to createOpencode and auth via auth.set()
  - [x] 7.3-UNIT-014: `initialize()` calls auth.set() for each provider in auth_config (multiple providers)
  - [x] 7.3-UNIT-015: `initialize()` re-throws non-ENOENT filesystem errors
  - [x] 7.3-UNIT-016: invalid JSON error messages use basename only
  - [x] 7.3-UNIT-017: handles non-object JSON values in config file
  - [x] 7.3-UNIT-018: auth.set() error throws with provider name

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

**Auth is NOT part of Config.** The SDK `Config` type has no auth/provider field. Auth must be set via the `client.auth.set()` REST API endpoint per provider, after the SDK server is running.

```typescript
// Auth is applied AFTER createOpencode() via client API
await client.auth.set({
  path: { id: 'anthropic' },
  body: { type: 'api', key: 'sk-...' },
});
```

**Therefore:** Config and auth are handled separately — config goes to `createOpencode()`, auth is applied post-init via `client.auth.set()`.

### Auth Strategy

```typescript
// Pseudo-code for config + auth assembly
let sdkConfig: Record<string, unknown> = {};

if (opencodeConfig) {
  sdkConfig = await loadJsonFile(opencodeConfig, 'config');
}
if (model) {
  sdkConfig.model = model;
}

// Pass config to SDK (no auth here)
const { client } = await createOpencode({ hostname: '127.0.0.1', port: 0, config: sdkConfig });

// Apply auth AFTER server starts (requires running client)
if (authConfig) {
  const authData = await loadJsonFile(authConfig, 'auth');
  for (const [providerId, credentials] of Object.entries(authData)) {
    await client.auth.set({ path: { id: providerId }, body: credentials });
  }
}
```

**Model override precedence:** If both config.json contains a `model` field AND the `model` input is provided, the input takes precedence (applied last).

### Files to Modify

| File                           | Change                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/opencode.ts`              | Add `loadJsonFile()`, `buildSdkConfig()`, `applyAuth()` methods; update `initialize()` to accept config options, apply auth via `client.auth.set()` post-init |
| `src/runner.ts`                | Pass `inputs.opencodeConfig`, `inputs.authConfig`, `inputs.model` to `opencode.initialize()`                                                                  |
| `src/opencode-config.spec.ts`  | 18 unit tests for config loading scenarios (7.3-UNIT-001 through 7.3-UNIT-018)                                                                                |
| `src/opencode-test-helpers.ts` | Shared mock factories for `MockClient` (with `auth.set`), `MockServer`, `EventControl`                                                                        |

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
- Implemented `buildSdkConfig()` private method that assembles SDK config from opencodeConfig file + model input (no auth — auth is separate)
- Implemented `applyAuth()` private method that calls `client.auth.set()` per provider entry after SDK initialization
- Removed `mergeConfigs()` — auth is no longer merged into config object (SDK Config type has no auth field)
- Auth applied AFTER `createOpencode()` since it requires a running client instance
- Updated `runner.ts` to explicitly call `opencode.initialize()` with config options before `runSession()`
- Config tests extracted to `src/opencode-config.spec.ts` with shared helpers in `src/opencode-test-helpers.ts`
- Added 18 unit tests (7.3-UNIT-001 through 7.3-UNIT-018) covering all 9 acceptance criteria plus auth.set() error handling
- Added 3 runner tests for config pass-through verification
- Lint, format, and typecheck all pass clean

### File List

- `src/opencode.ts` - Added `InitializeOptions` interface, `fs`/`path` imports, `loadJsonFile()`, `buildSdkConfig()`, `applyAuth()` (replaced `mergeConfigs()`), updated `initialize()` and `doInitialize()` signatures
- `src/runner.ts` - Added explicit `opencode.initialize()` call with config options in `runWorkflow()`
- `src/opencode-config.spec.ts` - 18 config loading unit tests (extracted from opencode.spec.ts for separation of concerns)
- `src/opencode-test-helpers.ts` - Shared mock factories: `MockClient` (with `auth.set`), `MockServer`, `EventControl`, `createEventGenerator()`
- `src/runner.spec.ts` - Added 3 tests for config options pass-through and initialize error handling

### Change Log

- 2026-02-06: Implemented story 7-3 - config file loading and SDK config assembly with 13 unit tests
- 2026-02-06: Code review fixes (claude-opus-4-6) - H1: removed redundant initialize() in runSession(), H2: added 3 runner config pass-through tests, H3: replaced shallow spread with deep merge for provider keys (added mergeConfigs + UNIT-014), M1: restored accidentally deleted UPPERCASE.PY fixture, M2: replaced existsSync TOCTOU with async readFile ENOENT catch
- 2026-03-10: Correct-course alignment — Refactored auth from config merge to `client.auth.set()` API per provider (SDK Config type has no auth field). Removed `mergeConfigs()`, added `applyAuth()`. Tests extracted to `opencode-config.spec.ts` with shared helpers. 18 total unit tests (UNIT-001 through UNIT-018).
