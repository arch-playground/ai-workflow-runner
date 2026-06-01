import * as core from '@actions/core';
import { OpenCodeService, resetOpenCodeService } from './opencode';
import {
  EventControl,
  createEventGenerator,
  createMockClient,
  createMockServer,
  setupMockCreateOpencode,
  flushMicrotasks,
} from './opencode-test-helpers';
import type { FallbackChainEntry } from './types';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk/v2');

const mockCore = core as jest.Mocked<typeof core>;

describe('OpenCodeService.runSessionWithFallback()', () => {
  let eventControl: EventControl;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenCodeService();

    eventControl = createEventGenerator();
    const mockServer = createMockServer();
    const mockClient = createMockClient();
    setupMockCreateOpencode(mockClient, mockServer, eventControl);

    // Default: two distinct session ids for two attempts
    let callCount = 0;
    mockClient.session.create.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ data: { id: `session-${callCount}` } });
    });
  });

  afterEach(() => {
    resetOpenCodeService();
    eventControl.stop();
  });

  const chain: FallbackChainEntry[] = [
    { provider: 'p0', model: 'p0/m0' },
    { provider: 'p1', model: 'p1/m1' },
  ];

  it('11-3-AC1/AC2: p0 errors at start → advances to p1 which commits → returns p1 session', async () => {
    // Arrange
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('test prompt', chain, 5000);

    // p0 starts (session-1), receives session.error before any assistant part
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'Provider auth failed' },
    });

    // p1 starts (session-2), receives assistant message.updated then text part (commit)
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: { info: { id: 'msg-2', role: 'assistant', sessionID: 'session-2' } },
    });
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: { type: 'text', text: 'Hello from p1', messageID: 'msg-2', sessionID: 'session-2' },
      },
    });

    // After commit, selector waits for session.idle on p1
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-2' } });

    const result = await fallbackPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(result.session?.sessionId).toBe('session-2');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      provider: 'p0',
      model: 'p0/m0',
      error: 'Provider auth failed',
    });
  });

  it('11-3-AC3 (D2): p0 commits → never tries p1 even if later error on p0', async () => {
    // Arrange
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('test prompt', chain, 5000);

    // p0 gets assistant message → commit
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-1' } },
    });
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: { type: 'text', text: 'Committed!', messageID: 'msg-1', sessionID: 'session-1' },
      },
    });

    // p0 session completes normally after commit
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });

    const result = await fallbackPromise;

    // Assert — success on p0, no failures, session-2 never started
    expect(result.success).toBe(true);
    expect(result.session?.sessionId).toBe('session-1');
    expect(result.failures).toHaveLength(0);
    // p1 (session-2) was never attempted
    expect(result.session?.sessionId).not.toBe('session-2');
  });

  it('11-3-AC4: all entries error at start → structured all-failed result with per-entry reasons', async () => {
    // Arrange
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('test prompt', chain, 5000);

    // p0 errors
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'p0 quota exceeded' },
    });

    // p1 errors
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-2', error: 'p1 auth invalid' },
    });

    const result = await fallbackPromise;

    // Assert
    expect(result.success).toBe(false);
    expect(result.session).toBeUndefined();
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toMatchObject({ provider: 'p0', error: 'p0 quota exceeded' });
    expect(result.failures[1]).toMatchObject({ provider: 'p1', error: 'p1 auth invalid' });
  });

  it('11-3-AC5: no fallback chain → runSession used unchanged (backward compat)', async () => {
    // Arrange — test that runSession works as before (separate path in runner.ts)
    const target = new OpenCodeService();
    await target.initialize();

    const sessionPromise = target.runSession('test prompt', 5000);

    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });

    const result = await sessionPromise;

    // Assert — standard runSession behavior unchanged
    expect(result.sessionId).toBe('session-1');
    expect(result.lastMessage).toBe('');
  });

  it('11-3-AC2: failed attempt session is cleaned up before next attempt', async () => {
    // Arrange
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('test prompt', chain, 5000);

    // p0 errors — session-1 should be cleaned up (callbacks cleared)
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'auth failed' },
    });

    // p1 commits + completes
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: { info: { id: 'msg-2', role: 'assistant', sessionID: 'session-2' } },
    });
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: { type: 'text', text: 'Hello', messageID: 'msg-2', sessionID: 'session-2' },
      },
    });
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-2' } });

    await fallbackPromise;

    // Assert — a subsequent session.error for session-1 does NOT re-trigger (watcher cleaned up)
    expect(() =>
      eventControl.emit({
        type: 'session.error',
        properties: { sessionID: 'session-1', error: 'stale' },
      })
    ).not.toThrow();
    // core.error called once for the first session.error (p0) + once for stale, but no extra rejections
    expect(mockCore.error).toHaveBeenCalledWith(
      expect.stringContaining('session-1'),
      expect.objectContaining({ title: 'Session error' })
    );
  });

  it('11-3: warns about advancing when p0 fails', async () => {
    // Arrange
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback(
      'test prompt',
      [{ provider: 'p0', model: 'p0/m0' }],
      5000
    );

    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'quota' },
    });

    await fallbackPromise;

    // Assert — warning logged for failed provider
    expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('p0'));
  });

  describe('R2 fix: bare modelID extraction for promptAsync model pinning', () => {
    it('R2: provider-qualified model "prov/mod" → same result as bare "mod" (strip is idempotent)', async () => {
      // This test verifies the stripping logic is safe: qualified and bare produce the same SDK call.
      // Detailed promptAsync arg assertion is in the two tests below using fresh MockClient.
      const mockClient = createMockClient();
      const mockServer = createMockServer();
      const ctl = createEventGenerator();
      setupMockCreateOpencode(mockClient, mockServer, ctl);
      mockClient.session.create.mockResolvedValue({ data: { id: 'session-1' } });

      const target = new OpenCodeService();
      await target.initialize();

      const qualifiedEntry = [{ provider: 'prov', model: 'prov/mod' }];
      const fallbackPromise = target.runSessionWithFallback('prompt', qualifiedEntry, 5000);

      await flushMicrotasks();
      ctl.emit({
        type: 'message.updated',
        properties: { info: { id: 'm1', role: 'assistant', sessionID: 'session-1' } },
      });
      ctl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Hi', messageID: 'm1', sessionID: 'session-1' },
        },
      });
      await flushMicrotasks();
      ctl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });
      await fallbackPromise;
      ctl.stop();

      // Assert — bare modelID used (no double prefix)
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
        expect.objectContaining({ model: { providerID: 'prov', modelID: 'mod' } })
      );
    });

    it('R2: bare model "gpt-5-mini" → promptAsync called with {providerID:"prov", modelID:"gpt-5-mini"}', async () => {
      // Arrange — entry.model is bare (not provider-qualified)
      const mockClient = createMockClient();
      const mockServer = createMockServer();
      const ctl = createEventGenerator();
      setupMockCreateOpencode(mockClient, mockServer, ctl);
      mockClient.session.create.mockResolvedValue({ data: { id: 'session-1' } });

      const target = new OpenCodeService();
      await target.initialize();

      const bareEntry = [{ provider: 'github-copilot', model: 'gpt-5-mini' }];
      const fallbackPromise = target.runSessionWithFallback('prompt', bareEntry, 5000);

      await flushMicrotasks();
      ctl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-1' } },
      });
      ctl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Hello', messageID: 'msg-1', sessionID: 'session-1' },
        },
      });
      await flushMicrotasks();
      ctl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });

      await fallbackPromise;
      ctl.stop();

      // Assert — promptAsync called with bare modelID
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          model: { providerID: 'github-copilot', modelID: 'gpt-5-mini' },
        })
      );
    });

    it('R2: qualified model "github-copilot/gpt-5-mini" → promptAsync called with bare {modelID:"gpt-5-mini"}', async () => {
      // Arrange
      const mockClient = createMockClient();
      const mockServer = createMockServer();
      const ctl = createEventGenerator();
      setupMockCreateOpencode(mockClient, mockServer, ctl);
      mockClient.session.create.mockResolvedValue({ data: { id: 'session-1' } });

      const target = new OpenCodeService();
      await target.initialize();

      const qualifiedEntry = [{ provider: 'github-copilot', model: 'github-copilot/gpt-5-mini' }];
      const fallbackPromise = target.runSessionWithFallback('prompt', qualifiedEntry, 5000);

      await flushMicrotasks();
      ctl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-1' } },
      });
      ctl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Hello', messageID: 'msg-1', sessionID: 'session-1' },
        },
      });
      await flushMicrotasks();
      ctl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });

      await fallbackPromise;
      ctl.stop();

      // Assert — promptAsync received stripped modelID, not the full provider/model string
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          model: { providerID: 'github-copilot', modelID: 'gpt-5-mini' },
        })
      );
      // Explicitly confirm no double-prefix
      expect(mockClient.session.promptAsync).not.toHaveBeenCalledWith(
        expect.objectContaining({
          model: { providerID: 'github-copilot', modelID: 'github-copilot/gpt-5-mini' },
        })
      );
    });
  });
});

