# Story 3.7: Implement Output Size Limits

Status: done

## Story

As a **developer**,
I want **output size limited**,
So that **huge outputs don't cause memory issues**.

## Acceptance Criteria

1. **Given** script output exceeds MAX_VALIDATION_OUTPUT_SIZE (100KB)
   **When** output is captured
   **Then** output is truncated
   **And** warning is logged

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/logging.md` - Truncation warning patterns
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - Large data tests

- [x] Task 2: Add output size constants (AC: 1)
  - [x] Add `MAX_VALIDATION_OUTPUT_SIZE: 102_400` (100KB) to INPUT_LIMITS
  - [x] Add `MAX_LAST_MESSAGE_SIZE: 102_400` (100KB) for AI_LAST_MESSAGE truncation

- [x] Task 3: Implement stdout truncation (AC: 1)
  - [x] Track total output size as data arrives
  - [x] Stop appending to stdout when limit reached
  - [x] Track if truncation occurred with flag

- [x] Task 4: Implement stderr size limit (AC: 1)
  - [x] Limit stderr to reasonable size (10KB for error messages)
  - [x] Truncate on arrival to prevent memory issues

- [x] Task 5: Log truncation warning (AC: 1)
  - [x] On process close, check if truncation occurred
  - [x] Log warning with size limit information
  - [x] Include `[Validation]` prefix

- [x] Task 6: Implement AI_LAST_MESSAGE truncation (AC: 1)
  - [x] Check lastMessage length against MAX_LAST_MESSAGE_SIZE
  - [x] Truncate and add '...[truncated]' indicator
  - [x] This was covered in Story 3.4 but verify it works with output limits

- [x] Task 7: Write unit tests (AC: 1)
  - [x] Test output within limit is not truncated
  - [x] Test output exceeding limit is truncated
  - [x] Test warning is logged for truncation
  - [x] Test large AI_LAST_MESSAGE is truncated

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Implementation Location

- Primary file: `src/validation.ts` - Output handling in `runScript()`
- Constants: `src/types.ts` - Size limit constants
- Unit tests: `src/validation.spec.ts`

### Architecture Compliance

- Memory-efficient streaming truncation
- Warning logged for user visibility
- Consistent truncation indicator `...[truncated]`

### Technical Requirements

- 100KB limit for validation script output
- 100KB limit for AI_LAST_MESSAGE
- 10KB limit for stderr (error messages)
- Streaming truncation (don't buffer entire output first)

### Code Patterns

```typescript
// In runScript()
let outputSize = 0;
let outputTruncated = false;
const maxOutputSize = INPUT_LIMITS.MAX_VALIDATION_OUTPUT_SIZE;

child.stdout?.on('data', (data: Buffer) => {
  const chunk = data.toString();
  if (outputSize < maxOutputSize) {
    const remaining = maxOutputSize - outputSize;
    stdout += chunk.substring(0, remaining);
    if (chunk.length > remaining) {
      outputTruncated = true;
    }
  } else if (!outputTruncated) {
    outputTruncated = true;
  }
  outputSize += chunk.length;
});

// Limit stderr separately
child.stderr?.on('data', (data: Buffer) => {
  if (stderr.length < 10000) {
    stderr += data.toString().substring(0, 10000 - stderr.length);
  }
});

// Log warning on close
child.on('close', (code) => {
  // ...
  if (outputTruncated) {
    core.warning(`[Validation] Script output truncated (exceeded ${maxOutputSize} bytes)`);
  }
  // ...
});
```

### AI_LAST_MESSAGE Truncation

```typescript
let sanitizedLastMessage = lastMessage.replace(/\x00/g, '');
if (sanitizedLastMessage.length > INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) {
  sanitizedLastMessage =
    sanitizedLastMessage.substring(0, INPUT_LIMITS.MAX_LAST_MESSAGE_SIZE) + '...[truncated]';
}
```

### Size Limit Constants

```typescript
// In INPUT_LIMITS
MAX_VALIDATION_OUTPUT_SIZE: 102_400, // 100KB
MAX_LAST_MESSAGE_SIZE: 102_400, // 100KB
```

### Warning Message

```typescript
core.warning(`[Validation] Script output truncated (exceeded ${maxOutputSize} bytes)`);
```

### References

- [Source: src/validation.ts#runScript] - Output capture implementation
- [Source: src/types.ts#INPUT_LIMITS] - Size constants
- [Source: _bmad-output/planning-artifacts/architecture.md#INPUT_LIMITS] - Size limit strategy

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues

### Completion Notes List

- Constants added at `src/types.ts:53-54`
- Streaming truncation implemented at `src/validation.ts:197-213`
- stderr limit implemented at `src/validation.ts:215-219`
- Warning logging at `src/validation.ts:226-228`
- AI_LAST_MESSAGE truncation at `src/validation.ts:147-151`
- Acceptance criterion verified
- Tests in `src/validation.spec.ts:398-417`

### File List

- `src/types.ts` - Added MAX_VALIDATION_OUTPUT_SIZE, MAX_LAST_MESSAGE_SIZE constants
- `src/validation.ts` - Added streaming truncation in runScript()
- `src/validation.spec.ts` - Added truncation tests

## Code Review Record

### Review Date

2026-02-05

### Reviewer

Claude Opus 4.5 (Code Review Agent)

### Findings

- Acceptance criterion implemented and verified
- Memory-efficient streaming truncation correctly implemented
- Status updated from ready-for-dev to done
