# Story 3.8: Implement Validation Retry Loop

Status: done

## Story

As a **GitHub Actions user**,
I want **validation to retry on failure**,
So that **AI can fix issues based on feedback**.

## Acceptance Criteria

1. **Given** validation returns success=false
   **When** retry attempt < validationMaxRetry
   **Then** continueMessage is sent as follow-up prompt
   **And** '[Validation] Retry - sending feedback to OpenCode' is logged

2. **Given** validation fails validationMaxRetry times
   **When** max retries exceeded
   **Then** error is thrown with last validation output

3. **Given** validation returns success=true
   **When** any attempt
   **Then** '[Validation] Success - workflow complete' is logged
   **And** workflow completes

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Retry loop patterns
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Progress logging
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - Loop testing

- [x] Task 2: Add validation retry loop to runner.ts (AC: All)
  - [x] Create `runValidationLoop()` async function
  - [x] Accept OpenCodeService, session, inputs, workspace, timeoutMs, abortSignal parameters
  - [x] Return updated session after successful validation

- [x] Task 3: Implement attempt logging (AC: 1, 3)
  - [x] Log attempt number: '[Validation] Attempt {n}/{max}'
  - [x] Log success: '[Validation] Success - workflow complete'
  - [x] Log retry: '[Validation] Retry - sending feedback to OpenCode'

- [x] Task 4: Implement validation call (AC: 1, 3)
  - [x] Call `executeValidationScript()` with current session's lastMessage
  - [x] Check `validationResult.success` to determine next action

- [x] Task 5: Implement retry with follow-up (AC: 1)
  - [x] On failure (not last attempt), call `opencode.sendFollowUp()`
  - [x] Send `validationResult.continueMessage` as follow-up prompt
  - [x] Update currentSession with new response
  - [x] Continue loop

- [x] Task 6: Implement max retry failure (AC: 2)
  - [x] On last attempt failure, throw Error with last validation output
  - [x] Include attempt count in error message
  - [x] Format: 'Validation failed after {n} attempts. Last output: {message}'

- [x] Task 7: Handle abort and errors during retry (AC: All)
  - [x] If abortSignal triggered, re-throw error immediately
  - [x] For other errors on non-final attempt, log warning and continue
  - [x] For errors on final attempt, re-throw

- [x] Task 8: Integrate retry loop into runWorkflow() (AC: All)
  - [x] Check if `inputs.validationScript` is set
  - [x] If set, call `runValidationLoop()` after initial session
  - [x] Use updated session for final output

- [x] Task 9: Write unit tests (AC: All)
  - [x] Test successful validation on first attempt
  - [x] Test retry on validation failure
  - [x] Test max retries exceeded throws error
  - [x] Test abort during validation stops retry
  - [x] Test follow-up message is sent correctly
  - [x] Test logging for each scenario

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/runner.ts` - `runValidationLoop()` function
- Integration: `src/runner.ts` - `runWorkflow()` function
- Dependencies: `src/validation.ts` - `executeValidationScript()`
- Dependencies: `src/opencode.ts` - `sendFollowUp()`
- Unit tests: `src/runner.spec.ts`

### Architecture Compliance

- Async loop with proper abort handling
- Error propagation for abort signals
- Graceful degradation for non-fatal errors

### Technical Requirements

- Log attempt number at start of each attempt
- Log success message immediately on success
- Log retry message before sending follow-up
- Include full validation output in error message

### Code Patterns

```typescript
async function runValidationLoop(
  opencode: OpenCodeService,
  session: OpenCodeSession,
  inputs: ActionInputs,
  workspace: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<OpenCodeSession> {
  let currentSession = session;

  for (let attempt = 1; attempt <= inputs.validationMaxRetry; attempt++) {
    core.info(`[Validation] Attempt ${attempt}/${inputs.validationMaxRetry}`);

    try {
      const validationResult = await executeValidationScript({
        script: inputs.validationScript!,
        scriptType: inputs.validationScriptType,
        lastMessage: currentSession.lastMessage,
        workspacePath: workspace,
        envVars: inputs.envVars,
        abortSignal,
      });

      if (validationResult.success) {
        core.info('[Validation] Success - workflow complete');
        return currentSession;
      }

      if (attempt === inputs.validationMaxRetry) {
        throw new Error(
          `Validation failed after ${inputs.validationMaxRetry} attempts. Last output: ${validationResult.continueMessage}`
        );
      }

      core.info('[Validation] Retry - sending feedback to OpenCode');
      currentSession = await opencode.sendFollowUp(
        currentSession.sessionId,
        validationResult.continueMessage,
        timeoutMs,
        abortSignal
      );
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === inputs.validationMaxRetry) {
        throw error;
      }

      core.warning(`[Validation] Error on attempt ${attempt}: ${String(error)}`);
    }
  }

  return currentSession;
}
```

### Integration in runWorkflow()

```typescript
// In runWorkflow(), after session creation
if (inputs.validationScript) {
  session = await runValidationLoop(opencode, session, inputs, workspace, timeoutMs, abortSignal);
}
```

### Log Messages

```typescript
// Attempt start
core.info(`[Validation] Attempt ${attempt}/${inputs.validationMaxRetry}`);

// Success
core.info('[Validation] Success - workflow complete');

// Retry
core.info('[Validation] Retry - sending feedback to OpenCode');

// Error during attempt
core.warning(`[Validation] Error on attempt ${attempt}: ${String(error)}`);
```

### Error Message Format

```typescript
`Validation failed after ${inputs.validationMaxRetry} attempts. Last output: ${validationResult.continueMessage}`;
```

### References

- [Source: src/runner.ts#runValidationLoop] - Retry loop implementation
- [Source: src/runner.ts#runWorkflow] - Integration point
- [Source: src/validation.ts#executeValidationScript] - Validation execution
- [Source: src/opencode.ts#sendFollowUp] - Follow-up message sending
- [Source: _bmad-output/planning-artifacts/architecture.md#Async Coordination] - Loop patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- runValidationLoop() implemented at `src/runner.ts:175-230`
- Integration in runWorkflow() at `src/runner.ts:60-69`
- All 3 acceptance criteria verified
- 9 unit tests in `src/runner.spec.ts:261-403`

### File List

- `src/runner.ts` - Added runValidationLoop() function and integration in runWorkflow()
- `src/runner.spec.ts` - Added validation retry loop tests

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- All acceptance criteria implemented and verified
- Retry loop with proper abort handling implemented
- Status updated from ready-for-dev to done
