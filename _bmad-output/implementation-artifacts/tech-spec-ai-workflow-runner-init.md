---
title: 'AI Workflow Runner GitHub Action - Project Initialization'
slug: 'ai-workflow-runner-init'
created: '2026-01-30'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - TypeScript
  - Docker (debian:bookworm-slim)
  - GitHub Actions Toolkit (@actions/core@1.10.x, @actions/exec@1.1.x, @actions/io@1.1.x)
  - Node.js 20.x (pinned)
  - Python 3.11
  - Java 21 JRE (headless)
  - Jest (testing)
  - '@vercel/ncc (bundling)'
  - husky + lint-staged (pre-commit hooks)
files_to_modify:
  - src/index.ts (create - main entry point)
  - src/runner.ts (create - workflow runner stub)
  - src/config.ts (create - input parsing with validation)
  - src/security.ts (create - path sanitization, input validation)
  - src/types.ts (create - TypeScript types)
  - action.yml (create - action metadata)
  - Dockerfile (create - multi-runtime container)
  - .dockerignore (create - exclude unnecessary files)
  - entrypoint.sh (create - shell wrapper with signal handling)
  - package.json (create - dependencies with pinned versions)
  - package-lock.json (create - lockfile for reproducible builds)
  - tsconfig.json (create - TypeScript config)
  - .eslintrc.json (create - ESLint config)
  - .prettierrc (create - Prettier config)
  - .gitignore (create - git ignore)
  - .github/workflows/ci.yml (create - CI pipeline with caching)
  - .github/workflows/release.yml (create - release automation with concurrency control)
  - .github/workflows/test-action.yml (create - E2E tests with matrix)
  - .github/dependabot.yml (create - automated dependency updates)
  - __tests__/unit/config.test.ts (create - unit tests)
  - __tests__/unit/security.test.ts (create - security validation tests)
  - __tests__/unit/runner.test.ts (create - unit tests)
  - __tests__/integration/docker.test.ts (create - integration tests)
  - README.md (create - documentation)
  - LICENSE (create - MIT license)
code_patterns:
  - Docker container action with shell entrypoint and signal handling
  - Workspace mounted at /github/workspace
  - Semantic versioning with major tag updates (v1 → v1.x.x) and concurrency control
  - Single-stage Dockerfile with consolidated apt-get (all runtimes needed in final image)
  - '@vercel/ncc for bundling TypeScript to single file'
  - Path traversal prevention via realpath validation
  - Secret masking for all env_vars values
  - Input size limits and sanitization
test_patterns:
  - Jest for unit testing with meaningful coverage on validation logic
  - Docker build/run for integration testing with cleanup
  - Workflow file execution for E2E testing with failure matrix
  - Test action using ./ reference in workflows
---

# Tech-Spec: AI Workflow Runner GitHub Action - Project Initialization

**Created:** 2026-01-30

## Overview

### Problem Statement

There's no easy way to run agentic AI workflows (like document-repo workflow powered by OpenCode SDK) in GitHub Actions. Users need a reusable, containerized GitHub Action that can execute markdown-based workflow definitions with multi-runtime support (Node.js, Python, Java).

### Solution

Create a TypeScript-based GitHub Action that:

1. Runs in a Docker container with Node.js 20+, Python 3.11, and Java 21 pre-installed
2. Accepts workflow file path, environment variables, and input prompt as inputs
3. Mounts the caller's workspace into the container
4. Will integrate with OpenCode SDK (`@opencode-ai/plugin`) for workflow execution (future ticket)
5. Publishes to GitHub Marketplace with semantic versioning

### Scope

**In Scope:**

- TypeScript project initialization with proper structure for GitHub Actions
- Docker container setup with multi-runtime environment (Node.js 20+, Python 3.11, Java 21)
- `action.yml` definition with inputs (workflow_path, env_vars, prompt)
- Workspace mounting configuration
- Security hardening (path validation, secret masking, input sanitization)
- CI/CD pipeline for:
  - Build & test on PR/push
  - Release automation with semantic versioning (v1, v1.0.0)
  - Concurrency control for releases
  - GitHub Marketplace publishing
- Unit tests, integration tests, E2E tests infrastructure
- Stub implementation for workflow runner (actual OpenCode integration is separate)

**Out of Scope:**

- OpenCode SDK integration (separate ticket)
- Actual workflow execution logic
- Workflow file parsing/validation logic

### Platform Support

**Supported:**

- Linux-based GitHub Actions runners (ubuntu-latest, ubuntu-22.04, etc.)
- Self-hosted Linux runners with Docker

**Not Supported:**

- Windows runners (Docker container actions run Linux containers)
- macOS runners (Docker container actions not supported)

## Context for Development

### Codebase Patterns

**Project Structure:**

```
ai-workflow-runner/
├── src/
│   ├── index.ts              # Main entry point
│   ├── runner.ts             # Workflow runner (stub)
│   ├── config.ts             # Input parsing and validation
│   ├── security.ts           # Path sanitization, secret masking
│   └── types.ts              # TypeScript types
├── dist/                     # Compiled output (committed to git)
├── __tests__/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Docker tests
│   └── e2e/                  # Workflow tests
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # Build, lint, test on PR
│   │   ├── release.yml       # Semantic release + marketplace
│   │   └── test-action.yml   # E2E test using ./
│   └── dependabot.yml        # Automated dependency updates
├── action.yml                # Docker container action config
├── Dockerfile                # Multi-runtime container
├── .dockerignore             # Exclude files from Docker build
├── entrypoint.sh             # Shell wrapper with signal handling
├── package.json
├── package-lock.json         # Lockfile for reproducible builds
├── tsconfig.json
└── README.md
```

**Key Patterns:**

- Docker action requires shell entrypoint for signal handling
- Workspace auto-mounted at `/github/workspace` (via `GITHUB_WORKSPACE` env var)
- Use `@vercel/ncc` to bundle TypeScript into single dist/index.js
- Commit dist/ to git (required for GitHub Actions)
- All env_vars values masked as secrets before any logging
- Path traversal prevention via realpath validation

### Files to Reference

| File                            | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `action.yml`                    | Action metadata, inputs/outputs, Docker configuration       |
| `Dockerfile`                    | Multi-runtime container (Node 20, Python 3.11, Java 21 JRE) |
| `entrypoint.sh`                 | Shell wrapper with SIGTERM/SIGINT handling                  |
| `src/index.ts`                  | Main entry, reads env vars, calls runner                    |
| `src/config.ts`                 | Parse and validate action inputs with size limits           |
| `src/security.ts`               | Path sanitization, secret masking utilities                 |
| `src/runner.ts`                 | Stub for workflow execution (OpenCode integration later)    |
| `.github/workflows/release.yml` | Semantic versioning with concurrency control                |

