# Task 4 Report

## Status

Completed final verification with an upstream-bundle incompatibility finding.

## Commit inputs

Safely cherry-picked the completed Tasks 1–3 commits into this isolated worktree:

- `7297061 test: cover fast messages protocol patch`
- `1ad35f4 test: execute fast messages protocol fixture`
- `580ba3b feat: forward fast messages protocol`
- `fc3e6d5 fix: harden fast messages protocol patch`
- `404c9c9 docs: describe fast mode messages protocol`

No installer was run and `~/.clawgod` was not read or modified.

## Real official bundle verification

Used the already-retained official `@anthropic-ai/claude-code-darwin-arm64@2.1.229` tarball (`/tmp/anthropic-ai-claude-code-darwin-arm64-2.1.229.tgz`, SHA-256 `d8bf3203231f18e585d2fc88d36c8a8a22fa980a458e16304ea9944cc586fb59`) in a local worktree temporary directory. Extracted its native `claude` binary with the generated `extract-natives.mjs`, post-processed it to `cli.original.cjs`, then executed the generated Unix patcher.

- `bun patch.mjs`: exits 1, with `Fast Messages protocol — Fast request body/header closure not found; upstream shape changed`; overall `54 applied, 7 skipped, 1 failed`.
- `bun patch.mjs --dry-run`: exits 1 with the same Fast-specific failure; overall `51 applied, 10 skipped, 1 failed`.

This is a real target bundle mismatch, not a gateway/network failure. The bundle contains `Fbr=RA("speed","fast-mode-2026-02-01")`, but its actual request closure has drifted from the frozen fixture: the Fast boolean is represented by `Fo.fastMode` in the `speed` condition, while Fast beta insertion uses the separately computed `ae` value. The current guarded matcher intentionally rejects that divergent structure before writing a partial patch.

## Unix/Windows equivalence

Extracted `applyFastMessagesProtocolPatch` from both generated installer patchers and ran:

```bash
diff -u unix-fast-function.js windows-fast-function.js
```

No output (identical JavaScript source).

## Local regression checks

All required local checks pass:

```text
bun tests/patcher-2.1.215.mjs       # patcher 2.1.215 checks passed
bun tests/installer-bun-runtime.mjs # installer Bun lifecycle checks passed
git diff --check                    # exit 0
```

## Network note

No request to `211107.xyz` was made during this retry, so there was no repeated 504 request and no gateway-dependent validation. The reported 504 means Cloudflare could reach its edge but the `211107.xyz` origin did not respond before Cloudflare's timeout; it is server-side and unrelated to the local target-bundle mismatch above.
