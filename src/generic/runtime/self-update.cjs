const {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  rmSync,
} = require('node:fs');
const { spawnSync } = require('node:child_process');
const { homedir, tmpdir } = require('node:os');
const { join } = require('node:path');

const STABLE_SELF_VERSION = /^[0-9]+[.][0-9]+[.][0-9]+(?:-claude[.][0-9]+[.][0-9]+[.][0-9]+(?:[.][0-9]+)?)?$/;
const UPDATE_FLAGS = [
  ['CLAWGOD_NO_UPGRADE', 'noUpgrade'],
  ['CLAWGOD_LEAN_OFF', 'leanOff'],
  ['CLAWGOD_LEAN_ON', 'leanOn'],
  ['CLAWGOD_LEAN_MAX', 'leanMax'],
];

function parseUpdateArgs(argv) {
  const [command, ...args] = argv;
  if (command !== 'update' && command !== 'upgrade') {
    throw new Error('self-update requires update or upgrade as the first argument');
  }
  const versionIndex = args.indexOf('--version');
  if (versionIndex >= 0 && (typeof args[versionIndex + 1] !== 'string' || args[versionIndex + 1] === '')) {
    throw new Error('self-update --version requires a non-empty value');
  }
  const explicitVersion = versionIndex >= 0;
  return {
    command,
    explicitVersion,
    version: explicitVersion ? args[versionIndex + 1] : '',
    noUpgrade: args.includes('--no-upgrade'),
    tolerateStale: args.includes('--tolerate-stale'),
    leanOff: args.includes('--lean-off'),
    leanOn: args.includes('--lean-on'),
    leanMax: args.includes('--lean-max'),
  };
}

function installerVersionDeclarations(source, platform) {
  const pattern = platform === 'win32'
    ? /^[$]ClawSelfVersion = "([^"\r\n]+)"/gm
    : /^CLAWGOD_SELF_VERSION="([^"\r\n]+)"/gm;
  return [...source.matchAll(pattern)].map(match => match[1]);
}

function isTrustedLocalInstaller({ clawgodDir, installer, platform, explicitVersion }) {
  if (!explicitVersion) return false;
  try {
    const localVersion = readFileSync(join(clawgodDir, '.clawgod-version'), 'utf8').trim();
    const declarations = installerVersionDeclarations(readFileSync(installer, 'utf8'), platform);
    return STABLE_SELF_VERSION.test(localVersion)
      && declarations.length === 1
      && declarations[0] === localVersion;
  } catch {
    return false;
  }
}

function childEnvironment(env, parsed) {
  const childEnv = {
    ...env,
    CLAWGOD_NONINTERACTIVE: '1',
    CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
    CLAWGOD_VERSION: parsed.version,
  };
  if (!parsed.explicitVersion) delete childEnv.CLAWGOD_VERSION;
  for (const [environmentKey, argumentKey] of UPDATE_FLAGS) {
    if (parsed[argumentKey]) childEnv[environmentKey] = '1';
    else delete childEnv[environmentKey];
  }
  if (parsed.tolerateStale || env.CLAWGOD_TOLERATE_STALE === '1') childEnv.CLAWGOD_TOLERATE_STALE = '1';
  else delete childEnv.CLAWGOD_TOLERATE_STALE;
  return childEnv;
}

function outcomeFromResult(result, missingStatusMessage) {
  if (result.error) throw result.error;
  const signal = typeof result.signal === 'string' ? result.signal : null;
  if (signal) return { status: 1, signal };
  if (typeof result.status !== 'number') throw new Error(missingStatusMessage);
  return { status: result.status, signal: null };
}

