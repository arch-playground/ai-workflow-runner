# Story 1.4: Implement Path Security Validation

Status: done

## Story

As a **security-conscious developer**,
I want **path traversal prevention**,
So that **workflow files outside the workspace cannot be accessed**.

## Acceptance Criteria

1. **Given** a relative workflow path within workspace **When** `validateWorkspacePath()` is called **Then** the resolved absolute path is returned

2. **Given** a path containing '../' traversal **When** `validateWorkspacePath()` is called **Then** error is thrown with 'path escapes workspace' message

3. **Given** an absolute path **When** `validateWorkspacePath()` is called **Then** error is thrown indicating absolute paths not allowed

4. **Given** a symlink pointing outside workspace **When** `validateRealPath()` is called **Then** error is thrown with 'symlink target escapes workspace' message

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security principles
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance obvious comments

- [x] **Task 2: Create src/security.ts file** (AC: All)
  - [x] Create file at `src/security.ts`
  - [x] Import `@actions/core` for setSecret
  - [x] Import `path` and `fs` Node.js modules

- [x] **Task 3: Implement validateWorkspacePath()** (AC: 1, 2, 3)
  - [x] Accept `workspacePath: string` and `relativePath: string` parameters
  - [x] Check if path is absolute → throw error
  - [x] Normalize path using `path.normalize()`
  - [x] Check for parent directory references (`..`) → throw error
  - [x] Resolve full path using `path.resolve(workspacePath, relativePath)`
  - [x] Verify resolved path starts with workspace path
  - [x] Return resolved absolute path

- [x] **Task 4: Implement validateRealPath()** (AC: 4)
  - [x] Accept `workspacePath: string` and `filePath: string` parameters
  - [x] Use `fs.realpathSync()` to resolve symlinks
  - [x] Verify real path is within workspace
  - [x] Throw error if symlink target escapes workspace
  - [x] Return validated real path
  - [x] Note: Call AFTER file existence is confirmed

- [x] **Task 5: Implement maskSecrets()** (AC: N/A - supporting function)
  - [x] Accept `envVars: Record<string, string>` parameter
  - [x] Iterate all values and call `core.setSecret()` for non-empty values
  - [x] Skip empty string values

- [x] **Task 6: Implement sanitizeErrorMessage()** (AC: N/A - supporting function)
  - [x] Accept `error: Error` parameter
  - [x] Replace absolute paths with `[PATH]`
  - [x] Replace long alphanumeric strings (32+ chars) with `[REDACTED]`
  - [x] Return sanitized string

- [x] **Task 7: Implement validateUtf8()** (AC: N/A - supporting function)
  - [x] Accept `buffer: Buffer` and `filePath: string` parameters
  - [x] Use `TextDecoder` with `{ fatal: true }` option
  - [x] Throw error for invalid UTF-8 byte sequences
  - [x] Return decoded string if valid

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/security.ts`
- **Module Pattern**: Named exports for all functions
- **Security Layer**: Defense in depth - multiple validation layers

### Import Pattern (ESM)

```typescript
// Node.js built-in modules
import * as fs from 'fs';
import * as path from 'path';

// External packages
import * as core from '@actions/core';
```

### Security Validation Layers

```
Input → validateWorkspacePath() → File exists? → validateRealPath() → Read file
         ↓                                        ↓
    Blocks:                                  Blocks:
    - Absolute paths                         - Symlinks escaping workspace
    - Path traversal (../)
    - Paths outside workspace
```

### Error Messages (Sanitized)

```typescript
// Clear but safe error messages
'Invalid workflow path: path must be relative';
'Invalid workflow path: path escapes workspace boundary';
'Invalid workflow path: symlink target escapes workspace';
'File is not valid UTF-8: {filename}'; // Only filename, not full path
```

### Technical Requirements

- Use `path.normalize()` to handle `./`, `//`, etc.
- Use `path.isAbsolute()` to detect absolute paths
- Use `fs.realpathSync()` for symlink resolution (only after file exists)
- Regex for path sanitization: `/\/[^\s\/]+/g` → `[PATH]`
- Regex for secret sanitization: `/[a-zA-Z0-9]{32,}/g` → `[REDACTED]`

### Path Validation Examples

| Input                  | Workspace    | Result                         |
| ---------------------- | ------------ | ------------------------------ |
| `workflow.md`          | `/workspace` | `/workspace/workflow.md` ✓     |
| `./workflow.md`        | `/workspace` | `/workspace/workflow.md` ✓     |
| `dir/workflow.md`      | `/workspace` | `/workspace/dir/workflow.md` ✓ |
| `../workflow.md`       | `/workspace` | Error: escapes workspace       |
| `/etc/passwd`          | `/workspace` | Error: absolute path           |
| `dir/../../etc/passwd` | `/workspace` | Error: escapes workspace       |

### Project Structure Notes

```
src/
├── types.ts          ← No dependency
├── config.ts         ← Imports maskSecrets from security.ts
├── security.ts       ← This story creates this file
├── runner.ts         ← Imports path validation functions
└── validation.ts     ← Imports path validation functions
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture]
- [Source: _bmad-output/planning-artifacts/prd.md#Security Requirements]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- Created `src/security.ts` with all security functions
- `validateWorkspacePath()`: Blocks absolute paths and `..` traversal, returns resolved absolute path
- `validateRealPath()`: Uses `fs.realpathSync()` to detect symlinks escaping workspace
- `maskSecrets()`: Masks env var values using `core.setSecret()`
- `sanitizeErrorMessage()`: Removes absolute paths and long alphanumeric strings from errors
- `validateUtf8()`: Uses TextDecoder with fatal:true for strict UTF-8 validation
- Defense in depth: multiple validation layers for path security

### File List

- src/security.ts (created)
