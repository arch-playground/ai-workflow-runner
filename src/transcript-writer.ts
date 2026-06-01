import * as fs from 'fs';
import * as core from '@actions/core';
import { scrubSecrets } from './security.js';

/**
 * Serializes the messages array to JSON, scrubs secret values, and writes to disk at 0o600.
 * Best-effort: logs a titled warning on failure but never throws.
 */
export function writeTranscript(filePath: string, messages: unknown[], secrets: string[]): void {
  try {
    const json = JSON.stringify(messages, null, 2);
    const scrubbed = scrubSecrets(json, secrets);
    fs.writeFileSync(filePath, scrubbed, { mode: 0o600 });
  } catch (error) {
    core.warning(`[OpenCode] Transcript write failed: ${String(error)}`, {
      title: 'Transcript export',
    });
  }
}
