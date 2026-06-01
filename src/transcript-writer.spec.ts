import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeTranscript } from './transcript-writer';

jest.mock('@actions/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('writeTranscript', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes valid JSON to the specified file path', () => {
    // Arrange
    const filePath = path.join(tempDir, 'conversation.json');
    const messages = [{ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'hello' }] }];

    // Act
    writeTranscript(filePath, messages, []);

    // Assert
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(written)).toEqual(messages);
  });

  it('writes the file with mode 0o600', () => {
    // Arrange
    const filePath = path.join(tempDir, 'conversation.json');

    // Act
    writeTranscript(filePath, [], []);

    // Assert
    const stat = fs.statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('scrubs secret values from the JSON before writing', () => {
    // Arrange
    const filePath = path.join(tempDir, 'conversation.json');
    const messages = [{ text: 'my password is hunter2 here' }];

    // Act
    writeTranscript(filePath, messages, ['hunter2']);

    // Assert
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).not.toContain('hunter2');
    expect(written).toContain('***');
  });

  it('scrubs multiple secrets from the JSON', () => {
    // Arrange
    const filePath = path.join(tempDir, 'conversation.json');
    const messages = [{ text: 'token1=abc and token2=xyz used here' }];

    // Act
    writeTranscript(filePath, messages, ['abc', 'xyz']);

    // Assert
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).not.toContain('abc');
    expect(written).not.toContain('xyz');
  });

  it('does not throw on write failure — logs titled warning instead', () => {
    // Arrange: use a non-existent directory to force fs failure
    const filePath = path.join(tempDir, 'nonexistent-dir', 'conversation.json');

    // Act & Assert: must not throw
    expect(() => writeTranscript(filePath, [], [])).not.toThrow();
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Transcript write failed'),
      { title: 'Transcript export' }
    );
  });

  it('writes empty array as valid JSON', () => {
    // Arrange
    const filePath = path.join(tempDir, 'conversation.json');

    // Act
    writeTranscript(filePath, [], []);

    // Assert
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(written)).toEqual([]);
  });

  it('writes complex nested messages faithfully', () => {
    // Arrange
    const filePath = path.join(tempDir, 'conversation.json');
    const messages = [
      {
        info: { id: 'msg-1', role: 'assistant', cost: 0.01, tokens: { input: 100, output: 50 } },
        parts: [
          { type: 'text', text: 'Running analysis...' },
          {
            type: 'tool',
            tool: 'bash',
            state: { status: 'completed', input: { command: 'ls' }, output: 'file.txt' },
          },
        ],
      },
    ];

    // Act
    writeTranscript(filePath, messages, []);

    // Assert
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(written)).toEqual(messages);
  });
});
