---
title: 'OpenCode SDK Runner Implementation'
slug: 'opencode-sdk-runner'
created: '2026-02-02'
status: 'completed'
review_notes: |
  - Adversarial review round 1 completed
  - Findings: 17 total, 15 fixed, 2 skipped (F1, F2 - acceptable for Docker container context)
  - Resolution approach: auto-fix for real findings
  - F1 (permission auto-approval) and F2 (inline script execution) are by design
  - F3-F17 fixed: env var isolation, race conditions, TOCTOU, documentation, constants, etc.
  - **Adversarial review round 2 completed (2026-02-04)**
  - Additional findings: 15 total (3 critical, 7 medium, 5 low)
  - Fixed: README.md incorrect limits (64KB→100KB, 1-10→1-20, default 3→5)
  - Fixed: index.ts now logs actual error message in handleShutdown
  - Added: Event loop reconnection tests for AC35/AC36
  - Added: Validation script abort/timeout tests
  - Note: dispose() kept synchronous (no async operations inside), resetOpenCodeService() also sync
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - TypeScript 5.3.x (strict mode)
  - '@opencode-ai/sdk' (latest)
  - Node.js 20.x
  - Python 3.11 (for validation scripts)
  - JavaScript/Node (for validation scripts)
  - GitHub Actions Toolkit (@actions/core ^1.10.1)
  - Jest 29.7.0 (testing)
  - '@vercel/ncc (bundling)'
files_to_modify:
  - src/types.ts (modify - add ValidationScriptType, OpenCodeSession interfaces)
  - src/config.ts (modify - parse validation_script, validation_script_type, validation_max_retry)
  - src/opencode.ts (create - OpenCode SDK service class)
  - src/validation.ts (create - validation script executor)
  - src/runner.ts (modify - replace stub with OpenCode SDK integration)
  - src/index.ts (modify - add OpenCodeService disposal on shutdown)
  - action.yml (modify - add 3 new inputs)
  - package.json (modify - add @opencode-ai/sdk dependency)
  - __tests__/unit/opencode.test.ts (create - SDK service tests)
  - __tests__/unit/validation.test.ts (create - validation executor tests)
  - __tests__/unit/runner.test.ts (modify - update for new behavior)
  - __tests__/unit/config.test.ts (modify - add tests for new inputs)
  - README.md (modify - document new inputs)
code_patterns:
  - Lazy singleton initialization (reference: microservice-swarm OpenCodeSdkService)
  - Event-driven permission auto-approval via event.subscribe() stream
  - Session completion via Map<sessionId, callback> + session.idle event
  - Promise.race for timeout protection with proper cleanup
  - Console streaming via core.info() with [OpenCode] prefix
  - Script type detection by extension (.py/.js) or prefix (python:/javascript:)
  - AbortController for graceful shutdown propagation
  - child_process.spawn() with manual timeout for isolated script execution
  - Message accumulation for complete assistant responses
test_patterns:
  - Jest with jest.mock() for @opencode-ai/sdk
  - Temp directory creation with fs.mkdtempSync() for isolated tests
  - afterEach cleanup with fs.rmSync()
  - createValidInputs() helper pattern for test data
  - Test abort signal handling
  - Test timeout scenarios
  - Test disposal during active sessions
---

# Tech-Spec: OpenCode SDK Runner Implementation

**Created:** 2026-02-02

## Overview

### Problem Statement

The current `runner.ts` is a stub that doesn't execute actual AI workflows. Users need the ability to run agentic AI workflows via OpenCode SDK in GitHub Actions, with console output streaming, lifecycle management, and optional validation scripts to verify workflow completion.

### Solution

Implement OpenCode SDK integration in the runner with:

1. Session management (create, prompt, idle detection)
2. Permission auto-approval event loop
3. Console output streaming to GitHub Actions logs
4. Lifecycle management (start, crash handling, graceful shutdown)
5. Validation script support for workflow completion verification
6. Retry mechanism when validation fails

### Scope

**In Scope:**

- OpenCode SDK integration (`@opencode-ai/sdk`)
- Session creation and async prompt execution
- Permission auto-approval event loop (background)
- Console output streaming to GitHub Actions logs via `core.info()`
- Lifecycle management (initialize → execute → idle → shutdown)
- Crash/error handling with proper SDK disposal
- New action input: `validation_script` (file path or inline script)
- New action input: `validation_script_type` (python/javascript, for inline scripts)
- New action input: `validation_max_retry` (default: 5)
- Pass `AI_LAST_MESSAGE` env var to validation script containing last assistant message
- Retry loop: if validation returns non-empty/non-true, send output as follow-up prompt
- Script type detection by file extension (`.py` → python3, `.js` → node)

**Out of Scope:**

- Changes to existing security/path validation logic (reuse as-is)
- Changes to Docker container setup
- CI/CD workflow changes
- Workflow file parsing/agent routing (workflow file content becomes the prompt)

## Context for Development

### Codebase Patterns

**Current Project Structure:**

```
ai-workflow-runner/
├── src/
│   ├── index.ts          # Main entry with SIGTERM/SIGINT handlers, shutdownController
│   ├── runner.ts         # Stub: validates path, reads file, returns mock result
│   ├── config.ts         # getInputs(), validateInputs() - parses action inputs
│   ├── security.ts       # validateWorkspacePath(), validateRealPath(), maskSecrets()
│   └── types.ts          # ActionInputs, RunnerResult, INPUT_LIMITS
├── __tests__/
│   ├── unit/             # Jest tests with temp dirs, mocked @actions/core
│   └── integration/      # Docker container tests
├── action.yml            # 4 inputs: workflow_path, prompt, env_vars, timeout_minutes
└── package.json          # Dependencies: @actions/core; DevDeps: typescript, jest, ncc
```

**Reference Implementation (microservice-swarm/src/shared/opencode/opencode-sdk.service.ts):**

```typescript
// Key patterns to follow:
// 1. Lazy singleton initialization with double-check
private client: OpencodeClient | null = null;
private isInitialized = false;
private initializationPromise: Promise<void> | null = null;

async initialize(): Promise<void> {
  if (this.isInitialized) return;
  if (this.initializationPromise) return this.initializationPromise;
  this.initializationPromise = this.doInitialize();
  await this.initializationPromise;
}

// 2. Session completion via callback Map
private sessionCompletionCallbacks: Map<string, () => void> = new Map();

// 3. Permission auto-approval in background IIFE
void (async () => {
  for await (const event of client.event.subscribe().stream) {
    if (signal?.aborted) break;
    if (event.type === 'permission.updated') {
      await client.postSessionIdPermissionsPermissionId({
        path: { id: permission.sessionID, permissionID: permission.id },
        body: { response: 'always' },
      });
    }
    if (event.type === 'session.idle' || event.type === 'session.status') {
      const callback = this.sessionCompletionCallbacks.get(sessionID);
      if (callback) { callback(); }
    }
  }
})();

// 4. Proper disposal
async dispose(): Promise<void> {
  if (this.eventLoopAbortController) {
    this.eventLoopAbortController.abort();
  }
  if (this.server) {
    this.server.close();
  }
  this.client = null;
  this.isInitialized = false;
}
```

**Current Config Parsing (src/config.ts):**

- Reserved env vars blocked: PATH, LD_PRELOAD, NODE_OPTIONS, etc.
- GITHUB\_\* prefix blocked
- JSON validation for env_vars
- Size limits enforced (64KB env_vars, 100KB prompt)
- All env_var values masked via core.setSecret()

### Files to Reference

| File                            | Purpose                 | Key Functions/Patterns                                       |
| ------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `src/runner.ts`                 | Current stub to replace | `runWorkflow()`, `executeWorkflow()`, timeout handling       |
| `src/types.ts`                  | Type definitions        | `ActionInputs`, `RunnerResult`, `INPUT_LIMITS`               |
| `src/config.ts`                 | Input parsing           | `getInputs()`, `validateInputs()`, reserved var blocking     |
| `src/security.ts`               | Security utilities      | `validateWorkspacePath()`, `maskSecrets()`, `validateUtf8()` |
| `src/index.ts`                  | Entry point             | `shutdownController`, `handleShutdown()`, signal handlers    |
| `__tests__/unit/runner.test.ts` | Test patterns           | Temp dir setup, cleanup, mocking @actions/core               |

### Technical Decisions

