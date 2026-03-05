# Step 01: Discover

**Goal:** Gather all the information needed to describe the workflow before touching any files or dependencies.

**Mode:** Ask one topic at a time. Be conversational — do not dump a big form.

---

## EXECUTION SEQUENCE

Work through these topics in order. HALT after each question and wait for the user's response before asking the next.

---

### Topic 1: Workflow Name and Purpose

Ask:
> "What would you like to name this workflow, and what is its overall purpose in one sentence?"

**Capture:**
- `workflowName` — human-readable name (e.g., "Generate Documentation")
- `workflowSlug` — lowercase, alphanumeric + hyphens, used as the YAML filename (e.g., `generate-documentation`)
- `workflowPurpose` — one-sentence description

**Slug rules:**
- Lowercase only
- Alphanumeric characters and hyphens only
- No spaces, underscores, or special characters
- Example: "My Workflow!" → `my-workflow`

Suggest a slug based on the name; confirm or let the user adjust.

---

### Topic 2: Trigger

Ask:
> "How should this workflow be triggered? Common options:
> - `workflow_dispatch` (run manually from the GitHub Actions UI — good default)
> - `push` (runs on every push to a branch)
> - `pull_request` (runs when a PR is opened or updated)
> - `schedule` (runs on a cron schedule)
>
> Which would you like, or do you have a specific trigger in mind?"

**Capture:** `trigger` — one of the above, or a custom value.

**Default:** `workflow_dispatch` if the user is unsure.

---

### Topic 3: Action Reference

Ask:
> "This skill defaults to `arch-playground/ai-workflow-runner@v1`. Are you using this, a fork, or a different version? (Press Enter to accept the default)"

**Capture:** `actionRef` — the `uses:` string for the action step.

**Default:** `arch-playground/ai-workflow-runner@v1`

---

### Topic 4: Steps

Ask:
> "Now let's define the steps in your workflow. Each step becomes a separate GitHub Actions job with its own AI prompt file.
>
> What is the first step? Give it a name and describe its objective in one sentence."

For each step, collect:
- `stepName` — human-readable name (e.g., "Scan Repository")
- `stepSlug` — job-ID safe slug (see slug rules above)
- `stepObjective` — one sentence describing what the AI must accomplish
- `stepOutputArtifact` — what the step produces (e.g., "a JSON file listing all TypeScript files", "a Markdown report", "a JSON summary string")

After each step, ask:
> "Is there another step? (yes/no)"

Continue collecting steps until the user says no.

**Step count limits:**
- At 10 steps: warn the user — "You have 10 steps. Workflows with many steps can be complex. Consider whether any steps could be combined."
- At 21+ steps: HALT with:
  > "You've described [N] steps. The skill's limit is 20 steps per workflow (GitHub Actions job limit and YAML complexity). I recommend splitting this into multiple separate workflows.
  >
  > Please reduce to 20 or fewer steps, or describe which steps should be moved to a separate workflow."

Do not continue until the user resolves the step count.

---

### Topic 5: Confirmation Summary

After all steps are collected, display a summary:

```
Workflow: [workflowName] ([workflowSlug].yml)
Trigger: [trigger]
Action reference: [actionRef]
Steps ([count]):

1. [stepSlug] — [stepObjective] → [stepOutputArtifact]
2. [stepSlug] — [stepObjective] → [stepOutputArtifact]
...

[C] Confirm and continue to dependency mapping
[E] Edit a step
[A] Add another step
```

HALT and wait for selection.

- **[C]:** Update WIP file with all captured data, mark `stepsCompleted: [1]`, then read fully and follow: `steps/step-02-dependencies.md`
- **[E]:** Ask which step to edit (by number), re-collect that step's data, re-show summary
- **[A]:** Collect additional step(s), re-show summary

---

## EDIT MODE NOTES

In edit mode (resuming from WIP or reconstructed from existing workflow):

- Pre-populate all fields from WIP
- Show the existing steps in the summary immediately
- Ask: "Would you like to add new steps, remove steps, or modify existing steps?"
- Only collect full details for new or changed steps
- Unchanged steps are shown as read-only in the summary

---

## WIP FILE UPDATE

After confirmation, update `.workflow-creator-wip.md` frontmatter:

```yaml
stepsCompleted: [1]
status: in-progress
workflowName: '[workflowName]'
workflowSlug: '[workflowSlug]'
actionRef: '[actionRef]'
trigger: '[trigger]'
steps:
  - slug: '[stepSlug]'
    name: '[stepName]'
    objective: '[stepObjective]'
    outputArtifact: '[stepOutputArtifact]'
  # ... one entry per step
```

---

## NEXT STEP

After WIP is updated and user confirms:

Read fully and follow: `steps/step-02-dependencies.md`
