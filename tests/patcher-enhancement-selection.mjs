#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const allConfig = '{\n  "schemaVersion": 1,\n  "mode": "all",\n  "enabled": []\n}\n';

function customConfig(enabled) {
  return `${JSON.stringify({ schemaVersion: 1, mode: 'custom', enabled }, null, 2)}\n`;
}

function assertTemporaryPath(path, parent, label) {
  const resolvedParent = realpathSync(parent);
  const resolvedPath = realpathSync(path);
  const child = relative(resolvedParent, resolvedPath);
  assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child), `${label} must stay under its fixture root`);
}

const representativeFixture = `
Version: 2.1.215
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

const agentsFixture = `
Version: 2.1.215
function teamGate(){if(!enabled(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)&&!local())return!1;if(!flag("tengu_amber_flint",!0))return!1;return!0}
function defaultView(){let mode="chat",allowed=["chat","agents"];return mode}
function chromeState(){return settings()?.claudeInChrome?.enabled??false}
`;

function runSelectionCase(name, patcherSource, label, configBytes, source, extraArgs = []) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `clawgod patch selection ${label} `));
  const home = join(fixtureRoot, `home with "quotes" and 'spaces'`);
  const clawgod = join(home, '.clawgod');
  const enhancementsFile = join(clawgod, 'enhancements.json');
  try {
    assert.equal(realpathSync(dirname(fixtureRoot)), realpathSync(tmpdir()), 'patch selection fixture must be created directly under the system temporary directory');
    mkdirSync(clawgod, { recursive: true, mode: 0o700 });
    const fixtureBin = join(fixtureRoot, 'fixture-only-bin');
    mkdirSync(fixtureBin);
    assertTemporaryPath(home, fixtureRoot, 'patch selection HOME');
    assertTemporaryPath(fixtureBin, fixtureRoot, 'patch selection PATH');
    seedPatcherAcorn(fixtureRoot);
    writeFileSync(join(fixtureRoot, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(fixtureRoot, 'cli.original.cjs'), source, 'utf8');
    writeFileSync(enhancementsFile, configBytes, { mode: 0o600 });
    const run = spawnSync(process.execPath, ['patch.mjs', ...extraArgs, '--enhancements-file', enhancementsFile], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: fixtureBin,
        TMPDIR: fixtureRoot,
        BUN_INSTALL_CACHE_DIR: join(fixtureRoot, 'bun-install-cache'),
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(fixtureRoot, 'bun-transpiler-cache'),
        XDG_CACHE_HOME: join(fixtureRoot, 'xdg-cache'),
      },
    });
    return {
      fixtureRoot,
      enhancementsFile,
      original: source,
      output: `${run.stdout}${run.stderr}`,
      patched: readFileSync(join(fixtureRoot, 'cli.original.cjs'), 'utf8'),
      backupExists: existsSync(join(fixtureRoot, 'cli.original.cjs.bak')),
      run,
      name,
    };
  } catch (error) {
    rmSync(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

for (const [name, patcherSource] of await getPatcherSources()) {
  {
    const result = runSelectionCase(name, patcherSource, 'all', allConfig, representativeFixture);
    try {
      assert.equal(result.run.status, 0, `${name}: all selection must patch cleanly: ${result.output}`);
      assert.match(result.output, /Enhancements: 14 enabled, 0 disabled/, `${name}: all summary must be exact`);
      assert.match(result.patched, /function teams\(\)\{return!0\}/, `${name}: all must enable agents`);
      assert.match(result.patched, /clawd_body:"rgb\(34,197,94\)"/, `${name}: all must enable branding`);
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const result = runSelectionCase(
      name,
      patcherSource,
      'subset',
      customConfig(['computer-use', 'planning', 'branding']),
      representativeFixture,
    );
    try {
      assert.equal(result.run.status, 0, `${name}: subset must patch cleanly: ${result.output}`);
      assert.match(result.output, /Enhancements: 3 enabled, 11 disabled/, `${name}: subset summary must be exact`);
      assert.match(result.patched, /function Sub\(\)\{\/\*__clawgod_computer_use_subscription__\*\/return!0\}/, `${name}: subset must apply computer-use`);
      assert.match(result.patched, /argumentHint:"<prompt>",isEnabled:\(\)=>!0/, `${name}: subset must apply planning`);
      assert.match(result.patched, /clawd_body:"rgb\(34,197,94\)"/, `${name}: subset must apply branding`);
      assert.match(result.patched, /function teams\(\)\{if\(!enabled/, `${name}: disabled agents must not be patched`);
      assert.match(result.patched, /function voice\(\)\{return!flag/, `${name}: disabled voice must not be patched`);
      assert.match(result.patched, /const risk="IMPORTANT:/, `${name}: disabled unrestricted-tools must not be patched`);
      assert.doesNotMatch(result.output, /Agent Teams enable|Voice Mode enable|Security permissions unrestricted/, `${name}: disabled descriptors must not be searched or reported`);
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const result = runSelectionCase(name, patcherSource, 'agents-only', customConfig(['agents']), agentsFixture);
    try {
      assert.equal(result.run.status, 0, `${name}: agents without chrome must be valid: ${result.output}`);
      assert.match(result.output, /Enhancements: 1 enabled, 13 disabled/, `${name}: agents-only summary must be exact`);
      assert.match(result.patched, /function teamGate\(\)\{return!0\}/, `${name}: agents selection must apply agents descriptors`);
      assert.match(result.patched, /let mode="chat"/, `${name}: agents without chrome must retain chat default`);
      assert.match(result.patched, /claudeInChrome/, `${name}: agents must not silently enable chrome patches`);
      assert.doesNotMatch(result.output, /Default Agents view|Claude in Chrome agents config state/, `${name}: dependency-disabled and disabled descriptors must not be searched`);
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const result = runSelectionCase(name, patcherSource, 'none', customConfig([]), representativeFixture);
    try {
      assert.equal(result.run.status, 0, `${name}: none/core-only must patch cleanly: ${result.output}`);
      assert.match(result.output, /Enhancements: 0 enabled, 14 disabled/, `${name}: none summary must be exact`);
      assert.match(result.patched, /function teams\(\)\{if\(!enabled/, `${name}: none must leave agents untouched`);
      assert.match(result.patched, /clawd_body:"rgb\(215,119,87\)"/, `${name}: none must leave branding untouched`);
      assert.doesNotMatch(result.output, /Agent Teams enable|Brand RGB green/, `${name}: none must not search disabled descriptors`);
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }

  for (const mode of ['--dry-run', '--verify']) {
    const result = runSelectionCase(
      name,
      patcherSource,
      mode.slice(2),
      customConfig(['branding']),
      representativeFixture,
      [mode],
    );
    try {
      assert.equal(result.run.status, 0, `${name}: ${mode} with saved selection must succeed: ${result.output}`);
      assert.match(result.output, /Enhancements: 1 enabled, 13 disabled/, `${name}: ${mode} summary must be exact`);
      assert.equal(result.patched, result.original, `${name}: ${mode} must not write the runtime`);
      assert.equal(result.backupExists, false, `${name}: ${mode} must not create a runtime backup`);
      assert.doesNotMatch(result.output, /Agent Teams enable|Voice Mode enable|Security permissions unrestricted/, `${name}: ${mode} must not report disabled descriptors`);
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const invalid = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "unknown"\n  ]\n}\n';
    const result = runSelectionCase(name, patcherSource, 'invalid', invalid, representativeFixture);
    try {
      assert.notEqual(result.run.status, 0, `${name}: unknown config must fail closed`);
      assert.equal(result.patched, result.original, `${name}: config must resolve before any patch write`);
      assert.equal(result.backupExists, false, `${name}: invalid config must not create a patch backup`);
      assert.doesNotMatch(result.output, /Result:/, `${name}: invalid config must fail before patch execution`);
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }
}

console.log('patcher enhancement selection checks passed');
