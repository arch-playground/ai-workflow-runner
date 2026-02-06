# Story 7.2: Parse Configuration Inputs

Status: done

## Story

As a **developer**,
I want **new configuration inputs parsed and validated with workspace security checks**,
So that **config paths are validated before use, preventing path traversal attacks on sensitive auth files**.

## Acceptance Criteria

1. **Given** opencode_config input provided **When** getInputs() is called **Then** path is captured in ActionInputs **And** path is validated within workspace using validateWorkspacePath()
2. **Given** opencode_config with path traversal (e.g., `../../../etc/secrets`) **When** getInputs() is called **Then** error is thrown with path escapes message
3. **Given** auth_config input provided **When** getInputs() is called **Then** path is captured in ActionInputs **And** path is validated within workspace using validateWorkspacePath()
4. **Given** auth_config with path traversal **When** getInputs() is called **Then** error is thrown with path escapes message
5. **Given** model input provided **When** getInputs() is called **Then** model string is captured in ActionInputs
6. **Given** list_models is 'true' **When** getInputs() is called **Then** listModels boolean is set to true
7. **Given** no inputs for new fields **When** action runs **Then** inputs default to empty/false and existing behavior is preserved

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - NO try-catch in use cases, errors bubble
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID, TypeScript
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/backend/validation.md` - class-validator with ErrorCode
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern, @golevelup/ts-jest
  - [x] Read `_bmad-output/planning-artifacts/architecture.md` - Module structure and patterns
  - [x] Read `_bmad-output/implementation-artifacts/test-design-epic-7.md` - Test requirements for 7.2

- [x] **Task 2: Add path validation for opencode_config in getInputs()** (AC: 1, 2)
  - [x] Import `validateWorkspacePath` from `./security.js` (already imported via `maskSecrets`)
  - [x] After parsing `opencode_config`, if defined, call `validateWorkspacePath(workspacePath, opencodeConfig)` where `workspacePath` is `process.env.GITHUB_WORKSPACE || process.cwd()`
  - [x] Store the validated absolute path in `opencodeConfig`
  - [x] Ensure path traversal attempts throw with existing security error messages

- [x] **Task 3: Add path validation for auth_config in getInputs()** (AC: 3, 4)
  - [x] After parsing `auth_config`, if defined, call `validateWorkspacePath(workspacePath, authConfig)`
  - [x] Store the validated absolute path in `authConfig`
  - [x] Ensure path traversal attempts throw with existing security error messages

- [x] **Task 4: Verify model and listModels parsing unchanged** (AC: 5, 6, 7)
  - [x] Confirm model parsing is already correct from Story 7.1
  - [x] Confirm listModels boolean parsing is already correct from Story 7.1
  - [x] Confirm defaults work when no new inputs are provided

- [x] **Task 5: Write unit tests for path validation** (AC: 1, 2, 3, 4)
  - [x] Add tests in `src/config.spec.ts`
  - [x] Test: getInputs() validates opencode_config within workspace (7.2-UNIT-002)
  - [x] Test: getInputs() rejects opencode_config with path traversal (7.2-UNIT-003)
  - [x] Test: getInputs() validates auth_config within workspace (7.2-UNIT-005)
  - [x] Test: getInputs() rejects auth_config with path traversal (7.2-UNIT-006)
  - [x] Test: getInputs() captures opencode_config path (7.2-UNIT-001) - already exists, update to verify validated path
  - [x] Test: getInputs() captures auth_config path (7.2-UNIT-004) - already exists, update to verify validated path
  - [x] Test: getInputs() captures model string (7.2-UNIT-007) - already exists
  - [x] Test: getInputs() sets listModels true/false (7.2-UNIT-008, 7.2-UNIT-009) - already exists

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Context

This is Story 7.2 of Epic 7: Configuration Customization & Examples. Story 7.1 already added the input definitions to `action.yml`, the `ActionInputs` fields in `types.ts`, and basic parsing in `config.ts`. This story adds **workspace path validation** for `opencode_config` and `auth_config` paths to prevent path traversal attacks.

### What Story 7.1 Already Implemented

- `action.yml`: Defined inputs `opencode_config`, `auth_config`, `model`, `list_models`
- `src/types.ts`: Added `opencodeConfig?: string`, `authConfig?: string`, `model?: string`, `listModels: boolean` to ActionInputs
- `src/config.ts` lines 149-153: Basic parsing of the four new inputs (reads input, converts to type)
- `src/config.spec.ts`: 11 tests for basic parsing (captures path, returns undefined when empty, model parsing, listModels boolean parsing with case/whitespace handling)
- Jest config updated with `@actions/core` moduleNameMapper
- `test/mocks/@actions/core.ts` created for ESM-only package

### What This Story Adds

The ONLY new code is adding `validateWorkspacePath()` calls for `opencode_config` and `auth_config` paths inside `getInputs()`. This is security-critical per R-001 in the test design.

### Exact Code Change in src/config.ts

**Current code (lines 149-153):**

```typescript
const opencodeConfig = core.getInput('opencode_config') || undefined;
const authConfig = core.getInput('auth_config') || undefined;
const model = core.getInput('model') || undefined;
const listModelsRaw = core.getInput('list_models') || 'false';
const listModels = listModelsRaw.trim().toLowerCase() === 'true';
```

**Required change:** Add workspace path validation after parsing `opencodeConfig` and `authConfig`:

```typescript
const opencodeConfigRaw = core.getInput('opencode_config') || undefined;
const authConfigRaw = core.getInput('auth_config') || undefined;
const model = core.getInput('model') || undefined;
const listModelsRaw = core.getInput('list_models') || 'false';
const listModels = listModelsRaw.trim().toLowerCase() === 'true';

