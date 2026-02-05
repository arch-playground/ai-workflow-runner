# Story 2.2: Implement SDK Initialization

Status: done

## Story

As a **developer**,
I want **lazy SDK initialization with retry support**,
So that **the SDK starts only when needed and can recover from transient failures**.

## Acceptance Criteria

1. **Given** a new OpenCodeService **When** `initialize()` is called **Then** `createOpencode()` is called with hostname '127.0.0.1' and port 0 **And** client and server references are stored **And** event loop is started **And** '[OpenCode] Server started on localhost' is logged

2. **Given** `initialize()` is called while already initializing **When** the same promise is awaited **Then** it reuses the existing initialization promise

3. **Given** initialization fails with transient error **When** `initialize()` is called again **Then** retry is allowed (initializationPromise cleared)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions, SOLID principles
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Minimal logging only

- [x] **Task 2: Add initialization state fields** (AC: 1, 2, 3)
  - [x] Add `private initializationPromise: Promise<void> | null = null`
  - [x] Add `private initializationError: Error | null = null`
  - [x] Add `private isInitialized: boolean = false`

- [x] **Task 3: Implement public initialize() method** (AC: 1, 2, 3)
  - [x] Clear previous error state if retry
  - [x] Return early if already initialized
  - [x] Return existing promise if initialization in progress
  - [x] Call private `doInitialize()` and store promise
  - [x] Handle error: store error, clear promise, rethrow

- [x] **Task 4: Implement private doInitialize() method** (AC: 1)
  - [x] Log '[OpenCode] Initializing SDK server...'
  - [x] Call `createOpencode({ hostname: '127.0.0.1', port: 0 })`
  - [x] Store `client` and `server` references
  - [x] Set `isInitialized = true`
  - [x] Log '[OpenCode] Server started on localhost'
  - [x] Log server URL at debug level
  - [x] Create `eventLoopAbortController`
  - [x] Call `startEventLoop()`

- [x] **Task 5: Create unit tests** (AC: 1, 2, 3)
  - [x] Test SDK initialization with correct parameters
  - [x] Test deduplication of concurrent initialize() calls
  - [x] Test retry after initialization failure
  - [x] Mock `@opencode-ai/sdk` createOpencode function

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Lazy Initialization**: SDK only starts when first needed
- **Deduplication**: Concurrent calls share same initialization promise
- **Retry Support**: Failed initialization can be retried

### Technical Requirements

- Import: `import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';`
- Server info interface for typing the server response
- Use `core.info()` for user-visible logs, `core.debug()` for internal details

### Implementation Pattern

```typescript
async initialize(): Promise<void> {
  // Allow retry after failure
  if (this.initializationError) {
    this.initializationPromise = null;
    this.initializationError = null;
  }
  // Already initialized
  if (this.isInitialized) return;
  // Deduplication - return existing promise
  if (this.initializationPromise) return this.initializationPromise;

  this.initializationPromise = this.doInitialize();
  try {
    await this.initializationPromise;
  } catch (error) {
    this.initializationError = error instanceof Error ? error : new Error(String(error));
    this.initializationPromise = null;
    throw error;
  }
}

private async doInitialize(): Promise<void> {
  core.info('[OpenCode] Initializing SDK server...');
  const opencode = await createOpencode({
    hostname: '127.0.0.1',
    port: 0,
  });
  this.client = opencode.client;
  this.server = opencode.server;
  this.isInitialized = true;
  core.info('[OpenCode] Server started on localhost');
  core.debug(`[OpenCode] Server URL: ${this.server?.url ?? 'unknown'}`);
  this.eventLoopAbortController = new AbortController();
  this.startEventLoop();
}
```

### Server Info Interface

```typescript
interface OpenCodeServerInfo {
  url: string;
  close: () => void;
}
```

### Logging Conventions

| Level            | Usage               | Example                                  |
| ---------------- | ------------------- | ---------------------------------------- |
| `core.info()`    | User-visible status | `[OpenCode] Server started on localhost` |
| `core.debug()`   | Internal details    | `[OpenCode] Server URL: ${url}`          |
| `core.warning()` | Recoverable issues  | `[OpenCode] Reconnection attempt...`     |
| `core.error()`   | Fatal issues        | `[OpenCode] Event loop failed`           |

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Async Coordination]
- [Source: _bmad-output/planning-artifacts/architecture.md#Logging Strategy]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `initialize()` method at `src/opencode.ts:68-83` handles deduplication and retry
- `doInitialize()` at lines 85-98 creates SDK with hostname '127.0.0.1', port 0
- Logs '[OpenCode] Server started on localhost' at line 94
- Debug logs server URL at line 95
- Creates eventLoopAbortController and starts event loop at lines 96-97
- All unit tests pass (4 tests in "initialize()" describe block)

### Acceptance Criteria Verification

| AC  | Requirement                                                    | Implementation          | Verified                                              |
| --- | -------------------------------------------------------------- | ----------------------- | ----------------------------------------------------- |
| AC1 | createOpencode called with correct params, logs server started | `src/opencode.ts:85-98` | ✅ Test passes                                        |
| AC2 | Concurrent calls reuse existing promise                        | `src/opencode.ts:74`    | ✅ Test "is idempotent" passes                        |
| AC3 | Retry allowed after failure                                    | `src/opencode.ts:69-72` | ✅ Test "allows retry after transient failure" passes |

### File List

- `src/opencode.ts` (modified) - Added initialize() and doInitialize() methods
- `src/opencode.spec.ts` (modified) - Added initialization tests
