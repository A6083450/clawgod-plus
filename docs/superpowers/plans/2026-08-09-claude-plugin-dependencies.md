# Bun-managed Claude Plugin Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ClawGod Plus install and maintain claude-hud, claude-mem, and Superpowers with Bun only, while preserving equal or newer plugin versions, keeping Claude Code updates unpinned, and restoring only ClawGod-owned integration state on uninstall.

**Architecture:** Keep `install.sh` and `install.ps1` self-contained and embed the same generated `plugin-dependencies.mjs` in both installers. The Bun module classifies installed versions, downloads only missing or older pinned baselines through the existing managed fetcher, safely stages canonical local marketplaces, configures a Bun-only HUD status line, and applies ownership-checked claude-mem launcher rewrites. Core install remains authoritative; plugin work is independently transactional and reports warnings without turning a successful ClawGod install into failure.

**Tech Stack:** Bash, PowerShell 5.1+, Bun 1.3.14+, JavaScript ESM, `Bun.Archive`, `Bun.CryptoHasher`, Claude Code plugin CLI, JSON ownership state, GitHub Actions.

## Global Constraints

- Bun 1.3.14 or newer is the only user-installed JavaScript runtime; do not require or execute Node.js, npm, npx, system Git, curl, wget, system ripgrep, tar, or unzip.
- The baseline versions are claude-hud 0.7.0, claude-mem 13.14.0, and Superpowers 6.2.0.
- Baseline means minimum: equal or newer installed versions are not reinstalled, overwritten, or downgraded; only the approved HUD configuration and claude-mem hook/MCP entry files may change under ownership control.
- `claude update` still resolves the newest Claude Code; `--version` pins Claude Code only when explicitly supplied; `--no-upgrade` skips only the Claude Code download.
- Download public tag archives only through `https://hub.211107.xyz/`; never send credentials to the proxy and never fall back to dynamic `latest` or an unverified source.
- Preserve canonical IDs: `claude-hud@claude-hud`, `claude-mem@thedotmack`, and `superpowers@superpowers-marketplace`.
- Do not enable, disable, remove, or rewrite `superpowers@claude-plugins-official`.
- HUD output must match the approved current compact Chinese profile; its `statusLine` must directly execute the resolved Bun path and may not use Node, `bash -c`, `ls`, `head`, or shell glob discovery.
- claude-mem data, database, port, gateway, cloud sync, telemetry, and user settings remain untouched except for the existing provider compatibility keys and the two approved launcher files.
- Plugin failures are warnings after core success; uninstall restoration failures remain fail-closed so no `statusLine` can reference deleted ClawGod files.
- Keep Unix and Windows generated module bodies paired and test normalized equality.
- All behavioral tests use an explicit temporary HOME, temporary Claude config, and fixture-only PATH. Do not run an installer or bare `claude` against the real HOME.
- Do not push, tag, publish, or create a GitHub Release as part of implementation.

## File Structure

**Create:**

- `tests/installer-plugin-dependencies.mjs` - extracts both generated modules and exercises version policy, archive safety, marketplace transactions, HUD ownership, claude-mem rewrites, summaries, and uninstall.
- `tests/fixtures/claude-hud-current-style.json` - fixed HUD stdin/transcript and exact ANSI stdout for the approved 0.7.0 profile.

**Modify:**

- `install.sh` - embed, generate, invoke, and uninstall `plugin-dependencies.mjs`; keep plugin failures optional and plugin restoration fail-closed.
- `install.ps1` - mirror Unix generation, invocation, summary, and uninstall behavior.
- `tests/installer-bun-runtime.mjs` - include the new generated files in pairing, Bun-only, lifecycle-order, and cleanup checks.
- `tests/patcher-install-no-upgrade-control-flow.mjs` - prove plugin health checks do not alter Claude Code version selection.
- `tests/installer-e2e.mjs` - network acceptance for all three canonical plugins, HUD Bun status line, claude-mem Bun entrypoints, retention, and real-HOME isolation.
- `tests/installer-e2e-contract.mjs` - offline contracts for plugin summary, settings restoration, and retained plugin paths.
- `tests/bun-only-policy.mjs` - forbid executable Node/npm/npx/Git/curl/wget/system-rg paths in the new integration and require current documentation.
- `.github/workflows/compat-daily.yml` - assert plugin readiness and Bun-only HUD/claude-mem behavior on Linux and Windows.
- `README.md`, `README_EN.md`, `README_JP.md` - document automatic optional dependencies, baseline preservation, exact HUD profile, proxy, warnings, update, and uninstall semantics.
- `AGENTS.md` - document the generated module, focused test, and new installer lifecycle.

---

### Task 1: Add the Paired Module and Version-Preservation Policy

**Files:**
- Create: `tests/installer-plugin-dependencies.mjs`
- Modify: `install.sh:420-856`
- Modify: `install.ps1:235-986`
- Modify: `tests/installer-bun-runtime.mjs:850-910`

**Interfaces:**
- Produces: identical generated `~/.clawgod/plugin-dependencies.mjs` bodies in both installers.
- Produces: `PLUGIN_BASELINES: Record<'hud' | 'memory' | 'superpowers', PluginSpec>`.
- Produces: `parseSemver(value: string): ParsedSemver | null`.
- Produces: `compareSemver(left: string, right: string): number | null`.
- Produces: `selectInstalledRecord(installed: object, id: string): InstalledRecord | null`.
- Produces: `classifyPlugin(installed: object, spec: PluginSpec): 'missing' | 'older' | 'satisfied' | 'invalid'`.
- Produces: `PluginContext = { home: string, claudeConfigDir: string, clawgodDir: string, bunPath: string, claudeCliPath: string, fetchFilePath: string, env: Record<string, string | undefined>, spawnSyncImpl: typeof Bun.spawnSync }`.
- Consumes: Claude `installed_plugins.json`, whose target entries are arrays of user/project/local records.

- [ ] **Step 1: Write the failing paired-module and baseline test**

Create `tests/installer-plugin-dependencies.mjs` with the same marker extraction style as `tests/installer-ripgrep.mjs`:

