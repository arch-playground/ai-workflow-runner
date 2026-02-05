# Story 3.1: Parse Validation Inputs

Status: done

## Story

As a **GitHub Actions user**,
I want **validation script configuration parsed**,
So that **I can configure validation behavior**.

## Acceptance Criteria

1. **Given** validation_script input
   **When** getInputs() is called
   **Then** script path or inline code is captured

2. **Given** validation_script_type input
   **When** getInputs() is called
   **Then** type is validated as 'python' or 'javascript'

3. **Given** validation_script_type without validation_script
   **When** getInputs() is called
   **Then** error is thrown 'validation_script_type requires validation_script to be set'

4. **Given** validation_max_retry input
   **When** getInputs() is called
   **Then** value is validated between 1 and 20
   **And** default is 5

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - NO try-catch in use cases, errors bubble
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID, TypeScript
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern, @golevelup/ts-jest

- [x] Task 2: Add validation_script input to ActionInputs interface (AC: 1)
  - [x] Add optional `validationScript?: string` field to `ActionInputs` in `types.ts`

- [x] Task 3: Add validation_script_type to ActionInputs interface (AC: 2)
  - [x] Add optional `validationScriptType?: ValidationScriptType` field
  - [x] Define `ValidationScriptType` = 'python' | 'javascript'

- [x] Task 4: Add validation_max_retry to ActionInputs interface (AC: 3, 4)
  - [x] Add `validationMaxRetry: number` field with default 5
  - [x] Add `MAX_VALIDATION_RETRY` constant (20) to `INPUT_LIMITS`
  - [x] Add `DEFAULT_VALIDATION_RETRY` constant (5) to `INPUT_LIMITS`

- [x] Task 5: Parse validation inputs in getInputs() (AC: 1-4)
  - [x] Read `validation_script` from `core.getInput()`
  - [x] Read `validation_script_type` from `core.getInput()` with trim and validation
  - [x] Read `validation_max_retry` with parseInt and range validation (1-20)
  - [x] Validate that `validation_script_type` requires `validation_script` to be set
  - [x] Add `MAX_INLINE_SCRIPT_SIZE` limit check for validation_script

- [x] Task 6: Write unit tests for validation input parsing (AC: All)
  - [x] Test valid validation_script input is captured
  - [x] Test validation_script_type 'python' and 'javascript' are accepted
  - [x] Test validation_script_type with invalid value throws error
  - [x] Test validation_script_type without validation_script throws error
  - [x] Test validation_max_retry defaults to 5
  - [x] Test validation_max_retry validates range 1-20
  - [x] Test validation_script size limit enforcement

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/config.ts` - Input parsing in `getInputs()` function
- Type definitions: `src/types.ts` - `ActionInputs` interface, `INPUT_LIMITS` constants
- Unit tests: `src/config.spec.ts` - Co-located test file

### Architecture Compliance

- Follow Result Pattern for validation errors
- Use `@actions/core` for input retrieval via `core.getInput()`
- Mask no secrets for validation inputs (script paths are not sensitive)
- Follow naming conventions: camelCase for fields, UPPER_SNAKE_CASE for constants

### Technical Requirements

- TypeScript strict mode enabled
- ESM imports with `.js` extensions
- Validation errors throw immediately (don't use Result pattern for config errors)

### Code Patterns from Existing Implementation

```typescript
// Input retrieval pattern from config.ts
const validationScript = core.getInput('validation_script') || undefined;
const validationScriptTypeRaw = core.getInput('validation_script_type') || undefined;
const validationMaxRetryRaw = core.getInput('validation_max_retry') || '5';

// Type validation pattern
if (validationScriptTypeRaw) {
  const trimmedType = validationScriptTypeRaw.trim();
  if (trimmedType !== 'python' && trimmedType !== 'javascript') {
    throw new Error('validation_script_type must be "python" or "javascript"');
  }
  validationScriptType = trimmedType;
}

// Dependency validation pattern
if (validationScriptType && !validationScript) {
  throw new Error('validation_script_type requires validation_script to be set');
}
```

### INPUT_LIMITS Constants Required

```typescript
MAX_VALIDATION_RETRY: 20,
DEFAULT_VALIDATION_RETRY: 5,
MAX_INLINE_SCRIPT_SIZE: 102_400, // 100KB
```

### References

- [Source: src/config.ts#getInputs] - Main input parsing function
- [Source: src/types.ts#ActionInputs] - Input interface definition
- [Source: src/types.ts#INPUT_LIMITS] - Size limits and constants
- [Source: _bmad-output/planning-artifacts/architecture.md#Configuration Strategy] - Input validation approach

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- All acceptance criteria verified against implementation in `src/config.ts:93-127`
- Unit tests verified in `src/config.spec.ts:350-496`
- Type definitions verified in `src/types.ts:6-8, 49-55, 58`

### File List

- `src/types.ts` - Added ValidationScriptType, updated ActionInputs, added INPUT_LIMITS constants
- `src/config.ts` - Added validation input parsing in getInputs()
- `src/config.spec.ts` - Added unit tests for validation input parsing

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- All acceptance criteria implemented and verified
- Unit test coverage adequate
- Status updated from ready-for-dev to done
