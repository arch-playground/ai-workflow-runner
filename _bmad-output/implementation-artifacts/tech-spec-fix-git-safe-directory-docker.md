---
title: 'Fix Git Safe Directory for Docker Container'
slug: 'fix-git-safe-directory-docker'
created: '2026-03-13'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [shell, git, docker]
files_to_modify: [entrypoint.sh, test/integration/docker.test.ts]
code_patterns: [posix-shell, signal-handling-entrypoint]
test_patterns: [docker-integration-tests-via-execSync]
---

# Tech-Spec: Fix Git Safe Directory for Docker Container

**Created:** 2026-03-13

## Overview

### Problem Statement

When `ai-workflow-runner` executes inside its Docker container, git commands run by the AI agent against checkout directories fail silently due to git's `safe.directory` ownership check (CVE-2022-24765). `actions/checkout@v6` configures `safe.directory` using host runner paths, but the Docker container mounts the workspace at `/github/workspace`. Git sees a UID mismatch and refuses to operate, causing fallback patterns (`|| echo "FALLBACK"`) to produce `NO_GIT_HISTORY` and `NO_REMOTE` in scan results.

### Solution

Add `git config --global --replace-all safe.directory '*'` to `entrypoint.sh` before launching the Node.js process. This marks all directories as safe within the ephemeral CI container, resolving the ownership mismatch for all current and future checkout paths.

### Scope

**In Scope:**

- Add git safe.directory wildcard configuration to `entrypoint.sh`

**Out of Scope:**

- Changes to AI agent fallback/defensive shell patterns
- Workflow-side fixes (consumer workflows should not need changes)
- Dockerfile modifications
- Changes to `action.yml`

## Context for Development

### Codebase Patterns

- `entrypoint.sh` is a POSIX shell script (`#!/bin/sh`) with signal handling for graceful shutdown
- The script is 29 lines: shebang, `set -e`, signal trap, background Node.js process, wait + exit
- The container runs as root user on `debian:bookworm-slim`
- `git` is installed in both the builder stage (line 28) and the runtime stage (line 56) of the Dockerfile
- `WORKDIR` is set to `/github/workspace` in the Dockerfile (line 92)
- `GITHUB_WORKSPACE` environment variable is available at entrypoint execution time
- No existing git configuration anywhere in the entrypoint or Dockerfile
- Integration tests exist at `test/integration/docker.test.ts` — test runtime availability, entrypoint permissions, and signal forwarding

### Files to Reference

| File                                                                                            | Purpose                                                                                 |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `entrypoint.sh`                                                                                 | Container startup script — the fix goes here (after `set -e`, before `FINAL_EXIT_CODE`) |
| `Dockerfile`                                                                                    | Container build — git installed in runtime stage, WORKDIR is `/github/workspace`        |
| `action.yml`                                                                                    | Docker action config — `runs.using: 'docker'` at line 66                                |
| `test/integration/docker.test.ts`                                                               | Docker integration tests — may add git safe.directory verification                      |
| `_bmad-output/planning-artifacts/research/technical-git-safe-directory-container-2026-03-13.md` | Full research document with root cause analysis                                         |

### Technical Decisions

- **`--global` over `--system`**: Matches convention used by `actions/checkout` itself. Container runs as single user (root), so no benefit to `--system`.
- **Wildcard `'*'` over specific paths**: The container handles secondary checkouts (e.g., `target-repo/`) as subdirectories. Wildcard covers all automatically. **Security note:** The `safe.directory` check (CVE-2022-24765) protects against local privilege escalation on multi-user systems. This container runs as a single user (root) in an ephemeral GitHub Actions environment where the runner controls all mounted content. Self-hosted runners are the only edge case — but even there, the workspace is runner-controlled and the container is disposable. The wildcard is the standard pattern used by `actions/checkout` itself and across the Docker-based GitHub Actions ecosystem.
- **Entrypoint over workflow-side fix**: Ensures all consumers get the fix without modifying their workflows. Single point of change.
- **Placement after `set -e`**: The git config command must run before any application code. Placing it immediately after `set -e` ensures it executes first. If git is somehow unavailable, `set -e` will cause the script to fail fast.
- **`--replace-all` over `--add`**: Using `--replace-all` ensures idempotency — if the entrypoint is re-executed, it won't append duplicate entries.

### Failure Modes

| Scenario                       | Behavior                                                  | Risk                                                                                              |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `git` not in PATH              | `set -e` aborts entrypoint, container exits non-zero      | Low — git is installed in the runtime Dockerfile stage; would only happen if Dockerfile is broken |
| `$HOME` is read-only           | `git config --global` fails, `set -e` aborts              | Low — container runs as root, `$HOME` is writable by default                                      |
| Corrupted git installation     | `git config` fails, `set -e` aborts                       | Low — same as above, Dockerfile-level issue                                                       |
| Double execution of entrypoint | `--replace-all` overwrites previous entry, no duplication | None                                                                                              |

**Rollback:** Revert the one-line change in `entrypoint.sh` and rebuild the Docker image. No data or state is affected.

## Implementation Plan

### Tasks

- [x] **Task 1: Add git safe.directory configuration to entrypoint.sh**
  - File: `entrypoint.sh`
  - Action: Insert the following after `set -e` and before the `FINAL_EXIT_CODE` variable:
    ```sh
    # Fix git "dubious ownership" in GitHub Actions Docker containers (CVE-2022-24765)
    git config --global --replace-all safe.directory '*'
    ```
  - Notes: Must be placed before any application code runs. Uses `--replace-all` for idempotency. The `set -e` ensures fast failure if git is unavailable.

