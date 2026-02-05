# Story 4.3: Implement OpenCode Service Disposal

## Story

As a **developer**,
I want **OpenCode service disposed on shutdown**,
So that **SDK resources are released**.

## Status

**Status:** done
**Epic:** 4 - Lifecycle Management & Graceful Shutdown
**Sprint:** MVP Implementation Sprint

## Acceptance Criteria

- [x] **AC1:** Given shutdown initiated, when hasOpenCodeServiceInstance() returns true, then getOpenCodeService().dispose() is called
- [x] **AC2:** Given disposal fails, when error occurs, then warning is logged but shutdown continues
- [x] **AC3:** Given dispose() called on already disposed service, when called again, then it returns immediately (idempotent)

## Tasks

- [x] **Task 1:** Check hasOpenCodeServiceInstance() before disposal
- [x] **Task 2:** Call getOpenCodeService().dispose() if instance exists
- [x] **Task 3:** Wrap disposal in try-catch for error resilience
- [x] **Task 4:** Log warning on disposal failure
- [x] **Task 5:** Implement idempotent dispose() in OpenCodeService
- [x] **Task 6:** Track isDisposed flag to prevent double disposal

## Dev Agent Record

### File List

| File            | Action   | Description                             |
| --------------- | -------- | --------------------------------------- |
| src/index.ts    | Modified | Added disposal call in handleShutdown   |
| src/opencode.ts | Modified | Implemented idempotent dispose() method |

### Change Log

| Date       | Change                         | Reason                                              |
| ---------- | ------------------------------ | --------------------------------------------------- |
| 2026-02-05 | Story documented retroactively | Epic 4 was implemented but story files were missing |

## Implementation Notes

Disposal in `src/index.ts:73-82`:

```typescript
if (hasOpenCodeServiceInstance()) {
  try {
    const opencode = getOpenCodeService();
    opencode.dispose();
  } catch (error) {
    core.warning(`[Shutdown] Failed to dispose OpenCode service: ${error...}`);
  }
}
```

Idempotent dispose in `src/opencode.ts:189-217`:

- Checks `isDisposed` flag early return
- Sets `isDisposed = true` immediately
- Rejects all pending callbacks
- Aborts event loop
- Closes server
