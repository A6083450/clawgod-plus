#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const unixInstaller = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function extractUnixPatcher() {
  const marker = 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'';
  const start = unixInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed patch.mjs');
  const bodyStart = unixInstaller.indexOf('\n', start) + 1;
  const end = unixInstaller.indexOf('\nPATCHER_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh patcher heredoc must end');
  return unixInstaller.slice(bodyStart, end);
}

function extractPowerShellPatcher() {
  const marker = "$patcherCode = @'\n";
  const start = powerShellInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must embed patch.mjs');
  const bodyStart = start + marker.length;
  const end = powerShellInstaller.indexOf("\n'@\n\nSet-Content", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 patcher here-string must end');
  return powerShellInstaller.slice(bodyStart, end);
}

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

for (const [name, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-2.1.215-'));
  try {
    writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const firstOutput = first.stdout + first.stderr;
    assert.equal(first.status, 0, `${name}: ${firstOutput}`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
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
    assert.doesNotMatch(firstOutput, /(?:❌|XX) Ultrareview enable/, `${name}: no stale Ultrareview error`);
    assert.doesNotMatch(
      firstOutput,
      /(?:⚠️|!!) Computer Use gate bypass/,
      `${name}: no unverifiable Computer Use alternative`,
    );
    assert.match(firstOutput, /Result: \d+ applied, \d+ skipped, 0 failed/, `${name}: no patch failures`);

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

console.log('patcher 2.1.215 checks passed');
