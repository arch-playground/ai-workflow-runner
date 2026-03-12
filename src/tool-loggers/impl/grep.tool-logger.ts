import type { ToolState } from '@opencode-ai/sdk/v2';
import {
  IToolLogger,
  countLines,
  extractStringInput,
  extractNumberMetadata,
  truncateError,
} from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS, TOOL_METADATA_KEYS } from '../tool-input-keys.js';

export class GrepToolLogger implements IToolLogger {
  support(): string {
    return 'grep';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: grep - pending`;
      case 'running': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        const include = extractStringInput(state.input, TOOL_INPUT_KEYS.INCLUDE);
        const includeSuffix = include ? ` in ${include}` : '';
        return `Tool: grep - running - ${pattern}${includeSuffix}`;
      }
      case 'completed': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        const matches = extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.MATCHES);
        const resultInfo =
          matches !== undefined ? `${matches} matches` : `${countLines(state.output)} lines`;
        return `Tool: grep - completed - ${pattern} - ${resultInfo}`;
      }
      case 'error': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: grep - error - ${pattern} - ${truncateError(state.error)}`;
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
        const include = extractStringInput(state.input, TOOL_INPUT_KEYS.INCLUDE) || 'all files';
        return `Tool: grep\nPattern: ${pattern}\nInclude: ${include}`;
      }
      case 'completed': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        const include = extractStringInput(state.input, TOOL_INPUT_KEYS.INCLUDE) || 'all files';
        return `Tool: grep\nPattern: ${pattern}\nInclude: ${include}\n${state.output}`;
      }
      case 'error': {
        const pattern = extractStringInput(state.input, TOOL_INPUT_KEYS.PATTERN);
        return `Tool: grep\nPattern: ${pattern}\nError: ${state.error}`;
      }
      default:
        return '';
    }
  }
}
