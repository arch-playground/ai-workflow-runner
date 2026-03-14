# Token Optimization Design

**Date:** 2026-03-14
**Status:** Draft
**Research:** `_bmad-output/planning-artifacts/research/technical-reducing-token-consumption-sonnet-4.6-research-2026-03-13.md`

---

## Goal

Reduce token consumption 60-80% across both billing models (GitHub Copilot per-request, Anthropic API per-token) through multi-model orchestration, observability, and workflow authoring guidance.

## Approach

Minimal custom code. Leverage OpenCode SDK v2 native capabilities (subagents, per-message model override, token tracking, agent auto-discovery). Build only what the SDK doesn't provide.

## Components

| Component              | Type                      | Purpose                                                           |
| ---------------------- | ------------------------- | ----------------------------------------------------------------- |
| Config enhancement     | Extend `buildSdkConfig()` | Translate `model_strategy` input → OpenCode agent configs         |
| TokenTracker           | New module                | Collect SDK token/cost metrics → action outputs + structured logs |
| Workflow-creator skill | Skill content             | Templates + guidance + analysis for efficient workflows           |

---

## Architecture

```
User's action.yml:
  model: anthropic/claude-opus-4-6
  model_strategy: '{"explore":"haiku","validate":"haiku","generate":"sonnet"}'

        │
        ▼

Runner (at startup):
  1. Reads model_strategy input
  2. Resolves short names via provider.list()
  3. Configures OpenCode agents:
     - primary agent → opus (main session)
     - explore agent → haiku (subagent)
     - validate agent → haiku (subagent)
     - generate agent → sonnet (subagent)
  4. Sends workflow prompt to main session
  5. Agent autonomously spawns subtasks as needed

        │
        ▼

TokenTracker (during execution):
  - Listens to SDK message.updated events
  - Extracts tokens/cost from AssistantMessage on session.idle
  - On completion → sets action outputs + logs summary

        │
        ▼

Action outputs:
  total_tokens, input_tokens, output_tokens,
  reasoning_tokens, cache_read_tokens, cache_write_tokens,
  total_cost, cost_breakdown
```

### Multi-Model Orchestration (Claude Code Pattern)

The main session runs on the primary model. The agent autonomously spawns subagents with cheaper models for delegated work — the same pattern Claude Code uses (Opus main agent, Haiku subagents for exploration).

```
Main Session (Opus - primary)
  │
  ├─ Agent needs to explore codebase
  │     → spawns explore subagent (Haiku)
  │     ← result fed back to main session
  │
  ├─ Agent continues reasoning with results
  │
  ├─ Agent generates implementation
  │     → spawns generate subagent (Sonnet)
  │     ← result fed back to main session
  │
  ├─ Agent needs validation
  │     → spawns validate subagent (Haiku)
  │     ← result fed back to main session
  │
  └─ Agent produces final output
```

**The runner configures agents. The agent decides when to delegate. The workflow content instructs the agent on delegation patterns.**

Responsibilities:

- **Runner** — configures agents with models
- **Agent** — autonomously spawns subtasks
- **Workflow content** — instructs agent on when/how to delegate
- **Workflow-creator skill** — teaches users to write effective delegation instructions

---

## Component Details

### 1. Config Enhancement

**Location:** Extend `buildSdkConfig()` in `src/opencode.ts`

**New action input:**

```yaml
# action.yml
model_strategy:
  description: 'JSON mapping of task types to models for multi-model workflows. Short names (opus, sonnet, haiku) or full model IDs.'
  required: false
  default: ''
```

**Translation logic:**

```typescript
// Input:
{ "primary": "opus", "explore": "haiku", "validate": "haiku", "generate": "sonnet" }

// Resolved to OpenCode agent config:
{
  agent: {
    explore: {
      model: "anthropic/claude-haiku-4-5-20251001",
      mode: "subagent",
      description: "Exploration and codebase scanning tasks"
    },
    validate: {
      model: "anthropic/claude-haiku-4-5-20251001",
      mode: "subagent",
      description: "Validation and checking tasks"
    },
    generate: {
      model: "anthropic/claude-sonnet-4-6-20260301",
      mode: "subagent",
      description: "Code generation and implementation tasks"
    }
  }
}
```

