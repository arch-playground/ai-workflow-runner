# Test Design: Epic 7 - Configuration Customization & Examples

**Date:** 2026-02-06
**Author:** TanNT
**Status:** Draft

---

## Executive Summary

**Scope:** Full test design for Epic 7

**Risk Summary:**

- Total risks identified: 11
- High-priority risks (≥6): 4
- Critical categories: SEC (2), DATA (1), TECH (1)

**Coverage Summary:**

- P0 scenarios: 10 (~15-20 hours)
- P1 scenarios: 15 (~15-23 hours)
- P2/P3 scenarios: 14 (~5-10 hours)
- **Total effort**: ~35-53 hours (~4-7 days)

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                               | Probability | Impact | Score | Mitigation                                                                                                              | Owner | Timeline      |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------- | ----- | ------------- |
| R-001   | SEC      | Auth config file contains secrets - if path validation fails, secrets could be exposed or accessed from outside workspace | 2           | 3      | 6     | Validate path with `validateWorkspacePath()` before reading; apply 0o600 permissions; mask file contents before logging | Dev   | Story 7.2-7.3 |
| R-002   | SEC      | Config file injection - malicious JSON in config files could cause SDK to behave unexpectedly                             | 2           | 3      | 6     | Validate JSON schema before passing to SDK; sanitize error messages from SDK initialization failures                    | Dev   | Story 7.3     |
| R-003   | DATA     | Invalid config causes silent failures - malformed config.json or auth.json could cause SDK to initialize incorrectly      | 3           | 2      | 6     | Validate JSON parsing with clear error messages; validate required fields; fail fast with actionable errors             | Dev   | Story 7.3     |
| R-004   | TECH     | SDK API contract changes - `createOpencode()` options interface may differ from expected                                  | 2           | 3      | 6     | Pin SDK version; validate config structure matches SDK expectations; add integration tests with real SDK                | Dev   | Story 7.3     |

### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description                                                                       | Probability | Impact | Score | Mitigation                                                             | Owner |
| ------- | -------- | --------------------------------------------------------------------------------- | ----------- | ------ | ----- | ---------------------------------------------------------------------- | ----- |
| R-005   | BUS      | Model not available - user specifies model that doesn't exist or isn't accessible | 3           | 1      | 3     | `list_models` feature for discovery; clear error when unavailable      | Dev   |
| R-006   | OPS      | Config file not found - user provides path that doesn't exist                     | 2           | 2      | 4     | Clear error: "Config file not found: {path}"; validate before SDK init | Dev   |
| R-007   | TECH     | list_models SDK API unknown - OpenCode SDK API for listing models may not exist   | 2           | 2      | 4     | Research SDK docs; graceful fallback if unsupported                    | Dev   |
| R-009   | OPS      | GitHub Secrets/Variables confusion - users may store auth in Variables (public)   | 2           | 2      | 4     | Clear documentation; README warnings; examples show correct usage      | Dev   |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                    | Probability | Impact | Score | Action   |
| ------- | -------- | -------------------------------------------------------------- | ----------- | ------ | ----- | -------- |
| R-008   | BUS      | Example workflows outdated - examples may become stale         | 2           | 1      | 2     | Monitor  |
| R-010   | BUS      | Documentation unclear - users may not understand config format | 1           | 2      | 2     | Monitor  |
| R-011   | TECH     | Model override precedence confusion                            | 1           | 1      | 1     | Document |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## Test Coverage Plan

> **Note:** P0/P1/P2/P3 indicate priority/risk level, NOT execution timing. See Execution Strategy for timing.

### P0 (Critical)

**Criteria**: Blocks core journey + High risk (≥6) + No workaround

| Test ID      | Requirement                                                  | Test Level | Risk Link | Notes                |
| ------------ | ------------------------------------------------------------ | ---------- | --------- | -------------------- |
| 7.2-UNIT-002 | getInputs() validates opencode_config within workspace       | Unit       | R-001     | Security critical    |
| 7.2-UNIT-003 | getInputs() rejects opencode_config with path traversal      | Unit       | R-001     | Security critical    |
| 7.2-UNIT-005 | getInputs() validates auth_config within workspace           | Unit       | R-001     | Security critical    |
| 7.2-UNIT-006 | getInputs() rejects auth_config with path traversal          | Unit       | R-001     | Security critical    |
| 7.3-UNIT-002 | initialize() passes config to createOpencode() options       | Unit       | R-004     | Critical integration |
| 7.3-UNIT-004 | initialize() passes auth to createOpencode() options         | Unit       | R-004     | Critical integration |
| 7.3-UNIT-006 | initialize() throws 'Config file not found' for missing file | Unit       | R-006     | Error handling       |
| 7.3-UNIT-007 | initialize() throws 'Auth file not found' for missing file   | Unit       | R-006     | Error handling       |
| 7.3-UNIT-008 | initialize() throws 'Invalid JSON in config file'            | Unit       | R-003     | Error handling       |
| 7.3-UNIT-009 | initialize() throws 'Invalid JSON in auth file'              | Unit       | R-003     | Error handling       |

