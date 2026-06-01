# TC-12: SDK Currency, Image Build & Backward Compatibility (Epic 12 + regression)

Tests the pinned binary / image build (Epic 12) and that Phase 2 features are off-by-default (backward compatibility — no regression to pre-Phase-2 behavior).

## Prerequisites

- [ ] Docker available; building from source per Rule #10

---

### TC-12-01: Docker image builds + pinned `opencode` binary is 1.15.13

**Priority**: Critical
**Design Ref**: opencode-upgrade-design §2; FR64, FR65

**Steps**:

1. Build the image from source and inspect the binary:
   ```bash
   cd /Users/tannt/Work/GIT/Personal/Sources/ai-workflow-runner
   npm run bundle 2>&1 | tail -1
   docker build -t awr:tc1201 . 2>&1 | tail -3; echo "build exit: $?"
   docker run --rm --entrypoint bash awr:tc1201 -c 'opencode --version'
   ```

**Checkpoints**:

- [ ] CP1: image builds successfully (the Dockerfile's `opencode --version` verify step passes) — verify: `build exit: 0`
- [ ] CP2: pinned binary reports 1.15.13 — verify: `docker run --rm --entrypoint bash awr:tc1201 -c 'opencode --version'` prints `1.15.13`
- [ ] CP3: SDK pin in package-lock is 1.15.13 (aligned with the binary) — verify: `node -e "console.log(require('./package-lock.json').packages['node_modules/@opencode-ai/sdk'].version)"` prints `1.15.13`
- [ ] CP4: Dockerfile pins the CLI (not unpinned) — verify: `grep -c 'opencode-ai@1.15.13' Dockerfile` returns `1`

**Cleanup**:

```bash
docker rmi awr:tc1201 >/dev/null 2>&1 || true
```

---

### TC-12-02: Backward compatibility — no Phase-2 inputs = unchanged behavior

**Priority**: High
**Design Ref**: opencode-upgrade-design §0 (all Phase 2 inputs default off)

**Preconditions**:

- [ ] A plain run with NONE of the Phase 2 inputs (no export_transcript, no write_job_summary, no disable_free_models, no fallback_config)

**Steps**:

1. Run the action with only the pre-Phase-2 inputs:
   ```bash
   WS=/tmp/tc1202/workspace; RT=/tmp/tc1202/rt
   rm -rf /tmp/tc1202; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'pong|error' | head -4
   ```

**Checkpoints**:

- [ ] CP1: run succeeds as before — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success`
- [ ] CP2: NO transcript file written (export off by default) — verify: `test ! -f $RT/conversation.json && echo "no transcript OK"`
- [ ] CP3: NO job summary written (off by default) — verify: `test ! -s $RT/summary.md && echo "no summary OK"`
- [ ] CP4: `transcript_json_path` output empty — verify: `grep -A1 'transcript_json_path<<' $RT/gh-output.txt | tail -1 | tr -d '[:space:]'` is empty
- [ ] CP5: assistant produced output — verify: `grep -i 'pong' $RT/log.txt`

**Cleanup**: `rm -rf /tmp/tc1202`

```

```

---

### TC-12-03: Invalid `env_vars` JSON is rejected before any run (abnormal input)

**Priority**: High
**Design Ref**: prd #FR36 (clear errors for invalid input config); config validation

**Preconditions**:

- [ ] `env_vars` set to non-JSON / non-object — must fail input validation with a clear message, not crash.

**Steps**:

1. Run with malformed env_vars:
   ```bash
   WS=/tmp/tc1203/workspace; RT=/tmp/tc1203/rt
   rm -rf /tmp/tc1203; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Say pong.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_ENV_VARS='not-json-at-all' -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -6
   ```

**Checkpoints**:

- [ ] CP1: clear validation error about env_vars being valid JSON — verify: `grep -iE 'env_vars must be a valid JSON object' $RT/log.txt`
- [ ] CP2: status failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`
- [ ] CP3: failed during input parsing — NO session created (didn't reach the SDK) — verify: `grep -c 'Session created' $RT/log.txt` returns `0`
- [ ] CP4: no uncaught crash — verify: `grep -ciE 'unhandledrejection|TypeError' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1203`

---

### TC-12-04: Missing workflow file is rejected with a clear error (abnormal input)

**Priority**: Medium
**Design Ref**: prd #FR35 (clear error for missing workflow file)

**Preconditions**:

- [ ] `workflow_path` points to a file that does not exist.

**Steps**:

1. Run pointing at a nonexistent workflow:
   ```bash
   WS=/tmp/tc1204/workspace; RT=/tmp/tc1204/rt
   rm -rf /tmp/tc1204; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   # NOTE: no workflow.md created
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=does-not-exist.md -e INPUT_OPENCODE_CONFIG=oc.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -6
   ```

**Checkpoints**:

- [ ] CP1: clear "Workflow file not found" error — verify: `grep -iE 'Workflow file not found|not found: does-not-exist' $RT/log.txt`
- [ ] CP2: status failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`
- [ ] CP3: error message does NOT leak an absolute container path (sanitized) — verify: `grep -E '/github/workspace/does-not-exist' $RT/log.txt | grep -vc 'not found' ` is `0` (the basename may appear, but not as a leaked absolute path in a stack trace)
- [ ] CP4: no session created — verify: `grep -c 'Session created' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1204`
