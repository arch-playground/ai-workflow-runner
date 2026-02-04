import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { ValidationScriptType, ValidationOutput, INPUT_LIMITS } from './types.js';
import { validateWorkspacePath } from './security.js';

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

export function detectScriptType(
  script: string,
  providedType?: ValidationScriptType
): ScriptDetectionResult {
  const lowerScript = script.toLowerCase();

  if (lowerScript.endsWith('.sh') || lowerScript.endsWith('.bash')) {
    throw new Error(
      'Shell scripts (.sh, .bash) are not supported. Use Python (.py) or JavaScript (.js) for validation scripts.'
    );
  }
  if (lowerScript.endsWith('.ts')) {
    throw new Error(
      'TypeScript (.ts) is not directly supported. Use JavaScript (.js) or compile TypeScript to JavaScript first.'
    );
  }

  if (lowerScript.endsWith('.py')) return { type: 'python', code: script, isInline: false };
  if (lowerScript.endsWith('.js')) return { type: 'javascript', code: script, isInline: false };

  if (lowerScript.startsWith('python:')) {
    const code = script.slice(7).trim();
    if (!code) throw new Error('Empty inline script: python: prefix provided with no code');
    return { type: 'python', code, isInline: true };
  }
  if (lowerScript.startsWith('javascript:')) {
    const code = script.slice(11).trim();
    if (!code) throw new Error('Empty inline script: javascript: prefix provided with no code');
    return { type: 'javascript', code, isInline: true };
  }
  if (lowerScript.startsWith('js:')) {
    const code = script.slice(3).trim();
    if (!code) throw new Error('Empty inline script: js: prefix provided with no code');
    return { type: 'javascript', code, isInline: true };
  }

  if (providedType) return { type: providedType, code: script, isInline: true };

  throw new Error(
    'Cannot determine script type. Use file extension (.py/.js), prefix (python:/javascript:), or set validation_script_type.'
  );
}

async function checkInterpreterAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });

    const timeoutId = setTimeout(() => {
      // F17 Fix: Log timeout condition to help users diagnose interpreter issues
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

  let scriptPath: string;
  let tempFile: string | null = null;

  if (detection.isInline) {
    const ext = detection.type === 'python' ? '.py' : '.js';
    tempFile = path.join(os.tmpdir(), `validation-${randomUUID()}${ext}`);
    // F7 Fix: Use O_EXCL flag to prevent TOCTOU race condition (atomic create)
    const fd = fs.openSync(
      tempFile,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
    fs.writeSync(fd, detection.code, 0, 'utf8');
    fs.closeSync(fd);
    scriptPath = tempFile;
  } else {
    scriptPath = validateWorkspacePath(workspacePath, detection.code);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Validation script not found: ${detection.code}`);
    }
  }

  try {
    const output = await runScript(command, scriptPath, lastMessage, envVars, abortSignal);
    return parseValidationOutput(output);
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

function runScript(
  command: string,
  scriptPath: string,
  lastMessage: string,
  envVars: Record<string, string>,
  abortSignal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-control-regex
    let sanitizedLastMessage = lastMessage.replace(/\x00/g, '');
    if (sanitizedLastMessage.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
      sanitizedLastMessage =
        sanitizedLastMessage.substring(0, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) + '...[truncated]';
    }

    // F3 Fix: Only pass essential env vars + user-provided vars, not full process.env
    // This prevents leaking sensitive GitHub Actions secrets to validation scripts
    const essentialEnvVars: Record<string, string> = {
      PATH: process.env['PATH'] || '',
      HOME: process.env['HOME'] || '',
      LANG: process.env['LANG'] || 'en_US.UTF-8',
      TERM: process.env['TERM'] || 'xterm',
    };
    const childEnv = { ...essentialEnvVars, ...envVars, AI_LAST_MESSAGE: sanitizedLastMessage };

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
      }, 5000);
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
      if (stderr.length < 10000) {
        stderr += data.toString().substring(0, 10000 - stderr.length);
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
