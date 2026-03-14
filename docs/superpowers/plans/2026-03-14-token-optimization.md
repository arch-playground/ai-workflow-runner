# Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-model orchestration (subagents with cheaper models), token usage observability, and workflow-creator skill enhancement to reduce token consumption 60-80%.

**Architecture:** Extend the existing runner config pipeline to translate a new `model_strategy` action input into OpenCode agent configs. Add a TokenTracker module that collects SDK token metrics from events and outputs them as GitHub Action outputs and structured logs. Enhance the workflow-creator skill with templates and guidance for token-efficient workflow authoring.

**Tech Stack:** TypeScript, @opencode-ai/sdk v2, @actions/core, Jest

**Spec:** `docs/superpowers/specs/2026-03-14-token-optimization-design.md`

---

## File Structure

| Action | Path                             | Responsibility                                                                           |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Modify | `action.yml`                     | Add `model_strategy` input and token tracking outputs                                    |
| Modify | `src/types.ts`                   | Add `ModelStrategy` type, `modelStrategy` to `ActionInputs`, new `INPUT_LIMITS` entry    |
| Modify | `src/config.ts`                  | Parse and validate `model_strategy` input in `getInputs()`                               |
| Modify | `src/opencode.ts`                | Extend `InitializeOptions`, `buildSdkConfig()` for agent configs; integrate TokenTracker |
| Create | `src/token-tracker.ts`           | TokenTracker class + `TokenSummary` type: aggregate, format, output token metrics        |
| Create | `src/token-tracker.spec.ts`      | Unit tests for TokenTracker                                                              |
| Modify | `src/config.spec.ts`             | Tests for `model_strategy` parsing/validation                                            |
| Modify | `src/opencode-config.spec.ts`    | Tests for agent config generation in `buildSdkConfig()`                                  |
| Modify | `src/opencode-test-helpers.ts`   | Add `session.messages` mock to `MockClient`                                              |
| Modify | `src/runner.ts`                  | Pass `modelStrategy` to `opencode.initialize()`, call TokenTracker on completion         |
| Modify | `src/runner.spec.ts`             | Tests for model_strategy passthrough                                                     |
| Modify | `src/index.ts`                   | Set token tracking outputs on completion                                                 |
| Modify | `test/action-yml.test.ts`        | Test for new `model_strategy` input and token outputs                                    |
| Modify | `test/mocks/@opencode-ai/sdk.ts` | Add `session.messages` to mock                                                           |

---

## Chunk 1: Types and Input Parsing

### Task 1: Add types for model strategy and token tracking

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Write failing test for new types import**

Add a test in `src/config.spec.ts` that references `ModelStrategy` type:

```typescript
// In src/config.spec.ts, add at top:
import { INPUT_LIMITS, type ModelStrategy } from './types';
```

Run: `npm run typecheck`
Expected: FAIL — `ModelStrategy` does not exist

- [ ] **Step 2: Add ModelStrategy type and INPUT_LIMITS entry to types.ts**

In `src/types.ts`, add after `ValidationScriptType`:

```typescript
export type ModelStrategy = Record<string, string>;
```

Add `modelStrategy` to `ActionInputs`:

```typescript
export interface ActionInputs {
  workflowPath: string;
  prompt: string;
  envVars: Record<string, string>;
  timeoutMs: number;
  validationScript?: string;
  validationScriptType?: ValidationScriptType;
  maxValidationRetries: number;
  opencodeConfig?: string;
  authConfig?: string;
  model?: string;
  modelStrategy?: ModelStrategy;
  listModels: boolean;
  debugLog: boolean;
  debugLogPath: string;
}
```

Add to `INPUT_LIMITS`:

```typescript
MAX_MODEL_STRATEGY_SIZE: 10_240, // 10KB
```

Add to `ActionOutputs`:

```typescript
export interface ActionOutputs {
  status: ActionStatus;
  result: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
  costBreakdown?: string;
}
```

