import { isFilterableFree, classifyPricing } from './model-filter.js';
import type { ModelListItem } from './types.js';

function makeModel(overrides: Partial<ModelListItem>): ModelListItem {
  return {
    id: 'test-model',
    name: 'Test Model',
    provider: 'Test Provider',
    providerId: 'test-provider',
    ...overrides,
  };
}

describe('isFilterableFree', () => {
  describe('returns true (filterable free)', () => {
    it('AC1: cost 0 and enabledVia undefined (public free-tier provider)', () => {
      // Arrange
      const model = makeModel({ cost: { input: 0, output: 0 }, enabledVia: undefined });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(true);
    });

    it('AC1: cost 0 and enabledVia "env" (env-configured provider)', () => {
      // Arrange
      const model = makeModel({ cost: { input: 0, output: 0 }, enabledVia: 'env' });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(true);
    });

    it('AC1: cost 0 and enabledVia "custom"', () => {
      // Arrange
      const model = makeModel({ cost: { input: 0, output: 0 }, enabledVia: 'custom' });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(true);
    });

    it('AC5: cache cost irrelevant — only input/output matter (documented semantics)', () => {
      // Arrange — ModelListItem.cost only has {input, output}; no cache field by design
      const model = makeModel({ cost: { input: 0, output: 0 }, enabledVia: undefined });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('returns false (keep model)', () => {
    it('AC2: Copilot-like — cost 0 but enabledVia "account" (paid subscription)', () => {
      // Arrange — mirrors real GitHub Copilot: 21 models, cost 0, account-authed
      const model = makeModel({
        providerId: 'github-copilot',
        cost: { input: 0, output: 0 },
        enabledVia: 'account',
      });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(false);
    });

    it('AC3: cost undefined (local/Ollama provider — unknown pricing)', () => {
      // Arrange
      const model = makeModel({ cost: undefined, enabledVia: undefined });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(false);
    });

    it('AC4: non-zero cost.input', () => {
      // Arrange
      const model = makeModel({ cost: { input: 0.5, output: 0 }, enabledVia: undefined });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(false);
    });

    it('AC4: non-zero cost.output', () => {
      // Arrange
      const model = makeModel({ cost: { input: 0, output: 1.5 }, enabledVia: undefined });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(false);
    });

    it('AC4: both cost.input and cost.output non-zero', () => {
      // Arrange — paid model like Anthropic Claude
      const model = makeModel({ cost: { input: 3, output: 15 }, enabledVia: 'account' });

      // Act
      const result = isFilterableFree(model);

      // Assert
      expect(result).toBe(false);
    });

    it('AC6: subscriptionProviders override contains providerId — treated as subscription', () => {
      // Arrange — provider not account-authed but is in subscription override set (10-5 hook)
      const model = makeModel({
        providerId: 'openrouter',
        cost: { input: 0, output: 0 },
        enabledVia: undefined,
      });
      const subscriptionProviders = new Set(['openrouter']);

      // Act
      const result = isFilterableFree(model, subscriptionProviders);

      // Assert
      expect(result).toBe(false);
    });

    it('AC6: subscriptionProviders override does NOT affect unrelated providers', () => {
      // Arrange
      const model = makeModel({
        providerId: 'opencode-zen',
        cost: { input: 0, output: 0 },
        enabledVia: undefined,
      });
      const subscriptionProviders = new Set(['openrouter']);

      // Act
      const result = isFilterableFree(model, subscriptionProviders);

      // Assert
      expect(result).toBe(true);
    });

    it('AC6: empty subscriptionProviders set has no effect (default empty behaviour)', () => {
      // Arrange
      const model = makeModel({ cost: { input: 0, output: 0 }, enabledVia: undefined });
      const subscriptionProviders = new Set<string>();

      // Act
      const result = isFilterableFree(model, subscriptionProviders);

      // Assert
      expect(result).toBe(true);
    });
  });
});

describe('classifyPricing', () => {
  it('10-4-AC4: returns "unknown" when cost is undefined', () => {
    // Arrange
    const model = makeModel({ cost: undefined });

    // Act
    const result = classifyPricing(model);

    // Assert
    expect(result).toBe('unknown');
  });

  it('10-4-AC4: returns "paid" when cost.input is non-zero', () => {
    // Arrange
    const model = makeModel({ cost: { input: 15, output: 75 } });

    // Act
    const result = classifyPricing(model);

    // Assert
    expect(result).toBe('paid');
  });

  it('10-4-AC4: returns "paid" when cost.output is non-zero (input 0)', () => {
    // Arrange
    const model = makeModel({ cost: { input: 0, output: 1.5 } });

    // Act
    const result = classifyPricing(model);

    // Assert
    expect(result).toBe('paid');
  });

  it('10-4-AC1: returns "subscription" when cost 0 and enabledVia "account" (Copilot-like)', () => {
    // Arrange
    const model = makeModel({
      providerId: 'github-copilot',
      cost: { input: 0, output: 0 },
      enabledVia: 'account',
    });

    // Act
    const result = classifyPricing(model);

    // Assert
    expect(result).toBe('subscription');
  });

  it('10-4-AC4: returns "free" when cost 0 and enabledVia undefined (public free-tier)', () => {
    // Arrange
    const model = makeModel({
      providerId: 'opencode-zen',
      cost: { input: 0, output: 0 },
      enabledVia: undefined,
    });

    // Act
    const result = classifyPricing(model);

    // Assert
    expect(result).toBe('free');
  });

  it('10-4-AC4: returns "free" when cost 0 and enabledVia "env"', () => {
    // Arrange
    const model = makeModel({ cost: { input: 0, output: 0 }, enabledVia: 'env' });

    // Act
    const result = classifyPricing(model);

    // Assert
    expect(result).toBe('free');
  });

  it('10-4-AC4: returns "subscription" when providerId in subscriptionProviders override', () => {
    // Arrange
    const model = makeModel({
      providerId: 'openrouter',
      cost: { input: 0, output: 0 },
      enabledVia: undefined,
    });
    const subscriptionProviders = new Set(['openrouter']);

    // Act
    const result = classifyPricing(model, subscriptionProviders);

    // Assert
    expect(result).toBe('subscription');
  });

  it('10-4-AC4: invariant — isFilterableFree agrees with classifyPricing==="free"', () => {
    // Arrange — free model
    const freeModel = makeModel({ cost: { input: 0, output: 0 }, enabledVia: undefined });
    const subModel = makeModel({ cost: { input: 0, output: 0 }, enabledVia: 'account' });
    const paidModel = makeModel({ cost: { input: 3, output: 15 } });
    const unknownModel = makeModel({ cost: undefined });

    // Act & Assert — invariant: isFilterableFree ⟺ classifyPricing === 'free'
    expect(isFilterableFree(freeModel)).toBe(classifyPricing(freeModel) === 'free');
    expect(isFilterableFree(subModel)).toBe(classifyPricing(subModel) === 'free');
    expect(isFilterableFree(paidModel)).toBe(classifyPricing(paidModel) === 'free');
    expect(isFilterableFree(unknownModel)).toBe(classifyPricing(unknownModel) === 'free');
  });
});
