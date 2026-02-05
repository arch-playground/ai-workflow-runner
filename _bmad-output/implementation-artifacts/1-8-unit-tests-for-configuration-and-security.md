# Story 1.8: Unit Tests for Configuration and Security

Status: done

## Story

As a **maintainer**,
I want **comprehensive unit tests**,
So that **configuration and security logic is thoroughly validated**.

## Acceptance Criteria

1. **Given** config.spec.ts **When** tests are run **Then** `getInputs()` is tested for valid inputs, invalid JSON, size limits, reserved vars

2. **Given** config.spec.ts **When** tests are run **Then** `validateInputs()` is tested for empty path, path length, prompt size

3. **Given** security.spec.ts **When** tests are run **Then** `validateWorkspacePath()` is tested for valid paths, traversal, absolute paths

4. **Given** security.spec.ts **When** tests are run **Then** `validateRealPath()` is tested for symlink escape

5. **Given** security.spec.ts **When** tests are run **Then** `maskSecrets()` is tested for secret masking

6. **Given** security.spec.ts **When** tests are run **Then** `sanitizeErrorMessage()` is tested for path and secret removal

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern, Jest setup
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance obvious comments
  - [x] Load skill: `typescript-unit-testing` for comprehensive testing guidance

- [x] **Task 2: Create src/config.spec.ts** (AC: 1, 2)
  - [x] Create file at `src/config.spec.ts`
  - [x] Import functions from `./config.js`
  - [x] Mock `@actions/core` module
  - [x] Set up `beforeEach` to clear mocks

- [x] **Task 3: Write getInputs() tests** (AC: 1)
  - [x] Test valid inputs parsing
  - [x] Test default values (prompt, env_vars, timeout)
  - [x] Test env_vars JSON parsing with multiple entries
  - [x] Test secret masking is called
  - [x] Test invalid JSON error
  - [x] Test env_vars size limit (64KB)
  - [x] Test env_vars entry count (100 max)
  - [x] Test non-object type rejection (array, primitive, null)
  - [x] Test non-string value rejection
  - [x] Test empty key rejection
  - [x] Test invalid key characters
  - [x] Test reserved variable blocking (PATH, NODE_OPTIONS, etc.)
  - [x] Test GITHUB\_\* prefix blocking
  - [x] Test case-insensitive reserved var matching
  - [x] Test timeout parsing and millisecond conversion
  - [x] Test timeout validation (positive, max limit)
  - [x] Test validation_script parsing
  - [x] Test validation_script_type validation
  - [x] Test validation_max_retry defaults and range

- [x] **Task 4: Write validateInputs() tests** (AC: 2)
  - [x] Test valid inputs return no errors
  - [x] Test empty workflow_path rejection
  - [x] Test whitespace-only workflow_path rejection
  - [x] Test workflow_path length limit (1024)
  - [x] Test prompt size limit (100KB)

- [x] **Task 5: Create src/security.spec.ts** (AC: 3, 4, 5, 6)
  - [x] Create file at `src/security.spec.ts`
  - [x] Import functions from `./security.js`
  - [x] Mock `@actions/core` module
  - [x] Set up temp directory fixtures for path tests

- [x] **Task 6: Write validateWorkspacePath() tests** (AC: 3)
  - [x] Test valid relative path acceptance
  - [x] Test nested directory path acceptance
  - [x] Test simple filename acceptance
  - [x] Test `./` prefix normalization
  - [x] Test absolute path rejection
  - [x] Test `../` traversal rejection
  - [x] Test path escape via `dir/../../etc/passwd`

- [x] **Task 7: Write validateRealPath() tests** (AC: 4)
  - [x] Create temp directory with test files
  - [x] Test regular file within workspace acceptance
  - [x] Test symlink pointing inside workspace acceptance
  - [x] Test symlink pointing outside workspace rejection
  - [x] Clean up temp files in afterEach

- [x] **Task 8: Write maskSecrets() tests** (AC: 5)
  - [x] Test core.setSecret called for each value
  - [x] Test empty values are skipped
  - [x] Test empty object handling (no calls)

