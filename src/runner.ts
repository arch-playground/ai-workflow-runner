import * as core from '@actions/core';
import * as fs from 'fs';
import { ActionInputs, RunnerResult, OpenCodeSession, INPUT_LIMITS } from './types.js';
import {
  validateWorkspacePath,
  validateRealPath,
  validateUtf8,
  truncateString,
} from './security.js';
import { getOpenCodeService, OpenCodeService } from './opencode.js';
import { executeValidationScript } from './validation.js';

const DEFAULT_TIMEOUT_MS = 300_000;

export async function runWorkflow(
  inputs: ActionInputs,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  abortSignal?: AbortSignal
): Promise<RunnerResult> {
  const workspace = process.env['GITHUB_WORKSPACE'] || '/github/workspace';

  if (abortSignal?.aborted) {
    return {
      success: false,
      output: '',
      error: 'Workflow execution was cancelled',
    };
  }

  const validationResult = validateWorkflowFile(inputs, workspace);
  if (!validationResult.valid) {
    return {
      success: false,
      output: '',
      error: validationResult.error,
    };
  }

  const workflowContent = fs.readFileSync(validationResult.absolutePath!, 'utf8');

  if (!workflowContent.trim()) {
    return {
      success: false,
      output: '',
      error: 'Workflow file is empty',
    };
  }

  const fullPrompt = inputs.prompt
    ? `${workflowContent}\n\n---\n\nUser Input:\n${inputs.prompt}`
    : workflowContent;

  core.info(`Executing workflow: ${inputs.workflowPath}`);
  if (inputs.prompt) {
    core.info(`Prompt provided: ${inputs.prompt.length} characters`);
  }
  core.info(`Environment variables: ${Object.keys(inputs.envVars).length} entries`);

  const opencode = getOpenCodeService();
  let session: OpenCodeSession;

  try {
    session = await opencode.runSession(fullPrompt, timeoutMs, abortSignal);

    if (inputs.validationScript) {
      session = await runValidationLoop(session, {
        opencode,
        inputs,
        workspace,
        timeoutMs,
        abortSignal,
      });
    }

    const output = JSON.stringify({
      sessionId: session.sessionId,
      lastMessage: session.lastMessage,
    });

    return {
      success: true,
      output: truncateString(output, INPUT_LIMITS.MAX_OUTPUT_SIZE),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (abortSignal?.aborted) {
      return {
        success: false,
        output: '',
        error: 'Workflow execution was cancelled',
      };
    }

    if (errorMessage.includes('timed out')) {
      return {
        success: false,
        output: '',
        error: `Workflow execution timed out after ${timeoutMs}ms`,
      };
    }

    return {
      success: false,
      output: '',
      error: errorMessage,
    };
  }
}

interface WorkflowValidationResult {
  valid: boolean;
  error?: string;
  absolutePath?: string;
}

interface ValidationLoopContext {
  opencode: OpenCodeService;
  inputs: ActionInputs;
  workspace: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}

function validateWorkflowFile(inputs: ActionInputs, workspace: string): WorkflowValidationResult {
  let absolutePath: string;
  try {
    absolutePath = validateWorkspacePath(workspace, inputs.workflowPath);
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Path validation failed',
    };
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(absolutePath);
  } catch {
    return {
      valid: false,
      error: `Workflow file not found: ${inputs.workflowPath}`,
    };
  }

  if (!stats.isFile()) {
    return {
      valid: false,
      error: `Workflow path is not a file: ${inputs.workflowPath}`,
    };
  }

  if (stats.size > INPUT_LIMITS.MAX_WORKFLOW_FILE_SIZE) {
    return {
      valid: false,
      error: `Workflow file exceeds maximum size of ${INPUT_LIMITS.MAX_WORKFLOW_FILE_SIZE} bytes`,
    };
  }

  try {
    validateRealPath(workspace, absolutePath);
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Symlink validation failed',
    };
  }

  try {
    const buffer = fs.readFileSync(absolutePath);
    validateUtf8(buffer, absolutePath);
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Failed to read workflow file',
    };
  }

  return { valid: true, absolutePath };
}

async function runValidationLoop(
  session: OpenCodeSession,
  context: ValidationLoopContext
): Promise<OpenCodeSession> {
  const { opencode, inputs, workspace, timeoutMs, abortSignal } = context;
  let currentSession = session;

  for (let attempt = 1; attempt <= inputs.maxValidationRetries; attempt++) {
    core.info(`[Validation] Attempt ${attempt}/${inputs.maxValidationRetries}`);

    try {
      const validationResult = await executeValidationScript({
        script: inputs.validationScript!,
        scriptType: inputs.validationScriptType,
        lastMessage: currentSession.lastMessage,
        workspacePath: workspace,
        envVars: inputs.envVars,
        abortSignal,
      });

      if (validationResult.success) {
        core.info('[Validation] Success - workflow complete');
        return currentSession;
      }

      if (attempt === inputs.maxValidationRetries) {
        throw new Error(
          `Validation failed after ${inputs.maxValidationRetries} attempts. Last output: ${validationResult.continueMessage}`
        );
      }

      core.info('[Validation] Retry - sending feedback to OpenCode');
      currentSession = await opencode.sendFollowUp(
        currentSession.sessionId,
        validationResult.continueMessage,
        timeoutMs,
        abortSignal
      );
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === inputs.maxValidationRetries) {
        throw error;
      }

      core.warning(`[Validation] Error on attempt ${attempt}: ${String(error)}`);
    }
  }

  return currentSession;
}
