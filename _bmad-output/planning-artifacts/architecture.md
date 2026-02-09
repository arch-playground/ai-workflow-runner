---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-02-04'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/implementation-artifacts/tech-spec-opencode-sdk-runner.md'
  - '_bmad-output/implementation-artifacts/tech-spec-ai-workflow-runner-init.md'
  - 'docs/index.md'
  - 'docs/project-overview.md'
  - 'docs/architecture.md'
  - 'docs/source-tree-analysis.md'
  - 'docs/development-guide.md'
  - 'docs/api-contracts.md'
workflowType: 'architecture'
project_name: 'ai-workflow-runner'
user_name: 'TanNT'
date: '2026-02-04'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The PRD defines 38 functional requirements spanning six major capability areas:

| Area                     | FRs       | Architectural Implication                                           |
| ------------------------ | --------- | ------------------------------------------------------------------- |
| **Workflow Execution**   | FR1-FR7   | File I/O, input parsing, prompt composition                         |
| **Session Management**   | FR8-FR12  | OpenCode SDK integration, async event handling, idle detection      |
| **Output & Streaming**   | FR13-FR16 | Real-time console streaming, message accumulation, status reporting |
| **Validation & Retry**   | FR17-FR26 | Child process spawning, script execution, retry loop coordination   |
| **Security**             | FR27-FR30 | Path validation, secret masking, input sanitization                 |
| **Lifecycle Management** | FR31-FR38 | Signal handling, resource cleanup, graceful shutdown                |

**Non-Functional Requirements:**

| Category            | Key NFRs    | Target                                                                         |
| ------------------- | ----------- | ------------------------------------------------------------------------------ |
| **Performance**     | NFR1-NFR4   | Pre-built image pull <2min, startup <30s, streaming <1s latency, shutdown <10s |
| **Security**        | NFR5-NFR9   | Secret masking, path traversal prevention, temp file permissions (0o600)       |
| **Reliability**     | NFR10-NFR13 | 0% runner-caused failures, signal handling, 3 reconnection attempts            |
| **Integration**     | NFR14-NFR17 | ubuntu-latest compatibility, pinned SDK version, parseable outputs             |
| **Maintainability** | NFR18-NFR20 | 80% test coverage, Dependabot, TypeScript strict mode                          |

**Scale & Complexity:**

- Primary domain: **Developer Tool / CI-CD Infrastructure**
- Complexity level: **Medium**
- Project context: **Brownfield** (MVP implemented, formalizing for Phase 2)
- Estimated architectural components: **6 core modules** (index, runner, config, security, opencode, validation)

### Technical Constraints & Dependencies

| Constraint                | Source                  | Impact                                                     |
| ------------------------- | ----------------------- | ---------------------------------------------------------- |
| Docker container action   | GitHub Actions platform | Linux-only support, workspace mounted at /github/workspace |
| Multi-runtime requirement | PRD                     | ~800MB-1.1GB image size (Java JRE largest component)       |
| OpenCode SDK              | External dependency     | Event-driven architecture, async session management        |
| GitHub Actions limits     | Platform                | ~1MB output limit, 6-hour max timeout                      |
| Signal handling           | Docker/GitHub           | Must handle SIGTERM/SIGINT for graceful shutdown           |

**Key Dependencies:**

- `@opencode-ai/sdk@^1.1.28` - Core AI workflow execution
- `@actions/core@^1.10.1` - GitHub Actions toolkit
- Node.js 20+, Python 3.11, Java 21 - Runtime environment

### Cross-Cutting Concerns Identified

| Concern                | Affected Components                   | Architectural Decision Needed                       |
| ---------------------- | ------------------------------------- | --------------------------------------------------- |
| **Error Handling**     | All modules                           | Result pattern vs exceptions, error sanitization    |
| **Resource Cleanup**   | opencode.ts, validation.ts, index.ts  | AbortController coordination, dispose patterns      |
| **Secret Management**  | config.ts, security.ts, runner.ts     | Masking strategy, env var isolation                 |
| **Async Coordination** | opencode.ts, runner.ts                | Event loop management, callback tracking            |
| **Timeout Management** | runner.ts, validation.ts, opencode.ts | Layered timeouts (session, validation, interpreter) |
| **Logging**            | All modules                           | Prefix conventions, debug vs info levels            |

