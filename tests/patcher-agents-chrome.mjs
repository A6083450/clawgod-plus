#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, secondOutput);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents config state \(0 matches/);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents flag parser \(0 matches/);
    assert.doesNotMatch(secondOutput, /Claude in Chrome agents config resolver \(0 matches/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const restrictedAgentsChunk = `
/* Version: 2.1.251 */
function XCt(n){let i=!1,r,t={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1,restricted:!1},g=[],a={"--cwd":(e)=>{r=e},"--settings":(e)=>{t.settings=e},"--add-dir":(e)=>t.addDir.push(e),"--plugin-dir":(e)=>t.pluginDir.push(e),"--plugin-dir-no-mcp":(e)=>t.pluginDirNoMcp.push(e),"--mcp-config":(e)=>t.mcpConfig.push(e)};for(let e=0;e<n.length;e++){let s=n[e];if(s==="agents"&&!i){i=!0;continue}if(s==="--strict-mcp-config"){t.strictMcpConfig=!0;continue}if(s==="--restricted"){t.restricted=!0;continue}let o=s.indexOf("="),p=o===-1?s:s.slice(0,o),l=Object.hasOwn(a,p)?a[p]:void 0;if(l){if(o!==-1)l(s.slice(o+1));else if(e+1<n.length)l(n[++e]);else g.push(s);continue}g.push(s)}return{hasAgentsPositional:i,cwdFilter:r,config:t,rest:g}}
function xve(n,i){let r=(t,g)=>t===""||g&&t.trimStart().startsWith("{")?t:i(t);return{settings:n.settings===void 0?void 0:r(n.settings,!0),pluginDir:n.pluginDir.map((t)=>r(t,!1)),pluginDirNoMcp:n.pluginDirNoMcp.map((t)=>r(t,!1)),addDir:n.addDir.map((t)=>r(t,!1)),mcpConfig:n.mcpConfig.map((t)=>r(t,!0)),strictMcpConfig:n.strictMcpConfig,restricted:n.restricted}}function Ive(n){return[...n.settings?["--settings",n.settings]:[],...n.pluginDir.flatMap((i)=>["--plugin-dir",i]),...n.pluginDirNoMcp.flatMap((i)=>["--plugin-dir-no-mcp",i]),...n.addDir.flatMap((i)=>["--add-dir",i]),...n.mcpConfig.flatMap((i)=>["--mcp-config",i]),...n.strictMcpConfig?["--strict-mcp-config"]:[],...n.restricted?["--restricted"]:[]]}
`;

for (const [name, patcherSource] of await getPatcherSources()) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-patcher-251-'));
  try {
    seedPatcherAcorn(dir);
    writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), '/* Version: 2.1.251 */\n', 'utf8');
    mkdirSync(join(dir, 'chunks'));
    writeFileSync(join(dir, 'chunks', 'chunk-agents.js'), restrictedAgentsChunk, 'utf8');

    const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(first.status, 0, `${name} 2.1.251: ${first.stderr || first.stdout}`);
    const patched = readFileSync(join(dir, 'chunks', 'chunk-agents.js'), 'utf8');

    assert.match(patched, /t=\{addDir:\[\],pluginDir:\[\],pluginDirNoMcp:\[\],settings:void 0,mcpConfig:\[\],strictMcpConfig:!1,chrome:!1,noChrome:!1,restricted:!1\}/, `${name} 2.1.251: config state must gain chrome/noChrome before restricted`);
    assert.match(patched, /if\(s==="--chrome"\)\{t\.chrome=!0;continue\}if\(s==="--no-chrome"\)\{t\.noChrome=!0;continue\}if\(s==="--strict-mcp-config"\)/, `${name} 2.1.251: flag parser must inject --chrome/--no-chrome`);
    assert.match(patched, /strictMcpConfig:n\.strictMcpConfig,chrome:n\.chrome&&!n\.noChrome,noChrome:n\.noChrome,restricted:n\.restricted\}\}function Ive/, `${name} 2.1.251: config resolver must gain chrome/noChrome before restricted`);
    assert.match(patched, /__ccpp_agents_chrome_dispatch/, `${name} 2.1.251: dispatch args must inject --chrome/--no-chrome`);

    const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    const secondOutput = second.stdout + second.stderr;
    assert.equal(second.status, 0, `${name} 2.1.251 re-run: ${secondOutput}`);
    for (const patch of ['config state', 'flag parser', 'config resolver', 'dispatch args']) {
      assert.doesNotMatch(secondOutput, new RegExp(`Claude in Chrome agents ${patch} \\(0 matches`), `${name} 2.1.251: ${patch} must be applied, not unverifiable`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher agents chrome checks passed');
