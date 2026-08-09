#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const unixInstaller = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');
const compatWorkflow = readFileSync(new URL('../.github/workflows/compat-daily.yml', import.meta.url), 'utf8');

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

const fixtures = [
  {
    version: '2.1.218',
    workerResolver: 'function W1t(e={}){if(!e.pinToCurrentBinary&&yRo()){let r=Xon();return{cmd:r,prefixArgs:[],target:r}}if(WE())return{cmd:process.execPath,prefixArgs:[],target:process.execPath};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[],target:process.execPath};return{cmd:process.execPath,prefixArgs:[t],target:t}}',
    plainBunResult: { cmd: '/runtime/bun', prefixArgs: ['/install/cli.cjs'], target: '/install/cli.cjs' },
    standaloneResult: { cmd: '/native/claude', prefixArgs: [], target: '/native/claude' },
  },
  {
    version: '2.1.201',
    workerResolver: 'function W1t(e={}){if(!e.pinToCurrentBinary&&yRo()){let r=Xon();return{cmd:r,prefixArgs:[]}}if(WE())return{cmd:process.execPath,prefixArgs:[]};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[t]}}',
    plainBunResult: { cmd: '/runtime/bun', prefixArgs: ['/install/cli.cjs'] },
    standaloneResult: { cmd: '/native/claude', prefixArgs: [] },
  },
];

