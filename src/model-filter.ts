import type { ModelListItem } from './types.js';

export type PricingCategory = 'free' | 'subscription' | 'paid' | 'unknown';

/**
 * Classifies a model's pricing into one of four categories:
 * - 'unknown': cost is absent (local/Ollama — pricing unknown)
 * - 'subscription': cost 0 AND provider is account-authenticated or in the override set (e.g. Copilot)
 * - 'free': cost 0 AND not a subscription (genuinely free-tier hosted model)
 * - 'paid': non-zero cost
 *
 * Invariant (no-override case): isFilterableFree(m) === (classifyPricing(m) === 'free').
 */
export function classifyPricing(
  model: ModelListItem,
  subscriptionProviders?: ReadonlySet<string>
): PricingCategory {
  const { cost, enabledVia, providerId } = model;

  if (cost === undefined) return 'unknown';
  if (cost.input !== 0 || cost.output !== 0) return 'paid';
  if (enabledVia === 'account' || subscriptionProviders?.has(providerId)) return 'subscription';
  return 'free';
}

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
  return classifyPricing(model, subscriptionProviders) === 'free';
}
