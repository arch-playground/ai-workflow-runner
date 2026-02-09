# Story 7.4: Implement List Models Feature

Status: done

## Story

As a **GitHub Actions user**,
I want **to see available models**,
So that **I can choose the right model for my workflow**.

## Acceptance Criteria

1. **Given** `list_models` is true **When** action runs **Then** SDK is initialized with provided config/auth **And** available models are queried from SDK **And** models are printed to console in format:

   ```
   === Available Models ===
     - {model_id}: {model_name} ({provider})
   ========================
   ```

   **And** action exits with status 'success' **And** workflow execution is skipped

2. **Given** `list_models` is true but SDK initialization fails **When** action runs **Then** error is logged and action fails

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - NO try-catch in use cases, errors bubble
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID, TypeScript
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Minimal logging only
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern, @golevelup/ts-jest

- [x] **Task 2: Add `listModels()` method to OpenCodeService** (AC: 1, 2)
  - [x] Add public async `listModels()` method to `OpenCodeService` class in `src/opencode.ts`
  - [x] Method must call `this.client.config.providers()` to get providers and models
  - [x] Method returns an array of `{ id: string; name: string; provider: string }` objects
  - [x] Iterate `response.data.providers` array; for each provider, iterate `Object.values(provider.models)` to extract model id, name, and provider name
  - [x] Throw error if client not initialized: `'OpenCode client not initialized - call initialize() first'`
  - [x] Throw error if disposed: `'OpenCode service disposed - cannot list models'`

- [x] **Task 3: Add list models handling in `runWorkflow()`** (AC: 1, 2)
  - [x] In `src/runner.ts`, add early return branch at the top of `runWorkflow()`: `if (inputs.listModels) { return await handleListModels(inputs); }`
  - [x] Place this check BEFORE the `validateWorkflowFile()` call so workflow_path is not required when listing models
  - [x] Create private `handleListModels(inputs: ActionInputs)` function returning `Promise<RunnerResult>`
  - [x] Initialize SDK: `const opencode = getOpenCodeService(); await opencode.initialize({ opencodeConfig: inputs.opencodeConfig, authConfig: inputs.authConfig, model: inputs.model });`
  - [x] Call `opencode.listModels()` to get the model list
  - [x] Print formatted output using `core.info()`:
    ```
    === Available Models ===
      - {model.id}: {model.name} ({model.provider})
    ========================
    ```
  - [x] Return `{ success: true, output: JSON.stringify({ models }) }`
  - [x] On error: return `{ success: false, output: '', error: errorMessage }`

- [x] **Task 4: Write unit tests** (AC: 1, 2)
  - [x] `7.4-UNIT-001`: Verify `runWorkflow()` with `listModels: true` does NOT call `validateWorkflowFile()` or `runSession()` - it skips workflow execution entirely
  - [x] `7.4-UNIT-002`: Verify `listModels()` calls `client.config.providers()` and returns transformed model data
  - [x] `7.4-UNIT-003`: Verify `handleListModels()` prints models in exact format: header, each model line, footer
  - [x] `7.4-UNIT-004`: Verify `handleListModels()` returns `{ success: true, output: ... }` with models JSON
  - [x] `7.4-UNIT-005`: Verify when `initialize()` throws, `handleListModels()` returns `{ success: false, error: ... }` without crashing
  - [x] Place opencode-related tests in `src/opencode.spec.ts` and runner-related tests in `src/runner.spec.ts`

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture & Implementation Guide

**Module Responsibilities:**

- `src/opencode.ts` - Add `listModels()` method (SDK integration, data transformation)
- `src/runner.ts` - Add `handleListModels()` function and branch in `runWorkflow()` (orchestration, output formatting)
- No changes needed to `src/types.ts`, `src/config.ts`, `src/index.ts`, or `action.yml` - all already support `listModels`

**SDK API to Use:** `client.config.providers()` (NOT `client.provider.list()`)

The SDK response structure:

```typescript
// client.config.providers() returns:
{
  data: {
    providers: Array<{
      id: string; // e.g., "anthropic"
      name: string; // e.g., "Anthropic"
      models: {
        [modelKey: string]: {
          id: string; // e.g., "claude-3-opus"
          name: string; // e.g., "Claude 3 Opus"
          providerID: string;
          status: 'alpha' | 'beta' | 'deprecated' | 'active';
          // ... capabilities, cost, limits
        };
      };
    }>;
  }
}
```

**Data Transformation in `listModels()`:**

```typescript
const response = await this.client.config.providers();
const models: Array<{ id: string; name: string; provider: string }> = [];
for (const provider of response.data.providers) {
  for (const model of Object.values(provider.models)) {
    models.push({ id: model.id, name: model.name, provider: provider.name });
  }
}
return models;
```

### Error Handling Pattern

