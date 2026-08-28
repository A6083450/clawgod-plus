#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

for (const [name, patcherSource] of await getPatcherSources()) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-patcher-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), `
Version: 2.1.202
function Iur(e){let t=!1,r,n={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1},o=[],i={"--cwd":(s)=>{r=s}};for(let s=0;s<e.length;s++){let a=e[s];if(a==="agents"&&!t){t=!0;continue}if(a==="--strict-mcp-config"){n.strictMcpConfig=!0;continue}o.push(a)}return{config:n,rest:o}}
function Get(e,t){return{settings:e.settings,pluginDir:e.pluginDir,pluginDirNoMcp:e.pluginDirNoMcp,addDir:e.addDir,mcpConfig:e.mcpConfig,strictMcpConfig:e.strictMcpConfig}}function Vet(e){return[...e.settings?["--settings",e.settings]:[],...e.strictMcpConfig?["--strict-mcp-config"]:[]]}}
program.command("update").alias("upgrade").description("Check for updates and install if available").action(async()=>{let{update:s}=await import("updater");await s()})
`, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(first.status, 0, `${name}: ${first.stderr || first.stdout}`);
    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');

    assert.match(patched, /n=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1\}/);
    assert.match(patched, /if\(a==="--chrome"\)\{n\.chrome=!0;continue\}if\(a==="--no-chrome"\)\{n\.noChrome=!0;continue\}if\(a==="--strict-mcp-config"\)/);
    assert.match(patched, /strictMcpConfig:e\.strictMcpConfig,chrome:e\.chrome&&!e\.noChrome,noChrome:e\.noChrome\}\}function Vet/);
    assert.match(patched, /__ccpp_agents_chrome_dispatch/);
    assert.match(patched, /\[clawgod\] 'claude update' is handled by clawgod self-update/);

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, secondOutput);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents config state \(0 matches/);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents flag parser \(0 matches/);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents config resolver \(0 matches/);
    assert.doesNotMatch(secondOutput, /Redirect `claude update` to clawgod self-update .*regex stale/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [name, patcherSource] of await getPatcherSources()) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-patcher-250-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), `
/* Version: 2.1.250 */
function Nvt(n){let i=!1,r,t={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,restricted:!1},g=[],a={"--cwd":(e)=>{r=e}};for(let e=0;e<n.length;e++){let s=n[e];if(s==="agents"&&!i){i=!0;continue}if(s==="--strict-mcp-config"){t.strictMcpConfig=!0;continue}if(s==="--restricted"){t.restricted=!0;continue}g.push(s)}return{config:t,rest:g}}
function NTe(n,i){let r=(t,g)=>t;return{settings:n.settings,mcpConfig:n.mcpConfig.map((t)=>r(t,!0)),strictMcpConfig:n.strictMcpConfig,restricted:n.restricted}}function FTe(n){return[...n.settings?["--settings",n.settings]:[],...n.mcpConfig.flatMap((i)=>["--mcp-config",i]),...n.strictMcpConfig?["--strict-mcp-config"]:[],...n.restricted?["--restricted"]:[]]}
`, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(first.status, 0, `${name} 2.1.250: ${first.stderr || first.stdout}`);
    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');

    assert.match(patched, /t=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1,restricted:!1\}/, `${name} 2.1.250: config state must gain chrome/noChrome before restricted`);
    assert.match(patched, /if\(s==="--chrome"\)\{t\.chrome=!0;continue\}if\(s==="--no-chrome"\)\{t\.noChrome=!0;continue\}if\(s==="--strict-mcp-config"\)/, `${name} 2.1.250: flag parser must inject --chrome/--no-chrome`);
    assert.match(patched, /strictMcpConfig:n\.strictMcpConfig,chrome:n\.chrome&&!n\.noChrome,noChrome:n\.noChrome,restricted:n\.restricted\}\}function FTe/, `${name} 2.1.250: config resolver must gain chrome/noChrome before restricted`);
    assert.match(patched, /__ccpp_agents_chrome_dispatch/, `${name} 2.1.250: dispatch args must inject --chrome/--no-chrome`);

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, `${name} 2.1.250 re-run: ${secondOutput}`);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents config state \(0 matches/, `${name} 2.1.250: config state must be applied, not unverifiable`);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents config resolver \(0 matches/, `${name} 2.1.250: config resolver must be applied, not unverifiable`);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents dispatch args \(0 matches/, `${name} 2.1.250: dispatch args must be applied, not unverifiable`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher agents chrome checks passed');
