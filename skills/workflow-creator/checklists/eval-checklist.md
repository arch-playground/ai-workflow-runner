# eval-checklist.md — Pre-Evaluation Validation Checklist

> Run ALL items before starting evaluation. HALT on any failure.

---

### Item 1: Workflow YAML Exists

**Check:** The target workflow YAML file exists at `.github/workflows/<workflow-name>.yml`.

**HALT message if failing:**

> "Item 1 FAILED: No workflow YAML found at `.github/workflows/<workflow-name>.yml`. Provide the correct workflow name or create the workflow first."

---

### Item 2: Sample Directory Exists and Is Non-Empty

**Check:** `.evaluations/workflows/<workflow-name>/sample/` exists, is non-empty, and contains at least one source file (not just directories).

**HALT message if failing:**

> "Item 2 FAILED: Sample directory `.evaluations/workflows/<workflow-name>/sample/` is missing or empty. Create it and populate it with a sample codebase before evaluating."

---

### Item 3: Step Prompt Files Exist for Selected Steps

**Check:** For each step the user selected for evaluation, the prompt file referenced in the workflow YAML exists.

**HALT message if failing:**

> "Item 3 FAILED: Prompt file '[path]' for step '[step-name]' does not exist. Generate the workflow first or check the path."

---

### Item 4: Dependency Steps Have Cached Outputs or Are Selected

**Check:** For each selected step that has dependencies (via `needs:` in the YAML), either:

- The dependency step is also selected for evaluation, OR
- Cached outputs exist in `runs/<dependency-step>/`

**HALT message if failing:**

> "Item 4 FAILED: Step '[step-name]' depends on '[dependency-step]' which has no cached outputs and is not selected for evaluation. Either select '[dependency-step]' for evaluation or run it first."

---

### Item 5: Assertions Directory Is Writable

**Check:** Can create files in `.evaluations/workflows/<workflow-name>/assertions/`. Create the directory if it doesn't exist.

**Auto-resolution:** Create the directory.

---

### Item 6: Runs Directory Is Writable

**Check:** Can create files in `.evaluations/workflows/<workflow-name>/runs/`. Create the directory if it doesn't exist.

**Auto-resolution:** Create the directory.

---

## Checklist Summary

- [ ] Item 1: Workflow YAML exists
- [ ] Item 2: Sample directory exists and is non-empty
- [ ] Item 3: Step prompt files exist for selected steps
- [ ] Item 4: Dependency steps have cached outputs or are selected
- [ ] Item 5: Assertions directory is writable
- [ ] Item 6: Runs directory is writable
