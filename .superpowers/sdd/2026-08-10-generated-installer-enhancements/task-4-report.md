# Task 4 Report: Extract Wrapper, Proxy, Compatibility, and Plugin Modules

## Status

Task 4 is complete. The generated installers now consume five canonical runtime
sources, while retaining the existing wrapper, proxy, claude-mem, plugin, and
HUD behavior.

Base: `d3e50ae0b406cb6ad0c1f183b2873a58fdd171c3`

Commit subject: `refactor: extract shared wrapper and plugin modules`

## Module boundaries

- `wrapper.cjs` owns provider/features loading, managed ripgrep `PATH` re-exec,
  direct CLI loading, and argument/exit/stdin/stdout/stderr forwarding.
- `openai-proxy.cjs` owns OpenAI-compatible request/response translation and
  proxy-specific behavior.
- `claude-mem-compat.cjs` owns claude-mem environment and settings compatibility.
- `plugin-dependencies.mjs` owns plugin archive verification, lifecycle,
  transactions, rollback/race handling, claude-mem ownership state, and HUD
  integration orchestration.
- `claude-hud-statusline.mjs` is the sole HUD runner implementation, including
  the existing ANSI output and direct Bun status-line forwarding.

The patcher remains inline. This task does not extract it or introduce
enhancement selection. Consequently, `patcher-worker-launch.mjs` remains an
unchanged compatibility gate for the current patcher and is not falsely routed
through any of the five new canonical modules.

## Nested render order

1. `build.mjs` reads all canonical runtime sources as UTF-8.
2. It JSON-encodes `claude-hud-statusline.mjs` and resolves the single nested
   `@@CLAWGOD_HUD_STATUSLINE_SOURCE_JSON@@` token in
   `plugin-dependencies.mjs`.
3. It removes the HUD source from the top-level replacement set because HUD is
   embedded only through the plugin module.
4. Unix receives the resolved runtime source directly in its heredoc.
5. PowerShell receives base64 of the same resolved UTF-8 bytes, then production
   code decodes with `FromBase64String` and writes with `WriteAllBytes`.
6. The strict renderer rejects missing, duplicate, malformed, or undeclared
   placeholders before paired publication.

The raw canonical plugin module is also directly importable for behavior tests:
when the nested token is intentionally unresolved in the repository source, it
loads the sibling canonical HUD source. Generated installers never retain that
token.

## RED

Tests were changed to resolve the canonical paths before source creation. The
initial focused runs failed with `ENOENT`:

- `bun tests/installer-plugin-dependencies.mjs`: missing
  `src/generic/runtime/plugin-dependencies.mjs`
- `bun tests/patcher-claude-mem.mjs`: missing
  `src/generic/runtime/claude-mem-compat.cjs`
- `bun tests/installer-ripgrep.mjs`: missing
  `src/generic/runtime/wrapper.cjs`
- `bun tests/installer-bun-runtime.mjs`: missing
  `src/generic/runtime/wrapper.cjs`

During final verification, the plugin race fixture exposed one stale local test
identifier after the direct-import conversion. The shared-restore child process
referenced removed `modulePath`, so the Proxy trap raised `ReferenceError` and
left `concurrentCallerState` null. Both child imports were corrected to use
`canonicalModulePath`; no production behavior changed.

## GREEN and exact-byte evidence

- `wrapper.cjs`, `openai-proxy.cjs`, and `claude-mem-compat.cjs` were compared
  directly against their BASE Unix heredoc bodies and are byte-identical.
- The plugin behavior suite executes the canonical plugin module directly and
  retains archive verification, rollback, race, ownership, and lifecycle cases.
- The HUD renderer is asserted against the canonical HUD source and the
  independent ANSI golden bytes, including the terminal LF.
- Wrapper behavior executes the canonical source directly for PATH re-exec,
  argument forwarding, exit propagation, and managed ripgrep behavior.
- PowerShell payload tests decode the generated base64 and compare exact bytes
  with the canonical sources; LF, terminal LF, and no BOM/CR are asserted.
- The isolated renderer fixture copies the five additional canonical inputs and
  retains all locked/journaled paired-publication contracts.

Final source SHA-256 values:

```text
b0ed3c78de5d090ee9f576f173cff9a11fbc70daa054205b0f725ec32c74bad4  src/generic/runtime/wrapper.cjs
3bdbe8bc713a66f6692ad55b6a8dbd83858795d57ab42f83ea2602dffd8d393a  src/generic/runtime/openai-proxy.cjs
d368d24db4e8c613576c2a99c83a566446c0c911c4daa42dd9424d30be51f80f  src/generic/runtime/claude-mem-compat.cjs
d721e8e594a8bd6d89483fc05cfc99b10f71e661b346839b65a660cbe06b000a  src/generic/runtime/plugin-dependencies.mjs
dcb8d532c2ce067078361f7204f18017bd9742b825f57f3cbf110a707f4c61f4  src/generic/runtime/claude-hud-statusline.mjs
920c91c1e53eda9be520cfa1bfeecd5fd317d940eb9128e67cb31e6d4a557e53  install.sh
3432fc5453a846a4ac5a285e2489b9b8b2a7164b57e957dda5321a092d6f6a6a  install.ps1
```

## Verification

The required gates and additional build contracts were run without executing an
installer, a bare `claude`, network E2E, or a real HOME:

```text
bun build.mjs
bun build.mjs --check
bun tests/installer-plugin-dependencies.mjs
bun tests/patcher-claude-mem.mjs
bun tests/patcher-worker-launch.mjs
bun tests/installer-bun-runtime.mjs
bun tests/installer-build.mjs
bun tests/installer-ripgrep.mjs
bun tests/bun-only-policy.mjs
bash -n install.sh
git diff --check
```

All commands passed after the stale test identifier fix. The final pre-commit
gate is rerun after this report is added so the recorded result includes the
complete task diff.

## Self-review

- Confirmed every new renderer token appears exactly once in its input.
- Confirmed no `@@CLAWGOD_` token remains in generated installers.
- Confirmed the renderer resolves HUD before plugin insertion.
- Confirmed Unix and PowerShell decode to identical canonical runtime bytes.
- Confirmed direct canonical imports do not mutate process environment on import.
- Confirmed tests no longer reverse-extract behavior for the five new canonical
  modules.
- Confirmed no patcher extraction, enhancement selection, installer execution,
  network E2E, or real-HOME mutation was introduced.
- Independent review found the stale `modulePath` test reference; both instances
  were fixed and the focused plugin test passed afterward.

## Files

Created:

- `src/generic/runtime/wrapper.cjs`
- `src/generic/runtime/openai-proxy.cjs`
- `src/generic/runtime/claude-mem-compat.cjs`
- `src/generic/runtime/plugin-dependencies.mjs`
- `src/generic/runtime/claude-hud-statusline.mjs`
- `.superpowers/sdd/2026-08-10-generated-installer-enhancements/task-4-report.md`

Modified:

- `build.mjs`
- `src/template/install.sh`
- `src/template/install.ps1`
- `install.sh`
- `install.ps1`
- `tests/installer-plugin-dependencies.mjs`
- `tests/patcher-claude-mem.mjs`
- `tests/installer-ripgrep.mjs`
- `tests/installer-bun-runtime.mjs`
- `tests/installer-build.mjs`

## Concerns

- Native PowerShell execution is not claimed; exact production-decoded bytes and
  lifecycle ordering are covered statically and through Bun fixtures.
- `patcher-worker-launch.mjs` still reverse-extracts the inline patcher because
  canonical patcher extraction belongs to Task 5. The gate passes unchanged;
  changing it here would either weaken coverage or violate the task boundary.
