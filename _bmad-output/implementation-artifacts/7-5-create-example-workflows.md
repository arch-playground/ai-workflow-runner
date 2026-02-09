# Story 7.5: Create Example Workflows

Status: done

## Story

As a **GitHub Actions user**,
I want **complete example workflows**,
So that **I can quickly set up AI workflows in my repository**.

## Acceptance Criteria

1. **Given** `examples/basic-workflow/` **When** user copies files **Then** `README.md` explains setup steps **And** `workflow.md` contains a simple AI workflow **And** `.github/workflows/run-ai.yml` shows action usage

2. **Given** `examples/with-validation/` **When** user copies files **Then** `README.md` explains validation setup **And** `validate.py` shows a Python validation script **And** the workflow demonstrates retry behavior

3. **Given** `examples/github-copilot/` **When** user copies files **Then** `README.md` explains Copilot token setup **And** workflow shows `auth_config` usage with Copilot provider **And** clear instructions for generating a personal Copilot token

4. **Given** `examples/custom-model/` **When** user copies files **Then** `README.md` explains model selection **And** workflow shows `model` input usage **And** demonstrates `list_models` feature

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `action.yml` - Verify all current input names and defaults
  - [x] Read `README.md` - Understand current documentation state

- [x] **Task 2: Create `examples/basic-workflow/` directory and files** (AC: 1)
  - [x] Create `examples/basic-workflow/README.md`:
    - Title: "Basic AI Workflow Example"
    - Prerequisites section: GitHub repository, OpenCode API key stored in GitHub Secrets
    - Step-by-step setup: (1) Copy `workflow.md` to repo, (2) Copy `.github/workflows/run-ai.yml`, (3) Add `OPENCODE_API_KEY` to repository secrets, (4) Push and trigger
    - Explanation of what the workflow does (reads the workflow.md, sends to OpenCode SDK, streams output)
    - Link back to main README for full input reference
  - [x] Create `examples/basic-workflow/workflow.md`:
    - Simple AI prompt (e.g., "Analyze this repository and provide a summary of the project structure, key files, and technologies used.")
    - Keep it realistic but provider-agnostic
  - [x] Create `examples/basic-workflow/.github/workflows/run-ai.yml`:
    - Trigger on `workflow_dispatch` (manual trigger) for safety
    - Uses `actions/checkout@v4`
    - Uses `owner/ai-workflow-runner@v1` with `workflow_path: 'examples/basic-workflow/workflow.md'`
    - Set `timeout_minutes: '10'`
    - Show output capture with `${{ steps.ai.outputs.status }}` and `${{ steps.ai.outputs.result }}`
    - Add `id: ai` to the action step for output reference
    - Add a follow-up step that prints the status and result

- [x] **Task 3: Create `examples/with-validation/` directory and files** (AC: 2)
  - [x] Create `examples/with-validation/README.md`:
    - Title: "AI Workflow with Validation Example"
    - Explains validation concept: script verifies AI output, returns feedback for retry
    - How validation works: `AI_LAST_MESSAGE` env var, empty/true = success, other = retry feedback
    - Setup steps similar to basic example but includes validation script
    - Notes on `validation_max_retry` and default (5)
  - [x] Create `examples/with-validation/workflow.md`:
    - AI prompt that produces structured output (e.g., "Generate a JSON summary of this repository with fields: name, description, language, dependencies")
    - Realistic use case that benefits from validation
  - [x] Create `examples/with-validation/validate.py`:
    - Python script that reads `AI_LAST_MESSAGE` from env
    - Validates the output is valid JSON
    - Checks for required fields
    - Prints `true` on success, descriptive feedback string on failure
    - Include `import os` and `import json` at top
    - DO NOT add any `#!/usr/bin/env python3` shebang - the runner handles interpreter selection
  - [x] Create `examples/with-validation/.github/workflows/run-ai.yml`:
    - Same base as basic example
    - Add `validation_script: 'examples/with-validation/validate.py'`
    - Add `validation_max_retry: '3'`
    - Show the retry behavior in comments