### Technical Decisions

| Decision            | Choice                    | Rationale                                                 |
| ------------------- | ------------------------- | --------------------------------------------------------- |
| **Action Type**     | Docker container          | Required for multi-runtime (Node+Python+Java)             |
| **Base Image**      | `debian:bookworm-slim`    | glibc compatibility for all runtimes, ~80MB base          |
| **Java Version**    | JRE 21 headless (not JDK) | Saves ~400MB, JDK not needed for execution                |
| **Node.js Install** | Official Debian package   | Avoids piping scripts from NodeSource (supply chain risk) |
| **Bundler**         | `@vercel/ncc`             | Single-file output, includes dependencies                 |
| **Test Framework**  | Jest                      | Industry standard, good TypeScript support                |
| **Versioning**      | Semantic + major tags     | `v1.2.3` release updates `v1` tag with concurrency lock   |
| **Entrypoint**      | Shell script with trap    | Graceful shutdown on SIGTERM/SIGINT                       |
| **Secret Handling** | Mask all env_vars         | Prevent accidental exposure in logs                       |

**Expected Docker Image Size:** ~800MB - 1.1GB (Java JRE is the largest component)

**Expected Memory Usage:** ~512MB baseline, up to 2GB with Java workloads

## Implementation Plan

### Tasks

#### Phase 1: Project Foundation

- [ ] **Task 1: Initialize Node.js project with TypeScript**
  - File: `package.json`
  - Action: Create package.json with pinned dependency versions
  - Dependencies (exact versions):
    - `@actions/core`: `^1.10.1`
    - `@actions/exec`: `^1.1.1`
    - `@actions/io`: `^1.1.3`
  - DevDependencies (exact versions):
    - `typescript`: `^5.3.0`
    - `@vercel/ncc`: `^0.38.0`
    - `jest`: `^29.7.0`
    - `ts-jest`: `^29.1.0`
    - `@types/node`: `^20.10.0`
    - `@types/jest`: `^29.5.0`
    - `eslint`: `^8.55.0`
    - `@typescript-eslint/eslint-plugin`: `^6.13.0`
    - `@typescript-eslint/parser`: `^6.13.0`
    - `prettier`: `^3.1.0`
    - `eslint-config-prettier`: `^9.1.0`
    - `husky`: `^8.0.0`
    - `lint-staged`: `^15.2.0`
  - Scripts required:
    - `build`: `tsc`
    - `bundle`: `ncc build src/index.ts -o dist --source-map`
    - `test`: `jest --coverage`
    - `test:unit`: `jest --testPathPattern=unit --coverage`
    - `test:integration`: `jest --testPathPattern=integration --runInBand`
    - `lint`: `eslint src __tests__ --max-warnings 0`
    - `format`: `prettier --write src __tests__`
    - `format:check`: `prettier --check src __tests__`
    - `typecheck`: `tsc --noEmit`
    - `prepare`: `husky install`

- [ ] **Task 2: Configure TypeScript**
  - File: `tsconfig.json`
  - Action: Create complete tsconfig.json:
    ```json
    {
      "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "lib": ["ES2022"],
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "noUncheckedIndexedAccess": true
      },
      "include": ["src/**/*"],
      "exclude": ["node_modules", "dist", "__tests__", "coverage"]
    }
    ```

- [ ] **Task 3: Configure ESLint and Prettier**
  - Files: `.eslintrc.json`, `.prettierrc`, `.eslintignore`, `.prettierignore`
  - Action: Create configs with lint-staged integration
  - `.eslintrc.json`:
    ```json
    {
      "root": true,
      "parser": "@typescript-eslint/parser",
      "plugins": ["@typescript-eslint"],
      "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "prettier"
      ],
      "parserOptions": {
        "project": "./tsconfig.json"
      },
      "rules": {
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        "@typescript-eslint/explicit-function-return-type": "error",
        "no-console": "error"
      }
    }
    ```
  - Add to package.json:
    ```json
    "lint-staged": {
      "*.{ts,js}": ["eslint --fix", "prettier --write"],
      "*.{json,md,yml,yaml}": ["prettier --write"]
    }
    ```

- [ ] **Task 4: Create .gitignore and .dockerignore**
  - File: `.gitignore`
  - Action: Add node_modules, coverage, .env, \*.log
  - Note: Do NOT ignore `dist/` - must be committed for GitHub Actions
  - File: `.dockerignore`
  - Action: Create to exclude unnecessary files from Docker build:
    ```
    node_modules
    coverage
    .git
    .github
    __tests__
    *.md
    *.log
    .env*
    .eslint*
    .prettier*
    tsconfig.json
    jest.config.js
    .husky
    ```

- [ ] **Task 5: Configure Dependabot**
  - File: `.github/dependabot.yml`
  - Action: Create automated dependency update config:
    ```yaml
    version: 2
    updates:
      - package-ecosystem: 'npm'
        directory: '/'
        schedule:
          interval: 'weekly'
        open-pull-requests-limit: 10
        groups:
          dev-dependencies:
            patterns:
              - '@types/*'
              - '@vercel/*'
              - 'eslint*'
              - 'prettier'
              - 'typescript'
              - 'jest'
              - 'ts-jest'
              - 'husky'
              - 'lint-staged'
      - package-ecosystem: 'github-actions'
        directory: '/'
        schedule:
          interval: 'weekly'
    ```

- [ ] **Task 6: Configure Husky pre-commit hooks**
  - Files: `.husky/pre-commit`
  - Action: Create pre-commit hook:
    ```bash
    #!/usr/bin/env sh
    . "$(dirname -- "$0")/_/husky.sh"
    npx lint-staged
    ```

#### Phase 2: TypeScript Source Code

- [ ] **Task 7: Define TypeScript types**
  - File: `src/types.ts`
  - Action: Create comprehensive interfaces:

    ```typescript
    export interface ActionInputs {
      workflowPath: string;
      prompt: string;
      envVars: Record<string, string>;
    }

    export type ActionStatus = 'success' | 'failure' | 'cancelled' | 'timeout';

    export interface ActionOutputs {
      status: ActionStatus;
      result: string;
    }

    export interface RunnerResult {
      success: boolean;
      output: string;
      error?: string;
      exitCode?: number;
    }

    export interface ValidationResult {
      valid: boolean;
      errors: string[];
    }

    // Constants for input limits
    export const INPUT_LIMITS = {
      MAX_WORKFLOW_PATH_LENGTH: 1024,
      MAX_PROMPT_LENGTH: 100_000, // 100KB
      MAX_ENV_VARS_SIZE: 65_536, // 64KB JSON
      MAX_ENV_VARS_COUNT: 100,
      MAX_OUTPUT_SIZE: 900_000, // ~900KB (GitHub limit is ~1MB)
    } as const;
    ```

