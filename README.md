# AI Workflow Runner

A GitHub Action that runs AI workflows with Node.js, Python, and Java runtime support.

## Features

- **Multi-runtime support**: Node.js 20+, Python 3.11, and Java 21 pre-installed
- **Secure execution**: Path traversal prevention, secret masking, input validation
- **Docker-based**: Consistent environment across all runs
- **Configurable**: Timeout settings, environment variables, input prompts

## Platform Support

| Platform                                    | Support          |
| ------------------------------------------- | ---------------- |
| Linux runners (ubuntu-latest, ubuntu-22.04) | ✅ Supported     |
| Self-hosted Linux runners with Docker       | ✅ Supported     |
| Windows runners                             | ❌ Not supported |
| macOS runners                               | ❌ Not supported |

> **Note**: Docker container actions only run on Linux-based runners.

## Usage

```yaml
name: Run AI Workflow

on:
  push:
    branches: [main]

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run AI Workflow
        uses: owner/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/my-workflow.md'
          prompt: 'Process this repository'
          env_vars: '{"API_KEY": "${{ secrets.API_KEY }}"}'
          timeout_minutes: '30'
```

## Inputs

| Input             | Description                                                  | Required | Default |
| ----------------- | ------------------------------------------------------------ | -------- | ------- |
| `workflow_path`   | Path to the workflow.md file (relative to workspace root)    | Yes      | -       |
| `prompt`          | Input prompt to pass to the workflow (max 100KB)             | No       | `''`    |
| `env_vars`        | JSON object of environment variables (max 64KB, 100 entries) | No       | `'{}'`  |
| `timeout_minutes` | Maximum execution time in minutes                            | No       | `30`    |

## Outputs

| Output   | Description                                                       |
| -------- | ----------------------------------------------------------------- |
| `status` | Execution status: `success`, `failure`, `cancelled`, or `timeout` |
| `result` | Workflow execution result as JSON string (max 900KB)              |

## Security

### Secret Handling

All values in `env_vars` are automatically masked in logs using GitHub's secret masking. Sensitive data will appear as `***` in workflow logs.

### Path Validation

The action validates workflow paths to prevent directory traversal attacks:

- Absolute paths are rejected
- Parent directory references (`../`) are blocked
- Symlinks pointing outside the workspace are rejected

### Input Limits

| Input                  | Limit            |
| ---------------------- | ---------------- |
| `workflow_path` length | 1,024 characters |
| `prompt` size          | 100 KB           |
| `env_vars` JSON size   | 64 KB            |
| `env_vars` entry count | 100 entries      |
| `result` output size   | 900 KB           |

## Development

### Prerequisites

- Node.js 20+
- Docker
- npm

### Setup

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

# Run integration tests
DOCKER_IMAGE=ai-workflow-runner:local npm run test:integration
```

### Project Structure

```
ai-workflow-runner/
├── src/
│   ├── index.ts          # Main entry point
│   ├── runner.ts         # Workflow runner
│   ├── config.ts         # Input parsing and validation
│   ├── security.ts       # Path sanitization, secret masking
│   └── types.ts          # TypeScript types
├── dist/                 # Compiled output (committed to git)
├── __tests__/
│   ├── unit/             # Unit tests
│   └── integration/      # Docker tests
├── .github/workflows/    # CI/CD workflows
├── action.yml            # Action metadata
├── Dockerfile            # Multi-runtime container
└── entrypoint.sh         # Shell wrapper
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.
