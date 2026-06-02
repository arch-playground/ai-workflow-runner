# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

To report a vulnerability, use GitHub's private vulnerability reporting:

1. Go to [Security Advisories](https://github.com/arch-playground/ai-workflow-runner/security/advisories/new)
2. Click **"Report a vulnerability"**
3. Provide a detailed description of the vulnerability

You will receive an acknowledgment within 48 hours. A timeline for a fix will be provided after initial assessment.

## Security Measures

This project implements the following security measures:

- **Environment variable masking** — `env_vars` values are registered with `core.setSecret()` to prevent exposure in logs
- **Path traversal prevention** — Workflow file paths are validated to prevent directory traversal attacks
- **Temp file permissions** — Temporary files are created with restricted permissions (`0o600`)
- **Error message sanitization** — Internal errors are sanitized before being exposed in action outputs
- **Dependency scanning** — Weekly Dependabot scanning for npm and GitHub Actions dependencies
- **Scoped agent environment** — The AI agent runs with an allowlisted environment (not the full runner env); ambient runner secrets are not exposed to the agent process
- **Read-only bash allowlist** — Agent shell access defaults to read-only commands (grep, find, cat, ls, git log, etc.); arbitrary commands are denied by default
- **Filesystem confinement** — Agent filesystem access is confined to the workspace via `external_directory: deny`; paths outside the workspace (home dir, `/proc`, `/etc`) are refused
- **Non-root container** — The agent runs as a dedicated non-root `runner` user; root-level writes to the container OS are not possible
- **Provider URL allowlist** — Provider `baseURL` values in `opencode_config` are validated against a built-in allowlist; non-allowlisted endpoints cannot receive credentials
- **Inert job summary** — AI output in the job summary is rendered as a code block (not markdown), preventing phishing-link injection
- **Global timeout** — `timeout_minutes` is enforced as a hard wall-clock deadline on the entire run

## Threat Model & Safe Adoption

This section describes the risks you own as an adopter. The Action's controls are defense-in-depth; your GitHub workflow configuration is the outer perimeter.

### Minimal `permissions:`

Set least-privilege `GITHUB_TOKEN` permissions in your calling workflow:

```yaml
jobs:
  ai-workflow:
    runs-on: ubuntu-latest
    permissions:
      contents: read # minimum; add others only if your workflow/validation needs them
```

Never grant `write` or `admin` permissions unless explicitly required.

### Never `pull_request_target` + untrusted PR + secrets

Do **not** run this Action in a `pull_request_target` workflow that checks out the PR head while secrets are in scope. `pull_request_target` runs with repository secrets and write permissions; a malicious PR can inject content into `workflow_path`, `prompt`, or files the agent reads. Use `pull_request` (no secrets) or gate with explicit conditions.

### Trusted inputs (code/credential-adjacent)

These inputs execute code or control where credentials are sent. **Never source them from untrusted input** (PR content, issue bodies, user-supplied data):

| Input               | Risk if untrusted                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow_path`     | The agent follows this file as instructions                                                                                                                    |
| `prompt`            | Directly controls agent behavior                                                                                                                               |
| `opencode_config`   | Controls provider endpoints; a crafted `baseURL` directs where your API key is sent (allowlisted since Epic 13, but the principle stands: org-controlled only) |
| `validation_script` | Executes arbitrary Python or JavaScript on the runner                                                                                                          |
| `auth_config`       | Contains provider API keys                                                                                                                                     |

### The agent runs code — understand the opt-in surface

By default the agent has: read-only shell, read-only git history, workspace-confined filesystem, non-root user. These inputs widen that surface:

| Input                      | What it enables                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bash_allow_patterns`      | Extend the bash command allowlist beyond read-only defaults — each pattern is a new capability            |
| `agent_working_directory`  | Scope to a workspace subdirectory (narrowing, not widening — but misconfiguration can remove the benefit) |
| `allowed_provider_hosts`   | Permit additional provider hosts to receive credentials — only add hosts you control                      |
| `webfetch_allowed_domains` | Allow agent to fetch specific domains (denied by default) — each domain widens network surface            |

### Egress filtering

The Action does not restrict network egress. For egress control, use [`step-security/harden-runner`](https://github.com/step-security/harden-runner) or runner-level network policy.

### Secrets via GitHub Secrets, not Variables

`auth_config` and any file containing API keys must be sourced from GitHub **Secrets** (`${{ secrets.* }}`), never from GitHub **Variables** (`${{ vars.* }}`). Variables are not encrypted.