- [ ] **Task 8: Create security utilities**
  - File: `src/security.ts`
  - Action: Create path sanitization and secret masking:

    ```typescript
    import * as core from '@actions/core';
    import * as path from 'path';
    import * as fs from 'fs';

    /**
     * Validates that a path is within the workspace and doesn't escape via traversal.
     * Also follows symlinks to ensure the real path is within workspace.
     * Returns the resolved real path if valid, throws if invalid.
     */
    export function validateWorkspacePath(workspacePath: string, relativePath: string): string {
      // Normalize and resolve the path
      const normalizedRelative = path.normalize(relativePath);

      // Check for obvious traversal attempts
      if (normalizedRelative.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(
          'Invalid workflow path: absolute paths and parent directory references are not allowed'
        );
      }

      const absolutePath = path.resolve(workspacePath, normalizedRelative);
      const realWorkspace = fs.realpathSync(workspacePath);

      // First check: resolved path should be within workspace (catches obvious escapes)
      if (!absolutePath.startsWith(realWorkspace + path.sep) && absolutePath !== realWorkspace) {
        throw new Error('Invalid workflow path: path escapes the workspace directory');
      }

      return absolutePath;
    }

    /**
     * Validates the REAL path of a file (following symlinks) is within workspace.
     * Call this AFTER confirming the file exists.
     * Returns the real path if valid, throws if symlink escapes workspace.
     */
    export function validateRealPath(workspacePath: string, filePath: string): string {
      const realWorkspace = fs.realpathSync(workspacePath);
      const realFilePath = fs.realpathSync(filePath);

      // Check that the real path (after following symlinks) is still in workspace
      if (!realFilePath.startsWith(realWorkspace + path.sep) && realFilePath !== realWorkspace) {
        throw new Error('Invalid workflow path: symlink target escapes the workspace directory');
      }

      return realFilePath;
    }

    /**
     * Masks all values in envVars as secrets to prevent log exposure.
     */
    export function maskSecrets(envVars: Record<string, string>): void {
      for (const value of Object.values(envVars)) {
        if (value && value.length > 0) {
          core.setSecret(value);
        }
      }
    }

    /**
     * Sanitizes error messages to remove sensitive information.
     */
    export function sanitizeErrorMessage(error: Error): string {
      let message = error.message;

      // Remove absolute paths
      message = message.replace(/\/[^\s]+/g, '[PATH]');

      // Remove potential secrets (long alphanumeric strings)
      message = message.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]');

      return message;
    }

    /**
     * Validates file encoding is valid UTF-8 by checking for invalid byte sequences.
     * Note: Does NOT reject files containing U+FFFD as that's a valid Unicode character.
     * Instead, checks if the buffer contains invalid UTF-8 byte sequences.
     */
    export function validateUtf8(buffer: Buffer, filePath: string): string {
      // Check for invalid UTF-8 sequences by looking for encoding errors
      // TextDecoder with fatal: true throws on invalid sequences
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        return decoder.decode(buffer);
      } catch (e) {
        throw new Error(`File is not valid UTF-8: ${path.basename(filePath)}`);
      }
    }
    ```

- [ ] **Task 9: Create input configuration parser with validation**
  - File: `src/config.ts`
  - Action: Create `getInputs()` and `validateInputs()` with security checks:

    ```typescript
    import * as core from '@actions/core';
    import { ActionInputs, ValidationResult, INPUT_LIMITS } from './types';
    import { maskSecrets } from './security';

    export function getInputs(): ActionInputs {
      const workflowPath = core.getInput('workflow_path', { required: true });
      const prompt = core.getInput('prompt') || '';
      const envVarsRaw = core.getInput('env_vars') || '{}';

      // Validate sizes before parsing
      if (envVarsRaw.length > INPUT_LIMITS.MAX_ENV_VARS_SIZE) {
        throw new Error(`env_vars exceeds maximum size of ${INPUT_LIMITS.MAX_ENV_VARS_SIZE} bytes`);
      }

      let envVars: Record<string, string>;
      try {
        envVars = JSON.parse(envVarsRaw) as Record<string, string>;
      } catch (e) {
        throw new Error('env_vars must be a valid JSON object. Example: {"KEY": "value"}');
      }

      // Validate parsed structure
      if (typeof envVars !== 'object' || envVars === null || Array.isArray(envVars)) {
        throw new Error('env_vars must be a JSON object, not an array or primitive');
      }

      // Validate entry count
      const entryCount = Object.keys(envVars).length;
      if (entryCount > INPUT_LIMITS.MAX_ENV_VARS_COUNT) {
        throw new Error(`env_vars exceeds maximum of ${INPUT_LIMITS.MAX_ENV_VARS_COUNT} entries`);
      }

      // Validate all values are strings
      for (const [key, value] of Object.entries(envVars)) {
        if (typeof value !== 'string') {
          throw new Error(`env_vars["${key}"] must be a string, got ${typeof value}`);
        }
      }

      // Mask all env_vars values as secrets BEFORE any logging
      maskSecrets(envVars);

      return { workflowPath, prompt, envVars };
    }

    export function validateInputs(inputs: ActionInputs): ValidationResult {
      const errors: string[] = [];

      // Validate workflow_path
      if (!inputs.workflowPath || inputs.workflowPath.trim() === '') {
        errors.push('workflow_path is required and cannot be empty');
      } else if (inputs.workflowPath.length > INPUT_LIMITS.MAX_WORKFLOW_PATH_LENGTH) {
        errors.push(
          `workflow_path exceeds maximum length of ${INPUT_LIMITS.MAX_WORKFLOW_PATH_LENGTH}`
        );
      }

      // Validate prompt size
      if (inputs.prompt.length > INPUT_LIMITS.MAX_PROMPT_LENGTH) {
        errors.push(`prompt exceeds maximum size of ${INPUT_LIMITS.MAX_PROMPT_LENGTH} bytes`);
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    }
    ```

