# AI Workflow Runner - Architecture

## Overview

AI Workflow Runner is a Docker-based GitHub Action that executes AI workflows using the OpenCode SDK. The architecture follows a modular, service-based design with clear separation of concerns.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Docker Container                          ││
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     ││
│  │  │ entrypoint  │───▶│   index.ts  │───▶│  runner.ts  │     ││
│  │  │    .sh      │    │  (main)     │    │ (workflow)  │     ││
│  │  └─────────────┘    └─────────────┘    └──────┬──────┘     ││
│  │                                                │             ││
│  │         ┌──────────────────┬──────────────────┼─────────┐  ││
│  │         ▼                  ▼                  ▼         │  ││
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │  ││
│  │  │  config.ts  │   │ security.ts │   │ opencode.ts │   │  ││
│  │  │  (inputs)   │   │  (paths)    │   │   (SDK)     │   │  ││
│  │  └─────────────┘   └─────────────┘   └──────┬──────┘   │  ││
│  │                                              │          │  ││
│  │                                              ▼          │  ││
│  │                                       ┌─────────────┐  │  ││
│  │                                       │ validation  │  │  ││
│  │                                       │    .ts      │  │  ││
│  │                                       └─────────────┘  │  ││
│  │                                                         │  ││
│  │  ┌─────────────────────────────────────────────────────┘  ││
│  │  │  Runtime Environment                                    ││
│  │  │  • Node.js 20+  • Python 3.11  • Java 21               ││
│  │  └─────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Module Architecture

### Core Modules

#### 1. Entry Point (`src/index.ts`)

**Responsibility:** Application bootstrap, signal handling, orchestration

**Key Functions:**

- `run()` - Main execution flow
- `handleShutdown()` - Graceful SIGTERM/SIGINT handling

**Design Patterns:**

- Singleton AbortController for coordinated shutdown
- Async error boundary with output guarantees

#### 2. Runner (`src/runner.ts`)

**Responsibility:** Workflow execution and validation loop

**Key Functions:**

- `runWorkflow()` - Primary workflow execution
- `validateWorkflowFile()` - File validation pipeline
- `runValidationLoop()` - Retry logic for validation scripts

**Design Patterns:**

- Result pattern for error handling (RunnerResult)
- Strategy pattern for validation execution

#### 3. Config (`src/config.ts`)

**Responsibility:** Input parsing, validation, environment configuration

**Key Functions:**

- `getInputs()` - Parse GitHub Action inputs
- `validateInputs()` - Semantic validation

**Security Features:**

- Reserved environment variable blocking (PATH, LD*PRELOAD, GITHUB*\*)
- Input size limits enforcement
- Secret masking via @actions/core

#### 4. Security (`src/security.ts`)

**Responsibility:** Path validation, secret handling, error sanitization

**Key Functions:**

- `validateWorkspacePath()` - Path traversal prevention
- `validateRealPath()` - Symlink escape detection
- `maskSecrets()` - GitHub Actions secret masking
- `sanitizeErrorMessage()` - Sensitive data removal
- `validateUtf8()` - Encoding validation

**Security Patterns:**

- Workspace boundary enforcement
- Symlink resolution verification
- UTF-8 encoding validation

#### 5. OpenCode Service (`src/opencode.ts`)

**Responsibility:** OpenCode SDK integration, session management

**Key Classes:**

- `OpenCodeService` - Singleton service wrapper

**Key Methods:**

- `initialize()` - SDK server startup
- `runSession()` - Create and execute session
- `sendFollowUp()` - Continue conversation
- `dispose()` - Resource cleanup

**Design Patterns:**

- Singleton pattern for service instance
- Event-driven architecture for SDK communication
- Promise-based async/await with abort support

#### 6. Validation (`src/validation.ts`)

**Responsibility:** Validation script execution (Python/JavaScript)

**Key Functions:**

- `detectScriptType()` - Script type inference
- `executeValidationScript()` - Script execution engine

**Supported Formats:**

- File-based: `.py`, `.js` files
- Inline: `python:code`, `javascript:code`, `js:code` prefixes

**Security Features:**

- Workspace path validation
- Minimal environment variable exposure
- Process timeout (60 seconds)
- SIGKILL escalation after SIGTERM

### Type Definitions (`src/types.ts`)

**Key Types:**

- `ActionInputs` - Parsed input configuration
- `OpenCodeSession` - Session state
- `ValidationOutput` - Script result
- `RunnerResult` - Workflow execution result
- `INPUT_LIMITS` - System constraints

## Data Flow

### Workflow Execution Flow

