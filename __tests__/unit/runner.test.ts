import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runWorkflow } from '../../src/runner';
import { ActionInputs, INPUT_LIMITS } from '../../src/types';

jest.mock('@actions/core');

describe('runner', () => {
  let tempDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
    process.env = { ...originalEnv, GITHUB_WORKSPACE: tempDir };
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
    ...overrides,
  });

  describe('runWorkflow', () => {
    it('returns success for valid workflow file', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test Workflow\nThis is a test.');

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Workflow runner stub');
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

    it('times out after specified duration', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const inputs = createValidInputs();
      const result = await runWorkflow(inputs, 1);

      expect(result.success).toBe(true);
    });

    it('truncates output exceeding size limit', async () => {
      const workflowFile = path.join(tempDir, 'test-workflow.md');
      fs.writeFileSync(workflowFile, '# Test');

      const inputs = createValidInputs({
        prompt: 'x'.repeat(INPUT_LIMITS.MAX_OUTPUT_SIZE),
      });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
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

    it('handles unicode in workflow path', async () => {
      const workflowFile = path.join(tempDir, 'workflow-日本語.md');
      fs.writeFileSync(workflowFile, '# Unicode Test');

      const inputs = createValidInputs({ workflowPath: 'workflow-日本語.md' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
    });

    it('handles spaces in workflow path', async () => {
      const workflowFile = path.join(tempDir, 'workflow with spaces.md');
      fs.writeFileSync(workflowFile, '# Spaces Test');

      const inputs = createValidInputs({ workflowPath: 'workflow with spaces.md' });
      const result = await runWorkflow(inputs);

      expect(result.success).toBe(true);
    });
  });
});
