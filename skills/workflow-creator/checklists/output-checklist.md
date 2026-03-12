# output-checklist.md — Pre-Generation Validation Checklist

> **PHASE SPLIT — CRITICAL:**
>
> - **Items 1–7**: Run BEFORE writing any files. All must pass before a single file is written.
> - **Item 8**: Run AFTER all files are written. This is the final quality gate.
>
> The skill MUST HALT on any failure and report the specific failing item before proceeding.

---

## Checklist Items 1–7 (Pre-Generation — Run Before Writing Any Files)

### Item 1: Every Job Has a Valid Runner

**Check:** Every step in the WIP dependency graph will produce a job. Confirm that `runs-on` for all inline jobs is `ubuntu-latest` or the custom runner label recorded in the WIP (`runnerLabel`). Reusable workflow caller jobs do not have `runs-on` — the runner is declared inside the reusable workflow.

**Failure condition:** Any inline step missing a runner assignment, or any step assigned to `windows-*` or `macos-*`.

**HALT message if failing:**

> "Item 1 FAILED: Step '[step-name]' has no runner assigned (or has a non-Linux runner). The action only supports Linux runners. Fix: assign `runs-on: ubuntu-latest` (or your custom runner label) to all inline jobs before generating."

---

### Item 2: Every Job References a Generated Prompt File

**Check:** For every step in the WIP, a `workflow_path` value has been set pointing to `workflows/<step-slug>.md`. This path will be used in `with: workflow_path:` in the generated YAML.

**Failure condition:** A step exists in the dependency graph but has no prompt content in the WIP (never reviewed in Step 03).

**HALT message if failing:**

> "Item 2 FAILED: Step '[step-name]' has no prompt file defined. Return to Step 03 to complete prompt authoring for this step before generating."

---

### Item 3: `needs:` Graph Is Acyclic

**Check:** Walk the dependency graph collected in Step 02. Detect any cycle (A → B → A, or longer chains).

**Failure condition:** Any cycle exists in the `needs:` relationships.

**HALT message if failing:**

> "Item 3 FAILED: Circular dependency detected: [step-A] → [step-B] → [step-A]. A GitHub Actions job cannot depend on itself (directly or transitively). Fix the dependency graph before generating."

---

### Item 4: No Job References Previous Job's Filesystem Without Artifact Download

**Check:** For each dependency edge in the WIP where the data-passing strategy is "file" (artifact), confirm that both upload and download steps were collected. For each dependency edge where the strategy is "output" (string), confirm no file path is being passed as if it would persist.

**Failure condition:** A dependency edge is marked as file-transfer but no artifact upload/download pair is recorded in the WIP.

**HALT message if failing:**

> "Item 4 FAILED: Step '[consumer-step]' depends on '[producer-step]' for file output, but no artifact upload/download strategy was recorded. Return to Step 02 to confirm the data-passing strategy for this edge."

---

### Item 5: Auth Setup Present and Correct

**Check:** If the user selected an auth method in Step 02:

- **Anthropic API key**: Every AI job's step will include `env: OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}`
- **Copilot auth.json**: Every job using the AI action will have a write step before the AI step AND a cleanup step with `if: always()` after it
- **Custom opencode_config**: Write step present before first AI step in each job that uses it; cleanup step present if the config is sensitive

**Failure condition:** Auth method selected but no auth pattern recorded in WIP, OR auth.json pattern selected but missing cleanup tracking.

**HALT message if failing:**

> "Item 5 FAILED: Auth method '[method]' was selected but no auth configuration was recorded in the WIP. Return to Step 02 to confirm auth setup."

---

### Item 6: `id:` Set When Outputs Are Used

**Check:** For every dependency edge where data-passing strategy is "output" (string via `needs.<job>.outputs.<key>`), the producer job's AI step must have `id: ai` AND the job must declare an `outputs:` block.

**Auto-resolution:** The generated YAML always sets `id: ai` on every AI step and adds the `outputs:` block when string data-passing edges exist. This item passes automatically unless the WIP data is missing the output key name.

**Failure condition (requires HALT):** A dependency edge is marked as `strategy: output` but no `outputKey` was recorded in the WIP — the YAML cannot be generated without a key name.

**HALT message if failing:**

> "Item 6 FAILED: Step '[producer-step]' is marked to pass a string output to '[consumer-step]', but no output key name was recorded in Step 02. Return to Step 02 to specify the output key (e.g., `summary`, `result`, `filepath`)."

---

### Item 7: Cleanup Step Present When Auth/Config Files Are Written to `${{ runner.temp }}`

**Check:** If the Copilot auth pattern is selected, every job that writes `${{ runner.temp }}/auth.json` must have a cleanup step recorded.

**Failure condition:** Copilot auth selected but cleanup step tracking is missing for any affected job.

**Auto-resolution:** Step 04 always injects the cleanup step when `authMethod` is `copilot-auth-json` or `custom-opencode-config`. This item passes automatically for all jobs generated by the skill.

**Failure condition (requires HALT):** Only relevant in edit mode — if an existing job uses `auth_config:` but its YAML has no cleanup step and the user declined to regenerate that job.

