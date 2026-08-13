# Task 1 Report

- Fetched and extracted the unpatched official `@anthropic-ai/claude-code-darwin-arm64@2.1.229` bundle without running the installer or modifying `~/.clawgod`.
- Confirmed the Fast request path: `fastMode` enables capability `Fbr={name:"speed",header:"fast-mode-2026-02-01"}`, computes `fu="fast"`, conditionally adds `...fu!==void 0&&{speed:fu}` to the Messages body, and serializes capability headers through `i$(...)` to `anthropic-beta` for `POST /v1/messages?beta=true`.
- Added a minimal, version-bound Fast fixture and marker assertion to `tests/patcher-2.1.215.mjs` for both installer patchers.
- Red verification: `bun tests/patcher-2.1.215.mjs` fails as intended on `install.sh` because `__clawgod_fast_messages_protocol__` is absent. The PowerShell assertion is not reached after the first expected failure.

Concern: the fixture is intentionally a failing baseline; it cannot pass until Task 2 adds the Fast Messages protocol patch to both embedded patchers.
