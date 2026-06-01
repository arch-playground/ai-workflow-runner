import type { ModelListItem } from './types.js';

/**
 * Returns true when a model is safe to remove under disable_free_models:
 * - cost is known and both input and output are 0 (free-tier hosted)
 * - provider is NOT account-authenticated (enabledVia !== 'account')
 * - provider id is NOT in the optional subscriptionProviders override (10-5 hook)
 *
 * Design decisions D4 + D7: cache cost is ignored; enabledVia is the discriminator
 * for paid subscriptions that report cost 0 (e.g. GitHub Copilot).
 */
export function isFilterableFree(
  model: ModelListItem,
  subscriptionProviders?: ReadonlySet<string>
): boolean {
  const { cost, enabledVia, providerId } = model;

  if (cost === undefined) return false;
  if (cost.input !== 0 || cost.output !== 0) return false;
  if (enabledVia === 'account') return false;
  if (subscriptionProviders?.has(providerId)) return false;

  return true;
}