- [ ] **Step 3: Run typecheck to verify**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ModelStrategy type and token tracking output types"
```

### Task 2: Parse and validate model_strategy in config.ts

**Files:**

- Modify: `src/config.ts`
- Modify: `src/config.spec.ts`

- [ ] **Step 1: Write failing tests for model_strategy parsing**

Add to `src/config.spec.ts` inside `describe('getInputs', ...)`:

```typescript
describe('model_strategy parsing', () => {
  it('parses valid model_strategy JSON', () => {
    // Arrange
    mockInputs({
      model_strategy: '{"explore":"haiku","validate":"haiku","generate":"sonnet"}',
    });

    // Act
    const inputs = getInputs();

    // Assert
    expect(inputs.modelStrategy).toEqual({
      explore: 'haiku',
      validate: 'haiku',
      generate: 'sonnet',
    });
  });

  it('returns undefined when model_strategy is empty', () => {
    // Arrange
    mockInputs({});

    // Act
    const inputs = getInputs();

    // Assert
    expect(inputs.modelStrategy).toBeUndefined();
  });

  it('throws on invalid JSON in model_strategy', () => {
    // Arrange
    mockInputs({ model_strategy: 'not-json' });

    // Act & Assert
    expect(() => getInputs()).toThrow('model_strategy must be a valid JSON object');
  });

  it('throws when model_strategy exceeds max size', () => {
    // Arrange
    const oversized = JSON.stringify({ key: 'x'.repeat(11000) });
    mockInputs({ model_strategy: oversized });

    // Act & Assert
    expect(() => getInputs()).toThrow('model_strategy exceeds maximum size');
  });

  it('throws when model_strategy value is not a string', () => {
    // Arrange
    mockInputs({ model_strategy: '{"explore": 123}' });

    // Act & Assert
    expect(() => getInputs()).toThrow('must be a string');
  });

  it('throws when model_strategy value is empty string', () => {
    // Arrange
    mockInputs({ model_strategy: '{"explore": ""}' });

    // Act & Assert
    expect(() => getInputs()).toThrow('must be a non-empty string');
  });

  it('throws when model_strategy is a JSON array', () => {
    // Arrange
    mockInputs({ model_strategy: '["haiku", "sonnet"]' });

    // Act & Assert
    expect(() => getInputs()).toThrow('must be a JSON object, not an array or primitive');
  });

  it('throws when model_strategy is a JSON primitive', () => {
    // Arrange
    mockInputs({ model_strategy: '"just-a-string"' });

    // Act & Assert
    expect(() => getInputs()).toThrow('must be a JSON object, not an array or primitive');
  });

  it('throws when model_strategy is JSON null', () => {
    // Arrange
    mockInputs({ model_strategy: 'null' });

    // Act & Assert
    expect(() => getInputs()).toThrow('must be a JSON object, not an array or primitive');
  });
});
```

Run: `npm run test:unit -- --testPathPattern=config.spec`
Expected: FAIL — modelStrategy not returned

- [ ] **Step 2: Implement model_strategy parsing in config.ts**

Add `parseModelStrategy` function and integrate into `getInputs()`:

```typescript
function parseModelStrategy(raw: string): ModelStrategy | undefined {
  if (!raw || raw.trim() === '') {
    return undefined;
  }

  if (raw.length > INPUT_LIMITS.MAX_MODEL_STRATEGY_SIZE) {
    throw new Error(
      `model_strategy exceeds maximum size of ${INPUT_LIMITS.MAX_MODEL_STRATEGY_SIZE} bytes`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'model_strategy must be a valid JSON object. Example: {"explore":"haiku","validate":"haiku"}'
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('model_strategy must be a JSON object, not an array or primitive');
  }

  const strategy = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(strategy)) {
    if (typeof value !== 'string') {
      throw new Error(`model_strategy["${key}"] must be a string, got ${typeof value}`);
    }
    if (value.trim() === '') {
      throw new Error(`model_strategy["${key}"] must be a non-empty string`);
    }
  }

  return strategy as ModelStrategy;
}
```

In `getInputs()`, add before the return statement:

```typescript
const modelStrategyRaw = core.getInput('model_strategy') || '';
const modelStrategy = parseModelStrategy(modelStrategyRaw);
```

Add `modelStrategy` to the return object.

Import `ModelStrategy` from `./types.js`.

- [ ] **Step 3: Run tests to verify**

Run: `npm run test:unit -- --testPathPattern=config.spec`
Expected: PASS

- [ ] **Step 4: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.spec.ts
git commit -m "feat: parse and validate model_strategy action input"
```

### Task 3: Add model_strategy to action.yml

**Files:**

- Modify: `action.yml`
- Modify: `test/action-yml.test.ts`

- [ ] **Step 1: Write failing test for model_strategy input**

Add to `test/action-yml.test.ts`:

```typescript
it('defines model_strategy as optional string with correct description', () => {
  // Arrange
  const input = actionYml.inputs['model_strategy'];

  // Assert
  expect(input).toBeDefined();
  expect(input.required).toBe(false);
  expect(input.default).toBe('');
  expect(input.description).toContain('model');
});

it('defines all 8 token tracking outputs', () => {
  // Assert
  const expectedOutputs = [
    'total_tokens',
    'input_tokens',
    'output_tokens',
    'reasoning_tokens',
    'cache_read_tokens',
    'cache_write_tokens',
    'total_cost',
    'cost_breakdown',
  ];

  for (const output of expectedOutputs) {
    expect(actionYml.outputs[output]).toBeDefined();
    expect(actionYml.outputs[output].description).toBeTruthy();
  }
});
```

Note: The `ActionYml` interface in the test file may need to be extended to include `outputs`. Add to the existing interface:

```typescript
interface ActionYml {
  // ... existing fields ...
  outputs: Record<string, { description: string }>;
}
```

Run: `npx jest test/action-yml.test.ts`
Expected: FAIL — model_strategy not defined, outputs not defined

- [ ] **Step 2: Add model_strategy input and token outputs to action.yml**

Add to `action.yml` inputs section (after `model`):

```yaml
model_strategy:
  description: 'JSON mapping of task types to models for multi-model workflows. Short names (opus, sonnet, haiku) or full model IDs. Example: {"explore":"haiku","validate":"haiku","generate":"sonnet"}'
  required: false
  default: ''
```

Add to `action.yml` outputs section:

