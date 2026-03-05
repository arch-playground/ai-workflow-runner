# Step 04: Generate

**Goal:** Produce all output files — prompt files, validation scripts, and the GitHub Actions YAML.

**MANDATE:** Load `skills/workflow-creator/knowledge/action-schema.md` AND `skills/workflow-creator/knowledge/auth-patterns.md` (relative to the repo root where the skill is installed) BEFORE generating any YAML. These files contain authoritative patterns — do not generate auth or YAML structure from memory.

---

## INITIALIZATION

1. Load and internalize `skills/workflow-creator/knowledge/action-schema.md`
2. Load and internalize `skills/workflow-creator/knowledge/auth-patterns.md`
3. Read the WIP file to restore full state: steps, dependency graph, data-passing edges, auth method, prompts, validation specs

---

## GENERATION SEQUENCE

Execute in this exact order. Do NOT write any files until the pre-generation checklist passes.

---

### Phase 1: Pre-Generation Checklist (Items 1–7)

Load `skills/workflow-creator/checklists/output-checklist.md` and run items 1–7.

For each item:
- Evaluate against the WIP state
- If the item FAILS: HALT, report the specific failing item using the HALT message from the checklist, and DO NOT write any files until the user resolves it
- If the item auto-resolves (items 6 and 7 may): apply the auto-fix, inform the user, continue

Only proceed to Phase 2 after ALL 7 items pass.

---

### Phase 2: Generate Prompt Files

For each step (in order), write `workflows/<step-slug>.md` with the confirmed prompt content from the WIP file.

**In edit mode:** Skip unchanged steps (their prompt files are preserved as-is). Only write files for new or modified steps.

Write the file exactly as confirmed in Step 03 — do not alter the prompt content.

Progress update:
```
Writing prompt files...
[✓] workflows/step-a.md
[✓] workflows/step-b.md
...
```

---

### Phase 3: Generate Validation Scripts

For each step with `validation.enabled: true` in the WIP:

Generate the validation script at `workflows/validation/<step-slug>.py` (or `.js`).

The script must:
1. Read `AI_LAST_MESSAGE` from the environment
2. Check each item in `validation.checks`
3. Print `"true"` if all checks pass
4. Print a descriptive failure message (used as retry feedback to the AI) if any check fails

**Python template:**

```python
import os
import json

message = os.environ.get("AI_LAST_MESSAGE", "")

if not message.strip():
    print("No output received from AI")
    exit(0)

# [generated checks based on validation.checks]
```

**JavaScript template:**

```javascript
const message = process.env.AI_LAST_MESSAGE || '';

if (!message.trim()) {
    console.log('No output received from AI');
    process.exit(0);
}

// [generated checks based on validation.checks]
```

Progress update:
```
Writing validation scripts...
[✓] workflows/validation/step-b.py
```

---

### Phase 4: Generate Auth Setup Steps

Using `knowledge/auth-patterns.md`, prepare the auth step snippets for insertion into jobs:

**Based on `authMethod` in WIP:**

- `"anthropic-api-key"`: Every AI step gets `env: OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}`
- `"anthropic-api-key-with-model"`: Same as above plus `model: '[model]'` in `with:`
- `"copilot-auth-json"`: Every job gets: write-auth step before AI step + cleanup step with `if: always()` after AI step
- `"custom-opencode-config"`: Every job gets: write-config step before AI step + `opencode_config: config.json` in `with:` + cleanup step with `if: always()` after AI step

---

### Phase 5: Generate Artifact Transfer Steps

For each dependency edge with `strategy: "artifact"` in the WIP:

- **Producer job** (upstream): add `actions/upload-artifact@v4` step AFTER the AI step
- **Consumer job** (downstream): add `actions/download-artifact@v4` step BEFORE the AI step AND before `actions/checkout@v4` if checkout follows download

Use the `artifactName` and `artifactPath` values from the WIP edge data.

---

### Phase 6: Generate the Workflow YAML

Using `skills/workflow-creator/knowledge/action-schema.md` patterns, generate `.github/workflows/<workflowSlug>.yml`.

**Structure** (lines marked `# CONDITIONAL:` are only emitted when the stated condition is true — do not emit the comment itself):