- [x] **Task 4: Create `examples/github-copilot/` directory and files** (AC: 3)
  - [x] Create `examples/github-copilot/README.md`:
    - Title: "GitHub Copilot Provider Example"
    - Explains using GitHub Copilot as the AI provider via OpenCode
    - Prerequisites: GitHub Copilot subscription (Individual, Business, or Enterprise)
    - Step-by-step Copilot token setup:
      1. Generate a GitHub Personal Access Token (classic) with `copilot` scope
      2. Store the token in GitHub repository Secrets as `COPILOT_TOKEN`
      3. The workflow writes an `auth.json` file from the secret before running the action
    - Explains `auth_config` input and the auth.json structure
    - Security note: auth file written from GitHub Secrets, never stored in repo
  - [x] Create `examples/github-copilot/workflow.md`:
    - Same or similar prompt to basic example
  - [x] Create `examples/github-copilot/.github/workflows/run-ai.yml`:
    - Trigger on `workflow_dispatch`
    - Uses `actions/checkout@v4`
    - **Step 1**: Write auth.json from secret:
      ```yaml
      - name: Write auth config
        run: echo '${{ secrets.COPILOT_AUTH }}' > auth.json
      ```
    - **Step 2**: Run AI workflow with `auth_config: 'auth.json'`
    - Show that `COPILOT_AUTH` secret contains the full JSON: `{"copilot": {"token": "ghu_xxx"}}`
    - In README, explain the auth.json structure expected by OpenCode SDK

- [x] **Task 5: Create `examples/custom-model/` directory and files** (AC: 4)
  - [x] Create `examples/custom-model/README.md`:
    - Title: "Custom Model Selection Example"
    - Explains `model` input for overriding default model
    - Explains `list_models` feature for discovering available models
    - Shows two workflows: one for listing models, one for using a specific model
    - Explains `opencode_config` input for full provider configuration
  - [x] Create `examples/custom-model/workflow.md`:
    - Same or similar prompt to basic example
  - [x] Create `examples/custom-model/.github/workflows/run-ai.yml`:
    - Trigger on `workflow_dispatch` with an `inputs.model` parameter (user-selectable)
    - Uses `actions/checkout@v4`
    - Step to optionally write config from GitHub Variable: `echo '${{ vars.OPENCODE_CONFIG }}' > config.json`
    - Run action with `model: '${{ github.event.inputs.model }}'` and `opencode_config: 'config.json'`
  - [x] Create `examples/custom-model/.github/workflows/list-models.yml`:
    - Separate workflow for listing models
    - Trigger on `workflow_dispatch`
    - Uses `owner/ai-workflow-runner@v1` with `list_models: 'true'`
    - `workflow_path` still required by action.yml but can use a dummy value — actually, `list_models: true` skips workflow validation, so set `workflow_path: 'unused'`
    - Note in README: `workflow_path` is ignored when `list_models` is true

- [x] **Final Task: Quality Checks**
  - [x] Verify all YAML files are valid syntax (no tabs, proper indentation)
  - [x] Verify all README.md files reference correct input names matching `action.yml`
  - [x] Verify `validate.py` script follows the validation pattern from the main README
  - [x] Verify no absolute paths, secrets, or sensitive data in example files
  - [x] Verify all `.github/workflows/*.yml` use proper `on: workflow_dispatch` trigger
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety (pre-existing js-yaml types error, unrelated to this story)

## Dev Notes

### Architecture & Implementation Guide

**This story creates ONLY static files (Markdown, YAML, Python). No TypeScript source changes.**

**File Structure to Create:**

```
examples/
├── basic-workflow/
│   ├── README.md
│   ├── workflow.md
│   └── .github/
│       └── workflows/
│           └── run-ai.yml
├── with-validation/
│   ├── README.md
│   ├── workflow.md
│   ├── validate.py
│   └── .github/
│       └── workflows/
│           └── run-ai.yml
├── github-copilot/
│   ├── README.md
│   ├── workflow.md
│   └── .github/
│       └── workflows/
│           └── run-ai.yml
└── custom-model/
    ├── README.md
    ├── workflow.md
    └── .github/
        └── workflows/
            ├── run-ai.yml
            └── list-models.yml
```

This structure matches the architecture document (`_bmad-output/planning-artifacts/architecture.md` - Project Structure section).

### Current Action Inputs Reference

All example workflows MUST use these exact input names from `action.yml`:

| Input                    | Required | Default   | Notes                                             |
| ------------------------ | -------- | --------- | ------------------------------------------------- |
| `workflow_path`          | Yes      | -         | Relative to workspace root                        |
| `prompt`                 | No       | `''`      | Max 100KB                                         |
| `env_vars`               | No       | `'{}'`    | JSON object, max 64KB, 100 entries                |
| `timeout_minutes`        | No       | `'30'`    | 1-360                                             |
| `validation_script`      | No       | `''`      | File path or inline with prefix                   |
| `validation_script_type` | No       | `''`      | `python` or `javascript`, auto-detected for files |
| `validation_max_retry`   | No       | `'5'`     | 1-20                                              |
| `opencode_config`        | No       | `''`      | Path to config.json (relative to workspace)       |
| `auth_config`            | No       | `''`      | Path to auth.json (relative to workspace)         |
| `model`                  | No       | `''`      | e.g., `anthropic/claude-3-opus`                   |
| `list_models`            | No       | `'false'` | `'true'` to list and exit                         |

