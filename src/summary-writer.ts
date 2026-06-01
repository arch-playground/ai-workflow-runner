import * as core from '@actions/core';
import { scrubSecrets, truncateString } from './security.js';

const SUMMARY_FINAL_MESSAGE_LIMIT = 32_768; // 32 KB — keeps the 1 MiB step limit comfortable

interface TokenTotals {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

interface ToolCounts {
  [toolName: string]: number;
}

export interface JobSummaryMeta {
  success: boolean;
  durationMs: number;
  finalMessage: string;
  secrets: string[];
}

function aggregateMessages(messages: unknown[]): { totals: TokenTotals; toolCounts: ToolCounts } {
  const totals: TokenTotals = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };
  const toolCounts: ToolCounts = {};

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;

    const info = m['info'];
    if (info && typeof info === 'object') {
      const inf = info as Record<string, unknown>;
      if (inf['role'] === 'assistant') {
        const cost = typeof inf['cost'] === 'number' ? inf['cost'] : 0;
        totals.cost += cost;

        const tokens = inf['tokens'];
        if (tokens && typeof tokens === 'object') {
          const t = tokens as Record<string, unknown>;
          totals.input += typeof t['input'] === 'number' ? t['input'] : 0;
          totals.output += typeof t['output'] === 'number' ? t['output'] : 0;
          totals.reasoning += typeof t['reasoning'] === 'number' ? t['reasoning'] : 0;
          const cache = t['cache'];
          if (cache && typeof cache === 'object') {
            const c = cache as Record<string, unknown>;
            totals.cacheRead += typeof c['read'] === 'number' ? c['read'] : 0;
            totals.cacheWrite += typeof c['write'] === 'number' ? c['write'] : 0;
          }
        }
      }
    }

    const parts = m['parts'];
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue;
        const p = part as Record<string, unknown>;
        if (p['type'] === 'tool' && typeof p['tool'] === 'string') {
          const toolName = p['tool'];
          toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
        }
      }
    }
  }

  return { totals, toolCounts };
}

function buildToolSummaryText(toolCounts: ToolCounts): string {
  const entries = Object.entries(toolCounts);
  if (entries.length === 0) return 'No tool calls recorded.';
  return entries
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name}: ${count}`)
    .join('\n');
}

export async function writeJobSummary(messages: unknown[], meta: JobSummaryMeta): Promise<void> {
  try {
    const { success, durationMs, finalMessage, secrets } = meta;
    const { totals, toolCounts } = aggregateMessages(messages);

    const statusEmoji = success ? '✅' : '❌';
    const statusLabel = success ? 'Success' : 'Failure';

    const durationSec = (durationMs / 1000).toFixed(1);
    const costFormatted = `$${totals.cost.toFixed(6)}`;

    const tableRows = [
      [
        { data: 'Metric', header: true },
        { data: 'Value', header: true },
      ],
      [{ data: 'Status' }, { data: `${statusEmoji} ${statusLabel}` }],
      [{ data: 'Duration' }, { data: `${durationSec}s` }],
      [{ data: 'Cost' }, { data: costFormatted }],
      [{ data: 'Input tokens' }, { data: String(totals.input) }],
      [{ data: 'Output tokens' }, { data: String(totals.output) }],
      [{ data: 'Reasoning tokens' }, { data: String(totals.reasoning) }],
      [{ data: 'Cache read tokens' }, { data: String(totals.cacheRead) }],
      [{ data: 'Cache write tokens' }, { data: String(totals.cacheWrite) }],
    ];

    const scrubbed = scrubSecrets(
      truncateString(finalMessage, SUMMARY_FINAL_MESSAGE_LIMIT),
      secrets
    );

    const toolSummaryText = buildToolSummaryText(toolCounts);

    await core.summary
      .addHeading(`OpenCode Run — ${statusEmoji} ${statusLabel}`, 2)
      .addTable(tableRows)
      .addDetails('Tool activity', toolSummaryText)
      .addEOL()
      .addHeading('Final assistant message', 3)
      .addRaw(scrubbed)
      .addEOL()
      .write();
  } catch (error) {
    core.warning(`[OpenCode] Job summary write failed: ${String(error)}`, {
      title: 'Job summary',
    });
  }
}
