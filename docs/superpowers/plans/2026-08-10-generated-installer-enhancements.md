# Generated Installers and Optional Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated embedded sources in `install.sh` and `install.ps1` with deterministic Bun-generated installers, then add a persisted, optionally interactive choice of 13 enhancements while preserving the current default behavior.

**Architecture:** Canonical shared JavaScript lives under `src/generic/`, platform lifecycle and launcher code live under `src/unix/` and `src/windows/`, and thin templates under `src/template/` are rendered by `build.mjs`. The checked-in installers remain the release artifacts. Enhancement selection is resolved once, persisted as strict JSON, and passed to both the patcher and managed plugin lifecycle.

**Tech Stack:** Bun 1.3.14+, JavaScript ES modules, POSIX shell, PowerShell, GitHub Actions, Bun's test runner primitives and `Bun.build`.

## Global Constraints

- [ ] Work only in `/Users/liangjiaquan/gitReposition/clawgod/.worktrees/bun-managed-plugins` on `codex/bun-managed-plugins`.
- [ ] Preserve the four retained Task 7 edits until Task 1 commits them; do not revert unrelated user changes.
- [ ] Use strict RED -> GREEN cycles. A test must fail for the intended missing behavior before production code changes.
- [ ] Never run `bash install.sh`, bare `claude`, or network E2E as a routine test. Use isolated temporary `HOME` and fixture-only `PATH` for executable tests.
- [ ] Keep `install.sh` and `install.ps1` committed, generated, deterministic release artifacts.
- [ ] Keep default installation behavior equivalent: no explicit choice means all enhancements are enabled.
- [ ] `curl | bash`, `irm | iex`, CI, and ordinary `claude update` must never force an interactive prompt.
- [ ] Use `apply_patch` for source edits and stage only the files named by each task.
- [ ] Run `git diff --check` before every task commit.

## Target Source Layout

```text
build.mjs
src/
  generic/
    enhancement-config.mjs
    enhancements.json
    features.json
    runtime/
      extractor.mjs
      post-processor.mjs
      repatcher.mjs
      wrapper.cjs
      fetch-file.mjs
      fetch-package.mjs
      install-ripgrep.mjs
      plugin-dependencies.mjs
      claude-hud-statusline.mjs
      openai-proxy.cjs
      claude-mem-compat.cjs
    patcher/
      entry.mjs
      core.mjs
      registry.mjs
      enhancements/
        chrome.mjs
        computer-use.mjs
        agents.mjs
        planning.mjs
        voice.mjs
        auto-mode.mjs
        unrestricted-tools.mjs
        paste-images.mjs
        privacy.mjs
        branding.mjs
  unix/
    launcher.sh
    lifecycle.sh
  windows/
    launcher.cmd
    lifecycle.ps1
  template/
    install.sh
    install.ps1
```

---

## Task 1: Close Retained Task 7 Policy and Release Gaps

**Files:**
- Modify: `.github/workflows/compat-daily.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/bun-only-policy.mjs`
- Modify: `tests/installer-e2e-contract.mjs`
- Modify: `tests/installer-e2e.mjs`

- [ ] **Step 1: Re-run the retained focused tests and record the current boundary failure**

Run:

```bash
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E bun tests/bun-only-policy.mjs
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E bun tests/installer-e2e-contract.mjs
```

Expected: retained Task 7 behavior passes, while repository-wide workflow scanning still identifies the two `git log` commands in `release.yml` as the unresolved scope gap.

- [ ] **Step 2: Tighten the policy fixtures before editing the workflow**

Add explicit forbidden cases for logging followed by `git`, mixed-case `Git.Exe` and `Node.Exe`, absolute Git paths, wrapped Git commands, and `Start-Process` downloaders. Make the existing `badge-publish` exception terminate at the exact workflow step boundary and reject the same commands in every other step and workflow.

Run:

```bash
bun tests/bun-only-policy.mjs
```

Expected: FAIL on the existing `release.yml` system-Git calls.

- [ ] **Step 3: Replace release-note Git calls with the GitHub API**

Use `actions/github-script@v7` and write `release-notes.md` without launching system Git:

