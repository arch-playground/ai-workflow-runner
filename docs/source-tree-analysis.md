# AI Workflow Runner - Source Tree Analysis

## Directory Structure

```
ai-workflow-runner/
├── .github/                    # GitHub configuration
│   └── workflows/              # CI/CD workflows
│       ├── ci.yml              # Main CI pipeline (push/PR)
│       ├── release.yml         # Release automation (tags)
│       └── test-action.yml     # Action testing
│
├── .husky/                     # Git hooks (lint-staged)
│
├── src/                        # 📁 SOURCE CODE (TypeScript)
│   ├── index.ts                # ⚡ Entry point - signal handling, orchestration
│   ├── runner.ts               # 🏃 Workflow execution engine
│   ├── config.ts               # ⚙️ Input parsing and validation
│   ├── security.ts             # 🔒 Path validation, secret masking
│   ├── opencode.ts             # 🤖 OpenCode SDK service wrapper
│   ├── validation.ts           # ✅ Validation script executor
│   ├── types.ts                # 📝 TypeScript type definitions
│   ├── config.spec.ts          # Unit tests for config
│   ├── security.spec.ts        # Unit tests for security
│   ├── runner.spec.ts          # Unit tests for runner
│   ├── opencode.spec.ts        # Unit tests for opencode
│   └── validation.spec.ts      # Unit tests for validation
│
├── test/                       # 📁 TEST INFRASTRUCTURE
│   ├── mocks/                  # Test mocks
│   │   └── @opencode-ai/
│   │       └── sdk.ts          # OpenCode SDK mock
│   ├── integration/            # Integration tests
│   │   └── docker.test.ts      # Docker runtime tests
│   ├── e2e/                    # End-to-end tests
│   │   └── workflow-runner.e2e-spec.ts  # Full workflow tests
│   └── e2e-fixtures/           # Test fixtures
│       ├── test-workflow.md    # Sample workflow
│       ├── simple-workflow.md  # Minimal workflow
│       ├── validate.py         # Python validation script
│       └── validate.js         # JavaScript validation script
│
├── dist/                       # 📁 BUILD OUTPUT (committed)
│   ├── index.js                # Bundled application
│   └── index.js.map            # Source map
│
├── coverage/                   # Test coverage reports
│
├── docs/                       # 📁 GENERATED DOCUMENTATION
│   ├── index.md                # Documentation index
│   ├── project-overview.md     # Project summary
│   ├── architecture.md         # System design
│   ├── source-tree-analysis.md # This file
│   └── development-guide.md    # Dev setup guide
│
├── _bmad/                      # BMAD workflow system
├── _bmad-output/               # BMAD artifacts
├── .knowledge-base/            # Project standards
│
├── action.yml                  # ⭐ GitHub Action definition
├── Dockerfile                  # ⭐ Multi-runtime container
├── entrypoint.sh               # ⭐ Container entrypoint
│
├── package.json                # NPM configuration
├── package-lock.json           # Dependency lockfile
├── tsconfig.json               # TypeScript config (build)
├── tsconfig.test.json          # TypeScript config (tests)
├── jest.config.js              # Jest configuration
├── .eslintrc.json              # ESLint rules
├── .prettierrc                 # Prettier config
│
├── README.md                   # Project readme
├── AGENTS.md                   # AI agent guidelines
├── CLAUDE.md -> AGENTS.md      # Symlink for Claude
└── LICENSE                     # MIT license
```

## Critical Directories

### `/src` - Source Code

The main application code, organized by responsibility:

| File            | Lines | Purpose                             |
| --------------- | ----- | ----------------------------------- |
| `index.ts`      | ~107  | Application entry, signal handling  |
| `runner.ts`     | ~231  | Workflow execution, validation loop |
| `config.ts`     | ~157  | Input parsing, validation           |
| `security.ts`   | ~78   | Path security, secret masking       |
| `opencode.ts`   | ~422  | SDK service, event handling         |
| `validation.ts` | ~260  | Script execution engine             |
| `types.ts`      | ~59   | Type definitions, constants         |

**Total Source:** ~1,314 lines of TypeScript

### `/test` - Test Infrastructure

| Directory       | Purpose                         |
| --------------- | ------------------------------- |
| `mocks/`        | SDK mocks for unit testing      |
| `integration/`  | Docker container verification   |
| `e2e/`          | Full workflow execution tests   |
| `e2e-fixtures/` | Test workflow files and scripts |

### `/dist` - Build Output

Bundled JavaScript output committed to git (required for GitHub Actions).

## Entry Points

### Primary Entry Point

**`src/index.ts`** - Node.js application entry

- Registered via: `node /app/dist/index.js`
- Handles: SIGTERM, SIGINT signals
- Coordinates: shutdown, cleanup

### Container Entry Point

**`entrypoint.sh`** - Shell wrapper for signal forwarding

- Starts Node.js in background
- Traps SIGTERM (15), SIGINT (2)
- Forwards signals to Node process

### Action Entry Point

**`action.yml`** - GitHub Action definition

- Defines: inputs, outputs, branding
- Uses: Docker container (`Dockerfile`)

## Key Configuration Files

### TypeScript Configuration

**`tsconfig.json`** (Build)

```json
{
  "target": "ES2022",
  "module": "NodeNext",
  "strict": true,
  "rootDir": "./src",
  "outDir": "./dist"
}
```

**`tsconfig.test.json`** (Tests)

- Extends base config
- Includes test directories

### Jest Configuration

**`jest.config.js`**

- Preset: ts-jest
- Test patterns: `*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts`
- Coverage: 75% branches, 80% lines/functions
- Module mapping: SDK mock override

### ESLint Configuration

**`.eslintrc.json`**

- Parser: @typescript-eslint/parser
- Plugins: @typescript-eslint
- Extends: eslint:recommended, plugin:@typescript-eslint/recommended

## File Patterns

### Source Files

- `src/**/*.ts` - TypeScript source
- `src/**/*.spec.ts` - Unit tests (co-located)

### Test Files

- `test/**/*.test.ts` - Integration tests
- `test/**/*.e2e-spec.ts` - E2E tests

### Configuration Files

- `*.config.js` - Tool configs
- `tsconfig*.json` - TypeScript configs
- `.eslintrc.json` - Linting rules
- `.prettierrc` - Formatting rules

### Build Artifacts

- `dist/**/*.js` - Bundled output
- `coverage/**` - Test reports

## Dependencies Overview

### Runtime Dependencies

- `@actions/core` - GitHub Actions toolkit
- `@opencode-ai/sdk` - AI workflow SDK

### Development Dependencies

- TypeScript toolchain: `typescript`, `ts-jest`
- Testing: `jest`, `@types/jest`
- Linting: `eslint`, `@typescript-eslint/*`
- Formatting: `prettier`
- Bundling: `esbuild`
- Git hooks: `husky`, `lint-staged`
