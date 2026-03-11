# Changelog

All notable changes to AI Workflow Runner will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0](https://github.com/arch-playground/ai-workflow-runner/compare/v1.2.0...v1.3.0) (2026-03-11)


### Features

* **logging:** implement tool call logger factory pattern ([72d9847](https://github.com/arch-playground/ai-workflow-runner/commit/72d9847f7192b48a6be30715272ff4848fecc4c5))
* **logging:** implement tool call logger factory pattern ([a3397e9](https://github.com/arch-playground/ai-workflow-runner/commit/a3397e96f5b3aadff32a8f83c716a38cdfe24b42))

## [1.2.0](https://github.com/arch-playground/ai-workflow-runner/compare/v1.1.4...v1.2.0) (2026-03-10)


### Features

* **config:** update config handling to support paths under runner temp ([5d31e47](https://github.com/arch-playground/ai-workflow-runner/commit/5d31e47fc5c3664eea37137258374bb08fdb1d89))
* **security:** accept absolute paths under RUNNER_TEMP and translate to Docker mount ([154b2fc](https://github.com/arch-playground/ai-workflow-runner/commit/154b2fcb396d872ff7f6c80c60453de211c5543e))
* **validation:** log validation output and retry messages for better debugging ([0031b0f](https://github.com/arch-playground/ai-workflow-runner/commit/0031b0f492fc844bec3a488f6d3cc6fa51c194da))

## [1.1.4](https://github.com/arch-playground/ai-workflow-runner/compare/v1.1.3...v1.1.4) (2026-03-10)


### Bug Fixes

* add commit message and PR description templates for Conventional Commits format ([4f2e19a](https://github.com/arch-playground/ai-workflow-runner/commit/4f2e19a77678f7b8216402674cf59eb95090f43c))
* add commit message and PR description templates for Conventional… ([aa8641e](https://github.com/arch-playground/ai-workflow-runner/commit/aa8641eaa8d60b2a98d6c7eda5bd633710981a55))

## [1.1.1](https://github.com/arch-playground/ai-workflow-runner/compare/v1.1.0...v1.1.1) (2026-03-10)


### Bug Fixes

* **inputs:** make workflow_path optional and update validation logic ([45070aa](https://github.com/arch-playground/ai-workflow-runner/commit/45070aa5f567bfb0b545462a8c71049ebeb0dbcf))

## [1.1.0](https://github.com/arch-playground/ai-workflow-runner/compare/v1.0.0...v1.1.0) (2026-03-09)


### Features

* add workflow-creator skill for ai-workflow-runner ([185c11b](https://github.com/arch-playground/ai-workflow-runner/commit/185c11b930ee316ac96c096c4838d48214b9f5d2))
* **docs:** add Workflow Creator Skill documentation and installation guide ([743e537](https://github.com/arch-playground/ai-workflow-runner/commit/743e53782cf34ab9e39fb7f225fb838dc367d226))
* **docs:** add Workflow Creator Skill documentation and installation… ([c2b3c75](https://github.com/arch-playground/ai-workflow-runner/commit/c2b3c752eb2ebcfbd489ac9bb82609dfa7c46e78))


### Bug Fixes

* update action reference from owner to arch-playground in README.md ([3bfeb17](https://github.com/arch-playground/ai-workflow-runner/commit/3bfeb172b4b5a0309da71fbb1b8a1c7e173eb8ad))

## [1.0.0] - 2026-02-09

### Initial Release

The first stable release of **AI Workflow Runner** — a GitHub Action that brings agentic AI workflows to your CI/CD pipelines.

### Added

#### Agentic AI Execution

- Run AI workflows powered by [OpenCode SDK](https://www.npmjs.com/package/@opencode-ai/sdk) directly in GitHub Actions
- Real-time console streaming of AI output to GitHub Actions logs
- Session management with idle detection and timeout handling
- Follow-up message support for multi-turn AI conversations
- Automatic permission auto-approval for unattended CI execution

#### Validation & Retry System

- Validate AI outputs using Python or JavaScript scripts
- Auto-retry with AI feedback loop when validation fails (up to 20 attempts)
- File-based scripts (`.py`, `.js`) with auto-detected type
- Inline scripts with prefix syntax (`python:...`, `js:...`)
- Configurable script timeout (60s) with SIGKILL escalation

#### Multi-Runtime Docker Environment

- Pre-built Docker image on GHCR for fast startup (no per-run builds)
- Node.js 20+, Python 3.11, and Java 21 pre-installed
- Signal-forwarding entrypoint for graceful Docker shutdown

#### Configuration & Customization

- Custom OpenCode provider configuration via `opencode_config` input
- Custom authentication via `auth_config` input (supports GitHub Copilot tokens)
- Model selection via `model` input (overrides config file default)
- `list_models` mode to discover available models
- Environment variables passed securely to workflows and validation scripts

#### Security

- Path traversal prevention for all file inputs
- Automatic secret masking for all `env_vars` values
- Error message sanitization (no absolute paths or secrets in logs)
- Temp files created with restricted permissions (0o600)

#### CI/CD & Quality

- Automated CI pipeline with linting, type checking, and unit tests
- Release automation with semver tagging and GitHub Releases
- Docker build verification in CI
- E2E test workflows for real-world validation
- Dependabot configured for weekly dependency updates
- 80%+ unit test coverage on core logic

#### Documentation & Examples

- Complete README with quick-start guide and API reference
- 4 example workflows: basic, validation, GitHub Copilot, custom model
- Input/output reference tables
- Validation script guide with Python and JavaScript examples

### Platform Support

| Platform                      | Status        |
| ----------------------------- | ------------- |
| Linux runners (ubuntu-latest) | Supported     |
| Self-hosted Linux + Docker    | Supported     |
| Windows / macOS               | Not supported |

[1.0.0]: https://github.com/arch-playground/ai-workflow-runner/releases/tag/v1.0.0
