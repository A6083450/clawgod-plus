# Bun-only Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bun the only user-installed runtime required to install, update, run, and uninstall ClawGod Plus while preserving all existing CLI, Grep, Chrome, Computer Use, claude-mem, shared collaboration, and `/peers` behavior.

**Architecture:** Keep `install.sh` and `install.ps1` self-contained, but make every generated JavaScript helper execute under Bun. Both installers embed equivalent Bun modules for npm Registry retrieval and a pinned private ripgrep, and the generated wrapper prepends the private ripgrep directory to `PATH` before loading Claude Code. Remove the static site and prove the resulting dependency boundary with focused tests plus isolated end-to-end installs.

**Tech Stack:** Bash, PowerShell 5.1, Bun 1.3.14+, JavaScript ESM/CJS, `Bun.Archive`, `Bun.CryptoHasher`, GitHub Actions, ripgrep 15.2.0.

## Global Constraints

- The only user-installed runtime prerequisite is Bun 1.3.14 or newer; Shell or PowerShell remains the operating-system installation entry point.
- Do not require or invoke Node.js, npm, a system `rg`, `tar`, or `unzip` during installation or runtime.
- Pin private ripgrep to 15.2.0; do not resolve a dynamic latest version.
- Preserve provider and feature configuration formats, `~/.clawgod`, launch commands, update/uninstall behavior, Grep, daemon/worker launches, Chrome, Computer Use, claude-mem, shared collaboration, and `/peers`.
- Keep `node:` standard-library imports and `.node` native module extensions where Bun consumes them; those strings are not runtime dependencies.
- Delete `web/` and root `index.html`, but keep root `bypass.png` because all three READMEs reference it.
- Keep Unix and Windows installer behavior paired and verify their embedded modules do not drift.
- Do not push, tag, publish, or create a GitHub Release as part of implementation.

## File Structure

**Create:**

- `tests/installer-bun-runtime.mjs` - checks Bun prerequisites, generated shebangs, Bun invocations, claude-mem install/uninstall, and Acorn cache behavior.
- `tests/installer-registry-download.mjs` - extracts and exercises the paired npm Registry modules with deterministic `fetch` fixtures.
- `tests/installer-ripgrep.mjs` - verifies all six asset mappings, hashes, tar/zip extraction, rollback, version smoke, and wrapper `PATH` injection.
- `tests/helpers-bun-only.mjs` - checks standalone patch helpers and their tracked ZIP distributions.
- `tests/bun-only-policy.mjs` - closes the repository-wide dependency and deleted-site contract.
- `tests/installer-e2e.mjs` - runs the Unix installer in a temporary home with forbidden dependency shims, then tests update, launch, private Grep, and uninstall.
- `scripts/rebuild-helper-zips.mjs` - deterministically rebuilds the two tracked standalone-helper ZIP files using Bun only.

**Modify:**

- `install.sh` - resolve Bun before every lifecycle path; embed Bun Registry/ripgrep modules; run every generated script with Bun; inject private ripgrep into the wrapper.
- `install.ps1` - Windows-equivalent lifecycle, Registry, ripgrep, generated-script, and wrapper changes.
- `apply-claude-code-chrome-fix.sh`, `apply-claude-code-chrome-fix.ps1` - use Bun and private Acorn; remove npm path discovery.
- `apply-claude-code-computer-use-fix.sh` - use Bun and private Acorn; prefer the ClawGod bundle.
- `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh`, `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.ps1` - replace Node/npm discovery and execution with Bun.
- All `tests/*.mjs` - Bun shebang and Bun subprocess expectations.
- `apply-claude-code-chrome-fix.zip`, `apply-claude-code-computer-use-fix.zip` - rebuilt from the modified helper sources.
- `.github/workflows/compat-daily.yml` - Bun-only tests and isolated Linux/Windows smoke jobs.
- `README.md`, `README_EN.md`, `README_JP.md`, `AGENTS.md`, `CLAUDE.md` - Bun-only prerequisites, commands, architecture, and validation.

**Delete:**

- `.github/workflows/cache-cleanup-weekly.yml` - npm cache no longer exists.
- `web/` - complete Vite/TypeScript site source and package metadata.
- `index.html` - generated site artifact at repository root.

---

### Task 1: Establish the Bun Test Baseline and Fix Vendored Acorn

**Files:**
- Modify: `install.sh:1570-1610`
- Modify: `install.ps1:1674-1712`
- Modify: `tests/browser-extension-tabs-create.mjs:1`
- Modify: `tests/patcher-2.1.215.mjs:1`
- Modify: `tests/patcher-agents-chrome.mjs:1`
- Modify: `tests/patcher-chrome-socket.mjs:1-145`
- Modify: `tests/patcher-claude-mem.mjs:1-50,300-330`
- Modify: `tests/patcher-context-limit.mjs:1`
- Modify: `tests/patcher-default-agents-view.mjs:1`
- Modify: `tests/patcher-install-no-upgrade-control-flow.mjs:1`
- Modify: `tests/patcher-macos-paste.mjs:1`
- Modify: `tests/patcher-worker-launch.mjs:1`

