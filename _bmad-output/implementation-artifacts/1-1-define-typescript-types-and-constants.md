# Story 1.1: Define TypeScript Types and Constants

Status: done

## Story

As a **developer**,
I want **well-defined TypeScript types and constants**,
So that **the codebase has type safety and consistent limits**.

## Acceptance Criteria

1. **Given** a new TypeScript project **When** types.ts is created **Then** it defines `ActionInputs` interface with workflowPath, prompt, envVars, timeoutMs, validationScript, validationScriptType, validationMaxRetry

2. **Given** types.ts exists **When** reviewed **Then** it defines `RunnerResult` interface with success, output, error, exitCode

3. **Given** types.ts exists **When** reviewed **Then** it defines `ActionStatus` type as `'success' | 'failure' | 'cancelled' | 'timeout'`

4. **Given** types.ts exists **When** reviewed **Then** it defines `INPUT_LIMITS` constant with MAX_WORKFLOW_PATH_LENGTH (1024), MAX_PROMPT_LENGTH (100KB), MAX_ENV_VARS_SIZE (64KB), MAX_ENV_VARS_COUNT (100), MAX_OUTPUT_SIZE (900KB)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions, SOLID principles
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Create src/types.ts file** (AC: 1, 2, 3, 4)
  - [x] Create the file at `src/types.ts`
  - [x] Add file header with brief description

- [x] **Task 3: Define ActionInputs interface** (AC: 1)
  - [x] Define `workflowPath: string` - Path to workflow file
  - [x] Define `prompt: string` - User input prompt
  - [x] Define `envVars: Record<string, string>` - Environment variables map
  - [x] Define `timeoutMs: number` - Execution timeout in milliseconds
  - [x] Define `validationScript?: string` - Optional validation script
  - [x] Define `validationScriptType?: ValidationScriptType` - Script type
  - [x] Define `validationMaxRetry: number` - Max retry attempts

- [x] **Task 4: Define additional interfaces** (AC: 2)
  - [x] Define `OpenCodeSession` interface with sessionId, lastMessage
  - [x] Define `ValidationOutput` interface with success, continueMessage
  - [x] Define `RunnerResult` interface with success, output, error?, exitCode?
  - [x] Define `ValidationResult` interface with valid, errors[]

- [x] **Task 5: Define type aliases** (AC: 3)
  - [x] Define `ActionStatus = 'success' | 'failure' | 'cancelled' | 'timeout'`
  - [x] Define `ValidationScriptType = 'python' | 'javascript'`

- [x] **Task 6: Define INPUT_LIMITS constant** (AC: 4)
  - [x] `MAX_WORKFLOW_PATH_LENGTH: 1024`
  - [x] `MAX_PROMPT_LENGTH: 100_000` (100KB)
  - [x] `MAX_ENV_VARS_SIZE: 65_536` (64KB)
  - [x] `MAX_ENV_VARS_COUNT: 100`
  - [x] `MAX_OUTPUT_SIZE: 900_000` (900KB)
  - [x] `MAX_WORKFLOW_FILE_SIZE: 10_485_760` (10MB)
  - [x] `DEFAULT_TIMEOUT_MINUTES: 30`
  - [x] `MAX_TIMEOUT_MINUTES: 360` (6 hours)
  - [x] `MAX_VALIDATION_RETRY: 20`
  - [x] `DEFAULT_VALIDATION_RETRY: 5`
  - [x] `VALIDATION_SCRIPT_TIMEOUT_MS: 60_000`
  - [x] `INTERPRETER_CHECK_TIMEOUT_MS: 5_000`
  - [x] `MAX_VALIDATION_OUTPUT_SIZE: 102_400` (100KB)
  - [x] `MAX_LAST_MESSAGE_SIZE: 102_400` (100KB)
  - [x] `MAX_INLINE_SCRIPT_SIZE: 102_400` (100KB)

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/types.ts` - Single file for all type definitions (per architecture.md)
- **Module Pattern**: Named exports only, no default exports
- **No Dependencies**: types.ts should have zero imports (pure type definitions)

### Naming Conventions

| Element      | Convention       | Example                                |
| ------------ | ---------------- | -------------------------------------- |
| Interfaces   | PascalCase       | `ActionInputs`, `RunnerResult`         |
| Type aliases | PascalCase       | `ActionStatus`, `ValidationScriptType` |
| Constants    | UPPER_SNAKE_CASE | `INPUT_LIMITS`, `MAX_TIMEOUT_MINUTES`  |

### Technical Requirements

- TypeScript strict mode enabled
- Use `as const` for INPUT_LIMITS to ensure literal types
- Export all types and interfaces for use by other modules
- Use numeric separators for readability (e.g., `100_000` instead of `100000`)

### Project Structure Notes

```
src/
├── types.ts          ← This story creates this file
├── config.ts         ← Will import from types.ts
├── security.ts       ← Will import from types.ts
├── runner.ts         ← Will import from types.ts
├── opencode.ts       ← Will import from types.ts
├── validation.ts     ← Will import from types.ts
└── index.ts          ← Will import from types.ts
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Module Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- All TypeScript types and interfaces implemented in `src/types.ts`
- ActionInputs interface includes all required fields
- RunnerResult interface with success, output, error?, exitCode?
- ActionStatus type alias for workflow states
- INPUT_LIMITS constant with all size and count limits using numeric separators
- Additional types: OpenCodeSession, ValidationOutput, ActionOutputs, ValidationResult, ValidationScriptType
- Uses `as const` for INPUT_LIMITS to ensure literal types

### File List

- src/types.ts (created)
