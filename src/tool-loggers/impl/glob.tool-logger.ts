import type { ToolState } from '@opencode-ai/sdk';
import {
  IToolLogger,
  countLines,
  extractStringInput,
  extractNumberMetadata,
  truncateError,
} from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS, TOOL_METADATA_KEYS } from '../tool-input-keys.js';

export class GlobToolLogger implements IToolLogger {
  support(): string {
    return 'glob';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: glob - pending`;
      case 'running': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: glob - running - ${pattern}`;
      }
      case 'completed': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        const count = extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.COUNT);
        const resultInfo =
          count !== undefined ? `${count} files` : `${countLines(state.output)} lines`;
        return `Tool: glob - completed - ${pattern} - ${resultInfo}`;
      }
      case 'error': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: glob - error - ${pattern} - ${truncateError(state.error)}`;
      }
      default: {
        const exhaustiveState = state as { status: string };
        return `Tool: ${tool} - ${exhaustiveState.status}`;
      }
    }
  }

  formatDebugLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return '';
      case 'running': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: glob\nPattern: ${pattern}`;
      }
      case 'completed': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: glob\nPattern: ${pattern}\n${state.output}`;
      }
      case 'error': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: glob\nPattern: ${pattern}\nError: ${state.error}`;
      }
      default:
        return '';
    }
  }
}
