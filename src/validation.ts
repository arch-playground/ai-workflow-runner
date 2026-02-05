import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { ValidationScriptType, ValidationOutput, INPUT_LIMITS } from './types.js';
import { validateWorkspacePath, truncateString } from './security.js';

export interface ValidationInput {
  script: string;
  scriptType?: ValidationScriptType;
  lastMessage: string;
  workspacePath: string;
  envVars: Record<string, string>;
  abortSignal?: AbortSignal;
}

interface ScriptDetectionResult {
  type: ValidationScriptType;
  code: string;
  isInline: boolean;
}

interface RunScriptInput {
  command: string;
  scriptPath: string;
  lastMessage: string;
  envVars: Record<string, string>;
  abortSignal?: AbortSignal;
}

function rejectUnsupportedExtension(scriptLowerCase: string): void {
  if (scriptLowerCase.endsWith('.sh') || scriptLowerCase.endsWith('.bash')) {
    throw new Error(
      'Shell scripts (.sh, .bash) are not supported. Use Python (.py) or JavaScript (.js) for validation scripts.'
    );
  }
  if (scriptLowerCase.endsWith('.ts')) {
    throw new Error(
      'TypeScript (.ts) is not directly supported. Use JavaScript (.js) or compile TypeScript to JavaScript first.'
    );
  }
}

function detectByFileExtension(
  script: string,
  scriptLowerCase: string
): ScriptDetectionResult | null {
  if (scriptLowerCase.endsWith('.py')) {
    return { type: 'python', code: script, isInline: false };
  }
  if (scriptLowerCase.endsWith('.js')) {
    return { type: 'javascript', code: script, isInline: false };
  }
  return null;
}

function extractInlineCode(script: string, prefixLength: number): string {
  const code = script.slice(prefixLength).trim();
  if (!code) {
    throw new Error(
      `Empty inline script: ${script.substring(0, prefixLength)} prefix provided with no code`
    );
  }
  return code;
}

function detectByPrefix(script: string, scriptLowerCase: string): ScriptDetectionResult | null {
  if (scriptLowerCase.startsWith('python:')) {
    return { type: 'python', code: extractInlineCode(script, 7), isInline: true };
  }
  if (scriptLowerCase.startsWith('javascript:')) {
    return { type: 'javascript', code: extractInlineCode(script, 11), isInline: true };
  }
  if (scriptLowerCase.startsWith('js:')) {
    return { type: 'javascript', code: extractInlineCode(script, 3), isInline: true };
  }
  return null;
}

export function detectScriptType(
  script: string,
  providedType?: ValidationScriptType
): ScriptDetectionResult {
  const scriptLowerCase = script.toLowerCase();

  rejectUnsupportedExtension(scriptLowerCase);

  const byExtension = detectByFileExtension(script, scriptLowerCase);
  if (byExtension) return byExtension;

  const byPrefix = detectByPrefix(script, scriptLowerCase);
  if (byPrefix) return byPrefix;

  if (providedType) {
    return { type: providedType, code: script, isInline: true };
  }

  throw new Error(
    'Cannot determine script type. Use file extension (.py/.js), prefix (python:/javascript:), or set validation_script_type.'
  );
}

async function checkInterpreterAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });

    const timeoutId = setTimeout(() => {
      core.warning(
        `[Validation] Interpreter check for '${command}' timed out after ${INPUT_LIMITS.INTERPRETER_CHECK_TIMEOUT_MS}ms`
      );
      child.kill('SIGTERM');
      resolve(false);
    }, INPUT_LIMITS.INTERPRETER_CHECK_TIMEOUT_MS);

    child.on('error', () => {
      clearTimeout(timeoutId);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve(code === 0);
    });
  });
}

function createTempScriptFile(detection: ScriptDetectionResult): string {
  const ext = detection.type === 'python' ? '.py' : '.js';
  const tempFile = path.join(os.tmpdir(), `validation-${randomUUID()}${ext}`);
  // Use O_EXCL flag to prevent TOCTOU race condition (atomic create)
  const fd = fs.openSync(
    tempFile,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    0o600
  );
  fs.writeSync(fd, detection.code, 0, 'utf8');
  fs.closeSync(fd);
  return tempFile;
}