**Total P0**: 10 tests, ~15-20 hours

### P1 (High)

**Criteria**: Important features + Medium risk (3-4) + Common workflows

| Test ID      | Requirement                                                      | Test Level  | Risk Link | Notes            |
| ------------ | ---------------------------------------------------------------- | ----------- | --------- | ---------------- |
| 7.2-UNIT-001 | getInputs() captures opencode_config path                        | Unit        | R-006     | Happy path       |
| 7.2-UNIT-004 | getInputs() captures auth_config path                            | Unit        | R-006     | Happy path       |
| 7.2-UNIT-007 | getInputs() captures model string                                | Unit        | -         | Happy path       |
| 7.2-UNIT-008 | getInputs() sets listModels true when input is 'true'            | Unit        | -         | Boolean parsing  |
| 7.2-UNIT-009 | getInputs() sets listModels false when input is 'false' or empty | Unit        | -         | Default behavior |
| 7.3-UNIT-001 | initialize() reads opencode_config as JSON                       | Unit        | R-003     | Happy path       |
| 7.3-UNIT-003 | initialize() reads auth_config as JSON                           | Unit        | R-003     | Happy path       |
| 7.3-UNIT-005 | runSession() passes model to session options                     | Unit        | R-005     | Model override   |
| 7.3-UNIT-010 | Error messages are sanitized (no absolute paths)                 | Unit        | R-002     | Security         |
| 7.3-INT-001  | Config + auth files loaded and SDK initializes successfully      | Integration | R-004     | Real SDK test    |
| 7.4-UNIT-001 | list_models=true skips workflow execution                        | Unit        | -         | Mode switch      |
| 7.4-UNIT-002 | list_models queries available models from SDK                    | Unit        | R-007     | SDK API call     |
| 7.4-UNIT-003 | list_models prints models in expected format                     | Unit        | -         | Output format    |
| 7.4-UNIT-004 | list_models exits with status 'success'                          | Unit        | -         | Exit status      |
| 7.4-UNIT-005 | list_models logs error and fails on SDK init failure             | Unit        | -         | Error handling   |

**Total P1**: 15 tests, ~15-23 hours

### P2 (Medium)

**Criteria**: Secondary features + Low risk (1-2) + Edge cases

| Test ID      | Requirement                                           | Test Level | Risk Link | Notes             |
| ------------ | ----------------------------------------------------- | ---------- | --------- | ----------------- |
| 7.1-UNIT-001 | action.yml defines opencode_config as optional string | Unit       | -         | Schema validation |
| 7.1-UNIT-002 | action.yml defines auth_config as optional string     | Unit       | -         | Schema validation |
| 7.1-UNIT-003 | action.yml defines model as optional string           | Unit       | -         | Schema validation |
| 7.1-UNIT-004 | action.yml defines list_models as optional boolean    | Unit       | -         | Schema validation |
| 7.4-E2E-001  | Action with list_models=true outputs model list       | E2E        | -         | End-to-end        |

**Total P2**: 5 tests, ~3-5 hours

### P3 (Low)

**Criteria**: Nice-to-have + Exploratory + Validation

| Test ID      | Requirement                                                     | Test Level | Notes           |
| ------------ | --------------------------------------------------------------- | ---------- | --------------- |
| 7.5-UNIT-001 | examples/basic-workflow/workflow.md exists                      | Unit       | File validation |
| 7.5-UNIT-002 | examples/basic-workflow/.github/workflows/run-ai.yml valid YAML | Unit       | Syntax check    |
| 7.5-UNIT-003 | examples/with-validation/ files exist                           | Unit       | File validation |
| 7.5-UNIT-004 | examples/github-copilot/ files exist                            | Unit       | File validation |
| 7.5-UNIT-005 | examples/custom-model/ files exist                              | Unit       | File validation |
| 7.6-UNIT-001 | README.md contains opencode_config in inputs table              | Unit       | Doc validation  |
| 7.6-UNIT-002 | README.md contains auth_config in inputs table                  | Unit       | Doc validation  |
| 7.6-UNIT-003 | README.md contains model in inputs table                        | Unit       | Doc validation  |
| 7.6-UNIT-004 | README.md contains list_models in inputs table                  | Unit       | Doc validation  |

