import type { PermissionConfig, PermissionObjectConfig } from '@opencode-ai/sdk/v2';

// ─────────────────────────────────────────────────────────────────────────────
// Bash command allowlist
//
// OpenCode evaluates bash permission patterns with last-match-wins (findLast).
// Order within the object is insertion order, so entries later in the object
// win over earlier entries.  We therefore lay them out as:
//   1. Allow rules for read-only extraction commands
//   2. Allow rules for read-only git subcommands (history access)
//   3. Deny rules for credential-exposing paths (.git/config, credentials)
//   4. Deny rules for mutating git subcommands
//   5. Catch-all deny at the end — wins over everything not explicitly allowed
//
// The "source(node)" of each bash command is its full text, matched by
// Wildcard.match (* → .*).  So "*.git/config*" matches any command string
// containing ".git/config".
// ─────────────────────────────────────────────────────────────────────────────

// Read-only shell extraction commands allowed by default.
const BASH_READ_ONLY_ALLOW: PermissionObjectConfig = {
  'grep*': 'allow',
  'ls*': 'allow',
  'find*': 'allow',
  'cat*': 'allow',
  'head*': 'allow',
  'tail*': 'allow',
  'wc*': 'allow',
  'tree*': 'allow',
  'file*': 'allow',
  'rg*': 'allow',
};

// Read-only git subcommands — history and metadata access only.
// OpenCode treats `git <subcommand>` as arity-2, so these are distinct patterns.
const BASH_GIT_READ_ONLY_ALLOW: PermissionObjectConfig = {
  'git log*': 'allow',
  'git show*': 'allow',
  'git diff*': 'allow',
  'git blame*': 'allow',
  'git shortlog*': 'allow',
  'git rev-list*': 'allow',
  'git status*': 'allow',
  'git tag*': 'allow',
  'git branch*': 'allow',
  'git describe*': 'allow',
  'git ls-files*': 'allow',
  'git ls-tree*': 'allow',
  'git cat-file*': 'allow',
  'git reflog*': 'allow',
  'git whatchanged*': 'allow',
};

// Credential-file path denies — placed AFTER cat*/head*/grep* allows so they
// win under last-match-wins.  These match any command whose text references the
// credential files (e.g. "cat .git/config", "head .git/credentials").
// external_directory:deny does NOT block these because .git/ is inside the workspace.
const BASH_CREDENTIAL_PATH_DENY: PermissionObjectConfig = {
  '*.git/config*': 'deny',
  '*.git/credentials*': 'deny',
  '*.git-credentials*': 'deny',
};

// Mutating and credential-exposing git subcommands — denied explicitly.
// git config* exposes http.<url>.extraheader (checkout token) — AGENT-03.
// git credential* is the credential helper interface.
const BASH_GIT_MUTATING_DENY: PermissionObjectConfig = {
  'git commit*': 'deny',
  'git push*': 'deny',
  'git pull*': 'deny',
  'git fetch*': 'deny',
  'git clone*': 'deny',
  'git merge*': 'deny',
  'git rebase*': 'deny',
  'git reset*': 'deny',
  'git checkout*': 'deny',
  'git remote*': 'deny',
  'git config*': 'deny',
  'git credential*': 'deny',
  'git am*': 'deny',
  'git apply*': 'deny',
};

