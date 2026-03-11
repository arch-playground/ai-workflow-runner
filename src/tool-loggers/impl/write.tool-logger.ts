import type { ToolState } from '@opencode-ai/sdk';
import { IToolLogger, extractStringInput, truncateError } from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS } from '../tool-input-keys.js';

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
}
