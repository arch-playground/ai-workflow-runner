---
title: 'Complete Open-Source Release Process'
slug: 'complete-opensource-release-process'
created: '2026-02-10'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'release-please (googleapis/release-please-action@v4)'
  - 'commitlint (@commitlint/cli, @commitlint/config-conventional)'
  - 'GitHub Actions workflows (YAML)'
  - 'GitHub CodeQL (github/codeql-action@v3)'
  - 'OSSF Scorecard (ossf/scorecard-action@v2)'
  - 'Docker (ghcr.io, docker/metadata-action@v5, docker/build-push-action@v6)'
  - 'Husky v9 (git hooks)'
  - 'Dependabot (dependabot/fetch-metadata@v2)'
files_to_modify:
  - '.github/workflows/release.yml (rewrite)'
  - '.github/workflows/ci.yml (modify — remove develop triggers)'
  - '.github/workflows/codeql.yml (new)'
  - '.github/workflows/scorecard.yml (new)'
  - '.github/workflows/dependabot-automerge.yml (new)'
  - 'release-please-config.json (new)'
  - '.release-please-manifest.json (new)'
  - 'commitlint.config.js (new)'
  - '.husky/commit-msg (new)'
  - '.husky/pre-commit (modify — modernize to Husky v9 format)'
  - 'package.json (modify — add commitlint devDeps, fix prepare script)'
  - 'SECURITY.md (new)'
  - 'CONTRIBUTING.md (new)'
  - 'CODE_OF_CONDUCT.md (new)'
  - '.github/CODEOWNERS (new)'
  - '.github/ISSUE_TEMPLATE/bug_report.yml (new)'
  - '.github/ISSUE_TEMPLATE/feature_request.yml (new)'
  - '.github/pull_request_template.md (new)'
code_patterns:
  - 'GitHub Actions workflows use YAML with descriptive job names and step comments'
  - 'CI jobs use timeout-minutes, continue-on-error for non-blocking checks, and artifact uploads'
  - 'Husky v9 hooks are single-line scripts (no sourcing _/husky.sh needed). The existing pre-commit hook uses legacy v4/v5 syntax that still works under v9 compatibility but should be modernized.'
  - 'Dependabot groups dev dependencies with pattern matching'
  - 'Docker metadata-action: use type=raw with explicit values when workflow triggers on branch push (not tag push); type=semver only works with tag-triggered workflows'
  - 'Release workflow uses concurrency group with cancel-in-progress: false'
  - 'CI workflow uses concurrency group with cancel-in-progress: true'
test_patterns:
  - 'No automated tests for workflow files — verification is done by running the workflows in CI'
  - 'Manual verification: push PR, observe workflow triggers and outputs'
  - 'E2E tests in CI use matrix strategy with 8 test cases'
---

# Tech-Spec: Complete Open-Source Release Process

**Created:** 2026-02-10

## Overview

### Problem Statement

The ai-workflow-runner project currently relies on manual git tag pushing to trigger releases, has no commit message enforcement, no automated changelog generation, no security scanning workflows (CodeQL, OSSF Scorecard), and zero contributor infrastructure (no CONTRIBUTING.md, issue/PR templates, SECURITY.md, CODEOWNERS, CODE_OF_CONDUCT.md). The `update-action-image` job in the release workflow creates an awkward post-release commit to update `action.yml`. The CI triggers on a `develop` branch that adds unnecessary complexity for an open-source GitHub Action project.

### Solution

Adopt release-please for automated release management with Conventional Commits enforcement via commitlint. Add comprehensive security scanning (CodeQL, OSSF Scorecard). Create full contributor infrastructure (CONTRIBUTING.md, issue/PR templates, SECURITY.md, CODEOWNERS, CODE_OF_CONDUCT.md). Support pre-release/beta tags. Simplify branch strategy to main-only. Fix the Docker image reference pattern in action.yml to eliminate the post-release commit.

### Scope

**In Scope:**

- Phase 1 — Release Automation: release-please adoption, commitlint + Husky commit-msg hook, rewrite release.yml, fix action.yml image reference, pre-release/beta tag support
- Phase 2 — Security: SECURITY.md, CodeQL workflow, OSSF Scorecard workflow
- Phase 3 — Contributor Infrastructure: CONTRIBUTING.md, issue templates (bug report + feature request), PR template, CODEOWNERS, CODE_OF_CONDUCT.md
- Phase 4 — Maintenance & Cleanup: Dependabot auto-merge workflow, simplify CI to main-only (remove develop branch triggers), branch protection rule documentation

