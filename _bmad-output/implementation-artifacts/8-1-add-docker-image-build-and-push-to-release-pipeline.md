# Story 8.1: Add Docker Image Build & Push to Release Pipeline

Status: done

## Story

As a **maintainer**,
I want **Docker images automatically built and pushed to GHCR on release**,
so that **consumers pull a pre-built image instead of building from Dockerfile every run**.

## Acceptance Criteria

1. **Given** a release tag matching `v*.*.*` is pushed, **When** the release workflow runs, **Then** it builds the Docker image from `Dockerfile` and pushes it to `ghcr.io/arch-playground/ai-workflow-runner`
2. **Given** a release tag like `v1.2.3`, **When** the Docker image is pushed, **Then** it is tagged with `1.2.3`, `v1.2.3`, `1.2`, `v1.2`, `1`, `v1`, `latest`, and `sha-{short}` (pre-release tags skip minor/major/latest)
3. **Given** the release workflow has `release-please` and `resolve-version` jobs, **When** the Docker publish job runs, **Then** it runs after either upstream job creates a release (depends on both with `always()` condition)
4. **Given** the Docker publish job, **When** it runs, **Then** it requires `packages: write` permission for GHCR push
5. **Given** the Docker build fails, **When** the release workflow runs, **Then** the GitHub Release is still created (Docker publish is a separate job, not blocking `release`)
6. **Given** the image is pushed to GHCR, **When** inspected, **Then** it has OCI labels: `org.opencontainers.image.source`, `org.opencontainers.image.description`, and `org.opencontainers.image.version`

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/global/conventions.md` - Project structure, version control

- [x] **Task 2: Add Docker Build & Push Job to release.yml** (AC: 1, 2, 3, 4, 5, 6)
  - [x] Add a new `publish-image` job to `.github/workflows/release.yml`
  - [x] Set `needs: [release-please, resolve-version]` with `always()` condition so it runs after either upstream job creates a release
  - [x] Add `permissions: packages: write` at the job level
  - [x] Add checkout step with `actions/checkout@v6`
  - [x] Add GHCR login step using `docker/login-action@v3` with `registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`
  - [x] Add Docker metadata step using `docker/metadata-action@v5` to generate tags:
    - `type=raw,value=$VERSION` (e.g., `1.2.3`)
    - `type=raw,value=v$VERSION` (e.g., `v1.2.3`)
    - `type=raw,value=$MAJOR.$MINOR` (e.g., `1.2`, non-prerelease only)
    - `type=raw,value=v$MAJOR.$MINOR` (e.g., `v1.2`, non-prerelease only)
    - `type=raw,value=$MAJOR` (e.g., `1`, non-prerelease only)
    - `type=raw,value=v$MAJOR` (e.g., `v1`, non-prerelease only)
    - `type=raw,value=latest` (non-prerelease only)
    - `type=sha,prefix=sha-,format=short`
  - [x] Add Docker build & push step using `docker/build-push-action@v6` with `push: true`, `tags` and `labels` from metadata step
  - [x] Ensure the existing `validate-tag` and `release` jobs are NOT modified (only add the new job)

- [x] **Task 3: Configure Job-Level Permissions** (AC: 4)
  - [x] The existing `permissions: contents: write` remains at workflow level for the `release` job
  - [x] Add `packages: write` as job-level permission on `publish-image` only (least privilege)
  - [x] Verify `contents: write` is still present at workflow level for the release job

- [x] **Task 4: Verify Workflow Syntax** (AC: All)
  - [x] Validate the YAML syntax is correct (proper indentation, no duplicate keys)
  - [x] Verify job dependency chain: `validate-tag` → `release` → `publish-image`
  - [x] Verify the `publish-image` job uses `ubuntu-latest` runner

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### What Changes

This story modifies ONLY `.github/workflows/release.yml`. No TypeScript source code changes. No new files.

### Current release.yml Structure

The existing workflow has:

- **Triggers:** `push.branches: [main]` (release-please) and `workflow_dispatch` (manual)
- **Concurrency:** `group: release, cancel-in-progress: false`
- **Job 1: `release-please`** — Automated releases via googleapis/release-please-action@v4
- **Job 2: `resolve-version`** — Manual releases extracting version from package.json
- **Job 3: `publish-image`** — Docker build & push to GHCR (depends on either upstream job)
- **Job 4: `update-major-tag`** — Force-updates `v{MAJOR}` git tag (depends on publish-image success)

### Docker Actions to Use

Use official Docker GitHub Actions (already used widely in the ecosystem):

- **`docker/login-action@v3`** — Authenticates to GHCR
- **`docker/metadata-action@v5`** — Generates image tags and OCI labels
- **`docker/build-push-action@v6`** — Builds and pushes the image

### GHCR Image Naming

- Registry: `ghcr.io`
- Image: `ghcr.io/arch-playground/ai-workflow-runner`
- Tags for `v1.2.3` release:
  - `ghcr.io/arch-playground/ai-workflow-runner:1.2.3`
  - `ghcr.io/arch-playground/ai-workflow-runner:v1.2.3`
  - `ghcr.io/arch-playground/ai-workflow-runner:1.2`
  - `ghcr.io/arch-playground/ai-workflow-runner:v1.2`
  - `ghcr.io/arch-playground/ai-workflow-runner:1`
  - `ghcr.io/arch-playground/ai-workflow-runner:v1`
  - `ghcr.io/arch-playground/ai-workflow-runner:latest`
  - `ghcr.io/arch-playground/ai-workflow-runner:sha-abc1234`

### OCI Labels

The Dockerfile already has these labels (lines 31-32):

```
LABEL org.opencontainers.image.source="https://github.com/arch-playground/ai-workflow-runner"
LABEL org.opencontainers.image.description="AI Workflow Runner - Multi-runtime GitHub Action"
```

The `docker/metadata-action` will add `org.opencontainers.image.version` automatically.

### Permissions Strategy

Job-level permissions on `publish-image` only (least privilege):

```yaml
publish-image:
  permissions:
    packages: write
