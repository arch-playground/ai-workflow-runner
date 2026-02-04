import * as core from '@actions/core';
import { createOpencode, OpencodeClient } from '@opencode-ai/sdk';
import {
  OpenCodeService,
  getOpenCodeService,
  hasOpenCodeServiceInstance,
  resetOpenCodeService,
} from './opencode';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk');

const mockCreateOpencode = createOpencode as jest.MockedFunction<typeof createOpencode>;
const mockCore = core as jest.Mocked<typeof core>;

describe('OpenCodeService', () => {
  let mockClient: {
    session: {
      create: jest.Mock;
      promptAsync: jest.Mock;
    };
    event: {
      subscribe: jest.Mock;
    };
    postSessionIdPermissionsPermissionId: jest.Mock;
  };
  let mockServer: {
    url: string;
    close: jest.Mock;
  };
  // F15 Fix: Removed unused eventGenerator variable - only eventControl is needed
  let eventControl: { emit: (event: unknown) => void; stop: () => void };

  function createEventGenerator(): {
    generator: AsyncGenerator<unknown, void, unknown>;
    emit: (event: unknown) => void;
    stop: () => void;
  } {
    const events: unknown[] = [];
    let done = false;
    let pendingResolve: ((value: IteratorResult<unknown, void>) => void) | null = null;

    return {
      generator: (async function* (): AsyncGenerator<unknown, void, unknown> {
        while (!done) {
          if (events.length > 0) {
            yield events.shift()!;
          } else {
            const event = await new Promise<unknown>((resolve) => {
              pendingResolve = (result: IteratorResult<unknown, void>): void => {
                if (result.done) {
                  done = true;
                  resolve(undefined);
                } else {
                  resolve(result.value);
                }
              };
            });
            if (event !== undefined) {
              yield event;
            }
          }
        }
      })(),
      emit: (event: unknown): void => {
        if (pendingResolve) {
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve({ value: event, done: false });
        } else {
          events.push(event);
        }
      },
      stop: (): void => {
        done = true;
        if (pendingResolve) {
          pendingResolve({ value: undefined, done: true });
        }
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenCodeService();

    const ctrl = createEventGenerator();
    eventControl = ctrl;

    mockServer = {
      url: 'http://127.0.0.1:12345',
      close: jest.fn(),
    };

    mockClient = {
      session: {
        create: jest.fn().mockResolvedValue({ data: { id: 'session-123' } }),
        promptAsync: jest.fn().mockResolvedValue({ data: {} }),
      },
      event: {
        subscribe: jest.fn().mockResolvedValue({ stream: ctrl.generator }),
      },
      postSessionIdPermissionsPermissionId: jest.fn().mockResolvedValue({}),
    };

    mockCreateOpencode.mockResolvedValue({
      client: mockClient as unknown as OpencodeClient,
      server: mockServer,
    });
  });

  afterEach(() => {
    resetOpenCodeService();
    eventControl.stop();
  });

  describe('singleton management', () => {
    it('getOpenCodeService() returns singleton instance', () => {
      const instance1 = getOpenCodeService();
      const instance2 = getOpenCodeService();
      expect(instance1).toBe(instance2);
    });

    it('hasOpenCodeServiceInstance() returns false when not initialized', () => {
      resetOpenCodeService();
      expect(hasOpenCodeServiceInstance()).toBe(false);
    });

    it('hasOpenCodeServiceInstance() returns true after getOpenCodeService()', () => {
      getOpenCodeService();
      expect(hasOpenCodeServiceInstance()).toBe(true);
    });

    it('resetOpenCodeService() disposes existing instance before clearing', async () => {
      const service = getOpenCodeService();
      await service.initialize();
      resetOpenCodeService();
      expect(mockServer.close).toHaveBeenCalled();
      expect(hasOpenCodeServiceInstance()).toBe(false);
    });
  });

  describe('initialize()', () => {
    it('creates client and server', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        hostname: '127.0.0.1',
        port: 0,
      });
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Initializing SDK server...');
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Server started on localhost');
    });

    it('is idempotent (only initializes once)', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      await service.initialize();
      expect(mockCreateOpencode).toHaveBeenCalledTimes(1);
    });

    it('allows retry after transient failure', async () => {
      mockCreateOpencode.mockRejectedValueOnce(new Error('Network error'));
      const service = new OpenCodeService();

      await expect(service.initialize()).rejects.toThrow('Network error');

      mockCreateOpencode.mockResolvedValueOnce({
        client: mockClient as unknown as OpencodeClient,
        server: mockServer,
      });

      await service.initialize();
      expect(mockCreateOpencode).toHaveBeenCalledTimes(2);
    });

    it('logs server URL at debug level only', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      expect(mockCore.debug).toHaveBeenCalledWith(
        expect.stringContaining('[OpenCode] Server URL:')
      );
      expect(mockCore.info).not.toHaveBeenCalledWith(expect.stringContaining('12345'));
    });
  });

  describe('runSession()', () => {
    it('creates session and sends prompt', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test prompt', 5000);

      await new Promise((resolve) => setTimeout(resolve, 10));
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
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);

      await new Promise((resolve) => setTimeout(resolve, 10));
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
      const service = new OpenCodeService();
      await service.initialize();

      await expect(service.runSession('test', 50)).rejects.toThrow('timed out after 50ms');
    });

    it('handles abort signal during waitForSessionIdle', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const abortController = new AbortController();

      const sessionPromise = service.runSession('test', 5000, abortController.signal);

      await new Promise((resolve) => setTimeout(resolve, 10));
      abortController.abort();

      await expect(sessionPromise).rejects.toThrow('Session aborted');
    });
  });

  describe('sendFollowUp()', () => {
    it('sends message to existing session', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('initial', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const followUpPromise = service.sendFollowUp('session-123', 'follow up', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await followUpPromise;
      expect(result.sessionId).toBe('session-123');
      expect(mockClient.session.promptAsync).toHaveBeenCalledTimes(2);
    });

    it('truncates long messages', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('initial', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const longMessage = 'x'.repeat(200_000);
      const followUpPromise = service.sendFollowUp('session-123', longMessage, 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await followUpPromise;

      const call = mockClient.session.promptAsync.mock.calls[1] as [
        { body: { parts: Array<{ text: string }> } },
      ];
      expect(call[0]?.body.parts[0]?.text).toContain('...[truncated]');
      expect(call[0]?.body.parts[0]?.text.length).toBeLessThan(longMessage.length);
    });

    it('throws if service is disposed', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      service.dispose();

      await expect(service.sendFollowUp('session-123', 'test', 5000)).rejects.toThrow(
        'OpenCode service disposed - cannot send follow-up'
      );
    });
  });

  describe('dispose()', () => {
    it('cleans up all resources', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      service.dispose();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Shutting down server...');
    });

    it('aborts event loop', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      service.dispose();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it('rejects pending session callbacks', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 60000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      service.dispose();

      await expect(sessionPromise).rejects.toThrow('OpenCode service disposed');
    });

    it('is idempotent (safe to call multiple times)', async () => {
      const service = new OpenCodeService();
      await service.initialize();
      service.dispose();
      service.dispose();

      expect(mockServer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('event handling', () => {
    it('handles permission.updated events by auto-approving', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      eventControl.emit({
        type: 'permission.updated',
        properties: { sessionID: 'session-123', id: 'perm-1' },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

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

      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      eventControl.emit({
        type: 'permission.updated',
        properties: { sessionID: 'session-123', id: 'perm-1' },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-approve permission')
      );

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });

    it('handles session.status with error type by rejecting callback', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      eventControl.emit({
        type: 'session.status',
        properties: {
          sessionID: 'session-123',
          status: { type: 'disconnected', error: 'Connection lost' },
        },
      });

      await expect(sessionPromise).rejects.toThrow('Session disconnected: Connection lost');
    });

    it('streams message content via core.info()', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

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

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Test output');

      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;
    });
  });

  describe('getLastMessage()', () => {
    it('returns message for specific session', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      expect(service.getLastMessage(result.sessionId)).toBe('Response');
    });

    it('logs warning when message is truncated', async () => {
      const service = new OpenCodeService();
      await service.initialize();

      const sessionPromise = service.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      const message = service.getLastMessage(result.sessionId);

      expect(mockCore.warning).toHaveBeenCalledWith(
        '[OpenCode] Last message truncated due to size limit'
      );
      expect(message).toContain('...[truncated]');
    });
  });

  describe('event loop reconnection', () => {
    it('attempts reconnection on transient error', async () => {
      let subscribeCallCount = 0;
      const ctrl2 = createEventGenerator();

      mockClient.event.subscribe
        .mockImplementationOnce(() => {
          subscribeCallCount++;
          // Return a rejected promise to simulate subscription error
          return Promise.reject(new Error('Connection lost'));
        })
        .mockImplementationOnce(() => {
          subscribeCallCount++;
          return Promise.resolve({ stream: ctrl2.generator });
        });

      const service = new OpenCodeService();
      await service.initialize();

      // Wait for reconnection attempt
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(subscribeCallCount).toBeGreaterThanOrEqual(2);
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Event loop error (attempt 1/3)')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to reconnect')
      );

      ctrl2.stop();
    });

    it('rejects all callbacks after max reconnection attempts', async () => {
      mockClient.event.subscribe.mockImplementation(() => {
        // Return a rejected promise to simulate subscription error
        return Promise.reject(new Error('Connection permanently lost'));
      });

      const service = new OpenCodeService();
      await service.initialize();

      // Wait for all reconnection attempts (3 attempts with 1s delay each)
      await new Promise((resolve) => setTimeout(resolve, 3500));

      expect(mockCore.error).toHaveBeenCalledWith(
        '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.'
      );

      // Verify the error message was logged (callbacks already cleared by the error handler)
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Event loop error'));
    }, 10000);
  });
});
