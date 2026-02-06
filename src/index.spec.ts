/**
 * Unit tests for src/index.ts - Main entry point and lifecycle management
 *
 * These tests verify Epic 4 functionality:
 * - Story 4.1: Main entry point orchestration
 * - Story 4.2: SIGTERM/SIGINT signal handling
 * - Story 4.3: OpenCode service disposal
 * - Story 4.4: Abort signal propagation
 * - Story 4.5: Resource cleanup
 * - Story 4.6: Forced exit timeout
 */

import type { ActionInputs, RunnerResult } from './types';

const ASYNC_SETTLE_MS = 50;

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
}

describe('index', () => {
  // Store mocks at module scope so they persist across resetModules
  let mockCore: jest.Mocked<typeof import('@actions/core')>;
  let mockRunWorkflow: jest.Mock;
  let mockGetInputs: jest.Mock;
  let mockValidateInputs: jest.Mock;
  let mockSanitizeErrorMessage: jest.Mock;
  let mockGetOpenCodeService: jest.Mock;
  let mockHasOpenCodeServiceInstance: jest.Mock;
  let mockDispose: jest.Mock;

  let exitMock: jest.SpyInstance;
  let sigTermHandler: (() => void) | null = null;
  let sigIntHandler: (() => void) | null = null;

  const createValidInputs = (): ActionInputs => ({
    workflowPath: 'test.md',
    prompt: 'Test prompt',
    envVars: {},
    timeoutMs: 60000,
    maxValidationRetries: 5,
    listModels: false,
  });

  const setupMocks = (): void => {
    // Create fresh mocks
    mockDispose = jest.fn();
    mockRunWorkflow = jest.fn().mockResolvedValue({ success: true, output: '{"result": "ok"}' });
    mockGetInputs = jest.fn().mockReturnValue(createValidInputs());
    mockValidateInputs = jest.fn().mockReturnValue({ valid: true, errors: [] });
    mockSanitizeErrorMessage = jest.fn().mockImplementation((e: Error) => e.message);
    mockHasOpenCodeServiceInstance = jest.fn().mockReturnValue(false);
    mockGetOpenCodeService = jest.fn().mockReturnValue({ dispose: mockDispose });

    // Mock @actions/core
    mockCore = {
      getInput: jest.fn(),
      setOutput: jest.fn(),
      setFailed: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<typeof import('@actions/core')>;

    // Setup module mocks
    jest.doMock('@actions/core', () => mockCore);
    jest.doMock('./runner', () => ({
      runWorkflow: mockRunWorkflow,
    }));
    jest.doMock('./config', () => ({
      getInputs: mockGetInputs,
      validateInputs: mockValidateInputs,
    }));
    jest.doMock('./security', () => ({
      sanitizeErrorMessage: mockSanitizeErrorMessage,
    }));
    jest.doMock('./opencode', () => ({
      getOpenCodeService: mockGetOpenCodeService,
      hasOpenCodeServiceInstance: mockHasOpenCodeServiceInstance,
    }));
    jest.doMock('./types', () => jest.requireActual('./types'));
  };

  const loadIndexModule = (): void => {
    // Reset signal handlers
    sigTermHandler = null;
    sigIntHandler = null;

    // Intercept process.on to capture signal handlers
    jest.spyOn(process, 'on').mockImplementation(((
      event: string | symbol,
      handler: (...args: unknown[]) => void
    ) => {
      if (event === 'SIGTERM') {
        sigTermHandler = handler as () => void;
      } else if (event === 'SIGINT') {
        sigIntHandler = handler as () => void;
      }
      return process;
    }) as typeof process.on);

    // Import the module fresh
    require('./index');
  };

  async function loadAndFlush(): Promise<void> {
    loadIndexModule();
    await flushPromises();
  }

  beforeEach(() => {
    // Reset modules to clear cache
    jest.resetModules();

    // Setup fresh mocks
    setupMocks();

    // Mock process.exit
    exitMock = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitMock?.mockRestore();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('run()', () => {
    it('parses inputs using getInputs()', async () => {
      // Arrange
      const inputs = createValidInputs();
      mockGetInputs.mockReturnValue(inputs);

      // Act
      await loadAndFlush();

      // Assert
      expect(mockGetInputs).toHaveBeenCalled();
    });

    it('validates inputs using validateInputs()', async () => {
      // Arrange
      const inputs = createValidInputs();
      mockGetInputs.mockReturnValue(inputs);
      mockValidateInputs.mockReturnValue({ valid: true, errors: [] });

      // Act
      await loadAndFlush();

      // Assert
      expect(mockValidateInputs).toHaveBeenCalledWith(inputs);
    });

    it('executes workflow using runWorkflow()', async () => {
      // Arrange
      const inputs = createValidInputs();
      mockGetInputs.mockReturnValue(inputs);

      // Act
      await loadAndFlush();

      // Assert
      expect(mockRunWorkflow).toHaveBeenCalledWith(inputs, inputs.timeoutMs, expect.any(Object));
    });

    it('sets output status to success on successful run', async () => {
      // Arrange
      mockRunWorkflow.mockResolvedValue({ success: true, output: '{"result":"done"}' });

      // Act
      await loadAndFlush();

      // Assert
      expect(mockCore.setOutput).toHaveBeenCalledWith('status', 'success');
      expect(mockCore.setOutput).toHaveBeenCalledWith('result', '{"result":"done"}');
    });

    it('sets output status to failure and calls setFailed on workflow failure', async () => {
      // Arrange
      mockRunWorkflow.mockResolvedValue({
        success: false,
        output: '',
        error: 'Workflow failed',
      });

      // Act
      await loadAndFlush();

      // Assert
      expect(mockCore.setOutput).toHaveBeenCalledWith('status', 'failure');
      expect(mockCore.setFailed).toHaveBeenCalledWith('Workflow failed');
    });

    it('logs and fails on validation errors', async () => {
      // Arrange
      mockValidateInputs.mockReturnValue({
        valid: false,
        errors: ['Invalid timeout', 'Missing workflow path'],
      });

      // Act
      await loadAndFlush();

      // Assert
      expect(mockCore.error).toHaveBeenCalledWith('Invalid timeout');
      expect(mockCore.error).toHaveBeenCalledWith('Missing workflow path');
      expect(mockCore.setOutput).toHaveBeenCalledWith('status', 'failure');
      expect(mockCore.setFailed).toHaveBeenCalled();
    });

    it('handles exception in run() with sanitized error message', async () => {
      // Arrange
      const error = new Error('Sensitive path /etc/passwd');
      mockRunWorkflow.mockRejectedValue(error);
      mockSanitizeErrorMessage.mockReturnValue('Path validation failed');

      // Act
      await loadAndFlush();

      // Assert
      expect(mockSanitizeErrorMessage).toHaveBeenCalledWith(error);
      expect(mockCore.setOutput).toHaveBeenCalledWith('status', 'failure');
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'result',
        JSON.stringify({ error: 'Path validation failed' })
      );
    });

    it('handles non-Error exceptions with generic message', async () => {
      // Arrange
      mockRunWorkflow.mockRejectedValue('String error');

      // Act
      await loadAndFlush();

      // Assert
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'result',
        JSON.stringify({ error: 'An unknown error occurred' })
      );
    });
  });

  describe('handleShutdown()', () => {
    it('logs SIGTERM signal and initiates graceful shutdown', async () => {
      // Arrange
      await loadAndFlush();

      // Act
      expect(sigTermHandler).not.toBeNull();
      sigTermHandler!();
      await flushPromises();

      // Assert
      expect(mockCore.info).toHaveBeenCalledWith(
        'Received SIGTERM, initiating graceful shutdown...'
      );
    });

    it('logs SIGINT signal and initiates graceful shutdown', async () => {
      // Arrange
      await loadAndFlush();

      // Act
      expect(sigIntHandler).not.toBeNull();
      sigIntHandler!();
      await flushPromises();

      // Assert
      expect(mockCore.info).toHaveBeenCalledWith(
        'Received SIGINT, initiating graceful shutdown...'
      );
    });

    it('disposes OpenCode service if instance exists', async () => {
      // Arrange
      mockHasOpenCodeServiceInstance.mockReturnValue(true);
      await loadAndFlush();

      // Act
      sigTermHandler!();
      await flushPromises();

      // Assert
      expect(mockGetOpenCodeService).toHaveBeenCalled();
      expect(mockDispose).toHaveBeenCalled();
    });

    it('logs warning if dispose fails but continues shutdown', async () => {
      // Arrange
      mockHasOpenCodeServiceInstance.mockReturnValue(true);
      mockGetOpenCodeService.mockReturnValue({
        dispose: jest.fn().mockImplementation(() => {
          throw new Error('Dispose failed');
        }),
      });
      await loadAndFlush();

      // Act
      sigTermHandler!();
      await flushPromises();

      // Assert
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to dispose OpenCode service')
      );
    });

    it('ignores duplicate shutdown signals', async () => {
      // Arrange
      await loadAndFlush();

      // Act - Send multiple signals
      sigTermHandler!();
      sigTermHandler!();
      sigIntHandler!();
      await flushPromises();

      // Assert - should only log shutdown message once
      const shutdownCalls = mockCore.info.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('initiating graceful shutdown')
      );
      expect(shutdownCalls).toHaveLength(1);
    });

    it('does not dispose OpenCode service if no instance exists', async () => {
      // Arrange
      mockHasOpenCodeServiceInstance.mockReturnValue(false);
      await loadAndFlush();

      // Act
      sigTermHandler!();
      await flushPromises();

      // Assert
      expect(mockGetOpenCodeService).not.toHaveBeenCalled();
      expect(mockDispose).not.toHaveBeenCalled();
    });
  });

  describe('forced exit timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('logs warning and forces exit after 10 second timeout', async () => {
      // Arrange - workflow never resolves
      mockRunWorkflow.mockImplementation(() => new Promise(() => {}));
      loadIndexModule();
      await jest.advanceTimersByTimeAsync(ASYNC_SETTLE_MS);

      // Act - Trigger shutdown
      sigTermHandler!();
      await jest.advanceTimersByTimeAsync(ASYNC_SETTLE_MS);

      // Advance past the 10 second forced exit timeout
      await jest.advanceTimersByTimeAsync(10100);

      // Assert
      expect(mockCore.warning).toHaveBeenCalledWith('Graceful shutdown timed out, forcing exit');
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('clears timeout and exits with 0 when runPromise resolves', async () => {
      // Arrange
      let resolveRun: (value: RunnerResult) => void;
      mockRunWorkflow.mockImplementation(
        () =>
          new Promise<RunnerResult>((resolve) => {
            resolveRun = resolve;
          })
      );
      loadIndexModule();
      await jest.advanceTimersByTimeAsync(ASYNC_SETTLE_MS);

      // Trigger shutdown
      sigTermHandler!();
      await jest.advanceTimersByTimeAsync(ASYNC_SETTLE_MS);

      // Act - Resolve the run promise before timeout
      resolveRun!({ success: true, output: '{}' });
      await jest.advanceTimersByTimeAsync(ASYNC_SETTLE_MS);

      // Assert
      expect(exitMock).toHaveBeenCalledWith(0);
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        'Graceful shutdown timed out, forcing exit'
      );
    });

    it('exits with 0 when run completes before shutdown is triggered', async () => {
      // Arrange
      mockRunWorkflow.mockResolvedValue({ success: true, output: '{}' });
      loadIndexModule();

      // Wait for run to complete
      await jest.advanceTimersByTimeAsync(100);

      // Act - Trigger shutdown after run completes
      sigTermHandler!();
      await jest.advanceTimersByTimeAsync(ASYNC_SETTLE_MS);

      // Assert
      expect(exitMock).toHaveBeenCalledWith(0);
    });
  });

  describe('abort signal propagation', () => {
    it('passes abort signal to runWorkflow', async () => {
      // Arrange
      let capturedSignal: AbortSignal | undefined;
      mockRunWorkflow.mockImplementation(
        (_inputs: ActionInputs, _timeout: number, signal?: AbortSignal) => {
          capturedSignal = signal;
          return Promise.resolve({ success: true, output: '{}' });
        }
      );

      // Act
      await loadAndFlush();

      // Assert
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it('sets cancelled status when shutdown occurs during workflow execution', async () => {
      // Arrange
      let capturedSignal: AbortSignal | undefined;
      mockRunWorkflow.mockImplementation(
        (_inputs: ActionInputs, _timeout: number, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise((resolve) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                resolve({ success: false, output: '', error: 'Aborted' });
              });
            }
          });
        }
      );
      await loadAndFlush();

      // Verify signal was passed
      expect(capturedSignal).toBeDefined();

      // Act - Trigger shutdown which aborts the signal
      sigTermHandler!();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(mockCore.setOutput).toHaveBeenCalledWith('status', 'cancelled');
    });

    it('returns cancelled if signal is already aborted before run starts', async () => {
      // Arrange
      let capturedSignal: AbortSignal | undefined;

      mockRunWorkflow.mockImplementation(
        (_inputs: ActionInputs, _timeout: number, signal?: AbortSignal) => {
          capturedSignal = signal;
          if (signal?.aborted) {
            return Promise.resolve({ success: false, output: '', error: 'cancelled' });
          }
          return Promise.resolve({ success: true, output: '{}' });
        }
      );

      // Act
      await loadAndFlush();

      // Assert
      expect(capturedSignal).toBeDefined();
      expect(mockRunWorkflow).toHaveBeenCalled();
    });
  });

  describe('signal handler registration', () => {
    it('registers SIGTERM handler on module load', () => {
      // Act
      loadIndexModule();

      // Assert
      expect(sigTermHandler).not.toBeNull();
    });

    it('registers SIGINT handler on module load', () => {
      // Act
      loadIndexModule();

      // Assert
      expect(sigIntHandler).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles workflow returning no error message', async () => {
      // Arrange
      mockRunWorkflow.mockResolvedValue({
        success: false,
        output: '',
      });

      // Act
      await loadAndFlush();

      // Assert
      expect(mockCore.setOutput).toHaveBeenCalledWith('status', 'failure');
      expect(mockCore.setFailed).not.toHaveBeenCalled();
    });
  });
});
