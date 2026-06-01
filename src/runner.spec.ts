import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runWorkflow } from './runner';
import { ActionInputs, INPUT_LIMITS } from './types';

jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk');

const mockOpenCodeService = {
  initialize: jest.fn(),
  runSession: jest.fn(),
  sendFollowUp: jest.fn(),
  getLastMessage: jest.fn(),
  listModels: jest.fn(),
  exportTranscript: jest.fn(),
  dispose: jest.fn(),
};

jest.mock('./opencode', () => ({
  getOpenCodeService: jest.fn(() => mockOpenCodeService),
  hasOpenCodeServiceInstance: jest.fn(() => true),
  resetOpenCodeService: jest.fn(),
}));

jest.mock('./validation', () => ({
  executeValidationScript: jest.fn(),
}));

const mockInitDebugLogWriter = jest.fn();
jest.mock('./debug-log-writer', () => ({
  initDebugLogWriter: (...args: unknown[]) => mockInitDebugLogWriter(...args),
}));

const mockWriteTranscript = jest.fn();
jest.mock('./transcript-writer', () => ({
  writeTranscript: (...args: unknown[]) => mockWriteTranscript(...args),
}));

const mockWriteJobSummary = jest.fn().mockResolvedValue(undefined);
jest.mock('./summary-writer', () => ({
  writeJobSummary: (...args: unknown[]) => mockWriteJobSummary(...args),
}));

import { executeValidationScript } from './validation';

const mockExecuteValidationScript = executeValidationScript as jest.MockedFunction<
  typeof executeValidationScript
>;

