# Story 2.3: Implement Session Creation and Prompt Execution

Status: done

## Story

As a **GitHub Actions user**,
I want **sessions created and prompts executed**,
So that **AI workflows are run via the OpenCode SDK**.

## Acceptance Criteria

1. **Given** an initialized OpenCodeService **When** `runSession(prompt, timeoutMs)` is called **Then** a new session is created with title 'AI Workflow' **And** session ID is logged **And** prompt is sent via `promptAsync()` **And** '[OpenCode] Prompt sent, waiting for completion...' is logged

2. **Given** session creation fails **When** `runSession()` is called **Then** error is thrown with 'Failed to create OpenCode session'

3. **Given** prompt send fails **When** `runSession()` is called **Then** error is thrown with failure details **And** callback is cleaned up

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Add session management fields** (AC: 1, 2, 3)
  - [x] Add `private sessionCompletionCallbacks: Map<string, SessionCallbacks>`
  - [x] Add `private sessionMessageState: Map<string, SessionMessageState>`
  - [x] Define `SessionCallbacks` interface with resolve, reject, abortCleanup
  - [x] Define `SessionMessageState` interface with currentMessageId, messageBuffer, lastCompleteMessage

- [x] **Task 3: Implement runSession() method** (AC: 1, 2, 3)
  - [x] Check if service is disposed, throw if so
  - [x] Call `await this.initialize()` to ensure SDK ready
  - [x] Validate client is initialized
  - [x] Create session via `client.session.create({ body: { title: 'AI Workflow' } })`
  - [x] Validate session response, throw if failed
  - [x] Initialize message state for session
  - [x] Log session ID creation
  - [x] Set up idle wait promise with `waitForSessionIdle()`
  - [x] Send prompt via `client.session.promptAsync()`
  - [x] Handle prompt failure: cleanup callback, throw error
  - [x] Log 'Prompt sent, waiting for completion...'
  - [x] Await idle promise
  - [x] Return `OpenCodeSession` with sessionId and lastMessage

- [x] **Task 4: Create unit tests** (AC: 1, 2, 3)
  - [x] Test successful session creation and prompt execution
  - [x] Test error when session creation fails
  - [x] Test error when prompt send fails with callback cleanup
  - [x] Mock SDK client methods

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Result Type**: Returns `OpenCodeSession` from `./types.js`
- **Error Handling**: Throws for expected failures (session creation, prompt send)
- **Resource Cleanup**: Callbacks cleaned up on failure

### Technical Requirements

- Method signature: `async runSession(prompt: string, timeoutMs: number, abortSignal?: AbortSignal): Promise<OpenCodeSession>`
- AbortSignal always optional and last parameter
- Check disposed state before any operation

### Implementation Pattern

```typescript
async runSession(
  prompt: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<OpenCodeSession> {
  if (this.isDisposed) {
    throw new Error('OpenCode service disposed - cannot run session');
  }
  await this.initialize();
  if (!this.client) throw new Error('OpenCode client not initialized');

  const sessionResponse = await this.client.session.create({
    body: { title: 'AI Workflow' }
  });
  if (!sessionResponse.data) {
    throw new Error('Failed to create OpenCode session');
  }

  const sessionId = sessionResponse.data.id;

  this.sessionMessageState.set(sessionId, {
    currentMessageId: null,
    messageBuffer: '',
    lastCompleteMessage: '',
  });

  core.info(`[OpenCode] Session created: ${sessionId}`);

  const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);

  const promptResponse = await this.client.session.promptAsync({
    path: { id: sessionId },
    body: { parts: [{ type: 'text', text: prompt }] },
  });

  if (promptResponse.error) {
    const callbacks = this.sessionCompletionCallbacks.get(sessionId);
    if (callbacks?.abortCleanup) callbacks.abortCleanup();
    this.sessionCompletionCallbacks.delete(sessionId);
    throw new Error(`Prompt failed: ${JSON.stringify(promptResponse.error)}`);
  }

  core.info('[OpenCode] Prompt sent, waiting for completion...');
  await idlePromise;

  return { sessionId, lastMessage: this.getLastMessage(sessionId) };
}
```

### Session Interfaces

```typescript
interface SessionCallbacks {
  resolve: () => void;
  reject: (err: Error) => void;
  abortCleanup?: () => void;
}

interface SessionMessageState {
  currentMessageId: string | null;
  messageBuffer: string;
  lastCompleteMessage: string;
}
```

### Cross-Story Dependencies

- Depends on Story 2.1 (singleton pattern)
- Depends on Story 2.2 (initialization)
- Required by Story 2.4 (idle detection)
- Required by Story 2.5 (output streaming)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Async Coordination]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `SessionCallbacks` interface defined at `src/opencode.ts:25-29`
- `SessionMessageState` interface defined at lines 31-35
- `runSession()` method at lines 100-142
- Session created with title 'AI Workflow' at line 112
- Logs session ID at line 123
- Prompt sent via `promptAsync()` at lines 127-130
- Returns `OpenCodeSession` with sessionId and lastMessage at line 141
- All unit tests pass (4 tests in "runSession()" describe block)

### Acceptance Criteria Verification

| AC  | Requirement                                                | Implementation            | Verified                                          |
| --- | ---------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| AC1 | Session created with title, ID logged, prompt sent, logged | `src/opencode.ts:112-138` | ✅ Test "creates session and sends prompt" passes |
| AC2 | Session creation failure throws error                      | `src/opencode.ts:113`     | ✅ Throws 'Failed to create OpenCode session'     |
| AC3 | Prompt failure throws with cleanup                         | `src/opencode.ts:131-136` | ✅ Cleans up callbacks and throws                 |

### File List

- `src/opencode.ts` (modified) - Added runSession() method and interfaces
- `src/opencode.spec.ts` (modified) - Added runSession tests
