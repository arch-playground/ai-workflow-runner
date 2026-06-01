# TC-SEC: Security Test Cases (adversarial)

Adversarial security tests for the AI Workflow Runner. This action runs untrusted AI workflows in CI with real credentials, writes files, spawns child processes (validation scripts), and handles secrets — so the attack surface includes **path traversal, secret exposure, command/env injection, resource-exhaustion DoS, process isolation, and dependency CVEs**.

All tests run the bundled action inside `awr:manual-test` (built from source) OR exercise `npm audit` for dependency CVEs. Threat model basis: `SECURITY.md` + `.knowledge-base/technical/standards/global/security.md` (OWASP Top 10).

## Prerequisites

- [ ] Docker image `awr:manual-test` built from source
- [ ] `~/.local/share/opencode/auth.json` present (for runs that reach the SDK)
- [ ] These are ADVERSARIAL tests — the EXPECTED outcome is the attack is BLOCKED (rejected with a clear error, no leak, no escape). A test FAILS if the attack succeeds.

---

### TC-SEC-01: Path traversal via `workflow_path` (`../` escape) is blocked

**Priority**: Critical
**Design Ref**: SECURITY.md "Path traversal prevention"; security.ts `validateWorkspacePath`; OWASP A01

**Attack**: try to read a file outside the workspace via `../` and absolute paths.

**Steps**:

1. Attempt several traversal payloads:
   ```bash
   WS=/tmp/sec01/workspace; RT=/tmp/sec01/rt
   rm -rf /tmp/sec01; mkdir -p $WS $RT
   printf 'SENSITIVE-HOST-FILE-CONTENT\n' > /tmp/sec01/secret-outside.txt
   for payload in '../secret-outside.txt' '../../etc/passwd' '/etc/passwd' '....//secret-outside.txt' 'subdir/../../secret-outside.txt'; do
     : > $RT/gh-output.txt
     echo "=== payload: $payload ==="
     docker run --rm -v $WS:/github/workspace -v $RT:/rt \
       -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
       -v $RT/gh-output.txt:/rt/gh-output.txt \
       -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
       -e INPUT_WORKFLOW_PATH="$payload" -e INPUT_TIMEOUT_MINUTES=1 \
       awr:manual-test 2>&1 | grep -iE 'escapes the workspace|not allowed|not found|Invalid workflow path' | head -1
   done
   ```

**Checkpoints**:

- [ ] CP1: every `../` / absolute payload is REJECTED with a path-validation error (not executed) — verify: each payload prints `Invalid workflow path: ... not allowed` or `... escapes the workspace` (the `..`/absolute guard) — NONE should reach "Executing workflow"
- [ ] CP2: the sensitive outside file content NEVER appears in any output — verify: re-run capturing full output to `$RT/log.txt`, then `grep -c 'SENSITIVE-HOST-FILE-CONTENT' $RT/log.txt` returns `0`
- [ ] CP3: no payload produced a `success` status — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` is `failure` for each

**Cleanup**: `rm -rf /tmp/sec01`

---

### TC-SEC-02: Symlink escape from workspace is blocked

**Priority**: Critical
**Design Ref**: security.ts `validateRealPath` (symlink target escape); OWASP A01

**Attack**: place a symlink inside the workspace pointing OUTSIDE it, then reference it as the workflow.

**Steps**:

1. Create an in-workspace symlink to a host file and try to run it:
   ```bash
   WS=/tmp/sec02/workspace; RT=/tmp/sec02/rt
   rm -rf /tmp/sec02; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'SENSITIVE-SYMLINK-TARGET\n' > /tmp/sec02/outside-target.md
   ln -s /tmp/sec02/outside-target.md $WS/evil-link.md   # symlink inside WS → outside
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=evil-link.md -e INPUT_TIMEOUT_MINUTES=1 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'symlink target escapes|Invalid workflow path|not found' | head -2
   ```
   (Note: the symlink target `/tmp/sec02/...` is on the host, not mounted into the container, so it resolves to a missing/escaping path. The control under test is `validateRealPath` rejecting symlink escape.)

**Checkpoints**:

- [ ] CP1: the symlink is rejected — verify: `grep -iE 'symlink target escapes the workspace|Invalid workflow path|not found' $RT/log.txt` matches (the run does NOT read the target)
- [ ] CP2: the symlink target content never appears — verify: `grep -c 'SENSITIVE-SYMLINK-TARGET' $RT/log.txt` returns `0`
- [ ] CP3: status failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`

