# TC-09: Conversation Logging & Transcript Export (Epic 9)

Real-runtime tests for transcript JSON export, secret scrubbing, job summary, and stop-command wrapping. All run the bundled action inside the Docker image (`awr:manual-test`) against real auth.

## Prerequisites

- [ ] Docker image `awr:manual-test` built from source (see test-plan §4 setup)
- [ ] `~/.local/share/opencode/auth.json` present with `github-copilot` authenticated
- [ ] Workspace dir with `workflow.md` (`Reply with exactly the single word: pong\nDo not use any tools.`) and `oc.json` (`{ "model": "github-copilot/gpt-5-mini" }`)
- [ ] Fresh `RUNNER_TEMP` dir + empty `gh-output.txt` + empty `summary.md` per test

---

### TC-09-01: Transcript export writes valid `conversation.json`

**Priority**: Critical
**Design Ref**: opencode-upgrade-design §3b (D3); FR52, FR53

**Preconditions**:

- [ ] `WS=/tmp/tc0901/workspace`, `RT=/tmp/tc0901/rt` created; workflow.md + oc.json present in WS
- [ ] `export_transcript` will be enabled

**Steps**:

1. Set up + run the action with transcript export on:
   ```bash
   WS=/tmp/tc0901/workspace; RT=/tmp/tc0901/rt
   rm -rf /tmp/tc0901; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_EXPORT_TRANSCRIPT=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tail -20
   ```

**Checkpoints**:

- [ ] CP1: run succeeded — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success`
- [ ] CP2: transcript file written at the resolved path — verify: `test -f $RT/conversation.json && echo EXISTS`
- [ ] CP3: file is valid JSON, non-empty array of messages — verify: `python3 -c "import json;d=json.load(open('$RT/conversation.json'));print('messages',len(d));assert isinstance(d,list) and len(d)>=2"`
- [ ] CP4: transcript contains user + assistant roles — verify: `python3 -c "import json;d=json.load(open('$RT/conversation.json'));roles=[m.get('info',{}).get('role') for m in d];assert 'user' in roles and 'assistant' in roles;print(roles)"`
- [ ] CP5: `transcript_json_path` output set — verify: `grep -A1 'transcript_json_path<<' $RT/gh-output.txt | tail -1` is non-empty (e.g. `/rt/conversation.json`)

**Cleanup**:

```bash
rm -rf /tmp/tc0901
```

---

### TC-09-02: Secret scrubbing in transcript + job summary (NFR21)

**Priority**: Critical
**Design Ref**: opencode-upgrade-design §3b; NFR21

**Preconditions**:

- [ ] A distinctive secret passed via `env_vars`: `sk-supersecret-zzz123`
- [ ] Both transcript export AND job summary enabled

**Steps**:

1. Run with a secret env var, transcript + summary on. Use a prompt that nudges the model to echo the secret name so the value has a chance to appear in output (the value must still be scrubbed regardless):
   ```bash
   WS=/tmp/tc0902/workspace; RT=/tmp/tc0902/rt
   rm -rf /tmp/tc0902; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_EXPORT_TRANSCRIPT=true -e INPUT_WRITE_JOB_SUMMARY=true \
     -e INPUT_ENV_VARS='{"MY_SECRET":"sk-supersecret-zzz123"}' -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tail -15
   ```

**Checkpoints**:

- [ ] CP1: raw secret value appears 0 times in the transcript file — verify: `grep -c 'sk-supersecret-zzz123' $RT/conversation.json` returns `0`
- [ ] CP2: raw secret value appears 0 times in the job summary — verify: `grep -c 'sk-supersecret-zzz123' $RT/summary.md` returns `0`
- [ ] CP3: secret was masked in the live log — verify: the run output contains `::add-mask::sk-supersecret-zzz123` (GitHub masks it) — `docker ... 2>&1 | grep -c '::add-mask::sk-supersecret'` ≥ 1
- [ ] CP4: transcript still written (scrubbing didn't break export) — verify: `test -f $RT/conversation.json && echo OK`

**Cleanup**:

```bash
rm -rf /tmp/tc0902
```

---

### TC-09-03: Job summary renders token/cost/duration + final message

**Priority**: High
**Design Ref**: opencode-upgrade-design §3b; FR54

**Preconditions**:

- [ ] `write_job_summary` enabled; `GITHUB_STEP_SUMMARY` mounted

**Steps**:

1. Run with summary on (reuse TC-09-01 invocation but add `-e INPUT_WRITE_JOB_SUMMARY=true`):
   ```bash
   WS=/tmp/tc0903/workspace; RT=/tmp/tc0903/rt
   rm -rf /tmp/tc0903; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_WRITE_JOB_SUMMARY=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tail -10
   ```

**Checkpoints**:

- [ ] CP1: summary non-empty — verify: `test -s $RT/summary.md && echo OK`
- [ ] CP2: has a status heading — verify: `grep -iE 'OpenCode Run|Success' $RT/summary.md`
- [ ] CP3: has a token/cost/duration table — NOTE: core.summary renders the table as a SINGLE HTML line, so count individual labels, not lines — verify: each of `grep -c 'Input tokens' $RT/summary.md`, `grep -c 'Cost' $RT/summary.md`, `grep -c 'Duration' $RT/summary.md` returns ≥1 (all present on the one table line)
- [ ] CP4: includes the final assistant message — verify: `grep -i 'pong' $RT/summary.md`

**Cleanup**:

```bash
rm -rf /tmp/tc0903
```

---

### TC-09-04: Stop-command wrapping of streamed assistant text

**Priority**: Medium
**Design Ref**: opencode-upgrade-design §3a; NFR22

**Preconditions**:

- [ ] A normal run (no special inputs needed); the model produces streamed text

**Steps**:

1. Run and capture the live log:
   ```bash
   WS=/tmp/tc0904/workspace; RT=/tmp/tc0904/rt
   rm -rf /tmp/tc0904; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee /tmp/tc0904/log.txt | tail -15
   ```

**Checkpoints**:

- [ ] CP1: streamed text is bracketed by a stop-command open marker — verify: `grep -c '::stop-commands::opencode-stop-' /tmp/tc0904/log.txt` ≥ 1
- [ ] CP2: matching close marker present — verify: `grep -c '::opencode-stop-43f8a2b1::' /tmp/tc0904/log.txt` ≥ 1
- [ ] CP3: run succeeded (wrapping didn't break streaming) — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success`