### Action Outputs Reference

| Output   | Description                                     |
| -------- | ----------------------------------------------- |
| `status` | `success`, `failure`, `cancelled`, or `timeout` |
| `result` | JSON string (max 900KB)                         |

### GitHub Actions YAML Conventions

- All action inputs are strings — always quote values: `timeout_minutes: '10'` not `timeout_minutes: 10`
- Use `workflow_dispatch` trigger for examples (safe for users to copy)
- Reference action as `owner/ai-workflow-runner@v1` (placeholder — user replaces `owner`)
- Always include `actions/checkout@v4` before the action step
- Use step `id` to reference outputs: `id: ai` then `${{ steps.ai.outputs.status }}`

### Validation Script Conventions

From the main README and validation.ts implementation:

- `AI_LAST_MESSAGE` env var contains the AI's last response (truncated to ~100KB)
- Empty stdout or `true` = success
- Any other stdout = failure feedback sent back to AI
- Python scripts executed via `python3`, JS via `node`
- File-based scripts auto-detect type from `.py` / `.js` extension
- No shebang needed — runner handles interpreter selection

### Auth Config Structure (for Copilot example)

Based on Story 7.3 dev notes — SDK auth goes in `Config.provider` object:

```json
{
  "provider": {
    "copilot": {
      "token": "ghu_xxxxx"
    }
  }
}
```

The `loadJsonFile()` in opencode.ts reads and deep-merges this into SDK config.

### OpenCode Config Structure (for custom-model example)

```json
{
  "provider": {
    "anthropic": {
      "apiKey": "sk-ant-xxxxx"
    }
  },
  "model": "anthropic/claude-sonnet-4-5-20250929"
}
```

### List Models Behavior

From Story 7.4 implementation:

- `list_models: 'true'` triggers early return in `runWorkflow()` BEFORE workflow file validation
- `workflow_path` is NOT validated when listing models — set to any value or empty
- Output format:
  ```
  === Available Models ===
    - {model_id}: {model_name} ({provider})
  ========================
  ```
- Returns `{ success: true, output: JSON.stringify({ models }) }`

### Security Considerations for Examples

- NEVER include real API keys, tokens, or secrets in example files
- Always use `${{ secrets.XXX }}` for sensitive values
- Auth files should be written from secrets at runtime, not committed to repo
- Config files (non-sensitive) can use `${{ vars.XXX }}` (GitHub Variables)
- Remind users in README to add secrets via GitHub Settings > Secrets and variables > Actions

### Previous Story Intelligence

**From Story 7.4:**

- `listModels()` calls `client.config.providers()` — this is the correct SDK API
- `handleListModels()` in runner.ts wraps the flow with try/catch returning `RunnerResult`
- `workflow_path` can be set to `'unused'` when `list_models: true` — it's not validated

**From Story 7.3:**

- Config files loaded via `loadJsonFile()` using `readFile` with ENOENT catch
- Auth credentials go in `Config.provider` object (deep-merged)
- Error messages use `path.basename()` only — no absolute paths in output

**From Story 7.1:**

- `list_models` is a boolean parsed from string `'true'`/`'false'`
- All inputs are strings in `action.yml` — always quote YAML values

### Git Intelligence

Recent commits: `#Implement 7-1`, `#Implement 7-2`, `#Implement 7-3`, `#Implement 7-4`
No examples/ directory exists yet — all files are net-new creation.

### Test Design References

From `test-design-epic-7.md`, P3 tests for Story 7.5:

| Test ID      | Requirement                                                       |
| ------------ | ----------------------------------------------------------------- |
| 7.5-UNIT-001 | `examples/basic-workflow/workflow.md` exists                      |
| 7.5-UNIT-002 | `examples/basic-workflow/.github/workflows/run-ai.yml` valid YAML |
| 7.5-UNIT-003 | `examples/with-validation/` files exist                           |
| 7.5-UNIT-004 | `examples/github-copilot/` files exist                            |
| 7.5-UNIT-005 | `examples/custom-model/` files exist                              |