**Out of Scope:**

- NPM publishing (this is a GitHub Action, not an npm package)
- CLA / DCO enforcement
- Pinning all third-party actions to SHA

## Context for Development

### Codebase Patterns

- **Workflow structure**: GitHub Actions workflows live in `.github/workflows/`. Current CI is 776 lines with 6 parallel/dependent jobs. Release is 143 lines with 4 jobs.
- **CI concurrency**: Uses `ci-${{ github.ref }}` group with `cancel-in-progress: true`. Release uses `release` group with `cancel-in-progress: false`.
- **Docker tagging**: Current release workflow uses `docker/metadata-action@v5` with `type=semver` patterns, which works because the current workflow triggers on tag pushes. The new workflow triggers on `push` to `main`, so `type=semver` will not work — must switch to `type=raw` with explicit values from release-please outputs.
- **Husky hooks**: v9 installed via `prepare` script (currently using legacy `husky install` command — needs update to `husky`). Pre-commit hook runs `npx lint-staged` but uses legacy v4/v5 sourcing syntax — needs modernization. No commit-msg hook exists.
- **Dependabot**: Groups dev dependencies with pattern matching. Separate ecosystem entries for npm and github-actions.
- **action.yml image**: Already references `docker://ghcr.io/arch-playground/ai-workflow-runner:v1` permanently — the `update-action-image` job that commits during release to update this reference is redundant and should be removed.
- **Package version**: Hardcoded to `0.0.0` — needs to be synced to `1.0.0` via `.release-please-manifest.json`.
- **License**: MIT (Copyright 2026 TanNT)
- **Repository**: `github.com/arch-playground/ai-workflow-runner`

### Files to Reference

| File                            | Purpose                                      | Key Finding                                                                                                                |
| ------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml` | Current release workflow (143 lines, 4 jobs) | Tag-triggered; `update-action-image` job creates unnecessary post-release commit                                           |
| `.github/workflows/ci.yml`      | Current CI workflow (776 lines, 6 jobs)      | Triggers on `main` + `develop` — need to remove `develop`                                                                  |
| `.github/dependabot.yml`        | Dependabot config (26 lines)                 | Already configured for npm + github-actions weekly                                                                         |
| `action.yml`                    | GitHub Action metadata (62 lines)            | Image reference `docker://ghcr.io/arch-playground/ai-workflow-runner:v1` is already correct                                |
| `package.json`                  | Project config (71 lines)                    | Version `0.0.0`, has `prepare: husky install`, lint-staged config                                                          |
| `CHANGELOG.md`                  | Existing changelog (78 lines)                | Keep a Changelog format, v1.0.0 dated 2026-02-09                                                                           |
| `.husky/pre-commit`             | Pre-commit hook (3 lines)                    | Uses legacy v4/v5 syntax (sources `_/husky.sh`) — modernize to Husky v9 single-line format alongside new `commit-msg` hook |
| `package.json` (prepare script) | Husky initialization                         | Currently `"prepare": "husky install"` (v4/v5 syntax) — update to `"prepare": "husky"` for v9                              |
| `LICENSE`                       | MIT License (22 lines)                       | No changes needed                                                                                                          |
| `README.md`                     | Project documentation                        | References `arch-playground/ai-workflow-runner@v1` — CONTRIBUTING link needs adding                                        |

### Technical Decisions

- **release-please over semantic-release**: Human review gate via Release PR, zero risk of accidental releases, GitHub-native (Google-maintained), works well with Docker workflows. Uses `release-type: node` to manage `package.json` version.
- **action.yml image reference stays as-is**: `docker://ghcr.io/arch-playground/ai-workflow-runner:v1` already points to the mutable major version tag. The `update-action-image` job is removed entirely — Docker's `{{major}}` tag update handles this.
- **Major version tag update**: The release workflow force-pushes the `v1` git tag to the release commit so `@v1` resolves correctly. This is standard for GitHub Actions (see actions/toolkit versioning guide).
- **Branch strategy**: Remove `develop` from CI triggers. Main-only with feature branches via PRs.
- **Pre-release support**: release-please `prerelease: true` flag. For pre-releases, Docker tags conditionally exclude `latest`, `{{major}}`, and `{{major}}.{{minor}}` using `enable=${{ !contains(tag_name, '-') }}`. This prevents pre-release images from overwriting stable tags. The `v<major>` git tag is also not moved for pre-releases.
- **Contributor Covenant v2.1**: Industry standard CODE_OF_CONDUCT.md, adopted by major open-source projects.
- **Docker tagging strategy**: Since the release workflow triggers on `push` to `main` (not on a tag push), `docker/metadata-action`'s `type=semver` patterns will NOT work — they extract the version from `github.ref`, which is `refs/heads/main`. Instead, use `type=raw` with explicit values from release-please outputs (e.g., `type=raw,value=${{ needs.release-please.outputs.version }}`). Add `type=sha,prefix=sha-,format=short` for commit traceability.
- **commitlint config**: Use `@commitlint/config-conventional` with standard types (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert).

