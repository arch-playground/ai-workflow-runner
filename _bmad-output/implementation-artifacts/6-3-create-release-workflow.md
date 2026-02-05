# Story 6.3: Create Release Workflow

Status: done

## Story

As a **maintainer**,
I want **automated releases triggered by version tags**,
So that **publishing is consistent, reliable, and follows semver**.

## Acceptance Criteria

1. **Given** tag pushed matching `v*.*.*` pattern (e.g., v1.0.0)
   **When** release workflow runs
   **Then** build and tests are run
   **And** GitHub Release is created with auto-generated notes
   **And** major version tag (e.g., v1) is updated

2. **Given** invalid tag (e.g., vfoo, v1.2, v1.2.3.4)
   **When** pushed
   **Then** release workflow does not trigger

3. **Given** concurrent releases
   **When** triggered
   **Then** concurrency group prevents race conditions
   **And** jobs do not cancel in progress (cancel-in-progress: false)

4. **Given** semver tag validation
   **When** tag is parsed
   **Then** major version is extracted correctly (v1.2.3 -> v1)
   **And** major tag points to latest patch release

5. **Given** release workflow
   **When** permissions are set
   **Then** contents: write is enabled for tag updates
   **And** GitHub token is used for release creation

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing `.github/workflows/release.yml` implementation

- [x] **Task 2: Verify Trigger Configuration** (AC: 1, 2)
  - [x] Confirm trigger on push tags matching `v[0-9]+.[0-9]+.[0-9]+`
  - [x] Verify regex properly validates semver format
  - [x] Confirm invalid tags are filtered out

- [x] **Task 3: Verify Tag Validation Job** (AC: 4)
  - [x] Confirm validate-tag job runs first
  - [x] Verify semver regex validation in step
  - [x] Confirm major version extraction (e.g., v1 from v1.2.3)
  - [x] Verify major version is passed as output

- [x] **Task 4: Verify Release Job** (AC: 1, 5)
  - [x] Confirm needs: validate-tag dependency
  - [x] Verify checkout with fetch-depth: 0 for full history
  - [x] Verify Node.js setup with caching
  - [x] Confirm npm ci, lint, format:check, typecheck, test:unit runs
  - [x] Verify bundle creation
  - [x] Confirm bundle existence check
  - [x] Verify GitHub Release creation with auto notes
  - [x] Confirm GITHUB_TOKEN is used
  - [x] Verify bundle artifact is attached to release

- [x] **Task 5: Verify Major Tag Update** (AC: 1, 4)
  - [x] Confirm git config for github-actions[bot]
  - [x] Verify force tag creation: `git tag -fa "$MAJOR" -m "..."`
  - [x] Confirm force push to origin: `git push origin "$MAJOR" --force`

- [x] **Task 6: Verify Concurrency** (AC: 3)
  - [x] Confirm concurrency group is set to `release`
  - [x] Verify cancel-in-progress: false

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Requirements

- Release workflow triggered by semver tags (v1.0.0 format)
- Creates GitHub Release with auto-generated notes
- Updates major version tag (v1) to point to latest release
- Uses concurrency control to prevent race conditions

### Implementation Reference

The release workflow exists at `.github/workflows/release.yml`:

- Two-job structure: validate-tag and release
- Validates semver format before creating release
- Updates major version tag for user convenience
- Attaches dist/index.js bundle to release

### Key Patterns

```yaml
# Release workflow structure
name: Release
on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

permissions:
  contents: write

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  validate-tag:
    # Validate semver and extract major version
  release:
    needs: validate-tag
    # Build, test, release, update major tag
```

### Semver Tag Pattern

```bash
# Tag regex: v[0-9]+.[0-9]+.[0-9]+
# Valid: v1.0.0, v2.1.3, v10.20.30
# Invalid: vfoo, v1.2, v1.2.3.4, v1.2.3-beta
```

### Major Version Tag Update

```bash
# For v1.2.3, update v1 tag
git tag -fa "v1" -m "Update v1 to v1.2.3"
git push origin "v1" --force
```

### Project Structure Notes

- Release workflow: `.github/workflows/release.yml`
- Bundle output: `dist/index.js`
- Uses softprops/action-gh-release@v2 for release creation

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3]
- [Source: GitHub Actions semver tagging best practices]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) - Code Review 2026-02-05

### Debug Log References

N/A - Verification task only

### Completion Notes List

- All acceptance criteria verified against implementation
- Added format:check step to release workflow (Issue #4 fix)
- Updated to softprops/action-gh-release@v2 (Issue #10 fix)
- Added dist/index.js as release artifact (Issue #5 fix)

### File List

- `.github/workflows/release.yml` - Release automation workflow (verified + enhanced)

### Change Log

| Date       | Change                                                            | Author          |
| ---------- | ----------------------------------------------------------------- | --------------- |
| 2026-02-05 | Code review completed, all tasks verified, status updated to done | Claude Opus 4.5 |
| 2026-02-05 | Added format:check step before release                            | Claude Opus 4.5 |
| 2026-02-05 | Updated action-gh-release from v1 to v2                           | Claude Opus 4.5 |
| 2026-02-05 | Added bundle artifact to release                                  | Claude Opus 4.5 |
