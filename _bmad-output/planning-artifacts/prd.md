---
stepsCompleted:
  [
    'step-01-init',
    'step-02-discovery',
    'step-03-success',
    'step-04-journeys',
    'step-05-domain',
    'step-06-innovation',
    'step-07-project-type',
    'step-08-scoping',
    'step-09-functional',
    'step-10-nonfunctional',
    'step-11-polish',
    'step-12-complete',
  ]
classification:
  projectType: developer_tool
  domain: scientific
  complexity: medium
  projectContext: brownfield
  targetAudience:
    - Individual developers automating repos
    - DevOps teams building CI/CD pipelines
    - Organizations running standardized AI workflows at scale
  keyConcerns:
    - Reproducibility of AI workflow outputs
    - Validation methodology
    - Performance in CI/CD environments
    - Reliability and error handling for agentic operations
inputDocuments:
  - '_bmad-output/implementation-artifacts/tech-spec-ai-workflow-runner-init.md'
  - '_bmad-output/implementation-artifacts/tech-spec-opencode-sdk-runner.md'
  - '.knowledge-base/technical/application-design/index.md'
  - '.knowledge-base/technical/standards/index.md'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 2
  techSpecs: 2
workflowType: 'prd'
---

# Product Requirements Document - AI Workflow Runner

**Author:** TanNT
**Date:** 2026-02-04
**Status:** MVP Implemented

## Executive Summary

**AI Workflow Runner** is a GitHub Action that enables developers to run agentic AI workflows in CI/CD pipelines. It is the first easy way to execute AI agents (not just simple API calls) directly in GitHub Actions.

**Core Value Proposition:**

- Run agentic AI workflows with zero infrastructure management
- Setup in under 30 minutes
- Real-time visibility into AI actions via console streaming
- Built-in validation and retry for reliable automation

**Target Users:**

- Individual developers automating documentation, code review, and other AI tasks
- DevOps teams standardizing AI workflows across repositories
- Organizations scaling AI-powered automation

**Innovation:** Bridges the gap between local AI tools (require human) and self-hosted AI infrastructure (complex setup) by providing agentic AI capabilities with GitHub Actions simplicity.

## Success Criteria

### User Success

| User Type                 | Success Definition                                                             |
| ------------------------- | ------------------------------------------------------------------------------ |
| **Individual Developers** | Run first AI workflow in CI within 30 minutes; "it just works" experience      |
| **DevOps Teams**          | Confident the runner won't break pipelines; predictable, configurable behavior |
| **Organizations**         | Standardized AI workflow execution across multiple repos                       |

### Business Success

| Metric             | Target                                   |
| ------------------ | ---------------------------------------- |
| GitHub Stars       | 1,000                                    |
| Community Adoption | Organic growth of repos using the action |

_Note: Pure open-source community tool with no commercial objectives._

### Technical Success

| Metric                 | Target                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| Runner Reliability     | 0% runner-caused failures (all failures from workflow/AI/config) |
| Time to First Workflow | < 30 minutes from discovery to running in CI                     |
| Graceful Degradation   | Clear, actionable error messages for debugging                   |

## Product Scope

### MVP (Phase 1) - Implemented

| Capability                                               | Status |
| -------------------------------------------------------- | ------ |
| Docker container with Node.js 20+, Python 3.11, Java 21  | Done   |
| OpenCode SDK integration for agentic execution           | Done   |
| Console output streaming to GitHub Actions logs          | Done   |
| Validation script support (Python/JavaScript) with retry | Done   |
| Graceful shutdown on SIGTERM/SIGINT                      | Done   |
| Security hardening (path validation, secret masking)     | Done   |
| README with quick-start guide                            | Done   |
| Example workflow (document-repo)                         | Done   |

### Phase 2 - Growth

| Capability                                             | Status  |
| ------------------------------------------------------ | ------- |
| Custom OpenCode configuration (config.json, auth.json) | Planned |
| Model selection input                                  | Planned |
| List available models feature                          | Planned |
| Example workflows folder                               | Planned |
| Workflow marketplace/registry integration              | Planned |
| Caching for faster subsequent runs                     | Planned |
| Parallel workflow execution                            | Planned |
| Workflow templates for common use cases                | Planned |
| GitHub App version for easier setup                    | Planned |
| Metrics/telemetry dashboard                            | Planned |