### Existing Implementation Patterns

The codebase already implements several patterns that should be maintained for consistency:

1. **Singleton Service Pattern** - OpenCodeService with lazy initialization
2. **Result Pattern** - RunnerResult for expected failure handling
3. **Event-Driven Architecture** - SDK event loop with callback maps
4. **Layered Validation** - Path validation → File validation → Content validation
5. **Graceful Degradation** - Retry mechanisms with clear failure attribution

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Established - MVP Complete):**
All critical decisions have been made and validated through implementation.

**Important Decisions (Documented Below):**
Patterns and approaches that shape the architecture.

**Deferred Decisions (Phase 2+):**

- Pre-built Docker image publishing to GHCR
- GitHub Marketplace listing (basic, free)
- Caching strategy for faster subsequent runs
- Parallel workflow execution architecture
- Workflow marketplace/registry integration
- Metrics/telemetry dashboard implementation

### Technology Stack

| Category            | Decision             | Version | Rationale                                         |
| ------------------- | -------------------- | ------- | ------------------------------------------------- |
| **Language**        | TypeScript           | 5.3+    | Type safety, strict mode for reliability          |
| **Runtime**         | Node.js              | 20+     | LTS, ES2022 support, GitHub Actions compatibility |
| **Bundler**         | esbuild              | 0.27+   | Fast builds, single-file output for Actions       |
| **Testing**         | Jest                 | 29.7+   | Established ecosystem, good TS support            |
| **Container Base**  | debian:bookworm-slim | -       | glibc compatibility, minimal footprint            |
| **AI SDK**          | @opencode-ai/sdk     | ^1.1.28 | Official OpenCode integration                     |
| **Actions Toolkit** | @actions/core        | ^1.10.1 | GitHub Actions native integration                 |

### Error Handling Strategy

**Decision:** Hybrid approach with clear boundaries

| Error Type              | Pattern                                | Location                 |
| ----------------------- | -------------------------------------- | ------------------------ |
| **Expected failures**   | Result Pattern (`RunnerResult`)        | runner.ts, validation.ts |
| **Validation errors**   | Early return with error message        | config.ts, security.ts   |
| **SDK errors**          | Catch, wrap, and propagate             | opencode.ts              |
| **Unexpected failures** | Throw exceptions (caught at top level) | index.ts                 |
| **User-facing errors**  | Sanitized via `sanitizeErrorMessage()` | All modules              |

**Rationale:** Expected failures (file not found, validation fails) use Result pattern for explicit handling. Unexpected failures throw to be caught at entry point with proper cleanup.

### Resource Management

**Decision:** Coordinated cleanup via AbortController hierarchy

```
shutdownController (index.ts)
    └── Propagates to runWorkflow()
        └── Propagates to OpenCodeService
            └── Propagates to validation scripts
```

| Resource             | Cleanup Mechanism                |
| -------------------- | -------------------------------- |
| OpenCode SDK server  | `dispose()` method, idempotent   |
| Event loop           | AbortController signal           |
| Session callbacks    | Reject pending, remove listeners |
| Validation processes | SIGTERM → SIGKILL escalation     |
| Temp files           | Finally block cleanup            |

### Module Architecture

**Decision:** Flat module structure with clear responsibilities

| Module          | Responsibility                                   | Dependencies                           |
| --------------- | ------------------------------------------------ | -------------------------------------- |
| `index.ts`      | Entry point, signal handling, orchestration      | All modules                            |
| `runner.ts`     | Workflow execution, validation loop, list models | opencode, validation, config, security |
| `config.ts`     | Input parsing, validation                        | types, security                        |
| `security.ts`   | Path validation, secret masking                  | @actions/core                          |
| `opencode.ts`   | SDK integration, session management, config load | @opencode-ai/sdk, types                |
| `validation.ts` | Script execution engine                          | security, types                        |
| `types.ts`      | Type definitions, constants                      | None                                   |

**Rationale:** Flat structure preferred over deep nesting for a tool of this size. Each module has single responsibility. Circular dependencies avoided via careful import ordering.

