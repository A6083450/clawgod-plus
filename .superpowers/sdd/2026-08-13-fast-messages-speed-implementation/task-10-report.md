# Task 10 Report — Correct Fast Messages injection for the real 2.1.229 bundle

## Status

**COMPLETED — real 2.1.229 bundle: Fast Messages protocol applied, 0 failed, both installer patchers.**

The forced-passthrough patch now matches the real 2.1.229 `Ze` request
builder (body `betas` field, no `headers` literal) via a new strict matcher
`real229ZeRe`; the previous `legacyRe`/`realRe` paths and all their tests are
preserved. The stale Windows patcher was synced byte-identical to the Unix
patcher (also fixing its 2 pre-existing unrelated failures).

## Evidence chain

| artifact | value |
|---|---|
| tarball | `/private/tmp/anthropic-ai-claude-code-darwin-arm64-2.1.229.tgz` |
| tarball SHA-256 | `d8bf3203231f18e585d2fc88d36c8a8a22fa980a458e16304ea9944cc586fb59` — verified before extraction |
| extracted `cli.original.cjs` | 25,410,603 bytes, SHA-256 `6531f3a05e57aeae7347da0052bc4f155d33e1e34759c2789f9211f84d6c00e3` (matches task 9) |
| patched output SHA-256 | `a1734116c8b207ba3a1ba6617be7a4f5070e2b2268306d9b1a7ef7059c1d9002` (+1111 bytes, unix and ps1 outputs byte-identical) |
| scratch dir | `/private/tmp/task10-229/` (extraction, prototype, run-unix/, run-ps1/) |

## Tracing on the real bundle (requirement 1)

Confirmed on the extracted `cli.original.cjs`:

- Capability registration: `Fbr=RA("speed","fast-mode-2026-02-01")`,
  `function RA(e,t){return Object.freeze({name:e,header:t})}`.
- `Ze` builder (offset ~15100360): `let qi=K2f({hasThinking:Ll}),Wi=i.enablePromptCaching??r_i(g??Fo.model),fu;if($c()&&P3()&&!xLe()&&T0(y)&&!!Fo.fastMode)fu="fast";if(ae&&!Fi.includes(Fbr))Fi.push(Fbr);` then
  `let $u=fn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),ma=$u?Fi.filter((St)=>St===cSt):Fi;` then the request literal containing
  `...ee&&(!$u||ma.length>0)&&{betas:i$(l0s(ma))},...` and
  `...fu!==void 0&&{speed:fu}`; the builder ends `return Pe=...,Rc` — **no
  `headers` literal**.
- Allowlist: `function l0s(e){if(d0o())return e;return e.filter((t)=>aku.has(t))}`
  with `aku=new Set([Wjt,Mbr,vW,Gjt,kke,ddn,Lbr,Hbr,Gj,HV,bz])` — **Fbr is not
  in `aku`**; `d0o()` is true only for firstParty/OV/foundry.
- Serializer: `function i$(e){return e.map((t)=>t.header)}` — the `betas`
  body field is an array of header strings.
- SDK header construction: `messages.create` destructures
  `{betas:n,user_profile_id:o,...}` from the body and emits
  `"anthropic-beta":n?.toString()` (comma join) in the `/v1/messages?beta=true`
  post — so the final betas are exactly the body `betas` array.
- Uniqueness: the gate+push pair, `let $u=fn(...)`, and
  `{betas:i$(l0s(ma))}` each occur exactly once in the bundle.

## Injection design (requirement 2)

New `real229ZeRe` in `applyFastMessagesProtocolPatch` (install.sh / install.ps1,
byte-identical Fast function): one regex spanning, in order,

1. the Fast speed gate `if($c()&&P3()&&!xLe()&&T0(y)&&!!<Fo>.fastMode)<fu>="fast";`
2. the adjacent `ae`-gated push `if(<ae>&&!<Fi>.includes(<Fbr>))<Fi>.push(<Fbr>);`
3. (bounded gap ≤2000 chars) the simulated-proxy derivation
   `let <$u>=<fn>(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),<ma>=<$u>?<Fi2>.filter((<St>)=><St>===<cSt>):<Fi2>;`
   (backrefs tie `$u`/`ma`; Fi === Fi2 checked in code)
4. (bounded gap ≤2000 chars) the body spread + betas field
   `...<ee>&&(!<$u>||<ma>.length>0)&&{betas:<i$>(<l0s>(<ma>))}`
5. (bounded gap ≤600 chars) the speed field `...<fu>!==void 0&&{speed:<fu>}`.

Consistency gates: Fi === Fi2, and the bundle must contain
`<Fbr>=RA("speed","fast-mode-2026-02-01")` (registration shape check). The
matcher requires exactly one overall match across legacyRe/realRe/real229ZeRe
(existing ambiguous/absent failure semantics preserved, including the
`hasFastBeta` skip for old versions).

Minimal replacement: only the `betas` field is spliced (found via
`lastIndexOf` of the captured-name literal, everything else byte-preserved):

```js
{betas:(()=>{/*__clawgod_fast_messages_protocol__*/const h=i$(l0s(ma));const f=h.filter((x)=>x!=="fast-mode-2026-02-01");const u=[];for(const x of f)if(!u.includes(x))u.push(x);return fu==="fast"?[...u,"fast-mode-2026-02-01"]:f})()}
```

