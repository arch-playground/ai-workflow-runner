# Story 7.1: Add Configuration Inputs to Action

Status: done

## Story

As a **GitHub Actions user**,
I want **to specify OpenCode config and auth file paths**,
So that **I can use my own API keys and provider settings**.

## Acceptance Criteria

1. **Given** action.yml file **When** updated **Then** input `opencode_config` is defined as optional string with description "Path to OpenCode config.json file (relative to workspace)"
2. **Given** action.yml file **When** updated **Then** input `auth_config` is defined as optional string with description "Path to OpenCode auth.json file (relative to workspace)"
3. **Given** action.yml file **When** updated **Then** input `model` is defined as optional string with description "Model to use for AI execution (overrides config file)"
4. **Given** action.yml file **When** updated **Then** input `list_models` is defined as optional string with default 'false' and description "If 'true', print available models and exit without running workflow"
5. **Given** no inputs for new fields **When** action runs **Then** inputs default to empty/false and existing behavior is preserved

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `_bmad-output/planning-artifacts/architecture.md` - Module structure and patterns
  - [x] Read `_bmad-output/implementation-artifacts/test-design-epic-7.md` - Test requirements

- [x] **Task 2: Update action.yml with new inputs** (AC: 1, 2, 3, 4)
  - [x] Add `opencode_config` input after `validation_max_retry`
    - required: false
    - default: ''
    - description: 'Path to OpenCode config.json file (relative to workspace). Contains provider and model settings.'
  - [x] Add `auth_config` input
    - required: false
    - default: ''
    - description: 'Path to OpenCode auth.json file (relative to workspace). Contains API keys and authentication. Store in GitHub Secrets, not Variables.'
  - [x] Add `model` input
    - required: false
    - default: ''
    - description: 'Model to use for AI execution (e.g., "anthropic/claude-3-opus"). Overrides config file default.'
  - [x] Add `list_models` input
    - required: false
    - default: 'false'
    - description: 'If "true", print available models and exit without running workflow'

- [x] **Task 3: Update src/types.ts with new ActionInputs fields** (AC: All)
  - [x] Add `opencodeConfig?: string` to ActionInputs interface
  - [x] Add `authConfig?: string` to ActionInputs interface
  - [x] Add `model?: string` to ActionInputs interface
  - [x] Add `listModels: boolean` to ActionInputs interface

- [x] **Task 4: Verify existing tests still pass** (AC: 5)
  - [x] Run `npm run test:unit` to ensure no regressions
  - [x] Run `npm run typecheck` to ensure type safety

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Context

This is the first story of Epic 7: Configuration Customization & Examples. It focuses solely on **defining the new inputs** in action.yml and types.ts. The actual parsing and validation logic will be implemented in Story 7.2, and SDK integration in Story 7.3.

### Architecture Patterns to Follow

**From architecture.md:**

- Use TypeScript strict mode patterns
- Follow naming conventions: `camelCase` for interface properties
- Optional properties use `?` suffix (e.g., `opencodeConfig?: string`)
- Boolean properties have explicit type, not optional (e.g., `listModels: boolean`)

**Existing Pattern Reference:**

```typescript
// Current ActionInputs pattern (from src/types.ts:1-9)
export interface ActionInputs {
  workflowPath: string; // Required
  prompt: string; // Has default
  envVars: Record<string, string>;
  timeoutMs: number;
  validationScript?: string; // Optional
  validationScriptType?: ValidationScriptType; // Optional
  maxValidationRetries: number; // Has default
}
```

**New Fields Pattern:**

```typescript
// Add these to ActionInputs interface
opencodeConfig?: string;   // Optional path to config.json
authConfig?: string;       // Optional path to auth.json
model?: string;            // Optional model override
listModels: boolean;       // Required with default false
```

### action.yml Structure

**Current inputs order (preserve this):**

1. workflow_path (required)
2. prompt
3. env_vars
4. timeout_minutes
5. validation_script
6. validation_script_type
7. validation_max_retry

**Add new inputs in this order:** 8. opencode_config 9. auth_config 10. model 11. list_models

### GitHub Actions Input Notes

- All GitHub Actions inputs are strings by default
- `list_models` will be parsed as boolean in Story 7.2
- Empty string `''` is the idiomatic default for optional string inputs
- Paths are relative to workspace (GITHUB_WORKSPACE)

### Security Considerations (for downstream stories)

**Critical (R-001 from test-design):**

