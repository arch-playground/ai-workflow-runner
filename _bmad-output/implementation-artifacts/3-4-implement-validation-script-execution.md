# Story 3.4: Implement Validation Script Execution

Status: done

## Story

As a **GitHub Actions user**,
I want **validation scripts executed**,
So that **I can verify AI workflow outputs**.

## Acceptance Criteria

1. **Given** file-based validation script
   **When** executeValidationScript() is called
   **Then** script path is validated within workspace
   **And** script is executed with appropriate interpreter

2. **Given** inline validation script
   **When** executeValidationScript() is called
   **Then** temp file is created with randomUUID name
   **And** file has 0o600 permissions (owner read/write only)
   **And** temp file is cleaned up after execution

3. **Given** AI_LAST_MESSAGE
   **When** script executes
   **Then** env var is passed with last AI message
   **And** null bytes are stripped from message

4. **Given** user envVars
   **When** script executes
   **Then** envVars are passed to child process
   **And** process.env is not polluted

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Cleanup patterns
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Temp file permissions
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - Async cleanup tests

- [x] Task 2: Define ValidationInput interface (AC: All)
  - [x] script: string
  - [x] scriptType?: ValidationScriptType
  - [x] lastMessage: string
  - [x] workspacePath: string
  - [x] envVars: Record<string, string>
  - [x] abortSignal?: AbortSignal

- [x] Task 3: Implement file-based script validation (AC: 1)
  - [x] Call `validateWorkspacePath()` to check script is within workspace
  - [x] Check file exists with `fs.existsSync()`
  - [x] Throw error if script not found

- [x] Task 4: Implement inline script temp file creation (AC: 2)
  - [x] Generate temp file path with `randomUUID()` and appropriate extension
  - [x] Use `fs.openSync()` with `O_WRONLY | O_CREAT | O_EXCL` flags (atomic create)
  - [x] Set permissions to 0o600 (owner read/write only)
  - [x] Write script content and close file descriptor

- [x] Task 5: Implement AI_LAST_MESSAGE environment variable (AC: 3)
  - [x] Strip null bytes from lastMessage using regex
  - [x] Truncate to MAX_LAST_MESSAGE_SIZE if needed
  - [x] Add truncation indicator `...[truncated]`
  - [x] Set AI_LAST_MESSAGE in child environment

- [x] Task 6: Implement isolated child environment (AC: 4)
  - [x] Create minimal essential env vars (PATH, HOME, LANG, TERM)
  - [x] Merge user envVars into child env
  - [x] Do NOT spread process.env (security: prevents leaking GH secrets)
  - [x] Pass combined env only to child process

- [x] Task 7: Implement temp file cleanup (AC: 2)
  - [x] Use try-finally block to ensure cleanup
  - [x] Check if temp file exists before unlinking
  - [x] Clean up even if script execution fails

- [x] Task 8: Write comprehensive unit tests (AC: All)
  - [x] Test JavaScript file script execution
  - [x] Test Python file script execution
  - [x] Test inline script creates temp file
  - [x] Test temp file has correct permissions (0o600)
  - [x] Test temp file is cleaned up after success
  - [x] Test temp file is cleaned up after failure
  - [x] Test AI_LAST_MESSAGE is passed correctly
  - [x] Test user envVars are passed correctly
  - [x] Test process.env is not polluted
  - [x] Test null bytes are stripped from message
  - [x] Test path validation rejects traversal attempts
  - [x] Test script not found throws error

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/validation.ts` - `executeValidationScript()` function
- Security helper: `src/security.ts` - `validateWorkspacePath()` import
- Unit tests: `src/validation.spec.ts`

### Architecture Compliance

- Use try-finally for cleanup (not try-catch-finally, let errors bubble)
- Validate paths before file operations
- Isolated child process environment (defense-in-depth)

### Technical Requirements

- Atomic temp file creation with O_EXCL flag prevents TOCTOU race conditions
- 0o600 permissions ensure only runner can read script content
- Null byte stripping prevents injection attacks

### Code Patterns

```typescript
export interface ValidationInput {
  script: string;
  scriptType?: ValidationScriptType;
  lastMessage: string;
  workspacePath: string;
  envVars: Record<string, string>;
  abortSignal?: AbortSignal;
}

export async function executeValidationScript(input: ValidationInput): Promise<ValidationOutput> {
  const detection = detectScriptType(input.script, input.scriptType);

  // Check interpreter
  const command = detection.type === 'python' ? 'python3' : 'node';
  const isAvailable = await checkInterpreterAvailable(command);
  if (!isAvailable) {
    throw new Error(`${command} interpreter not found...`);
  }

  let scriptPath: string;
  let tempFile: string | null = null;

  if (detection.isInline) {
    // Create temp file with secure permissions
    const ext = detection.type === 'python' ? '.py' : '.js';
    tempFile = path.join(os.tmpdir(), `validation-${randomUUID()}${ext}`);
    const fd = fs.openSync(
      tempFile,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
    fs.writeSync(fd, detection.code, 0, 'utf8');
    fs.closeSync(fd);
    scriptPath = tempFile;
  } else {
    scriptPath = validateWorkspacePath(input.workspacePath, detection.code);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Validation script not found: ${detection.code}`);
    }
  }

  try {
    const output = await runScript(
      command,
      scriptPath,
      input.lastMessage,
      input.envVars,
      input.abortSignal
    );
    return parseValidationOutput(output);
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}
```

### Child Environment Pattern

```typescript
// Essential env vars only - prevents leaking GH Actions secrets
const essentialEnvVars: Record<string, string> = {
  PATH: process.env['PATH'] || '',
  HOME: process.env['HOME'] || '',
  LANG: process.env['LANG'] || 'en_US.UTF-8',
  TERM: process.env['TERM'] || 'xterm',
};
const childEnv = { ...essentialEnvVars, ...envVars, AI_LAST_MESSAGE: sanitizedLastMessage };
```

### References

- [Source: src/validation.ts#executeValidationScript] - Main implementation
- [Source: src/validation.ts#runScript] - Child process spawning
- [Source: src/security.ts#validateWorkspacePath] - Path validation
- [Source: _bmad-output/planning-artifacts/architecture.md#Security Architecture] - Defense-in-depth

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- Interface defined at `src/validation.ts:10-17`
- Main function implemented at `src/validation.ts:92-136`
- All 4 acceptance criteria verified
- 18 unit tests in `src/validation.spec.ts:121-318`

### File List

- `src/validation.ts` - Added ValidationInput interface and executeValidationScript() function
- `src/validation.spec.ts` - Added comprehensive execution tests

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- All acceptance criteria implemented and verified
- Security measures properly implemented (O_EXCL, 0o600, isolated env)
- Status updated from ready-for-dev to done
