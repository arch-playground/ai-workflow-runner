# Changelog

All notable changes to AI Workflow Runner will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