Semantics (user-confirmed strategy): `speed==="fast"` is the only switch —
fast forces `fast-mode-2026-02-01` into the final betas with every capability
deduplicated (string level, after `i$`); slow removes every Fast beta
capability and preserves everything else byte-for-byte. Independent of `ae`
eligibility and of the `l0s`/`aku` third-party allowlist, because the
rewrite happens after `l0s(ma)` on the final betas that the SDK turns into
the header.

## Windows patcher sync

The ps1 `$patcherCode` here-string was synced to the Unix patcher body
(79,293 bytes each, byte-identical). This restores the plan's byte-equivalence
constraint and removes the 2 pre-existing ps1 failures on 2.1.229
(`Agent Teams always enabled` and `Redirect claude update`, both stale-regex
divergences flagged in task 9). The ps1 summary gate
(`$patchStatus -ne 0` before Chrome post-processing) is unchanged.

## Real-bundle verification (requirement 4)

| run | Fast Messages line | Result line | exit |
|---|---|---|---|
| unix apply on pristine | applied (1 replacement) | 55 applied, 7 skipped, **0 failed** | 0 |
| unix rerun (idempotent) | already applied | 43 applied, 19 skipped, 0 failed | 0 |
| unix `--dry-run` on pristine | applied (1 replacement) | 52 applied, 10 skipped, 0 failed; file byte-unchanged | 0 |
| unix `--dry-run` on patched | already applied | 43 applied, 19 skipped, 0 failed | 0 |
| ps1 apply on pristine | applied (1 replacement) | 55 applied, 7 skipped, **0 failed** | 0 |
| ps1 rerun (idempotent) | already applied | 43 applied, 19 skipped, 0 failed | 0 |

Both patched outputs parse cleanly (`new Function` on the 25 MB bundle) and
are byte-identical to each other; both installers report the same totals
(their patcher bodies are byte-identical).

## Fixtures and tests (requirement 3)

`tests/patcher-2.1.215.mjs` gained `real229ZeFixture`: a runnable replica of
the real Ze closure token shape (gate → push → `$u`/`ma` derivation → betas
body field → speed field) with the real `l0s`/`aku` allowlist behavior and a
`d0o()` first-party switch. Cases asserted for **both** installer patchers:

- fast + third-party (allowlist active, Fbr not in `aku`) → Fbr forced into
  final betas; header `existing-alpha,existing-omega,fast-mode-2026-02-01`
- fast + duplicate capabilities → full dedup
- slow + `ae`-pushed Fbr + first-party → all Fast betas removed, no speed
- slow + third-party → allowlisted caps preserved, no speed
- fast + `ae` already pushed + first-party → exactly one Fbr

Plus per-installer flows: apply (status 0, `(1 replacement)`, marker),
rerun (`already applied`), `--verify` (1 match, not yet applied, no write),
and 5 invalid fixtures (betas source renamed, duplicated closure, mismatched
Fi, mismatched speed var, mismatched Fbr registration) each failing with the
failed gate incremented and **no file write**. Existing legacy/real229
fixtures and flows are untouched and still pass.

`tests/installer-bun-runtime.mjs` gained: `real229ZeRe` presence in both
patchers, and a permanent byte-equivalence assertion for the
`applyFastMessagesProtocolPatch` function slice across install.sh/install.ps1.

## README (requirement 5)

The Fast mode section now documents the real 2.1.229 injection point: no
`headers` object — beta travels as the body `betas` field (after the
`l0s`/`aku` allowlist) and the SDK `messages.create` constructs the
`"anthropic-beta"` header from `{betas:…}`; ClawGod forces the passthrough at
the `betas` field with `speed === "fast"` as the only switch.

## Test results

```
bun tests/patcher-2.1.215.mjs     → patcher 2.1.215 checks passed (exit 0)
bun tests/installer-bun-runtime.mjs → installer Bun lifecycle checks passed (exit 0)
git diff --check                  → clean
```

## Concerns

1. `real229ZeRe` is frozen to the 2.1.229 minified shape (exact gate
   literal `$c()&&P3()&&!xLe()&&T0(y)`, `fn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE)`,
   backref-tied names). Any upstream rename fails visibly (exit 1, no write,
   installer stops) rather than silently mis-patching — consistent with the
   repo's frozen-shape contract.
2. The three bounded gaps (≤2000/≤2000/≤600 chars) are generous vs the real
   distances (438/770/228) but tie the betas/speed fields to the unique
   `$u`/`ma` derivation site, so cross-closure ambiguity is not possible
   today; a future bundle could in theory relocate the speed field beyond
   the bound and fail visibly.
3. Dedup happens on header strings after `i$`; the slow path preserves the
   upstream byte-exact betas (no dedup), matching the established
   legacy-path semantics.
4. The full-file parse check used `new Function` (script-body parse). The
   patched Ze closure semantics are exercised by the executed fixture, not
   by booting the 25 MB CLI (booting requires the launcher install, which is
   out of scope for this task).

## Housekeeping

- No installer was executed; `~/.clawgod` untouched; parent worktree only
  read; all work committed in worktree
  `agent-ab9a4283271cd07cd` (branch `worktree-agent-ab9a4283271cd07cd`).
- Run artifacts under `/private/tmp/task10-229/`; the preserved official
  tarball was not modified.
