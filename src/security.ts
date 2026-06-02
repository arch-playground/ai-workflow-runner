import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';

// Security-only host allowlist for credentialed provider endpoints.
// This is NOT a provider-classification or pricing list — it is a security control
// that prevents consumer opencode_config from redirecting auth to attacker hosts.
// D7 constraint: do NOT reference this from model-filter.ts or free-model detection.
// Extend at runtime via the `allowed_provider_hosts` action input.
export const DEFAULT_PROVIDER_HOSTS: readonly string[] = [
  'api.openai.com',
  'api.anthropic.com',
  'api.githubcopilot.com', // Copilot-never-blocked invariant — funcval model
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  '*.cognitiveservices.azure.com',
  '*.openai.azure.com',
  'bedrock-runtime.*.amazonaws.com',
  'bedrock.*.amazonaws.com',
  'opencode.ai',
  'api.opencode.ai',
];

function isPrivateIpv4(host: string): boolean {
  if (host.startsWith('10.')) return true;
  if (host.startsWith('127.')) return true;
  if (host.startsWith('169.254.')) return true;
  if (host.startsWith('192.168.')) return true;
  if (host.startsWith('172.')) {
    const second = parseInt(host.split('.')[1] ?? '', 10);
    return !isNaN(second) && second >= 16 && second <= 31;
  }
  return false;
}

function isPrivateHost(hostname: string): boolean {
  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;
  // Strip brackets from IPv6
  const bare = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  if (isPrivateIpv4(bare)) return true;
  // Bare single-label hostnames (no dot) — treat as internal
  if (!bare.includes('.')) return true;
  // Internal/local TLDs
  if (bare.endsWith('.internal') || bare.endsWith('.local')) return true;
  return false;
}