## Implementation Plan

### Tasks

#### Phase 1 — Release Automation

- [x] Task 1: Install commitlint, create Husky commit-msg hook, and modernize Husky v9 hooks
  - File: `package.json`
  - Action 1a: Run `npm install --save-dev @commitlint/cli @commitlint/config-conventional`. This adds both packages to `devDependencies`.
  - Action 1b: Update the `prepare` script from `"prepare": "husky install"` to `"prepare": "husky"`. The `husky install` command is Husky v4/v5 syntax; Husky v9 uses just `husky`.
  - File: `commitlint.config.js` (new)
  - Action: Create file with the following content:
    ```js
    module.exports = {
      extends: ['@commitlint/config-conventional'],
      rules: {
        'type-enum': [
          2,
          'always',
          [
            'feat',
            'fix',
            'docs',
            'style',
            'refactor',
            'perf',
            'test',
            'build',
            'ci',
            'chore',
            'revert',
          ],
        ],
        'header-max-length': [2, 'always', 100],
      },
    };
    ```
  - Notes on commitlint: The rule is `header-max-length` (not `subject-max-length`, which is not a standard commitlint rule and would be silently ignored). `header-max-length` limits the full first line including the type prefix.
  - File: `.husky/commit-msg` (new)
  - Action: Create file with the following content (Husky v9 single-line format — no sourcing `_/husky.sh`):
    ```sh
    npx --no -- commitlint --edit ${1}
    ```
  - Action: Run `chmod +x .husky/commit-msg` to make the hook executable. **This is mandatory** — if the file is not executable, git will silently skip the hook and bad commit messages will pass.
  - File: `.husky/pre-commit` (modernize)
  - Action: Replace the existing content with Husky v9 single-line format:
    ```sh
    npx lint-staged
    ```
  - Notes: The existing `.husky/pre-commit` uses legacy v4/v5 syntax (sourcing `_/husky.sh`). This still works under Husky v9 compatibility mode but should be modernized to avoid confusion and fragility against future Husky upgrades. Both hooks should use the same Husky v9 convention.

- [x] Task 2: Create release-please configuration files
  - File: `release-please-config.json` (new)
  - Action: Create file with the following content:
    ```json
    {
      "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
      "release-type": "node",
      "packages": {
        ".": {
          "changelog-path": "CHANGELOG.md",
          "release-type": "node",
          "bump-minor-pre-major": true,
          "bump-patch-for-minor-pre-major": false,
          "draft": false,
          "prerelease": false,
          "extra-files": []
        }
      }
    }
    ```
  - File: `.release-please-manifest.json` (new)
  - Action: Create file with the following content:
    ```json
    {
      ".": "1.0.0"
    }
    ```
  - Notes: The manifest version `1.0.0` matches the current released version. release-please uses this as its source of truth for the current version. The `bump-minor-pre-major` flag only has effect when the version is `< 1.0.0` — it prevents `feat:` commits from triggering a major bump while still in 0.x. Since the project is already at 1.0.0, this flag has no practical effect and can be removed if desired, but it is harmless to keep. To create a pre-release, manually edit `release-please-config.json` to set `"prerelease": true` and push a commit. release-please will then create a Release PR with a pre-release version (e.g., `1.1.0-beta.1`).

