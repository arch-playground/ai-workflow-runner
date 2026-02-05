# Story 3.2: Implement Script Type Detection

Status: done

## Story

As a **developer**,
I want **script type auto-detected**,
So that **users don't need to specify type for file-based scripts**.

## Acceptance Criteria

1. **Given** script ending with '.py' (case-insensitive)
   **When** detectScriptType() is called
   **Then** type 'python' is returned with isInline=false

2. **Given** script ending with '.js' (case-insensitive)
   **When** detectScriptType() is called
   **Then** type 'javascript' is returned with isInline=false

3. **Given** script starting with 'python:'
   **When** detectScriptType() is called
   **Then** type 'python' is returned with code after prefix and isInline=true

4. **Given** script starting with 'javascript:' or 'js:'
   **When** detectScriptType() is called
   **Then** type 'javascript' is returned with code after prefix and isInline=true

5. **Given** empty code after prefix (e.g., 'python:')
   **When** detectScriptType() is called
   **Then** error is thrown 'Empty inline script'

6. **Given** unsupported extension (.sh, .bash, .ts)
   **When** detectScriptType() is called
   **Then** clear error is thrown with supported alternatives

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Errors thrown immediately for validation
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming, SOLID, TypeScript
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern

- [x] Task 2: Create ScriptDetectionResult interface (AC: All)
  - [x] Define interface with `type: ValidationScriptType`, `code: string`, `isInline: boolean`

- [x] Task 3: Implement file extension detection (AC: 1, 2)
  - [x] Check for `.py` extension (case-insensitive) → return python, isInline=false
  - [x] Check for `.js` extension (case-insensitive) → return javascript, isInline=false

- [x] Task 4: Implement unsupported extension rejection (AC: 6)
  - [x] Check for `.sh` and `.bash` extensions → throw clear error with alternatives
  - [x] Check for `.ts` extension → throw error suggesting JavaScript or compile TypeScript

- [x] Task 5: Implement inline script prefix detection (AC: 3, 4)
  - [x] Check for `python:` prefix (case-insensitive) → extract code, return python, isInline=true
  - [x] Check for `javascript:` prefix (case-insensitive) → extract code, return javascript, isInline=true
  - [x] Check for `js:` prefix (case-insensitive) → extract code, return javascript, isInline=true

- [x] Task 6: Implement empty inline script validation (AC: 5)
  - [x] After extracting code from prefix, trim whitespace
  - [x] If code is empty after trim, throw 'Empty inline script' error

- [x] Task 7: Implement fallback to provided type (AC: All)
  - [x] If no extension or prefix matches and `providedType` is given, use it with isInline=true
  - [x] If nothing matches and no providedType, throw error with detection options

- [x] Task 8: Write comprehensive unit tests (AC: All)
  - [x] Test .py → python detection
  - [x] Test .js → javascript detection
  - [x] Test .PY and .JS case-insensitivity
  - [x] Test python: prefix extraction
  - [x] Test javascript: and js: prefix extraction
  - [x] Test PYTHON: case-insensitivity
  - [x] Test empty code after prefix throws error
  - [x] Test whitespace-only after prefix throws error
  - [x] Test .sh and .bash rejection with helpful message
  - [x] Test .ts rejection with helpful message
  - [x] Test providedType fallback works
  - [x] Test no match throws helpful error

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/validation.ts` - `detectScriptType()` function
- Unit tests: `src/validation.spec.ts` - Co-located test file

### Architecture Compliance

- Pure function with no side effects
- Throws errors for invalid inputs (not Result pattern - this is validation)
- Clear, actionable error messages for users

### Technical Requirements

- Case-insensitive extension and prefix matching
- Trim whitespace from extracted inline code
- Provide helpful error messages with alternatives

### Code Patterns

```typescript
export interface ScriptDetectionResult {
  type: ValidationScriptType;
  code: string;
  isInline: boolean;
}

export function detectScriptType(
  script: string,
  providedType?: ValidationScriptType
): ScriptDetectionResult {
  const lowerScript = script.toLowerCase();

  // Check unsupported extensions first
  if (lowerScript.endsWith('.sh') || lowerScript.endsWith('.bash')) {
    throw new Error('Shell scripts (.sh, .bash) are not supported...');
  }

  // Check file extensions
  if (lowerScript.endsWith('.py')) return { type: 'python', code: script, isInline: false };
  if (lowerScript.endsWith('.js')) return { type: 'javascript', code: script, isInline: false };

  // Check inline prefixes
  if (lowerScript.startsWith('python:')) {
    const code = script.slice(7).trim();
    if (!code) throw new Error('Empty inline script: python: prefix provided with no code');
    return { type: 'python', code, isInline: true };
  }
  // ... similar for javascript: and js:
}
```

### Error Message Patterns

```typescript
// Unsupported shell
'Shell scripts (.sh, .bash) are not supported. Use Python (.py) or JavaScript (.js) for validation scripts.';

// Unsupported TypeScript
'TypeScript (.ts) is not directly supported. Use JavaScript (.js) or compile TypeScript to JavaScript first.';

// Empty inline script
'Empty inline script: python: prefix provided with no code';

// Cannot determine
'Cannot determine script type. Use file extension (.py/.js), prefix (python:/javascript:), or set validation_script_type.';
```

### References

- [Source: src/validation.ts#detectScriptType] - Implementation
- [Source: src/validation.spec.ts#detectScriptType] - Unit tests
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] - Requirements

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- Function implemented at `src/validation.ts:25-66`
- All 6 acceptance criteria verified
- 15 unit tests covering all cases in `src/validation.spec.ts:24-119`

### File List

- `src/validation.ts` - Added detectScriptType() function and ScriptDetectionResult interface
- `src/validation.spec.ts` - Added comprehensive tests for script type detection

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- All acceptance criteria implemented and verified
- Unit test coverage comprehensive (15 tests)
- Status updated from ready-for-dev to done
