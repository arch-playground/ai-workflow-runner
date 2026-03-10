# action-schema.md — ai-workflow-runner Complete Reference

This file is the authoritative reference for all `ai-workflow-runner` action inputs, outputs, limits, and example patterns. Step files load this instead of reading the README.

---

## Action Reference

```
uses: arch-playground/ai-workflow-runner@v1
```

(Users may use a fork or different version — always use the reference string collected from the user in Step 01.)

---

## Inputs

| Input                    | Required | Default   | Notes                                                                                             |
| ------------------------ | -------- | --------- | ------------------------------------------------------------------------------------------------- |
| `workflow_path`          | no       | `''`      | Path to `.md` prompt file, relative to workspace root. Required unless `list_models` is `'true'`. |
| `prompt`                 | no       | `''`      | Additional prompt text appended to `workflow_path` content, max 100KB                             |
| `env_vars`               | no       | `'{}'`    | JSON object of env vars passed to AI context, max 64KB / 100 entries                              |
| `timeout_minutes`        | no       | `'30'`    | Max execution time in minutes                                                                     |
| `validation_script`      | no       | `''`      | File path (`.py` / `.js`) or inline (`python:...` / `js:...`)                                     |
| `validation_script_type` | no       | `''`      | Only needed for inline scripts without prefix (`python` or `javascript`)                          |
| `validation_max_retry`   | no       | `'5'`     | Max retry attempts when validation fails, range 1–20                                              |
| `opencode_config`        | no       | `''`      | Path to `config.json` for non-sensitive provider/model config                                     |
| `auth_config`            | no       | `''`      | Path to `auth.json` for sensitive API keys — use GitHub Secrets                                   |
| `model`                  | no       | `''`      | Override model, e.g. `anthropic/claude-sonnet-4-5-20250929`                                       |
| `list_models`            | no       | `'false'` | Print available models and exit (debugging only)                                                  |

---

## Outputs

| Output   | Description                                     |
| -------- | ----------------------------------------------- |
| `status` | `success` / `failure` / `cancelled` / `timeout` |
| `result` | AI last message as JSON string, max 900KB       |

---

## Limits

| Limit                       | Value                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `workflow_path` content     | No explicit limit, but keep prompt files focused               |
| `prompt` input              | Max 100KB                                                      |
| `env_vars`                  | Max 64KB total, max 100 key-value pairs                        |
| `validation_script` timeout | 60 seconds per execution                                       |
| `validation_max_retry`      | Range 1–20                                                     |
| `result` output             | Max 900KB (GitHub Actions output limit ~1MB)                   |
| Supported runners           | **Linux only** (`ubuntu-latest`) — Windows/macOS not supported |

---

## Validation Script Contract

- Script receives the AI's last response via `AI_LAST_MESSAGE` environment variable (up to ~100KB)
- Return empty string or `"true"` → **success**, workflow completes
- Return any other non-empty string → **failure feedback** sent back to AI for retry
- Script timeout: 60 seconds
- If retries exceed `validation_max_retry`, the job fails with status `failure`

**Example Python validation script:**

```python
import os
import json

message = os.environ.get("AI_LAST_MESSAGE", "")

if not message.strip():
    print("No output received from AI")
else:
    try:
        data = json.loads(message)
        missing = [f for f in ("name", "description") if f not in data]
        if missing:
            print(f"Missing required fields: {', '.join(missing)}")
        else:
            print("true")
    except json.JSONDecodeError as e:
        print(f"Output is not valid JSON: {e}")
```

---

## Example YAML Patterns

### Pattern 1: Basic Single-Job Workflow

```yaml
name: Run AI Workflow

on:
  workflow_dispatch:

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Run AI Workflow
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/my-step.md'
          timeout_minutes: '10'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

      - name: Print results
        run: |
          echo "Status: ${{ steps.ai.outputs.status }}"
          echo "Result: ${{ steps.ai.outputs.result }}"
```

### Pattern 2: With Validation and Retry

```yaml
name: Run AI Workflow with Validation

on:
  workflow_dispatch:

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Run AI Workflow
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/my-step.md'
          validation_script: 'workflows/validation/my-step.py'
          validation_max_retry: '3'
          timeout_minutes: '15'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

      - name: Print results
        run: |
          echo "Status: ${{ steps.ai.outputs.status }}"
          echo "Result: ${{ steps.ai.outputs.result }}"
```

### Pattern 3: GitHub Copilot Auth (auth.json)

```yaml
name: Run AI Workflow (Copilot)

on:
  workflow_dispatch:

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Write auth config
        run: echo '${{ secrets.COPILOT_AUTH }}' > ${{ runner.temp }}/auth.json

      - name: Run AI Workflow
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/my-step.md'
          auth_config: '${{ runner.temp }}/auth.json'
          timeout_minutes: '10'

      - name: Clean up auth config
        if: always()
        run: rm -f ${{ runner.temp }}/auth.json

      - name: Print results
        run: |
          echo "Status: ${{ steps.ai.outputs.status }}"
          echo "Result: ${{ steps.ai.outputs.result }}"
```

