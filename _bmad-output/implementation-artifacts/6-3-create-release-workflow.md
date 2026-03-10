# Story 6.3: Create Release Workflow

Status: done

## Story

As a **maintainer**,
I want **automated releases via release-please with manual dispatch fallback**,
So that **publishing is consistent, reliable, and follows semver with the ability to manually trigger releases**.

## Acceptance Criteria

1. **Given** push to main branch, **When** release workflow runs, **Then** `release-please` job creates/updates a release PR via `googleapis/release-please-action@v4` **And** when PR is merged, creates a GitHub Release with auto-generated notes.

2. **Given** `workflow_dispatch` trigger, **When** release workflow runs, **Then** `resolve-version` job extracts version from `package.json` **And** downstream jobs proceed as if release-please created a release.

3. **Given** either trigger path creates a release, **When** `publish-image` job runs, **Then** Docker image is built and pushed to GHCR with `v`-prefixed and non-prefixed tags.

4. **Given** a successful Docker image publish, **When** `update-major-tag` job runs, **Then** the `v{major}` floating git tag is force-updated to point to the release SHA.

5. **Given** concurrent releases, **When** triggered, **Then** concurrency group prevents race conditions (cancel-in-progress: false).

6. **Given** release workflow, **When** permissions are set, **Then** `contents: write` for release-please and tag updates, `pull-requests: write` for release-please PRs, `packages: write` for Docker push (job-level).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing `.github/workflows/release.yml` implementation

- [x] **Task 2: Configure Dual Triggers** (AC: 1, 2)
  - [x] `on.push.branches: [main]` for release-please automated path
  - [x] `on.workflow_dispatch` for manual release path

- [x] **Task 3: Implement release-please Job** (AC: 1)
  - [x] Conditional on `github.event_name == 'push'`
  - [x] Uses `googleapis/release-please-action@v4` with `release-type: node`
  - [x] Outputs: `release_created`, `tag_name`, `version`, `major`, `minor`, `patch`
  - [x] Permissions: `contents: write`, `pull-requests: write`

- [x] **Task 4: Implement resolve-version Job** (AC: 2)
  - [x] Conditional on `github.event_name == 'workflow_dispatch'`
  - [x] Extracts version from `package.json` using `jq`
  - [x] Outputs match release-please interface: `release_created: 'true'`, `tag_name`, `version`, `major`, `minor`, `patch`
  - [x] Permissions: `contents: read`

- [x] **Task 5: Implement publish-image Job** (AC: 3)
  - [x] `needs: [release-please, resolve-version]` with `always()` condition
  - [x] Resolves version from whichever upstream job ran
  - [x] Docker tags: `VERSION`, `vVERSION`, `MAJOR.MINOR`, `vMAJOR.MINOR`, `MAJOR`, `vMAJOR`, `latest`, `sha-SHORT`
  - [x] Pre-release tags skip minor/major/latest
  - [x] Permissions: `packages: write` (job-level)

- [x] **Task 6: Implement update-major-tag Job** (AC: 4)
  - [x] Depends on `publish-image` success
  - [x] Force-updates `v{MAJOR}` tag to release SHA
  - [x] Permissions: `contents: write`

- [x] **Task 7: Verify Concurrency** (AC: 5)
  - [x] Confirm concurrency group is set to `release`
  - [x] Verify cancel-in-progress: false

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Requirements

- Release workflow supports two trigger paths: automated (release-please on push to main) and manual (workflow_dispatch)
- Both paths feed the same downstream `publish-image` and `update-major-tag` jobs via unified output interface
- Docker images pushed to GHCR with both `v`-prefixed and non-prefixed tags
- Major version git tag (`v{MAJOR}`) force-updated after successful Docker publish
- Uses concurrency control to prevent race conditions

### Implementation Reference

The release workflow exists at `.github/workflows/release.yml`:

- Four-job structure: `release-please` | `resolve-version` → `publish-image` → `update-major-tag`
- `release-please`: automated releases via googleapis/release-please-action@v4
- `resolve-version`: manual releases extracting version from package.json
- `publish-image`: Docker build & push to GHCR with comprehensive tag matrix
- `update-major-tag`: force-updates floating `v{MAJOR}` git tag

### Key Patterns

```yaml
name: Release
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release-please:
    if: github.event_name == 'push'
    # Uses googleapis/release-please-action@v4
  resolve-version:
    if: github.event_name == 'workflow_dispatch'
    # Extracts version from package.json
  publish-image:
    needs: [release-please, resolve-version]
    if: always() && (release_created from either job) && !failure() && !cancelled()
    # Docker build & push with v-prefixed tags
  update-major-tag:
    needs: [release-please, resolve-version, publish-image]
    # Force-updates v{MAJOR} tag
```

### Docker Tag Matrix

For release `v1.2.3`:

- `1.2.3`, `v1.2.3` (full semver)
- `1.2`, `v1.2` (minor, non-prerelease only)
- `1`, `v1` (major, non-prerelease only)
- `latest` (non-prerelease only)
- `sha-abc1234` (commit SHA)

### Major Version Tag Update

```bash
RELEASE_SHA=$(git rev-list -n 1 "${TAG}" 2>/dev/null || echo "${GITHUB_SHA}")
git tag -fa "v${MAJOR}" "${RELEASE_SHA}" -m "Update v${MAJOR} to ${TAG}"
git push origin "v${MAJOR}" --force
```

### Project Structure Notes

- Release workflow: `.github/workflows/release.yml`
- Bundle output: `dist/index.js` (built by Docker bundler stage, not committed to git)
- Uses `googleapis/release-please-action@v4` for automated releases

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
- Restructured from tag-triggered 2-job pipeline to release-please + workflow_dispatch 4-job pipeline
- Docker image publishing integrated into release pipeline with v-prefixed tag matrix
- Major version tag update depends on successful Docker publish

### File List

- `.github/workflows/release.yml` - Release automation workflow (completely restructured)

### Change Log

| Date       | Change                                                                                      | Author            |
| ---------- | ------------------------------------------------------------------------------------------- | ----------------- |
| 2026-02-05 | Code review completed, all tasks verified, status updated to done                           | Claude Opus 4.5   |
| 2026-02-05 | Added format:check step before release                                                      | Claude Opus 4.5   |
| 2026-02-05 | Updated action-gh-release from v1 to v2                                                     | Claude Opus 4.5   |
| 2026-02-05 | Added bundle artifact to release                                                            | Claude Opus 4.5   |
| 2026-03-10 | Correct-course: Restructured to release-please + workflow_dispatch dual-path 4-job pipeline | Correct-course WF |
| 2026-03-10 | Integrated Docker publish-image job with v-prefixed tag matrix                              | Correct-course WF |
| 2026-03-10 | Added update-major-tag job dependent on successful Docker publish                           | Correct-course WF |
