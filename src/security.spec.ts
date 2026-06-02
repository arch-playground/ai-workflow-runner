import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  validateWorkspacePath,
  validateConfigPath,
  validateRealPath,
  maskSecrets,
  sanitizeErrorMessage,
  validateUtf8,
  scrubSecrets,
  buildScopedEnv,
} from './security';

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

  describe('validateConfigPath', () => {
    it('accepts workspace-relative paths (delegates to validateWorkspacePath)', () => {
      const result = validateConfigPath(tempDir, 'config.json');
      expect(result).toBe(path.join(realTempDir, 'config.json'));
    });

    it('accepts relative paths with subdirectories', () => {
      const result = validateConfigPath(tempDir, 'configs/auth.json');
      expect(result).toBe(path.join(realTempDir, 'configs/auth.json'));
    });

    it('accepts absolute paths under /tmp/', () => {
      const result = validateConfigPath(tempDir, '/tmp/auth.json');
      expect(result).toBe('/tmp/auth.json');
    });

    it('accepts absolute paths under /tmp/ with subdirectories', () => {
      const result = validateConfigPath(tempDir, '/tmp/runner/auth.json');
      expect(result).toBe('/tmp/runner/auth.json');
    });

    it('accepts absolute paths under RUNNER_TEMP and translates to Docker mount', () => {
      const originalEnv = process.env.RUNNER_TEMP;
      process.env.RUNNER_TEMP = '/home/runner/work/_temp';
      try {
        const result = validateConfigPath(tempDir, '/home/runner/work/_temp/auth.json');
        expect(result).toBe('/github/runner_temp/auth.json');
      } finally {
        process.env.RUNNER_TEMP = originalEnv;
      }
    });

    it('accepts absolute paths under /github/runner_temp/', () => {
      const result = validateConfigPath(tempDir, '/github/runner_temp/config.json');
      expect(result).toBe('/github/runner_temp/config.json');
    });

    it('rejects absolute paths to unsafe locations', () => {
      expect(() => validateConfigPath(tempDir, '/etc/passwd')).toThrow(
        'absolute paths are only allowed under runner temp or /tmp'
      );
    });

    it('rejects absolute paths to home directories', () => {
      expect(() => validateConfigPath(tempDir, '/home/user/secrets.json')).toThrow(
        'absolute paths are only allowed under runner temp or /tmp'
      );
    });

    it('rejects path traversal escaping safe directory', () => {
      expect(() => validateConfigPath(tempDir, '/tmp/../../etc/passwd')).toThrow(
        'absolute paths are only allowed under runner temp or /tmp'
      );
    });

    it('rejects relative path traversal (delegates to validateWorkspacePath)', () => {
      expect(() => validateConfigPath(tempDir, '../outside.json')).toThrow(
        'absolute paths and parent directory references are not allowed'
      );
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

  describe('buildScopedEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('includes essential base vars with defaults when absent', () => {
      // Arrange
      delete process.env['PATH'];
      delete process.env['HOME'];
      delete process.env['LANG'];
      delete process.env['TERM'];

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect(result['PATH']).toBe('');
      expect(result['HOME']).toBe('');
      expect(result['LANG']).toBe('en_US.UTF-8');
      expect(result['TERM']).toBe('xterm');
    });

    it('passes through PATH/HOME/LANG/TERM from process.env when set', () => {
      // Arrange
      process.env['PATH'] = '/usr/bin:/bin';
      process.env['HOME'] = '/root';
      process.env['LANG'] = 'C.UTF-8';
      process.env['TERM'] = 'xterm-256color';

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect(result['PATH']).toBe('/usr/bin:/bin');
      expect(result['HOME']).toBe('/root');
      expect(result['LANG']).toBe('C.UTF-8');
      expect(result['TERM']).toBe('xterm-256color');
    });

    it('includes JAVA_HOME/GOPATH/GOROOT/RUNNER_TEMP when set', () => {
      // Arrange
      process.env['JAVA_HOME'] = '/usr/lib/jvm/java-21';
      process.env['GOPATH'] = '/root/go';
      process.env['GOROOT'] = '/usr/local/go';
      process.env['RUNNER_TEMP'] = '/tmp/runner';

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect(result['JAVA_HOME']).toBe('/usr/lib/jvm/java-21');
      expect(result['GOPATH']).toBe('/root/go');
      expect(result['GOROOT']).toBe('/usr/local/go');
      expect(result['RUNNER_TEMP']).toBe('/tmp/runner');
    });

    it('omits JAVA_HOME/GOPATH/GOROOT/RUNNER_TEMP when not set', () => {
      // Arrange
      delete process.env['JAVA_HOME'];
      delete process.env['GOPATH'];
      delete process.env['GOROOT'];
      delete process.env['RUNNER_TEMP'];

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect('JAVA_HOME' in result).toBe(false);
      expect('GOPATH' in result).toBe(false);
      expect('GOROOT' in result).toBe(false);
      expect('RUNNER_TEMP' in result).toBe(false);
    });

    it('includes XDG_* vars from process.env when set', () => {
      // Arrange
      process.env['XDG_CONFIG_HOME'] = '/root/.config';
      process.env['XDG_DATA_HOME'] = '/root/.local/share';

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect(result['XDG_CONFIG_HOME']).toBe('/root/.config');
      expect(result['XDG_DATA_HOME']).toBe('/root/.local/share');
    });

    it('omits XDG_* vars when not set', () => {
      // Arrange
      delete process.env['XDG_CONFIG_HOME'];
      delete process.env['XDG_DATA_HOME'];

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect('XDG_CONFIG_HOME' in result).toBe(false);
      expect('XDG_DATA_HOME' in result).toBe(false);
    });

    it('includes declared envVars in output', () => {
      // Arrange
      const envVars = { AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE', MY_TOKEN: 'tok-abc' };

      // Act
      const result = buildScopedEnv(envVars);

      // Assert
      expect(result['AWS_ACCESS_KEY_ID']).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(result['MY_TOKEN']).toBe('tok-abc');
    });

    it('excludes undeclared ambient secrets (GITHUB_TOKEN, AWS_SECRET_ACCESS_KEY)', () => {
      // Arrange
      process.env['GITHUB_TOKEN'] = 'ghs_supersecrettoken';
      process.env['AWS_SECRET_ACCESS_KEY'] = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

      // Act
      const result = buildScopedEnv({});

      // Assert
      expect('GITHUB_TOKEN' in result).toBe(false);
      expect('AWS_SECRET_ACCESS_KEY' in result).toBe(false);
    });

    it('declared envVars override allowlisted keys', () => {
      // Arrange
      process.env['PATH'] = '/usr/bin';
      const envVars = { PATH: '/custom/bin' };

      // Act
      const result = buildScopedEnv(envVars);

      // Assert
      expect(result['PATH']).toBe('/custom/bin');
    });

    it('returns a new object and does not mutate process.env', () => {
      // Arrange
      const before = { ...process.env };

      // Act
      buildScopedEnv({ CUSTOM: 'value' });

      // Assert
      expect(process.env).toEqual(before);
    });
  });

  describe('scrubSecrets', () => {
    it('returns content unchanged when secrets list is empty', () => {
      // Arrange
      const content = 'some content with no secrets';

      // Act
      const result = scrubSecrets(content, []);

      // Assert
      expect(result).toBe('some content with no secrets');
    });

    it('replaces a secret value with ***', () => {
      // Arrange
      const content = 'token=super_secret_value end';

      // Act
      const result = scrubSecrets(content, ['super_secret_value']);

      // Assert
      expect(result).toBe('token=*** end');
    });

    it('replaces all occurrences of a secret', () => {
      // Arrange
      const content = 'first super_secret then super_secret again';

      // Act
      const result = scrubSecrets(content, ['super_secret']);

      // Assert
      expect(result).toBe('first *** then *** again');
    });

    it('replaces multiple distinct secrets', () => {
      // Arrange
      const content = 'key1=alpha key2=beta extra';

      // Act
      const result = scrubSecrets(content, ['alpha', 'beta']);

      // Assert
      expect(result).toBe('key1=*** key2=*** extra');
    });

    it('skips empty strings in the secrets list', () => {
      // Arrange
      const content = 'normal content';

      // Act
      const result = scrubSecrets(content, ['', '']);

      // Assert
      expect(result).toBe('normal content');
    });

    it('handles a secret that is a substring of another value', () => {
      // Arrange
      const content = 'value=supersecret';

      // Act — only the exact secret 'secret' is scrubbed, not 'supersecret' as whole
      const result = scrubSecrets(content, ['secret']);

      // Assert
      expect(result).toBe('value=super***');
    });
  });
});