- [ ] **Task 10: Create workflow runner stub with timeout and abort support**
  - File: `src/runner.ts`
  - Action: Create `runWorkflow()` with proper timeout cleanup and abort signal:

    ```typescript
    import * as core from '@actions/core';
    import * as fs from 'fs';
    import { ActionInputs, RunnerResult, INPUT_LIMITS } from './types';
    import { validateWorkspacePath, validateRealPath, validateUtf8 } from './security';

    const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes for stub

    export async function runWorkflow(
      inputs: ActionInputs,
      timeoutMs: number = DEFAULT_TIMEOUT_MS,
      abortSignal?: AbortSignal
    ): Promise<RunnerResult> {
      const workspace = process.env.GITHUB_WORKSPACE || '/github/workspace';

      // Create abort controller for timeout
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, timeoutMs);

      // Combine external abort signal with timeout
      const combinedAbort = abortSignal
        ? AbortSignal.any([abortSignal, timeoutController.signal])
        : timeoutController.signal;

      try {
        // Check if already aborted
        if (combinedAbort.aborted) {
          return {
            success: false,
            output: '',
            error: 'Workflow execution was cancelled',
          };
        }

        const result = await executeWorkflow(inputs, workspace, combinedAbort);
        return result;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          return {
            success: false,
            output: '',
            error: abortSignal?.aborted
              ? 'Workflow execution was cancelled'
              : `Workflow execution timed out after ${timeoutMs}ms`,
          };
        }
        throw e;
      } finally {
        // Always cleanup the timeout to prevent event loop leak
        clearTimeout(timeoutId);
      }
    }

    async function executeWorkflow(
      inputs: ActionInputs,
      workspace: string,
      abortSignal: AbortSignal
    ): Promise<RunnerResult> {
      // Check abort before each major operation
      if (abortSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Validate and resolve path (prevents traversal attacks)
      let absolutePath: string;
      try {
        absolutePath = validateWorkspacePath(workspace, inputs.workflowPath);
      } catch (e) {
        return {
          success: false,
          output: '',
          error: e instanceof Error ? e.message : 'Path validation failed',
        };
      }

      // Check file exists
      if (!fs.existsSync(absolutePath)) {
        return {
          success: false,
          output: '',
          error: `Workflow file not found: ${inputs.workflowPath}`,
        };
      }

      // Validate symlinks don't escape workspace (AFTER confirming file exists)
      try {
        validateRealPath(workspace, absolutePath);
      } catch (e) {
        return {
          success: false,
          output: '',
          error: e instanceof Error ? e.message : 'Symlink validation failed',
        };
      }

      // Check abort again
      if (abortSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Read and validate file encoding
      try {
        const buffer = fs.readFileSync(absolutePath);
        validateUtf8(buffer, absolutePath);
      } catch (e) {
        return {
          success: false,
          output: '',
          error: e instanceof Error ? e.message : 'Failed to read workflow file',
        };
      }

      // Log execution start (workflow path only, not contents)
      core.info(`Executing workflow: ${inputs.workflowPath}`);
      if (inputs.prompt) {
        core.info(`Prompt provided: ${inputs.prompt.length} characters`);
      }
      core.info(`Environment variables: ${Object.keys(inputs.envVars).length} entries`);

      // Stub implementation - actual OpenCode integration is separate ticket
      const output = JSON.stringify({
        message: 'Workflow runner stub - OpenCode integration pending',
        workflowPath: inputs.workflowPath,
        promptLength: inputs.prompt.length,
        envVarsCount: Object.keys(inputs.envVars).length,
      });

      // Truncate output if too large
      const truncatedOutput =
        output.length > INPUT_LIMITS.MAX_OUTPUT_SIZE
          ? output.substring(0, INPUT_LIMITS.MAX_OUTPUT_SIZE) + '...[truncated]'
          : output;

      return {
        success: true,
        output: truncatedOutput,
      };
    }
    ```

- [ ] **Task 11: Create main entry point with graceful shutdown and abort propagation**
  - File: `src/index.ts`
  - Action: Create async `run()` with proper abort signal propagation:

    ```typescript
    import * as core from '@actions/core';
    import { getInputs, validateInputs } from './config';
    import { runWorkflow } from './runner';
    import { sanitizeErrorMessage } from './security';
    import { ActionStatus } from './types';

    // Global abort controller for graceful shutdown
    const shutdownController = new AbortController();
    let runPromise: Promise<void> | null = null;

    async function run(): Promise<void> {
      let status: ActionStatus = 'failure';
      let outputsSet = false;

      try {
        // Check if already shutting down
        if (shutdownController.signal.aborted) {
          status = 'cancelled';
          core.setOutput('status', status);
          core.setOutput('result', JSON.stringify({ cancelled: true }));
          outputsSet = true;
          return;
        }

        // Parse and validate inputs
        const inputs = getInputs();
        const validation = validateInputs(inputs);

        if (!validation.valid) {
          for (const error of validation.errors) {
            core.error(error);
          }
          throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
        }

        // Run the workflow with abort signal
        const result = await runWorkflow(inputs, undefined, shutdownController.signal);

        // Check if we were cancelled during execution
        if (shutdownController.signal.aborted) {
          status = 'cancelled';
          core.setOutput('status', status);
          core.setOutput('result', JSON.stringify({ cancelled: true }));
          outputsSet = true;
          return;
        }

        status = result.success ? 'success' : 'failure';
        core.setOutput('status', status);
        core.setOutput('result', result.output);
        outputsSet = true;

        if (!result.success && result.error) {
          core.setFailed(result.error);
        }
      } catch (error) {
        // Don't overwrite outputs if already set (e.g., during shutdown)
        if (!outputsSet) {
          status = shutdownController.signal.aborted ? 'cancelled' : 'failure';
          const message =
            error instanceof Error ? sanitizeErrorMessage(error) : 'An unknown error occurred';

          core.setOutput('status', status);
          core.setOutput('result', JSON.stringify({ error: message }));

          if (!shutdownController.signal.aborted) {
            core.setFailed(message);
          }
        }
      }
    }

    // Handle graceful shutdown with proper abort propagation
    function handleShutdown(signal: string): void {
      core.info(`Received ${signal}, initiating graceful shutdown...`);

      // Signal abort to running workflow
      shutdownController.abort();

      // Wait for run to complete or force exit after timeout
      const forceExitTimeout = setTimeout(() => {
        core.warning('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 10000);

      // If run is in progress, wait for it
      if (runPromise) {
        runPromise.finally(() => {
          clearTimeout(forceExitTimeout);
          process.exit(0);
        });
      } else {
        clearTimeout(forceExitTimeout);
        process.exit(0);
      }
    }

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Run the action and store promise for shutdown handling
    runPromise = run();
    runPromise.catch(() => {
      // Error already handled in run()
    });
    ```

