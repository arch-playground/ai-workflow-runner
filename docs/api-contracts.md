# AI Workflow Runner - API Contracts

## GitHub Action Interface

### Inputs

| Input                    | Type        | Required | Default | Description                                                  |
| ------------------------ | ----------- | -------- | ------- | ------------------------------------------------------------ |
| `workflow_path`          | string      | **Yes**  | -       | Path to the workflow.md file (relative to workspace root)    |
| `prompt`                 | string      | No       | `''`    | Input prompt to pass to the workflow (max 100KB)             |
| `env_vars`               | JSON string | No       | `'{}'`  | JSON object of environment variables (max 64KB, 100 entries) |
| `timeout_minutes`        | number      | No       | `30`    | Maximum execution time in minutes (1-360)                    |
| `validation_script`      | string      | No       | -       | Validation script path or inline code                        |
| `validation_script_type` | string      | No       | -       | Script type: `python` or `javascript` (auto-detected)        |
| `validation_max_retry`   | number      | No       | `5`     | Maximum validation retry attempts (1-20)                     |

### Outputs

| Output   | Type        | Description                                                       |
| -------- | ----------- | ----------------------------------------------------------------- |
| `status` | string      | Execution status: `success`, `failure`, `cancelled`, or `timeout` |
| `result` | JSON string | Workflow execution result (max 900KB)                             |

### Result Format

```json
{
  "sessionId": "ses_abc123...",
  "lastMessage": "AI response content..."
}
```

On error:

```json
{
  "error": "Error message..."
}
```

On cancellation:

```json
{
  "cancelled": true
}
```

---

## Input Validation Rules

### workflow_path

| Rule         | Constraint                                                 |
| ------------ | ---------------------------------------------------------- |
| Required     | Yes                                                        |
| Max length   | 1,024 characters                                           |
| Format       | Relative path only                                         |
| Restrictions | No `..`, no absolute paths, no symlinks escaping workspace |

### prompt

| Rule     | Constraint             |
| -------- | ---------------------- |
| Required | No                     |
| Max size | 100,000 bytes (100 KB) |
| Format   | UTF-8 string           |

### env_vars

