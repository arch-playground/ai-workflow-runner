import * as core from '@actions/core';
import * as fs from 'fs';
import { createOpencode } from '@opencode-ai/sdk';
import { OpenCodeService, resetOpenCodeService } from './opencode';
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

      // Wait for all reconnection attempts (3 attempts with 1s delay each)
      await new Promise((resolve) => setTimeout(resolve, 3500));

      expect(mockCore.error).toHaveBeenCalledWith(
        '[OpenCode] Event loop failed after max reconnection attempts. Session idle detection may not work.'
      );

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