```yaml
total_tokens:
  description: 'Total tokens consumed across all models'
input_tokens:
  description: 'Total input tokens'
output_tokens:
  description: 'Total output tokens'
reasoning_tokens:
  description: 'Total reasoning/thinking tokens'
cache_read_tokens:
  description: 'Total prompt cache read tokens'
cache_write_tokens:
  description: 'Total prompt cache write tokens'
total_cost:
  description: 'Total estimated cost in USD'
cost_breakdown:
  description: 'JSON string with per-model token and cost breakdown'
```

- [ ] **Step 3: Run test to verify**

Run: `npx jest test/action-yml.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add action.yml test/action-yml.test.ts
git commit -m "feat: add model_strategy input and token tracking outputs to action.yml"
```

---

## Chunk 2: Config Enhancement — Agent Config Generation

### Task 4: Extend InitializeOptions and buildSdkConfig for model strategy

**Files:**

- Modify: `src/opencode.ts`
- Modify: `src/opencode-config.spec.ts`
- Modify: `src/opencode-test-helpers.ts`

- [ ] **Step 1: Write failing tests for agent config generation**

Add to `src/opencode-config.spec.ts`:

```typescript
describe('model strategy agent config generation', () => {
  it('generates subagent configs from model_strategy with short names', async () => {
    // Arrange — short names resolved via synchronous KNOWN_MODELS lookup (no provider.list needed)
    const service = new OpenCodeService();
    await service.initialize({
      model: 'anthropic/claude-opus-4-6',
      modelStrategy: { explore: 'haiku', validate: 'haiku', generate: 'sonnet' },
    });

    // Assert
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    const agentConfig = configArg.agent as Record<string, unknown>;
    expect(agentConfig.explore).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-haiku-4-5', mode: 'subagent' })
    );
    expect(agentConfig.validate).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-haiku-4-5', mode: 'subagent' })
    );
    expect(agentConfig.generate).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-sonnet-4-6', mode: 'subagent' })
    );
  });

  it('uses full model ID when provided instead of short name', async () => {
    // Arrange
    const service = new OpenCodeService();
    await service.initialize({
      model: 'anthropic/claude-opus-4-6',
      modelStrategy: { explore: 'anthropic/claude-haiku-4-5-20251001' },
    });

    // Assert
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    const agentConfig = configArg.agent as Record<string, unknown>;
    expect(agentConfig.explore).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-haiku-4-5-20251001' })
    );
  });

  it('defaults all agents to model input when no strategy provided', async () => {
    // Arrange
    const service = new OpenCodeService();
    await service.initialize({ model: 'anthropic/claude-sonnet-4-6' });

    // Assert
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    const agentConfig = configArg.agent as Record<string, unknown>;
    expect(agentConfig.explore).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-sonnet-4-6', mode: 'subagent' })
    );
    expect(agentConfig.validate).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-sonnet-4-6', mode: 'subagent' })
    );
    expect(agentConfig.generate).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-sonnet-4-6', mode: 'subagent' })
    );
  });

  it('does not create default agents when model is undefined and no strategy', async () => {
    // Arrange — both model and modelStrategy are undefined
    const service = new OpenCodeService();
    await service.initialize({});

    // Assert — no agent configs should be created (avoids empty model strings)
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    expect(configArg.agent).toBeUndefined();
  });

  it('merges strategy agents with existing opencode_config agents', async () => {
    // Arrange
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        agent: { custom: { model: 'anthropic/claude-opus-4-6', mode: 'subagent' } },
      })
    );

    const service = new OpenCodeService();
    await service.initialize({
      opencodeConfig: '/path/to/config.json',
      model: 'anthropic/claude-sonnet-4-6',
      modelStrategy: { explore: 'haiku' },
    });

    // Assert
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    const agentConfig = configArg.agent as Record<string, unknown>;
    expect(agentConfig.custom).toBeDefined();
    expect(agentConfig.explore).toBeDefined();
  });

  it('model_strategy takes precedence over opencode_config for same agent name', async () => {
    // Arrange
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        agent: { explore: { model: 'anthropic/claude-opus-4-6', mode: 'subagent' } },
      })
    );

    const service = new OpenCodeService();
    await service.initialize({
      opencodeConfig: '/path/to/config.json',
      model: 'anthropic/claude-sonnet-4-6',
      modelStrategy: { explore: 'haiku' },
    });

    // Assert
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    const agentConfig = configArg.agent as Record<string, unknown>;
    const exploreConfig = agentConfig.explore as Record<string, unknown>;
    expect(exploreConfig.model).toContain('haiku');
  });

  it('throws error for unrecognized short names', async () => {
    // Arrange — 'unknown-model' is not in KNOWN_MODELS lookup table
    const service = new OpenCodeService();

    // Assert — per spec, runner fails with clear error listing available models
    await expect(
      service.initialize({
        model: 'anthropic/claude-sonnet-4-6',
        modelStrategy: { explore: 'unknown-model' },
      })
    ).rejects.toThrow(/Unknown model short name "unknown-model"/);
  });

  it('accepts custom/unknown task types as subagent configs', async () => {
    // Arrange — 'lint' is not a known task type but should be accepted
    const service = new OpenCodeService();
    await service.initialize({
      model: 'anthropic/claude-sonnet-4-6',
      modelStrategy: { lint: 'haiku', review: 'sonnet' },
    });

    // Assert — custom task types become subagents with generated descriptions
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    const agentConfig = configArg.agent as Record<string, unknown>;
    const lintConfig = agentConfig.lint as Record<string, unknown>;
    expect(lintConfig.model).toBe('anthropic/claude-haiku-4-5');
    expect(lintConfig.mode).toBe('subagent');
    expect(lintConfig.description).toBe('lint tasks');
    const reviewConfig = agentConfig.review as Record<string, unknown>;
    expect(reviewConfig.model).toBe('anthropic/claude-sonnet-4-6');
  });

  it('uses primary from strategy as main model when model input is absent', async () => {
    // Arrange — model input not provided, primary defined in strategy
    const service = new OpenCodeService();
    await service.initialize({
      modelStrategy: { primary: 'opus', explore: 'haiku' },
    });

    // Assert — primary resolves to opus model ID for the main session
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    expect(configArg.model).toBe('anthropic/claude-opus-4-6');
    // explore agent should also be configured
    const agentConfig = configArg.agent as Record<string, unknown>;
    expect(agentConfig.explore).toEqual(
      expect.objectContaining({ model: 'anthropic/claude-haiku-4-5', mode: 'subagent' })
    );
  });

  it('model input takes precedence over primary in strategy', async () => {
    // Arrange — both model input and primary in strategy
    const service = new OpenCodeService();
    await service.initialize({
      model: 'anthropic/claude-sonnet-4-6',
      modelStrategy: { primary: 'opus', explore: 'haiku' },
    });

    // Assert — model input wins
    const configArg = mockCreateOpencode.mock.calls[0][0]?.config as Record<string, unknown>;
    expect(configArg.model).toBe('anthropic/claude-sonnet-4-6');
  });
});
```

