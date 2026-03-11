import { BashToolLogger } from './bash.tool-logger';

describe('BashToolLogger', () => {
  let target: BashToolLogger;

  beforeEach(() => {
    target = new BashToolLogger();
  });

  it('support() returns "bash"', () => {
    expect(target.support()).toBe('bash');
  });

  describe('formatLog', () => {
    it('formats pending state', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toBe('Tool: bash - pending');
    });

    it('formats running state with command', () => {
      // Arrange
      const state = {
        status: 'running' as const,
        input: { command: 'npm run build' },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toBe('Tool: bash - running - npm run build');
    });

    it('truncates command to 80 chars with "..." suffix', () => {
      // Arrange
      const longCommand = 'a'.repeat(100);
      const state = {
        status: 'running' as const,
        input: { command: longCommand },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toContain('...');
      const commandPart = result.replace('Tool: bash - running - ', '');
      expect(commandPart).toBe('a'.repeat(80) + '...');
    });

    it('does NOT truncate command <= 80 chars', () => {
      // Arrange
      const command = 'a'.repeat(80);
      const state = {
        status: 'running' as const,
        input: { command },
        time: { start: 0 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toBe(`Tool: bash - running - ${command}`);
    });

    it('formats completed state with command and line count', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { command: 'ls -la' },
        output: 'line1\nline2',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toBe('Tool: bash - completed - ls -la - 2 lines');
    });

    it('formats completed state with "empty output" when output is empty', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { command: 'echo' },
        output: '',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toBe('Tool: bash - completed - echo - empty output');
    });

    it('appends "(exit {code})" when exit code is non-zero', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { command: 'false' },
        output: '',
        title: '',
        metadata: { exit: 1 },
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toContain('(exit 1)');
    });

    it('omits exit code when metadata.exit is 0', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { command: 'true' },
        output: 'ok',
        title: '',
        metadata: { exit: 0 },
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).not.toContain('exit');
    });

    it('omits exit code when metadata.exit is undefined', () => {
      // Arrange
      const state = {
        status: 'completed' as const,
        input: { command: 'true' },
        output: 'ok',
        title: '',
        metadata: {},
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).not.toContain('exit');
    });

    it('formats error state with command and error', () => {
      // Arrange
      const state = {
        status: 'error' as const,
        input: { command: 'bad-cmd' },
        error: 'command not found',
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toBe('Tool: bash - error - bad-cmd - command not found');
    });

    it('handles missing command gracefully', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).not.toBe('');
      expect(result).not.toContain('[OpenCode]');
    });

    it('output never includes [OpenCode] prefix', () => {
      // Arrange
      const state = { status: 'pending' as const, input: {}, raw: '' };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).not.toContain('[OpenCode]');
    });

    it('truncates long error messages', () => {
      // Arrange
      const longError = 'e'.repeat(250);
      const state = {
        status: 'error' as const,
        input: { command: 'cmd' },
        error: longError,
        time: { start: 0, end: 1 },
      };

      // Act
      const result = target.formatLog('bash', state);

      // Assert
      expect(result).toContain('...');
    });
  });
});
