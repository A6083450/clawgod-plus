#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../src/generic/runtime/runtime-state.cjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'clawgod-runtime-state-'));
try {
  const live = join(root, 'live');
  const transaction = join(root, 'transaction');
  mkdirSync(join(live, 'assets'), { recursive: true });
  mkdirSync(join(live, 'chunks'), { recursive: true });
  mkdirSync(transaction);
  const run = (...args) => spawnSync(process.execPath, [helper, ...args], {
    encoding: 'utf8', env: { ...process.env, HOME: root },
  });
  const okay = (...args) => {
    const result = run(...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  writeFileSync(join(live, 'cli.original.cjs'), 'import "./chunks/a.mjs";\n');
  writeFileSync(join(live, 'chunks', 'a.mjs'), 'export const value = 1;\n');
  writeFileSync(join(live, '.source-version'), '2.1.300\n');
  okay('clean-save', live, '2.1.300');
  writeFileSync(join(live, 'cli.cjs'), 'old wrapper');
  writeFileSync(join(live, 'assets', 'payload.txt'), 'old asset');
  writeFileSync(join(live, 'post-process.mjs'), 'old helper');
  writeFileSync(join(live, '.clawgod-version'), 'old release');
  writeFileSync(join(live, 'provider.json'), 'user provider');
  writeFileSync(join(live, 'enhancements.json'), 'user selection');
  okay('snapshot', live, transaction);
  writeFileSync(join(live, 'cli.cjs'), 'new wrapper');
  writeFileSync(join(live, 'assets', 'payload.txt'), 'new asset');
  writeFileSync(join(live, 'assets', 'extra.txt'), 'candidate-only');
  writeFileSync(join(live, 'post-process.mjs'), 'new helper');
  writeFileSync(join(live, '.source-version'), '2.2.0');
  writeFileSync(join(live, '.clawgod-version'), 'new release');
  writeFileSync(join(live, 'cli.original.cjs.bak'), 'new clean');
  writeFileSync(join(live, 'startup-check.cjs'), 'new-only helper');
  writeFileSync(join(live, 'provider.json'), 'user changed provider');
  okay('restore', live, transaction);
  assert.equal(readFileSync(join(live, 'cli.cjs'), 'utf8'), 'old wrapper');
  assert.equal(readFileSync(join(live, 'assets', 'payload.txt'), 'utf8'), 'old asset');
  assert.equal(existsSync(join(live, 'assets', 'extra.txt')), false);
  assert.equal(readFileSync(join(live, 'post-process.mjs'), 'utf8'), 'old helper');
  assert.equal(readFileSync(join(live, '.clawgod-version'), 'utf8'), 'old release');
  assert.equal(existsSync(join(live, 'startup-check.cjs')), false);
  assert.equal(readFileSync(join(live, 'provider.json'), 'utf8'), 'user changed provider');
  assert.equal(readFileSync(join(live, 'enhancements.json'), 'utf8'), 'user selection');
  writeFileSync(join(live, 'cli.original.cjs'), 'patched entry');
  writeFileSync(join(live, 'chunks', 'a.mjs'), 'patched chunk');
  writeFileSync(join(live, 'chunks', 'extra.mjs'), 'obsolete module');
  okay('clean-restore', live, '2.1.300');
  assert.equal(readFileSync(join(live, 'cli.original.cjs'), 'utf8'), 'import "./chunks/a.mjs";\n');
  assert.equal(readFileSync(join(live, 'chunks', 'a.mjs'), 'utf8'), 'export const value = 1;\n');
  assert.equal(existsSync(join(live, 'chunks', 'extra.mjs')), false);
  const before = readFileSync(join(live, 'cli.original.cjs'));
  assert.notEqual(run('clean-restore', live, '2.1.299').status, 0, 'different-version clean source must be rejected');
  assert.deepEqual(readFileSync(join(live, 'cli.original.cjs')), before, 'version rejection must precede live mutation');
  rmSync(join(live, 'chunks.bak', 'a.mjs'));
  assert.notEqual(run('clean-restore', live, '2.1.300').status, 0, 'missing clean module must reject the whole set');
  assert.deepEqual(readFileSync(join(live, 'cli.original.cjs')), before, 'incomplete backups must not partly restore');
  writeFileSync(join(live, 'chunks.bak', 'a.mjs'), 'modified backup');
  assert.notEqual(run('clean-restore', live, '2.1.300').status, 0, 'modified clean module must reject the whole set');
  if (process.platform !== 'win32') {
    for (const target of ['cli.cjs', join(root, 'user-provider.json')]) {
      const linked = join(root, `linked-${target === 'cli.cjs' ? 'legacy' : 'external'}`);
      const saved = `${linked}-transaction`;
      mkdirSync(linked); mkdirSync(saved);
      writeFileSync(join(root, 'user-provider.json'), '{"preserve":true}\n');
      writeFileSync(join(linked, 'cli.cjs'), 'old wrapper');
      symlinkSync(target, join(linked, 'cli.js'));
      okay('snapshot', linked, saved);
      assert.equal(readlinkSync(join(saved, 'runtime-state', 'cli.js')), target, '快照不得将链接展开成目标文件');
      rmSync(join(linked, 'cli.js'));
      writeFileSync(join(linked, 'cli.js'), 'new legacy wrapper');
      writeFileSync(join(linked, 'cli.cjs'), 'new wrapper');
      okay('restore', linked, saved);
      assert.ok(lstatSync(join(linked, 'cli.js')).isSymbolicLink());
      assert.equal(readlinkSync(join(linked, 'cli.js')), target, '回滚必须保留原链接文本');
      assert.equal(readFileSync(join(root, 'user-provider.json'), 'utf8'), '{"preserve":true}\n', '受管链接不能覆写外部用户文件');
      symlinkSync(join(root, 'user-provider.json'), join(linked, 'cli.original.cjs'));
      assert.notEqual(run('clean-save', linked, '2.1.300').status, 0, 'clean-source 仍必须拒绝链接，不能把外部数据当源码');
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('runtime state rollback and clean-source checks passed');
