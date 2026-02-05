# Story 2.7: Implement Permission Auto-Approval

Status: done

## Story

As a **developer**,
I want **permissions auto-approved**,
So that **AI workflows can run without human intervention**.

## Acceptance Criteria

1. **Given** `permission.updated` event **When** `handleEvent()` processes it **Then** permission is approved with response 'always'

2. **Given** permission approval fails **When** error occurs **Then** warning is logged (not thrown)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/backend/error-handling.md` - Error patterns
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments

- [x] **Task 2: Define permission event type** (AC: 1)
  - [x] Add `PERMISSION_UPDATED: 'permission.updated'` to EVENT_TYPES constant

- [x] **Task 3: Implement permission handling in handleEvent()** (AC: 1, 2)
  - [x] Handle `permission.updated` event
  - [x] Extract sessionID and permission id from properties
  - [x] Validate both values exist before proceeding
  - [x] Call SDK to approve permission with response 'always'
  - [x] Use fire-and-forget pattern (void the promise)
  - [x] Catch errors and log as warning

- [x] **Task 4: Create unit tests** (AC: 1, 2)
  - [x] Test permission event triggers auto-approval
  - [x] Test approval failure logs warning
  - [x] Test missing sessionID or id is handled gracefully

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **Non-Blocking**: Permission approval is fire-and-forget
- **Error Handling**: Failures logged as warnings, don't block execution
- **Response Type**: Always use 'always' for automated CI/CD environment

### Technical Requirements

- Use `void` to explicitly mark fire-and-forget async call
- Use `.catch()` pattern for error handling on void promise
- Permission approval uses SDK's `postSessionIdPermissionsPermissionId` method

### Implementation Pattern

```typescript
if (e.type === EVENT_TYPES.PERMISSION_UPDATED) {
  const permission = e.properties as { sessionID?: string; id?: string };

  if (permission.sessionID && permission.id) {
    void client
      .postSessionIdPermissionsPermissionId({
        path: {
          id: permission.sessionID,
          permissionID: permission.id,
        },
        body: { response: 'always' },
      })
      .catch((err) => {
        core.warning(`[OpenCode] Failed to auto-approve permission ${permission.id}: ${err}`);
      });
  }
}
```

### Permission Event Properties

```typescript
interface PermissionEventProperties {
  sessionID?: string; // Session requesting permission
  id?: string; // Permission ID to approve
}
```

### Why 'always' Response

| Response   | Meaning                     | Use Case             |
| ---------- | --------------------------- | -------------------- |
| `'once'`   | Approve this one time       | Interactive CLI      |
| `'always'` | Approve all future requests | Automated CI/CD      |
| `'never'`  | Deny all requests           | Security restriction |

For CI/CD, 'always' ensures the workflow can proceed without further prompts.

### Error Handling Strategy

Permission failures are non-fatal because:

1. The session may still complete successfully
2. Multiple permissions may be requested - one failure shouldn't block others
3. CI/CD should be resilient to transient permission issues

### Cross-Story Dependencies

- Depends on Story 2.8 (event loop for receiving events)
- Part of handleEvent() which handles multiple event types

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- `PERMISSION_UPDATED` event type at `src/opencode.ts:13`
- Permission handling in handleEvent() at lines 278-290
- Uses fire-and-forget pattern with `void` at line 281
- Approves with response 'always' at line 284
- Errors caught and logged as warning at lines 286-288
- Test "handles permission.updated events by auto-approving" passes
- Test "logs permission approval failures" passes

### Acceptance Criteria Verification

| AC  | Requirement                                | Implementation            | Verified                                           |
| --- | ------------------------------------------ | ------------------------- | -------------------------------------------------- |
| AC1 | Permission approved with response 'always' | `src/opencode.ts:281-285` | ✅ Test passes                                     |
| AC2 | Failure logs warning (not thrown)          | `src/opencode.ts:286-288` | ✅ Test "logs permission approval failures" passes |

### File List

- `src/opencode.ts` (modified) - Added permission.updated handling
- `src/opencode.spec.ts` (modified) - Added permission auto-approval tests
