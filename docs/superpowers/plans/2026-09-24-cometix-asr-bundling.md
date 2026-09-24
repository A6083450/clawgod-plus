# Original Cometix ASR restoration

The latest user instruction on 2026-09-24 (按原补丁适配回来) supersedes the earlier cancellation. Restore the upstream adapter and addon under the existing `voice` selection, not a second CLI installation.

- Preserve upstream cumulative preview/finalization behavior at commit `68fd5465eb631ff8180631f37ca0046a2b38c85a`; add the split-bundle vendor search path.
- Adapt only the voice command availability and the shared voice transport predicate on Claude 2.1.281. Retain recording tools and OS microphone permission checks.
- Add a Bun-only optional installer using the original prebuilt addon, fixed SHA-256 values, staged publication, and no overwrite of unknown existing files.
- Follow upstream defaults (no custom transcription model). Document that the addon uses an upstream network service, including device registration, and is not offline. No native service call, audio recording, or upload in tests.
- Verify mock transcript/session behavior, opt-out gates, integrity failures, legacy/split bundles, generated installers, and real local Bun load/command visibility. Back up before targeted local changes; no full installer, commit, push, or release.

## Verification

- Regression run: 46 scripts passed; the network installer E2E script reported its explicit opt-in skip. Generated-installer check, shell syntax, and whitespace check passed.
- Real Claude 2.1.281 split bundle: 2,043 modules parsed; 64 descriptors applied, 15 skipped, zero failed. Repeated application was byte-identical and revert restored original bytes.
- Native macOS arm64 addon: SHA-256 verification, staged publication, Bun load-only check, and no-download verified reuse passed. No native startSession/ensureDid call was made.
- Targeted local update: two voice-related chunks plus patch/install helpers; user provider, enhancement selection, runtime switches and Claude settings remained byte-identical. Previous runtime files are retained under the local ClawGod backups directory.
- Actual interactive terminal smoke test used an isolated HOME, a dummy key and a loopback API URL: `/voice` appeared in completion, and `/voice off` returned `Voice mode disabled.` The test session exited without starting recording or sending a model prompt. Upstream recognition/service availability is not audio-tested.
- Review identified and fixed loss of ASR during vendor updates; preservation on successful publication and rollback is now covered. Follow-up review reported no actionable findings.

## Provided standalone patch and live E2E follow-up

The user identified `claude-code-enable-voice-mode-darwin-arm64/` as their original third-party voice patch. It remains unmodified and was not executed. Its `index.js`, `package.json` and macOS arm64 native addon are byte-identical (SHA-256) to the pinned installed assets. Its adapter body differs only by our additional split-chunk vendor lookup (plus the ESM require prelude outside the body).

Inspection revealed two additional recording-hook checks not covered by command visibility: the voice-specific auth probe and `allow_voice_mode` reader. Both now follow the ASR/voice opt-out gates, matching the supplied script without changing shared account checks. The v2 marker upgrades existing v1 installs without duplicate adapters. Isolated execution of the real 2.1.281 predicates verifies command visibility, transport availability, recording-hook eligibility and opt-out restoration. The remaining chunk and local patch/install helpers were backed up and updated; user configuration remained byte-identical.

The explicit `CLAWGOD_E2E=1 bun tests/installer-e2e.mjs` run now passes on local macOS arm64 with Claude 2.1.281: network installation, 21 enhancements, three plugins, Bun-only entrypoints, private ripgrep, no-upgrade reinstall, ASR pinned-assets verification/reuse, uninstall and retained user/plugin data. Two stale E2E expectations were corrected (14 vs 21 enhancements and old Lean-on Remote Control behavior). No production behavior was weakened for the test. No audio recording, native ASR session, or external model inference was performed.
