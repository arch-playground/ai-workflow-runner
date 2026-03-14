import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk/v2';
import type { ToolState } from '@opencode-ai/sdk/v2';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { OpenCodeSession, INPUT_LIMITS, ModelStrategy } from './types.js';
import { truncateString } from './security.js';
import { getToolLoggerFactory } from './tool-loggers/index.js';
import { getDebugLogWriter } from './debug-log-writer.js';

export interface InitializeOptions {
  opencodeConfig?: string;
  authConfig?: string;
  model?: string;
  modelStrategy?: ModelStrategy;
}

const SESSION_STATUS = {
  IDLE: 'idle',
  RETRY: 'retry',
  BUSY: 'busy',
} as const;

const EVENT_TYPES = {
  PERMISSION_ASKED: 'permission.asked',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_PART_UPDATED: 'message.part.updated',
  SESSION_IDLE: 'session.idle',
  SESSION_STATUS: 'session.status',
  SESSION_ERROR: 'session.error',
  SESSION_COMPACTED: 'session.compacted',
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

interface ParsedEvent {
  type: string;
  properties?: Record<string, unknown>;
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
  private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly DEFAULT_TASK_TYPES = ['explore', 'validate', 'format', 'generate'] as const;

  private readonly TASK_TYPE_DESCRIPTIONS: Record<string, string> = {
    explore: 'Exploration and codebase scanning tasks',
    validate: 'Validation and checking tasks',
    format: 'Formatting and transformation tasks',
    generate: 'Code generation and implementation tasks',
    default: 'Default fallback tasks',
  };

  private readonly KNOWN_MODELS: Record<string, string> = {
    opus: 'anthropic/claude-opus-4-6',
    sonnet: 'anthropic/claude-sonnet-4-6',
    haiku: 'anthropic/claude-haiku-4-5',
  };

  async initialize(options?: InitializeOptions): Promise<void> {
    if (this.initializationError) {
      this.initializationPromise = null;
      this.initializationError = null;
    }
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = this.doInitialize(options);
    try {
      await this.initializationPromise;
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      this.initializationPromise = null;
      throw error;
    }
  }

  private async doInitialize(options?: InitializeOptions): Promise<void> {
    core.info('[OpenCode] Initializing SDK server...');

    const serverOptions: { hostname: string; port: number; config?: Record<string, unknown> } = {
      hostname: '127.0.0.1',
      port: 0,
    };

    serverOptions.config = await this.buildSdkConfig(options);

    process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL = 'true';

    const opencode = await createOpencode(serverOptions);
    this.client = opencode.client;
    this.server = opencode.server;
    this.isInitialized = true;
    core.info('[OpenCode] Server started on localhost');
    core.debug(`[OpenCode] Server URL: ${this.server?.url ?? 'unknown'}`);

    if (options?.authConfig) {
      await this.applyAuth(options.authConfig);
    }

    this.eventLoopAbortController = new AbortController();
    this.startEventLoop();
  }

  private async applyAuth(authConfigPath: string): Promise<void> {
    const authData = await this.loadJsonFile(authConfigPath, 'auth');
    if (!this.client) throw new Error('OpenCode client not initialized');

    for (const [providerId, credentials] of Object.entries(authData)) {
      core.info(`[OpenCode] Setting auth for provider: ${providerId}`);
      const response = await this.client.auth.set({
        providerID: providerId,
        auth: credentials as Parameters<typeof this.client.auth.set>[0]['auth'],
      });
      if (response.error) {
        throw new Error(
          `Failed to set auth for provider ${providerId}: ${JSON.stringify(response.error)}`
        );
      }
    }
  }

  private async buildSdkConfig(options?: InitializeOptions): Promise<Record<string, unknown>> {
    let sdkConfig: Record<string, unknown> = {};

    if (options?.opencodeConfig) {
      const loaded = await this.loadJsonFile(options.opencodeConfig, 'config');
      if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
        sdkConfig = loaded;
      }
    }
    if (options?.model) {
      sdkConfig.model = options.model;
    }

    if (options?.modelStrategy?.primary && !options?.model) {
      const resolved = this.resolveShortNameSync(options.modelStrategy.primary);
      if (resolved) {
        sdkConfig.model = resolved;
      } else if (this.isFullModelId(options.modelStrategy.primary)) {
        sdkConfig.model = options.modelStrategy.primary;
      }
    }

    const strategyAgents = this.buildAgentConfigs(options?.modelStrategy, options?.model);
    if (strategyAgents) {
      const existingAgents = (sdkConfig.agent as Record<string, unknown>) || {};
      sdkConfig.agent = { ...existingAgents, ...strategyAgents };
    }

    sdkConfig.permission = this.buildPermissionConfig(
      sdkConfig.permission as Record<string, unknown> | undefined
    );

    return sdkConfig;
  }

  private isFullModelId(value: string): boolean {
    return value.includes('/');
  }

  private resolveShortNameSync(shortName: string): string | null {
    return this.KNOWN_MODELS[shortName.toLowerCase()] ?? null;
  }

  private buildAgentConfigs(
    strategy: ModelStrategy | undefined,
    defaultModel?: string
  ): Record<string, unknown> | undefined {
    if (!defaultModel && !strategy) return undefined;

    const agents: Record<string, unknown> = {};
    const model = defaultModel || '';

    const resolveModel = (value: string): string => {
      if (this.isFullModelId(value)) return value;
      const resolved = this.resolveShortNameSync(value);
      if (resolved) return resolved;
      const availableNames = Object.keys(this.KNOWN_MODELS).join(', ');
      throw new Error(
        `Unknown model short name "${value}". Available short names: ${availableNames}. ` +
          `Use a full model ID (e.g., "anthropic/claude-sonnet-4-6") or one of: ${availableNames}.`
      );
    };

    if (strategy) {
      for (const [taskType, modelValue] of Object.entries(strategy)) {
        if (taskType === 'primary') continue;
        const resolvedModel = resolveModel(modelValue);
        agents[taskType] = {
          model: resolvedModel,
          mode: 'subagent',
          description: this.TASK_TYPE_DESCRIPTIONS[taskType] || `${taskType} tasks`,
        };
      }
    }

    if (model) {
      for (const taskType of this.DEFAULT_TASK_TYPES) {
        if (!agents[taskType]) {
          agents[taskType] = {
            model: model,
            mode: 'subagent',
            description: this.TASK_TYPE_DESCRIPTIONS[taskType],
          };
        }
      }
    }

    return Object.keys(agents).length > 0 ? agents : undefined;
  }

  private buildPermissionConfig(existing?: Record<string, unknown>): Record<string, string> {
    const defaults: Record<string, string> = {
      '*': 'allow',
      lsp: 'allow',
      question: 'deny',
      plan_enter: 'deny',
      plan_exit: 'deny',
    };

    if (!existing || Object.keys(existing).length === 0) {
      return defaults;
    }

    return { ...defaults, ...(existing as Record<string, string>) };
  }

  private async loadJsonFile(filePath: string, label: string): Promise<Record<string, unknown>> {
    const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
    let content: string;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`${capitalizedLabel} file not found: ${path.basename(filePath)}`);
      }
      throw err;
    }
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON in ${label} file: ${path.basename(filePath)}`);
    }
  }

  async listModels(): Promise<
    Array<{ id: string; name: string; provider: string; providerId: string }>
  > {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot list models');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');

    const response = await this.client.config.providers();
    if (!response.data) throw new Error('Failed to retrieve providers');

    const models: Array<{ id: string; name: string; provider: string; providerId: string }> = [];
    for (const provider of response.data.providers) {
      for (const model of Object.values(provider.models)) {
        models.push({
          id: model.id,
          name: model.name,
          provider: provider.name,
          providerId: provider.id,
        });
      }
    }
    return models;
  }

  async runSession(
    prompt: string,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<OpenCodeSession> {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot run session');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');

    const sessionResponse = await this.client.session.create({ title: 'AI Workflow' });
    if (!sessionResponse.data) throw new Error('Failed to create OpenCode session');

    const sessionId = sessionResponse.data.id;

    this.sessionMessageState.set(sessionId, {
      currentMessageId: null,
      messageBuffer: '',
      lastCompleteMessage: '',
    });

    core.info(`[OpenCode] Session created: ${sessionId}`);
    core.info(this.formatTimestampedLog('Session started'));
    getDebugLogWriter().writeSessionEvent('Session started');

    const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);

    const promptResponse = await this.client.session.promptAsync({
      sessionID: sessionId,
      parts: [{ type: 'text', text: prompt }],
    });
    if (promptResponse.error) {
      const callbacks = this.sessionCompletionCallbacks.get(sessionId);
      if (callbacks?.abortCleanup) callbacks.abortCleanup();
      this.sessionCompletionCallbacks.delete(sessionId);
      throw new Error(`Prompt failed: ${JSON.stringify(promptResponse.error)}`);
    }

    core.info(this.formatTimestampedLog('Prompt sent, waiting for completion...'));
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

    const truncatedMessage = truncateString(message, INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE);

    core.info(
      this.formatTimestampedLog(`Sending follow-up: ${truncatedMessage.substring(0, 100)}...`)
    );

    const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);

    await this.client.session.promptAsync({
      sessionID: sessionId,
      parts: [{ type: 'text', text: truncatedMessage }],
    });

    await idlePromise;
    return { sessionId, lastMessage: this.getLastMessage(sessionId) };
  }

  getLastMessage(sessionId: string): string {
    const state = this.sessionMessageState.get(sessionId);
    const message = state?.lastCompleteMessage || state?.messageBuffer || '';
    if (message.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
      core.warning('[OpenCode] Last message truncated due to size limit');
    }
    return truncateString(message, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE);
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

    this.clearHeartbeatTimer();

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

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  private startEventLoop(): void {
    if (!this.client) return;
    const client = this.client;
    const signal = this.eventLoopAbortController?.signal;
    const maxReconnectAttempts = 3;
    const reconnectDelayMs = 1000;

    const isHeartbeatError = (error: unknown): boolean =>
      error instanceof Error && error.message === 'Event stream heartbeat timeout';

    const raceNextEventAgainstHeartbeat = async (
      iterator: AsyncIterator<unknown>
    ): Promise<IteratorResult<unknown>> => {
      const heartbeatPromise = new Promise<never>((_, reject) => {
        this.heartbeatTimeoutId = setTimeout(() => {
          reject(new Error('Event stream heartbeat timeout'));
        }, INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS);
      });

      try {
        return (await Promise.race([iterator.next(), heartbeatPromise])) as IteratorResult<
          unknown,
          void
        >;
      } catch (error) {
        core.warning(
          `[OpenCode] Event stream heartbeat timeout - no events in ${INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS}ms, reconnecting...`
        );
        void iterator.return?.(undefined);
        throw error;
      } finally {
        this.clearHeartbeatTimer();
      }
    };

    const consumeEventStream = async (iterator: AsyncIterator<unknown>): Promise<void> => {
      while (!signal?.aborted) {
        const result = await raceNextEventAgainstHeartbeat(iterator);
        if (result.done) break;
        this.handleEvent(result.value, client);
      }
    };

    const runLoop = async (attempt: number = 0): Promise<void> => {
      try {
        if (this.isDisposed) return;
        const eventResult = await client.event.subscribe();
        const iterator = eventResult.stream[Symbol.asyncIterator]();
        await consumeEventStream(iterator);
      } catch (error) {
        if (signal?.aborted) return;

        const heartbeat = isHeartbeatError(error);
        const nextAttempt = attempt + 1;

        core.warning(
          `[OpenCode] Event loop ${heartbeat ? 'heartbeat timeout' : 'error'} (attempt ${nextAttempt}/${maxReconnectAttempts}): ${String(error)}`
        );

        if (nextAttempt < maxReconnectAttempts) {
          core.info(`[OpenCode] Attempting to reconnect event loop in ${reconnectDelayMs}ms...`);
          await this.abortableDelay(reconnectDelayMs, signal);
          if (!signal?.aborted && !this.isDisposed) {
            void runLoop(nextAttempt);
          }
        } else {
          this.handleEventLoopFailure();
        }
      }
    };

    void runLoop();
  }

  private abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => resolve(), ms);
      if (signal) {
        const abortHandler = (): void => {
          clearTimeout(timeoutId);
          resolve();
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  private handleEventLoopFailure(): void {
    core.error(
      '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.'
    );
    for (const [, callbacks] of this.sessionCompletionCallbacks) {
      if (callbacks.abortCleanup) callbacks.abortCleanup();
      callbacks.reject(new Error('Event loop disconnected - cannot detect session completion'));
    }
    this.sessionCompletionCallbacks.clear();
  }

  private handleEvent(event: unknown, client: OpencodeClient): void {
    if (!event || typeof event !== 'object' || !('type' in event)) return;
    const parsedEvent = event as ParsedEvent;

    switch (parsedEvent.type) {
      case EVENT_TYPES.PERMISSION_ASKED:
        this.handlePermissionAsked(parsedEvent, client);
        break;
      case EVENT_TYPES.MESSAGE_UPDATED:
        this.handleMessageUpdated(parsedEvent);
        break;
      case EVENT_TYPES.MESSAGE_PART_UPDATED:
        this.handleMessagePartUpdated(parsedEvent);
        break;
      case EVENT_TYPES.SESSION_IDLE:
      case EVENT_TYPES.SESSION_STATUS:
        this.handleSessionStatusChange(parsedEvent);
        break;
      case EVENT_TYPES.SESSION_ERROR:
        this.handleSessionError(parsedEvent);
        break;
      case EVENT_TYPES.SESSION_COMPACTED:
        this.handleSessionCompacted(parsedEvent);
        break;
    }
  }

  private handlePermissionAsked(event: ParsedEvent, client: OpencodeClient): void {
    const permission = event.properties as {
      sessionID?: string;
      id?: string;
      permission?: string;
      description?: string;
    };
    if (permission.sessionID && permission.id) {
      const permissionLabel = permission.permission || permission.id;
      core.info(
        this.formatTimestampedLog(
          `Permission requested: ${permissionLabel}${permission.description ? ` - ${permission.description}` : ''}`
        )
      );
      void client.permission
        .reply({ requestID: permission.id, reply: 'always' })
        .then(() => {
          core.info(this.formatTimestampedLog(`Permission auto-approved: ${permissionLabel}`));
        })
        .catch((err: Error) => {
          core.warning(`[OpenCode] Failed to auto-approve permission ${permission.id}: ${err}`);
        });
    }
  }

  private handleSessionError(event: ParsedEvent): void {
    const props = event.properties as {
      sessionID?: string;
      error?: { type?: string; message?: string } | string;
    };
    const sessionID = props?.sessionID;
    if (!sessionID) return;
    const errorMessage =
      typeof props?.error === 'string'
        ? props.error
        : (props?.error as { message?: string })?.message || 'unknown error';
    core.error(this.formatTimestampedLog(`Session error for ${sessionID}: ${errorMessage}`));
    this.finalizeSession(sessionID, true, errorMessage);
  }

  private handleSessionCompacted(event: ParsedEvent): void {
    const props = event.properties as { sessionID?: string };
    const sessionID = props?.sessionID;
    if (!sessionID) return;
    core.info(this.formatTimestampedLog(`Session compacted for ${sessionID}`));
    getDebugLogWriter().writeSessionEvent(`Session compacted for ${sessionID}`);
  }

  private handleMessageUpdated(event: ParsedEvent): void {
    const info = (event.properties as { info?: { id?: string; role?: string; sessionID?: string } })
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

  private handleMessagePartUpdated(event: ParsedEvent): void {
    const part = (
      event.properties as {
        part?: {
          type?: string;
          text?: string;
          messageID?: string;
          sessionID?: string;
          tool?: string;
          state?: ToolState;
          auto?: boolean;
          overflow?: boolean;
        };
      }
    )?.part;

    if (part?.type === 'text' && part.text && part.sessionID) {
      this.handleTextPart(part);
    }

    if (part?.type === 'compaction' && part.sessionID) {
      const autoLabel = part.auto ? 'auto' : 'manual';
      const overflowLabel = part.overflow ? ' (overflow)' : '';
      core.info(
        this.formatTimestampedLog(
          `Context compaction triggered [${autoLabel}${overflowLabel}] for session ${part.sessionID}`
        )
      );
      getDebugLogWriter().writeSessionEvent(
        `Context compaction triggered [${autoLabel}${overflowLabel}] for session ${part.sessionID}`
      );
    }

    if (part?.type === 'tool' && part.tool && part.state) {
      const logger = getToolLoggerFactory().getLogger(part.tool);
      const message = logger.formatLog(part.tool, part.state);
      const logLine = this.formatTimestampedLog(message);
      if (part.state.status === 'pending') {
        core.debug(logLine);
      } else if (part.state.status === 'error') {
        core.warning(logLine);
      } else {
        core.info(logLine);
      }

      if (part.state.status !== 'pending') {
        const debugLog = logger.formatDebugLog(part.tool, part.state);
        if (debugLog) {
          getDebugLogWriter().writeToolEvent(debugLog);
        }
      }
    }
  }

  private formatTimestampedLog(message: string): string {
    return `[${new Date().toISOString()}] [OpenCode] ${message}`;
  }

  private handleTextPart(part: { text?: string; messageID?: string; sessionID?: string }): void {
    const state = this.sessionMessageState.get(part.sessionID!);
    if (state) {
      if (!state.currentMessageId || part.messageID === state.currentMessageId) {
        core.info(this.formatTimestampedLog(part.text!));
        state.messageBuffer += part.text;
      }
    }
  }

  private handleSessionStatusChange(event: ParsedEvent): void {
    const props = event.properties as {
      sessionID?: string;
      status?: { type?: string; error?: string };
    };
    const sessionID = props?.sessionID;
    const statusType = props?.status?.type;
    const isIdle = event.type === EVENT_TYPES.SESSION_IDLE || statusType === SESSION_STATUS.IDLE;

    if (sessionID && isIdle) {
      this.finalizeSession(sessionID, false);
    }
  }

  private finalizeSession(sessionID: string, isError: boolean, errorMessage?: string): void {
    const state = this.sessionMessageState.get(sessionID);
    if (state?.messageBuffer) {
      state.lastCompleteMessage = state.messageBuffer;
    }

    if (state?.lastCompleteMessage) {
      getDebugLogWriter().writeCompleteMessage(state.lastCompleteMessage);
    }

    if (isError) {
      getDebugLogWriter().writeSessionEvent(`Error: ${errorMessage || 'unknown error'}`);
    } else {
      getDebugLogWriter().writeSessionEvent('Session idle');
    }

    const callbacks = this.sessionCompletionCallbacks.get(sessionID);
    if (callbacks) {
      if (callbacks.abortCleanup) callbacks.abortCleanup();
      this.sessionCompletionCallbacks.delete(sessionID);

      if (isError) {
        callbacks.reject(new Error(`Session error: ${errorMessage || 'unknown error'}`));
      } else {
        callbacks.resolve();
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