// Credential file paths the read tool should not be able to open.
// These are path patterns matched against the file path the read tool resolves to.
export const CREDENTIAL_READ_DENY_PATTERNS = [
  '.git/config',
  '.git/credentials',
  '.git-credentials',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Action security rules — applied LAST so they win over consumer config.
// ─────────────────────────────────────────────────────────────────────────────

// Represents the permission config object we pass to the SDK.
// PermissionConfig has a complex index signature so we use a plain Record here,
// which is fully compatible at the SDK boundary (it accepts Record<string, ...>).
type AgentPermissionMap = Record<string, unknown>;

function buildActionSecurityRules(bashAllowPatterns: PermissionObjectConfig): AgentPermissionMap {
  return {
    bash: {
      ...BASH_READ_ONLY_ALLOW,
      ...bashAllowPatterns,
      ...BASH_GIT_READ_ONLY_ALLOW,
      // Credential path denies come after allows — they win.
      ...BASH_CREDENTIAL_PATH_DENY,
      ...BASH_GIT_MUTATING_DENY,
      // Catch-all deny last — wins over every unmatched command.
      '*': 'deny',
    },
    // .git/config and credential files must also be denied at the read-tool layer.
    read: {
      '*.git/config*': 'deny',
      '*.git/credentials*': 'deny',
      '*.git-credentials*': 'deny',
    },
    // Confine reads and bash path-args to the working directory.
    external_directory: 'deny',
    // Knowledge extraction needs search results; arbitrary fetch is denied.
    websearch: 'allow',
    webfetch: 'deny',
  };
}

// Baseline read-family allow for knowledge extraction.  Applied first so consumer
// config can narrow (but not widen, since Action security rules come last).
const READ_FAMILY_DEFAULTS: AgentPermissionMap = {
  read: 'allow',
  edit: 'allow',
  glob: 'allow',
  grep: 'allow',
  list: 'allow',
  lsp: 'allow',
  question: 'deny',
  plan_enter: 'deny',
  plan_exit: 'deny',
};

/**
 * Parses a comma/newline-separated list of bash patterns into an allow map.
 * Called by config.ts with the raw `bash_allow_patterns` input value.
 */
export function parseBashAllowPatterns(raw: string): PermissionObjectConfig {
  if (!raw.trim()) return {};
  const patterns = raw
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const result: PermissionObjectConfig = {};
  for (const p of patterns) {
    result[p] = 'allow';
  }
  return result;
}

/**
 * Builds the final PermissionConfig for the SDK.
 *
 * Merge order (last-match-wins under findLast):
 *   READ_FAMILY_DEFAULTS → consumerPermission → ACTION_SECURITY_RULES
 *
 * Action security rules are applied last so consumer opencode_config cannot
 * weaken them (e.g. setting bash:"allow" or external_directory:"allow").
 */
export function buildAgentPermission(
  consumerPermission: Partial<PermissionConfig> | undefined,
  bashAllowPatterns: PermissionObjectConfig
): AgentPermissionMap {
  const actionRules = buildActionSecurityRules(bashAllowPatterns);
  return {
    ...READ_FAMILY_DEFAULTS,
    ...(consumerPermission as AgentPermissionMap | undefined),
    // Action security rules always win — applied last.
    ...actionRules,
  };
}

/**
 * Returns true if the permission request should be auto-approved.
 *
 * Investigation finding (Task 3): a config-level `deny` raises a `DeniedError`
 * inside opencode's permission engine and does NOT emit a `permission.asked`
 * event — the handler never sees denied-by-config requests.  `permission.asked`
 * is only emitted for `"ask"` rules.  Since we set explicit allow/deny (not
 * "ask"), the handler in practice only receives requests for "ask"-classified
 * tools from consumer config.  The blanket `'always'` reply is nevertheless
 * unsafe: if a consumer accidentally sets a sensitive tool to "ask", our handler
 * would approve it.  We therefore restrict auto-approval to the known safe
 * read-family tools; everything else is rejected.
 */
const AUTO_APPROVE_PERMISSIONS = new Set([
  'read',
  'edit',
  'glob',
  'grep',
  'list',
  'lsp',
  'task',
  'skill',
  'repo_overview',
]);

export function shouldAutoApprove(permissionName: string): boolean {
  return AUTO_APPROVE_PERMISSIONS.has(permissionName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Webfetch per-domain allowlist (via OPENCODE_PERMISSION env var)
//
// Background: the documented Config.permission.webfetch is typed as a tri-state
// Action — an object form crashes strict schema decode (config.ts strict mode).
// The OPENCODE_PERMISSION env var is JSON.parse'd AFTER schema validation and
// never re-decoded, so the object form survives (config.ts:748).  The SDK
// spreads process.env onto opencode serve, so setting this var on scopedEnv
// before spawn is sufficient.
//
// IMPORTANT: scope the JSON to {"webfetch": ...} ONLY.  OPENCODE_PERMISSION
// mergeDeeps across all permission keys — including bash/external_directory —
// so any other key here would override what we set via opencode_config.
//
// Rule order: allow-globs first, "*":"deny" last (findLast precedence).
//
// Verified for opencode 1.15.13.  Re-verify on opencode upgrades (Epic 12
// currency guard).  If this env-merge behavior breaks, fall back to a
// tool.execute.before plugin that inspects output.args.url and throws for
// off-allowlist hostnames (research Option B).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the OPENCODE_PERMISSION env-var JSON string for a webfetch domain allowlist.
 *
 * @param domains - List of allowed host globs (e.g. ["github.com", "docs.example.com"]).
 * @returns JSON string scoped to {"webfetch": {<allow rules>, "*":"deny"}} when domains
 *   is non-empty, or undefined when empty (webfetch stays denied via the 13-2 baseline).
 */
export function buildWebfetchPermissionEnv(domains: string[]): string | undefined {
  const nonEmpty = domains.filter((d) => d.trim().length > 0);
  if (nonEmpty.length === 0) {
    return undefined;
  }

  const webfetchRules: Record<string, string> = {};
  for (const domain of nonEmpty) {
    // Allow the domain root and all paths under it.
    webfetchRules[`https://${domain}/*`] = 'allow';
  }
  // Catch-all deny LAST — findLast means this wins over unmatched URLs.
  webfetchRules['*'] = 'deny';

  return JSON.stringify({ webfetch: webfetchRules });
}
