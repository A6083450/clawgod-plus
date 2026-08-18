#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const unixInstaller = readFileSync(new URL('../src/template/install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../src/template/install.ps1', import.meta.url), 'utf8');

assert.doesNotMatch(
  unixInstaller,
  /warn "  If 'claude' still runs the old version/,
  'install.sh must not render terminal refresh advice as an error',
);
assert.match(
  unixInstaller,
  /dim "  If 'claude' still runs the old version/,
  'install.sh should render terminal refresh advice as a hint',
);
assert.doesNotMatch(
  powerShellInstaller,
  /Write-Err "  If 'claude' still runs the old version/,
  'install.ps1 must not render terminal refresh advice as an error',
);
assert.match(
  powerShellInstaller,
  /Write-Dim "  If 'claude' still runs the old version/,
  'install.ps1 should render terminal refresh advice as a hint',
);

const FAST_FIXTURE_VERSION = '2.1.229';

const fixture = `
// Version: 2.1.215
function Bot(){return et(ulu,null)}
function Jre(){return!1}
function r5r(){return"api_key_auth"}
function oQt(){return Bot()?.enabled===!0&&ru()&&!X6()}
function Sub(){let plan=currentPlan();return plan==="max"||plan==="pro"}
function AA6(){if(vo5("hipaa"))return!1;return zQ()&&oL8().enabled}
var ulu="tengu_review_bughunter_config";
function teams(){if(!enabled(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)&&!local())return!1;if(!flag("tengu_amber_flint",!0))return!1;return!0}
const planning={name:"ultraplan",description:"deep",argumentHint:"<prompt>",isEnabled:()=>!1};
function voice(){return!flag("tengu_amber_quartz_disabled",!1)}
function autoProvider(e){if(e==="firstParty"||e==="anthropicAws")return!0;return env(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
const theme={clawd_body:"rgb(215,119,87)",claude:"rgb(255,153,51)",claudeShimmer:"rgb(255,183,101)",hex:"#da7756"};
const risk="IMPORTANT: Assist with authorized security testing only";
function careful(){return\`# Executing actions with care\n\nConfirm scope.\`}
const login="Not logged in. Run login to authenticate.";
function attachments(q){if(userType()!=="ant"&&types.has(q.attachment.type))return null;return q}
function privateDate(e){let t=rdp(),n=odp(t?.known??!1,t?.labKw??!1),r=t?.cnTZ?e.replaceAll("-","/"):e;return\`Today\${n}s date is \${r}.\`}
`;

// @anthropic-ai/claude-code-darwin-arm64@2.1.229 constructs Fast requests as
// `...fu!==void 0&&{speed:fu}` and beta headers from capability `.header`s.
const fastFixture = `${fixture}
function $c(){return!1}function P3(){return!0}function xLe(){return!1}function T0(y){return!0}
let Fbr={name:"speed",header:"fast-mode-2026-02-01"};
function buildRequest(fast,existingBeta){let Fi=[...existingBeta],y="claude-opus-5",X=$c()&&P3()&&!xLe()&&T0(y)&&!!fast;if(X)Fi.push(Fbr);let ae=Fi.includes(Fbr),fu;if($c()&&P3()&&!xLe()&&T0(y)&&!!fast)fu="fast";let Rc={model:"claude-opus-5",messages:[],...fu!==void 0&&{speed:fu}},headers={"anthropic-beta":Fi.map((St)=>St.header).toString()};return{body:Rc,headers}}
let __clawgodFastExisting=[{header:"existing-alpha"},{header:"existing-alpha"},{header:"existing-omega"}];
console.log(JSON.stringify({false:buildRequest(!1,__clawgodFastExisting),true:buildRequest(!0,__clawgodFastExisting),duplicate:buildRequest(!0,[...__clawgodFastExisting,Fbr])}));
`;

function assertFastProtocol(name, output) {
  const expectedBeta = 'existing-alpha,existing-alpha,existing-omega';
  const expectedFastBeta = 'existing-alpha,existing-omega,fast-mode-2026-02-01';
  const checks = [
    () => assert.deepEqual(output.false.body, { model: 'claude-opus-5', messages: [] }, `${name}: false Fast state must preserve the base body`),
    () => assert.equal(output.false.headers['anthropic-beta'], expectedBeta, `${name}: false Fast state must retain existing beta capabilities`),
    () => assert.deepEqual(output.true.body, { model: 'claude-opus-5', messages: [], speed: 'fast' }, `${name}: true Fast state must add only speed=fast`),
    () => assert.equal(output.true.headers['anthropic-beta'], expectedFastBeta, `${name}: true Fast state must append the Fast beta capability`),
    () => assert.deepEqual(output.duplicate.body, output.true.body, `${name}: existing Fast beta must not change the request body`),
    () => assert.equal(output.duplicate.headers['anthropic-beta'], expectedFastBeta, `${name}: existing Fast beta must not be duplicated`),
  ];
  const failures = [];
  for (const check of checks) try { check(); } catch (error) { failures.push(error.message); }
  if (failures.length) throw new Error(failures.join('\n'));
}

const fastResults = [];

// Real 2.1.229 request closure: beta insertion is gated by an independent `ae`
// eligibility while body speed is gated by `Fo.fastMode`. The forced passthrough
// patch must make the beta header agree with the body: `speed==="fast"` is the
// only switch that adds the Fast beta capability, and a missing speed field
// must remove every Fast beta capability even when `ae` pushed it.
const real229FastClosureFixture = `${fixture}
function RA(name,header){return{name,header}}
let Fbr=RA("speed","fast-mode-2026-02-01");
function buildRequest(Fo,ae){let caps=[...Fo.capabilities];if(ae)caps.push(Fbr);let speed;if(Fo.fastMode)speed="fast";let body={model:"claude-opus-5",messages:[],...speed!==void 0&&{speed:speed}},headers={"anthropic-beta":caps.map((cap)=>cap.header).toString()};return{body,headers}}
console.log(JSON.stringify({fastTrueAeFalse:buildRequest({fastMode:!0,capabilities:[]},!1),fastFalseAeTrue:buildRequest({fastMode:!1,capabilities:[]},!0),fastFalseAeFalse:buildRequest({fastMode:!1,capabilities:[]},!1),fastDeduplicated:buildRequest({fastMode:!0,capabilities:[{header:"existing-alpha"},{header:"existing-alpha"},{header:"existing-omega"},{header:"fast-mode-2026-02-01"}]},!1),slowWithPriorFast:buildRequest({fastMode:!1,capabilities:[{header:"existing-alpha"},{header:"fast-mode-2026-02-01"}]},!0)}));
`;

function assertReal229Protocol(name, output) {
  const checks = [
    () => assert.deepEqual(output.fastTrueAeFalse.body, { model: 'claude-opus-5', messages: [], speed: 'fast' }, `${name}: fastMode true must add speed=fast even when ae is false`),
    () => assert.equal(output.fastTrueAeFalse.headers['anthropic-beta'], 'fast-mode-2026-02-01', `${name}: fastMode true must force the Fast beta capability in`),
    () => assert.deepEqual(output.fastFalseAeTrue.body, { model: 'claude-opus-5', messages: [] }, `${name}: fastMode false must keep the base body even when ae is true`),
    () => assert.equal(output.fastFalseAeTrue.headers['anthropic-beta'], '', `${name}: fastMode false must not forward the Fast beta capability pushed by ae`),
    () => assert.deepEqual(output.fastFalseAeFalse.body, { model: 'claude-opus-5', messages: [] }, `${name}: fastMode false must preserve the base body`),
    () => assert.equal(output.fastFalseAeFalse.headers['anthropic-beta'], '', `${name}: fastMode false must keep an empty beta header`),
    () => assert.deepEqual(output.fastDeduplicated.body, { model: 'claude-opus-5', messages: [], speed: 'fast' }, `${name}: forced Fast state must add only speed=fast`),
    () => assert.equal(output.fastDeduplicated.headers['anthropic-beta'], 'existing-alpha,existing-omega,fast-mode-2026-02-01', `${name}: forced Fast state must fully deduplicate existing capabilities`),
    () => assert.deepEqual(output.slowWithPriorFast.body, { model: 'claude-opus-5', messages: [] }, `${name}: slow state must keep the base body with prior capabilities`),
    () => assert.equal(output.slowWithPriorFast.headers['anthropic-beta'], 'existing-alpha', `${name}: slow state must remove every Fast beta capability from the header`),
  ];
  const failures = [];
  for (const check of checks) try { check(); } catch (error) { failures.push(error.message); }
  if (failures.length) throw new Error(failures.join('\n'));
}

const real229Results = [];