#### Phase 3: Docker Configuration

- [ ] **Task 12: Create Dockerfile with consolidated layers and security**
  - File: `Dockerfile`
  - Action: Create multi-runtime Dockerfile with single apt-get update:

    ```dockerfile
    FROM debian:bookworm-slim

    LABEL org.opencontainers.image.source="https://github.com/owner/ai-workflow-runner"
    LABEL org.opencontainers.image.description="AI Workflow Runner - Multi-runtime GitHub Action"

    ENV DEBIAN_FRONTEND=noninteractive

    # Install all system packages in a single layer to avoid apt state issues
    # Using Debian's Node.js package instead of NodeSource script for security
    RUN apt-get update && \
        apt-get install -y --no-install-recommends \
            # System utilities
            curl \
            ca-certificates \
            # Java 21 JRE
            openjdk-21-jre-headless \
            # Python 3.11
            python3.11 \
            python3.11-venv \
            python3-pip \
            # Node.js from Debian (may be older, see note below)
            nodejs \
            npm \
        && apt-get clean \
        && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

    # Note: If Node.js 20+ is required and Debian's version is older,
    # use NodeSource with GPG verification:
    # RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg && \
    #     echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    #     apt-get update && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

    # Verify installations
    RUN node --version && \
        python3.11 --version && \
        java --version

    # Copy application
    COPY dist/ /app/dist/
    COPY entrypoint.sh /entrypoint.sh
    RUN chmod +x /entrypoint.sh

    # Set working directory to where workspace will be mounted
    WORKDIR /github/workspace

    # Use entrypoint with signal handling
    ENTRYPOINT ["/entrypoint.sh"]
    ```

- [ ] **Task 13: Create entrypoint with signal handling**
  - File: `entrypoint.sh`
  - Action: Create shell wrapper with proper signal propagation:

    ```bash
    #!/bin/sh
    set -e

    # Forward signals to the Node.js process
    cleanup() {
        echo "Received shutdown signal, forwarding to application..."
        if [ -n "$NODE_PID" ]; then
            kill -TERM "$NODE_PID" 2>/dev/null || true
            wait "$NODE_PID" 2>/dev/null || true
        fi
        exit 0
    }

    trap cleanup SIGTERM SIGINT

    # Run the Node.js action in background to capture PID
    node /app/dist/index.js &
    NODE_PID=$!

    # Wait for the process and capture exit code
    wait $NODE_PID
    EXIT_CODE=$?

    exit $EXIT_CODE
    ```

- [ ] **Task 14: Create action.yml with proper metadata**
  - File: `action.yml`
  - Action: Create action metadata (description under 125 chars for Marketplace):

    ```yaml
    name: 'AI Workflow Runner'
    description: 'Run AI workflows with Node.js, Python, and Java runtime support'
    author: 'TanNT'

    inputs:
      workflow_path:
        description: 'Path to the workflow.md file (relative to workspace root)'
        required: true
      prompt:
        description: 'Input prompt to pass to the workflow (max 100KB)'
        required: false
        default: ''
      env_vars:
        description: 'JSON object of environment variables (max 64KB, 100 entries)'
        required: false
        default: '{}'
      timeout_minutes:
        description: 'Maximum execution time in minutes (default: 30)'
        required: false
        default: '30'

    outputs:
      status:
        description: 'Execution status: success, failure, cancelled, or timeout'
      result:
        description: 'Workflow execution result as JSON string (max 900KB)'

    runs:
      using: 'docker'
      image: 'Dockerfile'

    branding:
      icon: 'play-circle'
      color: 'green'
    ```

#### Phase 4: CI/CD Workflows

- [ ] **Task 15: Create CI workflow with caching**
  - File: `.github/workflows/ci.yml`
  - Action: Create workflow with npm cache and proper Docker handling:

    ```yaml
    name: CI

    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]

    permissions:
      contents: read

    jobs:
      build-and-test:
        runs-on: ubuntu-latest
        timeout-minutes: 15

        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
              node-version: '20'
              cache: 'npm'

          - name: Verify lockfile sync
            run: |
              # Ensure package-lock.json is committed and in sync
              if [ ! -f package-lock.json ]; then
                echo "ERROR: package-lock.json not found. Run 'npm install' and commit the lockfile."
                exit 1
              fi

          - name: Install dependencies
            run: npm ci

          - name: Lint
            run: npm run lint

          - name: Format check
            run: npm run format:check

          - name: Type check
            run: npm run typecheck

          - name: Unit tests
            run: npm run test:unit

          - name: Bundle
            run: npm run bundle

          - name: Build Docker image
            run: docker build -t ai-workflow-runner:test .

          - name: Verify Docker runtimes
            run: |
              docker run --rm ai-workflow-runner:test node --version
              docker run --rm ai-workflow-runner:test python3.11 --version
              docker run --rm ai-workflow-runner:test java --version

          - name: Integration tests
            run: npm run test:integration
            env:
              DOCKER_IMAGE: ai-workflow-runner:test

          - name: Cleanup Docker
            if: always()
            run: |
              docker rmi ai-workflow-runner:test || true
              docker system prune -f || true
    ```

- [ ] **Task 16: Create release workflow with concurrency control**
  - File: `.github/workflows/release.yml`
  - Action: Create workflow with semver validation and concurrency lock:

    ```yaml
    name: Release

    on:
      push:
        tags:
          - 'v[0-9]+.[0-9]+.[0-9]+' # Only valid semver tags

    permissions:
      contents: write

    # Prevent concurrent releases
    concurrency:
      group: release
      cancel-in-progress: false

    jobs:
      validate-tag:
        runs-on: ubuntu-latest
        outputs:
          major: ${{ steps.semver.outputs.major }}
        steps:
          - name: Validate semver tag
            id: semver
            run: |
              TAG="${{ github.ref_name }}"
              if ! echo "$TAG" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
                echo "Invalid semver tag: $TAG"
                exit 1
              fi
              MAJOR=$(echo "$TAG" | cut -d'.' -f1)
              echo "major=$MAJOR" >> $GITHUB_OUTPUT

      release:
        needs: validate-tag
        runs-on: ubuntu-latest
        timeout-minutes: 20

        steps:
          - name: Checkout
            uses: actions/checkout@v4
            with:
              fetch-depth: 0

          - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
              node-version: '20'
              cache: 'npm'

          - name: Install dependencies
            run: npm ci

          - name: Lint and test
            run: |
              npm run lint
              npm run typecheck
              npm run test:unit

          - name: Bundle
            run: npm run bundle

          - name: Verify bundle exists
            run: |
              if [ ! -f dist/index.js ]; then
                echo "Bundle not found!"
                exit 1
              fi

          - name: Create GitHub Release
            uses: softprops/action-gh-release@v1
            with:
              generate_release_notes: true
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

          - name: Update major version tag
            run: |
              MAJOR="${{ needs.validate-tag.outputs.major }}"
              git config user.name "github-actions[bot]"
              git config user.email "github-actions[bot]@users.noreply.github.com"
              git tag -fa "$MAJOR" -m "Update $MAJOR to ${{ github.ref_name }}"
              git push origin "$MAJOR" --force
    ```

