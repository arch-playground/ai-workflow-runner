export interface ActionInputs {
    workflowPath: string;
    prompt: string;
    envVars: Record<string, string>;
    timeoutMs: number;
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
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export declare const INPUT_LIMITS: {
    readonly MAX_WORKFLOW_PATH_LENGTH: 1024;
    readonly MAX_PROMPT_LENGTH: 100000;
    readonly MAX_ENV_VARS_SIZE: 65536;
    readonly MAX_ENV_VARS_COUNT: 100;
    readonly MAX_OUTPUT_SIZE: 900000;
    readonly MAX_WORKFLOW_FILE_SIZE: 10485760;
    readonly DEFAULT_TIMEOUT_MINUTES: 30;
    readonly MAX_TIMEOUT_MINUTES: 360;
};
