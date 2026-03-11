import type { ToolState } from '@opencode-ai/sdk';
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
}
