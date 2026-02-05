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
  });
});