| Decision                     | Choice                                                          | Rationale                                                              |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **SDK Package**              | `@opencode-ai/sdk`                                              | Official OpenCode SDK (same as microservice-swarm)                     |
| **Session Mode**             | `promptAsync` + idle wait                                       | Non-blocking, event-driven; allows streaming while waiting             |
| **Output Streaming**         | `core.info()` with `[OpenCode]` prefix                          | Real-time visibility in GitHub Actions logs                            |
| **Validation Execution**     | `child_process.spawn()` with manual timeout                     | Isolated execution; spawn has no timeout option so use setTimeout+kill |
| **Script Type Detection**    | Extension first, then prefix                                    | `.py`/`.js` for files; `python:`/`javascript:`/`js:` for inline        |
| **Last Message Capture**     | Accumulate text from `message.part.updated` events              | Build complete message from fragments, reset on new message            |
| **Validation Timeout**       | 60 seconds with manual kill                                     | spawn() has no timeout; use setTimeout + child.kill()                  |
| **Inline Script Handling**   | Write to temp file with crypto.randomUUID(), execute, cleanup   | Avoid collision; proper file extension for interpreter                 |
| **Retry on Validation Fail** | Send validation output (truncated to 100KB) as follow-up prompt | Allows AI to fix issues based on validation feedback                   |
| **Env Var Cleanup**          | Pass to child process only, don't pollute process.env           | Avoid leakage between runs in same job                                 |

## Implementation Plan

### Tasks

#### Phase 1: Type Definitions & Configuration

- [x] **Task 1: Update types.ts with new interfaces** (AC: AC1, AC7-AC16)
  - File: `src/types.ts`
  - Action: Add new types after existing `INPUT_LIMITS`

  ```typescript
  // Add to INPUT_LIMITS
  export const INPUT_LIMITS = {
    // ... existing limits ...
    MAX_VALIDATION_RETRY: 20,
    DEFAULT_VALIDATION_RETRY: 5,
    VALIDATION_SCRIPT_TIMEOUT_MS: 60_000,
    INTERPRETER_CHECK_TIMEOUT_MS: 5_000, // FIX #1: Timeout for interpreter --version check
    MAX_VALIDATION_OUTPUT_SIZE: 102_400, // 100KB limit on validation script output
    MAX_LAST_MESSAGE_SIZE: 102_400, // 100KB limit on AI_LAST_MESSAGE
    MAX_INLINE_SCRIPT_SIZE: 102_400, // FIX #8: 100KB limit on inline validation scripts
  } as const;

  // Add after INPUT_LIMITS
  export type ValidationScriptType = 'python' | 'javascript';

  // Update ActionInputs interface - add 3 new optional fields
  export interface ActionInputs {
    workflowPath: string;
    prompt: string;
    envVars: Record<string, string>;
    timeoutMs: number;
    validationScript?: string; // NEW: path or inline script
    validationScriptType?: ValidationScriptType; // NEW: for inline scripts
    validationMaxRetry: number; // NEW: default 5
  }

  // Add new interfaces
  export interface OpenCodeSession {
    sessionId: string;
    lastMessage: string;
  }

  export interface ValidationOutput {
    success: boolean;
    continueMessage: string;
  }
  ```

- [x] **Task 2: Update action.yml with new inputs** (AC: AC7-AC16)
  - File: `action.yml`
  - Action: Add 3 new inputs after `timeout_minutes`

  ```yaml
  validation_script:
    description: 'Optional validation script (file path like check.py or inline with prefix like python:print("ok")). Receives AI_LAST_MESSAGE env. Return empty/true for success, other string to continue workflow.'
    required: false
    default: ''
  validation_script_type:
    description: 'Script type for inline scripts: python or javascript. Auto-detected for file paths by extension (.py or .js). Only required when validation_script is set and type cannot be auto-detected.'
    required: false
    default: ''
  validation_max_retry:
    description: 'Maximum validation retry attempts when script returns non-empty/non-true (default: 5, max: 20)'
    required: false
    default: '5'
  ```

- [x] **Task 3: Update config.ts to parse new inputs** (AC: AC7-AC16, F7, F8)
  - File: `src/config.ts`
  - Action: Add parsing in `getInputs()` function after `timeoutMs` parsing

  ```typescript
  // Add after timeoutMs parsing, before maskSecrets()
  const validationScript = core.getInput('validation_script') || undefined;
  const validationScriptTypeRaw = core.getInput('validation_script_type') || undefined;
  const validationMaxRetryRaw = core.getInput('validation_max_retry') || '5';

  // Validate validation_script_type
  let validationScriptType: ValidationScriptType | undefined;
  if (validationScriptTypeRaw) {
    if (validationScriptTypeRaw !== 'python' && validationScriptTypeRaw !== 'javascript') {
      throw new Error('validation_script_type must be "python" or "javascript"');
    }
    validationScriptType = validationScriptTypeRaw;
  }

  // FIX F8: Validate that validation_script_type without validation_script is an error
  if (validationScriptType && !validationScript) {
    throw new Error('validation_script_type requires validation_script to be set');
  }

  // FIX #8: Validate inline script size limit
  if (validationScript && validationScript.length > INPUT_LIMITS.MAX_INLINE_SCRIPT_SIZE) {
    throw new Error(
      `validation_script exceeds maximum size of ${INPUT_LIMITS.MAX_INLINE_SCRIPT_SIZE} bytes`
    );
  }

  // Validate validation_max_retry
  const validationMaxRetry = parseInt(validationMaxRetryRaw, 10);
  if (
    isNaN(validationMaxRetry) ||
    validationMaxRetry < 1 ||
    validationMaxRetry > INPUT_LIMITS.MAX_VALIDATION_RETRY
  ) {
    throw new Error(
      `validation_max_retry must be between 1 and ${INPUT_LIMITS.MAX_VALIDATION_RETRY}`
    );
  }

  // Return updated object
  return {
    workflowPath,
    prompt,
    envVars,
    timeoutMs,
    validationScript,
    validationScriptType,
    validationMaxRetry,
  };
  ```

