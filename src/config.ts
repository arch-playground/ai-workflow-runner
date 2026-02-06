import * as core from '@actions/core';
import {
  ActionInputs,
  ValidationResult,
  INPUT_LIMITS,
  type ValidationScriptType,
} from './types.js';
import { maskSecrets } from './security.js';

const RESERVED_ENV_VARS = new Set([
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'JAVA_TOOL_OPTIONS',
  'JAVA_HOME',
]);

const GITHUB_ENV_VAR_PREFIX = 'GITHUB_';
const VALID_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function parseTimeoutMs(timeoutMinutesRaw: string): number {
  if (!timeoutMinutesRaw) {
    return INPUT_LIMITS.DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
  }

  const timeoutMinutes = parseInt(timeoutMinutesRaw, 10);
  if (isNaN(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error('timeout_minutes must be a positive integer');
  }
  if (timeoutMinutes > INPUT_LIMITS.MAX_TIMEOUT_MINUTES) {
    throw new Error(
      `timeout_minutes exceeds maximum of ${INPUT_LIMITS.MAX_TIMEOUT_MINUTES} minutes`
    );
  }
  return timeoutMinutes * 60 * 1000;
}

function parseEnvVars(envVarsRaw: string): Record<string, string> {
  if (envVarsRaw.length > INPUT_LIMITS.MAX_ENV_VARS_SIZE) {
    throw new Error(`env_vars exceeds maximum size of ${INPUT_LIMITS.MAX_ENV_VARS_SIZE} bytes`);
  }

  let envVars: Record<string, string>;
  try {
    envVars = JSON.parse(envVarsRaw) as Record<string, string>;
  } catch {
    throw new Error('env_vars must be a valid JSON object. Example: {"KEY": "value"}');
  }

  if (typeof envVars !== 'object' || envVars === null || Array.isArray(envVars)) {
    throw new Error('env_vars must be a JSON object, not an array or primitive');
  }

  const entryCount = Object.keys(envVars).length;
  if (entryCount > INPUT_LIMITS.MAX_ENV_VARS_COUNT) {
    throw new Error(`env_vars exceeds maximum of ${INPUT_LIMITS.MAX_ENV_VARS_COUNT} entries`);
  }

  return envVars;
}

function validateEnvVarEntry(key: string, value: unknown): void {
  if (typeof value !== 'string') {
    throw new Error(`env_vars["${key}"] must be a string, got ${typeof value}`);
  }

  if (!key || key.length === 0) {
    throw new Error('env_vars contains an empty key');
  }

  if (!VALID_KEY_PATTERN.test(key)) {
    throw new Error(
      `env_vars key "${key.substring(0, 20)}" contains invalid characters. Keys must match [a-zA-Z_][a-zA-Z0-9_]*`
    );
  }

  if (RESERVED_ENV_VARS.has(key.toUpperCase())) {
    throw new Error(`env_vars cannot override reserved variable: ${key}`);
  }

  if (key.toUpperCase().startsWith(GITHUB_ENV_VAR_PREFIX)) {
    throw new Error(`env_vars cannot override GitHub Actions variable: ${key}`);
  }
}

function parseValidationScriptType(
  validationScriptTypeRaw: string | undefined
): ValidationScriptType | undefined {
  if (!validationScriptTypeRaw) {
    return undefined;
  }

  const trimmedType = validationScriptTypeRaw.trim();
  if (trimmedType !== 'python' && trimmedType !== 'javascript') {
    throw new Error('validation_script_type must be "python" or "javascript"');
  }
  return trimmedType;
}

function parseValidationMaxRetry(maxValidationRetriesRaw: string): number {
  const maxValidationRetries = parseInt(maxValidationRetriesRaw, 10);
  if (
    isNaN(maxValidationRetries) ||
    maxValidationRetries < 1 ||
    maxValidationRetries > INPUT_LIMITS.MAX_VALIDATION_RETRY
  ) {
    throw new Error(
      `validation_max_retry must be between 1 and ${INPUT_LIMITS.MAX_VALIDATION_RETRY}`
    );
  }
  return maxValidationRetries;
}

export function getInputs(): ActionInputs {
  const workflowPath = core.getInput('workflow_path', { required: true });
  const prompt = core.getInput('prompt') || '';
  const envVarsRaw = core.getInput('env_vars') || '{}';
  const timeoutMinutesRaw = core.getInput('timeout_minutes') || '';

  const timeoutMs = parseTimeoutMs(timeoutMinutesRaw);
  const envVars = parseEnvVars(envVarsRaw);

  for (const [key, value] of Object.entries(envVars)) {
    validateEnvVarEntry(key, value);
  }

  maskSecrets(envVars);

  const validationScript = core.getInput('validation_script') || undefined;
  const validationScriptTypeRaw = core.getInput('validation_script_type') || undefined;
  const maxValidationRetriesRaw = core.getInput('validation_max_retry') || '5';

  const validationScriptType = parseValidationScriptType(validationScriptTypeRaw);

  if (validationScriptType && !validationScript) {
    throw new Error('validation_script_type requires validation_script to be set');
  }

  if (validationScript && validationScript.length > INPUT_LIMITS.MAX_INLINE_SCRIPT_SIZE) {
    throw new Error(
      `validation_script exceeds maximum size of ${INPUT_LIMITS.MAX_INLINE_SCRIPT_SIZE} bytes`
    );
  }

  const maxValidationRetries = parseValidationMaxRetry(maxValidationRetriesRaw);

  const opencodeConfig = core.getInput('opencode_config') || undefined;
  const authConfig = core.getInput('auth_config') || undefined;
  const model = core.getInput('model') || undefined;
  const listModelsRaw = core.getInput('list_models') || 'false';
  const listModels = listModelsRaw.trim().toLowerCase() === 'true';

  return {
    workflowPath,
    prompt,
    envVars,
    timeoutMs,
    validationScript,
    validationScriptType,
    maxValidationRetries,
    opencodeConfig,
    authConfig,
    model,
    listModels,
  };
}

export function validateInputs(inputs: ActionInputs): ValidationResult {
  const errors: string[] = [];

  if (!inputs.workflowPath || inputs.workflowPath.trim() === '') {
    errors.push('workflow_path is required and cannot be empty');
  } else if (inputs.workflowPath.length > INPUT_LIMITS.MAX_WORKFLOW_PATH_LENGTH) {
    errors.push(`workflow_path exceeds maximum length of ${INPUT_LIMITS.MAX_WORKFLOW_PATH_LENGTH}`);
  }

  if (inputs.prompt.length > INPUT_LIMITS.MAX_PROMPT_LENGTH) {
    errors.push(`prompt exceeds maximum size of ${INPUT_LIMITS.MAX_PROMPT_LENGTH} bytes`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
