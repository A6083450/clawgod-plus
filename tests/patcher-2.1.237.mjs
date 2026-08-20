#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const allConfig = '{\n  "schemaVersion": 1,\n  "mode": "all",\n  "enabled": []\n}\n';

const variants = [
  {
    label: 'darwin-arm64 2.1.237',
    helper: 'qR',
    holder: 'Le',
    caps: 'Tt',
    fastCapability: 'NDr',
    oauthCapability: 'Uxt',
    gate: 'Pu()&&xz()&&!pje()&&Uk(y)',
    envReader: 'Hn',
    simulatedProxy: 'Nd',
    betasSource: 'Fa',
    filterParam: 'Ss',
    serializer: 'e4',
    allowlist: 'dJs',
  },
  {
    label: 'linux-x64 2.1.237',
    helper: 'GC',
    holder: 'Me',
    caps: 'wt',
    fastCapability: 'NDr',
    oauthCapability: 'Fxt',
    gate: 'Ru()&&C5()&&!uje()&&UT(y)',
    envReader: '$n',
    simulatedProxy: 'Od',
    betasSource: 'Na',
    filterParam: 'vs',
    serializer: 'Qj',
    allowlist: 'cXs',
  },
  {
    label: 'win32-x64 2.1.237',
    helper: 'GC',
    holder: 'Oe',
    caps: 'wt',
    fastCapability: 'ODr',
    oauthCapability: '$Rt',
    gate: 'Iu()&&I3()&&!dje()&&Bk(y)',
    envReader: 'Ln',
    simulatedProxy: 'Nd',
    betasSource: '$a',
    filterParam: 'vs',
    serializer: 'oz',
    allowlist: 'dXs',
  },
];