// Real 2.1.229 Ze request builder: the betas travel as the body field
// `betas:i$(l0s(ma))` after the `l0s`/`aku` allowlist filter; the bundled SDK
// `messages.create` later destructures `{betas:n,...}` and emits the
// `"anthropic-beta":n?.toString()` header itself. The fixture replicates the
// Ze closure token shape (Fast speed gate, `ae`-gated push, simulated-proxy
// `ma` derivation, betas + speed body fields) together with the real
// `l0s`/`aku` allowlist behavior: third-party providers (`d0o()` false) drop
// every capability that is not in `aku`, and Fbr is not in `aku`.
const real229ZeFixture = `${fixture}
function RA(name,header){return{name,header}}
function i$(e){return e.map((t)=>t.header)}
let Fbr=RA("speed","fast-mode-2026-02-01");
var aku;let __clawgodCapAlpha=RA("alpha","existing-alpha"),__clawgodCapOmega=RA("omega","existing-omega");aku=new Set([__clawgodCapAlpha,__clawgodCapOmega]);
var __clawgodFirstParty=!1;
function d0o(){return __clawgodFirstParty}
function l0s(e){if(d0o())return e;return e.filter((t)=>aku.has(t))}
function fn(v){return!1}
function E(m){}
function $c(){return!0}function P3(){return!0}function xLe(){return!1}function T0(y){return!0}
function K2f(o){return{}}
function r_i(v){return!1}
let cSt=RA("c","c-st"),Ll=!0,ee=!0,y="claude-opus-5",g="claude-opus-5",i={};
function buildRequest(Fo,ae){let Fi=[...Fo.capabilities];let qi=K2f({hasThinking:Ll}),Wi=i.enablePromptCaching??r_i(g??Fo.model),fu;if($c()&&P3()&&!xLe()&&T0(y)&&!!Fo.fastMode)fu="fast";if(ae&&!Fi.includes(Fbr))Fi.push(Fbr);let $u=fn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),ma=$u?Fi.filter((St)=>St===cSt):Fi;let Rc={model:"claude-opus-5",messages:[],...ee&&(!$u||ma.length>0)&&{betas:i$(l0s(ma))},...fu!==void 0&&{speed:fu}};return Rc}
function snapshot(Fo,ae,firstParty){__clawgodFirstParty=firstParty;let Rc=buildRequest(Fo,ae),{betas:n}=Rc;return{betas:n??null,speed:Rc.speed??null,header:n?.toString()??""}}
console.log(JSON.stringify({fastThirdParty:snapshot({fastMode:!0,capabilities:[__clawgodCapAlpha,__clawgodCapOmega]},!1,!1),fastThirdPartyDedup:snapshot({fastMode:!0,capabilities:[__clawgodCapAlpha,__clawgodCapAlpha,__clawgodCapOmega]},!1,!1),slowAePushedFirstParty:snapshot({fastMode:!1,capabilities:[]},!0,!0),slowThirdPartyPrior:snapshot({fastMode:!1,capabilities:[__clawgodCapAlpha]},!1,!1),fastAeFirstParty:snapshot({fastMode:!0,capabilities:[]},!0,!0)}));
`;

function assertReal229ZeProtocol(name, output) {
  const checks = [
    () => assert.deepEqual(output.fastThirdParty.betas, ['existing-alpha', 'existing-omega', 'fast-mode-2026-02-01'], `${name}: fast third-party betas must force the Fast capability through the l0s/aku allowlist`),
    () => assert.equal(output.fastThirdParty.header, 'existing-alpha,existing-omega,fast-mode-2026-02-01', `${name}: fast third-party SDK header must carry the forced Fast capability`),
    () => assert.equal(output.fastThirdParty.speed, 'fast', `${name}: fast third-party body must keep speed=fast`),
    () => assert.deepEqual(output.fastThirdPartyDedup.betas, ['existing-alpha', 'existing-omega', 'fast-mode-2026-02-01'], `${name}: fast betas must deduplicate every capability`),
    () => assert.deepEqual(output.slowAePushedFirstParty.betas, [], `${name}: slow first-party betas must drop the Fast capability pushed by ae`),
    () => assert.equal(output.slowAePushedFirstParty.header, '', `${name}: slow first-party SDK header must drop the Fast capability`),
    () => assert.equal(output.slowAePushedFirstParty.speed, null, `${name}: slow first-party body must keep no speed field`),
    () => assert.deepEqual(output.slowThirdPartyPrior.betas, ['existing-alpha'], `${name}: slow third-party betas must keep allowlisted capabilities`),
    () => assert.equal(output.slowThirdPartyPrior.speed, null, `${name}: slow third-party body must keep no speed field`),
    () => assert.deepEqual(output.fastAeFirstParty.betas, ['fast-mode-2026-02-01'], `${name}: fast first-party betas must carry exactly one Fast capability`),
    () => assert.equal(output.fastAeFirstParty.header, 'fast-mode-2026-02-01', `${name}: fast first-party SDK header must carry exactly one Fast capability`),
    () => assert.equal(output.fastAeFirstParty.speed, 'fast', `${name}: fast first-party body must keep speed=fast`),
  ];
  const failures = [];
  for (const check of checks) try { check(); } catch (error) { failures.push(error.message); }
  if (failures.length) throw new Error(failures.join('\n'));
}

const real229ZeResults = [];

