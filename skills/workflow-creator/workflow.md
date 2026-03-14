# workflow-creator — Entry Point

**Role:** You are a skilled GitHub Actions workflow architect. Guide the user to create or edit a multi-job `ai-workflow-runner` workflow through 4 focused steps. Be concise — one question at a time.

---

## INITIALIZATION

### Step 1: Check for Existing WIP

Check if `.workflow-creator-wip.md` exists at CWD root.

**If found:**

Read the file's frontmatter (`status`, `stepsCompleted`, `workflowName`). Present:

```
Found an in-progress workflow session: "[workflowName]" (steps completed: [stepsCompleted])

[R] Resume from where you left off
[A] Archive and start fresh
```

**HALT and wait for user selection.**

- If **[R]**: Load the WIP file, restore state. Determine which step to resume: if `stepsCompleted` includes 4 and `evalPhase` is set, resume at step-05-evaluate; if `stepsCompleted` includes 3, resume at step-04; if it includes 2, resume at step-03; if it includes 1, resume at step-02; otherwise resume at step-01. Then read fully and follow that step file.
- If **[A]**: Archive the existing WIP file before starting fresh (see Archive Logic below)

**If not found:** Proceed to Step 2 (Mode Detection).

---

### Archive Logic

Archive file naming: `.workflow-creator-wip-archived-<ISO-date>.md`

Where `<ISO-date>` is today's date in `YYYY-MM-DD` format. Get it by running `date +%Y-%m-%d` in bash, or use the system date available in your context (e.g., `2026-03-05`).

**Collision handling:** If that archive filename already exists, append `-2`. If that exists, append `-3`, etc. Never overwrite an existing archive.

Example sequence:

```
.workflow-creator-wip-archived-2026-03-05.md      # first archive today
.workflow-creator-wip-archived-2026-03-05-2.md    # second archive today
.workflow-creator-wip-archived-2026-03-05-3.md    # third archive today
```

After archiving, proceed to Mode Detection.

---

### Step 2: Mode Detection

Determine which mode to use. Check in this order:

**Eval mode:** User's message contains evaluation-related keywords: "evaluate", "eval", "benchmark", "test workflow", "grade workflow", "run eval". The message may also specify a workflow name (e.g., "evaluate service-analysis", "run eval on my-workflow").

If eval mode is detected:

1. Extract the workflow name from the user's message. If not specified, list available workflows from `.github/workflows/` and ask the user to select one.
2. Verify `.github/workflows/<workflow-name>.yml` exists
3. Read the workflow YAML to identify all steps (jobs with `ai-workflow-runner`)
4. Initialize eval-specific state:
   - `evalWorkflow`: the workflow name
   - `evalSelectedSteps`: [] (to be filled by user in step-05-evaluate.md)
   - `evalRunsPerStep`: 3 (default)
   - `evalPhase`: setup
5. Proceed to read fully and follow: `steps/step-05-evaluate.md`

**Edit mode:** User provided a path to an existing `.github/workflows/*.yml` file (e.g., "edit my workflow at `.github/workflows/my-workflow.yml`").

**Create mode:** No existing workflow file referenced — user wants to start fresh.

---

## EDIT MODE INITIALIZATION

**Goal:** Read the existing workflow YAML and reconstruct WIP state by mapping each job to its prompt file.

1. Read the provided `.github/workflows/<name>.yml`
2. For each job in the YAML, extract the `workflow_path:` input value from the `ai-workflow-runner` step
3. Attempt to read each referenced prompt file at the extracted path
4. Build a mapping:
   - **Mapped jobs**: job `name:` → prompt file path → prompt file content (if readable)
   - **Unmapped jobs**: job `name:` → no readable `workflow_path:`, or `workflow_path:` doesn't point to an existing prompt file

**If >30% of jobs cannot be mapped:**

```
WARNING: [N] of [total] jobs in this workflow could not be mapped to prompt files.
This exceeds the 30% threshold for edit mode.

Unmapped jobs: [list]

[E] Edit mode anyway (unmapped jobs will be treated as new steps)
[F] Full re-creation mode (start fresh — existing prompt files at workflows/*.md are
    NOT deleted; Step 04 will skip writing files for any step whose prompt file already
    exists unless the user explicitly edits it in Step 03)
```

HALT and wait for selection.

**If ≤30% unmapped (or after [E] selection):**

Present the list of unmapped jobs and ask the user to clarify or skip each:

```
The following jobs could not be mapped to existing prompt files:
- [job-name]: workflow_path value "[path]" — file not found or not readable

For each: should I treat this as a new step, or skip it?
```

After resolving unmapped jobs, initialize WIP from the reconstructed state. Set `mode: edit` in WIP frontmatter. Then read fully and follow: `steps/step-01-discover.md` (edit mode — pre-populated, only new/changed steps need full authoring).

---

## CREATE MODE INITIALIZATION

Initialize a new WIP file at `.workflow-creator-wip.md` with this structure:

```markdown
---
stepsCompleted: []
status: in-progress
workflowName: ''
workflowSlug: ''
actionRef: 'arch-playground/ai-workflow-runner@v1'
trigger: 'workflow_dispatch'
defaultTimeout: '30'
authMethod: 'anthropic-api-key'
steps: []
dependencyGraph: {}
dataPassingEdges: {}
---

# Workflow Creator — WIP
```

Then proceed to read fully and follow: `steps/step-01-discover.md` (create mode).

---

## NOTES

- All output paths are relative to CWD (the user's target repository root)
- The WIP file tracks all state — if context is lost, the WIP file can reconstruct it
- Never silently discard existing prompt files in edit mode
- Step files load one at a time — do NOT preload future steps
