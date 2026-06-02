# AI Workflow Runner

A GitHub Action that runs AI workflows using OpenCode SDK with validation script support.

## Features

- **OpenCode SDK Integration**: Runs AI workflows using [@opencode-ai/sdk](https://www.npmjs.com/package/@opencode-ai/sdk)
- **Validation Scripts**: Verify workflow completion with Python or JavaScript scripts
- **Retry Mechanism**: Automatically retry when validation fails with configurable max retries
- **Multi-runtime support**: Node.js 20+, Python 3.11, and Java 21 pre-installed
- **Secure execution**: Path traversal prevention, secret masking, input validation
- **Docker-based**: Consistent environment across all runs
- **Configurable**: Timeout settings, environment variables, input prompts
- **Workflow Creator Skill**: Claude Code skill that guides you through creating multi-job workflows ([docs](docs/workflow-creator.md))

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
      - uses: actions/checkout@v6

      - name: Run AI Workflow
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflows/my-workflow.md'
          prompt: 'Process this repository'
          env_vars: '{"API_KEY": "${{ secrets.API_KEY }}"}'
          timeout_minutes: '30'
          validation_script: 'scripts/validate.py'
          validation_max_retry: '5'
```

### With Custom Provider and Model

```yaml
name: Run AI Workflow with Custom Config

on:
  push:
    branches: [main]

jobs:
  run-workflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Write config files
        run: |
          echo '${{ secrets.OPENCODE_AUTH }}' > ${{ runner.temp }}/auth.json

      - name: Run AI Workflow
        uses: arch-playground/ai-workflow-runner@v1
        with:
          workflow_path: 'workflow.md'
          auth_config: '${{ runner.temp }}/auth.json'
          model: 'anthropic/claude-sonnet-4-5-20250929'

      - name: Cleanup
        if: always()
        run: rm -f ${{ runner.temp }}/auth.json
```

## Inputs

| Input                      | Description                                                                                                                                                                                                              | Required | Default                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------ |
| `workflow_path`            | Path to the workflow.md file (relative to workspace root). Required unless `list_models` is `'true'`.                                                                                                                    | No       | `''`                           |
| `prompt`                   | Input prompt to pass to the workflow (max 100KB)                                                                                                                                                                         | No       | `''`                           |
| `env_vars`                 | JSON object of environment variables (max 64KB, 100 entries)                                                                                                                                                             | No       | `'{}'`                         |
| `timeout_minutes`          | Maximum execution time in minutes                                                                                                                                                                                        | No       | `30`                           |
| `validation_script`        | Validation script path or inline code (see below)                                                                                                                                                                        | No       | `''`                           |
| `validation_script_type`   | Script type: `python` or `javascript` (auto-detected)                                                                                                                                                                    | No       | `''`                           |
| `validation_max_retry`     | Maximum validation retry attempts (1-20)                                                                                                                                                                                 | No       | `5`                            |
| `opencode_config`          | Path to OpenCode config.json file (relative to workspace). Contains provider and model settings.                                                                                                                         | No       | `''`                           |
| `auth_config`              | Path to OpenCode auth.json file (relative to workspace). Contains API keys and authentication. Store in GitHub Secrets, not Variables.                                                                                   | No       | `''`                           |
| `model`                    | Model to use for AI execution (e.g., "anthropic/claude-3-opus"). Overrides config file default.                                                                                                                          | No       | `''`                           |
| `list_models`              | If "true", print available models and exit without running workflow                                                                                                                                                      | No       | `'false'`                      |
| `debug_log`                | Enable verbose debug logging to file. Also activated by `ACTIONS_STEP_DEBUG=true` or `RUNNER_DEBUG=1`.                                                                                                                   | No       | `'false'`                      |
| `debug_log_path`           | Path for debug log file. Defaults to `$RUNNER_TEMP/opencode-debug.log`. Accepts workspace-relative or absolute paths under RUNNER_TEMP/tmp.                                                                              | No       | `''`                           |
| `export_transcript`        | If "true", export the full AI conversation to a JSON file. Use `transcript_json_path` output to upload it as a workflow artifact.                                                                                        | No       | `'false'`                      |
| `write_job_summary`        | If "true", write a GitHub job summary with run status, token/cost totals, tool activity, and the final assistant message.                                                                                                | No       | `'false'`                      |
| `transcript_path`          | Path for the transcript JSON file. Defaults to `$RUNNER_TEMP/conversation.json`. Accepts workspace-relative or absolute under RUNNER_TEMP/tmp.                                                                           | No       | `''`                           |
| `bash_allow_patterns`      | Additional bash command patterns to allow beyond the read-only default set (comma or newline-separated, e.g. `npm test*,npx*`). **Security:** each pattern widens the agent's shell access; use the minimum necessary.   | No       | `''`                           |
| `agent_working_directory`  | Working directory for the agent (workspace-relative path). Confines agent filesystem access to this subtree. Narrower than the workspace root = tighter confinement.                                                     | No       | `''` (workspace root)          |
| `allowed_provider_hosts`   | Additional provider host globs permitted to receive credentials (comma-separated, e.g. `my-gateway.example.com`). Extends the built-in allowlist. **Security:** only add hosts you control and trust with your API keys. | No       | `''` (built-in allowlist only) |
| `webfetch_allowed_domains` | Domains the agent may fetch from (comma-separated, e.g. `github.com,docs.example.com`). Empty = webfetch fully denied. **Security:** each domain widens the agent's network surface; use the minimum necessary.          | No       | `''` (webfetch denied)         |

## Outputs

| Output                 | Description                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `status`               | Execution status: `success`, `failure`, `cancelled`, or `timeout`                                |
| `result`               | Workflow execution result as JSON string (max 900KB)                                             |
| `transcript_json_path` | Resolved path of the exported transcript JSON file. Empty when `export_transcript` is `'false'`. |

## Conversation Logging & Artifacts

Enable transcript export and the job summary to capture the full AI conversation:

```yaml
- name: Run AI workflow
  id: ai-run
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/workflow.md'
    export_transcript: 'true'
    write_job_summary: 'true'

- name: Upload conversation transcript
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: conversation-transcript
    path: ${{ steps.ai-run.outputs.transcript_json_path }}
    if-no-files-found: warn
```

- **`export_transcript`** — writes `conversation.json` (full message array with tool I/O, reasoning, token/cost). Secret values in `env_vars` are scrubbed before writing.
- **`write_job_summary`** — writes a job summary with status, token/cost/duration totals, per-tool activity, and the final assistant message. Secrets scrubbed.
- **`transcript_json_path`** — the resolved path of the JSON file. Pass it to `actions/upload-artifact` to make it downloadable from the Actions run page. (The action itself cannot self-upload artifacts.)

See [`examples/conversation-logging/`](examples/conversation-logging/) for a complete working example.

## Configuration

### Config File Setup

The action supports custom provider and model configuration through JSON config files.

**config.json** — Provider and model settings (non-sensitive, can use GitHub Variables):

```json
{
  "model": "anthropic/claude-sonnet-4-5-20250929"
}
```

> **Important**: Do not put API keys in config.json if you plan to store it in GitHub Variables (`vars.*`). API keys belong in auth.json using GitHub Secrets.

**auth.json** — API keys and authentication (sensitive, must use GitHub Secrets):

```json
{
  "provider": {
    "copilot": {
      "token": "ghu_xxxxx"
    }
  }
}
```

### Writing Config Files from Secrets

Store your configuration in GitHub Secrets and Variables, then write them to files at runtime:

```yaml
steps:
  - uses: actions/checkout@v6

  - name: Write config files
    run: |
      echo '${{ vars.OPENCODE_CONFIG }}' > ${{ runner.temp }}/config.json
      echo '${{ secrets.OPENCODE_AUTH }}' > ${{ runner.temp }}/auth.json

  - name: Run AI Workflow
    uses: arch-playground/ai-workflow-runner@v1
    with:
      workflow_path: 'workflow.md'
      opencode_config: '${{ runner.temp }}/config.json'
      auth_config: '${{ runner.temp }}/auth.json'

  - name: Cleanup config files
    if: always()
    run: rm -f ${{ runner.temp }}/config.json ${{ runner.temp }}/auth.json
```

> **Note**: Use `vars.*` for non-sensitive config and `secrets.*` for auth files containing API keys or tokens. Add a cleanup step with `if: always()` for self-hosted runners.

### GitHub Copilot Setup

To use GitHub Copilot as the AI provider:

1. Generate a personal Copilot token from your GitHub settings (token starts with `ghu_`)
2. Store the token in a GitHub Secret (e.g., `COPILOT_TOKEN`)
3. Create an auth.json with the copilot provider:

```json
{
  "provider": {
    "copilot": {
      "token": "ghu_xxxxx"
    }
  }
}
```

See [`examples/github-copilot/`](examples/github-copilot/) for a complete setup guide.

### Model Selection

Use the `model` input to override the default model from your config file:

```yaml
- name: Run AI Workflow
  uses: arch-playground/ai-workflow-runner@v1
  with:
    workflow_path: 'workflow.md'
    model: 'anthropic/claude-sonnet-4-5-20250929'
```

### Listing Available Models

Set `list_models: 'true'` to print available models and exit without running a workflow. No `workflow_path` is needed when listing models.

```yaml
- name: List Available Models
  uses: arch-playground/ai-workflow-runner@v1
  with:
    list_models: 'true'
    auth_config: '${{ runner.temp }}/auth.json'
```

## Examples

| Example                                         | Description                                         |
| ----------------------------------------------- | --------------------------------------------------- |
| [`basic-workflow/`](examples/basic-workflow/)   | Basic AI workflow with minimal setup                |
| [`with-validation/`](examples/with-validation/) | Validation scripts with Python and retry mechanism  |
| [`github-copilot/`](examples/github-copilot/)   | Using GitHub Copilot as the AI provider             |
| [`custom-model/`](examples/custom-model/)       | Custom model selection and listing available models |

## Security

### Threat Model & Safe Adoption

This section describes the security model and the risks you own as an adopter. The Action implements defense-in-depth controls (env scoping, read-only bash allowlist, filesystem confinement, non-root container, provider URL allowlist, global timeout, inert job summary) but it is **not** a sandbox. The threat model is: layered controls + your GitHub configuration.

#### Minimal `permissions:`

Set the least-privilege `GITHUB_TOKEN` permissions in your calling workflow. The Action does not require write permissions by default:

```yaml
jobs:
  ai-workflow:
    runs-on: ubuntu-latest
    permissions:
      contents: read # minimum; add others only if your workflow/validation needs them
```

Never grant `write` or `admin` permissions unless your workflow explicitly requires them.

#### Never `pull_request_target` + untrusted PR + secrets

Do **not** run this Action in a `pull_request_target` workflow that checks out the PR head while secrets are in scope. `pull_request_target` runs with write permissions and repository secrets — a malicious PR can influence the `workflow_path`, `prompt`, or any file the agent reads. Use `pull_request` (no secrets) or gate carefully with explicit conditions if you must process PRs.

#### Treat these inputs as trusted (code/credential-adjacent)

The following inputs execute code or direct where credentials are sent. **Never source them from untrusted input** (PR titles, issue bodies, user-supplied data):

| Input               | Why it is trusted                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow_path`     | The agent reads and follows this file as instructions                                                                                                                 |
| `prompt`            | Directly influences what the agent does                                                                                                                               |
| `opencode_config`   | Controls provider endpoints — a redirected `baseURL` directs where your API key is sent (validated against a built-in allowlist since 13-4, but the principle stands) |
| `validation_script` | Executes arbitrary Python or JavaScript on the runner                                                                                                                 |
| `auth_config`       | Contains provider API keys                                                                                                                                            |

#### The agent runs code — understand the opt-in surface

By default the agent operates with read-only shell commands (grep, find, cat, ls, etc.), read-only git history, and filesystem access confined to the workspace as a non-root user. Several inputs widen that surface — use them deliberately:

| Input                      | Default posture                              | What it enables                                                                                      |
| -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bash_allow_patterns`      | Read-only commands only; all others denied   | Extend the bash allowlist (e.g. `npm test*`) — each pattern you add is a capability the agent gains  |
| `agent_working_directory`  | Workspace root (`$GITHUB_WORKSPACE`)         | Narrow confinement to a subdirectory; do not set this to a path outside the workspace                |
| `allowed_provider_hosts`   | Built-in allowlist only (major AI providers) | Permit additional provider host globs to receive credentials — verify each added host is trustworthy |
| `webfetch_allowed_domains` | Webfetch fully denied                        | Allow agent to fetch specific domains; each entry widens network surface — add only trusted hosts    |

#### Egress filtering

The Action does not restrict network egress. Validation scripts and the agent can reach the internet. For workflows where network egress must be controlled, use [`step-security/harden-runner`](https://github.com/step-security/harden-runner) or configure runner-level network policy. This is defense-in-depth, not a substitute for the controls above.

#### Store auth in GitHub Secrets, not Variables

`auth_config` (and any file containing API keys) must be written from GitHub **Secrets** (`${{ secrets.* }}`), not GitHub **Variables** (`${{ vars.* }}`). Variables are not encrypted and visible to all workflow runs.

---

### Secret Handling

All values in `env_vars` are automatically masked in logs using GitHub's secret masking. Sensitive data will appear as `***` in workflow logs.

### Path Validation

The action validates workflow paths to prevent directory traversal attacks:

- Absolute paths are rejected
- Parent directory references (`../`) are blocked
- Symlinks pointing outside the workspace are rejected

### Input Limits

| Input                     | Limit            |
| ------------------------- | ---------------- |
| `workflow_path` length    | 1,024 characters |
| `prompt` size             | 100 KB           |
| `env_vars` JSON size      | 64 KB            |
| `env_vars` entry count    | 100 entries      |
| `result` output size      | 900 KB           |
| `validation_script` size  | 100 KB           |
| `validation_max_retry`    | 1-20 attempts    |
| Validation script timeout | 60 seconds       |

## Validation Scripts

Validation scripts verify workflow completion and can trigger retries if the AI output doesn't meet requirements.

### How It Works

1. After each AI workflow execution, the validation script runs
2. The script receives the AI's last message via `AI_LAST_MESSAGE` environment variable
3. Script output determines success:
   - Empty output or `true` → Success (workflow complete)
   - Any other output → Failure (used as feedback for retry)
4. On failure, the feedback is sent back to the AI for correction
5. Process repeats until success or max retries reached

### Script Types

**File-based scripts** (auto-detected by extension):

```yaml
validation_script: 'scripts/validate.py'   # Python
validation_script: 'scripts/validate.js'   # JavaScript
```

**Inline scripts** (prefix determines type):

```yaml
validation_script: 'python:print("true" if "expected" in os.environ["AI_LAST_MESSAGE"] else "Missing expected output")'
validation_script: 'js:console.log(process.env.AI_LAST_MESSAGE.includes("expected") ? "true" : "Missing expected output")'
```

### Example Validation Script (Python)

```python
import os
import json

message = os.environ.get('AI_LAST_MESSAGE', '')

# Check if AI produced valid JSON output
try:
    data = json.loads(message)
    if 'result' in data and data['result']:
        print('true')  # Success
    else:
        print('Missing result field in output')  # Retry with this feedback
except json.JSONDecodeError:
    print('Output is not valid JSON')  # Retry with this feedback
```

### Example Validation Script (JavaScript)

```javascript
const message = process.env.AI_LAST_MESSAGE || '';

// Check if AI completed the expected task
if (message.includes('TASK_COMPLETE') && message.includes('files modified')) {
  console.log('true'); // Success
} else {
  console.log('Task not marked as complete or no files modified'); // Retry
}
```

### Environment Variables Available to Scripts

| Variable          | Description                                  |
| ----------------- | -------------------------------------------- |
| `AI_LAST_MESSAGE` | The AI's last response (truncated to ~100KB) |
| User-defined vars | All variables from `env_vars` input          |

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
├── skills/
│   └── workflow-creator/     # Claude Code skill (see "Claude Code Skill" section)
├── src/
│   ├── index.ts              # Main entry point
│   ├── runner.ts             # Workflow runner
│   ├── config.ts             # Input parsing and validation
│   ├── security.ts           # Path sanitization, secret masking
│   ├── opencode.ts           # OpenCode SDK service
│   ├── validation.ts         # Validation script executor
│   ├── types.ts              # TypeScript types
│   ├── opencode-test-helpers.ts  # OpenCode test utilities
│   └── *.spec.ts             # Co-located unit tests
├── test/
│   ├── e2e/                  # End-to-end tests
│   ├── e2e-fixtures/         # Test fixtures
│   ├── integration/          # Docker integration tests
│   ├── mocks/                # Shared test mocks
│   └── action-yml.test.ts    # Action metadata tests
├── examples/
│   ├── basic-workflow/       # Minimal setup example
│   ├── with-validation/      # Validation + retry example
│   ├── github-copilot/       # Copilot provider example
│   └── custom-model/         # Model selection example
├── docs/                     # Project documentation
├── dist/                     # Compiled output (committed to git)
├── .github/workflows/        # CI/CD workflows
├── action.yml                # Action metadata
├── Dockerfile                # Multi-runtime container
└── entrypoint.sh             # Shell wrapper
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
