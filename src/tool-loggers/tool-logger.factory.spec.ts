import { ToolLoggerFactory } from './tool-logger.factory';
import { IToolLogger } from './tool-logger.interface';
import type { ToolState } from '@opencode-ai/sdk';

function makeLogger(name: string): IToolLogger {
  return {
    support: () => name,
    formatLog: (_tool: string, _state: ToolState) => `${name}-log`,
    formatDebugLog: (_tool: string, _state: ToolState) => `${name}-debug`,
  };
}

describe('ToolLoggerFactory', () => {
  describe('constructor', () => {
    it('initializes Map with tool-specific loggers', () => {
      // Arrange
      const readLogger = makeLogger('read');
      const bashLogger = makeLogger('bash');
      const defaultLogger = makeLogger('default');

      // Act
      const target = new ToolLoggerFactory([readLogger, bashLogger, defaultLogger]);

      // Assert
      expect(target.getLogger('read')).toBe(readLogger);
      expect(target.getLogger('bash')).toBe(bashLogger);
    });

    it('stores default logger separately', () => {
      // Arrange
      const defaultLogger = makeLogger('default');

      // Act
      const target = new ToolLoggerFactory([defaultLogger]);

      // Assert
      expect(target.getLogger('unknown-tool')).toBe(defaultLogger);
    });

    it('throws error if no default logger provided', () => {
      // Arrange
      const readLogger = makeLogger('read');

      // Act & Assert
      expect(() => new ToolLoggerFactory([readLogger])).toThrow(
        'No default logger found. At least one logger must support "default".'
      );
    });

    it('throws error if duplicate support() value detected for non-default', () => {
      // Arrange
      const readLoggerA = makeLogger('read');
      const readLoggerB = makeLogger('read');
      const defaultLogger = makeLogger('default');

      // Act & Assert
      expect(() => new ToolLoggerFactory([readLoggerA, readLoggerB, defaultLogger])).toThrow(
        "Duplicate support() value detected: 'read'"
      );
    });

    it('throws error if duplicate default support() value detected', () => {
      // Arrange
      const defaultLoggerA = makeLogger('default');
      const defaultLoggerB = makeLogger('default');

      // Act & Assert
      expect(() => new ToolLoggerFactory([defaultLoggerA, defaultLoggerB])).toThrow(
        "Duplicate support() value detected: 'default'"
      );
    });
  });

  describe('getLogger', () => {
    let target: ToolLoggerFactory;
    let readLogger: IToolLogger;
    let defaultLogger: IToolLogger;

    beforeEach(() => {
      readLogger = makeLogger('read');
      defaultLogger = makeLogger('default');
      target = new ToolLoggerFactory([readLogger, defaultLogger]);
    });

    it('returns correct logger for known tool (O(1) lookup)', () => {
      // Act
      const result = target.getLogger('read');

      // Assert
      expect(result).toBe(readLogger);
    });

    it('returns default logger for unknown tool', () => {
      // Act
      const result = target.getLogger('unknown-tool');

      // Assert
      expect(result).toBe(defaultLogger);
    });

    it('returns default logger for empty string tool name', () => {
      // Act
      const result = target.getLogger('');

      // Assert
      expect(result).toBe(defaultLogger);
    });
  });
});
