const {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
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
    version: explicitVersion ? args[versionIndex + 1] : 'latest',
    noUpgrade: args.includes('--no-upgrade'),
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
  for (const [environmentKey, argumentKey] of UPDATE_FLAGS) {
    if (parsed[argumentKey]) childEnv[environmentKey] = '1';
    else delete childEnv[environmentKey];
  }
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
    return outcomeFromResult(
      spawn(command[0], command.slice(1), { stdio: 'inherit', env: childEnv }),
      'installer process did not return an exit status',
    );
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

module.exports = {
  parseUpdateArgs,
  runSelfUpdate,
  exitWithOutcome,
};

if (require.main === module) {
  exitWithOutcome(runSelfUpdate(process.argv.slice(2)));
}
