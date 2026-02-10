# Contributing to AI Workflow Runner

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/ai-workflow-runner.git`
3. Install dependencies: `npm ci`
4. Create a branch: `git checkout -b feat/your-feature` (or `fix/...`, `chore/...`)

## Prerequisites

- **Node.js** 20+
- **Docker** (for integration tests)

## Development Commands

| Command                    | Description                             |
| -------------------------- | --------------------------------------- |
| `npm run build`            | Compile TypeScript                      |
| `npm run bundle`           | Bundle with esbuild for distribution    |
| `npm run test:unit`        | Run unit tests with coverage            |
| `npm run test:integration` | Run integration tests (requires Docker) |
| `npm run lint`             | Run ESLint                              |
| `npm run format`           | Format code with Prettier               |
| `npm run format:check`     | Check formatting without changes        |
| `npm run typecheck`        | Run TypeScript type checking            |

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commit messages are validated by commitlint via a Git hook.

### Format

```
<type>(<optional scope>): <description>
```

### Types

| Type       | Description                          |
| ---------- | ------------------------------------ |
| `feat`     | A new feature                        |
| `fix`      | A bug fix                            |
| `docs`     | Documentation changes                |
| `style`    | Code style changes (formatting, etc) |
| `refactor` | Code refactoring                     |
| `perf`     | Performance improvements             |
| `test`     | Adding or updating tests             |
| `build`    | Build system or dependency changes   |
| `ci`       | CI/CD configuration changes          |
| `chore`    | Other changes                        |
| `revert`   | Reverting a previous commit          |

### Examples

```
feat(validation): add JavaScript support
fix(timeout): handle SIGTERM gracefully
docs: update README with new inputs
ci: add CodeQL security scanning
```

## Pull Request Process

1. Run all checks locally before pushing:
   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm run test:unit
   npm run bundle
   ```
2. Update documentation if you change inputs, outputs, or behavior
3. Add tests for new functionality
4. Fill out the PR template completely
5. Request a maintainer review

## Code Style

- Follow existing TypeScript patterns in the codebase
- Avoid `any` types without justification
- Unit test coverage must not decrease
- Use meaningful variable and function names

## Branch Protection

Maintainers should configure the following branch protection rules for `main` in **Settings > Branches**:

- **Require a pull request before merging**: Yes
- **Required status checks**:
  - `quality`
  - `unit-test`
  - `build-and-integration`
  - `e2e-action-tests`
- **Require branches to be up to date before merging**: Yes
- **Require conversation resolution before merging**: Yes
- **Restrict force pushes**: Yes (allow `github-actions[bot]` for major version tag updates)
- **Restrict deletions**: Yes

> **Note:** `security-audit` is intentionally excluded from required checks — it uses `continue-on-error` and serves as an advisory check only. The `report` job is also excluded as it is purely informational.
