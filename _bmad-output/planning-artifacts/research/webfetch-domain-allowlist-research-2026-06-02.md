# Research: Restricting OpenCode `webfetch` to a Domain Allowlist

- **Date:** 2026-06-02
- **Analyst:** Mary (tech-researcher)
- **Target version:** `@opencode-ai/sdk@1.15.13` / opencode CLI 1.15.13
- **Source of truth:** local checkout `~/Work/GIT/Personal/Sources/opencode` @ `c573798` (dev/production, version 1.15.13)

---

## VERDICT

**Native per-domain webfetch allowlist via the documented `Config` object: NO.**
The `permission.webfetch` config key is typed as a tri-state `Action` only — an object/pattern form fails strict schema decode and the server exits.

**BUT — there IS a fully-supported per-URL allowlist at runtime, reachable two ways the type system hides:**

1. **RECOMMENDED — `OPENCODE_PERMISSION` env var (object form).** Set on the spawned `opencode serve` process. This value is `JSON.parse`'d raw and merged into config _after_ schema validation and is _never re-validated_, so the object form survives. `Permission.fromConfig` already expands it into per-URL rules and the runtime honors them via `Wildcard.match`. **Zero new components, ~1 env var.**

2. **`tool.execute.before` plugin hook (or `permission.ask` hook).** A tiny opencode plugin can inspect `args.url` and throw to block off-allowlist domains. Most explicit/auditable; needs a plugin file.

A domain-restricted MCP fetch server or an egress proxy also work but are heavier and less precise. Details and trade-offs below.

---

## Evidence

### 1. The webfetch tool DOES raise a per-URL permission request

`packages/opencode/src/tool/webfetch.ts:39-48`:

```ts
yield *
  ctx.ask({
    permission: 'webfetch',
    patterns: [params.url], // <-- the full URL is the pattern
    always: ['*'],
    metadata: { url: params.url, format: params.format, timeout: params.timeout },
  });
```

So — exactly like the shell tool's `external_directory` pattern — webfetch submits the **URL as the permission pattern**. The matching engine is per-URL capable. The tool itself reads **no** allowlist/denylist/experimental/env config of its own (the entire file was reviewed: only `MAX_RESPONSE_SIZE`, timeouts, and Accept headers — no host gating).

### 2. The runtime permission engine fully supports per-URL matching

`packages/core/src/permission.ts:32-42`:

```ts
export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {
  return (
    rulesets
      .flat()
      .findLast(
        (rule) =>
          Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern)
      ) ?? { action: 'ask', permission, pattern: '*' }
  );
}
```

`ask()` evaluates **each URL pattern** and returns `deny`/`allow`/`ask` per URL — `packages/opencode/src/permission/index.ts:180-190`:

```ts
for (const pattern of request.patterns) {
  const rule = evaluate(request.permission, pattern, ruleset, approved)
  if (rule.action === "deny") return yield* new DeniedError({ ... })
  if (rule.action === "allow") continue
  needsAsk = true
}
```

`Wildcard.match` (`packages/core/src/util/wildcard.ts`) converts `*` → `.*` and anchors `^...$` in dotall mode, so **`https://github.com/*` matches any `https://github.com/...` URL**. Per-domain globs work.

### 3. `fromConfig` already builds per-URL rules from an OBJECT — for ANY key

`packages/opencode/src/permission/index.ts:292-304`:

```ts
export function fromConfig(permission: ConfigPermission.Info) {
  const ruleset: Rule[] = [];
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === 'string') {
      ruleset.push({ permission: key, action: value, pattern: '*' });
      continue;
    }
    ruleset.push(
      ...Object.entries(value).map(([pattern, action]) => ({
        permission: key,
        pattern: expand(pattern),
        action,
      }))
    ); // <-- per-pattern rule, any key incl. webfetch
  }
  return ruleset;
}
```

`expand()` only rewrites `~`/`$HOME` path prefixes (harmless for URLs). **So if `permission.webfetch` is an object, the engine produces per-URL rules.** Nothing in the runtime special-cases webfetch to a single action.

### 4. WHY the documented Config object can't carry the object form — the type gate

`packages/opencode/src/config/permission.ts:16-37` — `webfetch` is typed `Action`, NOT `Rule`:

```ts
const InputObject = Schema.StructWithRest(
  Schema.Struct({
    bash: Schema.optional(Rule),                 // Rule = Action | Object  (per-pattern OK)
    external_directory: Schema.optional(Rule),   // Rule (per-pattern OK)
    ...
    webfetch: Schema.optional(Action),           // <-- Action ONLY (tri-state, NO object)
    websearch: Schema.optional(Action),
    ...
  }),
  [Schema.Record(Schema.String, Rule)],          // rest record, but explicit field wins
)
```

Config files and `OPENCODE_CONFIG_CONTENT` are decoded **strictly**: `packages/opencode/src/config/parse.ts:55` uses `decodeUnknownExit(schema)(data, { errors: "all" })` and **throws `InvalidError` on mismatch** (lines 56-71). An object given for `webfetch` fails decode against `Action` → config load dies → `opencode serve` exits. The explicit struct field takes precedence over the `Rule` rest record, so the rest record does **not** rescue it.

### 5. The SDK passes config through that strict decoder — so the object form is rejected via the SDK route

Installed SDK `node_modules/@opencode-ai/sdk/dist/server.js:12-16`:

```js
const proc = launch(`opencode`, args, {
  env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}) },
});
```

