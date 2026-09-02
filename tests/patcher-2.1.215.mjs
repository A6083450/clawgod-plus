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
    assert.match(firstOutput, /Result: 25 applied, 37 skipped, 0 failed/, `${name}: default-all summary must exclude removed Fast patches`);
    assert.match(firstOutput, /Enhancements: 14 enabled, 0 disabled/, `${name}: default-all enhancement summary must be stable`);



  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher 2.1.215 checks passed');
