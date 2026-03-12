import type { ToolState } from '@opencode-ai/sdk/v2';
import { IToolLogger, countLines, truncateError } from '../tool-logger.interface.js';

export class DefaultToolLogger implements IToolLogger {
  support(): string {
    return 'default';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: ${tool} - pending`;
      case 'running': {
        const title = state.title ? ` - ${state.title}` : '';
        return `Tool: ${tool} - running${title}`;
      }
      case 'completed': {
        const lines = countLines(state.output);
        const outputInfo = lines === 0 ? 'empty output' : `${lines} lines`;
        return `Tool: ${tool} - completed - ${outputInfo}`;
      }
      case 'error':
        return `Tool: ${tool} - error - ${truncateError(state.error)}`;
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
      case 'running':
        return `Tool: ${tool}\nInput:\n${JSON.stringify(state.input, null, 2)}`;
      case 'completed':
        return `Tool: ${tool}\nInput:\n${JSON.stringify(state.input, null, 2)}\nOutput:\n${state.output}`;
      case 'error':
        return `Tool: ${tool}\nInput:\n${JSON.stringify(state.input, null, 2)}\nError:\n${state.error}`;
      default:
        return '';
    }
  }
}
