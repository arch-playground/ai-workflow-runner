import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as core from '@actions/core';
import { getInputs, validateInputs } from './config';
import { INPUT_LIMITS } from './types';
import { maskSecrets, validateWorkspacePath } from './security';

jest.mock('@actions/core');
jest.mock('./security');

const mockCore = core as jest.Mocked<typeof core>;
const mockMaskSecrets = maskSecrets as jest.MockedFunction<typeof maskSecrets>;
const mockValidateWorkspacePath = validateWorkspacePath as jest.MockedFunction<
  typeof validateWorkspacePath
>;

function mockInputs(overrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = { workflow_path: 'test.md' };
  const inputs = { ...defaults, ...overrides };
  mockCore.getInput.mockImplementation((name: string) => inputs[name] ?? '');
}

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInputs', () => {
    it('returns correct values from environment', () => {
      // Arrange
      mockInputs({
        workflow_path: 'workflows/test.md',
        prompt: 'Test prompt',
        env_vars: '{"KEY": "value"}',
      });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.workflowPath).toBe('workflows/test.md');
      expect(inputs.prompt).toBe('Test prompt');
      expect(inputs.envVars).toEqual({ KEY: 'value' });
      expect(inputs.timeoutMs).toBe(INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000);
    });

    it('parses JSON env_vars correctly', () => {
      // Arrange
      mockInputs({ env_vars: '{"API_KEY": "secret123", "DEBUG": "true"}' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.envVars).toEqual({ API_KEY: 'secret123', DEBUG: 'true' });
    });

    it('masks all env_vars values as secrets', () => {
      // Arrange
      mockInputs({ env_vars: '{"SECRET1": "value1", "SECRET2": "value2"}' });

      // Act
      getInputs();

      // Assert
      expect(mockMaskSecrets).toHaveBeenCalledWith({ SECRET1: 'value1', SECRET2: 'value2' });
    });

    it('rejects env_vars exceeding size limit', () => {
      // Arrange
      mockInputs({ env_vars: 'x'.repeat(INPUT_LIMITS.MAX_ENV_VARS_SIZE + 1) });

      // Act & Assert
      expect(() => getInputs()).toThrow('env_vars exceeds maximum size');
    });

    it('rejects env_vars with too many entries', () => {
      // Arrange
      const manyEntries: Record<string, string> = {};
      for (let i = 0; i <= INPUT_LIMITS.MAX_ENV_VARS_COUNT; i++) {
        manyEntries[`KEY_${i}`] = `value_${i}`;
      }
      mockInputs({ env_vars: JSON.stringify(manyEntries) });

      // Act & Assert
      expect(() => getInputs()).toThrow('env_vars exceeds maximum');
    });

    it('rejects non-object env_vars (array)', () => {
      // Arrange
      mockInputs({ env_vars: '["item1", "item2"]' });

      // Act & Assert
      expect(() => getInputs()).toThrow('must be a JSON object');
    });

    it('rejects non-object env_vars (primitive)', () => {
      // Arrange
      mockInputs({ env_vars: '"just a string"' });

      // Act & Assert
      expect(() => getInputs()).toThrow('must be a JSON object');
    });

    it('rejects non-object env_vars (null)', () => {
      // Arrange
      mockInputs({ env_vars: 'null' });

      // Act & Assert
      expect(() => getInputs()).toThrow('must be a JSON object');
    });

    it('rejects env_vars with non-string values', () => {
      // Arrange
      mockInputs({ env_vars: '{"KEY": 123}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('must be a string, got number');
    });

    it('rejects invalid JSON in env_vars', () => {
      // Arrange
      mockInputs({ env_vars: 'not valid json' });

      // Act & Assert
      expect(() => getInputs()).toThrow('must be a valid JSON object');
    });

    it('parses custom timeout_minutes', () => {
      // Arrange
      mockInputs({ timeout_minutes: '60' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.timeoutMs).toBe(60 * 60 * 1000);
    });

    it('rejects non-positive timeout_minutes', () => {
      // Arrange
      mockInputs({ timeout_minutes: '0' });

      // Act & Assert
      expect(() => getInputs()).toThrow('timeout_minutes must be a positive integer');
    });

    it('rejects negative timeout_minutes', () => {
      // Arrange
      mockInputs({ timeout_minutes: '-5' });

      // Act & Assert
      expect(() => getInputs()).toThrow('timeout_minutes must be a positive integer');
    });

    it('rejects non-numeric timeout_minutes', () => {
      // Arrange
      mockInputs({ timeout_minutes: 'abc' });

      // Act & Assert
      expect(() => getInputs()).toThrow('timeout_minutes must be a positive integer');
    });

    it('rejects timeout_minutes exceeding max', () => {
      // Arrange
      mockInputs({ timeout_minutes: String(INPUT_LIMITS.MAX_TIMEOUT_MINUTES + 1) });

      // Act & Assert
      expect(() => getInputs()).toThrow('timeout_minutes exceeds maximum');
    });

    it('rejects env_vars with invalid key characters', () => {
      // Arrange
      mockInputs({ env_vars: '{"invalid-key": "value"}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('contains invalid characters');
    });

    it('rejects env_vars with key starting with number', () => {
      // Arrange
      mockInputs({ env_vars: '{"123KEY": "value"}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('contains invalid characters');
    });

    it('rejects reserved env var PATH', () => {
      // Arrange
      mockInputs({ env_vars: '{"PATH": "/malicious/path"}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('cannot override reserved variable');
    });

    it('rejects reserved env var LD_PRELOAD (case insensitive)', () => {
      // Arrange
      mockInputs({ env_vars: '{"ld_preload": "/malicious/lib.so"}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('cannot override reserved variable');
    });

    it('rejects GITHUB_ prefixed variables', () => {
      // Arrange
      mockInputs({ env_vars: '{"GITHUB_TOKEN": "fake_token"}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('cannot override GitHub Actions variable');
    });

    it('rejects github_ prefixed variables (case insensitive)', () => {
      // Arrange
      mockInputs({ env_vars: '{"github_workspace": "/fake/path"}' });

      // Act & Assert
      expect(() => getInputs()).toThrow('cannot override GitHub Actions variable');
    });

    it('parses validation_script correctly', () => {
      // Arrange
      mockInputs({ validation_script: 'check.py' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.validationScript).toBe('check.py');
    });

    it('parses validation_script_type correctly', () => {
      // Arrange
      mockInputs({ validation_script: 'print("ok")', validation_script_type: 'python' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.validationScriptType).toBe('python');
    });

    it('defaults validation_max_retry to 5', () => {
      // Arrange
      mockInputs();

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.maxValidationRetries).toBe(5);
    });

    it('parses custom validation_max_retry', () => {
      // Arrange
      mockInputs({ validation_max_retry: '10' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.maxValidationRetries).toBe(10);
    });

    it('rejects validation_max_retry below 1', () => {
      // Arrange
      mockInputs({ validation_max_retry: '0' });

      // Act & Assert
      expect(() => getInputs()).toThrow('validation_max_retry must be between 1 and');
    });

    it('rejects validation_max_retry above max', () => {
      // Arrange
      mockInputs({ validation_max_retry: String(INPUT_LIMITS.MAX_VALIDATION_RETRY + 1) });

      // Act & Assert
      expect(() => getInputs()).toThrow('validation_max_retry must be between 1 and');
    });

    it('rejects invalid validation_script_type', () => {
      // Arrange
      mockInputs({ validation_script: 'check', validation_script_type: 'ruby' });

      // Act & Assert
      expect(() => getInputs()).toThrow('validation_script_type must be "python" or "javascript"');
    });

    it('rejects validation_script_type without validation_script', () => {
      // Arrange
      mockInputs({ validation_script_type: 'python' });

      // Act & Assert
      expect(() => getInputs()).toThrow(
        'validation_script_type requires validation_script to be set'
      );
    });

    it('rejects validation_script exceeding size limit', () => {
      // Arrange
      mockInputs({ validation_script: 'x'.repeat(INPUT_LIMITS.MAX_INLINE_SCRIPT_SIZE + 1) });

      // Act & Assert
      expect(() => getInputs()).toThrow('validation_script exceeds maximum size');
    });

    it('validates opencode_config within workspace (7.2-UNIT-001, 7.2-UNIT-002)', () => {
      // Arrange
      mockInputs({ opencode_config: 'config/opencode.json' });
      mockValidateWorkspacePath.mockReturnValue('/workspace/config/opencode.json');

      // Act
      const inputs = getInputs();

      // Assert
      expect(mockValidateWorkspacePath).toHaveBeenCalledWith(process.cwd(), 'config/opencode.json');
      expect(inputs.opencodeConfig).toBe('/workspace/config/opencode.json');
    });

    it('returns undefined for opencodeConfig when input is empty', () => {
      // Arrange
      mockInputs();

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.opencodeConfig).toBeUndefined();
    });

    it('rejects opencode_config with path traversal (7.2-UNIT-003)', () => {
      // Arrange
      mockInputs({ opencode_config: '../../../etc/secrets' });
      mockValidateWorkspacePath.mockImplementation(() => {
        throw new Error(
          'Invalid workflow path: absolute paths and parent directory references are not allowed'
        );
      });

      // Act & Assert
      expect(() => getInputs()).toThrow(
        'Invalid workflow path: absolute paths and parent directory references are not allowed'
      );
    });

    it('validates auth_config within workspace (7.2-UNIT-004, 7.2-UNIT-005)', () => {
      // Arrange
      mockInputs({ auth_config: 'config/auth.json' });
      mockValidateWorkspacePath.mockReturnValue('/workspace/config/auth.json');

      // Act
      const inputs = getInputs();

      // Assert
      expect(mockValidateWorkspacePath).toHaveBeenCalledWith(process.cwd(), 'config/auth.json');
      expect(inputs.authConfig).toBe('/workspace/config/auth.json');
    });

    it('returns undefined for authConfig when input is empty', () => {
      // Arrange
      mockInputs();

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.authConfig).toBeUndefined();
    });

    it('rejects auth_config with path traversal (7.2-UNIT-006)', () => {
      // Arrange
      mockInputs({ auth_config: '../../../etc/passwd' });
      mockValidateWorkspacePath.mockImplementation(() => {
        throw new Error(
          'Invalid workflow path: absolute paths and parent directory references are not allowed'
        );
      });

      // Act & Assert
      expect(() => getInputs()).toThrow(
        'Invalid workflow path: absolute paths and parent directory references are not allowed'
      );
    });

    it('does not call validateWorkspacePath when configs are empty', () => {
      // Arrange
      mockInputs();

      // Act
      getInputs();

      // Assert
      expect(mockValidateWorkspacePath).not.toHaveBeenCalled();
    });

    describe('when GITHUB_WORKSPACE is set', () => {
      let originalWorkspace: string | undefined;

      beforeEach(() => {
        originalWorkspace = process.env.GITHUB_WORKSPACE;
      });

      afterEach(() => {
        if (originalWorkspace === undefined) {
          delete process.env.GITHUB_WORKSPACE;
        } else {
          process.env.GITHUB_WORKSPACE = originalWorkspace;
        }
      });

      it('uses GITHUB_WORKSPACE for path validation when set', () => {
        // Arrange
        process.env.GITHUB_WORKSPACE = '/github/workspace';
        mockInputs({ opencode_config: 'config/opencode.json' });
        mockValidateWorkspacePath.mockReturnValue('/github/workspace/config/opencode.json');

        // Act
        const inputs = getInputs();

        // Assert
        expect(mockValidateWorkspacePath).toHaveBeenCalledWith(
          '/github/workspace',
          'config/opencode.json'
        );
        expect(inputs.opencodeConfig).toBe('/github/workspace/config/opencode.json');
      });
    });

    it('captures model string when provided', () => {
      // Arrange
      mockInputs({ model: 'anthropic/claude-3-opus' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.model).toBe('anthropic/claude-3-opus');
    });

    it('returns undefined for model when input is empty', () => {
      // Arrange
      mockInputs();

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.model).toBeUndefined();
    });

    it('sets listModels to true when input is "true"', () => {
      // Arrange
      mockInputs({ list_models: 'true' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.listModels).toBe(true);
    });

    it('sets listModels to false when input is "false"', () => {
      // Arrange
      mockInputs({ list_models: 'false' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.listModels).toBe(false);
    });

    it('defaults listModels to false when input is empty', () => {
      // Arrange
      mockInputs();

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.listModels).toBe(false);
    });

    it('parses listModels case-insensitively', () => {
      // Arrange
      mockInputs({ list_models: 'TRUE' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.listModels).toBe(true);
    });

    it('trims whitespace when parsing listModels', () => {
      // Arrange
      mockInputs({ list_models: '  true  ' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.listModels).toBe(true);
    });
  });

  describe('action.yml schema', () => {
    interface ActionYmlInput {
      description: string;
      required?: boolean;
      default?: string;
    }

    let actionInputs: Record<string, ActionYmlInput>;

    beforeAll(() => {
      const actionYmlPath = path.resolve(__dirname, '..', 'action.yml');
      const actionYml = yaml.load(fs.readFileSync(actionYmlPath, 'utf8')) as {
        inputs: Record<string, ActionYmlInput>;
      };
      actionInputs = actionYml.inputs;
    });

    it('defines opencode_config as optional string with empty default (7.1-UNIT-001)', () => {
      // Assert
      const input = actionInputs['opencode_config']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('');
    });

    it('defines auth_config as optional string with empty default (7.1-UNIT-002)', () => {
      // Assert
      const input = actionInputs['auth_config']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('');
    });

    it('defines model as optional string with empty default (7.1-UNIT-003)', () => {
      // Assert
      const input = actionInputs['model']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('');
    });

    it('defines list_models as optional boolean with false default (7.1-UNIT-004)', () => {
      // Assert
      const input = actionInputs['list_models']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('false');
    });
  });

  describe('validateInputs', () => {
    const DEFAULT_TIMEOUT = INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
    const DEFAULT_VALIDATION_RETRY = INPUT_LIMITS.DEFAULT_VALIDATION_RETRY;

    it('returns valid for correct inputs', () => {
      // Arrange
      const inputs = {
        workflowPath: 'workflows/test.md',
        prompt: 'Test prompt',
        envVars: { KEY: 'value' },
        timeoutMs: DEFAULT_TIMEOUT,
        maxValidationRetries: DEFAULT_VALIDATION_RETRY,
        listModels: false,
      };

      // Act
      const result = validateInputs(inputs);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for empty workflow_path', () => {
      // Arrange
      const inputs = {
        workflowPath: '',
        prompt: '',
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
        maxValidationRetries: DEFAULT_VALIDATION_RETRY,
        listModels: false,
      };

      // Act
      const result = validateInputs(inputs);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('workflow_path is required and cannot be empty');
    });

    it('returns errors for whitespace-only workflow_path', () => {
      // Arrange
      const inputs = {
        workflowPath: '   ',
        prompt: '',
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
        maxValidationRetries: DEFAULT_VALIDATION_RETRY,
        listModels: false,
      };

      // Act
      const result = validateInputs(inputs);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('workflow_path is required and cannot be empty');
    });

    it('returns errors for workflow_path exceeding length', () => {
      // Arrange
      const inputs = {
        workflowPath: 'x'.repeat(INPUT_LIMITS.MAX_WORKFLOW_PATH_LENGTH + 1),
        prompt: '',
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
        maxValidationRetries: DEFAULT_VALIDATION_RETRY,
        listModels: false,
      };

      // Act
      const result = validateInputs(inputs);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum length');
    });

    it('returns errors for prompt exceeding size', () => {
      // Arrange
      const inputs = {
        workflowPath: 'test.md',
        prompt: 'x'.repeat(INPUT_LIMITS.MAX_PROMPT_LENGTH + 1),
        envVars: {},
        timeoutMs: DEFAULT_TIMEOUT,
        maxValidationRetries: DEFAULT_VALIDATION_RETRY,
        listModels: false,
      };

      // Act
      const result = validateInputs(inputs);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum size');
    });
  });
});
