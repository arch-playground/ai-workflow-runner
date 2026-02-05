# Story 2.6: Implement Message Capture for Validation

Status: done

## Story

As a **developer**,
I want **the last assistant message captured**,
So that **it can be passed to validation scripts**.

## Acceptance Criteria

1. **Given** `message.updated` event with role='assistant' **When** `handleEvent()` processes it **Then** currentMessageId is updated **And** previous buffer is saved as lastCompleteMessage

2. **Given** `getLastMessage(sessionId)` is called **When** session has accumulated message **Then** the complete message is returned

3. **Given** message exceeds MAX_LAST_MESSAGE_SIZE (100KB) **When** `getLastMessage()` is called **Then** message is truncated with '...[truncated]' **And** warning is logged

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Define message event type** (AC: 1)
  - [x] Add `MESSAGE_UPDATED: 'message.updated'` to EVENT_TYPES constant

- [x] **Task 3: Implement message tracking in handleEvent()** (AC: 1)
  - [x] Handle `message.updated` event
  - [x] Extract info object with id, role, sessionID
  - [x] Check if role is 'assistant'
  - [x] Get session state from map
  - [x] If new message (different ID), save buffer to lastCompleteMessage
  - [x] Update currentMessageId
  - [x] Reset messageBuffer for new message

- [x] **Task 4: Implement getLastMessage() method** (AC: 2, 3)
  - [x] Get session state from map
  - [x] Return lastCompleteMessage if available, otherwise messageBuffer
  - [x] Check size against MAX_LAST_MESSAGE_SIZE
  - [x] Truncate and log warning if exceeds limit
  - [x] Append '...[truncated]' to truncated messages

- [x] **Task 5: Create unit tests** (AC: 1, 2, 3)
  - [x] Test message.updated saves previous buffer
  - [x] Test getLastMessage returns accumulated content
  - [x] Test truncation at size limit with warning

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Size Limit**: `INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE` (100KB)
- **Use Case**: Passed to validation scripts via `AI_LAST_MESSAGE` env var
- **Truncation**: Always append indicator when truncating

### Technical Requirements

- Import `INPUT_LIMITS` from `./types.js`
- Use `core.warning()` for truncation notification
- Handle edge cases: empty session state, missing message data

### Implementation Pattern - handleEvent

```typescript
if (e.type === EVENT_TYPES.MESSAGE_UPDATED) {
  const info = (
    e.properties as {
      info?: { id?: string; role?: string; sessionID?: string };
    }
  )?.info;

  if (info?.role === 'assistant' && info.id && info.sessionID) {
    const state = this.sessionMessageState.get(info.sessionID);
    if (state) {
      // Save current buffer as last complete message if switching messages
      if (state.currentMessageId && state.currentMessageId !== info.id && state.messageBuffer) {
        state.lastCompleteMessage = state.messageBuffer;
      }
      // Start tracking new message
      if (state.currentMessageId !== info.id) {
        state.currentMessageId = info.id;
        state.messageBuffer = '';
      }
    }
  }
}
```

### Implementation Pattern - getLastMessage

```typescript
getLastMessage(sessionId: string): string {
  const state = this.sessionMessageState.get(sessionId);
  const message = state?.lastCompleteMessage || state?.messageBuffer || '';

  if (message.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
    core.warning('[OpenCode] Last message truncated due to size limit');
    return message.substring(0, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) + '...[truncated]';
  }
  return message;
}
```

### Message State Flow

```
message.updated (role=assistant, id=msg1)
  → Set currentMessageId = msg1
  → Clear messageBuffer

message.part.updated (messageID=msg1, text="Hello")
  → Append "Hello" to messageBuffer

message.part.updated (messageID=msg1, text=" World")
  → Append " World" to messageBuffer
  → messageBuffer = "Hello World"

message.updated (role=assistant, id=msg2)
  → Save messageBuffer to lastCompleteMessage = "Hello World"
  → Set currentMessageId = msg2
  → Clear messageBuffer

getLastMessage(sessionId)
  → Return "Hello World" (lastCompleteMessage)
```

### Cross-Story Dependencies

- Depends on Story 2.3 (session state initialization)
- Depends on Story 2.5 (message part accumulation)
- Used by validation scripts (Epic 3)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Output Size Limits]
- [Source: _bmad-output/planning-artifacts/prd.md#FR14 - Capture last message]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `MESSAGE_UPDATED` event type at `src/opencode.ts:14`
- Message tracking in handleEvent() at lines 292-307
- Saves buffer to lastCompleteMessage when switching messages at lines 298-300
- `getLastMessage()` method at lines 179-187
- Uses `INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE` (100KB) from types.ts
- Truncates with '...[truncated]' suffix at line 184
- Logs warning via `core.warning()` at line 183
- All getLastMessage() tests pass

### Acceptance Criteria Verification

| AC  | Requirement                                            | Implementation            | Verified                                                |
| --- | ------------------------------------------------------ | ------------------------- | ------------------------------------------------------- |
| AC1 | message.updated saves buffer, updates currentMessageId | `src/opencode.ts:292-307` | ✅ Test passes                                          |
| AC2 | getLastMessage returns complete message                | `src/opencode.ts:179-187` | ✅ Test "returns message for specific session" passes   |
| AC3 | Truncates at 100KB with warning                        | `src/opencode.ts:182-184` | ✅ Test "logs warning when message is truncated" passes |

### File List

- `src/opencode.ts` (modified) - Added message.updated handling and getLastMessage()
- `src/opencode.spec.ts` (modified) - Added message capture tests
- `src/types.ts` (modified) - MAX_LAST_MESSAGE_SIZE constant