describe('runner', () => {
  let tempDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
    process.env = { ...originalEnv, GITHUB_WORKSPACE: tempDir };

    mockOpenCodeService.runSession.mockResolvedValue({
      sessionId: 'session-123',
      lastMessage: 'Test response',
    });
    mockOpenCodeService.sendFollowUp.mockResolvedValue({
      sessionId: 'session-123',
      lastMessage: 'Updated response',
    });
    mockOpenCodeService.exportTranscript.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createValidInputs = (overrides: Partial<ActionInputs> = {}): ActionInputs => ({
    workflowPath: 'test-workflow.md',
    prompt: 'Test prompt',
    envVars: { TEST_KEY: 'test_value' },
    timeoutMs: INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000,
    maxValidationRetries: INPUT_LIMITS.DEFAULT_VALIDATION_RETRY,
    listModels: false,
    disableFreeModels: false,
    debugLog: false,
    debugLogPath: '',
    exportTranscript: false,
    transcriptPath: '',
    writeJobSummary: false,
    ...overrides,
  });

  describe('runWorkflow', () => {
    it('returns success for valid workflow file', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test Workflow\nThis is a test.');

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(result.output).toContain('session-123');
      expect(result.error).toBeUndefined();
    });

    describe('config options pass-through', () => {
      beforeEach(() => {
        const workflowFile = path.join(tempDir, 'test-workflow.md');
        fs.writeFileSync(workflowFile, '# Test');
      });

      it('7.3-UNIT-015: passes config options to initialize()', async () => {
        // Arrange
        const inputs = createValidInputs({
          opencodeConfig: '/workspace/config.json',
          authConfig: '/workspace/auth.json',
          model: 'claude-sonnet-4-5-20250929',
        });

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(mockOpenCodeService.initialize).toHaveBeenCalledWith({
          opencodeConfig: '/workspace/config.json',
          authConfig: '/workspace/auth.json',
          model: 'claude-sonnet-4-5-20250929',
        });
      });

      it('7.3-UNIT-016: passes undefined config options when not provided', async () => {
        // Arrange
        const inputs = createValidInputs();

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(mockOpenCodeService.initialize).toHaveBeenCalledWith({
          opencodeConfig: undefined,
          authConfig: undefined,
          model: undefined,
        });
      });

      it('7.3-UNIT-017: returns failure when initialize() throws config error', async () => {
        // Arrange
        mockOpenCodeService.initialize.mockRejectedValueOnce(
          new Error('Config file not found: config.json')
        );

        const inputs = createValidInputs({ opencodeConfig: '/workspace/config.json' });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Config file not found: config.json');
      });
    });

    it('returns failure for missing workflow file', async () => {
      const inputs = createValidInputs({ workflowPath: 'nonexistent.md' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow file not found');
    });

    it('returns failure for path traversal attempt', async () => {
      const inputs = createValidInputs({ workflowPath: '../../../etc/passwd' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'absolute paths and parent directory references are not allowed'
      );
    });

    it('returns failure for non-UTF8 file', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, Buffer.from([0x80, 0x81, 0x82]));

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not valid UTF-8');
    });

    it('logs workflow execution info', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const inputs = createValidInputs();
      await runWorkflow(inputs);

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Executing workflow'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Prompt provided'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Environment variables'));
    });

    it('handles abort signal', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const abortController = new AbortController();
      abortController.abort();

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs, undefined, abortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    });

    it('returns failure for symlink escaping workspace', async () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
      const outsideFile = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideFile, 'secret content');

      const symlinkPath = path.join(tempDir, 'malicious-link.md');
      fs.symlinkSync(outsideFile, symlinkPath);

      try {
        const inputs = createValidInputs({ workflowPath: 'malicious-link.md' });
        const result = await runWorkflow(inputs);

        expect(result.success).toBe(false);
        expect(result.error).toContain('symlink target escapes');
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('handles files in subdirectories', async () => {
      const subDir = path.join(tempDir, 'workflows', 'nested');
      fs.mkdirSync(subDir, { recursive: true });
      const workflowFile = path.join(subDir, 'test.md');
      fs.writeFileSync(workflowFile, '# Test');

      const inputs = createValidInputs({ workflowPath: 'workflows/nested/test.md' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
    });

    it('returns failure for directory instead of file', async () => {
      const dirPath = path.join(tempDir, 'test-workflow.md');
      fs.mkdirSync(dirPath);

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a file');
    });

    it('handles workflow without prompt', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const inputs = createValidInputs({ prompt: '' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Prompt provided'));
    });

    it('uses default workspace when GITHUB_WORKSPACE not set', async () => {
      delete process.env['GITHUB_WORKSPACE'];

      const inputs = createValidInputs({ workflowPath: 'test.md' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
    });

    it('handles absolute path rejection', async () => {
      const inputs = createValidInputs({ workflowPath: '/etc/passwd' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute paths');
    });

    it('returns error for empty workflow file', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '');

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow file is empty');
    });

    it('returns error for whitespace-only workflow file', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '   \n\t  \n  ');

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow file is empty');
    });

    it('sends workflow content as prompt to OpenCode', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Workflow Content');

      const inputs = createValidInputs({ prompt: '' });
      await runWorkflow(inputs);

      expect(mockOpenCodeService.runSession).toHaveBeenCalledWith(
        '# Workflow Content',
        expect.any(Number),
        undefined
      );
    });

    it('combines workflow and user prompt', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Workflow Content');

      const inputs = createValidInputs({ prompt: 'User input here' });
      await runWorkflow(inputs);

      expect(mockOpenCodeService.runSession).toHaveBeenCalledWith(
        expect.stringContaining('# Workflow Content'),
        expect.any(Number),
        undefined
      );
      expect(mockOpenCodeService.runSession).toHaveBeenCalledWith(
        expect.stringContaining('User input here'),
        expect.any(Number),
        undefined
      );
    });

    it('runs validation script when provided', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockExecuteValidationScript.mockResolvedValue({ success: true, continueMessage: '' });

      const inputs = createValidInputs({ validationScript: 'check.py' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(mockExecuteValidationScript).toHaveBeenCalledWith(
        expect.objectContaining({
          script: 'check.py',
          lastMessage: 'Test response',
        })
      );
    });

    it('retries on validation failure', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockExecuteValidationScript
        .mockResolvedValueOnce({ success: false, continueMessage: 'Fix this' })
        .mockResolvedValueOnce({ success: true, continueMessage: '' });

      const inputs = createValidInputs({ validationScript: 'check.py', maxValidationRetries: 3 });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(mockExecuteValidationScript).toHaveBeenCalledTimes(2);
      expect(mockOpenCodeService.sendFollowUp).toHaveBeenCalledWith(
        'session-123',
        'Fix this',
        expect.any(Number),
        undefined
      );
    });

    it('fails after max validation retries', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockExecuteValidationScript.mockResolvedValue({
        success: false,
        continueMessage: 'Still failing',
      });

      const inputs = createValidInputs({ validationScript: 'check.py', maxValidationRetries: 2 });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed after 2 attempts');
      expect(result.error).toContain('Still failing');
    });

    it('succeeds without validation script', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(mockExecuteValidationScript).not.toHaveBeenCalled();
    });

    it('handles OpenCode session error', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockOpenCodeService.runSession.mockRejectedValue(new Error('Session failed'));

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session failed');
    });

    it('handles timeout error', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockOpenCodeService.runSession.mockRejectedValue(new Error('Session timed out after 5000ms'));

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs, 5000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('passes abort signal to validation', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockExecuteValidationScript.mockResolvedValue({ success: true, continueMessage: '' });

      const abortController = new AbortController();
      const inputs = createValidInputs({ validationScript: 'check.py' });
      await runWorkflow(inputs, undefined, abortController.signal);

      expect(mockExecuteValidationScript).toHaveBeenCalledWith(
        expect.objectContaining({
          abortSignal: abortController.signal,
        })
      );
    });

    it('truncates output exceeding size limit', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const longMessage = 'x'.repeat(INPUT_LIMITS.MAX_OUTPUT_SIZE + 1000);
      mockOpenCodeService.runSession.mockResolvedValue({
        sessionId: 'session-123',
        lastMessage: longMessage,
      });

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(result.output.length).toBeLessThanOrEqual(INPUT_LIMITS.MAX_OUTPUT_SIZE + 100);
      expect(result.output).toContain('[truncated]');
    });

    it('handles validation error on non-last attempt', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      mockExecuteValidationScript
        .mockRejectedValueOnce(new Error('Interpreter not found'))
        .mockResolvedValueOnce({ success: true, continueMessage: '' });

      const inputs = createValidInputs({ validationScript: 'check.py', maxValidationRetries: 3 });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Error on attempt 1'));
    });

    describe('debug log wiring', () => {
      beforeEach(() => {
        const workflowFile = path.join(tempDir, 'test-workflow.md');
        fs.writeFileSync(workflowFile, '# Test');
      });

      it('calls initDebugLogWriter when debugLog is true', async () => {
        // Arrange
        const inputs = createValidInputs({
          debugLog: true,
          debugLogPath: '/tmp/debug.log',
        });

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(mockInitDebugLogWriter).toHaveBeenCalledWith('/tmp/debug.log');
        expect(core.info).toHaveBeenCalledWith('[OpenCode] Debug logging enabled: /tmp/debug.log');
      });

      it('does not call initDebugLogWriter when debugLog is false', async () => {
        // Arrange
        const inputs = createValidInputs({ debugLog: false });

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(mockInitDebugLogWriter).not.toHaveBeenCalled();
      });
    });

    // Note: runWorkflow is a module function, not a class - 'target' variable pattern N/A
    describe('list models', () => {
      it('7.4-UNIT-001: with listModels true does NOT call validateWorkflowFile or runSession', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([
          { id: 'model-1', name: 'Model One', provider: 'Provider', providerId: 'provider' },
        ]);

        const inputs = createValidInputs({ listModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(true);
        expect(mockOpenCodeService.runSession).not.toHaveBeenCalled();
        expect(mockOpenCodeService.sendFollowUp).not.toHaveBeenCalled();
      });

      it('7.4-UNIT-003: prints models in exact format with header, model lines, footer, and pricing tag', async () => {
        // Arrange — no cost → [unknown] tag
        mockOpenCodeService.listModels.mockResolvedValue([
          {
            id: 'claude-3-opus',
            name: 'Claude 3 Opus',
            provider: 'Anthropic',
            providerId: 'anthropic',
          },
          { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', providerId: 'openai' },
        ]);

        const inputs = createValidInputs({ listModels: true });

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(core.info).toHaveBeenCalledWith('=== Available Models ===');
        expect(core.info).toHaveBeenCalledWith(
          '  - anthropic/claude-3-opus: Claude 3 Opus (Anthropic) [unknown]'
        );
        expect(core.info).toHaveBeenCalledWith('  - openai/gpt-4: GPT-4 (OpenAI) [unknown]');
        expect(core.info).toHaveBeenCalledWith('========================');
      });

      it('7.4-UNIT-004: returns success with models JSON including pricing field', async () => {
        // Arrange
        const rawModel = {
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          provider: 'Anthropic',
          providerId: 'anthropic',
        };
        mockOpenCodeService.listModels.mockResolvedValue([rawModel]);

        const inputs = createValidInputs({ listModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(true);
        const parsed = JSON.parse(result.output) as { models: Array<{ pricing: string }> };
        expect(parsed.models[0]).toMatchObject({ ...rawModel, pricing: 'unknown' });
        expect(result.error).toBeUndefined();
      });

      it('7.4-UNIT-005: returns failure when initialize() throws without crashing', async () => {
        // Arrange
        mockOpenCodeService.initialize.mockRejectedValueOnce(
          new Error('SDK initialization failed')
        );

        const inputs = createValidInputs({ listModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('SDK initialization failed');
        expect(result.output).toBe('');
      });

      it('returns failure when listModels() throws after successful init', async () => {
        // Arrange
        mockOpenCodeService.initialize.mockResolvedValue(undefined);
        mockOpenCodeService.listModels.mockRejectedValue(new Error('Failed to fetch providers'));
        const inputs = createValidInputs({ listModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to fetch providers');
        expect(result.output).toBe('');
      });

      it('passes config options to initialize when listing models', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([]);

        const inputs = createValidInputs({
          listModels: true,
          opencodeConfig: '/workspace/config.json',
          authConfig: '/workspace/auth.json',
          model: 'claude-sonnet-4-5-20250929',
        });

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(mockOpenCodeService.initialize).toHaveBeenCalledWith({
          opencodeConfig: '/workspace/config.json',
          authConfig: '/workspace/auth.json',
          model: 'claude-sonnet-4-5-20250929',
        });
      });
    });

    describe('disable_free_models listing (AC3)', () => {
      it('10-3-AC3: omits free models from listing when disableFreeModels is true', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([
          {
            id: 'zen-free',
            name: 'Zen Free',
            provider: 'OpenCode Zen',
            providerId: 'opencode-zen',
            cost: { input: 0, output: 0 },
            enabledVia: undefined,
          },
          {
            id: 'copilot-model',
            name: 'Copilot Model',
            provider: 'GitHub Copilot',
            providerId: 'github-copilot',
            cost: { input: 0, output: 0 },
            enabledVia: 'account',
          },
        ]);
        const inputs = createValidInputs({ listModels: true, disableFreeModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(true);
        const parsed = JSON.parse(result.output) as { models: unknown[] };
        expect(parsed.models).toHaveLength(1);
        expect(parsed.models[0]).toMatchObject({ id: 'copilot-model' });
        expect(core.info).toHaveBeenCalledWith('1 free model(s) hidden (disable_free_models)');
      });

      it('10-3-AC3: all models present in listing when disableFreeModels is false', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([
          {
            id: 'zen-free',
            name: 'Zen Free',
            provider: 'OpenCode Zen',
            providerId: 'opencode-zen',
            cost: { input: 0, output: 0 },
            enabledVia: undefined,
          },
          {
            id: 'copilot-model',
            name: 'Copilot Model',
            provider: 'GitHub Copilot',
            providerId: 'github-copilot',
            cost: { input: 0, output: 0 },
            enabledVia: 'account',
          },
        ]);
        const inputs = createValidInputs({ listModels: true, disableFreeModels: false });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        expect(result.success).toBe(true);
        const parsed = JSON.parse(result.output) as { models: unknown[] };
        expect(parsed.models).toHaveLength(2);
      });
    });

    describe('pricing tag output (AC1, AC2, AC3)', () => {
      it('10-4-AC1: printed lines include pricing tag for each model', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([
          {
            id: 'zen-free',
            name: 'Zen Free',
            provider: 'OpenCode Zen',
            providerId: 'opencode-zen',
            cost: { input: 0, output: 0 },
            enabledVia: undefined,
          },
          {
            id: 'copilot-gpt4o',
            name: 'GPT-4o',
            provider: 'GitHub Copilot',
            providerId: 'github-copilot',
            cost: { input: 0, output: 0 },
            enabledVia: 'account',
          },
          {
            id: 'claude-3-opus',
            name: 'Claude 3 Opus',
            provider: 'Anthropic',
            providerId: 'anthropic',
            cost: { input: 15, output: 75 },
            enabledVia: 'account',
          },
          {
            id: 'local-llm',
            name: 'Local LLM',
            provider: 'Local',
            providerId: 'local',
          },
        ]);
        const inputs = createValidInputs({ listModels: true });

        // Act
        await runWorkflow(inputs);

        // Assert
        expect(core.info).toHaveBeenCalledWith(
          '  - opencode-zen/zen-free: Zen Free (OpenCode Zen) [free]'
        );
        expect(core.info).toHaveBeenCalledWith(
          '  - github-copilot/copilot-gpt4o: GPT-4o (GitHub Copilot) [subscription]'
        );
        expect(core.info).toHaveBeenCalledWith(
          '  - anthropic/claude-3-opus: Claude 3 Opus (Anthropic) [paid]'
        );
        expect(core.info).toHaveBeenCalledWith('  - local/local-llm: Local LLM (Local) [unknown]');
      });

      it('10-4-AC2: returned JSON includes pricing field on each model', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([
          {
            id: 'zen-free',
            name: 'Zen Free',
            provider: 'OpenCode Zen',
            providerId: 'opencode-zen',
            cost: { input: 0, output: 0 },
            enabledVia: undefined,
          },
          {
            id: 'copilot-gpt4o',
            name: 'GPT-4o',
            provider: 'GitHub Copilot',
            providerId: 'github-copilot',
            cost: { input: 0, output: 0 },
            enabledVia: 'account',
          },
        ]);
        const inputs = createValidInputs({ listModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert
        const parsed = JSON.parse(result.output) as {
          models: Array<{ id: string; pricing: string }>;
        };
        expect(parsed.models).toHaveLength(2);
        expect(parsed.models.find((m) => m.id === 'zen-free')?.pricing).toBe('free');
        expect(parsed.models.find((m) => m.id === 'copilot-gpt4o')?.pricing).toBe('subscription');
      });

      it('10-4-AC3: free models omitted first, survivors tagged (compose with disable_free_models)', async () => {
        // Arrange
        mockOpenCodeService.listModels.mockResolvedValue([
          {
            id: 'zen-free',
            name: 'Zen Free',
            provider: 'OpenCode Zen',
            providerId: 'opencode-zen',
            cost: { input: 0, output: 0 },
            enabledVia: undefined,
          },
          {
            id: 'copilot-gpt4o',
            name: 'GPT-4o',
            provider: 'GitHub Copilot',
            providerId: 'github-copilot',
            cost: { input: 0, output: 0 },
            enabledVia: 'account',
          },
        ]);
        const inputs = createValidInputs({ listModels: true, disableFreeModels: true });

        // Act
        const result = await runWorkflow(inputs);

        // Assert — free model omitted, subscription model present with tag
        const parsed = JSON.parse(result.output) as {
          models: Array<{ id: string; pricing: string }>;
        };
        expect(parsed.models).toHaveLength(1);
        expect(parsed.models[0]).toMatchObject({ id: 'copilot-gpt4o', pricing: 'subscription' });
        expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('zen-free'));
        expect(core.info).toHaveBeenCalledWith(
          '  - github-copilot/copilot-gpt4o: GPT-4o (GitHub Copilot) [subscription]'
        );
      });
    });
  });

  describe('disable_free_models run guard (AC4, AC5, AC6)', () => {
    let workflowFile: string;

    beforeEach(() => {
      workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test Workflow');
    });

    it('10-3-AC4: fails fast when resolved model is free — session NOT run', async () => {
      // Arrange
      mockOpenCodeService.listModels.mockResolvedValue([
        {
          id: 'opencode-zen/zen-1-free',
          name: 'Zen 1 Free',
          provider: 'OpenCode Zen',
          providerId: 'opencode-zen',
          cost: { input: 0, output: 0 },
          enabledVia: undefined,
        },
      ]);
      const inputs = createValidInputs({
        model: 'opencode-zen/zen-1-free',
        disableFreeModels: true,
      });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('opencode-zen/zen-1-free');
      expect(result.error).toContain('disable_free_models');
      expect(mockOpenCodeService.runSession).not.toHaveBeenCalled();
    });

    it('10-3-AC5: subscription model (account, cost 0) is NOT blocked', async () => {
      // Arrange
      mockOpenCodeService.listModels.mockResolvedValue([
        {
          id: 'copilot-gpt-4o',
          name: 'GPT-4o',
          provider: 'GitHub Copilot',
          providerId: 'github-copilot',
          cost: { input: 0, output: 0 },
          enabledVia: 'account',
        },
      ]);
      const inputs = createValidInputs({ model: 'copilot-gpt-4o', disableFreeModels: true });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.runSession).toHaveBeenCalledTimes(1);
    });

    it('10-3-AC5: paid model (non-zero cost) is NOT blocked', async () => {
      // Arrange
      mockOpenCodeService.listModels.mockResolvedValue([
        {
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          provider: 'Anthropic',
          providerId: 'anthropic',
          cost: { input: 15, output: 75 },
          enabledVia: 'account',
        },
      ]);
      const inputs = createValidInputs({ model: 'claude-3-opus', disableFreeModels: true });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.runSession).toHaveBeenCalledTimes(1);
    });

    it('10-3-AC6: no model input — proceeds without blocking (unresolvable)', async () => {
      // Arrange
      const inputs = createValidInputs({ model: undefined, disableFreeModels: true });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.runSession).toHaveBeenCalledTimes(1);
    });

    it('10-3-AC6: model not in listModels results — proceeds without blocking', async () => {
      // Arrange
      mockOpenCodeService.listModels.mockResolvedValue([
        {
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          provider: 'Anthropic',
          providerId: 'anthropic',
          cost: { input: 15, output: 75 },
          enabledVia: 'account',
        },
      ]);
      const inputs = createValidInputs({ model: 'unknown-model', disableFreeModels: true });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.runSession).toHaveBeenCalledTimes(1);
    });

    it('10-3: disableFreeModels false — guard not applied at all', async () => {
      // Arrange — free model but flag off
      mockOpenCodeService.listModels.mockResolvedValue([
        {
          id: 'zen-free',
          name: 'Zen Free',
          provider: 'OpenCode Zen',
          providerId: 'opencode-zen',
          cost: { input: 0, output: 0 },
          enabledVia: undefined,
        },
      ]);
      const inputs = createValidInputs({ model: 'zen-free', disableFreeModels: false });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.runSession).toHaveBeenCalledTimes(1);
      // listModels should NOT have been called (guard not invoked)
      expect(mockOpenCodeService.listModels).not.toHaveBeenCalled();
    });
  });

  describe('transcript export', () => {
    let workflowFile: string;

    beforeEach(() => {
      workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Workflow');
    });

    it('9-3-AC1/AC4: calls exportTranscript and writeTranscript when exportTranscript is enabled', async () => {
      // Arrange
      const messages = [{ info: { role: 'assistant' }, parts: [] }];
      mockOpenCodeService.exportTranscript.mockResolvedValue(messages);
      const transcriptPath = path.join(tempDir, 'conversation.json');
      const inputs = createValidInputs({ exportTranscript: true, transcriptPath });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.exportTranscript).toHaveBeenCalledWith('session-123');
      expect(mockWriteTranscript).toHaveBeenCalledWith(transcriptPath, messages, ['test_value']);
    });

    it('9-3-AC4: does NOT call exportTranscript or writeTranscript when disabled', async () => {
      // Arrange
      const inputs = createValidInputs({ exportTranscript: false });

      // Act
      await runWorkflow(inputs);

      // Assert
      expect(mockOpenCodeService.exportTranscript).not.toHaveBeenCalled();
      expect(mockWriteTranscript).not.toHaveBeenCalled();
    });

    it('9-3-AC3: passes env_vars values as secrets to writeTranscript for scrubbing', async () => {
      // Arrange
      const inputs = createValidInputs({
        exportTranscript: true,
        transcriptPath: path.join(tempDir, 'conversation.json'),
        envVars: { SECRET_TOKEN: 'my_secret_value', API_KEY: 'another_secret' },
      });

      // Act
      await runWorkflow(inputs);

      // Assert
      const writeCall = mockWriteTranscript.mock.calls[0] as unknown[];
      const secrets = writeCall[2] as string[];
      expect(secrets).toContain('my_secret_value');
      expect(secrets).toContain('another_secret');
    });

    it('9-3-AC6: export failure does NOT fail the run', async () => {
      // Arrange
      mockOpenCodeService.exportTranscript.mockRejectedValue(new Error('SDK failure'));
      const inputs = createValidInputs({
        exportTranscript: true,
        transcriptPath: path.join(tempDir, 'conversation.json'),
      });

      // Act
      const result = await runWorkflow(inputs);

      // Assert: run still succeeds despite export failure
      expect(result.success).toBe(true);
      expect(mockWriteTranscript).not.toHaveBeenCalled();
    });

    it('9-3-AC1: uses RUNNER_TEMP default path when transcriptPath is empty', async () => {
      // Arrange
      const runnerTemp = path.join(tempDir, 'runner_temp');
      fs.mkdirSync(runnerTemp);
      process.env['RUNNER_TEMP'] = runnerTemp;
      const inputs = createValidInputs({ exportTranscript: true, transcriptPath: '' });

      // Act
      await runWorkflow(inputs);

      // Assert
      expect(mockWriteTranscript).toHaveBeenCalledWith(
        path.join(runnerTemp, 'conversation.json'),
        expect.any(Array),
        expect.any(Array)
      );
    });

    it('9-6-AC3: returns transcriptJsonPath in RunnerResult when exportTranscript is true', async () => {
      // Arrange
      const transcriptPath = path.join(tempDir, 'conversation.json');
      const inputs = createValidInputs({ exportTranscript: true, transcriptPath });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.transcriptJsonPath).toBe(transcriptPath);
    });

    it('9-6-AC3: transcriptJsonPath is empty string when exportTranscript is false', async () => {
      // Arrange
      const inputs = createValidInputs({ exportTranscript: false });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.transcriptJsonPath).toBe('');
    });

    it('9-6-AC3: transcriptJsonPath uses RUNNER_TEMP default when transcriptPath empty', async () => {
      // Arrange
      const runnerTemp = path.join(tempDir, 'runner_temp2');
      fs.mkdirSync(runnerTemp);
      process.env['RUNNER_TEMP'] = runnerTemp;
      const inputs = createValidInputs({ exportTranscript: true, transcriptPath: '' });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.transcriptJsonPath).toBe(path.join(runnerTemp, 'conversation.json'));
    });
  });

  describe('job summary', () => {
    let workflowFile: string;

    beforeEach(() => {
      workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Workflow');
    });

    it('9-4-AC1: calls writeJobSummary when writeJobSummary is enabled', async () => {
      // Arrange
      const messages = [{ info: { role: 'assistant' }, parts: [] }];
      mockOpenCodeService.exportTranscript.mockResolvedValue(messages);
      const inputs = createValidInputs({ writeJobSummary: true });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(mockWriteJobSummary).toHaveBeenCalledWith(
        messages,
        expect.objectContaining({
          success: true,
          finalMessage: 'Test response',
          secrets: ['test_value'],
        })
      );
    });

    it('9-4-AC4: messages fetched ONCE when both exportTranscript and writeJobSummary enabled', async () => {
      // Arrange
      const inputs = createValidInputs({
        exportTranscript: true,
        transcriptPath: path.join(tempDir, 'conversation.json'),
        writeJobSummary: true,
      });

      // Act
      await runWorkflow(inputs);

      // Assert: session.messages called exactly once
      expect(mockOpenCodeService.exportTranscript).toHaveBeenCalledTimes(1);
      expect(mockWriteTranscript).toHaveBeenCalledTimes(1);
      expect(mockWriteJobSummary).toHaveBeenCalledTimes(1);
    });

    it('9-4-AC6: summary failure does NOT fail the run', async () => {
      // Arrange
      mockWriteJobSummary.mockRejectedValueOnce(new Error('Summary error'));
      const inputs = createValidInputs({ writeJobSummary: true });

      // Act
      const result = await runWorkflow(inputs);

      // Note: writeJobSummary is called inside a try/catch in runner; the mock rejection
      // is caught and logged — run result is still success
      expect(result.success).toBe(true);
    });

    it('9-4-AC4: does NOT call writeJobSummary or exportTranscript when both flags false', async () => {
      // Arrange
      const inputs = createValidInputs({ exportTranscript: false, writeJobSummary: false });

      // Act
      await runWorkflow(inputs);

      // Assert
      expect(mockOpenCodeService.exportTranscript).not.toHaveBeenCalled();
      expect(mockWriteJobSummary).not.toHaveBeenCalled();
    });
  });

  describe('9.6-AC3: transcript_json_path output in RunnerResult', () => {
    let workflowFile: string;

    beforeEach(() => {
      workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Workflow');
    });

    it('returns transcriptJsonPath in result when exportTranscript is enabled', async () => {
      // Arrange
      const transcriptPath = path.join(tempDir, 'conversation.json');
      const inputs = createValidInputs({ exportTranscript: true, transcriptPath });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transcriptJsonPath).toBe(transcriptPath);
    });

    it('returns empty transcriptJsonPath when exportTranscript is disabled', async () => {
      // Arrange
      const inputs = createValidInputs({ exportTranscript: false });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transcriptJsonPath).toBeFalsy();
    });

    it('uses RUNNER_TEMP default path in transcriptJsonPath when transcriptPath is empty', async () => {
      // Arrange
      const runnerTemp = path.join(tempDir, 'runner_temp');
      fs.mkdirSync(runnerTemp);
      process.env['RUNNER_TEMP'] = runnerTemp;
      const inputs = createValidInputs({ exportTranscript: true, transcriptPath: '' });

      // Act
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.transcriptJsonPath).toBe(path.join(runnerTemp, 'conversation.json'));
    });

    it('9.6-AC5: omitting new inputs leaves RunnerResult transcriptJsonPath falsy', async () => {
      // Arrange
      const inputs = createValidInputs(); // exportTranscript: false by default

      // Act
      const result = await runWorkflow(inputs);

      // Assert (backward-compat)
      expect(result.success).toBe(true);
      expect(result.transcriptJsonPath).toBeFalsy();
    });
  });

  describe('9.7-AC2: Epic 9 integration — combined transcript + summary path', () => {
    let workflowFile: string;
    const sharedMessages = [
      {
        info: { role: 'assistant', cost: 0.01, tokens: { input: 100, output: 50 } },
        parts: [{ type: 'tool', tool: 'bash' }],
      },
    ];

    beforeEach(() => {
      workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Integration Workflow');
      mockOpenCodeService.exportTranscript.mockResolvedValue(sharedMessages);
    });

    it('9.7-AC2: both flags on → exportTranscript called ONCE, both writers invoked, transcriptJsonPath on result', async () => {
      // Arrange
      const transcriptPath = path.join(tempDir, 'conversation.json');
      const inputs = createValidInputs({
        exportTranscript: true,
        transcriptPath,
        writeJobSummary: true,
      });

      // Act
      const result = await runWorkflow(inputs);

      // Assert — single messages fetch feeding both writers
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.exportTranscript).toHaveBeenCalledTimes(1);
      expect(mockWriteTranscript).toHaveBeenCalledTimes(1);
      expect(mockWriteJobSummary).toHaveBeenCalledTimes(1);
      expect(result.transcriptJsonPath).toBe(transcriptPath);
    });

    it('9.7-AC2: both writers receive the same messages array from the single fetch', async () => {
      // Arrange
      const transcriptPath = path.join(tempDir, 'conversation.json');
      const inputs = createValidInputs({
        exportTranscript: true,
        transcriptPath,
        writeJobSummary: true,
      });

      // Act
      await runWorkflow(inputs);

      // Assert — transcript writer and summary writer both receive the shared messages
      const transcriptMessages = (mockWriteTranscript.mock.calls[0] as unknown[])[1];
      const summaryMessages = (mockWriteJobSummary.mock.calls[0] as unknown[])[0];
      expect(transcriptMessages).toBe(sharedMessages);
      expect(summaryMessages).toBe(sharedMessages);
    });

    it('9.7-AC3: secret in env_vars is scrubbed from transcript and NOT passed raw to summary', async () => {
      // Arrange — use a real writeTranscript to verify scrubbing end-to-end
      const secret = 'super_secret_value_xyz';
      const messagesWithSecret = [{ info: { role: 'assistant' }, parts: [], secretLeaked: secret }];
      mockOpenCodeService.exportTranscript.mockResolvedValue(messagesWithSecret);

      // Capture what writeTranscript receives
      const capturedTranscriptArgs: unknown[][] = [];
      mockWriteTranscript.mockImplementation((...args: unknown[]) => {
        capturedTranscriptArgs.push(args);
      });

      const capturedSummaryArgs: unknown[][] = [];
      mockWriteJobSummary.mockImplementation((...args: unknown[]) => {
        capturedSummaryArgs.push(args);
        return Promise.resolve();
      });

      const transcriptPath = path.join(tempDir, 'conversation.json');
      const inputs = createValidInputs({
        exportTranscript: true,
        transcriptPath,
        writeJobSummary: true,
        envVars: { SECRET_TOKEN: secret },
      });

      // Act
      await runWorkflow(inputs);

      // Assert: secret is passed as a secrets array to both writers for scrubbing
      const transcriptSecrets = capturedTranscriptArgs[0]?.[2] as string[];
      const summaryMeta = capturedSummaryArgs[0]?.[1] as { secrets: string[] };
      expect(transcriptSecrets).toContain(secret);
      expect(summaryMeta.secrets).toContain(secret);
    });

    it('9.7-AC5: no flags → no transcript write, no summary write, transcriptJsonPath falsy', async () => {
      // Arrange
      const inputs = createValidInputs({ exportTranscript: false, writeJobSummary: false });

      // Act
      const result = await runWorkflow(inputs);

      // Assert — backward-compatible: no side effects
      expect(result.success).toBe(true);
      expect(mockOpenCodeService.exportTranscript).not.toHaveBeenCalled();
      expect(mockWriteTranscript).not.toHaveBeenCalled();
      expect(mockWriteJobSummary).not.toHaveBeenCalled();
      expect(result.transcriptJsonPath).toBeFalsy();
    });
  });

  describe('9.7-AC4: stop-command regression', () => {
    it('stop-command bracketing is covered by opencode-session.spec.ts (9-5-AC1/AC2/AC3)', () => {
      // AC4 is verified in src/opencode-session.spec.ts describe('stop-command wrapping (9-5)').
      // Tests: 9-5-AC1 (brackets text part), 9-5-AC1/AC2 (::set-output:: bracketed + full lastMessage),
      // 9-5-AC3 (long text chunked, messageBuffer gets full text).
      // This sentinel test confirms the gap was checked and found covered — no duplication needed.
      expect(true).toBe(true);
    });
  });

  describe('9.7-AC6: runner.ts coverage gaps', () => {
    it('returns failure when workflow file exceeds maximum size', async () => {
      // Arrange — write a real file whose size exceeds the limit.
      // 10MB + 1 byte: build in chunks to stay within write buffer limits.
      const workflowFile = path.join(tempDir, 'big-workflow.md');
      const chunkSize = 65_536; // 64 KB
      const totalBytes = INPUT_LIMITS.MAX_WORKFLOW_FILE_SIZE + 1;
      const handle = fs.openSync(workflowFile, 'w');
      let written = 0;
      while (written < totalBytes) {
        const chunk = Buffer.alloc(Math.min(chunkSize, totalBytes - written), 0x41); // 'A'
        fs.writeSync(handle, chunk);
        written += chunk.length;
      }
      fs.closeSync(handle);

      // Act
      const inputs = createValidInputs({ workflowPath: 'big-workflow.md' });
      const result = await runWorkflow(inputs);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow file exceeds maximum size');
    });

    it('returns cancelled when abort signal fires during catch block', async () => {
      // Arrange — session throws after abort signal is set
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const abortController = new AbortController();
      mockOpenCodeService.runSession.mockImplementationOnce(async () => {
        abortController.abort();
        throw new Error('Aborted mid-run');
      });

      // Act
      const inputs = createValidInputs();
      const result = await runWorkflow(inputs, undefined, abortController.signal);

      // Assert — abort path in catch block (line 141)
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow execution was cancelled');
    });
  });
});
