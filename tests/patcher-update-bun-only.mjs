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
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPatcherSources } from './patcher-test-sources.mjs';

function assertTemporaryPath(path, parent, label) {
  const resolvedParent = realpathSync(parent);
  const resolvedPath = realpathSync(path);
  const child = relative(resolvedParent, resolvedPath);
  assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child), `${label} must stay under its fixture root`);
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
    const fixtureBin = join(fixtureRoot, 'fixture-only-bin');
    const fixtureHome = join(fixtureRoot, 'home');
    mkdirSync(fixtureBin);
    mkdirSync(fixtureHome);
    assertTemporaryPath(fixtureBin, fixtureRoot, `${label} patch PATH`);
    assertTemporaryPath(fixtureHome, fixtureRoot, `${label} patch HOME`);
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
      env: { HOME: fixtureHome, PATH: fixtureBin, TMPDIR: fixtureRoot },
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
  const enhancementsFile = join(clawgod, 'enhancements.json');
  const savedConfig = '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "agents",\n    "branding"\n  ]\n}\n';
  const fetchCapture = join(fixtureRoot, 'fetch.json');
  const runCapture = join(fixtureRoot, 'run.json');
  const installerFixture = join(fixtureRoot, options.windows ? 'remote installer.ps1' : 'remote installer.sh');
  writeFileSync(installerFixture, 'fixture installer', 'utf8');
  writeFileSync(target, options.windows ? code.replace("const _w=process.platform==='win32';", 'const _w=true;') : code, 'utf8');
  writeFileSync(enhancementsFile, savedConfig, { mode: 0o600 });
  const configBefore = statSync(enhancementsFile);

  makeExecutable(join(clawgod, 'fetch-file.mjs'), `
import { copyFileSync } from 'node:fs';
const [url,destination]=process.argv.slice(2);
await Bun.write(process.env.FETCH_CAPTURE,JSON.stringify({url,destination}));
if(process.env.FETCH_EXIT)process.exit(Number(process.env.FETCH_EXIT));
copyFileSync(process.env.INSTALLER_FIXTURE,destination);
`);
  if (!options.missingProxyFetch) writeFileSync(join(clawgod, 'proxy-fetch.mjs'), '// proxy companion fixture\n', 'utf8');

  const runnerName = options.windows ? 'powershell' : 'bash';
  if (!options.spawnFailure) {
    makeExecutable(join(bin, runnerName), `
const args=process.argv.slice(2);
await Bun.write(process.env.RUN_CAPTURE,JSON.stringify({args,noninteractive:process.env.CLAWGOD_NONINTERACTIVE||''}));
if(process.env.REQUIRE_POWERSHELL_BYPASS==='1'){
  const expected=['-NoProfile','-ExecutionPolicy','Bypass','-File',args[4]];
  if(args.length!==expected.length||args.some((value,index)=>value!==expected[index]))process.exit(91);
}
process.exit(Number(process.env.RUN_EXIT||0));
`);
  }
  for (const forbidden of ['curl', 'wget', 'irm', 'Invoke-WebRequest']) {
    makeExecutable(join(bin, forbidden), 'process.stderr.write("forbidden downloader invoked\\n");process.exit(97);');
  }

  if (options.localInstaller) {
    const installerVersion = options.localInstallerVersion ?? options.localVersion ?? '0.0.0-dev';
    const installerVersionLine = options.windows
      ? `$ClawSelfVersion = "${installerVersion}"`
      : `CLAWGOD_SELF_VERSION="${installerVersion}"`;
    const installerSource = options.localInstallerVersion === null
      ? 'local installer without a version declaration\n'
      : `${installerVersionLine}\n${options.duplicateInstallerDeclaration ? `${installerVersionLine}\n` : ''}local installer\n`;
    writeFileSync(
      join(clawgod, options.windows ? 'install.ps1' : 'install.sh'),
      installerSource,
      'utf8',
    );
    if (options.localVersion !== undefined) {
      writeFileSync(join(clawgod, '.clawgod-version'), `${options.localVersion}\n`, 'utf8');
    }
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
        REQUIRE_POWERSHELL_BYPASS: options.windows ? '1' : '',
      },
    });
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /forbidden downloader invoked/, `${label} must never execute a forbidden downloader`);
    const leftovers = readdirSync(updateTmp).filter(name => name.startsWith('clawgod-update-'));
    assert.deepEqual(leftovers, [], `${label} must clean its private update directory in finally`);
    const configAfter = statSync(enhancementsFile);
    assert.equal(readFileSync(enhancementsFile, 'utf8'), savedConfig, `${label} must preserve saved enhancement config bytes`);
    assert.equal(configAfter.mode & 0o7777, configBefore.mode & 0o7777, `${label} must preserve saved enhancement config mode`);
    assert.equal(configAfter.ino, configBefore.ino, `${label} must preserve saved enhancement config identity`);
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

