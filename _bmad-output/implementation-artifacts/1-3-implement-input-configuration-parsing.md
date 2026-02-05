# Story 1.3: Implement Input Configuration Parsing

Status: done

## Story

As a **developer**,
I want **robust input parsing with validation**,
So that **invalid inputs are rejected early with clear error messages**.

## Acceptance Criteria

1. **Given** action inputs are provided **When** `getInputs()` is called **Then** workflow_path is parsed as required string

2. **Given** action inputs **When** `getInputs()` is called **Then** prompt is parsed with empty string default

3. **Given** action inputs **When** `getInputs()` is called **Then** env_vars is parsed as JSON object with validation

4. **Given** action inputs **When** `getInputs()` is called **Then** timeout_minutes is parsed and converted to milliseconds

5. **Given** action inputs **When** `getInputs()` is called **Then** all env_var values are masked as secrets before any logging

6. **Given** env_vars contains invalid JSON **When** `getInputs()` is called **Then** error is thrown with message 'env_vars must be a valid JSON object'

7. **Given** env_vars exceeds 64KB **When** `getInputs()` is called **Then** error is thrown with size limit message

8. **Given** env*vars contains reserved key (PATH, NODE_OPTIONS, GITHUB*\*) **When** `getInputs()` is called **Then** error is thrown indicating reserved variable cannot be overridden

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance obvious comments
  - [x] Read `.knowledge-base/technical/standards/backend/validation.md` - Validation patterns

- [x] **Task 2: Create src/config.ts file** (AC: All)
  - [x] Create file at `src/config.ts`
  - [x] Import `@actions/core` for GitHub Actions integration
  - [x] Import types from `./types.js`
  - [x] Import `maskSecrets` from `./security.js`

- [x] **Task 3: Implement getInputs() function** (AC: 1, 2, 3, 4, 5)
  - [x] Parse `workflow_path` using `core.getInput('workflow_path', { required: true })`
  - [x] Parse `prompt` using `core.getInput('prompt')` with empty string default
  - [x] Parse `env_vars` JSON string and validate structure
  - [x] Parse `timeout_minutes` and convert to milliseconds
  - [x] Parse `validation_script`, `validation_script_type`, `validation_max_retry`
  - [x] Call `maskSecrets(envVars)` before any logging

- [x] **Task 4: Implement env_vars validation** (AC: 3, 6, 7, 8)
  - [x] Validate JSON format (catch parse errors)
  - [x] Validate size limit (64KB max)
  - [x] Validate entry count (100 max)
  - [x] Validate all values are strings
  - [x] Validate no empty keys
  - [x] Validate key format: `[a-zA-Z_][a-zA-Z0-9_]*`
  - [x] Block reserved variables (case-insensitive):
    - PATH, LD_PRELOAD, LD_LIBRARY_PATH, NODE_OPTIONS
    - PYTHONPATH, JAVA_TOOL_OPTIONS, JAVA_HOME
    - Any key starting with GITHUB\_

- [x] **Task 5: Implement timeout validation** (AC: 4)
  - [x] Validate timeout is positive integer
  - [x] Validate timeout <= 360 minutes
  - [x] Default to 30 minutes if not provided
  - [x] Convert minutes to milliseconds

- [x] **Task 6: Implement validation script parsing** (AC: All)
  - [x] Parse `validation_script` (optional)
  - [x] Parse `validation_script_type` (must be 'python' or 'javascript')
  - [x] Validate that `validation_script_type` requires `validation_script`
  - [x] Parse `validation_max_retry` (default 5, range 1-20)

- [x] **Task 7: Implement validateInputs() function** (AC: All)
  - [x] Validate workflow_path is non-empty
  - [x] Validate workflow_path length <= 1024
  - [x] Validate prompt length <= 100KB
  - [x] Return `ValidationResult` with valid flag and errors array

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/config.ts`
- **Module Pattern**: Named exports (`getInputs`, `validateInputs`)
- **Error Handling**: Throw errors for invalid inputs (not Result pattern - these are validation errors)

### Import Pattern (ESM)

```typescript
// Node.js built-in - none needed

// External packages
import * as core from '@actions/core';

// Local modules (with .js extension for ESM)
import { ActionInputs, INPUT_LIMITS, ValidationResult } from './types.js';
import { maskSecrets } from './security.js';
```

### Reserved Environment Variables (Block List)

```typescript
const RESERVED_VARS = [
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'JAVA_TOOL_OPTIONS',
  'JAVA_HOME',
];
// Also block any key starting with 'GITHUB_' (case-insensitive)
```

### Error Message Format

```typescript
// Clear, actionable error messages
'env_vars must be a valid JSON object';
'env_vars exceeds maximum size of 64KB';
'env_vars exceeds maximum of 100 entries';
'env_var key "{key}" contains invalid characters';
'Cannot override reserved environment variable: {key}';
'validation_script_type must be "python" or "javascript"';
'validation_script_type requires validation_script to be set';
```

### Technical Requirements

- All env_var values MUST be masked via `core.setSecret()` before ANY logging
- JSON parsing errors should be caught and re-thrown with clear message
- Size calculations use `Buffer.byteLength(JSON.stringify(envVars))`
- Key validation pattern: `/^[a-zA-Z_][a-zA-Z0-9_]*$/`

### Project Structure Notes

```
src/
├── types.ts          ← Import types from here
├── config.ts         ← This story creates this file
├── security.ts       ← Import maskSecrets from here
└── ...
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Error Handling Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- Implemented `getInputs()` function with comprehensive input parsing
- All env_vars validation: JSON format, size limits, entry count, key format, reserved vars
- Timeout validation with conversion to milliseconds
- Validation script parsing with type checking
- `maskSecrets()` called before any logging
- Implemented `validateInputs()` returning ValidationResult
- Reserved vars blocked case-insensitively: PATH, LD*PRELOAD, LD_LIBRARY_PATH, NODE_OPTIONS, PYTHONPATH, JAVA_TOOL_OPTIONS, JAVA_HOME, GITHUB*\*

### File List

- src/config.ts (created)
