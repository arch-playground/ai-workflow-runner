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

  describe('formatDebugLog', () => {
    it('returns empty string for pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act & Assert
      expect(target.formatDebugLog('write', state)).toBe('');
    });

    it('returns file path for running state', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { filePath: './out.ts' },
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('write', state)).toBe('Tool: write\nFile: ./out.ts');
    });

    it('shows content from input with + prefix lines', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './out.ts', content: 'line 1\nline 2\nline 3' },
        output: 'File written',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('write', state);

      // Assert
      expect(result).toBe(
        'Tool: write\nFile: ./out.ts\n+++ ./out.ts\n+ line 1\n+ line 2\n+ line 3'
      );
    });

    it('falls back to output when content is missing', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './out.ts' },
        output: 'written ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('write', state);

      // Assert
      expect(result).toContain('[content from output]');
      expect(result).toContain('+ written ok');
    });

    it('shows (unknown) when filePath is missing', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { content: 'data' },
        output: '',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('write', state);

      // Assert
      expect(result).toContain('File: (unknown)');
      expect(result).toContain('+++ (unknown)');
    });

    it('returns full error for error state', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { filePath: './out.ts' },
        error: 'Permission denied',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('write', state);

      // Assert
      expect(result).toBe('Tool: write\nFile: ./out.ts\nError: Permission denied');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './out.ts', content: 'data' },
        output: '',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act & Assert
      expect(target.formatDebugLog('write', state)).not.toContain('[OpenCode]');
    });
  });
});