- `auth_config` contains secrets - users MUST store in GitHub Secrets, not Variables
- Path validation will be added in Story 7.2 using existing `validateWorkspacePath()`
- No actual file reading in this story - just input definition

### Files to Modify

| File            | Change Type | Description                                                                          |
| --------------- | ----------- | ------------------------------------------------------------------------------------ |
| `action.yml`    | Edit        | Add 4 new inputs (opencode_config, auth_config, model, list_models)                  |
| `src/types.ts`  | Edit        | Add 4 new fields to ActionInputs interface                                           |
| `src/config.ts` | Edit        | Parse new inputs in getInputs() (scope extension - required to keep code compilable) |

### Scope Extension Note

`src/config.ts` was originally scoped to Story 7.2 but basic input parsing was added here because adding fields to `ActionInputs` without returning them from `getInputs()` would leave the code in a broken state. Story 7.2 handles **validation** (path traversal checks, workspace validation) — the parsing here is minimal (read input, convert to type).

### Files NOT to Modify (Story 7.2+)

- `src/config.ts` - Path validation logic (Story 7.2)
- `src/opencode.ts` - SDK integration (Story 7.3)
- `src/runner.ts` - List models mode (Story 7.4)

### Project Structure Notes

- All changes are in the expected locations per architecture.md
- No new files needed for this story
- Changes are additive - no breaking changes to existing code

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Action Interface]
- [Source: _bmad-output/planning-artifacts/architecture.md#Module Architecture]
- [Source: _bmad-output/implementation-artifacts/test-design-epic-7.md#P2 Tests]
- [Source: action.yml] - Current action definition
- [Source: src/types.ts:1-9] - Current ActionInputs interface

### Test Design References

**From test-design-epic-7.md - P2 Tests for Story 7.1:**

- 7.1-UNIT-001: action.yml defines opencode_config as optional string
- 7.1-UNIT-002: action.yml defines auth_config as optional string
- 7.1-UNIT-003: action.yml defines model as optional string
- 7.1-UNIT-004: action.yml defines list_models as optional boolean

These are schema validation tests that verify the action.yml structure is correct.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

None

### Completion Notes List

✅ Successfully added four new configuration inputs to action.yml:

- `opencode_config` - Path to OpenCode config.json file
- `auth_config` - Path to OpenCode auth.json file
- `model` - Model override parameter
- `list_models` - Boolean flag to list available models

✅ Updated ActionInputs interface in src/types.ts with new fields:

- Added `opencodeConfig?: string`
- Added `authConfig?: string`
- Added `model?: string`
- Added `listModels: boolean`

✅ Updated src/config.ts to parse new inputs from GitHub Actions:

- Parse `opencode_config` and `auth_config` as optional strings
- Parse `model` as optional string
- Parse `list_models` as boolean (converts 'true' string to true)

✅ Fixed Jest configuration to support @actions/core mocking

✅ Updated all test files to include `listModels: false` in mock ActionInputs objects

✅ All quality checks passed:

- npm run lint - PASSED
- npm run format - PASSED
- npm run typecheck - PASSED
- npm run test:unit - PASSED (173/173 tests, 89.49% coverage)

### File List

- action.yml (modified)
- src/types.ts (modified)
- src/config.ts (modified - scope extension, see note above)
- jest.config.js (modified - added @actions/core moduleNameMapper for ESM-only package)
- package.json (modified - fixed test:unit script: --testPathPattern → --testPathPatterns for Jest 30+)
- test/mocks/@actions/core.ts (created - manual mock for ESM-only @actions/core v3)
- src/config.spec.ts (modified - added listModels to test fixtures, added 11 new tests for new fields)
- src/index.spec.ts (modified - added listModels to mock, replaced hardcoded INPUT_LIMITS with requireActual)
- src/runner.spec.ts (modified - added listModels to mock ActionInputs)

## Change Log

- **2026-02-06**: Story 7.1 completed - Added four new configuration inputs (opencode_config, auth_config, model, list_models) to action.yml and updated types.ts, config.ts to support them. Fixed Jest configuration to properly mock @actions/core. All tests pass (173/173) with 89.49% coverage. Ready for review.
- **2026-02-06**: Code review fixes applied - Added 11 unit tests for new getInputs() parsing logic (opencode_config, auth_config, model, list_models). Replaced hardcoded INPUT_LIMITS mock in index.spec.ts with jest.requireActual(). Added explanatory comment for @actions/core moduleNameMapper. Documented scope extension for config.ts. All tests pass (184/184).