- [x] Task 3: Rewrite release workflow with release-please
  - File: `.github/workflows/release.yml` (rewrite)
  - Action: Replace the entire file with a new workflow that:
    1. Triggers on `push` to `main` branch (not on tags)
    2. **Job 1: `release-please`** — Runs `googleapis/release-please-action@v4` with `release-type: node`. Outputs: `release_created`, `tag_name`, `version`, `major`, `minor`, `patch`, `sha`. Per-job permissions: `contents: write`, `pull-requests: write`.
    3. **Job 2: `publish-image`** — Runs only when `release_created == 'true'`. Per-job permissions: `contents: read`, `packages: write`. Logs into GHCR, extracts Docker metadata, builds and pushes Docker image. **CRITICAL: Do NOT use `type=semver` patterns** — they extract version from the git ref, but this workflow triggers on `push` to `main` (not a tag push), so `github.ref` is `refs/heads/main` and `type=semver` will produce nothing. Instead, use `type=raw` with explicit values from release-please outputs. Tags to produce:
       - `type=raw,value=${{ needs.release-please.outputs.version }}` — e.g., `1.2.3`
       - `type=raw,value=${{ needs.release-please.outputs.major }}.${{ needs.release-please.outputs.minor }},enable=${{ !contains(needs.release-please.outputs.tag_name, '-') }}` — e.g., `1.2` (stable releases only)
       - `type=raw,value=${{ needs.release-please.outputs.major }},enable=${{ !contains(needs.release-please.outputs.tag_name, '-') }}` — e.g., `1` (stable releases only)
       - `type=raw,value=latest,enable=${{ !contains(needs.release-please.outputs.tag_name, '-') }}` — `latest` (stable releases only)
       - `type=sha,prefix=sha-,format=short` — e.g., `sha-a1b2c3d`
    4. **Job 3: `update-major-tag`** — Runs only when `release_created == 'true'` AND the tag does NOT contain `-` (stable releases only — do not move the major tag for pre-releases). Per-job permissions: `contents: write`. Force-pushes the `v<major>` git tag to the release commit so `@v1` resolves correctly. Uses `git tag -fa "v${MAJOR}" -m "Update v${MAJOR} to ${TAG}"` and `git push origin "v${MAJOR}" --force`. **This job replaces the tag-push logic from the old `update-action-image` job** — the sed/commit part of that old job is removed, but the tag force-push is preserved here.
  - Top-level permissions: None (use per-job permissions for least-privilege)
  - Concurrency: group `release`, `cancel-in-progress: false`
  - Notes:
    - **Mapping from old workflow**: The old `validate-tag` job is removed (release-please handles tag validation). The old `release` job (quality gates + softprops/action-gh-release) is removed (CI enforces quality on every PR; release-please creates Releases). The old `publish-image` job is replaced by the new `publish-image` Job 2. The old `update-action-image` job is split: the sed/commit logic is removed entirely (action.yml already has the permanent reference), and the `git tag -fa` / `git push --force` logic is extracted into the new `update-major-tag` Job 3.
    - **Re-trigger behavior**: This workflow runs on EVERY push to `main` (including normal feature PR merges). This is by design — release-please needs to see every commit to build the Release PR. On a normal push, release-please will create/update a Release PR but `release_created` will be `false`, so Jobs 2 and 3 will be skipped. Only when the Release PR itself is merged does `release_created` become `true`, triggering Docker publish and tag update. A dev agent should NOT add path filters or other conditions to the trigger — doing so will break release-please.
    - **Pre-release safety**: The `{{major}}` and `{{major}}.{{minor}}` Docker tags and the `v<major>` git tag are gated behind `!contains(tag_name, '-')`. This prevents a pre-release build (e.g., `1.1.0-beta.1`) from overwriting the stable `1` and `1.1` Docker tags or moving the `v1` git tag. Pre-releases only produce the full version tag (e.g., `1.1.0-beta.1`) and `sha-*` tag.

#### Phase 2 — Security

- [x] Task 4: Create SECURITY.md
  - File: `SECURITY.md` (new)
  - Action: Create a security policy document containing:
    - **Supported Versions** table: `1.x.x` supported, `< 1.0.0` not supported
    - **Reporting a Vulnerability**: Direct users to GitHub's private vulnerability reporting (`https://github.com/arch-playground/ai-workflow-runner/security/advisories/new`). Do NOT open public issues for security vulnerabilities. Acknowledgment within 48 hours, timeline for fix provided.
    - **Security Measures**: List existing measures — env_vars value masking, path traversal prevention, temp file restricted permissions (0o600), error message sanitization, weekly Dependabot scanning.
  - Notes: Keep concise. Do not include email addresses unless the maintainer provides one.

