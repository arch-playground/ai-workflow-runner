# eval-guide.md — Workflow Evaluation Framework

This guide defines how workflow evaluations work, the directory structure, assertion schema, and evaluation lifecycle. Load this file before starting any evaluation.

---

## Directory Structure

Evaluations are stored at `.evaluations/workflows/<workflow-name>/` relative to the repository root:

```
.evaluations/workflows/<workflow-name>/
├── sample/                          # User-provided sample codebase/inputs
├── assertions/
│   ├── <step-name>.json             # Assertions per step
│   └── ...
├── runs/
│   ├── <step-name>/
│   │   ├── run-001/
│   │   │   ├── output/              # Step output files
│   │   │   ├── grading.json         # Per-assertion pass/fail + evidence
│   │   │   └── timing.json          # Duration, tokens
│   │   └── run-002/
│   └── ...
├── benchmark.json                   # Aggregated stats
└── benchmark.md                     # Human-readable report
```

### Directory Rules

- `sample/` must exist, be non-empty, and contain at least one source file before evaluation can proceed
- `assertions/` files are named by step slug (e.g., `init-and-scan.json`, `modules.json`)
- `runs/<step>/run-NNN/` uses zero-padded 3-digit numbering, never resets, always increments
- `benchmark.json` and `benchmark.md` are overwritten on each analysis run (previous versions exist in git history)

---

## Assertion Schema

Each step's assertions file follows this schema:

```json
{
  "step": "<step-slug>",
  "prompt_file": "<path to step prompt .md file>",
  "template_file": "<path to template file, or null if none>",
  "assertions": [
    {
      "id": "<step-prefix>-<NN>",
      "category": "structure|template|completeness|quality|sequence",
      "text": "<human-readable assertion description>",
      "severity": "critical|major"
    }
  ]
}
```

### Categories

- `structure` — Output format, schema, frontmatter conformance
- `template` — Template placeholders replaced, required sections present
- `completeness` — All expected content present based on the sample input
- `quality` — Subjective quality checks (accuracy, depth, correctness)
- `sequence` — Step followed the prescribed phase sequence from its prompt

### Severity Levels

- `critical` — Must pass for the step to be considered successful
- `major` — Should pass; failure indicates quality issues but doesn't block

### Generation Rules

- Generate 5-10 assertions per step
- Bias toward critical/structure assertions first
- If no template file exists for a step, skip `template` category and set `template_file: null`
- ID prefix is derived from step slug (e.g., `mod-01` for modules, `scan-01` for init-and-scan)

---

## Evaluation Lifecycle

1. **Setup** — Identify workflow, validate sample directory, parse workflow YAML for step dependency graph, user selects steps and run count
2. **Generate Assertions** — Dispatch assertion-generator agent per step, present to user for review, save to assertions/<step>.json. Skip if assertions already exist.
3. **Execute Runs** — Dispatch step-runner subagent per run per step. Independent steps run in parallel. Sequential steps respect dependency order.
4. **Grade** — Dispatch grader agent per run. Produces grading.json.
5. **Analyze & Benchmark** — Dispatch analyzer agent. Aggregates across runs, compares with previous runs, produces benchmark.json + benchmark.md.
6. **Report & Ask User** — Present results. User decides: re-run, optimize (manually), or done.

---

## Step Dependency Handling

When evaluating a step that depends on prior steps:

1. Look in `runs/<dependency-step>/` for the most recent run where all critical assertions passed
2. If no graded run exists, use the most recent run's output (by run number)
3. If no run exists at all, abort and report that the dependency must be evaluated first
4. Copy resolved artifacts into the working directory at paths the step prompt expects

### Parallel Execution

Derive parallelism from the workflow YAML's `needs:` fields:

- Steps with no `needs:` or whose dependencies are all satisfied can run in parallel
- Steps with unmet dependencies must wait

---

## Run Numbering

To determine the next run number for a step:

1. List existing directories in `runs/<step>/`
2. Find the highest `run-NNN` number
3. Next run is `run-<NNN+1>` zero-padded to 3 digits
4. If no runs exist, start at `run-001`

---

## Benchmark Schema

```json
{
  "metadata": {
    "workflow": "<workflow-name>",
    "timestamp": "<ISO-8601>",
    "runs_per_step": 3,
    "steps_evaluated": ["<step-slug>"]
  },
  "steps": {
    "<step-slug>": {
      "pass_rate": { "overall": 0.8, "critical": 1.0, "major": 0.7 },
      "flaky_count": 1,
      "timing": { "mean": 125.3, "min": 98.1, "max": 152.7 },
      "tokens": { "mean": 45000, "min": 38000, "max": 52000 },
      "assertions": {
        "<assertion-id>": { "pass_rate": 0.67, "flaky": true }
      }
    }
  },
  "delta": {
    "previous_timestamp": "<ISO-8601 or null>",
    "changes": {
      "<step-slug>": { "before": 0.6, "after": 0.8, "change": "+0.20" }
    }
  },
  "recommendations": [
    {
      "step": "<step-slug>",
      "assertion_id": "<id>",
      "suggestion": "<actionable recommendation>"
    }
  ]
}
```

---

## Grading Schema

```json
{
  "step": "<step-slug>",
  "run": "run-NNN",
  "results": [
    {
      "id": "<assertion-id>",
      "text": "<assertion text>",
      "passed": true,
      "evidence": "<specific quote or finding supporting the judgment>"
    }
  ],
  "summary": { "total": 5, "passed": 4, "failed": 1 }
}
```

---

## Timing Schema

```json
{
  "step": "<step-slug>",
  "run": "run-NNN",
  "start_time": "<ISO-8601>",
  "end_time": "<ISO-8601>",
  "duration_seconds": 125.3,
  "tokens_used": null
}
```