const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
const opencodeConfig = opencodeConfigRaw
  ? validateWorkspacePath(workspacePath, opencodeConfigRaw)
  : undefined;
const authConfig = authConfigRaw ? validateWorkspacePath(workspacePath, authConfigRaw) : undefined;
```

### Import Change Required

`validateWorkspacePath` must be imported from `./security.js`. Check current imports at line 8:

```typescript
import { maskSecrets } from './security.js';
```

Update to:

```typescript
import { maskSecrets, validateWorkspacePath } from './security.js';
```

### Testing Strategy

**Mocking `validateWorkspacePath`:** Since `config.spec.ts` already mocks `@actions/core`, you need to also mock `./security` module to control `validateWorkspacePath` behavior in tests.

**Existing mock pattern in config.spec.ts:**

```typescript
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;
```

**Add security mock:**

```typescript
import { maskSecrets, validateWorkspacePath } from './security';
jest.mock('./security');
const mockValidateWorkspacePath = validateWorkspacePath as jest.MockedFunction<
  typeof validateWorkspacePath
>;
```

**Note:** `maskSecrets` is already called in `getInputs()` - the mock for `./security` will automatically mock it. Ensure `maskSecrets` mock doesn't break existing tests (it should be fine since it returns void).

**Test cases needed:**

| Test ID      | Description                                 | Mock Setup                                        |
| ------------ | ------------------------------------------- | ------------------------------------------------- |
| 7.2-UNIT-002 | validates opencode_config within workspace  | `mockValidateWorkspacePath` returns resolved path |
| 7.2-UNIT-003 | rejects opencode_config with path traversal | `mockValidateWorkspacePath` throws Error          |
| 7.2-UNIT-005 | validates auth_config within workspace      | `mockValidateWorkspacePath` returns resolved path |
| 7.2-UNIT-006 | rejects auth_config with path traversal     | `mockValidateWorkspacePath` throws Error          |

**Existing tests to update:**

- "captures opencode_config path when provided" - update to expect validated/resolved path instead of raw input
- "captures auth_config path when provided" - update to expect validated/resolved path instead of raw input

### Security Considerations (R-001 from test-design)

- `auth_config` contains API keys and secrets - path MUST be validated to prevent workspace escape
- `opencode_config` may contain provider URLs - path MUST also be validated
- Reuse existing `validateWorkspacePath()` from `security.ts` - proven, tested function
- `validateWorkspacePath` already handles: relative paths, `../` traversal, absolute paths, symlink resolution (via `validateRealPath` downstream)
- Error messages from `validateWorkspacePath` are already sanitized

### Files to Modify

| File                 | Change Type | Description                                                                                        |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `src/config.ts`      | Edit        | Add validateWorkspacePath import, add validation calls for opencodeConfig and authConfig           |
| `src/config.spec.ts` | Edit        | Add 4+ new tests for path validation, update 2 existing tests for validated paths, mock ./security |

### Files NOT to Modify

- `src/types.ts` - No changes needed (fields already defined in Story 7.1)
- `src/security.ts` - No changes needed (validateWorkspacePath already exists)
- `action.yml` - No changes needed (inputs already defined in Story 7.1)
- `src/opencode.ts` - Story 7.3 scope
- `src/runner.ts` - Story 7.4 scope

### Project Structure Notes

- All changes are in expected locations per architecture.md
- No new files needed
- Changes are additive to Story 7.1 work
- `config.ts` already imports from `./security.js` (maskSecrets), so adding `validateWorkspacePath` is a natural extension

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2]
- [Source: _bmad-output/planning-artifacts/prd.md#Action Interface]
- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture]
- [Source: _bmad-output/implementation-artifacts/test-design-epic-7.md#P0 Tests]
- [Source: _bmad-output/implementation-artifacts/7-1-add-configuration-inputs-to-action.md]
- [Source: src/config.ts:149-153] - Current parsing code to modify
- [Source: src/config.ts:8] - Current security import to extend
- [Source: src/security.ts:9-26] - validateWorkspacePath function
- [Source: src/config.spec.ts:299-418] - Existing tests for new fields (from Story 7.1)

### Test Design References

**From test-design-epic-7.md - P0 Tests for Story 7.2:**

- 7.2-UNIT-002: getInputs() validates opencode_config within workspace (R-001)
- 7.2-UNIT-003: getInputs() rejects opencode_config with path traversal (R-001)
- 7.2-UNIT-005: getInputs() validates auth_config within workspace (R-001)
- 7.2-UNIT-006: getInputs() rejects auth_config with path traversal (R-001)

**From test-design-epic-7.md - P1 Tests for Story 7.2:**

- 7.2-UNIT-001: getInputs() captures opencode_config path (happy path)
- 7.2-UNIT-004: getInputs() captures auth_config path (happy path)
- 7.2-UNIT-007: getInputs() captures model string (already covered by Story 7.1)
- 7.2-UNIT-008: getInputs() sets listModels true (already covered by Story 7.1)
- 7.2-UNIT-009: getInputs() sets listModels false/empty (already covered by Story 7.1)

### Previous Story Intelligence (Story 7.1)

**Key learnings:**

- Jest configuration required `moduleNameMapper` for `@actions/core` (ESM-only package in v3) - already fixed
- Manual mock created at `test/mocks/@actions/core.ts` - reusable
- All mock ActionInputs objects across test files now include `listModels: false`
- `package.json` test script fixed: `--testPathPattern` changed to `--testPathPatterns` for Jest 30+
- Scope extension was needed: config.ts had to include basic parsing to keep code compilable
- Agent model: claude-sonnet-4-5-20250929
- Final test count: 184/184 passing, 89.49% coverage

**Patterns established:**

- AAA (Arrange-Act-Assert) pattern in all tests
- `mockInputs()` helper for setting up `core.getInput` mock
- `jest.clearAllMocks()` in `beforeEach`

### Git Intelligence

**Recent commit:** `7c4fcee #Implement 7-1`