- [ ] **Task 17: Create E2E test workflow with failure matrix**
  - File: `.github/workflows/test-action.yml`
  - Action: Create workflow with multiple test scenarios:

    ```yaml
    name: E2E Tests

    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]

    permissions:
      contents: read

    jobs:
      e2e-tests:
        runs-on: ubuntu-latest
        timeout-minutes: 15

        strategy:
          fail-fast: false
          matrix:
            include:
              # Happy path
              - name: 'Valid workflow'
                workflow_path: '.github/test-fixtures/valid-workflow.md'
                prompt: 'Test prompt'
                env_vars: '{"TEST_KEY": "test_value"}'
                should_fail: false

              # Missing required input
              - name: 'Missing workflow_path'
                workflow_path: ''
                prompt: ''
                env_vars: '{}'
                should_fail: true

              # Invalid JSON
              - name: 'Invalid env_vars JSON'
                workflow_path: '.github/test-fixtures/valid-workflow.md'
                prompt: ''
                env_vars: 'not-json'
                should_fail: true

              # Non-existent file
              - name: 'Non-existent workflow'
                workflow_path: 'does/not/exist.md'
                prompt: ''
                env_vars: '{}'
                should_fail: true

              # Path traversal attempt
              - name: 'Path traversal blocked'
                workflow_path: '../../../etc/passwd'
                prompt: ''
                env_vars: '{}'
                should_fail: true

              # Unicode in path
              - name: 'Unicode workflow path'
                workflow_path: '.github/test-fixtures/workflow-日本語.md'
                prompt: 'Unicode prompt: 你好'
                env_vars: '{}'
                should_fail: false

              # Spaces in path
              - name: 'Spaces in path'
                workflow_path: '.github/test-fixtures/workflow with spaces.md'
                prompt: ''
                env_vars: '{}'
                should_fail: false

              # Secret masking verification
              - name: 'Secret masking in logs'
                workflow_path: '.github/test-fixtures/valid-workflow.md'
                prompt: ''
                env_vars: '{"SECRET_VALUE": "super_secret_value_12345"}'
                should_fail: false
                verify_masked: true

        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Create test fixtures
            run: |
              mkdir -p .github/test-fixtures
              echo "# Test Workflow" > ".github/test-fixtures/valid-workflow.md"
              echo "# Unicode Workflow" > ".github/test-fixtures/workflow-日本語.md"
              echo "# Spaces Workflow" > ".github/test-fixtures/workflow with spaces.md"

          - name: Run action - ${{ matrix.name }}
            id: test
            uses: ./
            continue-on-error: true
            with:
              workflow_path: ${{ matrix.workflow_path }}
              prompt: ${{ matrix.prompt }}
              env_vars: ${{ matrix.env_vars }}

          - name: Verify outcome - ${{ matrix.name }}
            run: |
              OUTCOME="${{ steps.test.outcome }}"
              SHOULD_FAIL="${{ matrix.should_fail }}"

              if [ "$SHOULD_FAIL" = "true" ]; then
                if [ "$OUTCOME" != "failure" ]; then
                  echo "Expected failure but got: $OUTCOME"
                  exit 1
                fi
                echo "Correctly failed as expected"
              else
                if [ "$OUTCOME" != "success" ]; then
                  echo "Expected success but got: $OUTCOME"
                  exit 1
                fi
                echo "Correctly succeeded as expected"
              fi

          - name: Verify outputs set
            if: steps.test.outcome == 'success'
            run: |
              STATUS="${{ steps.test.outputs.status }}"
              RESULT="${{ steps.test.outputs.result }}"

              if [ -z "$STATUS" ]; then
                echo "status output not set"
                exit 1
              fi

              if [ -z "$RESULT" ]; then
                echo "result output not set"
                exit 1
              fi

              echo "Status: $STATUS"
              echo "Result: $RESULT"

          - name: Verify secrets are masked
            if: matrix.verify_masked == true && steps.test.outcome == 'success'
            run: |
              # The secret value should NOT appear in plain text anywhere in the result
              RESULT="${{ steps.test.outputs.result }}"
              SECRET="super_secret_value_12345"

              if echo "$RESULT" | grep -q "$SECRET"; then
                echo "ERROR: Secret value found in plain text in output!"
                exit 1
              fi

              echo "Secret masking verified - value not exposed in output"
    ```

#### Phase 5: Testing Infrastructure

- [ ] **Task 18: Configure Jest**
  - File: `jest.config.js`
  - Action: Create Jest config with proper thresholds:
    ```javascript
    /** @type {import('jest').Config} */
    module.exports = {
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/**/*.test.ts'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/types.ts', // Types don't need coverage
      ],
      coverageDirectory: 'coverage',
      coverageReporters: ['text', 'lcov', 'html'],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      // Longer timeout for integration tests
      testTimeout: 60000,
      // Clear mocks between tests
      clearMocks: true,
      // Fail on console errors
      errorOnDeprecated: true,
    };
    ```

- [ ] **Task 19: Create unit tests for config**
  - File: `__tests__/unit/config.test.ts`
  - Action: Create comprehensive tests including edge cases:
    - `getInputs()` returns correct values from environment
    - `getInputs()` parses JSON env_vars correctly
    - `getInputs()` masks all env_vars values as secrets
    - `getInputs()` rejects env_vars exceeding size limit
    - `getInputs()` rejects env_vars with too many entries
    - `getInputs()` rejects non-object env_vars (array, null, primitive)
    - `getInputs()` rejects env_vars with non-string values
    - `validateInputs()` returns valid for correct inputs
    - `validateInputs()` returns errors for empty workflow_path
    - `validateInputs()` returns errors for workflow_path exceeding length
    - `validateInputs()` returns errors for prompt exceeding size

