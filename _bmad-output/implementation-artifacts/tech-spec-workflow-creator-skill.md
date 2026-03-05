---
title: 'workflow-creator Skill'
slug: 'workflow-creator-skill'
created: '2026-03-05'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['markdown', 'yaml', 'github-actions']
files_to_modify: [
  'skills/workflow-creator/SKILL.md',
  'skills/workflow-creator/workflow.md',
  'skills/workflow-creator/steps/step-01-discover.md',
  'skills/workflow-creator/steps/step-02-dependencies.md',
  'skills/workflow-creator/steps/step-03-prompts.md',
  'skills/workflow-creator/steps/step-04-generate.md',
  'skills/workflow-creator/knowledge/action-schema.md',
  'skills/workflow-creator/knowledge/auth-patterns.md',
  'skills/workflow-creator/knowledge/prompt-quality-guide.md',
  'skills/workflow-creator/checklists/output-checklist.md'
]
# Note: Task 10a modifies step-02, step-03, step-04 (adding load instructions) — included above
code_patterns: ['step-file-architecture', 'SKILL.md-frontmatter', 'stepsCompleted-tracking']
test_patterns: []
---

# Tech-Spec: workflow-creator Skill

**Created:** 2026-03-05

## Overview

### Problem Statement

Users who want to automate AI-powered tasks using `ai-workflow-runner` have to manually compose multi-job GitHub Actions workflows, figure out the action's input schema, design dependency graphs, write prompt `.md` files, and optionally add validation scripts — with no guided assistance. This is error-prone and time-consuming, especially for workflows with parallel/sequential job dependencies.

### Solution

A Claude Code skill (`workflow-creator`) that guides users through a short discovery conversation, builds a dependency graph for their workflow steps, and generates: (1) a multi-job `.github/workflows/<name>.yml` using `ai-workflow-runner`, (2) individual `workflows/<step-name>.md` AI prompt files per step, and (3) optional Python/JS validation scripts per step.

### Scope

**In Scope:**
- Skill definition file (`SKILL.md`) with trigger descriptions and usage guidance
- Step-file workflow architecture (modeled after BMAD quick-spec): step-01 through step-04
- Step 01: Discover — gather workflow name, trigger, steps, and high-level objective per step
- Step 02: Dependencies — map parallel vs sequential relationships, show Mermaid diagram for confirmation
- Step 03: Prompt authoring — guide user to write/confirm the AI prompt for each step (output format, constraints, validation needs)
- Step 04: Generate — produce the final `.yml` and all `.md` prompt files (and optional validation scripts)
- Workflow editing/updating — load an existing generated workflow, allow user to add/remove/modify steps, regenerate affected files
- Post-generation validation using `action-validator` (npm package) to validate the generated `.github/workflows/*.yml` against GitHub Actions schema
- Full knowledge of `ai-workflow-runner` action inputs (workflow_path, prompt, env_vars, timeout_minutes, validation_script, auth_config, model, etc.)
- Auth/secrets setup patterns (Anthropic API key, GitHub Copilot token, custom model)
- Validation script guidance (Python/JS, `AI_LAST_MESSAGE`, retry behavior)
- Passing data between jobs (GitHub Actions `outputs`, artifact upload/download)

**Out of Scope:**
- Actually running or testing the generated workflow
- BMAD agent mode (no persona, no menu system) — this is a Claude Code skill, not a BMAD agent
- Non-Linux runners (Windows/macOS not supported by the action)
- Modifying `ai-workflow-runner` source code itself
- Matrix jobs (same AI step run across multiple inputs)
- More than 20 steps in a single workflow (GitHub Actions job limit and YAML size practicality — skill warns and suggests splitting into multiple workflows)

## Context for Development

### Codebase Patterns

**Confirmed Clean Slate** — `skills/workflow-creator/` does not exist yet. No legacy constraints.

**Skill structure** (derived from `find-skills` global skill and BMAD step-file pattern):
- Skills live in `skills/<skill-name>/` (project-level, relative to repo root)
- Entry point: `SKILL.md` with YAML frontmatter `name:` and `description:` fields — Claude activates the skill based on these
- Step-file architecture: `SKILL.md` describes the skill + entry workflow → `workflow.md` → `steps/step-01.md`, `step-02.md`, etc.
- Progress tracked via `stepsCompleted: [1, 2, ...]` in frontmatter of a WIP output file written to the user's repo
- BMAD's `workflow.xml` execution engine is NOT used — this is pure markdown instruction files
- The skill produces files in the user's target repository; all output paths are relative to user's project root
- `find-skills` is the only existing Claude Code skill: it is a single `SKILL.md` with no step files — valid for simple skills. For multi-step guided workflows, step-file architecture is required.

