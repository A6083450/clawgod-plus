#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const installSh = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const startMarker = 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'';
const start = installSh.indexOf(startMarker);
assert.notEqual(start, -1, 'install.sh must embed patch.mjs');
const bodyStart = installSh.indexOf('\n', start) + 1;
const end = installSh.indexOf('\nPATCHER_EOF', bodyStart);
assert.notEqual(end, -1, 'install.sh patcher heredoc must end');
const patcher = installSh.slice(bodyStart, end);

const dir = mkdtempSync(join(tmpdir(), 'clawgod-patcher-'));
try {
  writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
  writeFileSync(join(dir, 'cli.original.cjs'), `
Version: 2.1.202
function Iur(e){let t=!1,r,n={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1},o=[],i={"--cwd":(s)=>{r=s}};for(let s=0;s<e.length;s++){let a=e[s];if(a==="agents"&&!t){t=!0;continue}if(a==="--strict-mcp-config"){n.strictMcpConfig=!0;continue}o.push(a)}return{config:n,rest:o}}
function Get(e,t){return{settings:e.settings,pluginDir:e.pluginDir,pluginDirNoMcp:e.pluginDirNoMcp,addDir:e.addDir,mcpConfig:e.mcpConfig,strictMcpConfig:e.strictMcpConfig}}function Vet(e){return[...e.settings?["--settings",e.settings]:[],...e.strictMcpConfig?["--strict-mcp-config"]:[]]}}
program.command("update").alias("upgrade").description("Check for updates and install if available").action(async()=>{let{update:s}=await import("updater");await s()})
`, 'utf8');

  const first = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout);
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

console.log('patcher agents chrome checks passed');
