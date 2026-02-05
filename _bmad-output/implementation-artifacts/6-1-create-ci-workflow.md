# Story 6.1: Create CI Workflow

Status: done

## Story

As a **contributor**,
I want **automated CI on PRs and pushes to main**,
So that **code quality is enforced before merging**.

## Acceptance Criteria

1. **Given** push to main or pull request
   **When** CI workflow runs
   **Then** npm ci installs dependencies
   **And** npm run lint checks code style
   **And** npm run format:check verifies formatting
   **And** npm run typecheck validates types
   **And** npm run test:unit runs unit tests
   **And** npm run bundle creates dist/index.js

2. **Given** the workflow triggers
   **When** on push to main
   **Then** full CI pipeline runs

3. **Given** the workflow triggers
   **When** on pull_request to main
   **Then** full CI pipeline runs

4. **Given** CI workflow
   **When** any step fails
   **Then** workflow fails with clear error indication
   **And** subsequent steps do not run

5. **Given** CI workflow completes
   **When** all steps pass
   **Then** workflow succeeds with green status

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing `.github/workflows/ci.yml` implementation

- [x] **Task 2: Verify CI Workflow Structure** (AC: 1, 2, 3)
  - [x] Confirm trigger on push to main branch
  - [x] Confirm trigger on pull_request to main branch
  - [x] Verify permissions set to `contents: read`
  - [x] Verify timeout-minutes is set (15 minutes)

- [x] **Task 3: Verify Build Steps** (AC: 1)
  - [x] Confirm checkout with actions/checkout@v4
  - [x] Confirm Node.js 20 setup with npm caching
  - [x] Verify lockfile sync check exists
  - [x] Confirm `npm ci` for dependency installation
  - [x] Verify lint step runs `npm run lint`
  - [x] Verify format step runs `npm run format:check`
  - [x] Verify typecheck step runs `npm run typecheck`
  - [x] Verify unit test step runs `npm run test:unit`
  - [x] Verify bundle step runs `npm run bundle`

- [x] **Task 4: Verify Error Handling** (AC: 4, 5)
  - [x] Confirm each step has clear name
  - [x] Verify steps fail properly when commands exit non-zero
  - [x] Confirm cleanup steps run with `if: always()` where needed

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Requirements

- GitHub Actions workflow file at `.github/workflows/ci.yml`
- Uses `ubuntu-latest` runner for compatibility
- Node.js 20 with npm caching for faster builds
- All npm scripts defined in package.json

### Implementation Reference

The CI workflow exists at `.github/workflows/ci.yml`:

- Triggers on push to main and PR to main
- Runs full quality pipeline: lint, format, typecheck, test, bundle
- Includes Docker build and verification steps
- Has cleanup steps that run on always()
- Added test coverage artifact upload on failure

### Key Patterns

```yaml
# CI workflow structure
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run bundle
```

### Project Structure Notes

- Workflow location: `.github/workflows/ci.yml`
- Package scripts defined in `package.json`
- ESLint config: `.eslintrc.json`
- TypeScript config: `tsconfig.json`
- Prettier config: `.prettierrc`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Quality Gates]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) - Code Review 2026-02-05

### Debug Log References

N/A - Verification task only

### Completion Notes List

- All acceptance criteria verified against implementation
- CI workflow properly configured with all required steps
- Added test coverage artifact upload on failure (Issue #9 fix)

### File List

- `.github/workflows/ci.yml` - Main CI workflow file (verified + enhanced)

### Change Log

| Date       | Change                                                            | Author          |
| ---------- | ----------------------------------------------------------------- | --------------- |
| 2026-02-05 | Code review completed, all tasks verified, status updated to done | Claude Opus 4.5 |
| 2026-02-05 | Added test coverage artifact upload on failure                    | Claude Opus 4.5 |
