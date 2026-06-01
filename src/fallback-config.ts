import * as fs from 'fs';
import * as path from 'path';
import type { FallbackChain, FallbackChainEntry } from './types.js';

export interface PreflightResult {
  viable: FallbackChainEntry[];
  skipped: FallbackChainEntry[];
  lookupFailed: boolean;
}

const D8_ERROR = 'fallback_config must not contain credentials; configure auth via auth_config';

const CREDENTIAL_KEYS = new Set(['auth', 'token', 'key', 'apikey', 'secret', 'credentials']);

function hasCredentialKey(entry: Record<string, unknown>): boolean {
  return Object.keys(entry).some((k) => CREDENTIAL_KEYS.has(k.toLowerCase()));
}

export function loadFallbackConfig(filePath: string): FallbackChain {
  const label = 'fallback config';
  const capitalizedLabel = 'Fallback config';
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${capitalizedLabel} file not found: ${path.basename(filePath)}`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in ${label} file: ${path.basename(filePath)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${capitalizedLabel} must be a JSON object with a "chain" array`);
  }

  const raw = parsed as Record<string, unknown>;
  const chain = raw['chain'];

  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error(`${capitalizedLabel} "chain" must be a non-empty array`);
  }

  const entries: FallbackChainEntry[] = [];

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i] as unknown;

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${capitalizedLabel} chain[${i}] must be an object`);
    }

    const entryObj = entry as Record<string, unknown>;

    if (hasCredentialKey(entryObj)) {
      throw new Error(D8_ERROR);
    }

    const provider = entryObj['provider'];
    const model = entryObj['model'];

    if (typeof provider !== 'string' || provider.trim() === '') {
      throw new Error(`${capitalizedLabel} chain[${i}].provider must be a non-empty string`);
    }

    if (typeof model !== 'string' || model.trim() === '') {
      throw new Error(`${capitalizedLabel} chain[${i}].model must be a non-empty string`);
    }

    entries.push({ provider: provider.trim(), model: model.trim() });
  }

  return { chain: entries };
}

/**
 * Filters a FallbackChain to the subset of entries whose provider is authenticated.
 *
 * @param chain - The validated fallback chain from loadFallbackConfig().
 * @param authedProviderIds - Set of authenticated provider ids from OpenCodeService.getAuthenticatedProviderIds().
 *   Pass null when the lookup failed — all entries are treated as viable (AC4 graceful degradation).
 * @returns A PreflightResult with viable entries, skipped entries, and a lookupFailed flag.
 *   The CALLER is responsible for logging core.warning per skipped entry.
 */
export function preflightFallbackChain(
  chain: FallbackChain,
  authedProviderIds: Set<string> | null
): PreflightResult {
  if (authedProviderIds === null) {
    return { viable: [...chain.chain], skipped: [], lookupFailed: true };
  }

  const viable: FallbackChainEntry[] = [];
  const skipped: FallbackChainEntry[] = [];

  for (const entry of chain.chain) {
    if (authedProviderIds.has(entry.provider)) {
      viable.push(entry);
    } else {
      skipped.push(entry);
    }
  }

  return { viable, skipped, lookupFailed: false };
}