```yaml
name: [workflowName]

on:
  [trigger]:
    [trigger-specific config if needed]

jobs:
  [for each step in dependency order]:
    [step-slug]:
      runs-on: ubuntu-latest
      # EMIT ONLY IF job has upstream dependencies:
      needs: [dependency-list]
      # EMIT ONLY IF job exposes string outputs to downstream jobs:
      outputs:
        [output-key]: ${{ steps.ai.outputs.result }}
      steps:
        - uses: actions/checkout@v4

        # EMIT ONLY IF artifact download needed for this job:
        - name: Download [artifact-name] artifact
          uses: actions/download-artifact@v4
          with:
            name: [artifact-name]
            path: [artifact-path]

        # EMIT ONLY IF authMethod is copilot-auth-json:
        - name: Write auth config
          run: echo '${{ secrets.COPILOT_AUTH }}' > auth.json

        # EMIT ONLY IF authMethod is custom-opencode-config:
        - name: Write config
          if: ${{ secrets.OPENCODE_CONFIG != '' }}
          run: echo '${{ secrets.OPENCODE_CONFIG }}' > config.json

        - name: Run [step-name]
          id: ai
          uses: [actionRef]
          with:
            workflow_path: 'workflows/[step-slug].md'
            timeout_minutes: '[timeout]'
            # EMIT ONLY IF validation is enabled for this step:
            validation_script: 'workflows/validation/[step-slug].py'
            validation_max_retry: '[maxRetry]'
            # EMIT ONLY IF this job receives string outputs from an upstream job:
            env_vars: '{"[KEY_NAME]": "${{ needs.[upstream-job].outputs.[output-key] }}"}'
            # EMIT ONLY IF authMethod is anthropic-api-key-with-model:
            model: '[model]'
            # EMIT ONLY IF authMethod is copilot-auth-json:
            auth_config: 'auth.json'
            # EMIT ONLY IF authMethod is custom-opencode-config:
            opencode_config: ${{ secrets.OPENCODE_CONFIG && 'config.json' || '' }}
          # EMIT ONLY IF authMethod is anthropic-api-key or anthropic-api-key-with-model:
          env:
            OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

        # EMIT ONLY IF authMethod is copilot-auth-json:
        - name: Clean up auth config
          if: always()
          run: rm -f auth.json

        # EMIT ONLY IF authMethod is custom-opencode-config:
        - name: Clean up config
          if: always()
          run: rm -f config.json

        # EMIT ONLY IF artifact upload needed for this job:
        - name: Upload [artifact-name] artifact
          uses: actions/upload-artifact@v4
          with:
            name: [artifact-name]
            path: [artifact-path]
```

**Critical YAML rules (from action-schema.md):**
- Every job uses `runs-on: ubuntu-latest` — NO exceptions
- Every job includes `- uses: actions/checkout@v4`
- `id: ai` on every AI action step
- `outputs:` block at job level when the job exposes values to downstream jobs
- All input values are strings (wrap numbers in quotes: `timeout_minutes: '30'`)
- Job IDs are the step slugs (lowercase alphanumeric + hyphens)

---

### Phase 7: action-validator (Item 8)

Check if `npx` is available:

```
npx --version
```

**If `npx` NOT available:**

```
WARNING: `npx` not found. Skipping action-validator schema validation.
After installing Node.js, run manually: npx action-validator .github/workflows/[workflowSlug].yml
```

Skip to Phase 8.

**If `npx` available:**

Run:
```
npx action-validator .github/workflows/[workflowSlug].yml
```

**If validation passes (zero errors):** Continue to Phase 8.

**If validation fails:** Enter the fix loop (max 3 iterations):

1. Analyze all reported errors
2. Regenerate the ENTIRE `.github/workflows/[workflowSlug].yml` from scratch with all corrections applied
3. Rewrite the file
4. Re-run `npx action-validator .github/workflows/[workflowSlug].yml`
5. If passes: continue to Phase 8
6. If fails and iteration < 3: go back to step 1
7. If fails after 3 attempts:

