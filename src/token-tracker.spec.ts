import * as core from '@actions/core';
import { TokenTracker } from './token-tracker';

jest.mock('@actions/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new TokenTracker();
  });

  describe('trackMessage', () => {
    it('accumulates tokens from a single message', () => {
      const message = {
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'claude-opus-4-6' },
        cost: 0.45,
        tokens: {
          input: 45000,
          output: 12000,
          reasoning: 8000,
          cache: { read: 10000, write: 2800 },
        },
      };
      tracker.trackMessage(message);
      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(45000 + 12000 + 8000);
      expect(summary.inputTokens).toBe(45000);
      expect(summary.outputTokens).toBe(12000);
      expect(summary.reasoningTokens).toBe(8000);
      expect(summary.cacheReadTokens).toBe(10000);
      expect(summary.cacheWriteTokens).toBe(2800);
      expect(summary.totalCost).toBeCloseTo(0.45);
    });

    it('accumulates tokens from multiple messages across models', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'claude-opus-4-6' },
        cost: 0.45,
        tokens: {
          input: 45000,
          output: 12000,
          reasoning: 8000,
          cache: { read: 10000, write: 2800 },
        },
      });
      tracker.trackMessage({
        id: 'msg-2',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'claude-haiku-4-5' },
        cost: 0.01,
        tokens: { input: 8000, output: 2400, reasoning: 0, cache: { read: 2200, write: 400 } },
      });
      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(45000 + 12000 + 8000 + 8000 + 2400);
      expect(summary.totalCost).toBeCloseTo(0.46);
      expect(Object.keys(summary.perModel)).toHaveLength(2);
      expect(summary.perModel['claude-opus-4-6']!.messageCount).toBe(1);
      expect(summary.perModel['claude-haiku-4-5']!.messageCount).toBe(1);
    });

    it('handles messages with missing tokens gracefully', () => {
      tracker.trackMessage({ id: 'msg-1', role: 'assistant' });
      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('missing token data'));
    });

    it('skips duplicate message IDs', () => {
      const msg = {
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      };
      tracker.trackMessage(msg);
      tracker.trackMessage(msg);
      expect(tracker.getSummary().inputTokens).toBe(1000);
    });

    it('handles message with tokens but missing cache sub-object', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0 },
      });
      const summary = tracker.getSummary();
      expect(summary.cacheReadTokens).toBe(0);
      expect(summary.cacheWriteTokens).toBe(0);
      expect(summary.inputTokens).toBe(1000);
    });

    it('handles message with no model field', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      });
      const summary = tracker.getSummary();
      expect(summary.perModel['unknown']).toBeDefined();
      expect(summary.perModel['unknown']!.messageCount).toBe(1);
    });

    it('handles message with zero values for all token fields', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      });
      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(summary.perModel['opus']!.messageCount).toBe(1);
    });

    it('tracks messages without id field (no dedup possible)', () => {
      const message = {
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      };
      tracker.trackMessage(message);
      tracker.trackMessage(message);
      expect(tracker.getSummary().inputTokens).toBe(2000);
    });
  });

  describe('getSummary', () => {
    it('returns zero summary when no messages tracked', () => {
      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(Object.keys(summary.perModel)).toHaveLength(0);
    });
  });

  describe('formatLogTable', () => {
    it('formats table with single model data', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'claude-opus-4-6' },
        cost: 0.45,
        tokens: {
          input: 45200,
          output: 12300,
          reasoning: 8000,
          cache: { read: 10200, write: 2800 },
        },
      });
      const table = tracker.formatLogTable();
      expect(table).toContain('claude-opus-4-6');
      expect(table).toContain('45,200');
      expect(table).toContain('$0.4500');
    });

    it('formats table with multiple models and totals row', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.45,
        tokens: {
          input: 45000,
          output: 12000,
          reasoning: 8000,
          cache: { read: 10000, write: 2800 },
        },
      });
      tracker.trackMessage({
        id: 'msg-2',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'haiku' },
        cost: 0.01,
        tokens: { input: 8000, output: 2400, reasoning: 0, cache: { read: 2200, write: 400 } },
      });
      const table = tracker.formatLogTable();
      expect(table).toContain('Total');
      expect(table).toContain('opus');
      expect(table).toContain('haiku');
    });

    it('returns no-data message when tracker is empty', () => {
      expect(tracker.formatLogTable()).toBe('No token data collected.');
    });
  });

  describe('setActionOutputs', () => {
    it('sets all action outputs correctly', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.45,
        tokens: {
          input: 45000,
          output: 12000,
          reasoning: 8000,
          cache: { read: 10000, write: 2800 },
        },
      });
      tracker.setActionOutputs();
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_tokens', 65000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('input_tokens', 45000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('output_tokens', 12000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('reasoning_tokens', 8000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache_read_tokens', 10000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache_write_tokens', 2800);
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_cost', '0.4500');
    });

    it('sets cost_breakdown as valid JSON', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.45,
        tokens: {
          input: 45000,
          output: 12000,
          reasoning: 8000,
          cache: { read: 10000, write: 2800 },
        },
      });
      tracker.setActionOutputs();
      const costBreakdownCall = mockCore.setOutput.mock.calls.find(
        (call) => call[0] === 'cost_breakdown'
      );
      expect(costBreakdownCall).toBeDefined();
      const parsed = JSON.parse(costBreakdownCall![1] as string);
      expect(parsed.opus).toBeDefined();
      expect(parsed.opus.cost).toBeCloseTo(0.45);
    });
  });

  describe('emitLogs', () => {
    it('wraps output in GitHub Actions log group with table content', () => {
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      });
      tracker.emitLogs();
      expect(mockCore.startGroup).toHaveBeenCalledWith('Token Usage Summary');
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('opus'));
      expect(mockCore.endGroup).toHaveBeenCalled();
    });
  });
});
