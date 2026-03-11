import type { ToolState } from '@opencode-ai/sdk';
import { IToolLogger, extractStringInput, truncateError } from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS } from '../tool-input-keys.js';

export class EditToolLogger implements IToolLogger {
  support(): string {
    return 'edit';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: edit - pending`;
      case 'running': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: edit - running - ${filePath}`;
      }
      case 'completed': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: edit - completed - ${filePath}`;
      }
      case 'error': {
        const filePath = extractStringInput(state.input, TOOL_INPUT_KEYS.FILE_PATH);
        return `Tool: edit - error - ${filePath} - ${truncateError(state.error)}`;
      }
      default: {
        const exhaustiveState = state as { status: string };
        return `Tool: ${tool} - ${exhaustiveState.status}`;
      }
    }
  }
}