`OPENCODE_CONFIG_CONTENT` → `loadConfig` → `ConfigParse.schema(Info, …)` (`config.ts:670-677`, `:428`) → strict decode. **Therefore putting a webfetch object in the Action's `opencode_config.permission.webfetch` will crash the server.** Do NOT do this.

### 6. THE BYPASS — `OPENCODE_PERMISSION` env var skips re-validation

`packages/opencode/src/config/config.ts:748-754`:

```ts
if (Flag.OPENCODE_PERMISSION) {
  try {
    result.permission = mergeDeep(result.permission ?? {}, JSON.parse(Flag.OPENCODE_PERMISSION));
  } catch (err) {
    log.warn('OPENCODE_PERMISSION contains invalid JSON, skipping', { err });
  }
}
```

- Parsed with raw `JSON.parse` (no schema).
- Runs **after** all file/`OPENCODE_CONFIG_CONTENT` decoding, mutating the already-decoded `result: Info`.
- `result` is then `return`ed directly (`config.ts:789 return { config: result, … }`) with **no re-decode**, and consumed by `Permission.fromConfig(cfg.permission)` (`agent.ts:128`).

So the webfetch **object** form passes through untouched and becomes per-URL rules. `Flag.OPENCODE_PERMISSION` = `process.env["OPENCODE_PERMISSION"]` (`packages/core/src/flag/flag.ts:66-67`). The SDK spreads `...process.env` into the spawned process (evidence #5), so the Action only needs to set this env var.

**Concrete config the Action sets on the opencode serve environment:**

```bash
OPENCODE_PERMISSION='{"webfetch":{"https://github.com/*":"allow","https://www.google.com/*":"allow","*":"deny"}}'
```

Rule precedence is `findLast` (evidence #2), so order matters: list the allowed-domain globs first, then a final `"*":"deny"` catch-all. Any URL not matching an allow glob hits `deny` → `DeniedError`, the fetch never executes.

> Note: `OPENCODE_PERMISSION` merges across **all** permission keys, not just webfetch — keep the JSON scoped to `webfetch` (and whatever else the Action already governs) to avoid clobbering other permissions. It `mergeDeep`s onto existing config, so it augments rather than replaces.

### 7. Alternative — plugin hooks (programmatic, most auditable)

`packages/plugin/src/index.ts` exposes (v1.15.13):

- `"tool.execute.before"(input: {tool, sessionID, callID}, output: {args})` — line 266-269. Fires **before** the tool runs: `packages/opencode/src/session/tools.ts:90-95` triggers it, then `item.execute(args, ctx)`. For webfetch, `output.args.url` is the target URL; **throw to abort**.
- `"permission.ask"(input: Permission, output: {status})` — line 261. Receives the Permission (incl. `patterns` = URLs); set `output.status = "deny"`.

A ~20-line plugin: in `tool.execute.before`, if `input.tool === "webfetch"`, parse `new URL(output.args.url).hostname`, and `throw` unless the host is in an allowlist. Precise, code-reviewable, no reliance on undocumented env behavior. Cost: ship a plugin file + reference it in config (`config.plugin`).

### 8. Experimental policies / MCP — checked, not the right lever here

- `config.experimental` in this version only carries the `experimental_telemetry` flag and an `experimental.policies` array (`config.ts:289-294`; `packages/core/src/config/experimental.ts`). **No webfetch host gating.** Not applicable.
- MCP route: deny webfetch entirely and expose a custom MCP "fetch" tool that internally enforces the allowlist. Works, but it's a whole server to build/run and changes the tool surface the model sees.

---

## Recommendation & trade-offs

| Option                                                        | Native?                   | Effort                         | Robustness                                                                         | Notes                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. `OPENCODE_PERMISSION` env (object form)** ✅ recommended | Runtime YES (type-hidden) | **Lowest** — 1 env var         | High — uses the real permission engine; per-URL `deny` short-circuits before fetch | Relies on env-merge-skips-revalidation behavior (verified at `config.ts:748`). Pin opencode version; add a smoke test asserting an off-list URL is denied. |
| **B. `tool.execute.before` plugin**                           | N/A (interposition)       | Low–medium — small plugin file | High — explicit host check, fully auditable, independent of type quirks            | Best if you want the rule in reviewable code, or logic beyond glob (e.g. path/scheme checks).                                                              |
| C. Domain-restricted MCP fetch server                         | N/A                       | High                           | High                                                                               | Replaces webfetch with a custom tool; more moving parts; changes model's tool list.                                                                        |
| D. Egress proxy (`HTTPS_PROXY` + allowlist) / harden-runner   | N/A (network layer)       | Medium (infra)                 | Defense-in-depth                                                                   | Doesn't stop the call being attempted; complements A/B; right layer for CI egress, not in-process policy.                                                  |

**Primary: Option A** for the cleanest, lowest-surface in-process allowlist. **Pair with Option D** (consumer egress filtering / harden-runner) as defense-in-depth, since A is an application-layer control on a pinned version. Use **Option B** instead of A if the team prefers the rule expressed in reviewable plugin code or needs richer logic than URL globs.

### Caveats for whoever implements

- This depends on the `OPENCODE_PERMISSION` post-decode merge (config.ts:748) NOT being re-validated. Verified for 1.15.13; **re-verify on opencode upgrades** and gate with a smoke test (allowed URL → fetched; disallowed URL → `DeniedError`).
- Do NOT put the object form in `opencode_config.permission.webfetch` (the SDK `OPENCODE_CONFIG_CONTENT` path) — strict decode will crash the server (evidence #4, #5).
- Order rules allow-first, `"*":"deny"` last (`findLast` precedence).
