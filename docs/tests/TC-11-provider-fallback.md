# TC-11: Provider Fallback Chain (Epic 11)

Real-runtime tests for the fallback chain: preflight-skip of unauthenticated providers, advance-to-next, exhaustion error, and the D8 no-credentials invariant.

## Prerequisites

- [ ] Docker image `awr:manual-test` built from source
- [ ] `~/.local/share/opencode/auth.json` with `github-copilot` authenticated and `openrouter` NOT authenticated
- [ ] `workflow.md` with the pong prompt

---

### TC-11-01: Unauthenticated provider skipped → advances → working provider wins

**Priority**: Critical
**Design Ref**: opencode-upgrade-design §5.2; FR60, FR61, FR62

**Preconditions**:

- [ ] `fallback.json` chain: p0 = `openrouter` (unauthenticated → skipped), p1 = `github-copilot/gpt-5-mini` (authenticated → wins)

**Steps**:

1. Run with the fallback chain:
   ```bash
   WS=/tmp/tc1101/workspace; RT=/tmp/tc1101/rt
   rm -rf /tmp/tc1101; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   cat > $WS/fallback.json <<'JSON'
   { "chain": [
     { "provider": "openrouter", "model": "openrouter/some-model" },
     { "provider": "github-copilot", "model": "github-copilot/gpt-5-mini" }
   ] }
   JSON
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_FALLBACK_CONFIG=fallback.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'skipping|Trying fallback|pong|error' | head -6
   ```

**Checkpoints**:

- [ ] CP1: openrouter (unauthenticated) is preflight-skipped with a warning — verify: `grep -iE "Fallback provider 'openrouter' is not authenticated" $RT/log.txt`
- [ ] CP2: selector advances to github-copilot — verify: `grep -iE 'Trying fallback provider: github-copilot' $RT/log.txt`
- [ ] CP3: assistant committed on the winner — verify: `grep -i 'pong' $RT/log.txt`
- [ ] CP4: status success — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success`
- [ ] CP5: no double-prefix in the model id (R2 regression) — verify: `grep -c 'github-copilot/github-copilot/' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1101`

---

### TC-11-02: Chain exhaustion → aggregated error

**Priority**: High
**Design Ref**: opencode-upgrade-design §5.4; FR63

**Preconditions**:

- [ ] A chain of ALL unauthenticated providers → preflight empty → "no providers authenticated" message

**Steps**:

1. Run with an all-unauthenticated chain:
   ```bash
   WS=/tmp/tc1102/workspace; RT=/tmp/tc1102/rt
   rm -rf /tmp/tc1102; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Say pong.\n' > $WS/workflow.md
   cat > $WS/fallback.json <<'JSON'
   { "chain": [
     { "provider": "openrouter", "model": "openrouter/a" },
     { "provider": "groq", "model": "groq/b" }
   ] }
   JSON
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_FALLBACK_CONFIG=fallback.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'not authenticated|no fallback providers|All [0-9]+ fallback' | head -4
   ```

**Checkpoints**:

- [ ] CP1: clear "no providers authenticated" message listing the providers — verify: `grep -iE 'No fallback providers are authenticated' $RT/log.txt` (both openrouter+groq unauthenticated → preflight empty)
- [ ] CP2: status failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`
- [ ] CP3: no session created — verify: `grep -c 'Session created' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1102`

---

### TC-11-03: `fallback_config` with credentials is rejected (D8)

**Priority**: Critical
**Design Ref**: opencode-upgrade-design D8; FR59

**Preconditions**:

- [ ] A `fallback.json` containing a credential key (`token`) in an entry — MUST be rejected

**Steps**:

1. Run with a credential-bearing chain:
   ```bash
   WS=/tmp/tc1103/workspace; RT=/tmp/tc1103/rt
   rm -rf /tmp/tc1103; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Say pong.\n' > $WS/workflow.md
   cat > $WS/fallback.json <<'JSON'
   { "chain": [
     { "provider": "github-copilot", "model": "github-copilot/gpt-5-mini", "token": "ghu_leakedsecret" }
   ] }
   JSON
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_FALLBACK_CONFIG=fallback.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -6
   ```

**Checkpoints**:

