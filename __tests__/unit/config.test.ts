import * as core from '@actions/core';
import { getInputs, validateInputs } from '../../src/config';
import { INPUT_LIMITS } from '../../src/types';

jest.mock('@actions/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInputs', () => {
    it('returns correct values from environment', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'workflows/test.md';
          case 'prompt':
            return 'Test prompt';
          case 'env_vars':
            return '{"KEY": "value"}';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs.workflowPath).toBe('workflows/test.md');
      expect(inputs.prompt).toBe('Test prompt');
      expect(inputs.envVars).toEqual({ KEY: 'value' });
      expect(inputs.timeoutMs).toBe(INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000);
    });

    it('parses JSON env_vars correctly', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return '{"API_KEY": "secret123", "DEBUG": "true"}';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs.envVars).toEqual({ API_KEY: 'secret123', DEBUG: 'true' });
    });

    it('masks all env_vars values as secrets', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return '{"SECRET1": "value1", "SECRET2": "value2"}';
          default:
            return '';
        }
      });

      getInputs();

      expect(mockCore.setSecret).toHaveBeenCalledWith('value1');
      expect(mockCore.setSecret).toHaveBeenCalledWith('value2');
    });

    it('rejects env_vars exceeding size limit', () => {
      const largeValue = 'x'.repeat(INPUT_LIMITS.MAX_ENV_VARS_SIZE + 1);
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return largeValue;
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('env_vars exceeds maximum size');
    });

    it('rejects env_vars with too many entries', () => {
      const manyEntries: Record<string, string> = {};
      for (let i = 0; i <= INPUT_LIMITS.MAX_ENV_VARS_COUNT; i++) {
        manyEntries[`KEY_${i}`] = `value_${i}`;
      }

      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return JSON.stringify(manyEntries);
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('env_vars exceeds maximum');
    });

    it('rejects non-object env_vars (array)', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return '["item1", "item2"]';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('must be a JSON object');
    });

    it('rejects non-object env_vars (primitive)', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return '"just a string"';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('must be a JSON object');
    });

    it('rejects non-object env_vars (null)', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return 'null';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('must be a JSON object');
    });

    it('rejects env_vars with non-string values', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return '{"KEY": 123}';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('must be a string, got number');
    });

    it('rejects invalid JSON in env_vars', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'workflow_path':
            return 'test.md';
          case 'env_vars':
            return 'not valid json';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('must be a valid JSON object');
    });
  });

  describe('validateInputs', () => {
    const DEFAULT_TIMEOUT = INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000;

    it('returns valid for correct inputs', () => {
      const inputs = {
        workflowPath: 'workflows/test.md',
        prompt: 'Test prompt',
        envVars: { KEY: 'value' },
        timeoutMs: DEFAULT_TIMEOUT,
      };

      const result = validateInputs(inputs);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for empty workflow_path', () => {
      const inputs = {
        workflowPath: '',
        prompt: '',
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
      };

      const result = validateInputs(inputs);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('workflow_path is required and cannot be empty');
    });

    it('returns errors for whitespace-only workflow_path', () => {
      const inputs = {
        workflowPath: '   ',
        prompt: '',
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
      };

      const result = validateInputs(inputs);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('workflow_path is required and cannot be empty');
    });

    it('returns errors for workflow_path exceeding length', () => {
      const inputs = {
        workflowPath: 'x'.repeat(INPUT_LIMITS.MAX_WORKFLOW_PATH_LENGTH + 1),
        prompt: '',
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
      };

      const result = validateInputs(inputs);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum length');
    });

    it('returns errors for prompt exceeding size', () => {
      const inputs = {
        workflowPath: 'test.md',
        prompt: 'x'.repeat(INPUT_LIMITS.MAX_PROMPT_LENGTH + 1),
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
      };

      const result = validateInputs(inputs);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum size');
    });
  });
});
