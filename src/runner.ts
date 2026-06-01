import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { ActionInputs, RunnerResult, OpenCodeSession, INPUT_LIMITS } from './types.js';
import {
  validateWorkspacePath,
  validateRealPath,
  validateUtf8,
  truncateString,
  sanitizeErrorMessage,
} from './security.js';
import { getOpenCodeService, OpenCodeService } from './opencode.js';
import { isFilterableFree, classifyPricing } from './model-filter.js';
import { loadFallbackConfig, preflightFallbackChain } from './fallback-config.js';
import { executeValidationScript } from './validation.js';
import { initDebugLogWriter } from './debug-log-writer.js';
import { writeTranscript } from './transcript-writer.js';
import { writeJobSummary } from './summary-writer.js';

const DEFAULT_TIMEOUT_MS = 300_000;

export async function runWorkflow(
  inputs: ActionInputs,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  abortSignal?: AbortSignal
): Promise<RunnerResult> {
  if (inputs.listModels) {
    return await handleListModels(inputs);
  }

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

  if (inputs.debugLog) {
    initDebugLogWriter(inputs.debugLogPath);
    core.info(`[OpenCode] Debug logging enabled: ${inputs.debugLogPath}`);
  }

  let session: OpenCodeSession;
  const startTime = Date.now();

  try {
    await opencode.initialize({
      opencodeConfig: inputs.opencodeConfig,
      authConfig: inputs.authConfig,
      model: inputs.model,
    });

    if (inputs.disableFreeModels) {
      const freeGuardResult = await checkFreeModelGuard(inputs, opencode);
      if (freeGuardResult) return freeGuardResult;
    }

    if (inputs.fallbackConfig) {
      const chain = loadFallbackConfig(inputs.fallbackConfig);
      const authedIds = await opencode.getAuthenticatedProviderIds();
      const preflight = preflightFallbackChain(chain, authedIds);
      for (const skipped of preflight.skipped) {
        core.warning(
          `Fallback provider '${skipped.provider}' is not authenticated (no credentials in auth_config) — skipping`,
          { title: 'Fallback provider skipped' }
        );
      }
      const viableChain = preflight.viable;
      if (viableChain.length === 0) {
        return {
          success: false,
          output: '',
          error:
            'All fallback chain providers are unauthenticated. Check auth_config covers all chain entries.',
        };
      }
      const fallbackResult = await opencode.runSessionWithFallback(
        fullPrompt,
        viableChain,
        timeoutMs,
        abortSignal
      );
      if (!fallbackResult.success || !fallbackResult.session) {
        const reasons = fallbackResult.failures
          .map((f) => `${f.provider}/${f.model}: ${f.error}`)
          .join('; ');
        return {
          success: false,
          output: '',
          error: `All fallback providers failed at startup. Failures: ${reasons}`,
        };
      }
      session = fallbackResult.session;
    } else {
      session = await opencode.runSession(fullPrompt, timeoutMs, abortSignal);
    }

    if (inputs.validationScript) {
      session = await runValidationLoop(session, {
        opencode,
        inputs,
        workspace,
        timeoutMs,
        abortSignal,
      });
    }

    let transcriptJsonPath = '';

    if (inputs.exportTranscript || inputs.writeJobSummary) {
      try {
        const messages = await opencode.exportTranscript(session.sessionId);
        const secrets = Object.values(inputs.envVars);
        const durationMs = Date.now() - startTime;

        if (inputs.exportTranscript) {
          const resolvedTranscriptPath =
            inputs.transcriptPath ||
            path.join(process.env['RUNNER_TEMP'] || '/tmp', 'conversation.json');
          writeTranscript(resolvedTranscriptPath, messages, secrets);
          transcriptJsonPath = resolvedTranscriptPath;
        }

        if (inputs.writeJobSummary) {
          await writeJobSummary(messages, {
            success: true,
            durationMs,
            finalMessage: session.lastMessage,
            secrets,
          });
        }
      } catch (error) {
        core.warning(`[OpenCode] Post-run export failed: ${String(error)}`, {
          title: 'Transcript export',
        });
      }
    }

    const output = JSON.stringify({
      sessionId: session.sessionId,
      lastMessage: session.lastMessage,
    });

    return {
      success: true,
      output: truncateString(output, INPUT_LIMITS.MAX_OUTPUT_SIZE),
      transcriptJsonPath,
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

async function checkFreeModelGuard(
  inputs: ActionInputs,
  opencode: ReturnType<typeof getOpenCodeService>
): Promise<RunnerResult | null> {
  const resolvedModelId = inputs.model;
  if (!resolvedModelId) {
    core.debug('[OpenCode] disable_free_models: no explicit model input — skipping guard (AC6)');
    return null;
  }

  let models;
  try {
    models = await opencode.listModels();
  } catch {
    core.debug('[OpenCode] disable_free_models: listModels() failed — skipping guard (AC6)');
    return null;
  }

  const resolvedModel = models.find(
    (m) => m.id === resolvedModelId || `${m.providerId}/${m.id}` === resolvedModelId
  );

  if (!resolvedModel) {
    core.debug(
      `[OpenCode] disable_free_models: model "${resolvedModelId}" not found in list — skipping guard (AC6)`
    );
    return null;
  }

  const subs = new Set(inputs.subscriptionProviders);
  if (isFilterableFree(resolvedModel, subs)) {
    return {
      success: false,
      output: '',
      error: `Model '${resolvedModelId}' is a free model and disable_free_models is enabled. Choose a paid or subscription model.`,
    };
  }

  return null;
}

async function handleListModels(inputs: ActionInputs): Promise<RunnerResult> {
  try {
    const opencode = getOpenCodeService();
    await opencode.initialize({
      opencodeConfig: inputs.opencodeConfig,
      authConfig: inputs.authConfig,
      model: inputs.model,
    });

    const allModels = await opencode.listModels();
    const subs = new Set(inputs.subscriptionProviders);
    const models = inputs.disableFreeModels
      ? allModels.filter((m) => !isFilterableFree(m, subs))
      : allModels;

    if (inputs.disableFreeModels) {
      const hiddenCount = allModels.length - models.length;
      if (hiddenCount > 0) {
        core.info(`${hiddenCount} free model(s) hidden (disable_free_models)`);
      }
    }

    core.info('=== Available Models ===');
    const taggedModels = models.map((model) => {
      const pricing = classifyPricing(model, subs);
      return { ...model, pricing };
    });
    for (const model of taggedModels) {
      core.info(
        `  - ${model.providerId}/${model.id}: ${model.name} (${model.provider}) [${model.pricing}]`
      );
    }
    core.info('========================');

    return { success: true, output: JSON.stringify({ models: taggedModels }) };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? sanitizeErrorMessage(error) : 'Unknown error occurred';
    return { success: false, output: '', error: errorMessage };
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

      core.info(`[Validation] Script output: ${validationResult.continueMessage || 'true'}`);

      if (validationResult.success) {
        core.info('[Validation] Success - workflow complete');
        return currentSession;
      }

      if (attempt === inputs.maxValidationRetries) {
        throw new Error(
          `Validation failed after ${inputs.maxValidationRetries} attempts. Last output: ${validationResult.continueMessage}`
        );
      }

      core.info(
        `[Validation] Retry - sending feedback to OpenCode: ${validationResult.continueMessage}`
      );
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