| Rule         | Constraint                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Required     | No                                                                                                                  |
| Max size     | 65,536 bytes (64 KB)                                                                                                |
| Max entries  | 100                                                                                                                 |
| Key format   | `[a-zA-Z_][a-zA-Z0-9_]*`                                                                                            |
| Value type   | String only                                                                                                         |
| Blocked keys | `PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `NODE_OPTIONS`, `PYTHONPATH`, `JAVA_TOOL_OPTIONS`, `JAVA_HOME`, `GITHUB_*` |

### timeout_minutes

| Rule     | Constraint       |
| -------- | ---------------- |
| Required | No               |
| Default  | 30               |
| Min      | 1                |
| Max      | 360 (6 hours)    |
| Type     | Positive integer |

### validation_script

| Rule     | Constraint                                                           |
| -------- | -------------------------------------------------------------------- |
| Required | No                                                                   |
| Max size | 102,400 bytes (100 KB)                                               |
| Formats  | File path (`.py`, `.js`) or inline (`python:`, `javascript:`, `js:`) |
| Blocked  | `.sh`, `.bash`, `.ts` files                                          |

### validation_max_retry

| Rule     | Constraint       |
| -------- | ---------------- |
| Required | No               |
| Default  | 5                |
| Min      | 1                |
| Max      | 20               |
| Type     | Positive integer |

---

## Validation Script Contract

### Environment Variables

| Variable          | Description                                  |
| ----------------- | -------------------------------------------- |
| `AI_LAST_MESSAGE` | The AI's last response (truncated to ~100KB) |
| User-defined vars | All variables from `env_vars` input          |

### Output Contract

| Output                    | Meaning                                         |
| ------------------------- | ----------------------------------------------- |
| Empty string              | **Success** - workflow complete                 |
| `true` (case-insensitive) | **Success** - workflow complete                 |
| Any other string          | **Failure** - string used as feedback for retry |

### Execution Constraints

| Constraint      | Value                   |
| --------------- | ----------------------- |
| Timeout         | 60 seconds              |
| Max output size | 100 KB                  |
| Interpreters    | Python 3.11, Node.js 20 |

### Script Detection

| Pattern          | Type              |
| ---------------- | ----------------- |
| `*.py`           | Python            |
| `*.js`           | JavaScript        |
| `python:...`     | Inline Python     |
| `javascript:...` | Inline JavaScript |
| `js:...`         | Inline JavaScript |

---

## Internal Module Interfaces

### ActionInputs

```typescript
interface ActionInputs {
  workflowPath: string;
  prompt: string;
  envVars: Record<string, string>;
  timeoutMs: number;
  validationScript?: string;
  validationScriptType?: 'python' | 'javascript';
  validationMaxRetry: number;
}
```

### RunnerResult

```typescript
interface RunnerResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}
```

### OpenCodeSession

```typescript
interface OpenCodeSession {
  sessionId: string;
  lastMessage: string;
}
```

### ValidationOutput

```typescript
interface ValidationOutput {
  success: boolean;
  continueMessage: string;
}
```

### ValidationInput

```typescript
interface ValidationInput {
  script: string;
  scriptType?: 'python' | 'javascript';
  lastMessage: string;
  workspacePath: string;
  envVars: Record<string, string>;
  abortSignal?: AbortSignal;
}
```

---

## System Constants (INPUT_LIMITS)

```typescript
const INPUT_LIMITS = {
  MAX_WORKFLOW_PATH_LENGTH: 1024,
  MAX_PROMPT_LENGTH: 100_000,
  MAX_ENV_VARS_SIZE: 65_536,
  MAX_ENV_VARS_COUNT: 100,
  MAX_OUTPUT_SIZE: 900_000,
  MAX_WORKFLOW_FILE_SIZE: 10_485_760, // 10MB
  DEFAULT_TIMEOUT_MINUTES: 30,
  MAX_TIMEOUT_MINUTES: 360, // 6 hours
  MAX_VALIDATION_RETRY: 20,
  DEFAULT_VALIDATION_RETRY: 5,
  VALIDATION_SCRIPT_TIMEOUT_MS: 60_000, // 60s
  INTERPRETER_CHECK_TIMEOUT_MS: 5_000, // 5s
  MAX_VALIDATION_OUTPUT_SIZE: 102_400, // 100KB
  MAX_LAST_MESSAGE_SIZE: 102_400, // 100KB
  MAX_INLINE_SCRIPT_SIZE: 102_400, // 100KB
};
```

---

## Error Codes

| Error Type        | Message Pattern                                                                         |
| ----------------- | --------------------------------------------------------------------------------------- |
| Missing input     | `workflow_path is required and cannot be empty`                                         |
| Path too long     | `workflow_path exceeds maximum length of 1024`                                          |
| Invalid path      | `Invalid workflow path: absolute paths and parent directory references are not allowed` |
| File not found    | `Workflow file not found: {path}`                                                       |
| Empty file        | `Workflow file is empty`                                                                |
| Invalid JSON      | `env_vars must be a valid JSON object`                                                  |
| Reserved var      | `env_vars cannot override reserved variable: {key}`                                     |
| GitHub var        | `env_vars cannot override GitHub Actions variable: {key}`                               |
| Invalid key       | `env_vars key "{key}" contains invalid characters`                                      |
| Timeout           | `Workflow execution timed out after {ms}ms`                                             |
| Validation failed | `Validation failed after {n} attempts. Last output: {message}`                          |
| Script error      | `{interpreter} interpreter not found`                                                   |
| Encoding error    | `File is not valid UTF-8: {filename}`                                                   |
| Symlink escape    | `Invalid workflow path: symlink target escapes the workspace directory`                 |

---

## Usage Examples

### Basic Workflow

```yaml
- uses: owner/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/my-workflow.md'
```

### With Prompt and Environment

```yaml
- uses: owner/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/process.md'
    prompt: 'Process the files in /data directory'
    env_vars: '{"API_KEY": "${{ secrets.API_KEY }}"}'
    timeout_minutes: '60'
```

### With Python Validation

```yaml
- uses: owner/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/generate.md'
    prompt: 'Generate a report'
    validation_script: 'scripts/validate.py'
    validation_max_retry: '3'
```

### With Inline JavaScript Validation

```yaml
- uses: owner/ai-workflow-runner@v1
  with:
    workflow_path: 'workflows/task.md'
    validation_script: 'js:console.log(process.env.AI_LAST_MESSAGE.includes("DONE") ? "true" : "Task not complete")'
```

### Reading Outputs

```yaml
- uses: owner/ai-workflow-runner@v1
  id: ai-step
  with:
    workflow_path: 'workflows/analyze.md'

- name: Check result
  run: |
    echo "Status: ${{ steps.ai-step.outputs.status }}"
    echo "Result: ${{ steps.ai-step.outputs.result }}"
```