const patchedUpdateBranches = (await getPatcherSources())
  .map(([label, patcherSource]) => [label, patchUpdateBranch(label, patcherSource)]);

for (const [label, code] of patchedUpdateBranches) {
  assert.equal(
    code.match(/import\.meta\.require\('(fs|path|os|child_process)'\)/g)?.length,
    4,
    `${label} updater must load Node builtins through ESM-safe import.meta.require`,
  );
  assert.doesNotMatch(
    code,
    /(?<!import\.meta\.)require\('(fs|path|os|child_process)'\)/,
    `${label} updater must not use bare require inside a code-split ESM chunk`,
  );
}

function windowsUpdateCommandSource(code) {
  const match = code.match(/const __command=_w\?\[([^\]]+)\]:\['bash',__installer\]/);
  assert.ok(match, 'generated update branch must retain the Windows and Unix argument-array command selection');
  return match[1];
}

const expectedWindowsCommand = "'powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',__installer";
for (const [label, code] of patchedUpdateBranches) {
  assert.equal(windowsUpdateCommandSource(code), expectedWindowsCommand, `${label} must generate the complete PowerShell execution-policy argv in exact order`);
}
for (const [label, code] of patchedUpdateBranches) {

  for (const windows of [false, true]) {
    const platform = windows ? 'Windows' : 'Unix';
    const remote = runUpdateCase(`${label} ${platform} remote update`, code, { windows });
    assert.equal(remote.run.status, 0, `${label} ${platform} remote update must succeed: ${remote.run.stderr}`);
    assert.ok(remote.fetch, `${label} ${platform} remote update must download through managed fetch-file.mjs`);
    assert.match(remote.fetch.url, windows ? /install\.ps1$/ : /install\.sh$/, `${label} ${platform} must fetch the fixed platform installer URL`);
    assert.ok(remote.fetch.destination.includes('clawgod-update-'), `${label} ${platform} must download inside a private temporary directory`);
    assert.deepEqual(
      remote.invoked.args,
      windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', remote.fetch.destination] : [remote.fetch.destination],
      `${label} ${platform} must invoke the downloaded installer with the complete argument array`,
    );
    assert.equal(remote.invoked.noninteractive, '1', `${label} ${platform} must mark the spawned installer noninteractive`);

    for (const stableVersion of [
      '1.7.7',
      '2026.8.17-claude.2.1.233',
      '2026.8.18-claude.2.1.234.2',
    ]) {
      const stableLocal = runUpdateCase(`${label} ${platform} ${stableVersion} stable local update`, code, {
        windows,
        localInstaller: true,
        localVersion: stableVersion,
      });
      assert.equal(stableLocal.run.status, 0, `${label} ${platform} ${stableVersion} stable local update must succeed`);
      assert.equal(stableLocal.fetch, null, `${label} ${platform} ${stableVersion} stable local update must skip remote fetching`);
      assert.deepEqual(
        stableLocal.invoked.args,
        windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(stableLocal.clawgod, 'install.ps1')] : [join(stableLocal.clawgod, 'install.sh')],
        `${label} ${platform} ${stableVersion} must retain the trusted managed local-installer path`,
      );
      assert.equal(stableLocal.invoked.noninteractive, '1', `${label} ${platform} ${stableVersion} must mark the stable local installer noninteractive`);
    }

    for (const [versionLabel, localVersion, localInstallerVersion, duplicateInstallerDeclaration] of [
      ['development', '0.0.0-dev', undefined, false],
      ['missing-version', undefined, undefined, false],
      ['malformed-version', '../local', undefined, false],
      ['stale-development-installer', '2026.8.18-claude.2.1.234.2', '0.0.0-dev', false],
      ['mismatched-stable-installer', '2026.8.18-claude.2.1.234.2', '2026.8.17-claude.2.1.233.1', false],
      ['missing-installer-declaration', '2026.8.18-claude.2.1.234.2', null, false],
      ['duplicate-installer-declaration', '2026.8.18-claude.2.1.234.2', '2026.8.18-claude.2.1.234.2', true],
    ]) {
      const untrustedLocal = runUpdateCase(`${label} ${platform} ${versionLabel} local update`, code, {
        windows,
        localInstaller: true,
        localVersion,
        localInstallerVersion,
        duplicateInstallerDeclaration,
      });
      assert.equal(untrustedLocal.run.status, 0, `${label} ${platform} ${versionLabel} local update must succeed`);
      assert.ok(untrustedLocal.fetch, `${label} ${platform} ${versionLabel} local update must refresh from the release asset`);
      assert.match(untrustedLocal.fetch.url, windows ? /install\.ps1$/ : /install\.sh$/, `${label} ${platform} ${versionLabel} update must fetch the platform installer`);
      assert.deepEqual(
        untrustedLocal.invoked.args,
        windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', untrustedLocal.fetch.destination] : [untrustedLocal.fetch.destination],
        `${label} ${platform} ${versionLabel} update must invoke the refreshed installer`,
      );
      assert.equal(untrustedLocal.invoked.noninteractive, '1', `${label} ${platform} ${versionLabel} refreshed installer must be noninteractive`);
    }

    const nonzero = runUpdateCase(`${label} ${platform} installer nonzero`, code, { windows, runExit: 23 });
    assert.equal(nonzero.run.status, 23, `${label} ${platform} must propagate installer exit status`);

    const spawnFailure = runUpdateCase(`${label} ${platform} installer spawn failure`, code, { windows, spawnFailure: true });
    assert.notEqual(spawnFailure.run.status, 0, `${label} ${platform} must fail when the installer process cannot spawn`);

    const fetchFailure = runUpdateCase(`${label} ${platform} fetch nonzero`, code, { windows, fetchExit: 29 });
    assert.equal(fetchFailure.run.status, 29, `${label} ${platform} must propagate managed fetch failure`);

    const missingProxyFetch = runUpdateCase(`${label} ${platform} missing proxy companion`, code, { windows, missingProxyFetch: true });
    assert.equal(missingProxyFetch.run.status, 1, `${label} ${platform} must fail before invoking a fetch helper whose proxy companion is missing`);
    assert.equal(missingProxyFetch.fetch, null, `${label} ${platform} must not invoke fetch-file.mjs without its proxy companion`);
    assert.match(missingProxyFetch.run.stderr, /managed proxy-fetch\.mjs is missing; reinstall ClawGod Plus/, `${label} ${platform} must explain how to recover a missing proxy companion`);
  }

  const wrongPolicyCode = code.replace("'Bypass'", "'RemoteSigned'");
  const wrongPolicy = runUpdateCase(`${label} Windows wrong execution policy`, wrongPolicyCode, { windows: true });
  assert.equal(wrongPolicy.run.status, 91, `${label} fixture must reject an incorrect PowerShell execution policy`);
}

console.log('patcher Bun-only update checks passed');
