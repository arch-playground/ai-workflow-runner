import * as core from '@actions/core';
import { createOpencode, OpencodeClient } from '@opencode-ai/sdk/v2';
import {
  OpenCodeService,
  getOpenCodeService,
  hasOpenCodeServiceInstance,
  resetOpenCodeService,
} from './opencode';
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
jest.mock('@opencode-ai/sdk/v2');

const mockCreateOpencode = createOpencode as jest.MockedFunction<typeof createOpencode>;
const mockCore = core as jest.Mocked<typeof core>;

describe('OpenCodeService', () => {
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
      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: '127.0.0.1', port: 0 })
      );
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
      await flushMicrotasks();
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

  describe('listModels()', () => {
    async function createInitializedService(): Promise<OpenCodeService> {
      const target = new OpenCodeService();
      await target.initialize();
      return target;
    }

    it('7.4-UNIT-002: calls client.config.providers() and returns transformed model data', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: {
          providers: [
            {
              id: 'anthropic',
              name: 'Anthropic',
              models: {
                'claude-3-opus': {
                  id: 'claude-3-opus',
                  name: 'Claude 3 Opus',
                },
                'claude-3-sonnet': {
                  id: 'claude-3-sonnet',
                  name: 'Claude 3 Sonnet',
                },
              },
            },
            {
              id: 'openai',
              name: 'OpenAI',
              models: {
                'gpt-4': {
                  id: 'gpt-4',
                  name: 'GPT-4',
                },
              },
            },
          ],
        },
      });

      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(mockClient.config.providers).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            id: 'claude-3-opus',
            name: 'Claude 3 Opus',
            provider: 'Anthropic',
            providerId: 'anthropic',
          },
          {
            id: 'claude-3-sonnet',
            name: 'Claude 3 Sonnet',
            provider: 'Anthropic',
            providerId: 'anthropic',
          },
          { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', providerId: 'openai' },
        ])
      );
    });

    it('throws when client not initialized', async () => {
      // Arrange
      const target = new OpenCodeService();

      // Act & Assert
      await expect(target.listModels()).rejects.toThrow(
        'OpenCode client not initialized - call initialize() first'
      );
    });

    it('throws when service is disposed', async () => {
      // Arrange
      const target = await createInitializedService();
      target.dispose();

      // Act & Assert
      await expect(target.listModels()).rejects.toThrow(
        'OpenCode service disposed - cannot list models'
      );
    });

    it('throws when providers response has no data', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({ data: undefined });
      const target = await createInitializedService();

      // Act & Assert
      await expect(target.listModels()).rejects.toThrow('Failed to retrieve providers');
    });

    it('throws when client.config.providers() rejects', async () => {
      // Arrange
      mockClient.config.providers.mockRejectedValue(new Error('Network error'));
      const target = await createInitializedService();

      // Act & Assert
      await expect(target.listModels()).rejects.toThrow('Network error');
    });

    it('returns empty array when no providers have models', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: { providers: [] },
      });
      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(result).toEqual([]);
    });

    it('10-1-AC1: enriches models with cost and enabledVia from v2 provider join', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: {
          providers: [
            {
              id: 'anthropic',
              name: 'Anthropic',
              models: {
                'claude-3-opus': {
                  id: 'claude-3-opus',
                  name: 'Claude 3 Opus',
                  cost: { input: 15, output: 75 },
                },
              },
            },
          ],
        },
      });
      mockClient.v2.provider.list.mockResolvedValue({
        data: [{ id: 'anthropic', enabled: { via: 'account', service: 'anthropic' } }],
      });
      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        providerId: 'anthropic',
        cost: { input: 15, output: 75 },
        enabledVia: 'account',
      });
      expect(mockClient.v2.provider.list).toHaveBeenCalledTimes(1);
    });

    it('10-1-AC2: enabledVia is undefined for provider absent from v2 list', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: {
          providers: [
            {
              id: 'opencode-zen',
              name: 'OpenCode Zen',
              models: {
                'zen-1': { id: 'zen-1', name: 'Zen 1', cost: { input: 0, output: 0 } },
              },
            },
          ],
        },
      });
      mockClient.v2.provider.list.mockResolvedValue({
        data: [{ id: 'anthropic', enabled: { via: 'account', service: 'anthropic' } }],
      });
      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(result[0]).toMatchObject({ providerId: 'opencode-zen', enabledVia: undefined });
    });

    it('10-1-AC3: gracefully degrades when v2.provider.list() throws', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: {
          providers: [
            {
              id: 'anthropic',
              name: 'Anthropic',
              models: {
                'claude-3-opus': { id: 'claude-3-opus', name: 'Claude 3 Opus' },
              },
            },
          ],
        },
      });
      mockClient.v2.provider.list.mockRejectedValue(new Error('v2 unavailable'));
      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'claude-3-opus', enabledVia: undefined });
      expect(mockCore.debug).toHaveBeenCalledWith(
        expect.stringContaining('v2.provider.list() failed')
      );
    });

    it('10-1-AC5: cost is undefined for models without cost field, no crash', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: {
          providers: [
            {
              id: 'local',
              name: 'Local',
              models: {
                'local-model': { id: 'local-model', name: 'Local Model' },
              },
            },
          ],
        },
      });
      mockClient.v2.provider.list.mockResolvedValue({ data: [] });
      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(result[0]).toMatchObject({
        id: 'local-model',
        cost: undefined,
        enabledVia: undefined,
      });
    });

    it('10-1-AC3: v2 enabled===false provider is excluded from auth map (enabledVia undefined)', async () => {
      // Arrange
      mockClient.config.providers.mockResolvedValue({
        data: {
          providers: [
            {
              id: 'github-copilot',
              name: 'GitHub Copilot',
              models: {
                'copilot-1': { id: 'copilot-1', name: 'Copilot 1', cost: { input: 0, output: 0 } },
              },
            },
          ],
        },
      });
      mockClient.v2.provider.list.mockResolvedValue({
        data: [{ id: 'github-copilot', enabled: false }],
      });
      const target = await createInitializedService();

      // Act
      const result = await target.listModels();

      // Assert
      expect(result[0]).toMatchObject({ enabledVia: undefined });
    });
  });

  describe('exportTranscript()', () => {
    async function createInitializedService(): Promise<OpenCodeService> {
      const target = new OpenCodeService();
      await target.initialize();
      return target;
    }

    it('returns the messages data array from session.messages', async () => {
      // Arrange
      const messages = [
        { info: { id: 'msg-1', role: 'assistant' }, parts: [{ type: 'text', text: 'hello' }] },
      ];
      mockClient.session.messages.mockResolvedValue({ data: messages });
      const target = await createInitializedService();

      // Act
      const result = await target.exportTranscript('session-123');

      // Assert
      expect(mockClient.session.messages).toHaveBeenCalledWith({ sessionID: 'session-123' });
      expect(result).toEqual(messages);
    });

    it('returns [] when response.data is undefined', async () => {
      // Arrange
      mockClient.session.messages.mockResolvedValue({ data: undefined });
      const target = await createInitializedService();

      // Act
      const result = await target.exportTranscript('session-123');

      // Assert
      expect(result).toEqual([]);
    });

    it('returns [] when response.data is null', async () => {
      // Arrange
      mockClient.session.messages.mockResolvedValue({ data: null });
      const target = await createInitializedService();

      // Act
      const result = await target.exportTranscript('session-123');

      // Assert
      expect(result).toEqual([]);
    });

    it('throws when client not initialized', async () => {
      // Arrange
      const target = new OpenCodeService();

      // Act & Assert
      await expect(target.exportTranscript('session-123')).rejects.toThrow(
        'OpenCode client not initialized - call initialize() first'
      );
    });

    it('throws when service is disposed', async () => {
      // Arrange
      const target = await createInitializedService();
      target.dispose();

      // Act & Assert
      await expect(target.exportTranscript('session-123')).rejects.toThrow(
        'OpenCode service disposed - cannot export transcript'
      );
    });

    it('propagates client errors', async () => {
      // Arrange
      mockClient.session.messages.mockRejectedValue(new Error('Network error'));
      const target = await createInitializedService();

      // Act & Assert
      await expect(target.exportTranscript('session-123')).rejects.toThrow('Network error');
    });
  });
});