```
WARNING: action-validator still reports errors after 3 regeneration attempts.

The generated YAML has been written to .github/workflows/[workflowSlug].yml
Please fix the following errors manually:

[raw action-validator output]

After fixing, verify with: npx action-validator .github/workflows/[workflowSlug].yml
```

Proceed to Phase 9 anyway (generation is considered complete; YAML needs manual fix).

---

### Phase 8: List-Models Workflow (Optional)

Check whether `.github/workflows/list-models.yml` already exists in CWD.

**If it exists:** Skip this phase silently.

**If it does NOT exist:** Present to the user:

```
TIP: Would you like me to also create .github/workflows/list-models.yml?

This is a utility workflow that prints all models available to your provider.
Run it from the GitHub Actions UI whenever you want to discover or verify model
names before using them in your real workflow.

[Y] Yes, create it   [N] No thanks
```

HALT and wait for selection.

- **[N]:** Proceed to Phase 9.
- **[Y]:** Generate `.github/workflows/list-models.yml` using the auth context already collected:

  - Use `actionRef` from WIP for the `uses:` field
  - Apply the same auth method as the main workflow:
    - `anthropic-api-key` / `anthropic-api-key-with-model`: add `env: OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}`
    - `copilot-auth-json`: add write-auth + cleanup steps
    - `custom-opencode-config`: add write-config + cleanup steps

  Template (adapt auth section based on authMethod, same as Phase 6 conditionals):

  ```yaml
  name: List Available Models

  on:
    workflow_dispatch:

  jobs:
    list-models:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        # EMIT ONLY IF authMethod is copilot-auth-json:
        - name: Write auth config
          run: echo '${{ secrets.COPILOT_AUTH }}' > auth.json

        # EMIT ONLY IF authMethod is custom-opencode-config:
        - name: Write config
          if: ${{ secrets.OPENCODE_CONFIG != '' }}
          run: echo '${{ secrets.OPENCODE_CONFIG }}' > config.json

        - name: List models
          id: ai
          uses: [actionRef]
          with:
            workflow_path: ''
            list_models: 'true'
            # EMIT ONLY IF authMethod is copilot-auth-json:
            auth_config: 'auth.json'
            # EMIT ONLY IF authMethod is custom-opencode-config:
            opencode_config: ${{ secrets.OPENCODE_CONFIG && 'config.json' || '' }}
          # EMIT ONLY IF authMethod is anthropic-api-key or anthropic-api-key-with-model:
          env:
            OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}

        # EMIT ONLY IF authMethod is copilot-auth-json:
        - name: Clean up auth config
          if: always()
          run: rm -f auth.json

        # EMIT ONLY IF authMethod is custom-opencode-config:
        - name: Clean up config
          if: always()
          run: rm -f config.json

        - name: Print models
          run: |
            echo "Status: ${{ steps.ai.outputs.status }}"
            echo "Result: ${{ steps.ai.outputs.result }}"
  ```

  After writing, inform the user:
  ```
  Created .github/workflows/list-models.yml
  Run it from GitHub Actions > List Available Models > Run workflow to see all
  available models for your provider.
  ```

  Proceed to Phase 9.

---

### Phase 9: Completion

Update WIP file:

```yaml
stepsCompleted: [1, 2, 3, 4]
status: done
```

Display final summary:

```
Generation complete!

Files written:
  .github/workflows/[workflowSlug].yml
  [if list-models was created:] .github/workflows/list-models.yml
  workflows/[step-a-slug].md
  workflows/[step-b-slug].md
  [... one line per prompt file]
  [... one line per validation script, if any]

[In edit mode, also list:]
  Preserved (unchanged):
    workflows/[step-c-slug].md

action-validator: [PASSED / SKIPPED (npx not available) / NEEDS MANUAL FIX]

Next steps:
1. Review the generated files to ensure the prompts match your intent
2. Add the required GitHub Actions secrets:
   [list based on auth method, e.g.:]
   - OPENCODE_API_KEY: your Anthropic API key
[if list-models was created:]
3. Run .github/workflows/list-models.yml from the GitHub Actions UI to see available
   models — useful for picking the right model before running your real workflow
[always:]
4. Commit and push, then trigger your workflow from the GitHub Actions tab
```

The workflow creator session is complete.
