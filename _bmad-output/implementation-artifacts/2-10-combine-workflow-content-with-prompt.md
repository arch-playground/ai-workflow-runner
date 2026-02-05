# Story 2.10: Combine Workflow Content with Prompt

Status: done

## Story

As a **GitHub Actions user**,
I want **workflow content combined with my prompt**,
So that **the AI receives full context**.

## Acceptance Criteria

1. **Given** workflow file content and user prompt **When** `runWorkflow()` composes the prompt **Then** format is `{workflowContent}\n\n---\n\nUser Input:\n{userPrompt}`

2. **Given** workflow file content without user prompt **When** `runWorkflow()` composes the prompt **Then** only workflow content is used

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Review existing runWorkflow() in runner.ts** (AC: 1, 2)
  - [x] Understand current workflow file reading logic
  - [x] Identify where prompt composition should occur
  - [x] Review existing validation and error handling

- [x] **Task 3: Implement prompt composition logic** (AC: 1, 2)
  - [x] Read workflow file content (already implemented)
  - [x] Check if user prompt is provided (non-empty string)
  - [x] If prompt exists: combine with separator
  - [x] If no prompt: use workflow content only
  - [x] Log prompt info (length, presence)

- [x] **Task 4: Implement OpenCodeService integration** (AC: 1, 2)
  - [x] Get OpenCodeService instance via `getOpenCodeService()`
  - [x] Pass composed prompt to `runSession()`
  - [x] Handle session result and return RunnerResult

- [x] **Task 5: Create unit tests** (AC: 1, 2)
  - [x] Test workflow + prompt combination
  - [x] Test workflow only (no prompt)
  - [x] Test empty prompt treated as no prompt
  - [x] Mock OpenCodeService for isolated testing

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/runner.ts` - Workflow execution engine
- **Result Pattern**: Returns `RunnerResult` for expected failures
- **Service Access**: Uses singleton pattern via `getOpenCodeService()`

### Technical Requirements

- Import `getOpenCodeService` from `./opencode.js`
- Separator format: `\n\n---\n\nUser Input:\n`
- Empty string prompt should be treated as no prompt

### Implementation Pattern

```typescript
// In runWorkflow() after reading workflow file:
const workflowContent = fs.readFileSync(validationResult.absolutePath!, 'utf8');

if (!workflowContent.trim()) {
  return {
    success: false,
    output: '',
    error: 'Workflow file is empty',
  };
}

// Compose prompt based on user input
const fullPrompt = inputs.prompt
  ? `${workflowContent}\n\n---\n\nUser Input:\n${inputs.prompt}`
  : workflowContent;

core.info(`Executing workflow: ${inputs.workflowPath}`);
if (inputs.prompt) {
  core.info(`Prompt provided: ${inputs.prompt.length} characters`);
}
core.info(`Environment variables: ${Object.keys(inputs.envVars).length} entries`);

// Execute via OpenCode SDK
const opencode = getOpenCodeService();
let session: OpenCodeSession;

try {
  session = await opencode.runSession(fullPrompt, timeoutMs, abortSignal);
  // ... validation loop if configured
  // ... return success result
} catch (error) {
  // ... handle errors
}
```

### Prompt Format

**With user prompt:**

```
# My Workflow

This is the workflow content from the .md file.

## Instructions
1. Do something
2. Do something else

---

User Input:
Please focus on step 2 and add error handling.
```

**Without user prompt:**

```
# My Workflow

This is the workflow content from the .md file.

## Instructions
1. Do something
2. Do something else
```

### Result Format

Success:

```typescript
{
  success: true,
  output: JSON.stringify({
    sessionId: 'abc123',
    lastMessage: 'AI response...'
  })
}
```

Failure:

```typescript
{
  success: false,
  output: '',
  error: 'Workflow file not found: path/to/file.md'
}
```

### Cross-Story Dependencies

- Depends on Epic 1 stories (workflow file validation)
- Uses Story 2.1-2.3 (OpenCodeService, session creation)
- Integrates with Epic 3 (validation loop)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Module Architecture]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6 - Combine workflow + prompt]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.10]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- Prompt composition at `src/runner.ts:44-46`
- Uses separator: `\n\n---\n\nUser Input:\n`
- Gets OpenCodeService via `getOpenCodeService()` at line 54
- Passes composed prompt to `runSession()` at line 58
- Logs prompt info at lines 48-52
- Test "sends workflow content as prompt to OpenCode" passes
- Test "combines workflow and user prompt" passes
- Test "handles workflow without prompt" passes

### Acceptance Criteria Verification

| AC  | Requirement                               | Implementation        | Verified                                                      |
| --- | ----------------------------------------- | --------------------- | ------------------------------------------------------------- |
| AC1 | Workflow + prompt combined with separator | `src/runner.ts:44-46` | ✅ Test "combines workflow and user prompt" passes            |
| AC2 | Workflow only used when no prompt         | `src/runner.ts:44-46` | ✅ Test "sends workflow content as prompt to OpenCode" passes |

### File List

- `src/runner.ts` (modified) - Added prompt composition and OpenCodeService integration
- `src/runner.spec.ts` (modified) - Added prompt composition tests
