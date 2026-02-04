# AI Workflow Runner - Project Overview

## Executive Summary

AI Workflow Runner is a **GitHub Action** that executes AI workflows using the OpenCode SDK with built-in validation script support. It provides a Docker-based, multi-runtime environment for running AI-powered automation tasks within GitHub Actions pipelines.

## Project Information

| Property       | Value                                                 |
| -------------- | ----------------------------------------------------- |
| **Name**       | ai-workflow-runner                                    |
| **Version**    | 0.0.0                                                 |
| **Type**       | GitHub Action (Docker container)                      |
| **Author**     | TanNT                                                 |
| **License**    | MIT                                                   |
| **Repository** | https://github.com/arch-playground/ai-workflow-runner |

## Technology Stack

| Category      | Technology       | Version         | Purpose                          |
| ------------- | ---------------- | --------------- | -------------------------------- |
| **Language**  | TypeScript       | 5.3+            | Primary development language     |
| **Runtime**   | Node.js          | 20+             | JavaScript execution environment |
| **Bundler**   | esbuild          | 0.27+           | Fast TypeScript bundler          |
| **Testing**   | Jest             | 29.7+           | Unit and integration testing     |
| **Container** | Docker           | Debian Bookworm | Multi-runtime container          |
| **SDK**       | @opencode-ai/sdk | 1.1.28+         | AI workflow execution            |
| **CI/CD**     | GitHub Actions   | -               | Continuous integration           |

## Architecture Type

**Modular Service-Based Architecture**

The project follows a clean separation of concerns with distinct modules:

- **Entry Point** (`index.ts`) - Signal handling and orchestration
- **Runner** (`runner.ts`) - Workflow execution logic
- **Config** (`config.ts`) - Input parsing and validation
- **Security** (`security.ts`) - Path validation and secret masking
- **OpenCode** (`opencode.ts`) - SDK integration service
- **Validation** (`validation.ts`) - Script execution engine

## Key Features

1. **OpenCode SDK Integration** - Runs AI workflows using @opencode-ai/sdk
2. **Validation Scripts** - Python/JavaScript scripts to verify workflow outputs
3. **Retry Mechanism** - Automatic retry when validation fails (configurable 1-20 attempts)
4. **Multi-Runtime Support** - Node.js 20+, Python 3.11, Java 21 pre-installed
5. **Security** - Path traversal prevention, secret masking, input validation
6. **Docker-Based** - Consistent environment across all runs
7. **Graceful Shutdown** - Proper SIGTERM/SIGINT handling

## Platform Support

| Platform                      | Support          |
| ----------------------------- | ---------------- |
| Linux runners (ubuntu-latest) | ✅ Supported     |
| Self-hosted Linux with Docker | ✅ Supported     |
| Windows runners               | ❌ Not supported |
| macOS runners                 | ❌ Not supported |

## Input/Output Limits

| Input                  | Limit            |
| ---------------------- | ---------------- |
| workflow_path length   | 1,024 characters |
| prompt size            | 100 KB           |
| env_vars JSON size     | 64 KB            |
| env_vars entry count   | 100 entries      |
| result output size     | 900 KB           |
| validation_script size | 100 KB           |
| validation_max_retry   | 1-20 attempts    |
| timeout_minutes        | 1-360 minutes    |

## Getting Started

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run unit tests
npm run test:unit

# Build and bundle
npm run bundle

# Build Docker image
docker build -t ai-workflow-runner:local .
```

## Documentation Index

- [Architecture](./architecture.md) - System design and patterns
- [Source Tree Analysis](./source-tree-analysis.md) - Directory structure
- [Development Guide](./development-guide.md) - Setup and workflows
- [API Contracts](./api-contracts.md) - GitHub Action inputs/outputs
