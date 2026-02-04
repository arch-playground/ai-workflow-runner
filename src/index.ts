import * as core from '@actions/core';
import { getInputs, validateInputs } from './config.js';
import { runWorkflow } from './runner.js';
import { sanitizeErrorMessage } from './security.js';
import { ActionStatus } from './types.js';
import { getOpenCodeService, hasOpenCodeServiceInstance } from './opencode.js';

const shutdownController = new AbortController();
let runPromise: Promise<void> | null = null;

async function run(): Promise<void> {
  let status: ActionStatus = 'failure';
  let outputsSet = false;

  try {
    if (shutdownController.signal.aborted) {
      status = 'cancelled';
      core.setOutput('status', status);
      core.setOutput('result', JSON.stringify({ cancelled: true }));
      outputsSet = true;
      return;
    }

    const inputs = getInputs();
    const validation = validateInputs(inputs);

    if (!validation.valid) {
      for (const error of validation.errors) {
        core.error(error);
      }
      throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
    }

    const result = await runWorkflow(inputs, inputs.timeoutMs, shutdownController.signal);

    if (shutdownController.signal.aborted) {
      status = 'cancelled';
      core.setOutput('status', status);
      core.setOutput('result', JSON.stringify({ cancelled: true }));
      outputsSet = true;
      return;
    }

    status = result.success ? 'success' : 'failure';
    core.setOutput('status', status);
    core.setOutput('result', result.output);
    outputsSet = true;

    if (!result.success && result.error) {
      core.setFailed(result.error);
    }
  } catch (error) {
    if (!outputsSet) {
      status = shutdownController.signal.aborted ? 'cancelled' : 'failure';
      const message =
        error instanceof Error ? sanitizeErrorMessage(error) : 'An unknown error occurred';

      core.setOutput('status', status);
      core.setOutput('result', JSON.stringify({ error: message }));

      if (!shutdownController.signal.aborted) {
        core.setFailed(message);
      }
    }
  }
}

function handleShutdown(signal: string): void {
  core.info(`Received ${signal}, initiating graceful shutdown...`);

  shutdownController.abort();

  if (hasOpenCodeServiceInstance()) {
    try {
      const opencode = getOpenCodeService();
      opencode.dispose();
    } catch (error) {
      core.warning(
        `[Shutdown] Failed to dispose OpenCode service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const forceExitTimeout = setTimeout(() => {
    core.warning('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  if (runPromise) {
    void runPromise.finally(() => {
      clearTimeout(forceExitTimeout);
      process.exit(0);
    });
  } else {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));

runPromise = run();
runPromise.catch(() => {
  // Error already handled in run()
});
