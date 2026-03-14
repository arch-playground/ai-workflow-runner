# grading-guide.md — How to Grade Workflow Step Outputs

This guide defines grading standards for evaluating AI workflow step outputs against assertions. Load this file before grading any run.

---

## Grading Principles

### 1. Strict by Default

Grade strictly. If evidence for an assertion is ambiguous or incomplete, fail the assertion. False negatives (incorrectly failing) are preferable to false positives (incorrectly passing) — they surface real quality issues.

### 2. Evidence-Based

Every judgment must include specific evidence. Never grade based on impression alone.

- **PASS evidence:** Quote the specific output content that satisfies the assertion, or describe the structural check that passed (e.g., "YAML frontmatter contains all 4 required fields: title, service, last_updated, module_count")
- **FAIL evidence:** Quote what is missing, incorrect, or malformed. Be specific enough that someone reading only the evidence understands what went wrong.

### 3. Category-Specific Grading

#### Structure Assertions

Check output format mechanically:

- Parse YAML frontmatter — does it contain all required fields?
- Parse JSON — is it valid? Does it match the expected schema?
- Count sections/headings — does the structure match the template?

#### Template Assertions

Compare output against the template file:

- Are all template placeholders (`<!-- PLACEHOLDER_NAME -->`) replaced with real content?
- Are all required sections from the template present?
- Does the section ordering match the template?

#### Completeness Assertions

Compare output against what the sample codebase should produce:

- If the assertion says "lists all modules," scan the sample codebase to count modules, then verify the output lists them all
- If the assertion references specific entities, verify each one appears

#### Quality Assertions

Evaluate subjective quality:

- Is the content accurate relative to the sample codebase?
- Is the depth appropriate (not too shallow, not hallucinated detail)?
- Are diagrams syntactically valid?

#### Sequence Assertions

Check that the step followed its prescribed execution sequence:

- Does the frontmatter show all phases completed?
- Were phases executed in the correct order?
- Is the phase count correct?

---

## Grading Process

For each assertion in the assertions JSON:

1. Read the assertion text carefully
2. Examine the step's output files in `output/`
3. If the assertion references the template, also read the template file
4. If the assertion references the sample codebase, scan the relevant parts of `sample/`
5. Determine PASS or FAIL with specific evidence
6. Write the result to the grading JSON

---

## Output Format

Write `grading.json` to the run directory:

```json
{
  "step": "<step-slug>",
  "run": "run-NNN",
  "results": [
    {
      "id": "<assertion-id>",
      "text": "<assertion text copied from assertions file>",
      "passed": true,
      "evidence": "<specific evidence>"
    }
  ],
  "summary": {
    "total": "<number of assertions>",
    "passed": "<number passed>",
    "failed": "<number failed>"
  }
}
```

### Field Rules

- `id` and `text` must exactly match the assertions file
- `passed` is a boolean, never null
- `evidence` is always a non-empty string, even for PASS results
- `summary` counts must be consistent with the `results` array

---

## Common Grading Mistakes to Avoid

1. **Passing because the output "looks right"** — Always verify against specific criteria
2. **Failing because of minor formatting differences** — Focus on content correctness, not exact whitespace or ordering unless the assertion specifically requires it
3. **Grading based on the prompt's success criteria instead of the assertions** — The assertions file is the source of truth. The prompt's success criteria may differ.
4. **Not checking the sample codebase for completeness assertions** — You must verify against the actual sample, not just check that "some content exists"
