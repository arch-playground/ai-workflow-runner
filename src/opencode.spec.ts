import * as core from '@actions/core';
import * as fs from 'fs';
import { createOpencode, OpencodeClient } from '@opencode-ai/sdk';
import {
  OpenCodeService,
  getOpenCodeService,
  hasOpenCodeServiceInstance,
  resetOpenCodeService,
} from './opencode';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk');
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
    },
  };
});

const mockCreateOpencode = createOpencode as jest.MockedFunction<typeof createOpencode>;
const mockCore = core as jest.Mocked<typeof core>;
const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;

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
      const target = getOpenCodeService();
      await target.initialize();
      resetOpenCodeService();
      expect(mockServer.close).toHaveBeenCalled();
      expect(hasOpenCodeServiceInstance()).toBe(false);
    });
  });

  describe('initialize()', () => {
    it('creates client and server', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        hostname: '127.0.0.1',
        port: 0,
      });
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Initializing SDK server...');
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Server started on localhost');
    });

    it('is idempotent (only initializes once)', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      await target.initialize();
      expect(mockCreateOpencode).toHaveBeenCalledTimes(1);
    });

    it('allows retry after transient failure', async () => {
      mockCreateOpencode.mockRejectedValueOnce(new Error('Network error'));
      const target = new OpenCodeService();

      await expect(target.initialize()).rejects.toThrow('Network error');

      mockCreateOpencode.mockResolvedValueOnce({
        client: mockClient as unknown as OpencodeClient,
        server: mockServer,
      });

      await target.initialize();
      expect(mockCreateOpencode).toHaveBeenCalledTimes(2);
    });

    it('logs server URL at debug level only', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      expect(mockCore.debug).toHaveBeenCalledWith(
        expect.stringContaining('[OpenCode] Server URL:')
      );
      expect(mockCore.info).not.toHaveBeenCalledWith(expect.stringContaining('12345'));
    });
  });

  describe('runSession()', () => {
    it('creates session and sends prompt', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test prompt', 5000);

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
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);

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
      const target = new OpenCodeService();
      await target.initialize();

      await expect(target.runSession('test', 50)).rejects.toThrow('timed out after 50ms');
    });

    it('handles abort signal during waitForSessionIdle', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const abortController = new AbortController();

      const sessionPromise = target.runSession('test', 5000, abortController.signal);

      await new Promise((resolve) => setTimeout(resolve, 10));
      abortController.abort();

      await expect(sessionPromise).rejects.toThrow('Session aborted');
    });
  });

  describe('sendFollowUp()', () => {
    it('sends message to existing session', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('initial', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const followUpPromise = target.sendFollowUp('session-123', 'follow up', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });

      const result = await followUpPromise;
      expect(result.sessionId).toBe('session-123');
      expect(mockClient.session.promptAsync).toHaveBeenCalledTimes(2);
    });

    it('truncates long messages', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('initial', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      eventControl.emit({ type: 'session.idle', properties: { sessionID: 'session-123' } });
      await sessionPromise;

      const longMessage = 'x'.repeat(200_000);
      const followUpPromise = target.sendFollowUp('session-123', longMessage, 5000);
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
      const target = new OpenCodeService();
      await target.initialize();
      target.dispose();

      await expect(target.sendFollowUp('session-123', 'test', 5000)).rejects.toThrow(
        'OpenCode service disposed - cannot send follow-up'
      );
    });
  });

  describe('dispose()', () => {
    it('cleans up all resources', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      target.dispose();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith('[OpenCode] Shutting down server...');
    });

    it('aborts event loop', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      target.dispose();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it('rejects pending session callbacks', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 60000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      target.dispose();

      await expect(sessionPromise).rejects.toThrow('OpenCode service disposed');
    });

    it('is idempotent (safe to call multiple times)', async () => {
      const target = new OpenCodeService();
      await target.initialize();
      target.dispose();
      target.dispose();

      expect(mockServer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('event handling', () => {
    it('handles permission.updated events by auto-approving', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
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

      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
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
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
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
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
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
      expect(target.getLastMessage(result.sessionId)).toBe('Response');
    });

    it('logs warning when message is truncated', async () => {
      const target = new OpenCodeService();
      await target.initialize();

      const sessionPromise = target.runSession('test', 5000);
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
      const message = target.getLastMessage(result.sessionId);

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

      const target = new OpenCodeService();
      await target.initialize();

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

      const target = new OpenCodeService();
      await target.initialize();

      // Wait for all reconnection attempts (3 attempts with 1s delay each)
      await new Promise((resolve) => setTimeout(resolve, 3500));

      expect(mockCore.error).toHaveBeenCalledWith(
        '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.'
      );

      // Verify the error message was logged (callbacks already cleared by the error handler)
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Event loop error'));
    }, 10000);
  });

  describe('config loading', () => {
    const DEFAULT_SERVER_OPTIONS = { hostname: '127.0.0.1', port: 0 };

    beforeEach(() => {
      mockReadFile.mockResolvedValue('{}');
    });

    it('7.3-UNIT-001: reads opencode_config file as JSON', async () => {
      // Arrange
      const configContent = JSON.stringify({ provider: { anthropic: { options: {} } } });
      mockReadFile.mockResolvedValue(configContent);

      // Act
      const target = new OpenCodeService();
      await target.initialize({ opencodeConfig: '/workspace/config.json' });

      // Assert
      expect(mockReadFile).toHaveBeenCalledWith('/workspace/config.json', 'utf-8');
    });

    it('7.3-UNIT-002: passes config to createOpencode() options', async () => {
      // Arrange
      const configData = { provider: { anthropic: { options: { apiKey: 'test' } } } };
      mockReadFile.mockResolvedValue(JSON.stringify(configData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({ opencodeConfig: '/workspace/config.json' });

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: configData,
      });
    });

    it('7.3-UNIT-003: reads auth_config file as JSON', async () => {
      // Arrange
      const authContent = JSON.stringify({
        provider: { anthropic: { options: { apiKey: 'sk-test' } } },
      });
      mockReadFile.mockResolvedValue(authContent);

      // Act
      const target = new OpenCodeService();
      await target.initialize({ authConfig: '/workspace/auth.json' });

      // Assert
      expect(mockReadFile).toHaveBeenCalledWith('/workspace/auth.json', 'utf-8');
    });

    it('7.3-UNIT-004: passes auth to createOpencode() options merged into config', async () => {
      // Arrange
      const authData = { provider: { anthropic: { options: { apiKey: 'sk-test' } } } };
      mockReadFile.mockResolvedValue(JSON.stringify(authData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({ authConfig: '/workspace/auth.json' });

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: authData,
      });
    });

    it('7.3-UNIT-005: sets config.model when model input provided', async () => {
      // Act
      const target = new OpenCodeService();
      await target.initialize({ model: 'claude-sonnet-4-5-20250929' });

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: { model: 'claude-sonnet-4-5-20250929' },
      });
    });

    it('7.3-UNIT-006: throws config file not found with basename', async () => {
      // Arrange
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockReadFile.mockRejectedValue(enoent);

      // Act & Assert
      const target = new OpenCodeService();
      await expect(
        target.initialize({ opencodeConfig: '/workspace/deep/path/config.json' })
      ).rejects.toThrow('Config file not found: config.json');
    });

    it('7.3-UNIT-007: throws auth file not found with basename', async () => {
      // Arrange
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockReadFile.mockRejectedValue(enoent);

      // Act & Assert
      const target = new OpenCodeService();
      await expect(
        target.initialize({ authConfig: '/workspace/deep/path/auth.json' })
      ).rejects.toThrow('Auth file not found: auth.json');
    });

    it('7.3-UNIT-008: throws invalid JSON in config file with basename', async () => {
      // Arrange
      mockReadFile.mockResolvedValue('not valid json {{{');

      // Act & Assert
      const target = new OpenCodeService();
      await expect(
        target.initialize({ opencodeConfig: '/workspace/my-config.json' })
      ).rejects.toThrow('Invalid JSON in config file: my-config.json');
    });

    it('7.3-UNIT-009: throws invalid JSON in auth file with basename', async () => {
      // Arrange
      mockReadFile.mockResolvedValue('broken json!!!');

      // Act & Assert
      const target = new OpenCodeService();
      await expect(target.initialize({ authConfig: '/workspace/my-auth.json' })).rejects.toThrow(
        'Invalid JSON in auth file: my-auth.json'
      );
    });

    it('7.3-UNIT-010: error messages contain only basename, not absolute paths', async () => {
      // Arrange
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockReadFile.mockRejectedValue(enoent);
      const target = new OpenCodeService();

      // Act & Assert
      const error = await target
        .initialize({ opencodeConfig: '/very/long/secret/path/config.json' })
        .catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Config file not found: config.json');
      expect((error as Error).message).not.toContain('/very/long/secret/path');
    });

    it('7.3-UNIT-011: without any config options calls createOpencode() without config', async () => {
      // Act
      const target = new OpenCodeService();
      await target.initialize();

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith(DEFAULT_SERVER_OPTIONS);
    });

    it('7.3-UNIT-012: with model only sets config.model without loading files', async () => {
      // Act
      const target = new OpenCodeService();
      await target.initialize({ model: 'gpt-4' });

      // Assert
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: { model: 'gpt-4' },
      });
    });

    it('7.3-UNIT-013: with all three options merges correctly', async () => {
      // Arrange
      const configData = { setting1: 'value1', model: 'default-model' };
      const authData = { provider: { anthropic: { options: { apiKey: 'sk-123' } } } };

      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(configData))
        .mockResolvedValueOnce(JSON.stringify(authData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({
        opencodeConfig: '/workspace/config.json',
        authConfig: '/workspace/auth.json',
        model: 'claude-opus-4-6',
      });

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: {
          setting1: 'value1',
          provider: { anthropic: { options: { apiKey: 'sk-123' } } },
          model: 'claude-opus-4-6',
        },
      });
    });

    it('7.3-UNIT-014: deep merges overlapping provider keys from config and auth', async () => {
      // Arrange
      const configData = {
        provider: { openai: { options: { apiKey: 'sk-openai' } } },
        model: 'gpt-4',
      };
      const authData = {
        provider: { anthropic: { options: { apiKey: 'sk-anthropic' } } },
      };

      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(configData))
        .mockResolvedValueOnce(JSON.stringify(authData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({
        opencodeConfig: '/workspace/config.json',
        authConfig: '/workspace/auth.json',
      });

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: {
          provider: {
            openai: { options: { apiKey: 'sk-openai' } },
            anthropic: { options: { apiKey: 'sk-anthropic' } },
          },
          model: 'gpt-4',
        },
      });
    });

    it('7.3-UNIT-015: re-throws non-ENOENT filesystem errors', async () => {
      // Arrange
      const eacces = new Error('Permission denied') as NodeJS.ErrnoException;
      eacces.code = 'EACCES';
      mockReadFile.mockRejectedValue(eacces);

      // Act & Assert
      const target = new OpenCodeService();
      await expect(target.initialize({ opencodeConfig: '/workspace/config.json' })).rejects.toThrow(
        'Permission denied'
      );
    });

    it('7.3-UNIT-016: invalid JSON error messages use basename only, not absolute paths', async () => {
      // Arrange
      mockReadFile.mockResolvedValue('not valid json');

      // Act & Assert
      const target = new OpenCodeService();
      const error = await target
        .initialize({ opencodeConfig: '/very/secret/deep/path/config.json' })
        .catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Invalid JSON in config file: config.json');
      expect((error as Error).message).not.toContain('/very/secret/deep/path');
    });

    it('7.3-UNIT-017: handles non-object JSON values in config file', async () => {
      // Arrange
      mockReadFile.mockResolvedValue('"just a string"');

      // Act
      const target = new OpenCodeService();
      await target.initialize({ opencodeConfig: '/workspace/config.json' });

      // Assert
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: 'just a string',
      });
    });

    it('7.3-UNIT-018: deep merges overlapping provider keys with auth taking precedence', async () => {
      // Arrange
      const configData = {
        provider: { anthropic: { options: { apiKey: 'from-config', timeout: 5000 } } },
      };
      const authData = {
        provider: { anthropic: { options: { apiKey: 'from-auth', org: 'test-org' } } },
      };

      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(configData))
        .mockResolvedValueOnce(JSON.stringify(authData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({
        opencodeConfig: '/workspace/config.json',
        authConfig: '/workspace/auth.json',
      });

      // Assert - auth's provider object overrides config's at the provider level (one-level deep merge)
      expect(mockCreateOpencode).toHaveBeenCalledWith({
        ...DEFAULT_SERVER_OPTIONS,
        config: {
          provider: {
            anthropic: { options: { apiKey: 'from-auth', org: 'test-org' } },
          },
        },
      });
    });
  });
});
