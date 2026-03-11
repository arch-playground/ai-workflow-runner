import * as fs from 'fs';
import * as core from '@actions/core';
import * as os from 'os';
import * as path from 'path';
import {
  initDebugLogWriter,
  getDebugLogWriter,
  resetDebugLogWriter,
  IDebugLogWriter,
} from './debug-log-writer';

jest.mock('@actions/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('DebugLogWriter', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    jest.clearAllMocks();
    resetDebugLogWriter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-log-test-'));
    tmpFile = path.join(tmpDir, 'debug.log');
  });

  afterEach(() => {
    resetDebugLogWriter();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('singleton lifecycle', () => {
    it('returns NoOpDebugLogWriter before init', () => {
      // Act
      const writer = getDebugLogWriter();

      // Assert
      expect(writer).toBeDefined();
      expect(fs.existsSync(tmpFile)).toBe(false);
    });

    it('returns DebugLogWriter after init', () => {
      // Act
      initDebugLogWriter(tmpFile);
      const writer = getDebugLogWriter();

      // Assert
      expect(writer).toBeDefined();
      expect(fs.existsSync(tmpFile)).toBe(true);
    });

    it('returns NoOpDebugLogWriter after reset', () => {
      // Arrange
      initDebugLogWriter(tmpFile);

      // Act
      resetDebugLogWriter();
      const writer = getDebugLogWriter();
      writer.writeSessionEvent('test');

      // Assert - no error, no file write
      expect(writer).toBeDefined();
    });
  });

  describe('file creation', () => {
    it('creates file with 0o600 permissions on construction', () => {
      // Act
      initDebugLogWriter(tmpFile);

      // Assert
      const stats = fs.statSync(tmpFile);
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o600);
    });

    it('creates empty file on construction', () => {
      // Act
      initDebugLogWriter(tmpFile);

      // Assert
      const content = fs.readFileSync(tmpFile, 'utf-8');
      expect(content).toBe('');
    });
  });

  describe('writeToolEvent', () => {
    it('appends formatted tool entry to file', async () => {
      // Arrange
      initDebugLogWriter(tmpFile);
      const writer = getDebugLogWriter();

      // Act
      writer.writeToolEvent('Tool: bash\n$ ls\nfile.txt');
      await flushWrites();

      // Assert
      const content = fs.readFileSync(tmpFile, 'utf-8');
      expect(content).toContain('===');
      expect(content).toContain('[Tool]');
      expect(content).toContain('Tool: bash\n$ ls\nfile.txt');
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('writeCompleteMessage', () => {
    it('appends formatted assistant message to file', async () => {
      // Arrange
      initDebugLogWriter(tmpFile);
      const writer = getDebugLogWriter();

      // Act
      writer.writeCompleteMessage('Hello, this is the assistant response.');
      await flushWrites();

      // Assert
      const content = fs.readFileSync(tmpFile, 'utf-8');
      expect(content).toContain('[Assistant]');
      expect(content).toContain('Hello, this is the assistant response.');
    });
  });

  describe('writeSessionEvent', () => {
    it('appends formatted session event to file', async () => {
      // Arrange
      initDebugLogWriter(tmpFile);
      const writer = getDebugLogWriter();

      // Act
      writer.writeSessionEvent('Session started');
      await flushWrites();

      // Assert
      const content = fs.readFileSync(tmpFile, 'utf-8');
      expect(content).toContain('[Session] Session started');
    });
  });

  describe('multiple writes', () => {
    it('appends multiple entries without overwriting', async () => {
      // Arrange
      initDebugLogWriter(tmpFile);
      const writer = getDebugLogWriter();

      // Act
      writer.writeSessionEvent('Start');
      writer.writeToolEvent('Tool: read\nFile: foo.ts');
      writer.writeCompleteMessage('Done');
      await flushWrites();

      // Assert
      const content = fs.readFileSync(tmpFile, 'utf-8');
      expect(content).toContain('[Session] Start');
      expect(content).toContain('[Tool]');
      expect(content).toContain('[Assistant]');
    });
  });

  describe('error handling', () => {
    it('logs warning and disables further writes on failure', async () => {
      // Arrange
      initDebugLogWriter(tmpFile);
      const writer = getDebugLogWriter();

      // Remove the file to cause write failure
      fs.unlinkSync(tmpFile);
      fs.rmdirSync(tmpDir);

      // Act
      writer.writeSessionEvent('Will fail');
      await flushWrites();

      // Assert
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('[OpenCode] Debug log write failed:')
      );

      // Second write should be silently skipped (no additional warning)
      mockCore.warning.mockClear();
      writer.writeSessionEvent('Should be skipped');
      await flushWrites();
      expect(mockCore.warning).not.toHaveBeenCalled();

      // Recreate tmpDir for cleanup
      fs.mkdirSync(tmpDir, { recursive: true });
    });
  });

  describe('NoOpDebugLogWriter', () => {
    it('does nothing on method calls', () => {
      // Arrange
      const writer = getDebugLogWriter();

      // Act - should not throw
      writer.writeToolEvent('test');
      writer.writeCompleteMessage('test');
      writer.writeSessionEvent('test');

      // Assert - no file created
      expect(fs.existsSync(tmpFile)).toBe(false);
    });
  });
});

async function flushWrites(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
