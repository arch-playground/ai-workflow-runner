import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  ActionInputs,
  ValidationResult,
  INPUT_LIMITS,
  type ValidationScriptType,
} from './types.js';
import { maskSecrets, validateConfigPath } from './security.js';

const SAFE_DEBUG_LOG_PREFIXES = ['/tmp/', '/github/runner_temp/'];

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

export function validateDebugLogPath(workspacePath: string, debugLogPath: string): string {
  if (path.isAbsolute(debugLogPath)) {
    const normalized = path.normalize(debugLogPath);
    const parentDir = path.dirname(normalized);
    const safePrefixes = [...SAFE_DEBUG_LOG_PREFIXES];
    const runnerTemp = process.env.RUNNER_TEMP;
    if (runnerTemp) {
      safePrefixes.push(path.normalize(runnerTemp) + path.sep);
    }

    const parentWithSep = parentDir + path.sep;
    const isSafe = safePrefixes.some(
      (prefix) => parentWithSep.startsWith(prefix) || parentDir === prefix.slice(0, -1)
    );
    if (!isSafe) {
      throw new Error(
        `Invalid debug_log_path: absolute paths are only allowed under RUNNER_TEMP, /tmp, or /github/runner_temp`
      );
    }

    fs.mkdirSync(parentDir, { recursive: true });
    return normalized;
  }

  const resolved = path.resolve(workspacePath, path.normalize(debugLogPath));
  if (!resolved.startsWith(workspacePath + path.sep) && resolved !== workspacePath) {
    throw new Error('Invalid debug_log_path: path escapes the workspace directory');
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function getInputs(): ActionInputs {
  const workflowPath = core.getInput('workflow_path') || '';
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

  const opencodeConfigRaw = core.getInput('opencode_config') || undefined;
  const authConfigRaw = core.getInput('auth_config') || undefined;
  const model = core.getInput('model') || undefined;
  const listModelsRaw = core.getInput('list_models') || 'false';
  const listModels = listModelsRaw.trim().toLowerCase() === 'true';

  const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
  const opencodeConfig = opencodeConfigRaw
    ? validateConfigPath(workspacePath, opencodeConfigRaw)
    : undefined;
  const authConfig = authConfigRaw ? validateConfigPath(workspacePath, authConfigRaw) : undefined;

  const debugLogInput = core.getInput('debug_log').trim().toLowerCase() === 'true';
  const actionsStepDebug = process.env.ACTIONS_STEP_DEBUG === 'true';
  const runnerDebug = process.env.RUNNER_DEBUG === '1';
  const debugLog = debugLogInput || actionsStepDebug || runnerDebug;

  let debugLogPath = '';
  if (debugLog) {
    const debugLogPathRaw = core.getInput('debug_log_path') || '';
    if (debugLogPathRaw) {
      debugLogPath = validateDebugLogPath(workspacePath, debugLogPathRaw);
    } else {
      debugLogPath = path.join(process.env.RUNNER_TEMP || '/tmp', 'opencode-debug.log');
    }
  }

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
    debugLog,
    debugLogPath,
    exportTranscript: false,
    transcriptPath: '',
  };
}

export function validateInputs(inputs: ActionInputs): ValidationResult {
  const errors: string[] = [];

  if (inputs.listModels) {
    return { valid: true, errors: [] };
  }

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