**Total P3**: 9 tests, ~2-5 hours

---

## Execution Strategy

**Philosophy**: Run everything in PRs unless expensive/long-running. With Jest parallelization, all 39 tests should complete in <5 minutes.

### Every PR (<5 min)

- All unit tests (P0, P1, P2, P3)
- Integration test (7.3-INT-001)

### Nightly/Weekly

- E2E test (7.4-E2E-001) - requires Docker build
- Example file validation (P3) - optional, can run on release only

---

## Resource Estimates

| Priority  | Count  | Effort Range     | Notes                                  |
| --------- | ------ | ---------------- | -------------------------------------- |
| P0        | 10     | ~15-20 hours     | Security-critical, thorough edge cases |
| P1        | 15     | ~15-23 hours     | Core functionality, SDK integration    |
| P2        | 5      | ~3-5 hours       | Schema and E2E validation              |
| P3        | 9      | ~2-5 hours       | File/doc checks                        |
| **Total** | **39** | **~35-53 hours** | **~4-7 days**                          |

### Prerequisites

**Test Data:**

- `config-valid.json` - Valid OpenCode config fixture
- `config-invalid.json` - Malformed JSON fixture
- `auth-valid.json` - Valid auth config fixture
- `auth-invalid.json` - Malformed JSON fixture

**Mocks:**

- `@opencode-ai/sdk` mock for `createOpencode()` options validation
- Mock for model listing API

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2/P3 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Security paths**: 100% (path traversal, JSON validation)
- **Config loading**: ≥90%
- **Error handling**: ≥85%
- **Examples/Docs**: ≥70%

### Non-Negotiable Requirements

- [ ] All path traversal tests pass (R-001)
- [ ] All JSON validation tests pass (R-002, R-003)
- [ ] SDK config passthrough verified (R-004)
- [ ] Error messages sanitized (no absolute paths)

---

## Mitigation Plans

### R-001: Auth Config Security (Score: 6)

**Mitigation Strategy:**

1. Reuse existing `validateWorkspacePath()` for all config paths
2. Apply 0o600 permissions when writing temp config files
3. Never log config file contents (mask if needed for debug)

**Owner:** Dev
**Timeline:** Story 7.2-7.3
**Status:** Planned
**Verification:** Unit tests 7.2-UNIT-002 through 7.2-UNIT-006

### R-003: Invalid Config Error Handling (Score: 6)

**Mitigation Strategy:**

1. Wrap JSON.parse in try-catch with clear error messages
2. Validate file exists before attempting to read
3. Include file path (basename only) in error messages

**Owner:** Dev
**Timeline:** Story 7.3
**Status:** Planned
**Verification:** Unit tests 7.3-UNIT-006 through 7.3-UNIT-009

### R-004: SDK API Contract (Score: 6)

**Mitigation Strategy:**

1. Pin `@opencode-ai/sdk` version in package.json
2. Add integration test with real SDK initialization
3. Document expected config structure in README

**Owner:** Dev
**Timeline:** Story 7.3
**Status:** Planned
**Verification:** Integration test 7.3-INT-001

---

## Assumptions and Dependencies

### Assumptions

1. OpenCode SDK accepts config/auth objects in `createOpencode()` options
2. SDK provides API to list available models
3. Model can be specified per-session via session options

### Dependencies

1. OpenCode SDK documentation for config schema - Required before Story 7.3
2. SDK model listing API availability - Required before Story 7.4

### Risks to Plan

- **Risk**: SDK config API differs from expected
  - **Impact**: May require refactoring Story 7.3
  - **Contingency**: Research SDK source code; contact SDK maintainers

---

## Follow-on Workflows (Manual)

- Run `*atdd` to generate failing P0 tests (separate workflow; not auto-run)
- Run `*automate` for broader coverage once implementation exists

---

## Appendix

### Knowledge Base References

- `risk-governance.md` - Risk classification framework
- `probability-impact.md` - Risk scoring methodology
- `test-levels-framework.md` - Test level selection
- `test-priorities-matrix.md` - P0-P3 prioritization

### Related Documents

- PRD: `_bmad-output/planning-artifacts/prd.md`
- Epic: `_bmad-output/planning-artifacts/epics.md` (Epic 7)
- Architecture: `_bmad-output/planning-artifacts/architecture.md`

---

**Generated by**: BMad TEA Agent - Test Architect Module
**Workflow**: `_bmad/tea/testarch/test-design`
**Version**: 5.0 (BMad v6)
