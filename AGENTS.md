# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Common Commands

### Web landing page

The only package-managed subproject is `web/` (npm + Vite + TypeScript):

```bash
npm --prefix web run dev
npm --prefix web run build
npm --prefix web run preview
```

Equivalent from `web/`:

```bash
npm run dev
npm run build
npm run preview
```

`web/vite.config.ts` builds a single-file site with `vite-plugin-singlefile`; after `vite build`, it copies `web/dist/index.html` to the repository root as `index.html` for GitHub Pages.

### TypeScript checking

There is no `typecheck` script, but `typescript` and `tsconfig.json` exist under `web/`:

```bash
cd web
npx tsc --noEmit
```

### Tests and compatibility checks

There is no verified local unit-test script, test framework config, or `*.test.*` / `*.spec.*` suite in the repository.

The main automated validation is `.github/workflows/compat-daily.yml`, which runs the Unix installer end-to-end and then smoke-tests the generated command:

```bash
bash install.sh
Codex --version
```

Do not use `bash install.sh` as a casual local test unless you intend to install/modify the local Codex wrapper. It writes to `~/.clawgod`, backs up/replaces the `Codex` command, and creates `clawgod` launchers.

### Installer usage

README-documented user install commands:

```bash
curl -fsSL https://raw.githubusercontent.com/A6083450/clawgod-plus/main/install.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/A6083450/clawgod-plus/main/install.ps1 | iex
```

Useful local installer options:

```bash
bash install.sh --version <version>
bash install.sh --uninstall
```

Windows uninstall:

```powershell
.\install.ps1 -Uninstall
```

README states that `Codex update` is patched to route through the ClawGod Plus installer, re-fetch the current Anthropic Codex release from npm, re-extract, re-patch, and rewrite launchers.

## Project Architecture

ClawGod Plus is an installer-driven runtime patch project for official Codex, not a conventional application library. The repository has three main parts:

1. **Root installer and runtime patcher**
   - `install.sh` and `install.ps1` are the primary product entry points.
   - They fetch the platform-specific official `@anthropic-ai/Codex-<platform>` npm package, extract the embedded JavaScript entrypoint and native `.node` modules from the Bun standalone binary, post-process the extracted code, apply patches, and write launchers for `Codex` and `clawgod`.
   - Most runtime files are generated during installation under `~/.clawgod`, including `cli.cjs`, `cli.original.cjs`, `patch.mjs`, `extract-natives.mjs`, `post-process.mjs`, `repatch.mjs`, `features.json`, and `provider.json`.

2. **Static landing page in `web/`**
   - `web/index.html` is the source page.
   - `web/src/main.ts` progressively enhances the static HTML with install-tab switching, copy buttons, sticky topbar behavior, compatibility badge hydration, and GitHub stars/download stats.
   - CSS is linked directly from HTML instead of imported through TypeScript to avoid delaying first paint.

3. **Optional security-research handbook in `docs/clawgod-handbook/`**
   - This is documentation plus installable Codex hook scripts, separate from the root installer patching flow.
   - `hooks/scene-router.py` is a `UserPromptSubmit` hook that injects scenario context based on cwd and keyword matching.
   - `hooks/tool-guard.py` is a `PreToolUse` hook that classifies Bash/Write/Edit calls, blocks critical patterns, and writes audit logs.

## Key Execution Flows

### Unix install flow

1. `install.sh` checks prerequisites: Node.js >= 18, Bun >= 1.3.14, and ripgrep.
2. It resolves the target Codex package version (`latest`, `CLAWGOD_VERSION`, or `--version`).
3. It downloads the platform-specific official Codex npm package.
4. Generated extractor/post-processor scripts emit `~/.clawgod/cli.original.js`, vendor native modules, and then `~/.clawgod/cli.original.cjs`.
5. `patch.mjs` applies the version-agnostic patch set.
6. The Chrome helper patch is applied to support Codex-in-Chrome socket fallback behavior.
7. The installer verifies Bun can load `~/.clawgod/cli.cjs --version`.
8. The original `Codex` command is backed up as `Codex.orig`, then `Codex` and `clawgod` launchers are written.

### Runtime launcher flow

1. The launcher sets `CLAUDE_CODE_EXECPATH` to the backed-up official Codex binary.
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

- `CLAWGOD_VERSION` — default Codex package version for the installer.
- `CLAWGOD_NO_AUTO_CHROME=1` — disables automatic `--chrome` injection.
- `CLAUDE_CODE_EXECPATH` — set by launchers to the original Codex binary backup.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_AUTH_TOKEN` — exported from `provider.json` when configured.
- `CLAUDE_CODE_ATTRIBUTION_HEADER=0` — set for non-Anthropic `baseURL` providers to preserve third-party prompt-cache behavior.
- `API_TIMEOUT_MS`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_INSTALLATION_CHECKS`, `USE_BUILTIN_RIPGREP` — runtime wrapper controls.
- `CLAUDE_INTERNAL_FC_OVERRIDES` — populated from `features.json` when present.

## GitHub Workflows

- `.github/workflows/compat-daily.yml` is the primary compatibility smoke workflow. It installs Node.js 24, Bun canary, and ripgrep; runs `bash install.sh`; verifies generated `~/.clawgod` artifacts; parses patch summary output; and runs `Codex --version`.
- `.github/workflows/release.yml` runs on tags matching `v*`, creates or updates a GitHub Release, and uploads `install.sh` and `install.ps1`.
- `.github/workflows/cache-cleanup-weekly.yml` clears GitHub Actions caches with `gh cache` so compatibility jobs eventually re-fetch upstream npm artifacts.

## Existing Project Instructions

No repository-level `AGENTS.md`, `AGENTS.md`, Cursor rules, `.cursorrules`, or `.github/copilot-instructions.md` were present when this file was created.