**HALT message if failing (edit mode only):**

> "Item 7 FAILED: Job '[job-name]' uses `auth_config: '${{ runner.temp }}/auth.json'` but has no cleanup step with `if: always()`. This is a security risk — the auth file will persist on the runner if the job fails. Add the cleanup step manually or regenerate this job."

---

### Item 8: Reusable Workflow Caller Jobs Use Only Allowed Keys

**Check:** If `useReusableWorkflow` is `true`, verify that every caller job (jobs using `uses:` to call the reusable workflow) contains ONLY these keys: `name`, `uses`, `with`, `secrets`, `needs`, `if`, `permissions`.

**Failure condition:** A caller job includes `continue-on-error`, `runs-on`, `steps`, `env`, `outputs`, or any other key not in the allowed list.

**Auto-resolution:** Step 04 places `continue-on-error: true` inside the reusable workflow's job definition, not on the caller. This item passes automatically for skill-generated workflows.

**Failure condition (requires HALT — edit mode):** An existing caller job has disallowed keys.

**HALT message if failing:**

> "Item 8 FAILED: Caller job '[job-name]' uses `[disallowed-key]` which is not allowed on reusable workflow calls. Only `name`, `uses`, `with`, `secrets`, `needs`, `if`, and `permissions` are valid. Move `[disallowed-key]` inside the reusable workflow or remove it."

---

### Item 9: Artifact Uploads Are Scoped to Step Output Only

**Check:** For every job that uploads an artifact, verify the `path:` points to the specific output file(s) of that step — not to a shared directory that includes downloaded upstream artifacts.

**Failure condition:** An upload step's `path:` matches the same directory where artifacts are downloaded, causing upstream files to be re-uploaded redundantly.

**Auto-resolution:** Step 04 generates upload paths scoped to the step's own output file(s). This item passes automatically for skill-generated workflows.

**Failure condition (requires HALT — edit mode):** An existing job uploads an entire shared directory.

**HALT message if failing:**

> "Item 9 FAILED: Job '[job-name]' uploads `[path]` which includes files from upstream artifacts. Change the upload path to only include this step's output file(s) to avoid artifact bloat."

---

### Item 10: Concurrency Control Present for Workflows That Push

**Check:** If the workflow contains a step that runs `git push` or modifies shared state (e.g., creating issues, deploying), verify a `concurrency` block exists at the workflow level.

**Auto-resolution:** Step 04 emits a `concurrency` block when the trigger includes `schedule` or when any job contains a push step. Use `cancel-in-progress: false` for long-running AI workflows.

**Failure condition (requires HALT — edit mode):** An existing workflow pushes results but has no concurrency control, risking race conditions.

**HALT message if failing:**

> "Item 10 FAILED: This workflow pushes results but has no `concurrency` block. Add one to prevent overlapping runs from conflicting on push."

---

## Item 11: Workflow Validation Passes With Zero Errors (Post-Generation)

**Check:** After all files are written, run validation using the first available tool:

1. **`actionlint`** (preferred): `actionlint .github/workflows/<workflow-name>.yml`
2. **`npx action-validator`** (fallback): `npx action-validator .github/workflows/<workflow-name>.yml`

If a reusable workflow was generated, validate it too.

**Pre-check:** Verify tool availability. If neither is available:

- Log: "WARNING: Neither `actionlint` nor `npx action-validator` found. Skipping validation. Install actionlint (`brew install actionlint`) or Node.js, then run: `actionlint .github/workflows/<name>.yml`"
- Skip this item and mark generation as complete.

**Failure condition:** Validator reports one or more errors.

**Fix loop (max 3 iterations):**

1. Analyze the reported errors
2. Regenerate the entire `.yml` file(s) with corrections applied
3. Rewrite the file(s)
4. Re-run validation
5. If errors persist, go back to step 1 (up to 3 total attempts)

**HALT after 3 failed attempts:**

> "Item 11 FAILED after 3 regeneration attempts. Raw validation errors:
> [paste raw errors here]
>
> The generated YAML has been written to `.github/workflows/<name>.yml`. Please fix the errors manually and re-run `actionlint .github/workflows/<name>.yml` to verify."

**Success:** Validator exits with zero errors — report completion.

---

## Checklist Summary (for Step 04 tracking)

Run before writing files:

- [ ] Item 1: All jobs use `ubuntu-latest` (or declared custom runner)
- [ ] Item 2: All steps have prompt files defined
- [ ] Item 3: `needs:` graph is acyclic
- [ ] Item 4: File-transfer edges have artifact upload/download strategy
- [ ] Item 5: Auth setup is present and correct
- [ ] Item 6: `id: ai` set on steps that expose outputs
- [ ] Item 7: Cleanup steps present for auth/config files written to `${{ runner.temp }}`
- [ ] Item 8: Reusable workflow caller jobs use only allowed keys
- [ ] Item 9: Artifact uploads scoped to step output only (no directory re-uploads)
- [ ] Item 10: Concurrency control present for workflows that push

Run after writing files:

- [ ] Item 11: `actionlint` or `action-validator` passes with zero errors (or skipped with warning if unavailable)