### Phase 3 - Vision

- First-class BMAD Builder integration
- Visual workflow designer
- Self-hosted runner support
- Multi-repo orchestration
- AI workflow versioning and rollback

## User Journeys

### Journey 1: Alex the Individual Developer (Happy Path)

**Persona:** Alex Chen, 28, full-stack developer maintaining 5 repos with outdated documentation.

**Journey:**

1. **Discovery:** Searches GitHub Marketplace for "AI workflow", finds AI Workflow Runner
2. **Setup:** Copies example YAML, adds workflow file, sets up secrets (~25 min)
3. **Execution:** Pushes to trigger action, watches real-time console output
4. **Success:** PR appears with updated documentation, merges it
5. **Scale:** Sets up same workflow on 4 more repos that afternoon

**Capabilities Revealed:** Quick setup, real-time streaming, clear documentation

---

### Journey 2: Alex the Developer (Error Recovery)

**Persona:** Same Alex, two weeks later.

**Journey:**

1. **Failure:** Workflow fails after file rename
2. **Diagnosis:** Error message clearly shows `Validation failed: README.md not found`
3. **Fix:** Updates workflow config with new file path
4. **Resolution:** Re-runs successfully, trust in tool increases

**Capabilities Revealed:** Actionable error messages, clear failure attribution

---

### Journey 3: Priya the DevOps Engineer (Pipeline Integration)

**Persona:** Priya Sharma, 34, Senior DevOps Engineer rolling out AI workflows to 50+ repos.

**Journey:**

1. **Evaluation:** Reviews action.yml, security model, tests with bad inputs
2. **Template:** Creates reusable workflow with org-standard configurations
3. **Pilot:** Rolls out to 5 repos, monitors for 2 weeks
4. **Scale:** Deploys to all 50+ repos with zero runner-caused incidents

**Capabilities Revealed:** Configurable timeouts, security hardening, predictable behavior

---

### Journey 4: Jordan the Contributor (Community)

**Persona:** Jordan Park, 25, open source contributor who found an edge case bug.

**Journey:**

1. **Issue:** Opens GitHub issue with reproduction steps
2. **Setup:** Clones repo, runs tests locally in under 10 minutes
3. **Fix:** Identifies bug, writes fix with tests, opens PR
4. **Merge:** PR reviewed within 48 hours, merged after one revision

**Capabilities Revealed:** Clear contribution guide, fast local setup

---

### Journey 5: DevBot the Composite Action (API Consumer)

**Persona:** A composite GitHub Action orchestrating multiple AI tasks.

**Journey:**

1. **Integration:** Reads action.yml, understands outputs (status, result)
2. **Implementation:** Calls AI Workflow Runner, parses JSON result
3. **Orchestration:** Uses status codes to make downstream decisions

**Capabilities Revealed:** Predictable output format, JSON-parseable results

---

### Journey Requirements Summary

| Journey               | Key Capabilities                                |
| --------------------- | ----------------------------------------------- |
| Alex - Happy Path     | Quick setup, real-time streaming, clear docs    |
| Alex - Error Recovery | Actionable errors, failure attribution          |
| Priya - DevOps        | Configurable timeouts, security, predictability |
| Jordan - Contributor  | Contribution guide, fast local setup            |
| DevBot - API          | Predictable outputs, status codes               |

## Technical Architecture

### Components

| Component      | Technology                    | Purpose                          |
| -------------- | ----------------------------- | -------------------------------- |
| **Runtime**    | Docker (debian:bookworm-slim) | Multi-runtime environment        |
| **Language**   | TypeScript                    | Runner implementation            |
| **Bundler**    | @vercel/ncc                   | Single-file distribution         |
| **SDK**        | @opencode-ai/sdk              | Agentic AI execution             |
| **Validation** | Python 3.11 / Node.js 20      | User-provided validation scripts |

### Action Interface

**Inputs:**

