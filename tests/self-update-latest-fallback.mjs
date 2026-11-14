#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSelfUpdate } from '../src/generic/runtime/self-update.cjs';

for (const platform of ['darwin', 'win32']) {
  for (const scenario of ['success', 'restored', 'retained', 'unconfirmed', 'signal', 'exit130', 'exit143', 'explicit', 'no-upgrade']) {
    const home = mkdtempSync(join(tmpdir(), 'clawgod-update-test-'));
    try {
      const dir = join(home, '.clawgod');
      const bin = join(home, 'bin');
      mkdirSync(dir); mkdirSync(bin);
      const runtime = join(dir, 'cli.cjs');
      const log = join(home, 'installer.log');
      writeFileSync(runtime, '原运行时\n');
      writeFileSync(join(dir, 'proxy-fetch.mjs'), '');
      writeFileSync(join(dir, 'fetch-file.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(process.argv[3], process.env.GUARD);\n`);
      const runner = join(bin, platform === 'win32' ? 'powershell' : 'bash');
      writeFileSync(runner, `#!${process.execPath}\n` + `
const fs = require('node:fs');
fs.appendFileSync(process.env.LOG, JSON.stringify({args:process.argv.slice(2), failOpen:process.env.CLAWGOD_UPDATE_PATCH_FAIL_OPEN, version:process.env.CLAWGOD_VERSION, noUpgrade:process.env.CLAWGOD_NO_UPGRADE}) + '\\n');
if (['restored', 'retained'].includes(process.env.SCENARIO)) {
  fs.writeFileSync(process.env.RUNTIME, '候选运行时\\n');
  fs.writeFileSync(process.env.RUNTIME, '原运行时\\n');
  fs.writeFileSync(process.env.CLAWGOD_UPDATE_ROLLBACK_RECEIPT, 'restored\\n');
}
if (process.env.SCENARIO === 'retained') fs.mkdirSync(process.env.RETAINED);
if (process.env.SCENARIO === 'signal') process.kill(process.pid, 'SIGINT');
process.exit(process.env.SCENARIO === 'exit130' ? 130 : process.env.SCENARIO === 'exit143' ? 143 : ['success','no-upgrade'].includes(process.env.SCENARIO) ? 0 : 23);
`);
      chmodSync(runner, 0o700);
      const messages = [];
      const argv = scenario === 'explicit' ? ['update', '--version', '2.1.303'] : scenario === 'no-upgrade' ? ['update', '--no-upgrade'] : ['update'];
      const result = runSelfUpdate(argv, {
        homeDir: home, temporaryRoot: home, platform, execPath: process.execPath,
        env: { PATH: bin, LOG: log, RUNTIME: runtime, RETAINED: join(dir, '.runtime-rollback.retained'), SCENARIO: scenario,
          GUARD: platform === 'win32' ? '$ClawRuntimeGuardVersion = 1\n' : 'CLAWGOD_RUNTIME_GUARD_VERSION=1\n',
          CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1', CLAWGOD_VERSION: 'old' },
        stderr: { write: text => messages.push(text) },
      });
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      assert.equal(calls.length, 1, `${platform}/${scenario} 不得重新运行安装器`);
      assert.equal(readFileSync(runtime, 'utf8'), '原运行时\n', `${platform}/${scenario} 应保留原运行时`);
      assert.deepEqual(readdirSync(home).filter(name => name.startsWith('clawgod-update-')), []);
      if (!['explicit', 'no-upgrade'].includes(scenario)) {
        assert.deepEqual(calls[0].args.slice(-2), [platform === 'win32' ? '-Version' : '--version', 'latest']);
        assert.equal(calls[0].failOpen, undefined);
      }
      if (scenario === 'explicit') assert.equal(calls[0].version, '2.1.303');
      if (scenario === 'no-upgrade') assert.equal(calls[0].noUpgrade, '1');
      if (scenario === 'restored') assert.match(messages.join(''), /最新版.*失败.*原运行时/);
      if (['retained', 'unconfirmed'].includes(scenario)) assert.match(messages.join(''), /未确认.*恢复|仍有恢复事务/);
      assert.deepEqual(result, scenario === 'signal' ? { status: 1, signal: 'SIGINT' } : {
        status: scenario === 'exit130' ? 130 : scenario === 'exit143' ? 143 : ['success', 'no-upgrade'].includes(scenario) ? 0 : 23,
        signal: null,
      }, `${platform}/${scenario} 应返回首次执行结果`);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
}
console.log('双平台更新：失败保留运行时、不重复安装及安全边界通过');
