# Story 4.4: Implement Abort Signal Propagation

## Story

As a **developer**,
I want **abort signal propagated through the system**,
So that **all operations can be cancelled**.

## Status

**Status:** done
**Epic:** 4 - Lifecycle Management & Graceful Shutdown
**Sprint:** MVP Implementation Sprint

## Acceptance Criteria

- [x] **AC1:** Given shutdownController.abort() called, when runWorkflow() is executing, then abortSignal propagates to OpenCodeService
- [x] **AC2:** Given shutdownController.abort() called, when runWorkflow() is executing, then abortSignal propagates to validation scripts
- [x] **AC3:** Given abort signal triggered during session wait, when waitForSessionIdle() is waiting, then error is thrown 'Session aborted'
- [x] **AC4:** Given abort signal triggered, when cleanup happens, then abort listener is removed to prevent memory leak

## Tasks

- [x] **Task 1:** Pass shutdownController.signal to runWorkflow()
- [x] **Task 2:** Accept abortSignal parameter in runWorkflow()
- [x] **Task 3:** Pass abortSignal to opencode.runSession()
- [x] **Task 4:** Pass abortSignal to executeValidationScript()
- [x] **Task 5:** Pass abortSignal to opencode.sendFollowUp()
- [x] **Task 6:** Implement abort handling in waitForSessionIdle()
- [x] **Task 7:** Register abort listener with once: true option
- [x] **Task 8:** Store abortCleanup function for listener removal
- [x] **Task 9:** Call abortCleanup on resolve/reject to prevent leaks

## Dev Agent Record

### File List

| File            | Action   | Description                                   |
| --------------- | -------- | --------------------------------------------- |
| src/index.ts    | Modified | Pass shutdownController.signal to runWorkflow |
| src/runner.ts   | Modified | Accept and propagate abortSignal              |
| src/opencode.ts | Modified | Handle abort in waitForSessionIdle            |

### Change Log

| Date       | Change                         | Reason                                              |
| ---------- | ------------------------------ | --------------------------------------------------- |
| 2026-02-05 | Story documented retroactively | Epic 4 was implemented but story files were missing |

## Implementation Notes

Abort signal flow:

1. `index.ts:34` - `runWorkflow(inputs, inputs.timeoutMs, shutdownController.signal)`
2. `runner.ts:14` - `runWorkflow(..., abortSignal?: AbortSignal)`
3. `runner.ts:58` - `opencode.runSession(fullPrompt, timeoutMs, abortSignal)`
4. `runner.ts:67` - `runValidationLoop(..., abortSignal)`
5. `opencode.ts:103` - `runSession(..., abortSignal?: AbortSignal)`

Memory leak prevention in `opencode.ts:393-404`:

```typescript
const abortHandler = (): void => {
  clearTimeout(timeoutId);
  this.sessionCompletionCallbacks.delete(sessionId);
  reject(new Error('Session aborted'));
};
abortSignal.addEventListener('abort', abortHandler, { once: true });
abortCleanup = (): void => {
  abortSignal.removeEventListener('abort', abortHandler);
};
```
