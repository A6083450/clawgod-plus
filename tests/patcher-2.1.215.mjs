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
      'd6188a6bf0e57d3b3a9be3d4d99bfb85be9d48279ae9a49364fa30ef366264b0',
      `${name}: default-all representative output bytes must retain the reviewed compliance-first parity fingerprint`,
    );
    assert.match(patched, /function Bot\(\)\{return et\(ulu,null\)\}/, `${name}: getter must survive`);
    assert.match(patched, /function Jre\(\)\{return!1\}/, `${name}: intermediate functions must survive`);
    assert.match(patched, /function r5r\(\)\{return"api_key_auth"\}/, `${name}: adjacent functions must survive`);
    assert.match(
      patched,
      /function oQt\(\)\{return globalThis\.__clawgodPatches\?\.\["ultrareview-gate"\]!==!1\?!0:\(Bot\(\)\?\.enabled===!0&&ru\(\)&&!X6\(\)\)\}/,
      `${name}: Ultrareview must preserve its exact original gate when disabled`,
    );
    assert.match(
      patched,
      /function Sub\(\)\{if\(globalThis\.__clawgodPatches\?\.\["computer-use-sub"\]!==!1\)return!0;let plan=currentPlan\(\);return plan==="max"\|\|plan==="pro"\}/,
      `${name}: Computer Use subscription must retain exact disabled semantics`,
    );
    assert.match(
      patched,
      /function AA6\(\)\{if\(vo5\("hipaa"\)\)return!1;if\(globalThis\.__clawgodPatches\?\.\["computer-use"\]!==!1&&process\.env\.CLAUDE_CODE_COMPUTER_USE\)return!0;if\(globalThis\.__clawgodPatches\?\.\["computer-use-gate"\]!==!1\)return!0;\/\*__clawgod_computer_use_gate_v2__\*\/return zQ\(\)&&oL8\(\)\.enabled\}/,
      `${name}: Computer Use gate must retain exact disabled semantics`,
    );
    assert.match(patched, /function teams\(\)\{if\(globalThis\.__clawgodPatches\?\.\["agent-teams"\]!==!1\)return!0;/, `${name}: Agent Teams must be runtime gated`);
    assert.match(patched, /argumentHint:"<prompt>",isEnabled:\(\)=>globalThis\.__clawgodPatches\?\.\["ultraplan"\]!==!1\?!0:!1/, `${name}: planning must be runtime gated`);
    assert.match(patched, /function voice\(\)\{return globalThis\.__clawgodPatches\?\.\["voice-mode"\]!==!1\?!0:/, `${name}: voice mode must be runtime gated`);
    assert.match(patched, /function autoProvider\(e\)\{if\(globalThis\.__clawgodPatches\?\.\["auto-mode-provider-opt-in"\]!==!1\)return!0;/, `${name}: auto mode must be runtime gated`);
    assert.match(patched, /clawd_body:globalThis\.__clawgodPatches\?\.\["theme-logo-rgb"\]!==!1\?"rgb\(34,197,94\)":"rgb\(215,119,87\)"/, `${name}: branding must be runtime gated`);
    assert.match(patched, /hex:globalThis\.__clawgodPatches\?\.\["theme-hex"\]!==!1\?"#22c55e":'#da7756'/, `${name}: branding hex must be runtime gated`);
    assert.match(patched, /const risk=globalThis\.__clawgodPatches\?\.\["remove-cyber-risk"\]!==!1\?"":"IMPORTANT:/, `${name}: security-research permissions must be runtime gated`);
    assert.match(patched, /function careful\(\)\{if\(globalThis\.__clawgodPatches\?\.\["remove-cautious-actions"\]!==!1\)return``;/, `${name}: cautious-action restriction must be runtime gated`);
    assert.match(patched, /const login=\(globalThis\.__clawgodPatches\?\.\["remove-not-logged-in"\]!==!1\?"":'Not logged in/, `${name}: authentication notice must be runtime gated`);
    assert.match(patched, /if\(\(globalThis\.__clawgodPatches\?\.\["attachment-filter-bypass"\]!==!1\?!1:userType\(\)!=="ant"\)&&types\.has/, `${name}: attachment permissions must be runtime gated`);
    assert.match(patched, /function privateDate\(e\)\{if\(globalThis\.__clawgodPatches\?\.\["geo-stego-date"\]!==!1\)return`Today's date is \$\{e\}\.\`;/, `${name}: privacy date must be runtime gated`);
    assert.doesNotMatch(firstOutput, /(?:❌|XX) Ultrareview enable/, `${name}: no stale Ultrareview error`);
    assert.doesNotMatch(
      firstOutput,
      /(?:⚠️|!!) Computer Use gate bypass/,
      `${name}: no unverifiable Computer Use alternative`,
    );
    assert.match(firstOutput, /Result: 26 applied, 53 skipped, 0 failed/, `${name}: default-all summary must include optional classifier and terminal descriptors`);
    assert.match(firstOutput, /Enhancements: 21 enabled, 0 disabled/, `${name}: default-all enhancement summary must be stable`);



  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher 2.1.215 checks passed');