### Async Coordination

**Decision:** Event-driven with callback maps and per-session state

| Pattern                  | Implementation                           | Purpose                           |
| ------------------------ | ---------------------------------------- | --------------------------------- |
| **Session tracking**     | `Map<sessionId, callbacks>`              | Track pending session completions |
| **Message accumulation** | `Map<sessionId, messageState>`           | Per-session message buffers       |
| **Idle detection**       | Event subscription + callback resolution | Detect workflow completion        |
| **Reconnection**         | 3 attempts with 1s delay                 | Handle transient errors           |

### Timeout Architecture

**Decision:** Layered timeouts with clear hierarchy

| Layer                  | Timeout          | Default | Purpose                 |
| ---------------------- | ---------------- | ------- | ----------------------- |
| **Workflow**           | Configurable     | 30 min  | Overall execution limit |
| **Session idle**       | Same as workflow | -       | SDK session completion  |
| **Validation script**  | Fixed            | 60s     | Prevent hung scripts    |
| **Interpreter check**  | Fixed            | 5s      | Detect missing runtime  |
| **SIGKILL escalation** | Fixed            | 5s      | Force kill hung process |

### Security Architecture

**Decision:** Defense in depth with multiple validation layers

| Layer               | Control                | Implementation                          |
| ------------------- | ---------------------- | --------------------------------------- |
| **Input**           | Size limits            | `INPUT_LIMITS` constants                |
| **Path**            | Traversal prevention   | `validateWorkspacePath()`               |
| **Symlink**         | Escape detection       | `validateRealPath()`                    |
| **Env vars**        | Blocklist + masking    | Reserved var check, `core.setSecret()`  |
| **Temp files**      | Restricted permissions | `0o600` mode                            |
| **Output**          | Sanitization           | `sanitizeErrorMessage()`                |
| **Child processes** | Isolated env           | Pass env only to child, not process.env |

### Logging Strategy

**Decision:** Prefixed logging with level separation

| Prefix         | Source            | Level                           |
| -------------- | ----------------- | ------------------------------- |
| `[OpenCode]`   | SDK operations    | info (streaming), debug (URLs)  |
| `[Validation]` | Script execution  | info (status), warning (issues) |
| None           | Runner operations | info                            |

**Rules:**

- Never log secrets (all env_vars masked before any logging)
- Server URLs at debug level only
- Truncation always logged as warning

### Configuration Strategy

**Decision:** GitHub Action inputs with optional config file passthrough

| Source                | Support | Notes                                          |
| --------------------- | ------- | ---------------------------------------------- |
| Action inputs         | Yes     | Primary configuration method                   |
| OpenCode config files | Yes     | Passed through to SDK (config.json, auth.json) |
| Model override        | Yes     | Action input overrides config file default     |
| Environment variables | Partial | GITHUB_WORKSPACE, standard GH vars             |

**Config File Flow:**

1. User stores config in GitHub Variables (`vars.OPENCODE_CONFIG`)
2. User stores auth in GitHub Secrets (`secrets.OPENCODE_AUTH`)
3. Workflow step writes files to disk before action runs
4. Action reads files and passes to OpenCode SDK
5. SDK handles all provider-specific logic

**Security Model:**

- Auth files contain secrets → stored in GitHub Secrets
- Config files are non-sensitive → stored in GitHub Variables
- Files written with 0o600 permissions
- Files cleaned up after workflow completes

### Phase 2 Considerations

| Feature                    | Architectural Impact                     | Approach                                                                                                                                                           |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pre-built Docker image** | CI workflow change, `action.yml` update  | Add Docker build+push job to existing `release.yml`; change `action.yml` from `image: 'Dockerfile'` to `docker://ghcr.io/arch-playground/ai-workflow-runner:<tag>` |
| **GitHub Marketplace**     | Metadata in `action.yml`, branding       | Already has `branding` section; ensure Marketplace requirements met (README, license, tags)                                                                        |
| **Caching**                | New module, storage abstraction          | Add `cache.ts` module                                                                                                                                              |
| **Parallel execution**     | Multi-session support in OpenCodeService | Existing per-session state supports this                                                                                                                           |
| **Workflow registry**      | External integration, new inputs         | Add optional `registry_url` input                                                                                                                                  |
| **Metrics**                | New module, optional telemetry           | Add `metrics.ts` module, opt-in                                                                                                                                    |

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 12 areas where AI agents could make inconsistent choices