```js
#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const unixModule = unixTemplate('plugin-dependencies.mjs', 'PLUGIN_DEPENDENCIES_EOF');
const windowsModule = powerShellTemplate('plugin-dependencies.mjs', '# --- Optional Claude plugin dependencies');
assert.equal(normalize(windowsModule), normalize(unixModule));

const expected = {
  hud: ['claude-hud@claude-hud', '0.7.0', 754443, '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912'],
  memory: ['claude-mem@thedotmack', '13.14.0', 11817347, 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0'],
  superpowers: ['superpowers@superpowers-marketplace', '6.2.0', 516401, '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3'],
};
```

Import the extracted module from a `mkdtempSync(join(tmpdir(), 'clawgod-plugin-deps-'))` directory and assert:

```js
assert.equal(classifyPlugin({}, PLUGIN_BASELINES.hud), 'missing');
assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.6.0'), PLUGIN_BASELINES.hud), 'older');
assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.7.0'), PLUGIN_BASELINES.hud), 'satisfied');
assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.8.0'), PLUGIN_BASELINES.hud), 'satisfied');
assert.equal(classifyPlugin(records('claude-hud@claude-hud', '0.7.0-beta.1'), PLUGIN_BASELINES.hud), 'older');
assert.equal(classifyPlugin(records('claude-hud@claude-hud', 'latest'), PLUGIN_BASELINES.hud), 'invalid');
```

Add a duplicate Superpowers fixture and assert only `superpowers@superpowers-marketplace` is inspected; `superpowers@claude-plugins-official` must remain byte-identical.

- [ ] **Step 2: Run the new test and confirm the module is absent**

Run: `bun tests/installer-plugin-dependencies.mjs`

Expected: FAIL with `install.sh must generate plugin-dependencies.mjs`.

- [ ] **Step 3: Embed the exact baseline constants in both installers**

Add the following shape to both generated module bodies:

```js
export const PLUGIN_BASELINES = Object.freeze({
  hud: Object.freeze({
    key: 'hud', id: 'claude-hud@claude-hud', marketplace: 'claude-hud', plugin: 'claude-hud',
    version: '0.7.0', bytes: 754443,
    sha256: '59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912',
    url: 'https://hub.211107.xyz/https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
  }),
  memory: Object.freeze({
    key: 'memory', id: 'claude-mem@thedotmack', marketplace: 'thedotmack', plugin: 'claude-mem',
    version: '13.14.0', bytes: 11817347,
    sha256: 'a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0',
    url: 'https://hub.211107.xyz/https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
  }),
  superpowers: Object.freeze({
    key: 'superpowers', id: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', plugin: 'superpowers',
    archiveMarketplace: 'superpowers-dev',
    version: '6.2.0', bytes: 516401,
    sha256: '468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3',
    url: 'https://hub.211107.xyz/https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
  }),
});
```

- [ ] **Step 4: Implement strict semantic-version classification**

Use a strict `major.minor.patch[-prerelease]` parser. Numeric identifiers compare numerically; numeric prerelease identifiers sort before strings; a stable version sorts after the same core prerelease. Reject leading zeroes and build-only/malformed inputs instead of coercing them.

```js
export function classifyPlugin(installed, spec) {
  const records = Array.isArray(installed?.plugins?.[spec.id]) ? installed.plugins[spec.id] : [];
  const userRecords = records.filter(record => record?.scope === 'user');
  if (userRecords.length === 0) return 'missing';
  const selected = selectInstalledRecord(installed, spec.id);
  if (!selected || !parseSemver(selected.version)) return 'invalid';
  const comparison = compareSemver(selected.version, spec.version);
  if (comparison === null) return 'invalid';
  return comparison < 0 ? 'older' : 'satisfied';
}
```

When several valid user records exist, `selectInstalledRecord` returns the highest version; project/local records do not satisfy the user dependency.

- [ ] **Step 5: Generate the module without invoking it yet**

Unix writes the module with mode `0700`; PowerShell writes UTF-8 and keeps the same JavaScript body. Add it to the paired-template map in `tests/installer-bun-runtime.mjs` and assert the shebang is `#!/usr/bin/env bun`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-bun-runtime.mjs
git diff --check
```

Expected: all pass; neither installer invokes the new module yet.

- [ ] **Step 7: Commit the version policy**

```bash
git add install.sh install.ps1 tests/installer-plugin-dependencies.mjs tests/installer-bun-runtime.mjs
git commit -m "feat: define Bun-managed Claude plugin baselines"
```

---

### Task 2: Add Verified Download Cache and Safe Tar Extraction

**Files:**
- Modify: `install.sh` embedded `plugin-dependencies.mjs`
- Modify: `install.ps1` embedded `plugin-dependencies.mjs`
- Modify: `tests/installer-plugin-dependencies.mjs`

**Interfaces:**
- Produces: `sha256(bytes: Uint8Array): string`.
- Produces: `validateArchive(bytes: Uint8Array, spec: PluginSpec): void`.
- Produces: `extractPluginArchive(bytes: Uint8Array, spec: PluginSpec, destination: string): Promise<string>` returning the single extracted repository root.
- Produces: `downloadAndStage(spec: PluginSpec, context: PluginContext): Promise<{ sourceRoot: string, archivePath: string, cached: boolean }>`.
- Consumes: `~/.clawgod/fetch-file.mjs <url> <destination>` for all network behavior.

- [ ] **Step 1: Add deterministic archive and cache failures**

Extend the focused test with `Bun.Archive` normal fixtures whose root contains `.claude-plugin/marketplace.json`, the expected plugin source, and an unrelated README. Add raw tar-header fixtures for:

```js
const invalidEntries = [
  ['traversal', '../escape', '0'],
  ['absolute', '/tmp/escape', '0'],
  ['windows absolute', 'C:/escape', '0'],
  ['symbolic link', 'repo/link', '2'],
  ['hard link', 'repo/hard', '1'],
  ['device', 'repo/device', '3'],
];
```

Assert rejection of a second repository root, duplicate normalized path, more than 50,000 entries, one file over 64 MiB, total expanded data over 512 MiB, malformed PAX/long-name metadata, manifest name/version mismatch, incorrect archive byte length, and incorrect SHA-256.

Create a fake `fetch-file.mjs` that copies an archive fixture and records `process.env`. Assert a valid cached archive performs no spawn, a corrupt cache is atomically replaced, and a downloader failure leaves the old valid cache untouched.

- [ ] **Step 2: Run the archive tests and confirm exports are missing**

Run: `bun tests/installer-plugin-dependencies.mjs`

Expected: FAIL because `extractPluginArchive` and `downloadAndStage` are undefined.

- [ ] **Step 3: Implement fixed hash and size checks**

Use `Bun.CryptoHasher('sha256')` and exact archive byte counts. Define explicit safety bounds:

```js
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 50_000;

