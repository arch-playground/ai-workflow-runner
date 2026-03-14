# Evaluate

**Goal:** Evaluate workflow step prompts by running them against a sample codebase, grading outputs against assertions, and producing benchmark reports.

**MANDATE:** Load `skills/workflow-creator/knowledge/eval-guide.md` BEFORE starting evaluation. It defines the directory structure, schemas, and lifecycle.

---

## INITIALIZATION

1. Load and internalize `skills/workflow-creator/knowledge/eval-guide.md`
2. Determine the workflow to evaluate:
   - If coming from Step 04 (WIP file has `stepsCompleted` including generate): use `workflowSlug` from WIP
   - If standalone entry: the workflow name was provided by the user or detected by `workflow.md`
3. Set `evalWorkflow` to the workflow name
4. Read the workflow YAML at `.github/workflows/<evalWorkflow>.yml`
5. Parse the `needs:` fields to build the step dependency graph

---

## PHASE 1: SETUP

Run `skills/workflow-creator/checklists/eval-checklist.md` against the target workflow.

If any item fails: HALT and report the failure. Do not proceed.

After checklist passes, present the available steps to the user:

```
Workflow: <evalWorkflow>
Sample: .evaluations/workflows/<evalWorkflow>/sample/

Available steps:
  [1] <step-name-1> (no dependencies)
  [2] <step-name-2> (depends on: <step-1>)
  [3] <step-name-3> (depends on: <step-1>)
  ...

Which steps would you like to evaluate? (Enter numbers, "all", or step names)
Runs per step [default: 3]:
```

**HALT and wait for user selection.**

Record `evalSelectedSteps` and `evalRunsPerStep`. If coming from WIP flow, update the WIP file with these values plus `evalPhase: setup`.

---

## PHASE 2: GENERATE ASSERTIONS

For each selected step, check if `assertions/<step-slug>.json` already exists.

**If assertions exist:**

```
Assertions already exist for <step-name> (<N> assertions).
[K] Keep existing  [R] Regenerate
```

HALT and wait for selection per step.

**If assertions do not exist (or user chose Regenerate):**

Dispatch the assertion-generator agent as a subagent with these inputs:

- Step prompt file path (from workflow YAML `workflow_path:` field)
- Template file path (if a matching template exists in `templates/` — match by step name)
- Sample codebase path: `.evaluations/workflows/<evalWorkflow>/sample/`
- Step slug

After the agent returns, present the generated assertions to the user:

```
Generated assertions for <step-name>:

  [1] (critical/structure) <assertion text>
  [2] (critical/template) <assertion text>
  [3] (critical/completeness) <assertion text>
  [4] (major/quality) <assertion text>
  ...

[A] Accept  [E] Edit (specify number)  [D] Delete (specify number)  [+] Add custom
```

**HALT and wait for user review.** Repeat until user accepts.

Save to `.evaluations/workflows/<evalWorkflow>/assertions/<step-slug>.json`.

Update WIP `evalPhase: assertions` if in WIP flow.

---

## PHASE 3: EXECUTE RUNS

Determine execution order from the dependency graph:

- Group steps by dependency level (level 0 = no dependencies, level 1 = depends on level 0, etc.)
- Execute each level sequentially; within a level, execute steps in parallel

For each step at each level:

### Resolve Artifacts (for steps with dependencies)

For each dependency:

1. Look in `runs/<dependency-step>/` for the most recent run where all critical assertions in `grading.json` passed
2. If no graded run exists, use the most recent run's output (highest run number)
3. If no run exists, HALT:

```
ERROR: Step '<step-name>' depends on '<dependency>' which has no cached outputs.
Run '<dependency>' first, then retry.
```

Copy resolved artifacts to a temporary working area at the paths the step prompt expects.

### Dispatch Runs

For each run (1 to `evalRunsPerStep`):

1. Determine next run number (see eval-guide.md for numbering rules)
2. Create `runs/<step-slug>/run-NNN/output/` directory
3. Dispatch step-runner agent as a subagent with:
   - Step prompt file path
   - Sample codebase path
   - Resolved artifact paths (if any)
   - Output directory: `runs/<step-slug>/run-NNN/output/`

Progress update after each run completes:

```
<step-name> run-NNN: complete
```

After all runs for a step complete, immediately proceed to grading for that step (Phase 4 interleaved).

Update WIP `evalPhase: running` if in WIP flow.

---

## PHASE 4: GRADE

After all runs for a step complete, dispatch the grader agent for each run:

Dispatch grader agent as a subagent with:

- Assertions file: `.evaluations/workflows/<evalWorkflow>/assertions/<step-slug>.json`
- Run output directory: `runs/<step-slug>/run-NNN/output/`
- Step prompt file path
- Template file path (if exists)
- Sample codebase path

Grade all runs for a step in parallel.

Progress update after each grading completes:

```
<step-name> run-NNN: graded (<passed>/<total> passed)
```

Update WIP `evalPhase: grading` if in WIP flow.

---

## PHASE 5: ANALYZE & BENCHMARK

After ALL steps are graded, dispatch the analyzer agent as a subagent with:

- Evaluation directory: `.evaluations/workflows/<evalWorkflow>/`
- Steps evaluated: list of step slugs
- Runs per step: `evalRunsPerStep`

The analyzer reads all grading.json files, computes statistics, checks for previous benchmark.json, and writes:

- `.evaluations/workflows/<evalWorkflow>/benchmark.json`
- `.evaluations/workflows/<evalWorkflow>/benchmark.md`

Update WIP `evalPhase: analyzing` if in WIP flow.

---

## PHASE 6: REPORT & ASK USER

Read and display the contents of `benchmark.md` to the user.

Then present options:

```
Evaluation complete. What would you like to do?

[R] Re-run — Run additional iterations with the same assertions
[O] Optimize — Manually edit step prompts, then re-evaluate
[S] Select different steps — Evaluate other steps
[D] Done — Finish evaluation
```

**HALT and wait for user selection.**

- **[R] Re-run:** Go back to Phase 3. New runs will be appended (run numbers continue from last). Grading and analysis run again with all runs (old + new).
- **[O] Optimize:** Inform the user which prompt files to edit (with file paths). After they confirm edits are done, go back to Phase 3.
- **[S] Select different steps:** Go back to Phase 1 (step selection).
- **[D] Done:** Update WIP `evalPhase: done` and `stepsCompleted` to include `"evaluate"`. Display:

```
Evaluation complete.

Results saved to:
  .evaluations/workflows/<evalWorkflow>/benchmark.md
  .evaluations/workflows/<evalWorkflow>/benchmark.json

Run results in:
  .evaluations/workflows/<evalWorkflow>/runs/
```

The evaluation session is complete.

---

## NOTES

- All paths are relative to CWD (the user's repository root)
- When dispatching subagents, provide full absolute paths
- Do NOT automatically proceed between phases — each phase ends with a user interaction point or explicit progression
- **CRITICAL: When evaluation is done, it is DONE. Do NOT automatically load or execute the next instruction.** HALT and wait for the user.
