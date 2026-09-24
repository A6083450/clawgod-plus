# Cometix patch parity implementation plan (historical scope)

**Superseded scope:** This document records the earlier ASR-removal phase. The user subsequently restored the original Cometix ASR and authorized local installation, commit and release. The current scope and verification are recorded in `2026-09-24-cometix-asr-bundling.md`; the removal-only constraints below are historical, not current instructions.

> Execute locally, task by task, with regression checks. No install, commit, push or release is authorized.

**Goal:** Integrate the 12 non-ASR patch capabilities from CometixSpace/claude-code commit `44ae56d8f1a6367091bdd8681961b2463edab7ec` into the existing ClawGod patch selection.
**Architecture:** Reuse ClawGod's registries, Acorn loader, module boundaries, feature gates and backup/repatch flow. Implement additional AST transformations directly, not a second patch DSL or CLI. Unknown/ambiguous shapes must not partially rewrite a patch. Retain platform/compliance guards and real unsafe classifier denials.
**Tech stack:** Bun, existing Acorn, node-compatible standard library.
**Spec:** User-approved design in this task (2026-09-24): 12 non-ASR capabilities (scope revised by user), existing selection/runtime controls, generated installers, multilingual docs and isolated validation.

## Constraints
- Canonical source under src; generate dist with bun build.mjs.
- Preserve existing enhancement IDs and custom selections; new options selectable independently.
- User explicitly removed the third-party ASR backend from scope. Remove its descriptor, adapter, runtime feature, selection option and dedicated tests; retain ordinary voice mode and its original transport.
- Do not read provider secrets or modify the user's installed Claude runtime.

## Tasks
- [x] Add failing patch behavior, selection, idempotence, malformed-shape and runtime-off tests.
- [x] Implement scoped AST patch extensions; integrate existing Chrome, classifier, context, voice and compliance behavior.
- [x] Remove the ASR transport and related options per the revised scope; add regression assertions for absence and ordinary voice retention.
- [x] Extend enhancement/runtime metadata and multilingual documentation; test old custom selections.
- [x] Regenerate installers; run focused checks, full tests, bash syntax, build --check and diff --check. Record platform/field verification limitations.

## Verification after ASR removal (2026-09-24)

- 42 Bun check scripts completed: 41 passed; the opt-in network installer E2E script skipped (`CLAWGOD_E2E` unset); zero failures.
- `bun build.mjs --check`, `bash -n dist/unix/install.sh`, and `git diff --check` passed.
- Temporary Claude Code 2.1.280 copy: all 12 remaining Cometix descriptors applied; complete pipeline reported 63 applied, 14 skipped, zero failures. All 1991 JavaScript modules parsed; none contained the removed ASR injection or module-path variable.
- Dry-run preserved the baseline, repeated apply and verify were byte-identical, and revert restored the baseline byte-for-byte.
- Regression assertions ensure the ASR manifest entry, runtime metadata and adapter are absent, its old selection ID is rejected, and ordinary voice enhancement remains selectable. This branch was never installed or released, so no user selection migration is required.
- Read-only review found no functional removal issues. The stale eight-new-options wording was corrected to seven in all three READMEs. Total: 21 enhancements, 77 patch descriptors, 47 runtime metadata entries.
- PowerShell checks run through pwsh on macOS, not native Windows. No actual microphone, browser-extension session or remote service was exercised. Syntax/fixture checks are not end-to-end product acceptance.
- No installation, commit, push or release was performed. No third-party ASR binary was downloaded or bundled.
