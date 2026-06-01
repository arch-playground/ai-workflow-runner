# AI Workflow Runner — Manual Test Plan (Phase 2 Features)

## 1. Overview

Manual, real-runtime test plan for the Phase 2 feature set (Epics 9–12): conversation logging & transcript export, free-model filtering, provider fallback chains, and SDK currency. Tests exercise the **real bundled action inside its Docker container** against **real authenticated providers** — the same harness that caught two HIGH bugs during implementation (Docker symlink, fallback model double-prefix) that unit tests missed.

## 2. Scope

### In-Scope

- Conversation transcript export (`conversation.json`) + secret scrubbing (Epic 9)
- Job summary rendering (Epic 9)
- Stop-command wrapping of streamed text (Epic 9)
- `list_models` pricing tags + `disable_free_models` filtering & fail-fast (Epic 10)
- `subscription_providers` override (Epic 10)
- `fallback_config` provider chain: preflight-skip, advance, exhaustion, precedence, D8 no-credentials (Epic 11)
- Docker image build + pinned `opencode-ai` binary + SDK currency (Epic 12)

### Out-of-Scope

- Pre-Phase-2 MVP behavior (Epics 1–8) — already covered by existing unit/e2e
- The GitHub Marketplace listing (manual GitHub UI step, not code)
- Multi-runtime (Python/Java) execution — unchanged by Phase 2

## 3. Design References

| Document                | Path                                                                             | Covers                                                        |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| OpenCode Upgrade Design | `_bmad-output/planning-artifacts/research/opencode-upgrade-design-2026-05-29.md` | D1–D8 design decisions, §3 logging, §4 filtering, §5 fallback |
| PRD                     | `_bmad-output/planning-artifacts/prd.md`                                         | FR50–FR65, NFR21–23                                           |
| Epics                   | `_bmad-output/planning-artifacts/epics.md`                                       | Epics 9–12 stories/ACs                                        |

## 4. Test Environment

### Prerequisites