- [x] Task 5: Create CodeQL workflow
  - File: `.github/workflows/codeql.yml` (new)
  - Action: Create a workflow that:
    1. Triggers on: `push` to `main`, `pull_request` to `main`, and weekly schedule (`cron: '0 6 * * 1'` — Monday 6am UTC)
    2. Permissions: `security-events: write`, `contents: read`
    3. Single job `analyze` with matrix `language: [javascript-typescript]`
    4. Steps: `actions/checkout@v6`, `github/codeql-action/init@v3` with language, `github/codeql-action/analyze@v3`
  - Notes: JavaScript-TypeScript is the only relevant language. No custom queries needed. The schedule ensures weekly scanning even without PRs.

- [x] Task 6: Create OSSF Scorecard workflow
  - File: `.github/workflows/scorecard.yml` (new)
  - Action: Create a workflow that:
    1. Triggers on: `branch_protection_rule`, weekly schedule (`cron: '0 6 * * 1'`), and `push` to `main`
    2. Permissions: `security-events: write`, `id-token: write`, `contents: read`
    3. Single job `analysis`
    4. Steps: `actions/checkout@v6` with `persist-credentials: false`, `ossf/scorecard-action@v2` with `results_file: results.sarif`, `results_format: sarif`, `publish_results: true`, then `actions/upload-artifact@v6` for the SARIF file, then `github/codeql-action/upload-sarif@v3` to integrate with GitHub Security tab
  - Notes: The `publish_results: true` flag publishes the score to the OpenSSF Scorecard API, enabling the Scorecard badge.

#### Phase 3 — Contributor Infrastructure

- [x] Task 7: Create CONTRIBUTING.md
  - File: `CONTRIBUTING.md` (new)
  - Action: Create a contributor guide containing:
    - **Getting Started**: Fork, clone, `npm ci`, create branch (`feat/...`, `fix/...`, `chore/...`)
    - **Prerequisites**: Node.js 20+, Docker (for integration tests)
    - **Development Commands** table: `npm run build`, `npm run bundle`, `npm run test:unit`, `npm run test:integration`, `npm run lint`, `npm run format`, `npm run format:check`, `npm run typecheck`
    - **Commit Messages**: Explain Conventional Commits format with type list (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert). Provide examples: `feat(validation): add JavaScript support`, `fix(timeout): handle SIGTERM gracefully`, `docs: update README with new inputs`
    - **Pull Request Process**: Run all checks locally first, update docs if inputs/outputs changed, add tests for new functionality, fill out PR template, request maintainer review
    - **Code Style**: Follow existing TypeScript patterns, no `any` types without justification, unit test coverage must not decrease
  - Notes: Keep practical and concise. Reference the PR template. Do not duplicate README content.

- [x] Task 8: Create CODE_OF_CONDUCT.md
  - File: `CODE_OF_CONDUCT.md` (new)
  - Action: Create using Contributor Covenant v2.1 text. Set enforcement contact to the repository's GitHub Discussions or Issues (since no email is provided). Include the standard sections: Our Pledge, Our Standards, Enforcement Responsibilities, Scope, Enforcement, Enforcement Guidelines, Attribution.
  - Notes: Use the full Contributor Covenant v2.1 text from `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`. This is the industry standard adopted by major open-source projects.

- [x] Task 9: Create issue templates
  - File: `.github/ISSUE_TEMPLATE/bug_report.yml` (new)
  - Action: Create a structured bug report template with:
    - `name: Bug Report`, `description: Report a bug in AI Workflow Runner`, `title: "[Bug]: "`, `labels: ["bug"]`
    - Fields: Action Version (input, required), Description (textarea, required), Workflow Configuration (textarea with `render: yaml`, required), Relevant Logs (textarea with `render: shell`, optional), Expected Behavior (textarea, required)
  - File: `.github/ISSUE_TEMPLATE/feature_request.yml` (new)
  - Action: Create a structured feature request template with:
    - `name: Feature Request`, `description: Suggest a new feature`, `title: "[Feature]: "`, `labels: ["enhancement"]`
    - Fields: Problem (textarea, required — what problem does this solve?), Proposed Solution (textarea, required), Alternatives Considered (textarea, optional)
  - Notes: Use YAML-based templates (not Markdown) for structured input. YAML templates render as forms in GitHub.

- [x] Task 10: Create PR template
  - File: `.github/pull_request_template.md` (new)
  - Action: Create a PR template with sections:
    - **Summary**: Brief description placeholder
    - **Type of Change**: Checklist — Bug fix, New feature, Breaking change, Documentation update, CI/CD improvement
    - **Checklist**: Code follows project style, tests added, all tests pass locally, documentation updated, commits follow Conventional Commits format
    - **Testing**: How the change was tested
    - **Related Issues**: `Fixes #`, `Relates to #`