function globMatch(pattern: string, value: string): boolean {
  // Escape regex special chars except '*', then replace '*' with '.*'
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

/**
 * Returns true if the host matches the allowlist (default ∪ caller-supplied extras).
 */
export function isAllowedProviderHost(host: string, extraHosts: readonly string[]): boolean {
  const allPatterns = [...DEFAULT_PROVIDER_HOSTS, ...extraHosts];
  return allPatterns.some((pattern) => globMatch(pattern, host));
}

/**
 * Validates a provider baseURL for credentialed use.
 * Throws a clear, sanitized error on any violation (fail-closed).
 * - Requires https scheme
 * - Rejects private/loopback/link-local/metadata hosts
 * - Requires host to match the allowlist (default ∪ extraHosts)
 */
export function validateProviderBaseUrl(rawUrl: string, extraHosts: readonly string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid provider baseURL: not a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid provider baseURL: only https is allowed for credentialed providers`);
  }

  const hostname = parsed.hostname;

  if (isPrivateHost(hostname)) {
    throw new Error(
      `Invalid provider baseURL: host resolves to a private/metadata range and cannot receive credentials`
    );
  }

  if (!isAllowedProviderHost(hostname, extraHosts)) {
    throw new Error(
      `Invalid provider baseURL: ${hostname} is not an allowed provider host (set allowed_provider_hosts to permit it)`
    );
  }
}

/**
 * Extracts all baseURL/endpoint values from the provider section of a loaded opencode config.
 * Only inspects consumer-supplied values; providers with no custom URL are not returned.
 */
export function extractProviderBaseUrls(
  config: Record<string, unknown>
): Array<{ providerId: string; url: string }> {
  const results: Array<{ providerId: string; url: string }> = [];
  const providers = config['provider'];
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return results;

  for (const [providerId, providerConfig] of Object.entries(providers as Record<string, unknown>)) {
    if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig))
      continue;
    const opts = (providerConfig as Record<string, unknown>)['options'];
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) continue;
    const optsObj = opts as Record<string, unknown>;

    for (const field of ['baseURL', 'endpoint', 'enterpriseUrl']) {
      const val = optsObj[field];
      if (typeof val === 'string' && val.length > 0) {
        results.push({ providerId, url: val });
      }
    }
  }
  return results;
}

/**
 * Validates that a path is within the workspace and doesn't escape via traversal.
 * Returns the resolved absolute path if valid, throws if invalid.
 */
export function validateWorkspacePath(workspacePath: string, relativePath: string): string {
  const normalizedRelative = path.normalize(relativePath);

  if (normalizedRelative.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      'Invalid workflow path: absolute paths and parent directory references are not allowed'
    );
  }

  const realWorkspace = fs.realpathSync(workspacePath);
  const absolutePath = path.resolve(realWorkspace, normalizedRelative);

  if (!absolutePath.startsWith(realWorkspace + path.sep) && absolutePath !== realWorkspace) {
    throw new Error('Invalid workflow path: path escapes the workspace directory');
  }

  return absolutePath;
}

const SAFE_ABSOLUTE_PREFIXES = ['/tmp/', '/github/runner_temp/'];
const DOCKER_RUNNER_TEMP = '/github/runner_temp';

/**
 * Validates a config file path (auth_config, opencode_config).
 * Accepts workspace-relative paths OR absolute paths under safe directories
 * (RUNNER_TEMP, /tmp, /github/runner_temp). This allows writing config files
 * outside the workspace to avoid interference with the AI action's working directory.
 *
 * For Docker container actions, GitHub Actions mounts the host RUNNER_TEMP directory
 * to /github/runner_temp inside the container. When the workflow passes a host path
 * like /home/runner/_work/_temp/auth.json, this function translates it to the
 * container-mapped path /github/runner_temp/auth.json.
 */
export function validateConfigPath(workspacePath: string, configPath: string): string {
  if (path.isAbsolute(configPath)) {
    const normalized = path.normalize(configPath);
    const safePrefixes = [...SAFE_ABSOLUTE_PREFIXES];
    const runnerTemp = process.env.RUNNER_TEMP;
    if (runnerTemp) {
      safePrefixes.push(path.normalize(runnerTemp) + path.sep);
    }

    const isSafe = safePrefixes.some((prefix) => normalized.startsWith(prefix));
    if (!isSafe) {
      throw new Error(
        'Invalid config path: absolute paths are only allowed under runner temp or /tmp'
      );
    }

    // Translate host RUNNER_TEMP path to Docker container-mapped path.
    // GitHub mounts host RUNNER_TEMP to /github/runner_temp inside the container.
    if (runnerTemp && normalized.startsWith(path.normalize(runnerTemp) + path.sep)) {
      const relativePart = normalized.slice(path.normalize(runnerTemp).length);
      return DOCKER_RUNNER_TEMP + relativePart;
    }
    return normalized;
  }
  return validateWorkspacePath(workspacePath, configPath);
}

/**
 * Validates the REAL path of a file (following symlinks) is within workspace.
 * Call this AFTER confirming the file exists.
 * Returns the real path if valid, throws if symlink escapes workspace.
 */
export function validateRealPath(workspacePath: string, filePath: string): string {
  const realWorkspace = fs.realpathSync(workspacePath);
  const realFilePath = fs.realpathSync(filePath);

  if (!realFilePath.startsWith(realWorkspace + path.sep) && realFilePath !== realWorkspace) {
    throw new Error('Invalid workflow path: symlink target escapes the workspace directory');
  }

  return realFilePath;
}

/**
 * Masks all values in envVars as secrets to prevent log exposure.
 */
export function maskSecrets(envVars: Record<string, string>): void {
  for (const value of Object.values(envVars)) {
    if (value && value.length > 0) {
      core.setSecret(value);
    }
  }
}

/**
 * Sanitizes error messages to remove sensitive information.
 */
export function sanitizeErrorMessage(error: Error): string {
  let message = error.message;

  message = message.replace(/\/[^\s]+/g, '[PATH]');
  message = message.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]');

  return message;
}

/**
 * Validates file encoding is valid UTF-8 by checking for invalid byte sequences.
 */
export function validateUtf8(buffer: Buffer, filePath: string): string {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    throw new Error(`File is not valid UTF-8: ${path.basename(filePath)}`);
  }
}

/**
 * Replaces every occurrence of each non-empty secret value in the content with `***`.
 * Use before writing any file that may contain user-supplied env_vars.
 */
export function scrubSecrets(content: string, secrets: string[]): string {
  let result = content;
  for (const secret of secrets) {
    if (secret.length > 0) {
      result = result.split(secret).join('***');
    }
  }
  return result;
}

// Keys the opencode server child process needs at spawn time.
// PATH/HOME are needed by every CLI process.
// LANG/TERM prevent locale/terminal errors in child processes.
// JAVA_HOME, GOPATH, GOROOT: opencode autoinstalls Java/Go LSPs at runtime;
//   the Dockerfile sets these paths and stripping them breaks language server startup.
// XDG_*: opencode and some LSPs use XDG dirs for config/cache discovery.
// RUNNER_TEMP: some opencode operations write ephemeral files here.
const SCOPED_ENV_PASSTHROUGH = ['JAVA_HOME', 'GOPATH', 'GOROOT', 'RUNNER_TEMP'] as const;

/**
 * Builds a scoped environment for child processes.
 * Includes only essential vars, declared runtime vars, and user-supplied envVars.
 * Undeclared ambient secrets (GITHUB_TOKEN, cloud creds, etc.) are excluded.
 */
export function buildScopedEnv(envVars: Record<string, string>): Record<string, string> {
  const scoped: Record<string, string> = {
    PATH: process.env['PATH'] || '',
    HOME: process.env['HOME'] || '',
    LANG: process.env['LANG'] || 'en_US.UTF-8',
    TERM: process.env['TERM'] || 'xterm',
  };

  for (const key of SCOPED_ENV_PASSTHROUGH) {
    const value = process.env[key];
    if (value !== undefined) {
      scoped[key] = value;
    }
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('XDG_')) {
      const value = process.env[key];
      if (value !== undefined) {
        scoped[key] = value;
      }
    }
  }

  return { ...scoped, ...envVars };
}

const TRUNCATION_MARKER = '...[truncated]';

/**
 * Truncates a string to the specified maximum length, appending a marker if truncated.
 */
export function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength) + TRUNCATION_MARKER;
}