function resolveScriptPath(
  detection: ScriptDetectionResult,
  workspacePath: string
): { scriptPath: string; tempFile: string | null } {
  if (detection.isInline) {
    const tempFile = createTempScriptFile(detection);
    return { scriptPath: tempFile, tempFile };
  }

  const scriptPath = validateWorkspacePath(workspacePath, detection.code);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Validation script not found: ${detection.code}`);
  }
  return { scriptPath, tempFile: null };
}

export async function executeValidationScript(input: ValidationInput): Promise<ValidationOutput> {
  const { script, scriptType, lastMessage, workspacePath, envVars, abortSignal } = input;
  const detection = detectScriptType(script, scriptType);

  const command = detection.type === 'python' ? 'python3' : 'node';
  const isAvailable = await checkInterpreterAvailable(command);
  if (!isAvailable) {
    throw new Error(
      `${command} interpreter not found. Ensure ${detection.type === 'python' ? 'Python 3' : 'Node.js'} is installed.`
    );
  }

  core.info(`[Validation] Executing ${detection.type} script (inline: ${detection.isInline})`);

  const { scriptPath, tempFile } = resolveScriptPath(detection, workspacePath);

  try {
    const output = await runScript({ command, scriptPath, lastMessage, envVars, abortSignal });
    return parseValidationOutput(output);
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

function buildChildEnv(
  envVars: Record<string, string>,
  sanitizedLastMessage: string
): Record<string, string> {
  // Only pass essential env vars + user-provided vars to prevent leaking secrets
  const essentialEnvVars: Record<string, string> = {
    PATH: process.env['PATH'] || '',
    HOME: process.env['HOME'] || '',
    LANG: process.env['LANG'] || 'en_US.UTF-8',
    TERM: process.env['TERM'] || 'xterm',
  };
  return { ...essentialEnvVars, ...envVars, AI_LAST_MESSAGE: sanitizedLastMessage };
}

function runScript(input: RunScriptInput): Promise<string> {
  const { command, scriptPath, lastMessage, envVars, abortSignal } = input;

  return new Promise((resolve, reject) => {
    const sanitizedLastMessage = truncateString(
      // eslint-disable-next-line no-control-regex
      lastMessage.replace(/\x00/g, ''),
      INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE
    );

    const childEnv = buildChildEnv(envVars, sanitizedLastMessage);
    const child: ChildProcess = spawn(command, [scriptPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let sigkillTimeoutId: NodeJS.Timeout | null = null;
    let processExited = false;

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      sigkillTimeoutId = setTimeout(() => {
        if (!processExited) {
          core.warning('[Validation] Process did not respond to SIGTERM, sending SIGKILL');
          child.kill('SIGKILL');
        }
      }, INPUT_LIMITS.SIGKILL_GRACE_PERIOD_MS);
    }, INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS);

    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          killed = true;
          clearTimeout(timeoutId);
          child.kill('SIGTERM');
        },
        { once: true }
      );
    }

    let outputSize = 0;
    let outputTruncated = false;
    const maxOutputSize = INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE;

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (outputSize < maxOutputSize) {
        const remaining = maxOutputSize - outputSize;
        stdout += chunk.substring(0, remaining);
        if (chunk.length > remaining) {
          outputTruncated = true;
        }
      } else if (!outputTruncated) {
        outputTruncated = true;
      }
      outputSize += chunk.length;
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < INPUT_LIMITS.MAX_STDERR_SIZE) {
        stderr += data.toString().substring(0, INPUT_LIMITS.MAX_STDERR_SIZE - stderr.length);
      }
    });

    child.on('close', (code) => {
      processExited = true;
      clearTimeout(timeoutId);
      if (sigkillTimeoutId) clearTimeout(sigkillTimeoutId);

      if (outputTruncated) {
        core.warning(`[Validation] Script output truncated (exceeded ${maxOutputSize} bytes)`);
      }

      if (killed && !abortSignal?.aborted) {
        core.warning(
          `[Validation] Script timed out after ${INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS}ms`
        );
        resolve(stdout || `Script timed out after ${INPUT_LIMITS.VALIDATION_SCRIPT_TIMEOUT_MS}ms`);
      } else if (abortSignal?.aborted) {
        reject(new Error('Validation script aborted'));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        core.warning(`[Validation] Script exited with code ${code}: ${stderr}`);
        resolve(stdout || stderr || `Script failed with exit code ${code}`);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to execute validation script: ${err.message}`));
    });
  });
}

function parseValidationOutput(output: string): ValidationOutput {
  const trimmed = output.trim().toLowerCase();
  const success = trimmed === '' || trimmed === 'true';
  return {
    success,
    continueMessage: success ? '' : output.trim(),
  };
}