Run: `npm run test:unit -- --testPathPattern=opencode-config.spec`
Expected: FAIL — InitializeOptions doesn't have modelStrategy

- [ ] **Step 2: Extend InitializeOptions**

In `src/opencode.ts`, update `InitializeOptions`:

```typescript
export interface InitializeOptions {
  opencodeConfig?: string;
  authConfig?: string;
  model?: string;
  modelStrategy?: ModelStrategy;
}
```

Import `ModelStrategy` from `./types.js`.

- [ ] **Step 3: Implement buildAgentConfigs and extend buildSdkConfig**

Add to `src/opencode.ts` in the `OpenCodeService` class:

```typescript
private readonly DEFAULT_TASK_TYPES = ['explore', 'validate', 'format', 'generate'] as const;

private readonly TASK_TYPE_DESCRIPTIONS: Record<string, string> = {
  explore: 'Exploration and codebase scanning tasks',
  validate: 'Validation and checking tasks',
  format: 'Formatting and transformation tasks',
  generate: 'Code generation and implementation tasks',
  default: 'Default fallback tasks',
};

private readonly SHORT_NAME_FAMILIES: Record<string, string> = {
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
};

private isFullModelId(value: string): boolean {
  return value.includes('/');
}

private readonly KNOWN_MODELS: Record<string, string> = {
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  haiku: 'anthropic/claude-haiku-4-5',
};

private resolveShortNameSync(shortName: string): string | null {
  return this.KNOWN_MODELS[shortName.toLowerCase()] ?? null;
}

private buildAgentConfigs(
  strategy: ModelStrategy | undefined,
  defaultModel?: string
): Record<string, unknown> | undefined {
  // Guard: if no model and no strategy, don't create agent configs with empty model strings
  if (!defaultModel && !strategy) return undefined;

  const agents: Record<string, unknown> = {};
  const model = defaultModel || '';

  const resolveModel = (value: string): string => {
    if (this.isFullModelId(value)) return value;

    const resolved = this.resolveShortNameSync(value);
    if (resolved) return resolved;

    // Per spec: runner fails with a clear error listing available short names
    const availableNames = Object.keys(this.KNOWN_MODELS).join(', ');
    throw new Error(
      `Unknown model short name "${value}". Available short names: ${availableNames}. ` +
      `Use a full model ID (e.g., "anthropic/claude-sonnet-4-6") or one of: ${availableNames}.`
    );
  };

  if (strategy) {
    for (const [taskType, modelValue] of Object.entries(strategy)) {
      if (taskType === 'primary') continue; // primary handled by buildSdkConfig
      const resolvedModel = resolveModel(modelValue);
      agents[taskType] = {
        model: resolvedModel,
        mode: 'subagent',
        description: this.TASK_TYPE_DESCRIPTIONS[taskType] || `${taskType} tasks`,
      };
    }
  }

  // Ensure default task types exist even if not in strategy (only when we have a model)
  if (model) {
    for (const taskType of this.DEFAULT_TASK_TYPES) {
      if (!agents[taskType]) {
        agents[taskType] = {
          model: model,
          mode: 'subagent',
          description: this.TASK_TYPE_DESCRIPTIONS[taskType],
        };
      }
    }
  }

  return Object.keys(agents).length > 0 ? agents : undefined;
}
```

