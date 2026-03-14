# Step 03: Prompt Authoring

**Goal:** Guide the user to review and confirm an AI prompt for each step, then optionally define validation scripts.

**MANDATE:** Load `skills/workflow-creator/knowledge/prompt-quality-guide.md` (relative to the repo root where the skill is installed) BEFORE presenting any prompt suggestions. Apply its principles to every generated suggestion.

---

## INITIALIZATION

1. Load and internalize `skills/workflow-creator/knowledge/prompt-quality-guide.md` — apply its 7-section structure and quality principles to every prompt you generate
2. Read the WIP file to get the step list, objectives, output artifacts, and data-passing edges
3. If any step involves chart generation, SVG output, or data visualization, also load `skills/workflow-creator/knowledge/chart-rendering-guide.md` and apply its rendering conventions to those steps' prompts

Remind the user at the start:

> "Before we write the prompts, a key principle: each prompt file runs in **complete isolation**. There is no shared memory between steps. If a step needs data from a previous step, it must be passed via `env_vars` in the workflow YAML — I'll set that up automatically based on the dependency graph we defined."

---

## EXECUTION SEQUENCE

### Phase A: Per-Step Prompt Authoring

For each step in order:

**If in edit mode and step is unchanged:** Display a read-only summary:

```
Step [N]: [step-name] — UNCHANGED
Prompt file: workflows/[workflowSlug]/instructions/[step-slug].md (preserved as-is)
```

Skip to next step.

**If new or changed step:** Follow this process:

#### 1. Display Step Context

```
Step [N] of [total]: [step-name]
Objective: [stepObjective]
Expected output: [stepOutputArtifact]
[Data from previous steps (if applicable): received via env var [KEY_NAME] from [upstream-step]]
```

#### 2. Generate Suggested Prompt

Apply the 7-section structure from `prompt-quality-guide.md`:

```markdown
# [Step Name]

## Objective

[stepObjective — as stated by user, refined for machine-clarity]

## Context

[If this step receives data from a previous step:]
The following data is available via environment variables:

- `[KEY_NAME]`: [description of what this contains, from the data-passing edge]

[If no upstream data:]
No data is passed from previous steps. The repository is checked out at the standard workspace path.

## Constraints

- [Infer 2–4 most relevant constraints for this step type]
- Do not modify source files unless that is the explicit objective
- Output must be deterministic and machine-verifiable

## Output Format

[Based on stepOutputArtifact — specify exact format:]
[If JSON: show schema]
[If file: specify path and structure]
[If Markdown: show expected heading structure]

## Progressive Output

Before starting analysis, create the output file at [output path] (or open
it if it already exists). For each required section: if the section does not
exist or is empty, add a `<!-- PLACEHOLDER: [section description] -->` marker.
If the section already contains real content, leave it as-is.

Then, as each section's analysis completes, compare the result against the
current file content. Replace placeholder markers with the real content.
If a section already has content, update it only if the new content differs.
Do not wait until all analysis is done to write the file.

[Tailor the specific scaffold structure and fill order to this step's output format.
For example:]
[If the output is a Markdown report: list the heading structure to scaffold,
note which sections get placeholders vs which may already have content]
[If the output is JSON: describe creating the file with the top-level schema
and placeholder values, then filling each field as analysis completes]
[If the output is multiple files: describe creating all files with placeholders first]

## Success Criteria

- [Criterion 1 — derivable from Output Format]
- [Criterion 2 — derivable from Output Format]
- [Criterion 3 — at least one "no placeholder text" criterion if applicable]
- The output file contains no remaining `<!-- PLACEHOLDER: ... -->` markers
- [If step produces charts/SVGs: SVG files exist and have consistent widths]

## Completion

IMPORTANT: When this instruction is done, it is DONE. You MUST stop here.
Do NOT automatically continue to any other instruction or workflow file.
Do NOT begin work that is not described in this instruction.
Your task is COMPLETE when the success criteria above are met — STOP IMMEDIATELY.
```

#### 3. Present to User

Display the suggested prompt and offer:

```
Suggested prompt for [step-name]:

---
[prompt content]
---

[A] Accept as suggested
[E] Edit this prompt
```

HALT and wait for selection.

- **[A]:** Save the suggestion verbatim to the WIP file as this step's prompt content
- **[E]:** Ask what to change. User may provide edits inline, or request specific changes. Apply changes and re-display. Repeat until user accepts.

#### 4. Store in WIP

After acceptance, update the WIP file with the confirmed prompt content for this step.

---

### Phase B: Validation Scripts

After all prompts are confirmed, ask:

> "Would you like to add validation scripts for any steps? A validation script checks the AI's output after each run and triggers a retry if the output doesn't meet the criteria. (Recommended for steps with structured output like JSON.)"

If **no**: skip to Phase C (Final Summary) immediately.

If **yes**, go through each step that needs one:

> "For [step-name]: what should the validation script check?
>
> The script receives `AI_LAST_MESSAGE` as an environment variable (the AI's last response). Common checks:
>
> - Is the output valid JSON?
> - Does it contain required fields?
> - Does the output file exist?
> - Does it pass a specific format check?"

For each step that needs a validation script, collect:

- Validation language preference: Python (default) or JavaScript
- What to check (described in plain terms — the script will be generated in Step 04)
- How many retries before failure: default 3, max 20

Store validation spec in WIP:

```yaml
steps:
  - slug: my-step
    # ... existing fields ...
    validation:
      enabled: true
      language: python
      checks:
        - 'output is valid JSON'
        - 'contains fields: name, description, items'
        - 'items array has at least 1 entry'
      maxRetry: '3'
```

---

### Phase C: Final Summary

Display a completion summary:

```
Prompt authoring complete.

Steps with prompts confirmed:
[1] [step-a] — prompt accepted
[2] [step-b] — prompt accepted (edited)
[3] [step-c] — prompt accepted

Validation scripts:
[2] [step-b] — Python, checks: valid JSON + required fields, max 3 retries
[No validation for step-a, step-c]

[G] Generate all files
```

HALT and wait for [G].

---

## WIP FILE UPDATE

After all prompts and validation specs are confirmed, update `stepsCompleted: [1, 2, 3]` and store all prompt content and validation specs in the WIP file.

---

## NEXT STEP

After user selects [G]:

Read fully and follow: `steps/step-04-generate.md`
