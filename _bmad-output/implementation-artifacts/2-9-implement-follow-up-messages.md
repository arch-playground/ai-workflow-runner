# Story 2.9: Implement Follow-Up Messages

Status: done

## Story

As a **developer**,
I want **follow-up messages sent to existing sessions**,
So that **validation feedback can continue the conversation**.

## Acceptance Criteria

1. **Given** an active session **When** `sendFollowUp(sessionId, message)` is called **Then** message is sent via `promptAsync()` **And** message buffer is reset for new response

2. **Given** message exceeds MAX_VALIDATION_OUTPUT_SIZE **When** `sendFollowUp()` is called **Then** message is truncated with '...[truncated]'

3. **Given** service is disposed **When** `sendFollowUp()` is called **Then** error is thrown 'OpenCode service disposed - cannot send follow-up'

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Implement sendFollowUp() method** (AC: 1, 2, 3)
  - [x] Check if service is disposed, throw if so
  - [x] Check client is initialized
  - [x] Reset session message state (currentMessageId, messageBuffer)
  - [x] Truncate message if exceeds MAX_VALIDATION_OUTPUT_SIZE
  - [x] Log follow-up message (first 100 chars)
  - [x] Set up idle wait promise
  - [x] Send message via promptAsync
  - [x] Await idle promise
  - [x] Return updated OpenCodeSession

- [x] **Task 3: Create unit tests** (AC: 1, 2, 3)
  - [x] Test successful follow-up sends message
  - [x] Test message buffer is reset
  - [x] Test long messages are truncated
  - [x] Test disposed service throws error

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Size Limit**: `INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE` (100KB)
- **Session Continuity**: Reuses existing session for conversation flow
- **Error Handling**: Throws for invalid state (disposed, uninitialized)

### Technical Requirements

- Method signature: `async sendFollowUp(sessionId: string, message: string, timeoutMs: number, abortSignal?: AbortSignal): Promise<OpenCodeSession>`
- Reset message state before sending to capture new response
- Truncate validation output before sending to prevent oversized prompts

### Implementation Pattern

```typescript
async sendFollowUp(
  sessionId: string,
  message: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<OpenCodeSession> {
  if (this.isDisposed) {
    throw new Error('OpenCode service disposed - cannot send follow-up');
  }
  if (!this.client) throw new Error('OpenCode client not initialized');

  // Reset message state for new response
  const sessionState = this.sessionMessageState.get(sessionId);
  if (sessionState) {
    sessionState.currentMessageId = null;
    sessionState.messageBuffer = '';
  }

  // Truncate long messages
  const truncatedMessage =
    message.length > INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE
      ? message.substring(0, INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE) + '...[truncated]'
      : message;

  core.info(`[OpenCode] Sending follow-up: ${truncatedMessage.substring(0, 100)}...`);

  const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);

  await this.client.session.promptAsync({
    path: { id: sessionId },
    body: { parts: [{ type: 'text', text: truncatedMessage }] },
  });

  await idlePromise;
  return { sessionId, lastMessage: this.getLastMessage(sessionId) };
}
```

### Message State Reset

Before sending a follow-up, the session's message state is reset:

- `currentMessageId = null` - Ready for new message
- `messageBuffer = ''` - Clear previous accumulation

This ensures the new AI response is captured cleanly.

### Truncation Strategy

```
Original message: [100KB+ validation output]
                  ↓
Truncated:        [First 100KB]...[truncated]
                  ↓
Logged:           "[First 100 chars]..."
```

### Use Case: Validation Retry Loop

```
1. runSession() → AI generates output
2. Validation script fails with feedback
3. sendFollowUp(sessionId, feedback) → AI receives feedback
4. AI generates new output based on feedback
5. Repeat until validation passes or max retries
```

### Cross-Story Dependencies

- Depends on Story 2.3 (session creation)
- Depends on Story 2.4 (idle detection)
- Used by runner.ts validation retry loop (Epic 3)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md#FR25 - Send validation output as follow-up]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.9]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `sendFollowUp()` method at `src/opencode.ts:144-177`
- Checks disposed state at line 150
- Resets session state at lines 155-159
- Truncates at MAX_VALIDATION_OUTPUT_SIZE (100KB) at lines 161-164
- Logs first 100 chars at line 166
- Sends via promptAsync at lines 170-173
- Returns updated session at line 176
- Test "sends message to existing session" passes
- Test "truncates long messages" passes
- Test "throws if service is disposed" passes

### Acceptance Criteria Verification

| AC  | Requirement                                   | Implementation            | Verified                                 |
| --- | --------------------------------------------- | ------------------------- | ---------------------------------------- |
| AC1 | Message sent via promptAsync, buffer reset    | `src/opencode.ts:155-176` | ✅ Test passes                           |
| AC2 | Long messages truncated with '...[truncated]' | `src/opencode.ts:161-164` | ✅ Test "truncates long messages" passes |
| AC3 | Disposed service throws error                 | `src/opencode.ts:150-152` | ✅ Test passes                           |

### File List

- `src/opencode.ts` (modified) - Added sendFollowUp() method
- `src/opencode.spec.ts` (modified) - Added follow-up tests