**Interfaces:**
- Produces: embedded `async function loadAcorn(): Promise<object | null>` in both installers.
- Produces: `~/.clawgod/vendor/acorn.cjs` as the only AST parser cache path.
- Consumes: Bun as `process.execPath` when tests spawn extracted patchers.

- [ ] **Step 1: Make the Acorn regression explicitly require a vendored cache**

In `tests/patcher-chrome-socket.mjs`, keep the current assertion that reads `vendor/acorn.js`, but update it to `vendor/acorn.cjs` and add assertions that the extracted patcher does not contain an ambient `require('acorn')` fallback:

```js
assert.doesNotMatch(patcher, /require\(['"]acorn['"]\)/, `${label}: ambient package caches must not select Acorn`);
helperAcornSource ??= readFileSync(join(dir, 'vendor', 'acorn.cjs'), 'utf8');
assert.match(helperAcornSource, /acorn\.version|exports\.parse/);
```

- [ ] **Step 2: Run the focused test and confirm the current failure**

Run: `bun tests/patcher-chrome-socket.mjs`

Expected: FAIL because `vendor/acorn.cjs` is not created; Bun currently finds an ambient cached Acorn package first.

- [ ] **Step 3: Replace both embedded Acorn loaders with a fixed Bun loader**

In both installer patcher templates, remove `createRequire` and `require('acorn')`. Add `renameSync` and `pathToFileURL`, then use the following structure:

```js
const ACORN_CACHE = join(__dirname, 'vendor', 'acorn.cjs');
const ACORN_URL = 'https://unpkg.com/acorn@8.16.0/dist/acorn.js';

async function loadAcorn() {
  try {
    if (!existsSync(ACORN_CACHE)) {
      mkdirSync(dirname(ACORN_CACHE), { recursive: true });
      const response = await fetch(ACORN_URL);
      if (!response.ok) return null;
      const temp = `${ACORN_CACHE}.${process.pid}.tmp`;
      writeFileSync(temp, await response.text(), 'utf8');
      renameSync(temp, ACORN_CACHE);
    }
    const module = await import(pathToFileURL(ACORN_CACHE).href);
    const acorn = typeof module.parse === 'function' ? module : module.default;
    return acorn && typeof acorn.parse === 'function' ? acorn : null;
  } catch {
    return null;
  }
}
```

Retain the existing regex fallback when this function returns `null`, and keep mandatory patch failure reporting unchanged.

- [ ] **Step 4: Move all test entrypoints to Bun**

Change every `tests/*.mjs` shebang to:

```js
#!/usr/bin/env bun
```

Keep `spawnSync(process.execPath, ...)`; when the parent test runs with Bun this deliberately exercises Bun again. In `tests/patcher-claude-mem.mjs`, replace Node-specific source assertions and the fake `node` executable with a fake `bun` executable that delegates to the current `process.execPath`.

- [ ] **Step 5: Run every existing regression under Bun**

