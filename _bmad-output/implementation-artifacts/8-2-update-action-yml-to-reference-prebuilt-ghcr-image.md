# Story 8.2: Update action.yml to Reference Pre-built GHCR Image

Status: done

## Story

As a **GitHub Actions user**,
I want **the action to use a pre-built Docker image from GHCR**,
so that **my workflows start faster without building the Docker image on every run**.

## Acceptance Criteria

1. **Given** `action.yml` file, **When** updated, **Then** `runs.image` is changed from `'Dockerfile'` to `'docker://ghcr.io/arch-playground/ai-workflow-runner:1'`
2. **Given** the image reference, **When** inspected, **Then** it uses the major version tag (`1`) not `latest`, for stability across consumer workflows
3. **Given** the updated `action.yml`, **When** inspected, **Then** all existing inputs (`workflow_path`, `prompt`, `env_vars`, `timeout_minutes`, `validation_script`, `validation_script_type`, `validation_max_retry`, `opencode_config`, `auth_config`, `model`, `list_models`) remain unchanged
4. **Given** the updated `action.yml`, **When** inspected, **Then** all existing outputs (`status`, `result`) remain unchanged
5. **Given** the updated `action.yml`, **When** inspected, **Then** `name`, `description`, `author`, and `branding` fields remain unchanged
6. **Given** a consumer uses `arch-playground/ai-workflow-runner@v1`, **When** the action runs, **Then** GitHub pulls the pre-built image from GHCR instead of building from Dockerfile

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/global/conventions.md` - Project structure, version control

- [x] **Task 2: Update `runs.image` in action.yml** (AC: 1, 2)
  - [x] Change `image: 'Dockerfile'` to `image: 'docker://ghcr.io/arch-playground/ai-workflow-runner:1'` in the `runs` section
  - [x] Verify the `using: 'docker'` field remains unchanged
  - [x] Verify the image reference uses the major version tag `:1` (not `:latest` or full semver)

- [x] **Task 3: Verify no other fields changed** (AC: 3, 4, 5)
  - [x] Verify all 11 inputs remain exactly as before (names, descriptions, defaults, required flags)
  - [x] Verify both outputs remain exactly as before
  - [x] Verify `name`, `description`, `author`, and `branding` fields are untouched

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### What Changes

This story modifies ONLY `action.yml`. Single line change. No TypeScript source code changes. No new files. No tests needed (this is a YAML metadata file, not application code).

### Exact Change Required

```yaml
# BEFORE (line 57-58 of action.yml):
runs:
  using: 'docker'
  image: 'Dockerfile'

# AFTER:
runs:
  using: 'docker'
  image: 'docker://ghcr.io/arch-playground/ai-workflow-runner:1'
```

### Why Major Version Tag `:1`

- `:latest` is unstable and can break consumers on any push
- Full semver (`:1.2.3`) forces consumers to update action.yml on every release
- `:1` auto-resolves to the latest `1.x.x` release, matching the `@v1` action reference consumers use
- The `publish-image` job in `release.yml` (story 8-1) already tags images with `{{major}}` via `docker/metadata-action`

### GHCR Image Reference Format

GitHub Actions Docker container actions support `docker://` prefix for pre-built images. The format is:

```
docker://<registry>/<owner>/<image>:<tag>
```

For this project: `docker://ghcr.io/arch-playground/ai-workflow-runner:1`

### Previous Story (8-1) Context

Story 8-1 added the `publish-image` job to `release.yml` that:

- Builds and pushes Docker images to `ghcr.io/arch-playground/ai-workflow-runner`
- Tags with semver (`1.2.3`), major version (`1`), and `latest`
- Runs after the `release` job (non-blocking)
- Uses `docker/metadata-action@v5` for tag generation

This story depends on 8-1 being complete (it is: status=done).

### Anti-Patterns to Avoid

- DO NOT modify any inputs, outputs, or metadata fields
- DO NOT use `:latest` tag (unstable for consumers)
- DO NOT use full semver tag like `:1.2.3` (forces manual updates)
- DO NOT add any comments explaining the change (zero-tolerance for obvious comments)
- DO NOT remove the `Dockerfile` from the repository (it's still needed for the `publish-image` CI job to build the image)
- DO NOT modify any TypeScript source code

### Project Structure Notes

- Only file changed: `action.yml`
- No source code changes, no new files
- `Dockerfile` remains in repo (used by CI `publish-image` job)

### References

- [Source: action.yml] - Current `runs.image: 'Dockerfile'` (line 58)
- [Source: .github/workflows/release.yml] - `publish-image` job pushes to `ghcr.io/arch-playground/ai-workflow-runner` with `{{major}}` tag
- [Source: _bmad-output/implementation-artifacts/8-1-add-docker-image-build-and-push-to-release-pipeline.md] - Previous story context, GHCR naming convention
- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.2] - Epic acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Phase 2 Considerations] - Pre-built Docker image approach

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Updated `action.yml` line 58: changed `image: 'Dockerfile'` to `image: 'docker://ghcr.io/arch-playground/ai-workflow-runner:1'`
- Single line change only; all inputs (11), outputs (2), metadata, and branding fields verified unchanged
- `using: 'docker'` confirmed unchanged
- Major version tag `:1` used for stability (not `:latest` or full semver)
- All quality checks passed: lint, format, typecheck
- All tests passed (267/267 across 12 suites); action-yml schema test passed
- No TypeScript source code modified, no new files created

### Change Log

- 2026-02-09: Updated `runs.image` in `action.yml` from `'Dockerfile'` to `'docker://ghcr.io/arch-playground/ai-workflow-runner:1'` to reference pre-built GHCR image

### File List

- `action.yml` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
