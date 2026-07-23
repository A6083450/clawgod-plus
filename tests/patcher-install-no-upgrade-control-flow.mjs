#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const installer = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const branchMarker = 'if [ "$NO_UPGRADE" = "1" ]; then';
const branchStart = installer.indexOf(branchMarker);
assert.notEqual(branchStart, -1, 'install.sh must retain the --no-upgrade branch');

function extractFunction(name) {
  const start = installer.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `install.sh must define ${name}`);
  const end = installer.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `install.sh ${name} definition must end`);
  return { start, source: installer.slice(start, end + 3) };
}

const installHelper = extractFunction('install_chrome_fix_script');
const runHelper = extractFunction('run_claude_code_chrome_fix');
assert.ok(installHelper.start < branchStart, 'Chrome fix installer helper must be defined before --no-upgrade branching');
assert.ok(runHelper.start < branchStart, 'Chrome fix runner must be defined before --no-upgrade branching');

const normalInstallCall = installer.indexOf('if install_chrome_fix_script; then', branchStart);
assert.ok(normalInstallCall > branchStart, 'normal install must still eagerly select/install the Chrome helper');

const dir = mkdtempSync(join(tmpdir(), 'clawgod-no-upgrade-'));
try {
  const clawgodDir = join(dir, 'home');
  const helper = join(clawgodDir, 'apply-claude-code-chrome-fix.sh');
  const cli = join(clawgodDir, 'cli.original.cjs');
  const script = join(dir, 'control-flow.sh');
  mkdirSync(clawgodDir);
  writeFileSync(helper, '#!/usr/bin/env bash\nprintf "helper:%s\\n" "$1"\n', 'utf8');
  chmodSync(helper, 0o755);
  writeFileSync(cli, 'fixture', 'utf8');
  writeFileSync(script, `#!/usr/bin/env bash
set -e
CLAWGOD_DIR=${JSON.stringify(clawgodDir)}
warn() { printf 'warn:%s\\n' "$*"; }
dim() { printf 'dim:%s\\n' "$*"; }
info() { printf 'info:%s\\n' "$*"; }
${installHelper.source}
${runHelper.source}
NO_UPGRADE=1
if [ "$NO_UPGRADE" = "1" ]; then
  run_claude_code_chrome_fix
else
  exit 99
fi
`, 'utf8');
  chmodSync(script, 0o755);

  const run = spawnSync('bash', [script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, new RegExp(`helper:${cli.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.doesNotMatch(run.stdout + run.stderr, /command not found/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('patcher install --no-upgrade control-flow checks passed');