function runSelfUpdate(argv, options = {}) {
  const {
    platform = process.platform,
    homeDir = homedir(),
    temporaryRoot = tmpdir(),
    execPath = process.execPath,
    env = process.env,
    stderr = process.stderr,
    spawn = spawnSync,
  } = options;
  let temporaryDirectory = '';

  try {
    const parsed = parseUpdateArgs(argv);
    const windows = platform === 'win32';
    const clawgodDir = join(homeDir, '.clawgod');
    const fetchFile = join(clawgodDir, 'fetch-file.mjs');
    const proxyFetch = join(clawgodDir, 'proxy-fetch.mjs');
    let installer = join(clawgodDir, windows ? 'install.ps1' : 'install.sh');
    const childEnv = childEnvironment(env, parsed);
    const latestFirst = !parsed.explicitVersion && !parsed.noUpgrade && !parsed.leanOff && !parsed.leanOn && !parsed.leanMax;
    if (latestFirst) delete childEnv.CLAWGOD_UPDATE_PATCH_FAIL_OPEN;

    if (!isTrustedLocalInstaller({ clawgodDir, installer, platform, explicitVersion: parsed.explicitVersion })) {
      if (!existsSync(fetchFile)) throw new Error('managed fetch-file.mjs is missing; reinstall ClawGod Plus');
      if (!existsSync(proxyFetch)) throw new Error('managed proxy-fetch.mjs is missing; reinstall ClawGod Plus');
      temporaryDirectory = mkdtempSync(join(temporaryRoot, 'clawgod-update-'));
      if (!windows) chmodSync(temporaryDirectory, 0o700);
      installer = join(temporaryDirectory, windows ? 'install.ps1' : 'install.sh');
      const remoteUrl = windows
        ? 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1'
        : 'https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh';
      const download = outcomeFromResult(
        spawn(execPath, [fetchFile, remoteUrl, installer], { stdio: 'inherit', env: childEnv }),
        'managed installer download did not return an exit status',
      );
      if (download.status !== 0 || download.signal) return download;
    } else {
      stderr.write(`[clawgod] using local installer (remote skipped): ${installer}\n`);
    }

    const command = windows
      ? ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer]
      : ['bash', installer];
    delete childEnv.CLAWGOD_UPDATE_ROLLBACK_RECEIPT;
    if (latestFirst) childEnv.CLAWGOD_UPDATE_ROLLBACK_RECEIPT = join(temporaryDirectory, 'rollback-receipt');
    const firstCommand = [...command];
    if (latestFirst || parsed.explicitVersion && parsed.version === 'latest') firstCommand.push(windows ? '-Version' : '--version', 'latest');
    const first = outcomeFromResult(
      spawn(firstCommand[0], firstCommand.slice(1), { stdio: 'inherit', env: childEnv }),
      'installer process did not return an exit status',
    );
    if (!latestFirst || first.status === 0 || first.signal || first.status === 130 || first.status === 143) return first;
    let restored = false;
    try { restored = readFileSync(childEnv.CLAWGOD_UPDATE_ROLLBACK_RECEIPT, 'utf8') === 'restored\n'; } catch {}
    if (!restored || readdirSync(clawgodDir).some(name => name.startsWith('.runtime-rollback.'))) {
      stderr.write('[clawgod] 升级失败，但未确认已安全恢复或仍有恢复事务；为保护原安装，不自动重试。\n');
      return first;
    }
    stderr.write('[clawgod] 最新版升级失败，正在尝试安装器内置的稳定版本（不自动降级已装高版本）。\n');
    const fallback = outcomeFromResult(
      spawn(command[0], command.slice(1), { stdio: 'inherit', env: childEnv }),
      'stable installer process did not return an exit status',
    );
    if (fallback.status === 0 && !fallback.signal) stderr.write('[clawgod] 已安装稳定版本；最新版尚未升级成功。\n');
    return fallback;
  } catch (error) {
    stderr.write(`[clawgod] update failed: ${error && error.message ? error.message : String(error)}\n`);
    return { status: 1, signal: null };
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function exitWithOutcome(outcome, processObject = process) {
  if (outcome.signal) {
    try {
      processObject.kill(processObject.pid, outcome.signal);
      return;
    } catch {
      processObject.exit(1);
      return;
    }
  }
  processObject.exit(outcome.status);
}

function newerRelease(candidate, installed) {
  if (!STABLE_SELF_VERSION.test(candidate) || !STABLE_SELF_VERSION.test(installed)) return false;
  const left = candidate.split(/-claude\.|\./).map(Number);
  const right = installed.split(/-claude\.|\./).map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta) return delta > 0;
  }
  return false;
}

function shouldCheckUpdate(args, inputTTY, outputTTY, env) {
  return inputTTY === true && outputTTY === true && !env.CI
    && args.every(arg => arg === '--chrome' || arg === '--no-chrome');
}

async function askUpdate(version) {
  const readline = require('node:readline/promises').createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await readline.question(`[clawgod] 发现新版 v${version}\n  1. 安装更新\n  2. 稍后提醒（默认）\n  3. 跳过此版本\n请选择 [2]: `);
    return answer.trim() === '1' ? 'install' : answer.trim() === '3' ? 'skip' : 'later';
  } finally { readline.close(); }
}

async function checkForUpdate({ clawgodDir = join(homedir(), '.clawgod'), now = Date.now,
  fetch = globalThis.fetch, ask = askUpdate, install = () => runSelfUpdate(['update']) } = {}) {
  try {
    const installed = readFileSync(join(clawgodDir, '.clawgod-version'), 'utf8').trim();
    if (!STABLE_SELF_VERSION.test(installed)) return null;
    const file = join(clawgodDir, '.update-check');
    let state = {};
    try { const parsed = JSON.parse(readFileSync(file, 'utf8')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) state = parsed; } catch {}
    const save = () => {
      const temporary = `${file}.${process.pid}.tmp`;
      try { writeFileSync(temporary, JSON.stringify(state) + '\n', { mode: 0o600 }); renameSync(temporary, file); }
      finally { rmSync(temporary, { force:true }); }
    };
    // 旧缓存没有资产完整性标记，必须重新检查，不能提示尚未上传完的 Release。
    if (state.ready !== true || !Number.isFinite(state.t) || now() < state.t || now() - state.t >= 86400000) {
      const response = await fetch('https://api.github.com/repos/A6083450/clawgod-plus/releases/latest', {
        headers: { 'User-Agent':'clawgod', Accept:'application/vnd.github+json' }, signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return null;
      const release = await response.json();
      const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
      if (!STABLE_SELF_VERSION.test(version) || release.draft || release.prerelease
        || !['install.sh','install.ps1'].every(name => release.assets?.some(asset => asset.name === name))) return null;
      // 网络等待期间另一终端可能已选择跳过，刷新不能用旧快照覆盖它。
      try { const latest = JSON.parse(readFileSync(file, 'utf8')); if (typeof latest?.skipped === 'string') state.skipped = latest.skipped; } catch {}
      state = { t:now(), v:version, ready:true, skipped:typeof state.skipped === 'string' ? state.skipped : '' };
      save();
    }
    if (!newerRelease(state.v, installed) || state.skipped === state.v) return null;
    const choice = await ask(state.v);
    if (choice === 'skip') { state.skipped = state.v; save(); }
    if (choice === 'install') return install();
  } catch {
    // 更新检查失败不能阻止 Claude 启动。
  }
  return null;
}

module.exports = {
  checkForUpdate,
  newerRelease,
  shouldCheckUpdate,
  parseUpdateArgs,
  runSelfUpdate,
  exitWithOutcome,
};

if (require.main === module) {
  exitWithOutcome(runSelfUpdate(process.argv.slice(2)));
}