- [ ] CP1: D8 rejection error — verify: `grep -iE 'fallback_config must not contain credentials' $RT/log.txt`
- [ ] CP2: status failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`
- [ ] CP3: the leaked token value does NOT appear in any artifact/output beyond the rejection (it should be in neither gh-output nor any written file) — verify: `grep -c 'ghu_leakedsecret' $RT/gh-output.txt` returns `0`
- [ ] CP4: no session created — verify: `grep -c 'Session created' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1103`

---

### TC-11-04: Malformed `fallback_config` JSON is rejected with a clear error (abnormal input)

**Priority**: High
**Design Ref**: opencode-upgrade-design §5 (loadFallbackConfig validation); FR59

**Preconditions**:

- [ ] A `fallback.json` that is NOT valid JSON.

**Steps**:

1. Run with broken JSON:
   ```bash
   WS=/tmp/tc1104/workspace; RT=/tmp/tc1104/rt
   rm -rf /tmp/tc1104; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Say pong.\n' > $WS/workflow.md
   printf '{ "chain": [ { "provider": "x" ,,, ' > $WS/fallback.json   # deliberately malformed
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_FALLBACK_CONFIG=fallback.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -6
   ```

**Checkpoints**:

- [ ] CP1: clear "Invalid JSON in fallback config" error — verify: `grep -iE 'Invalid JSON in fallback config' $RT/log.txt`
- [ ] CP2: status failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`
- [ ] CP3: no crash/stack trace — verify: `grep -ciE 'unhandledrejection|at JSON.parse|TypeError' $RT/log.txt` returns `0`
- [ ] CP4: no session created — verify: `grep -c 'Session created' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1104`

---

### TC-11-05: Empty / structurally-invalid `chain` is rejected (abnormal input)

**Priority**: High
**Design Ref**: opencode-upgrade-design §5 (chain non-empty array; entry needs provider+model); FR59

**Preconditions**:

- [ ] Two sub-cases: (a) empty `chain` array; (b) an entry missing `model`.

**Steps**:

1. Empty chain:
   ```bash
   WS=/tmp/tc1105/workspace; RT=/tmp/tc1105/rt
   rm -rf /tmp/tc1105; mkdir -p $WS $RT; : > $RT/gh-output-a.txt; : > $RT/gh-output-b.txt
   printf 'Say pong.\n' > $WS/workflow.md
   printf '{ "chain": [] }\n' > $WS/fallback-a.json
   printf '{ "chain": [ { "provider": "github-copilot" } ] }\n' > $WS/fallback-b.json   # missing model
   runfb() { docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/$2:/rt/out.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/out.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_FALLBACK_CONFIG=$1 -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1; }
   runfb fallback-a.json gh-output-a.txt > $RT/log-a.txt
   runfb fallback-b.json gh-output-b.txt > $RT/log-b.txt
   ```

**Checkpoints**:

- [ ] CP1: empty chain → "chain must be a non-empty array" error — verify: `grep -iE 'chain.*non-empty array' $RT/log-a.txt`
- [ ] CP2: empty chain → status failure — verify: `grep -A1 'status<<' $RT/gh-output-a.txt | tail -1` equals `failure`
- [ ] CP3: missing-model entry → clear "model must be a non-empty string" error — verify: `grep -iE 'chain\[0\]\.model must be a non-empty string|model must be a non-empty string' $RT/log-b.txt`
- [ ] CP4: missing-model entry → status failure — verify: `grep -A1 'status<<' $RT/gh-output-b.txt | tail -1` equals `failure`

**Cleanup**: `rm -rf /tmp/tc1105`

---

### TC-11-06: Committed provider does NOT switch on a later error (D2 no mid-run failover, abnormal/edge)

**Priority**: High
**Design Ref**: opencode-upgrade-design D2; FR62

**Preconditions**:

- [ ] A chain whose FIRST entry is a working provider (`github-copilot/gpt-5-mini`) so it COMMITS; a second entry exists but must NEVER be tried. Use a prompt that takes a couple steps so there's a real assistant turn. (We verify the run lands on entry 0 and never logs "Trying fallback provider: <entry-1>".)

**Steps**:

1. Run a chain where p0 commits:
   ```bash
   WS=/tmp/tc1106/workspace; RT=/tmp/tc1106/rt
   rm -rf /tmp/tc1106; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   cat > $WS/fallback.json <<'JSON'
   { "chain": [
     { "provider": "github-copilot", "model": "github-copilot/gpt-5-mini" },
     { "provider": "anthropic", "model": "anthropic/claude-haiku-4-5" }
   ] }
   JSON
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_FALLBACK_CONFIG=fallback.json -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'Trying fallback|pong' | head -5
   ```

**Checkpoints**:

- [ ] CP1: only the FIRST provider is tried — verify: `grep -c 'Trying fallback provider: github-copilot' $RT/log.txt` equals `1`
- [ ] CP2: the SECOND provider is NEVER tried — verify: `grep -c 'Trying fallback provider: anthropic' $RT/log.txt` returns `0`
- [ ] CP3: committed on p0, succeeded — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success` AND `grep -i 'pong' $RT/log.txt` (majority of 2-3 for auth)

**Cleanup**: `rm -rf /tmp/tc1106`
