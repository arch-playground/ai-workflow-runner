import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';
import * as core from '@actions/core';
import { OpenCodeSession, INPUT_LIMITS } from './types.js';

// F13 Fix: Extract magic strings as constants
const SESSION_STATUS = {
  IDLE: 'idle',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
} as const;

const EVENT_TYPES = {
  PERMISSION_UPDATED: 'permission.updated',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_PART_UPDATED: 'message.part.updated',
  SESSION_IDLE: 'session.idle',
  SESSION_STATUS: 'session.status',
} as const;

interface OpenCodeServerInfo {
  url: string;
  close: () => void;
}

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

let openCodeServiceInstance: OpenCodeService | null = null;

export function getOpenCodeService(): OpenCodeService {
  if (!openCodeServiceInstance) {
    openCodeServiceInstance = new OpenCodeService();
  }
  return openCodeServiceInstance;
}

export function hasOpenCodeServiceInstance(): boolean {
  return openCodeServiceInstance !== null;
}

export function resetOpenCodeService(): void {
  if (openCodeServiceInstance) {
    openCodeServiceInstance.dispose();
    openCodeServiceInstance = null;
  }
}

export class OpenCodeService {
  private client: OpencodeClient | null = null;
  private server: OpenCodeServerInfo | null = null;
  private isInitialized = false;
  private isDisposed = false;
  private initializationPromise: Promise<void> | null = null;
  private initializationError: Error | null = null;
  private eventLoopAbortController: AbortController | null = null;
  private sessionCompletionCallbacks: Map<string, SessionCallbacks> = new Map();
  private sessionMessageState: Map<string, SessionMessageState> = new Map();

  async initialize(): Promise<void> {
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
    core.info('[OpenCode] Server started on localhost');
    core.debug(`[OpenCode] Server URL: ${this.server?.url ?? 'unknown'}`);
    this.eventLoopAbortController = new AbortController();
    this.startEventLoop();
  }

  async runSession(
    prompt: string,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<OpenCodeSession> {
    // F4 Fix: Check disposed state before proceeding
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot run session');
    }
    await this.initialize();
    if (!this.client) throw new Error('OpenCode client not initialized');

    const sessionResponse = await this.client.session.create({ body: { title: 'AI Workflow' } });
    if (!sessionResponse.data) throw new Error('Failed to create OpenCode session');

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

    const sessionState = this.sessionMessageState.get(sessionId);
    if (sessionState) {
      sessionState.currentMessageId = null;
      sessionState.messageBuffer = '';
    }

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

  getLastMessage(sessionId: string): string {
    const state = this.sessionMessageState.get(sessionId);
    const message = state?.lastCompleteMessage || state?.messageBuffer || '';
    if (message.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
      core.warning('[OpenCode] Last message truncated due to size limit');
      return message.substring(0, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) + '...[truncated]';
    }
    return message;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    for (const [, callbacks] of this.sessionCompletionCallbacks) {
      if (callbacks.abortCleanup) callbacks.abortCleanup();
      callbacks.reject(new Error('OpenCode service disposed'));
    }
    this.sessionCompletionCallbacks.clear();

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
          // F12 Fix: Use abortable delay to prevent reconnection after dispose
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

  private handleEvent(event: unknown, client: OpencodeClient): void {
    if (!event || typeof event !== 'object' || !('type' in event)) return;
    const e = event as { type: string; properties?: Record<string, unknown> };

    if (e.type === EVENT_TYPES.PERMISSION_UPDATED) {
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

    if (e.type === EVENT_TYPES.MESSAGE_UPDATED) {
      const info = (e.properties as { info?: { id?: string; role?: string; sessionID?: string } })
        ?.info;
      if (info?.role === 'assistant' && info.id && info.sessionID) {
        const state = this.sessionMessageState.get(info.sessionID);
        if (state) {
          if (state.currentMessageId && state.currentMessageId !== info.id && state.messageBuffer) {
            state.lastCompleteMessage = state.messageBuffer;
          }
          if (state.currentMessageId !== info.id) {
            state.currentMessageId = info.id;
            state.messageBuffer = '';
          }
        }
      }
    }

    // F14 Fix: Combined duplicate message.part.updated handlers
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

    if (e.type === EVENT_TYPES.SESSION_IDLE || e.type === EVENT_TYPES.SESSION_STATUS) {
      const props = e.properties as {
        sessionID?: string;
        status?: { type?: string; error?: string };
      };
      const sessionID = props?.sessionID;
      const statusType = props?.status?.type;
      const isIdle = e.type === EVENT_TYPES.SESSION_IDLE || statusType === SESSION_STATUS.IDLE;
      const isError =
        statusType === SESSION_STATUS.ERROR || statusType === SESSION_STATUS.DISCONNECTED;

      if (sessionID && (isIdle || isError)) {
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
  }

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
}