- [ ] **Task 20: Create unit tests for security**
  - File: `__tests__/unit/security.test.ts`
  - Action: Create tests for security functions:
    - `validateWorkspacePath()` accepts valid relative paths
    - `validateWorkspacePath()` accepts paths with subdirectories
    - `validateWorkspacePath()` rejects absolute paths
    - `validateWorkspacePath()` rejects paths starting with `..`
    - `validateWorkspacePath()` rejects paths with `../` in middle
    - `validateRealPath()` accepts file within workspace
    - `validateRealPath()` rejects symlink pointing outside workspace
    - `maskSecrets()` calls core.setSecret for each value
    - `maskSecrets()` handles empty values gracefully
    - `sanitizeErrorMessage()` removes absolute paths
    - `sanitizeErrorMessage()` removes potential secrets
    - `validateUtf8()` accepts valid UTF-8
    - `validateUtf8()` accepts valid UTF-8 containing U+FFFD character
    - `validateUtf8()` rejects invalid UTF-8 byte sequences

- [ ] **Task 21: Create unit tests for runner**
  - File: `__tests__/unit/runner.test.ts`
  - Action: Create tests for runner with mocked fs:
    - `runWorkflow()` returns success for valid workflow file
    - `runWorkflow()` returns failure for missing workflow file
    - `runWorkflow()` returns failure for path traversal attempt
    - `runWorkflow()` times out after specified duration
    - `runWorkflow()` truncates output exceeding size limit
    - `runWorkflow()` returns failure for non-UTF8 file

- [ ] **Task 22: Create integration tests**
  - File: `__tests__/integration/docker.test.ts`
  - Action: Create tests with proper cleanup:

    ```typescript
    import { execSync } from 'child_process';

    const DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'ai-workflow-runner:test';
    const TIMEOUT_MS = 60000;

    describe('Docker Container Integration', () => {
      beforeAll(() => {
        // Ensure image exists
        try {
          execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'pipe' });
        } catch {
          throw new Error(`Docker image ${DOCKER_IMAGE} not found. Run docker build first.`);
        }
      });

      afterAll(() => {
        // Cleanup any dangling containers
        try {
          execSync('docker container prune -f', { stdio: 'pipe' });
        } catch {
          // Ignore cleanup errors
        }
      });

      test(
        'Node.js 20+ is available',
        () => {
          const output = execSync(`docker run --rm ${DOCKER_IMAGE} node --version`, {
            timeout: TIMEOUT_MS,
          })
            .toString()
            .trim();
          const version = parseInt(output.replace('v', '').split('.')[0], 10);
          expect(version).toBeGreaterThanOrEqual(20);
        },
        TIMEOUT_MS
      );

      test(
        'Python 3.11 is available',
        () => {
          const output = execSync(`docker run --rm ${DOCKER_IMAGE} python3.11 --version`, {
            timeout: TIMEOUT_MS,
          })
            .toString()
            .trim();
          expect(output).toMatch(/Python 3\.11/);
        },
        TIMEOUT_MS
      );

      test(
        'Java 21 is available',
        () => {
          const output = execSync(`docker run --rm ${DOCKER_IMAGE} java --version`, {
            timeout: TIMEOUT_MS,
          })
            .toString()
            .trim();
          expect(output).toMatch(/21/);
        },
        TIMEOUT_MS
      );

      test(
        'entrypoint.sh is executable',
        () => {
          const output = execSync(`docker run --rm ${DOCKER_IMAGE} ls -la /entrypoint.sh`, {
            timeout: TIMEOUT_MS,
          })
            .toString()
            .trim();
          expect(output).toMatch(/^-rwx/); // Executable permissions
        },
        TIMEOUT_MS
      );

      test(
        'application files exist',
        () => {
          const output = execSync(`docker run --rm ${DOCKER_IMAGE} ls -la /app/dist/`, {
            timeout: TIMEOUT_MS,
          })
            .toString()
            .trim();
          expect(output).toContain('index.js');
        },
        TIMEOUT_MS
      );

      test('SIGTERM is forwarded to Node.js process', () => {
        // Start a container that sleeps (simulating long-running process)
        const containerName = `test-sigterm-${Date.now()}`;

        // Start container in background
        execSync(
          `docker run -d --name ${containerName} ${DOCKER_IMAGE} sh -c "node -e 'process.on(\"SIGTERM\", () => { console.log(\"SIGTERM received\"); process.exit(0); }); setTimeout(() => {}, 60000);'"`,
          { timeout: TIMEOUT_MS }
        );

        try {
          // Give container time to start
          execSync('sleep 2');

          // Send SIGTERM
          execSync(`docker kill --signal=SIGTERM ${containerName}`, { timeout: TIMEOUT_MS });

          // Wait for container to exit (should be quick after SIGTERM)
          const exitCode = execSync(`docker wait ${containerName}`, { timeout: 15000 })
            .toString()
            .trim();

          // Should exit with code 0 (graceful shutdown)
          expect(exitCode).toBe('0');

          // Check logs for SIGTERM handling
          const logs = execSync(`docker logs ${containerName}`, { timeout: TIMEOUT_MS }).toString();
          expect(logs).toContain('SIGTERM');
        } finally {
          // Cleanup
          execSync(`docker rm -f ${containerName} 2>/dev/null || true`, { stdio: 'pipe' });
        }
      }, 30000);
    });
    ```

#### Phase 6: Documentation

- [ ] **Task 23: Create README.md**
  - File: `README.md`
  - Action: Create comprehensive README (sync key points with action.yml description):
    - Action description and purpose
    - Platform support (Linux runners only)
    - Usage examples with all inputs
    - Inputs/outputs table with limits
    - Security considerations
    - Example workflow file
    - Development instructions
    - Contributing guide
    - License information

- [ ] **Task 24: Create LICENSE**
  - File: `LICENSE`
  - Action: Create MIT license file

- [ ] **Task 25: Build and verify locally**
  - Action: Run full build pipeline:
    ```bash
    npm install
    npm run lint
    npm run format:check
    npm run typecheck
    npm run test:unit
    npm run bundle
    docker build -t ai-workflow-runner:local .
    npm run test:integration
    ```
  - Verify: dist/index.js exists
  - Verify: Docker image builds successfully
  - Verify: All tests pass with >= 80% coverage

### Acceptance Criteria

#### Core Functionality

