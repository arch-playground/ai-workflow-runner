# Story 1.2: Create Action Metadata

Status: done

## Story

As a **GitHub Actions user**,
I want **a properly configured action.yml file**,
So that **the action can be discovered and used in workflows**.

## Acceptance Criteria

1. **Given** the action.yml file **When** it is parsed by GitHub Actions **Then** it defines input `workflow_path` as required

2. **Given** the action.yml file **When** it is parsed **Then** it defines input `prompt` as optional with empty default

3. **Given** the action.yml file **When** it is parsed **Then** it defines input `env_vars` as optional with '{}' default

4. **Given** the action.yml file **When** it is parsed **Then** it defines input `timeout_minutes` as optional with '30' default

5. **Given** the action.yml file **When** it is parsed **Then** it defines outputs `status` and `result`

6. **Given** the action.yml file **When** it is parsed **Then** it specifies Docker container execution using Dockerfile

7. **Given** the action.yml file **When** it is parsed **Then** it includes branding with play-circle icon and green color

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read GitHub Actions action.yml specification
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md`

- [x] **Task 2: Create action.yml file** (AC: All)
  - [x] Create file at repository root: `action.yml`
  - [x] Add action name: 'AI Workflow Runner'
  - [x] Add description: 'Run AI workflows with Node.js, Python, and Java runtime support'
  - [x] Add author: 'TanNT'

- [x] **Task 3: Define inputs section** (AC: 1, 2, 3, 4)
  - [x] Define `workflow_path` (required) - Path to workflow.md file
  - [x] Define `prompt` (optional, default: '') - Input prompt to pass to workflow
  - [x] Define `env_vars` (optional, default: '{}') - JSON object of environment variables
  - [x] Define `timeout_minutes` (optional, default: '30') - Maximum execution time
  - [x] Define `validation_script` (optional, default: '') - Validation script path or inline
  - [x] Define `validation_script_type` (optional, default: '') - Script type (python/javascript)
  - [x] Define `validation_max_retry` (optional, default: '5') - Max retry attempts

- [x] **Task 4: Define outputs section** (AC: 5)
  - [x] Define `status` output - Execution status (success, failure, cancelled, timeout)
  - [x] Define `result` output - Workflow execution result as JSON string

- [x] **Task 5: Configure runtime** (AC: 6)
  - [x] Set `runs.using` to 'docker'
  - [x] Set `runs.image` to 'Dockerfile'

- [x] **Task 6: Add branding** (AC: 7)
  - [x] Set `branding.icon` to 'play-circle'
  - [x] Set `branding.color` to 'green'

- [x] **Final Task: Quality Checks**
  - [x] Validate YAML syntax
  - [x] Test action discovery locally if possible

## Dev Notes

### Architecture Compliance

- **File Location**: `action.yml` at repository root (GitHub Actions requirement)
- **Format**: YAML with proper indentation (2 spaces)
- **Encoding**: UTF-8

### Input Specifications

| Input                    | Required | Default | Constraints                           |
| ------------------------ | -------- | ------- | ------------------------------------- |
| `workflow_path`          | Yes      | -       | Relative path, max 1024 chars         |
| `prompt`                 | No       | ''      | Max 100KB                             |
| `env_vars`               | No       | '{}'    | Valid JSON, max 64KB, max 100 entries |
| `timeout_minutes`        | No       | '30'    | 1-360 minutes                         |
| `validation_script`      | No       | ''      | File path or inline with prefix       |
| `validation_script_type` | No       | ''      | 'python' or 'javascript'              |
| `validation_max_retry`   | No       | '5'     | 1-20                                  |

### Output Specifications

| Output   | Type   | Description                                          |
| -------- | ------ | ---------------------------------------------------- |
| `status` | string | One of: 'success', 'failure', 'cancelled', 'timeout' |
| `result` | string | JSON with sessionId and lastMessage, or error object |

### Technical Requirements

- All input descriptions should include constraints
- Default values must be strings (GitHub Actions requirement)
- Docker image path is relative to repository root

### Project Structure Notes

```
ai-workflow-runner/
├── action.yml        ← This story creates this file
├── Dockerfile        ← Referenced by action.yml
├── src/
│   └── ...
└── dist/
    └── index.js      ← Executed by Docker container
```

### References

- [Source: _bmad-output/planning-artifacts/prd.md#Action Interface]
- [Source: _bmad-output/planning-artifacts/architecture.md#GitHub Action Output Format]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- Created action.yml at repository root with all required GitHub Actions metadata
- All 7 inputs defined with proper descriptions and defaults
- Both outputs (status, result) defined
- Docker runtime configured pointing to Dockerfile
- Branding configured with play-circle icon and green color
- YAML syntax validated

### File List

- action.yml (created)
