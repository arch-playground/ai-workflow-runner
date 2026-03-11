import type { ToolState } from '@opencode-ai/sdk';
import {
  IToolLogger,
  countLines,
  extractStringInput,
  extractNumberMetadata,
  truncateError,
} from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS, TOOL_METADATA_KEYS } from '../tool-input-keys.js';

function truncateCommand(raw: string): string {
  return raw.length > 80 ? raw.substring(0, 80) + '...' : raw;
}

export class BashToolLogger implements IToolLogger {
  support(): string {
    return 'bash';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return `Tool: bash - pending`;
      case 'running': {
        const command = truncateCommand(extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND));
        return `Tool: bash - running - ${command}`;
      }
      case 'completed': {
        const command = truncateCommand(extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND));
        const lines = countLines(state.output);
        const outputInfo = lines === 0 ? 'empty output' : `${lines} lines`;
        const exitCode = extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.EXIT);
        const exitSuffix = exitCode !== undefined && exitCode !== 0 ? ` (exit ${exitCode})` : '';
        return `Tool: bash - completed - ${command} - ${outputInfo}${exitSuffix}`;
      }
      case 'error': {
        const command = truncateCommand(extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND));
        return `Tool: bash - error - ${command} - ${truncateError(state.error)}`;
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
        const command = extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND) || '(no command)';
        return `Tool: bash\n$ ${command}`;
      }
      case 'completed': {
        const command = extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND) || '(no command)';
        const exitCode = extractNumberMetadata(state.metadata, TOOL_METADATA_KEYS.EXIT);
        const exitSuffix =
          exitCode !== undefined && exitCode !== 0 ? `\nExit code: ${exitCode}` : '';
        return `Tool: bash\n$ ${command}\n${state.output}${exitSuffix}`;
      }
      case 'error': {
        const command = extractStringInput(state.input, TOOL_INPUT_KEYS.COMMAND) || '(no command)';
        return `Tool: bash\n$ ${command}\nError: ${state.error}`;
      }
      default:
        return '';
    }
  }
}
