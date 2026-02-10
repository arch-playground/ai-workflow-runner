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
