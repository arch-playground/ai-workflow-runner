import { GrepToolLogger } from './grep.tool-logger';

describe('GrepToolLogger', () => {
  let target: GrepToolLogger;

  beforeEach(() => {
    target = new GrepToolLogger();
  });

  it('support() returns "grep"', () => {
    expect(target.support()).toBe('grep');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep - pending');
    });

    it('formats running state with pattern', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { pattern: 'import' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep - running - import');
    });

    it('appends "in {include}" when include is present', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { pattern: 'import', include: '*.ts' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep - running - import in *.ts');
    });

    it('omits include portion when include is absent', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { pattern: 'import' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).not.toContain(' in ');
    });

    it('uses metadata.matches for match count when available', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { pattern: 'import' },
        output: 'line1\nline2',
        title: '',
        metadata: { matches: 42 },
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep - completed - import - 42 matches');
    });

    it('falls back to countLines() when metadata unavailable', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { pattern: 'import' },
        output: 'line1\nline2\nline3',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep - completed - import - 3 lines');
    });

    it('formats error state with pattern and error', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { pattern: 'import' },
        error: 'Invalid regex',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep - error - import - Invalid regex');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });

    it('truncates long error messages', () => {
      // Arrange
      const longError = 'e'.repeat(250);
      const state = {
        status: 'error' as const,
        input: { pattern: 'foo' },
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('grep', state);

      // Assert
      expect(result).toContain('...');
    });
  });
});
