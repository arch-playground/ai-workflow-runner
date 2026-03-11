import { WriteToolLogger } from './write.tool-logger';

describe('WriteToolLogger', () => {
  let target: WriteToolLogger;

  beforeEach(() => {
    target = new WriteToolLogger();
  });

  it('support() returns "write"', () => {
    expect(target.support()).toBe('write');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('write', state);

      // Assert
      expect(result).toBe('Tool: write - pending');
    });

    it('formats running state with filePath', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { filePath: './output.ts' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('write', state);

      // Assert
      expect(result).toBe('Tool: write - running - ./output.ts');
    });

    it('formats completed state with filePath', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './output.ts' },
        output: 'written',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('write', state);

      // Assert
      expect(result).toBe('Tool: write - completed - ./output.ts');
    });

    it('formats error state with filePath and error', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { filePath: './output.ts' },
        error: 'Permission denied',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('write', state);

      // Assert
      expect(result).toBe('Tool: write - error - ./output.ts - Permission denied');
    });

    it('handles missing filePath gracefully', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('write', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
      expect(result).not.toBe('');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('write', state);

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
      const result = target.formatLog('write', state);

      // Assert
      expect(result).toContain('...');
    });
  });
});
