import * as core from '@actions/core';
import { OpenCodeService, resetOpenCodeService } from './opencode';
import {
  MockClient,
  MockServer,
  EventControl,
  createEventGenerator,
  createMockClient,
  createMockServer,
  setupMockCreateOpencode,
  flushMicrotasks,
} from './opencode-test-helpers';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk');

const mockCore = core as jest.Mocked<typeof core>;

describe('OpenCodeService - session & messages', () => {
  let mockClient: MockClient;
  let mockServer: MockServer;
  let eventControl: EventControl;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenCodeService();

    eventControl = createEventGenerator();
    mockServer = createMockServer();
    mockClient = createMockClient();
    setupMockCreateOpencode(mockClient, mockServer, eventControl);
  });

  afterEach(() => {
    resetOpenCodeService();
    eventControl.stop();
  });

  describe('runSession()', () => {
    it('creates session and sends prompt', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test prompt', 5000);

      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;

      expect(mockClient.session.create).toHaveBeenCalledWith({ body: { title: 'AI Workflow' } });
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith({
        path: { id: 'session-123' },
        body: { parts: [{ type: 'text', text: 'test prompt' }] },
      });
      expect(result.sessionId).toBe('session-123');
    });

    it('accumulates message fragments correctly', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);

      await flushMicrotasks();
      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Hello ', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'World!', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;
      expect(result.lastMessage).toBe('Hello World!');
    });

    it('handles timeout during waitForSessionIdle', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      await expect(target.runSession('test', 50)).rejects.toThrow('timed out after 50ms');
    });

    it('handles abort signal during waitForSessionIdle', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const abortController = new AbortController();

      const sessionPromise = target.runSession('test', 5000, abortController.signal);

      await flushMicrotasks();
      abortController.abort();

      await expect(sessionPromise).rejects.toThrow('Session aborted');
    });
  });

  describe('sendFollowUp()', () => {
    it('sends message to existing session', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('initial', 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const followUpPromise = target.sendFollowUp('session-123', 'follow up', 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await followUpPromise;
      expect(result.sessionId).toBe('session-123');
      expect(mockClient.session.promptAsync).toHaveBeenCalledTimes(2);
    });

    it('truncates long messages', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('initial', 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const longMessage = 'x'.repeat(200_000);
      const followUpPromise = target.sendFollowUp('session-123', longMessage, 5000);
      await flushMicrotasks();
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await followUpPromise;

      const call = mockClient.session.promptAsync.mock.calls[1] as [
        { body: { parts: Array<{ text: string }> } },
      ];
      expect(call[0]?.body.parts[0]?.text).toContain('...[truncated]');
      expect(call[0]?.body.parts[0]?.text.length).toBeLessThan(longMessage.length);
    });

    it('throws if service is disposed', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      target.dispose();

      await expect(target.sendFollowUp('session-123', 'test', 5000)).rejects.toThrow(
        'OpenCode service disposed - cannot send follow-up'
      );
    });
  });

  describe('getLastMessage()', () => {
    it('returns message for specific session', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Response', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;
      expect(target.getLastMessage(result.sessionId)).toBe('Response');
    });

    it('logs warning when message is truncated', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });

      const longText = 'x'.repeat(200_000);
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: longText, messageID: 'msg-1', sessionID: 'session-123' },
        },
      });
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await sessionPromise;
      const message = target.getLastMessage(result.sessionId);

      expect(mockCore.warning).toHaveBeenCalledWith(
        '[OpenCode] Last message truncated due to size limit'
      );
      expect(message).toContain('...[truncated]');
    });
  });

  describe('event handling', () => {
    it('handles permission.updated events by auto-approving', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'permission.updated',
        properties: { sessionID: 'session-123', id: 'perm-1' },
      });

      await flushMicrotasks();

      expect(mockClient.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
        path: { id: 'session-123', permissionID: 'perm-1' },
        body: { response: 'always' },
      });

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('logs permission approval failures', async () => {
      mockClient.postSessionIdPermissionsPermissionId.mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'permission.updated',
        properties: { sessionID: 'session-123', id: 'perm-1' },
      });

      await flushMicrotasks();

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-approve permission')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('handles session.status with error type by rejecting callback', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'session.status',
        properties: {
          sessionID: 'session-123',
          status: { type: 'error', error: 'Something failed' },
        },
      });

      await expect(sessionPromise).rejects.toThrow('Session error: Something failed');
    });

    it('handles session.status with disconnected type by rejecting callback', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'session.status',
        properties: {
          sessionID: 'session-123',
          status: { type: 'disconnected', error: 'Connection lost' },
        },
      });

      await expect(sessionPromise).rejects.toThrow('Session error: Connection lost');
    });

    it('streams message content via core.info()', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await flushMicrotasks();

      eventControl.emit({
        type: 'message.updated',
        properties: { info: { id: 'msg-1', role: 'assistant', sessionID: 'session-123' } },
      });
      eventControl.emit({
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Test output', messageID: 'msg-1', sessionID: 'session-123' },
        },
      });

      await flushMicrotasks();
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Test output');

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });
  });
});
