#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSelfUpdate } from '../src/generic/runtime/self-update.cjs';

for (const platform of ['darwin', 'win32']) {
  for (const scenario of ['success', 'fallback', 'both-fail', 'explicit', 'no-upgrade', 'signal', 'retained', 'unconfirmed']) {
    const home = mkdtempSync(join(tmpdir(), 'clawgod-latest-fallback-'));
    try {
      const dir = join(home, '.clawgod'); mkdirSync(dir);
      writeFileSync(join(dir, 'fetch-file.mjs'), ''); writeFileSync(join(dir, 'proxy-fetch.mjs'), '');
      writeFileSync(join(dir, '.source-version'), '2.1.302\n');
      const calls = [], messages = [];
      const argv = scenario === 'explicit' ? ['update', '--version', '2.1.303'] : scenario === 'no-upgrade' ? ['update','--no-upgrade'] : ['update'];
      const result = runSelfUpdate(argv, { homeDir:home, temporaryRoot:home, platform,
        env:{CLAWGOD_UPDATE_PATCH_FAIL_OPEN:'1',CLAWGOD_VERSION:'old'}, stderr:{write:text=>messages.push(text)},
        spawn(command, args, options) {
          if (args[0]?.endsWith('fetch-file.mjs')) { writeFileSync(args[2], platform === 'win32' ? '$ClawRuntimeGuardVersion = 1\n' : 'CLAWGOD_RUNTIME_GUARD_VERSION=1\n'); return {status:0,signal:null}; }
          calls.push({args,env:{...options.env}});
          if (['fallback','both-fail','retained'].includes(scenario) && options.env.CLAWGOD_UPDATE_ROLLBACK_RECEIPT) writeFileSync(options.env.CLAWGOD_UPDATE_ROLLBACK_RECEIPT, 'restored\n');
          if (scenario === 'retained') mkdirSync(join(dir,'.runtime-rollback.retained'), {recursive:true});
          if (scenario === 'signal') return {status:null,signal:'SIGINT'};
          return {status:scenario === 'success' || scenario === 'no-upgrade' || scenario === 'fallback' && calls.length === 2 ? 0 : 1,signal:null};
        },
      });
      const normal = !['explicit','no-upgrade'].includes(scenario);
      if (normal) {
        assert.deepEqual(calls[0].args.slice(-2), [platform === 'win32' ? '-Version' : '--version','latest'], '普通更新先尝试 latest');
        assert.notEqual(calls[0].env.CLAWGOD_UPDATE_PATCH_FAIL_OPEN, '1', '最新版补丁失败不能伪装成成功');
      }
      if (['fallback','both-fail'].includes(scenario)) {
        assert.equal(calls.length, 2, '失败后只重试一次稳定版');
        assert.equal(calls[1].env.CLAWGOD_VERSION, undefined);
        assert.equal(calls[1].env.CLAWGOD_UPDATE_STABLE_FALLBACK, '1');
        assert.equal(calls[0].env.CLAWGOD_UPDATE_STABLE_FALLBACK, undefined);
        assert.notEqual(calls[1].env.CLAWGOD_UPDATE_PATCH_FAIL_OPEN, '1');
        assert.equal(calls[1].args.includes('latest'), false);
        assert.match(messages.join(''), /稳定|verified/);
      } else assert.equal(calls.length, 1, '成功、显式版本、中断和未恢复事务不得额外重试');
      assert.equal(result.status, ['success','fallback','no-upgrade'].includes(scenario) ? 0 : 1);
    } finally { rmSync(home, {recursive:true,force:true}); }
  }
}
console.log('双平台更新：latest优先、失败稳定重试、显式版本与中断/残留事务边界通过');