```yaml
- name: Build release notes without system Git
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('node:fs');
      const owner = context.repo.owner;
      const repo = context.repo.repo;
      const currentTag = context.ref.replace('refs/tags/', '');
      const { data: tags } = await github.rest.repos.listTags({ owner, repo, per_page: 100 });
      const index = tags.findIndex((entry) => entry.name === currentTag);
      const previousTag = index >= 0 ? tags[index + 1]?.name : undefined;
      let commits;
      if (previousTag) {
        const comparison = await github.rest.repos.compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${previousTag}...${currentTag}`,
          per_page: 100,
        });
        commits = comparison.data.commits;
      } else {
        const history = await github.rest.repos.listCommits({ owner, repo, sha: currentTag, per_page: 100 });
        commits = history.data;
      }
      const lines = commits.map((entry) => `- ${entry.commit.message.split('\n')[0]} (${entry.sha.slice(0, 7)})`);
      fs.writeFileSync('release-notes.md', `${lines.join('\n')}\n`, 'utf8');
```

- [ ] **Step 4: Verify and commit the retained scope**

Run:

```bash
bun tests/bun-only-policy.mjs
bun tests/installer-e2e-contract.mjs
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E bun tests/installer-e2e.mjs
bun -e "for (const file of ['.github/workflows/compat-daily.yml','.github/workflows/release.yml']) Bun.YAML.parse(await Bun.file(file).text())"
git diff --check
```

Expected: PASS; offline E2E skips before mutation.

Commit:

```bash
git add .github/workflows/compat-daily.yml .github/workflows/release.yml tests/bun-only-policy.mjs tests/installer-e2e-contract.mjs tests/installer-e2e.mjs
git commit -m "test: close plugin acceptance policy gaps"
```

---

## Task 2: Add the Deterministic Installer Renderer

**Files:**
- Create: `build.mjs`
- Create: `src/template/install.sh`
- Create: `src/template/install.ps1`
- Create: `src/generic/features.json`
- Create: `tests/installer-build.mjs`
- Modify: `install.sh`
- Modify: `install.ps1`

- [ ] **Step 1: Write the failing build-contract test**

Test these exported contracts and CLI behaviors:

```js
export const GENERATED_HEADER = 'GENERATED FILE - edit src/ and run: bun build.mjs';
export const OUTPUTS = Object.freeze([
  Object.freeze({ template: 'src/template/install.sh', output: 'install.sh', mode: 0o755 }),
  Object.freeze({ template: 'src/template/install.ps1', output: 'install.ps1', mode: 0o644 }),
]);
export function placeholder(name) { return `@@CLAWGOD_${name}@@`; }
```

Require `renderTemplate()` to replace every declared placeholder exactly once and reject missing, duplicate, and undeclared placeholders. Require `writeGeneratedPair()` to publish both outputs atomically and restore both originals if either write or rename fails. Require `bun build.mjs --check` to make no writes and fail on stale output.

Run:

```bash
bun tests/installer-build.mjs
```

Expected: FAIL because `build.mjs` and templates do not exist.

- [ ] **Step 2: Implement the minimal renderer using one extracted asset**

Move only the embedded `features.json` bytes into `src/generic/features.json`. Replace their two generated locations with `@@CLAWGOD_FEATURES_JSON@@`. Prefix both outputs with the generated-file header. Preserve Unix executable mode and use same-directory temporary files plus rollback for paired publication.

- [ ] **Step 3: Prove deterministic, atomic generation**

Run:

```bash
bun build.mjs
build_snapshot=$(mktemp -d)
cp install.sh install.ps1 "$build_snapshot/"
bun build.mjs
cmp "$build_snapshot/install.sh" install.sh
cmp "$build_snapshot/install.ps1" install.ps1
rm -rf "$build_snapshot"
bun build.mjs --check
bun tests/installer-build.mjs
bash -n install.sh
git diff --check
```

Expected: all PASS and a second build produces no diff.

Commit:

```bash
git add build.mjs src/template/install.sh src/template/install.ps1 src/generic/features.json tests/installer-build.mjs install.sh install.ps1
git commit -m "build: generate installer assets with Bun"
```

---

## Task 3: Extract Download, Archive, and Native Runtime Modules

**Files:**
- Create: `src/generic/runtime/fetch-file.mjs`
- Create: `src/generic/runtime/fetch-package.mjs`
- Create: `src/generic/runtime/install-ripgrep.mjs`
- Create: `src/generic/runtime/extractor.mjs`
- Create: `src/generic/runtime/post-processor.mjs`
- Create: `src/generic/runtime/repatcher.mjs`
- Modify: `build.mjs`
- Modify: `src/template/install.sh`
- Modify: `src/template/install.ps1`
- Modify: runtime-focused tests
- Regenerate: `install.sh`
- Regenerate: `install.ps1`

- [ ] **Step 1: Convert runtime tests to import canonical sources**

Update `tests/installer-registry-download.mjs`, `tests/installer-ripgrep.mjs`, native extractor/post-processor tests, and repatcher tests to import the new source modules directly. Keep one assertion per module proving the generated installer embeds the exact rendered source bytes.

Run the affected tests and record RED because the canonical modules are missing.

- [ ] **Step 2: Move source bytes without behavior changes**

Extract each module byte-for-byte from the Unix generator body, normalize only the outer here-document/PowerShell quoting layer, and render the same canonical source into both platform templates. Do not refactor internal algorithms in this task.

- [ ] **Step 3: Verify direct behavior and generated parity**

Run:

```bash
bun build.mjs
bun build.mjs --check
bun tests/installer-registry-download.mjs
bun tests/installer-ripgrep.mjs
bun tests/installer-bun-runtime.mjs
bash -n install.sh
git diff --check
```

Expected: PASS, with Unix and PowerShell rendering the same canonical JavaScript bodies.

Commit:

```bash
git add build.mjs src/generic/runtime src/template/install.sh src/template/install.ps1 install.sh install.ps1 tests/installer-registry-download.mjs tests/installer-ripgrep.mjs tests/installer-bun-runtime.mjs
git commit -m "refactor: extract installer runtime modules"
```

---

## Task 4: Extract Wrapper, Proxy, Compatibility, and Plugin Modules

**Files:**
- Create: `src/generic/runtime/wrapper.cjs`
- Create: `src/generic/runtime/openai-proxy.cjs`
- Create: `src/generic/runtime/claude-mem-compat.cjs`
- Create: `src/generic/runtime/plugin-dependencies.mjs`
- Create: `src/generic/runtime/claude-hud-statusline.mjs`
- Modify: `build.mjs`
- Modify: `src/template/install.sh`
- Modify: `src/template/install.ps1`
- Modify: plugin, worker, wrapper, and claude-mem tests
- Regenerate: `install.sh`
- Regenerate: `install.ps1`

- [ ] **Step 1: Add canonical-source imports and parity assertions**

Make tests execute the canonical modules directly. Keep generated-artifact assertions limited to placeholder completeness, exact source embedding, and platform lifecycle ordering. Add a nested renderer token for the HUD runner:

```text
@@CLAWGOD_HUD_STATUSLINE_SOURCE_JSON@@
```

Run the focused tests and record RED because the sources are not yet present.

- [ ] **Step 2: Extract the shared sources unchanged**

Preserve the current HUD ANSI bytes, direct Bun status-line command, plugin archive verification, claude-mem ownership state, proxy behavior, PATH re-exec, and wrapper argument forwarding. The renderer must resolve nested assets before inserting `plugin-dependencies.mjs`.

- [ ] **Step 3: Verify shared behavior and both rendered installers**

Run:

```bash
bun build.mjs
bun build.mjs --check
bun tests/installer-plugin-dependencies.mjs
bun tests/patcher-claude-mem.mjs
bun tests/patcher-worker-launch.mjs
bun tests/installer-bun-runtime.mjs
bash -n install.sh
git diff --check
```

Expected: PASS and the HUD golden bytes remain unchanged.

Commit:

```bash
git add build.mjs src/generic/runtime src/template/install.sh src/template/install.ps1 install.sh install.ps1 tests/installer-plugin-dependencies.mjs tests/patcher-claude-mem.mjs tests/patcher-worker-launch.mjs tests/installer-bun-runtime.mjs
git commit -m "refactor: extract shared wrapper and plugin modules"
```

---

## Task 5: Extract the Monolithic Patcher as a Canonical Module

**Files:**
- Create: `src/generic/patcher/entry.mjs`
- Modify: `build.mjs`
- Modify: `src/template/install.sh`
- Modify: `src/template/install.ps1`
- Modify: patcher-focused tests
- Regenerate: `install.sh`
- Regenerate: `install.ps1`

- [ ] **Step 1: Point patcher behavior tests at the canonical entrypoint**

Add direct execution fixtures for normal, dry-run, verify, already-applied, mandatory failure, update redirect, worker launch, Chrome, Computer Use, Agent Teams, planning, voice, auto mode, permissions, paste images, privacy, and branding. Snapshot the default-all patched output bytes for representative fixtures.

Run the focused patcher tests and record RED because the canonical entrypoint is absent.

- [ ] **Step 2: Extract the patcher without splitting its internals yet**

Move the complete existing generated patcher into `src/generic/patcher/entry.mjs`. Render it into both installers from one source. Keep summary counts, failure exit codes, backup rules, source-version handling, and patch order unchanged.

- [ ] **Step 3: Prove structural equivalence**

Run:

```bash
bun build.mjs
bun build.mjs --check
for test_file in tests/patcher-*.mjs; do bun "$test_file" || exit 1; done
bun tests/installer-bun-runtime.mjs
bash -n install.sh
git diff --check
```

Expected: PASS; the default-all fixture fingerprints match the pre-extraction baseline.

Commit:

```bash
git add build.mjs src/generic/patcher/entry.mjs src/template/install.sh src/template/install.ps1 install.sh install.ps1 tests/patcher-*.mjs tests/installer-bun-runtime.mjs
git commit -m "refactor: make the patcher a canonical source module"
```

---

## Task 6: Split Core and Enhancement Patch Registries

**Files:**
- Create: `src/generic/enhancements.json`
- Create: `src/generic/patcher/core.mjs`
- Create: `src/generic/patcher/registry.mjs`
- Create: `src/generic/patcher/enhancements/chrome.mjs`
- Create: `src/generic/patcher/enhancements/computer-use.mjs`
- Create: `src/generic/patcher/enhancements/agents.mjs`
- Create: `src/generic/patcher/enhancements/planning.mjs`
- Create: `src/generic/patcher/enhancements/voice.mjs`
- Create: `src/generic/patcher/enhancements/auto-mode.mjs`
- Create: `src/generic/patcher/enhancements/unrestricted-tools.mjs`
- Create: `src/generic/patcher/enhancements/paste-images.mjs`
- Create: `src/generic/patcher/enhancements/privacy.mjs`
- Create: `src/generic/patcher/enhancements/branding.mjs`
- Modify: `src/generic/patcher/entry.mjs`
- Modify: `build.mjs`
- Modify: patcher-focused tests

- [ ] **Step 1: Lock the stable manifest and ownership map in tests**

Require this exact manifest shape and order:

```json
[
  { "id": "chrome", "kind": "patch" },
  { "id": "computer-use", "kind": "patch" },
  { "id": "agents", "kind": "patch" },
  { "id": "planning", "kind": "patch" },
  { "id": "voice", "kind": "patch" },
  { "id": "auto-mode", "kind": "patch" },
  { "id": "unrestricted-tools", "kind": "patch" },
  { "id": "paste-images", "kind": "patch" },
  { "id": "privacy", "kind": "patch" },
  { "id": "branding", "kind": "patch" },
  { "id": "claude-hud", "kind": "plugin" },
  { "id": "claude-mem", "kind": "plugin" },
  { "id": "superpowers", "kind": "plugin" }
]
```

Require every patch descriptor to belong to exactly one core or enhancement registry. Keep USER_TYPE, the plain-Bun worker resolver, GrowthBook, update redirect, context limits, source/version verification, and shell integration in core. Require `agents` to expose its default Agents view only when `chrome` is also enabled.

Run patcher tests and record RED because registries do not exist.

- [ ] **Step 2: Split descriptors while preserving default-all ordering**

Move descriptors and their helper functions into the named modules. Plugin-only groups have no patch descriptors. Build the self-contained generated patcher using Bun:

```js
const result = await Bun.build({
  entrypoints: [join(root, 'src/generic/patcher/entry.mjs')],
  target: 'bun',
  format: 'esm',
  minify: false,
  sourcemap: 'none',
  splitting: false,
});
```

Fail the build on warnings, multiple outputs, unresolved imports, or a non-deterministic bundle.

- [ ] **Step 3: Verify default-all byte equivalence**

Run all patcher-focused tests twice: once against the canonical module graph and once against the generated bundle. The representative patched output fingerprints must remain unchanged.

Commit:

```bash
git add build.mjs src/generic/enhancements.json src/generic/patcher install.sh install.ps1 tests/patcher-*.mjs
git commit -m "refactor: group patcher capabilities by enhancement"
```

---

## Task 7: Add the Shared Enhancement Configuration Engine

**Files:**
- Create: `src/generic/enhancement-config.mjs`
- Create: `tests/enhancement-config.mjs`
- Modify: `src/generic/enhancements.json`
- Modify: `build.mjs`

- [ ] **Step 1: Write strict resolution and persistence tests**

Cover this truth table:

```js
const cases = [
  ['missing defaults to all', {}, { mode: 'all', enabled: EXPECTED_IDS }],
  ['saved all includes future IDs', { stored: { schemaVersion: 1, mode: 'all', enabled: [] } }, { mode: 'all', enabled: EXPECTED_IDS }],
  ['custom keeps only saved order', { stored: { schemaVersion: 1, mode: 'custom', enabled: ['branding', 'chrome'] } }, { mode: 'custom', enabled: ['chrome', 'branding'] }],
  ['explicit overrides saved', { explicit: 'computer-use,chrome', stored: { schemaVersion: 1, mode: 'custom', enabled: ['branding'] } }, { mode: 'custom', enabled: ['chrome', 'computer-use'] }],
  ['explicit none means core only', { explicit: 'none' }, { mode: 'custom', enabled: [] }],
];
```

Reject unknown keys, duplicate IDs, unsafe filenames, wrong schema/type/mode, non-canonical JSON, symlink/hardlink leaves, unsafe ancestors, mode drift, and concurrent replacement. Require atomic same-directory persistence to `~/.clawgod/enhancements.json` with schema:

```json
{ "schemaVersion": 1, "mode": "all", "enabled": [] }
```

Run:

```bash
bun tests/enhancement-config.mjs
```

Expected: FAIL because the engine is missing.

- [ ] **Step 2: Implement pure parsing first, then guarded persistence**

Export manifest loading, selection normalization, stored-config validation, explicit selection parsing, effective-set resolution, and atomic write helpers. `mode: "all"` always expands from the current manifest, so future enhancement IDs are enabled automatically. `mode: "custom"` enables only listed current IDs.

- [ ] **Step 3: Verify the security and precedence matrix**

Run:

```bash
bun tests/enhancement-config.mjs
bun build.mjs --check
git diff --check
```

Commit:

```bash
git add src/generic/enhancement-config.mjs src/generic/enhancements.json tests/enhancement-config.mjs build.mjs
git commit -m "feat: add persisted enhancement selection"
```

---

## Task 8: Add Explicit Platform Interaction and Selection Flags

**Files:**
- Create: `src/unix/lifecycle.sh`
- Create: `src/unix/launcher.sh`
- Create: `src/windows/lifecycle.ps1`
- Create: `src/windows/launcher.cmd`
- Modify: `src/template/install.sh`
- Modify: `src/template/install.ps1`
- Modify: `build.mjs`
- Create: `tests/installer-enhancement-selection.mjs`
- Modify: `tests/installer-bun-runtime.mjs`

- [ ] **Step 1: Write executable interaction tests**

Cover Unix `--enhancements <csv>` and `--choose-enhancements`, plus PowerShell `-Enhancements <csv>` and `-ChooseEnhancements`. Feed isolated prompt streams for Enter/all, `1,2`, `n`, `n,a`, and invalid `99` followed by a valid choice. Assert exact config bytes and no unrelated files.

Also prove:

- direct local installer + explicit choose flag uses `/dev/tty` or `Read-Host`;
- piped stdin, CI, and non-TTY contexts never prompt unless explicitly requested;
- explicit choose without a TTY prints one warning and falls back to the saved config, or all when none exists;
- ordinary install without a choice uses saved config, else all;
- `claude update` never adds the choose flag and never prompts.

Run and record RED because platform selection code is absent.

- [ ] **Step 2: Extract lifecycle and launcher templates before adding prompts**

Move platform-only code from the installer templates into the four source files and render it back unchanged. Verify generated equivalence, then implement the new flags and prompt renderer. The visible list must use the manifest order and stable IDs, with concise Chinese/English-neutral labels suitable for both shells.

- [ ] **Step 3: Verify interaction and no-interaction boundaries**

Run:

```bash
bun tests/installer-enhancement-selection.mjs
bun tests/installer-bun-runtime.mjs
bun tests/patcher-update-bun-only.mjs
bun build.mjs --check
bash -n install.sh
git diff --check
```

Commit:

```bash
git add build.mjs src/unix src/windows src/template/install.sh src/template/install.ps1 tests/installer-enhancement-selection.mjs tests/installer-bun-runtime.mjs tests/patcher-update-bun-only.mjs install.sh install.ps1
git commit -m "feat: add interactive enhancement selection"
```

---

## Task 9: Apply the Saved Selection to Patch, Repatch, and Update

**Files:**
- Modify: `src/generic/patcher/entry.mjs`
- Modify: `src/generic/patcher/registry.mjs`
- Modify: `src/generic/runtime/repatcher.mjs`
- Modify: `src/unix/lifecycle.sh`
- Modify: `src/windows/lifecycle.ps1`
- Modify: patcher and update tests
- Regenerate: `install.sh`
- Regenerate: `install.ps1`

- [ ] **Step 1: Add selection-aware patcher tests**

Add `--enhancements-file <path>` and test all, a representative subset, `agents` without `chrome`, and `none`/core-only. Assert disabled descriptors are neither searched nor counted as skipped/failed. Assert the default-all output fingerprint is unchanged. Require a stable summary:

```text
Enhancements: <enabled> enabled, <disabled> disabled
```

Run and record RED because the patcher ignores selection.

- [ ] **Step 2: Filter descriptors only after strict config resolution**

Resolve the manifest/config once at patcher startup, preserve core descriptor order, then append enabled enhancement descriptors in manifest order. Repatch and update must pass the same persisted file. An enabled mandatory patch failure must keep the prior installed runtime and return nonzero; disabled patches cannot fail the install.

- [ ] **Step 3: Prove update inheritance**

Use isolated real-branch harnesses for default latest, explicit Claude version, and `--no-upgrade`. Each path must reuse the saved enhancement config without prompting. Changing Claude version must not alter the enhancement file.

Run:

```bash
for test_file in tests/patcher-*.mjs; do bun "$test_file" || exit 1; done
bun tests/patcher-update-bun-only.mjs
bun tests/installer-enhancement-selection.mjs
bun build.mjs --check
git diff --check
```

Commit:

```bash
git add src/generic/patcher src/generic/runtime/repatcher.mjs src/unix src/windows tests/patcher-*.mjs tests/installer-enhancement-selection.mjs install.sh install.ps1
git commit -m "feat: apply saved enhancement selection to patches"
```

---

## Task 10: Apply Selection to Managed Plugin Enhancements

**Files:**
- Modify: `src/generic/runtime/plugin-dependencies.mjs`
- Modify: `src/generic/runtime/claude-mem-compat.cjs`
- Modify: `src/generic/runtime/claude-hud-statusline.mjs`
- Modify: `src/unix/lifecycle.sh`
- Modify: `src/windows/lifecycle.ps1`
- Modify: `tests/installer-plugin-dependencies.mjs`
- Modify: `tests/patcher-claude-mem.mjs`
- Modify: lifecycle tests

- [ ] **Step 1: Write the plugin selection matrix**

Execute the canonical plugin module with all enhancements, HUD only, and none. Assert:

| Selection | claude-hud | claude-mem | superpowers |
| --- | --- | --- | --- |
| all | ready | ready | ready |
| HUD only | ready | disabled/restored | disabled/retained |
| none | disabled/restored | disabled/restored | disabled/retained |

Require the exact summary:

```text
Optional plugins: <ready> ready, <disabled> disabled, <warnings> warnings
```

`superpowers` deselection must stop management without deleting the user's installed plugin. HUD and claude-mem deselection must restore only fields still owned by ClawGod, preserving any concurrent/user replacement. Uninstall must ignore current selection and restore every valid ownership record.

Run and record RED because plugin lifecycle ignores enhancement selection.

- [ ] **Step 2: Feed the same strict selection into plugin orchestration**

Resolve selection before any fetch, staging, plugin CLI, HUD, claude-mem, or ownership mutation. Disabled plugins must perform no network/cache install work. Keep warning isolation: one optional plugin failure does not block other enabled plugins, while ownership restoration failures remain fail-closed and retain evidence.

- [ ] **Step 3: Verify ownership, rollback, and summaries**

Run:

```bash
bun tests/installer-plugin-dependencies.mjs
bun tests/patcher-claude-mem.mjs
bun tests/installer-enhancement-selection.mjs
bun tests/installer-bun-runtime.mjs
bun build.mjs --check
git diff --check
```

Commit:

```bash
git add src/generic/runtime/plugin-dependencies.mjs src/generic/runtime/claude-mem-compat.cjs src/generic/runtime/claude-hud-statusline.mjs src/unix src/windows tests/installer-plugin-dependencies.mjs tests/patcher-claude-mem.mjs tests/installer-enhancement-selection.mjs tests/installer-bun-runtime.mjs install.sh install.ps1
git commit -m "feat: manage optional plugins by enhancement selection"
```

---

## Task 11: Make Tests Source-First and Enforce Generated-File Policy

**Files:**
- Modify: `tests/*.mjs`
- Modify: `tests/bun-only-policy.mjs`
- Modify: `AGENTS.md`
- Modify: `build.mjs`

- [ ] **Step 1: Add a failing policy for generated-installer reverse extraction**

Only these tests may inspect root generated installers directly:

```js
const GENERATED_INSTALLER_CONTRACT_TESTS = new Set([
  'installer-build.mjs',
  'installer-bun-runtime.mjs',
  'installer-e2e.mjs',
  'installer-e2e-contract.mjs',
]);
```

All other behavior tests must import or execute canonical files under `src/`. Add policy fixtures proving new source files, templates, and `build.mjs` are scanned for forbidden Node/npm/system-ripgrep/system-Git/curl-wget product dependencies.

Run policy and record RED on remaining reverse-extraction tests.

- [ ] **Step 2: Migrate every behavior test to canonical sources**

Replace embedded-body slicing with direct imports, fixture copies, or `Bun.build` output. Keep platform template tests only for shell/PowerShell ordering, quoting, flags, and lifecycle entrypoints. Do not weaken existing security/race/archive/rollback assertions.

- [ ] **Step 3: Document the contributor build contract**

Update `AGENTS.md` with:

```bash
bun build.mjs
bun build.mjs --check
```

State that `src/` is canonical and root installers must never be edited by hand.

- [ ] **Step 4: Run the complete offline suite**

```bash
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E -u CLAWGOD_INSTALL_E2E -u CLAWGOD_WINDOWS_INSTALL_E2E \
  zsh -c 'for test_file in tests/*.mjs; do bun "$test_file" || exit 1; done'
bun build.mjs --check
bash -n install.sh
git diff --check
```

Expected: all tests PASS; network E2E skips before mutation.

Commit:

```bash
git add tests AGENTS.md build.mjs
git commit -m "test: verify canonical installer sources directly"
```

---

## Task 12: Update Documentation, CI, Release, and E2E Contracts

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.zh-TW.md`
- Modify: `AGENTS.md`
- Modify: `.github/workflows/compat-daily.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/installer-e2e.mjs`
- Modify: `tests/installer-e2e-contract.mjs`
- Modify: `tests/bun-only-policy.mjs`

- [ ] **Step 1: Add failing documentation and workflow contracts**

Require all three READMEs to explain:

- all 13 stable enhancement IDs;
- default all-enabled behavior;
- direct local interactive selection commands;
- non-interactive `--enhancements`/`-Enhancements` commands;
- saved `~/.clawgod/enhancements.json` semantics;
- `claude update` reuses selection and never prompts;
- disabling HUD/claude-mem restores owned configuration, while disabling Superpowers does not delete the user's plugin;
- `src/` is canonical and installers are generated release artifacts.

Require both workflows to run `bun build.mjs --check`, and release to upload only fresh generated installers.

Run policy/contracts and record RED on old docs/workflows.

- [ ] **Step 2: Update docs and workflow gates**

Use ordinary user-facing Chinese/English wording and preserve current Chrome, Computer Use, Agent Teams, GrowthBook, Auto-mode, Ultraplan, Ultrareview, provider, update, uninstall, HUD, claude-mem, and Superpowers documentation. Do not expose renderer internals in end-user installation instructions.

- [ ] **Step 3: Extend E2E contracts without forcing prompts**

Add three isolated modes to Unix and Windows CI contracts:

1. default all-enabled install;
2. explicit representative subset;
3. explicit `none`/core-only.

Assert config bytes, patch summary, plugin summary, HUD/claude-mem restore behavior, update inheritance, no prompt marker, generated build freshness, uninstall cleanup, and unchanged real-home fingerprints. CI must pass selection flags explicitly for non-default cases.

- [ ] **Step 4: Verify docs, YAML, policy, and offline contracts**

```bash
bun tests/bun-only-policy.mjs
bun tests/installer-e2e-contract.mjs
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E bun tests/installer-e2e.mjs
bun -e "for (const file of ['.github/workflows/compat-daily.yml','.github/workflows/release.yml']) Bun.YAML.parse(await Bun.file(file).text())"
bun build.mjs --check
git diff --check
```

Commit:

```bash
git add README.md README.zh-CN.md README.zh-TW.md AGENTS.md .github/workflows/compat-daily.yml .github/workflows/release.yml tests/installer-e2e.mjs tests/installer-e2e-contract.mjs tests/bun-only-policy.mjs build.mjs install.sh install.ps1
git commit -m "docs: explain generated installers and enhancements"
```

---

## Task 13: Final Acceptance, Review, and Local Integration

**Files:**
- Verify: entire repository
- Write: ignored task report under `.superpowers/sdd/2026-08-10-generated-installer-enhancements/`

- [ ] **Step 1: Verify repository and generated state from zero**

```bash
git status --short
bun --version
bun build.mjs
git diff --exit-code -- install.sh install.ps1
bun build.mjs --check
env -u CLAWGOD_E2E -u CLAWGOD_PLUGIN_E2E -u CLAWGOD_INSTALL_E2E -u CLAWGOD_WINDOWS_INSTALL_E2E \
  zsh -c 'for test_file in tests/*.mjs; do bun "$test_file" || exit 1; done'
bun scripts/rebuild-helper-zips.mjs --check
bash -n install.sh
bash -n apply-claude-code-chrome-fix.sh
bash -n apply-computer-use-fix.sh
bash -n apply-context-window-fix.sh
git diff --check
```

Expected: clean generated output and all offline tests PASS.

- [ ] **Step 2: Perform independent code review**

Review the complete branch against the approved design, specifically checking:

- generated-pair atomicity and deterministic bytes;
- no duplicated canonical JavaScript between platform sources;
- default-all backward compatibility;
- prompt boundary for direct local installs only;
- strict config schema and concurrent replacement behavior;
- update/repatch selection inheritance;
- plugin restore/uninstall ownership safety;
- Bun-only runtime, download, and statusLine behavior;
- release artifacts rebuilt before upload.

Fix every Critical and Important finding with a new RED -> GREEN cycle, then rerun Step 1.

- [ ] **Step 3: Run the explicitly authorized isolated network E2E**

Before running, fingerprint the real paths already protected by `tests/installer-e2e.mjs`. Confirm its temporary `HOME`, private Bun symlink, fixture-only `PATH`, and unresolved/sandboxed `claude` marker. Then run only:

```bash
CLAWGOD_E2E=1 bun tests/installer-e2e.mjs
```

Expected: default-all install/update/uninstall passes; real-home fingerprints are byte/type/link/mode/time/inode identical before and after; the temporary E2E root is removed. Do not run a bare installer or bare `claude`.

- [ ] **Step 4: Record residual platform limits**

If native `pwsh` is unavailable, state that Windows behavior was verified by paired generated source, Bun-executed shared modules, YAML/static contracts, and Windows CI remains the native acceptance gate. Do not claim native PowerShell execution occurred.

- [ ] **Step 5: Finish the branch and merge locally only after approval**

Use `superpowers:finishing-a-development-branch`. Show the final commit range and verification evidence. Merge `codex/bun-managed-plugins` into local `main` only when the user confirms. Do not push, tag, publish a release, or modify remote state.

## Plan Self-Review Checklist

- [ ] Every production behavior change has a failing test first.
- [ ] Every task names its source, test, generated, and commit boundaries.
- [ ] The 13 enhancement IDs and patch/plugin ownership are stable and complete.
- [ ] Default install remains all-enabled, including future enhancements in `mode: all`.
- [ ] Explicit selection overrides saved selection; saved selection overrides the default.
- [ ] Piped installs, CI, and `claude update` do not force interaction.
- [ ] HUD statusLine remains byte-identical and invokes Bun directly.
- [ ] Disabled integrations preserve user-owned replacements and uninstall restores all valid ownership records.
- [ ] Root installers are deterministic outputs and release workflow checks freshness.
- [ ] Final acceptance protects the user's real HOME and does not push or release.