**Cleanup**: `rm -rf /tmp/sec02`

---

### TC-SEC-03: `transcript_path` cannot escape the workspace / write outside safe dirs

**Priority**: Critical
**Design Ref**: config.ts `validateSafeOutputPath` (transcript_path); Phase 2 NFR

**Attack**: try to make the action write `conversation.json` to a forbidden absolute path or via `../` escape (arbitrary file write).

**Steps**:

1. Attempt unsafe transcript paths:
   ```bash
   WS=/tmp/sec03/workspace; RT=/tmp/sec03/rt
   rm -rf /tmp/sec03; mkdir -p $WS $RT
   printf 'Say pong.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   for tp in '/etc/evil-transcript.json' '../../../etc/evil.json' '/root/.ssh/evil.json'; do
     : > $RT/gh-output.txt
     echo "=== transcript_path: $tp ==="
     docker run --rm -v $WS:/github/workspace -v $RT:/rt \
       -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
       -v $RT/gh-output.txt:/rt/gh-output.txt \
       -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
       -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
       -e INPUT_EXPORT_TRANSCRIPT=true -e INPUT_TRANSCRIPT_PATH="$tp" -e INPUT_TIMEOUT_MINUTES=1 \
       awr:manual-test 2>&1 | grep -iE 'Invalid transcript_path|escapes the workspace|only allowed under' | head -1
   done
   ```

**Checkpoints**:

