# Story 3.3: Implement Interpreter Availability Check

Status: done

## Story

As a **developer**,
I want **interpreter availability checked**,
So that **clear errors are shown when Python or Node is missing**.

## Acceptance Criteria

1. **Given** python3 or node command
   **When** checkInterpreterAvailable() is called
   **Then** '{command} --version' is executed
   **And** true is returned if exit code is 0

2. **Given** interpreter check hangs
   **When** 5 seconds elapse
   **Then** check times out and returns false
   **And** warning is logged

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Timeout handling
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Warning logging patterns
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - Async test patterns

- [x] Task 2: Add INTERPRETER_CHECK_TIMEOUT_MS constant (AC: 2)
  - [x] Add `INTERPRETER_CHECK_TIMEOUT_MS: 5_000` to `INPUT_LIMITS` in types.ts

- [x] Task 3: Implement checkInterpreterAvailable() function (AC: 1, 2)
  - [x] Create async function that spawns `{command} --version`
  - [x] Use `stdio: 'ignore'` to suppress output
  - [x] Set up 5-second timeout using setTimeout
  - [x] Return true if exit code is 0
  - [x] Return false for any error or timeout

- [x] Task 4: Implement timeout handling with warning (AC: 2)
  - [x] On timeout, log warning with command and timeout duration
  - [x] Kill the child process with SIGTERM
  - [x] Return false after timeout

- [x] Task 5: Handle spawn errors gracefully (AC: 1)
  - [x] Catch 'error' event from spawn (e.g., command not found)
  - [x] Clear timeout on error
  - [x] Return false without throwing

- [x] Task 6: Clear timeout on normal completion (AC: All)
  - [x] Handle 'close' event from child process
  - [x] Clear timeout regardless of exit code
  - [x] Return true only if exit code === 0

- [x] Task 7: Write unit tests (AC: All)
  - [x] Test node --version returns true (node is always available in test env)
  - [x] Test python3 --version returns true (if available)
  - [x] Test nonexistent command returns false
  - [x] Test timeout warning is logged (requires mocking)

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/validation.ts` - `checkInterpreterAvailable()` function (private)
- Constants: `src/types.ts` - `INTERPRETER_CHECK_TIMEOUT_MS` in INPUT_LIMITS
- Unit tests: `src/validation.spec.ts`

### Architecture Compliance

- Private helper function (not exported)
- Returns boolean - never throws
- Logs warning for timeout condition
- Uses spawn with explicit stdio configuration

### Technical Requirements

- 5-second timeout (configured via INPUT_LIMITS constant)
- SIGTERM sent on timeout
- Warning logged with `[Validation]` prefix

### Code Patterns

```typescript
import { INPUT_LIMITS } from './types.js';

async function checkInterpreterAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });

    const timeoutId = setTimeout(() => {
      core.warning(
        `[Validation] Interpreter check for '${command}' timed out after ${INPUT_LIMITS.INTERPRETER_CHECK_TIMEOUT_MS}ms`
      );
      child.kill('SIGTERM');
      resolve(false);
    }, INPUT_LIMITS.INTERPRETER_CHECK_TIMEOUT_MS);

    child.on('error', () => {
      clearTimeout(timeoutId);
      resolve(false);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve(code === 0);
    });
  });
}
```

### Error Message Called When Interpreter Not Found

```typescript
throw new Error(
  `${command} interpreter not found. Ensure ${detection.type === 'python' ? 'Python 3' : 'Node.js'} is installed.`
);
```

### Timeout Constant

```typescript
// In INPUT_LIMITS
INTERPRETER_CHECK_TIMEOUT_MS: 5_000, // 5 seconds
```

### References

- [Source: src/validation.ts#checkInterpreterAvailable] - Implementation
- [Source: src/types.ts#INPUT_LIMITS] - Timeout constant
- [Source: _bmad-output/planning-artifacts/architecture.md#Timeout Architecture] - Interpreter check timeout layer

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- Function implemented at `src/validation.ts:68-90`
- Constant added at `src/types.ts:52`
- Both acceptance criteria verified
- Tests in `src/validation.spec.ts:419-436`

### File List

- `src/types.ts` - Added INTERPRETER_CHECK_TIMEOUT_MS constant
- `src/validation.ts` - Added checkInterpreterAvailable() private function
- `src/validation.spec.ts` - Added interpreter check tests

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- All acceptance criteria implemented and verified
- Timeout handling with warning logging implemented correctly
- Status updated from ready-for-dev to done
