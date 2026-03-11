import { TodoWriteToolLogger } from './todowrite.tool-logger';

describe('TodoWriteToolLogger', () => {
  let target: TodoWriteToolLogger;

  beforeEach(() => {
    target = new TodoWriteToolLogger();
  });

  it('support() returns "todowrite"', () => {
    expect(target.support()).toBe('todowrite');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - pending');
    });

    it('formats running state with task titles', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: {
          todos: [
            { id: '1', content: 'Fix login bug', status: 'pending', priority: 'high' },
            { id: '2', content: 'Add unit tests', status: 'in_progress', priority: 'medium' },
          ],
        },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - running - [Fix login bug, Add unit tests]');
    });

    it('formats completed state with task titles', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {
          todos: [{ id: '1', content: 'Fix login bug', status: 'completed', priority: 'high' }],
        },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - completed - [Fix login bug]');
    });

    it('formats running state without titles when todos is missing', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: {},
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - running');
    });

    it('formats running state without titles when todos is not an array', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { todos: 'not-an-array' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - running');
    });

    it('formats running state without titles when todos items have no content', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { todos: [{ id: '1', status: 'pending' }] },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - running');
    });

    it('skips non-object items in todos array', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { todos: ['string-item', null, { id: '1', content: 'Valid task' }] },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - running - [Valid task]');
    });

    it('formats error state with truncated error', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: {},
        error: 'Something went wrong',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite - error - Something went wrong');
    });

    it('truncates long error messages', () => {
      // Arrange
      const longError = 'e'.repeat(250);
      const state = {
        status: 'error' as const,
        input: {},
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).toContain('...');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('todowrite', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });

    it('output is never empty string', () => {
      // Arrange
      const states = [
        { status: 'pending' as const, input: {}, raw: '' },
        { status: 'running' as const, input: {}, time: { start: 0 } },
        {
          status: 'completed' as const,
          input: {},
          output: '',
          title: '',
          metadata: {},
          time: { start: 0, end: 1 },
        },
        { status: 'error' as const, input: {}, error: 'err', time: { start: 0, end: 1 } },
      ];

      // Act & Assert
      for (const state of states) {
        expect(target.formatLog('todowrite', state)).not.toBe('');
      }
    });
  });

  describe('formatDebugLog', () => {
    it('returns empty string for pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act & Assert
      expect(target.formatDebugLog('todowrite', state)).toBe('');
    });

    it('returns task titles for running state', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: {
          todos: [
            { id: '1', content: 'Task A', status: 'pending', priority: 'high' },
            { id: '2', content: 'Task B', status: 'pending', priority: 'low' },
          ],
        },
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('todowrite', state)).toBe(
        'Tool: todowrite\nTasks: [Task A, Task B]'
      );
    });

    it('returns tool name only for running state with no todos', () => {
      // Arrange
      const state = { status: 'running' as const, input: {}, time: { start: 0 } };

      // Act & Assert
      expect(target.formatDebugLog('todowrite', state)).toBe('Tool: todowrite');
    });

    it('returns task list with status icons and priority', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {
          todos: [
            { id: '1', content: 'Task A', status: 'completed', priority: 'high' },
            { id: '2', content: 'Task B', status: 'in_progress', priority: 'medium' },
            { id: '3', content: 'Task C', status: 'pending', priority: 'low' },
            { id: '4', content: 'Task D', status: 'cancelled', priority: 'high' },
          ],
        },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('todowrite', state);

      // Assert
      expect(result).toBe(
        'Tool: todowrite\nTasks:\n  [x] (high) Task A\n  [>] (medium) Task B\n  [ ] (low) Task C\n  [-] (high) Task D'
      );
    });

    it('shows [?] for unknown status', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {
          todos: [{ id: '1', content: 'Task X', status: 'unknown_status', priority: 'high' }],
        },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('todowrite', state);

      // Assert
      expect(result).toContain('[?] (high) Task X');
    });

    it('omits priority label when priority is missing', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {
          todos: [{ id: '1', content: 'Task Y', status: 'completed' }],
        },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('todowrite', state);

      // Assert
      expect(result).toContain('[x] Task Y');
      expect(result).not.toContain('()');
    });

    it('shows [?] when status is missing', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {
          todos: [{ id: '1', content: 'Task Z' }],
        },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('todowrite', state);

      // Assert
      expect(result).toContain('[?] Task Z');
    });

    it('returns full error for error state', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: {},
        error: 'Something went wrong',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('todowrite', state);

      // Assert
      expect(result).toBe('Tool: todowrite\nError: Something went wrong');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { todos: [{ id: '1', content: 'Task', status: 'pending' }] },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act & Assert
      expect(target.formatDebugLog('todowrite', state)).not.toContain('[OpenCode]');
    });
  });
});
