# auth-patterns.md — Authentication Patterns for ai-workflow-runner

This file documents all supported authentication approaches for `ai-workflow-runner`. Step 04 loads this file before generating any YAML to ensure correct auth setup without requiring users to know the details.

---

## Auth Decision Guide

| Provider            | Method                                            | Secret Name           | Use When                                          |
| ------------------- | ------------------------------------------------- | --------------------- | ------------------------------------------------- |
| Anthropic           | `OPENCODE_API_KEY` env var                        | Any secret name       | Default — simplest setup                          |
| GitHub Copilot      | `auth.json` via `auth_config:`                    | `COPILOT_AUTH` (JSON) | User has GitHub Copilot subscription              |
| Custom/OpenAI/etc.  | `opencode_config:` JSON + optional `auth_config:` | Varies                | Non-Anthropic providers, custom model endpoints   |
| Model override only | `model:` input + `OPENCODE_API_KEY` env var       | `OPENCODE_API_KEY`    | User wants to specify a different Anthropic model |

**Rule:** Never expose secrets in plain text in YAML. Always use `${{ secrets.SECRET_NAME }}`.

---

## Pattern 1: Anthropic API Key (Recommended Default)

**When to use:** User has an Anthropic API key. Simplest setup. Recommended for most cases.

**Secret required:** `OPENCODE_API_KEY` — set in repository Settings > Secrets and variables > Actions > Secrets.

**Guidance to give users:** "Add your Anthropic API key as a GitHub Actions secret named `OPENCODE_API_KEY`."

**YAML snippet (per job, in `env:` block of the AI step):**

```yaml
- name: Run AI Step
  id: ai
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/my-step.md'
    timeout_minutes: '30'
  env:
    OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

**Notes:**

- The `env:` block goes at the step level, NOT the job level
- No extra setup or cleanup steps required
- For multi-job workflows, each job's AI step needs its own `env: OPENCODE_API_KEY:` block

---

## Pattern 2: GitHub Copilot (auth.json via auth_config)

**When to use:** User has a GitHub Copilot subscription and wants to use it as the AI provider. No Anthropic API key needed.

**Secret required:** `COPILOT_AUTH` — a JSON object stored as a GitHub Actions secret. The exact format depends on the OpenCode auth.json schema for Copilot.

**Guidance to give users:**

1. "Create a GitHub Actions secret named `COPILOT_AUTH` containing your Copilot auth JSON."
2. "The `auth.json` file is written to disk and cleaned up automatically — it is never committed."

**YAML snippet (write + AI step + cleanup — all in the same job):**

```yaml
- name: Write auth config
  run: echo '${{ secrets.COPILOT_AUTH }}' > ${{ runner.temp }}/auth.json

- name: Run AI Step
  id: ai
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/my-step.md'
    auth_config: '${{ runner.temp }}/auth.json'
    timeout_minutes: '30'

- name: Clean up auth config
  if: always()
  run: rm -f ${{ runner.temp }}/auth.json
```

**Critical rules for multi-job workflows:**

- The write and cleanup steps must be in the **same job** as the AI step that uses `auth_config:`
- The cleanup step **must** have `if: always()` — it must run even if the AI step fails
- If multiple jobs need Copilot auth, each job must have its own write + cleanup pair
- Never share the auth file between jobs via artifacts — write it fresh per job

---

## Pattern 3: Custom Model via opencode_config

**When to use:** User wants a non-default provider (e.g., Azure OpenAI, Bedrock) or needs provider-specific configuration. Config is non-sensitive (no API keys in config.json — those go in auth_config or env vars).

**Secret required:** `OPENCODE_CONFIG` — a JSON string stored as a GitHub Actions secret (or variable if truly non-sensitive).

**Guidance to give users:**

- `opencode_config` contains provider routing, model defaults, and non-sensitive settings
- If the config contains API keys, use `auth_config` instead (or combine both)
- The config file is cleaned up after use

**YAML snippet:**

```yaml
- name: Write config
  if: ${{ secrets.OPENCODE_CONFIG != '' }}
  run: echo '${{ secrets.OPENCODE_CONFIG }}' > ${{ runner.temp }}/config.json

- name: Run AI Step
  id: ai
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/my-step.md'
    opencode_config: ${{ secrets.OPENCODE_CONFIG && format('{0}/config.json', runner.temp) || '' }}
    timeout_minutes: '30'
  env:
    OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

**Notes:**

- Add a cleanup step with `if: always()` if the config contains sensitive data: `run: rm -f ${{ runner.temp }}/config.json`
- Can be combined with `auth_config:` if separate auth and config files are needed

---

## Pattern 4: Model Override Only

**When to use:** User wants to specify a different Anthropic model but doesn't need custom provider config. Simplest way to pin a specific model version.

**Secret required:** `OPENCODE_API_KEY` (same as Pattern 1).

**YAML snippet:**

```yaml
- name: Run AI Step
  id: ai
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/my-step.md'
    model: 'anthropic/claude-sonnet-4-5-20250929'
    timeout_minutes: '30'
  env:
    OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

**Model string format:** `<provider>/<model-id>` — e.g.:

- `anthropic/claude-opus-4-6`
- `anthropic/claude-sonnet-4-6`
- `anthropic/claude-haiku-4-5-20251001`

---

## Secrets vs Variables Guidance

| Type                | Use for                                          | Set via                                                    |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **GitHub Secret**   | API keys, auth JSON, any sensitive value         | Settings > Secrets and variables > Actions > **Secrets**   |
| **GitHub Variable** | Non-sensitive config (e.g., model name, timeout) | Settings > Secrets and variables > Actions > **Variables** |

**Rule:** When in doubt, use a Secret. Secrets are masked in logs. Variables are visible in logs.

Reference syntax:

- Secrets: `${{ secrets.MY_SECRET }}`
- Variables: `${{ vars.MY_VARIABLE }}`

---

## Multi-Job Auth Placement Summary

For a workflow with multiple AI jobs:

| Auth Pattern               | Placement                                                      |
| -------------------------- | -------------------------------------------------------------- |
| Anthropic API key (`env:`) | In each job's AI step `env:` block                             |
| Copilot auth config        | Write + cleanup steps in **each job** that uses `auth_config:` |
| `opencode_config`          | Write step before first AI step in each job; cleanup after     |

**Never** rely on a previous job's auth setup — each job runs on a fresh runner with no state from prior jobs.
