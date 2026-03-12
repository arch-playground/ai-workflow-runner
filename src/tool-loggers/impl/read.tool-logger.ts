import type { ToolState } from '@opencode-ai/sdk/v2';
import {
  IToolLogger,
  countLines,
  extractStringInput,
  truncateError,
} from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS } from '../tool-input-keys.js';

export class ReadToolLogger implements IToolLogger {
  support(): string {
    return 'read';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: read - pending`;
      case 'running': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: read - running - ${filePath}`;
      }
      case 'completed': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        const lines = countLines(state.output);
        const outputInfo = lines === 0 ? 'empty output' : `${lines} lines`;
        return `Tool: read - completed - ${filePath} - ${outputInfo}`;
      }
      case 'error': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: read - error - ${filePath} - ${truncateError(state.error)}`;
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
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH) || '(unknown)';
        return `Tool: read\nFile: ${filePath}`;
      }
      case 'completed': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH) || '(unknown)';
        return `Tool: read\nFile: ${filePath}\n${state.output}`;
      }
      case 'error': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH) || '(unknown)';
        return `Tool: read\nFile: ${filePath}\nError: ${state.error}`;
      }
      default:
        return '';
    }
  }
}