**Cleanup**:

```bash
rm -rf /tmp/tc0904
```

---

### TC-09-05: Transcript export is best-effort — a failed session does NOT crash the run (abnormal)

**Priority**: High
**Design Ref**: opencode-upgrade-design §3b (AC6 best-effort); NFR21

**Preconditions**:

- [ ] `export_transcript` enabled, but the session FAILS at startup (use a deliberately invalid model so `session.error` fires) — the transcript export path must degrade gracefully, not throw.

**Steps**:

1. Force a session failure with export on:
   ```bash
   WS=/tmp/tc0905/workspace; RT=/tmp/tc0905/rt
   rm -rf /tmp/tc0905; mkdir -p $WS $RT; : > $RT/gh-output.txt; : > $RT/summary.md
   printf 'Say pong.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/this-model-does-not-exist-zzz" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt -v $RT/summary.md:/rt/summary.md \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e GITHUB_OUTPUT=/rt/gh-output.txt -e GITHUB_STEP_SUMMARY=/rt/summary.md \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_EXPORT_TRANSCRIPT=true -e INPUT_WRITE_JOB_SUMMARY=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -10
   ```

**Checkpoints**:

- [ ] CP1: the run reports a clean failure (session error), NOT an unhandled crash/stack trace — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure` AND `grep -ciE 'unhandledrejection|TypeError|at Object\.<anonymous>|Cannot read prop' $RT/log.txt` returns `0`
- [ ] CP2: transcript export failure (if any) is a best-effort titled warning, not a fatal error — verify: `grep -iE 'Transcript export failed|Post-run export failed' $RT/log.txt` (a warning is acceptable; absence is also fine if nothing was exportable) — informational, not a hard gate
- [ ] CP3: the action exited with a controlled failure (the process didn't hang or die uncaught) — verify: the `docker run` returned (you got output + a status line) — `test -s $RT/gh-output.txt && echo "produced output"`

**Cleanup**:

```bash
rm -rf /tmp/tc0905
```

---

### TC-09-06: Job summary best-effort when `$GITHUB_STEP_SUMMARY` is unset (edge)

**Priority**: Medium
**Design Ref**: opencode-upgrade-design §3b (AC6 best-effort, 1 MiB limit)

**Preconditions**:

- [ ] `write_job_summary` enabled but `GITHUB_STEP_SUMMARY` env var NOT set (simulates a local/non-Actions run) — must not crash.

**Steps**:

1. Run with summary on but no step-summary sink:
   ```bash
   WS=/tmp/tc0906/workspace; RT=/tmp/tc0906/rt
   rm -rf /tmp/tc0906; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_WRITE_JOB_SUMMARY=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'pong|summary|error' | head -5
   ```

**Checkpoints**:

- [ ] CP1: run still succeeds despite no summary sink — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success` (model run; may re-try 2-3× for auth freshness)
- [ ] CP2: no unhandled crash from the summary writer — verify: `grep -ciE 'unhandledrejection|TypeError|ENOENT.*summary' $RT/log.txt` returns `0` (a best-effort `Job summary write failed` titled warning is acceptable)

**Cleanup**:

```bash
rm -rf /tmp/tc0906
```
