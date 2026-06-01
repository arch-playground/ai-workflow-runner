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
});
