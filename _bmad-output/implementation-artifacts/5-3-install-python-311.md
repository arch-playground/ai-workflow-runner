# Story 5.3: Install Python 3.11

Status: done

## Story

As a **GitHub Actions user**,
I want **Python 3.11 available in the Docker image**,
So that **Python-based validation scripts and workflows work correctly**.

## Acceptance Criteria

1. **Given** the Docker image
   **When** `python3.11 --version` is run
   **Then** version 3.11.x is returned

2. **Given** Python 3.11 installation
   **When** a Python validation script is executed
   **Then** it runs successfully with `python3` or `python3.11` command

3. **Given** the runtime stage
   **When** Python is installed
   **Then** `python3.11` executable is available
   **And** `python3.11-venv` is installed for virtual environment support
   **And** basic pip functionality is available

4. **Given** a validation script with Python prefix
   **When** `python:import os; print(os.environ.get('AI_LAST_MESSAGE', ''))` is provided
   **Then** the script executes correctly using Python interpreter

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing Python installation in `Dockerfile`
  - [x] Review `src/validation.ts` for Python script execution requirements

- [x] **Task 2: Install Python in Builder Stage** (AC: 1, 3)
  - [x] Install `python3.11` from Debian repositories
  - [x] Install `python3.11-venv` for virtual environment support
  - [x] Install `python3-pip` for package management

- [x] **Task 3: Copy Python to Runtime Stage** (AC: 1, 3)
  - [x] Install `python3.11` in runtime stage (from Debian repos, not copied)
  - [x] Install `python3.11-venv` for users who need virtual environments
  - [x] Note: Python is installed directly in runtime, not copied from builder

- [x] **Task 4: Verify Installation** (AC: 1, 2, 4)
  - [x] Add `RUN python3.11 --version` verification step
  - [x] Test running a simple Python script
  - [x] Verify `python3` symlink points to Python 3.11

- [x] **Final Task: Quality Checks**
  - [x] Ensure minimal Python installation (no unnecessary packages)
  - [x] Verify Python can access environment variables for validation scripts

### Review Follow-ups (AI) - RESOLVED

- [x] [AI-Review][MEDIUM] AC#3: pip installed in runtime stage - added python3-pip [Dockerfile:43]
- [x] [AI-Review][LOW] AC#2: `python3` symlink created pointing to python3.11 [Dockerfile:44]

## Dev Notes

### Architecture Requirements

- Python 3.11 is required for validation script execution (FR20)
- Validation scripts receive `AI_LAST_MESSAGE` environment variable
- Scripts output to stdout for success/failure determination

### Validation Script Execution Pattern

From `src/validation.ts`:

```typescript
// Python scripts are executed with:
spawn('python3', [scriptPath], {
  env: { ...process.env, AI_LAST_MESSAGE: lastMessage },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

### Why Python 3.11?

- Debian Bookworm ships with Python 3.11 as default
- No need for external repositories (unlike Node.js)
- Good balance of features and stability

### Implementation Pattern

```dockerfile
# In builder stage
RUN apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip

# In runtime stage (installed directly, not copied)
RUN apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv
```

### Project Structure Notes

- Python is used exclusively for validation scripts
- No Python packages are pre-installed (users can use venv if needed)
- The validation module detects Python scripts by `.py` extension or `python:` prefix

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Technology Stack]
- [Source: _bmad-output/planning-artifacts/prd.md#Action Interface]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3]
- [Source: src/validation.ts - Python script execution logic]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation exists in Dockerfile lines 14-16 (builder) and 38-46 (runtime)
- Python 3.11 installed from Debian repos (no external repository needed)
- pip installed in runtime stage for package management
- `python3` symlink created pointing to `python3.11`
- Verified via `RUN python3.11 --version && python3 --version` in Dockerfile:65-66

### File List

- `Dockerfile` - Contains Python 3.11 installation
