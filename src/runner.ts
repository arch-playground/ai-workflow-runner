import * as core from '@actions/core';
import * as fs from 'fs';
import { ActionInputs, RunnerResult, INPUT_LIMITS } from './types.js';
import { validateWorkspacePath, validateRealPath, validateUtf8 } from './security.js';

const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Runs a workflow with timeout and abort signal support.
 * @param inputs - The action inputs containing workflow path, prompt, and env vars
 * @param timeoutMs - Maximum execution time in milliseconds
 * @param abortSignal - Optional abort signal for cancellation
 * @returns Promise resolving to the runner result
 */
export function runWorkflow(
  inputs: ActionInputs,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  abortSignal?: AbortSignal
): Promise<RunnerResult> {
  const workspace = process.env['GITHUB_WORKSPACE'] || '/github/workspace';

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  const combinedAbort = abortSignal
    ? AbortSignal.any([abortSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    // Check if already aborted before starting
    if (combinedAbort.aborted) {
      clearTimeout(timeoutId);
      return Promise.resolve({
        success: false,
        output: '',
        error: 'Workflow execution was cancelled',
      });
    }

    const result = executeWorkflow(inputs, workspace, combinedAbort);
    clearTimeout(timeoutId);
    return Promise.resolve(result);
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      return Promise.resolve({
        success: false,
        output: '',
        error: abortSignal?.aborted
          ? 'Workflow execution was cancelled'
          : `Workflow execution timed out after ${timeoutMs}ms`,
      });
    }
    return Promise.resolve({
      success: false,
      output: '',
      error: e instanceof Error ? e.message : 'Unknown error occurred',
    });
  }
}

function executeWorkflow(
  inputs: ActionInputs,
  workspace: string,
  abortSignal: AbortSignal
): RunnerResult {
  if (abortSignal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  let absolutePath: string;
  try {
    absolutePath = validateWorkspacePath(workspace, inputs.workflowPath);
  } catch (e) {
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : 'Path validation failed',
    };
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(absolutePath);
  } catch {
    return {
      success: false,
      output: '',
      error: `Workflow file not found: ${inputs.workflowPath}`,
    };
  }

  if (!stats.isFile()) {
    return {
      success: false,
      output: '',
      error: `Workflow path is not a file: ${inputs.workflowPath}`,
    };
  }

  if (stats.size > INPUT_LIMITS.MAX_WORKFLOW_FILE_SIZE) {
    return {
      success: false,
      output: '',
      error: `Workflow file exceeds maximum size of ${INPUT_LIMITS.MAX_WORKFLOW_FILE_SIZE} bytes`,
    };
  }

  try {
    validateRealPath(workspace, absolutePath);
  } catch (e) {
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : 'Symlink validation failed',
    };
  }

  if (abortSignal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  try {
    const buffer = fs.readFileSync(absolutePath);
    validateUtf8(buffer, absolutePath);
  } catch (e) {
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : 'Failed to read workflow file',
    };
  }

  core.info(`Executing workflow: ${inputs.workflowPath}`);
  if (inputs.prompt) {
    core.info(`Prompt provided: ${inputs.prompt.length} characters`);
  }
  core.info(`Environment variables: ${Object.keys(inputs.envVars).length} entries`);

  const output = JSON.stringify({
    message: 'Workflow runner stub - OpenCode integration pending',
    workflowPath: inputs.workflowPath,
    promptLength: inputs.prompt.length,
    envVarsCount: Object.keys(inputs.envVars).length,
  });

  const truncatedOutput =
    output.length > INPUT_LIMITS.MAX_OUTPUT_SIZE
      ? output.substring(0, INPUT_LIMITS.MAX_OUTPUT_SIZE) + '...[truncated]'
      : output;

  return {
    success: true,
    output: truncatedOutput,
  };
}
