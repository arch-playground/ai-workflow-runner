import * as core from '@actions/core';

interface TokenData {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

interface PerModelMetrics {
  modelId: string;
  tokens: { input: number; output: number; reasoning: number };
  cache: { read: number; write: number };
  cost: number;
  messageCount: number;
}

export interface TokenSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
  perModel: Record<string, PerModelMetrics>;
}

export class TokenTracker {
  private trackedMessageIds = new Set<string>();
  private perModel: Record<string, PerModelMetrics> = {};
  private totals: TokenSummary = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalCost: 0,
    perModel: {},
  };

  trackMessage(message: Record<string, unknown>): void {
    const id = message.id as string | undefined;
    if (id && this.trackedMessageIds.has(id)) return;
    if (id) this.trackedMessageIds.add(id);

    const tokens = message.tokens as Partial<TokenData> | undefined;
    const cost = (message.cost as number) || 0;
    const model = message.model as { providerID: string; modelID: string } | undefined;

    if (!tokens) {
      core.warning(`[TokenTracker] Message ${id || 'unknown'} has missing token data`);
      return;
    }

    const input = tokens.input || 0;
    const output = tokens.output || 0;
    const reasoning = tokens.reasoning || 0;
    const cacheRead = tokens.cache?.read || 0;
    const cacheWrite = tokens.cache?.write || 0;

    this.totals.inputTokens += input;
    this.totals.outputTokens += output;
    this.totals.reasoningTokens += reasoning;
    this.totals.cacheReadTokens += cacheRead;
    this.totals.cacheWriteTokens += cacheWrite;
    this.totals.totalTokens += input + output + reasoning;
    this.totals.totalCost += cost;

    const modelId = model?.modelID || 'unknown';
    if (!this.perModel[modelId]) {
      this.perModel[modelId] = {
        modelId,
        tokens: { input: 0, output: 0, reasoning: 0 },
        cache: { read: 0, write: 0 },
        cost: 0,
        messageCount: 0,
      };
    }

    const m = this.perModel[modelId];
    m.tokens.input += input;
    m.tokens.output += output;
    m.tokens.reasoning += reasoning;
    m.cache.read += cacheRead;
    m.cache.write += cacheWrite;
    m.cost += cost;
    m.messageCount += 1;
  }

  getSummary(): TokenSummary {
    return { ...this.totals, perModel: { ...this.perModel } };
  }

  formatLogTable(): string {
    const models = Object.values(this.perModel);
    if (models.length === 0) return 'No token data collected.';

    const fmt = (n: number): string => n.toLocaleString('en-US');
    const fmtCost = (n: number): string => `$${n.toFixed(4)}`;

    const header = '| Model | Input | Output | Reasoning | Cache Read | Cache Write | Cost |';
    const separator = '|---|---|---|---|---|---|---|';
    const rows = models.map(
      (m) =>
        `| ${m.modelId} | ${fmt(m.tokens.input)} | ${fmt(m.tokens.output)} | ${fmt(m.tokens.reasoning)} | ${fmt(m.cache.read)} | ${fmt(m.cache.write)} | ${fmtCost(m.cost)} |`
    );
    const totalRow = `| **Total** | ${fmt(this.totals.inputTokens)} | ${fmt(this.totals.outputTokens)} | ${fmt(this.totals.reasoningTokens)} | ${fmt(this.totals.cacheReadTokens)} | ${fmt(this.totals.cacheWriteTokens)} | ${fmtCost(this.totals.totalCost)} |`;
    return [header, separator, ...rows, separator, totalRow].join('\n');
  }

  setActionOutputs(): void {
    const summary = this.getSummary();
    core.setOutput('total_tokens', summary.totalTokens);
    core.setOutput('input_tokens', summary.inputTokens);
    core.setOutput('output_tokens', summary.outputTokens);
    core.setOutput('reasoning_tokens', summary.reasoningTokens);
    core.setOutput('cache_read_tokens', summary.cacheReadTokens);
    core.setOutput('cache_write_tokens', summary.cacheWriteTokens);
    core.setOutput('total_cost', summary.totalCost.toFixed(4));
    core.setOutput('cost_breakdown', JSON.stringify(summary.perModel));
  }

  emitLogs(): void {
    core.startGroup('Token Usage Summary');
    core.info(this.formatLogTable());
    core.endGroup();
  }
}