- [x] **Task 9: Write sanitizeErrorMessage() tests** (AC: 6)
  - [x] Test absolute path redaction to `[PATH]`
  - [x] Test long alphanumeric string redaction to `[REDACTED]`
  - [x] Test short strings preserved
  - [x] Test multiple patterns in single message

- [x] **Task 10: Write validateUtf8() tests** (AC: N/A - complete coverage)
  - [x] Test valid UTF-8 with ASCII, Chinese, emoji
  - [x] Test empty buffer handling
  - [x] Test invalid UTF-8 byte sequences rejection
  - [x] Test incomplete UTF-8 sequence rejection

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run test:unit` - Ensure all tests pass
  - [x] Run `npm run test:coverage` - Verify 80%+ coverage
  - [x] Run `npm run lint` - Fix any linting issues

## Dev Notes

### Architecture Compliance

- **File Locations**: `src/config.spec.ts`, `src/security.spec.ts` (co-located with source)
- **Test Framework**: Jest with TypeScript
- **Test Pattern**: AAA (Arrange-Act-Assert)

### Test File Structure

```typescript
// src/config.spec.ts
import { getInputs, validateInputs } from './config.js';

// Mock @actions/core
const mockCore = {
  getInput: jest.fn(),
  setSecret: jest.fn(),
  info: jest.fn(),
};
jest.mock('@actions/core', () => mockCore);

describe('getInputs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse valid inputs correctly', () => {
    // Arrange
    mockCore.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        workflow_path: 'workflow.md',
        prompt: 'test prompt',
        env_vars: '{"KEY": "value"}',
        timeout_minutes: '30',
      };
      return inputs[name] || '';
    });

    // Act
    const result = getInputs();

    // Assert
    expect(result.workflowPath).toBe('workflow.md');
    expect(result.prompt).toBe('test prompt');
    expect(result.envVars).toEqual({ KEY: 'value' });
    expect(result.timeoutMs).toBe(30 * 60 * 1000);
  });
});
```

### Mocking Patterns

```typescript
// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setSecret: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
}));

// Mock fs for file operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  realpathSync: jest.fn(),
  mkdtempSync: jest.fn(),
  writeFileSync: jest.fn(),
  symlinkSync: jest.fn(),
  rmSync: jest.fn(),
}));
```

### Test Coverage Requirements

| Module      | Target Coverage | Key Areas                              |
| ----------- | --------------- | -------------------------------------- |
| config.ts   | 80%+            | Input parsing, validation, error paths |
| security.ts | 80%+            | Path validation, masking, sanitization |

### Fixture Setup for Path Tests

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('validateRealPath', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Tests use tempDir for fixtures
});
```

### Technical Requirements

- Use `jest.fn()` for all mocks
- Use `mockImplementation()` for complex mock behavior
- Use `expect().toThrow()` for error assertions
- Use `expect().toHaveBeenCalledWith()` for call verification
- Clean up all temp files in `afterEach`

### Project Structure Notes

```
src/
├── config.ts
├── config.spec.ts    ← This story creates this file
├── security.ts
├── security.spec.ts  ← This story creates this file
└── ...
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Test Organization]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR18 - Test Coverage]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8]
- [Source: .knowledge-base/technical/standards/testing/unit-testing.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- Created `src/config.spec.ts` with 35+ test cases covering all getInputs() and validateInputs() scenarios
- Created `src/security.spec.ts` with 20+ test cases covering all security functions
- Tests follow AAA pattern (Arrange-Act-Assert)
- Mocked `@actions/core` module for isolation
- Temp directory fixtures for path tests with proper cleanup in afterEach
- Tests cover: valid inputs, error cases, edge cases, reserved vars, case-insensitive matching
- validateUtf8() tests include: valid UTF-8, empty buffer, invalid sequences, incomplete sequences

### File List

- src/config.spec.ts (created)
- src/security.spec.ts (created)
