import { ActionInputs, RunnerResult } from './types.js';
/**
 * Runs a workflow with timeout and abort signal support.
 * @param inputs - The action inputs containing workflow path, prompt, and env vars
 * @param timeoutMs - Maximum execution time in milliseconds
 * @param abortSignal - Optional abort signal for cancellation
 * @returns Promise resolving to the runner result
 */
export declare function runWorkflow(inputs: ActionInputs, timeoutMs?: number, abortSignal?: AbortSignal): Promise<RunnerResult>;
