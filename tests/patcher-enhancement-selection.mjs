#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { createAgentsRegistry } from '../src/generic/patcher/enhancements/agents.mjs';
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
/* Version: 2.1.215 */
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
/* Version: 2.1.215 */
function teamGate(){if(!enabled(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)&&!local())return!1;if(!flag("tengu_amber_flint",!0))return!1;return!0}
function defaultView(){let mode="chat",allowed=["chat","agents"];return mode}
function chromeState(){return settings()?.claudeInChrome?.enabled??false}
`;

// Code Mode 请求不得被 ClawGod 隐式启用的 Teams 拒绝，显式 Teams 仍由上游判断。
for (const source of [
  agentsFixture,
  agentsFixture.replace('!enabled(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)', '!options.agentTeams'),
]) {
  for (const codeModeEnabled of [false, true]) {
    const descriptor = createAgentsRegistry({ chromeEnabled: false, codeModeEnabled }).patches[0];
    const patched = source.replace(descriptor.pattern, descriptor.replacer);
    for (const [request, requested] of [[undefined, false], ['', false], ['0', false], ['false', false], ['no', false], ['off', false], ['invalid', false], ['1', true], ['true', true], ['yes', true], ['on', true], [' TRUE ', true], ['\tYeS\n', true]]) {
      for (const [explicitTeams, cliTeams, upstreamFlag, originalEnabled] of [
        [false, false, true, false],
        [true, false, true, true],
        [false, true, true, true],
        [true, true, false, false],
      ]) {
        for (const runtimeEnabled of [false, true]) {
          const teams = runInNewContext(`${patched}\nteamGate()`, {
            process: { env: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: request, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: explicitTeams ? '1' : undefined } },
            enabled: value => value === '1',
            options: { agentTeams: explicitTeams },
            local: () => cliTeams,
            flag: () => upstreamFlag,
            globalThis: { __clawgodPatches: { 'agent-teams': runtimeEnabled } },
          });
          assert.equal(teams, originalEnabled || (runtimeEnabled && !(codeModeEnabled && requested)), `Teams 互斥边界：Code Mode selected=${codeModeEnabled}, request=${request}, explicitTeams=${explicitTeams}, cliTeams=${cliTeams}, upstreamFlag=${upstreamFlag}, runtime=${runtimeEnabled}`);
        }
      }
    }
  }
}

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

const codeModeFixture = readFileSync(new URL('./fixtures/code-mode-2.1.325.js', import.meta.url), 'utf8');
const codeModeMarker = '/*__clawgod_code_mode_local_v1__*/';

for (const [name, patcherSource] of await getPatcherSources()) {
  for (const [label, config, selected] of [
    ['code-mode-all', allConfig, true],
    ['code-mode-custom', customConfig(['code-mode']), true],
    ['code-mode-unselected', customConfig(['agents']), false],
  ]) {
    const result = runSelectionCase(name, patcherSource, label, config, codeModeFixture);
    try {
      assert.equal(result.run.status, 0, `${name}: ${label} 必须成功：${result.output}`);
      if (selected) {
        assert.ok(result.patched.includes(codeModeMarker), `${name}: ${label} 必须应用 Code Mode 本地资格补丁`);
        assert.match(result.patched, /if\(vs\(\)\)return"agent_teams"/, `${name}: 必须保留原生 Teams 互斥`);
        assert.match(result.output, /Code Mode local eligibility/, `${name}: 必须报告独立 descriptor`);
      } else {
        assert.equal(result.patched, codeModeFixture, `${name}: 未选择 Code Mode 必须保持上游模块不变`);
        assert.doesNotMatch(result.output, /Code Mode local eligibility/, `${name}: 未选择时不得查找 Code Mode descriptor`);
      }
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }
  for (const [label, config, selected] of [
    ['code-mode-332-all', allConfig, true],
    ['code-mode-332-custom', customConfig(['code-mode']), true],
    ['code-mode-332-unselected', customConfig(['agents']), false],
  ]) {
    const fixture = readFileSync(new URL('./fixtures/code-mode-2.1.332-darwin-arm64.js', import.meta.url), 'utf8');
    const result = runSelectionCase(name, patcherSource, label, config, fixture);
    try {
      assert.equal(result.run.status, 0, `${name}: ${label} 必须成功：${result.output}`);
      if (selected) {
        assert.ok(result.patched.includes(codeModeMarker), `${name}: 332 默认全部和自定义选择均应解锁本地资格`);
        assert.match(result.patched, /if\(ge\(\)\)return"entrypoint";/, `${name}: 不得开放 headless 入口`);
        assert.doesNotMatch(result.output, /local eligibility not supported/, `${name}: 332 不再跳过本地资格`);
      } else {
        assert.equal(result.patched, fixture, `${name}: 未选择时必须保留 332 上游行为`);
      }
    } finally {
      rmSync(result.fixtureRoot, { recursive: true, force: true });
    }
  }
  {
    const result = runSelectionCase(name, patcherSource, 'all', allConfig, representativeFixture);
    try {
      assert.equal(result.run.status, 0, `${name}: all selection must patch cleanly: ${result.output}`);
      assert.match(result.output, /Enhancements: 22 enabled, 0 disabled/, `${name}: all summary must be exact`);
      assert.match(result.patched, /function teams\(\)\{if\(globalThis\.__clawgodPatches\?\.\["agent-teams"\]!==!1&&!\["1","true","yes","on"\]/, `${name}: all must runtime-gate agents`);
      assert.match(result.patched, /clawd_body:globalThis\.__clawgodPatches\?\.\["theme-logo-rgb"\]!==!1\?"rgb\(34,197,94\)":"rgb\(215,119,87\)"/, `${name}: all must runtime-gate branding`);
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
      assert.match(result.output, /Enhancements: 3 enabled, 19 disabled/, `${name}: subset summary must be exact`);
      assert.match(result.patched, /function Sub\(\)\{if\(globalThis\.__clawgodPatches\?\.\["computer-use-sub"\]!==!1\)return!0;/, `${name}: subset must runtime-gate computer-use`);
      assert.match(result.patched, /argumentHint:"<prompt>",isEnabled:\(\)=>\(globalThis\.__clawgodPatches\?\.\["ultraplan"\]/, `${name}: subset must runtime-gate planning`);
      assert.match(result.patched, /clawd_body:globalThis\.__clawgodPatches\?\.\["theme-logo-rgb"\]/, `${name}: subset must runtime-gate branding`);
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
      assert.match(result.output, /Enhancements: 1 enabled, 21 disabled/, `${name}: agents-only summary must be exact`);
      assert.match(result.patched, /function teamGate\(\)\{if\(globalThis\.__clawgodPatches\?\.\["agent-teams"\]!==!1\)return!0;/, `${name}: agents selection must runtime-gate agents descriptors`);
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
      assert.match(result.output, /Enhancements: 0 enabled, 22 disabled/, `${name}: none summary must be exact`);
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
      assert.match(result.output, /Enhancements: 1 enabled, 21 disabled/, `${name}: ${mode} summary must be exact`);
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
