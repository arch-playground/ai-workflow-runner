import {
  createOpencodeServer,
  createOpencodeClient,
  type OpencodeClient,
} from '@opencode-ai/sdk/v2';
import type { ToolState, PermissionConfig } from '@opencode-ai/sdk/v2';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  OpenCodeSession,
  ModelListItem,
  FallbackChainEntry,
  FallbackSelectionResult,
  INPUT_LIMITS,
} from './types.js';
import {
  truncateString,
  buildScopedEnv,
  validateProviderBaseUrl,
  extractProviderBaseUrls,
  isAllowedProviderHost,
} from './security.js';
import { buildAgentPermission, parseBashAllowPatterns, shouldAutoApprove } from './permissions.js';
import { getToolLoggerFactory } from './tool-loggers/index.js';
import { getDebugLogWriter } from './debug-log-writer.js';

export interface InitializeOptions {
  opencodeConfig?: string;
  authConfig?: string;
  model?: string;
  envVars?: Record<string, string>;
  bashAllowPatterns?: string;
  agentWorkingDirectory?: string;
  allowedProviderHosts?: string[];
}

// Fixed token for stop-commands bracketing. A constant is acceptable here because the
// wrapped content is the agent's own output — the goal is preventing accidental/incidental
// `::command::` sequences from being parsed by the Actions runner, not secrets protection.
const STOP_TOKEN = 'opencode-stop-43f8a2b1';

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
  private sessionStartWatchers: Map<
    string,
    { onCommit: () => void; onEarlyError: (reason: string) => void }
  > = new Map();

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

    // Snapshot → scope → spawn → restore: the SDK spreads process.env at cross-spawn
    // time inside createOpencodeServer, so the scoped window only needs to bracket
    // that call.  Restoring in finally ensures ambient secrets return even on throw.
    const originalEnv = { ...process.env };
    const scopedEnv = buildScopedEnv(options?.envVars ?? {});
    // LSP tool flag must reach the child process; set it explicitly in the scoped env.
    scopedEnv['OPENCODE_EXPERIMENTAL_LSP_TOOL'] = 'true';

    for (const key of Object.keys(process.env)) {
      if (!(key in scopedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, scopedEnv);

    // server is always assigned before use: if createOpencodeServer throws the finally
    // restores env and the exception propagates, so code after the block is unreachable.
    let server!: { url: string; close(): void };
    try {
      server = await createOpencodeServer(serverOptions);
    } finally {
      for (const key of Object.keys(process.env)) {
        delete process.env[key];
      }
      Object.assign(process.env, originalEnv);
    }

    // Build the client separately so we can forward `directory` for FS confinement.
    // createOpencode() only passes { baseUrl } — we need to add directory explicitly.
    const directory =
      options?.agentWorkingDirectory ?? process.env['GITHUB_WORKSPACE'] ?? process.cwd();
    const client = createOpencodeClient({ baseUrl: server.url, directory });

    this.client = client;
    this.server = server;
    this.isInitialized = true;
    core.info('[OpenCode] Server started on localhost');
    core.debug(`[OpenCode] Server URL: ${this.server?.url ?? 'unknown'}`);

    if (options?.authConfig) {
      await this.applyAuth(
        options.authConfig,
        serverOptions.config ?? {},
        options.allowedProviderHosts ?? []
      );
    }

    this.eventLoopAbortController = new AbortController();
    this.startEventLoop();
  }

  private async applyAuth(
    authConfigPath: string,
    loadedConfig: Record<string, unknown>,
    allowedProviderHosts: string[]
  ): Promise<void> {
    const authData = await this.loadJsonFile(authConfigPath, 'auth');
    if (!this.client) throw new Error('OpenCode client not initialized');

    // Build a map of provider id → configured baseURL for the belt-and-suspenders check.
    // Even if buildSdkConfig already validated, guard here in case of future bypass paths.
    const providerUrls = extractProviderBaseUrls(loadedConfig);
    const baseUrlByProvider = new Map(providerUrls.map(({ providerId, url }) => [providerId, url]));

    for (const [providerId, credentials] of Object.entries(authData)) {
      const customBaseUrl = baseUrlByProvider.get(providerId);
      if (customBaseUrl !== undefined) {
        // Provider has a custom baseURL — verify it is allowlisted before attaching credentials.
        if (!isAllowedProviderHost(new URL(customBaseUrl).hostname, allowedProviderHosts)) {
          core.warning(
            `[OpenCode] Skipping auth for provider "${providerId}": custom baseURL host is not allowlisted (belt-and-suspenders guard)`
          );
          continue;
        }
      }

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
        // Validate all consumer-supplied provider baseURLs before proceeding.
        // Fail-closed: any invalid/non-allowlisted URL throws and aborts initialization.
        this.validateProviderUrls(sdkConfig, options.allowedProviderHosts ?? []);
      }
    }
    if (options?.model) {
      sdkConfig.model = options.model;
    }

    const bashAllowPatterns = parseBashAllowPatterns(options?.bashAllowPatterns ?? '');
    sdkConfig.permission = buildAgentPermission(
      sdkConfig.permission as Partial<PermissionConfig> | undefined,
      bashAllowPatterns
    );

    return sdkConfig;
  }

  private validateProviderUrls(
    config: Record<string, unknown>,
    allowedProviderHosts: string[]
  ): void {
    const urls = extractProviderBaseUrls(config);
    for (const { providerId, url } of urls) {
      try {
        validateProviderBaseUrl(url, allowedProviderHosts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Provider "${providerId}": ${msg}`);
      }
    }
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

  async listModels(): Promise<ModelListItem[]> {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot list models');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');

    const response = await this.client.config.providers();
    if (!response.data) throw new Error('Failed to retrieve providers');

    const authMap = await this.buildProviderAuthMap();

    const models: ModelListItem[] = [];
    for (const provider of response.data.providers) {
      for (const model of Object.values(provider.models)) {
        const cost =
          model.cost !== null && model.cost !== undefined
            ? { input: model.cost.input, output: model.cost.output }
            : undefined;
        models.push({
          id: model.id,
          name: model.name,
          provider: provider.name,
          providerId: provider.id,
          cost,
          enabledVia: authMap.get(provider.id),
        });
      }
    }
    return models;
  }

  async getProviderAuthMap(): Promise<Map<string, 'env' | 'account' | 'custom'>> {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot get provider auth map');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');
    return this.buildProviderAuthMap();
  }

  /**
   * Returns the set of authenticated provider ids, or null if the v2 lookup fails.
   * null signals graceful-degradation: callers should treat all providers as viable (AC4).
   */
  async getAuthenticatedProviderIds(): Promise<Set<string> | null> {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot get authenticated providers');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');
    try {
      const providers = await this.fetchV2Providers();
      const ids = new Set<string>();
      for (const prov of providers) {
        if (prov.enabled !== false && prov.enabled !== null && prov.enabled !== undefined) {
          ids.add(prov.id);
        }
      }
      return ids;
    } catch (err) {
      core.debug(
        `[OpenCode] v2.provider.list() failed during preflight — treating all providers as viable: ${String(err)}`
      );
      return null;
    }
  }

  private async buildProviderAuthMap(): Promise<Map<string, 'env' | 'account' | 'custom'>> {
    try {
      const providers = await this.fetchV2Providers();
      const map = new Map<string, 'env' | 'account' | 'custom'>();
      for (const prov of providers) {
        if (prov.enabled && typeof prov.enabled === 'object' && 'via' in prov.enabled) {
          const via = (prov.enabled as { via: string }).via;
          if (via === 'env' || via === 'account' || via === 'custom') {
            map.set(prov.id, via);
          }
        }
      }
      return map;
    } catch (err) {
      core.debug(
        `[OpenCode] v2.provider.list() failed — enabledVia will be undefined: ${String(err)}`
      );
      return new Map();
    }
  }

  private async fetchV2Providers(): Promise<Array<{ id: string; enabled: unknown }>> {
    const v2Response = await this.client!.v2.provider.list();
    const rawData = (v2Response as { data?: unknown }).data;
    const providers = Array.isArray(rawData) ? rawData : [];
    return providers as Array<{ id: string; enabled: unknown }>;
  }

  async exportTranscript(sessionId: string): Promise<unknown[]> {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot export transcript');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');

    const response = await this.client.session.messages({ sessionID: sessionId });
    return response.data ?? [];
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

  async runSessionWithFallback(
    prompt: string,
    viableChain: FallbackChainEntry[],
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<FallbackSelectionResult> {
    if (this.isDisposed) {
      throw new Error('OpenCode service disposed - cannot run session with fallback');
    }
    if (!this.client) throw new Error('OpenCode client not initialized - call initialize() first');

    const failures: { provider: string; model: string; error: string }[] = [];

    for (const entry of viableChain) {
      if (abortSignal?.aborted) {
        return { success: false, session: undefined, failures };
      }

      core.info(`[OpenCode] Trying fallback provider: ${entry.provider} / model: ${entry.model}`);

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

      const committed = await this.watchForCommitOrEarlyError(
        sessionId,
        prompt,
        entry,
        timeoutMs,
        abortSignal
      );

      if (committed.committed) {
        const idleSession = await this.waitForSessionIdleAfterCommit(
          sessionId,
          timeoutMs,
          abortSignal
        );
        return { success: true, session: idleSession, failures };
      }

      failures.push({
        provider: entry.provider,
        model: entry.model,
        error: committed.errorReason,
      });

      this.sessionMessageState.delete(sessionId);
      core.warning(
        `[OpenCode] Provider ${entry.provider} failed at startup: ${committed.errorReason} — advancing to next entry`
      );
    }

    return { success: false, session: undefined, failures };
  }

  private async watchForCommitOrEarlyError(
    sessionId: string,
    prompt: string,
    entry: FallbackChainEntry,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<{ committed: boolean; errorReason: string }> {
    return new Promise((resolve) => {
      let resolved = false;

      const onCommit = (): void => {
        if (resolved) return;
        resolved = true;
        this.sessionStartWatchers.delete(sessionId);
        resolve({ committed: true, errorReason: '' });
      };

      const onEarlyError = (reason: string): void => {
        if (resolved) return;
        resolved = true;
        this.sessionStartWatchers.delete(sessionId);
        const callbacks = this.sessionCompletionCallbacks.get(sessionId);
        if (callbacks?.abortCleanup) callbacks.abortCleanup();
        this.sessionCompletionCallbacks.delete(sessionId);
        resolve({ committed: false, errorReason: reason });
      };

      const timeoutId = setTimeout(() => {
        onEarlyError(`timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      const wrappedCommit = (): void => {
        clearTimeout(timeoutId);
        onCommit();
      };

      const wrappedError = (reason: string): void => {
        clearTimeout(timeoutId);
        onEarlyError(reason);
      };

      this.sessionStartWatchers.set(sessionId, {
        onCommit: wrappedCommit,
        onEarlyError: wrappedError,
      });

      // Strip provider prefix if model is provider-qualified (e.g. "github-copilot/gpt-5-mini" → "gpt-5-mini").
      // Tolerant of both "provider/model" and bare "model" forms in the chain entry.
      const bareModelId = entry.model.startsWith(`${entry.provider}/`)
        ? entry.model.slice(entry.provider.length + 1)
        : entry.model;
      const promptModel = { providerID: entry.provider, modelID: bareModelId };

      this.client!.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: 'text', text: prompt }],
        model: promptModel,
      })
        .then((promptResponse) => {
          if (promptResponse.error) {
            wrappedError(`Prompt failed: ${JSON.stringify(promptResponse.error)}`);
          }
        })
        .catch((err: unknown) => {
          wrappedError(String(err));
        });

      if (abortSignal) {
        abortSignal.addEventListener(
          'abort',
          () => {
            wrappedError('Session aborted');
          },
          { once: true }
        );
      }
    });
  }

  private async waitForSessionIdleAfterCommit(
    sessionId: string,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<OpenCodeSession> {
    const idlePromise = this.waitForSessionIdle(sessionId, timeoutMs, abortSignal);
    core.info(this.formatTimestampedLog('Provider committed — waiting for session to complete...'));
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
      '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.',
      { title: 'Event loop failure' }
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
    if (!permission.sessionID || !permission.id) return;

    const permissionLabel = permission.permission || permission.id;
    // Config-level deny rules short-circuit to DeniedError inside opencode and do
    // NOT emit permission.asked — the handler only receives "ask"-classified requests.
    // We still guard here: only auto-approve known safe read-family tools so that
    // a future "ask" rule on a dangerous tool is not silently granted.
    const reply = shouldAutoApprove(permission.permission ?? '') ? 'always' : 'reject';

    core.info(
      this.formatTimestampedLog(
        `Permission requested: ${permissionLabel}${permission.description ? ` - ${permission.description}` : ''} → ${reply}`
      )
    );
    void client.permission
      .reply({ requestID: permission.id, reply })
      .then(() => {
        if (reply === 'always') {
          core.info(this.formatTimestampedLog(`Permission auto-approved: ${permissionLabel}`));
        } else {
          core.info(this.formatTimestampedLog(`Permission rejected: ${permissionLabel}`));
        }
      })
      .catch((err: Error) => {
        core.warning(`[OpenCode] Failed to reply to permission ${permission.id}: ${err}`);
      });
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
    core.error(this.formatTimestampedLog(`Session error for ${sessionID}: ${errorMessage}`), {
      title: 'Session error',
    });

    const watcher = this.sessionStartWatchers.get(sessionID);
    if (watcher) {
      watcher.onEarlyError(errorMessage);
      return;
    }

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
      this.notifyCommitWatcher(part.sessionID);
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

    if (part?.type === 'tool' && part.tool && part.state && part.sessionID) {
      this.notifyCommitWatcher(part.sessionID);
    }

    if (part?.type === 'tool' && part.tool && part.state) {
      const logger = getToolLoggerFactory().getLogger(part.tool);
      const message = logger.formatLog(part.tool, part.state);
      const logLine = this.formatTimestampedLog(message);
      if (part.state.status === 'pending') {
        core.debug(logLine);
      } else {
        core.startGroup(logLine);
        core.info(logLine);
        core.endGroup();
      }

      if (part.state.status !== 'pending') {
        const debugLog = logger.formatDebugLog(part.tool, part.state);
        if (debugLog) {
          getDebugLogWriter().writeToolEvent(debugLog);
        }
      }
    }
  }

  private notifyCommitWatcher(sessionId: string): void {
    const watcher = this.sessionStartWatchers.get(sessionId);
    if (!watcher) return;
    const state = this.sessionMessageState.get(sessionId);
    // currentMessageId is ONLY set by handleMessageUpdated when info.role === 'assistant'.
    // The echoed user-prompt text part arrives before any assistant message.updated, so
    // currentMessageId is null at that point — this guard ensures the echo never commits.
    if (state?.currentMessageId) {
      watcher.onCommit();
    }
  }

  private formatTimestampedLog(message: string): string {
    return `[${new Date().toISOString()}] [OpenCode] ${message}`;
  }

  private emitTextSafe(text: string): void {
    const prefixed = this.formatTimestampedLog(text);
    process.stdout.write(`::stop-commands::${STOP_TOKEN}\n`);
    for (let offset = 0; offset < prefixed.length; offset += INPUT_LIMITS.MAX_LOG_LINE_LENGTH) {
      core.info(prefixed.slice(offset, offset + INPUT_LIMITS.MAX_LOG_LINE_LENGTH));
    }
    process.stdout.write(`::${STOP_TOKEN}::\n`);
  }

  private handleTextPart(part: { text?: string; messageID?: string; sessionID?: string }): void {
    const state = this.sessionMessageState.get(part.sessionID!);
    if (state) {
      if (!state.currentMessageId || part.messageID === state.currentMessageId) {
        this.emitTextSafe(part.text!);
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
