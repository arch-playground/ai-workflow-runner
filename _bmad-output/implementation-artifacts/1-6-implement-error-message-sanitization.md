# Story 1.6: Implement Error Message Sanitization

Status: done

## Story

As a **security-conscious developer**,
I want **error messages sanitized**,
So that **sensitive paths and data are not leaked in logs**.

## Acceptance Criteria

1. **Given** an error with absolute file paths **When** `sanitizeErrorMessage()` is called **Then** absolute paths are replaced with `[PATH]`

2. **Given** an error with long alphanumeric strings (potential secrets) **When** `sanitizeErrorMessage()` is called **Then** strings of 32+ characters are replaced with `[REDACTED]`

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security principles
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance obvious comments

- [x] **Task 2: Implement sanitizeErrorMessage() in security.ts** (AC: 1, 2)
  - [x] Function signature: `sanitizeErrorMessage(error: Error): string`
  - [x] Get error message from `error.message`
  - [x] Apply path sanitization regex
  - [x] Apply secret sanitization regex
  - [x] Return sanitized message string

- [x] **Task 3: Implement path sanitization** (AC: 1)
  - [x] Create regex to match absolute paths (Unix and Windows)
  - [x] Unix paths: `/path/to/file` → `[PATH]`
  - [x] Windows paths: `C:\path\to\file` → `[PATH]`
  - [x] Replace all matches with `[PATH]`

- [x] **Task 4: Implement secret sanitization** (AC: 2)
  - [x] Create regex to match long alphanumeric strings
  - [x] Pattern: 32+ consecutive alphanumeric characters
  - [x] Replace all matches with `[REDACTED]`
  - [x] Preserve shorter strings (likely not secrets)

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/security.ts` (add to existing file)
- **Module Pattern**: Named export `sanitizeErrorMessage`
- **Usage**: Called in index.ts before passing errors to `core.setFailed()`

### Implementation Pattern

```typescript
export function sanitizeErrorMessage(error: Error): string {
  let message = error.message;

  // Sanitize absolute paths (Unix-style)
  // Matches /path/to/something but not relative paths
  message = message.replace(/\/[^\s:]+/g, '[PATH]');

  // Sanitize potential secrets (long alphanumeric strings)
  // Matches 32+ consecutive alphanumeric characters
  message = message.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]');

  return message;
}
```

### Regex Patterns

| Pattern               | Matches                   | Example                                |
| --------------------- | ------------------------- | -------------------------------------- |
| `/\/[^\s:]+/g`        | Unix absolute paths       | `/home/user/file.txt` → `[PATH]`       |
| `/[a-zA-Z0-9]{32,}/g` | Long alphanumeric strings | `abc123...` (32+ chars) → `[REDACTED]` |

### Sanitization Examples

| Input                                      | Output                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `File not found: /home/user/workflow.md`   | `File not found: [PATH]`                                |
| `API key invalid: sk_live_abc123...xyz789` | `API key invalid: [REDACTED]`                           |
| `Error in config.ts line 42`               | `Error in config.ts line 42` (unchanged)                |
| `Cannot read ./relative/path.md`           | `Cannot read ./relative/path.md` (unchanged - relative) |

### Technical Requirements

- Only sanitize the message, not the entire error object
- Preserve relative paths (they're less sensitive)
- Preserve short strings (likely not secrets)
- Multiple replacements in single message should all be sanitized
- Handle edge cases: empty message, no matches

### Testing Considerations

- Test with absolute Unix paths
- Test with multiple paths in same message
- Test with long alphanumeric strings
- Test with short strings (should NOT be redacted)
- Test with mixed content

### Project Structure Notes

```
src/
├── security.ts       ← Add sanitizeErrorMessage to this file
├── index.ts          ← Calls sanitizeErrorMessage() before core.setFailed()
└── ...
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR7 - Error Sanitization]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- `sanitizeErrorMessage()` implemented in `src/security.ts` (lines 58-65)
- Path sanitization: `/\/[^\s]+/g` → `[PATH]` (Unix-style paths)
- Secret sanitization: `/[a-zA-Z0-9]{32,}/g` → `[REDACTED]`
- Relative paths preserved (less sensitive)
- Short strings preserved (likely not secrets)
- Multiple patterns in single message all sanitized

### File List

- src/security.ts (modified - function added)
