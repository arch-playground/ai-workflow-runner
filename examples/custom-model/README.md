# Custom Model Selection Example

This example demonstrates how to select a specific AI model and discover available models using the AI Workflow Runner.

## Prerequisites

- A GitHub repository
- An OpenCode API key stored in GitHub Secrets

## Features

This example includes two workflows:

| Workflow          | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `run-ai.yml`      | Run the AI workflow with a user-selected model      |
| `list-models.yml` | List all available models from configured providers |

## Setup

1. **Copy the workflow files** — Copy `workflow.md` and both workflow YAML files to your repository.

2. **Add your API key** — Go to your repository's **Settings > Secrets and variables > Actions** and add a secret named `OPENCODE_API_KEY`.

3. **(Optional) Add provider config** — For multiple providers, go to **Settings > Secrets and variables > Actions > Secrets** and add a secret named `OPENCODE_CONFIG` with provider configuration JSON:

   ```json
   {
     "provider": {
       "anthropic": {
         "apiKey": "sk-ant-xxxxx"
       }
     }
   }
   ```

## Listing Available Models

Use the **List Available Models** workflow to discover which models are available:

1. Go to **Actions > List Available Models**
2. Click **Run workflow**
3. Check the workflow output for the list of models

The output will show models in this format:

```
=== Available Models ===
  - anthropic/claude-sonnet-4-5-20250929: Claude Sonnet 4.5 (anthropic)
  - anthropic/claude-haiku-4-5-20251001: Claude Haiku 4.5 (anthropic)
========================
```

> **Note:** `workflow_path` is ignored when `list_models` is `'true'`. The action lists models and exits without running any workflow.

## Running with a Specific Model

Use the **Run AI Workflow (Custom Model)** workflow:

1. Go to **Actions > Run AI Workflow (Custom Model)**
2. Click **Run workflow**
3. Enter the model identifier (e.g., `anthropic/claude-sonnet-4-5-20250929`)
4. The workflow runs with the selected model

## Using the `model` Input

The `model` input overrides the default model from configuration. Pass any model identifier supported by your configured provider:

```yaml
with:
  model: 'anthropic/claude-sonnet-4-5-20250929'
```

## Customization

- Edit `workflow.md` to change the AI prompt
- Use `opencode_config` to configure provider-specific settings
- See the [main README](../../README.md) for all available inputs
