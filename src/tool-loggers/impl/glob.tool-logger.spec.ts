import { GlobToolLogger } from './glob.tool-logger';

describe('GlobToolLogger', () => {
  let target: GlobToolLogger;

  beforeEach(() => {
    target = new GlobToolLogger();
  });

  it('support() returns "glob"', () => {
    expect(target.support()).toBe('glob');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).toBe('Tool: glob - pending');
    });

    it('formats running state with pattern', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { pattern: '**/*.ts' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).toBe('Tool: glob - running - **/*.ts');
    });

    it('uses metadata.count for file count when available', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { pattern: '**/*.ts' },
        output: 'file1\nfile2\nfile3',
        title: '',
        metadata: { count: 15 },
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).toBe('Tool: glob - completed - **/*.ts - 15 files');
    });

    it('falls back to countLines() when metadata unavailable', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { pattern: '**/*.ts' },
        output: 'file1\nfile2',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).toBe('Tool: glob - completed - **/*.ts - 2 lines');
    });

    it('formats error state with pattern and error', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { pattern: '**/*.ts' },
        error: 'Pattern invalid',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).toBe('Tool: glob - error - **/*.ts - Pattern invalid');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });

    it('truncates long error messages', () => {
      // Arrange
      const longError = 'e'.repeat(250);
      const state = {
        status: 'error' as const,
        input: { pattern: '**/*.ts' },
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('glob', state);

      // Assert
      expect(result).toContain('...');
    });
  });
});