- Docker daemon running (the action is a Docker container action)
- `~/.local/share/opencode/auth.json` with authenticated providers (verified present: `anthropic`, `openai`, `github-copilot`)
- A built image of the action (built from source per Rule #10)

### Setup Commands (main agent, once per run)

```bash
cd /Users/tannt/Work/GIT/Personal/Sources/ai-workflow-runner
npm run bundle                       # rebuild dist/ from source (Rule #10)
docker build -t awr:manual-test .    # build image (also runs the opencode --version verify step)
docker run --rm --entrypoint bash awr:manual-test -c 'opencode --version && node --version'  # smoke
```

### Environment Variables (per docker run)

| Variable                       | Purpose                         | Example                                 |
| ------------------------------ | ------------------------------- | --------------------------------------- |
| `GITHUB_WORKSPACE`             | mounted workspace root          | `/github/workspace`                     |
| `RUNNER_TEMP`                  | transcript/temp dir             | `/rt`                                   |
| `GITHUB_OUTPUT`                | action outputs sink             | `/rt/gh-output.txt`                     |
| `GITHUB_STEP_SUMMARY`          | job summary sink                | `/rt/summary.md`                        |
| `INPUT_WORKFLOW_PATH`          | workflow file                   | `workflow.md`                           |
| `INPUT_MODEL`                  | model override                  | `github-copilot/gpt-5-mini`             |
| `INPUT_OPENCODE_CONFIG`        | opencode config path            | `oc.json`                               |
| `INPUT_EXPORT_TRANSCRIPT`      | enable transcript               | `true`                                  |
| `INPUT_WRITE_JOB_SUMMARY`      | enable summary                  | `true`                                  |
| `INPUT_DISABLE_FREE_MODELS`    | filter free models              | `true`                                  |
| `INPUT_SUBSCRIPTION_PROVIDERS` | extra subscription provider ids | `myproxy`                               |
| `INPUT_FALLBACK_CONFIG`        | fallback chain file             | `fallback.json`                         |
| `INPUT_LIST_MODELS`            | list models + exit              | `true`                                  |
| `INPUT_ENV_VARS`               | secret-bearing env (scrub test) | `{"MY_SECRET":"sk-supersecret-zzz123"}` |
| `INPUT_TIMEOUT_MINUTES`        | run timeout                     | `2`                                     |

**Standard docker run invocation** (referenced by TCs as `$RUN`):

```bash
docker run --rm \
  -v $WS:/github/workspace -v $RT:/rt \
  -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
  -v $RT/gh-output.txt:/rt/gh-output.txt \
  -v $RT/summary.md:/rt/summary.md \
  -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
  -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
  <per-TC INPUT_* vars> \
  awr:manual-test
```

## 5. Test Case Index

Coverage spans **normal** (happy path), **edge** (boundary/conservative paths), and **abnormal** (invalid input / failure) cases per category.

| TC-ID    | Name                                                         | Type     | Priority | Category         | Design Ref       |
| -------- | ------------------------------------------------------------ | -------- | -------- | ---------------- | ---------------- |
| TC-09-01 | Transcript export writes valid `conversation.json`           | normal   | Critical | AI/Integration   | §3b, FR52/53     |
| TC-09-02 | Secret scrubbing in transcript + summary (NFR21)             | normal   | Critical | Security         | §3b, NFR21       |
| TC-09-03 | Job summary renders token/cost/duration + final message      | normal   | High     | AI/Integration   | §3b, FR54        |
| TC-09-04 | Stop-command wrapping of streamed text                       | normal   | Medium   | Security         | §3a, NFR22       |
| TC-09-05 | Transcript export best-effort — failed session doesn't crash | abnormal | High     | Resilience       | §3b (AC6)        |
| TC-09-06 | Job summary best-effort when `$GITHUB_STEP_SUMMARY` unset    | edge     | Medium   | Resilience       | §3b (AC6)        |
| TC-10-01 | `list_models` pricing tags (free/subscription/paid)          | normal   | High     | AI/Integration   | §4a, FR55        |
| TC-10-02 | `disable_free_models` hides free, keeps subscription         | normal   | Critical | AI/Integration   | §4a, FR56/57     |
| TC-10-03 | `disable_free_models` fail-fast on a free resolved model     | normal   | Critical | Error handling   | §4a, FR56        |
| TC-10-04 | COPILOT-NEVER-BLOCKED invariant                              | normal   | Critical | AI/Integration   | D7, FR57         |
| TC-10-05 | `subscription_providers` override keeps free-tier models     | edge     | High     | AI/Integration   | D7, FR58         |
| TC-10-06 | `disable_free_models` unresolvable model → proceeds (AC6)    | edge     | Medium   | Error handling   | §4a (AC6)        |
| TC-10-07 | Invalid boolean for `disable_free_models` → treated false    | abnormal | Medium   | Input validation | config parse     |
| TC-11-01 | Fallback: unauth provider skipped → advances → wins          | normal   | Critical | AI/Integration   | §5.2, FR60/61/62 |
| TC-11-02 | Fallback exhaustion → aggregated error                       | abnormal | High     | Error handling   | §5.4, FR63       |
| TC-11-03 | `fallback_config` with credentials rejected (D8)             | abnormal | Critical | Security         | D8, FR59         |
| TC-11-04 | Malformed `fallback_config` JSON rejected                    | abnormal | High     | Input validation | §5, FR59         |
| TC-11-05 | Empty / invalid `chain` rejected                             | abnormal | High     | Input validation | §5, FR59         |
| TC-11-06 | Committed provider doesn't switch on later error (D2)        | edge     | High     | AI/Integration   | D2, FR62         |
| TC-12-01 | Docker image builds + pinned opencode binary 1.15.13         | normal   | Critical | Infra            | §2, FR64/65      |
| TC-12-02 | Backward compatibility: no Phase-2 inputs = unchanged        | normal   | High     | Regression       | §0               |
| TC-12-03 | Invalid `env_vars` JSON rejected before run                  | abnormal | High     | Input validation | FR36             |
| TC-12-04 | Missing workflow file rejected (sanitized error)             | abnormal | Medium   | Input validation | FR35             |

### Security Test Cases (adversarial — `TC-SEC-security.md`)

| TC-ID     | Name                                               | Priority | OWASP | Design Ref               |
| --------- | -------------------------------------------------- | -------- | ----- | ------------------------ |
| TC-SEC-01 | Path traversal via `workflow_path` blocked         | Critical | A01   | validateWorkspacePath    |
| TC-SEC-02 | Symlink escape from workspace blocked              | Critical | A01   | validateRealPath         |
| TC-SEC-03 | `transcript_path` escape / arbitrary write blocked | Critical | A01   | validateSafeOutputPath   |
| TC-SEC-04 | `auth_config` path outside safe dirs blocked       | High     | A01   | validateConfigPath       |
| TC-SEC-05 | env*vars cannot override PATH/LD_PRELOAD/GITHUB*\* | Critical | A03   | RESERVED_ENV_VARS        |
| TC-SEC-06 | env_vars key with shell metachars rejected         | High     | A03   | VALID_KEY_PATTERN        |
| TC-SEC-07 | Secrets never leak (log/output/transcript/summary) | Critical | A09   | maskSecrets/scrubSecrets |
| TC-SEC-08 | Error messages don't leak host paths/stack traces  | High     | A09   | sanitizeErrorMessage     |
| TC-SEC-09 | Resource-exhaustion inputs bounded (DoS)           | High     | A05   | INPUT_LIMITS             |
| TC-SEC-10 | No high/critical dependency CVEs                   | High     | A06   | npm audit                |
| TC-SEC-11 | Validation script isolation (scoped childEnv)      | Medium   | A03   | validation.ts            |

**Total: 23 feature + 11 security = 34 test cases.**

**Run results:** feature → `test-run-2026-06-01.md` (23/23 PASS); security → `test-run-security-2026-06-01.md` (11/11 PASS, no findings); red-team → `test-run-redteam-2026-06-01.md` + agent-execution cases `TC-REDTEAM-agent-execution.md` + proposed `TC-REDTEAM-bleeding-edge.md`. **2 CRITICAL roots** (FINDING-1 baseURL credential exfil; FINDING-5 unscoped agent env → verified `env`/`auth.json`/`.git/config` secret theft, all unmasked) + HIGH (agent bash runs as root, writes outside workspace / reads GITHUB_TOKEN) + MEDIUM (timeout_minutes gap; job-summary markdown phishing) + 2 doc gaps. GHA `$GITHUB_OUTPUT` injection CONTAINED (regression). Scenarios in `TC-REDTEAM-supply-chain.md`.

**Model choice for runs**: TCs that run a real agent may use **either** an OpenCode free model (e.g. `opencode/big-pickle`) OR `github-copilot/gpt-5-mini` — free preferred for cost, gpt-5-mini the reliable fallback when a free model is rate-limited.

## 6. Test Data

- **Workflow** (`workflow.md`): `Reply with exactly the single word: pong\nDo not use any tools.` — deterministic, cheap, no tools.
- **Secret** (`INPUT_ENV_VARS`): `{"MY_SECRET":"sk-supersecret-zzz123"}` — a distinctive token to grep for in artifacts.
- **funcval model** (per validation policy): `github-copilot/gpt-5-mini` (subscription, cheapest authed).
- **e2e/free model**: `opencode/big-pickle` (genuinely free, OpenCode Zen — cost 0, unauthenticated provider).
- **Fallback chain** (`fallback.json`): `{"chain":[{"provider":"openrouter","model":"openrouter/x"},{"provider":"github-copilot","model":"github-copilot/gpt-5-mini"}]}` — p0 unauthenticated (skipped), p1 authenticated (wins).

## 7. Pass/Fail Criteria

| Category   | Pass Criteria                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Functional | All Critical (P0) TCs pass 100%; High (P1) ≥95%                                                                             |
| Security   | Secret never appears raw in any written artifact; credentials rejected from fallback_config                                 |
| AI/LLM     | Structural assertions (file exists, valid JSON, tag present) — not exact model text; re-run 2–3× for run-dependent outcomes |
| Regression | Default-input run behaves identically to pre-Phase-2                                                                        |

## 8. Known Limitations

- **LLM non-determinism**: assertions verify structure/presence (valid JSON, `pong` substring, tags) not exact wording. Run model-dependent TCs 2–3× and take majority.
- **Auth token freshness**: Copilot's exchanged token is ~30 min TTL; if a TC fails with a 401/auth `session.error`, refresh auth.json before concluding it's a code defect (this bit the Epic 9 anthropic run).
- **Free-model availability**: OpenCode Zen `*-free` models are rate-limited and may be transiently unavailable; a transient failure ≠ filter logic failure.
- **Docker required**: all TCs except none run in-container; no Docker = cannot execute (the action is Docker-only).