```
1. GitHub Action Triggered
   │
   ▼
2. entrypoint.sh → node /app/dist/index.js
   │
   ▼
3. index.ts: run()
   │
   ├─▶ getInputs() → Parse action inputs
   ├─▶ validateInputs() → Validate semantically
   │
   ▼
4. runner.ts: runWorkflow()
   │
   ├─▶ validateWorkflowFile() → Security checks
   ├─▶ Read workflow.md content
   ├─▶ Combine with user prompt
   │
   ▼
5. opencode.ts: OpenCodeService
   │
   ├─▶ initialize() → Start SDK server
   ├─▶ runSession() → Execute prompt
   │   │
   │   └─▶ Event loop: message streaming
   │
   ▼
6. [Optional] Validation Loop
   │
   ├─▶ executeValidationScript()
   │   │
   │   ├─▶ Success (empty/"true") → Done
   │   │
   │   └─▶ Failure → sendFollowUp() → Retry
   │
   ▼
7. Return result → Set outputs → Exit
```

### Signal Handling Flow

```
SIGTERM/SIGINT received
   │
   ▼
handleShutdown()
   │
   ├─▶ Abort controller.abort()
   ├─▶ Dispose OpenCode service
   ├─▶ Set 10s force exit timeout
   │
   ▼
Wait for run() completion
   │
   ▼
Exit with proper status
```

## Error Handling Strategy

### Error Boundaries

1. **Input Validation** - Early rejection with clear error messages
2. **File Validation** - Path security before file access
3. **SDK Errors** - Wrapped with context preservation
4. **Validation Errors** - Retry mechanism with feedback
5. **Timeout Errors** - Graceful handling with partial output

### Error Sanitization

All error messages are sanitized before output:

- Absolute paths replaced with `[PATH]`
- Long alphanumeric strings (potential secrets) replaced with `[REDACTED]`

## Security Architecture

### Input Security

| Control           | Implementation                                              |
| ----------------- | ----------------------------------------------------------- |
| Path Traversal    | `validateWorkspacePath()` rejects `..` and absolute paths   |
| Symlink Escape    | `validateRealPath()` verifies resolved path is in workspace |
| Env Var Injection | Blocklist for PATH, LD*PRELOAD, GITHUB*\*                   |
| Size Limits       | Hard limits on all inputs (see INPUT_LIMITS)                |
| Encoding          | UTF-8 validation before processing                          |

### Runtime Security

| Control           | Implementation                                        |
| ----------------- | ----------------------------------------------------- |
| Secret Masking    | All env_vars values masked via `core.setSecret()`     |
| Minimal Env       | Validation scripts receive only essential + user vars |
| Process Isolation | Scripts run in child process with timeout             |
| Container         | Non-root execution, minimal base image                |

## Testing Architecture

### Test Pyramid

```
       ┌─────────────┐
       │    E2E      │  ← Docker-based workflow tests
       │   Tests     │
       ├─────────────┤
       │ Integration │  ← Docker runtime verification
       │   Tests     │
       ├─────────────┤
       │             │
       │    Unit     │  ← Module-level tests
       │   Tests     │
       └─────────────┘
```

### Coverage Requirements

| Metric     | Threshold |
| ---------- | --------- |
| Branches   | 75%       |
| Functions  | 80%       |
| Lines      | 80%       |
| Statements | 80%       |

### Test Locations

- **Unit Tests:** `src/*.spec.ts` (co-located with source)
- **Integration Tests:** `test/integration/docker.test.ts`
- **E2E Tests:** `test/e2e/workflow-runner.e2e-spec.ts`
- **Mocks:** `test/mocks/@opencode-ai/sdk.ts`

## Deployment Architecture

### Docker Image Layers

```dockerfile
# Stage 1: Builder
FROM debian:bookworm-slim AS builder
├── Node.js 20 (NodeSource)
├── Python 3.11
├── Java 21 (Adoptium Temurin)
└── OpenCode CLI

# Stage 2: Runtime
FROM debian:bookworm-slim AS runtime
├── Minimal runtime deps
├── Copy Node.js, Python, Java from builder
├── Copy application bundle
└── ENTRYPOINT ["/entrypoint.sh"]
```

### CI/CD Pipeline

**ci.yml (Push/PR):**

1. Checkout → Setup Node → Install deps
2. Lint → Format check → Type check
3. Unit tests → Bundle → Docker build
4. Docker runtime verification → Integration tests
5. Cleanup

**release.yml (Tags):**

1. Validate semver tag
2. Run quality gates (lint, typecheck, test)
3. Bundle → Create GitHub Release
4. Update major version tag (e.g., v1 → v1.2.0)

## Configuration

### Environment Variables

| Variable                   | Source | Purpose             |
| -------------------------- | ------ | ------------------- |
| GITHUB_WORKSPACE           | GitHub | Workspace root path |
| INPUT_WORKFLOW_PATH        | Action | Workflow file path  |
| INPUT_PROMPT               | Action | User prompt         |
| INPUT_ENV_VARS             | Action | JSON env vars       |
| INPUT_TIMEOUT_MINUTES      | Action | Execution timeout   |
| INPUT_VALIDATION_SCRIPT    | Action | Validation script   |
| INPUT_VALIDATION_MAX_RETRY | Action | Max retry attempts  |

### Build Configuration

- **TypeScript:** ES2022 target, NodeNext modules, strict mode
- **esbuild:** Node20 target, CJS format, bundled
- **Jest:** ts-jest preset, custom module mapping
