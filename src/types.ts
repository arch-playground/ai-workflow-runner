export interface ModelCost {
  input: number;
  output: number;
}

export interface ModelListItem {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  cost?: ModelCost;
  enabledVia?: 'env' | 'account' | 'custom';
}

export interface FallbackChainEntry {
  provider: string;
  model: string;
}

export interface FallbackChain {
  chain: FallbackChainEntry[];
}

export interface FallbackAttemptFailure {
  provider: string;
  model: string;
  error: string;
}

export interface FallbackSelectionResult {
  success: boolean;
  session?: OpenCodeSession;
  failures: FallbackAttemptFailure[];
}

export interface ActionInputs {
  workflowPath: string;
  prompt: string;
  envVars: Record<string, string>;
  timeoutMs: number;
  validationScript?: string;
  validationScriptType?: ValidationScriptType;
  maxValidationRetries: number;
  opencodeConfig?: string;
  authConfig?: string;
  fallbackConfig?: string;
  model?: string;
  listModels: boolean;
  disableFreeModels: boolean;
  subscriptionProviders: string[];
  debugLog: boolean;
  debugLogPath: string;
  exportTranscript: boolean;
  transcriptPath: string;
  writeJobSummary: boolean;
}

export interface OpenCodeSession {
  sessionId: string;
  lastMessage: string;
}

export interface ValidationOutput {
  success: boolean;
  continueMessage: string;
}

export type ActionStatus = 'success' | 'failure' | 'cancelled' | 'timeout';

export interface ActionOutputs {
  status: ActionStatus;
  result: string;
}

export interface RunnerResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  transcriptJsonPath?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const INPUT_LIMITS = {
  MAX_WORKFLOW_PATH_LENGTH: 1024,
  MAX_PROMPT_LENGTH: 100_000,
  MAX_ENV_VARS_SIZE: 65_536,
  MAX_ENV_VARS_COUNT: 100,
  MAX_OUTPUT_SIZE: 900_000,
  MAX_WORKFLOW_FILE_SIZE: 10_485_760, // 10MB
  DEFAULT_TIMEOUT_MINUTES: 30,
  MAX_TIMEOUT_MINUTES: 360, // 6 hours
  MAX_VALIDATION_RETRY: 20,
  DEFAULT_VALIDATION_RETRY: 5,
  VALIDATION_SCRIPT_TIMEOUT_MS: 60_000,
  INTERPRETER_CHECK_TIMEOUT_MS: 5_000,
  MAX_VALIDATION_OUTPUT_SIZE: 102_400, // 100KB
  MAX_LAST_MESSAGE_SIZE: 102_400, // 100KB
  MAX_INLINE_SCRIPT_SIZE: 102_400, // 100KB
  SHUTDOWN_TIMEOUT_MS: 10_000, // 10 seconds for graceful shutdown
  SIGKILL_GRACE_PERIOD_MS: 5_000, // 5 seconds to wait before SIGKILL
  MAX_STDERR_SIZE: 10_000, // 10KB for stderr capture
  EVENT_STREAM_HEARTBEAT_MS: 90_000, // Must exceed LLM inference pause (~60s)
  MAX_LOG_LINE_LENGTH: 6_000, // Runner log throughput collapses past ~6k chars/line (§3a)
} as const;

export type ShutdownSignal = 'SIGTERM' | 'SIGINT';

export type ValidationScriptType = 'python' | 'javascript';