- `listModels()` in opencode.ts: throws on disposed/uninitialized (follows existing pattern from `runSession()`)
- `handleListModels()` in runner.ts: wraps in try/catch, returns `RunnerResult` (follows existing pattern from `runWorkflow()`)
- Error messages: use `sanitizeErrorMessage()` for any errors shown to user
- No try-catch around `listModels()` call itself - let errors from the SDK bubble up to `handleListModels()` catch block

### Testing Patterns (from Stories 7.1-7.3)

**Runner tests (`src/runner.spec.ts`):**

- Mock pattern already established: `jest.mock('./opencode', () => ({ getOpenCodeService: jest.fn(() => mockOpenCodeService), ... }))`
- `mockOpenCodeService` already defined with `initialize`, `runSession`, etc. - add `listModels` to it
- Use `createValidInputs({ listModels: true })` helper for inputs
- No need to create workflow file on disk when `listModels: true`

**OpenCode tests (`src/opencode.spec.ts`):**

- Mock `@opencode-ai/sdk` with `createOpencode` returning mock client
- Add mock for `client.config.providers()` returning provider/model data
- Test the data transformation logic in `listModels()`

### Previous Story Intelligence

**From Story 7.3:**

- SDK API discovery: model is in `Config.model`, not a session param
- Auth credentials go in `Config.provider` object
- Deep merge required for provider keys
- `loadJsonFile()` uses `readFile` with ENOENT catch (not `existsSync`)
- Error messages use `path.basename()` only - no absolute paths
- `initialize()` accepts `InitializeOptions` with `opencodeConfig`, `authConfig`, `model`

**From Story 7.1:**

- `listModels` is a required boolean field (not optional), defaults to `false`
- All mock `ActionInputs` objects must include `listModels: false`
- Jest moduleNameMapper needed for `@actions/core` ESM-only v3

**From Story 7.2:**

- Config paths validated with `validateWorkspacePath()` in `getInputs()` before reaching runner
- Security validation happens at input parsing time, not at SDK initialization time

### Git Intelligence

Recent commits follow pattern: `# Implement 7-X` (e.g., `# Implement 7-3`)

### Project Structure Notes

- All source in `src/` with co-located `*.spec.ts` tests
- ESM imports with `.js` extensions
- Flat module structure
- Named exports preferred

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4] - Acceptance criteria
- [Source: _bmad-output/implementation-artifacts/test-design-epic-7.md] - Test IDs 7.4-UNIT-001 through 7.4-UNIT-005
- [Source: src/opencode.ts] - OpenCodeService class, initialize(), runSession() patterns
- [Source: src/runner.ts] - runWorkflow() function, RunnerResult pattern
- [Source: src/types.ts] - ActionInputs.listModels field
- [Source: _bmad-output/implementation-artifacts/7-3-load-config-files-and-pass-to-sdk.md] - SDK API discoveries
- [Source: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts] - Provider, Model type definitions
- [Source: node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts] - client.config.providers() method

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Added `listModels()` method to `OpenCodeService` that calls `client.config.providers()` and transforms the response into a flat array of `{ id, name, provider }` objects
- Added `handleListModels()` function in runner.ts that initializes the SDK, queries models, prints formatted output via `core.info()`, and returns `RunnerResult`
- Early return branch in `runWorkflow()` placed before `validateWorkflowFile()` so `workflow_path` is not required when listing models
- Error handling uses `sanitizeErrorMessage()` for user-facing error messages
- All 5 required test IDs (7.4-UNIT-001 through 7.4-UNIT-005) implemented plus additional edge case tests
- All 83 tests in opencode.spec.ts and runner.spec.ts pass; full suite (226 unit tests) has zero regressions
- Lint, format, and typecheck all pass (only pre-existing js-yaml type issue in config.spec.ts)

### File List

- `src/opencode.ts` - Added `listModels()` method to OpenCodeService class
- `src/runner.ts` - Added `handleListModels()` function, early return branch in `runWorkflow()`, imported `sanitizeErrorMessage`
- `src/opencode.spec.ts` - Added `listModels()` describe block with 6 tests (7.4-UNIT-002, disposed, uninitialized, empty providers, response.data null, SDK throw), added `config.providers` mock to mockClient
- `src/runner.spec.ts` - Added `listModels` to mockOpenCodeService, added 5 list models tests (7.4-UNIT-001, 003, 004, 005, config pass-through)

### Change Log

- 2026-02-09: Implemented Story 7.4 - List Models Feature. Added `listModels()` to OpenCodeService and `handleListModels()` to runner. 9 new unit tests covering all acceptance criteria.
- 2026-02-09: Code Review (AI) - Added 2 tests: response.data null check and SDK providers() throw. M2 (dispose on error) verified as non-issue - index.ts .finally() handles cleanup. 11 total new tests, 85/85 pass.