These are P3 (low priority) file existence checks. This story focuses on creating the content — tests are optional and can be added later.

### Project Structure Notes

- `examples/` directory is defined in the architecture but does not exist yet — create from scratch
- Each example is self-contained: own README, workflow.md, and GitHub Action workflow YAML
- Examples are reference implementations for users — they should be copy-paste ready

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.5] - Acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure] - examples/ directory layout
- [Source: _bmad-output/implementation-artifacts/test-design-epic-7.md] - Test IDs 7.5-UNIT-001 through 7.5-UNIT-005
- [Source: _bmad-output/implementation-artifacts/7-4-implement-list-models-feature.md] - List models implementation details
- [Source: _bmad-output/implementation-artifacts/7-3-load-config-files-and-pass-to-sdk.md] - Config/auth loading patterns
- [Source: action.yml] - Current action input definitions
- [Source: README.md] - Current documentation state

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered. All files created successfully on first attempt.

### Completion Notes List

- Created 4 complete example directories matching the architecture document's project structure
- All 5 YAML workflow files validated for correct syntax, indentation, and input names matching action.yml
- validate.py tested with valid JSON, invalid JSON, and missing fields — all cases produce correct output
- All 225 existing unit tests pass with no regressions
- lint and format checks pass clean
- typecheck has a pre-existing js-yaml types error unrelated to this story (no TypeScript files changed)
- No real secrets or sensitive data in any example files — only placeholder values in README documentation

### Change Log

- 2026-02-09: Created all example workflow directories and files (basic-workflow, with-validation, github-copilot, custom-model)
- 2026-02-09: Code review fixes — removed **pycache**, added **pycache** to .gitignore, added OPENCODE_API_KEY env to basic/validation workflows, made opencode_config conditional in custom-model workflows, changed vars to secrets for API key config, added auth.json cleanup step in copilot workflow, differentiated workflow.md prompts across examples

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 | **Date:** 2026-02-09

**Issues Found:** 2 High, 4 Medium, 1 Low — **All Fixed**

| ID  | Severity | Description                                                                                             | Resolution                                                                  |
| --- | -------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| H1  | HIGH     | `__pycache__/validate.cpython-312.pyc` artifact in untracked files, `.gitignore` missing `__pycache__`  | Deleted directory, added `__pycache__/` and `*.pyc` to `.gitignore`         |
| H2  | HIGH     | `custom-model` workflows always pass `opencode_config: 'config.json'` even when config file not written | Made conditional: `${{ secrets.OPENCODE_CONFIG && 'config.json' \|\| '' }}` |
| M1  | MEDIUM   | Story File List missing `__pycache__` artifact documentation                                            | Resolved by H1 fix (artifact deleted)                                       |
| M2  | MEDIUM   | READMEs reference `OPENCODE_API_KEY` secret but workflow YAMLs don't pass it to action                  | Added `env: OPENCODE_API_KEY` to basic-workflow and with-validation YAMLs   |
| M3  | MEDIUM   | Copilot example writes auth.json but never cleans up (security risk on self-hosted runners)             | Added `if: always()` cleanup step to remove auth.json                       |
| M4  | MEDIUM   | 3 of 4 workflow.md files identical — missed opportunity for educational variety                         | Gave github-copilot and custom-model unique, distinct prompts               |
| L1  | LOW      | `custom-model` README instructs storing API keys in GitHub Variables (not encrypted)                    | Changed to `secrets.OPENCODE_CONFIG` in YAMLs and README                    |

### File List

- examples/basic-workflow/README.md (new)
- examples/basic-workflow/workflow.md (new)
- examples/basic-workflow/.github/workflows/run-ai.yml (new, review-modified)
- examples/with-validation/README.md (new)
- examples/with-validation/workflow.md (new)
- examples/with-validation/validate.py (new)
- examples/with-validation/.github/workflows/run-ai.yml (new, review-modified)
- examples/github-copilot/README.md (new)
- examples/github-copilot/workflow.md (new, review-modified)
- examples/github-copilot/.github/workflows/run-ai.yml (new, review-modified)
- examples/custom-model/README.md (new, review-modified)
- examples/custom-model/workflow.md (new, review-modified)
- examples/custom-model/.github/workflows/run-ai.yml (new, review-modified)
- examples/custom-model/.github/workflows/list-models.yml (new, review-modified)
- .gitignore (modified)
- \_bmad-output/implementation-artifacts/sprint-status.yaml (modified)
- \_bmad-output/implementation-artifacts/7-5-create-example-workflows.md (modified)
