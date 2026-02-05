# Story 1.5: Implement Secret Masking

Status: done

## Story

As a **security-conscious developer**,
I want **all environment variable values masked**,
So that **secrets are not exposed in GitHub Actions logs**.

## Acceptance Criteria

1. **Given** env_vars with multiple key-value pairs **When** `maskSecrets()` is called **Then** `core.setSecret()` is called for each non-empty value

2. **Given** env_vars with empty string values **When** `maskSecrets()` is called **Then** empty string values are skipped (not masked)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security principles
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance obvious comments

- [x] **Task 2: Implement maskSecrets() in security.ts** (AC: 1, 2)
  - [x] Function signature: `maskSecrets(envVars: Record<string, string>): void`
  - [x] Iterate over all entries using `Object.values()` or `Object.entries()`
  - [x] For each value, check if non-empty string
  - [x] Call `core.setSecret(value)` for non-empty values
  - [x] Skip empty strings (they can't be secrets)

- [x] **Task 3: Ensure integration with config.ts** (AC: 1, 2)
  - [x] Verify `maskSecrets` is exported from security.ts
  - [x] Verify `config.ts` imports and calls `maskSecrets(envVars)` before any logging
  - [x] Verify masking happens BEFORE `core.info()` or any other logging

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/security.ts` (add to existing file from Story 1.4)
- **Module Pattern**: Named export `maskSecrets`
- **Security Principle**: Mask BEFORE any logging - defense in depth

### Implementation Pattern

```typescript
export function maskSecrets(envVars: Record<string, string>): void {
  for (const value of Object.values(envVars)) {
    if (value) {
      // Skip empty strings
      core.setSecret(value);
    }
  }
}
```

### Critical Security Rule

```
TIMELINE OF OPERATIONS:

1. Parse env_vars from input
2. ✓ IMMEDIATELY call maskSecrets(envVars)
3. Then proceed with any logging
4. Then proceed with validation

NEVER log anything that might contain env_var values before masking!
```

### Technical Requirements

- `core.setSecret()` redacts the value from all GitHub Actions logs
- Empty strings should NOT be masked (no security value, wastes API calls)
- Function should be idempotent (safe to call multiple times)
- No return value needed (void function)

### Testing Considerations

- Mock `core.setSecret` to verify it's called with correct values
- Test with multiple values → verify all are masked
- Test with empty values → verify they're skipped
- Test with empty object → verify no errors

### Project Structure Notes

```
src/
├── security.ts       ← Add maskSecrets to this file (from Story 1.4)
├── config.ts         ← Calls maskSecrets() after parsing env_vars
└── ...
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR5 - Secret Masking]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- `maskSecrets()` implemented in `src/security.ts` (lines 47-53)
- Uses `Object.values()` to iterate env var values
- Calls `core.setSecret(value)` for non-empty strings
- Empty strings skipped (length check: `value && value.length > 0`)
- Integrated with `config.ts` - called at line 91 before any logging
- Function is idempotent and has void return type

### File List

- src/security.ts (modified - function added)