**Resolution rules:**

1. `primary` → sets the main session model (existing `model` input). If both `primary` in strategy and `model` input are provided, `model` input takes precedence.
2. Other task types → become subagent configs merged into SDK config
3. Short names (`opus`, `sonnet`, `haiku`) → resolved to latest available model from connected providers via `provider.list()`
4. Full model IDs (e.g., `anthropic/claude-sonnet-4-6`) → used as-is
5. Merges with (not replaces) agents from user's `opencode_config` file. If both define the same agent name, `model_strategy` takes precedence.
6. Unknown task type keys (not in `primary`, `explore`, `validate`, `format`, `generate`, `default`) are accepted and become custom subagent configs — enabling user-defined task types.

**Input validation:**

- `model_strategy` must be valid JSON if provided, otherwise the runner fails with a clear error
- Maximum size: 10KB (consistent with existing input limits)
- Each value must be a non-empty string (short name or full model ID)

**Error handling for model resolution:**

- If `provider.list()` fails → runner falls back to using the `model` input for all agents and logs a warning
- If a short name cannot be resolved (no matching model in connected providers) → runner fails with a clear error listing available models
- If multiple providers offer the same model family → prefer the provider matching the `model` input's provider, or the first connected provider

**Data flow through codebase:**

1. `action.yml` defines new `model_strategy` input
2. `getInputs()` in `src/config.ts` reads and validates the JSON string → adds `modelStrategy` field to `ActionInputs` type
3. `runWorkflow()` in `src/runner.ts` passes `modelStrategy` to `opencode.initialize()` via `InitializeOptions`
4. `buildSdkConfig()` in `src/opencode.ts` translates `modelStrategy` → OpenCode agent configs and merges into SDK config

**Default behavior (no `model_strategy` provided):**
All task types default to the `model` input. Subagents are still configured, all using the same model. This ensures the agent always has the subagent infrastructure available. Users can later switch to cheaper models without changing workflows.

Note: Configuring subagents in the SDK config is a declaration-only operation — it does not add overhead to API requests. Agent definitions are local to the OpenCode server and only consume resources when the agent actually spawns a subtask.

```
model: "anthropic/claude-sonnet-4-6"
model_strategy: (not provided)

→ All agents configured with anthropic/claude-sonnet-4-6
```

### 2. TokenTracker

**Location:** New module `src/token-tracker.ts`

**Data source:** SDK `AssistantMessage` type — fields `tokens` (input, output, reasoning, cache.read, cache.write) and `cost` (dollars). Collected when `message.updated` events fire. Only the final message state is tracked (on `session.idle`), not intermediate streaming updates, to avoid double-counting.

**Aggregated metrics:**

```typescript
type TokenSummary = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
  perModel: Record<
    string,
    {
      modelId: string;
      tokens: { input: number; output: number; reasoning: number };
      cache: { read: number; write: number };
      cost: number;
      messageCount: number;
    }
  >;
};
```

**Structured logging (GitHub Actions log groups):**

```
::group::Token Usage Summary
┌─────────────┬────────┬────────┬───────────┬─────────────┬──────────────┬──────────┐
│ Model       │ Input  │ Output │ Reasoning │ Cache Read  │ Cache Write  │ Cost     │
├─────────────┼────────┼────────┼───────────┼─────────────┼──────────────┼──────────┤
│ opus-4-6    │ 45,200 │ 12,300 │ 8,000     │ 10,200      │ 2,800        │ $0.4521  │
│ haiku-4-5   │ 8,100  │ 2,400  │ 0         │ 2,200       │ 400          │ $0.0105  │
├─────────────┼────────┼────────┼───────────┼─────────────┼──────────────┼──────────┤
│ Total       │ 53,300 │ 14,700 │ 8,000     │ 12,400      │ 3,200        │ $0.4626  │
└─────────────┴────────┴────────┴───────────┴─────────────┴──────────────┴──────────┘
::endgroup::
```