These patterns ensure all AI agents write compatible, consistent code.

### Naming Patterns

**File Naming Conventions:**

| Type              | Convention               | Example                        |
| ----------------- | ------------------------ | ------------------------------ |
| Source files      | `kebab-case.ts`          | `opencode.ts`, `validation.ts` |
| Unit tests        | `*.spec.ts` (co-located) | `config.spec.ts`               |
| Integration tests | `*.test.ts`              | `docker.test.ts`               |
| E2E tests         | `*.e2e-spec.ts`          | `workflow-runner.e2e-spec.ts`  |
| Type definitions  | `types.ts` (single file) | `src/types.ts`                 |

**Code Naming Conventions:**

| Element        | Convention                  | Example                                    |
| -------------- | --------------------------- | ------------------------------------------ |
| Functions      | `camelCase`                 | `runWorkflow()`, `validateWorkspacePath()` |
| Classes        | `PascalCase`                | `OpenCodeService`                          |
| Interfaces     | `PascalCase`                | `ActionInputs`, `RunnerResult`             |
| Type aliases   | `PascalCase`                | `ValidationScriptType`                     |
| Constants      | `UPPER_SNAKE_CASE`          | `INPUT_LIMITS`, `MAX_TIMEOUT_MINUTES`      |
| Private fields | `camelCase` (no underscore) | `private client`, `private isInitialized`  |
| Parameters     | `camelCase`                 | `sessionId`, `timeoutMs`                   |

**Logging Prefix Conventions:**

| Module       | Prefix         | Example                             |
| ------------ | -------------- | ----------------------------------- |
| OpenCode SDK | `[OpenCode]`   | `[OpenCode] Session created: ${id}` |
| Validation   | `[Validation]` | `[Validation] Attempt 1/5`          |
| Shutdown     | `[Shutdown]`   | `[Shutdown] Failed to dispose`      |
| General      | None           | `Executing workflow: ${path}`       |

### Structure Patterns

**Import Order (Enforced):**

```typescript
// 1. Node.js built-in modules
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// 2. External packages (alphabetical)
import * as core from '@actions/core';
import { createOpencode } from '@opencode-ai/sdk';

// 3. Local modules (with .js extension for ESM)
import { ActionInputs, RunnerResult } from './types.js';
import { validateWorkspacePath } from './security.js';
```

**Module Export Pattern:**

```typescript
// Named exports preferred over default exports
export function runWorkflow(...): Promise<RunnerResult> { }
export class OpenCodeService { }
export interface ActionInputs { }

// Singleton getters exported from owning module
export function getOpenCodeService(): OpenCodeService { }
export function hasOpenCodeServiceInstance(): boolean { }
```

**Test Organization:**

| Test Type         | Location             | Naming                   |
| ----------------- | -------------------- | ------------------------ |
| Unit tests        | `src/*.spec.ts`      | Co-located with source   |
| Integration tests | `test/integration/`  | `*.test.ts`              |
| E2E tests         | `test/e2e/`          | `*.e2e-spec.ts`          |
| Test fixtures     | `test/e2e-fixtures/` | Descriptive names        |
| Mocks             | `test/mocks/`        | Mirror package structure |

### Format Patterns

**Result Object Format:**

```typescript
// Success result
{
  success: true,
  output: JSON.stringify({ sessionId, lastMessage }),
}

// Failure result
{
  success: false,
  output: '',
  error: 'Human-readable error message',
}
```

**GitHub Action Output Format:**

```typescript
// Status output: one of these strings
type ActionStatus = 'success' | 'failure' | 'cancelled' | 'timeout';

// Result output: JSON string
{
  sessionId: string;
  lastMessage: string;
}
// Or on error:
{
  error: string;
}
// Or on cancel:
{
  cancelled: true;
}
```

**Error Message Format:**

