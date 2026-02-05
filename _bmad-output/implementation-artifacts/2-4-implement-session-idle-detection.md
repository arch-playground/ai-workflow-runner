# Story 2.4: Implement Session Idle Detection

Status: done

## Story

As a **developer**,
I want **session completion detected via events**,
So that **the runner knows when the AI workflow is done**.

## Acceptance Criteria

1. **Given** an active session **When** `session.idle` event is received **Then** the session completion callback is resolved **And** the session is marked complete

2. **Given** an active session **When** `session.status` event with type 'idle' is received **Then** the session completion callback is resolved

3. **Given** an active session **When** `session.status` event with type 'error' or 'disconnected' is received **Then** the session completion callback is rejected with error

4. **Given** timeout is reached before idle **When** `waitForSessionIdle()` times out **Then** error is thrown with timeout message

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Define session status constants** (AC: 1, 2, 3)
  - [x] Create `SESSION_STATUS` constant object with IDLE, ERROR, DISCONNECTED
  - [x] Create `EVENT_TYPES` constant object with SESSION_IDLE, SESSION_STATUS

- [x] **Task 3: Implement waitForSessionIdle() private method** (AC: 1, 2, 3, 4)
  - [x] Return Promise that resolves on idle, rejects on error/timeout
  - [x] Check if service is disposed, reject immediately if so
  - [x] Set up timeout with `setTimeout`
  - [x] Set up abort signal listener if provided
  - [x] Store callbacks in `sessionCompletionCallbacks` map
  - [x] Ensure all cleanup happens on resolve/reject/timeout

- [x] **Task 4: Implement handleEvent() for session events** (AC: 1, 2, 3)
  - [x] Handle `session.idle` event - resolve callback
  - [x] Handle `session.status` with type 'idle' - resolve callback
  - [x] Handle `session.status` with type 'error' or 'disconnected' - reject callback
  - [x] Save message buffer to lastCompleteMessage before resolving
  - [x] Clean up abort listeners on completion

- [x] **Task 5: Create unit tests** (AC: 1, 2, 3, 4)
  - [x] Test session.idle event resolves promise
  - [x] Test session.status with idle resolves promise
  - [x] Test session.status with error rejects promise
  - [x] Test timeout rejects with message
  - [x] Test abort signal cancels wait

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Callback Map Pattern**: Store resolve/reject for async event completion
- **Timeout Management**: Always clear timeouts in finally blocks
- **AbortSignal**: Support cancellation via signal

### Technical Requirements

- Method signature: `private waitForSessionIdle(sessionId: string, timeoutMs: number, abortSignal?: AbortSignal): Promise<void>`
- Always clean up event listeners to prevent memory leaks
- Handle both event types for backward compatibility

### Session Status Constants

```typescript
const SESSION_STATUS = {
  IDLE: 'idle',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
} as const;

const EVENT_TYPES = {
  SESSION_IDLE: 'session.idle',
  SESSION_STATUS: 'session.status',
  // ... other event types
} as const;
```

### Implementation Pattern - waitForSessionIdle

```typescript
private waitForSessionIdle(
  sessionId: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (this.isDisposed) {
      reject(new Error('OpenCode service disposed'));
      return;
    }

    const timeoutId = setTimeout(() => {
      const callbacks = this.sessionCompletionCallbacks.get(sessionId);
      if (callbacks?.abortCleanup) callbacks.abortCleanup();
      this.sessionCompletionCallbacks.delete(sessionId);
      reject(new Error(`Session ${sessionId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let abortCleanup: (() => void) | undefined;
    if (abortSignal) {
      const abortHandler = (): void => {
        clearTimeout(timeoutId);
        this.sessionCompletionCallbacks.delete(sessionId);
        reject(new Error('Session aborted'));
      };
      abortSignal.addEventListener('abort', abortHandler, { once: true });
      abortCleanup = (): void => {
        abortSignal.removeEventListener('abort', abortHandler);
      };
    }

    this.sessionCompletionCallbacks.set(sessionId, {
      resolve: () => {
        clearTimeout(timeoutId);
        if (abortCleanup) abortCleanup();
        resolve();
      },
      reject: (err: Error) => {
        clearTimeout(timeoutId);
        if (abortCleanup) abortCleanup();
        reject(err);
      },
      abortCleanup,
    });
  });
}
```

### Implementation Pattern - handleEvent (session events)

```typescript
if (e.type === EVENT_TYPES.SESSION_IDLE || e.type === EVENT_TYPES.SESSION_STATUS) {
  const props = e.properties as {
    sessionID?: string;
    status?: { type?: string; error?: string };
  };
  const sessionID = props?.sessionID;
  const statusType = props?.status?.type;
  const isIdle = e.type === EVENT_TYPES.SESSION_IDLE || statusType === SESSION_STATUS.IDLE;
  const isError = statusType === SESSION_STATUS.ERROR || statusType === SESSION_STATUS.DISCONNECTED;

  if (sessionID && (isIdle || isError)) {
    // Save message buffer before resolving
    const state = this.sessionMessageState.get(sessionID);
    if (state && state.messageBuffer) {
      state.lastCompleteMessage = state.messageBuffer;
    }

    const callbacks = this.sessionCompletionCallbacks.get(sessionID);
    if (callbacks) {
      if (callbacks.abortCleanup) callbacks.abortCleanup();
      this.sessionCompletionCallbacks.delete(sessionID);

      if (isError) {
        callbacks.reject(
          new Error(`Session ${statusType}: ${props?.status?.error || 'unknown error'}`)
        );
      } else {
        callbacks.resolve();
      }
    }
  }
}
```

### Cross-Story Dependencies

- Depends on Story 2.3 (session creation)
- Required by Story 2.8 (event loop)
- Used by Story 2.9 (follow-up messages)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Async Coordination]
- [Source: _bmad-output/planning-artifacts/architecture.md#Timeout Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `SESSION_STATUS` constant at `src/opencode.ts:6-10`
- `EVENT_TYPES` constant at lines 12-18
- `waitForSessionIdle()` method at lines 375-419
- Timeout handling with cleanup at lines 386-391
- Abort signal listener at lines 394-404
- Session event handling in `handleEvent()` at lines 341-372
- All unit tests pass for idle detection and event handling

### Acceptance Criteria Verification

| AC  | Requirement                                      | Implementation                    | Verified                         |
| --- | ------------------------------------------------ | --------------------------------- | -------------------------------- |
| AC1 | `session.idle` event resolves callback           | `src/opencode.ts:341,348`         | ✅ Test passes                   |
| AC2 | `session.status` with type 'idle' resolves       | `src/opencode.ts:348`             | ✅ Test passes                   |
| AC3 | `session.status` with error/disconnected rejects | `src/opencode.ts:349-350,363-366` | ✅ Tests pass                    |
| AC4 | Timeout rejects with message                     | `src/opencode.ts:386-391`         | ✅ Test "handles timeout" passes |

### File List

- `src/opencode.ts` (modified) - Added constants and waitForSessionIdle()
- `src/opencode.spec.ts` (modified) - Added idle detection tests
