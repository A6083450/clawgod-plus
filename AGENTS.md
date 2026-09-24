# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Common Commands

### Bun tests and compatibility checks

Bun 1.3.14 or newer is the only installed JavaScript runtime required by this repository. Run focused checks with Bun:

```bash
bun tests/bun-only-policy.mjs
bun tests/installer-bun-runtime.mjs
bun tests/installer-ripgrep.mjs
bun tests/installer-plugin-dependencies.mjs
```

Run the complete local regression set without installing ClawGod Plus:

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done

bash -n dist/unix/install.sh
git diff --check
```

The compatibility workflow in `.github/workflows/compat-daily.yml` runs the Unix installer end-to-end and smoke-tests the generated command. Do not use `bash dist/unix/install.sh` as a casual local test: it writes to `~/.clawgod`, backs up and replaces the `claude` command, and creates `clawgod` launchers.

The Bun-only CI compatibility workflow runs Linux x64 and macOS 26 ARM64 on schedule and relevant changes; Windows is change-driven only. GitHub Actions run native Node.js 24 actions, which are not a product runtime dependency.

The Windows lifecycle assertions run in GitHub Actions with PowerShell JSON APIs and Bun. Do not describe them as locally native-verified when `pwsh` is unavailable on the current machine.

### Generated installer build

`dist/unix/install.sh` and `dist/win/install.ps1` are deterministic generated release artifacts. `src/` is the canonical source of truth: shared JavaScript lives under `src/generic/`, platform lifecycle and launcher code under `src/unix/` and `src/windows/`, and thin templates under `src/template/`. The generated installers must never be edited by hand — regenerate and verify them with:

```bash
bun build.mjs
bun build.mjs --check
```

`bun build.mjs --check` fails when the checked-in installers are stale relative to `src/`.

### Installer usage

README-documented user install commands:

```bash
curl -fsSL https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh | bash
```

```powershell
irm https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1 | iex
```

Shell and PowerShell are operating-system command entry points, not JavaScript runtimes. The installer runs with Bun and privately installs and verifies ripgrep 15.2.0; users do not need a system ripgrep.

Useful local installer options:

```bash
bash dist/unix/install.sh --version <version>
bash dist/unix/install.sh --uninstall
```

Windows uninstall:

```powershell
.\dist\win\install.ps1 -Uninstall
```

`claude update` routes through the ClawGod Plus installer, fetches the requested Anthropic Claude Code package from the npm Registry, re-extracts and re-patches it, then rewrites the launchers.

### Enhancement selection

ClawGod Plus resolves a persisted, optionally interactive choice of 21 enhancements. The stable IDs, in manifest order, are `chrome`, `computer-use`, `design-canvas`, `agents`, `planning`, `voice`, `auto-mode`, `unrestricted-tools`, `paste-images`, `privacy`, `branding`, `classifier-fail-open`, `cleanup-period`, `disable-collapse-read-search`, `enable-keybindings`, `file-read-limit`, `transcript-dialog-replay`, `unlock-ultracode` (patches), then `claude-hud`, `claude-mem`, `superpowers` (plugins). Selection is persisted as strict JSON at `~/.clawgod/enhancements.json` with the schema `{ "schemaVersion": 1, "mode": "all" | "custom", "enabled": [...] }`.

Direct local installers accept `--enhancements <csv>` / `--choose-enhancements` (Unix) and `-Enhancements <csv>` / `-ChooseEnhancements` (PowerShell). Running the installer directly in a terminal auto-prompts a quick choice (all / core-only / custom menu) via stdin-TTY detection; the menus are key-driven (`↑`/`↓` move, `Space` toggles, `Enter` confirms, `Esc` returns to the parent menu and cancels the install at the top level); piped installs, CI, and `claude update` never prompt (the update patch marks its installer spawn with `CLAWGOD_NONINTERACTIVE=1`) and reuse the saved selection, defaulting to all enhancements. Disabling `claude-hud` or `claude-mem` restores the configuration ClawGod owns, while disabling `superpowers` never deletes the user's installed plugin.

The user restored upstream Cometix ASR under the existing `voice` enhancement. Preserve the original adapter; only adapt ClawGod vendor paths and newer command/transport availability checks. The installer fetches commit-pinned, SHA-256-checked native files on supported platforms and validates Bun loading only. Never record audio or call the native startSession/ensureDid as an installation smoke test. This is network-backed ASR, not offline transcription. `CLAUDE_CODE_ASR=0` or the `voice-asr-backend` runtime switch disables this transport; do not modify unrelated account/compliance checks.

## Project Architecture

ClawGod Plus is an installer-driven runtime patch project for official Claude Code, not a conventional application library. The repository has two parts:

1. **Self-contained installers and runtime patcher**
   - `dist/unix/install.sh` and `dist/win/install.ps1` are the primary product entry points, generated by `bun build.mjs` from canonical sources under `src/`; the generated installers are never edited by hand.
   - They fetch the platform-specific official `@anthropic-ai/claude-code-<platform>` package from the npm Registry, extract the embedded JavaScript entrypoint and native `.node` modules from the Bun standalone binary, post-process the extracted code, apply patches, and write launchers for `claude` and `clawgod`.
   - Most runtime files are generated during installation under `~/.clawgod`, including `cli.cjs`, `cli.original.cjs`, `patch.mjs`, `extract-natives.mjs`, `post-process.mjs`, `repatch.mjs`, `plugin-dependencies.mjs`, `features.json`, and `provider.json`. `patches.json` is instead a sparse runtime configuration: absent means `{}`, and it may be created at launch.
   - The generated `plugin-dependencies.mjs` ensures the optional Claude HUD, claude-mem, and Superpowers baselines, preserves valid newer versions, and owns only the Bun HUD/claude-mem integration fields recorded in `plugin-dependencies-state.json`.
   - The installer downloads and verifies a private ripgrep 15.2.0 under `~/.clawgod/vendor/ripgrep/` before starting the patched runtime.

2. **Optional security-research handbook**
   - `docs/clawgod-handbook/` contains documentation plus installable Claude Code hook scripts, separate from the root installer patching flow.
   - `hooks/scene-router.py` is a `UserPromptSubmit` hook that injects scenario context based on cwd and keyword matching.
   - `hooks/tool-guard.py` is a `PreToolUse` hook that classifies Bash/Write/Edit calls, blocks critical patterns, and writes audit logs.

## Key Execution Flows

### Unix install flow

1. The Unix installer (`dist/unix/install.sh`) resolves Bun 1.3.14 or newer.
2. It resolves the target Claude Code package version (`latest`, `CLAWGOD_VERSION`, or `--version`) and downloads the platform package from the npm Registry.
3. It downloads and verifies private ripgrep 15.2.0.
4. Generated extractor and post-processor scripts emit `~/.clawgod/cli.original.js`, vendor native modules, and then `~/.clawgod/cli.original.cjs`.
5. `patch.mjs` applies the version-agnostic patch set.
6. The Chrome helper patch is applied to support Claude-in-Chrome socket fallback behavior.
7. The installer verifies Bun can load `~/.clawgod/cli.cjs --version`.
8. The original `claude` command is backed up as `claude.orig`, then `claude` and `clawgod` launchers are written.
9. Bun runs the generated `plugin-dependencies.mjs ensure`; optional warnings do not fail the core install.
10. The legacy claude-mem provider compatibility helper runs after managed plugin integration.

### Uninstall flow and ownership boundaries

1. `plugin-dependencies.mjs uninstall` first restores the managed HUD `statusLine` and claude-mem Hook/MCP entrypoints when ownership still matches.
2. Unknown or malformed ownership schemas fail closed: user/plugin bytes are retained and the uninstall stops before deleting retry evidence.
3. A successful uninstall removes ClawGod plugin helper, ownership, staging, and download-cache files with the generated runtime.
4. Plugin caches, marketplace registrations, installed-plugin records, and claude-mem memory data remain user-owned and are not removed.

### Runtime launcher flow

1. The launcher sets `CLAUDE_CODE_EXECPATH` to the backed-up official Claude binary.
2. It auto-adds `--chrome` for normal interactive starts, but skips that for commands such as `--help`, `--version`, `update`, `auth`, `config`, `mcp`, and `daemon`.
3. `CLAWGOD_NO_AUTO_CHROME=1` disables default `--chrome` injection.
4. Bun runs `~/.clawgod/cli.cjs`, which ensures `~/.clawgod/provider.json` exists.
5. If `provider.json.apiKey` is set, custom endpoints use only `ANTHROPIC_AUTH_TOKEN` (nonblank environment token first, otherwise the provider key); the official Anthropic API key path clears stale auth tokens. Built-in Grok/OpenAI proxies also use token-only auth and preserve `effort` and `timeoutMs`. `CLAUDE_CODE_EFFORT_LEVEL` overrides `provider.json.effort`; proxies forward `reasoning_effort`, mapping `max` to `xhigh` and omitting `auto`. For non-Anthropic `baseURL`, it also disables the attribution/billing header by default to avoid prompt-cache misses with compatible proxies.
6. If `~/.clawgod/features.json` is valid JSON, it is exported through `CLAUDE_INTERNAL_FC_OVERRIDES`. This is distinct from `patches.json`, which supplies sparse ClawGod runtime feature gates.
7. The wrapper loads `patches.json` plus inherited exact `CLAWGOD_FEATURE_<NAME>=true|false` overrides before loading `./cli.original.cjs`; absent `patches.json` means `{}` (and is created when possible), while changes take effect on the next launch without re-patching.

## Configuration and Environment Variables

`~/.clawgod/provider.json` is created on first launch with these fields:

```json
{
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com",
  "model": "",
  "smallModel": "",
  "effort": "",
  "timeoutMs": 3000000
}
```

Important variables used by the installer or launchers:

- `CLAWGOD_VERSION` - default Claude Code package version for the installer.
- `CLAWGOD_NO_AUTO_CHROME=1` - disables automatic `--chrome` injection.
- `CLAUDE_CODE_EXECPATH` - set by launchers to the original Claude binary backup.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_AUTH_TOKEN` - exported from `provider.json` when configured.
- `CLAUDE_CODE_ATTRIBUTION_HEADER=0` - set for non-Anthropic `baseURL` providers to preserve third-party prompt-cache behavior.
- `CLAUDE_CODE_EFFORT_LEVEL` - optional reasoning effort, taking precedence over `provider.json.effort`; available levels depend on the upstream model.
- `API_TIMEOUT_MS`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_INSTALLATION_CHECKS`, `USE_BUILTIN_RIPGREP` - runtime wrapper controls.
- `CLAUDE_INTERNAL_FC_OVERRIDES` - populated from `features.json` when present; this is Claude-internal GrowthBook configuration, not the ClawGod runtime switches.
- `CLAWGOD_FEATURE_<NAME>` - inherited exact lowercase `true` / `false` per-launch override for a `patches.json` feature; hyphens become underscores, and unknown feature names warn.
- `CLAWGOD_CLASSIFIER_TIMEOUT_MS`, `CLAWGOD_CLASSIFIER_MODEL`, `CLAWGOD_CLASSIFIER_RETRIES` - optional auto-mode classifier tuning values, read at call time (including `~/.claude/settings.json` `env`).

## Upstream v1.9.5–v1.9.7 parity

Pinned upstream release: `v1.9.7`, commit `7bf3b15b10c475c132fe245679c7253792ec74f9`. Keep this fork's Bun-only runtime, public cell renderer, default Lean off, enhancement selection, and existing Cometix patches. Do not replace the renderer with a second `Bun.ant` shim or enable automatic issue closure.

Lean on/off permit Remote Control and do not default to disabling nonessential traffic; only max applies those defaults. Explicit network environment settings win. Installer on-mode migration and `--lean-on` remove legacy Remote Control and max-only settings. Merely launching a third-party provider must not rewrite Remote Control settings or undo max mode. Eligibility checks remain upstream-owned.

Focused tests: `bun tests/wrapper-provider-lean.mjs`, `bun tests/openai-proxy.mjs`, `bun tests/patcher-terminal-replies.mjs`, and `bun tests/runtime-cell-segmenter.mjs`. Provider/proxy checks use isolated homes and loopback mock endpoints, not real credentials or external inference. Terminal fragment handling is a core patch with its helper embedded in the callback, independent of optional enhancements. It bounds incomplete DA1 reply waiting to two seconds without filtering ordinary input.

## GitHub Workflows

- `.github/workflows/compat-daily.yml` is the Bun-only compatibility smoke workflow for Linux and Windows. Linux also runs daily; Windows is intentionally change-driven.
- Its isolated lifecycle checks trap system Git, Node/npm/npx, downloaders, and system ripgrep; the existing badge-publish block is the only narrow system Git exception in this workflow.
- `.github/workflows/release.yml` runs on tags matching `v*`, creates or updates a GitHub Release, and uploads the generated `dist/unix/install.sh` and `dist/win/install.ps1` plus the Chrome helper scripts as release assets.

## Existing Project Instructions

No repository-level Cursor rules, `.cursorrules`, or `.github/copilot-instructions.md` were present when this file was created.