```typescript
// User-facing errors: clear, actionable
'Workflow file not found: ${inputs.workflowPath}';
'validation_script_type must be "python" or "javascript"';

// Internal errors: technical but informative
'OpenCode client not initialized';
'Session ${sessionId} timed out after ${timeoutMs}ms';
```

### Communication Patterns

**Async Function Signatures:**

```typescript
// Always return Promise for async operations
async function runWorkflow(
  inputs: ActionInputs,
  timeoutMs?: number,
  abortSignal?: AbortSignal
): Promise<RunnerResult>;

// AbortSignal always optional, always last parameter
async function runSession(
  prompt: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<OpenCodeSession>;
```

**Callback Map Pattern (for SDK events):**

```typescript
// Store both resolve and reject for proper cleanup
private callbacks: Map<string, {
  resolve: () => void;
  reject: (err: Error) => void;
  cleanup?: () => void;  // Optional cleanup function
}> = new Map();

// Always clean up on resolve, reject, or dispose
```

**Event Handling Pattern:**

```typescript
// Type-guard event properties
if (!event || typeof event !== 'object' || !('type' in event)) return;
const e = event as { type: string; properties?: Record<string, unknown> };

// Handle events by type with null checks
if (e.type === 'session.idle') {
  const sessionId = (e.properties as { sessionID?: string })?.sessionID;
  if (sessionId) {
    /* handle */
  }
}
```

### Process Patterns

**Error Handling Flow:**

```typescript
// 1. Validate inputs early, return Result for expected failures
if (!inputs.workflowPath) {
  return { success: false, output: '', error: 'workflow_path required' };
}

// 2. Wrap risky operations in try-catch
try {
  const result = await riskyOperation();
} catch (error) {
  // 3. For expected errors, return Result
  if (error instanceof ValidationError) {
    return { success: false, output: '', error: error.message };
  }
  // 4. For unexpected errors, rethrow (caught at top level)
  throw error;
}

// 5. Sanitize errors before user output
const message = error instanceof Error ? sanitizeErrorMessage(error) : 'An unknown error occurred';
```

**Resource Cleanup Pattern:**

```typescript
// Always use try-finally for cleanup
let tempFile: string | null = null;
try {
  tempFile = createTempFile();
  // ... use tempFile ...
} finally {
  if (tempFile && fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
}

// Make dispose() idempotent
async dispose(): Promise<void> {
  if (this.isDisposed) return;  // Already disposed
  this.isDisposed = true;
  // ... cleanup ...
}
```

**Timeout Pattern:**

```typescript
// Always clean up timeouts
const timeoutId = setTimeout(() => {
  /* timeout logic */
}, timeoutMs);
try {
  await operation();
} finally {
  clearTimeout(timeoutId); // Always clear, even on success
}
```

**Child Process Pattern:**

```typescript
// Use spawn with explicit stdio
const child = spawn(command, [scriptPath], {
  env: childEnv, // Pass env to child only, don't modify process.env
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Always handle both 'close' and 'error' events
child.on('close', (code) => {
  /* handle exit */
});
child.on('error', (err) => {
  /* handle spawn failure */
});

// Implement SIGTERM → SIGKILL escalation for hung processes
child.kill('SIGTERM');
setTimeout(() => {
  if (!processExited) child.kill('SIGKILL');
}, 5000);
```

### Enforcement Guidelines

**All AI Agents MUST:**

1. Follow naming conventions exactly (case sensitivity matters)
2. Use `.js` extensions in imports (ESM requirement)
3. Co-locate unit tests with source files as `*.spec.ts`
4. Return `RunnerResult` for expected failures, throw for unexpected
5. Pass `AbortSignal` through the call chain for cancellation
6. Clean up timeouts in `finally` blocks
7. Make `dispose()` methods idempotent
8. Sanitize error messages before user output
9. Mask secrets before any logging
10. Use `core.info()` for user-visible logs, `core.debug()` for internal details

**Pattern Verification:**

- ESLint enforces naming conventions
- TypeScript strict mode catches type issues
- Jest coverage threshold enforces test co-location
- PR review checks pattern compliance

### Pattern Examples

**Good Example - Async with Cleanup:**