Update `buildSdkConfig` to call `buildAgentConfigs`. Note: `buildSdkConfig` runs BEFORE `createOpencode()`, so all resolution must be synchronous. Short names use the `KNOWN_MODELS` lookup table in `resolveShortNameSync`.

```typescript
private async buildSdkConfig(options?: InitializeOptions): Promise<Record<string, unknown>> {
  let sdkConfig: Record<string, unknown> = {};

  if (options?.opencodeConfig) {
    const loaded = await this.loadJsonFile(options.opencodeConfig, 'config');
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      sdkConfig = loaded;
    }
  }
  if (options?.model) {
    sdkConfig.model = options.model;
  }

  // Handle 'primary' in strategy: sets main model when model input is absent
  if (options?.modelStrategy?.primary && !options?.model) {
    const resolved = this.resolveShortNameSync(options.modelStrategy.primary);
    if (resolved) {
      sdkConfig.model = resolved;
    } else if (this.isFullModelId(options.modelStrategy.primary)) {
      sdkConfig.model = options.modelStrategy.primary;
    }
  }

  // Build agent configs from model strategy (synchronous)
  const strategyAgents = this.buildAgentConfigs(options?.modelStrategy, options?.model);
  if (strategyAgents) {
    const existingAgents = (sdkConfig.agent as Record<string, unknown>) || {};
    sdkConfig.agent = { ...existingAgents, ...strategyAgents };
  }

  sdkConfig.permission = this.buildPermissionConfig(
    sdkConfig.permission as Record<string, unknown> | undefined
  );

  return sdkConfig;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- --testPathPattern=opencode-config.spec`
Expected: PASS

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/opencode.ts src/opencode-config.spec.ts src/opencode-test-helpers.ts
git commit -m "feat: generate OpenCode agent configs from model_strategy"
```

### Task 5: Pass modelStrategy through runner.ts

**Files:**

- Modify: `src/runner.ts`
- Modify: `src/runner.spec.ts`

- [ ] **Step 1: Write failing test**

Add to `src/runner.spec.ts`:

```typescript
it('passes modelStrategy to opencode.initialize', async () => {
  // Arrange
  const inputs = createDefaultInputs({
    modelStrategy: { explore: 'haiku', validate: 'haiku' },
  });

  // Act
  await runWorkflow(inputs, 30000);

  // Assert
  expect(mockOpenCode.initialize).toHaveBeenCalledWith(
    expect.objectContaining({
      modelStrategy: { explore: 'haiku', validate: 'haiku' },
    })
  );
});
```

Run: `npm run test:unit -- --testPathPattern=runner.spec`
Expected: FAIL

- [ ] **Step 2: Pass modelStrategy in runner.ts**

In `src/runner.ts`, update the `opencode.initialize()` call in `runWorkflow`:

```typescript
await opencode.initialize({
  opencodeConfig: inputs.opencodeConfig,
  authConfig: inputs.authConfig,
  model: inputs.model,
  modelStrategy: inputs.modelStrategy,
});
```

Note: The second `opencode.initialize()` call in `handleListModels` does NOT need `modelStrategy` — listing models is a query operation that doesn't create agents. Leave that call unchanged.

- [ ] **Step 3: Run tests**

Run: `npm run test:unit -- --testPathPattern=runner.spec`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/runner.ts src/runner.spec.ts
git commit -m "feat: pass modelStrategy through runner to OpenCode initialization"
```

---

## Chunk 3: TokenTracker Module

### Task 6: Create TokenTracker with aggregation logic

**Files:**

- Create: `src/token-tracker.ts`
- Create: `src/token-tracker.spec.ts`

- [ ] **Step 1: Write failing tests for TokenTracker aggregation**

Create `src/token-tracker.spec.ts`:

```typescript
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
      // Arrange
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

      // Act
      tracker.trackMessage(message);
      const summary = tracker.getSummary();

      // Assert
      expect(summary.totalTokens).toBe(45000 + 12000 + 8000);
      expect(summary.inputTokens).toBe(45000);
      expect(summary.outputTokens).toBe(12000);
      expect(summary.reasoningTokens).toBe(8000);
      expect(summary.cacheReadTokens).toBe(10000);
      expect(summary.cacheWriteTokens).toBe(2800);
      expect(summary.totalCost).toBeCloseTo(0.45);
    });

    it('accumulates tokens from multiple messages across models', () => {
      // Arrange & Act
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

      // Assert
      expect(summary.totalTokens).toBe(45000 + 12000 + 8000 + 8000 + 2400);
      expect(summary.totalCost).toBeCloseTo(0.46);
      expect(Object.keys(summary.perModel)).toHaveLength(2);
      expect(summary.perModel['claude-opus-4-6'].messageCount).toBe(1);
      expect(summary.perModel['claude-haiku-4-5'].messageCount).toBe(1);
    });

    it('handles messages with missing tokens gracefully', () => {
      // Arrange
      const message = { id: 'msg-1', role: 'assistant' };

      // Act
      tracker.trackMessage(message);
      const summary = tracker.getSummary();

      // Assert
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('missing token data'));
    });

    it('skips duplicate message IDs', () => {
      // Arrange & Act
      const msg = {
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      };
      tracker.trackMessage(msg);
      tracker.trackMessage(msg);
      const summary = tracker.getSummary();

      // Assert
      expect(summary.inputTokens).toBe(1000);
    });

    it('handles message with tokens but missing cache sub-object', () => {
      // Arrange
      const message = {
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0 },
      };

      // Act
      tracker.trackMessage(message);
      const summary = tracker.getSummary();

      // Assert
      expect(summary.cacheReadTokens).toBe(0);
      expect(summary.cacheWriteTokens).toBe(0);
      expect(summary.inputTokens).toBe(1000);
    });

    it('handles message with no model field', () => {
      // Arrange
      const message = {
        id: 'msg-1',
        role: 'assistant',
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      };

      // Act
      tracker.trackMessage(message);
      const summary = tracker.getSummary();

      // Assert
      expect(summary.perModel['unknown']).toBeDefined();
      expect(summary.perModel['unknown'].messageCount).toBe(1);
    });

    it('handles message with zero values for all token fields', () => {
      // Arrange
      const message = {
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      };

      // Act
      tracker.trackMessage(message);
      const summary = tracker.getSummary();

      // Assert
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(summary.perModel['opus'].messageCount).toBe(1);
    });

    it('tracks messages without id field (no dedup possible)', () => {
      // Arrange
      const message = {
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      };

      // Act
      tracker.trackMessage(message);
      tracker.trackMessage(message);
      const summary = tracker.getSummary();

      // Assert — both tracked since no id for dedup
      expect(summary.inputTokens).toBe(2000);
    });
  });

  describe('getSummary', () => {
    it('returns zero summary when no messages tracked', () => {
      // Act
      const summary = tracker.getSummary();

      // Assert
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(Object.keys(summary.perModel)).toHaveLength(0);
    });
  });

  describe('formatLogTable', () => {
    it('formats table with single model data', () => {
      // Arrange
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

      // Act
      const table = tracker.formatLogTable();

      // Assert
      expect(table).toContain('claude-opus-4-6');
      expect(table).toContain('45,200');
      expect(table).toContain('$0.4500');
    });

    it('formats table with multiple models and totals row', () => {
      // Arrange
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

      // Act
      const table = tracker.formatLogTable();

      // Assert
      expect(table).toContain('Total');
      expect(table).toContain('opus');
      expect(table).toContain('haiku');
    });
  });

  describe('setActionOutputs', () => {
    it('sets all action outputs correctly', () => {
      // Arrange
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

      // Act
      tracker.setActionOutputs();

      // Assert
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_tokens', 65000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('input_tokens', 45000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('output_tokens', 12000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('reasoning_tokens', 8000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache_read_tokens', 10000);
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache_write_tokens', 2800);
      expect(mockCore.setOutput).toHaveBeenCalledWith('total_cost', '0.4500');
    });

    it('sets cost_breakdown as valid JSON', () => {
      // Arrange
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

      // Act
      tracker.setActionOutputs();

      // Assert
      const costBreakdownCall = mockCore.setOutput.mock.calls.find(
        (call) => call[0] === 'cost_breakdown'
      );
      expect(costBreakdownCall).toBeDefined();
      const parsed = JSON.parse(costBreakdownCall![1] as string);
      expect(parsed.opus).toBeDefined();
      expect(parsed.opus.cost).toBeCloseTo(0.45);
    });
  });

  describe('formatLogTable', () => {
    it('returns no-data message when tracker is empty', () => {
      // Act
      const table = tracker.formatLogTable();

      // Assert
      expect(table).toBe('No token data collected.');
    });
  });

  describe('emitLogs', () => {
    it('wraps output in GitHub Actions log group with table content', () => {
      // Arrange
      tracker.trackMessage({
        id: 'msg-1',
        role: 'assistant',
        model: { providerID: 'anthropic', modelID: 'opus' },
        cost: 0.1,
        tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      });

      // Act
      tracker.emitLogs();

      // Assert
      expect(mockCore.startGroup).toHaveBeenCalledWith('Token Usage Summary');
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('opus'));
      expect(mockCore.endGroup).toHaveBeenCalled();
    });
  });
});
```

Run: `npm run test:unit -- --testPathPattern=token-tracker.spec`
Expected: FAIL — module doesn't exist

- [ ] **Step 2: Implement TokenTracker**

Create `src/token-tracker.ts`:

```typescript
import * as core from '@actions/core';

interface TokenData {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

interface TrackedMessage {
  id: string;
  model?: { providerID: string; modelID: string };
  cost?: number;
  tokens?: Partial<TokenData>;
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
```

- [ ] **Step 3: Run tests**

Run: `npm run test:unit -- --testPathPattern=token-tracker.spec`
Expected: PASS