export function validateArchive(bytes, spec) {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${spec.key}: archive bytes are invalid`);
  if (bytes.byteLength !== spec.bytes) throw new Error(`${spec.key}: archive size mismatch`);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`${spec.key}: archive exceeds safety limit`);
  if (sha256(bytes) !== spec.sha256) throw new Error(`${spec.key}: archive SHA-256 mismatch`);
}
```

Tests may clone a spec with fixture-specific size/hash; production constants must remain exact.

- [ ] **Step 4: Implement a link-aware tar validator and extractor**

Gunzip with Bun, parse 512-byte tar headers, and support ordinary files (`0` or NUL), directories (`5`), POSIX PAX metadata (`x`, `g`), and GNU long-name metadata (`L`) only. Reject link and device type flags before writing. Normalize `/` separators, reject empty/absolute/drive/`..` paths, and require exactly one top-level repository directory.

Write regular files with `open(..., 'wx')` semantics into a private staging directory. Before every directory/file creation, walk existing ancestors with `lstatSync` and reject links or non-directory parents. Validate the extracted marketplace and the plugin manifest at its declared relative source:

```js
const manifest = readJson(join(sourceRoot, '.claude-plugin', 'marketplace.json'));
const expectedArchiveMarketplace = spec.archiveMarketplace || spec.marketplace;
if (manifest.name !== expectedArchiveMarketplace) throw new Error(`${spec.key}: marketplace name mismatch`);
const entry = manifest.plugins?.find(plugin => plugin.name === spec.plugin);
if (!entry) throw new Error(`${spec.key}: plugin entry is missing`);
const pluginRoot = containedRelativeSource(sourceRoot, entry.source);
const pluginManifest = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'));
if (pluginManifest.name !== spec.plugin || pluginManifest.version !== spec.version) {
  throw new Error(`${spec.key}: plugin manifest mismatch`);
}
```

For claude-mem accept only the declared relative `plugin/` source. HUD may omit the marketplace-entry version, so its `.claude-plugin/plugin.json` remains authoritative. The Superpowers archive must declare `superpowers-dev`, source `./`, and plugin version 6.2.0; it is validated as plugin source but is never registered under the development marketplace name.

- [ ] **Step 5: Reuse the existing managed fetcher**

`downloadAndStage` reads `~/.clawgod/cache/claude-plugins/<key>-<version>.tar.gz`. Reuse only after full size/hash validation. Otherwise run:

```js
const result = Bun.spawnSync({
  cmd: [context.bunPath, context.fetchFilePath, spec.url, temporaryArchive],
  env: context.env,
  stdout: 'pipe',
  stderr: 'pipe',
});
```

Require exit code zero, validate the complete temporary archive, and rename it over the cache only after success. Map downloader errors to one credential-free line; do not print the child stack or proxy URL. The existing fetcher remains the sole implementation of proxy, `NO_PROXY`, redirects, timeout, and atomic HTTP writes.

- [ ] **Step 6: Run archive, fetcher, and pairing tests**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-bun-runtime.mjs
bun tests/installer-ripgrep.mjs
git diff --check
```

Expected: all pass; malformed tar fixtures never create an outside sentinel.

- [ ] **Step 7: Commit verified staging**

```bash
git add install.sh install.ps1 tests/installer-plugin-dependencies.mjs
git commit -m "feat: stage Claude plugins with verified Bun archives"
```

---

### Task 3: Install Canonical Marketplaces Transactionally

**Files:**
- Modify: `install.sh` embedded `plugin-dependencies.mjs`
- Modify: `install.ps1` embedded `plugin-dependencies.mjs`
- Modify: `tests/installer-plugin-dependencies.mjs`

**Interfaces:**
- Consumes: `PluginContext` defined in Task 1.
- Produces: `ensureMarketplacePlugin(spec: PluginSpec, context: PluginContext): Promise<PluginResult>`.
- Produces: `PluginResult = { key: string, id: string, version: string | null, status: 'installed' | 'upgraded' | 'preserved' | 'warning', ready: boolean, detail: string }`.
- Consumes: the extracted `cli.original.cjs` through `[bunPath, claudeCliPath, ...pluginArgs]`.

- [ ] **Step 1: Add a fake official plugin CLI and rollback matrix**

In the test fixture, write `fake-cli.original.cjs` that records `process.argv.slice(2)` and mutates only the temporary Claude config. Support:

```text
plugin marketplace remove <marketplace>
plugin marketplace add <persistent-source> --scope user
plugin install <canonical-id> --scope user
plugin update <canonical-id> --scope user
```

Drive it through `Bun.spawnSync([process.execPath, fakeCli, ...args])`. Cover:

- missing plugin installs the baseline and enables only the canonical ID;
- older plugin updates to the baseline;
- equal/newer plugin spawns nothing and preserves marketplace, cache, settings, and installation record bytes;
- invalid installed version warns and preserves all bytes;
- marketplace remove/add/install/update failure at each boundary restores the old known marketplace entry, install directory, enabled state, installed record, and cache directory;
- the persistent source remains after success and contains no temporary-path reference;
- `superpowers@claude-plugins-official` remains byte-identical and receives no command.

- [ ] **Step 2: Run the marketplace matrix and observe missing behavior**

Run: `bun tests/installer-plugin-dependencies.mjs`

Expected: FAIL because `ensureMarketplacePlugin` is undefined.

- [ ] **Step 3: Define stable local source and transaction paths**

Use:

```js
const pluginRoot = join(context.claudeConfigDir, 'plugins');
const persistentSource = join(pluginRoot, 'clawgod-marketplaces', spec.marketplace, spec.version);
const marketplaceInstall = join(pluginRoot, 'marketplaces', spec.marketplace);
const knownMarketplaces = join(pluginRoot, 'known_marketplaces.json');
const installedPlugins = join(pluginRoot, 'installed_plugins.json');
const settingsPath = join(context.claudeConfigDir, 'settings.json');
```

Copy the verified staged repository into `persistentSource.<pid>.staged`, verify every destination ancestor is a real directory, then atomically rename. Do not store sources below `~/.clawgod`, because plugins and their marketplace must survive ClawGod uninstall.

For HUD and claude-mem, register the validated upstream marketplace root. For Superpowers, materialize this exact wrapper layout without changing the verified source bytes:

```text
<persistentSource>/.claude-plugin/marketplace.json
<persistentSource>/plugin/<verified superpowers 6.2.0 repository contents>
```

The generated manifest name is `superpowers-marketplace` and its only plugin entry is `{ "name": "superpowers", "version": "6.2.0", "source": "./plugin" }`. Do not carry the archive's `superpowers-dev` name or any unrelated marketplace entries into the registered wrapper.

- [ ] **Step 4: Snapshot only the canonical transaction surface**

Before CLI mutation, snapshot exact bytes/presence/mode for the three JSON files and move an existing canonical marketplace install directory to a same-parent private backup. Record pre-existing cache paths for `spec.id`; after failure remove only paths created during the transaction, then restore moved directories and exact JSON bytes. Never recursively remove a path unless its resolved parent and basename exactly match the expected plugin transaction target.

On successful installation, delete transaction backups but keep `persistentSource`. If cleanup fails, report a warning without rolling back a verified installed plugin.

- [ ] **Step 5: Invoke the original extracted Claude CLI with argument arrays**

Use these exact commands, with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` added to the child environment:

```js
['plugin', 'marketplace', 'remove', spec.marketplace]
['plugin', 'marketplace', 'add', persistentSource, '--scope', 'user']
classification === 'missing'
  ? ['plugin', 'install', spec.id, '--scope', 'user']
  : ['plugin', 'update', spec.id, '--scope', 'user']
```

Call marketplace remove only when the preflight snapshot contains that canonical marketplace; require zero exit when called. All nonzero statuses trigger rollback. After install/update, re-read `installed_plugins.json`, require a user record exactly equal to `spec.version`, require its install path to remain inside the canonical cache root, and require `settings.enabledPlugins[spec.id] === true`.

- [ ] **Step 6: Return preserve and warning results without throwing across plugins**

`ensureMarketplacePlugin` returns `preserved` before download for satisfied versions. It catches transaction failures, completes rollback, and returns `warning`. Only an incomplete rollback throws an error marked `restorationIncomplete`; the top-level ensure path still reports it without weakening core installation, but retains all evidence.

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-registry-download.mjs
git diff --check
```

Expected: all pass; fake CLI logs contain no `git`, `node`, npm, npx, curl, or wget command.

- [ ] **Step 8: Commit marketplace transactions**

```bash
git add install.sh install.ps1 tests/installer-plugin-dependencies.mjs
git commit -m "feat: install Claude plugin marketplaces transactionally"
```

---

### Task 4: Reproduce the Current HUD Profile with a Bun Status Line

**Files:**
- Create: `tests/fixtures/claude-hud-current-style.json`
- Modify: `install.sh` embedded `plugin-dependencies.mjs`
- Modify: `install.ps1` embedded `plugin-dependencies.mjs`
- Modify: `tests/installer-plugin-dependencies.mjs`

**Interfaces:**
- Produces: `HUD_CONFIG_TEXT: string` with exact approved JSON bytes.
- Produces: `configureHud(context: PluginContext, state: ManagedState): Promise<PluginResult>`.
- Produces: `renderHudStatusLineModule(context: PluginContext): string`.
- Produces: `~/.clawgod/claude-hud-statusline.mjs`.
- Consumes: the highest valid user record for `claude-hud@claude-hud` from `installed_plugins.json`.

- [ ] **Step 1: Add exact config, ownership, and command failures**

Add assertions that `HUD_CONFIG_TEXT` exactly equals the JSON block in the approved design, including two-space indentation, one-line `elementOrder`, key order, final newline, `label: "#ff4fc2"`, and `custom: "#FF6600"`.

Cover these temporary-HOME cases:

- no HUD config/settings: create exact config and one `statusLine` field;
- existing user config/statusLine: save them as the restore point, then replace only approved fields;
- current values match ClawGod fingerprints: rerun idempotently without replacing the restore point;
- user changes either value: preserve that changed value as the new restore point before reapplying;
- invalid settings JSON, symlinked config/settings/ancestor, or unsafe permission: return warning and leave every byte unchanged;
- uninstall restores original bytes/value only when current values still match managed fingerprints;
- uninstall preserves later user edits and reports the conflict;
- settings originally absent but later gained unrelated keys: remove only managed `statusLine` and retain the file.

- [ ] **Step 2: Add the approved 0.7.0 ANSI golden fixture**

Create `tests/fixtures/claude-hud-current-style.json` with the upstream transcript events for Read, Edit, two skills, three MCP tools, one explore agent, and two todo items. Use this fixed stdin shape:

```json
{
  "model": {"display_name": "Opus"},
  "context_window": {
    "context_window_size": 200000,
    "current_usage": {
      "input_tokens": 45000,
      "cache_creation_input_tokens": 5000,
      "cache_read_input_tokens": 2000
    }
  },
  "workspace": {"added_dirs": []}
}
```

Store the exact expected stdout as a JSON string:

```text
\u001b[0m\u001b[36m[Opus]\u001b[0m \u001b[32m███\u001b[2m░░░░░░░\u001b[0m \u001b[32m52k/200k\u001b[0m | \u001b[33mmy-project\u001b[0m
\u001b[0m\u001b[33m◐\u001b[0m \u001b[36mmcp__linear__get_issue\u001b[0m | \u001b[33m◐\u001b[0m \u001b[36mmcp__slack__search_messages\u001b[0m | \u001b[32m✓\u001b[0m Read \u001b[38;2;255;79;194m×1\u001b[0m
\u001b[0m\u001b[32m✓\u001b[0m \u001b[35mexplore\u001b[0m \u001b[38;2;255;79;194m[haiku]\u001b[0m\u001b[38;2;255;79;194m: Finding auth code\u001b[0m \u001b[38;2;255;79;194m(<1s)\u001b[0m
\u001b[0m\u001b[33m▸\u001b[0m Add tests \u001b[38;2;255;79;194m(1/2)\u001b[0m

```

The local unit test uses a fake HUD entry to test forwarding. The isolated network E2E in Task 7 runs the real 0.7.0 entry against this fixture and compares stdout byte-for-byte.

- [ ] **Step 3: Run the HUD tests and confirm configuration functions are absent**

Run: `bun tests/installer-plugin-dependencies.mjs`

Expected: FAIL because `configureHud` and `renderHudStatusLineModule` are undefined.

- [ ] **Step 4: Implement field-level state and atomic JSON writes**

Store state at `~/.clawgod/plugin-dependencies-state.json` with schema version 1:

```js
{
  schemaVersion: 1,
  hud: {
    config: { originalPresent, originalBase64, managedSha256 },
    statusLine: { originalPresent, originalValue, managedValue, managedSha256 },
  },
  claudeMem: { files: {} },
}
```

Write state and settings through same-directory private temporary files, preserve existing file mode, reject links before open and again before rename, and set new private state files to `0600`. For `settings.json`, copy the parsed object, change only `statusLine`, and never restore the whole file.

- [ ] **Step 5: Generate a direct Bun status-line command**

The managed module must parse `installed_plugins.json`, select the highest valid user HUD record, validate that its real path remains inside `<CLAUDE_CONFIG_DIR>/plugins/cache/claude-hud/claude-hud`, and require a regular `src/index.ts`. Then forward the process exactly:

```js
const child = Bun.spawn({
  cmd: [process.execPath, entry],
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
});
process.exit(await child.exited);
```

Write `statusLine` as `{ type: 'command', command: '<quoted-absolute-bun> <quoted-managed-module>' }`. Use POSIX single-quote escaping on Unix and validated double-quoted paths on Windows. Assert exact equality with `quoteStatusLineArg(bunPath) + ' ' + quoteStatusLineArg(managedModulePath)`, then separately reject executable Node, `bash -c`, `ls`, `head`, command substitution, and `*` glob tokens. Do not reject harmless `?` or `[` characters that may legally occur in a Unix path.

- [ ] **Step 6: Execute the fake HUD through the managed module**

Use a fake higher HUD record plus an older baseline record. Make each fake `src/index.ts` echo a different marker, stderr, and exit code. Run the managed status-line module with fixed stdin and assert it chooses the higher version, forwards bytes unchanged, and returns the higher entry's exit code. Add cache-root escape, symlink, malformed record, and missing-entry failures.

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-bun-runtime.mjs
git diff --check
```

Expected: all HUD ownership and forwarding cases pass.

- [ ] **Step 8: Commit the Bun HUD integration**

```bash
git add install.sh install.ps1 tests/installer-plugin-dependencies.mjs tests/fixtures/claude-hud-current-style.json
git commit -m "feat: manage the Claude HUD status line with Bun"
```

---

### Task 5: Rewrite claude-mem Hook and MCP Entrypoints Safely

**Files:**
- Modify: `install.sh` embedded `plugin-dependencies.mjs`
- Modify: `install.ps1` embedded `plugin-dependencies.mjs`
- Modify: `tests/installer-plugin-dependencies.mjs`
- Modify: `tests/patcher-claude-mem.mjs`

**Interfaces:**
- Produces: `rewriteClaudeMemFile(relativePath: 'hooks/hooks.json' | '.mcp.json', raw: string, bunPath: string): { text: string, replacements: number }`.
- Produces: `configureClaudeMemBun(context: PluginContext, state: ManagedState): Promise<PluginResult>`.
- Produces: `restoreManagedIntegrations(context: PluginContext): Promise<{ restored: string[], conflicts: string[] }>` shared by HUD and claude-mem uninstall.
- Consumes: the selected highest valid user `claude-mem@thedotmack` install path.

- [ ] **Step 1: Add exact 13.14.0 hook and MCP fixtures**

Build JSON fixtures with the real executable forms:

```js
const hookCommands = [
  'node "$_P/scripts/version-check.js"',
  'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" start',
  'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code context',
  'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code session-init',
  'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code observation',
  'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code file-context',
  'node "$_P/scripts/bun-runner.js" "$_P/scripts/worker-service.cjs" hook claude-code summarize',
];
const mcp = { mcpServers: { 'mcp-search': { type: 'stdio', command: 'node', args: ['-e', 'process.stdout.write(process.execPath)'] } } };
```

Wrap hook fragments in the upstream prefix/suffix so the rewriter must change only executable tokens. Add negative fixtures with missing commands, two identical executable tokens in one hook, `node` in descriptive text, `node:fs`, `.node`, unknown scripts, root escape, target symlink, and malformed JSON.

- [ ] **Step 2: Run the claude-mem tests and observe the Node entrypoints**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/patcher-claude-mem.mjs
```

Expected: the new test fails because `rewriteClaudeMemFile` is undefined; the existing provider/worker compatibility suite remains green.

- [ ] **Step 3: Rewrite only recognized executable prefixes**

Parse JSON first. For `hooks/hooks.json`, visit every `hooks.*[].hooks[].command` string and replace only unique occurrences of these exact prefixes:

```js
const known = [
  'node "$_P/scripts/version-check.js"',
  'node "$_P/scripts/bun-runner.js"',
];
```

Use a POSIX-safe single-quoted absolute Bun path in hook command strings. Require at least one version-check replacement and one bun-runner replacement, and reject any remaining executable boundary matching `/(^|[;&|]\s*)node\s+(?=["']?\$_P\/scripts\/)/`.

For `.mcp.json`, require exactly one `mcpServers.mcp-search`, exact `type: 'stdio'`, exact `command: 'node'`, and args beginning with `['-e', <string>]`; replace only `command` with the absolute Bun path. Do not edit the `-e` program, ordinary words, `node:` imports, or `.node` extensions.

- [ ] **Step 4: Add byte backups and ownership fingerprints**

Key `state.claudeMem.files` by the normalized absolute target path. Each record contains `relativePath`, `pluginVersion`, `originalBase64`, `originalSha256`, and `managedSha256`. On rerun:

- current hash equals managed hash: no-op;
- current hash differs at the same path: treat it as a plugin/user update, replace the restore point, then revalidate before writing;
- a new version path: append a new ownership record so uninstall can restore every still-managed cached version;
- schema is unknown or ambiguous: return `preserved but not Bun-verified`, do not write, and set `ready: false`.

Write both files atomically only after both rewrites validate. If the second write fails, restore the first file's original bytes before returning a warning.

- [ ] **Step 5: Execute Bun-only hook and MCP smoke fixtures**

Create fixture `version-check.js`, `bun-runner.js`, and `worker-service.cjs` files. Execute a rewritten hook under `/bin/sh` with a fixture-only PATH containing Bun but a forbidden `node` shim. Assert stdin, stdout, stderr, environment, and nonzero exit propagation. Execute the rewritten MCP command through `Bun.spawnSync([command, ...args])` and assert `process.execPath` resolves to the current Bun.

On Windows source tests, assert both installers embed the same absolute-Bun JSON behavior; native PowerShell execution remains in Task 7 Windows CI.

- [ ] **Step 6: Restore only still-owned files**

`restoreManagedIntegrations` verifies each current file hash. Restore original bytes atomically only when it equals `managedSha256`; preserve later user/plugin edits and record a conflict. A missing managed file remains missing and is reported as a conflict rather than recreated. Delete a state record only after successful restore or confirmed user ownership transfer.

Do not read, write, stop, remove, or migrate files below `~/.claude-mem`; the existing `claude-mem-compat.cjs` remains responsible for its three managed settings and worker lifecycle.

- [ ] **Step 7: Run focused regressions**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/patcher-claude-mem.mjs
bun tests/patcher-worker-launch.mjs
bun tests/bun-only-policy.mjs
git diff --check
```

Expected: all pass and no executable Node entry remains in recognized claude-mem fixtures.

- [ ] **Step 8: Commit claude-mem Bun compatibility**

```bash
git add install.sh install.ps1 tests/installer-plugin-dependencies.mjs tests/patcher-claude-mem.mjs
git commit -m "feat: run claude-mem plugin entrypoints with Bun"
```

---

### Task 6: Integrate Optional Plugins into Install, Update, and Uninstall

**Files:**
- Modify: `install.sh:322-379,3641-3844`
- Modify: `install.ps1:507-575,3485-3663`
- Modify: `tests/installer-plugin-dependencies.mjs`
- Modify: `tests/installer-bun-runtime.mjs`
- Modify: `tests/patcher-install-no-upgrade-control-flow.mjs`

**Interfaces:**
- Produces CLI: `bun plugin-dependencies.mjs ensure` exits zero after printing one result per plugin and a summary, including warnings.
- Produces CLI: `bun plugin-dependencies.mjs uninstall` exits nonzero if owned restoration cannot complete safely.
- Produces: `ensurePluginDependencies(context: PluginContext): Promise<PluginResult[]>`.
- Consumes: `~/.clawgod/cli.original.cjs`, `~/.clawgod/fetch-file.mjs`, the resolved Bun path, and existing Claude config environment.

- [ ] **Step 1: Add lifecycle-order and summary failures**

Assert in `tests/installer-plugin-dependencies.mjs` and `tests/installer-bun-runtime.mjs`:

- module generation occurs after Bun/fetch helper availability;
- `ensure` runs after `cli.original.cjs` smoke and launcher creation, but before `claude-mem-compat.cjs install` restarts its worker;
- `uninstall` runs before claude-mem compatibility restore, launcher restore, and every `~/.clawgod` cleanup;
- `plugin-dependencies.mjs`, `claude-hud-statusline.mjs`, state, cache, and temporary transaction artifacts appear in cleanup lists only after successful restoration;
- ensure warning exit/output does not skip the final `ClawGod Plus installed` message;
- uninstall restoration failure leaves the managed scripts/state present and exits nonzero.

Add summary fixtures and require exact cardinality:

```text
Optional plugins: 3 ready, 0 warnings
Optional plugins: 2 ready, 1 warning
```

Exactly three per-plugin lines and one summary line may be printed.

- [ ] **Step 2: Run lifecycle tests and confirm no invocation exists**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-bun-runtime.mjs
bun tests/patcher-install-no-upgrade-control-flow.mjs
```

Expected: FAIL on missing ensure/uninstall invocation and cleanup order.

- [ ] **Step 3: Implement the top-level ensure command**

Construct context without PATH discovery:

```js
const context = {
  home,
  claudeConfigDir: process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
  clawgodDir: process.env.CLAWGOD_DIR || join(home, '.clawgod'),
  bunPath: process.env.CLAWGOD_BUN_BIN || process.execPath,
  claudeCliPath: join(process.env.CLAWGOD_DIR || join(home, '.clawgod'), 'cli.original.cjs'),
  fetchFilePath: join(process.env.CLAWGOD_DIR || join(home, '.clawgod'), 'fetch-file.mjs'),
  env: process.env,
  spawnSyncImpl: Bun.spawnSync,
};
```

Process HUD, memory, and Superpowers independently. First ensure missing/older marketplaces, then configure HUD, then configure claude-mem Bun entrypoints. A marketplace warning prevents that plugin's dependent configuration but does not stop the next plugin. Persist state after every committed ownership change.

- [ ] **Step 4: Invoke ensure as an optional post-core stage**

Unix:

```bash
if ! CLAWGOD_BUN_BIN="$BUN_BIN" CLAWGOD_DIR="$CLAWGOD_DIR" \
  "$BUN_BIN" "$CLAWGOD_DIR/plugin-dependencies.mjs" ensure; then
  warn "Optional Claude plugin setup could not complete; ClawGod Plus core install will continue"
fi
```

PowerShell uses `& $BunBin (Join-Path $ClawDir 'plugin-dependencies.mjs') ensure` inside `try/catch`, restores temporary environment variables in `finally`, and prints the equivalent warning. It must not set the process exit code after core success.

Run this before the existing claude-mem compatibility helper so a worker restart sees Bun-correct hooks.

- [ ] **Step 5: Invoke uninstall fail-closed before managed cleanup**

If the module and state exist, run `uninstall`. A nonzero status prints `Could not restore optional Claude plugin integrations; ClawGod Plus was not uninstalled` and exits before claude-mem settings, launchers, or managed runtime are removed. On success, continue existing uninstall and remove the generated module, HUD status-line module, state, plugin download cache, and transaction residue. Do not remove `~/.claude/plugins/clawgod-marketplaces`, installed caches, marketplace installs, or plugin enablement.

- [ ] **Step 6: Lock Claude Code update semantics**

Extend `tests/patcher-install-no-upgrade-control-flow.mjs` with source/control-flow fixtures that assert:

```js
assert.ok(latestUpdateRunsClaudeDownloadBeforePluginEnsure);
assert.ok(explicitVersionFlowsToClaudePackageResolverOnly);
assert.ok(noUpgradeSkipsClaudePackageDownloadButStillRunsPluginHealthCheck);
assert.doesNotMatch(pluginModule, /CLAWGOD_VERSION|--version\s+2\.|version\s*=\s*['"]latest['"]/);
```

Do not change the existing patched `claude update` routing code. Every update already reruns the installer; the new post-core stage is sufficient.

- [ ] **Step 7: Run the lifecycle suite**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-bun-runtime.mjs
bun tests/patcher-install-no-upgrade-control-flow.mjs
bun tests/patcher-update-bun-only.mjs
bun tests/patcher-claude-mem.mjs
bash -n install.sh
git diff --check
```

Expected: all pass; no network E2E runs in this task.

- [ ] **Step 8: Commit lifecycle integration**

```bash
git add install.sh install.ps1 tests/installer-plugin-dependencies.mjs tests/installer-bun-runtime.mjs tests/patcher-install-no-upgrade-control-flow.mjs
git commit -m "feat: integrate optional Claude plugins into installer lifecycle"
```

---

### Task 7: Document and Exercise the Real Plugin Workflow

**Files:**
- Modify: `README.md:124-178,235-245,300-320`
- Modify: `README_EN.md:124-178,235-245,300-320`
- Modify: `README_JP.md:124-178,235-245,300-320`
- Modify: `AGENTS.md`
- Modify: `tests/bun-only-policy.mjs`
- Modify: `tests/installer-e2e.mjs`
- Modify: `tests/installer-e2e-contract.mjs`
- Modify: `.github/workflows/compat-daily.yml`

**Interfaces:**
- Produces log contract: `Optional plugins: 3 ready, 0 warnings` for an enabled isolated acceptance run.
- Produces log contract: `HUD statusline: bun-only current-style=exact`.
- Produces log contract: `claude-mem entrypoints: hooks=bun mcp=bun`.
- Produces log contract: `plugin retention: hud=present memory=present superpowers=present` after ClawGod uninstall.
- Consumes: `tests/fixtures/claude-hud-current-style.json` from Task 4.

- [ ] **Step 1: Tighten the Bun-only and documentation policy first**

Add table-driven forbidden command fixtures for direct and wrapped `git`, `git.exe`, `Start-Process git`, `cmd /c git`, Shell/PowerShell nested payloads, Node/npm/npx, curl/wget, and system rg. Allow GitHub Actions' badge-publish `git` block only through its existing narrow workflow exception; installer source, generated modules, tests that execute product paths, and README install requirements must remain free of system Git dependencies.

Require all three READMEs to mention the three canonical IDs, baseline versions, preserve-newer behavior, `hub.211107.xyz`, Bun HUD `statusLine`, claude-mem Bun entrypoints, optional warning semantics, Claude Code latest-update behavior, and uninstall retention. Require AGENTS to name `plugin-dependencies.mjs` and `bun tests/installer-plugin-dependencies.mjs`.

- [ ] **Step 2: Run policy and capture the expected documentation failure**

Run: `bun tests/bun-only-policy.mjs`

Expected: FAIL because the READMEs still describe manual HUD installation and do not describe managed plugin dependencies.

- [ ] **Step 3: Update all three READMEs and AGENTS**

Replace manual HUD installation commands with the automatic baseline/preserve-newer behavior. Keep the exact profile JSON and screenshot. Explain:

- Bun is still the only installed runtime dependency;
- public fixed archives use the selected proxy and fixed hashes;
- optional plugin warnings do not fail core installation;
- `claude update` upgrades Claude Code latest and does not pin it to plugin versions;
- uninstall restores managed HUD/claude-mem integration but keeps plugins, marketplaces, and memory data;
- unknown higher claude-mem schemas are preserved and reported as not Bun-verified.

Update AGENTS lifecycle ordering, focused commands, architecture, and cleanup boundaries. Do not claim Windows native verification locally when PowerShell is unavailable.

- [ ] **Step 4: Extend offline E2E contracts**

In `tests/installer-e2e-contract.mjs`, add pure validators for:

```js
validatePluginSummary(output) === { ready: 3, warnings: 0 };
validateHudStatusLine(settings, bunPath, managedModulePath);
validatePluginRetention(tempHome, expectedCanonicalIds);
validateClaudeMemEntrypoints(hooksJson, mcpJson, bunPath);
```

Reject duplicate/missing summary lines, `2 ready`, warning summaries, Node/Bash HUD commands, wrong plugin IDs, removed plugin cache/marketplace paths, and partial claude-mem rewrites.

- [ ] **Step 5: Extend the isolated Unix network E2E**

Add `git` to forbidden dependency shims. After initial install and no-upgrade, assert exact versions or a higher preserved fixture, all canonical enablement, persistent local sources, and the three new log contracts. Execute `claude-hud-statusline.mjs` with the committed golden fixture under the temporary HOME and compare ANSI stdout byte-for-byte.

Before uninstall, derive expected Claude settings by removing only the managed `statusLine` from the post-install object and retaining every unrelated field. After uninstall, assert that expected settings match, all three plugin caches/marketplaces remain, `.claude-mem` sentinel data remains, and every `~/.clawgod` plugin helper/state/cache is absent.

- [ ] **Step 6: Extend Windows CI with the same product assertions**

Add `git`/`git.exe` forbidden shims. Parse `installed_plugins.json`, settings, HUD config, claude-mem hooks, and `.mcp.json` with PowerShell JSON APIs. Invoke the HUD status-line command with Bun and the fixed stdin fixture, compare decoded expected ANSI bytes, then uninstall and assert plugins remain while ClawGod integration files and `statusLine` are restored.

Add `.github/workflows/compat-daily.yml` path filters for `tests/**`, all three READMEs, AGENTS, and the new spec/plan paths. Keep the existing GitHub Actions Node24 environment comment and badge-publish Git exception; neither is a product runtime dependency.

- [ ] **Step 7: Run offline documentation and contract checks**

Run:

```bash
bun tests/bun-only-policy.mjs
bun tests/installer-e2e-contract.mjs
bun tests/installer-plugin-dependencies.mjs
bun scripts/rebuild-helper-zips.mjs --check
bash -n install.sh
git diff --check
```

Expected: all pass without setting `CLAWGOD_E2E`; no installer or plugin command touches the real HOME.

- [ ] **Step 8: Commit docs and acceptance coverage**

```bash
git add README.md README_EN.md README_JP.md AGENTS.md tests/bun-only-policy.mjs tests/installer-e2e.mjs tests/installer-e2e-contract.mjs .github/workflows/compat-daily.yml
git commit -m "test: cover Bun-managed Claude plugin dependencies"
```

---

### Task 8: Complete Fresh Verification and Isolated Network Acceptance

**Files:**
- Verify: all changed files from Tasks 1-7
- Modify only if a verification failure exposes a scoped defect.

**Interfaces:**
- Consumes: all focused tests and log contracts from earlier tasks.
- Produces: a clean local branch with reproducible offline tests and an isolated network E2E result.

- [ ] **Step 1: Prove the worktree and syntax baseline**

Run:

```bash
git status --short
git diff --check cb7409c..HEAD
bash -n install.sh
bash -n apply-claude-code-chrome-fix.sh
bash -n apply-claude-code-computer-use-fix.sh
bash -n apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh
```

Expected: no uncommitted files, no whitespace errors, and all four Bash scripts parse.

- [ ] **Step 2: Run the complete offline Bun suite with network gates unset**

Run:

```bash
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E bash -c '
  set -e
  for test_file in tests/*.mjs; do
    bun "$test_file"
  done
'
bun scripts/rebuild-helper-zips.mjs --check
```

Expected: every test passes; `tests/installer-e2e.mjs` explicitly skips before temporary/network mutation when `CLAWGOD_E2E` is absent.

- [ ] **Step 3: Fingerprint real HOME before the authorized network E2E**

Record type, mode, inode, mtime, link target, and SHA-256 where applicable for the real paths already protected by `tests/installer-e2e.mjs`, plus:

```text
~/.claude/settings.json
~/.claude/plugins/installed_plugins.json
~/.claude/plugins/known_marketplaces.json
~/.claude/plugins/claude-hud/config.json
~/.claude/plugins/cache/claude-hud
~/.claude/plugins/cache/thedotmack
~/.claude/plugins/cache/superpowers-marketplace
~/.claude-mem
```

The E2E itself must reject any resolved Bun, Claude, plugin, marketplace, settings, or memory path outside its temporary HOME before invoking the installer.

- [ ] **Step 4: Run the isolated network acceptance once**

Run:

```bash
CLAWGOD_E2E=1 CLAWGOD_PLUGIN_E2E=1 bun tests/installer-e2e.mjs
```

Expected output includes:

```text
environment isolation: bun=sandboxed claude=unresolved
Optional plugins: 3 ready, 0 warnings
HUD statusline: bun-only current-style=exact
claude-mem entrypoints: hooks=bun mcp=bun
plugin retention: hud=present memory=present superpowers=present
uninstall cleanup: managed-runtime=absent settings=restored external-launchers=absent
installer e2e passed
```

The run must use the fixed proxy URLs, install no system dependency, keep Claude Code version equality checks, and remove its temporary root.

- [ ] **Step 5: Re-fingerprint real HOME and require zero differences**

Compare every baseline fingerprint immediately after E2E and again at terminal state. Any difference is a failed safety boundary; stop without attempting to repair or overwrite real user state and report exact paths.

- [ ] **Step 6: Run focused post-E2E regressions**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/installer-bun-runtime.mjs
bun tests/patcher-claude-mem.mjs
bun tests/patcher-install-no-upgrade-control-flow.mjs
bun tests/patcher-update-bun-only.mjs
bun tests/installer-e2e-contract.mjs
bun tests/bun-only-policy.mjs
git diff --check
git status --short --branch
```

Expected: all pass and the worktree remains clean.

- [ ] **Step 7: Check native PowerShell availability and defer honestly if absent**

Run:

```bash
command -v pwsh || command -v powershell || true
```

If present, parse `install.ps1` and execute the Windows generated module fixtures. If absent, record native Windows execution as unverified locally and rely on the paired-module tests plus `windows-smoke` CI; do not claim a local PowerShell pass.

- [ ] **Step 8: Review the final commit range without creating a release**

Inspect `git diff --stat cb7409c..HEAD`, `git log --oneline cb7409c..HEAD`, and every changed production/test/doc file. Confirm all seven implementation commits are narrow and no unrelated real-HOME file, release asset, tag, remote branch, or generated website was changed. Do not push or release without a separate user request.
