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

  describe('formatDebugLog', () => {
    it('returns empty string for pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act & Assert
      expect(target.formatDebugLog('grep', state)).toBe('');
    });

    it('returns pattern and include for running state', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { pattern: 'import', include: '*.ts' },
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('grep', state)).toBe(
        'Tool: grep\nPattern: import\nInclude: *.ts'
      );
    });

    it('shows "all files" for running state without include', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { pattern: 'import' },
        time: { start: 0 },
      };

      // Act & Assert
      expect(target.formatDebugLog('grep', state)).toBe(
        'Tool: grep\nPattern: import\nInclude: all files'
      );
    });

    it('returns pattern, include filter, and full output for completed state', () => {
      // Arrange
      const output = 'src/foo.ts:1:import { bar }\nsrc/baz.ts:5:import { qux }';
      const state = {
        status: 'completed' as const,
        input: { pattern: 'import', include: '*.ts' },
        output,
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('grep', state);

      // Assert
      expect(result).toBe(`Tool: grep\nPattern: import\nInclude: *.ts\n${output}`);
    });

    it('shows "all files" when include is absent', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { pattern: 'foo' },
        output: 'match',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('grep', state);

      // Assert
      expect(result).toContain('Include: all files');
    });

    it('returns full error for error state', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { pattern: 'bad[regex' },
        error: 'Invalid regex pattern',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatDebugLog('grep', state);

      // Assert
      expect(result).toBe('Tool: grep\nPattern: bad[regex\nError: Invalid regex pattern');
    });
  });
});