### Pattern 4: List Available Models (Utility Workflow)

Use this to discover all model names available to your configured provider. Run it manually from the GitHub Actions UI before building your real workflow.

**Key points:**

- `list_models: 'true'` causes the action to print models and exit — no AI task is run
- `workflow_path` is optional when `list_models: 'true'` — no need to provide it
- No `workflow_path` prompt file needs to exist
- Use the same auth setup as your real workflow

```yaml
name: List Available Models

on:
  workflow_dispatch:

jobs:
  list-models:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Write config
        if: ${{ secrets.OPENCODE_CONFIG != '' }}
        run: echo '${{ secrets.OPENCODE_CONFIG }}' > ${{ runner.temp }}/config.json

      - name: List models
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          list_models: 'true'
          opencode_config: ${{ secrets.OPENCODE_CONFIG && format('{0}/config.json', runner.temp) || '' }}
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

      - name: Save model list
        run: echo '${{ steps.ai.outputs.result }}' > models.json

      - name: Upload model list
        uses: actions/upload-artifact@v4
        with:
          name: available-models
          path: models.json
```

---

### Pattern 5: Custom Model via opencode_config

```yaml
name: Run AI Workflow (Custom Model)

on:
  workflow_dispatch:

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Write config
        if: ${{ secrets.OPENCODE_CONFIG != '' }}
        run: echo '${{ secrets.OPENCODE_CONFIG }}' > ${{ runner.temp }}/config.json

      - name: Run AI Workflow
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/my-step.md'
          model: 'anthropic/claude-sonnet-4-5-20250929'
          opencode_config: ${{ secrets.OPENCODE_CONFIG && format('{0}/config.json', runner.temp) || '' }}
          timeout_minutes: '10'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

      - name: Print results
        run: |
          echo "Status: ${{ steps.ai.outputs.status }}"
          echo "Result: ${{ steps.ai.outputs.result }}"
```

---

## Multi-Job Dependency Pattern

```yaml
jobs:
  step-a:
    runs-on: ubuntu-latest
    outputs:
      summary: ${{ steps.ai.outputs.result }}
    steps:
      - uses: actions/checkout@v6
      - name: Run AI Step A
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/step-a.md'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

  step-b:
    needs: step-a # sequential dependency on step-a
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Run AI Step B
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/step-b.md'
          env_vars: '{"STEP_A_OUTPUT": "${{ needs.step-a.outputs.summary }}"}'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

  step-c:
    needs: step-a # same parent = runs parallel with step-b
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Run AI Step C
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/step-c.md'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

  step-d:
    needs: [step-b, step-c] # fan-in: waits for both parallel steps
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Run AI Step D
        id: ai
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/step-d.md'
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

---

## Artifact Transfer Pattern (for file outputs between jobs)

```yaml
producer-job:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - name: Run AI Step
      id: ai
      uses: arch-playground/ai-workflow-runner@v1
      with:
        workflow_path: 'workflows/producer.md'
      env:
        OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
    - name: Upload output artifact
      uses: actions/upload-artifact@v7
      with:
        name: producer-output
        path: output/

consumer-job:
  needs: producer-job
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - name: Download output artifact
      uses: actions/download-artifact@v8
      with:
        name: producer-output
        path: output/
    - name: Run AI Step
      id: ai
      uses: arch-playground/ai-workflow-runner@v1
      with:
        workflow_path: 'workflows/consumer.md'
      env:
        OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

**When to use outputs vs artifacts:**

- **GitHub Actions outputs** (`id:` + `outputs:` + `needs.<job>.outputs.<key>`): small strings, status values, file paths, JSON summaries — max a few KB
- **Artifacts** (`upload-artifact` / `download-artifact`): files, directories, large content — no size restriction (up to GitHub's artifact storage limits)

---

## Key Constraints for Generated Workflows

1. **Linux only** — always use `runs-on: ubuntu-latest`; never suggest Windows or macOS
2. **No filesystem persistence** — each job starts fresh; files from one job are NOT available to another without artifact upload/download
3. **Checkout required** — every job that needs repository files must include `- uses: actions/checkout@v6`
4. **Job ID format** — lowercase alphanumeric and hyphens only (e.g., `step-a`, `generate-report`)
5. **outputs require `id:`** — a job step must have `id: ai` to reference `steps.ai.outputs.*`; the job must declare `outputs:` block to expose them to `needs.<job>.outputs.*`
6. **Cleanup is mandatory** — if `${{ runner.temp }}/auth.json` or `${{ runner.temp }}/config.json` is written, a cleanup step with `if: always()` must follow the last AI step that uses it
