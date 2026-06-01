# Conversation Logging Example

Demonstrates how to export the full AI conversation transcript and write a GitHub job summary.

## What this example does

- Runs an AI workflow with transcript export enabled
- Writes a human-readable job summary (token/cost/duration totals + tool activity)
- Uploads the `conversation.json` transcript as a GitHub Actions artifact

## Prerequisites

- A GitHub repository
- An OpenCode API key stored in GitHub Secrets as `OPENCODE_API_KEY`

## Setup

1. **Copy the workflow files** — Copy `workflow.md` to your repository (e.g., `workflows/workflow.md`).
2. **Copy the GitHub Actions workflow** — Copy `.github/workflows/run-ai.yml` to your repository.
3. **Add your API key** — Go to **Settings > Secrets and variables > Actions** and add `OPENCODE_API_KEY`.
4. **Trigger** — Go to **Actions > AI Workflow with Conversation Logging** and click **Run workflow**.

## Key inputs used

| Input               | Value    | Purpose                                             |
| ------------------- | -------- | --------------------------------------------------- |
| `export_transcript` | `'true'` | Export full conversation to `conversation.json`     |
| `write_job_summary` | `'true'` | Write token/cost/tool summary to GitHub job summary |

## Output: `transcript_json_path`

The `transcript_json_path` output holds the resolved path of the exported JSON file
(defaults to `$RUNNER_TEMP/conversation.json`). The `actions/upload-artifact` step
uploads this file so you can download and inspect it from the Actions run page.

> **Note:** The action itself cannot upload artifacts — artifact upload must be done
> in the consuming workflow (design D6). The example shows the recommended pattern.

## Inspecting the transcript

The `conversation.json` file contains the full message array from the SDK:
each entry has `info` (role, cost, tokens) and `parts` (text, tool calls, reasoning).
Secret values passed via `env_vars` are scrubbed before the file is written.