- [ ] **AC1:** Given a valid workflow_path input, when the action runs, then it logs the workflow path (not contents) and returns status=success with a stub message
- [ ] **AC2:** Given an empty workflow_path input, when the action runs, then it fails with a clear error message about missing required input
- [ ] **AC3:** Given env_vars as valid JSON, when the action runs, then all values are masked as secrets before any logging occurs
- [ ] **AC4:** Given env_vars as invalid JSON, when the action runs, then it fails with a user-friendly JSON parse error (not stack trace)
- [ ] **AC5:** Given env_vars exceeding 64KB, when the action runs, then it fails with a clear size limit error
- [ ] **AC6:** Given a workflow_path with `../` traversal, when the action runs, then it fails with "path escapes workspace" error

#### Docker Container

- [ ] **AC7:** Given the Dockerfile, when built, then apt-get update is called only once (single consolidated layer)
- [ ] **AC8:** Given the Dockerfile, when built, then the image contains Node.js version 20 or higher
- [ ] **AC9:** Given the Dockerfile, when built, then the image contains Python version 3.11
- [ ] **AC10:** Given the Dockerfile, when built, then the image contains Java version 21
- [ ] **AC11:** Given SIGTERM sent to container, when entrypoint receives signal, then it forwards to Node.js process and exits gracefully

#### CI/CD Pipeline

- [ ] **AC12:** Given a push to main branch, when CI runs, then npm cache is used for faster installs
- [ ] **AC13:** Given CI completes, when Docker tests finish, then test containers and images are cleaned up
- [ ] **AC14:** Given an invalid tag like `vfoo`, when pushed, then release workflow does not trigger
- [ ] **AC15:** Given a valid tag v1.0.0, when release runs, then GitHub Release is created with auto-generated notes
- [ ] **AC16:** Given two releases triggered simultaneously, when concurrency kicks in, then only one runs at a time (no race condition)
- [ ] **AC17:** Given v1.2.3 release, when complete, then major version tag v1 points to this release

#### Testing

- [ ] **AC18:** Given the test suite, when `npm run test:unit` runs, then all unit tests pass with >= 80% coverage on validation logic
- [ ] **AC19:** Given the test suite, when `npm run test:integration` runs, then Docker build and runtime verification tests pass and cleanup occurs
- [ ] **AC20:** Given E2E tests, when matrix runs, then happy path, failure cases, path traversal, and Unicode paths are all tested

#### Security

- [ ] **AC21:** Given any env_vars input, when processed, then all values are masked via core.setSecret before any logging
- [ ] **AC22:** Given an error during execution, when error message is output, then absolute paths are redacted
- [ ] **AC23:** Given Dependabot config, when dependencies have updates, then PRs are automatically created

#### Marketplace

- [ ] **AC24:** Given action.yml, when description is checked, then it is under 125 characters for Marketplace compatibility
- [ ] **AC25:** Given the action published to Marketplace, when users search, then the action appears with correct branding

## Additional Context

### Dependencies

**Production (pinned versions):**

- `@actions/core@^1.10.1` - GitHub Actions toolkit core (inputs, outputs, logging, secrets)
- `@actions/exec@^1.1.1` - Command execution utilities
- `@actions/io@^1.1.3` - File I/O utilities

**Development (pinned versions):**

- `typescript@^5.3.0` - TypeScript compiler
- `@vercel/ncc@^0.38.0` - Bundle TypeScript to single file
- `jest@^29.7.0` - Testing framework
- `ts-jest@^29.1.0` - Jest TypeScript support
- `@types/node@^20.10.0` - Node.js type definitions
- `@types/jest@^29.5.0` - Jest type definitions
- `eslint@^8.55.0` - Linting
- `@typescript-eslint/eslint-plugin@^6.13.0` - TypeScript ESLint rules
- `@typescript-eslint/parser@^6.13.0` - TypeScript ESLint parser
- `prettier@^3.1.0` - Code formatting
- `eslint-config-prettier@^9.1.0` - Disable conflicting ESLint rules
- `husky@^8.0.0` - Git hooks
- `lint-staged@^15.2.0` - Run linters on staged files

**Future (OpenCode integration ticket):**

- `@opencode-ai/plugin` - OpenCode SDK for workflow execution

### Testing Strategy

| Level           | Tool              | What to Test                                                                     |
| --------------- | ----------------- | -------------------------------------------------------------------------------- |
| **Unit**        | Jest              | Input validation, path sanitization, secret masking, error handling, size limits |
| **Integration** | Docker CLI + Jest | Container builds, all runtimes available, entrypoint works, cleanup              |
| **E2E**         | GitHub Actions    | Happy path, failure cases, path traversal, Unicode, spaces in paths              |

**Coverage Target:** 80% for unit tests on actual validation logic

### Resource Limits

| Resource               | Limit        | Notes                     |
| ---------------------- | ------------ | ------------------------- |
| `workflow_path` length | 1,024 chars  | Prevent path injection    |
| `prompt` size          | 100 KB       | Prevent memory exhaustion |
| `env_vars` JSON size   | 64 KB        | Prevent OOM during parse  |
| `env_vars` entry count | 100          | Reasonable limit          |
| `result` output size   | 900 KB       | GitHub Actions ~1MB limit |
| Execution timeout      | Configurable | Default 30 minutes        |
| Docker image size      | ~800MB-1.1GB | Java JRE is largest       |
| Memory usage           | 512MB-2GB    | Depends on workload       |

### Risks and Mitigations

| Risk                               | Impact              | Mitigation                                               |
| ---------------------------------- | ------------------- | -------------------------------------------------------- |
| Docker image too large (>1GB)      | Slow action startup | Use JRE (not JDK), consolidated apt layer, .dockerignore |
| Path traversal attack              | Security breach     | realpath validation, workspace containment check         |
| Secret exposure in logs            | Security breach     | core.setSecret() for all env_vars values                 |
| Supply chain attack via NodeSource | Security breach     | Use Debian packages or GPG-verified NodeSource           |
| Concurrent release race condition  | Corrupted tags      | concurrency group with cancel-in-progress: false         |
| OOM from large inputs              | Action crash        | Input size limits enforced                               |
| Hung workflow                      | Wasted minutes      | Configurable timeout with default                        |

### Notes

- Reference workflow: `microservice-swarm/.ai-core/workflows/document-repo/workflow.md`
- OpenCode SDK package: `@opencode-ai/plugin@1.1.39`
- Workspace is automatically mounted by GitHub Actions to `/github/workspace`
- First marketplace release must be done manually via GitHub UI
- The `dist/` folder MUST be committed to git - required for GitHub Actions
- Windows and macOS runners are NOT supported (Docker container actions require Linux)
- All runtimes (Node, Python, Java) are available simultaneously - workflows use what they need
