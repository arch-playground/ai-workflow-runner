# Story 4.6: Implement Forced Exit Timeout

## Story

As a **developer**,
I want **forced exit if graceful shutdown takes too long**,
So that **the action doesn't hang indefinitely**.

## Status

**Status:** done
**Epic:** 4 - Lifecycle Management & Graceful Shutdown
**Sprint:** MVP Implementation Sprint

## Acceptance Criteria

- [x] **AC1:** Given shutdown initiated, when graceful shutdown takes > 10 seconds, then 'Graceful shutdown timed out, forcing exit' is logged
- [x] **AC2:** Given shutdown initiated, when graceful shutdown takes > 10 seconds, then process.exit(1) is called
- [x] **AC3:** Given shutdown completes before timeout, when runPromise resolves, then timeout is cleared
- [x] **AC4:** Given shutdown completes before timeout, when runPromise resolves, then process.exit(0) is called

## Tasks

- [x] **Task 1:** Set forceExitTimeout with 10 second delay
- [x] **Task 2:** Log warning message on timeout
- [x] **Task 3:** Call process.exit(1) on timeout
- [x] **Task 4:** Check if runPromise exists
- [x] **Task 5:** Attach .finally() handler to runPromise
- [x] **Task 6:** Clear timeout in finally handler
- [x] **Task 7:** Call process.exit(0) on successful completion
- [x] **Task 8:** Handle case where runPromise is null (immediate exit)

## Dev Agent Record

### File List

| File         | Action   | Description                                 |
| ------------ | -------- | ------------------------------------------- |
| src/index.ts | Modified | Added forced exit timeout in handleShutdown |

### Change Log

| Date       | Change                         | Reason                                              |
| ---------- | ------------------------------ | --------------------------------------------------- |
| 2026-02-05 | Story documented retroactively | Epic 4 was implemented but story files were missing |

## Implementation Notes

Forced exit implementation in `src/index.ts:84-97`:

```typescript
const forceExitTimeout = setTimeout(() => {
  core.warning('Graceful shutdown timed out, forcing exit');
  process.exit(1);
}, 10000);

if (runPromise) {
  void runPromise.finally(() => {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  });
} else {
  clearTimeout(forceExitTimeout);
  process.exit(0);
}
```

This ensures:

- Maximum 10 second wait for graceful shutdown
- Clean exit (0) on successful completion
- Forced exit (1) if shutdown hangs
- Handles edge case where run() hasn't started yet

The 10 second timeout aligns with:

- GitHub Actions job cancellation expectations
- Docker container stop timeout defaults
- Kubernetes pod termination grace period
