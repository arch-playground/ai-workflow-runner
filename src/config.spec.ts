import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as core from '@actions/core';
import { getInputs, validateInputs, validateDebugLogPath, validateSafeOutputPath } from './config';
import { INPUT_LIMITS } from './types';
import { maskSecrets, validateConfigPath } from './security';

jest.mock('@actions/core');
jest.mock('./security');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
}));

const mockCore = core as jest.Mocked<typeof core>;
const mockMaskSecrets = maskSecrets as jest.MockedFunction<typeof maskSecrets>;
const mockValidateConfigPath = validateConfigPath as jest.MockedFunction<typeof validateConfigPath>;

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
      mockValidateConfigPath.mockReturnValue('/workspace/config/opencode.json');

      // Act
      const inputs = getInputs();

      // Assert
      expect(mockValidateConfigPath).toHaveBeenCalledWith(process.cwd(), 'config/opencode.json');
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
      mockValidateConfigPath.mockImplementation(() => {
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
      mockValidateConfigPath.mockReturnValue('/workspace/config/auth.json');

      // Act
      const inputs = getInputs();

      // Assert
      expect(mockValidateConfigPath).toHaveBeenCalledWith(process.cwd(), 'config/auth.json');
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
      mockValidateConfigPath.mockImplementation(() => {
        throw new Error(
          'Invalid workflow path: absolute paths and parent directory references are not allowed'
        );
      });

      // Act & Assert
      expect(() => getInputs()).toThrow(
        'Invalid workflow path: absolute paths and parent directory references are not allowed'
      );
    });

    it('accepts auth_config with absolute path under runner temp (7.2-UNIT-007)', () => {
      // Arrange
      mockInputs({ auth_config: '/tmp/auth.json' });
      mockValidateConfigPath.mockReturnValue('/tmp/auth.json');

      // Act
      const inputs = getInputs();

      // Assert
      expect(mockValidateConfigPath).toHaveBeenCalledWith(process.cwd(), '/tmp/auth.json');
      expect(inputs.authConfig).toBe('/tmp/auth.json');
    });

    it('accepts opencode_config with absolute path under runner temp (7.2-UNIT-008)', () => {
      // Arrange
      mockInputs({ opencode_config: '/tmp/config.json' });
      mockValidateConfigPath.mockReturnValue('/tmp/config.json');

      // Act
      const inputs = getInputs();

      // Assert
      expect(mockValidateConfigPath).toHaveBeenCalledWith(process.cwd(), '/tmp/config.json');
      expect(inputs.opencodeConfig).toBe('/tmp/config.json');
    });

    it('does not call validateConfigPath when configs are empty', () => {
      // Arrange
      mockInputs();

      // Act
      getInputs();

      // Assert
      expect(mockValidateConfigPath).not.toHaveBeenCalled();
    });

    describe('fallback_config parsing', () => {
      it('11-1-AC2: validates fallback_config path and stores as fallbackConfig', () => {
        // Arrange
        mockInputs({ fallback_config: 'config/fallback.json' });
        mockValidateConfigPath.mockReturnValue('/workspace/config/fallback.json');

        // Act
        const inputs = getInputs();

        // Assert
        expect(mockValidateConfigPath).toHaveBeenCalledWith(
          expect.any(String),
          'config/fallback.json'
        );
        expect(inputs.fallbackConfig).toBe('/workspace/config/fallback.json');
      });

      it('11-1-AC6: fallbackConfig is undefined when fallback_config input is absent', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.fallbackConfig).toBeUndefined();
      });
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
        mockValidateConfigPath.mockReturnValue('/github/workspace/config/opencode.json');

        // Act
        const inputs = getInputs();

        // Assert
        expect(mockValidateConfigPath).toHaveBeenCalledWith(
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

    describe('disable_free_models parsing', () => {
      it('10-3-AC2: parses disable_free_models "true" as boolean true', () => {
        // Arrange
        mockInputs({ disable_free_models: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.disableFreeModels).toBe(true);
      });

      it('10-3-AC2: parses disable_free_models "false" as boolean false', () => {
        // Arrange
        mockInputs({ disable_free_models: 'false' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.disableFreeModels).toBe(false);
      });

      it('10-3-AC2: defaults disableFreeModels to false when input absent', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.disableFreeModels).toBe(false);
      });
    });

    describe('subscription_providers parsing', () => {
      it('10-5-AC2: parses single provider id', () => {
        // Arrange
        mockInputs({ subscription_providers: 'my-gateway' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.subscriptionProviders).toEqual(['my-gateway']);
      });

      it('10-5-AC2: parses comma-separated list', () => {
        // Arrange
        mockInputs({ subscription_providers: 'my-gateway,bedrock-custom,enterprise-proxy' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.subscriptionProviders).toEqual([
          'my-gateway',
          'bedrock-custom',
          'enterprise-proxy',
        ]);
      });

      it('10-5-AC2: trims whitespace around each entry', () => {
        // Arrange
        mockInputs({ subscription_providers: ' my-gateway , bedrock-custom ' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.subscriptionProviders).toEqual(['my-gateway', 'bedrock-custom']);
      });

      it('10-5-AC2: drops empty entries (e.g. trailing comma)', () => {
        // Arrange
        mockInputs({ subscription_providers: 'my-gateway,' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.subscriptionProviders).toEqual(['my-gateway']);
      });

      it('10-5-AC2: returns [] when input is empty (default)', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.subscriptionProviders).toEqual([]);
      });
    });

    describe('allowed_provider_hosts parsing', () => {
      it('13-4-AC2: parses single host glob', () => {
        // Arrange
        mockInputs({ allowed_provider_hosts: 'my-gateway.corp.com' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.allowedProviderHosts).toEqual(['my-gateway.corp.com']);
      });

      it('13-4-AC2: parses comma-separated list', () => {
        // Arrange
        mockInputs({ allowed_provider_hosts: 'my-gateway.corp.com,*.internal-ai.corp' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.allowedProviderHosts).toEqual(['my-gateway.corp.com', '*.internal-ai.corp']);
      });

      it('13-4-AC2: trims whitespace around each entry', () => {
        // Arrange
        mockInputs({ allowed_provider_hosts: ' my-gateway.corp.com , *.internal.corp ' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.allowedProviderHosts).toEqual(['my-gateway.corp.com', '*.internal.corp']);
      });

      it('13-4-AC2: returns [] when input is empty (default)', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.allowedProviderHosts).toEqual([]);
      });
    });

    describe('debug_log parsing', () => {
      let originalActionsStepDebug: string | undefined;
      let originalRunnerDebug: string | undefined;
      let originalRunnerTemp: string | undefined;

      beforeEach(() => {
        originalActionsStepDebug = process.env.ACTIONS_STEP_DEBUG;
        originalRunnerDebug = process.env.RUNNER_DEBUG;
        originalRunnerTemp = process.env.RUNNER_TEMP;
        delete process.env.ACTIONS_STEP_DEBUG;
        delete process.env.RUNNER_DEBUG;
      });

      afterEach(() => {
        if (originalActionsStepDebug === undefined) delete process.env.ACTIONS_STEP_DEBUG;
        else process.env.ACTIONS_STEP_DEBUG = originalActionsStepDebug;
        if (originalRunnerDebug === undefined) delete process.env.RUNNER_DEBUG;
        else process.env.RUNNER_DEBUG = originalRunnerDebug;
        if (originalRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
        else process.env.RUNNER_TEMP = originalRunnerTemp;
      });

      it('sets debugLog to true when debug_log input is "true"', () => {
        // Arrange
        mockInputs({ debug_log: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLog).toBe(true);
      });

      it('sets debugLog to false when debug_log input is "false"', () => {
        // Arrange
        mockInputs({ debug_log: 'false' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLog).toBe(false);
      });

      it('defaults debugLog to false when input is empty', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLog).toBe(false);
      });

      it('sets debugLog to true when ACTIONS_STEP_DEBUG=true', () => {
        // Arrange
        process.env.ACTIONS_STEP_DEBUG = 'true';
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLog).toBe(true);
      });

      it('sets debugLog to true when RUNNER_DEBUG=1', () => {
        // Arrange
        process.env.RUNNER_DEBUG = '1';
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLog).toBe(true);
      });

      it('defaults debugLogPath to $RUNNER_TEMP/opencode-debug.log', () => {
        // Arrange
        process.env.RUNNER_TEMP = '/tmp/runner-temp';
        mockInputs({ debug_log: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLogPath).toBe('/tmp/runner-temp/opencode-debug.log');
      });

      it('defaults debugLogPath to /tmp/opencode-debug.log when RUNNER_TEMP is unset', () => {
        // Arrange
        delete process.env.RUNNER_TEMP;
        mockInputs({ debug_log: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLogPath).toBe('/tmp/opencode-debug.log');
      });

      it('does not validate debugLogPath when debugLog is false', () => {
        // Arrange
        mockInputs({ debug_log: 'false', debug_log_path: '/etc/bad-path/debug.log' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.debugLog).toBe(false);
        expect(inputs.debugLogPath).toBe('');
      });
    });

    describe('9.6-AC2: export_transcript parsing', () => {
      it('sets exportTranscript to true when input is "true"', () => {
        // Arrange
        mockInputs({ export_transcript: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.exportTranscript).toBe(true);
      });

      it('sets exportTranscript to false when input is "false"', () => {
        // Arrange
        mockInputs({ export_transcript: 'false' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.exportTranscript).toBe(false);
      });

      it('defaults exportTranscript to false when input is absent', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.exportTranscript).toBe(false);
      });

      it('parses exportTranscript case-insensitively', () => {
        // Arrange
        mockInputs({ export_transcript: 'TRUE' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.exportTranscript).toBe(true);
      });

      it('trims whitespace when parsing exportTranscript', () => {
        // Arrange
        mockInputs({ export_transcript: '  true  ' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.exportTranscript).toBe(true);
      });
    });

    describe('9.6-AC2: write_job_summary parsing', () => {
      it('sets writeJobSummary to true when input is "true"', () => {
        // Arrange
        mockInputs({ write_job_summary: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.writeJobSummary).toBe(true);
      });

      it('sets writeJobSummary to false when input is "false"', () => {
        // Arrange
        mockInputs({ write_job_summary: 'false' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.writeJobSummary).toBe(false);
      });

      it('defaults writeJobSummary to false when input is absent', () => {
        // Arrange
        mockInputs();

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.writeJobSummary).toBe(false);
      });

      it('parses writeJobSummary case-insensitively', () => {
        // Arrange
        mockInputs({ write_job_summary: 'TRUE' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.writeJobSummary).toBe(true);
      });
    });

    describe('9.6-AC2: transcript_path parsing', () => {
      let originalRunnerTemp: string | undefined;

      beforeEach(() => {
        originalRunnerTemp = process.env.RUNNER_TEMP;
      });

      afterEach(() => {
        if (originalRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
        else process.env.RUNNER_TEMP = originalRunnerTemp;
      });

      it('defaults transcriptPath to $RUNNER_TEMP/conversation.json when export enabled and path absent', () => {
        // Arrange
        process.env.RUNNER_TEMP = '/tmp/runner-temp';
        mockInputs({ export_transcript: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.transcriptPath).toBe('/tmp/runner-temp/conversation.json');
      });

      it('defaults transcriptPath to /tmp/conversation.json when RUNNER_TEMP unset and export enabled', () => {
        // Arrange
        delete process.env.RUNNER_TEMP;
        mockInputs({ export_transcript: 'true' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.transcriptPath).toBe('/tmp/conversation.json');
      });

      it('leaves transcriptPath empty when export is disabled (even if path provided)', () => {
        // Arrange
        mockInputs({
          export_transcript: 'false',
          transcript_path: '/etc/bad-path/transcript.json',
        });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.exportTranscript).toBe(false);
        expect(inputs.transcriptPath).toBe('');
      });

      it('validates and resolves transcript_path under /tmp', () => {
        // Arrange
        mockInputs({ export_transcript: 'true', transcript_path: '/tmp/my-transcript.json' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.transcriptPath).toBe('/tmp/my-transcript.json');
      });

      it('accepts workspace-relative transcript_path', () => {
        // Arrange
        mockInputs({ export_transcript: 'true', transcript_path: 'artifacts/transcript.json' });

        // Act
        const inputs = getInputs();

        // Assert
        expect(inputs.transcriptPath).toBe(
          require('path').join(process.cwd(), 'artifacts/transcript.json')
        );
      });

      it('rejects transcript_path escaping workspace', () => {
        // Arrange
        mockInputs({ export_transcript: 'true', transcript_path: '../../etc/transcript.json' });

        // Act & Assert
        expect(() => getInputs()).toThrow('path escapes the workspace directory');
      });

      it('rejects absolute transcript_path outside safe directories', () => {
        // Arrange
        mockInputs({ export_transcript: 'true', transcript_path: '/etc/transcript.json' });

        // Act & Assert
        expect(() => getInputs()).toThrow('Invalid transcript_path');
      });

      it('9.6-AC5: omitting new inputs leaves existing behavior unchanged', () => {
        // Arrange
        mockInputs({ workflow_path: 'test.md' });

        // Act
        const inputs = getInputs();

        // Assert (backward-compat: defaults off)
        expect(inputs.exportTranscript).toBe(false);
        expect(inputs.writeJobSummary).toBe(false);
        expect(inputs.transcriptPath).toBe('');
      });
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

    it('defines debug_log as optional with false default', () => {
      // Assert
      const input = actionInputs['debug_log']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('false');
    });

    it('defines debug_log_path as optional with empty default', () => {
      // Assert
      const input = actionInputs['debug_log_path']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('');
    });

    it('9.6-AC1: defines export_transcript as optional boolean with false default', () => {
      // Assert
      const input = actionInputs['export_transcript']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('false');
    });

    it('9.6-AC1: defines write_job_summary as optional boolean with false default', () => {
      // Assert
      const input = actionInputs['write_job_summary']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('false');
    });

    it('9.6-AC1: defines transcript_path as optional string with empty default', () => {
      // Assert
      const input = actionInputs['transcript_path']!;
      expect(input).toBeDefined();
      expect(input.required).toBe(false);
      expect(input.default).toBe('');
    });

    it('9.6-AC1: declares transcript_json_path output', () => {
      // Arrange
      const actionYmlPath = path.resolve(__dirname, '..', 'action.yml');
      const actionYml = yaml.load(fs.readFileSync(actionYmlPath, 'utf8')) as {
        outputs: Record<string, { description: string }>;
      };

      // Assert
      const output = actionYml.outputs['transcript_json_path'];
      expect(output).toBeDefined();
      expect(output!.description).toBeTruthy();
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
        disableFreeModels: false,
        subscriptionProviders: [],
        debugLog: false,
        debugLogPath: '',
        exportTranscript: false,
        transcriptPath: '',
        writeJobSummary: false,
        bashAllowPatterns: '',
        allowedProviderHosts: [],
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
        disableFreeModels: false,
        subscriptionProviders: [],
        debugLog: false,
        debugLogPath: '',
        exportTranscript: false,
        transcriptPath: '',
        writeJobSummary: false,
        bashAllowPatterns: '',
        allowedProviderHosts: [],
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
        disableFreeModels: false,
        subscriptionProviders: [],
        debugLog: false,
        debugLogPath: '',
        exportTranscript: false,
        transcriptPath: '',
        writeJobSummary: false,
        bashAllowPatterns: '',
        allowedProviderHosts: [],
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
        disableFreeModels: false,
        subscriptionProviders: [],
        debugLog: false,
        debugLogPath: '',
        exportTranscript: false,
        transcriptPath: '',
        writeJobSummary: false,
        bashAllowPatterns: '',
        allowedProviderHosts: [],
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
        disableFreeModels: false,
        subscriptionProviders: [],
        debugLog: false,
        debugLogPath: '',
        exportTranscript: false,
        transcriptPath: '',
        writeJobSummary: false,
        bashAllowPatterns: '',
        allowedProviderHosts: [],
      };

      // Act
      const result = validateInputs(inputs);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum size');
    });
  });

  describe('validateDebugLogPath', () => {
    let originalRunnerTemp: string | undefined;

    beforeEach(() => {
      originalRunnerTemp = process.env.RUNNER_TEMP;
    });

    afterEach(() => {
      if (originalRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
      else process.env.RUNNER_TEMP = originalRunnerTemp;
    });

    it('accepts absolute path under /tmp', () => {
      // Act
      const result = validateDebugLogPath('/workspace', '/tmp/debug.log');

      // Assert
      expect(result).toBe('/tmp/debug.log');
    });

    it('accepts absolute path under RUNNER_TEMP', () => {
      // Arrange
      process.env.RUNNER_TEMP = '/home/runner/temp';

      // Act
      const result = validateDebugLogPath('/workspace', '/home/runner/temp/debug.log');

      // Assert
      expect(result).toBe('/home/runner/temp/debug.log');
    });

    it('rejects absolute path outside safe directories', () => {
      // Act & Assert
      expect(() => validateDebugLogPath('/workspace', '/etc/debug.log')).toThrow(
        'Invalid debug_log_path'
      );
    });

    it('resolves relative path against workspace', () => {
      // Act
      const result = validateDebugLogPath('/workspace', 'logs/debug.log');

      // Assert
      expect(result).toBe('/workspace/logs/debug.log');
    });

    it('rejects relative path escaping workspace', () => {
      // Act & Assert
      expect(() => validateDebugLogPath('/workspace', '../../etc/debug.log')).toThrow(
        'Invalid debug_log_path: path escapes the workspace directory'
      );
    });

    it('creates parent directories', () => {
      // Act
      validateDebugLogPath('/workspace', 'deep/nested/dir/debug.log');

      // Assert
      expect(fs.mkdirSync).toHaveBeenCalledWith('/workspace/deep/nested/dir', { recursive: true });
    });
  });

  describe('validateSafeOutputPath', () => {
    it('accepts absolute path under /tmp with custom inputName', () => {
      const result = validateSafeOutputPath(
        '/workspace',
        '/tmp/conversation.json',
        'transcript_path'
      );
      expect(result).toBe('/tmp/conversation.json');
    });

    it('rejects unsafe absolute path with inputName in error', () => {
      expect(() =>
        validateSafeOutputPath('/workspace', '/etc/conversation.json', 'transcript_path')
      ).toThrow('Invalid transcript_path');
    });

    it('accepts workspace-relative path', () => {
      const result = validateSafeOutputPath(
        '/workspace',
        'output/transcript.json',
        'transcript_path'
      );
      expect(result).toBe('/workspace/output/transcript.json');
    });

    it('rejects path escaping workspace', () => {
      expect(() =>
        validateSafeOutputPath('/workspace', '../../etc/out.json', 'transcript_path')
      ).toThrow('Invalid transcript_path: path escapes the workspace directory');
    });
  });

  describe('getInputs — new conversation-logging inputs', () => {
    let originalRunnerTemp: string | undefined;

    beforeEach(() => {
      originalRunnerTemp = process.env.RUNNER_TEMP;
      delete process.env['GITHUB_WORKSPACE'];
    });

    afterEach(() => {
      if (originalRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
      else process.env.RUNNER_TEMP = originalRunnerTemp;
    });

    it('9-6-AC2: export_transcript "true" sets exportTranscript = true', () => {
      // Arrange
      mockInputs({ export_transcript: 'true' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.exportTranscript).toBe(true);
    });

    it('9-6-AC2: export_transcript absent defaults to false', () => {
      // Arrange
      mockInputs({});

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.exportTranscript).toBe(false);
    });

    it('9-6-AC2: write_job_summary "true" sets writeJobSummary = true', () => {
      // Arrange
      mockInputs({ write_job_summary: 'true' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.writeJobSummary).toBe(true);
    });

    it('9-6-AC2: write_job_summary absent defaults to false', () => {
      // Arrange
      mockInputs({});

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.writeJobSummary).toBe(false);
    });

    it('9-6-AC2: transcript_path is validated when export_transcript is true and path provided', () => {
      // Arrange
      process.env.RUNNER_TEMP = '/tmp/runner';
      mockInputs({ export_transcript: 'true', transcript_path: '/tmp/runner/custom.json' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.transcriptPath).toBe('/tmp/runner/custom.json');
    });

    it('9-6-AC2: transcript_path defaults to RUNNER_TEMP/conversation.json when export_transcript true and no path set', () => {
      // Arrange
      process.env.RUNNER_TEMP = '/tmp/runner-temp';
      mockInputs({ export_transcript: 'true' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.transcriptPath).toBe('/tmp/runner-temp/conversation.json');
    });

    it('9-6-AC2: transcript_path empty when export_transcript false', () => {
      // Arrange
      mockInputs({ export_transcript: 'false', transcript_path: '' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.transcriptPath).toBe('');
    });

    it('9-6-AC2: transcript_path rejects unsafe path', () => {
      // Arrange
      mockInputs({ export_transcript: 'true', transcript_path: '/etc/evil.json' });

      // Act & Assert
      expect(() => getInputs()).toThrow('Invalid transcript_path');
    });

    it('9-6-AC5: all new inputs default off (backward compatible)', () => {
      // Arrange
      mockInputs({ workflow_path: 'test.md' });

      // Act
      const inputs = getInputs();

      // Assert
      expect(inputs.exportTranscript).toBe(false);
      expect(inputs.writeJobSummary).toBe(false);
      expect(inputs.transcriptPath).toBe('');
    });
  });
});
