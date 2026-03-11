import { DefaultToolLogger } from './default.tool-logger';

describe('DefaultToolLogger', () => {
  let target: DefaultToolLogger;

  beforeEach(() => {
    target = new DefaultToolLogger();
  });

  it('support() returns "default"', () => {
    expect(target.support()).toBe('default');
  });

  describe('formatLog', () => {
    it('formats pending state with tool name', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - pending');
    });

    it('formats running state with tool name', () => {
      // Arrange
      const state = { status: 'running' as const, input: {}, time: { start: 0 } };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - running');
    });

    it('formats running state with title when title is present', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: {},
        title: 'My Title',
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - running - My Title');
    });

    it('formats running state without title when title is absent', () => {
      // Arrange
      const state = { status: 'running' as const, input: {}, time: { start: 0 } };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - running');
    });

    it('formats completed state with tool name and output line count', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {},
        output: 'line1\nline2\nline3',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - completed - 3 lines');
    });

    it('formats completed state with "empty output" when output is empty string', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {},
        output: '',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - completed - empty output');
    });

    it('formats error state with tool name and error message', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: {},
        error: 'Something went wrong',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - error - Something went wrong');
    });

    it('formats error state with truncated error when error > 200 chars', () => {
      // Arrange
      const longError = 'x'.repeat(250);
      const state = {
        status: 'error' as const,
        input: {},
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longError.length + 30);
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });

    it('handles unknown status', () => {
      // Arrange
      const state = { status: 'unknown', input: {} } as never;

      // Act
      const result = target.formatLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool - unknown');
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
        {
          status: 'error' as const,
          input: {},
          error: 'err',
          time: { start: 0, end: 1 },
        },
      ];

      // Act & Assert
      for (const state of states) {
        expect(target.formatLog('mytool', state)).not.toBe('');
      }
    });
  });

  describe('formatDebugLog', () => {
    it('returns empty string for pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatDebugLog('mytool', state);

      // Assert
      expect(result).toBe('');
    });

    it('returns JSON input for running state', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { key: 'value' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatDebugLog('mytool', state);

      // Assert
      expect(result).toBe('Tool: mytool\nInput:\n{\n  "key": "value"\n}');
    });

    it('returns formatted JSON input and full output for completed state', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { key: 'value', nested: { a: 1 } },
        output: 'full output content\nline 2',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('mytool', state);

      // Assert
      expect(result).toBe(
        'Tool: mytool\nInput:\n{\n  "key": "value",\n  "nested": {\n    "a": 1\n  }\n}\nOutput:\nfull output content\nline 2'
      );
    });

    it('returns formatted JSON input and full error for error state', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { command: 'test' },
        error: 'full error message without truncation',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('mytool', state);

      // Assert
      expect(result).toBe(
        'Tool: mytool\nInput:\n{\n  "command": "test"\n}\nError:\nfull error message without truncation'
      );
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {},
        output: 'test',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('mytool', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });
  });
});