for (const [installerName, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  for (const { version, workerResolver, plainBunResult, standaloneResult } of fixtures) {
    const name = `${installerName} Claude Code ${version}`;
    const fixture = `
/* Version: ${version} */
function WE(){return Bun.isStandaloneExecutable===!0}
${workerResolver}
function chromeMcpCommand(){return WE()?[process.execPath,"--claude-in-chrome-mcp"]:[process.execPath,process.argv[1],"--claude-in-chrome-mcp"]}
function computerUseMcpCommand(){return WE()?[process.execPath,"--computer-use-mcp"]:[process.execPath,process.argv[1],"--computer-use-mcp"]}
async function computerUseStartup(){if(Lt()==="macos"&&!_n()&&Lbo())try{let{setupComputerUseMCP:jt}=await loadComputerUse(),{mcpConfig:xr,allowedTools:Ar}=jt();return{xr,Ar}}catch(jt){}}
globalThis.standalone=WE;
globalThis.resolveWorker=W1t;
globalThis.chromeMcpCommand=chromeMcpCommand;
globalThis.computerUseMcpCommand=computerUseMcpCommand;
`;
    const dir = mkdtempSync(join(tmpdir(), 'clawgod-worker-launch-'));
    try {
      writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
      writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

      const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const output = run.stdout + run.stderr;
      assert.equal(run.status, 0, `${name}: ${output}`);
      assert.match(
        output,
        /Result: \d+ applied, \d+ skipped, 0 failed/,
        `${name}: a known worker resolver shape must not silently miss the patch`,
      );

      const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
      assert.match(
        patched,
        /function WE\(\)\{return Bun\.isStandaloneExecutable===!0\}/,
        `${name}: shared standalone predicate must retain upstream semantics`,
      );
      assert.doesNotMatch(
        patched,
        /function WE\(\)\{return!1\}/,
        `${name}: shared standalone predicate must not be globally forced false`,
      );
      assert.equal(
        patched.match(/\/\*__clawgod_plain_bun_worker__\*\//g)?.length,
        1,
        `${name}: worker resolver patch marker must be present exactly once`,
      );
      assert.match(
        patched,
        /if\(Lt\(\)==="macos"&&Lbo\(\)\)\/\*__clawgod_computer_use_noninteractive__\*\//,
        `${name}: Computer Use must be available to stream-json workers`,
      );

      const plainBun = {
        Bun: { isStandaloneExecutable: true },
        process: { execPath: '/runtime/bun', argv: ['/runtime/bun', '/install/cli.cjs'] },
        yRo: () => false,
        Xon: () => '/native/claude',
      };
      runInNewContext(patched, plainBun);
      assert.equal(plainBun.standalone(), true, `${name}: shared predicate keeps Bun's upstream value`);
      assert.deepEqual(
        JSON.parse(JSON.stringify(plainBun.resolveWorker({ pinToCurrentBinary: true }))),
        plainBunResult,
        `${name}: Bun worker launches must execute the patched cli.cjs entrypoint`,
      );
      plainBun.yRo = () => true;
      assert.deepEqual(
        JSON.parse(JSON.stringify(plainBun.resolveWorker())),
        version === '2.1.218'
          ? { cmd: '/native/claude', prefixArgs: [], target: '/native/claude' }
          : { cmd: '/native/claude', prefixArgs: [] },
        `${name}: native worker resolution must preserve the upstream object shape`,
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(plainBun.chromeMcpCommand())),
        ['/runtime/bun', '--claude-in-chrome-mcp'],
        `${name}: Chrome MCP command shape must still follow the shared standalone predicate`,
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(plainBun.computerUseMcpCommand())),
        ['/runtime/bun', '--computer-use-mcp'],
        `${name}: Computer Use MCP command shape must still follow the shared standalone predicate`,
      );

      const standalone = {
        Bun: { isStandaloneExecutable: true },
        process: { execPath: '/native/claude', argv: ['/native/claude'] },
        yRo: () => false,
        Xon: () => '/native/claude',
      };
      runInNewContext(patched, standalone);
      assert.equal(standalone.standalone(), true, `${name}: compiled runtime keeps upstream standalone semantics`);
      assert.deepEqual(
        JSON.parse(JSON.stringify(standalone.resolveWorker({ pinToCurrentBinary: true }))),
        standaloneResult,
        `${name}: standalone worker resolver must preserve its upstream object shape`,
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(standalone.chromeMcpCommand())),
        ['/native/claude', '--claude-in-chrome-mcp'],
        `${name}: standalone Chrome MCP command must not gain a cli.cjs argument`,
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(standalone.computerUseMcpCommand())),
        ['/native/claude', '--computer-use-mcp'],
        `${name}: standalone Computer Use MCP command must not gain a cli.cjs argument`,
      );

      const rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      assert.equal(rerun.status, 0, `${name} idempotence: ${rerun.stdout}${rerun.stderr}`);
      assert.equal(
        readFileSync(join(dir, 'cli.original.cjs'), 'utf8'),
        patched,
        `${name}: applying the patcher twice must not change the resolver again`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

for (const [name, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-worker-launch-stale-'));
  try {
    writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(
      join(dir, 'cli.original.cjs'),
      'function WE(){return Bun.isStandaloneExecutable===!0}function W1t(){if(WE())return{cmd:process.execPath,prefixArgs:[]};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[t],env:{}}}',
      'utf8',
    );
    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    const output = run.stdout + run.stderr;
    assert.match(
      output,
      /Worker resolver for plain Bun cli\.cjs \(legacy shape\).*known resolver shape did not match/s,
      `${name}: a shifted known legacy resolver shape must not be silently skipped`,
    );
    assert.match(output, /Result: \d+ applied, \d+ skipped, 1 failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

assert.doesNotMatch(
  compatWorkflow,
  /standalone predicate patched → false|standalone predicate was not patched to false|Bun\.isStandaloneExecutable predicate still in source/,
  'compat workflow must not require a global standalone predicate rewrite',
);
assert.match(
  compatWorkflow,
  /worker resolver patched for plain Bun/,
  'compat workflow must assert the targeted worker resolver invariant',
);

const launcherStart = unixInstaller.indexOf('LAUNCHER_CONTENT="');
const launcherEnd = unixInstaller.indexOf('"\n\n\n# Back up original claude', launcherStart);
assert.notEqual(launcherStart, -1, 'install.sh must embed the Unix launcher');
assert.notEqual(launcherEnd, -1, 'install.sh Unix launcher must end');

const launcherDir = mkdtempSync(join(tmpdir(), 'clawgod-launcher-'));
try {
  const cli = join(launcherDir, 'cli.cjs');
  const bun = join(launcherDir, 'fake-bun');
  const launcher = join(launcherDir, 'claude');
  const capture = join(launcherDir, 'argv.txt');
  writeFileSync(cli, '', 'utf8');
  writeFileSync(bun, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$CAPTURE_FILE"\n', 'utf8');
  chmodSync(bun, 0o755);

  const assignment = unixInstaller.slice(launcherStart, launcherEnd + 1);
  const rendered = spawnSync('bash', ['-c', `${assignment}\nprintf '%s' "$LAUNCHER_CONTENT"`], {
    encoding: 'utf8',
    env: { ...process.env, CLAWGOD_DIR: launcherDir, BUN_BIN: bun, CLAUDE_BIN: launcher },
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  writeFileSync(launcher, rendered.stdout, 'utf8');
  chmodSync(launcher, 0o755);

  const runLauncher = (args) => {
    const run = spawnSync(launcher, args, { encoding: 'utf8', env: { ...process.env, CAPTURE_FILE: capture } });
    assert.equal(run.status, 0, run.stderr);
    return readFileSync(capture, 'utf8').trim().split('\n');
  };

  assert.deepEqual(
    runLauncher(['--session-id', 'worker', '--input-format', 'stream-json']),
    [cli, '--session-id', 'worker', '--input-format', 'stream-json'],
    'stream-json workers must not auto-enable Chrome',
  );
  assert.deepEqual(
    runLauncher(['--session-id', 'interactive']),
    [cli, '--chrome', '--session-id', 'interactive'],
    'interactive sessions keep automatic Chrome integration',
  );
  assert.deepEqual(
    runLauncher(['--chrome', '--input-format', 'stream-json']),
    [cli, '--chrome', '--input-format', 'stream-json'],
    'an explicit --chrome still wins in stream-json mode',
  );
} finally {
  rmSync(launcherDir, { recursive: true, force: true });
}

console.log('patcher worker launch checks passed');
