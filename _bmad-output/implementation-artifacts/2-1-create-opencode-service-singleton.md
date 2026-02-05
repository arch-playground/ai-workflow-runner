# Story 2.1: Create OpenCode Service Singleton

Status: done

## Story

As a **developer**,
I want **a singleton OpenCode service**,
So that **the SDK is initialized once and reused across operations**.

## Acceptance Criteria

1. **Given** the OpenCodeService class **When** `getOpenCodeService()` is called multiple times **Then** the same instance is returned

2. **Given** `hasOpenCodeServiceInstance()` **When** called before any `getOpenCodeService()` **Then** it returns false

3. **Given** `resetOpenCodeService()` **When** called with existing instance **Then** the instance is disposed and cleared

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions, SOLID principles
  - [x] Read `.knowledge-base/technical/standards/global/commenting.md` - Zero-tolerance for obvious comments
  - [x] Read `.knowledge-base/technical/standards/testing/unit-testing.md` - AAA pattern, @golevelup/ts-jest

- [x] **Task 2: Create OpenCodeService class skeleton** (AC: 1, 2, 3)
  - [x] Create `src/opencode.ts` file
  - [x] Define `OpenCodeService` class with private constructor pattern
  - [x] Add private class fields: `client`, `server`, `isInitialized`, `isDisposed`

- [x] **Task 3: Implement singleton pattern** (AC: 1, 2)
  - [x] Add module-level `openCodeServiceInstance` variable (initially null)
  - [x] Implement `getOpenCodeService()` - return existing or create new instance
  - [x] Implement `hasOpenCodeServiceInstance()` - return boolean check

- [x] **Task 4: Implement reset functionality** (AC: 3)
  - [x] Implement `resetOpenCodeService()` function
  - [x] Call `dispose()` on existing instance before clearing
  - [x] Set `openCodeServiceInstance` to null after disposal

- [x] **Task 5: Create unit tests** (AC: 1, 2, 3)
  - [x] Create `src/opencode.spec.ts`
  - [x] Test singleton returns same instance
  - [x] Test `hasOpenCodeServiceInstance()` returns false initially
  - [x] Test `resetOpenCodeService()` disposes and clears instance

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Compliance

- **File Location**: `src/opencode.ts` - OpenCode SDK service module
- **Pattern**: Singleton with lazy initialization
- **Dependencies**: `@opencode-ai/sdk`, `@actions/core`, `./types.js`

### Technical Requirements

- Use module-level variable for singleton instance (not static class property)
- Export named functions: `getOpenCodeService()`, `hasOpenCodeServiceInstance()`, `resetOpenCodeService()`
- Class should be exported for type usage: `export class OpenCodeService { }`
- Disposal must be idempotent (safe to call multiple times)

### Implementation Pattern

```typescript
let openCodeServiceInstance: OpenCodeService | null = null;

export function getOpenCodeService(): OpenCodeService {
  if (!openCodeServiceInstance) {
    openCodeServiceInstance = new OpenCodeService();
  }
  return openCodeServiceInstance;
}

export function hasOpenCodeServiceInstance(): boolean {
  return openCodeServiceInstance !== null;
}

export function resetOpenCodeService(): void {
  if (openCodeServiceInstance) {
    openCodeServiceInstance.dispose();
    openCodeServiceInstance = null;
  }
}
```

### Naming Conventions

| Element         | Convention                | Example                                            |
| --------------- | ------------------------- | -------------------------------------------------- |
| Class           | PascalCase                | `OpenCodeService`                                  |
| Functions       | camelCase                 | `getOpenCodeService`, `hasOpenCodeServiceInstance` |
| Private fields  | camelCase (no underscore) | `private client`, `private isDisposed`             |
| Module variable | camelCase                 | `openCodeServiceInstance`                          |

### Project Structure Notes

```
src/
├── types.ts          ← Import types from here
├── opencode.ts       ← This story creates/modifies this file
├── opencode.spec.ts  ← Unit tests (co-located)
└── runner.ts         ← Will use getOpenCodeService()
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Module Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Async Coordination]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]

## Dev Agent Record

### Agent Model Used

Claude (via OpenCode SDK implementation)

### Debug Log References

- Commit 6c3e63c: "Implement OpenCode SDK"

### Completion Notes List

- Singleton pattern implemented with module-level variable at `src/opencode.ts:37`
- `getOpenCodeService()` creates instance lazily at lines 39-44
- `hasOpenCodeServiceInstance()` returns boolean check at lines 46-48
- `resetOpenCodeService()` disposes and clears at lines 50-55
- All unit tests pass (4 tests in "singleton management" describe block)

### Acceptance Criteria Verification

| AC  | Requirement                                            | Implementation          | Verified       |
| --- | ------------------------------------------------------ | ----------------------- | -------------- |
| AC1 | Same instance returned on multiple calls               | `src/opencode.ts:39-44` | ✅ Test passes |
| AC2 | `hasOpenCodeServiceInstance()` false before first call | `src/opencode.ts:46-48` | ✅ Test passes |
| AC3 | `resetOpenCodeService()` disposes and clears           | `src/opencode.ts:50-55` | ✅ Test passes |

### File List

- `src/opencode.ts` (created) - OpenCodeService singleton implementation
- `src/opencode.spec.ts` (created) - Unit tests for singleton management
