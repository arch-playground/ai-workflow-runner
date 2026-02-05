# Story 1.7: Implement Basic Workflow File Reading

Status: done

## Story

As a **GitHub Actions user**,
I want **the runner to read and validate workflow files**,
So that **I get clear errors for missing or invalid files**.

## Acceptance Criteria

1. **Given** a valid workflow path **When** `runWorkflow()` is called **Then** the file is read and validated for UTF-8 encoding

2. **Given** a non-existent workflow file **When** `runWorkflow()` is called **Then** error is returned with 'Workflow file not found: {path}'

3. **Given** a workflow file with invalid UTF-8 **When** `runWorkflow()` is called **Then** error is returned with 'File is not valid UTF-8'

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Result pattern for expected failures
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance obvious comments

- [x] **Task 2: Create src/runner.ts file** (AC: All)
  - [x] Create file at `src/runner.ts`
  - [x] Import required modules (fs, path, core)
  - [x] Import types from `./types.js`
  - [x] Import security functions from `./security.js`

- [x] **Task 3: Implement validateWorkflowFile() helper** (AC: 1, 2, 3)
  - [x] Accept `inputs: ActionInputs` and `workspace: string` parameters
  - [x] Call `validateWorkspacePath()` for path traversal check
  - [x] Check file exists using `fs.existsSync()`
  - [x] Check file is actually a file (not directory) using `fs.statSync()`
  - [x] Check file size <= 10MB
  - [x] Call `validateRealPath()` for symlink check
  - [x] Read file content using `fs.readFileSync()`
  - [x] Call `validateUtf8()` for encoding check
  - [x] Return validation result with path or error

- [x] **Task 4: Implement runWorkflow() function** (AC: 1, 2, 3)
  - [x] Function signature: `runWorkflow(inputs: ActionInputs, timeoutMs?: number, abortSignal?: AbortSignal): Promise<RunnerResult>`
  - [x] Get workspace from `GITHUB_WORKSPACE` env var
  - [x] Call `validateWorkflowFile()` for validation
  - [x] Return `RunnerResult` with success: false for validation errors
  - [x] Read and return file content for valid files
  - [x] Log progress using `core.info()`

- [x] **Task 5: Implement prompt composition** (AC: 1)
  - [x] Combine workflow content with user prompt
  - [x] Format: `{workflowContent}\n\n---\n\nUser Input:\n{userPrompt}`
  - [x] If no user prompt, use workflow content only

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/runner.ts`
- **Module Pattern**: Named exports (`runWorkflow`, `validateWorkflowFile`)
- **Error Handling**: Return `RunnerResult` for expected failures (file not found, invalid encoding)

### Import Pattern (ESM)

```typescript
// Node.js built-in modules
import * as fs from 'fs';
import * as path from 'path';

// External packages
import * as core from '@actions/core';

// Local modules (with .js extension for ESM)
import { ActionInputs, RunnerResult, INPUT_LIMITS } from './types.js';
import { validateWorkspacePath, validateRealPath, validateUtf8 } from './security.js';
```

### Result Pattern for Expected Failures

```typescript
// File not found - expected failure, return Result
if (!fs.existsSync(absolutePath)) {
  return {
    success: false,
    output: '',
    error: `Workflow file not found: ${inputs.workflowPath}`,
  };
}

// Successful read
return {
  success: true,
  output: JSON.stringify({ content: fileContent }),
};
```

### Validation Order (Defense in Depth)

```
1. validateWorkspacePath() → Blocks traversal, absolute paths
2. fs.existsSync() → Checks file exists
3. fs.statSync().isFile() → Ensures it's a file
4. Check file size <= 10MB
5. validateRealPath() → Blocks symlink escapes
6. fs.readFileSync() → Read content
7. validateUtf8() → Validate encoding
```

### Error Messages

| Condition      | Error Message                                 |
| -------------- | --------------------------------------------- |
| File not found | `Workflow file not found: {workflowPath}`     |
| Not a file     | `Workflow path is not a file: {workflowPath}` |
| File too large | `Workflow file exceeds 10MB limit`            |
| Invalid UTF-8  | `File is not valid UTF-8: {filename}`         |

### Technical Requirements

- Use `GITHUB_WORKSPACE` environment variable for workspace path
- File size check before reading (prevent memory issues)
- Use `validateUtf8()` from security.ts (uses TextDecoder with fatal: true)
- Return only filename in error messages (not full path) for security

### Project Structure Notes

```
src/
├── types.ts          ← Import types
├── security.ts       ← Import validation functions
├── runner.ts         ← This story creates this file
├── opencode.ts       ← Will be called by runner.ts (Epic 2)
└── validation.ts     ← Will be called by runner.ts (Epic 3)
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Error Handling Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- Created `src/runner.ts` with `runWorkflow()` and `validateWorkflowFile()` functions
- Defense in depth validation: path traversal → file exists → is file → size limit → symlink check → UTF-8 check
- Returns `RunnerResult` with success/error for expected failures
- Prompt composition: `{workflowContent}\n\n---\n\nUser Input:\n{userPrompt}`
- Integrates with OpenCode service and validation loop
- Output truncation at 900KB with `...[truncated]` suffix
- Abort signal support for cancellation
- Error handling for timeout and cancellation cases

### File List

- src/runner.ts (created)
