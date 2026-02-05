# Story 2.8: Implement Event Loop with Reconnection

Status: done

## Story

As a **developer**,
I want **the event loop to reconnect on errors**,
So that **transient network issues don't break the workflow**.

## Acceptance Criteria

1. **Given** event loop encounters error **When** attempt < maxReconnectAttempts (3) **Then** reconnection is attempted after 1 second delay

2. **Given** event loop fails all reconnection attempts **When** max attempts exceeded **Then** all pending callbacks are rejected **And** error is logged

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Add event loop control fields** (AC: 1, 2)
  - [x] Add `private eventLoopAbortController: AbortController | null = null`
  - [x] Define reconnection constants: maxReconnectAttempts = 3, reconnectDelayMs = 1000

- [x] **Task 3: Implement startEventLoop() method** (AC: 1, 2)
  - [x] Check client exists before starting
  - [x] Get abort signal from eventLoopAbortController
  - [x] Define recursive runLoop function with attempt counter
  - [x] Subscribe to SDK event stream
  - [x] Process events in for-await loop
  - [x] Check abort signal on each iteration

- [x] **Task 4: Implement error handling and reconnection** (AC: 1, 2)
  - [x] Catch errors from event subscription
  - [x] Check abort signal - exit silently if aborted
  - [x] Log warning with attempt number
  - [x] If attempts remaining: delay, then retry (unless aborted)
  - [x] If max attempts exceeded: log error, reject all pending callbacks

- [x] **Task 5: Implement abortable delay** (AC: 1)
  - [x] Create Promise-based delay that can be cancelled
  - [x] Clean up timeout on abort signal
  - [x] Check abort status after delay before reconnecting

- [x] **Task 6: Create unit tests** (AC: 1, 2)
  - [x] Test reconnection on transient error
  - [x] Test max reconnection attempts
  - [x] Test callbacks rejected after max attempts
  - [x] Test abort signal stops reconnection

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **NFR12**: Event loop reconnects on transient errors (3 attempts)
- **Resource Cleanup**: Abort signal prevents reconnection after dispose
- **Error Propagation**: Max failures reject all pending session callbacks

### Technical Requirements

- Use `void runLoop()` to start loop without blocking
- Use `for await` to iterate event stream
- Handle disposal during reconnection delay

### Implementation Pattern

```typescript
private startEventLoop(): void {
  if (!this.client) return;
  const client = this.client;
  const signal = this.eventLoopAbortController?.signal;
  const maxReconnectAttempts = 3;
  const reconnectDelayMs = 1000;

  const runLoop = async (attempt: number = 0): Promise<void> => {
    try {
      const eventResult = await client.event.subscribe();
      for await (const event of eventResult.stream) {
        if (signal?.aborted) break;
        this.handleEvent(event, client);
      }
    } catch (error) {
      if (signal?.aborted) return;

      core.warning(
        `[OpenCode] Event loop error (attempt ${attempt + 1}/${maxReconnectAttempts}): ${String(error)}`
      );

      if (attempt < maxReconnectAttempts - 1) {
        core.info(`[OpenCode] Attempting to reconnect event loop in ${reconnectDelayMs}ms...`);
        // Abortable delay
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => resolve(), reconnectDelayMs);
          if (signal) {
            const abortHandler = (): void => {
              clearTimeout(timeoutId);
              resolve();
            };
            signal.addEventListener('abort', abortHandler, { once: true });
          }
        });
        if (!signal?.aborted) {
          void runLoop(attempt + 1);
        }
      } else {
        core.error(
          '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.'
        );
        // Reject all pending callbacks
        for (const [, callbacks] of this.sessionCompletionCallbacks) {
          if (callbacks.abortCleanup) callbacks.abortCleanup();
          callbacks.reject(
            new Error('Event loop disconnected - cannot detect session completion')
          );
        }
        this.sessionCompletionCallbacks.clear();
      }
    }
  };

  void runLoop();
}
```

### Reconnection Strategy

| Attempt | Action               | Result                      |
| ------- | -------------------- | --------------------------- |
| 1       | Initial subscription | Error occurs                |
| 2       | Retry after 1s       | Error occurs                |
| 3       | Retry after 1s       | Error occurs                |
| 4       | Max exceeded         | Reject callbacks, log error |

### Event Loop Lifecycle

```
initialize()
  → Create eventLoopAbortController
  → Call startEventLoop()

startEventLoop()
  → Subscribe to events
  → Process events in loop
  → On error: retry up to 3 times

dispose()
  → eventLoopAbortController.abort()
  → Signal causes loop to exit
  → Delays are cancelled
```

### Cross-Story Dependencies

- Depends on Story 2.2 (initialization creates abort controller)
- Used by Stories 2.4, 2.5, 2.6, 2.7 (event handling)
- Cleaned up in dispose (Story 2.1)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Async Coordination]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR12 - Reconnection]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `eventLoopAbortController` field at `src/opencode.ts:64`
- `startEventLoop()` method at lines 219-272
- Reconnection constants: maxReconnectAttempts=3, reconnectDelayMs=1000 at lines 223-224
- Recursive runLoop with attempt counter at lines 226-269
- Abortable delay with cleanup at lines 243-252
- Logs warning with attempt number at lines 236-238
- Rejects all callbacks after max attempts at lines 260-266
- Test "attempts reconnection on transient error" passes
- Test "rejects all callbacks after max reconnection attempts" passes

### Acceptance Criteria Verification

| AC  | Requirement                                             | Implementation            | Verified       |
| --- | ------------------------------------------------------- | ------------------------- | -------------- |
| AC1 | Reconnection attempted after 1s delay, up to 3 attempts | `src/opencode.ts:240-255` | ✅ Test passes |
| AC2 | Max attempts exceeded rejects callbacks, logs error     | `src/opencode.ts:256-267` | ✅ Test passes |

### File List

- `src/opencode.ts` (modified) - Added startEventLoop() with reconnection
- `src/opencode.spec.ts` (modified) - Added event loop reconnection tests
