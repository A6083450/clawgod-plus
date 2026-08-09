#!/usr/bin/env bun
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = realpathSync(new URL('../', import.meta.url));
const unixInstaller = readFileSync(join(root, 'install.sh'), 'utf8');
const windowsInstaller = readFileSync(join(root, 'install.ps1'), 'utf8');

function assertTemporaryPath(path, parent, label) {
  const resolvedParent = realpathSync(parent);
  const resolvedPath = realpathSync(path);
  const child = relative(resolvedParent, resolvedPath);
  assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child), `${label} must stay under its fixture root`);
}

function extractUnixPatcher() {
  const marker = 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'';
  const start = unixInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed patch.mjs');
  const bodyStart = unixInstaller.indexOf('\n', start) + 1;
  const end = unixInstaller.indexOf('\nPATCHER_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh patcher heredoc must end');
  return unixInstaller.slice(bodyStart, end);
}

function extractWindowsPatcher() {
  const marker = "$patcherCode = @'\n";
  const start = windowsInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must embed patch.mjs');
  const bodyStart = start + marker.length;
  const end = windowsInstaller.indexOf("\n'@\n\nSet-Content", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 patcher here-string must end');
  return windowsInstaller.slice(bodyStart, end);
}

const fixtureSource = `
/* Version: 2.1.226 */
function WE(){return Bun.isStandaloneExecutable===!0}
function W1t(e={}){if(!e.pinToCurrentBinary&&yRo()){let r=Xon();return{cmd:r,prefixArgs:[],target:r}}if(WE())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[t],target:t}}
const command={command(){return this},alias(){return this},description(){return this},allowUnknownOption(){return this},action(callback){callback();return this}};
command.command("update").alias("upgrade").description("Update Claude Code").action(async()=>{});
`;

function patchUpdateBranch(label, patcher) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod update patch '));
  assertTemporaryPath(fixtureRoot, tmpdir(), `${label} patch fixture`);
  try {
    writeFileSync(join(fixtureRoot, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(
      join(fixtureRoot, 'no-fetch.cjs'),
      'globalThis.fetch=undefined;import(process.argv[2]).catch(error=>{console.error(error);process.exit(1)});\n',
      'utf8',
    );
    writeFileSync(join(fixtureRoot, 'cli.original.cjs'), fixtureSource, 'utf8');
    const run = spawnSync(process.execPath, [join(fixtureRoot, 'no-fetch.cjs'), './patch.mjs'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: { HOME: fixtureRoot, PATH: dirname(process.execPath), TMPDIR: fixtureRoot },
    });
    assert.equal(run.status, 0, `${label} update fixture must patch cleanly: ${run.stdout}${run.stderr}`);
    return readFileSync(join(fixtureRoot, 'cli.original.cjs'), 'utf8');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function makeExecutable(path, source) {
  writeFileSync(path, `#!${process.execPath}\n${source}`, 'utf8');
  chmodSync(path, 0o700);
}

function runUpdateCase(label, code, options = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod update runtime '));
  assertTemporaryPath(fixtureRoot, tmpdir(), `${label} runtime fixture`);
  const home = join(fixtureRoot, 'home with spaces');
  const clawgod = join(home, '.clawgod');
  const bin = join(fixtureRoot, 'fixture bin');
  const updateTmp = join(fixtureRoot, 'private tmp');
  mkdirSync(clawgod, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(updateTmp, { recursive: true });
  for (const path of [home, clawgod, bin, updateTmp]) assertTemporaryPath(path, fixtureRoot, `${label} ${basename(path)}`);

  const target = join(clawgod, 'cli.original.cjs');
  const fetchCapture = join(fixtureRoot, 'fetch.json');
  const runCapture = join(fixtureRoot, 'run.json');
  const installerFixture = join(fixtureRoot, options.windows ? 'remote installer.ps1' : 'remote installer.sh');
  writeFileSync(installerFixture, 'fixture installer', 'utf8');
  writeFileSync(target, options.windows ? code.replace("const _w=process.platform==='win32';", 'const _w=true;') : code, 'utf8');

  makeExecutable(join(clawgod, 'fetch-file.mjs'), `
import { copyFileSync } from 'node:fs';
const [url,destination]=process.argv.slice(2);
await Bun.write(process.env.FETCH_CAPTURE,JSON.stringify({url,destination}));
if(process.env.FETCH_EXIT)process.exit(Number(process.env.FETCH_EXIT));
copyFileSync(process.env.INSTALLER_FIXTURE,destination);
`);

  const runnerName = options.windows ? 'powershell' : 'bash';
  if (!options.spawnFailure) {
    makeExecutable(join(bin, runnerName), `
await Bun.write(process.env.RUN_CAPTURE,JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.RUN_EXIT||0));
`);
  }
  for (const forbidden of ['curl', 'wget', 'irm', 'Invoke-WebRequest']) {
    makeExecutable(join(bin, forbidden), 'process.stderr.write("forbidden downloader invoked\\n");process.exit(97);');
  }

  if (options.localInstaller) {
    writeFileSync(join(clawgod, options.windows ? 'install.ps1' : 'install.sh'), 'local installer', 'utf8');
  }

  try {
    const run = spawnSync(process.execPath, [target, 'update', '--version', '2.1.220 candidate', '--lean-on'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        HOME: home,
        PATH: bin,
        TMPDIR: updateTmp,
        CLAWGOD_BUN_BIN: process.execPath,
        FETCH_CAPTURE: fetchCapture,
        RUN_CAPTURE: runCapture,
        FETCH_EXIT: options.fetchExit ? String(options.fetchExit) : '',
        RUN_EXIT: options.runExit ? String(options.runExit) : '',
        INSTALLER_FIXTURE: installerFixture,
      },
    });
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /forbidden downloader invoked/, `${label} must never execute a forbidden downloader`);
    const leftovers = readdirSync(updateTmp).filter(name => name.startsWith('clawgod-update-'));
    assert.deepEqual(leftovers, [], `${label} must clean its private update directory in finally`);
    return {
      fixtureRoot,
      clawgod,
      fetch: existsSync(fetchCapture) ? JSON.parse(readFileSync(fetchCapture, 'utf8')) : null,
      invoked: existsSync(runCapture) ? JSON.parse(readFileSync(runCapture, 'utf8')) : null,
      run,
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

for (const [label, patcher] of [['install.sh', extractUnixPatcher()], ['install.ps1', extractWindowsPatcher()]]) {
  const code = patchUpdateBranch(label, patcher);

  for (const windows of [false, true]) {
    const platform = windows ? 'Windows' : 'Unix';
    const remote = runUpdateCase(`${label} ${platform} remote update`, code, { windows });
    assert.equal(remote.run.status, 0, `${label} ${platform} remote update must succeed: ${remote.run.stderr}`);
    assert.ok(remote.fetch, `${label} ${platform} remote update must download through managed fetch-file.mjs`);
    assert.match(remote.fetch.url, windows ? /install\.ps1$/ : /install\.sh$/, `${label} ${platform} must fetch the fixed platform installer URL`);
    assert.ok(remote.fetch.destination.includes('clawgod-update-'), `${label} ${platform} must download inside a private temporary directory`);
    assert.deepEqual(remote.invoked, ['-NoProfile', '-File', remote.fetch.destination].filter((_, index) => windows || index > 1), `${label} ${platform} must invoke the downloaded installer with an argument array`);

    const local = runUpdateCase(`${label} ${platform} local update`, code, { windows, localInstaller: true });
    assert.equal(local.run.status, 0, `${label} ${platform} local update must succeed`);
    assert.equal(local.fetch, null, `${label} ${platform} local update must skip remote fetching`);
    assert.deepEqual(local.invoked, windows ? ['-NoProfile', '-File', join(local.clawgod, 'install.ps1')] : [join(local.clawgod, 'install.sh')], `${label} ${platform} must retain the managed local-installer path`);

    const nonzero = runUpdateCase(`${label} ${platform} installer nonzero`, code, { windows, runExit: 23 });
    assert.equal(nonzero.run.status, 23, `${label} ${platform} must propagate installer exit status`);

    const spawnFailure = runUpdateCase(`${label} ${platform} installer spawn failure`, code, { windows, spawnFailure: true });
    assert.notEqual(spawnFailure.run.status, 0, `${label} ${platform} must fail when the installer process cannot spawn`);

    const fetchFailure = runUpdateCase(`${label} ${platform} fetch nonzero`, code, { windows, fetchExit: 29 });
    assert.equal(fetchFailure.run.status, 29, `${label} ${platform} must propagate managed fetch failure`);
  }
}

console.log('patcher Bun-only update checks passed');