- [x] Task 11: Create CODEOWNERS file
  - File: `.github/CODEOWNERS` (new)
  - Action: Create file with:

    ```
    # Default owner for everything
    * @tannt

    # CI/CD and release infrastructure
    .github/ @tannt
    action.yml @tannt
    Dockerfile @tannt
    entrypoint.sh @tannt
    ```

  - Notes: Uses the GitHub username `@tannt` based on the project author. This file requires the repository to have branch protection rules enabled with "Require review from code owners" checked. CODEOWNERS path matching: `*` matches all files at any depth. `Dockerfile` and `entrypoint.sh` without a leading `/` match files at any depth, but these files exist only at the repository root. `.github/` matches the entire `.github` directory. All paths in this file have been verified to exist in the current repository structure (`Dockerfile` at root, `entrypoint.sh` at root, `.github/` directory, `action.yml` at root).

#### Phase 4 — Maintenance & Cleanup

- [x] Task 12: Create Dependabot auto-merge workflow
  - File: `.github/workflows/dependabot-automerge.yml` (new)
  - Action: Create a workflow that:
    1. Triggers on: `pull_request_target` (**NOT** `pull_request`). Dependabot-triggered `pull_request` events run with read-only tokens as a GitHub security measure. Using `pull_request_target` runs in the context of the base branch and has write access to the repository.
    2. Permissions: `contents: write`, `pull-requests: write`
    3. Single job `auto-merge`, runs only when `github.actor == 'dependabot[bot]'`
    4. Steps: `dependabot/fetch-metadata@v2` to extract update type, then conditional step that runs `gh pr merge --auto --squash "$PR_URL"` only when `update-type` is `version-update:semver-patch` or `version-update:semver-minor`
  - Notes: Major version updates are NOT auto-merged — they require manual review. This works with branch protection rules requiring CI to pass before merge. The `pull_request_target` trigger is safe here because the workflow only runs `gh pr merge` — it does NOT check out or execute code from the PR branch.

- [x] Task 13: Simplify CI to main-only
  - File: `.github/workflows/ci.yml` (modify)
  - Action: Change lines 4-7 from:
    ```yaml
    on:
      push:
        branches: [main, develop]
      pull_request:
        branches: [main, develop]
    ```
    to:
    ```yaml
    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]
    ```
  - Notes: This is a 2-line change (remove `develop` from both arrays). No other changes to `ci.yml`. The `develop` branch is no longer part of the branching strategy.

- [x] Task 14: Document branch protection rules
  - File: `CONTRIBUTING.md` (append)
  - Action: Add a section at the end of CONTRIBUTING.md titled "Branch Protection" with the recommended settings for maintainers to configure manually in GitHub repository settings:
    - Require PR before merging: Yes
    - Required status checks: `quality`, `unit-test`, `build-and-integration`, `e2e-action-tests` (note: `security-audit` is intentionally excluded because it uses `continue-on-error: true` and `|| true` — it never fails the CI pipeline, serving as an advisory check only. The `report` job is also excluded as it is purely informational.)
    - Require branches up to date before merging: Yes
    - Require conversation resolution before merging: Yes
    - Restrict force pushes (except `github-actions[bot]` for major version tag updates): Yes
    - Restrict deletions: Yes
  - Notes: These rules cannot be automated via code — they must be configured in GitHub Settings > Branches. Document them so maintainers know what to set up.

### Acceptance Criteria

#### Phase 1 — Release Automation