| Input                    | Required | Description                           |
| ------------------------ | -------- | ------------------------------------- |
| `workflow_path`          | Yes      | Path to workflow.md file              |
| `prompt`                 | No       | Additional input prompt               |
| `env_vars`               | No       | JSON object of environment variables  |
| `timeout_minutes`        | No       | Execution timeout (default: 30)       |
| `validation_script`      | No       | Validation script path or inline code |
| `validation_script_type` | No       | python or javascript                  |
| `validation_max_retry`   | No       | Max retry attempts (default: 5)       |
| `opencode_config`        | No       | Path to OpenCode config.json file     |
| `auth_config`            | No       | Path to OpenCode auth.json file       |
| `model`                  | No       | Model to use (overrides config)       |
| `list_models`            | No       | Print available models and exit       |

**Outputs:**

| Output   | Description                                |
| -------- | ------------------------------------------ |
| `status` | success, failure, cancelled, or timeout    |
| `result` | JSON string with sessionId and lastMessage |

### Platform Support

| Platform                      | Support       |
| ----------------------------- | ------------- |
| GitHub-hosted Linux runners   | Supported     |
| Self-hosted Linux with Docker | Supported     |
| Windows runners               | Not supported |
| macOS runners                 | Not supported |

### Versioning

| Tag         | Example  | Usage                         |
| ----------- | -------- | ----------------------------- |
| Full semver | `v1.2.3` | Pinned, reproducible builds   |
| Major tag   | `v1`     | Auto-updates to latest v1.x.x |

## Functional Requirements

### Workflow Execution

- **FR1:** User can specify a workflow file path relative to the repository root
- **FR2:** User can provide an optional text prompt to pass to the workflow
- **FR3:** User can provide environment variables as a JSON object
- **FR4:** User can configure execution timeout in minutes
- **FR5:** System can read and parse workflow file content
- **FR6:** System can combine workflow content with user prompt for AI execution
- **FR7:** System can execute agentic AI workflow via OpenCode SDK

### Session Management

- **FR8:** System can create an OpenCode session for workflow execution
- **FR9:** System can send prompts to an active session
- **FR10:** System can detect when a session becomes idle (completion)
- **FR11:** System can handle session timeout gracefully
- **FR12:** System can dispose of sessions and resources on shutdown

### Output & Streaming

- **FR13:** System can stream AI output to GitHub Actions console in real-time
- **FR14:** System can capture the last assistant message for validation
- **FR15:** System can return execution status (success, failure, cancelled, timeout)
- **FR16:** System can return execution result as JSON string

### Validation & Retry

- **FR17:** User can specify a validation script (file path or inline code)
- **FR18:** User can specify validation script type (python or javascript)
- **FR19:** User can configure maximum validation retry attempts
- **FR20:** System can execute Python validation scripts via python3
- **FR21:** System can execute JavaScript validation scripts via node
- **FR22:** System can pass AI_LAST_MESSAGE environment variable to validation scripts
- **FR23:** System can pass user-provided environment variables to validation scripts
- **FR24:** System can interpret validation output (empty/true = success, other = retry)
- **FR25:** System can send validation output as follow-up prompt for retry
- **FR26:** System can fail after maximum retry attempts with last validation output

### Security

- **FR27:** System can validate workflow path is within repository workspace
- **FR28:** System can detect and reject path traversal attempts
- **FR29:** System can mask all environment variable values as secrets
- **FR30:** System can sanitize error messages to remove sensitive paths

### Configuration Customization

- **FR39:** User can specify path to OpenCode config.json file
- **FR40:** User can specify path to OpenCode auth.json file
- **FR41:** User can specify model to use (overrides config file default)
- **FR42:** User can enable list_models mode to print available models and exit
- **FR43:** System can load and pass config files to OpenCode SDK
- **FR44:** System can query and display available models from SDK

### Lifecycle Management

- **FR31:** System can handle SIGTERM signal for graceful shutdown
- **FR32:** System can handle SIGINT signal for graceful shutdown
- **FR33:** System can abort running operations when shutdown is initiated
- **FR34:** System can clean up resources (sessions, event loops) on disposal

