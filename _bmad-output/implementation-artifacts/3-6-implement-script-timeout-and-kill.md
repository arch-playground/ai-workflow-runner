# Story 3.6: Implement Script Timeout and Kill

Status: done

## Story

As a **developer**,
I want **hung scripts killed**,
So that **workflows don't hang indefinitely**.

## Acceptance Criteria

1. **Given** script execution
   **When** 60 seconds elapse without completion
   **Then** SIGTERM is sent

2. **Given** SIGTERM sent but process not exited
   **When** 5 more seconds elapse
   **Then** SIGKILL is sent
   **And** warning is logged

3. **Given** abort signal triggered
   **When** script is running
   **Then** script is killed
   **And** error is thrown 'Validation script aborted'

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Timeout patterns
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Warning logging
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - Async timeout tests

- [x] Task 2: Add timeout constants (AC: 1, 2)
  - [x] Add `VALIDATION_SCRIPT_TIMEOUT_MS: 60_000` to INPUT_LIMITS
  - [x] SIGKILL escalation delay is 5 seconds (hardcoded, not configurable)

- [x] Task 3: Implement script timeout (AC: 1)
  - [x] Set up setTimeout with VALIDATION_SCRIPT_TIMEOUT_MS
  - [x] On timeout, mark as killed and send SIGTERM
  - [x] Log warning about timeout

- [x] Task 4: Implement SIGKILL escalation (AC: 2)
  - [x] After SIGTERM, set 5-second escalation timeout
  - [x] Track if process has exited with processExited flag
  - [x] If not exited after 5s, send SIGKILL
  - [x] Log warning about escalation

- [x] Task 5: Implement abort signal handling (AC: 3)
  - [x] Add abort signal listener with `{ once: true }`
  - [x] On abort, mark as killed and send SIGTERM
  - [x] Clear main timeout on abort
  - [x] Reject with 'Validation script aborted' error

- [x] Task 6: Implement proper timeout cleanup (AC: All)
  - [x] Clear main timeout on process close
  - [x] Clear SIGKILL timeout on process close
  - [x] Clear timeouts on error event

- [x] Task 7: Handle timeout output (AC: 1)
  - [x] If timed out (not aborted), resolve with captured output or timeout message
  - [x] If aborted, reject with abort error

- [x] Task 8: Write unit tests (AC: All)
  - [x] Test abort signal kills running script
  - [x] Test abort throws 'Validation script aborted'
  - [x] Test timeout behavior (with mocked short timeout if possible)
  - [x] Test SIGKILL warning is logged when needed

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/validation.ts` - `runScript()` private function
- Constants: `src/types.ts` - `VALIDATION_SCRIPT_TIMEOUT_MS`
- Unit tests: `src/validation.spec.ts`

### Architecture Compliance

- SIGTERM → SIGKILL escalation pattern
- Proper timeout cleanup in all code paths
- AbortSignal integration for graceful shutdown

### Technical Requirements

- 60-second timeout for validation scripts
- 5-second grace period before SIGKILL
- AbortSignal listener with `{ once: true }` to prevent memory leaks

### Code Patterns

```typescript
function runScript(
  command: string,
  scriptPath: string,
  lastMessage: string,
  envVars: Record<string, string>,
  abortSignal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [scriptPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let killed = false;
    let sigkillTimeoutId: NodeJS.Timeout | null = null;
    let processExited = false;

    // Main timeout (60 seconds)
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');

      // SIGKILL escalation (5 seconds)
      sigkillTimeoutId = setTimeout(() => {
        if (!processExited) {
          core.warning('[Validation] Process did not respond to SIGTERM, sending SIGKILL');
          child.kill('SIGKILL');
        }
      }, 5000);
    }, INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS);

    // Abort signal handler
    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          killed = true;
          clearTimeout(timeoutId);
          child.kill('SIGTERM');
        },
        { once: true }
      );
    }

    child.on('close', (code) => {
      processExited = true;
      clearTimeout(timeoutId);
      if (sigkillTimeoutId) clearTimeout(sigkillTimeoutId);

      if (killed && !abortSignal?.aborted) {
        // Timeout - resolve with captured output
        resolve(stdout || `Script timed out after ${INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS}ms`);
      } else if (abortSignal?.aborted) {
        // Aborted - reject with error
        reject(new Error('Validation script aborted'));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        resolve(stdout || stderr || `Script failed with exit code ${code}`);
      }
    });
  });
}
```

### Timeout Warning Messages

```typescript
// Timeout occurred
core.warning(`[Validation] Script timed out after ${INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS}ms`);

// SIGKILL escalation
core.warning('[Validation] Process did not respond to SIGTERM, sending SIGKILL');
```

### Timeout Constant

```typescript
// In INPUT_LIMITS
VALIDATION_SCRIPT_TIMEOUT_MS: 60_000, // 60 seconds
```

### References

- [Source: src/validation.ts#runScript] - Implementation
- [Source: src/types.ts#INPUT_LIMITS] - Timeout constant
- [Source: _bmad-output/planning-artifacts/architecture.md#Timeout Architecture] - Validation script timeout layer
- [Source: _bmad-output/planning-artifacts/architecture.md#Child Process Pattern] - SIGTERM→SIGKILL pattern

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- Constant added at `src/types.ts:51`
- Timeout logic implemented at `src/validation.ts:174-194`
- SIGKILL escalation implemented at `src/validation.ts:177-182`
- Abort handling implemented at `src/validation.ts:185-194`
- All 3 acceptance criteria verified
- Tests in `src/validation.spec.ts:321-365, 438-475`

### File List

- `src/types.ts` - Added VALIDATION_SCRIPT_TIMEOUT_MS constant
- `src/validation.ts` - Added timeout and SIGKILL escalation in runScript()
- `src/validation.spec.ts` - Added timeout behavior tests

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- All acceptance criteria implemented and verified
- SIGTERM → SIGKILL escalation pattern correctly implemented
- Status updated from ready-for-dev to done
