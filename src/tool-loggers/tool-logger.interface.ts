import type { ToolState } from '@opencode-ai/sdk';

export interface IToolLogger {
  /**
   * Returns the tool name this logger handles (e.g., 'read', 'bash') or 'default' for fallback.
   */
  support(): string;

  /**
   * Returns the formatted log string for the given tool state.
   *
   * MUST return a non-empty string for all 4 ToolState variants.
   * MUST NOT include the `[OpenCode]` prefix — the caller adds it.
   *
   * @param tool - The tool name from the event
   * @param state - The current tool state
   * @returns Non-empty formatted log string without [OpenCode] prefix
   */
  formatLog(tool: string, state: ToolState): string;

  /**
   * Returns verbose, untruncated debug string for running/completed/error states.
   *
   * @param tool - The tool name from the event
   * @param state - The current tool state
   * @returns Verbose debug string, or empty string for pending state
   */
  formatDebugLog(tool: string, state: ToolState): string;
}

/**
 * Returns 0 for empty string, otherwise the number of lines.
 */
export function countLines(output: string): number {
  if (output === '') return 0;
  return output.split('\n').length;
}

/**
 * Extracts a string value from input by key; returns empty string if missing or not a string.
 */
export function extractStringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Extracts a number value from metadata by key; returns undefined if missing or not a number.
 */
export function extractNumberMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  if (!metadata) return undefined;
  const value = metadata[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Truncates an error string to 200 chars with '...' suffix to prevent log flooding.
 */
export function truncateError(error: string): string {
  return error.length > 200 ? error.substring(0, 200) + '...' : error;
}
