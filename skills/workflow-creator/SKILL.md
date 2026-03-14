---
name: workflow-creator
description: >
  Guides users through creating or editing multi-job GitHub Actions workflows
  using ai-workflow-runner. Use when the user says "create a github actions workflow",
  "I want to automate with ai-workflow-runner", "build a workflow", "create workflow steps",
  "workflow creator", "edit my workflow", "help me set up a github actions ai workflow",
  "generate a workflow yaml", "create ai workflow steps", "automate tasks with ai-workflow-runner",
  or asks how to chain multiple AI steps together with dependencies.
  Also use when the user says "evaluate my workflow", "run eval", "benchmark workflow",
  "grade workflow steps", or wants to test workflow step quality against a sample codebase.
---

# Workflow Creator

A guided skill that takes you from "I want to automate X" to a working multi-job GitHub Actions workflow using `ai-workflow-runner` — with AI prompt files, dependency graphs, optional validation scripts, and correct auth setup.

---

## When to Use This Skill

Use this skill when you want to:

- Create a new `.github/workflows/*.yml` that uses `ai-workflow-runner` for one or more AI steps
- Design a multi-step workflow with parallel and sequential job dependencies
- Generate individual `workflows/<workflow-slug>/instructions/<step-name>.md` AI prompt files for each step
- Add validation scripts that enforce AI output quality with retry loops
- Edit or extend an existing `ai-workflow-runner`-based workflow (add/remove/modify steps)
- Get guided help with auth setup (Anthropic API key, GitHub Copilot, custom model)
- Learn how to pass data between AI workflow steps (outputs vs artifacts)
- Evaluate workflow step prompt quality against a sample codebase
- Benchmark step consistency across multiple runs with before/after comparison
- Grade workflow outputs against generated or custom assertions

---

## What This Skill Produces

For each workflow you create, the skill generates:

1. **`.github/workflows/<workflow-name>.yml`** — the complete multi-job GitHub Actions workflow with correct `needs:` dependency graph, auth setup, and artifact transfer steps
2. **`workflows/<workflow-slug>/instructions/<step-name>.md`** (one per step) — focused AI prompt files with objective, constraints, output format, and success criteria
3. **`workflows/<workflow-slug>/validation/<step-name>.py`** (optional, per step) — validation scripts that check `AI_LAST_MESSAGE` and return retry feedback if the AI output doesn't meet quality criteria
4. **`.evaluations/workflows/<name>/benchmark.md`** (when evaluating) — evaluation report with pass rates, failure analysis, delta comparison, and actionable recommendations

---

## Prerequisites

- **CWD must be your target repository root** — the skill writes all files relative to your current working directory
- **Node.js / npx (optional but recommended)** — used to run `action-validator` for YAML schema validation after generation. If not installed, validation is skipped with a warning and you'll need to run it manually
- **GitHub repository** with Actions enabled — to actually run the generated workflow

---

## How to Start

To create a new workflow, just say:

- "Create a GitHub Actions workflow"
- "I want to build an AI workflow"
- "Help me set up ai-workflow-runner"

To edit an existing workflow:

- "Edit my workflow at `.github/workflows/my-workflow.yml`"
- Provide the path to the existing workflow file

To evaluate an existing workflow:

- "Evaluate my workflow"
- "Run eval on service-analysis"
- "Benchmark my workflow steps"

---

## Workflow Steps

The skill guides you through 4 focused steps:

| Step     | Name                                                                                           | What Happens                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 01       | Discover                                                                                       | Collect workflow name, trigger, action reference, and steps with objectives                            |
| 02       | Dependencies                                                                                   | Map parallel vs sequential relationships, confirm Mermaid diagram, choose auth + data-passing strategy |
| 03       | Prompts                                                                                        | Review and edit/accept AI prompt for each step; optionally add validation scripts                      |
| 04       | Generate                                                                                       | Produce all output files, run pre-generation checklist, validate with `action-validator`               |
| Evaluate | Run steps against a sample codebase, grade outputs, compare before/after, get benchmark report |

Progress is tracked in `.workflow-creator-wip.md` at your repo root. If you interrupt the workflow, you can resume from where you left off.

---

## Starting the Skill

Read fully and follow: `skills/workflow-creator/workflow.md` to begin the guided process.
