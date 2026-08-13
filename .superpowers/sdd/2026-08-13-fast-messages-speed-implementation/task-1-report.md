# Task 1 Report

- Fetched and extracted the unpatched official `@anthropic-ai/claude-code-darwin-arm64@2.1.229` bundle without running the installer or modifying `~/.clawgod`.
- Confirmed the Fast request path: `fastMode` enables capability `Fbr={name:"speed",header:"fast-mode-2026-02-01"}`, computes `fu="fast"`, conditionally adds `...fu!==void 0&&{speed:fu}` to the Messages body, and serializes capability headers through `i$(...)` to `anthropic-beta` for `POST /v1/messages?beta=true`.
- Added a minimal, version-bound Fast fixture and marker assertion to `tests/patcher-2.1.215.mjs` for both installer patchers.
- Red verification: `bun tests/patcher-2.1.215.mjs` fails as intended on `install.sh` because `__clawgod_fast_messages_protocol__` is absent. The PowerShell assertion is not reached after the first expected failure.

Concern: the fixture is intentionally a failing baseline; it cannot pass until Task 2 adds the Fast Messages protocol patch to both embedded patchers.

## Review remediation

- Replaced the passive marker-only fixture with executable `buildRequest` calls for `fast=false`, `fast=true`, and an input that already includes the Fast capability. The fixture writes JSON, which the test executes and parses after each embedded patcher runs.
- Assertions require false requests to preserve the base body and two existing beta capabilities; true requests must preserve those fields while adding both `body.speed: "fast"` and exactly one `fast-mode-2026-02-01` capability. The existing-Fast case asserts no duplicate capability. The marker remains a secondary patch-identification assertion.
- The test now always runs both `install.sh` and `install.ps1` patchers, accumulates protocol errors, and emits a single result listing both variants.
- Command: `bun tests/patcher-2.1.215.mjs`
- Result: expected red failure. Both variants executed (`patch=0, execute=0`) and each reports missing `speed: "fast"` plus missing `fast-mode-2026-02-01`; the baseline does not stop after the Unix variant.
