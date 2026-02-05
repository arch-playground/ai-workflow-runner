# Story 6.4: Create E2E Test Workflow

Status: done

## Story

As a **contributor**,
I want **E2E tests for the action itself**,
So that **real-world usage scenarios are validated in CI**.

## Acceptance Criteria

1. **Given** test-action.yml workflow
   **When** run
   **Then** action is tested with valid workflow path
   **And** outputs are verified (status, result)

2. **Given** E2E test scenarios
   **When** action runs with missing workflow path
   **Then** action fails as expected

3. **Given** E2E test scenarios
   **When** action runs with invalid env_vars JSON
   **Then** action fails as expected

4. **Given** E2E test scenarios
   **When** action runs with path traversal attempt
   **Then** action fails as expected (security)

5. **Given** E2E test matrix
   **When** multiple scenarios run
   **Then** fail-fast: false allows all tests to complete
   **And** each scenario outcome is verified

6. **Given** secret masking test
   **When** action runs with secrets in env_vars
   **Then** secret values are not exposed in output

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing `.github/workflows/test-action.yml` implementation

- [x] **Task 2: Verify Workflow Configuration** (AC: 5)
  - [x] Confirm triggers using workflow_run after CI completes
  - [x] Verify permissions: contents: read
  - [x] Confirm timeout-minutes is set (15 minutes)
  - [x] Verify matrix strategy with fail-fast: false
  - [x] Confirm job only runs when CI workflow succeeds

- [x] **Task 3: Verify Test Matrix Scenarios** (AC: 1, 2, 3, 4, 6)
  - [x] Valid workflow scenario: should succeed
  - [x] Missing workflow_path scenario: should fail
  - [x] Invalid env_vars JSON scenario: should fail
  - [x] Non-existent workflow scenario: should fail
  - [x] Path traversal scenario: should fail
  - [x] Unicode workflow path scenario: should succeed
  - [x] Spaces in path scenario: should succeed
  - [x] Secret masking scenario: should succeed and verify masking

- [x] **Task 4: Verify Test Fixtures Setup** (AC: 1)
  - [x] Confirm test fixtures are created dynamically
  - [x] Verify `.github/test-fixtures/valid-workflow.md` creation
  - [x] Verify `.github/test-fixtures/workflow-日本語.md` creation
  - [x] Verify `.github/test-fixtures/workflow with spaces.md` creation

- [x] **Task 5: Verify Outcome Verification** (AC: 1, 2, 3, 4, 5)
  - [x] Confirm `continue-on-error: true` on action step
  - [x] Verify outcome check logic (expected vs actual)
  - [x] Confirm outputs are verified when success expected
  - [x] Verify status output is set
  - [x] Verify result output is set

- [x] **Task 6: Verify Secret Masking Test** (AC: 6)
  - [x] Confirm verify_masked flag in matrix
  - [x] Verify grep check for secret value in output
  - [x] Confirm test fails if secret is exposed

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Requirements

- E2E tests run the actual action using `uses: ./`
- Matrix strategy tests multiple scenarios in parallel
- Uses continue-on-error to capture all outcomes
- Dynamically creates test fixtures for each run
- Runs after CI workflow completes successfully (workflow_run trigger)

### Implementation Reference

The E2E test workflow exists at `.github/workflows/test-action.yml`:

- Matrix with 8 test scenarios
- Covers success and failure cases
- Includes security tests (path traversal, secret masking)
- Unicode and special character path support
- Triggered by workflow_run to avoid duplicate runs

### Key Patterns

```yaml
# E2E test workflow pattern
on:
  workflow_run:
    workflows: ['CI']
    types:
      - completed
    branches: [main]

jobs:
  e2e-tests:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: 'Valid workflow'
            workflow_path: '.github/test-fixtures/valid-workflow.md'
            should_fail: false
          - name: 'Path traversal blocked'
            workflow_path: '../../../etc/passwd'
            should_fail: true

steps:
  - name: Run action
    id: test
    uses: ./
    continue-on-error: true
    with:
      workflow_path: ${{ matrix.workflow_path }}

  - name: Verify outcome
    run: |
      if [ "${{ matrix.should_fail }}" = "true" ]; then
        [ "${{ steps.test.outcome }}" = "failure" ]
      else
        [ "${{ steps.test.outcome }}" = "success" ]
      fi
```

### Test Scenarios

| Scenario              | Expected | Purpose          |
| --------------------- | -------- | ---------------- |
| Valid workflow        | Success  | Happy path       |
| Missing workflow_path | Failure  | Input validation |
| Invalid JSON          | Failure  | Input validation |
| Non-existent file     | Failure  | File validation  |
| Path traversal        | Failure  | Security         |
| Unicode path          | Success  | i18n support     |
| Spaces in path        | Success  | Special chars    |
| Secret masking        | Success  | Security         |

### Project Structure Notes

- E2E workflow: `.github/workflows/test-action.yml`
- Test fixtures created dynamically in `.github/test-fixtures/`
- Action definition: `action.yml`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4]
- [Source: _bmad-output/planning-artifacts/prd.md#Security Requirements]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) - Code Review 2026-02-05

### Debug Log References

N/A - Verification task only

### Completion Notes List

- All acceptance criteria verified against implementation
- Changed trigger from push/PR to workflow_run to avoid duplicate runs (Issue #6 fix)
- Added condition to only run when CI succeeds

### File List

- `.github/workflows/test-action.yml` - E2E test workflow (verified + enhanced)
- `action.yml` - Action being tested (verified)

### Change Log

| Date       | Change                                                            | Author          |
| ---------- | ----------------------------------------------------------------- | --------------- |
| 2026-02-05 | Code review completed, all tasks verified, status updated to done | Claude Opus 4.5 |
| 2026-02-05 | Changed trigger to workflow_run after CI completes                | Claude Opus 4.5 |
| 2026-02-05 | Added success condition to prevent running on failed CI           | Claude Opus 4.5 |
