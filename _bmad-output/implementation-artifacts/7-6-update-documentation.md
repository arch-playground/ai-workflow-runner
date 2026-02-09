# Story 7.6: Update Documentation

Status: done

## Story

As a GitHub Actions user,
I want the README updated with configuration options, examples, and setup instructions,
so that I understand how to customize the action with my own providers, models, and API keys.

## Acceptance Criteria

1. README.md inputs table includes all 4 new inputs (`opencode_config`, `auth_config`, `model`, `list_models`) with descriptions, required status, and defaults matching `action.yml`
2. A "Configuration" section explains how to set up OpenCode config and auth files using GitHub Variables/Secrets, including JSON structure examples for `config.json` and `auth.json`
3. An "Examples" section links to each subdirectory in `examples/` with a one-line description of what each demonstrates
4. Copilot setup is documented: how to generate a personal Copilot token, auth.json structure for the copilot provider, and link to `examples/github-copilot/`
5. The usage example in README reflects the new inputs (shows `model` and config file usage alongside existing inputs)
6. The project structure in README is updated to include `examples/` directory and test files that now live in `src/` (co-located `*.spec.ts`)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md`
  - [x] Read `.knowledge-base/technical/standards/global/conventions.md`

- [x] **Task 2: Update Inputs Table in README.md** (AC: 1)
  - [x] Add `opencode_config` row: "Path to OpenCode config.json file (relative to workspace)", Not required, default `''`
  - [x] Add `auth_config` row: "Path to OpenCode auth.json file (relative to workspace). Store in GitHub Secrets.", Not required, default `''`
  - [x] Add `model` row: "Model to use for AI execution. Overrides config file default.", Not required, default `''`
  - [x] Add `list_models` row: "If `true`, print available models and exit without running workflow", Not required, default `'false'`
  - [x] Verify all descriptions match `action.yml` exactly

- [x] **Task 3: Add Configuration Section** (AC: 2, 4)
  - [x] Add new "## Configuration" section after "## Inputs" / "## Outputs"
  - [x] Document config.json structure with example JSON:
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
  - [x] Document auth.json structure with example JSON:
    ```json
    {
      "provider": {
        "copilot": {
          "token": "ghu_xxxxx"
        }
      }
    }
    ```
  - [x] Explain GitHub Secrets setup: store auth JSON in `secrets.OPENCODE_AUTH`, write to file at runtime
  - [x] Explain GitHub Variables setup: store non-sensitive config in `vars.OPENCODE_CONFIG`
  - [x] Show workflow YAML snippet for writing config/auth files from secrets before action step
  - [x] Document Copilot token generation: link to GitHub Copilot token page, explain `ghu_` token format
  - [x] Document `model` input: explain it overrides default model from config file
  - [x] Document `list_models` feature: runs SDK init, prints available models, exits without workflow execution. `workflow_path` is not validated when listing models.

- [x] **Task 4: Add Examples Section** (AC: 3)
  - [x] Add new "## Examples" section (place after Configuration, before Security)
  - [x] Link to `examples/basic-workflow/` — "Basic AI workflow with minimal setup"
  - [x] Link to `examples/with-validation/` — "Validation scripts with Python and retry mechanism"
  - [x] Link to `examples/github-copilot/` — "Using GitHub Copilot as the AI provider"
  - [x] Link to `examples/custom-model/` — "Custom model selection and listing available models"

- [x] **Task 5: Update Usage Example** (AC: 5)
  - [x] Add a second usage example (or extend existing) showing config file usage:
    ```yaml
    - name: Write config files
      run: |
        echo '${{ secrets.OPENCODE_AUTH }}' > auth.json
    - name: Run AI Workflow
      uses: owner/ai-workflow-runner@v1
      with:
        workflow_path: 'workflow.md'
        auth_config: 'auth.json'
        model: 'anthropic/claude-sonnet-4-5-20250929'
    ```
  - [x] Keep existing basic usage example as-is for simplicity

- [x] **Task 6: Update Project Structure** (AC: 6)
  - [x] Add `examples/` directory to the project structure tree with subdirectories
  - [x] Update test directory structure: tests are co-located in `src/*.spec.ts`, not in `__tests__/`
  - [x] Add `docs/` directory to the tree
  - [x] Ensure structure matches actual current file layout

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### What Changes

This story modifies ONLY `README.md`. No TypeScript source code changes. No new files created.

### Current README Gaps

The existing README documents 7 inputs but is missing these 4 new inputs added in stories 7-1 through 7-4:

- `opencode_config` — added in action.yml by story 7-1
- `auth_config` — added in action.yml by story 7-1
- `model` — added in action.yml by story 7-1
- `list_models` — added in action.yml by story 7-1

The README also has no Configuration section and no Examples section. The project structure section is outdated (shows `__tests__/` instead of co-located `src/*.spec.ts`).

### Key Technical Details

**Config File Flow** (from story 7-3):

1. User stores config JSON in GitHub Variables (`vars.OPENCODE_CONFIG`) or Secrets
2. User stores auth JSON in GitHub Secrets (`secrets.OPENCODE_AUTH`)
3. Workflow step writes files to disk before action runs
4. Action reads files via `opencode_config` / `auth_config` input paths
5. Action passes parsed JSON to OpenCode SDK `createOpencode()` options

**List Models Behavior** (from story 7-4):

- `list_models: 'true'` triggers early return in `runWorkflow()` BEFORE workflow file validation
- `workflow_path` is NOT validated when listing models
- Output format: `=== Available Models ===\n  - {id}: {name} ({provider})\n========================`
- Returns `{ success: true, output: JSON.stringify({ models }) }`

**Auth Config JSON Structure** (from story 7-3):

```json
{ "provider": { "copilot": { "token": "ghu_xxxxx" } } }
```

**OpenCode Config JSON Structure** (from story 7-3):

```json
{
  "provider": { "anthropic": { "apiKey": "sk-ant-xxxxx" } },
  "model": "anthropic/claude-sonnet-4-5-20250929"
}
```

**Security Patterns** (from story 7-5 review):

- Auth files contain secrets — MUST use `secrets.*`, never `vars.*`
- Add `if: always()` cleanup step for auth files on self-hosted runners
- Non-sensitive config can use `vars.*`
- Conditional config passing: `${{ secrets.OPENCODE_CONFIG && 'config.json' || '' }}`

### Anti-Patterns to Avoid

- DO NOT create new files — only edit `README.md`
- DO NOT add TypeScript code or tests
- DO NOT duplicate content already in `examples/*/README.md` — link to them instead
- DO NOT show API keys or tokens in README examples — use placeholder values like `sk-ant-xxxxx` or `ghu_xxxxx`
- DO NOT change any other documentation files in `docs/` — this story scopes to README only
- DO NOT rewrite existing sections that are still accurate — only add/update

### Project Structure Notes

- Current README project structure is outdated — shows `__tests__/unit/` and `__tests__/integration/` but tests are actually co-located at `src/*.spec.ts` with integration tests at `test/integration/`
- `examples/` directory now exists with 4 subdirectories (basic-workflow, with-validation, github-copilot, custom-model)
- `docs/` directory exists with 6 documentation files

### References

- [Source: action.yml] — Canonical input/output definitions
- [Source: examples/basic-workflow/README.md] — Basic workflow example documentation
- [Source: examples/with-validation/README.md] — Validation example documentation
- [Source: examples/github-copilot/README.md] — Copilot setup instructions
- [Source: examples/custom-model/README.md] — Model selection documentation
- [Source: _bmad-output/implementation-artifacts/7-5-create-example-workflows.md] — Previous story learnings
- [Source: _bmad-output/planning-artifacts/prd.md#Documentation Strategy] — README structure requirements
- [Source: _bmad-output/planning-artifacts/architecture.md] — Project structure and patterns
- [Source: src/opencode.ts] — Config file loading implementation
- [Source: src/runner.ts] — List models implementation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — documentation-only story, no debugging required.

### Completion Notes List

- Added 4 new inputs (`opencode_config`, `auth_config`, `model`, `list_models`) to the Inputs table with descriptions matching `action.yml`
- Added "## Configuration" section with: config.json/auth.json JSON examples, GitHub Secrets/Variables setup, workflow YAML snippet for writing config files, Copilot token generation guide, model selection docs, list_models feature docs
- Added "## Examples" section with table linking to all 4 example subdirectories
- Added second usage example "With Custom Provider and Model" showing auth_config and model usage with cleanup step
- Updated project structure to reflect co-located unit tests (`src/*.spec.ts`), `test/` directory with e2e/integration/mocks, `examples/` with 4 subdirectories, and `docs/` directory
- All quality checks pass: lint, format, typecheck
- All 230 unit tests pass with no regressions

### File List

- `README.md` — Modified (added inputs, Configuration section, Examples section, updated usage example, updated project structure)

### Change Log

- 2026-02-09: Updated README.md with configuration documentation, examples section, new inputs, and corrected project structure
- 2026-02-09: Code review fixes — removed apiKey from config.json example (security guidance), added missing files to project structure (opencode-test-helpers.ts, action-yml.test.ts), fixed cleanup step to include config.json, fixed validation_script/validation_script_type defaults from `-` to `''`
