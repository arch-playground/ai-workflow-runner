import {
  buildAgentPermission,
  buildWebfetchPermissionEnv,
  parseBashAllowPatterns,
  shouldAutoApprove,
  CREDENTIAL_READ_DENY_PATTERNS,
} from './permissions';

describe('permissions', () => {
  describe('parseBashAllowPatterns()', () => {
    it('returns empty object for empty string', () => {
      // Arrange / Act
      const result = parseBashAllowPatterns('');

      // Assert
      expect(result).toEqual({});
    });

    it('returns empty object for whitespace-only string', () => {
      // Act
      const result = parseBashAllowPatterns('   ');

      // Assert
      expect(result).toEqual({});
    });

    it('parses comma-separated patterns', () => {
      // Act
      const result = parseBashAllowPatterns('npm test*,npx*');

      // Assert
      expect(result).toEqual({ 'npm test*': 'allow', 'npx*': 'allow' });
    });

    it('parses newline-separated patterns', () => {
      // Act
      const result = parseBashAllowPatterns('npm test*\nnpx*');

      // Assert
      expect(result).toEqual({ 'npm test*': 'allow', 'npx*': 'allow' });
    });

    it('trims whitespace around patterns', () => {
      // Act
      const result = parseBashAllowPatterns(' npm test* , npx* ');

      // Assert
      expect(result).toEqual({ 'npm test*': 'allow', 'npx*': 'allow' });
    });

    it('filters out empty entries', () => {
      // Act
      const result = parseBashAllowPatterns('npm*,,npx*');

      // Assert
      expect(result).toEqual({ 'npm*': 'allow', 'npx*': 'allow' });
    });
  });

  describe('buildAgentPermission()', () => {
    describe('read-family defaults', () => {
      it('allows edit, glob, grep, list, lsp by default', () => {
        // Act
        const result = buildAgentPermission(undefined, {});

        // Assert — knowledge extraction tools must be allowed
        // Note: 'read' is an object (with credential-path denies) not a plain 'allow' string;
        // the SDK will allow reads of normal paths but deny .git/config etc.
        expect(result['edit']).toBe('allow');
        expect(result['glob']).toBe('allow');
        expect(result['grep']).toBe('allow');
        expect(result['list']).toBe('allow');
        expect(result['lsp']).toBe('allow');
      });

      it('has read as object with credential-path denies (not plain allow)', () => {
        // Act
        const result = buildAgentPermission(undefined, {});

        // Assert — read must be an object so credential paths can be denied at read layer
        expect(typeof result['read']).toBe('object');
      });

      it('denies question, plan_enter, plan_exit by default', () => {
        // Act
        const result = buildAgentPermission(undefined, {});

        // Assert
        expect(result['question']).toBe('deny');
        expect(result['plan_enter']).toBe('deny');
        expect(result['plan_exit']).toBe('deny');
      });
    });

    describe('AC4: websearch allow, webfetch deny', () => {
      it('allows websearch', () => {
        // Act
        const result = buildAgentPermission(undefined, {});

        // Assert
        expect(result['websearch']).toBe('allow');
      });

      it('denies webfetch', () => {
        // Act
        const result = buildAgentPermission(undefined, {});

        // Assert
        expect(result['webfetch']).toBe('deny');
      });
    });

    describe('AC5: external_directory deny', () => {
      it('denies external_directory', () => {
        // Act
        const result = buildAgentPermission(undefined, {});

        // Assert
        expect(result['external_directory']).toBe('deny');
      });
    });

    describe('AC1: bash read-only allowlist', () => {
      it('allows grep, ls, find, cat, head, tail, wc, tree, file, rg in bash config', () => {
        // Act
        const bash = (buildAgentPermission(undefined, {})['bash'] as Record<string, string>) ?? {};

        // Assert — read-only extraction commands must be allowed
        expect(bash['grep*']).toBe('allow');
        expect(bash['ls*']).toBe('allow');
        expect(bash['find*']).toBe('allow');
        expect(bash['cat*']).toBe('allow');
        expect(bash['head*']).toBe('allow');
        expect(bash['tail*']).toBe('allow');
        expect(bash['wc*']).toBe('allow');
        expect(bash['tree*']).toBe('allow');
        expect(bash['file*']).toBe('allow');
        expect(bash['rg*']).toBe('allow');
      });

      it('has catch-all deny as last entry in bash config', () => {
        // Act
        const bash = (buildAgentPermission(undefined, {})['bash'] as Record<string, string>) ?? {};
        const entries = Object.entries(bash);
        const last = entries[entries.length - 1];

        // Assert — catch-all deny must be at the end (wins under last-match-wins)
        expect(last).toEqual(['*', 'deny']);
      });

      it('includes consumer bash_allow_patterns before git and deny rules', () => {
        // Arrange
        const extraPatterns = parseBashAllowPatterns('npm test*,npx*');

        // Act
        const bash =
          (buildAgentPermission(undefined, extraPatterns)['bash'] as Record<string, string>) ?? {};

        // Assert — consumer patterns present
        expect(bash['npm test*']).toBe('allow');
        expect(bash['npx*']).toBe('allow');
      });
    });

    describe('AC2: git read-only subcommand allowlist', () => {
      it('allows git history/read subcommands', () => {
        // Act
        const bash = (buildAgentPermission(undefined, {})['bash'] as Record<string, string>) ?? {};

        // Assert
        expect(bash['git log*']).toBe('allow');
        expect(bash['git show*']).toBe('allow');
        expect(bash['git diff*']).toBe('allow');
        expect(bash['git blame*']).toBe('allow');
        expect(bash['git shortlog*']).toBe('allow');
        expect(bash['git rev-list*']).toBe('allow');
        expect(bash['git status*']).toBe('allow');
        expect(bash['git tag*']).toBe('allow');
        expect(bash['git branch*']).toBe('allow');
        expect(bash['git ls-files*']).toBe('allow');
        expect(bash['git ls-tree*']).toBe('allow');
        expect(bash['git cat-file*']).toBe('allow');
        expect(bash['git reflog*']).toBe('allow');
      });

      it('denies git mutating subcommands', () => {
        // Act
        const bash = (buildAgentPermission(undefined, {})['bash'] as Record<string, string>) ?? {};

        // Assert
        expect(bash['git commit*']).toBe('deny');
        expect(bash['git push*']).toBe('deny');
        expect(bash['git pull*']).toBe('deny');
        expect(bash['git fetch*']).toBe('deny');
        expect(bash['git clone*']).toBe('deny');
        expect(bash['git merge*']).toBe('deny');
        expect(bash['git rebase*']).toBe('deny');
        expect(bash['git reset*']).toBe('deny');
        expect(bash['git checkout*']).toBe('deny');
        expect(bash['git remote*']).toBe('deny');
      });

      it('denies git config and git credential (credential-exposing)', () => {
        // Act
        const bash = (buildAgentPermission(undefined, {})['bash'] as Record<string, string>) ?? {};

        // Assert — AGENT-03: git config --get http.<url>.extraheader must be denied
        expect(bash['git config*']).toBe('deny');
        expect(bash['git credential*']).toBe('deny');
      });
    });

    describe('AC3: .git/config credential read closed at both layers', () => {
      it('has bash deny rules for .git/config, .git/credentials, .git-credentials', () => {
        // Act
        const bash = (buildAgentPermission(undefined, {})['bash'] as Record<string, string>) ?? {};

        // Assert — these must appear AFTER the cat*/head* allows so they win
        expect(bash['*.git/config*']).toBe('deny');
        expect(bash['*.git/credentials*']).toBe('deny');
        expect(bash['*.git-credentials*']).toBe('deny');
      });

      it('credential bash denies appear after cat* allow (last-match-wins order)', () => {
        // Act
        const bash = buildAgentPermission(undefined, {})['bash'] as Record<string, string>;
        const keys = Object.keys(bash);
        const catIdx = keys.indexOf('cat*');
        const gitConfigIdx = keys.indexOf('*.git/config*');

        // Assert — .git/config deny comes after cat* allow so it wins
        expect(catIdx).toBeGreaterThanOrEqual(0);
        expect(gitConfigIdx).toBeGreaterThan(catIdx);
      });

      it('has read-tool deny for .git/config paths', () => {
        // Act
        const read = buildAgentPermission(undefined, {})['read'] as Record<string, string>;

        // Assert — read tool cannot open credential files either
        expect(read['*.git/config*']).toBe('deny');
        expect(read['*.git/credentials*']).toBe('deny');
        expect(read['*.git-credentials*']).toBe('deny');
      });

      it('CREDENTIAL_READ_DENY_PATTERNS exports the canonical path list', () => {
        // Assert — exported list is stable for any future consumer
        expect(CREDENTIAL_READ_DENY_PATTERNS).toContain('.git/config');
        expect(CREDENTIAL_READ_DENY_PATTERNS).toContain('.git/credentials');
        expect(CREDENTIAL_READ_DENY_PATTERNS).toContain('.git-credentials');
      });
    });

    describe('AC6: permission merge — Action rules win over consumer config', () => {
      it('consumer bash:"allow" does NOT override Action bash allowlist', () => {
        // Arrange — consumer tries to open up bash fully
        const consumerPermission = { bash: 'allow' };

        // Act
        const result = buildAgentPermission(consumerPermission as never, {});

        // Assert — the result must still have the bash object (not "allow")
        expect(typeof result['bash']).toBe('object');
        expect((result['bash'] as Record<string, string>)['*']).toBe('deny');
      });

      it('consumer external_directory:"allow" does NOT override Action deny', () => {
        // Arrange — consumer tries to open up FS confinement
        const consumerPermission = { external_directory: 'allow' };

        // Act
        const result = buildAgentPermission(consumerPermission as never, {});

        // Assert — Action security rule wins
        expect(result['external_directory']).toBe('deny');
      });

      it('consumer webfetch:"allow" does NOT override Action deny', () => {
        // Arrange
        const consumerPermission = { webfetch: 'allow' };

        // Act
        const result = buildAgentPermission(consumerPermission as never, {});

        // Assert
        expect(result['webfetch']).toBe('deny');
      });

      it('consumer websearch:"deny" is overridden by Action allow', () => {
        // Arrange
        const consumerPermission = { websearch: 'deny' };

        // Act
        const result = buildAgentPermission(consumerPermission as never, {});

        // Assert — Action security rule wins
        expect(result['websearch']).toBe('allow');
      });
    });
  });

  describe('shouldAutoApprove()', () => {
    it('returns true for read-family tools', () => {
      // Assert
      expect(shouldAutoApprove('read')).toBe(true);
      expect(shouldAutoApprove('edit')).toBe(true);
      expect(shouldAutoApprove('glob')).toBe(true);
      expect(shouldAutoApprove('grep')).toBe(true);
      expect(shouldAutoApprove('list')).toBe(true);
      expect(shouldAutoApprove('lsp')).toBe(true);
      expect(shouldAutoApprove('task')).toBe(true);
      expect(shouldAutoApprove('skill')).toBe(true);
      expect(shouldAutoApprove('repo_overview')).toBe(true);
    });

    it('returns false for bash (unsafe — allows arbitrary commands)', () => {
      // Assert
      expect(shouldAutoApprove('bash')).toBe(false);
    });

    it('returns false for webfetch (unsafe — exfiltration vector)', () => {
      // Assert
      expect(shouldAutoApprove('webfetch')).toBe(false);
    });

    it('returns false for external_directory (confinement bypass)', () => {
      // Assert
      expect(shouldAutoApprove('external_directory')).toBe(false);
    });

    it('returns false for unknown permission names', () => {
      // Assert
      expect(shouldAutoApprove('')).toBe(false);
      expect(shouldAutoApprove('unknown_tool')).toBe(false);
    });
  });

  describe('buildWebfetchPermissionEnv()', () => {
    it('returns undefined for empty domains array', () => {
      // Arrange / Act
      const result = buildWebfetchPermissionEnv([]);

      // Assert
      expect(result).toBeUndefined();
    });

    it('returns undefined when all domains are whitespace-only', () => {
      // Act
      const result = buildWebfetchPermissionEnv(['  ', '']);

      // Assert
      expect(result).toBeUndefined();
    });

    it('single domain: produces allow glob + catch-all deny in correct order', () => {
      // Act
      const result = buildWebfetchPermissionEnv(['github.com']);

      // Assert
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!) as Record<string, Record<string, string>>;
      expect(parsed).toHaveProperty('webfetch');
      const rules = parsed['webfetch']!;
      const keys = Object.keys(rules);
      // Allow glob must appear before the catch-all deny (findLast precedence)
      expect(keys.indexOf('https://github.com/*')).toBeLessThan(keys.indexOf('*'));
      expect(rules['https://github.com/*']).toBe('allow');
      expect(rules['*']).toBe('deny');
    });

    it('multiple domains: each gets an allow glob, catch-all deny is last', () => {
      // Act
      const result = buildWebfetchPermissionEnv(['github.com', 'docs.example.com']);

      // Assert
      const parsed = JSON.parse(result!) as Record<string, Record<string, string>>;
      const rules = parsed['webfetch']!;
      const keys = Object.keys(rules);
      expect(rules['https://github.com/*']).toBe('allow');
      expect(rules['https://docs.example.com/*']).toBe('allow');
      // Catch-all deny must be the last key
      expect(keys[keys.length - 1]).toBe('*');
      expect(rules['*']).toBe('deny');
    });

    it('JSON is valid and scoped to webfetch only (no bash/external_directory keys)', () => {
      // Act
      const result = buildWebfetchPermissionEnv(['github.com']);

      // Assert
      const parsed = JSON.parse(result!) as Record<string, unknown>;
      // Must only contain the webfetch key — no other permission keys
      expect(Object.keys(parsed)).toEqual(['webfetch']);
    });

    it('filters out empty/whitespace domain entries', () => {
      // Act
      const result = buildWebfetchPermissionEnv(['', 'github.com', '  ']);

      // Assert
      const parsed = JSON.parse(result!) as Record<string, Record<string, string>>;
      const rules = parsed['webfetch']!;
      expect(rules['https://github.com/*']).toBe('allow');
      // Whitespace entries must not produce rules
      expect(
        Object.keys(rules).filter((k) => k !== 'https://github.com/*' && k !== '*')
      ).toHaveLength(0);
    });
  });
});
