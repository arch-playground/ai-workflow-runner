import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  validateWorkspacePath,
  validateRealPath,
  maskSecrets,
  sanitizeErrorMessage,
  validateUtf8,
} from '../../src/security';

jest.mock('@actions/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('security', () => {
  let tempDir: string;
  let realTempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'));
    realTempDir = fs.realpathSync(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateWorkspacePath', () => {
    it('accepts valid relative paths', () => {
      const result = validateWorkspacePath(tempDir, 'workflows/test.md');
      expect(result).toBe(path.join(realTempDir, 'workflows/test.md'));
    });

    it('accepts paths with subdirectories', () => {
      const result = validateWorkspacePath(tempDir, 'deep/nested/path/file.md');
      expect(result).toBe(path.join(realTempDir, 'deep/nested/path/file.md'));
    });

    it('accepts simple filenames', () => {
      const result = validateWorkspacePath(tempDir, 'test.md');
      expect(result).toBe(path.join(realTempDir, 'test.md'));
    });

    it('rejects absolute paths', () => {
      expect(() => validateWorkspacePath(tempDir, '/etc/passwd')).toThrow(
        'absolute paths and parent directory references are not allowed'
      );
    });

    it('rejects paths starting with ..', () => {
      expect(() => validateWorkspacePath(tempDir, '../outside.md')).toThrow(
        'absolute paths and parent directory references are not allowed'
      );
    });

    it('rejects paths with ../ in middle that escape workspace', () => {
      expect(() => validateWorkspacePath(tempDir, 'folder/../../../outside.md')).toThrow(
        'absolute paths and parent directory references'
      );
    });

    it('normalizes paths with ./', () => {
      const result = validateWorkspacePath(tempDir, './workflows/test.md');
      expect(result).toBe(path.join(realTempDir, 'workflows/test.md'));
    });
  });

  describe('validateRealPath', () => {
    it('accepts file within workspace', () => {
      const testFile = path.join(realTempDir, 'test.md');
      fs.writeFileSync(testFile, 'content');

      const result = validateRealPath(tempDir, testFile);
      expect(result).toBe(testFile);
    });

    it('rejects symlink pointing outside workspace', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
      const outsideFile = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideFile, 'secret content');

      const symlinkPath = path.join(tempDir, 'malicious-link');
      fs.symlinkSync(outsideFile, symlinkPath);

      try {
        expect(() => validateRealPath(tempDir, symlinkPath)).toThrow(
          'symlink target escapes the workspace directory'
        );
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('accepts symlink pointing inside workspace', () => {
      const targetFile = path.join(realTempDir, 'target.md');
      fs.writeFileSync(targetFile, 'content');

      const symlinkPath = path.join(realTempDir, 'link.md');
      fs.symlinkSync(targetFile, symlinkPath);

      const result = validateRealPath(tempDir, symlinkPath);
      expect(result).toBe(targetFile);
    });
  });

  describe('maskSecrets', () => {
    it('calls core.setSecret for each value', () => {
      const envVars = {
        SECRET1: 'value1',
        SECRET2: 'value2',
        SECRET3: 'value3',
      };

      maskSecrets(envVars);

      expect(mockCore.setSecret).toHaveBeenCalledTimes(3);
      expect(mockCore.setSecret).toHaveBeenCalledWith('value1');
      expect(mockCore.setSecret).toHaveBeenCalledWith('value2');
      expect(mockCore.setSecret).toHaveBeenCalledWith('value3');
    });

    it('handles empty values gracefully', () => {
      const envVars = {
        EMPTY: '',
        VALID: 'value',
      };

      maskSecrets(envVars);

      expect(mockCore.setSecret).toHaveBeenCalledTimes(1);
      expect(mockCore.setSecret).toHaveBeenCalledWith('value');
    });

    it('handles empty object gracefully', () => {
      maskSecrets({});
      expect(mockCore.setSecret).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('removes absolute paths', () => {
      const error = new Error('File not found: /home/user/project/secret.txt');
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain('/home/user/project/secret.txt');
      expect(sanitized).toContain('[PATH]');
    });

    it('removes potential secrets (long alphanumeric strings)', () => {
      const error = new Error('API key: abcdefghijklmnopqrstuvwxyz1234567890');
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('preserves short strings', () => {
      const error = new Error('Short error message');
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toBe('Short error message');
    });

    it('handles multiple patterns', () => {
      const error = new Error(
        'Error at /path/to/file with token abc123def456ghi789jkl012mno345pqr678'
      );
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toContain('[PATH]');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('validateUtf8', () => {
    it('accepts valid UTF-8', () => {
      const validUtf8 = Buffer.from('Hello, World! 你好世界 🌍', 'utf-8');
      const result = validateUtf8(validUtf8, 'test.md');
      expect(result).toBe('Hello, World! 你好世界 🌍');
    });

    it('accepts valid UTF-8 containing U+FFFD character', () => {
      const withReplacementChar = Buffer.from('Text with \uFFFD replacement', 'utf-8');
      const result = validateUtf8(withReplacementChar, 'test.md');
      expect(result).toBe('Text with \uFFFD replacement');
    });

    it('accepts empty buffer', () => {
      const empty = Buffer.from('', 'utf-8');
      const result = validateUtf8(empty, 'test.md');
      expect(result).toBe('');
    });

    it('rejects invalid UTF-8 byte sequences', () => {
      const invalidUtf8 = Buffer.from([0x80, 0x81, 0x82]);
      expect(() => validateUtf8(invalidUtf8, 'test.md')).toThrow('File is not valid UTF-8');
    });

    it('rejects incomplete UTF-8 sequences', () => {
      const incompleteSequence = Buffer.from([0xc3]);
      expect(() => validateUtf8(incompleteSequence, 'test.md')).toThrow('File is not valid UTF-8');
    });
  });
});
