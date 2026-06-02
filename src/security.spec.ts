import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  validateWorkspacePath,
  validateConfigPath,
  validateRealPath,
  maskSecrets,
  maskAmbientSecrets,
  maskAuthValues,
  sanitizeErrorMessage,
  validateUtf8,
  scrubSecrets,
  buildScopedEnv,
  validateProviderBaseUrl,
  isAllowedProviderHost,
  extractProviderBaseUrls,
  DEFAULT_PROVIDER_HOSTS,
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

  describe('DEFAULT_PROVIDER_HOSTS', () => {
    it('includes api.githubcopilot.com (Copilot-never-blocked invariant)', () => {
      expect(DEFAULT_PROVIDER_HOSTS).toContain('api.githubcopilot.com');
    });

    it('includes major provider hosts', () => {
      expect(DEFAULT_PROVIDER_HOSTS).toContain('api.openai.com');
      expect(DEFAULT_PROVIDER_HOSTS).toContain('api.anthropic.com');
      expect(DEFAULT_PROVIDER_HOSTS).toContain('generativelanguage.googleapis.com');
      expect(DEFAULT_PROVIDER_HOSTS).toContain('openrouter.ai');
    });
  });

  describe('isAllowedProviderHost', () => {
    it('allows hosts matching the default list exactly', () => {
      expect(isAllowedProviderHost('api.openai.com', [])).toBe(true);
      expect(isAllowedProviderHost('api.anthropic.com', [])).toBe(true);
      expect(isAllowedProviderHost('api.githubcopilot.com', [])).toBe(true);
    });

    it('allows Azure hosts via wildcard glob', () => {
      expect(isAllowedProviderHost('myresource.cognitiveservices.azure.com', [])).toBe(true);
      expect(isAllowedProviderHost('myresource.openai.azure.com', [])).toBe(true);
    });

    it('allows Bedrock hosts via wildcard glob', () => {
      expect(isAllowedProviderHost('bedrock-runtime.us-east-1.amazonaws.com', [])).toBe(true);
      expect(isAllowedProviderHost('bedrock.us-west-2.amazonaws.com', [])).toBe(true);
    });

    it('rejects unknown hosts not in default list', () => {
      expect(isAllowedProviderHost('attacker.evil.com', [])).toBe(false);
      expect(isAllowedProviderHost('totally-legit-openai.com', [])).toBe(false);
    });

    it('allows hosts added via extraHosts', () => {
      expect(isAllowedProviderHost('my-gateway.corp.com', ['my-gateway.corp.com'])).toBe(true);
    });

    it('allows wildcard patterns in extraHosts', () => {
      expect(isAllowedProviderHost('gateway.internal.corp', ['*.internal.corp'])).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isAllowedProviderHost('API.OPENAI.COM', [])).toBe(true);
    });
  });

  describe('validateProviderBaseUrl', () => {
    it('accepts a valid allowlisted https URL', () => {
      expect(() => validateProviderBaseUrl('https://api.openai.com/v1', [])).not.toThrow();
    });

    it('accepts api.githubcopilot.com (Copilot invariant)', () => {
      expect(() => validateProviderBaseUrl('https://api.githubcopilot.com/v1', [])).not.toThrow();
    });

    it('accepts Azure wildcard host', () => {
      expect(() =>
        validateProviderBaseUrl('https://myres.cognitiveservices.azure.com/', [])
      ).not.toThrow();
    });

    it('accepts Bedrock wildcard host', () => {
      expect(() =>
        validateProviderBaseUrl('https://bedrock-runtime.us-east-1.amazonaws.com/', [])
      ).not.toThrow();
    });

    it('accepts host added via extraHosts', () => {
      expect(() =>
        validateProviderBaseUrl('https://my-gateway.corp.com/v1', ['my-gateway.corp.com'])
      ).not.toThrow();
    });

    it('rejects http (non-https) scheme', () => {
      expect(() => validateProviderBaseUrl('http://api.openai.com/v1', [])).toThrow(
        'only https is allowed'
      );
    });

    it('rejects non-URL strings', () => {
      expect(() => validateProviderBaseUrl('not-a-url', [])).toThrow('not a valid URL');
    });

    it('rejects loopback IP (127.x.x.x)', () => {
      expect(() => validateProviderBaseUrl('https://127.0.0.1/v1', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects RFC1918 10.x.x.x range', () => {
      expect(() => validateProviderBaseUrl('https://10.0.0.1/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects RFC1918 172.16-31.x.x range', () => {
      expect(() => validateProviderBaseUrl('https://172.16.0.1/api', [])).toThrow(
        'private/metadata range'
      );
      expect(() => validateProviderBaseUrl('https://172.31.255.255/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('does NOT reject 172.15.x.x (outside RFC1918 range)', () => {
      // 172.15 is not in RFC1918, so it's unknown — it won't be in allowlist, so fails allowlist check
      expect(() => validateProviderBaseUrl('https://172.15.0.1/api', [])).toThrow(
        'not an allowed provider host'
      );
    });

    it('rejects RFC1918 192.168.x.x range', () => {
      expect(() => validateProviderBaseUrl('https://192.168.1.1/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects AWS metadata IP 169.254.169.254', () => {
      expect(() => validateProviderBaseUrl('https://169.254.169.254/latest', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects IPv6 loopback ::1', () => {
      expect(() => validateProviderBaseUrl('https://[::1]/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects bare hostnames without dots (single-label)', () => {
      expect(() => validateProviderBaseUrl('https://localhost/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects .internal TLD hostnames', () => {
      expect(() => validateProviderBaseUrl('https://myservice.internal/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects .local TLD hostnames', () => {
      expect(() => validateProviderBaseUrl('https://myservice.local/api', [])).toThrow(
        'private/metadata range'
      );
    });

    it('rejects unknown external host not in allowlist', () => {
      expect(() => validateProviderBaseUrl('https://attacker.evil.com/api', [])).toThrow(
        'not an allowed provider host'
      );
    });

    it('includes hostname in error for allowlist failures', () => {
      expect(() => validateProviderBaseUrl('https://unknown.example.com/api', [])).toThrow(
        'unknown.example.com'
      );
    });
  });

  describe('extractProviderBaseUrls', () => {
    it('returns empty array when no provider section', () => {
      expect(extractProviderBaseUrls({})).toEqual([]);
    });

    it('returns empty array when provider section is not an object', () => {
      expect(extractProviderBaseUrls({ provider: 'string' })).toEqual([]);
      expect(extractProviderBaseUrls({ provider: null })).toEqual([]);
    });

    it('extracts baseURL from provider options', () => {
      // Arrange
      const config = {
        provider: {
          openai: {
            options: { baseURL: 'https://attacker.evil.com' },
          },
        },
      };

      // Act
      const result = extractProviderBaseUrls(config);

      // Assert
      expect(result).toEqual([{ providerId: 'openai', url: 'https://attacker.evil.com' }]);
    });

    it('extracts endpoint field from provider options', () => {
      // Arrange
      const config = {
        provider: {
          custom: {
            options: { endpoint: 'https://my-gateway.example.com/v1' },
          },
        },
      };

      // Act
      const result = extractProviderBaseUrls(config);

      // Assert
      expect(result).toEqual([{ providerId: 'custom', url: 'https://my-gateway.example.com/v1' }]);
    });

    it('extracts enterpriseUrl field from provider options', () => {
      // Arrange
      const config = {
        provider: {
          github: {
            options: { enterpriseUrl: 'https://github.example.corp' },
          },
        },
      };

      // Act
      const result = extractProviderBaseUrls(config);

      // Assert
      expect(result).toEqual([{ providerId: 'github', url: 'https://github.example.corp' }]);
    });

    it('skips providers without options', () => {
      // Arrange
      const config = {
        provider: {
          openai: { model: 'gpt-4' }, // no options key
          anthropic: { options: { baseURL: 'https://api.anthropic.com' } },
        },
      };

      // Act
      const result = extractProviderBaseUrls(config);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ providerId: 'anthropic', url: 'https://api.anthropic.com' });
    });

    it('skips empty string baseURLs', () => {
      // Arrange
      const config = {
        provider: {
          openai: { options: { baseURL: '' } },
        },
      };

      // Act
      const result = extractProviderBaseUrls(config);

      // Assert
      expect(result).toEqual([]);
    });

    it('handles multiple providers with multiple URL fields', () => {
      // Arrange
      const config = {
        provider: {
          openai: { options: { baseURL: 'https://api.openai.com' } },
          azure: { options: { endpoint: 'https://res.openai.azure.com' } },
        },
      };

      // Act
      const result = extractProviderBaseUrls(config);

      // Assert
      expect(result).toHaveLength(2);
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

  describe('13-6: maskAmbientSecrets', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('masks GITHUB_TOKEN when present and long enough', () => {
      // Arrange
      process.env['GITHUB_TOKEN'] = 'ghs_supersecrettoken';

      // Act
      maskAmbientSecrets();

      // Assert
      expect(mockCore.setSecret).toHaveBeenCalledWith('ghs_supersecrettoken');
    });

    it('masks INPUT_GITHUB_TOKEN when present', () => {
      // Arrange
      delete process.env['GITHUB_TOKEN'];
      process.env['INPUT_GITHUB_TOKEN'] = 'ghs_inputtoken12345';

      // Act
      maskAmbientSecrets();

      // Assert
      expect(mockCore.setSecret).toHaveBeenCalledWith('ghs_inputtoken12345');
    });

    it('skips masking when GITHUB_TOKEN is absent', () => {
      // Arrange
      delete process.env['GITHUB_TOKEN'];
      delete process.env['INPUT_GITHUB_TOKEN'];

      // Act
      maskAmbientSecrets();

      // Assert
      expect(mockCore.setSecret).not.toHaveBeenCalled();
    });

    it('skips masking short values to avoid over-masking', () => {
      // Arrange — value shorter than MIN_SECRET_LENGTH (4)
      process.env['GITHUB_TOKEN'] = 'ab';

      // Act
      maskAmbientSecrets();

      // Assert
      expect(mockCore.setSecret).not.toHaveBeenCalled();
    });

    it('does not throw when env vars are absent', () => {
      // Arrange
      delete process.env['GITHUB_TOKEN'];
      delete process.env['INPUT_GITHUB_TOKEN'];

      // Act & Assert
      expect(() => maskAmbientSecrets()).not.toThrow();
    });
  });

  describe('13-6: maskAuthValues', () => {
    it('masks string credential values in auth data', () => {
      // Arrange
      const authData = {
        anthropic: { key: 'sk-ant-supersecretkey1234' },
        openai: { key: 'sk-openai-secretkey5678' },
      };

      // Act
      maskAuthValues(authData);

      // Assert
      expect(mockCore.setSecret).toHaveBeenCalledWith('sk-ant-supersecretkey1234');
      expect(mockCore.setSecret).toHaveBeenCalledWith('sk-openai-secretkey5678');
    });

    it('skips short credential values', () => {
      // Arrange
      const authData = {
        provider: { key: 'ab' },
      };

      // Act
      maskAuthValues(authData);

      // Assert
      expect(mockCore.setSecret).not.toHaveBeenCalled();
    });

    it('does not throw on empty auth data', () => {
      // Act & Assert
      expect(() => maskAuthValues({})).not.toThrow();
    });

    it('does not throw when credential is not an object', () => {
      // Arrange — non-object credential value (defensive guard)
      const authData: Record<string, unknown> = {
        provider: 'not-an-object',
      };

      // Act & Assert
      expect(() => maskAuthValues(authData)).not.toThrow();
    });
  });
});
