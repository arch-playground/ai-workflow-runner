import * as core from '@actions/core';
import { writeJobSummary } from './summary-writer';

jest.mock('@actions/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('writeJobSummary', () => {
  const baseMeta = {
    success: true,
    durationMs: 5000,
    finalMessage: 'Task completed successfully.',
    secrets: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset summary mock chain — summaryObject methods return `this`
    const s = mockCore.summary as jest.Mocked<typeof mockCore.summary>;
    s.addHeading.mockReturnValue(s);
    s.addTable.mockReturnValue(s);
    s.addRaw.mockReturnValue(s);
    s.addDetails.mockReturnValue(s);
    s.addEOL.mockReturnValue(s);
    s.addBreak.mockReturnValue(s);
    s.write.mockResolvedValue(undefined as never);
  });

  it('9-4-AC1: calls core.summary chain and write() on success', async () => {
    // Arrange
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0.01,
          tokens: { input: 100, output: 50, reasoning: 5, cache: { read: 10, write: 2 } },
        },
        parts: [],
      },
    ];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert
    expect(mockCore.summary.addHeading).toHaveBeenCalled();
    expect(mockCore.summary.addTable).toHaveBeenCalled();
    expect(mockCore.summary.write).toHaveBeenCalledTimes(1);
  });

  it('9-4-AC2: aggregates token and cost totals from assistant messages', async () => {
    // Arrange
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0.01,
          tokens: { input: 100, output: 50, reasoning: 5, cache: { read: 10, write: 2 } },
        },
        parts: [],
      },
      {
        info: {
          role: 'assistant',
          cost: 0.02,
          tokens: { input: 200, output: 80, reasoning: 10, cache: { read: 20, write: 4 } },
        },
        parts: [],
      },
      {
        info: { role: 'user' },
        parts: [],
      },
    ];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert: addTable called with rows containing summed values
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const costRow = rows.find((r) => r[0]?.data === 'Cost');
    expect(costRow?.[1]?.data).toBe('$0.030000');
    const inputRow = rows.find((r) => r[0]?.data === 'Input tokens');
    expect(inputRow?.[1]?.data).toBe('300');
    const outputRow = rows.find((r) => r[0]?.data === 'Output tokens');
    expect(outputRow?.[1]?.data).toBe('130');
    const reasoningRow = rows.find((r) => r[0]?.data === 'Reasoning tokens');
    expect(reasoningRow?.[1]?.data).toBe('15');
    const cacheReadRow = rows.find((r) => r[0]?.data === 'Cache read tokens');
    expect(cacheReadRow?.[1]?.data).toBe('30');
    const cacheWriteRow = rows.find((r) => r[0]?.data === 'Cache write tokens');
    expect(cacheWriteRow?.[1]?.data).toBe('6');
  });

  it('9-4-AC2: treats missing token/cost fields as 0', async () => {
    // Arrange
    const messages = [{ info: { role: 'assistant' }, parts: [] }];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert: no errors, totals default to 0
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const costRow = rows.find((r) => r[0]?.data === 'Cost');
    expect(costRow?.[1]?.data).toBe('$0.000000');
    const inputRow = rows.find((r) => r[0]?.data === 'Input tokens');
    expect(inputRow?.[1]?.data).toBe('0');
  });

  it('9-4-AC3: includes per-tool counts in addDetails', async () => {
    // Arrange
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        parts: [
          { type: 'tool', tool: 'bash', state: { status: 'completed' } },
          { type: 'tool', tool: 'bash', state: { status: 'completed' } },
          { type: 'tool', tool: 'read', state: { status: 'completed' } },
          { type: 'text', text: 'some text' },
        ],
      },
    ];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Tool activity',
      expect.stringContaining('bash: 2')
    );
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Tool activity',
      expect.stringContaining('read: 1')
    );
  });

  it('9-4-AC5: scrubs secrets from the final message before writing', async () => {
    // Arrange
    const messages: unknown[] = [];
    const meta = {
      ...baseMeta,
      finalMessage: 'The token is my_secret_token here',
      secrets: ['my_secret_token'],
    };

    // Act
    await writeJobSummary(messages, meta);

    // Assert
    expect(mockCore.summary.addRaw).toHaveBeenCalledWith(expect.stringContaining('***'));
    expect(mockCore.summary.addRaw).not.toHaveBeenCalledWith(
      expect.stringContaining('my_secret_token')
    );
  });

  it('9-4-AC6: truncates huge final message to stay under 1 MiB limit', async () => {
    // Arrange
    const messages: unknown[] = [];
    const hugeMessage = 'x'.repeat(100_000);
    const meta = { ...baseMeta, finalMessage: hugeMessage };

    // Act
    await writeJobSummary(messages, meta);

    // Assert: addRaw receives a truncated string
    const rawCall = (mockCore.summary.addRaw as jest.Mock).mock.calls[0] as string[];
    const writtenText = rawCall[0] ?? '';
    expect(writtenText.length).toBeLessThan(hugeMessage.length);
    expect(writtenText).toContain('...[truncated]');
  });

  it('9-4-AC6: does not throw when core.summary.write() rejects', async () => {
    // Arrange
    const s = mockCore.summary as jest.Mocked<typeof mockCore.summary>;
    s.write.mockRejectedValueOnce(new Error('GITHUB_STEP_SUMMARY not set') as never);

    // Act & Assert: must not throw
    await expect(writeJobSummary([], baseMeta)).resolves.toBeUndefined();
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Job summary write failed'),
      { title: 'Job summary' }
    );
  });

  it('emits ❌ status heading for failure runs', async () => {
    // Arrange
    const meta = { ...baseMeta, success: false };

    // Act
    await writeJobSummary([], meta);

    // Assert
    expect(mockCore.summary.addHeading).toHaveBeenCalledWith(
      expect.stringContaining('❌'),
      expect.any(Number)
    );
  });

  it('handles empty messages array without error', async () => {
    // Act & Assert
    await expect(writeJobSummary([], baseMeta)).resolves.toBeUndefined();
    expect(mockCore.summary.write).toHaveBeenCalledTimes(1);
  });

  it('9.7-AC6: skips null/non-object entries in messages array (lines 38-42)', async () => {
    // Arrange — mixed messages array with null, primitive, and valid entries
    const messages = [
      null,
      'string entry',
      42,
      { info: { role: 'assistant', cost: 0.005, tokens: { input: 50, output: 25 } }, parts: [] },
    ];

    // Act
    await writeJobSummary(messages as unknown[], baseMeta);

    // Assert — only the valid assistant message is aggregated
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const costRow = rows.find((r) => r[0]?.data === 'Cost');
    expect(costRow?.[1]?.data).toBe('$0.005000');
    const inputRow = rows.find((r) => r[0]?.data === 'Input tokens');
    expect(inputRow?.[1]?.data).toBe('50');
  });

  it('9.7-AC6: handles assistant message with missing tokens object (lines 51-67)', async () => {
    // Arrange — tokens field absent → all token totals default to 0
    const messages = [{ info: { role: 'assistant', cost: 0.002 }, parts: [] }];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const inputRow = rows.find((r) => r[0]?.data === 'Input tokens');
    expect(inputRow?.[1]?.data).toBe('0');
    const costRow = rows.find((r) => r[0]?.data === 'Cost');
    expect(costRow?.[1]?.data).toBe('$0.002000');
  });

  it('9.7-AC6: handles non-object tokens value gracefully (lines 51-67)', async () => {
    // Arrange — tokens is a string (non-object) → tokens default to 0
    const messages = [{ info: { role: 'assistant', cost: 0, tokens: 'invalid' }, parts: [] }];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert — no throw, tokens default to 0
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const inputRow = rows.find((r) => r[0]?.data === 'Input tokens');
    expect(inputRow?.[1]?.data).toBe('0');
  });

  it('9.7-AC6: handles missing cache object inside tokens (lines 54-59)', async () => {
    // Arrange — cache field absent → cacheRead/cacheWrite default to 0
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0,
          tokens: { input: 10, output: 5, reasoning: 0 }, // no cache key
        },
        parts: [],
      },
    ];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert — no throw, cache totals are 0
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const cacheReadRow = rows.find((r) => r[0]?.data === 'Cache read tokens');
    expect(cacheReadRow?.[1]?.data).toBe('0');
    const cacheWriteRow = rows.find((r) => r[0]?.data === 'Cache write tokens');
    expect(cacheWriteRow?.[1]?.data).toBe('0');
  });

  it('9.7-AC6: handles non-object cache value gracefully (lines 54-59)', async () => {
    // Arrange — cache is a string (non-object) → cacheRead/cacheWrite default to 0
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0,
          tokens: { input: 10, output: 5, reasoning: 0, cache: 'invalid' },
        },
        parts: [],
      },
    ];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const cacheReadRow = rows.find((r) => r[0]?.data === 'Cache read tokens');
    expect(cacheReadRow?.[1]?.data).toBe('0');
  });

  it('9.7-AC6: skips non-object parts entries (line 67)', async () => {
    // Arrange — parts contains a null entry
    const messages = [
      {
        info: { role: 'assistant', cost: 0 },
        parts: [null, { type: 'tool', tool: 'bash' }],
      },
    ];

    // Act
    await writeJobSummary(messages as unknown[], baseMeta);

    // Assert — only valid tool part counted
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Tool activity',
      expect.stringContaining('bash: 1')
    );
  });

  it('9.7-AC6: skips message with no info field (line 42 false branch)', async () => {
    // Arrange — message has no info key at all → should not crash and contributes 0 to totals
    const messages = [{ parts: [{ type: 'tool', tool: 'bash' }] }];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert — writes fine, bash tool is counted, cost defaults to 0
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Tool activity',
      expect.stringContaining('bash: 1')
    );
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const costRow = rows.find((r) => r[0]?.data === 'Cost');
    expect(costRow?.[1]?.data).toBe('$0.000000');
  });

  it('9.7-AC6: skips parts when parts is not an array (line 65 false branch)', async () => {
    // Arrange — parts is a non-array value → Array.isArray returns false, skipped
    const messages = [{ info: { role: 'assistant', cost: 0 }, parts: 'not-an-array' }];

    // Act
    await writeJobSummary(messages as unknown[], baseMeta);

    // Assert — writes fine, no tools counted
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Tool activity',
      'No tool calls recorded.'
    );
  });

  it('9.7-AC6: handles non-number token field values via ternary else branches (lines 51-52)', async () => {
    // Arrange — token sub-fields are strings (non-number) → ternary else arm hit → defaults to 0
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0.001,
          tokens: {
            input: 'not-a-number',
            output: null,
            reasoning: undefined,
            cache: { read: 'x', write: false },
          },
        },
        parts: [],
      },
    ];

    // Act
    await writeJobSummary(messages as unknown[], baseMeta);

    // Assert — all non-number fields default to 0; no throw
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const inputRow = rows.find((r) => r[0]?.data === 'Input tokens');
    expect(inputRow?.[1]?.data).toBe('0');
    const outputRow = rows.find((r) => r[0]?.data === 'Output tokens');
    expect(outputRow?.[1]?.data).toBe('0');
    const reasoningRow = rows.find((r) => r[0]?.data === 'Reasoning tokens');
    expect(reasoningRow?.[1]?.data).toBe('0');
    const cacheReadRow = rows.find((r) => r[0]?.data === 'Cache read tokens');
    expect(cacheReadRow?.[1]?.data).toBe('0');
    const cacheWriteRow = rows.find((r) => r[0]?.data === 'Cache write tokens');
    expect(cacheWriteRow?.[1]?.data).toBe('0');
  });

  it('shows "No tool calls recorded." when no tools used', async () => {
    // Arrange
    const messages = [
      {
        info: {
          role: 'assistant',
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        parts: [],
      },
    ];

    // Act
    await writeJobSummary(messages, baseMeta);

    // Assert
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Tool activity',
      'No tool calls recorded.'
    );
  });

  it('9-4-AC1: includes duration in the table', async () => {
    // Arrange
    const meta = { ...baseMeta, durationMs: 12_500 };

    // Act
    await writeJobSummary([], meta);

    // Assert
    const tableCall = (mockCore.summary.addTable as jest.Mock).mock.calls[0] as unknown[][];
    const rows = tableCall[0] as Array<Array<{ data: string }>>;
    const durationRow = rows.find((r) => r[0]?.data === 'Duration');
    expect(durationRow?.[1]?.data).toBe('12.5s');
  });
});
