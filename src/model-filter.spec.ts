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

/**
 * Epic 10 real-data integration: verified shapes from research §4 + live server 2026-06-01.
 * All 29 github-copilot models report cost:{input:0,output:0} and enabled.via==='account'.
 * Zen (*-free) models report cost:{input:0,output:0} and no auth (enabledVia undefined).
 * OpenRouter :free models carry :free suffix, cost:{input:0,output:0}, no account auth.
 * Local/Ollama models have no cost field.
 */
describe('Epic 10 real-data classification table (AC2)', () => {
  // ── Copilot fixtures (29 models, cost 0, enabledVia 'account') ──
  const copilotGpt5: ModelListItem = {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'GitHub Copilot',
    providerId: 'github-copilot',
    cost: { input: 0, output: 0 },
    enabledVia: 'account',
  };

  const copilotClaude: ModelListItem = {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'GitHub Copilot',
    providerId: 'github-copilot',
    cost: { input: 0, output: 0 },
    enabledVia: 'account',
  };

  // ── OpenCode Zen free-tier fixtures (cost 0, not authenticated) ──
  const zenBigPickle: ModelListItem = {
    id: 'big-pickle',
    name: 'Big Pickle',
    provider: 'OpenCode Zen',
    providerId: 'opencode',
    cost: { input: 0, output: 0 },
    enabledVia: undefined,
  };

  const zenMinimaxFree: ModelListItem = {
    id: 'minimax-m3-free',
    name: 'MiniMax M3 (free)',
    provider: 'OpenCode Zen',
    providerId: 'opencode',
    cost: { input: 0, output: 0 },
    enabledVia: undefined,
  };

  // ── OpenRouter :free fixture (cost 0, no account auth) ──
  const openRouterFree: ModelListItem = {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct (free)',
    provider: 'OpenRouter',
    providerId: 'openrouter',
    cost: { input: 0, output: 0 },
    enabledVia: undefined,
  };

  // ── Paid model fixture (non-zero cost) ──
  const anthropicClaude: ModelListItem = {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'Anthropic',
    providerId: 'anthropic',
    cost: { input: 15, output: 75 },
    enabledVia: 'account',
  };

  // ── No-cost local fixture (Ollama-style, no cost field) ──
  const ollamaLocal: ModelListItem = {
    id: 'llama3:latest',
    name: 'Llama 3 (local)',
    provider: 'Ollama',
    providerId: 'ollama',
    cost: undefined,
    enabledVia: undefined,
  };

  describe('classifyPricing real-data table', () => {
    it('10-6-AC2: Copilot gpt-5 (cost 0, account) → subscription', () => {
      expect(classifyPricing(copilotGpt5)).toBe('subscription');
    });

    it('10-6-AC2: Copilot claude-sonnet-4-6 (cost 0, account) → subscription', () => {
      expect(classifyPricing(copilotClaude)).toBe('subscription');
    });

    it('10-6-AC2: Zen big-pickle (cost 0, no auth) → free', () => {
      expect(classifyPricing(zenBigPickle)).toBe('free');
    });

    it('10-6-AC2: Zen minimax-m3-free (cost 0, no auth) → free', () => {
      expect(classifyPricing(zenMinimaxFree)).toBe('free');
    });

    it('10-6-AC2: OpenRouter :free (cost 0, no auth) → free', () => {
      expect(classifyPricing(openRouterFree)).toBe('free');
    });

    it('10-6-AC2: Anthropic Claude paid (cost > 0) → paid', () => {
      expect(classifyPricing(anthropicClaude)).toBe('paid');
    });

    it('10-6-AC2: Ollama local (no cost) → unknown', () => {
      expect(classifyPricing(ollamaLocal)).toBe('unknown');
    });
  });

  describe('isFilterableFree real-data table', () => {
    it('10-6-AC2: Copilot gpt-5 → NOT filterable (subscription)', () => {
      expect(isFilterableFree(copilotGpt5)).toBe(false);
    });

    it('10-6-AC2: Copilot claude-sonnet-4-6 → NOT filterable (subscription)', () => {
      expect(isFilterableFree(copilotClaude)).toBe(false);
    });

    it('10-6-AC2: Zen big-pickle → filterable (free)', () => {
      expect(isFilterableFree(zenBigPickle)).toBe(true);
    });

    it('10-6-AC2: Zen minimax-m3-free → filterable (free)', () => {
      expect(isFilterableFree(zenMinimaxFree)).toBe(true);
    });

    it('10-6-AC2: OpenRouter :free → filterable (free)', () => {
      expect(isFilterableFree(openRouterFree)).toBe(true);
    });

    it('10-6-AC2: Anthropic Claude paid → NOT filterable (paid)', () => {
      expect(isFilterableFree(anthropicClaude)).toBe(false);
    });

    it('10-6-AC2: Ollama local (no cost) → NOT filterable (unknown)', () => {
      expect(isFilterableFree(ollamaLocal)).toBe(false);
    });

    it('10-6-AC2: invariant holds for all real-data fixtures', () => {
      const fixtures = [
        copilotGpt5,
        copilotClaude,
        zenBigPickle,
        zenMinimaxFree,
        openRouterFree,
        anthropicClaude,
        ollamaLocal,
      ];
      for (const m of fixtures) {
        expect(isFilterableFree(m)).toBe(classifyPricing(m) === 'free');
      }
    });
  });
});