**Action outputs (via `@actions/core`):**

| Output               | Description                                         |
| -------------------- | --------------------------------------------------- |
| `total_tokens`       | Total tokens consumed across all models             |
| `input_tokens`       | Total input tokens                                  |
| `output_tokens`      | Total output tokens                                 |
| `reasoning_tokens`   | Total reasoning/thinking tokens                     |
| `cache_read_tokens`  | Total prompt cache read tokens                      |
| `cache_write_tokens` | Total prompt cache write tokens                     |
| `total_cost`         | Total estimated cost in USD                         |
| `cost_breakdown`     | JSON string with per-model token and cost breakdown |

**Integration point:** Hooks into existing event loop in `opencode.ts`. Listens to `message.updated` events, buffers message IDs. On `session.idle`, fetches final message state via `session.messages()` and extracts token data. This avoids double-counting from intermediate streaming events.

**Subtask message handling:** Subtask messages are tracked independently in `perModel` using the subtask's model ID. They do not roll up into the parent message — the parent's `AssistantMessage.tokens` already reflects only the parent model's usage.

**Graceful degradation:** Token tracking failures (missing `tokens` field, SDK event errors) are non-fatal. The runner logs a warning and continues. Missing metrics are reported as 0 in outputs.

**Table formatting:** Uses hand-rolled string formatting (pad/align). No external library needed.

**Serialization:** `perModel` uses `Record<string, ...>` (plain object) for direct JSON serialization in `cost_breakdown` output.

**No new dependencies.** Uses `@actions/core` (already a dependency).

### 3. Workflow-Creator Skill Enhancement

**Location:** Workflow-creator skill files (existing skill to be enhanced with token optimization knowledge). The `<!-- model-strategy: ... -->` block in workflow templates is informational content for the agent — the runner does NOT parse it. Model strategy for the runner comes exclusively from the `model_strategy` action input.

#### A) Templates

Pre-built workflow templates with subtask delegation patterns:

```markdown
<!-- model-strategy:
  primary: opus
  explore: haiku
  validate: haiku
  generate: sonnet
-->

# Refactor Workflow Template

You have subagents available for different task types:

- Use the **explore** agent for scanning files, searching patterns, reading code
- Use the **validate** agent for checking results, verifying constraints
- Use the **generate** agent for writing code, creating files

## Task

[User's task description here]

## Instructions

1. First, delegate to the explore agent to understand the current codebase
2. Plan the refactoring approach (use your primary model for this)
3. Delegate code generation to the generate agent
4. Delegate validation of results to the validate agent
```

Template categories:

- **Explore & refactor** — scan → plan → generate → validate
- **Code review** — explore → analyze → report
- **Feature implementation** — plan → generate → validate
- **Bug investigation** — explore → analyze → fix → validate
- **Single-task simple** — no subtasks, single model

#### B) Best Practices Guidance

The skill teaches users:

1. **When to use subtasks** — exploration, validation, formatting are cheap; planning and analysis need the primary model
2. **How to instruct the agent about delegation** — explicit instructions in workflow content
3. **Cost implications** — Haiku is ~60x cheaper than Opus for input tokens
4. **Prompt specificity** — "Fix JWT validation in src/auth/validate.ts" vs "Fix the auth bug"
5. **One concern per workflow** — avoid compound mega-workflows

#### C) Active Analysis

When a user drafts a workflow, the skill:

1. Checks if `model-strategy` is defined — suggests adding one if missing
2. Identifies steps that could be delegated to cheaper models
3. Flags overly broad prompts that will cause expensive exploration
4. Suggests splitting compound tasks
5. Estimates relative cost impact

