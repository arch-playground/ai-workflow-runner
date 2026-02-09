# AI Workflow with Validation Example

This example demonstrates how to validate AI output using a Python script and automatically retry when the output doesn't meet requirements.

## Prerequisites

- A GitHub repository
- An OpenCode API key stored in GitHub Secrets
- Python is pre-installed in the Docker container (no additional setup needed)

## How Validation Works

1. The AI executes the workflow prompt and produces output
2. The validation script runs with the AI's last message available in the `AI_LAST_MESSAGE` environment variable
3. The script checks whether the output meets requirements:
   - **Empty output or `true`** — Validation passes, workflow completes successfully
   - **Any other output** — Validation fails, the output string is sent back to the AI as feedback for correction
4. Steps 1-3 repeat until validation passes or `validation_max_retry` is reached

## Setup

1. **Copy all files** — Copy the `workflow.md`, `validate.py`, and `.github/workflows/run-ai.yml` to your repository, preserving the directory structure.

2. **Add your API key** — Go to your repository's **Settings > Secrets and variables > Actions** and add a secret named `OPENCODE_API_KEY` with your OpenCode API key.

3. **Trigger the workflow** — Go to **Actions > Run AI Workflow with Validation** and click **Run workflow**.

## Files

| File                           | Purpose                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `workflow.md`                  | AI prompt requesting structured JSON output                                   |
| `validate.py`                  | Python script that validates the AI output is valid JSON with required fields |
| `.github/workflows/run-ai.yml` | GitHub Actions workflow configuration                                         |

## Validation Script Details

The included `validate.py` script:

- Reads the AI's response from the `AI_LAST_MESSAGE` environment variable
- Checks that the output is valid JSON
- Verifies required fields (`name`, `description`, `language`) are present
- Returns `true` on success or a descriptive error message on failure

## Configuration

- `validation_max_retry: '3'` — The AI gets up to 3 attempts to produce valid output
- The default is `5` retries (configurable from 1 to 20)
- See the [main README](../../README.md) for all available inputs