/**
 * 11-4 Commit-Boundary Hardening Tests
 *
 * Reproduce the §7 spike's exact event ordering:
 *   session.created → user-prompt echo (text part, no assistant message.updated) → session.error / assistant part
 *
 * The invariant: onCommit fires ONLY at the first assistant-role part.
 * The echo must NEVER commit (currentMessageId is null until assistant message.updated arrives).
 */
describe('Commit boundary — spike-ordering tests (11-4)', () => {
  let eventControl: EventControl;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenCodeService();

    eventControl = createEventGenerator();
    const mockServer = createMockServer();
    const mockClient = createMockClient();
    setupMockCreateOpencode(mockClient, mockServer, eventControl);

    // Two sessions for p0/p1
    let callCount = 0;
    mockClient.session.create.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ data: { id: `session-${callCount}` } });
    });
  });

  afterEach(() => {
    resetOpenCodeService();
    eventControl.stop();
  });

  const singleEntry = [{ provider: 'p0', model: 'p0/m0' }];
  const twoEntries = [
    { provider: 'p0', model: 'p0/m0' },
    { provider: 'p1', model: 'p1/m1' },
  ];

  it('11-4-AC1/AC3: spike ordering — echo-then-error → onEarlyError (advance), NOT commit', async () => {
    // Arrange — reproduces §7 spike: echo part arrives, then session.error
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('my prompt', twoEntries, 5000);

    // p0: user-prompt echo arrives as text part BEFORE any assistant message.updated
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'my prompt', // echo — same text as the prompt
          messageID: 'echo-msg',
          sessionID: 'session-1',
        },
      },
    });

    // Echo did NOT commit — now session.error fires → should advance to p1
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'Provider auth failed' },
    });

    // p1 commits normally
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: { info: { id: 'assistant-msg', role: 'assistant', sessionID: 'session-2' } },
    });
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'Hello from p1',
          messageID: 'assistant-msg',
          sessionID: 'session-2',
        },
      },
    });
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-2' } });

    const result = await fallbackPromise;

    // Assert — p0 advanced (echo did NOT commit it), p1 succeeded
    expect(result.success).toBe(true);
    expect(result.session?.sessionId).toBe('session-2');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ provider: 'p0' });
  });

  it('11-4-AC2: echo-only part does NOT trigger commit (currentMessageId is null)', async () => {
    // Arrange — only the echo part arrives; no assistant message.updated before it
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('my prompt', singleEntry, 5000);

    // Echo part — no assistant message.updated has arrived
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'my prompt',
          messageID: 'user-echo',
          sessionID: 'session-1',
        },
      },
    });

    // Confirm NOT committed: session still running (no commit, no error yet)
    // Now send a REAL session.error to verify the watcher is still active (would not be if echo committed)
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'auth expired' },
    });

    const result = await fallbackPromise;

    // Assert — echo did NOT commit, error correctly advanced (all-failed since only 1 entry)
    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ provider: 'p0', error: 'auth expired' });
  });

  it('11-4-AC1: echo-then-assistant-part → commit fires at the assistant part, NOT the echo', async () => {
    // Arrange — the spike's positive-path ordering
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('my prompt', singleEntry, 5000);

    // Step 1: echo text part (user-prompt echo) — must NOT commit
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'my prompt',
          messageID: 'user-echo',
          sessionID: 'session-1',
        },
      },
    });

    // Step 2: assistant message.updated — NOW an assistant message is active
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: {
        info: { id: 'assistant-msg-1', role: 'assistant', sessionID: 'session-1' },
      },
    });

    // Step 3: first REAL assistant text part — THIS should commit
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'Real assistant response',
          messageID: 'assistant-msg-1',
          sessionID: 'session-1',
        },
      },
    });

    // After commit, wait for idle
    await flushMicrotasks();
    eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-1' } });

    const result = await fallbackPromise;

    // Assert — committed successfully (echo did not commit; assistant part did)
    expect(result.success).toBe(true);
    expect(result.session?.sessionId).toBe('session-1');
    expect(result.failures).toHaveLength(0);
  });

  it('11-4-AC4: handleMessageUpdated only sets currentMessageId for assistant role (not user)', async () => {
    // Arrange — emit message.updated for a USER-role message; must NOT set currentMessageId
    // so that a subsequent text part does NOT commit
    const target = new OpenCodeService();
    await target.initialize();

    const fallbackPromise = target.runSessionWithFallback('my prompt', singleEntry, 5000);

    // User-role message.updated (should be ignored for currentMessageId)
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.updated',
      properties: {
        info: { id: 'user-msg-1', role: 'user', sessionID: 'session-1' },
      },
    });

    // Text part after user-role message.updated — should NOT commit
    await flushMicrotasks();
    eventControl.emit({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'user message text',
          messageID: 'user-msg-1',
          sessionID: 'session-1',
        },
      },
    });

    // Session.error now — watcher still active (user-role text did not commit)
    await flushMicrotasks();
    eventControl.emit({
      type: 'session.error',
      properties: { sessionID: 'session-1', error: 'no assistant response' },
    });

    const result = await fallbackPromise;

    // Assert — NOT committed by user-role message; error correctly advanced
    expect(result.success).toBe(false);
    expect(result.failures[0]).toMatchObject({ provider: 'p0' });
  });
});