---

## Action Inputs & Outputs

**New input:**

```yaml
model_strategy:
  description: 'JSON mapping of task types to models for multi-model workflows. Short names (opus, sonnet, haiku) or full model IDs. Example: {"explore":"haiku","validate":"haiku","generate":"sonnet"}'
  required: false
  default: ''
```

**New outputs:**

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

**Usage example:**

```yaml
- uses: arch-playground/ai-workflow-runner@v1
  id: workflow
  with:
    workflow_path: workflows/refactor.md
    model: anthropic/claude-opus-4-6
    model_strategy: '{"explore":"haiku","validate":"haiku","generate":"sonnet"}'

- name: Check cost
  run: |
    echo "Total cost: ${{ steps.workflow.outputs.total_cost }}"
    echo "Tokens used: ${{ steps.workflow.outputs.total_tokens }}"
```

---

## Testing

### TokenTracker (unit tests)

- Aggregation logic — correct accumulation across messages (use fixture data resembling real `AssistantMessage` objects)
- Per-model breakdown — tracks metrics per model correctly, subtask messages tracked independently
- Log formatting — table renders correctly with various data shapes (single model, multiple models, zero values)
- Action outputs — correct values set via `@actions/core`
- Graceful degradation — missing `tokens` field logs warning, does not crash
- Edge cases — zero tokens, missing fields, single message sessions
- Serialization — `cost_breakdown` JSON output is valid and contains all per-model data

### Config Enhancement (unit tests)

- Strategy parsing — valid JSON, short names, full model IDs
- Resolution — short names resolve to correct models from provider list (mock `provider.list()`)
- Merging — strategy agents merge with user's existing opencode config without overwriting
- Conflict resolution — `model` input takes precedence over `primary` in strategy; strategy takes precedence over opencode_config for same agent name
- Default behavior — no strategy uses `model` input for all agents
- Invalid input — malformed JSON, empty values, oversized input (>10KB)
- Resolution failures — unknown short names produce clear error; `provider.list()` failure falls back gracefully

### Integration tests

- Full flow — workflow with `model_strategy` input → agents configured correctly in SDK
- TokenTracker receives real SDK events → produces correct outputs
- Backward compatibility — existing workflows without strategy work unchanged

### Workflow-creator skill

- Template validation — all templates are valid markdown with correct syntax
- Analysis accuracy — skill correctly identifies delegation opportunities

---

## Known Limitations

- **Thinking budget control** — SDK v2 tracks `tokens.reasoning` but does not expose a setter for `max_thinking_tokens`. Read-only. Revisit when SDK adds support.
- **Cost estimation before execution** — SDK provides cost after execution, not prediction. Cannot warn users before running.
- **Agent auto-routing** — The agent must be explicitly instructed in the workflow to use subtasks. No automatic task classification by the runner.

---

## Decisions Log

| Decision                                       | Rationale                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Drop ContextCompressor                         | Workflow files are user-authored intent — stripping content risks removing important context. Low ROI since files are typically small. |
| Drop WorkflowParser as separate module         | Just parsing a YAML block from HTML comment — ~20 lines, not worth a module. Folded into config logic.                                 |
| Drop ModelRouter as separate module            | SDK handles per-message/per-subtask model selection natively. Runner just configures agents.                                           |
| Drop SessionCache                              | SDK already manages session context server-side with auto-compaction and prompt caching.                                               |
| Use SubtaskPartInput pattern                   | Replicates Claude Code's Opus main + Haiku subagent pattern using SDK-native capabilities.                                             |
| Agent decides delegation                       | Runner configures agents, workflow instructs delegation patterns, agent autonomously decides — clean separation of concerns.           |
| Default all agents to `model` input            | Ensures subagent infrastructure is always available, users can optimize later without workflow changes.                                |
| model-strategy block stays in workflow content | Agent can read the strategy and understand available models — not stripped by parser.                                                  |