**action.yml inputs (complete, authoritative):**

| Input | Required | Default | Notes |
| ----- | -------- | ------- | ----- |
| `workflow_path` | yes | — | Path to `.md` prompt file, relative to workspace root |
| `prompt` | no | `''` | Additional prompt text, max 100KB |
| `env_vars` | no | `'{}'` | JSON object of env vars, max 64KB / 100 entries |
| `timeout_minutes` | no | `30` | Max execution time |
| `validation_script` | no | `''` | File path (`.py`/`.js`) or inline (`python:...` / `js:...`) |
| `validation_script_type` | no | `''` | Only needed for inline scripts without prefix |
| `validation_max_retry` | no | `5` | Max retries, range 1–20 |
| `opencode_config` | no | `''` | Path to `config.json` (non-sensitive provider/model config) |
| `auth_config` | no | `''` | Path to `auth.json` (sensitive API keys — use GitHub Secrets) |
| `model` | no | `''` | Override model, e.g. `anthropic/claude-sonnet-4-5-20250929` |
| `list_models` | no | `'false'` | Print models and exit |

**action.yml outputs:**

| Output | Description |
| ------ | ----------- |
| `status` | `success` / `failure` / `cancelled` / `timeout` |
| `result` | AI last message as JSON string, max 900KB |

**Auth patterns (from examples):**
- Anthropic API key: `env: OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}`
- Copilot token: write `auth.json` from secret, pass `auth_config: 'auth.json'`, cleanup `if: always()`
- Custom model: `model` input or `opencode_config` pointing to `config.json`

