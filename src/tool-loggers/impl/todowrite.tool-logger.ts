import type { ToolState } from '@opencode-ai/sdk/v2';
import { IToolLogger, truncateError } from '../tool-logger.interface.js';
import { TOOL_INPUT_KEYS } from '../tool-input-keys.js';

interface TodoItem {
  content?: string;
  status?: string;
  priority?: string;
}

function extractTodoTitles(input: Record<string, unknown>): string[] {
  const todos = input[TOOL_INPUT_KEYS.TODOS];
  if (!Array.isArray(todos)) return [];
  return todos
    .filter((item: unknown): item is TodoItem => typeof item === 'object' && item !== null)
    .map((item) => (typeof item.content === 'string' ? item.content : ''))
    .filter((title) => title !== '');
}

const STATUS_ICONS: Record<string, string> = {
  completed: '[x]',
  in_progress: '[>]',
  pending: '[ ]',
  cancelled: '[-]',
};

function extractTodoItems(input: Record<string, unknown>): TodoItem[] {
  const todos = input[TOOL_INPUT_KEYS.TODOS];
  if (!Array.isArray(todos)) return [];
  return todos.filter(
    (item: unknown): item is TodoItem => typeof item === 'object' && item !== null
  );
}

function formatStatusIcon(status?: string): string {
  if (!status) return '[?]';
  return STATUS_ICONS[status] ?? '[?]';
}

export class TodoWriteToolLogger implements IToolLogger {
  support(): string {
    return 'todowrite';
  }

  formatLog(tool: string, state: ToolState): string {
    switch (state.status) {
      case 'pending':
        return 'Tool: todowrite - pending';
      case 'running': {
        const titles = extractTodoTitles(state.input);
        const titleList = titles.length > 0 ? ` - [${titles.join(', ')}]` : '';
        return `Tool: todowrite - running${titleList}`;
      }
      case 'completed': {
        const titles = extractTodoTitles(state.input);
        const titleList = titles.length > 0 ? ` - [${titles.join(', ')}]` : '';
        return `Tool: todowrite - completed${titleList}`;
      }
      case 'error':
        return `Tool: todowrite - error - ${truncateError(state.error)}`;
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
        const titles = extractTodoTitles(state.input);
        const titleList = titles.length > 0 ? `\nTasks: [${titles.join(', ')}]` : '';
        return `Tool: todowrite${titleList}`;
      }
      case 'completed': {
        const items = extractTodoItems(state.input);
        const lines = items.map((item) => {
          const icon = formatStatusIcon(item.status);
          const priority =
            typeof item.priority === 'string' && item.priority ? ` (${item.priority})` : '';
          const content = typeof item.content === 'string' ? item.content : '';
          return `  ${icon}${priority} ${content}`;
        });
        return `Tool: todowrite\nTasks:\n${lines.join('\n')}`;
      }
      case 'error':
        return `Tool: todowrite\nError: ${state.error}`;
      default:
        return '';
    }
  }
}