```typescript
async function executeWithTimeout(
  operation: () => Promise<void>,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<void> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    await operation();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Anti-Pattern - Missing Cleanup:**

```typescript
// BAD: Timeout not cleared on success
async function badExample(timeoutMs: number): Promise<void> {
  const timeoutId = setTimeout(() => {
    throw new Error('timeout');
  }, timeoutMs);
  await operation();
  // Missing: clearTimeout(timeoutId);
}
```

**Good Example - Result Pattern:**

```typescript
// Expected failure returns Result
if (!fs.existsSync(filePath)) {
  return {
    success: false,
    output: '',
    error: `File not found: ${path.basename(filePath)}`,
  };
}
```

**Anti-Pattern - Throwing Expected Errors:**

```typescript
// BAD: Throwing for expected condition
if (!fs.existsSync(filePath)) {
  throw new Error(`File not found: ${filePath}`); // Should return Result
}
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
ai-workflow-runner/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Build, lint, test on PR/push
│   │   ├── release.yml               # Semver release + Docker image publish to GHCR
│   │   └── test-action.yml           # E2E action testing
│   └── dependabot.yml                # Automated dependency updates
│
├── .husky/
│   └── pre-commit                    # lint-staged hook
│
├── src/                              # SOURCE CODE
│   ├── index.ts                      # Entry point, signal handling
│   ├── runner.ts                     # Workflow execution engine
│   ├── config.ts                     # Input parsing, validation
│   ├── security.ts                   # Path validation, secret masking
│   ├── opencode.ts                   # OpenCode SDK service
│   ├── validation.ts                 # Script execution engine
│   ├── types.ts                      # Type definitions, constants
│   ├── index.spec.ts                 # Unit tests (co-located)
│   ├── runner.spec.ts
│   ├── config.spec.ts
│   ├── security.spec.ts
│   ├── opencode.spec.ts
│   └── validation.spec.ts
│
├── test/                             # TEST INFRASTRUCTURE
│   ├── mocks/
│   │   └── @opencode-ai/
│   │       └── sdk.ts                # SDK mock
│   ├── integration/
│   │   └── docker.test.ts            # Container verification
│   ├── e2e/
│   │   └── workflow-runner.e2e-spec.ts
│   └── e2e-fixtures/
│       ├── test-workflow.md
│       ├── simple-workflow.md
│       ├── validate.py
│       └── validate.js
│
├── dist/                             # BUILD OUTPUT (committed)
│   ├── index.js                      # Bundled application
│   └── index.js.map                  # Source map
│
├── docs/                             # DOCUMENTATION
│   ├── index.md
│   ├── project-overview.md
│   ├── architecture.md
│   ├── source-tree-analysis.md
│   ├── development-guide.md
│   └── api-contracts.md
│
├── examples/                         # EXAMPLE WORKFLOWS
│   ├── basic-workflow/
│   │   ├── README.md                 # Setup guide
│   │   ├── workflow.md               # AI workflow file
│   │   └── .github/workflows/
│   │       └── run-ai.yml            # GitHub Action example
│   ├── with-validation/
│   │   ├── README.md
│   │   ├── workflow.md
│   │   ├── validate.py
│   │   └── .github/workflows/
│   │       └── run-ai.yml
│   ├── github-copilot/
│   │   ├── README.md                 # Copilot-specific setup
│   │   ├── workflow.md
│   │   └── .github/workflows/
│   │       └── run-ai.yml
│   └── custom-model/
│       ├── README.md                 # Model selection guide
│       ├── workflow.md
│       └── .github/workflows/
│           └── run-ai.yml
│
├── action.yml                        # GitHub Action definition
├── Dockerfile                        # Multi-runtime container
├── entrypoint.sh                     # Signal forwarding script
│
├── package.json
├── package-lock.json
├── tsconfig.json                     # TypeScript (build)
├── tsconfig.test.json                # TypeScript (tests)
├── jest.config.js
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .dockerignore
│
├── README.md
├── AGENTS.md
├── CLAUDE.md -> AGENTS.md
└── LICENSE
```

### Architectural Boundaries

**Module Dependency Graph:**

```
┌─────────────────────────────────────────────────────────────┐
│                        index.ts                              │
│              (entry, orchestration, signals)                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                        runner.ts                             │
│              (workflow execution, validation loop)           │
└───────┬─────────────────┬─────────────────┬─────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  opencode.ts  │ │ validation.ts │ │   config.ts   │
│  (SDK service)│ │(script exec)  │ │(input parsing)│
└───────────────┘ └───────┬───────┘ └───────┬───────┘
                          │                 │
                          ▼                 ▼
                  ┌───────────────┐ ┌───────────────┐
                  │  security.ts  │ │   types.ts    │
                  │(path, secrets)│ │(definitions)  │
                  └───────────────┘ └───────────────┘