- [x] **Task 2: Add integration tests for git safe.directory**
  - File: `test/integration/docker.test.ts`
  - Action: Add two test cases after the `entrypoint.sh is executable` test. The entrypoint cannot be run directly in tests (it launches Node.js which requires GitHub Actions env), so we use two complementary approaches:
  - **Test A — Behavioral test**: Run the entrypoint's git config command in isolation via `--entrypoint sh` and verify the output:
    ```typescript
    test(
      'git safe.directory wildcard is functional',
      () => {
        const output = execSync(
          `docker run --rm --entrypoint sh ${DOCKER_IMAGE} -c "git config --global --replace-all safe.directory '*' && git config --global --get-all safe.directory"`,
          { timeout: TIMEOUT_MS }
        )
          .toString()
          .trim();
        expect(output).toBe('*');
      },
      TIMEOUT_MS
    );
    ```
  - **Test B — Content verification**: Verify the entrypoint script contains the git config command (guards against accidental removal):
    ```typescript
    test(
      'entrypoint.sh includes git safe.directory configuration',
      () => {
        const output = execSync(`docker run --rm --entrypoint cat ${DOCKER_IMAGE} /entrypoint.sh`, {
          timeout: TIMEOUT_MS,
        }).toString();
        expect(output).toContain('git config --global --replace-all safe.directory');
      },
      TIMEOUT_MS
    );
    ```
  - Notes: Test A validates that git is functional and the config command works inside the container. Test B ensures the line exists in the entrypoint and won't be accidentally removed in future edits. Together they cover AC 1 and AC 4.

- [ ] **Task 3: Rebuild and verify Docker image**
  - Action: Build the Docker image locally and run the integration tests:
    1. `docker build -t ai-workflow-runner:test .`
    2. `DOCKER_IMAGE=ai-workflow-runner:test npx jest test/integration/docker.test.ts`
  - Notes: Full end-to-end validation (AC 2, AC 3) requires a real GitHub Actions run with a repo checkout — see post-merge manual validation in Testing Strategy.

- [x] **Task 4: Quality Checks**
  - Run `npm run lint` — Fix any linting issues
  - Run `npm run format` — Verify code formatting
  - Run `npm run typecheck` — Ensure type safety

- [ ] **Task 5: Release (post-merge)**
  - Action: After PR is merged, the existing CI/release pipeline will rebuild and publish the Docker image to `ghcr.io/arch-playground/ai-workflow-runner`. Verify the new image is published and the `v1` tag is updated.
  - Manual validation: Run a consumer workflow (e.g., `service-analysis` in `om-blk-knowledge-base`) against a real repo checkout and confirm scan results contain actual commit SHA and remote URL instead of `NO_GIT_HISTORY` / `NO_REMOTE`. This validates AC 2 and AC 3.

### Acceptance Criteria

- [ ] **AC 1**: Given the Docker container image, when `git config --global --replace-all safe.directory '*' && git config --global --get-all safe.directory` is executed inside it, then it returns `*`. _(Validated by Task 2, Test A)_
- [ ] **AC 2** _(post-merge manual validation)_: Given a git repository mounted at `/github/workspace` with different UID ownership, when `git rev-parse HEAD` is executed inside the container, then it returns the commit SHA (not "dubious ownership" error). _(Validated by Task 5)_
- [ ] **AC 3** _(post-merge manual validation)_: Given a secondary checkout at `/github/workspace/target-repo` with different UID ownership, when `git remote get-url origin` is executed inside the container, then it returns the remote URL (not fallback value). _(Validated by Task 5)_
- [ ] **AC 4**: Given the entrypoint.sh script content, when inspected, then it contains `git config --global --replace-all safe.directory` with a comment referencing CVE-2022-24765. _(Validated by Task 2, Test B)_
- [ ] **AC 5**: Given `set -e` is active in entrypoint.sh, when git is not installed (hypothetical), then the entrypoint fails fast rather than silently continuing. _(Guaranteed by POSIX `set -e` behavior — no explicit test needed)_

## Additional Context

### Dependencies

- None — git is already installed in the container runtime stage
- No new packages, libraries, or services required

### Testing Strategy

| Level                   | What                                               | How                                                      | Validates  |
| ----------------------- | -------------------------------------------------- | -------------------------------------------------------- | ---------- |
| Integration (automated) | git config command works inside container          | Task 2, Test A — runs `git config` via `--entrypoint sh` | AC 1       |
| Integration (automated) | entrypoint.sh contains the fix                     | Task 2, Test B — `cat /entrypoint.sh` content check      | AC 4       |
| CI pipeline             | Docker image builds and all integration tests pass | Existing CI runs on PR                                   | AC 1, AC 4 |
| Post-merge manual       | Git metadata extraction works in real workflow     | Task 5 — run consumer workflow, check scan results       | AC 2, AC 3 |

- **No unit tests needed**: This is a shell script change with no TypeScript code involvement

### Notes

- This is a known unresolved bug in the GitHub Actions runner
- `actions/checkout#1169` (47+ thumbs-up) documents that `/github/home/.gitconfig` doesn't exist for container runs
- The wildcard pattern is standard across the Docker-based GitHub Actions ecosystem
- **Rollback**: Revert the one-line change in `entrypoint.sh` and rebuild the Docker image. No data or state is affected.

## Review Notes

- Adversarial review completed
- Findings: 6 total, 3 fixed, 3 skipped (noise)
- Resolution approach: auto-fix
- F1 (Medium/Real): Renamed misleading test name — fixed
- F2 (Low/Real): Strengthened Test B assertions for wildcard and CVE — fixed
- F3 (Medium/Real): No runtime entrypoint test — accepted risk, post-merge manual validation
