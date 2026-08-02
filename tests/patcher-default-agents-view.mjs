#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

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

const fixture = `
/* Version: 2.1.220 */
function aNm(e){for(let t=0;t<e.length;t++){let r=e[t];if(r==="--debug")continue;return!1}return!0}
function NNn(e){return{hasAgentsPositional:!1,rest:e.filter((t)=>t!=="--chrome")}}
function iTT(e){return{dispatchDefaults:void 0,rest:e}}
function launch(t){let n=NNn(t),{dispatchDefaults:o,rest:i}=iTT(n.rest),s=n.hasAgentsPositional&&aNm(i);if((s||aNm(t)&&process.stdin.isTTY)&&process.stdout.isTTY){return"agents"}return"chat"}
globalThis.launch=launch;
`;

for (const [installerName, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-default-agents-'));
  try {
    writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, `${installerName}: ${run.stdout}${run.stderr}`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    const context = {
      process: { stdin: { isTTY: true }, stdout: { isTTY: true } },
    };
    runInNewContext(patched, context);

    assert.equal(
      context.launch(['--chrome']),
      'agents',
      `${installerName}: auto-injected --chrome must still honor defaultToAgentsView`,
    );
    assert.equal(
      context.launch(['--chrome', 'answer this prompt']),
      'chat',
      `${installerName}: a real prompt must still open the normal chat view`,
    );

    const rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(rerun.status, 0, `${installerName} idempotence: ${rerun.stdout}${rerun.stderr}`);
    assert.equal(
      readFileSync(join(dir, 'cli.original.cjs'), 'utf8'),
      patched,
      `${installerName}: applying the patcher twice must not change the startup gate again`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher default Agents view checks passed');