```

### Requirements to Structure Mapping

| Functional Area                    | Primary Files                | Test Files                             |
| ---------------------------------- | ---------------------------- | -------------------------------------- |
| **Workflow Execution (FR1-FR7)**   | `runner.ts`, `config.ts`     | `runner.spec.ts`, `config.spec.ts`     |
| **Session Management (FR8-FR12)**  | `opencode.ts`                | `opencode.spec.ts`                     |
| **Output Streaming (FR13-FR16)**   | `opencode.ts`                | `opencode.spec.ts`                     |
| **Validation & Retry (FR17-FR26)** | `validation.ts`, `runner.ts` | `validation.spec.ts`, `runner.spec.ts` |
| **Security (FR27-FR30)**           | `security.ts`, `config.ts`   | `security.spec.ts`, `config.spec.ts`   |
| **Lifecycle (FR31-FR38)**          | `index.ts`, `opencode.ts`    | `index.spec.ts`, `opencode.spec.ts`    |
| **Configuration (FR39-FR44)**      | `config.ts`, `opencode.ts`   | `config.spec.ts`, `opencode.spec.ts`   |
| **Distribution (FR45-FR49)**       | `action.yml`, `release.yml`  | N/A (CI workflow, no app code)         |

### External Integration Boundaries

| Boundary           | Direction     | Interface                              | Location                          |
| ------------------ | ------------- | -------------------------------------- | --------------------------------- |
| GitHub Actions     | Input         | Action inputs, env vars                | `action.yml`, `config.ts`         |
| GitHub Actions     | Output        | `core.setOutput()`, `core.setFailed()` | `index.ts`                        |
| GitHub Marketplace | Output        | Marketplace listing metadata           | `action.yml` (branding, metadata) |
| GHCR               | Output        | Docker image publish                   | `release.yml`                     |
| OpenCode SDK       | Bidirectional | `@opencode-ai/sdk` client              | `opencode.ts`                     |
| Validation Scripts | Output        | `child_process.spawn()`                | `validation.ts`                   |
| Filesystem         | Input         | Workflow file, validation scripts      | `runner.ts`, `validation.ts`      |
| Filesystem         | Output        | Temp files (cleaned up)                | `validation.ts`                   |

### Data Flow

```
GitHub Actions Inputs
        │
        ▼
┌───────────────┐
│   config.ts   │ ──→ ActionInputs
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   runner.ts   │ ──→ Reads workflow file
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  opencode.ts  │ ◀──▶ OpenCode SDK (bidirectional events)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ validation.ts │ ──→ Spawns child process
└───────┬───────┘
        │
        ▼
   RunnerResult
        │
        ▼
GitHub Actions Outputs
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices work together without conflicts:

- TypeScript 5.3+ compiles to ES2022 for Node.js 20+
- esbuild bundles TypeScript with source maps
- Jest 29.7+ with ts-jest provides TypeScript testing
- @opencode-ai/sdk is TypeScript-native
- All dependency versions are compatible

**Pattern Consistency:**
Implementation patterns align with technology choices:

- Naming conventions follow TypeScript community standards
- Import patterns use ESM with `.js` extensions (NodeNext requirement)
- Result pattern is idiomatic for TypeScript error handling
- Async patterns use standard Promise/AbortController APIs

**Structure Alignment:**
Project structure supports all architectural decisions:

- Flat module structure enables clear dependency management
- Co-located tests follow Jest best practices
- Build output in `dist/` meets GitHub Actions requirements
- Module boundaries prevent circular dependencies

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (38/38):**

