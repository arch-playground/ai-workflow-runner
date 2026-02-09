# Basic AI Workflow Example

A minimal example showing how to run an AI workflow using the AI Workflow Runner GitHub Action.

## Prerequisites

- A GitHub repository
- An OpenCode API key stored in GitHub Secrets

## Setup

1. **Copy the workflow file** — Copy `workflow.md` from this directory to your repository (e.g., `workflows/workflow.md`).

2. **Copy the GitHub Actions workflow** — Copy `.github/workflows/run-ai.yml` to your repository's `.github/workflows/` directory.

3. **Add your API key** — Go to your repository's **Settings > Secrets and variables > Actions** and add a secret named `OPENCODE_API_KEY` with your OpenCode API key.

4. **Trigger the workflow** — Go to **Actions > Run AI Workflow** and click **Run workflow** to start manually.

## How It Works

1. The GitHub Action checks out your repository
2. It reads `workflow.md` containing the AI prompt
3. The prompt is sent to the OpenCode SDK for execution
4. The AI processes the prompt and streams its response
5. The action outputs the execution status and result

## Customization

- Edit `workflow.md` to change the AI prompt
- Adjust `timeout_minutes` in the workflow YAML to change the time limit
- Add `env_vars` to pass environment variables to the workflow
- See the [main README](../../README.md) for all available inputs
