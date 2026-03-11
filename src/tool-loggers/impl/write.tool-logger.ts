import type { ToolState } from '@opencode-ai/sdk';
import { IToolLogger, extractStringInput, truncateError } from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS } from '../tool-input-keys.js';

function formatContentLines(content: string, prefix: string): string {
  return content
    .split('\n')
    .map((line) => `${prefix} ${line}`)
    .join('\n');
}

export class WriteToolLogger implements IToolLogger {
  support(): string {
    return 'write';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: write - pending`;
      case 'running': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: write - running - ${filePath}`;
      }
      case 'completed': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: write - completed - ${filePath}`;
      }
      case 'error': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: write - error - ${filePath} - ${truncateError(state.error)}`;
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
        return `Tool: write\nFile: ${filePath}`;
      }
      case 'completed': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH) || '(unknown)';
        const content = extractStringInput(state.input, TOOL_INPUT_KEYS.CONTENT);
        if (content) {
          return `Tool: write\nFile: ${filePath}\n+++ ${filePath}\n${formatContentLines(content, '+')}`;
        }
        return `Tool: write\nFile: ${filePath}\n[content from output]\n${formatContentLines(state.output, '+')}`;
      }
      case 'error': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH) || '(unknown)';
        return `Tool: write\nFile: ${filePath}\nError: ${state.error}`;
      }
      default:
        return '';
    }
  }
}