// Real 2.1.232 request builder: renamed gates (`uu()&&j3()&&!aFe()&&TC(y)`),
// sticky-betases `le` eligibility, simulated-proxy `rh`/`Hs` derivation and
// the `iLs`/`ZUu` allowlist (`iLs` passes through for first-party providers,
// otherwise filters to `ZUu`, which excludes Fbr). The fixture replicates the
// Je closure token shape together with the real allowlist behavior, so the
// forced passthrough must operate on the final betas: `os==="fast"` is the
// only switch that adds the Fast beta capability, and a missing speed field
// must remove every Fast beta capability even when `le` pushed it or a
// first-party allowlist would have kept it.
const real232FastClosureFixture = `${fixture}
function LA(name,header){return{name,header}}
let C9t=LA("claude_code","claude-code-20250219"),dEt=LA("oauth_auth","oauth"),e0r=LA("interleaved_thinking","interleaved-thinking-2025-05-14"),o0r=LA("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function hU(e){return e.map((t)=>t.header)}
function iLs(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function Hn(v){return!1}
function uu(){return!0}function j3(){return!0}function aFe(){return!1}function TC(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(no,le,existing){let us=[...existing];let cc=nJf({hasThinking:!0}),Ls=zCi(y),os;if(uu()&&j3()&&!aFe()&&TC(y)&&!!no.fastMode)os="fast";if(le&&!us.includes(o0r))us.push(o0r);let rh=Hn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Hs=rh?us.filter((nn)=>nn===dEt):us;let re=!0;let Wa={model:y,...re&&(!rh||Hs.length>0)&&{betas:hU(iLs(Hs))},...os!==void 0&&{speed:os}};return Wa}
function snapshot(fastMode,le,existing,firstParty){__clawgodFirstParty=firstParty;let Wa=buildRequest({fastMode},le,existing);return{betas:Wa.betas??null,speed:Wa.speed??null,header:Wa.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,o0r],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

function assertReal232Protocol(name, output) {
  const checks = [
    () => assert.deepEqual(output.fastThirdParty.betas, ['claude-code-20250219', 'interleaved-thinking-2025-05-14', 'fast-mode-2026-02-01'], `${name}: fast third-party betas must force the Fast capability through the iLs/ZUu allowlist`),
    () => assert.equal(output.fastThirdParty.header, 'claude-code-20250219,interleaved-thinking-2025-05-14,fast-mode-2026-02-01', `${name}: fast third-party SDK header must carry the forced Fast capability`),
    () => assert.equal(output.fastThirdParty.speed, 'fast', `${name}: fast third-party body must keep speed=fast`),
    () => assert.deepEqual(output.fastThirdPartyDedup.betas, ['claude-code-20250219', 'interleaved-thinking-2025-05-14', 'fast-mode-2026-02-01'], `${name}: fast betas must deduplicate every capability`),
    () => assert.deepEqual(output.slowThirdPartyPrior.betas, ['claude-code-20250219'], `${name}: slow third-party betas must keep allowlisted capabilities`),
    () => assert.equal(output.slowThirdPartyPrior.speed, null, `${name}: slow third-party body must keep no speed field`),
    () => assert.deepEqual(output.slowFirstPartySticky.betas, ['claude-code-20250219'], `${name}: slow first-party betas must drop the Fast capability the first-party allowlist would keep`),
    () => assert.equal(output.slowFirstPartySticky.header, 'claude-code-20250219', `${name}: slow first-party SDK header must drop the sticky Fast capability`),
    () => assert.equal(output.slowFirstPartySticky.speed, null, `${name}: slow first-party body must keep no speed field`),
    () => assert.deepEqual(output.fastFirstParty.betas, ['fast-mode-2026-02-01'], `${name}: fast first-party betas must carry exactly one Fast capability`),
    () => assert.equal(output.fastFirstParty.speed, 'fast', `${name}: fast first-party body must keep speed=fast`),
  ];
  const failures = [];
  for (const check of checks) try { check(); } catch (error) { failures.push(error.message); }
  if (failures.length) throw new Error(failures.join('\n'));
}

const real232Results = [];

// Win32-x64 2.1.232 request builder: the darwin 2.1.232 structure with
// win32-renamed gates (`Wz()`/`ET(y)`) and the win32 `Lx` capability
// registration helper. Forced passthrough semantics are identical to the
// darwin 2.1.232 branch.
const real232WinFastClosureFixture = `${fixture}
function Lx(name,header){return{name,header}}
let C9t=Lx("claude_code","claude-code-20250219"),c0t=Lx("oauth_auth","oauth"),e0r=Lx("interleaved_thinking","interleaved-thinking-2025-05-14"),rAr=Lx("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function _B(e){return e.map((t)=>t.header)}
function sLs(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function Ln(v){return!1}
function uu(){return!0}function Wz(){return!0}function aFe(){return!1}function ET(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(no,le,existing){let us=[...existing];let cc=nJf({hasThinking:!0}),Os=zCi(y),os;if(uu()&&Wz()&&!aFe()&&ET(y)&&!!no.fastMode)os="fast";if(le&&!us.includes(rAr))us.push(rAr);let th=Ln(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Ls=th?us.filter((nn)=>nn===c0t):us;let re=!0;let Wa={model:y,...re&&(!th||Ls.length>0)&&{betas:_B(sLs(Ls))},...os!==void 0&&{speed:os}};return Wa}
function snapshot(fastMode,le,existing,firstParty){__clawgodFirstParty=firstParty;let Wa=buildRequest({fastMode},le,existing);return{betas:Wa.betas??null,speed:Wa.speed??null,header:Wa.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,rAr],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

const real232WinResults = [];

// Linux-x64 2.1.233 request builder: renamed gates
// (`Tu()&&Xz()&&!SBe()&&L0(y)`) and the `jk` registration helper.
const real233LinuxFastClosureFixture = `${fixture}
function jk(name,header){return{name,header}}
let C9t=jk("claude_code","claude-code-20250219"),XAt=jk("oauth_auth","oauth"),e0r=jk("interleaved_thinking","interleaved-thinking-2025-05-14"),QHr=jk("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function vU(e){return e.map((t)=>t.header)}
function l1s(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function Mn(v){return!1}
function Tu(){return!0}function Xz(){return!0}function SBe(){return!1}function L0(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(ho,ce,existing){let ji=[...existing];let cc=nJf({hasThinking:!0}),Iu=zCi(y),ps;if(Tu()&&Xz()&&!SBe()&&L0(y)&&!!ho.fastMode)ps="fast";if(ce&&!ji.includes(QHr))ji.push(QHr);let Vc=Mn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Sa=Vc?ji.filter((Hs)=>Hs===XAt):ji;let ne=!0;let Rd={model:y,...ne&&(!Vc||Sa.length>0)&&{betas:vU(l1s(Sa))},...ps!==void 0&&{speed:ps}};return Rd}
function snapshot(fastMode,ce,existing,firstParty){__clawgodFirstParty=firstParty;let Rd=buildRequest({fastMode},ce,existing);return{betas:Rd.betas??null,speed:Rd.speed??null,header:Rd.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,QHr],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

// Win32-x64 2.1.233 request builder: renamed gates
// (`ku()&&Qz()&&!wFe()&&PT(y)`) and the `zx` registration helper.
const real233WinFastClosureFixture = `${fixture}
function zx(name,header){return{name,header}}
let C9t=zx("claude_code","claude-code-20250219"),Y0t=zx("oauth_auth","oauth"),e0r=zx("interleaved_thinking","interleaved-thinking-2025-05-14"),XAr=zx("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function TB(e){return e.map((t)=>t.header)}
function uNs(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function On(v){return!1}
function ku(){return!0}function Qz(){return!0}function wFe(){return!1}function PT(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(ho,ce,existing){let ji=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),ps;if(ku()&&Qz()&&!wFe()&&PT(y)&&!!ho.fastMode)ps="fast";if(ce&&!ji.includes(XAr))ji.push(XAr);let qc=On(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Sa=qc?ji.filter((Ts)=>Ts===Y0t):ji;let ne=!0;let Id={model:y,...ne&&(!qc||Sa.length>0)&&{betas:TB(uNs(Sa))},...ps!==void 0&&{speed:ps}};return Id}
function snapshot(fastMode,ce,existing,firstParty){__clawgodFirstParty=firstParty;let Id=buildRequest({fastMode},ce,existing);return{betas:Id.betas??null,speed:Id.speed??null,header:Id.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,XAr],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

const real233Results = [];

// Darwin-arm64 2.1.234 request builder: renamed gates
// (`ku()&&G3()&&!vBe()&&yk(y)`) and the `ER` registration helper.
const real234FastClosureFixture = `${fixture}
function ER(name,header){return{name,header}}
let C9t=ER("claude_code","claude-code-20250219"),XAt=ER("oauth_auth","oauth"),e0r=ER("interleaved_thinking","interleaved-thinking-2025-05-14"),hxr=ER("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function y4(e){return e.map((t)=>t.header)}
function H3s(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function Hn(v){return!1}
function ku(){return!0}function G3(){return!0}function vBe(){return!1}function yk(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(ho,ce,existing){let bi=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),Uu;if(ku()&&G3()&&!vBe()&&yk(y)&&!!ho.fastMode)Uu="fast";if(ce&&!bi.includes(hxr))bi.push(hxr);let Kc=Hn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Qp=Kc?bi.filter((Ts)=>Ts===XAt):bi;let ee=!0;let j_={model:y,...ee&&(!Kc||Qp.length>0)&&{betas:y4(H3s(Qp))},...Uu!==void 0&&{speed:Uu}};return j_}
function snapshot(fastMode,ce,existing,firstParty){__clawgodFirstParty=firstParty;let j_=buildRequest({fastMode},ce,existing);return{betas:j_.betas??null,speed:j_.speed??null,header:j_.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,hxr],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

const real234Results = [];

// Linux-x64 2.1.234 request builder: renamed gates
// (`Tu()&&W4()&&!b2e()&&yT(y)`) and the `AC` registration helper.
const real234LinuxFastClosureFixture = `${fixture}
function AC(name,header){return{name,header}}
let C9t=AC("claude_code","claude-code-20250219"),rkt=AC("oauth_auth","oauth"),e0r=AC("interleaved_thinking","interleaved-thinking-2025-05-14"),gxr=AC("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function gj(e){return e.map((t)=>t.header)}
function P4s(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function $n(v){return!1}
function Tu(){return!0}function W4(){return!0}function b2e(){return!1}function yT(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(ho,ce,existing){let bi=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),Uu;if(Tu()&&W4()&&!b2e()&&yT(y)&&!!ho.fastMode)Uu="fast";if(ce&&!bi.includes(gxr))bi.push(gxr);let Kc=$n(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Qp=Kc?bi.filter((od)=>od===rkt):bi;let ee=!0;let j_={model:y,...ee&&(!Kc||Qp.length>0)&&{betas:gj(P4s(Qp))},...Uu!==void 0&&{speed:Uu}};return j_}
function snapshot(fastMode,ce,existing,firstParty){__clawgodFirstParty=firstParty;let j_=buildRequest({fastMode},ce,existing);return{betas:j_.betas??null,speed:j_.speed??null,header:j_.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,gxr],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

// Win32-x64 2.1.234 request builder: renamed gates
// (`ku()&&K4()&&!vUe()&&yk(y)`) and the `TC` registration helper.
const real234WinFastClosureFixture = `${fixture}
function TC(name,header){return{name,header}}
let C9t=TC("claude_code","claude-code-20250219"),ext=TC("oauth_auth","oauth"),e0r=TC("interleaved_thinking","interleaved-thinking-2025-05-14"),mRr=TC("speed","fast-mode-2026-02-01");
var ZUu;ZUu=new Set([C9t,e0r]);
function vj(e){return e.map((t)=>t.header)}
function L4s(e){if(WPo())return e;return e.filter((t)=>ZUu.has(t))}
var __clawgodFirstParty=!1;
function WPo(){return __clawgodFirstParty}
function Ln(v){return!1}
function ku(){return!0}function K4(){return!0}function vUe(){return!1}function yk(y){return!0}
function nJf(o){return{}}
function zCi(m){return!0}
let y="claude-opus-5";
function buildRequest(ho,ce,existing){let bi=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),Bu;if(ku()&&K4()&&!vUe()&&yk(y)&&!!ho.fastMode)Bu="fast";if(ce&&!bi.includes(mRr))bi.push(mRr);let Kc=Ln(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Qp=Kc?bi.filter((od)=>od===ext):bi;let ee=!0;let B_={model:y,...ee&&(!Kc||Qp.length>0)&&{betas:vj(L4s(Qp))},...Bu!==void 0&&{speed:Bu}};return B_}
function snapshot(fastMode,ce,existing,firstParty){__clawgodFirstParty=firstParty;let B_=buildRequest({fastMode},ce,existing);return{betas:B_.betas??null,speed:B_.speed??null,header:B_.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!0,[C9t,e0r],!1),fastThirdPartyDedup:snapshot(!0,!0,[C9t,C9t,e0r],!1),slowThirdPartyPrior:snapshot(!1,!1,[C9t],!1),slowFirstPartySticky:snapshot(!1,!0,[C9t,mRr],!0),fastFirstParty:snapshot(!0,!0,[],!0)}));
`;

const real234PlatformResults = [];

// Fast mode org-check bypass: `g0o()` (the CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK helper)
// is the local gate that blocks `/fast` when the "penguin mode" org-status endpoint is
// unreachable through third-party routing. The patch forces it to `true`.
const fastModeOrgCheckFixture = `${fixture}
var Q={};
function g0o(){return Q.CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK}
console.log(g0o());
`;

const allConfig = '{\n  "schemaVersion": 1,\n  "mode": "all",\n  "enabled": []\n}\n';

function assertTemporaryPath(path, parent, label) {
  const resolvedParent = realpathSync(parent);
  const resolvedPath = realpathSync(path);
  const child = relative(resolvedParent, resolvedPath);
  assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child), `${label} must stay under its fixture root`);
}

for (const [name, patcherSource] of await getPatcherSources()) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-2.1.215-'));
  try {
    const home = join(dir, 'home with spaces');
    const clawgod = join(home, '.clawgod');
    const enhancementsFile = join(clawgod, 'enhancements.json');
    const fixtureBin = join(dir, 'fixture-only-bin');
    mkdirSync(clawgod, { recursive: true, mode: 0o700 });
    mkdirSync(fixtureBin);
    assert.equal(realpathSync(dirname(dir)), realpathSync(tmpdir()), '2.1.215 fixture must be created directly under the system temporary directory');
    assertTemporaryPath(home, dir, '2.1.215 HOME');
    assertTemporaryPath(fixtureBin, dir, '2.1.215 PATH');
    writeFileSync(enhancementsFile, allConfig, { mode: 0o600 });
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs', '--enhancements-file', enhancementsFile], {
      cwd: dir,
      encoding: 'utf8',
      env: { HOME: home, PATH: fixtureBin, TMPDIR: dir },
    });
    const firstOutput = first.stdout + first.stderr;
    assert.equal(first.status, 0, `${name}: ${firstOutput}`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.equal(
      createHash('sha256').update(patched).digest('hex'),
      '18c49a8bad4d7096a42c2000a9ba580f6f37254e219f58e4db9170b0b763edda',
      `${name}: default-all representative output bytes must retain the pre-extraction fingerprint`,
    );
    assert.match(patched, /function Bot\(\)\{return et\(ulu,null\)\}/, `${name}: getter must survive`);
    assert.match(patched, /function Jre\(\)\{return!1\}/, `${name}: intermediate functions must survive`);
    assert.match(patched, /function r5r\(\)\{return"api_key_auth"\}/, `${name}: adjacent functions must survive`);
    assert.match(
      patched,
      /function oQt\(\)\{\/\*__clawgod_ultrareview_enabled__\*\/return!0\}/,
      `${name}: only the Ultrareview gate should be replaced`,
    );
    assert.match(
      patched,
      /function Sub\(\)\{\/\*__clawgod_computer_use_subscription__\*\/return!0\}/,
      `${name}: Computer Use subscription bypass needs an idempotency marker`,
    );
    assert.match(
      patched,
      /function AA6\(\)\{\/\*__clawgod_computer_use_gate__\*\/return!0\}/,
      `${name}: Computer Use gate bypass needs an idempotency marker`,
    );
    assert.match(patched, /function teams\(\)\{return!0\}/, `${name}: Agent Teams must stay enabled`);
    assert.match(patched, /argumentHint:"<prompt>",isEnabled:\(\)=>!0/, `${name}: planning must stay enabled`);
    assert.match(patched, /function voice\(\)\{return!0\}/, `${name}: voice mode must stay enabled`);
    assert.match(patched, /function autoProvider\(\)\{return!0\}/, `${name}: auto mode must accept third-party providers`);
    assert.match(patched, /clawd_body:"rgb\(34,197,94\)"/, `${name}: branding must retain the green palette`);
    assert.match(patched, /hex:"#22c55e"/, `${name}: branding must retain the green hex color`);
    assert.match(patched, /const risk=""/, `${name}: security-research permissions must stay unrestricted`);
    assert.match(patched, /function careful\(\)\{return``\}/, `${name}: cautious-action restriction must stay removed`);
    assert.match(patched, /const login=""/, `${name}: authentication notice must stay removed`);
    assert.match(patched, /if\(false&&types\.has/, `${name}: attachment permissions must stay unrestricted`);
    assert.match(patched, /function privateDate\(e\)\{return`Today's date is \$\{e\}\.\`\}/, `${name}: privacy date must not encode geo state`);
    assert.doesNotMatch(firstOutput, /(?:❌|XX) Ultrareview enable/, `${name}: no stale Ultrareview error`);
    assert.doesNotMatch(
      firstOutput,
      /(?:⚠️|!!) Computer Use gate bypass/,
      `${name}: no unverifiable Computer Use alternative`,
    );
    assert.match(firstOutput, /Result: 26 applied, 38 skipped, 0 failed/, `${name}: default-all summary must remain canonical`);
    assert.match(firstOutput, /Enhancements: 13 enabled, 0 disabled/, `${name}: default-all enhancement summary must be stable`);

    writeFileSync(join(dir, 'cli.original.cjs'), fastFixture, 'utf8');
    const fast = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const fastPatched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    const execute = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    let protocolError = null;
    try {
      assert.equal(execute.status, 0, `${name}: Fast fixture must execute for upstream ${FAST_FIXTURE_VERSION}: ${execute.stderr}`);
      assertFastProtocol(name, JSON.parse(execute.stdout));
      assert.match(
        fastPatched,
        /__clawgod_fast_messages_protocol__/,
        `${name}: Fast Messages protocol marker missing for upstream ${FAST_FIXTURE_VERSION}`,
      );
    } catch (error) {
      protocolError = error instanceof Error ? error.message : String(error);
    }
    fastResults.push({ name, patchStatus: fast.status, executeStatus: execute.status, protocolError, fastOutput: fast.stdout + fast.stderr });

    writeFileSync(join(dir, 'cli.original.cjs'), fastFixture, 'utf8');
    const verify = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const verifyOutput = verify.stdout + verify.stderr;
    assert.equal(verify.status, 0, `${name}: ${verifyOutput}`);
    assert.match(verifyOutput, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${name}: verify must report an unapplied match`);
    assert.match(verifyOutput, /Result: \d+ applied, \d+ skipped, 0 failed/, `${name}: verify must not fail`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), fastFixture, `${name}: verify must not write`);

    const invalidFixtures = [
      ['mismatched speed condition', fastFixture.replace('if($c()&&P3()&&!xLe()&&T0(y)&&!!fast)fu="fast"', 'if($c()&&P3()&&!xLe()&&T0(y)&&!!different)fu="fast"')],
      ['ambiguous closure', fastFixture.replace('let __clawgodFastExisting', 'function duplicate(fast,existingBeta){let Fi=[...existingBeta],y="claude-opus-5",X=$c()&&P3()&&!xLe()&&T0(y)&&!!fast;if(X)Fi.push(Fbr);let ae=Fi.includes(Fbr),fu;if($c()&&P3()&&!xLe()&&T0(y)&&!!fast)fu="fast";let Rc={model:"claude-opus-5",messages:[],...fu!==void 0&&{speed:fu}},headers={"anthropic-beta":Fi.map((St)=>St.header).toString()};return{body:Rc,headers}}\nlet __clawgodFastExisting')],
      ['unmatched Fast capability', `${fixture}let Fbr={header:"fast-mode-2026-02-01"};function unrelated(){return Fbr.header}`],
      ['mismatched real 2.1.229 header mapping', real229FastClosureFixture.replace('caps.map((cap)=>cap.header).toString()', 'caps.map((cap)=>cap.name).toString()')],
      ['ambiguous real 2.1.229 closure', real229FastClosureFixture.replace('console.log(JSON.stringify(', 'function duplicate(Fo,ae){let caps=[...Fo.capabilities];if(ae)caps.push(Fbr);let speed;if(Fo.fastMode)speed="fast";let body={model:"claude-opus-5",messages:[],...speed!==void 0&&{speed:speed}},headers={"anthropic-beta":caps.map((cap)=>cap.header).toString()};return{body,headers}}\nconsole.log(JSON.stringify(')],
      ['inconsistent real 2.1.229 speed variable', real229FastClosureFixture.replace('...speed!==void 0&&{speed:speed}', '...different!==void 0&&{speed:different}')],
    ];
    for (const [label, invalidFixture] of invalidFixtures) {
      writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
      const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const invalidOutput = invalid.stdout + invalid.stderr;
      assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
      assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
      assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
      assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
    }

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.notEqual(second.status, 0, `${name}: unmatched Fast capability must fail in dry run`);

    writeFileSync(join(dir, 'cli.original.cjs'), real229FastClosureFixture, 'utf8');
    const real229 = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const output = real229.stdout + real229.stderr;
    assert.equal(real229.status, 0, `${name}: real 2.1.229 closure must patch: ${output}`);
    assert.match(output, /Fast Messages protocol \(1 replacement\)/, `${name}: real 2.1.229 closure must report its replacement`);
    const after = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.notEqual(after, real229FastClosureFixture, `${name}: real 2.1.229 closure patch must write`);
    assert.match(after, /__clawgod_fast_messages_protocol__/, `${name}: real 2.1.229 closure patch must add the idempotency marker`);
    assert.match(after, /if\(speed==="fast"&&!caps\.includes\(Fbr\)\)caps\.push\(Fbr\)/, `${name}: real 2.1.229 closure must be forced by the speed field only`);
    const executeReal229 = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    try {
      assert.equal(executeReal229.status, 0, `${name}: real 2.1.229 fixture must execute: ${executeReal229.stderr}`);
      assertReal229Protocol(name, JSON.parse(executeReal229.stdout));
    } catch (error) {
      real229Results.push({ name, status: real229.status, protocolError: error instanceof Error ? error.message : String(error), output });
      throw error;
    }
    real229Results.push({ name, status: real229.status, protocolError: null, output });

    const rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(rerun.status, 0, `${name}: patched real 2.1.229 closure must re-run cleanly: ${rerun.stdout}${rerun.stderr}`);
    assert.match(rerun.stdout + rerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: re-run must recognize the idempotency marker`);

    writeFileSync(join(dir, 'cli.original.cjs'), real229FastClosureFixture, 'utf8');
    const verifyReal229 = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const verifyReal229Output = verifyReal229.stdout + verifyReal229.stderr;
    assert.equal(verifyReal229.status, 0, `${name}: ${verifyReal229Output}`);
    assert.match(verifyReal229Output, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${name}: verify must report the unapplied real 2.1.229 match`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), real229FastClosureFixture, `${name}: verify must not write the real 2.1.229 closure`);

    writeFileSync(join(dir, 'cli.original.cjs'), real229ZeFixture, 'utf8');
    const real229Ze = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const zeOutput = real229Ze.stdout + real229Ze.stderr;
    assert.equal(real229Ze.status, 0, `${name}: real 2.1.229 Ze closure must patch: ${zeOutput}`);
    assert.match(zeOutput, /Fast Messages protocol \(1 replacement\)/, `${name}: real 2.1.229 Ze closure must report its replacement`);
    const zeAfter = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.notEqual(zeAfter, real229ZeFixture, `${name}: real 2.1.229 Ze closure patch must write`);
    assert.match(zeAfter, /__clawgod_fast_messages_protocol__/, `${name}: real 2.1.229 Ze closure patch must add the idempotency marker`);
    assert.match(zeAfter, /betas:\(\(\)=>\{/, `${name}: real 2.1.229 Ze closure must rewrite the betas body field`);
    assert.doesNotMatch(zeAfter, /\{betas:i\$\(l0s\(ma\)\)\}/, `${name}: real 2.1.229 Ze closure must replace the raw betas field`);
    const executeReal229Ze = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    try {
      assert.equal(executeReal229Ze.status, 0, `${name}: real 2.1.229 Ze fixture must execute: ${executeReal229Ze.stderr}`);
      assertReal229ZeProtocol(name, JSON.parse(executeReal229Ze.stdout));
    } catch (error) {
      real229ZeResults.push({ name, status: real229Ze.status, protocolError: error instanceof Error ? error.message : String(error), output: zeOutput });
      throw error;
    }
    real229ZeResults.push({ name, status: real229Ze.status, protocolError: null, output: zeOutput });

    const zeRerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(zeRerun.status, 0, `${name}: patched real 2.1.229 Ze closure must re-run cleanly: ${zeRerun.stdout}${zeRerun.stderr}`);
    assert.match(zeRerun.stdout + zeRerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: Ze re-run must recognize the idempotency marker`);

    writeFileSync(join(dir, 'cli.original.cjs'), real229ZeFixture, 'utf8');
    const verifyReal229Ze = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const verifyReal229ZeOutput = verifyReal229Ze.stdout + verifyReal229Ze.stderr;
    assert.equal(verifyReal229Ze.status, 0, `${name}: ${verifyReal229ZeOutput}`);
    assert.match(verifyReal229ZeOutput, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${name}: verify must report the unapplied real 2.1.229 Ze match`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), real229ZeFixture, `${name}: verify must not write the real 2.1.229 Ze closure`);

    const invalidZeFixtures = [
      ['mismatched real 2.1.229 Ze betas source', real229ZeFixture.replace('{betas:i$(l0s(ma))}', '{betas:i$(l0s(mm))}')],
      ['ambiguous real 2.1.229 Ze closure', real229ZeFixture.replace('function snapshot(', `function duplicate(Fo,ae){let Fi=[...Fo.capabilities];let qi=K2f({hasThinking:Ll}),Wi=i.enablePromptCaching??r_i(g??Fo.model),fu;if($c()&&P3()&&!xLe()&&T0(y)&&!!Fo.fastMode)fu="fast";if(ae&&!Fi.includes(Fbr))Fi.push(Fbr);let $u=fn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),ma=$u?Fi.filter((St)=>St===cSt):Fi;let Rc={model:"claude-opus-5",messages:[],...ee&&(!$u||ma.length>0)&&{betas:i$(l0s(ma))},...fu!==void 0&&{speed:fu}};return Rc}\nfunction snapshot(`)],
      ['inconsistent real 2.1.229 Ze capability list', real229ZeFixture.replace('ma=$u?Fi.filter((St)=>St===cSt):Fi;', 'ma=$u?Fi.filter((St)=>St===cSt):Fj;')],
      ['mismatched real 2.1.229 Ze speed variable', real229ZeFixture.replace('...fu!==void 0&&{speed:fu}', '...fu!==void 0&&{speed:fq}')],
      ['mismatched real 2.1.229 Ze Fast registration', real229ZeFixture.replace('let Fbr=RA("speed","fast-mode-2026-02-01")', 'let Fbr=RA("speed","fast-mode-2027-01-01")')],
      ['inconsistent real 2.1.229 Ze push target', real229ZeFixture.replace('if(ae&&!Fi.includes(Fbr))Fi.push(Fbr)', 'if(ae&&!Fj.includes(Fbr))Fj.push(Fbr)')],
    ];
    for (const [label, invalidFixture] of invalidZeFixtures) {
      writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
      const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const invalidOutput = invalid.stdout + invalid.stderr;
      assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
      assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
      assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
      assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
    }
    writeFileSync(join(dir, 'cli.original.cjs'), real232FastClosureFixture, 'utf8');
    const real232 = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const real232Output = real232.stdout + real232.stderr;
    assert.equal(real232.status, 0, `${name}: real 2.1.232 closure must patch: ${real232Output}`);
    assert.match(real232Output, /Fast Messages protocol \(1 replacement\)/, `${name}: real 2.1.232 closure must report its replacement`);
    const real232After = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.notEqual(real232After, real232FastClosureFixture, `${name}: real 2.1.232 closure patch must write`);
    assert.match(real232After, /__clawgod_fast_messages_protocol__/, `${name}: real 2.1.232 closure patch must add the idempotency marker`);
    assert.match(real232After, /betas:\(\(\)=>\{/, `${name}: real 2.1.232 closure must rewrite the betas body field`);
    assert.doesNotMatch(real232After, /\{betas:hU\(iLs\(Hs\)\)\}/, `${name}: real 2.1.232 closure must replace the raw betas field`);
    const executeReal232 = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    try {
      assert.equal(executeReal232.status, 0, `${name}: real 2.1.232 fixture must execute: ${executeReal232.stderr}`);
      assertReal232Protocol(name, JSON.parse(executeReal232.stdout));
    } catch (error) {
      real232Results.push({ name, status: real232.status, protocolError: error instanceof Error ? error.message : String(error), output: real232Output });
      throw error;
    }
    real232Results.push({ name, status: real232.status, protocolError: null, output: real232Output });

    const real232Rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(real232Rerun.status, 0, `${name}: patched real 2.1.232 closure must re-run cleanly: ${real232Rerun.stdout}${real232Rerun.stderr}`);
    assert.match(real232Rerun.stdout + real232Rerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: 2.1.232 re-run must recognize the idempotency marker`);

    writeFileSync(join(dir, 'cli.original.cjs'), real232FastClosureFixture, 'utf8');
    const verifyReal232 = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const verifyReal232Output = verifyReal232.stdout + verifyReal232.stderr;
    assert.equal(verifyReal232.status, 0, `${name}: ${verifyReal232Output}`);
    assert.match(verifyReal232Output, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${name}: verify must report the unapplied real 2.1.232 match`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), real232FastClosureFixture, `${name}: verify must not write the real 2.1.232 closure`);

    const invalid232Fixtures = [
      ['mismatched real 2.1.232 betas source', real232FastClosureFixture.replace('{betas:hU(iLs(Hs))}', '{betas:hU(iLs(Hx))}')],
      ['ambiguous real 2.1.232 closure', real232FastClosureFixture.replace('function snapshot(', 'function duplicate(no,le,existing){let us=[...existing];let cc=nJf({hasThinking:!0}),Ls=zCi(y),os;if(uu()&&j3()&&!aFe()&&TC(y)&&!!no.fastMode)os="fast";if(le&&!us.includes(o0r))us.push(o0r);let rh=Hn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Hs=rh?us.filter((nn)=>nn===dEt):us;let re=!0;let Wa={model:y,...re&&(!rh||Hs.length>0)&&{betas:hU(iLs(Hs))},...os!==void 0&&{speed:os}};return Wa}\nfunction snapshot(')],
      ['inconsistent real 2.1.232 capability list', real232FastClosureFixture.replace('if(le&&!us.includes(o0r))us.push(o0r)', 'if(le&&!uj.includes(o0r))uj.push(o0r)')],
      ['mismatched real 2.1.232 speed variable', real232FastClosureFixture.replace('...os!==void 0&&{speed:os}', '...os!==void 0&&{speed:oq}')],
      ['mismatched real 2.1.232 Fast registration', real232FastClosureFixture.replace('o0r=LA("speed","fast-mode-2026-02-01")', 'o0r=LA("speed","fast-mode-2027-01-01")')],
    ];
    for (const [label, invalidFixture] of invalid232Fixtures) {
      writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
      const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const invalidOutput = invalid.stdout + invalid.stderr;
      assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
      assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
      assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
      assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
    }
    writeFileSync(join(dir, 'cli.original.cjs'), real232WinFastClosureFixture, 'utf8');
    const real232Win = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const real232WinOutput = real232Win.stdout + real232Win.stderr;
    assert.equal(real232Win.status, 0, `${name}: real win32 2.1.232 closure must patch: ${real232WinOutput}`);
    assert.match(real232WinOutput, /Fast Messages protocol \(1 replacement\)/, `${name}: real win32 2.1.232 closure must report its replacement`);
    const real232WinAfter = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.notEqual(real232WinAfter, real232WinFastClosureFixture, `${name}: real win32 2.1.232 closure patch must write`);
    assert.match(real232WinAfter, /__clawgod_fast_messages_protocol__/, `${name}: real win32 2.1.232 closure patch must add the idempotency marker`);
    assert.match(real232WinAfter, /betas:\(\(\)=>\{/, `${name}: real win32 2.1.232 closure must rewrite the betas body field`);
    assert.doesNotMatch(real232WinAfter, /\{betas:_B\(sLs\(Ls\)\)\}/, `${name}: real win32 2.1.232 closure must replace the raw betas field`);
    const executeReal232Win = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    try {
      assert.equal(executeReal232Win.status, 0, `${name}: real win32 2.1.232 fixture must execute: ${executeReal232Win.stderr}`);
      assertReal232Protocol(name, JSON.parse(executeReal232Win.stdout));
    } catch (error) {
      real232WinResults.push({ name, status: real232Win.status, protocolError: error instanceof Error ? error.message : String(error), output: real232WinOutput });
      throw error;
    }
    real232WinResults.push({ name, status: real232Win.status, protocolError: null, output: real232WinOutput });

    const real232WinRerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(real232WinRerun.status, 0, `${name}: patched real win32 2.1.232 closure must re-run cleanly: ${real232WinRerun.stdout}${real232WinRerun.stderr}`);
    assert.match(real232WinRerun.stdout + real232WinRerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: win32 2.1.232 re-run must recognize the idempotency marker`);

    writeFileSync(join(dir, 'cli.original.cjs'), real232WinFastClosureFixture, 'utf8');
    const verifyReal232Win = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const verifyReal232WinOutput = verifyReal232Win.stdout + verifyReal232Win.stderr;
    assert.equal(verifyReal232Win.status, 0, `${name}: ${verifyReal232WinOutput}`);
    assert.match(verifyReal232WinOutput, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${name}: verify must report the unapplied real win32 2.1.232 match`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), real232WinFastClosureFixture, `${name}: verify must not write the real win32 2.1.232 closure`);

    const invalid232WinFixtures = [
      ['mismatched real win32 2.1.232 betas source', real232WinFastClosureFixture.replace('{betas:_B(sLs(Ls))}', '{betas:_B(sLs(Lx))}')],
      ['ambiguous real win32 2.1.232 closure', real232WinFastClosureFixture.replace('function snapshot(', 'function duplicate(no,le,existing){let us=[...existing];let cc=nJf({hasThinking:!0}),Os=zCi(y),os;if(uu()&&Wz()&&!aFe()&&ET(y)&&!!no.fastMode)os="fast";if(le&&!us.includes(rAr))us.push(rAr);let th=Ln(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Ls=th?us.filter((nn)=>nn===c0t):us;let re=!0;let Wa={model:y,...re&&(!th||Ls.length>0)&&{betas:_B(sLs(Ls))},...os!==void 0&&{speed:os}};return Wa}\nfunction snapshot(')],
      ['inconsistent real win32 2.1.232 capability list', real232WinFastClosureFixture.replace('if(le&&!us.includes(rAr))us.push(rAr)', 'if(le&&!uj.includes(rAr))uj.push(rAr)')],
      ['mismatched real win32 2.1.232 speed variable', real232WinFastClosureFixture.replace('...os!==void 0&&{speed:os}', '...os!==void 0&&{speed:oq}')],
      ['mismatched real win32 2.1.232 Fast registration', real232WinFastClosureFixture.replace('rAr=Lx("speed","fast-mode-2026-02-01")', 'rAr=Lx("speed","fast-mode-2027-01-01")')],
    ];
    for (const [label, invalidFixture] of invalid232WinFixtures) {
      writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
      const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const invalidOutput = invalid.stdout + invalid.stderr;
      assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
      assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
      assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
      assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
    }
    const real233Variants = [
      {
        label: 'linux 2.1.233',
        fixture: real233LinuxFastClosureFixture,
        ambiguousDuplicate: 'function duplicate(ho,ce,existing){let ji=[...existing];let cc=nJf({hasThinking:!0}),Iu=zCi(y),ps;if(Tu()&&Xz()&&!SBe()&&L0(y)&&!!ho.fastMode)ps="fast";if(ce&&!ji.includes(QHr))ji.push(QHr);let Vc=Mn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Sa=Vc?ji.filter((Hs)=>Hs===XAt):ji;let ne=!0;let Rd={model:y,...ne&&(!Vc||Sa.length>0)&&{betas:vU(l1s(Sa))},...ps!==void 0&&{speed:ps}};return Rd}\nfunction snapshot(',
        invalidCaps: ['if(ce&&!ji.includes(QHr))ji.push(QHr)', 'if(ce&&!jq.includes(QHr))jq.push(QHr)'],
        invalidRegistration: ['QHr=jk("speed","fast-mode-2026-02-01")', 'QHr=jk("speed","fast-mode-2027-01-01")'],
        rawBetas: /\{betas:vU\(l1s\(Sa\)\)\}/,
      },
      {
        label: 'win32 2.1.233',
        fixture: real233WinFastClosureFixture,
        ambiguousDuplicate: 'function duplicate(ho,ce,existing){let ji=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),ps;if(ku()&&Qz()&&!wFe()&&PT(y)&&!!ho.fastMode)ps="fast";if(ce&&!ji.includes(XAr))ji.push(XAr);let qc=On(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Sa=qc?ji.filter((Ts)=>Ts===Y0t):ji;let ne=!0;let Id={model:y,...ne&&(!qc||Sa.length>0)&&{betas:TB(uNs(Sa))},...ps!==void 0&&{speed:ps}};return Id}\nfunction snapshot(',
        invalidCaps: ['if(ce&&!ji.includes(XAr))ji.push(XAr)', 'if(ce&&!jq.includes(XAr))jq.push(XAr)'],
        invalidRegistration: ['XAr=zx("speed","fast-mode-2026-02-01")', 'XAr=zx("speed","fast-mode-2027-01-01")'],
        rawBetas: /\{betas:TB\(uNs\(Sa\)\)\}/,
      },
    ];
    for (const variant of real233Variants) {
      writeFileSync(join(dir, 'cli.original.cjs'), variant.fixture, 'utf8');
      const real233 = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const real233Output = real233.stdout + real233.stderr;
      assert.equal(real233.status, 0, `${name}: ${variant.label} closure must patch: ${real233Output}`);
      assert.match(real233Output, /Fast Messages protocol \(1 replacement\)/, `${name}: ${variant.label} closure must report its replacement`);
      const real233After = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
      assert.notEqual(real233After, variant.fixture, `${name}: ${variant.label} closure patch must write`);
      assert.match(real233After, /__clawgod_fast_messages_protocol__/, `${name}: ${variant.label} closure patch must add the idempotency marker`);
      assert.match(real233After, /betas:\(\(\)=>\{/, `${name}: ${variant.label} closure must rewrite the betas body field`);
      assert.doesNotMatch(real233After, variant.rawBetas, `${name}: ${variant.label} closure must replace the raw betas field`);
      const executeReal233 = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
      try {
        assert.equal(executeReal233.status, 0, `${name}: ${variant.label} fixture must execute: ${executeReal233.stderr}`);
        assertReal232Protocol(name, JSON.parse(executeReal233.stdout));
      } catch (error) {
        real233Results.push({ name, label: variant.label, status: real233.status, protocolError: error instanceof Error ? error.message : String(error), output: real233Output });
        throw error;
      }
      real233Results.push({ name, label: variant.label, status: real233.status, protocolError: null, output: real233Output });

      const real233Rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      assert.equal(real233Rerun.status, 0, `${name}: patched ${variant.label} closure must re-run cleanly: ${real233Rerun.stdout}${real233Rerun.stderr}`);
      assert.match(real233Rerun.stdout + real233Rerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: ${variant.label} re-run must recognize the idempotency marker`);

      const invalid233Fixtures = [
        [`ambiguous ${variant.label} closure`, variant.fixture.replace('function snapshot(', variant.ambiguousDuplicate)],
        [`inconsistent ${variant.label} capability list`, variant.fixture.replace(variant.invalidCaps[0], variant.invalidCaps[1])],
        [`mismatched ${variant.label} Fast registration`, variant.fixture.replace(variant.invalidRegistration[0], variant.invalidRegistration[1])],
      ];
      for (const [label, invalidFixture] of invalid233Fixtures) {
        writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
        const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
        const invalidOutput = invalid.stdout + invalid.stderr;
        assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
        assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
        assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
        assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
      }
    }
    writeFileSync(join(dir, 'cli.original.cjs'), real234FastClosureFixture, 'utf8');
    const real234 = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const real234Output = real234.stdout + real234.stderr;
    assert.equal(real234.status, 0, `${name}: real darwin 2.1.234 closure must patch: ${real234Output}`);
    assert.match(real234Output, /Fast Messages protocol \(1 replacement\)/, `${name}: real darwin 2.1.234 closure must report its replacement`);
    const real234After = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.notEqual(real234After, real234FastClosureFixture, `${name}: real darwin 2.1.234 closure patch must write`);
    assert.match(real234After, /__clawgod_fast_messages_protocol__/, `${name}: real darwin 2.1.234 closure patch must add the idempotency marker`);
    assert.match(real234After, /betas:\(\(\)=>\{/, `${name}: real darwin 2.1.234 closure must rewrite the betas body field`);
    assert.doesNotMatch(real234After, /\{betas:y4\(H3s\(Qp\)\)\}/, `${name}: real darwin 2.1.234 closure must replace the raw betas field`);
    const executeReal234 = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    try {
      assert.equal(executeReal234.status, 0, `${name}: real darwin 2.1.234 fixture must execute: ${executeReal234.stderr}`);
      assertReal232Protocol(name, JSON.parse(executeReal234.stdout));
    } catch (error) {
      real234Results.push({ name, status: real234.status, protocolError: error instanceof Error ? error.message : String(error), output: real234Output });
      throw error;
    }
    real234Results.push({ name, status: real234.status, protocolError: null, output: real234Output });

    const real234Rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(real234Rerun.status, 0, `${name}: patched real darwin 2.1.234 closure must re-run cleanly: ${real234Rerun.stdout}${real234Rerun.stderr}`);
    assert.match(real234Rerun.stdout + real234Rerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: darwin 2.1.234 re-run must recognize the idempotency marker`);

    writeFileSync(join(dir, 'cli.original.cjs'), real234FastClosureFixture, 'utf8');
    const verifyReal234 = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const verifyReal234Output = verifyReal234.stdout + verifyReal234.stderr;
    assert.equal(verifyReal234.status, 0, `${name}: ${verifyReal234Output}`);
    assert.match(verifyReal234Output, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${name}: verify must report the unapplied real darwin 2.1.234 match`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), real234FastClosureFixture, `${name}: verify must not write the real darwin 2.1.234 closure`);

    const invalid234Fixtures = [
      ['mismatched real 2.1.234 betas source', real234FastClosureFixture.replace('{betas:y4(H3s(Qp))}', '{betas:y4(H3s(Qx))}')],
      ['ambiguous real 2.1.234 closure', real234FastClosureFixture.replace('function snapshot(', 'function duplicate(ho,ce,existing){let bi=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),Uu;if(ku()&&G3()&&!vBe()&&yk(y)&&!!ho.fastMode)Uu="fast";if(ce&&!bi.includes(hxr))bi.push(hxr);let Kc=Hn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Qp=Kc?bi.filter((Ts)=>Ts===XAt):bi;let ee=!0;let j_={model:y,...ee&&(!Kc||Qp.length>0)&&{betas:y4(H3s(Qp))},...Uu!==void 0&&{speed:Uu}};return j_}\nfunction snapshot(')],
      ['inconsistent real 2.1.234 capability list', real234FastClosureFixture.replace('if(ce&&!bi.includes(hxr))bi.push(hxr)', 'if(ce&&!bj.includes(hxr))bj.push(hxr)')],
      ['mismatched real 2.1.234 speed variable', real234FastClosureFixture.replace('...Uu!==void 0&&{speed:Uu}', '...Uu!==void 0&&{speed:Uq}')],
      ['mismatched real 2.1.234 Fast registration', real234FastClosureFixture.replace('hxr=ER("speed","fast-mode-2026-02-01")', 'hxr=ER("speed","fast-mode-2027-01-01")')],
    ];
    for (const [label, invalidFixture] of invalid234Fixtures) {
      writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
      const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const invalidOutput = invalid.stdout + invalid.stderr;
      assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
      assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
      assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
      assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
    }
    const real234PlatformVariants = [
      {
        label: 'linux 2.1.234',
        fixture: real234LinuxFastClosureFixture,
        ambiguousDuplicate: 'function duplicate(ho,ce,existing){let bi=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),Uu;if(Tu()&&W4()&&!b2e()&&yT(y)&&!!ho.fastMode)Uu="fast";if(ce&&!bi.includes(gxr))bi.push(gxr);let Kc=$n(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Qp=Kc?bi.filter((od)=>od===rkt):bi;let ee=!0;let j_={model:y,...ee&&(!Kc||Qp.length>0)&&{betas:gj(P4s(Qp))},...Uu!==void 0&&{speed:Uu}};return j_}\nfunction snapshot(',
        invalidCaps: ['if(ce&&!bi.includes(gxr))bi.push(gxr)', 'if(ce&&!bj.includes(gxr))bj.push(gxr)'],
        invalidRegistration: ['gxr=AC("speed","fast-mode-2026-02-01")', 'gxr=AC("speed","fast-mode-2027-01-01")'],
        rawBetas: /\{betas:gj\(P4s\(Qp\)\)\}/,
      },
      {
        label: 'win32 2.1.234',
        fixture: real234WinFastClosureFixture,
        ambiguousDuplicate: 'function duplicate(ho,ce,existing){let bi=[...existing];let cc=nJf({hasThinking:!0}),Hu=zCi(y),Bu;if(ku()&&K4()&&!vUe()&&yk(y)&&!!ho.fastMode)Bu="fast";if(ce&&!bi.includes(mRr))bi.push(mRr);let Kc=Ln(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Qp=Kc?bi.filter((od)=>od===ext):bi;let ee=!0;let B_={model:y,...ee&&(!Kc||Qp.length>0)&&{betas:vj(L4s(Qp))},...Bu!==void 0&&{speed:Bu}};return B_}\nfunction snapshot(',
        invalidCaps: ['if(ce&&!bi.includes(mRr))bi.push(mRr)', 'if(ce&&!bj.includes(mRr))bj.push(mRr)'],
        invalidRegistration: ['mRr=TC("speed","fast-mode-2026-02-01")', 'mRr=TC("speed","fast-mode-2027-01-01")'],
        rawBetas: /\{betas:vj\(L4s\(Qp\)\)\}/,
      },
    ];
    for (const variant of real234PlatformVariants) {
      writeFileSync(join(dir, 'cli.original.cjs'), variant.fixture, 'utf8');
      const real234p = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const real234pOutput = real234p.stdout + real234p.stderr;
      assert.equal(real234p.status, 0, `${name}: ${variant.label} closure must patch: ${real234pOutput}`);
      assert.match(real234pOutput, /Fast Messages protocol \(1 replacement\)/, `${name}: ${variant.label} closure must report its replacement`);
      const real234pAfter = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
      assert.notEqual(real234pAfter, variant.fixture, `${name}: ${variant.label} closure patch must write`);
      assert.match(real234pAfter, /__clawgod_fast_messages_protocol__/, `${name}: ${variant.label} closure patch must add the idempotency marker`);
      assert.match(real234pAfter, /betas:\(\(\)=>\{/, `${name}: ${variant.label} closure must rewrite the betas body field`);
      assert.doesNotMatch(real234pAfter, variant.rawBetas, `${name}: ${variant.label} closure must replace the raw betas field`);
      const executeReal234p = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
      try {
        assert.equal(executeReal234p.status, 0, `${name}: ${variant.label} fixture must execute: ${executeReal234p.stderr}`);
        assertReal232Protocol(name, JSON.parse(executeReal234p.stdout));
      } catch (error) {
        real234PlatformResults.push({ name, label: variant.label, status: real234p.status, protocolError: error instanceof Error ? error.message : String(error), output: real234pOutput });
        throw error;
      }
      real234PlatformResults.push({ name, label: variant.label, status: real234p.status, protocolError: null, output: real234pOutput });

      const real234pRerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      assert.equal(real234pRerun.status, 0, `${name}: patched ${variant.label} closure must re-run cleanly: ${real234pRerun.stdout}${real234pRerun.stderr}`);
      assert.match(real234pRerun.stdout + real234pRerun.stderr, /Fast Messages protocol \(already applied\)/, `${name}: ${variant.label} re-run must recognize the idempotency marker`);

      const invalid234pFixtures = [
        [`ambiguous ${variant.label} closure`, variant.fixture.replace('function snapshot(', variant.ambiguousDuplicate)],
        [`inconsistent ${variant.label} capability list`, variant.fixture.replace(variant.invalidCaps[0], variant.invalidCaps[1])],
        [`mismatched ${variant.label} Fast registration`, variant.fixture.replace(variant.invalidRegistration[0], variant.invalidRegistration[1])],
      ];
      for (const [label, invalidFixture] of invalid234pFixtures) {
        writeFileSync(join(dir, 'cli.original.cjs'), invalidFixture, 'utf8');
        const invalid = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
        const invalidOutput = invalid.stdout + invalid.stderr;
        assert.notEqual(invalid.status, 0, `${name}: ${label} must fail`);
        assert.match(invalidOutput, /Fast Messages protocol/, `${name}: ${label} must report Fast Messages protocol`);
        assert.match(invalidOutput, /Result: \d+ applied, \d+ skipped, 1 failed/, `${name}: ${label} must increment failed gate`);
        assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), invalidFixture, `${name}: ${label} must not write`);
      }
    }
    // Fast mode org-check bypass: forcing the skip helper to `true` unlocks the
    // `/fast` toggle when the "penguin mode" org-status check is unreachable.
    writeFileSync(join(dir, 'cli.original.cjs'), fastModeOrgCheckFixture, 'utf8');
    const orgCheck = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const orgCheckOutput = orgCheck.stdout + orgCheck.stderr;
    assert.equal(orgCheck.status, 0, `${name}: fast mode org check must patch: ${orgCheckOutput}`);
    assert.match(orgCheckOutput, /Fast mode org check bypass \(1 replacement\)/, `${name}: fast mode org check must report its replacement`);
    const orgCheckAfter = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.match(orgCheckAfter, /function g0o\(\)\{return!0\/\*__clawgod_fast_mode_org_check_bypass__\*\/\}/, `${name}: fast mode org check must force the skip helper to true`);
    const orgCheckExecute = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(orgCheckExecute.status, 0, `${name}: fast mode org check fixture must execute: ${orgCheckExecute.stderr}`);
    assert.equal(orgCheckExecute.stdout.trim(), 'true', `${name}: patched skip helper must evaluate to true`);

    const orgCheckRerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(orgCheckRerun.status, 0, `${name}: patched fast mode org check must re-run cleanly: ${orgCheckRerun.stdout}${orgCheckRerun.stderr}`);
    assert.match(orgCheckRerun.stdout + orgCheckRerun.stderr, /Fast mode org check bypass \(already applied\)/, `${name}: re-run must recognize the idempotency marker`);

    writeFileSync(join(dir, 'cli.original.cjs'), fastModeOrgCheckFixture, 'utf8');
    const orgCheckVerify = spawnSync(process.execPath, ['patch.mjs', '--verify'], { cwd: dir, encoding: 'utf8' });
    const orgCheckVerifyOutput = orgCheckVerify.stdout + orgCheckVerify.stderr;
    assert.equal(orgCheckVerify.status, 0, `${name}: ${orgCheckVerifyOutput}`);
    assert.match(orgCheckVerifyOutput, /Fast mode org check bypass — 1 match\(es\), not yet applied/, `${name}: verify must report the unapplied fast mode org check match`);
    assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'), fastModeOrgCheckFixture, `${name}: verify must not write the fast mode org check fixture`);

    writeFileSync(join(dir, 'cli.original.cjs'), `${fixture}var Q={};\n`, 'utf8');
    const orgCheckMissing = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const orgCheckMissingOutput = orgCheckMissing.stdout + orgCheckMissing.stderr;
    assert.equal(orgCheckMissing.status, 0, `${name}: missing org-check helper must skip cleanly: ${orgCheckMissingOutput}`);
    assert.match(orgCheckMissingOutput, /Fast mode org check bypass \(not present in this version\)/, `${name}: missing org-check helper must report skipped`);

  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fastFailures = fastResults.filter((result) => result.protocolError !== null);
assert.equal(fastResults.length, 2, 'Fast Messages protocol fixture must run both installer patchers');
assert.equal(
  fastFailures.length,
  0,
  `Fast Messages protocol patch missing for upstream ${FAST_FIXTURE_VERSION}:\n${fastResults.map((result) =>
    `${result.name}: patch=${result.patchStatus}, execute=${result.executeStatus}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);
assert.equal(real229Results.length, 2, 'real 2.1.229 closure must execute both patcher variants');
assert.equal(
  real229Results.filter((result) => result.protocolError !== null).length,
  0,
  `real 2.1.229 forced passthrough protocol missing:\n${real229Results.map((result) =>
    `${result.name}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);
assert.equal(real229ZeResults.length, 2, 'real 2.1.229 Ze closure must execute both patcher variants');
assert.equal(
  real229ZeResults.filter((result) => result.protocolError !== null).length,
  0,
  `real 2.1.229 Ze forced passthrough protocol missing:\n${real229ZeResults.map((result) =>
    `${result.name}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);

assert.equal(real232Results.length, 2, 'real 2.1.232 closure must execute both patcher variants');
assert.equal(
  real232Results.filter((result) => result.protocolError !== null).length,
  0,
  `real 2.1.232 forced passthrough protocol missing:\n${real232Results.map((result) =>
    `${result.name}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);

assert.equal(real232WinResults.length, 2, 'real win32 2.1.232 closure must execute both patcher variants');
assert.equal(
  real232WinResults.filter((result) => result.protocolError !== null).length,
  0,
  `real win32 2.1.232 forced passthrough protocol missing:\n${real232WinResults.map((result) =>
    `${result.name}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);

assert.equal(real233Results.length, 4, 'real 2.1.233 closures must execute both patcher variants per platform');
assert.equal(
  real233Results.filter((result) => result.protocolError !== null).length,
  0,
  `real 2.1.233 forced passthrough protocol missing:\n${real233Results.map((result) =>
    `${result.name}/${result.label}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);

assert.equal(real234Results.length, 2, 'real darwin 2.1.234 closure must execute both patcher variants');
assert.equal(
  real234Results.filter((result) => result.protocolError !== null).length,
  0,
  `real darwin 2.1.234 forced passthrough protocol missing:\n${real234Results.map((result) =>
    `${result.name}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);

assert.equal(real234PlatformResults.length, 4, 'real 2.1.234 platform closures must execute both patcher variants per platform');
assert.equal(
  real234PlatformResults.filter((result) => result.protocolError !== null).length,
  0,
  `real 2.1.234 platform forced passthrough protocol missing:\n${real234PlatformResults.map((result) =>
    `${result.name}/${result.label}: patch=${result.status}, ${result.protocolError ?? 'ok'}`,
  ).join('\n')}`,
);

console.log('patcher 2.1.215 checks passed');
