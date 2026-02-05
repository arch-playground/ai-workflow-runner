# Story 4.5: Implement Resource Cleanup

## Story

As a **developer**,
I want **all resources cleaned up**,
So that **no leaks occur**.

## Status

**Status:** done
**Epic:** 4 - Lifecycle Management & Graceful Shutdown
**Sprint:** MVP Implementation Sprint

## Acceptance Criteria

- [x] **AC1:** Given dispose() is called, when service has active sessions, then all pending callbacks are rejected with 'OpenCode service disposed'
- [x] **AC2:** Given dispose() is called, when service has active sessions, then sessionCompletionCallbacks map is cleared
- [x] **AC3:** Given dispose() is called, when event loop is running, then eventLoopAbortController.abort() is called
- [x] **AC4:** Given dispose() is called, when server is running, then server.close() is called
- [x] **AC5:** Given dispose() is called, when server is running, then '[OpenCode] Shutting down server...' is logged

## Tasks

- [x] **Task 1:** Iterate over sessionCompletionCallbacks and reject all
- [x] **Task 2:** Call abortCleanup for each callback if exists
- [x] **Task 3:** Clear sessionCompletionCallbacks map
- [x] **Task 4:** Store eventLoopAbortController reference before nulling
- [x] **Task 5:** Store server reference before nulling
- [x] **Task 6:** Null out client, server, controller references
- [x] **Task 7:** Reset isInitialized and initializationPromise
- [x] **Task 8:** Abort event loop controller
- [x] **Task 9:** Log shutdown message and close server

## Dev Agent Record

### File List

| File            | Action   | Description                                |
| --------------- | -------- | ------------------------------------------ |
| src/opencode.ts | Modified | Implemented comprehensive dispose() method |

### Change Log

| Date       | Change                         | Reason                                              |
| ---------- | ------------------------------ | --------------------------------------------------- |
| 2026-02-05 | Story documented retroactively | Epic 4 was implemented but story files were missing |

## Implementation Notes

Resource cleanup in `src/opencode.ts:189-217`:

```typescript
dispose(): void {
  if (this.isDisposed) return;
  this.isDisposed = true;

  // Reject all pending callbacks
  for (const [, callbacks] of this.sessionCompletionCallbacks) {
    if (callbacks.abortCleanup) callbacks.abortCleanup();
    callbacks.reject(new Error('OpenCode service disposed'));
  }
  this.sessionCompletionCallbacks.clear();

  // Store references before nulling
  const eventController = this.eventLoopAbortController;
  const server = this.server;

  // Null references
  this.eventLoopAbortController = null;
  this.server = null;
  this.client = null;
  this.isInitialized = false;
  this.initializationPromise = null;

  // Abort and close
  if (eventController) eventController.abort();
  if (server) {
    core.info('[OpenCode] Shutting down server...');
    server.close();
  }
}
```

This ensures:

- No pending promises left hanging
- Event loop stops cleanly
- Server socket is closed
- No memory leaks from dangling references
