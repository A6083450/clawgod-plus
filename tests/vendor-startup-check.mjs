#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../src/generic/runtime/vendor-transaction.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'clawgod-vendor-startup-'));
try {
  for (const [name, source, expected] of [
    ['empty', '', 20],
    ['valid', 'console.log("2.1.300 (Claude Code)")', 0],
    ['timeout', 'setInterval(()=>{},1000)', 20],
  ]) {
    const dir = join(root, name), transaction = join(dir, 'transaction'), live = join(dir, 'vendor'), candidate = join(transaction, 'candidate/vendor');
    mkdirSync(live, { recursive: true }); mkdirSync(candidate, { recursive: true });
    writeFileSync(join(live, 'prior.node'), 'prior');
    writeFileSync(join(candidate, 'next.node'), 'next');
    const cli = join(dir, 'cli.cjs'); writeFileSync(cli, source);
    const result = spawnSync(process.execPath, [helper, 'publish-checked', live, candidate, transaction, process.execPath, cli], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAWGOD_STARTUP_TIMEOUT_MS: '200' },
    });
    assert.equal(result.status, expected, `${name}: ${result.stderr}`);
    if (expected) {
      assert.deepEqual(readdirSync(live), ['prior.node'], '失败探测必须恢复上一套 vendor');
      assert.equal(readFileSync(join(live, 'prior.node'), 'utf8'), 'prior');
      assert.match(result.stderr, /runtime sanity check failed/);
    } else assert.equal(readFileSync(join(live, 'next.node'), 'utf8'), 'next');
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('Vendor publication bounded startup checks passed.');