- [ ] AC-1: Given a developer makes a commit locally, when the commit message does not follow Conventional Commits format (e.g., `"bad message"`), then the `commit-msg` hook rejects the commit with a commitlint error
- [ ] AC-2: Given a developer makes a commit locally, when the commit message follows Conventional Commits format (e.g., `"feat: add new input"`), then the commit succeeds
- [ ] AC-3: Given a `feat:` commit is pushed to `main`, when release-please runs, then it creates or updates a Release PR with the correct version bump (minor), updated CHANGELOG.md, and updated package.json version
- [ ] AC-4: Given a Release PR is merged, when the release-please workflow runs, then it creates a GitHub Release with the tag (e.g., `v1.1.0`), release notes, and the release is visible on the Releases page
- [ ] AC-5: Given a GitHub Release is created, when the `publish-image` job runs, then Docker images are pushed to GHCR with tags: `1.1.0`, `1.1`, `1`, `latest`, and `sha-<commit>`
- [ ] AC-5b: Given the first release after adopting release-please, when the Release PR is created, then the existing CHANGELOG.md v1.0.0 entry and header text ("All notable changes...") are preserved below the new release-please entry — the file is not clobbered or duplicated
- [ ] AC-6: Given a pre-release version (e.g., `1.1.0-beta.1`), when Docker images are tagged, then ONLY the full version tag (`1.1.0-beta.1`) and `sha-<commit>` are applied. The `latest`, `{{major}}` (`1`), and `{{major}}.{{minor}}` (`1.1`) tags are NOT applied — this prevents a pre-release from overwriting stable tags used by production consumers
- [ ] AC-7: Given a stable GitHub Release is created (no `-` in tag name), when the `update-major-tag` job runs, then the `v1` git tag is force-pushed to point to the release commit, so `@v1` resolves to the latest stable release
- [ ] AC-7b: Given a pre-release GitHub Release is created (tag contains `-`), when the workflow evaluates the `update-major-tag` job condition, then the job is SKIPPED — the `v1` git tag continues pointing to the previous stable release

#### Phase 2 — Security

- [ ] AC-8: Given the `SECURITY.md` file exists, when a user navigates to the repository's Security tab, then they see the security policy with instructions for private vulnerability reporting
- [ ] AC-9: Given a PR is opened against `main`, when the CodeQL workflow runs, then it performs JavaScript/TypeScript analysis and reports any findings in the Security tab
- [ ] AC-10: Given Monday 6am UTC arrives, when the CodeQL scheduled workflow runs, then it completes analysis of the `main` branch without errors
- [ ] AC-11: Given Monday 6am UTC arrives, when the Scorecard scheduled workflow runs, then it uploads SARIF results to the Security tab and publishes to the OpenSSF API

#### Phase 3 — Contributor Infrastructure

- [ ] AC-12: Given a new contributor visits the repository, when they click "Issues > New Issue", then they see two template options: "Bug Report" and "Feature Request" with structured form fields
- [ ] AC-13: Given a contributor opens a PR, when the PR is created, then the PR template auto-populates with Summary, Type of Change, Checklist, Testing, and Related Issues sections
- [ ] AC-14: Given a PR is opened, when GitHub evaluates CODEOWNERS, then `@tannt` is automatically requested as reviewer
- [ ] AC-15: Given a new contributor visits the repository, when they look for contribution guidelines, then `CONTRIBUTING.md` provides clear setup instructions, commit message format, and PR process
- [ ] AC-16: Given a contributor visits the repository, when they look for community standards, then `CODE_OF_CONDUCT.md` contains the Contributor Covenant v2.1

#### Phase 4 — Maintenance & Cleanup

- [ ] AC-17: Given Dependabot opens a PR with a patch or minor version update, when CI passes, then the PR is automatically merged via squash merge
- [ ] AC-18: Given Dependabot opens a PR with a major version update, when CI passes, then the PR is NOT auto-merged and requires manual review
- [ ] AC-19: Given a developer pushes to a branch named `develop`, when GitHub Actions evaluates workflow triggers, then the CI workflow does NOT run (only `main` branch triggers)
- [ ] AC-20: Given a developer opens a PR targeting `main`, when GitHub Actions evaluates workflow triggers, then the CI workflow runs normally

## Additional Context

### Dependencies

**npm devDependencies to add:**

- `@commitlint/cli` — CLI for linting commit messages
- `@commitlint/config-conventional` — Conventional Commits rule preset

**GitHub Actions used (no install needed):**

- `googleapis/release-please-action@v4` — Creates Release PRs and GitHub Releases
- `github/codeql-action@v3` — CodeQL security analysis (init + analyze)
- `ossf/scorecard-action@v2` — OpenSSF Scorecard security metrics
- `dependabot/fetch-metadata@v2` — Extracts Dependabot PR metadata for auto-merge
- `docker/metadata-action@v5` — Already used, tag config will be expanded
- `docker/build-push-action@v6` — Already used, no changes
- `docker/login-action@v3` — Already used, no changes

### Testing Strategy