- Added 4 new inputs to action.yml
- Extended ActionInputs interface in types.ts
- Added basic parsing in config.ts
- Fixed Jest config for @actions/core ESM mocking
- Added 11 new tests in config.spec.ts
- Total: 184 tests, 89.49% coverage

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Mocking `./security` module caused existing `maskSecrets` test to fail (was asserting `core.setSecret` calls). Fixed by updating test to assert `mockMaskSecrets` was called with correct args instead.

### Completion Notes List

- Added `validateWorkspacePath` import to `src/config.ts` alongside existing `maskSecrets` import
- Changed `opencodeConfig` and `authConfig` parsing to use intermediate `Raw` variables, then validate via `validateWorkspacePath()` when defined
- Workspace path derived from `process.env.GITHUB_WORKSPACE || process.cwd()` matching existing pattern in security.ts
- Added `jest.mock('./security')` to config.spec.ts with typed mocks for both `maskSecrets` and `validateWorkspacePath`
- Updated 2 existing tests to expect validated/resolved paths instead of raw input strings
- Added 5 new tests: 7.2-UNIT-002, 7.2-UNIT-003, 7.2-UNIT-005, 7.2-UNIT-006, plus a guard test for empty config not calling validateWorkspacePath
- All 189 tests pass (6 test suites), 0 regressions
- All quality checks pass: lint (0 warnings), format (unchanged), typecheck (clean)

### Change Log

- 2026-02-06: Implemented Story 7.2 - Added workspace path validation for opencode_config and auth_config inputs to prevent path traversal attacks (R-001 mitigation)
- 2026-02-06: Code Review (AI) - Fixed 3 MEDIUM issues: removed duplicate tests, added missing auth_config empty guard test, replaced `expect.any(String)` with specific workspace path values, added GITHUB_WORKSPACE env var test. 50 tests pass, all quality checks clean.

### File List

- `src/config.ts` - Modified: Added `validateWorkspacePath` import, added workspace path validation for `opencodeConfig` and `authConfig`
- `src/config.spec.ts` - Modified: Added `./security` mock, consolidated path validation tests (removed duplicates), added GITHUB_WORKSPACE test, updated workspace path assertions to use specific values