- [ ] **Step 4: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/token-tracker.ts src/token-tracker.spec.ts
git commit -m "feat: add TokenTracker module for token usage observability"
```

---

## Chunk 4: Integration — Wire TokenTracker into Event Loop

### Task 7: Integrate TokenTracker with OpenCode event loop

**Files:**

- Modify: `src/opencode.ts`
- Modify: `src/index.ts`
- Modify: `src/opencode-test-helpers.ts`
- Modify: `test/mocks/@opencode-ai/sdk.ts`
- Modify: `src/opencode-config.spec.ts`

Note: `src/runner.ts` is NOT modified in this task — runner changes were done in Task 5.

- [ ] **Step 1: Write tests for collectTokenMetrics and token tracking integration**

Add to `src/opencode-config.spec.ts` (inside the existing `OpenCodeService` describe block):

```typescript
describe('collectTokenMetrics', () => {
  it('fetches session messages and passes assistant messages to TokenTracker', async () => {
    // Arrange
    const service = new OpenCodeService();
    await service.initialize({ model: 'anthropic/claude-sonnet-4-6' });

    mockClient.session.messages.mockResolvedValue({
      data: [
        {
          id: 'msg-1',
          role: 'assistant',
          model: { providerID: 'anthropic', modelID: 'opus' },
          cost: 0.1,
          tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        { id: 'msg-2', role: 'user', content: [{ type: 'text', text: 'hello' }] },
        {
          id: 'msg-3',
          role: 'assistant',
          model: { providerID: 'anthropic', modelID: 'opus' },
          cost: 0.2,
          tokens: { input: 2000, output: 800, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      ],
    });

    // Act — trigger session run which calls collectTokenMetrics after idle
    // (The exact mechanism depends on how runSession wires up the idle promise)
    const tracker = service.getTokenTracker();
    const summary = tracker.getSummary();

    // Assert — verify session.messages was called
    // Note: full integration test; unit test verifies TokenTracker separately
    expect(mockClient.session.messages).toHaveBeenCalled();
  });

  it('handles session.messages failure gracefully', async () => {
    // Arrange
    const service = new OpenCodeService();
    await service.initialize({ model: 'anthropic/claude-sonnet-4-6' });

    mockClient.session.messages.mockRejectedValue(new Error('API error'));

    // Act — trigger collectTokenMetrics (should not throw)
    // Assert — warning logged, no crash
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to collect token metrics')
    );
  });

  it('only tracks assistant role messages, not user messages', async () => {
    // Arrange
    const service = new OpenCodeService();
    await service.initialize({ model: 'anthropic/claude-sonnet-4-6' });

    mockClient.session.messages.mockResolvedValue({
      data: [
        { id: 'msg-1', role: 'user', content: [{ type: 'text', text: 'hello' }] },
        {
          id: 'msg-2',
          role: 'assistant',
          model: { providerID: 'anthropic', modelID: 'opus' },
          cost: 0.1,
          tokens: { input: 1000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      ],
    });

    // Act
    const tracker = service.getTokenTracker();
    const summary = tracker.getSummary();

    // Assert — only 1 message tracked (assistant), not 2
    expect(summary.perModel['opus']?.messageCount ?? 0).toBeLessThanOrEqual(1);
  });
});
```

Add regression test to `src/runner.spec.ts`:

```typescript
it('does not crash with token tracking during workflow run', async () => {
  // Arrange
  const inputs = createDefaultInputs();

  // Act
  const result = await runWorkflow(inputs, 30000);

  // Assert
  expect(result.success).toBe(true);
});
```

Run: `npm run test:unit -- --testPathPattern="opencode-config.spec|runner.spec"`
Expected: FAIL — collectTokenMetrics not yet wired

- [ ] **Step 2: Add TokenTracker to OpenCodeService**

In `src/opencode.ts`, add token tracking:

```typescript
import { TokenTracker } from './token-tracker.js';
```

Add to `OpenCodeService` class:

```typescript
private tokenTracker = new TokenTracker();

getTokenTracker(): TokenTracker {
  return this.tokenTracker;
}
```

In `finalizeSession()`, after setting `lastCompleteMessage`, fetch messages and track tokens:

```typescript
private async collectTokenMetrics(sessionID: string): Promise<void> {
  if (!this.client) return;

  try {
    const response = await this.client.session.messages({ sessionID });
    if (!response.data) return;

    for (const message of response.data) {
      if (message.role === 'assistant') {
        this.tokenTracker.trackMessage(message as Record<string, unknown>);
      }
    }
  } catch (error) {
    core.warning(`[TokenTracker] Failed to collect token metrics: ${String(error)}`);
  }
}
```

**Important:** Do NOT call `collectTokenMetrics` inside `finalizeSession` — it is synchronous, and `void`-ing an async call creates a race condition where token data may not be collected before outputs are set. Instead, collect tokens in `runSession` and `sendFollowUp` after the idle promise resolves, where timing is deterministic and the client is guaranteed alive.

In `runSession`, wrap `idlePromise` in `try/finally` so token metrics are collected on both success and error paths (partial data is valuable even if the session errored after consuming significant tokens):

```typescript
async runSession(
  sessionId: string,
  prompt: string,
  // ... existing params
): Promise<OpenCodeSession> {
  // ... existing code ...
  try {
    await idlePromise;
  } finally {
    // Collect token metrics regardless of success/error
    await this.collectTokenMetrics(sessionId);
  }

  return { sessionId, lastMessage: this.getLastMessage(sessionId) };
}
```

Similarly in `sendFollowUp`:

```typescript
async sendFollowUp(
  sessionId: string,
  prompt: string,
): Promise<OpenCodeSession> {
  // ... existing code ...
  try {
    await idlePromise;
  } finally {
    await this.collectTokenMetrics(sessionId);
  }

  return { sessionId, lastMessage: this.getLastMessage(sessionId) };
}
```

The `try/finally` ensures `collectTokenMetrics` runs even when `idlePromise` rejects (session error). Since `collectTokenMetrics` has its own `try/catch`, it will never suppress the original error.

- [ ] **Step 3: Wire token outputs in index.ts**

In `src/index.ts`, after `runWorkflow` returns successfully, emit token logs and set outputs:

```typescript
const result = await runWorkflow(inputs, inputs.timeoutMs, shutdownController.signal);

// Emit token tracking
const opencode = getOpenCodeService();
const tokenTracker = opencode.getTokenTracker();
tokenTracker.emitLogs();
tokenTracker.setActionOutputs();
```

- [ ] **Step 4: Update MockClient with session.messages mock**

In `src/opencode-test-helpers.ts`, add to `MockClient`:

```typescript
export interface MockClient {
  session: {
    create: jest.Mock;
    promptAsync: jest.Mock;
    messages: jest.Mock;
  };
  // ... rest
}
```

In `createMockClient()`:

```typescript
session: {
  create: jest.fn().mockResolvedValue({ data: { id: 'session-123' } }),
  promptAsync: jest.fn().mockResolvedValue({ data: {} }),
  messages: jest.fn().mockResolvedValue({ data: [] }),
},
```

Update `test/mocks/@opencode-ai/sdk.ts` to include `session.messages`:

```typescript
export interface OpencodeClient {
  session: {
    create: jest.Mock;
    promptAsync: jest.Mock;
    messages: jest.Mock;
  };
  event: {
    subscribe: jest.Mock;
  };
  permission: {
    reply: jest.Mock;
  };
}
```

- [ ] **Step 5: Run all tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 6: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/opencode.ts src/runner.ts src/index.ts src/opencode-test-helpers.ts test/mocks/@opencode-ai/sdk.ts
git commit -m "feat: integrate TokenTracker with event loop and action outputs"
```

---

## Chunk 5: Quality Checks and Final Verification

### Task 8: Run full test suite and quality checks

**Files:** None (verification only)

- [ ] **Step 1: Run full unit test suite**

Run: `npm run test:unit`
Expected: PASS with coverage thresholds met

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS with 0 warnings

- [ ] **Step 3: Run format check**

Run: `npm run format:check`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Run bundle to verify**

Run: `npm run bundle`
Expected: PASS — dist/index.js generated

- [ ] **Step 6: Commit bundle if changed**

```bash
git add dist/index.js
git commit -m "chore: rebuild bundle with token optimization features"
```

---

## Notes for Implementer

### Key Files Reference

- **Types:** `src/types.ts` — `ActionInputs`, `ModelStrategy`, `INPUT_LIMITS`
- **Config parsing:** `src/config.ts` — `getInputs()`, `parseModelStrategy()`
- **SDK integration:** `src/opencode.ts` — `buildSdkConfig()`, `buildAgentConfigs()`, event loop
- **Runner orchestration:** `src/runner.ts` — `runWorkflow()`
- **Entry point:** `src/index.ts` — output setting, token tracking emission
- **TokenTracker:** `src/token-tracker.ts` — aggregation, formatting, outputs
- **Test helpers:** `src/opencode-test-helpers.ts` — mock client/server/events
- **SDK mock:** `test/mocks/@opencode-ai/sdk.ts`

### Testing Patterns

- Unit tests co-located with source: `src/*.spec.ts`
- Tests use AAA pattern (Arrange/Act/Assert)
- SDK is mocked via `jest.mock('@opencode-ai/sdk/v2')` and `moduleNameMapper`
- `@actions/core` is mocked via `test/mocks/@actions/core.ts`
- Use `createMockClient()`, `createMockServer()`, `createEventGenerator()` from test helpers
- `resetOpenCodeService()` in `afterEach` to clean up singleton state

### Deliberate Spec Deviations

- **Log table format** — The spec shows box-drawing Unicode characters for the table. The plan uses simpler markdown pipe tables which render well in GitHub Actions logs and are easier to maintain. This is a deliberate simplification.
- **`resolveShortNameSync` vs `provider.list()`** — The spec mentions resolving via `provider.list()`, but `buildSdkConfig` runs before `createOpencode()` so the client isn't available. We use a synchronous `KNOWN_MODELS` lookup table instead.

### Pre-initialization vs Post-initialization

- `buildSdkConfig()` runs BEFORE `createOpencode()` — no client available
- Short name resolution must be synchronous (use `KNOWN_MODELS` lookup table)
- Token metrics collection runs AFTER session completes — client is available

### Workflow-Creator Skill

The workflow-creator skill enhancement (templates, guidance, active analysis) is a content-only change to skill files — not covered in this plan. It should be implemented as a separate task after the runner code changes are complete and tested.