function fixtureFor(variant) {
  const gateFunctions = variant.gate.match(/[\w$]+(?=\()/g);
  const [gateOne, gateTwo, gateThree, gateFour] = gateFunctions;
  return `
// Version: 2.1.237
function ${variant.helper}(name,header){return{name,header}}
let Alpha=${variant.helper}("alpha","existing-alpha"),Omega=${variant.helper}("omega","existing-omega"),${variant.oauthCapability}=${variant.helper}("oauth_auth","oauth"),${variant.fastCapability}=${variant.helper}("speed","fast-mode-2026-02-01");
let __firstParty=!1;
function ${variant.serializer}(values){return values.map((value)=>value.header)}
function ${variant.allowlist}(values){if(__firstParty)return values;return values.filter((value)=>value!==${variant.fastCapability})}
function ${variant.envReader}(){return!1}
function ${gateOne}(){return!0}function ${gateTwo}(){return!0}function ${gateThree}(){return!1}function ${gateFour}(){return!0}
let y="claude-opus-5",ee=!0,_e=!1;
function buildRequest(${variant.holder},eligibility,existing,firstParty){__firstParty=firstParty;_e=eligibility;let ${variant.caps}=[...existing],ju;if(${variant.gate}&&!!${variant.holder}.fastMode)ju="fast";if(_e&&!${variant.caps}.includes(${variant.fastCapability}))${variant.caps}.push(${variant.fastCapability});let ignored=null;ignored=ignored??{};let ${variant.simulatedProxy}=${variant.envReader}(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),${variant.betasSource}=${variant.simulatedProxy}?${variant.caps}.filter((${variant.filterParam})=>${variant.filterParam}===${variant.oauthCapability}):${variant.caps};let body={model:y,...ee&&(!${variant.simulatedProxy}||${variant.betasSource}.length>0)&&{betas:${variant.serializer}(${variant.allowlist}(${variant.betasSource}))},...ju!==void 0&&{speed:ju}};return body}
function snapshot(fastMode,eligibility,existing,firstParty){let body=buildRequest({fastMode},eligibility,existing,firstParty);return{betas:body.betas??null,speed:body.speed??null,header:body.betas?.join(",")??""}}
console.log(JSON.stringify({fastThirdParty:snapshot(!0,!1,[Alpha,Omega],!1),fastThirdPartyDedup:snapshot(!0,!1,[Alpha,Alpha,Omega,${variant.fastCapability}],!1),slowStickyFirstParty:snapshot(!1,!0,[Alpha],!0),slowPriorFirstParty:snapshot(!1,!1,[Alpha,${variant.fastCapability}],!0),fastFirstParty:snapshot(!0,!1,[],!0)}));
`;
}

function assertProtocol(label, output) {
  assert.deepEqual(output.fastThirdParty.betas, ['existing-alpha', 'existing-omega', 'fast-mode-2026-02-01'], `${label}: Fast third-party betas must force the Fast capability through the allowlist`);
  assert.equal(output.fastThirdParty.speed, 'fast', `${label}: Fast request must retain speed=fast`);
  assert.deepEqual(output.fastThirdPartyDedup.betas, ['existing-alpha', 'existing-omega', 'fast-mode-2026-02-01'], `${label}: Fast request betas must be fully deduplicated`);
  assert.deepEqual(output.slowStickyFirstParty.betas, ['existing-alpha'], `${label}: slow request must remove a sticky Fast capability`);
  assert.equal(output.slowStickyFirstParty.speed, null, `${label}: slow request must omit speed`);
  assert.deepEqual(output.slowPriorFirstParty.betas, ['existing-alpha'], `${label}: slow request must remove a previously supplied Fast capability`);
  assert.deepEqual(output.fastFirstParty.betas, ['fast-mode-2026-02-01'], `${label}: Fast first-party request must contain exactly one Fast capability`);
  assert.equal(output.fastFirstParty.header, 'fast-mode-2026-02-01', `${label}: SDK header input must contain the Fast capability`);
}

for (const [patcherLabel, patcherSource] of await getPatcherSources()) {
  const root = mkdtempSync(join(tmpdir(), 'clawgod-fast-2.1.237-'));
  try {
    const home = join(root, 'home');
    const clawgod = join(home, '.clawgod');
    const enhancementsFile = join(clawgod, 'enhancements.json');
    mkdirSync(clawgod, { recursive: true, mode: 0o700 });
    writeFileSync(enhancementsFile, allConfig, { mode: 0o600 });
    writeFileSync(join(root, 'patch.mjs'), patcherSource, 'utf8');
    seedPatcherAcorn(root);

    for (const variant of variants) {
      const fixture = fixtureFor(variant);
      const target = join(root, 'cli.original.cjs');
      writeFileSync(target, fixture, 'utf8');
      const verify = spawnSync(process.execPath, ['patch.mjs', '--verify', '--enhancements-file', enhancementsFile], { cwd: root, encoding: 'utf8' });
      const verifyOutput = verify.stdout + verify.stderr;
      assert.equal(verify.status, 0, `${patcherLabel}/${variant.label}: valid request closure must verify: ${verifyOutput}`);
      assert.match(verifyOutput, /Fast Messages protocol — 1 match\(es\), not yet applied/, `${patcherLabel}/${variant.label}: verify must report one unapplied Fast match`);
      assert.equal(readFileSync(target, 'utf8'), fixture, `${patcherLabel}/${variant.label}: verify must not write the target`);

      const patch = spawnSync(process.execPath, ['patch.mjs', '--enhancements-file', enhancementsFile], { cwd: root, encoding: 'utf8' });
      const patchOutput = patch.stdout + patch.stderr;
      assert.equal(patch.status, 0, `${patcherLabel}/${variant.label}: valid request closure must patch: ${patchOutput}`);
      assert.match(patchOutput, /Fast Messages protocol \(1 replacement\)/, `${patcherLabel}/${variant.label}: patch must report one Fast replacement`);
      const patched = readFileSync(target, 'utf8');
      assert.match(patched, /__clawgod_fast_messages_protocol__/, `${patcherLabel}/${variant.label}: patched request must contain the idempotency marker`);
      const execute = spawnSync(process.execPath, [target], { cwd: root, encoding: 'utf8' });
      assert.equal(execute.status, 0, `${patcherLabel}/${variant.label}: patched fixture must execute: ${execute.stderr}`);
      assertProtocol(`${patcherLabel}/${variant.label}`, JSON.parse(execute.stdout));

      const rerun = spawnSync(process.execPath, ['patch.mjs', '--enhancements-file', enhancementsFile], { cwd: root, encoding: 'utf8' });
      assert.equal(rerun.status, 0, `${patcherLabel}/${variant.label}: patched fixture must re-run cleanly: ${rerun.stdout}${rerun.stderr}`);
      assert.match(rerun.stdout + rerun.stderr, /Fast Messages protocol \(already applied\)/, `${patcherLabel}/${variant.label}: re-run must recognize the marker`);

      const invalidFixtures = [
        [
          'inconsistent capability list',
          fixture.replace(
            `if(_e&&!${variant.caps}.includes(${variant.fastCapability}))${variant.caps}.push(${variant.fastCapability})`,
            `if(_e&&!otherCaps.includes(${variant.fastCapability}))otherCaps.push(${variant.fastCapability})`,
          ),
        ],
        [
          'mismatched betas source',
          fixture.replace(
            `{betas:${variant.serializer}(${variant.allowlist}(${variant.betasSource}))}`,
            `{betas:${variant.serializer}(${variant.allowlist}(otherBetas))}`,
          ),
        ],
        [
          'mismatched speed variable',
          fixture.replace('{speed:ju}', '{speed:otherSpeed}'),
        ],
        [
          'mismatched Fast registration',
          fixture.replace('"fast-mode-2026-02-01"', '"fast-mode-2027-01-01"'),
        ],
      ];
      for (const [invalidLabel, invalidFixture] of invalidFixtures) {
        writeFileSync(target, invalidFixture, 'utf8');
        const invalid = spawnSync(process.execPath, ['patch.mjs', '--enhancements-file', enhancementsFile], { cwd: root, encoding: 'utf8' });
        assert.notEqual(invalid.status, 0, `${patcherLabel}/${variant.label}: ${invalidLabel} must fail`);
        assert.match(invalid.stdout + invalid.stderr, /Fast Messages protocol/, `${patcherLabel}/${variant.label}: ${invalidLabel} must name the failed patch`);
        assert.equal(readFileSync(target, 'utf8'), invalidFixture, `${patcherLabel}/${variant.label}: ${invalidLabel} must not write the target`);
      }

      const duplicateClosure = fixture.replace('function snapshot(', fixture.slice(fixture.indexOf('function buildRequest('), fixture.indexOf('function snapshot(')).replace('function buildRequest(', 'function duplicateRequest(') + 'function snapshot(');
      writeFileSync(target, duplicateClosure, 'utf8');
      const ambiguous = spawnSync(process.execPath, ['patch.mjs', '--enhancements-file', enhancementsFile], { cwd: root, encoding: 'utf8' });
      assert.notEqual(ambiguous.status, 0, `${patcherLabel}/${variant.label}: duplicate request closures must fail as ambiguous`);
      assert.match(ambiguous.stdout + ambiguous.stderr, /matched 2 times; refusing ambiguous patch/, `${patcherLabel}/${variant.label}: ambiguous match count must be reported`);
      assert.equal(readFileSync(target, 'utf8'), duplicateClosure, `${patcherLabel}/${variant.label}: ambiguous patch must not write the target`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('patcher 2.1.237 Fast Messages checks passed');
