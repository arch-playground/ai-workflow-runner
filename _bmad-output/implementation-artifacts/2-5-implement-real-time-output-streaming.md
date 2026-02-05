# Story 2.5: Implement Real-Time Output Streaming

Status: done

## Story

As a **GitHub Actions user**,
I want **AI output streamed to the console**,
So that **I can see what the AI is doing in real-time**.

## Acceptance Criteria

1. **Given** `message.part.updated` event with type='text' **When** `handleEvent()` processes it **Then** `core.info('[OpenCode] {text}')` is called **And** text is accumulated in messageBuffer

2. **Given** `message.part.updated` event with type='tool' **When** `handleEvent()` processes it **Then** `core.info('[OpenCode] Tool: {tool} - {status}')` is called

3. **Given** multiple text parts for same message **When** accumulated **Then** parts with matching messageID are appended to buffer

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Logging conventions
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Define message event types** (AC: 1, 2)
  - [x] Add `MESSAGE_PART_UPDATED: 'message.part.updated'` to EVENT_TYPES constant

- [x] **Task 3: Implement text streaming in handleEvent()** (AC: 1, 3)
  - [x] Handle `message.part.updated` event with type='text'
  - [x] Check if part has text and sessionID
  - [x] Get session state from `sessionMessageState` map
  - [x] Verify messageID matches current message or no current message set
  - [x] Log text via `core.info('[OpenCode] ${text}')`
  - [x] Append text to `messageBuffer`

- [x] **Task 4: Implement tool streaming in handleEvent()** (AC: 2)
  - [x] Handle `message.part.updated` event with type='tool'
  - [x] Check for tool name and state.status
  - [x] Log via `core.info('[OpenCode] Tool: ${tool} - ${status}')`

- [x] **Task 5: Create unit tests** (AC: 1, 2, 3)
  - [x] Test text parts are logged and accumulated
  - [x] Test tool parts are logged correctly
  - [x] Test multiple parts for same message are appended
  - [x] Test parts for different messages start new buffer

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Streaming Latency**: NFR3 requires < 1 second latency
- **Logging Prefix**: Always use `[OpenCode]` prefix
- **Buffer Management**: Per-session message accumulation

### Technical Requirements

- Use `core.info()` for real-time streaming to GitHub Actions console
- Only accumulate text for the current message (not tool outputs)
- Handle edge cases: missing sessionID, missing messageID

### Implementation Pattern

```typescript
if (e.type === EVENT_TYPES.MESSAGE_PART_UPDATED) {
  const part = (
    e.properties as {
      part?: {
        type?: string;
        text?: string;
        messageID?: string;
        sessionID?: string;
        tool?: string;
        state?: { status?: string };
      };
    }
  )?.part;

  // Handle text parts
  if (part?.type === 'text' && part.text && part.sessionID) {
    const state = this.sessionMessageState.get(part.sessionID);
    if (state) {
      // Only accumulate if no current message or matching messageID
      if (!state.currentMessageId || part.messageID === state.currentMessageId) {
        core.info(`[OpenCode] ${part.text}`);
        state.messageBuffer += part.text;
      }
    }
  }

  // Handle tool parts
  if (part?.type === 'tool' && part.tool && part.state?.status) {
    core.info(`[OpenCode] Tool: ${part.tool} - ${part.state.status}`);
  }
}
```

### Event Properties Type

```typescript
interface MessagePartEventProperties {
  part?: {
    type?: string; // 'text' | 'tool'
    text?: string; // Content for text parts
    messageID?: string; // ID of parent message
    sessionID?: string; // Session this belongs to
    tool?: string; // Tool name for tool parts
    state?: {
      status?: string; // Tool execution status
    };
  };
}
```

### Message Accumulation Rules

| Scenario                           | Action                     |
| ---------------------------------- | -------------------------- |
| Text part, current message matches | Append to buffer           |
| Text part, no current message      | Set as current, append     |
| Text part, different messageID     | Ignore (old message)       |
| Tool part                          | Log only, don't accumulate |

### Cross-Story Dependencies

- Depends on Story 2.3 (session state initialization)
- Depends on Story 2.8 (event loop for receiving events)
- Related to Story 2.6 (message capture)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Logging Strategy]
- [Source: _bmad-output/planning-artifacts/prd.md#Output & Streaming]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `MESSAGE_PART_UPDATED` event type at `src/opencode.ts:15`
- Text streaming handler at lines 310-333 (combined handler for text and tool)
- Logs text via `core.info('[OpenCode] ${text}')` at line 329
- Appends text to messageBuffer at line 330
- Tool logging at lines 336-338 via `core.info('[OpenCode] Tool: ${tool} - ${status}')`
- Test "streams message content via core.info()" passes
- Test "accumulates message fragments correctly" passes

### Acceptance Criteria Verification

| AC  | Requirement                                              | Implementation            | Verified                                       |
| --- | -------------------------------------------------------- | ------------------------- | ---------------------------------------------- |
| AC1 | Text parts logged with [OpenCode] prefix and accumulated | `src/opencode.ts:329-330` | ✅ Test passes                                 |
| AC2 | Tool parts logged as 'Tool: {tool} - {status}'           | `src/opencode.ts:337`     | ✅ Implemented                                 |
| AC3 | Multiple parts for same message appended to buffer       | `src/opencode.ts:328-330` | ✅ Test "accumulates message fragments" passes |

### File List

- `src/opencode.ts` (modified) - Added message.part.updated handling
- `src/opencode.spec.ts` (modified) - Added streaming tests
