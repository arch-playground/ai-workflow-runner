# Workflow Creator Skill

A Claude Code skill that guides you through creating multi-job GitHub Actions workflows using `ai-workflow-runner`. No manual YAML authoring, no schema lookups — just a short conversation and all files are generated for you.

---

## Installation

Install into your current project:

```bash
npx skills add arch-playground/ai-workflow-runner@workflow-creator
```

Install globally (available in all projects):

```bash
npx skills add arch-playground/ai-workflow-runner@workflow-creator -g
```

**Prerequisites:**

- [Claude Code](https://claude.ai/claude-code) installed and authenticated
- Node.js / npx — optional, used to validate the generated YAML with `action-validator`

---

## How to Start

Open Claude Code in your repository root and say any of:

- `"Create a GitHub Actions workflow"`
- `"I want to automate with ai-workflow-runner"`
- `"Build a workflow with AI steps"`
- `"Help me set up ai-workflow-runner"`
- `"Workflow creator"`

To edit an existing workflow:

- `"Edit my workflow at .github/workflows/my-workflow.yml"`

---

## The Four Steps

### Step 01 — Discover

Claude collects the basics about your workflow, one question at a time:

1. **Workflow name and purpose** — what this workflow does in one sentence
2. **Trigger** — `workflow_dispatch` (manual), `push`, `pull_request`, `schedule`, or custom
3. **Action reference** — defaults to `arch-playground/ai-workflow-runner@v1`; ask if you use a fork or different version
4. **Steps** — for each step: name, slug (job ID), objective in one sentence, expected output

After collecting all steps, Claude shows a summary for confirmation before moving on.

**Limits:** Warns at 10 steps; halts at 21+ steps and suggests splitting into multiple workflows.

---

### Step 02 — Dependencies

Claude maps which steps can run in parallel and which must wait for others:

- Asks "does step B need to wait for step A to finish?"
- Builds the `needs:` graph and validates it is acyclic
- Renders a **Mermaid diagram** of the dependency graph — you confirm or request corrections
- Asks how data is passed across each dependency edge:
  - **String value** (status, path, JSON summary) → GitHub Actions `outputs`
  - **File or directory** → `actions/upload-artifact` / `actions/download-artifact`
- Collects **auth method** and **default timeout**

#### Auth Methods

| Option                 | Secret Required          | When to Use                            |
| ---------------------- | ------------------------ | -------------------------------------- |
| Anthropic API key      | `OPENCODE_API_KEY`       | Default — simplest setup               |
| GitHub Copilot         | `COPILOT_AUTH` (JSON)    | You have a Copilot subscription        |
| Custom provider config | `OPENCODE_CONFIG` (JSON) | Azure OpenAI, Bedrock, etc.            |
| Model override only    | `OPENCODE_API_KEY`       | Pin a specific Anthropic model version |

---

### Step 03 — Prompts

For each step, Claude generates a suggested AI prompt file and presents it for review:

```
[A] Accept as suggested
[E] Edit
```

Every generated prompt file follows a strict 5-section structure:

```markdown
# Step Name

## Objective

One sentence describing exactly what this step must accomplish.

## Context

Data available from previous steps (via env vars), or notes about the repo state.

## Constraints

- What the AI must NOT do
- Scope limits, file restrictions, etc.

## Output Format

Exact specification: JSON schema, file path and structure, or Markdown heading layout.

## Success Criteria

- Machine-checkable criteria that map directly to validation script checks
```

After all prompts are confirmed, Claude asks whether you want **validation scripts** for any steps. Validation scripts check `AI_LAST_MESSAGE` after each AI run and trigger a retry with feedback if the output doesn't meet the criteria.

---

### Step 04 — Generate

Claude runs a pre-generation checklist (7 items), then writes all files:

| File                                  | Description                                                               |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `.github/workflows/<name>.yml`        | Complete multi-job workflow with `needs:` graph, auth, and artifact steps |
| `workflows/<step-slug>.md`            | AI prompt file for each step                                              |
| `workflows/validation/<step-slug>.py` | Validation script per step (if requested)                                 |
| `.github/workflows/list-models.yml`   | Optional utility workflow to discover available models                    |

After writing, Claude runs `npx action-validator` against the generated YAML. If it finds errors, it regenerates and retries up to 3 times before surfacing the raw errors for manual fixing.

---

## What Gets Generated

### Example: 3-Step Sequential Workflow

Input: "Scan the repo, summarize findings, generate a report"

**Dependency graph:**

```
scan-repo → summarize-findings → generate-report
```

**Generated `.github/workflows/analyze-repo.yml`** (simplified):

```yaml
name: Analyze Repository

on:
  workflow_dispatch:

jobs:
  scan-repo:
    runs-on: ubuntu-latest
    outputs:
      summary: ${{ steps.ai.outputs.result }}
    steps:
      - uses: actions/checkout@v6
      - name: Scan Repository
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/scan-repo.md'
          timeout_minutes: '30'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

  summarize-findings:
    needs: scan-repo
    runs-on: ubuntu-latest
    outputs:
      summary: ${{ steps.ai.outputs.result }}
    steps:
      - uses: actions/checkout@v6
      - name: Summarize Findings
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/summarize-findings.md'
          env_vars: '{"SCAN_RESULT": "${{ needs.scan-repo.outputs.summary }}"}'
          timeout_minutes: '30'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

  generate-report:
    needs: summarize-findings
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Generate Report
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/generate-report.md'
          env_vars: '{"SUMMARY": "${{ needs.summarize-findings.outputs.summary }}"}'
          timeout_minutes: '30'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

### Example: Fan-Out / Fan-In (Parallel Steps)

Input: "Initialize, then generate docs for 3 modules in parallel, then create an index"

**Dependency graph:**

```
init → module-a-docs ─┐
     → module-b-docs ─┤→ create-index
     → module-c-docs ─┘
```

The generated YAML has `needs: init` on all three module jobs (so they run in parallel), and `needs: [module-a-docs, module-b-docs, module-c-docs]` on `create-index`.

---

## Editing an Existing Workflow

Point the skill at an existing workflow file:

```
"Edit my workflow at .github/workflows/analyze-repo.yml"
```

The skill:

1. Reads the existing YAML and maps each job to its prompt file via `workflow_path:`
2. Reports any jobs it cannot map (renamed or manually edited)
3. In Step 03, skips unchanged steps — only prompts for new or modified steps
4. In Step 04, only regenerates files for changed steps; preserves all other prompt files

If more than 30% of jobs cannot be mapped, the skill offers to fall back to full re-creation mode (existing prompt files are never deleted).

---

## Resuming an Interrupted Session

Progress is saved in `.workflow-creator-wip.md` at your repo root after each step. If you close Claude Code mid-session, reopen it and start the skill again — it will offer to resume.

If you want to start fresh instead:

```
"Archive and start a new workflow"
```

The WIP file is archived as `.workflow-creator-wip-archived-<date>.md` before the new session begins.

---

## List Available Models

After generation, the skill offers to create `.github/workflows/list-models.yml` — a utility workflow that prints all models available to your configured provider. Run it from the GitHub Actions UI whenever you want to verify model names before using them in your real workflow.

You can also create it manually at any time by saying:

```
"Create a list-models workflow"
```

---

## Tips

- **One step = one focused AI task.** If a step is doing two things, split it. Each prompt file should produce exactly one output artifact.
- **Describe outputs concretely.** "A JSON file" is good. "Some data" is not — Claude will ask you to be more specific.
- **Use validation scripts for structured output.** If a step produces JSON or a file that must exist, add a validation script to enforce it with auto-retry.
- **Parallel steps save time.** If steps don't depend on each other, let them run in parallel. A 10-step fully linear workflow takes 10× longer than a workflow with 5 parallel steps.
- **Test with `list-models` first.** Before running a real workflow, use the list-models utility to confirm your auth setup is working and see which models are available.

---

## Troubleshooting

| Issue                                     | Cause                            | Fix                                                                                                                                |
| ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `action-validator` reports errors         | Generated YAML has schema issues | The skill auto-retries up to 3 times; if still failing, fix the reported lines manually                                            |
| Job fails with "workflow_path not found"  | Prompt file path mismatch        | Check that `workflows/<slug>.md` exists and the path in the YAML matches exactly                                                   |
| Downstream job can't access upstream file | No artifact transfer configured  | Return to Step 02 and mark the dependency edge as "file" strategy, then regenerate                                                 |
| Auth fails                                | Wrong secret name or format      | Check the secret name matches what the YAML references; see [auth patterns](../skills/workflow-creator/knowledge/auth-patterns.md) |
| WIP file conflicts                        | Multiple interrupted sessions    | The skill lists existing WIP files and lets you resume or archive before starting                                                  |
