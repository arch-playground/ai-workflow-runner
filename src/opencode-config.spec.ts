import * as core from '@actions/core';
import * as fs from 'fs';
import { createOpencodeServer } from '@opencode-ai/sdk/v2';
import { OpenCodeService, resetOpenCodeService } from './opencode';
import { INPUT_LIMITS } from './types';
import {
  MockClient,
  MockServer,
  EventControl,
  createEventGenerator,
  createMockClient,
  createMockServer,
  setupMockCreateOpencode,
} from './opencode-test-helpers';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk/v2');
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

const mockCreateOpencodeServer = createOpencodeServer as jest.MockedFunction<
  typeof createOpencodeServer
>;
const mockCore = core as jest.Mocked<typeof core>;
const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;

describe('OpenCodeService - config & reconnection', () => {
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

  describe('event loop reconnection', () => {
    it('attempts reconnection on transient error', async () => {
      let subscribeCallCount = 0;
      const ctrl2 = createEventGenerator();

      mockClient.event.subscribe
        .mockImplementationOnce(() => {
          subscribeCallCount++;
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
        return Promise.reject(new Error('Connection permanently lost'));
      });

      const target = new OpenCodeService();
      await target.initialize();

      // Wait for all reconnection attempts (initial + 2 retries with 1s delay each)
      await new Promise((resolve) => setTimeout(resolve, 4000));

      expect(mockCore.error).toHaveBeenCalledWith(
        '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.',
        { title: 'Event loop failure' }
      );

      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Event loop error'));
    }, 10000);
  });

  describe('event stream heartbeat', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('triggers reconnection when no events received within heartbeat interval', async () => {
      // Arrange
      const hangControl = createEventGenerator();
      const resumeControl = createEventGenerator();

      mockClient.event.subscribe
        .mockImplementationOnce(() => Promise.resolve({ stream: hangControl.generator }))
        .mockImplementationOnce(() => Promise.resolve({ stream: resumeControl.generator }));

      const target = new OpenCodeService();
      await target.initialize();

      // Act
      hangControl.hang();
      await jest.advanceTimersByTimeAsync(INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS + 10);
      await jest.advanceTimersByTimeAsync(10);
      await jest.advanceTimersByTimeAsync(1100);
      await jest.advanceTimersByTimeAsync(10);

      // Assert
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Event stream heartbeat timeout')
      );
      expect(mockClient.event.subscribe).toHaveBeenCalledTimes(2);

      resumeControl.stop();
      target.dispose();
    });

    it('does not trigger reconnection when events keep flowing within heartbeat interval', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();

      // Act: emit events at intervals shorter than heartbeat, advance past total that would exceed one heartbeat
      eventControl.emit({ type: 'message.updated', properties: {} });
      await jest.advanceTimersByTimeAsync(10);

      eventControl.emit({ type: 'message.updated', properties: {} });
      await jest.advanceTimersByTimeAsync(INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS - 100);

      eventControl.emit({ type: 'message.updated', properties: {} });
      await jest.advanceTimersByTimeAsync(10);

      // Assert: no heartbeat warning triggered
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        expect.stringContaining('Event stream heartbeat timeout')
      );
      expect(mockClient.event.subscribe).toHaveBeenCalledTimes(1);

      eventControl.stop();
      target.dispose();
    });

    it('clears heartbeat timer and stops reconnection on dispose', async () => {
      // Arrange
      const target = new OpenCodeService();
      await target.initialize();
      await jest.advanceTimersByTimeAsync(10);

      // Act
      target.dispose();
      await jest.advanceTimersByTimeAsync(INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS + 10);

      // Assert
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        expect.stringContaining('Event stream heartbeat timeout')
      );
      expect(mockClient.event.subscribe).toHaveBeenCalledTimes(1);
    });

    it('re-establishes event flow after heartbeat-triggered reconnection', async () => {
      // Arrange
      const hangControl = createEventGenerator();
      const reconnectControl = createEventGenerator();

      mockClient.event.subscribe
        .mockImplementationOnce(() => Promise.resolve({ stream: hangControl.generator }))
        .mockImplementationOnce(() => Promise.resolve({ stream: reconnectControl.generator }));

      mockClient.session.create.mockResolvedValue({ data: { id: 'session-reconnect' } });
      mockClient.session.promptAsync.mockResolvedValue({ data: {} });

      const target = new OpenCodeService();
      await target.initialize();

      // Start a session so we can verify idle detection works after reconnect
      let sessionResolved = false;
      void target.runSession('test prompt', 600_000).then((result) => {
        sessionResolved = true;
        return result;
      });
      await jest.advanceTimersByTimeAsync(10);

      // Act: stream hangs, triggering heartbeat reconnection
      hangControl.hang();
      await jest.advanceTimersByTimeAsync(INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS + 10);

      // Allow reconnect delay (1000ms) + microtasks
      await jest.advanceTimersByTimeAsync(10);
      await jest.advanceTimersByTimeAsync(1100);
      await jest.advanceTimersByTimeAsync(10);

      // Emit session.idle on the reconnected stream — this should resolve the session
      reconnectControl.emit({
        type: 'session.idle',
        properties: { sessionID: 'session-reconnect', status: { type: 'idle' } },
      });
      await jest.advanceTimersByTimeAsync(10);

      // Assert: reconnection occurred AND session idle detection worked
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Event stream heartbeat timeout')
      );
      expect(mockClient.event.subscribe).toHaveBeenCalledTimes(2);
      expect(sessionResolved).toBe(true);

      reconnectControl.stop();
      target.dispose();
    });

    it('exhausts reconnection attempts on consecutive heartbeat timeouts', async () => {
      // maxReconnectAttempts=3: initial + 2 retries, then failure on 3rd timeout
      const hangControls = Array.from({ length: 3 }, () => createEventGenerator());

      const subscribeMock = mockClient.event.subscribe;
      for (const ctrl of hangControls) {
        subscribeMock.mockImplementationOnce(() => Promise.resolve({ stream: ctrl.generator }));
      }

      const target = new OpenCodeService();
      await target.initialize();

      // Act: 3 consecutive heartbeat timeouts
      for (const ctrl of hangControls) {
        ctrl.hang();
        await jest.advanceTimersByTimeAsync(INPUT_LIMITS.EVENT_STREAM_HEARTBEAT_MS + 10);
        await jest.advanceTimersByTimeAsync(1100);
        await jest.advanceTimersByTimeAsync(10);
      }

      // Assert: heartbeat timeouts exhaust reconnection attempts like any other error
      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Event loop failed after max reconnection attempts'),
        { title: 'Event loop failure' }
      );
      // initial subscribe + 2 reconnect attempts (attempt 1 and 2 pass < 3 check, attempt 3 fails)
      expect(subscribeMock).toHaveBeenCalledTimes(3);

      target.dispose();
    }, 15000);
  });

  describe('config loading', () => {
    const DEFAULT_SERVER_OPTIONS = { hostname: '127.0.0.1', port: 0 };
    // Permission config now contains bash allowlist, external_directory:deny, etc.
    // Use objectContaining so tests don't need to enumerate the full structure.
    const serverOptionsWithPermission = (config?: Record<string, unknown>) =>
      expect.objectContaining({
        ...DEFAULT_SERVER_OPTIONS,
        config: expect.objectContaining({
          ...config,
          permission: expect.objectContaining({
            external_directory: 'deny',
            webfetch: 'deny',
            websearch: 'allow',
            question: 'deny',
          }),
        }),
      });

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
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(
        serverOptionsWithPermission({ provider: { anthropic: { options: { apiKey: 'test' } } } })
      );
    });

    it('7.3-UNIT-003: reads auth_config file as JSON', async () => {
      // Arrange
      const authContent = JSON.stringify({
        'github-copilot': { type: 'oauth', access: 'gho_test', refresh: 'gho_test', expires: 0 },
      });
      mockReadFile.mockResolvedValue(authContent);

      // Act
      const target = new OpenCodeService();
      await target.initialize({ authConfig: '/workspace/auth.json' });

      // Assert
      expect(mockReadFile).toHaveBeenCalledWith('/workspace/auth.json', 'utf-8');
    });

    it('7.3-UNIT-004: calls auth.set() for each provider in auth_config', async () => {
      // Arrange
      const authData = {
        'github-copilot': { type: 'oauth', access: 'gho_test', refresh: 'gho_test', expires: 0 },
      };
      mockReadFile.mockResolvedValue(JSON.stringify(authData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({ authConfig: '/workspace/auth.json' });

      // Assert
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(serverOptionsWithPermission());
      expect(mockClient.auth.set).toHaveBeenCalledWith({
        providerID: 'github-copilot',
        auth: authData['github-copilot'],
      });
    });

    it('7.3-UNIT-005: sets config.model when model input provided', async () => {
      // Act
      const target = new OpenCodeService();
      await target.initialize({ model: 'claude-sonnet-4-5-20250929' });

      // Assert
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(
        serverOptionsWithPermission({ model: 'claude-sonnet-4-5-20250929' })
      );
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

    it('7.3-UNIT-011: without any config options still injects permission config', async () => {
      // Act
      const target = new OpenCodeService();
      await target.initialize();

      // Assert
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(serverOptionsWithPermission());
    });

    it('7.3-UNIT-012: with model only sets config.model without loading files', async () => {
      // Act
      const target = new OpenCodeService();
      await target.initialize({ model: 'gpt-4' });

      // Assert
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(
        serverOptionsWithPermission({ model: 'gpt-4' })
      );
    });

    it('7.3-UNIT-013: with all three options passes config and model to createOpencode and auth via auth.set()', async () => {
      // Arrange
      const configData = { setting1: 'value1', model: 'default-model' };
      const authData = { anthropic: { type: 'api', key: 'sk-123' } };

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
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(
        serverOptionsWithPermission({ setting1: 'value1', model: 'claude-opus-4-6' })
      );
      expect(mockClient.auth.set).toHaveBeenCalledWith({
        providerID: 'anthropic',
        auth: { type: 'api', key: 'sk-123' },
      });
    });

    it('7.3-UNIT-014: calls auth.set() for each provider in auth_config', async () => {
      // Arrange
      const authData = {
        anthropic: { type: 'api', key: 'sk-anthropic' },
        'github-copilot': { type: 'oauth', access: 'gho_test', refresh: 'gho_test', expires: 0 },
      };

      mockReadFile.mockResolvedValueOnce(JSON.stringify(authData));

      // Act
      const target = new OpenCodeService();
      await target.initialize({
        authConfig: '/workspace/auth.json',
      });

      // Assert
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(serverOptionsWithPermission());
      expect(mockClient.auth.set).toHaveBeenCalledTimes(2);
      expect(mockClient.auth.set).toHaveBeenCalledWith({
        providerID: 'anthropic',
        auth: { type: 'api', key: 'sk-anthropic' },
      });
      expect(mockClient.auth.set).toHaveBeenCalledWith({
        providerID: 'github-copilot',
        auth: { type: 'oauth', access: 'gho_test', refresh: 'gho_test', expires: 0 },
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

    it('7.3-UNIT-017: handles non-object JSON values in config file by ignoring them', async () => {
      // Arrange
      mockReadFile.mockResolvedValue('"just a string"');

      // Act
      const target = new OpenCodeService();
      await target.initialize({ opencodeConfig: '/workspace/config.json' });

      // Assert - non-object JSON is discarded, only permission config remains
      expect(mockCreateOpencodeServer).toHaveBeenCalledWith(serverOptionsWithPermission());
    });

    it('7.3-UNIT-018: auth.set() error throws with provider name', async () => {
      // Arrange
      const authData = { anthropic: { type: 'api', key: 'sk-bad' } };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(authData));
      mockClient.auth.set.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });

      // Act & Assert
      const target = new OpenCodeService();
      await expect(target.initialize({ authConfig: '/workspace/auth.json' })).rejects.toThrow(
        'Failed to set auth for provider anthropic'
      );
    });
  });
});
