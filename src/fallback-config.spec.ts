import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadFallbackConfig, preflightFallbackChain } from './fallback-config.js';
import type { FallbackChain } from './types.js';

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

    it('11-6-gap: re-throws non-ENOENT file read errors (e.g. permission denied)', () => {
      // Arrange — use a directory path (read throws EISDIR, not ENOENT)
      const dirPath = tempDir; // reading a dir as file throws non-ENOENT error

      // Act & Assert — should re-throw the underlying error, not ENOENT message
      expect(() => loadFallbackConfig(dirPath)).toThrow();
    });

    it('11-6-gap: throws when JSON top-level value is not an object (e.g. array)', () => {
      // Arrange
      const filePath = path.join(tempDir, 'array.json');
      fs.writeFileSync(filePath, JSON.stringify([{ provider: 'p0', model: 'm0' }]));

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(
        /must be a JSON object with a "chain" array/
      );
    });

    it('11-6-gap: throws when JSON top-level value is null', () => {
      // Arrange
      const filePath = path.join(tempDir, 'null.json');
      fs.writeFileSync(filePath, 'null');

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/must be a JSON object/);
    });

    it('11-6-gap: throws when chain entry is not an object (e.g. a string)', () => {
      // Arrange
      const filePath = path.join(tempDir, 'bad-entry.json');
      fs.writeFileSync(filePath, JSON.stringify({ chain: ['not-an-object'] }));

      // Act & Assert
      expect(() => loadFallbackConfig(filePath)).toThrow(/chain\[0\] must be an object/);
    });
  });
});

describe('preflightFallbackChain', () => {
  const chain: FallbackChain = {
    chain: [
      { provider: 'github-copilot', model: 'github-copilot/gpt-5' },
      { provider: 'anthropic', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
    ],
  };

  it('11-2-AC1: returns only authenticated entries (viable subset)', () => {
    // Arrange
    const authed = new Set(['github-copilot', 'anthropic']);

    // Act
    const result = preflightFallbackChain(chain, authed);

    // Assert
    expect(result.viable).toHaveLength(2);
    expect(result.viable[0]).toEqual({ provider: 'github-copilot', model: 'github-copilot/gpt-5' });
    expect(result.viable[1]).toEqual({ provider: 'anthropic', model: 'claude-3-opus' });
    expect(result.lookupFailed).toBe(false);
  });

  it('11-2-AC2: unauthenticated entries appear in skipped list', () => {
    // Arrange — only anthropic authed; copilot + openai skipped
    const authed = new Set(['anthropic']);

    // Act
    const result = preflightFallbackChain(chain, authed);

    // Assert
    expect(result.viable).toHaveLength(1);
    expect(result.viable[0]).toMatchObject({ provider: 'anthropic' });
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0]).toMatchObject({ provider: 'github-copilot' });
    expect(result.skipped[1]).toMatchObject({ provider: 'openai' });
    expect(result.lookupFailed).toBe(false);
  });

  it('11-2-AC3: all entries unauthenticated → empty viable list', () => {
    // Arrange — no providers authed
    const authed = new Set<string>();

    // Act
    const result = preflightFallbackChain(chain, authed);

    // Assert
    expect(result.viable).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    expect(result.lookupFailed).toBe(false);
  });

  it('11-2-AC4: lookup failed (null) → all entries treated viable', () => {
    // Arrange — null signals v2 call failed; must not strand the run
    const authedProviderIds = null;

    // Act
    const result = preflightFallbackChain(chain, authedProviderIds);

    // Assert — all 3 entries viable; no skipped; lookupFailed flag set
    expect(result.viable).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.lookupFailed).toBe(true);
  });

  it('11-2-AC1: all entries authenticated → all viable', () => {
    // Arrange
    const authed = new Set(['github-copilot', 'anthropic', 'openai']);

    // Act
    const result = preflightFallbackChain(chain, authed);

    // Assert
    expect(result.viable).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.lookupFailed).toBe(false);
  });

  it('11-2-AC1: preserves original chain order in viable list', () => {
    // Arrange — all authed
    const authed = new Set(['github-copilot', 'anthropic', 'openai', 'extra-provider']);

    // Act
    const result = preflightFallbackChain(chain, authed);

    // Assert — order preserved: copilot, anthropic, openai
    expect(result.viable.map((e) => e.provider)).toEqual(['github-copilot', 'anthropic', 'openai']);
  });
});
