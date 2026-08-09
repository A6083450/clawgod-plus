# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Common Commands

### Bun tests and compatibility checks

Bun 1.3.14 or newer is the only installed JavaScript runtime required by this repository. Run focused checks with Bun:

```bash
bun tests/bun-only-policy.mjs
bun tests/installer-bun-runtime.mjs
bun tests/installer-ripgrep.mjs
```

Run the complete local regression set without installing ClawGod Plus:

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done

bash -n install.sh
git diff --check
```

The compatibility workflow in `.github/workflows/compat-daily.yml` runs the Unix installer end-to-end and smoke-tests the generated command. Do not use `bash install.sh` as a casual local test: it writes to `~/.clawgod`, backs up and replaces the `claude` command, and creates `clawgod` launchers.

Temporary workflow exception: until Task 7 migrates `compat-daily.yml`, its bootstrap still contains Node, npm, and system-ripgrep setup. That exception is limited to the CI workflow; product installers and helper scripts must remain Bun-only. GitHub Actions' `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` is an internal action setting, not a product runtime dependency.

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
bash install.sh --version <version>
bash install.sh --uninstall
```

Windows uninstall:

```powershell
.\install.ps1 -Uninstall
```

`claude update` routes through the ClawGod Plus installer, fetches the requested Anthropic Claude Code package from the npm Registry, re-extracts and re-patches it, then rewrites the launchers.

## Project Architecture

ClawGod Plus is an installer-driven runtime patch project for official Claude Code, not a conventional application library. The repository has two parts:

1. **Self-contained installers and runtime patcher**
   - `install.sh` and `install.ps1` are the primary product entry points.
   - They fetch the platform-specific official `@anthropic-ai/claude-code-<platform>` package from the npm Registry, extract the embedded JavaScript entrypoint and native `.node` modules from the Bun standalone binary, post-process the extracted code, apply patches, and write launchers for `claude` and `clawgod`.
   - Most runtime files are generated during installation under `~/.clawgod`, including `cli.cjs`, `cli.original.cjs`, `patch.mjs`, `extract-natives.mjs`, `post-process.mjs`, `repatch.mjs`, `features.json`, and `provider.json`.
   - The installer downloads and verifies a private ripgrep 15.2.0 under `~/.clawgod/vendor/ripgrep/` before starting the patched runtime.

2. **Optional security-research handbook**
   - `docs/clawgod-handbook/` contains documentation plus installable Claude Code hook scripts, separate from the root installer patching flow.
   - `hooks/scene-router.py` is a `UserPromptSubmit` hook that injects scenario context based on cwd and keyword matching.
   - `hooks/tool-guard.py` is a `PreToolUse` hook that classifies Bash/Write/Edit calls, blocks critical patterns, and writes audit logs.

## Key Execution Flows

### Unix install flow

1. `install.sh` resolves Bun 1.3.14 or newer.
2. It resolves the target Claude Code package version (`latest`, `CLAWGOD_VERSION`, or `--version`) and downloads the platform package from the npm Registry.
3. It downloads and verifies private ripgrep 15.2.0.
4. Generated extractor and post-processor scripts emit `~/.clawgod/cli.original.js`, vendor native modules, and then `~/.clawgod/cli.original.cjs`.
5. `patch.mjs` applies the version-agnostic patch set.
6. The Chrome helper patch is applied to support Claude-in-Chrome socket fallback behavior.
7. The installer verifies Bun can load `~/.clawgod/cli.cjs --version`.
8. The original `claude` command is backed up as `claude.orig`, then `claude` and `clawgod` launchers are written.

### Runtime launcher flow

1. The launcher sets `CLAUDE_CODE_EXECPATH` to the backed-up official Claude binary.
2. It auto-adds `--chrome` for normal interactive starts, but skips that for commands such as `--help`, `--version`, `update`, `auth`, `config`, `mcp`, and `daemon`.
3. `CLAWGOD_NO_AUTO_CHROME=1` disables default `--chrome` injection.
4. Bun runs `~/.clawgod/cli.cjs`, which ensures `~/.clawgod/provider.json` exists.
5. If `provider.json.apiKey` is set, the wrapper exports Anthropic-compatible provider variables. For non-Anthropic `baseURL`, it also disables the attribution/billing header by default to avoid prompt-cache misses with compatible proxies.
6. If `~/.clawgod/features.json` is valid JSON, it is exported through `CLAUDE_INTERNAL_FC_OVERRIDES`.
7. The wrapper loads `./cli.original.cjs`.

## Configuration and Environment Variables

`~/.clawgod/provider.json` is created on first launch with these fields:

```json
{
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com",
  "model": "",
  "smallModel": "",
  "timeoutMs": 3000000
}
```

Important variables used by the installer or launchers:

- `CLAWGOD_VERSION` - default Claude Code package version for the installer.
- `CLAWGOD_NO_AUTO_CHROME=1` - disables automatic `--chrome` injection.
- `CLAUDE_CODE_EXECPATH` - set by launchers to the original Claude binary backup.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_AUTH_TOKEN` - exported from `provider.json` when configured.
- `CLAUDE_CODE_ATTRIBUTION_HEADER=0` - set for non-Anthropic `baseURL` providers to preserve third-party prompt-cache behavior.
- `API_TIMEOUT_MS`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_INSTALLATION_CHECKS`, `USE_BUILTIN_RIPGREP` - runtime wrapper controls.
- `CLAUDE_INTERNAL_FC_OVERRIDES` - populated from `features.json` when present.

## GitHub Workflows

- `.github/workflows/compat-daily.yml` is the primary compatibility smoke workflow. It is scheduled to become Bun-only in Task 7; see the temporary exception above.
- `.github/workflows/release.yml` runs on tags matching `v*`, creates or updates a GitHub Release, and uploads `install.sh` and `install.ps1`.
- `.github/workflows/cache-cleanup-weekly.yml` clears GitHub Actions caches so compatibility jobs eventually re-fetch upstream artifacts.

## Existing Project Instructions

No repository-level Cursor rules, `.cursorrules`, or `.github/copilot-instructions.md` were present when this file was created.
