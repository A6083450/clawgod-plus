#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function extractTemplate(name, marker) {
  const start = installer.indexOf(`cat > "$CLAWGOD_DIR/${name}" << '${marker}'`);
  assert.notEqual(start, -1, `install.sh must generate ${name}`);
  const bodyStart = installer.indexOf('\n', start) + 1;
  const end = installer.indexOf(`\n${marker}`, bodyStart);
  assert.notEqual(end, -1, `install.sh ${name} template must end`);
  return installer.slice(bodyStart, end);
}

const pluginModule = extractTemplate('plugin-dependencies.mjs', 'PLUGIN_DEPENDENCIES_EOF');
const normalBranchStart = installer.indexOf('\nelse\n', branchStart);
const branchEnd = installer.indexOf('fi  # end --no-upgrade skip', normalBranchStart);
const claudeDownload = installer.indexOf('"$NPM_PKG@$VERSION" "$NATIVE_BIN_TMPDIR"', normalBranchStart);
const pluginEnsure = installer.indexOf('"$CLAWGOD_DIR/plugin-dependencies.mjs" ensure', branchEnd);
const latestUpdateRunsClaudeDownloadBeforePluginEnsure = installer.includes('VERSION="${CLAWGOD_VERSION:-latest}"')
  && claudeDownload > normalBranchStart && claudeDownload < branchEnd && pluginEnsure > branchEnd;
const explicitVersionFlowsToClaudePackageResolverOnly = installer.includes('--version) VERSION="$2"; shift 2 ;;')
  && installer.includes('"$NPM_PKG@$VERSION" "$NATIVE_BIN_TMPDIR"')
  && !pluginModule.includes('CLAWGOD_VERSION');
const noUpgradeSkipsClaudePackageDownloadButStillRunsPluginHealthCheck = branchStart < normalBranchStart
  && claudeDownload > normalBranchStart && claudeDownload < branchEnd && pluginEnsure > branchEnd;
assert.ok(latestUpdateRunsClaudeDownloadBeforePluginEnsure);
assert.ok(explicitVersionFlowsToClaudePackageResolverOnly);
assert.ok(noUpgradeSkipsClaudePackageDownloadButStillRunsPluginHealthCheck);
assert.doesNotMatch(pluginModule, /CLAWGOD_VERSION|--version\s+2\.|version\s*=\s*['"]latest['"]/);

const optionalStart = installer.indexOf('# --- Ensure optional Claude plugins');
const optionalEnd = installer.indexOf('\ninstall_claude_mem_compat_helper', optionalStart);
assert.ok(optionalStart >= 0 && optionalEnd > optionalStart, 'install.sh must retain an extractable plugin health-check stage');
const optionalBlock = installer.slice(optionalStart, optionalEnd);

const dir = mkdtempSync(join(tmpdir(), 'clawgod-no-upgrade-'));
try {
  const clawgodDir = join(dir, 'home');
  const helper = join(clawgodDir, 'apply-claude-code-chrome-fix.sh');
  const cli = join(clawgodDir, 'cli.original.cjs');
  const pluginManager = join(clawgodDir, 'plugin-dependencies.mjs');
  const pluginHealth = join(dir, 'plugin-health');
  const claudeDownloadAttempt = join(dir, 'claude-download');
  const fakeBun = join(dir, 'bun');
  const script = join(dir, 'control-flow.sh');
  mkdirSync(clawgodDir);
  writeFileSync(helper, '#!/usr/bin/env bash\nprintf "helper:%s\\n" "$1"\n', 'utf8');
  chmodSync(helper, 0o755);
  writeFileSync(cli, 'fixture', 'utf8');
  writeFileSync(pluginManager, '// fixture plugin manager\n', 'utf8');
  writeFileSync(fakeBun, `#!/usr/bin/env bash\n[ "$2" = "ensure" ] || exit 78\nprintf 'checked\\n' > ${JSON.stringify(pluginHealth)}\n`, 'utf8');
  chmodSync(fakeBun, 0o755);
  writeFileSync(script, `#!/usr/bin/env bash
set -e
CLAWGOD_DIR=${JSON.stringify(clawgodDir)}
BUN_BIN=${JSON.stringify(fakeBun)}
warn() { printf 'warn:%s\\n' "$*"; }
dim() { printf 'dim:%s\\n' "$*"; }
info() { printf 'info:%s\\n' "$*"; }
${installHelper.source}
${runHelper.source}
NO_UPGRADE=1
if [ "$NO_UPGRADE" = "1" ]; then
  run_claude_code_chrome_fix
else
  : > ${JSON.stringify(claudeDownloadAttempt)}
fi
${optionalBlock}
`, 'utf8');
  chmodSync(script, 0o755);

  const run = spawnSync('bash', [script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, new RegExp(`helper:${cli.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.doesNotMatch(run.stdout + run.stderr, /command not found/);
  assert.equal(readFileSync(pluginHealth, 'utf8'), 'checked\n', '--no-upgrade must still run the plugin health check');
  assert.equal(existsSync(claudeDownloadAttempt), false, '--no-upgrade must not run the Claude package download branch');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('patcher install --no-upgrade control-flow checks passed');