- [ ] CP1: each unsafe `transcript_path` is REJECTED with a path-validation error (input parsing fails before run) — verify: each payload prints an `Invalid transcript_path` / `escapes the workspace` / `only allowed under` error
- [ ] CP2: no file was written to the forbidden host locations — verify (host): `test ! -f /etc/evil-transcript.json && test ! -f /etc/evil.json && echo "no escape-write"` (also confirm /root/.ssh untouched)
- [ ] CP3: status failure for each — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`

**Cleanup**: `rm -rf /tmp/sec03`

---

### TC-SEC-04: `auth_config` path cannot point outside safe dirs (credential-file exfil/inject)

**Priority**: High
**Design Ref**: security.ts `validateConfigPath` (safe-prefix allowlist); OWASP A01

**Attack**: try to make the action read an auth.json from an arbitrary host path (e.g. to load attacker-controlled creds, or probe arbitrary files).

**Steps**:

1. Attempt unsafe auth_config paths:
   ```bash
   WS=/tmp/sec04/workspace; RT=/tmp/sec04/rt
   rm -rf /tmp/sec04; mkdir -p $WS $RT
   printf 'Say pong.\n' > $WS/workflow.md
   for ac in '/etc/passwd' '/root/.ssh/id_rsa' '../../../etc/shadow'; do
     : > $RT/gh-output.txt
     echo "=== auth_config: $ac ==="
     docker run --rm -v $WS:/github/workspace -v $RT:/rt \
       -v $RT/gh-output.txt:/rt/gh-output.txt \
       -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
       -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_AUTH_CONFIG="$ac" -e INPUT_TIMEOUT_MINUTES=1 \
       awr:manual-test 2>&1 | grep -iE 'only allowed under|escapes the workspace|Invalid config path|not allowed' | head -1
   done
   ```

**Checkpoints**:

- [ ] CP1: each out-of-safe-dir `auth_config` is REJECTED — verify: each prints `Invalid config path: ... only allowed under` or `escapes the workspace`
- [ ] CP2: no contents of /etc/passwd or a key file leak to output — verify: capture full output to `$RT/log.txt`; `grep -ciE 'root:.*:0:0:|BEGIN .*PRIVATE KEY' $RT/log.txt` returns `0`
- [ ] CP3: status failure — verify per payload `failure`

**Cleanup**: `rm -rf /tmp/sec04`

---

### TC-SEC-05: env*vars cannot override PATH / LD_PRELOAD / GITHUB*\* (env injection → RCE/hijack)

**Priority**: Critical
**Design Ref**: config.ts `RESERVED_ENV_VARS` + `GITHUB_` prefix guard; process isolation; OWASP A03

**Attack**: try to inject `LD_PRELOAD`, `PATH`, `NODE_OPTIONS`, and `GITHUB_TOKEN` via env_vars to hijack child-process execution or GitHub Actions internals.

**Steps**:

1. Attempt each reserved/forbidden key:
   ```bash
   WS=/tmp/sec05/workspace; RT=/tmp/sec05/rt
   rm -rf /tmp/sec05; mkdir -p $WS $RT
   printf 'Say pong.\n' > $WS/workflow.md
   for kv in '{"LD_PRELOAD":"/tmp/evil.so"}' '{"PATH":"/tmp/evil"}' '{"NODE_OPTIONS":"--require /tmp/evil.js"}' '{"GITHUB_TOKEN":"ghp_attacker"}' '{"PYTHONPATH":"/tmp/evil"}'; do
     : > $RT/gh-output.txt
     echo "=== env_vars: $kv ==="
     docker run --rm -v $WS:/github/workspace -v $RT:/rt \
       -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
       -v $RT/gh-output.txt:/rt/gh-output.txt \
       -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
       -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_ENV_VARS="$kv" -e INPUT_TIMEOUT_MINUTES=1 \
       awr:manual-test 2>&1 | grep -iE 'cannot override reserved variable|cannot override GitHub Actions variable' | head -1
   done
   ```

**Checkpoints**:

- [ ] CP1: LD_PRELOAD, PATH, NODE_OPTIONS, PYTHONPATH each rejected with "cannot override reserved variable" — verify: each of those 4 prints the reserved-variable error
- [ ] CP2: GITHUB*TOKEN rejected with "cannot override GitHub Actions variable" — verify: that payload prints the GITHUB* guard error
- [ ] CP3: none of the 5 reached "Executing workflow" / status success — verify: each `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`

**Cleanup**: `rm -rf /tmp/sec05`

---

### TC-SEC-06: env_vars key with shell/special characters is rejected (injection-resistant key validation)

**Priority**: High
**Design Ref**: config.ts `VALID_KEY_PATTERN` (`[a-zA-Z_][a-zA-Z0-9_]*`); OWASP A03

**Attack**: env_vars keys containing shell metacharacters / command-injection attempts.

**Steps**:

1. Attempt malicious keys:
   ```bash
   WS=/tmp/sec06/workspace; RT=/tmp/sec06/rt
   rm -rf /tmp/sec06; mkdir -p $WS $RT
   printf 'Say pong.\n' > $WS/workflow.md
   for kv in '{"FOO; rm -rf /":"x"}' '{"BAR$(whoami)":"x"}' '{"`id`":"x"}' '{"A B":"x"}' '{"--flag":"x"}'; do
     : > $RT/gh-output.txt
     echo "=== key payload: $kv ==="
     docker run --rm -v $WS:/github/workspace -v $RT:/rt \
       -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
       -v $RT/gh-output.txt:/rt/gh-output.txt \
       -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
       -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_ENV_VARS="$kv" -e INPUT_TIMEOUT_MINUTES=1 \
       awr:manual-test 2>&1 | grep -iE 'contains invalid characters|must match' | head -1
   done
   ```

**Checkpoints**:

- [ ] CP1: every malicious key rejected with "contains invalid characters / must match [a-zA-Z_]..." — verify: each payload prints the key-pattern error
- [ ] CP2: status failure for each — verify: `failure`
- [ ] CP3: no command-injection side effect — verify: the host has no evidence of `rm`/`whoami`/`id` execution (the keys are validated as strings, never shell-evaluated) — `echo "keys are parsed as JSON object keys, never shell-evaluated"` (structural argument; the run failed at validation before any child process)

**Cleanup**: `rm -rf /tmp/sec06`

---

### TC-SEC-07: Secrets never leak in logs, outputs, transcript, or summary

**Priority**: Critical
**Design Ref**: SECURITY.md "Environment variable masking" + "Error message sanitization"; scrubSecrets; NFR21; OWASP A09

**Attack**: pass a secret via env_vars and verify it is masked everywhere it could surface (live log, action `result` output, transcript file, job summary), AND that a forced error doesn't leak it.

**Steps**:

1. Run with a secret + transcript + summary, capture ALL surfaces:
   ```bash
   WS=/tmp/sec07/workspace; RT=/tmp/sec07/rt
   rm -rf /tmp/sec07; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Repeat back the value of MY_SECRET if you can see it, otherwise say pong.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_EXPORT_TRANSCRIPT=true -e INPUT_WRITE_JOB_SUMMARY=true \
     -e INPUT_ENV_VARS='{"MY_SECRET":"sk-attacker-leak-9988"}' -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -8
   ```

**Checkpoints**:

- [ ] CP1: raw secret 0× in the action `result` output — verify: `grep -c 'sk-attacker-leak-9988' $RT/gh-output.txt` returns `0`
- [ ] CP2: raw secret 0× in the transcript file — verify: `grep -c 'sk-attacker-leak-9988' $RT/conversation.json` returns `0`
- [ ] CP3: raw secret 0× in the job summary — verify: `grep -c 'sk-attacker-leak-9988' $RT/summary.md` returns `0`
- [ ] CP4: secret registered for masking — verify: `grep -c '::add-mask::sk-attacker-leak-9988' $RT/log.txt` ≥ 1 (the runner replaces it with `***` in live logs)
- [ ] CP5: even if the model echoed the secret value back, the masked/scrubbed forms hold — verify: any occurrence in $RT/log.txt is part of an `::add-mask::` directive only — `grep 'sk-attacker-leak-9988' $RT/log.txt | grep -vc '::add-mask::'` returns `0`

**Cleanup**: `rm -rf /tmp/sec07`

---

### TC-SEC-08: Error messages do not leak absolute host paths (info disclosure)

**Priority**: High
**Design Ref**: SECURITY.md "Error message sanitization"; security.ts `sanitizeErrorMessage`; OWASP A09

**Attack**: trigger errors and confirm the action outputs don't leak internal absolute paths / stack traces.

**Steps**:

1. Trigger a missing-file error and inspect the action `result`/`error` output (not the live debug log):
   ```bash
   WS=/tmp/sec08/workspace; RT=/tmp/sec08/rt
   rm -rf /tmp/sec08; mkdir -p $WS $RT; : > $RT/gh-output.txt
   # no workflow file → error path
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=nope.md -e INPUT_TIMEOUT_MINUTES=1 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -8
   ```

**Checkpoints**:

- [ ] CP1: the `result`/`error` output does not contain a leaked absolute container path with a stack frame — verify: `grep -A1 'result<<' $RT/gh-output.txt | tail -1` (the JSON result) does NOT contain `/github/workspace/` as part of a raw stack trace; a sanitized message ("Workflow file not found: nope.md") is acceptable
- [ ] CP2: no Node stack trace in the action error output — verify: `grep -ciE 'at Object\.<anonymous>|at processTicks|node:internal' $RT/gh-output.txt` returns `0`
- [ ] CP3: clear sanitized error present — verify: `grep -iE 'not found' $RT/log.txt`

**Cleanup**: `rm -rf /tmp/sec08`

---

### TC-SEC-09: Resource-exhaustion / DoS inputs are bounded (oversized inputs rejected)

**Priority**: High
**Design Ref**: INPUT_LIMITS (MAX_PROMPT_LENGTH 100KB, MAX_ENV_VARS_SIZE 64KB, MAX_ENV_VARS_COUNT 100, MAX_WORKFLOW_FILE_SIZE 10MB); OWASP A05

**Attack**: oversized prompt, oversized env_vars, too many env_vars entries — must be rejected at validation, not OOM/hang.

**Steps**:

1. Oversized prompt (>100KB) and too-many env_vars:
   ```bash
   WS=/tmp/sec09/workspace; RT=/tmp/sec09/rt
   rm -rf /tmp/sec09; mkdir -p $WS $RT
   printf 'Say pong.\n' > $WS/workflow.md
   BIGPROMPT=$(head -c 150000 /dev/zero | tr '\0' 'A')   # 150KB > 100KB limit
   : > $RT/gh-output-p.txt
   docker run --rm -v $WS:/github/workspace -v $RT:/rt -v $RT/gh-output-p.txt:/rt/out.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/out.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_PROMPT="$BIGPROMPT" -e INPUT_TIMEOUT_MINUTES=1 \
     awr:manual-test 2>&1 | tee $RT/log-p.txt | grep -iE 'exceeds maximum size|prompt exceeds' | head -1
   # too many env_vars (>100 entries)
   MANYVARS=$(python3 -c "import json;print(json.dumps({f'K{i}':'v' for i in range(150)}))")
   : > $RT/gh-output-e.txt
   docker run --rm -v $WS:/github/workspace -v $RT:/rt -v $RT/gh-output-e.txt:/rt/out.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/out.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_ENV_VARS="$MANYVARS" -e INPUT_TIMEOUT_MINUTES=1 \
     awr:manual-test 2>&1 | tee $RT/log-e.txt | grep -iE 'exceeds maximum of 100 entries|exceeds maximum' | head -1
   ```

**Checkpoints**:

- [ ] CP1: oversized prompt rejected with a size-limit error — verify: `grep -iE 'prompt exceeds maximum size' $RT/log-p.txt`
- [ ] CP2: oversized prompt → status failure (not a hang/OOM) — verify: `grep -A1 'status<<' $RT/gh-output-p.txt | tail -1` equals `failure`
- [ ] CP3: too-many env_vars rejected — verify: `grep -iE 'exceeds maximum of 100 entries' $RT/log-e.txt`
- [ ] CP4: both runs terminated quickly (bounded, no DoS) — verify: both produced output and exited (you got results back)

**Cleanup**: `rm -rf /tmp/sec09`

---

### TC-SEC-10: Dependency vulnerability scan (no high/critical CVEs)

**Priority**: High
**Design Ref**: SECURITY.md "Dependency scanning"; OWASP A06

**Attack surface**: known CVEs in npm dependencies.

**Steps**:

1. Run npm audit (production deps) on the host:
   ```bash
   cd /Users/tannt/Work/GIT/Personal/Sources/ai-workflow-runner
   npm audit --omit=dev --audit-level=high 2>&1 | tee /tmp/sec10-audit.txt | tail -20
   echo "AUDIT_EXIT: ${PIPESTATUS[0]}"
   ```

**Checkpoints**:

- [ ] CP1: no HIGH or CRITICAL vulnerabilities in production deps — verify: `npm audit --omit=dev --audit-level=high` exits `0` (AUDIT_EXIT: 0) OR the report shows `0 vulnerabilities` / only low/moderate. If high/critical found, FAIL and list them (this is a real finding to triage).
- [ ] CP2: record the audit summary line — verify: `grep -iE 'vulnerabilit|found' /tmp/sec10-audit.txt | tail -2`

**Cleanup**: `rm -f /tmp/sec10-audit.txt`

---

### TC-SEC-11: Validation script cannot be abused for arbitrary host damage beyond its sandbox

**Priority**: Medium
**Design Ref**: validation.ts (script execution via python3/node, scoped childEnv, SIGKILL escalation, timeout); process isolation

**Attack**: a validation script attempts to read a secret env var that should NOT be in its scoped environment, and to run beyond the timeout.

**Steps**:

1. Inline validation script that tries to exfiltrate the runner's own env + a long sleep (timeout test):
   ```bash
   WS=/tmp/sec11/workspace; RT=/tmp/sec11/rt
   rm -rf /tmp/sec11; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Say pong.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   # validation script: prints whether it can see a GITHUB_ var (should be limited via scoped childEnv); returns "true" to pass fast
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_VALIDATION_SCRIPT='python:import os;print("LEAK:"+os.environ.get("GITHUB_TOKEN","none"));print("true")' \
     -e INPUT_VALIDATION_SCRIPT_TYPE=python -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'LEAK:|Validation' | head -4
   ```

**Checkpoints**:

- [ ] CP1: the validation script runs in a scoped env — a real GITHUB_TOKEN is NOT leaked to it — verify: `grep -E 'LEAK:none|LEAK:$' $RT/log.txt` (the script saw "none" — no GITHUB_TOKEN in its env) OR if a token IS present, confirm it's not a real secret. (Informational if GITHUB_TOKEN isn't set in this harness; the structural point is childEnv is scoped, not the full process env.)
- [ ] CP2: the run completes / validation executes without the script escalating privileges — verify: `grep -iE 'Validation' $RT/log.txt` shows the validation ran and the workflow concluded with a status
- [ ] CP3: AI_LAST_MESSAGE was provided to the script env (documented contract) — informational: validation scripts receive AI_LAST_MESSAGE

**Cleanup**: `rm -rf /tmp/sec11`