| FR Range                         | Count | Status | Architectural Support                         |
| -------------------------------- | ----- | ------ | --------------------------------------------- |
| FR1-FR7 (Workflow Execution)     | 7     | ✅     | `runner.ts`, `config.ts`                      |
| FR8-FR12 (Session Management)    | 5     | ✅     | `opencode.ts`                                 |
| FR13-FR16 (Output & Streaming)   | 4     | ✅     | `opencode.ts` event handling                  |
| FR17-FR26 (Validation & Retry)   | 10    | ✅     | `validation.ts`, `runner.ts`                  |
| FR27-FR30 (Security)             | 4     | ✅     | `security.ts`, `config.ts`                    |
| FR31-FR38 (Lifecycle Management) | 8     | ✅     | `index.ts`, `opencode.ts`                     |
| FR39-FR44 (Configuration)        | 6     | ✅     | `config.ts`, `opencode.ts`                    |
| FR45-FR49 (Distribution)         | 5     | 🔲     | `.github/workflows/release.yml`, `action.yml` |

**Non-Functional Requirements Coverage (20/20):**

| NFR Category               | Count | Status | Architectural Support                    |
| -------------------------- | ----- | ------ | ---------------------------------------- |
| Performance (NFR1-4)       | 4     | ✅     | Timeout architecture, streaming patterns |
| Security (NFR5-9)          | 5     | ✅     | Defense in depth, security module        |
| Reliability (NFR10-13)     | 4     | ✅     | Resource management, reconnection        |
| Integration (NFR14-17)     | 4     | ✅     | GitHub Actions boundaries                |
| Maintainability (NFR18-20) | 3     | ✅     | Test patterns, strict mode               |

### Implementation Readiness Validation ✅

**Decision Completeness:**

- All technology choices documented with specific versions
- Implementation patterns include executable code examples
- Consistency rules enforceable via ESLint and TypeScript
- Good examples and anti-patterns provided for clarity

**Structure Completeness:**

- All 7 source modules defined with responsibilities
- Test organization fully specified
- Build and deployment structure documented
- External integration boundaries mapped

**Pattern Completeness:**

- 12 potential conflict points identified and resolved
- Naming conventions cover all code elements
- Async coordination patterns fully specified
- Error handling flow documented with examples

### Gap Analysis Results

**Critical Gaps:** None

- All implementation-blocking decisions are documented
- MVP is already implemented and validated

**Important Gaps:** None

- Brownfield project has proven patterns through implementation

**Phase 2 Considerations (Documented, Not Blocking):**

- Config file support (`.ai-workflow-runner.yml`)
- Metrics/telemetry module
- Caching module for faster subsequent runs
- Parallel workflow execution

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium)
- [x] Technical constraints identified (Docker, GitHub Actions, SDK)
- [x] Cross-cutting concerns mapped (6 concerns)

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (7 technologies)
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**

- [x] Naming conventions established (7 categories)
- [x] Structure patterns defined (imports, exports, tests)
- [x] Communication patterns specified (async, events)
- [x] Process patterns documented (errors, cleanup, timeouts)

**✅ Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established (6 modules)
- [x] Integration points mapped (5 external boundaries)
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

- Brownfield project with validated MVP
- Patterns proven through implementation
- Comprehensive documentation for AI agents

**Key Strengths:**

1. Clear module boundaries with single responsibilities
2. Comprehensive error handling strategy
3. Robust resource cleanup patterns
4. Well-documented async coordination
5. Defense-in-depth security architecture

**Areas for Future Enhancement (Phase 2+):**

1. Pre-built Docker image on GHCR (eliminates per-run build for consumers)
2. GitHub Marketplace listing (basic, free — discoverability)
3. Configuration file support for complex setups
4. Metrics and telemetry for observability
5. Caching for performance optimization
6. Parallel execution for throughput

### Implementation Handoff

**AI Agent Guidelines:**

1. Follow all architectural decisions exactly as documented
2. Use implementation patterns consistently across all components
3. Respect project structure and module boundaries
4. Refer to this document for all architectural questions
5. Maintain the existing patterns when adding new features

**Quality Gates:**

- `npm run lint` - ESLint enforcement
- `npm run typecheck` - TypeScript strict mode
- `npm run test:unit` - 80% coverage threshold
- `npm run format` - Prettier formatting
