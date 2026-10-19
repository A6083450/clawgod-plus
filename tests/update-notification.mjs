#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import updater from '../src/generic/runtime/self-update.cjs';
assert.equal(typeof updater.checkForUpdate, 'function');
assert.equal(updater.newerRelease('2026.10.19-claude.2.1.302.1', '2026.10.19-claude.2.1.302'), true);
assert.equal(updater.newerRelease('2026.10.19-claude.2.1.302', '2026.10.19-claude.2.1.302.1'), false);
assert.equal(updater.newerRelease('bad\u001b[31m', '1.0.0'), false);
for (const args of [[], ['--chrome']]) assert.equal(updater.shouldCheckUpdate(args, true, true, {}), true);
for (const args of [['--version'], ['--print','hi'], ['mcp'], ['daemon'], ['--resume'], ['hi']]) assert.equal(updater.shouldCheckUpdate(args, true, true, {}), false);
assert.equal(updater.shouldCheckUpdate([], false, true, {}), false);
assert.equal(updater.shouldCheckUpdate([], true, true, { CI: 'true' }), false);
const root = mkdtempSync(join(tmpdir(), 'clawgod-update-notify-'));
try {
  writeFileSync(join(root, '.clawgod-version'), '2026.10.17-claude.2.1.302');
  let requests = 0, prompts = 0, installs = 0, answer = 'skip', version = '2026.10.19-claude.2.1.302', now = 100000000;
  const options = { clawgodDir: root, now: () => now,
    fetch: async () => { requests++; return { ok: true, json: async () => ({ tag_name: 'v'+version, draft:false, prerelease:false, assets:[{name:'install.sh'},{name:'install.ps1'}] }) }; },
    ask: async value => { prompts++; assert.equal(value, version); return answer; },
    install: () => { installs++; return { status:0, signal:null }; },
  };
  assert.equal(await updater.checkForUpdate(options), null);
  assert.equal(requests, 1); assert.equal(prompts, 1); assert.equal(installs, 0);
  assert.equal(JSON.parse(readFileSync(join(root, '.update-check'), 'utf8')).skipped, version);
  await updater.checkForUpdate(options); assert.equal(requests, 1); assert.equal(prompts, 1);
  now += 86400001; version += '.1'; answer = 'later';
  await updater.checkForUpdate(options); assert.equal(prompts, 2); assert.equal(installs, 0);
  answer = 'install';
  assert.deepEqual(await updater.checkForUpdate(options), { status:0, signal:null }); assert.equal(installs, 1);
  now += 86400001;
  await updater.checkForUpdate({ ...options, fetch: async () => { throw Error('offline'); } });
  assert.equal(installs, 1, '网络失败不使用过期数据安装');
  await updater.checkForUpdate({ ...options, fetch: async () => ({ ok:true, json:async()=>({tag_name:'v999.0.0',assets:[]}) }) });
  assert.equal(installs, 1, '资产未上传完不能提供更新');
  let releaseSlow;
  const pending = updater.checkForUpdate({ ...options, fetch: () => new Promise(resolve => { releaseSlow = resolve; }), ask: async () => { throw Error('已跳过版本不该询问'); } });
  writeFileSync(join(root, '.update-check'), JSON.stringify({t:now,v:version,ready:true,skipped:version}));
  releaseSlow({ ok:true, json:async()=>({ tag_name:'v'+version, assets:[{name:'install.sh'},{name:'install.ps1'}] }) });
  await pending;
  assert.equal(JSON.parse(readFileSync(join(root, '.update-check'), 'utf8')).skipped, version, '慢请求不得覆盖另一终端保存的跳过记录');
} finally { rmSync(root, {recursive:true,force:true}); }
console.log('更新提醒：版本比较、交互范围、缓存、跳过、安装和网络失败通过');
