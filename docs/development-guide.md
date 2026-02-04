# AI Workflow Runner - Development Guide

## Prerequisites

| Requirement | Version | Purpose                    |
| ----------- | ------- | -------------------------- |
| Node.js     | 20+     | Runtime and development    |
| npm         | 10+     | Package management         |
| Docker      | Latest  | Container builds and tests |
| Git         | 2.x+    | Version control            |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/arch-playground/ai-workflow-runner.git
cd ai-workflow-runner

# Install dependencies
npm install

# Run all quality checks
npm run lint
npm run format:check
npm run typecheck

# Run unit tests
npm run test:unit

# Build the bundle
npm run bundle
```

## Development Workflow

### 1. Code Changes

Edit TypeScript files in `src/`:

- Source files: `src/*.ts`
- Unit tests: `src/*.spec.ts` (co-located)

### 2. Quality Checks

```bash
# Linting (ESLint)
npm run lint

# Auto-fix lint issues
npm run lint -- --fix

# Format check (Prettier)
npm run format:check

# Auto-format
npm run format

# Type checking
npm run typecheck
```

### 3. Testing

```bash
# Unit tests only
npm run test:unit

# All tests with coverage
npm test

# Watch mode (development)
npm test -- --watch

# Single test file
npm test -- src/config.spec.ts
```

### 4. Building

```bash
# TypeScript compilation (for type checking)
npm run build

# Production bundle (esbuild)
npm run bundle
```

## Docker Development

### Build Docker Image

```bash
# Build with default tag
docker build -t ai-workflow-runner:local .

# Build with specific tag
docker build -t ai-workflow-runner:dev .
```

### Verify Docker Runtimes

```bash
# Check Node.js
docker run --rm --entrypoint node ai-workflow-runner:local --version

# Check Python
docker run --rm --entrypoint python3.11 ai-workflow-runner:local --version

# Check Java
docker run --rm --entrypoint java ai-workflow-runner:local --version

# Check OpenCode CLI
docker run --rm --entrypoint opencode ai-workflow-runner:local --version
```

### Run Integration Tests

```bash
# Build image first
docker build -t ai-workflow-runner:test .

# Run integration tests
DOCKER_IMAGE=ai-workflow-runner:test npm run test:integration
```

### Run E2E Tests

```bash
# Build image first
docker build -t ai-workflow-runner:test .

# Run E2E tests (requires real OpenCode SDK)
DOCKER_IMAGE=ai-workflow-runner:test npm run test:e2e
```

## NPM Scripts Reference

| Script             | Command                                                       | Purpose                  |
| ------------------ | ------------------------------------------------------------- | ------------------------ |
| `build`            | `tsc`                                                         | TypeScript compilation   |
| `bundle`           | `esbuild ...`                                                 | Production bundle        |
| `test`             | `jest --coverage`                                             | All tests with coverage  |
| `test:unit`        | `jest --testPathPattern='src/.*\\.spec\\.ts$'`                | Unit tests only          |
| `test:integration` | `jest --testPathPattern=integration --runInBand`              | Docker integration tests |
| `test:e2e`         | `jest --testPathPattern=e2e --runInBand --testTimeout=180000` | End-to-end tests         |
| `lint`             | `eslint src test --max-warnings 0`                            | Linting                  |
| `format`           | `prettier --write src test`                                   | Format code              |
| `format:check`     | `prettier --check src test`                                   | Check formatting         |
| `typecheck`        | `tsc --noEmit`                                                | Type checking            |
| `prepare`          | `husky install`                                               | Setup git hooks          |

## Code Style

### TypeScript Guidelines

- **Strict Mode**: All strict checks enabled
- **ES2022**: Modern JavaScript features
- **NodeNext Modules**: ESM with .js extensions in imports

### Import Style

```typescript
// Node.js built-ins
import * as fs from 'fs';
import * as path from 'path';

// External packages
import * as core from '@actions/core';
import { createOpencode } from '@opencode-ai/sdk';

// Local modules (note .js extension for ESM)
import { getInputs } from './config.js';
import { runWorkflow } from './runner.js';
```

### Naming Conventions

| Type             | Convention  | Example               |
| ---------------- | ----------- | --------------------- |
| Files            | kebab-case  | `opencode-service.ts` |
| Classes          | PascalCase  | `OpenCodeService`     |
| Functions        | camelCase   | `runWorkflow`         |
| Constants        | UPPER_SNAKE | `MAX_TIMEOUT_MINUTES` |
| Types/Interfaces | PascalCase  | `ActionInputs`        |

### Error Handling

```typescript
// Use Result pattern for expected failures
interface RunnerResult {
  success: boolean;
  output: string;
  error?: string;
}

// Throw for unexpected failures
throw new Error('Unexpected condition');

// Sanitize errors before output
const message = sanitizeErrorMessage(error);
```

## Testing Guidelines

### Unit Test Structure

```typescript
describe('module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('function()', () => {
    it('does something specific', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Mocking External Dependencies

```typescript
// Mock at module level
jest.mock('@actions/core');
jest.mock('@opencode-ai/sdk');

// Get typed mock
const mockCore = core as jest.Mocked<typeof core>;

// Configure mock behavior
mockCore.getInput.mockReturnValue('test-value');
```

### Test File Locations

- **Unit tests**: Co-located with source (`src/*.spec.ts`)
- **Integration tests**: `test/integration/`
- **E2E tests**: `test/e2e/`
- **Fixtures**: `test/e2e-fixtures/`

## Git Workflow

### Commit Hooks

Pre-commit hooks are configured via Husky + lint-staged:

```bash
# On commit, the following runs automatically:
# - ESLint --fix on *.ts, *.js files
# - Prettier --write on all staged files
```

### Branch Strategy

- `main` - Production-ready code
- Feature branches for development
- PRs required for main

### Commit Messages

Follow conventional commits:

```
feat: add validation retry mechanism
fix: handle empty workflow files
docs: update architecture diagram
test: add E2E tests for signal handling
```

## Debugging

### VS Code Launch Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--testPathPattern", "${file}"],
  "console": "integratedTerminal"
}
```

### Debug Logging

```typescript
// Use core.debug for debug-level logs
core.debug(`[OpenCode] Server URL: ${this.server?.url}`);

// Use core.info for informational logs
core.info(`[OpenCode] Session created: ${sessionId}`);

// Use core.warning for warnings
core.warning(`[Validation] Script timed out`);
```

### Docker Debugging

```bash
# Run container interactively
docker run -it --entrypoint /bin/bash ai-workflow-runner:local

# Check environment
docker run --rm --entrypoint env ai-workflow-runner:local

# Test with specific inputs
docker run --rm \
  -v $(pwd)/test/e2e-fixtures:/github/workspace \
  -e INPUT_WORKFLOW_PATH=simple-workflow.md \
  -e GITHUB_WORKSPACE=/github/workspace \
  ai-workflow-runner:local
```

## Release Process

Releases are automated via GitHub Actions on tag push:

```bash
# Create a release tag
git tag v1.0.0
git push origin v1.0.0

# This triggers:
# 1. Validation of semver format
# 2. Full quality gate (lint, typecheck, test)
# 3. Bundle creation
# 4. GitHub Release creation
# 5. Major version tag update (v1 → v1.0.0)
```

## Troubleshooting

### Common Issues

**"Cannot find module './config.js'"**

- Ensure imports use `.js` extension for ESM compatibility
- Run `npm run build` to compile TypeScript

**"Docker image not found"**

- Build the image first: `docker build -t ai-workflow-runner:test .`
- Check image exists: `docker images | grep ai-workflow-runner`

**"Test timeout"**

- E2E tests require real OpenCode SDK (may be slow)
- Increase timeout: `--testTimeout=300000`

**"ENOENT: no such file or directory"**

- Check GITHUB_WORKSPACE is set correctly
- Verify workflow file path is relative to workspace

### Getting Help

- Check [README.md](../README.md) for usage examples
- Review [Architecture](./architecture.md) for system design
- Open an issue at https://github.com/arch-playground/ai-workflow-runner/issues