Run:

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done
```

Expected: all existing tests pass; `patcher-chrome-socket.mjs` creates and reuses `vendor/acorn.cjs` in its temporary fixture.

- [ ] **Step 6: Commit the Bun test baseline**

```bash
git add install.sh install.ps1 tests
git commit -m "test: run patcher regressions with Bun"
```

---

### Task 2: Remove Node from Core Installer Lifecycle Paths

**Files:**
- Create: `tests/installer-bun-runtime.mjs`
- Modify: `install.sh:48-417,533-955,971-1015,1570-1600,2789-3005,3050-3090`
- Modify: `install.ps1:35-477,684-1105,1122-1165,1674-1705,2691-2900,2980-3005`
- Modify: `tests/patcher-claude-mem.mjs:30-50,300-330`

**Interfaces:**
- Produces: Unix `resolve_bun()` that sets `BUN_BIN` and returns nonzero with a clear message when unavailable.
- Produces: PowerShell `Resolve-Bun` that returns the native `bun`/`bun.exe` path.
- Produces: generated `fetch-file.mjs <url> <destination>` for Chrome helper and `clawgod-import` downloads, with atomic writes and proxy support.
- Consumes: the same Bun executable for install, uninstall, generated scripts, lean toggles, and claude-mem.

- [ ] **Step 1: Write the failing core-runtime policy test**

Create `tests/installer-bun-runtime.mjs` to load both installers and assert:

```js
for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.doesNotMatch(source, /#!\/usr\/bin\/env node/, `${name}: generated scripts must use Bun shebangs`);
  assert.doesNotMatch(source, /Get-Command node|command -v node|\bnode\s+-e\b|\bnode\s+["'$]/, `${name}: must not execute Node`);
  assert.match(source, /claude-mem-compat\.cjs["']?\s+uninstall/, `${name}: uninstall must still restore claude-mem`);
  assert.match(source, /Bun:|Bun version/, `${name}: Bun preflight must remain visible`);
}
```

Also extract the `claude-mem-compat.cjs`, `fetch-file.mjs`, extractor, post-processor, repatcher, and patcher templates and assert their shebangs are `#!/usr/bin/env bun`. Assert Chrome helper and `clawgod-import` downloads invoke `fetch-file.mjs`, not curl or `Invoke-WebRequest`.

- [ ] **Step 2: Run the policy test and confirm Node calls are found**

Run: `bun tests/installer-bun-runtime.mjs`

Expected: FAIL on the current prerequisite checks, generated shebangs, uninstall helper, extractor, post-processor, patcher, lean scripts, and claude-mem setup calls.

- [ ] **Step 3: Resolve Bun before normal install and uninstall**

Move Bun lookup into a reusable function defined before the uninstall branch. On Unix the function must check `command -v bun`, then `$HOME/.bun/bin/bun`; on Windows it must use `Get-Command bun` and known native `bun.exe` paths. Keep the existing minimum-version comparison after resolution.

When Bun is missing, print one explicit prerequisite message and exit before changing launchers. Remove the curl/`Invoke-RestMethod` Bun bootstrap: a program cannot be its own prerequisite downloader, and the documented contract is that Bun is preinstalled.

- [ ] **Step 4: Execute every lifecycle helper with the resolved Bun path**

Replace all executable Node calls with `$BUN_BIN` or `$BunBin`, including:

```bash
"$BUN_BIN" "$CLAWGOD_DIR/extract-natives.mjs" "$NATIVE_BIN" "$CLAWGOD_DIR"
"$BUN_BIN" "$CLAWGOD_DIR/post-process.mjs"
"$BUN_BIN" "$CLAWGOD_DIR/patch.mjs"
"$BUN_BIN" -e "$LEAN_SCRIPT" "$HOME/.claude/settings.json"
CLAWGOD_BUN_BIN="$BUN_BIN" "$BUN_BIN" "$CLAWGOD_DIR/claude-mem-compat.cjs" install
```

Use the PowerShell equivalents with `& $BunBin`. Change generated shebangs and comments from Node to Bun. During uninstall, resolve Bun first and run `claude-mem-compat.cjs uninstall`; if restoration fails, retain the current fail-closed behavior and do not remove ClawGod.

Generate `fetch-file.mjs` once after Bun preflight. Its `fetchWithProxy` must honor `HTTPS_PROXY`/`https_proxy`, then `HTTP_PROXY`/`http_proxy`, bypass matching hosts from `NO_PROXY`/`no_proxy`, follow at most five redirects manually, use `AbortSignal.timeout(300000)`, reject non-200 responses, write `<destination>.<pid>.tmp`, and rename only after the response is complete. Use it for remote Chrome helper and `clawgod-import` downloads in both installers. Never print proxy URLs because they may contain credentials.

- [ ] **Step 5: Keep Bun-compatible `node:` imports without treating them as dependencies**

Do not rewrite imports such as `node:fs`, `node:path`, `node:zlib`, or native filenames ending in `.node`. Update policy regexes to distinguish those strings from executable invocations.

- [ ] **Step 6: Run the focused and existing tests**

Run:

```bash
bun tests/installer-bun-runtime.mjs
bun tests/patcher-claude-mem.mjs
bun tests/patcher-install-no-upgrade-control-flow.mjs
```

Expected: all three pass and both uninstall branches still stop if claude-mem restoration fails.

- [ ] **Step 7: Commit the lifecycle migration**

```bash
git add install.sh install.ps1 tests/installer-bun-runtime.mjs tests/patcher-claude-mem.mjs tests/patcher-install-no-upgrade-control-flow.mjs
git commit -m "refactor: run installer lifecycle with Bun"
```

---

### Task 3: Replace npm CLI Package Retrieval with Bun Registry Fetching

**Files:**
- Create: `tests/installer-registry-download.mjs`
- Modify: `install.sh:433-532`
- Modify: `install.ps1:495-683`

**Interfaces:**
- Produces: identical embedded `fetch-package.mjs` modules in both installers.
- Produces: `proxyFor(url: string, env?: object): string | undefined` and `fetchWithProxy(url: string, init?: object, env?: object, fetchImpl?: typeof fetch): Promise<Response>`.
- Produces: `resolvePackage(pkg: string, requested: string, options?: { fetchImpl?: typeof fetch, env?: object }): Promise<{ version: string, dist: object }>`.
- Produces: `installPackage(spec: string, outDir: string, options?: { fetchImpl?: typeof fetch, env?: object }): Promise<{ version: string, binaryPath: string }>`.
- Consumes: `@anthropic-ai/claude-code-<platform>@<version>` and writes the existing `package/claude` or `package/claude.exe` layout expected by downstream extraction.

- [ ] **Step 1: Write deterministic Registry and archive tests**

Create a tiny tar.gz fixture with `Bun.Archive` containing `package/package.json` plus a binary larger than the test minimum. Mock `fetch` with `Response` objects for Registry metadata and tarball bytes. Assert exact version resolution, scoped-package URL encoding, `dist.integrity` validation, binary selection, and package version output.

Add negative cases for HTTP failure, missing version, bad SHA-512 integrity, missing binary, undersized binary, unsafe selected paths, more than five redirects, proxy selection, lowercase proxy variables, and exact/wildcard `NO_PROXY` bypass. Extract the modules from both installers and assert their normalized source bodies are equal.

- [ ] **Step 2: Run the Registry test and confirm current installers have no paired Bun module**

Run: `bun tests/installer-registry-download.mjs`

Expected: FAIL because Unix still runs `npm pack` and Windows still conditionally falls back to npm/Node.

- [ ] **Step 3: Implement the self-contained Bun Registry module**

Embed the same ESM source in both installers. Use these core operations:

```js
const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
const metadata = await checkedJson(await fetchWithProxy(metadataUrl, {}, process.env, fetchImpl));
const version = requested === 'latest' ? metadata['dist-tags']?.latest : requested;
const manifest = metadata.versions?.[version];
const archiveResponse = await fetchWithProxy(manifest.dist.tarball, {}, process.env, fetchImpl);
const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
const [algorithm, expected] = manifest.dist.integrity.split('-', 2);
const actual = new Bun.CryptoHasher(algorithm).update(bytes).digest('base64');
if (actual !== expected) throw new Error(`Integrity mismatch for ${pkg}@${version}`);
const files = await new Bun.Archive(bytes).files();
```

Read only `package/package.json` and the platform binary from the in-memory archive. Validate every selected path is relative and contains no `..`; never extract links or the whole archive. Write only the selected regular files to `outDir/package`, set Unix executable mode, and return the exact resolved version.

Implement `proxyFor` once in the embedded module: parse the request hostname, honor comma-separated `NO_PROXY` entries including a leading-dot domain suffix and `*`, and otherwise return the HTTPS proxy first for HTTPS URLs. `fetchWithProxy` must use `redirect: 'manual'`, resolve relative `Location` headers, stop after five hops, and apply `AbortSignal.timeout(300000)` to each request. Pass Bun's documented `proxy` fetch option only when a proxy applies, and never include the selected proxy URL in logs or errors.

- [ ] **Step 4: Call the Bun Registry module from both installers**

On Unix run `"$BUN_BIN" "$FETCH_SCRIPT" "$NPM_PKG@$VERSION" "$NATIVE_BIN_TMPDIR"`; on Windows run `& $BunBin $fetchScript "$npmPkg@$Version" $NativeBinTmpDir`. Remove `npm pack`, `Get-Command npm`, npm proxy fallbacks, npm cache messaging, and Node JSON parsing. Preserve platform suffix selection and the existing binary-size guard.

- [ ] **Step 5: Run Registry and extractor regressions**

Run:

```bash
bun tests/installer-registry-download.mjs
bun tests/installer-bun-runtime.mjs
bun tests/patcher-worker-launch.mjs
```

Expected: all pass; no installer branch invokes npm or Node.

- [ ] **Step 6: Commit direct Registry retrieval**

```bash
git add install.sh install.ps1 tests/installer-registry-download.mjs tests/installer-bun-runtime.mjs
git commit -m "refactor: fetch Claude Code packages with Bun"
```

---

### Task 4: Install and Route the Private ripgrep Binary

**Files:**
- Create: `tests/installer-ripgrep.mjs`
- Modify: `install.sh:352-417,1287-1460`
- Modify: `install.ps1:458-495,1422-1580`

**Interfaces:**
- Produces: identical embedded `install-ripgrep.mjs` modules.
- Produces: `selectRipgrepAsset(platform: string, arch: string): { name: string, sha256: string, entry: string }`.
- Produces: `extractRipgrep(bytes: Uint8Array, asset: object): Promise<Uint8Array>`.
- Produces: `validateRipgrepVersion(path: string, spawnImpl?: typeof Bun.spawnSync): void`.
- Produces: `replaceManagedBinary(staged: string, target: string, fsOps?: object): void`.
- Produces: `ensureRipgrep(root: string, options?: { fetchImpl?: typeof fetch, env?: object, platform?: string, arch?: string, spawnImpl?: typeof Bun.spawnSync, fsOps?: object }): Promise<string>`.
- Consumes: `~/.clawgod/vendor/ripgrep/bin/rg` or `rg.exe`; the generated wrapper prepends that directory to `PATH`.

- [ ] **Step 1: Encode the exact release matrix in the failing test**

In `tests/installer-ripgrep.mjs`, assert the extracted module contains exactly this map:

```js
const RIPGREP_VERSION = '15.2.0';
const RIPGREP_ASSETS = {
  'darwin-arm64': ['ripgrep-15.2.0-aarch64-apple-darwin.tar.gz', '3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4'],
  'darwin-x64': ['ripgrep-15.2.0-x86_64-apple-darwin.tar.gz', 'af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1'],
  'linux-arm64': ['ripgrep-15.2.0-aarch64-unknown-linux-musl.tar.gz', '800b1e7206afe799dfb5a6901f23147cfaabe0e52210538100f61e86e1740915'],
  'linux-x64': ['ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz', '33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'],
  'win32-arm64': ['ripgrep-15.2.0-aarch64-pc-windows-msvc.zip', 'e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f'],
  'win32-x64': ['ripgrep-15.2.0-x86_64-pc-windows-msvc.zip', '71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5'],
};
```

Assert unsupported platforms fail explicitly and the two embedded module bodies are equivalent.

- [ ] **Step 2: Add tar, ZIP, hash, and rollback fixture cases**

Use `Bun.Archive` to build tar.gz fixtures. Add a small stored/deflated ZIP fixture builder in the test. Exercise exact-entry selection, SHA-256 mismatch, malformed EOCD/central directory, encrypted ZIP flags, unsupported compression methods, `..` paths, absolute paths, and wrong executable names. Inject `spawnImpl` for good/bad `rg --version` output and `fsOps` for replacement failure plus restoration of an existing good binary.

- [ ] **Step 3: Run the test and confirm the current system-rg prerequisite fails the contract**

Run: `bun tests/installer-ripgrep.mjs`

Expected: FAIL because neither installer embeds a managed ripgrep module and both require a system `rg`.

- [ ] **Step 4: Implement the paired Bun ripgrep module**

Download from `https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/<asset>` through the same `proxyFor`/`fetchWithProxy` behavior as the Registry module, calculate SHA-256 with `Bun.CryptoHasher`, and compare against the embedded map before parsing.

For tar.gz, use `Bun.Archive.files()` and select only `<release-directory>/rg`. For Windows ZIP, implement central-directory parsing that locates the exact `<release-directory>/rg.exe`, rejects encryption and unsafe names, accepts only methods 0 and 8, bounds-checks every offset and size, inflates method 8 with Bun, and verifies CRC-32 plus uncompressed size.

Stage the executable next to the destination, run `<staged> --version`, require the output to start with `ripgrep 15.2.0`, then perform a rollback-capable replacement:

```js
const backup = `${target}.previous`;
if (existsSync(target)) renameSync(target, backup);
try {
  renameSync(staged, target);
  rmSync(backup, { force: true });
} catch (error) {
  if (existsSync(backup)) renameSync(backup, target);
  throw error;
}
```

Use a validated file target under `~/.clawgod/vendor/ripgrep/bin`; never apply recursive deletion to a user-derived path.

- [ ] **Step 5: Integrate ripgrep before both normal and no-upgrade branches**

Generate the module under `~/.clawgod/install-ripgrep.mjs` and call it with the resolved Bun path. Remove system `rg` checks and package-manager instructions. `--no-upgrade` must still call `ensureRipgrep` before repatching. Existing uninstall already removes `vendor`; explicitly include `install-ripgrep.mjs` in generated-artifact cleanup.

- [ ] **Step 6: Route all runtime children through the private binary**

In both generated `cli.cjs` wrappers, import `delimiter` from `node:path` and insert before loading upstream code:

```js
const ripgrepBin = join(clawgodDir, 'vendor', 'ripgrep', 'bin');
process.env.PATH = `${ripgrepBin}${delimiter}${process.env.PATH || ''}`;
process.env.USE_BUILTIN_RIPGREP ??= '1';
```

Update the nearby comment to state that “built-in” now resolves to the ClawGod-managed path. The wrapper-level injection ensures daemon, worker, Grep, Chrome, and Computer Use child processes inherit the same path even when `bun ~/.clawgod/cli.cjs` is invoked directly.

- [ ] **Step 7: Run the managed-ripgrep and worker tests**

Run:

```bash
bun tests/installer-ripgrep.mjs
bun tests/patcher-worker-launch.mjs
bun tests/installer-bun-runtime.mjs
```

Expected: all pass; a fake system `rg` later in `PATH` is never selected.

- [ ] **Step 8: Commit private ripgrep management**

```bash
git add install.sh install.ps1 tests/installer-ripgrep.mjs tests/installer-bun-runtime.mjs
git commit -m "feat: manage ripgrep with Bun"
```

---

### Task 5: Migrate Standalone Patch Helpers and Rebuild Their ZIPs

**Files:**
- Create: `tests/helpers-bun-only.mjs`
- Create: `scripts/rebuild-helper-zips.mjs`
- Modify: `apply-claude-code-chrome-fix.sh:55-120,620-630`
- Modify: `apply-claude-code-chrome-fix.ps1:75-125,490-525`
- Modify: `apply-claude-code-computer-use-fix.sh:85-190,575-585`
- Modify: `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh:90-205`
- Modify: `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.ps1:90-195`
- Modify: `apply-claude-code-chrome-fix.zip`
- Modify: `apply-claude-code-computer-use-fix.zip`

**Interfaces:**
- Produces: helper-local `resolve_bun`/`Resolve-Bun` with an actionable Bun-only failure message.
- Produces: helper AST patchers executed with Bun and fixed Acorn 8.16.0.
- Produces: `writeStoredZip(output: string, entries: Array<{ name: string, data: Uint8Array }>): Promise<void>` in the rebuild script.

- [ ] **Step 1: Write helper source and ZIP parity tests**

Create `tests/helpers-bun-only.mjs` to assert every helper:

- prefers `~/.clawgod/cli.original.cjs` for automatic discovery;
- retains explicit path support;
- contains no `npm root -g`, executable Node call, Node shebang, `curl`, or `Invoke-WebRequest` for Acorn;
- resolves and executes Bun;
- uses Acorn 8.16.0 from a `.cjs` cache;
- preserves `--check`/`-Check`, restore, backup, and failure exit behavior.

Parse the two tracked ZIP central directories and byte-compare each entry with its source file.

- [ ] **Step 2: Run the helper test and confirm the current dependencies fail**

Run: `bun tests/helpers-bun-only.mjs`

Expected: FAIL on npm path discovery, Node execution, curl/Invoke-WebRequest, and stale ZIP contents.

- [ ] **Step 3: Replace helper discovery and execution paths**

For Unix helpers, find Bun with `command -v bun` then `$HOME/.bun/bin/bun`; for PowerShell use `Get-Command bun` then `$env:USERPROFILE\.bun\bin\bun.exe`. Remove npm global-root probing and Node-specific default paths from automatic discovery. Search only the ClawGod bundle automatically; retain arbitrary explicit paths unchanged.

Write a temporary `.mjs` fetcher that downloads Acorn with Bun, applies the same proxy/NO_PROXY rules and five-redirect limit as the installers, atomically writes the fixed `.cjs` cache, and reports non-200 responses without printing proxy credentials. Execute each AST patch script with the resolved Bun binary. Preserve existing backup naming and return-code mapping.

- [ ] **Step 4: Add deterministic Bun-only ZIP generation**

Implement `scripts/rebuild-helper-zips.mjs` with a small ZIP writer using method 0 (stored), CRC-32, fixed DOS timestamp `1980-01-01 00:00:00`, UTF-8 filenames, local headers, central directory records, and EOCD. Generate exactly:

```js
await writeStoredZip('apply-claude-code-chrome-fix.zip', [
  'apply-claude-code-chrome-fix.ps1',
  'apply-claude-code-chrome-fix.sh',
]);
await writeStoredZip('apply-claude-code-computer-use-fix.zip', [
  'apply-claude-code-computer-use-fix.sh',
]);
```

Support `--check` by generating bytes in memory and comparing them with tracked files without writing.

- [ ] **Step 5: Rebuild and verify the tracked distributions**

Run:

```bash
bun scripts/rebuild-helper-zips.mjs
bun scripts/rebuild-helper-zips.mjs --check
bun tests/helpers-bun-only.mjs
```

Expected: all pass and `claude-browser-1.0.77-patched.zip` remains untouched.

- [ ] **Step 6: Run the focused helper patch regressions**

Run:

```bash
bun tests/patcher-chrome-socket.mjs
bun tests/patcher-context-limit.mjs
bun tests/patcher-worker-launch.mjs
```

Expected: all pass under Bun with check, patch, idempotence, and restore behavior intact.

- [ ] **Step 7: Commit helper migration and ZIPs**

```bash
git add apply-claude-code-chrome-fix.sh apply-claude-code-chrome-fix.ps1 apply-claude-code-computer-use-fix.sh apply-claude-code-context-limit-patch scripts/rebuild-helper-zips.mjs tests/helpers-bun-only.mjs apply-claude-code-chrome-fix.zip apply-claude-code-computer-use-fix.zip
git commit -m "refactor: run standalone patches with Bun"
```

---

### Task 6: Remove the Static Site and Close the Documentation Contract

**Files:**
- Create: `tests/bun-only-policy.mjs`
- Modify: `README.md:70-90,255-335`
- Modify: `README_EN.md:70-90,255-335`
- Modify: `README_JP.md:70-90,255-335`
- Modify: `AGENTS.md:5-35,74-150`
- Modify: `CLAUDE.md:5-35,74-150`
- Delete: `web/`
- Delete: `index.html`

**Interfaces:**
- Produces: one repository-wide policy test that distinguishes executable dependencies from allowed `node:` imports and `.node` filenames.
- Preserves: root `bypass.png` and all three README image references.

- [ ] **Step 1: Write the failing repository policy test**

Create `tests/bun-only-policy.mjs`. Use a fixed list of user-facing scripts, tests, workflows, and documentation plus filesystem existence checks so the test works before deletions are staged. Assert:

```js
assert.equal(existsSync(new URL('../index.html', import.meta.url)), false);
assert.equal(existsSync(new URL('../web', import.meta.url)), false);
assert.equal(existsSync(new URL('../bypass.png', import.meta.url)), true);
```

Scan shell, PowerShell, workflow, and README command surfaces for executable patterns such as `node <file>`, `node -e`, `npm pack`, `npm root`, `npm run`, `npx`, system-ripgrep prerequisite messages, and Node shebangs. Explicitly allow `node:` imports, `.node` native filenames, npm Registry prose/package names, and GitHub Actions' internal `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` setting.

- [ ] **Step 2: Run the policy test and confirm current site/docs fail**

Run: `bun tests/bun-only-policy.mjs`

Expected: FAIL on `web/`, root `index.html`, README Node/ripgrep prerequisites, npm test commands, and obsolete AGENTS/CLAUDE site sections.

- [ ] **Step 3: Delete the static site only**

Delete all tracked files under `web/` and root `index.html`. Do not delete or modify root `bypass.png`; do not touch `claude-browser-1.0.77-patched.zip`.

- [ ] **Step 4: Rewrite user documentation around the Bun-only contract**

In all three READMEs:

- list Bun 1.3.14+ as the sole installed runtime prerequisite;
- state that the installer downloads and verifies private ripgrep 15.2.0;
- remove Node/npm/system-ripgrep installation guidance;
- change test examples from `node "$test_file"` to `bun "$test_file"`;
- explain that Shell/PowerShell is the OS entry point, not another JavaScript runtime;
- preserve every feature, provider, Chrome, Computer Use, claude-mem, shared collaboration, `/peers`, update, and uninstall section.

In `AGENTS.md` and `CLAUDE.md`, remove Web/Vite/TypeScript sections and describe the two-part repository: self-contained installers/runtime patcher plus optional handbook. Correct platform package names to `@anthropic-ai/claude-code-<platform>` and document Bun-only CI.

- [ ] **Step 5: Run policy and README checks**

Run:

```bash
bun tests/bun-only-policy.mjs
rg -n 'bypass\.png' README.md README_EN.md README_JP.md
test ! -e web
test ! -e index.html
```

Expected: policy passes; each README still references `bypass.png`; neither deleted site path exists.

- [ ] **Step 6: Commit site removal and docs**

```bash
git add -A web index.html README.md README_EN.md README_JP.md AGENTS.md CLAUDE.md tests/bun-only-policy.mjs
git commit -m "docs: remove the static site and require only Bun"
```

---

### Task 7: Make CI Prove Bun-only Linux and Windows Installation

**Files:**
- Create: `tests/installer-e2e.mjs`
- Modify: `.github/workflows/compat-daily.yml`
- Delete: `.github/workflows/cache-cleanup-weekly.yml`
- Modify: `tests/bun-only-policy.mjs`

**Interfaces:**
- Produces: `tests/installer-e2e.mjs` with a temporary, validated home directory and forbidden dependency shims.
- Consumes: real npm Registry and GitHub ripgrep release downloads only when `CLAWGOD_E2E=1`.
- Produces: Linux daily/PR smoke and Windows PR/push/manual smoke without project-level Node/npm/rg setup.

- [ ] **Step 1: Write the isolated Unix end-to-end test**

Create `tests/installer-e2e.mjs` so it exits with a clear skip unless `CLAWGOD_E2E=1`. In enabled mode:

1. Create a temporary home with `mkdtempSync` and remove only that exact path in `finally`.
2. Create executable shims named `node`, `npm`, `rg`, `tar`, and `unzip` that print `forbidden dependency invoked: <name>` and exit 97.
3. Build `PATH` as `<shim-dir>:<directory-of-process.execPath>:/usr/bin:/bin`.
4. Write a temporary `.claude/settings.json` whose `env.CLAUDE_CODE_HARBOR_KITE` is `"1"`, then run `bash install.sh --lean-on` with the temporary `HOME` and no inherited provider credentials.
5. Assert `vendor/ripgrep/bin/rg --version` reports 15.2.0 and search a fixture file with that exact binary.
6. Run the installed `clawgod --version`, assert the Harbor Kite setting is byte-for-byte preserved, then run `bash install.sh --no-upgrade --lean-off` and assert it remains preserved.
7. Run `bash install.sh --uninstall` and assert the private ripgrep, wrapper, and generated installer helpers are removed without deleting the unrelated `.claude/settings.json`.
8. Fail immediately if output contains the forbidden-shim marker.

- [ ] **Step 2: Run the offline guard and policy tests first**

Run:

```bash
bun tests/installer-e2e.mjs
bun tests/bun-only-policy.mjs
```

Expected: the E2E test reports an explicit skip without network mutation; policy passes.

- [ ] **Step 3: Simplify the Linux compatibility job**

In `.github/workflows/compat-daily.yml`:

- remove `actions/setup-node`, npm cache, apt ripgrep installation, and Node version output;
- keep `oven-sh/setup-bun@v2` on canary;
- retain `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` with a comment that it controls GitHub-hosted Actions only;
- run every test with `bun`;
- run `CLAWGOD_E2E=1 bun tests/installer-e2e.mjs`;
- assert private ripgrep exists and no system-dependency shim was invoked;
- include all `tests/*.mjs`, helper scripts, and ZIP rebuild script in path filters.

- [ ] **Step 4: Add bounded Windows smoke coverage**

Add a `windows-smoke` job on pull requests, pushes, and manual dispatch, but skip it for the daily schedule to control runner cost. Use `windows-latest` plus `oven-sh/setup-bun@v2`. Set `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` to a runner-temp sandbox before invoking `install.ps1`.

Prepend `.cmd` shims for `node`, `npm`, `rg`, `tar`, and `unzip`, then run:

```powershell
& .\install.ps1 -LeanOn
& "$env:USERPROFILE\.clawgod\vendor\ripgrep\bin\rg.exe" --version
& "$env:USERPROFILE\.local\bin\clawgod.cmd" --version
& .\install.ps1 -NoUpgrade -LeanOff
& .\install.ps1 -Uninstall
```

Fail on any forbidden-shim marker and assert the private ripgrep directory is removed after uninstall.

- [ ] **Step 5: Delete obsolete npm cache cleanup**

Delete `.github/workflows/cache-cleanup-weekly.yml` and add a filesystem assertion to `tests/bun-only-policy.mjs` that it does not exist.

- [ ] **Step 6: Run local static and focused workflow checks**

Run:

```bash
bash -n install.sh
bun tests/bun-only-policy.mjs
bun tests/installer-bun-runtime.mjs
bun tests/installer-registry-download.mjs
bun tests/installer-ripgrep.mjs
bun tests/helpers-bun-only.mjs
```

Expected: all pass. Windows end-to-end execution is proven by the new Windows job; source parity tests cover PowerShell locally.

- [ ] **Step 7: Commit CI and end-to-end coverage**

```bash
git add .github/workflows/compat-daily.yml .github/workflows/cache-cleanup-weekly.yml tests/installer-e2e.mjs tests/bun-only-policy.mjs
git commit -m "ci: verify Bun-only installation"
```

---

### Task 8: Run Final Acceptance Without Touching the User Installation

**Files:**
- Verify: all changed files from Tasks 1-7
- Verify: `docs/superpowers/specs/2026-08-09-bun-only-installer-design.md`

**Interfaces:**
- Consumes: the complete Bun-only installer and regression suite.
- Produces: fresh evidence for the spec completion criteria; no release or remote mutation.

- [ ] **Step 1: Run formatting and syntax checks**

Run:

```bash
git diff --check main...HEAD
bash -n install.sh
if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command '$errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile("install.ps1",[ref]$null,[ref]$errors); if($errors.Count){$errors | ForEach-Object { Write-Error $_ }; exit 1}'
fi
```

Expected: zero whitespace or parser errors.

- [ ] **Step 2: Run the complete Bun suite**

Run:

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done
bun scripts/rebuild-helper-zips.mjs --check
```

Expected: every test passes and both tracked helper ZIPs match source.

- [ ] **Step 3: Run one networked install in a disposable home**

Run: `CLAWGOD_E2E=1 bun tests/installer-e2e.mjs`

Expected: full download, private ripgrep, patch, version, no-upgrade, lean toggle, and uninstall checks pass; the user's real `~/.clawgod`, launchers, settings, provider, browser state, and claude-mem state are untouched.

- [ ] **Step 4: Verify feature-preservation regressions explicitly**

Run:

```bash
bun tests/patcher-agents-chrome.mjs
bun tests/patcher-default-agents-view.mjs
bun tests/patcher-worker-launch.mjs
bun tests/patcher-chrome-socket.mjs
bun tests/patcher-context-limit.mjs
bun tests/patcher-claude-mem.mjs
bun tests/patcher-macos-paste.mjs
```

Expected: all pass, covering shared/agent flag propagation, Harbor Kite configuration preservation for `/peers`, worker launches, Chrome, Computer Use, context limit, claude-mem, and paste behavior. Do not claim a live interactive `/peers` rendering check unless a separate user-authorized real-profile smoke is run.

- [ ] **Step 5: Verify the repository dependency boundary**

Run:

```bash
bun tests/bun-only-policy.mjs
git ls-files 'web/**' index.html .github/workflows/cache-cleanup-weekly.yml
git status --short
```

Expected: policy passes; deleted paths print nothing; worktree contains no unexpected changes. Do not push, tag, publish, or release.
