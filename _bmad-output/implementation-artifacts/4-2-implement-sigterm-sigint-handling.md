# Story 4.2: Implement SIGTERM/SIGINT Handling

## Story

As a **developer**,
I want **graceful shutdown on signals**,
So that **resources are cleaned up properly**.

## Status

**Status:** done
**Epic:** 4 - Lifecycle Management & Graceful Shutdown
**Sprint:** MVP Implementation Sprint

## Acceptance Criteria

- [x] **AC1:** Given SIGTERM signal received, when handleShutdown() is called, then 'Received SIGTERM, initiating graceful shutdown...' is logged
- [x] **AC2:** Given SIGTERM signal received, when handleShutdown() is called, then shutdownController.abort() is called
- [x] **AC3:** Given SIGINT signal received, when handleShutdown() is called, then 'Received SIGINT, initiating graceful shutdown...' is logged
- [x] **AC4:** Given SIGINT signal received, when handleShutdown() is called, then shutdownController.abort() is called

## Tasks

- [x] **Task 1:** Create shutdownController as module-level AbortController
- [x] **Task 2:** Implement handleShutdown(signal) function
- [x] **Task 3:** Log received signal with graceful shutdown message
- [x] **Task 4:** Call shutdownController.abort() to signal cancellation
- [x] **Task 5:** Register SIGTERM handler with process.on()
- [x] **Task 6:** Register SIGINT handler with process.on()

## Dev Agent Record

### File List

| File         | Action   | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| src/index.ts | Modified | Added signal handlers and handleShutdown function |

### Change Log

| Date       | Change                         | Reason                                              |
| ---------- | ------------------------------ | --------------------------------------------------- |
| 2026-02-05 | Story documented retroactively | Epic 4 was implemented but story files were missing |

## Implementation Notes

Signal handling implementation in `src/index.ts`:

```typescript
process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));
```

The `handleShutdown` function:

1. Logs the received signal
2. Aborts the shutdown controller
3. Disposes OpenCode service if initialized
4. Sets up forced exit timeout
5. Waits for runPromise to complete or forces exit

This ensures CI/CD environments (GitHub Actions, Docker) can cleanly stop the action.