```

This scopes `packages: write` to only the job that needs it. The `release` job inherits `contents: write` from the workflow level.

### Anti-Patterns to Avoid

- DO NOT modify the existing `validate-tag` or `release` jobs
- DO NOT make the `release` job depend on `publish-image` (Docker push should never block release creation)
- DO NOT use `docker build` and `docker push` CLI commands — use the official Docker GitHub Actions
- DO NOT hardcode image tags — use `docker/metadata-action` for tag generation
- DO NOT add `continue-on-error: true` to the publish job — let it fail visibly so maintainers know
- DO NOT use `latest` as the only tag — always include semver tags for reproducibility

### Project Structure Notes

- Only file changed: `.github/workflows/release.yml`
- No source code changes, no new files
- Dockerfile already has OCI labels, no changes needed there

### References

- [Source: .github/workflows/release.yml] — Current release workflow (2 jobs: validate-tag, release)
- [Source: Dockerfile] — Multi-stage build with OCI labels already present
- [Source: action.yml] — Current `runs.image: 'Dockerfile'` (will be changed in story 8-2, NOT this story)
- [Source: _bmad-output/planning-artifacts/prd.md#Distribution & Publishing] — FR45, FR46, FR49
- [Source: _bmad-output/planning-artifacts/architecture.md#Phase 2 Considerations] — Pre-built Docker image approach
- [Source: _bmad-output/implementation-artifacts/7-6-update-documentation.md] — Previous story patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No issues encountered.

### Completion Notes List

- Added `publish-image` job to `.github/workflows/release.yml` that builds and pushes Docker image to GHCR on release
- Used official Docker GitHub Actions: `docker/login-action@v3`, `docker/metadata-action@v5`, `docker/build-push-action@v6`
- Image tagged with both v-prefixed and non-prefixed variants: `1.2.3`, `v1.2.3`, `1.2`, `v1.2`, `1`, `v1`, `latest`, `sha-{short}`
- OCI labels (`source`, `description`) already present in Dockerfile; `version` label auto-generated by `metadata-action`
- Moved `packages: write` to job-level permissions on `publish-image` only (least privilege; review fix)
- `contents: write` remains at workflow level for `release` job
- `publish-image` depends on `[release-please, resolve-version]` with `always()` condition — runs after either upstream creates a release
- Release workflow restructured from tag-triggered to release-please + workflow_dispatch dual paths (see story 6.3)
- All 230 unit tests pass with no regressions
- Lint, format, and typecheck all clean

### Change Log

- 2026-02-09: Added Docker image build & push job (`publish-image`) to release pipeline with GHCR publishing
- 2026-02-09: [AI-Review] Added `timeout-minutes: 30` to `publish-image` job; moved `packages: write` to job-level permissions (least privilege)
- 2026-03-10: Correct-course alignment — Updated tag matrix to include v-prefixed variants (`v1.2.3`, `v1.2`, `v1`), minor version tags, and SHA tags. Updated dependencies from `[validate-tag, release]` to `[release-please, resolve-version]` per release workflow restructure.

### File List

- `.github/workflows/release.yml` (modified) — Added `publish-image` job with job-level `packages: write` permission and `timeout-minutes: 30`

**Out-of-scope changes present in working tree (not part of this story):**

- `package.json` (modified) — Added CI-specific scripts (`test:unit:ci`, `test:integration:ci`, `lint:ci`) and `jest-junit` devDependency
- `jest.config.js` (modified) — Added `json-summary` coverage reporter
- `package-lock.json` (modified) — Lock file update for `jest-junit`
- `_bmad-output/planning-artifacts/architecture.md` (modified) — Added FR45-FR49 references, updated Phase 2 table
- `_bmad-output/planning-artifacts/prd.md` (modified) — Added Distribution & Publishing requirements (FR45-FR49)
- `_bmad-output/planning-artifacts/epics.md` (modified) — Added Epic 8 references and FR45-FR49