- **commitlint (local)**: Run `echo "bad message" | npx commitlint` (should fail) and `echo "feat: add feature" | npx commitlint` (should pass). Also test by attempting a bad commit message locally and verifying the hook rejects it.
- **release-please (CI)**: Push a `feat:` commit to `main`. Verify release-please opens a Release PR with correct changelog and version bump. Merge the PR and verify GitHub Release + git tag are created. Verify Docker images appear in GHCR with all expected tags.
- **Pre-release (CI)**: Temporarily set `"prerelease": true` in `release-please-config.json`, push a `feat:` commit. Verify the Release PR shows a pre-release version (e.g., `1.1.0-beta.1`). Merge and verify: (a) `latest` Docker tag is NOT applied, (b) `{{major}}` and `{{major}}.{{minor}}` Docker tags are NOT applied, (c) the `v1` git tag is NOT moved, (d) only the full version tag (`1.1.0-beta.1`) and `sha-*` tag are present.
- **CHANGELOG preservation (CI)**: After the first release-please Release PR is created, inspect the PR diff for `CHANGELOG.md`. Verify the existing v1.0.0 entry and header text are preserved below the new entry. If clobbered, adjust release-please config.
- **Major version tag (CI)**: After release, run `git ls-remote --tags origin v1` and verify the SHA matches the release commit.
- **CodeQL (CI)**: Open a PR and verify CodeQL workflow triggers. Check the Security tab for analysis results. Wait for Monday schedule and verify it runs on `main`.
- **Scorecard (CI)**: Wait for Monday schedule. Verify SARIF upload to Security tab. Check OpenSSF Scorecard API for published results.
- **Dependabot auto-merge (CI)**: Wait for a Dependabot patch/minor PR. Verify it auto-merges after CI passes. Verify major version PRs are left open for manual review.
- **CI triggers (CI)**: Push a PR targeting `main` — CI should run. Create a branch called `develop` and push — CI should NOT run.
- **Issue templates**: Navigate to Issues > New Issue and verify both templates render as forms.
- **PR template**: Open a new PR and verify the template auto-populates.
- **CODEOWNERS**: Open a PR and verify `@tannt` is auto-requested as reviewer (requires branch protection enabled).

### Notes

- The existing `CHANGELOG.md` (v1.0.0) will be preserved. release-please will manage it going forward by prepending new entries. release-please uses its own changelog format — the first release-please entry will appear above the existing `[1.0.0]` entry.
- `package.json` version remains at `0.0.0` in the codebase. release-please manages the version via `.release-please-manifest.json` and updates `package.json` in the Release PR. The manifest is set to `1.0.0` to match the current release state.
- Branch protection rules must be configured manually in GitHub repository settings (Settings > Branches > Branch protection rules). They are documented in CONTRIBUTING.md for maintainer reference.
- The `softprops/action-gh-release@v2` action currently used in release.yml is no longer needed — release-please creates GitHub Releases natively.
- The `validate-tag` and `release` (quality gates) jobs in the current release.yml are removed entirely — release-please handles tag creation, release notes, and GitHub Release creation. CI enforces quality on every PR before merge.
- **Pre-release workflow**: To create a pre-release, the maintainer edits `release-please-config.json` to set `"prerelease": true`, pushes the change, and release-please will generate pre-release versions. After the pre-release period, set it back to `false` for stable releases.
- **Risk: release-please changelog format** — release-please uses a different format than Keep a Changelog. The existing v1.0.0 entry will remain, but new entries will use release-please's format (grouped by Conventional Commit type). This is acceptable and standard for projects using release-please.
- **Risk: CODEOWNERS without branch protection** — CODEOWNERS has no effect unless branch protection is enabled with "Require review from code owners". Document this dependency clearly.
- **Action version consistency**: New workflow files (codeql.yml, scorecard.yml, dependabot-automerge.yml) must use the same action versions as the existing workflows — `actions/checkout@v6`, `actions/upload-artifact@v6`, `actions/setup-node@v6`. These are already in use in the current CI and release workflows and are verified to work. Pin all new usages to the same `@v6` versions for consistency.

## Review Notes

- Adversarial review completed
- Findings: 13 total, 7 fixed, 6 skipped (noise/not applicable)
- Resolution approach: auto-fix
- Fixed: F1 (tag release SHA not HEAD), F2 (Dependabot commit-message prefix), F4 (fetch-depth: 0 restored), F5 (sequential update-major-tag after publish-image), F6 (redundant release-type removed), F7 (redundant type-enum removed), F12 (unused sha output removed)
- Skipped: F3 (verified already executable), F8 (CODE_OF_CONDUCT skipped per user), F9/F10/F11/F13 (noise)
