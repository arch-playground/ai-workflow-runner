import { EditToolLogger } from './edit.tool-logger';

describe('EditToolLogger', () => {
  let target: EditToolLogger;

  beforeEach(() => {
    target = new EditToolLogger();
  });

  it('support() returns "edit"', () => {
    expect(target.support()).toBe('edit');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).toBe('Tool: edit - pending');
    });

    it('formats running state with filePath', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { filePath: './src/foo.ts' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).toBe('Tool: edit - running - ./src/foo.ts');
    });

    it('formats completed state with filePath', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './src/foo.ts' },
        output: 'diff content',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).toBe('Tool: edit - completed - ./src/foo.ts');
    });

    it('formats error state with filePath and error', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { filePath: './src/foo.ts' },
        error: 'String not found',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).toBe('Tool: edit - error - ./src/foo.ts - String not found');
    });

    it('handles missing filePath gracefully', () => {
      // Arrange
      const state = { status: 'running' as const, input: {}, time: { start: 0 } };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).toBe('Tool: edit - running - ');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });

    it('truncates long error messages', () => {
      // Arrange
      const longError = 'e'.repeat(250);
      const state = {
        status: 'error' as const,
        input: { filePath: './file.ts' },
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('edit', state);

      // Assert
      expect(result).toContain('...');
    });
  });

  describe('formatDebugLog', () => {
    it('returns empty string for pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act & Assert
      expect(target.formatDebugLog('edit', state)).toBe('');
    });

    it('returns file path for running state', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { filePath: './foo.ts' },
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('edit', state)).toBe('Tool: edit\nFile: ./foo.ts');
    });

    it('returns unified diff format for completed state', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {
          filePath: './src/foo.ts',
          oldString: 'const a = 1;\nconst b = 2;',
          newString: 'const a = 10;\nconst b = 20;',
        },
        output: 'edited',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('edit', state);

      // Assert
      expect(result).toBe(
        'Tool: edit\nFile: ./src/foo.ts\n--- a/./src/foo.ts\n+++ b/./src/foo.ts\n- const a = 1;\n- const b = 2;\n+ const a = 10;\n+ const b = 20;'
      );
    });

    it('shows (unknown) when filePath is missing', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { oldString: 'old', newString: 'new' },
        output: 'edited',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('edit', state);

      // Assert
      expect(result).toContain('File: (unknown)');
      expect(result).toContain('--- a/(unknown)');
      expect(result).toContain('+++ b/(unknown)');
    });

    it('handles single-line edits', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './foo.ts', oldString: 'old', newString: 'new' },
        output: 'edited',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('edit', state);

      // Assert
      expect(result).toContain('- old');
      expect(result).toContain('+ new');
    });

    it('returns full error for error state', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { filePath: './foo.ts' },
        error: 'String not found',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('edit', state);

      // Assert
      expect(result).toBe('Tool: edit\nFile: ./foo.ts\nError: String not found');
    });
  });
});
