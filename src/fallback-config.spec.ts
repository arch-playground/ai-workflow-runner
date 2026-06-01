import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadFallbackConfig } from './fallback-config.js';

describe('loadFallbackConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeJson(filename: string, content: unknown): string {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(content));
    return filePath;
  }

  describe('valid chain', () => {
    it('11-1-AC3: parses a valid single-entry chain', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'anthropic', model: 'claude-3-opus' }],
      });

      // Act
      const result = loadFallbackConfig(filePath);

      // Assert
      expect(result).toEqual({
        chain: [{ provider: 'anthropic', model: 'claude-3-opus' }],
      });
    });

    it('11-1-AC3: parses a multi-entry chain in order', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [
          { provider: 'github-copilot', model: 'github-copilot/gpt-5' },
          { provider: 'anthropic', model: 'claude-3-opus' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
      });

      // Act
      const result = loadFallbackConfig(filePath);

      // Assert
      expect(result.chain).toHaveLength(3);
      expect(result.chain[0]).toEqual({
        provider: 'github-copilot',
        model: 'github-copilot/gpt-5',
      });
      expect(result.chain[1]).toEqual({ provider: 'anthropic', model: 'claude-3-opus' });
      expect(result.chain[2]).toEqual({ provider: 'openai', model: 'gpt-4o' });
    });

    it('11-1-AC3: trims whitespace from provider and model strings', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: '  anthropic  ', model: '  claude-3-opus  ' }],
      });

      // Act
      const result = loadFallbackConfig(filePath);

      // Assert
      expect(result.chain[0]).toEqual({ provider: 'anthropic', model: 'claude-3-opus' });
    });
  });

  describe('D8 — credential key enforcement (AC4)', () => {
    const D8_ERROR = 'fallback_config must not contain credentials; configure auth via auth_config';

    it('11-1-AC4: rejects entry with "auth" key', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'anthropic', model: 'claude-3-opus', auth: 'bearer-token' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });

    it('11-1-AC4: rejects entry with "token" key', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'anthropic', model: 'claude-3-opus', token: 'sk-abc123' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });

    it('11-1-AC4: rejects entry with "key" key', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'openai', model: 'gpt-4o', key: 'sk-openai-abc' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });

    it('11-1-AC4: rejects entry with "apiKey" key (case-insensitive)', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-openai-abc' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });

    it('11-1-AC4: rejects entry with "secret" key', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'anthropic', model: 'claude-3-opus', secret: 'my-secret' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });

    it('11-1-AC4: rejects entry with "credentials" key', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [
          {
            provider: 'anthropic',
            model: 'claude-3-opus',
            credentials: { apiKey: 'sk-abc' },
          },
        ],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });

    it('11-1-AC4: credential check is case-insensitive (APIKEY → rejected)', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'openai', model: 'gpt-4o', APIKEY: 'sk-abc' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(D8_ERROR);
    });
  });

  describe('structural validation errors (AC5)', () => {
    it('11-1-AC5: throws when chain is an empty array', () => {
      // Arrange
      const filePath = writeJson('fallback.json', { chain: [] });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/"chain" must be a non-empty array/);
    });

    it('11-1-AC5: throws when chain is missing (no chain key)', () => {
      // Arrange
      const filePath = writeJson('fallback.json', { providers: [] });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/"chain" must be a non-empty array/);
    });

    it('11-1-AC5: throws when chain is not an array', () => {
      // Arrange
      const filePath = writeJson('fallback.json', { chain: 'anthropic/claude' });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/"chain" must be a non-empty array/);
    });

    it('11-1-AC5: throws when entry is missing provider', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ model: 'claude-3-opus' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/provider must be a non-empty string/);
    });

    it('11-1-AC5: throws when entry is missing model', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'anthropic' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/model must be a non-empty string/);
    });

    it('11-1-AC5: throws when provider is empty string', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: '', model: 'claude-3-opus' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/provider must be a non-empty string/);
    });

    it('11-1-AC5: throws when model is empty string', () => {
      // Arrange
      const filePath = writeJson('fallback.json', {
        chain: [{ provider: 'anthropic', model: '' }],
      });

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/model must be a non-empty string/);
    });
  });

  describe('file I/O errors', () => {
    it('11-1-AC5: throws with clear message when file not found', () => {
      // Arrange
      const filePath = path.join(tempDir, 'nonexistent.json');

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/file not found: nonexistent\.json/);
    });

    it('11-1-AC5: throws with clear message for invalid JSON', () => {
      // Arrange
      const filePath = path.join(tempDir, 'bad.json');
      fs.writeFileSync(filePath, '{ not valid json }');

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/Invalid JSON in fallback config file/);
    });
  });
});
