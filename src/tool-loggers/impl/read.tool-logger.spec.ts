import { ReadToolLogger } from './read.tool-logger';

describe('ReadToolLogger', () => {
  let target: ReadToolLogger;

  beforeEach(() => {
    target = new ReadToolLogger();
  });

  it('support() returns "read"', () => {
    expect(target.support()).toBe('read');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: { filePath: './foo.ts' }, raw: '' };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toBe('Tool: read - pending');
    });

    it('formats running state with filePath', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { filePath: './config.json' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toBe('Tool: read - running - ./config.json');
    });

    it('formats completed state with filePath and line count', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './src/foo.ts' },
        output: 'line1\nline2\nline3',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toBe('Tool: read - completed - ./src/foo.ts - 3 lines');
    });

    it('formats completed state with "empty output" when output is empty', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './src/foo.ts' },
        output: '',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toBe('Tool: read - completed - ./src/foo.ts - empty output');
    });

    it('formats error state with filePath and error cause', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { filePath: './missing.ts' },
        error: 'File not found',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toBe('Tool: read - error - ./missing.ts - File not found');
    });

    it('formats error state with truncated error when error > 200 chars', () => {
      // Arrange
      const longError = 'e'.repeat(250);
      const state = {
        status: 'error' as const,
        input: { filePath: './file.ts' },
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longError.length + 40);
    });

    it('handles missing filePath in input gracefully', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: {},
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).toBe('Tool: read - running - ');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('read', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });
  });

  describe('formatDebugLog', () => {
    it('returns empty string for pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act & Assert
      expect(target.formatDebugLog('read', state)).toBe('');
    });

    it('returns file path for running state', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { filePath: './foo.ts' },
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('read', state)).toBe('Tool: read\nFile: ./foo.ts');
    });

    it('returns (unknown) for running state with missing filePath', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: {},
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('read', state)).toBe('Tool: read\nFile: (unknown)');
    });

    it('returns full file content for completed state', () => {
      // Arrange
      const content = 'line 1\nline 2\nline 3';
      const state = {
        status: 'completed' as const,
        input: { filePath: './src/foo.ts' },
        output: content,
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('read', state);

      // Assert
      expect(result).toBe(`Tool: read\nFile: ./src/foo.ts\n${content}`);
    });

    it('shows (unknown) when filePath is missing', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: {},
        output: 'content',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('read', state);

      // Assert
      expect(result).toContain('File: (unknown)');
    });

    it('returns full error for error state', () => {
      // Arrange
      const longError = 'e'.repeat(500);
      const state = {
        status: 'error' as const,
        input: { filePath: './missing.ts' },
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('read', state);

      // Assert
      expect(result).toBe(`Tool: read\nFile: ./missing.ts\nError: ${longError}`);
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { filePath: './foo.ts' },
        output: 'content',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act & Assert
      expect(target.formatDebugLog('read', state)).not.toContain('[OpenCode]');
    });
  });
});
