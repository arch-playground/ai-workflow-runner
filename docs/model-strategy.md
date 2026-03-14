# Model Strategy

The `model_strategy` input lets you assign different AI models to different task types within a single workflow run. This enables cost optimization by routing cheaper models to simpler tasks (exploration, validation) while reserving expensive models for complex tasks (code generation).

## Quick Start

```yaml
- name: Run AI Workflow
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    auth_config: '${{ runner.temp }}/auth.json'
    model_strategy: '{"explore":"haiku","validate":"haiku","generate":"sonnet"}'
```

## How It Works

The `model_strategy` input is a JSON object mapping task type names to model identifiers. Each task type becomes an OpenCode subagent with the specified model.

```
model_strategy: '{"<task_type>":"<model>", ...}'
```

### Task Types

| Task Type  | Description                        | Typical Model Choice |
| ---------- | ---------------------------------- | -------------------- |
| `primary`  | Sets the main model (special key)  | sonnet, opus         |
| `explore`  | Codebase scanning and exploration  | haiku, gpt-4o-mini   |
| `validate` | Validation and checking            | haiku, gpt-4o-mini   |
| `format`   | Formatting and transformation      | haiku                |
| `generate` | Code generation and implementation | sonnet, opus         |

You can also use custom task type names (e.g., `lint`, `review`, `test`) — they will be created as subagent configs.

### The `primary` Key

The `primary` key is special: it sets the main model for the workflow rather than creating a subagent. It is only used when the `model` input is not provided.

```yaml
# primary sets the main model; explore and validate are subagents
model_strategy: '{"primary":"sonnet","explore":"haiku","validate":"haiku"}'
```

If both `model` and `primary` are provided, `model` takes precedence.

## Model Name Resolution

You can reference models using short names, partial names, or full model IDs. Resolution is case-insensitive.

### Short Names

| Short Name         | Resolves To                   |
| ------------------ | ----------------------------- |
| `opus`             | `anthropic/claude-opus-4-6`   |
| `sonnet`           | `anthropic/claude-sonnet-4-6` |
| `haiku`            | `anthropic/claude-haiku-4-5`  |
| `opus-4`           | `anthropic/claude-opus-4-6`   |
| `sonnet-4`         | `anthropic/claude-sonnet-4-6` |
| `haiku-4`          | `anthropic/claude-haiku-4-5`  |
| `gpt-4o`           | `openai/gpt-4o`               |
| `gpt-4o-mini`      | `openai/gpt-4o-mini`          |
| `o3`               | `openai/o3`                   |
| `o3-mini`          | `openai/o3-mini`              |
| `o4-mini`          | `openai/o4-mini`              |
| `gemini-2.5-pro`   | `google/gemini-2.5-pro`       |
| `gemini-2.5-flash` | `google/gemini-2.5-flash`     |

### Partial Names (Fuzzy Resolution)

If the input doesn't match a short name exactly, the runner checks if it is a substring of any known full model ID. If exactly one model matches, it resolves automatically.

```yaml
# "claude-haiku-4-5" is a substring of "anthropic/claude-haiku-4-5" → resolves
model_strategy: '{"explore":"claude-haiku-4-5"}'

# "Claude-Opus-4-6" is matched case-insensitively → resolves
model_strategy: '{"generate":"Claude-Opus-4-6"}'
```

If the substring matches multiple models, the runner fails with an error listing all matches:

```
Ambiguous model name "claude" matches multiple models:
anthropic/claude-opus-4-6, anthropic/claude-sonnet-4-6, anthropic/claude-haiku-4-5.
Use a full model ID or a more specific short name.
```

### Full Model IDs

Any value containing `/` is treated as a full model ID and passed through without resolution:

```yaml
model_strategy: '{"explore":"anthropic/claude-haiku-4-5-20251001"}'
```

## Examples

### Cost-Optimized Workflow

Route exploration and validation to a cheaper model, generation to a more capable one:

```yaml
- name: Run AI Workflow
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    auth_config: '${{ runner.temp }}/auth.json'
    model_strategy: '{"explore":"haiku","validate":"haiku","generate":"sonnet"}'
```

### Multi-Provider Workflow

Mix models from different providers:

```yaml
- name: Run AI Workflow
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    auth_config: '${{ runner.temp }}/auth.json'
    model_strategy: '{"explore":"gpt-4o-mini","validate":"haiku","generate":"opus"}'
```

### Primary Model with Strategy

Set the main model via strategy and override specific subagents:

```yaml
- name: Run AI Workflow
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    auth_config: '${{ runner.temp }}/auth.json'
    model_strategy: '{"primary":"sonnet","explore":"haiku","validate":"haiku"}'
```

### With Model Input Override

When `model` is provided, it takes precedence over `primary` and is used as the default for any task type not explicitly set in the strategy:

```yaml
- name: Run AI Workflow
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    auth_config: '${{ runner.temp }}/auth.json'
    model: 'anthropic/claude-sonnet-4-6'
    model_strategy: '{"explore":"haiku","validate":"haiku"}'
```

## Token Tracking Outputs

When using `model_strategy`, the action provides per-model token usage as outputs:

| Output               | Description                                      |
| -------------------- | ------------------------------------------------ |
| `total_tokens`       | Total tokens consumed across all models          |
| `input_tokens`       | Total input tokens                               |
| `output_tokens`      | Total output tokens                              |
| `reasoning_tokens`   | Total reasoning/thinking tokens                  |
| `cache_read_tokens`  | Total prompt cache read tokens                   |
| `cache_write_tokens` | Total prompt cache write tokens                  |
| `total_cost`         | Total estimated cost in USD                      |
| `cost_breakdown`     | JSON string with per-model token and cost detail |

```yaml
- name: Run AI Workflow
  id: ai
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    model_strategy: '{"explore":"haiku","generate":"sonnet"}'

- name: Show token usage
  run: |
    echo "Total tokens: ${{ steps.ai.outputs.total_tokens }}"
    echo "Total cost: ${{ steps.ai.outputs.total_cost }}"
    echo "Breakdown: ${{ steps.ai.outputs.cost_breakdown }}"
```