- [x] **Task 4: Update config.test.ts with tests for new inputs** (AC: AC7-AC16)
  - File: `__tests__/unit/config.test.ts`
  - Action: Add test cases for new input parsing
  - Tests to add:
    - `getInputs() parses validation_script correctly`
    - `getInputs() parses validation_script_type correctly`
    - `getInputs() defaults validation_max_retry to 5`
    - `getInputs() validates validation_max_retry range (1-20)`
    - `getInputs() rejects invalid validation_script_type`
    - `getInputs() rejects validation_script_type without validation_script` (FIX F8)
    - `getInputs() rejects validation_script exceeding size limit` (FIX #8)

#### Phase 2: OpenCode SDK Service

- [x] **Task 5: Install @opencode-ai/sdk dependency** (AC: AC1)
  - File: `package.json`
  - Action: Add to dependencies section

  ```json
  "dependencies": {
    "@actions/core": "^1.10.1",
    "@opencode-ai/sdk": "^1.1.28"
  }
  ```

  - Run: `npm install`

- [x] **Task 6: Create OpenCode SDK service class** (AC: AC1-AC6, F1, F3, F11, plus fixes #2-#4, #9-#10, #12-#13, #16)
  - File: `src/opencode.ts` (NEW FILE)
  - Action: Create service with all methods, fixing identified issues
  - **NOTE FIX #2 (Circular dependency):** Export singleton getter from opencode.ts, NOT runner.ts. index.ts imports from opencode.ts directly.

  ```typescript
  import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';
  import * as core from '@actions/core';
  import { OpenCodeSession, INPUT_LIMITS } from './types.js';

  interface OpenCodeServerInfo {
    url: string;
    close: () => void;
  }

  // FIX #2: Singleton instance managed here, not in runner.ts
  let openCodeServiceInstance: OpenCodeService | null = null;

  export function getOpenCodeService(): OpenCodeService {
    if (!openCodeServiceInstance) {
      openCodeServiceInstance = new OpenCodeService();
    }
    return openCodeServiceInstance;
  }

  // FIX R3#9: Check if instance exists without creating one
  export function hasOpenCodeServiceInstance(): boolean {
    return openCodeServiceInstance !== null;
  }

  // FIX R3#1: resetOpenCodeService must dispose existing instance to prevent race conditions in tests
  export async function resetOpenCodeService(): Promise<void> {
    if (openCodeServiceInstance) {
      await openCodeServiceInstance.dispose();
      openCodeServiceInstance = null;
    }
  }

  export class OpenCodeService {
    private client: OpencodeClient | null = null;
    private server: OpenCodeServerInfo | null = null;
    private isInitialized = false;
    private isDisposed = false; // FIX F12: Track disposal state
    private initializationPromise: Promise<void> | null = null;
    private initializationError: Error | null = null; // FIX #12: Track init failures
    private eventLoopAbortController: AbortController | null = null;
    private sessionCompletionCallbacks: Map<
      string,
      {
        resolve: () => void;
        reject: (err: Error) => void;
        abortCleanup?: () => void; // FIX #3: Store cleanup function for abort listener
      }
    > = new Map();

    // FIX F1 + FIX R3#10: Accumulate message fragments PER SESSION to handle concurrent sessions
    // Map<sessionId, { currentMessageId, messageBuffer, lastCompleteMessage }>
    private sessionMessageState: Map<
      string,
      {
        currentMessageId: string | null;
        messageBuffer: string;
        lastCompleteMessage: string;
      }
    > = new Map();

    async initialize(): Promise<void> {
      // FIX #12: If previous init failed, allow retry
      if (this.initializationError) {
        this.initializationPromise = null;
        this.initializationError = null;
      }
      if (this.isInitialized) return;
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
      // FIX #9: Don't log full URL, just indicate server is ready
      core.info('[OpenCode] Server started on localhost');
      core.debug(`[OpenCode] Server URL: ${this.server?.url ?? 'unknown'}`); // Debug level only
      this.eventLoopAbortController = new AbortController();
      this.startEventLoop();
    }

    async runSession(
      prompt: string,
      timeoutMs: number,
      abortSignal?: AbortSignal
    ): Promise<OpenCodeSession> {
      await this.initialize();
      if (!this.client) throw new Error('OpenCode client not initialized');

      // FIX F3: Register callback BEFORE creating session to avoid race
      const sessionResponse = await this.client.session.create({ body: { title: 'AI Workflow' } });
      if (!sessionResponse.data) throw new Error('Failed to create OpenCode session');

      const sessionId = sessionResponse.data.id;

      // FIX R3#10: Initialize per-session message tracking
      this.sessionMessageState.set(sessionId, {
        currentMessageId: null,
        messageBuffer: '',
        lastCompleteMessage: '',
      });

      core.info(`[OpenCode] Session created: ${sessionId}`);

      // FIX F3: Setup completion promise BEFORE sending prompt
      const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);

      const promptResponse = await this.client.session.promptAsync({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: prompt }] },
      });
      if (promptResponse.error) {
        // Cleanup the registered callback
        const callbacks = this.sessionCompletionCallbacks.get(sessionId);
        if (callbacks?.abortCleanup) callbacks.abortCleanup(); // FIX #3: Clean abort listener
        this.sessionCompletionCallbacks.delete(sessionId);
        throw new Error(`Prompt failed: ${JSON.stringify(promptResponse.error)}`);
      }

      core.info('[OpenCode] Prompt sent, waiting for completion...');
      await idlePromise;

      // FIX F1 + FIX R3#10: Return accumulated complete message for this session
      return { sessionId, lastMessage: this.getLastMessage(sessionId) };
    }

    async sendFollowUp(
      sessionId: string,
      message: string,
      timeoutMs: number,
      abortSignal?: AbortSignal
    ): Promise<OpenCodeSession> {
      // FIX #13: Check disposed state before proceeding
      if (this.isDisposed) {
        throw new Error('OpenCode service disposed - cannot send follow-up');
      }
      if (!this.client) throw new Error('OpenCode client not initialized');

      // FIX R3#10: Reset message tracking for this session's follow-up
      const sessionState = this.sessionMessageState.get(sessionId);
      if (sessionState) {
        sessionState.currentMessageId = null;
        sessionState.messageBuffer = '';
      }

      // Truncate message if too long (FIX F5 - limit what we send back)
      const truncatedMessage =
        message.length > INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE
          ? message.substring(0, INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE) + '...[truncated]'
          : message;

      core.info(`[OpenCode] Sending follow-up: ${truncatedMessage.substring(0, 100)}...`);

      // FIX F3: Setup completion promise BEFORE sending
      const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);

      await this.client.session.promptAsync({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: truncatedMessage }] },
      });

      await idlePromise;
      return { sessionId, lastMessage: this.getLastMessage(sessionId) };
    }

    // FIX R3#10: getLastMessage now takes sessionId parameter
    getLastMessage(sessionId: string): string {
      // FIX F1 + FIX R3#10: Return complete accumulated message for specific session
      const state = this.sessionMessageState.get(sessionId);
      const message = state?.lastCompleteMessage || state?.messageBuffer || '';
      if (message.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
        core.warning('[OpenCode] Last message truncated due to size limit'); // FIX #15: Log truncation
        return message.substring(0, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) + '...[truncated]';
      }
      return message;
    }

    async dispose(): Promise<void> {
      // FIX #16: Make dispose idempotent - check if already disposed
      if (this.isDisposed) {
        return; // Already disposed, nothing to do
      }
      this.isDisposed = true;

      // FIX F12: Reject any pending session callbacks
      for (const [sessionId, callbacks] of this.sessionCompletionCallbacks) {
        if (callbacks.abortCleanup) callbacks.abortCleanup(); // FIX #3: Clean abort listeners
        callbacks.reject(new Error('OpenCode service disposed'));
      }
      this.sessionCompletionCallbacks.clear();

      // FIX #16: Store references before nullifying to avoid null checks
      const eventController = this.eventLoopAbortController;
      const server = this.server;

      this.eventLoopAbortController = null;
      this.server = null;
      this.client = null;
      this.isInitialized = false;
      this.initializationPromise = null;

      if (eventController) {
        eventController.abort();
      }
      if (server) {
        core.info('[OpenCode] Shutting down server...');
        server.close();
      }
    }

    // FIX R3#6: Event loop with reconnection on transient errors
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
          if (signal?.aborted) return; // Expected on dispose

          core.warning(
            `[OpenCode] Event loop error (attempt ${attempt + 1}/${maxReconnectAttempts}): ${error}`
          );

          // FIX R3#6: Attempt reconnection for transient errors
          if (attempt < maxReconnectAttempts - 1) {
            core.info(`[OpenCode] Attempting to reconnect event loop in ${reconnectDelayMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
            if (!signal?.aborted) {
              void runLoop(attempt + 1);
            }
          } else {
            core.error(
              '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.'
            );
            // Reject all pending callbacks with error since event loop is dead
            for (const [sessionId, callbacks] of this.sessionCompletionCallbacks) {
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

    private handleEvent(event: unknown, client: OpencodeClient): void {
      if (!event || typeof event !== 'object' || !('type' in event)) return;
      const e = event as { type: string; properties?: Record<string, unknown> };

      // Auto-approve permissions - FIX F11: Log failures instead of silent ignore
      if (e.type === 'permission.updated') {
        const permission = e.properties as { sessionID?: string; id?: string };
        if (permission.sessionID && permission.id) {
          void client
            .postSessionIdPermissionsPermissionId({
              path: { id: permission.sessionID, permissionID: permission.id },
              body: { response: 'always' },
            })
            .catch((err) => {
              core.warning(`[OpenCode] Failed to auto-approve permission ${permission.id}: ${err}`);
            });
        }
      }

      // FIX F1 + FIX R3#10: Handle message tracking per session - accumulate fragments
      // FIX #4: Use messageID from part to correlate, not just info.id
      if (e.type === 'message.updated') {
        const info = (e.properties as { info?: { id?: string; role?: string; sessionID?: string } })
          ?.info;
        if (info?.role === 'assistant' && info.id && info.sessionID) {
          const state = this.sessionMessageState.get(info.sessionID);
          if (state) {
            // New assistant message starting - only save previous if different message
            if (
              state.currentMessageId &&
              state.currentMessageId !== info.id &&
              state.messageBuffer
            ) {
              state.lastCompleteMessage = state.messageBuffer;
            }
            if (state.currentMessageId !== info.id) {
              state.currentMessageId = info.id;
              state.messageBuffer = '';
            }
          }
        }
      }

      // Stream message content - FIX F1: Accumulate instead of replace
      // FIX R3#10: Accumulate per session
      if (e.type === 'message.part.updated') {
        const part = (
          e.properties as {
            part?: { type?: string; text?: string; messageID?: string; sessionID?: string };
          }
        )?.part;
        if (part?.type === 'text' && part.text && part.sessionID) {
          const state = this.sessionMessageState.get(part.sessionID);
          if (state) {
            // FIX #4: Only accumulate if messageID matches current (or no tracking yet)
            if (!state.currentMessageId || part.messageID === state.currentMessageId) {
              core.info(`[OpenCode] ${part.text}`);
              state.messageBuffer += part.text;
            }
          }
        }
      }

      // Handle tool responses
      if (e.type === 'message.part.updated') {
        const part = (
          e.properties as { part?: { type?: string; tool?: string; state?: { status?: string } } }
        )?.part;
        if (part?.type === 'tool' && part.tool && part.state?.status) {
          core.info(`[OpenCode] Tool: ${part.tool} - ${part.state.status}`);
        }
      }

      // Handle session idle or error - FIX #10: Also handle error status
      if (e.type === 'session.idle' || e.type === 'session.status') {
        const props = e.properties as {
          sessionID?: string;
          status?: { type?: string; error?: string };
        };
        const sessionID = props?.sessionID;
        const statusType = props?.status?.type;
        const isIdle = e.type === 'session.idle' || statusType === 'idle';
        const isError = statusType === 'error' || statusType === 'disconnected';

        if (sessionID && (isIdle || isError)) {
          // FIX R3#10: Save current buffer as complete message for this session
          const state = this.sessionMessageState.get(sessionID);
          if (state && state.messageBuffer) {
            state.lastCompleteMessage = state.messageBuffer;
          }

          const callbacks = this.sessionCompletionCallbacks.get(sessionID);
          if (callbacks) {
            if (callbacks.abortCleanup) callbacks.abortCleanup(); // FIX #3: Clean abort listener
            this.sessionCompletionCallbacks.delete(sessionID);

            if (isError) {
              // FIX #10: Reject with error for error/disconnected status
              callbacks.reject(
                new Error(`Session ${statusType}: ${props?.status?.error || 'unknown error'}`)
              );
            } else {
              callbacks.resolve();
            }
          }
        }
      }
    }

    private waitForSessionIdle(
      sessionId: string,
      timeoutMs: number,
      abortSignal?: AbortSignal
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        // FIX F12: Check if already disposed
        if (this.isDisposed) {
          reject(new Error('OpenCode service disposed'));
          return;
        }

        const timeoutId = setTimeout(() => {
          const callbacks = this.sessionCompletionCallbacks.get(sessionId);
          if (callbacks?.abortCleanup) callbacks.abortCleanup(); // FIX #3
          this.sessionCompletionCallbacks.delete(sessionId);
          reject(new Error(`Session ${sessionId} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        // FIX #3: Create abort handler that can be removed
        let abortCleanup: (() => void) | undefined;
        if (abortSignal) {
          const abortHandler = () => {
            clearTimeout(timeoutId);
            this.sessionCompletionCallbacks.delete(sessionId);
            reject(new Error('Session aborted'));
          };
          abortSignal.addEventListener('abort', abortHandler, { once: true });
          // Store cleanup function to remove listener on success
          abortCleanup = () => {
            abortSignal.removeEventListener('abort', abortHandler);
          };
        }

        // FIX F3: Store both resolve and reject for proper cleanup on dispose
        // FIX #3: Store abortCleanup for memory leak prevention
        this.sessionCompletionCallbacks.set(sessionId, {
          resolve: () => {
            clearTimeout(timeoutId);
            if (abortCleanup) abortCleanup(); // FIX #3: Remove abort listener on success
            resolve();
          },
          reject: (err: Error) => {
            clearTimeout(timeoutId);
            if (abortCleanup) abortCleanup(); // FIX #3: Remove abort listener on error
            reject(err);
          },
          abortCleanup,
        });
      });
    }
  }
  ```

- [x] **Task 7: Add unit tests for OpenCodeService** (AC: AC1-AC6, F12, plus fixes #2-#4, #9-#10, #12-#13, #14-#16)
  - File: `__tests__/unit/opencode.test.ts` (NEW FILE)
  - Action: Create comprehensive tests
  - Tests to include:
    - `initialize() creates client and server`
    - `initialize() is idempotent (only initializes once)`
    - `initialize() allows retry after transient failure` (FIX #12)
    - `runSession() creates session and sends prompt`
    - `runSession() waits for session idle`
    - `runSession() accumulates message fragments correctly` (FIX F1)
    - `runSession() correlates message parts by messageID` (FIX #4)
    - `sendFollowUp() sends message to existing session`
    - `sendFollowUp() truncates long messages` (FIX F5)
    - `sendFollowUp() throws if service is disposed` (FIX #13)
    - `dispose() cleans up all resources`
    - `dispose() aborts event loop`
    - `dispose() rejects pending session callbacks` (FIX F12)
    - `dispose() is idempotent (safe to call multiple times)` (FIX #16)
    - `dispose() removes abort listeners to prevent memory leak` (FIX #3)
    - `handles permission.updated events by auto-approving`
    - `logs permission approval failures` (FIX F11)
    - `handles session.idle events by invoking callbacks`
    - `handles session.status with error type by rejecting callback` (FIX #10)
    - `handles session.status with disconnected type by rejecting callback` (FIX #10)
    - `streams message content via core.info()`
    - `tracks complete last assistant message` (FIX F1)
    - `logs warning when message is truncated` (FIX #15)
    - `logs server URL at debug level only` (FIX #9)
    - `handles timeout during waitForSessionIdle`
    - `handles abort signal during waitForSessionIdle`
    - `removes abort listener on successful completion` (FIX #3)
    - `handles early idle event (race condition)` (FIX F3)
    - `getOpenCodeService() returns singleton instance` (FIX #2)
    - `resetOpenCodeService() disposes existing instance before clearing` (FIX R3#1)
    - `hasOpenCodeServiceInstance() returns false when not initialized` (FIX R3#9)
    - `hasOpenCodeServiceInstance() returns true after getOpenCodeService()` (FIX R3#9)
    - `handles concurrent runSession calls with separate message buffers` (FIX R3#10)
    - `event loop attempts reconnection on transient error` (FIX R3#6)
    - `event loop rejects all callbacks after max reconnection attempts` (FIX R3#6)
    - `getLastMessage(sessionId) returns message for specific session` (FIX R3#10)

#### Phase 3: Validation Script Executor

- [x] **Task 8: Create validation script executor** (AC: AC7-AC15, F2, F4, F5, F6, F9, F10)
  - File: `src/validation.ts` (NEW FILE)
  - Action: Create executor with script type detection and execution, fixing identified issues

  ```typescript
  import { spawn, ChildProcess } from 'child_process';
  import { randomUUID } from 'crypto';
  import * as fs from 'fs';
  import * as path from 'path';
  import * as os from 'os';
  import * as core from '@actions/core';
  import { ValidationScriptType, ValidationOutput, INPUT_LIMITS } from './types.js';
  import { validateWorkspacePath } from './security.js';

  export interface ValidationInput {
    script: string;
    scriptType?: ValidationScriptType;
    lastMessage: string;
    workspacePath: string;
    envVars: Record<string, string>;
    abortSignal?: AbortSignal; // FIX F4: Add abort signal support
  }

  export function detectScriptType(
    script: string,
    providedType?: ValidationScriptType
  ): { type: ValidationScriptType; code: string; isInline: boolean } {
    // FIX #7: Check file extension first (case-insensitive)
    const lowerScript = script.toLowerCase();

    // FIX R3#14: Reject unsupported script types explicitly
    if (lowerScript.endsWith('.sh') || lowerScript.endsWith('.bash')) {
      throw new Error(
        'Shell scripts (.sh, .bash) are not supported. Use Python (.py) or JavaScript (.js) for validation scripts.'
      );
    }
    if (lowerScript.endsWith('.ts')) {
      throw new Error(
        'TypeScript (.ts) is not directly supported. Use JavaScript (.js) or compile TypeScript to JavaScript first.'
      );
    }

    if (lowerScript.endsWith('.py')) return { type: 'python', code: script, isInline: false };
    if (lowerScript.endsWith('.js')) return { type: 'javascript', code: script, isInline: false };

    // Check inline prefixes (case-insensitive for prefix matching)
    // FIX R3#8: Validate that inline scripts have actual code after prefix
    if (lowerScript.startsWith('python:')) {
      const code = script.slice(7).trim();
      if (!code) throw new Error('Empty inline script: python: prefix provided with no code');
      return { type: 'python', code, isInline: true };
    }
    if (lowerScript.startsWith('javascript:')) {
      const code = script.slice(11).trim();
      if (!code) throw new Error('Empty inline script: javascript: prefix provided with no code');
      return { type: 'javascript', code, isInline: true };
    }
    if (lowerScript.startsWith('js:')) {
      const code = script.slice(3).trim();
      if (!code) throw new Error('Empty inline script: js: prefix provided with no code');
      return { type: 'javascript', code, isInline: true };
    }

    // Use provided type
    if (providedType) return { type: providedType, code: script, isInline: true };

    throw new Error(
      'Cannot determine script type. Use file extension (.py/.js), prefix (python:/javascript:), or set validation_script_type.'
    );
  }

  // FIX F10 + FIX #1: Check if interpreter is available WITH TIMEOUT
  async function checkInterpreterAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(command, ['--version'], { stdio: 'ignore' });

      // FIX #1: Add timeout for interpreter check to prevent hanging
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolve(false); // Treat timeout as unavailable
      }, INPUT_LIMITS.INTERPRETER_CHECK_TIMEOUT_MS);

      child.on('error', () => {
        clearTimeout(timeoutId);
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve(code === 0);
      });
    });
  }

  export async function executeValidationScript(input: ValidationInput): Promise<ValidationOutput> {
    const { script, scriptType, lastMessage, workspacePath, envVars, abortSignal } = input;
    const detection = detectScriptType(script, scriptType);

    // FIX F10: Check interpreter availability before running
    const command = detection.type === 'python' ? 'python3' : 'node';
    const isAvailable = await checkInterpreterAvailable(command);
    if (!isAvailable) {
      throw new Error(
        `${command} interpreter not found. Ensure ${detection.type === 'python' ? 'Python 3' : 'Node.js'} is installed.`
      );
    }

    core.info(`[Validation] Executing ${detection.type} script (inline: ${detection.isInline})`);

    let scriptPath: string;
    let tempFile: string | null = null;

    if (detection.isInline) {
      // FIX F6: Use crypto.randomUUID() for unique temp file names
      // FIX #11: Create temp file with restricted permissions (0o600 = owner read/write only)
      const ext = detection.type === 'python' ? '.py' : '.js';
      tempFile = path.join(os.tmpdir(), `validation-${randomUUID()}${ext}`);
      fs.writeFileSync(tempFile, detection.code, { encoding: 'utf8', mode: 0o600 });
      scriptPath = tempFile;
    } else {
      // Validate file path is within workspace
      scriptPath = validateWorkspacePath(workspacePath, detection.code);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Validation script not found: ${detection.code}`);
      }
    }

    try {
      const output = await runScript(command, scriptPath, lastMessage, envVars, abortSignal);
      return parseValidationOutput(output);
    } finally {
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  // FIX F2: Implement manual timeout since spawn() doesn't have timeout option
  function runScript(
    command: string,
    scriptPath: string,
    lastMessage: string,
    envVars: Record<string, string>,
    abortSignal?: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // FIX F5: Truncate lastMessage if too large to prevent OOM in child
      // FIX R3#5: Remove null bytes that could corrupt env var in some shells
      let sanitizedLastMessage = lastMessage.replace(/\x00/g, '');
      if (sanitizedLastMessage.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
        sanitizedLastMessage =
          sanitizedLastMessage.substring(0, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) + '...[truncated]';
      }

      // FIX F7: Don't modify process.env, pass env only to child
      const childEnv = { ...process.env, ...envVars, AI_LAST_MESSAGE: sanitizedLastMessage };

      const child: ChildProcess = spawn(command, [scriptPath], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'], // Don't inherit stdio
      });

      let stdout = '';
      let stderr = '';
      let killed = false;
      let sigkillTimeoutId: NodeJS.Timeout | null = null; // FIX R3#16: Track SIGKILL timeout separately

      // FIX F2: Manual timeout implementation
      // FIX R3#16: Track process exit to know if SIGKILL is needed (child.killed is unreliable)
      let processExited = false;
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        // FIX R3#16: Force kill after 5 seconds if process hasn't exited (not just if signal wasn't sent)
        sigkillTimeoutId = setTimeout(() => {
          if (!processExited) {
            core.warning('[Validation] Process did not respond to SIGTERM, sending SIGKILL');
            child.kill('SIGKILL');
          }
        }, 5000);
      }, INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS);

      // FIX F4: Handle abort signal
      if (abortSignal) {
        abortSignal.addEventListener(
          'abort',
          () => {
            killed = true;
            clearTimeout(timeoutId);
            child.kill('SIGTERM');
          },
          { once: true }
        );
      }

      // FIX F5: Limit output size to prevent OOM
      // FIX #15: Track if output was truncated for logging
      let outputSize = 0;
      let outputTruncated = false;
      const maxOutputSize = INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE;

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (outputSize < maxOutputSize) {
          const remaining = maxOutputSize - outputSize;
          stdout += chunk.substring(0, remaining);
          if (chunk.length > remaining) {
            outputTruncated = true;
          }
        } else if (!outputTruncated) {
          outputTruncated = true;
        }
        outputSize += chunk.length;
      });

      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < 10000) {
          // Limit stderr too
          stderr += data.toString().substring(0, 10000 - stderr.length);
        }
      });

      child.on('close', (code) => {
        processExited = true; // FIX R3#16: Mark process as exited
        clearTimeout(timeoutId);
        if (sigkillTimeoutId) clearTimeout(sigkillTimeoutId); // FIX R3#16: Clear SIGKILL timeout

        // FIX #15: Log if output was truncated
        if (outputTruncated) {
          core.warning(`[Validation] Script output truncated (exceeded ${maxOutputSize} bytes)`);
        }

        if (killed && !abortSignal?.aborted) {
          // Timeout occurred
          core.warning(
            `[Validation] Script timed out after ${INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS}ms`
          );
          resolve(
            stdout || `Script timed out after ${INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS}ms`
          );
        } else if (abortSignal?.aborted) {
          reject(new Error('Validation script aborted'));
        } else if (code === 0) {
          resolve(stdout);
        } else {
          // FIX F9: Document that non-zero exit with output uses output, not exit code
          core.warning(`[Validation] Script exited with code ${code}: ${stderr}`);
          resolve(stdout || stderr || `Script failed with exit code ${code}`);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to execute validation script: ${err.message}`));
      });
    });
  }

  function parseValidationOutput(output: string): ValidationOutput {
    const trimmed = output.trim().toLowerCase();
    const success = trimmed === '' || trimmed === 'true';
    return {
      success,
      continueMessage: success ? '' : output.trim(),
    };
  }
  ```

- [x] **Task 9: Add unit tests for validation executor** (AC: AC7-AC15, plus fixes #1, #5, #7, #8, #11, #15)
  - File: `__tests__/unit/validation.test.ts` (NEW FILE)
  - Action: Create comprehensive tests
  - Tests to include:
    - `detectScriptType() returns python for .py files`
    - `detectScriptType() returns javascript for .js files`
    - `detectScriptType() handles .PY extension (case-insensitive)` (FIX #7)
    - `detectScriptType() handles .JS extension (case-insensitive)` (FIX #7)
    - `detectScriptType() handles python: prefix`
    - `detectScriptType() handles PYTHON: prefix (case-insensitive)` (FIX #7)
    - `detectScriptType() handles javascript: prefix`
    - `detectScriptType() handles js: prefix`
    - `detectScriptType() uses provided scriptType for ambiguous input`
    - `detectScriptType() throws when type cannot be determined`
    - `executeValidationScript() runs Python script`
    - `executeValidationScript() runs JavaScript script`
    - `executeValidationScript() handles inline scripts`
    - `executeValidationScript() creates temp file with restricted permissions (0o600)` (FIX #11)
    - `executeValidationScript() passes AI_LAST_MESSAGE env var`
    - `executeValidationScript() passes user envVars`
    - `executeValidationScript() truncates large AI_LAST_MESSAGE` (FIX F5)
    - `executeValidationScript() returns success for empty output`
    - `executeValidationScript() returns success for 'true' output`
    - `executeValidationScript() returns success for 'TRUE' output`
    - `executeValidationScript() returns failure with message for other output`
    - `executeValidationScript() validates script path is in workspace`
    - `executeValidationScript() throws for non-existent script file`
    - `executeValidationScript() cleans up temp files for inline scripts`
    - `executeValidationScript() uses unique temp file names` (FIX F6)
    - `executeValidationScript() times out hung scripts` (FIX F2)
    - `executeValidationScript() times out hung interpreter check` (FIX #1)
    - `executeValidationScript() handles abort signal` (FIX F4)
    - `executeValidationScript() checks interpreter availability` (FIX F10)
    - `executeValidationScript() limits output size` (FIX F5)
    - `executeValidationScript() logs warning when output is truncated` (FIX #15)
    - `executeValidationScript() does not pollute process.env` (FIX F7)
    - `detectScriptType() rejects .sh shell scripts with clear error` (FIX R3#14)
    - `detectScriptType() rejects .ts TypeScript files with clear error` (FIX R3#14)
    - `detectScriptType() throws for empty inline script (python: only)` (FIX R3#8)
    - `executeValidationScript() removes null bytes from AI_LAST_MESSAGE` (FIX R3#5)
    - `executeValidationScript() sends SIGKILL if SIGTERM ignored` (FIX R3#16)
    - `executeValidationScript() returns success for whitespace-only output` (FIX R3#4 - documented)

#### Phase 4: Runner Integration

- [x] **Task 10: Refactor runner.ts to use OpenCodeService** (AC: AC1-AC6, AC16, F7, F14, FIX #2)
  - File: `src/runner.ts`
  - Action: Replace stub implementation with OpenCode execution
  - Changes:
    1. Import `getOpenCodeService` from `./opencode.js` (FIX #2: NOT define singleton here)
    2. Import `executeValidationScript` from `./validation.js`
    3. Update `runWorkflow()` to be async and use OpenCodeService
    4. Keep existing path validation (validateWorkspacePath, validateRealPath, validateUtf8)
    5. FIX F14: Validate workflow file is not empty
    6. Read workflow file content and combine with prompt input
    7. FIX F7: Don't pollute process.env - pass envVars only where needed
    8. Call `getOpenCodeService().runSession()` instead of stub
    9. Add validation loop after session completes
    10. NOTE: Do NOT export `getOpenCodeService()` - it's exported from opencode.ts (FIX #2)

  ```typescript
  // Key changes to runWorkflow():
  export async function runWorkflow(
    inputs: ActionInputs,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    abortSignal?: AbortSignal
  ): Promise<RunnerResult> {
    // ... existing path validation ...

    // Read workflow file content
    const workflowContent = fs.readFileSync(absolutePath, 'utf8');

    // FIX F14: Validate workflow file is not empty
    if (!workflowContent.trim()) {
      return {
        success: false,
        output: '',
        error: 'Workflow file is empty',
      };
    }

    // Combine with prompt if provided
    const fullPrompt = inputs.prompt
      ? `${workflowContent}\n\n---\n\nUser Input:\n${inputs.prompt}`
      : workflowContent;

    // FIX F7: Don't set env vars on process.env - pass them only to validation scripts
    // Environment variables will be passed to validation scripts, not set globally

    // Initialize and run OpenCode session
    const opencode = getOpenCodeService();
    let session: OpenCodeSession;

    try {
      session = await opencode.runSession(fullPrompt, timeoutMs, abortSignal);

      // Validation loop
      if (inputs.validationScript) {
        session = await runValidationLoop(opencode, session, inputs, timeoutMs, abortSignal);
      }

      return {
        success: true,
        output: JSON.stringify({
          sessionId: session.sessionId,
          lastMessage: session.lastMessage,
        }),
      };
    } catch (error) {
      // Ensure cleanup on error
      await opencode.dispose().catch(() => {});
      throw error;
    }
  }
  ```

- [x] **Task 11: Implement validation retry loop** (AC: AC7-AC16, F4)
  - File: `src/runner.ts`
  - Action: Add `runValidationLoop()` function

  ```typescript
  async function runValidationLoop(
    opencode: OpenCodeService,
    session: OpenCodeSession,
    inputs: ActionInputs,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<OpenCodeSession> {
    const workspace = process.env['GITHUB_WORKSPACE'] || '/github/workspace';

    for (let attempt = 1; attempt <= inputs.validationMaxRetry; attempt++) {
      core.info(`[Validation] Attempt ${attempt}/${inputs.validationMaxRetry}`);

      try {
        const validationResult = await executeValidationScript({
          script: inputs.validationScript!,
          scriptType: inputs.validationScriptType,
          lastMessage: session.lastMessage,
          workspacePath: workspace,
          envVars: inputs.envVars,
          abortSignal, // FIX F4: Pass abort signal to validation
        });

        if (validationResult.success) {
          core.info('[Validation] Success - workflow complete');
          return session;
        }

        if (attempt === inputs.validationMaxRetry) {
          throw new Error(
            `Validation failed after ${inputs.validationMaxRetry} attempts. Last output: ${validationResult.continueMessage}`
          );
        }

        core.info(`[Validation] Retry - sending feedback to OpenCode`);
        session = await opencode.sendFollowUp(
          session.sessionId,
          validationResult.continueMessage,
          timeoutMs,
          abortSignal
        );
      } catch (error) {
        // If aborted, rethrow
        if (abortSignal?.aborted) {
          throw error;
        }

        // For other errors (interpreter not found, etc.), treat as validation failure
        if (attempt === inputs.validationMaxRetry) {
          throw error;
        }

        core.warning(`[Validation] Error on attempt ${attempt}: ${error}`);
        // Continue to next attempt
      }
    }

    return session;
  }
  ```

- [x] **Task 12: Update index.ts for lifecycle management** (AC: AC6, FIX #2)
  - File: `src/index.ts`
  - Action: Add OpenCodeService disposal on shutdown
  - Changes:
    1. Import `getOpenCodeService` from `./opencode.js` (FIX #2: NOT from runner.ts to avoid circular dependency)
    2. Update `handleShutdown()` to call `opencode.dispose()`

  ```typescript
  // At top of file:
  // FIX #2 + FIX R3#9: Import both getter and a way to check if instance exists
  import { getOpenCodeService, hasOpenCodeServiceInstance } from './opencode.js';

  // In handleShutdown():
  async function handleShutdown(signal: string): Promise<void> {
    core.info(`Received ${signal}, initiating graceful shutdown...`);
    shutdownController.abort();

    // FIX R3#9: Only dispose if service was actually initialized (don't create just to dispose)
    if (hasOpenCodeServiceInstance()) {
      try {
        const opencode = getOpenCodeService();
        await opencode.dispose();
      } catch {
        // Service disposal failed, log but continue
        core.warning('[Shutdown] Failed to dispose OpenCode service');
      }
    }

    // ... existing timeout and exit logic ...
  }
  ```

- [x] **Task 13: Update runner.test.ts for new behavior** (AC: AC1-AC16, plus fixes #2, #6, #14)
  - File: `__tests__/unit/runner.test.ts`
  - Action: Update tests for OpenCode integration
  - Changes:
    1. Mock `@opencode-ai/sdk` module
    2. Mock `executeValidationScript` from `./validation.js`
    3. Mock `getOpenCodeService` from `./opencode.js` (FIX #2)
    4. Use `resetOpenCodeService()` in beforeEach for test isolation (FIX #2)
    5. Update existing tests to expect async behavior
    6. Add tests for validation loop
    7. Add tests for OpenCode session creation
    8. Add tests for follow-up messages
  - New tests:
    - `runWorkflow() initializes OpenCodeService via getOpenCodeService()` (FIX #2)
    - `runWorkflow() sends workflow content as prompt`
    - `runWorkflow() combines workflow and user prompt`
    - `runWorkflow() returns error for empty workflow file` (FIX F14)
    - `runWorkflow() runs validation script when provided`
    - `runWorkflow() retries on validation failure`
    - `runWorkflow() fails after max validation retries`
    - `runWorkflow() succeeds without validation script`
    - `runWorkflow() disposes OpenCode on error`
    - `runWorkflow() does not pollute process.env` (FIX F7)
    - `runWorkflow() passes abort signal to validation` (FIX F4)
    - `runWorkflow() handles validation error on non-last attempt` (FIX #6)
    - `runValidationLoop() handles concurrent calls safely` (FIX #14)

#### Phase 5: Documentation & Finalization

- [x] **Task 14: Update README.md** (AC: All)
  - File: `README.md`
  - Action: Document new inputs and validation script feature
  - Add sections:
    - New inputs table (validation_script, validation_script_type, validation_max_retry)
    - Validation script examples (Python file, JS file, inline)
    - AI_LAST_MESSAGE environment variable explanation
    - Note about exit code behavior (FIX F9): "Success is determined by script output, not exit code. A script that exits with code 0 but outputs 'error' will trigger retry. A script that exits with code 1 but outputs 'true' will be treated as success."
    - Retry behavior documentation
    - Size limits (100KB for AI_LAST_MESSAGE, 100KB for validation output)
    - Interpreter requirements (Python 3 or Node.js must be installed)
    - Example workflows with validation
    - Security note about inline scripts

- [x] **Task 15: Final quality checks** (AC: All)
  - Action: Run quality check commands
  ```bash
  npm run lint
  npm run format
  npm run typecheck
  npm run test:unit
  npm run bundle
  ```

  - Verify: All checks pass
  - Verify: dist/index.js is updated

### Acceptance Criteria

#### OpenCode SDK Integration

- [ ] **AC1:** Given a valid workflow file, when the action runs, then OpenCode SDK session is created and workflow content is sent as prompt
- [ ] **AC2:** Given OpenCode requests permission, when `permission.updated` event is received, then permission is auto-approved with response 'always' (failures logged)
- [ ] **AC3:** Given OpenCode outputs text, when `message.part.updated` event with type='text' is received, then content is streamed to GitHub Actions console via `core.info('[OpenCode] ...')` and fragments are accumulated
- [ ] **AC4:** Given OpenCode session goes idle, when `session.idle` or `session.status` (type='idle') event is received, then runner detects completion via callback (handling race condition by registering callback before prompt)
- [ ] **AC5:** Given timeout is exceeded, when waiting for session idle, then runner throws timeout error and sets status to 'timeout'
- [ ] **AC6:** Given SIGTERM/SIGINT signal, when shutdown is initiated, then `OpenCodeService.dispose()` is called, event loop is aborted, pending callbacks are rejected, server is closed

#### Validation Script

- [ ] **AC7:** Given `validation_script` ends with `.py`, when script type is detected, then 'python' type is returned and `python3` command is used (after verifying interpreter exists)
- [ ] **AC8:** Given `validation_script` ends with `.js`, when script type is detected, then 'javascript' type is returned and `node` command is used (after verifying interpreter exists)
- [ ] **AC9:** Given `validation_script` starts with `python:`, when executed, then prefix is stripped and inline Python code is written to temp file (with UUID name) and executed with `python3`
- [ ] **AC10:** Given `validation_script` starts with `javascript:` or `js:`, when executed, then prefix is stripped and inline JavaScript code is written to temp file (with UUID name) and executed with `node`
- [ ] **AC11:** Given validation script executes, when spawned, then `AI_LAST_MESSAGE` env var contains the last assistant message text (truncated to 100KB) and user's `env_vars` are passed (via child env only, not process.env)
- [ ] **AC12:** Given validation script outputs empty string (after trim), when result is parsed, then `success=true` and workflow completes
- [ ] **AC13:** Given validation script outputs 'true' (case-insensitive, trimmed), when result is parsed, then `success=true` and workflow completes
- [ ] **AC14:** Given validation script outputs any other string, when result is parsed, then `success=false` and output string (truncated to 100KB) is sent as follow-up prompt to OpenCode
- [ ] **AC15:** Given validation fails `validation_max_retry` times, when max retry reached, then action fails with error containing last validation output

#### No Validation Script

- [ ] **AC16:** Given `validation_script` is empty/not provided, when OpenCode session goes idle, then workflow completes successfully immediately without validation

#### Additional Criteria (from fixes)

- [ ] **AC17:** Given `validation_script_type` is set without `validation_script`, when inputs are parsed, then config throws error
- [ ] **AC18:** Given validation script hangs, when 60 seconds elapses, then script is killed with SIGTERM (then SIGKILL after 5s) and timeout message is returned
- [ ] **AC19:** Given empty workflow file, when action runs, then error is returned "Workflow file is empty"
- [ ] **AC20:** Given SIGTERM during validation script execution, when abort signal is triggered, then child process is killed

#### Additional Criteria (from adversarial review round 2)

- [ ] **AC21:** Given interpreter check (python3 --version or node --version) hangs, when 5 seconds elapses, then check times out and returns "interpreter not found" error (FIX #1)
- [ ] **AC22:** Given index.ts imports `getOpenCodeService`, when import path is resolved, then it imports from `./opencode.js` NOT `./runner.js` to avoid circular dependency (FIX #2)
- [ ] **AC23:** Given session completes successfully, when abort listener was registered, then abort listener is removed to prevent memory leak (FIX #3)
- [ ] **AC24:** Given message.part.updated events arrive, when accumulating text, then only parts with matching messageID are accumulated to current buffer (FIX #4)
- [ ] **AC25:** Given validation_script file path has uppercase extension (.PY, .JS), when script type is detected, then extension is matched case-insensitively (FIX #7)
- [ ] **AC26:** Given inline validation_script exceeds 100KB, when inputs are parsed, then config throws error about size limit (FIX #8)
- [ ] **AC27:** Given OpenCode server starts, when URL is logged, then full URL is logged at debug level only, info level shows "Server started on localhost" (FIX #9)
- [ ] **AC28:** Given session enters error or disconnected status, when session.status event is received, then callback is rejected with error message (FIX #10)
- [ ] **AC29:** Given inline script is written to temp file, when file is created, then file permissions are 0o600 (owner read/write only) (FIX #11)
- [ ] **AC30:** Given SDK initialization fails with transient error, when initialize() is called again, then retry is allowed (initializationPromise is cleared) (FIX #12)
- [ ] **AC31:** Given service is disposed, when sendFollowUp() is called, then error is thrown "OpenCode service disposed - cannot send follow-up" (FIX #13)
- [ ] **AC32:** Given validation script output exceeds 100KB, when output is captured, then warning is logged indicating truncation occurred (FIX #15)
- [ ] **AC33:** Given dispose() is called multiple times, when second call occurs, then it returns immediately without error (idempotent) (FIX #16)

#### Additional Criteria (from adversarial review round 3)

- [ ] **AC34:** Given `resetOpenCodeService()` is called during tests, when existing instance exists, then it is disposed before clearing singleton (FIX R3#1)
- [ ] **AC35:** Given event loop encounters transient error, when reconnection is attempted, then up to 3 retry attempts are made with 1s delay (FIX R3#6)
- [ ] **AC36:** Given event loop fails all reconnection attempts, when max retries exceeded, then all pending session callbacks are rejected with error (FIX R3#6)
- [ ] **AC37:** Given validation script ignores SIGTERM, when 5 seconds pass after SIGTERM, then SIGKILL is sent (based on process exit, not child.killed flag) (FIX R3#16)
- [ ] **AC38:** Given empty inline script prefix (e.g., "python:" with no code), when detectScriptType() is called, then error is thrown "Empty inline script" (FIX R3#8)
- [ ] **AC39:** Given shell script file (.sh, .bash), when detectScriptType() is called, then error is thrown "Shell scripts not supported" (FIX R3#14)
- [ ] **AC40:** Given AI message contains null bytes, when passed to validation script, then null bytes are stripped before setting AI_LAST_MESSAGE env var (FIX R3#5)
- [ ] **AC41:** Given concurrent runSession calls on same service, when messages arrive, then each session has its own message buffer (FIX R3#10)
- [ ] **AC42:** Given `handleShutdown()` is called before service initialization, when checking for instance, then `hasOpenCodeServiceInstance()` returns false and no disposal is attempted (FIX R3#9)

## Additional Context

### Dependencies

**New Production Dependencies:**

- `@opencode-ai/sdk@^1.1.28` - OpenCode SDK for AI workflow execution

**Existing Dependencies (unchanged):**

- `@actions/core@^1.10.1` - GitHub Actions toolkit

### Testing Strategy

| Level           | Tool           | What to Test                                                                        |
| --------------- | -------------- | ----------------------------------------------------------------------------------- |
| **Unit**        | Jest + mocks   | OpenCodeService (mocked SDK), validation executor, config parsing, script detection |
| **Integration** | Jest           | Full runner flow with mocked OpenCode SDK                                           |
| **E2E**         | GitHub Actions | Real workflow execution (requires OpenCode API key)                                 |

### Error Handling

| Scenario                                         | Handling                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| OpenCode SDK initialization fails                | Return failure with error message; allow retry on next call (FIX #12)         |
| Session creation fails                           | Return failure with error message                                             |
| Prompt send fails                                | Return failure with error message, cleanup callback + abort listener (FIX #3) |
| Session timeout                                  | Return timeout status, dispose SDK                                            |
| Session enters error/disconnected status         | Reject callback with error message (FIX #10)                                  |
| Validation script path escapes workspace         | Throw security error                                                          |
| Validation script not found                      | Return failure with clear error                                               |
| Validation script timeout (60s)                  | Kill process with SIGTERM/SIGKILL, treat as validation failure                |
| Validation script crashes (non-zero exit)        | Use stdout/stderr as continue message, retry                                  |
| Interpreter not found                            | Throw clear error "python3/node interpreter not found"                        |
| Interpreter check hangs                          | Timeout after 5s, treat as unavailable (FIX #1)                               |
| Max retries exceeded                             | Return failure with last validation output                                    |
| SIGTERM/SIGINT during execution                  | Dispose SDK, kill validation process, set cancelled status                    |
| Disposal during active session                   | Reject pending callbacks with error, remove abort listeners (FIX #3)          |
| sendFollowUp after dispose                       | Throw "OpenCode service disposed - cannot send follow-up" (FIX #13)           |
| Multiple dispose calls                           | Second call returns immediately (idempotent) (FIX #16)                        |
| Empty workflow file                              | Return failure "Workflow file is empty"                                       |
| validation_script_type without validation_script | Config throws error                                                           |
| Inline script exceeds 100KB                      | Config throws error about size limit (FIX #8)                                 |
| Validation output exceeds 100KB                  | Truncate and log warning (FIX #15)                                            |
| Event loop disconnects                           | Attempt reconnection up to 3 times; reject all callbacks if failed (FIX R3#6) |
| Empty inline script prefix                       | Throw "Empty inline script" error (FIX R3#8)                                  |
| Shell script provided                            | Throw "Shell scripts not supported" error (FIX R3#14)                         |
| AI message contains null bytes                   | Strip null bytes before passing to script (FIX R3#5)                          |
| SIGTERM ignored by script                        | Send SIGKILL after 5s (FIX R3#16)                                             |

### Console Output Format

```
[OpenCode] Initializing SDK server...
[OpenCode] Server started at http://127.0.0.1:xxxxx
[OpenCode] Session created: <session-id>
[OpenCode] Prompt sent, waiting for completion...
[OpenCode] <streamed assistant message content - accumulated>
[OpenCode] Tool: Read - completed
[OpenCode] <more streamed content>
[Validation] Attempt 1/5
[Validation] Executing python script (inline: false)
[Validation] Success - workflow complete
[OpenCode] Shutting down server...
```

### Size Limits

| Item                          | Limit | Purpose                                |
| ----------------------------- | ----- | -------------------------------------- |
| Inline validation script      | 100KB | Prevent config parsing issues (FIX #8) |
| AI_LAST_MESSAGE env var       | 100KB | Prevent OOM in validation script       |
| Validation script output      | 100KB | Prevent OOM and huge prompts           |
| Follow-up message to OpenCode | 100KB | Prevent API issues                     |

### Timeouts

| Item                           | Timeout                     | Purpose                                        |
| ------------------------------ | --------------------------- | ---------------------------------------------- |
| Interpreter availability check | 5s                          | Prevent hang on corrupted interpreter (FIX #1) |
| Validation script execution    | 60s                         | Prevent hung scripts                           |
| Session idle wait              | Configurable (default 5min) | Workflow timeout                               |

### Risks and Mitigations

| Risk                               | Impact                      | Mitigation                                                                     |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| OpenCode SDK API changes           | Build failures              | Pin SDK version, monitor releases                                              |
| Validation script hangs            | Action timeout              | Manual 60s timeout with SIGTERM/SIGKILL                                        |
| Interpreter check hangs            | Startup delay               | 5s timeout on --version check (FIX #1)                                         |
| Large last message causes OOM      | Script crash                | Truncate to 100KB + log warning (FIX #15)                                      |
| Large inline script                | Memory issues               | 100KB limit on inline scripts (FIX #8)                                         |
| Inline script security             | Arbitrary code execution    | Document that inline scripts run with full permissions (user's responsibility) |
| Temp file readable by others       | Information leak            | Create with 0o600 permissions (FIX #11)                                        |
| Event loop memory leak             | Resource exhaustion         | AbortController + proper cleanup + callback rejection on dispose               |
| Abort listener memory leak         | Resource exhaustion         | Remove abort listeners on success/error (FIX #3)                               |
| Race condition on fast session     | Missed completion           | Register callback before sending prompt                                        |
| Race condition in message tracking | Corrupted buffer            | Correlate by messageID (FIX #4)                                                |
| Session error status undetected    | Hang until timeout          | Handle error/disconnected status types (FIX #10)                               |
| Temp file collision                | Overwrite                   | Use crypto.randomUUID()                                                        |
| Env var leakage                    | Unexpected behavior         | Pass envVars to child only, don't modify process.env                           |
| Circular import                    | Build/runtime error         | Export singleton from opencode.ts, not runner.ts (FIX #2)                      |
| SDK init transient failure         | Permanent failure           | Allow retry by clearing initializationPromise on error (FIX #12)               |
| Server URL in logs                 | Information exposure        | Log URL at debug level only (FIX #9)                                           |
| Case-sensitive extension check     | Script type detection fails | Case-insensitive extension matching (FIX #7)                                   |
| Double dispose crash               | Runtime error               | Make dispose() idempotent (FIX #16)                                            |
| sendFollowUp after dispose         | Confusing error             | Clear error message "service disposed" (FIX #13)                               |
| Event loop transient disconnect    | Silent failure, timeout     | Auto-reconnect with 3 retries, reject callbacks if exhausted (FIX R3#6)        |
| SIGTERM ignored by hung script     | Process never killed        | Track process exit, send SIGKILL after 5s (FIX R3#16)                          |
| Concurrent sessions share buffer   | Message corruption          | Per-session message state Map (FIX R3#10)                                      |
| Test race condition on reset       | Flaky tests                 | resetOpenCodeService() disposes before clearing (FIX R3#1)                     |
| Empty inline script prefix         | Silent success              | Validate non-empty code after prefix (FIX R3#8)                                |
| Null bytes in AI message           | Env var corruption          | Strip null bytes before passing (FIX R3#5)                                     |
| Shell/TypeScript scripts           | Undefined behavior          | Explicit rejection with helpful error (FIX R3#14)                              |
| Shutdown creates instance          | Wasted resources            | hasOpenCodeServiceInstance() check (FIX R3#9)                                  |

### Notes

- Reference implementation: `microservice-swarm/src/shared/opencode/opencode-sdk.service.ts`
- OpenCode SDK package: `@opencode-ai/sdk` (currently v1.1.28 in microservice-swarm)
- Validation script timeout (60s) is separate from workflow timeout
- Interpreter availability check has 5s timeout to handle corrupted/hanging interpreters (FIX #1)
- `AI_LAST_MESSAGE` contains accumulated text content from all `message.part.updated` events for the last assistant message (correlated by messageID)
- Inline scripts are written to temp file with UUID name, appropriate extension (`.py`/`.js`), and restricted permissions (0o600)
- The workflow file content becomes the primary prompt; user's `prompt` input is appended if provided
- Success/failure of validation is determined by script OUTPUT only, not exit code
- Whitespace-only output (spaces, tabs, newlines) is treated as success (same as empty) (FIX R3#4 - documented behavior)
- Environment variables are passed to child processes only, never set on process.env
- Validation scripts cannot read from stdin - use AI_LAST_MESSAGE env var instead (FIX R3#12 - documented behavior)
- Script type detection is case-insensitive for both file extensions and inline prefixes (FIX #7)
- `getOpenCodeService()` singleton is exported from `opencode.ts` to avoid circular dependency with `index.ts` (FIX #2)
- Abort listeners are removed on success/error to prevent memory leaks (FIX #3)
- `dispose()` is idempotent - safe to call multiple times (FIX #16)
- Session error/disconnected status triggers callback rejection, not timeout wait (FIX #10)
- Truncation of large outputs is always logged as a warning (FIX #15)
- Event loop auto-reconnects up to 3 times on transient errors before failing (FIX R3#6)
- Per-session message state ensures concurrent sessions don't corrupt each other (FIX R3#10)
- SIGKILL escalation checks process exit status, not child.killed flag (FIX R3#16)
- `resetOpenCodeService()` is async and disposes existing instance to prevent test race conditions (FIX R3#1)
- `hasOpenCodeServiceInstance()` allows checking if service exists without creating one (FIX R3#9)
- Shell scripts (.sh, .bash) and TypeScript (.ts) are explicitly rejected with helpful errors (FIX R3#14)
- Empty inline script prefixes (e.g., "python:" alone) are rejected (FIX R3#8)
- Null bytes are stripped from AI_LAST_MESSAGE to prevent env var corruption (FIX R3#5)