**Validation script contract:**
- Receives `AI_LAST_MESSAGE` env var (AI's last response, ~100KB)
- Returns empty or `"true"` → success; any other string → used as retry feedback to AI
- Timeout: 60 seconds per script execution

### Complexity Reference: `document-repo` Workflow (16-step example)

This is an example of a complex real-world workflow with 16 steps (`document-repo` from microservice-swarm). Key patterns to adopt in the skill's guidance and generated output (do NOT copy its format or structure):

**Key lesson for workflow-creator**: A 16-step workflow translates to 16 GitHub Actions jobs. The skill must help users:
1. Identify which steps are truly independent (can run in parallel) vs which need upstream outputs
2. Understand that each job runs in isolation — data between steps must be passed explicitly via outputs or artifacts
3. Write prompt files that are self-contained (no reliance on in-memory state from prior steps)
4. Define clear `SUCCESS CRITERIA` per step (maps to the validation script contract)

**Parallel opportunity example from document-repo:**
Steps 04–14 are all independent document generators. In GitHub Actions, these could run as a parallel fan-out from step-03 (overview), with step-15 (index) as the fan-in. This dramatically reduces total workflow time.

```
step-01-init → step-02-scan → step-03-overview
                                    ↓ (fan-out, all parallel)
          step-04 step-05 step-06 step-07 step-08 step-09 step-10 step-11 step-12 step-13 step-14
                                    ↓ (fan-in)
                               step-15-index → step-16-validate
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `action.yml` | Authoritative action input/output schema |
| `README.md` | Full reference with examples, security, limits |
| `examples/basic-workflow/.github/workflows/run-ai.yml` | Simplest single-job pattern |
| `examples/with-validation/.github/workflows/run-ai.yml` | Validation + retry pattern |
| `examples/github-copilot/.github/workflows/run-ai.yml` | Auth config (Copilot) pattern |
| `examples/custom-model/.github/workflows/run-ai.yml` | Model override + opencode_config pattern |
| `examples/with-validation/validate.py` | Example validation script |
| `~/.agents/skills/find-skills/SKILL.md` | Reference for SKILL.md format and frontmatter structure |

### Technical Decisions

- Skill format: Claude Code skill (SKILL.md + workflow steps), NOT a BMAD agent or workflow.yaml
- Step architecture: 4 steps mirroring BMAD quick-spec pattern for context-safe execution
- Output location: skill assumes CWD is the user's target repo root (same assumption as all Claude Code tools); all generated paths are relative to CWD. WIP file written to `.workflow-creator-wip.md` at CWD root.
- Mermaid diagram shown at Step 02 before any file generation — user must confirm dependency graph; corrections are applied interactively and the diagram re-rendered until user confirms
- Validation scripts: optional per step; skill writes them to `workflows/validation/<step-name>.py` by default
- Edit mode identification: user provides an existing `.github/workflows/<name>.yml` path. The skill reads the YAML and reconstructs WIP state by matching job `name:` fields to generated prompt file paths (`workflow_path:` input). If a job cannot be mapped, it is flagged as "unrecognised" and the user is asked to clarify or skip. If >30% of jobs cannot be mapped, fall back to full re-creation mode with a warning.
- `npx` prerequisite: Step 04 checks for `npx` availability before attempting `action-validator`. If not available, logs a warning and skips validation, instructing the user to run `npx action-validator <file>` manually after Node.js is installed.
- `action-validator` fix loop: if the validator reports errors, the skill analyses the errors, regenerates only the affected YAML sections, rewrites the file, and re-runs the validator — up to 3 iterations. If still failing after 3 attempts, HALT and surface the raw errors to the user.

### ai-workflow-runner Key Principles

#### How ai-workflow-runner Works

- Each `workflow_path` points to a `.md` file that is the AI's instruction prompt
- The action outputs `status` (`success`/`failure`/`cancelled`/`timeout`) and `result` (JSON string)
- Validation scripts can enforce output quality with retry loops (up to 20 retries)
- Auth via `auth.json` (secrets) + provider config via `opencode_config`
- Only Linux runners are supported — never suggest Windows or macOS runners

#### GitHub Actions Multi-Job Dependency Pattern

```yaml
jobs:
  step-a:
    runs-on: ubuntu-latest
    steps: [...]

  step-b:
    needs: step-a        # sequential dependency
    runs-on: ubuntu-latest
    steps: [...]

  step-c:
    needs: step-a        # same parent = runs parallel with step-b
    runs-on: ubuntu-latest
    steps: [...]

  step-d:
    needs: [step-b, step-c]  # fan-in after parallel steps
    runs-on: ubuntu-latest
    steps: [...]
```

#### Core Structural Principle

Each workflow step = one focused AI task with:
- A clear `.md` prompt file (explicit objective, constraints, expected output format)
- Clear inputs via `env_vars` (pass context from previous steps)
- A validation script that enforces the expected output format and triggers retry if not met

---

### BMAD Research Findings (Design Principles to Apply)

These principles were extracted from deep reading of the installed BMAD codebase and MUST inform how the skill itself is designed and how it instructs users to build high-quality AI workflow steps.

#### 1. Core Execution Engine Pattern

BMAD separates configuration from logic:
- `workflow.yaml` = pure configuration (variables, paths, metadata)
- `instructions.xml` or step `.md` files = the actual logic
- Apply to this skill: `SKILL.md` holds identity/triggers; step files hold all execution logic

#### 2. Two Instruction Patterns

**Pattern A: XML workflow** — complex, multi-step with precise control flow (`<step>`, `<check if>`, `<action>`, `<ask>`, `<goto>`)

**Pattern B: Markdown step-file architecture** — conversational, just-in-time loading (one step file at a time, never preload future steps)

This skill uses Pattern B (markdown step-file), consistent with quick-spec and brainstorming workflows.

#### 3. Seven BMAD Design Principles (apply to both the skill and the generated workflows)

| Principle | Application to workflow-creator |
| --------- | ------------------------------- |
| **Single Responsibility** | Each generated GitHub Actions job = one focused AI task = one `.md` prompt file |
| **Exhaustive but Lazy Loading** | Skill loads user's existing workflow file only when editing; reads it completely |
| **State Tracking via Files** | Progress tracked in WIP frontmatter `stepsCompleted`; generated workflow state tracked in the `.yml` |
| **Strict Sequential Execution** | Step files execute in order; never skip or preload next step |
| **Validation Gates** | Skill validates generated YAML against a checklist before handing to user; each AI job can have a validation script |
| **User Collaboration** | Show Mermaid dependency graph and prompt file previews before writing; user confirms each |
| **Context Propagation** | Auth config, model, timeout defaults set once at workflow level, inherited by all jobs |

#### 4. High-Quality Workflow Step Principles

Apply these when guiding users to write AI prompt files (`.md`):
- **Machine-enforceable instructions**: prompt files must state the objective explicitly, with constraints and expected output format — not vague goals
- **No ambiguity**: every step prompt must specify what "done" looks like
- **Explicit failure paths**: if the AI step can fail, a validation script should catch it and return actionable feedback for retry
- **One output per step**: each prompt file produces one clearly defined artifact (a file, a JSON summary, a report)
- **Template output = save checkpoint**: AI steps should be scoped so their output can be validated atomically

#### 5. GitHub Actions Dependency Modeling (maps to BMAD sequential/parallel step patterns)

```
Fan-out (parallel from one parent):    needs: [parent-job]        # both children share same needs
Fan-in (join after parallel):          needs: [job-a, job-b]      # wait for all parents
Sequential chain:                      needs: previous-job
```

Data passing between jobs:
- Small values (strings, paths): GitHub Actions `outputs` + `needs.<job>.outputs.<key>`
- Files/artifacts: `actions/upload-artifact` → `actions/download-artifact`
- Warning: no filesystem state persists between jobs — must be explicit

## Implementation Plan

### Tasks

Tasks are ordered by dependency — foundational knowledge files first, then entry point, then step files in execution order.

- [x] Task 1: Create `skills/workflow-creator/knowledge/action-schema.md`
  - File: `skills/workflow-creator/knowledge/action-schema.md`
  - Action: Document complete `ai-workflow-runner` action input/output schema, limits, auth patterns, validation script contract, and all 4 example YAML snippets (basic, validation, copilot, custom-model). This is the skill's embedded reference — step files load from here so they never need to look up the README.
  - Notes: Pull directly from `action.yml` + examples. Include input limits table, output limits, Linux-only constraint.

- [x] Task 2: Create `skills/workflow-creator/knowledge/auth-patterns.md`
  - File: `skills/workflow-creator/knowledge/auth-patterns.md`
  - Action: Document all 3 auth patterns with complete YAML snippets: (1) Anthropic API key via env, (2) Copilot token via auth.json + cleanup step, (3) custom model via opencode_config. Include secrets vs vars guidance and when to use each.
  - Notes: Critical for Step 04 generate — the skill must emit correct auth setup without user knowing the details.

- [x] Task 3: Create `skills/workflow-creator/knowledge/prompt-quality-guide.md`
  - File: `skills/workflow-creator/knowledge/prompt-quality-guide.md`
  - Action: Document the principles for writing high-quality AI workflow prompt files: single responsibility, explicit objective, explicit output format, explicit constraints, success criteria, data isolation (no reliance on previous step in-memory state). Include a before/after example of a weak vs strong prompt file. Reference BMAD machine-enforceable instruction principles.
  - Notes: Used by Step 03 to guide users when authoring prompts. Also embedded into each generated `.md` prompt file as a comment block.

- [x] Task 4: Create `skills/workflow-creator/checklists/output-checklist.md`
  - File: `skills/workflow-creator/checklists/output-checklist.md`
  - Action: Create a validation checklist that Step 04 runs before finalizing output. Checklist items: (1) every job has `runs-on: ubuntu-latest`, (2) every job references a `.md` prompt file that was generated, (3) `needs:` graph is acyclic, (4) no job references a previous job's filesystem state without artifact download, (5) auth setup is present and correct, (6) at least one job has `id:` set if outputs are used, (7) cleanup step present if `auth.json` is written, (8) `action-validator` passes with zero errors.
  - Notes: Mirrors BMAD's checklist.md pattern — skill cannot hand off output until all items pass. Item (8) is the final gate after all other items pass.

- [x] Task 5: Create `skills/workflow-creator/SKILL.md`
  - File: `skills/workflow-creator/SKILL.md`
  - Action: Create SKILL.md with YAML frontmatter (`name: workflow-creator`, `description:` covering trigger phrases), followed by skill overview, when-to-use triggers, what it produces, and how to invoke the workflow. Load `workflow.md` to begin the guided process. Include a **Prerequisites** section listing: Node.js/npx required for `action-validator` (optional but recommended), and that CWD must be the target repository root.
  - Notes: Trigger phrases must cover: "create a github actions workflow", "I want to automate with ai-workflow-runner", "build a workflow", "create workflow steps", "workflow creator", "edit my workflow". Description field is what Claude matches against — make it comprehensive.

- [x] Task 6: Create `skills/workflow-creator/workflow.md`
  - File: `skills/workflow-creator/workflow.md`
  - Action: Create the entry-point workflow file. Responsibilities: (1) check for existing `.workflow-creator-wip.md` in CWD — if found, offer resume or archive; archive naming convention: `.workflow-creator-wip-archived-<ISO-date>.md` (e.g. `2026-03-05`), never overwrite — if that archive name already exists, append `-2`, `-3`, etc.; (2) detect create vs edit mode: if user provides a `.github/workflows/*.yml` path it is edit mode, otherwise create mode; (3) in edit mode, read the existing YAML and reconstruct WIP state by matching each job's `workflow_path:` input value to its prompt file path — jobs with unrecognisable mappings are listed for user clarification; (4) load `steps/step-01-discover.md`. WIP file: `.workflow-creator-wip.md` at CWD root, with `stepsCompleted` frontmatter.
  - Notes: CWD is the user's target repository root — this is always the correct location for the WIP file regardless of where the skill files themselves live. Edit mode fallback — if >30% of jobs cannot be mapped, inform user and offer full re-creation. Never silently discard existing prompt files.

- [x] Task 7: Create `skills/workflow-creator/steps/step-01-discover.md`
  - File: `skills/workflow-creator/steps/step-01-discover.md`
  - Action: Guide user through discovery conversation. Collect: (1) workflow name and purpose, (2) trigger (push/PR/schedule/workflow_dispatch), (3) action reference string (default: `arch-playground/ai-workflow-runner@v1` — ask if user is using a fork or different version), (4) list of steps — for each: name, slug (job-id safe), objective in one sentence, expected output artifact. Ask one topic at a time. Suggest step breakdown if user describes a complex goal. Initialize WIP file with collected data including action reference. Show summary for confirmation before proceeding.
  - Notes: Job ID slugs must be lowercase, alphanumeric + hyphens only. Hard limit: warn at >10 steps, HALT with suggestion to split into multiple workflows at >20 steps. Default trigger: `workflow_dispatch` if unsure. In edit mode, pre-populate from WIP and only ask about new/changed steps.

- [x] Task 8: Create `skills/workflow-creator/steps/step-02-dependencies.md`
  - File: `skills/workflow-creator/steps/step-02-dependencies.md`
  - Action: Guide user to map dependencies between steps. Primary question: "Does any step need output from another step before it can run?" — build graph from yes/no per pair. Ask which steps can run in parallel. Build the `needs:` graph. Generate a Mermaid diagram. Show diagram and HALT for user confirmation. If user requests a correction (e.g. "step-C should also depend on step-B"), apply the change, re-validate acyclicity, re-render the diagram, and re-present — repeat until user confirms. Collect: auth method choice, default timeout, model preference, data-passing strategy per dependency edge (output string vs artifact). For each edge that passes files, note which jobs need upload/download steps.
  - Notes: Validate graph is acyclic after every correction. Suggest parallelization if user has a fully linear chain of independent steps. Update WIP file with confirmed dependency graph and artifact-transfer edges.

- [x] Task 9: Create `skills/workflow-creator/steps/step-03-prompts.md`
  - File: `skills/workflow-creator/steps/step-03-prompts.md`
  - Action: **MANDATE: Load `knowledge/prompt-quality-guide.md` before presenting any prompt suggestions.** For each step in order: show the step objective, generate a suggested prompt (objective + constraints + output format + success criteria) using the quality guide, present it with options: [A] Accept as suggested / [E] Edit / and wait for response. After all steps, ask: "Do you want to add validation scripts?" — if yes, go through each step that needs one and collect what it should check. Store all prompt content and validation specs in WIP file.
  - Notes: [A] Accept saves the suggestion as-is to WIP — the user has seen and approved it. For large workflows, users can accept all suggestions rapidly. For edit mode, only re-prompt new or changed steps; display "unchanged" steps as a read-only summary list. Always remind user at the start: each prompt runs in complete isolation — no shared memory between steps.

- [x] Task 10: Create `skills/workflow-creator/steps/step-04-generate.md`
  - File: `skills/workflow-creator/steps/step-04-generate.md`
  - Action: **MANDATE: Load `knowledge/action-schema.md` AND `knowledge/auth-patterns.md` before generating any YAML.** Generate all output files in this exact sequence:
    1. Run pre-generation checklist from `checklists/output-checklist.md` (items 1–7) — HALT on any failure, report the specific issue, do not write any files until resolved.
    2. Generate each `.md` prompt file to `workflows/<step-slug>.md`.
    3. Generate each validation script (if requested) to `workflows/validation/<step-slug>.py` or `.js`.
    4. Generate auth setup from `knowledge/auth-patterns.md`: emit the correct write-auth step (if Copilot/custom) before the first AI job and cleanup step with `if: always()` after the last AI job.
    5. For each dependency edge marked as file-transfer in WIP: emit `actions/upload-artifact@v4` in the upstream job's steps and `actions/download-artifact@v4` in the downstream job's steps before the AI step.
    6. Generate `.github/workflows/<workflow-name>.yml` with full multi-job structure, `needs:` graph, auth, and artifact steps, using the action reference from WIP (default: `arch-playground/ai-workflow-runner@v1`).
    7. Check `npx` availability: if available, run `npx action-validator .github/workflows/<workflow-name>.yml`. If errors: regenerate the entire YAML (not partial sections) with corrections applied, rewrite, re-run — up to 3 iterations. If still failing after 3 attempts, HALT and show raw errors. If `npx` not available, log warning and skip.
    8. Show final file tree. Update WIP `stepsCompleted` and status to `done`.
  - Notes: Edit mode — only regenerate files for added/modified steps; preserve unchanged prompt files. Emit a full summary of all files written vs preserved.

### Acceptance Criteria

- [x] AC1: Given a user invokes the skill with "create a github actions workflow", when the skill starts, then it asks for the workflow name and purpose before asking any other question (one topic at a time, not a big form).

- [x] AC2: Given a user describes 3 steps where step-B and step-C both depend on step-A but not each other, when Step 02 completes, then the Mermaid diagram shows step-A → step-B and step-A → step-C as parallel branches, and the generated YAML has `needs: step-a` on both step-B and step-C jobs.

- [x] AC3: Given a user confirms the dependency graph, when Step 04 generates the `.yml`, then every job has `runs-on: ubuntu-latest` and no job references a Windows or macOS runner.

- [x] AC4: Given a user selects Copilot auth, when Step 04 generates the `.yml`, then the workflow includes a "Write auth config" step before the first AI job and a cleanup step with `if: always()` after the last AI job.

- [x] AC5: Given a user requests a validation script for a step, when Step 04 generates the files, then a `.py` or `.js` validation script is created that checks `AI_LAST_MESSAGE` and the generated job includes `validation_script:` and `validation_max_retry:` inputs.

- [x] AC6: Given Step 02 asks about data passing for a dependency edge and the user describes "the output is a generated report file", when Step 04 generates the `.yml`, then the upstream job includes `actions/upload-artifact@v4` and the downstream job includes `actions/download-artifact@v4` before the AI step. Conversely, if the user describes "just a status string", then GitHub Actions `outputs` are used instead.

- [x] AC7: Given a user invokes the skill with an existing workflow path ("edit my workflow"), when `workflow.md` initializes, then it reads the existing YAML, maps each job to its prompt file via `workflow_path:`, reports any unmapped jobs for user clarification, and in Step 03 only presents new or changed steps for editing — unchanged steps are shown as a summary list only.

- [x] AC8: Given Step 04 runs the output checklist and any of the following are true — a job missing `runs-on:`, circular `needs:`, a job referencing previous filesystem state without artifact download, auth setup missing when required, missing `id:` when outputs are used, or missing cleanup when `auth.json` is written — when the checklist fails, then the skill HALTS and reports the specific failing item before writing any files.

- [x] AC9: Given the `.github/workflows/<name>.yml` has been generated, when Step 04 runs `npx action-validator` against it, then the validator passes with zero errors before the skill reports completion. If validation fails, the skill regenerates the entire YAML with corrections and re-runs — up to 3 iterations — then HALTs with raw errors if still failing.

- [x] AC10: Given a user provides a 16-step workflow, when Step 02 analyzes the steps, then the skill correctly identifies which steps can run in parallel, generates a fan-out/fan-in Mermaid diagram, and re-renders it after any user correction before re-confirming.

- [x] AC11: Given a generated prompt `.md` file, when reviewed, then it contains: a clear objective statement, explicit output format specification, explicit constraints, and a success criteria section — not vague goals.

- [x] AC12: Given a user accepts a suggested prompt in Step 03 using [A] Accept, when Step 04 generates the files, then the prompt file contains the skill-generated objective, constraints, output format, and success criteria exactly as shown to the user.

- [x] AC13: Given a user's workflow has more than 20 steps, when Step 01 detects this, then the skill halts, warns the user about the limit, and suggests splitting into multiple workflows before continuing.

- [x] AC14: Given `npx` is not available in the user's environment, when Step 04 attempts `action-validator`, then the skill logs a warning, skips validation, completes generation, and instructs the user to run `npx action-validator .github/workflows/<name>.yml` manually after installing Node.js.

- [x] AC15: Given a user is prompted with an existing `.workflow-creator-wip.md` and declines to resume, when the skill archives it, then the archive filename is `.workflow-creator-wip-archived-<ISO-date>.md` and if that name already exists a numeric suffix (`-2`, `-3`) is appended rather than overwriting.

- [x] AC16: Given a user provides a custom action reference (e.g. `my-org/ai-workflow-runner@v2`) in Step 01, when Step 04 generates the `.yml`, then every `uses:` field referencing the action contains that exact string instead of the default.

## Additional Context

### Dependencies

- No new npm packages to install in this repo — this is a markdown/text skill only
- The skill itself has no runtime dependencies; it's pure instructions for Claude
- **`action-validator`** (npm): invoked via `npx action-validator <file>` — no global install required; validates workflow YAML against GitHub Actions JSON schema. Source: https://github.com/mpalmer/action-validator
- `actions/upload-artifact@v4` and `actions/download-artifact@v4` are GitHub-provided actions referenced in generated YAML — no installation needed

### Testing Strategy

- Manual: invoke the skill in a test repo, walk through all 4 steps for a 3-step workflow (sequential), verify generated YAML and prompt files are correct
- Manual: repeat for a 5-step workflow with parallel steps — verify `needs:` graph matches Mermaid diagram and generated YAML matches
- Manual: test dependency correction loop in Step 02 — provide an initial graph, request a change, verify diagram re-renders correctly
- Manual: test edit mode — add a step to an existing workflow, verify only new step files are generated and unchanged files are preserved
- Manual: test edit mode unmapped job — manually modify a job name in the YAML, verify skill flags it as unrecognised
- Manual: test >20 step HALT — describe 21 steps in Step 01, verify the skill halts and suggests splitting
- Manual: test WIP resume — start a workflow, interrupt after Step 01, restart skill, verify resume offer appears
- Manual: test WIP archive collision — decline resume twice on the same day, verify second archive gets `-2` suffix
- Manual: test Copilot auth path — verify auth.json write + cleanup steps are in the generated YAML
- Manual: test validation script path — verify generated validation script checks `AI_LAST_MESSAGE`
- Manual: test custom action reference — provide non-default action ref in Step 01, verify it appears in every job
- Manual: test `npx` unavailable — simulate missing npx, verify warning logged and generation completes
- Manual: run `npx action-validator` against all generated example YAMLs before shipping
- Checklist: run `output-checklist.md` against all generated examples before shipping

### Notes

- **High-risk**: Step 02 dependency graph collection — users may struggle to articulate dependencies conversationally. Mitigate by offering "do any steps need the output of another step?" as the primary question, then building the graph from yes/no answers per pair.
- **High-risk**: Edit mode — mapping YAML jobs back to WIP state using `workflow_path:` input value as the key. If a job's `workflow_path:` doesn't match any known prompt file path, it is flagged as unrecognised. Fallback to full re-creation if >30% unmapped.
- **Known limitation**: The skill cannot validate that the generated prompt `.md` files will actually work with the AI — it can only enforce structural quality. Users must test the workflow in their repo.
- **Future consideration**: Support for matrix jobs (running the same AI step across multiple inputs) — out of scope now but the YAML structure should not preclude it.