### Error Handling

- **FR35:** System can return clear error messages for missing workflow files
- **FR36:** System can return clear error messages for invalid input configuration
- **FR37:** System can return clear error messages for validation script failures
- **FR38:** System can distinguish runner errors from workflow/AI errors

## Non-Functional Requirements

### Performance

| NFR      | Requirement                           | Rationale                    |
| -------- | ------------------------------------- | ---------------------------- |
| **NFR1** | Docker image build < 10 minutes on CI | Reasonable CI pipeline time  |
| **NFR2** | Runner startup < 30 seconds           | Fast feedback for developers |
| **NFR3** | Console streaming latency < 1 second  | Real-time visibility         |
| **NFR4** | Graceful shutdown < 10 seconds        | Clean CI termination         |

### Security

| NFR      | Requirement                                             | Rationale                      |
| -------- | ------------------------------------------------------- | ------------------------------ |
| **NFR5** | All env_vars masked via core.setSecret() before logging | Prevent secret exposure        |
| **NFR6** | Path traversal rejected before file access              | Prevent workspace escape       |
| **NFR7** | Error messages sanitized (no absolute paths)            | Prevent information disclosure |
| **NFR8** | Temp files created with 0o600 permissions               | Prevent unauthorized access    |
| **NFR9** | No secrets logged at any verbosity level                | Defense in depth               |

### Reliability

| NFR       | Requirement                                            | Rationale              |
| --------- | ------------------------------------------------------ | ---------------------- |
| **NFR10** | 0% runner-caused failures                              | Core success criterion |
| **NFR11** | SIGTERM/SIGINT handled without resource leaks          | Clean CI termination   |
| **NFR12** | Event loop reconnects on transient errors (3 attempts) | Network resilience     |
| **NFR13** | Validation script timeout 60s with SIGKILL escalation  | Prevent hung scripts   |

### Integration

| NFR       | Requirement                                 | Rationale           |
| --------- | ------------------------------------------- | ------------------- |
| **NFR14** | Compatible with ubuntu-latest, ubuntu-22.04 | Primary platform    |
| **NFR15** | Compatible with self-hosted Linux + Docker  | Enterprise support  |
| **NFR16** | OpenCode SDK version pinned                 | Reproducible builds |
| **NFR17** | Outputs parseable by subsequent steps       | Composability       |

### Maintainability

| NFR       | Requirement                                   | Rationale            |
| --------- | --------------------------------------------- | -------------------- |
| **NFR18** | Unit test coverage >= 80% on validation logic | Code quality         |
| **NFR19** | Dependabot with weekly updates                | Security maintenance |
| **NFR20** | TypeScript strict mode enabled                | Type safety          |

## Risk Mitigation

| Risk                         | Impact           | Mitigation                                              |
| ---------------------------- | ---------------- | ------------------------------------------------------- |
| OpenCode SDK API changes     | Breaking changes | Pin SDK version, monitor releases                       |
| Docker image size (~1GB)     | Slow startup     | Optimized Dockerfile, documented expectations           |
| Low adoption                 | Project failure  | GitHub Marketplace visibility, BMAD Builder integration |
| Maintenance burden           | Sustainability   | Automated CI/CD, Dependabot, clear contribution guide   |
| AI workflow unpredictability | User frustration | Validation script + retry pattern provides guardrails   |
| GitHub Actions limitations   | Platform lock-in | Clear documentation of supported platforms              |

## Documentation Strategy

| Asset                 | Content                 | Location                        |
| --------------------- | ----------------------- | ------------------------------- |
| **README.md**         | Quick-start + reference | Repository root                 |
| **Example workflow**  | document-repo           | `.github/workflows/example.yml` |
| **Workflow creation** | Link to BMAD Builder    | README                          |

**README Structure:**

1. What it does (one paragraph)
2. Quick start (copy-paste YAML)
3. Inputs reference table
4. Outputs reference table
5. Validation scripts guide
6. Example: document-repo workflow
7. Link to BMAD Builder for custom workflows
8. Troubleshooting common issues
9. Contributing guide
