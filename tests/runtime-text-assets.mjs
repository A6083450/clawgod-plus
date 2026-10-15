#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'clawgod text assets-'));
const bun = process.env.CLAWGOD_TEST_BUN || process.execPath;
const run = (args) => {
  const result = spawnSync(bun, args, { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr + result.stdout);
};

try {
  for (const mount of ['/$bunfs/root/', 'B:/~BUN/root/']) {
    const dir = join(root, mount.startsWith('B:') ? 'windows' : 'posix', 'profile space 测试');
    mkdirSync(join(dir, 'chunks'), { recursive: true });
    mkdirSync(join(dir, 'assets'));
    copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(dir, 'post-process.mjs'));
    writeFileSync(join(dir, 'cli.original.js'),
      `import {load} from ${JSON.stringify(mount + 'chunk-helper.js')};var entryLoad=import.meta.require;export{load,entryLoad};`);
    writeFileSync(join(dir, 'chunks/chunk-helper.js'),
      `var load=import.meta.require;const embeddedSource=()=>load(${JSON.stringify(mount + 'state-library.js.txt')});export{load,embeddedSource};`);
    writeFileSync(join(dir, 'assets/state-library.js.txt'), 'export const answer = 42;\n');
    writeFileSync(join(dir, 'assets/guide.md'), '# Guide\n');
    writeFileSync(join(dir, 'assets/module.js'), 'export const value = 7;');
    writeFileSync(join(dir, 'external.txt'), 'outside the extracted graph');
    writeFileSync(join(dir, 'chunks/external.txt'), 'outside the extracted graph');
    mkdirSync(join(dir, 'assets-sibling'));
    writeFileSync(join(dir, 'assets-sibling/external.txt'), 'outside by prefix');
    if (process.platform !== 'win32') symlinkSync(join(dir, 'external.txt'), join(dir, 'assets/escape.txt'));

    run([join(dir, 'post-process.mjs'), dir]);
    const check = join(dir, 'check.mjs');
    writeFileSync(check, `
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { SourceTextModule } from 'node:vm';
import { load, entryLoad } from './cli.original.cjs';
import { embeddedSource } from './chunks/chunk-helper.js';
assert.equal(embeddedSource(), 'export const answer = 42;\\n');
assert.equal(load('../assets/state-library.js.txt'), embeddedSource());
assert.equal(entryLoad('./assets/state-library.js.txt'), embeddedSource());
const assetIds = [
  join(import.meta.dirname, 'assets/state-library.js.txt'),
  ${JSON.stringify(join(realpathSync.native(dir), 'assets/state-library.js.txt'))},
];
if (process.platform === 'win32') {
  assetIds.push(...assetIds.flatMap(id => [id.replaceAll(${JSON.stringify('\\')}, '/'), id.toLowerCase()]));
}
for (const requireAsset of [load, entryLoad]) {
  for (const id of new Set(assetIds)) {
    const source = requireAsset(id);
    assert.equal(typeof source, 'string');
    const module = new SourceTextModule(source);
    await module.link(() => { throw new Error('Unexpected dependency'); });
    await module.evaluate();
    assert.equal(module.namespace.answer, 42);
  }
  assert.equal(requireAsset(join(import.meta.dirname, 'assets/guide.md')), '# Guide\\n');
  assert.equal(requireAsset(join(import.meta.dirname, 'assets/module.js')).value, 7);
  assert.equal(typeof requireAsset('node:fs').readFileSync, 'function');
  assert.equal(requireAsset('./external.txt').default, 'outside the extracted graph');
  for (const outside of ['external.txt', 'assets/../external.txt', 'assets-sibling/external.txt',
    ...(process.platform === 'win32' ? [] : ['assets/escape.txt'])]) {
    const id = join(import.meta.dirname, outside);
    assert.equal(requireAsset(id), import.meta.require(id), outside + ' 必须保留原加载语义');
  }
  assert.throws(() => requireAsset(join(import.meta.dirname, 'assets/missing.txt')), /ENOENT/);
}
`);
    run([check]);

    const helper = readFileSync(join(dir, 'chunks/chunk-helper.js'), 'utf8');
    copyFileSync(join(dir, 'cli.original.cjs'), join(dir, 'cli.original.js'));
    run([join(dir, 'post-process.mjs'), dir]);
    assert.equal(readFileSync(join(dir, 'chunks/chunk-helper.js'), 'utf8'), helper, '重处理不能嵌套加载器');
    run([check]);
  }

  const candidate = join(root, 'candidate');
  const runtime = join(root, 'final runtime');
  mkdirSync(join(candidate, 'chunks'), { recursive: true });
  mkdirSync(runtime);
  copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(candidate, 'post-process.mjs'));
  writeFileSync(join(candidate, 'cli.original.js'), 'var load=import.meta.require;export{load};');
  writeFileSync(join(candidate, 'external.txt'), 'no asset directory');
  run([join(candidate, 'post-process.mjs'), runtime]);
  writeFileSync(join(candidate, 'check.mjs'), `
import assert from 'node:assert/strict';
import {load} from './cli.original.cjs';
assert.equal(load('./external.txt').default, 'no asset directory');
`);
  run([join(candidate, 'check.mjs')]);
  mkdirSync(join(runtime, 'assets'));
  writeFileSync(join(runtime, 'assets/guide.md'), '# Final runtime\n');
  writeFileSync(join(candidate, 'check.mjs'), `
import assert from 'node:assert/strict';
import {load} from './cli.original.cjs';
assert.equal(load(${JSON.stringify(join(runtime, 'assets/guide.md'))}), '# Final runtime\\n');
`);
  run([join(candidate, 'check.mjs')]);

  const canonical = join(root, 'canonical runtime');
  mkdirSync(join(canonical, 'chunks'), { recursive: true });
  copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(canonical, 'post-process.mjs'));
  const alias = process.platform === 'win32' ? canonical : join(root, 'runtime-alias');
  if (alias !== canonical) symlinkSync(canonical, alias, 'dir');
  writeFileSync(join(canonical, 'cli.original.js'), 'export const path="/$bunfs/root/guide.md";');
  run([join(alias, 'post-process.mjs'), alias]);
  assert.equal(readFileSync(join(canonical, 'cli.original.cjs'), 'utf8'),
    `export const path=${JSON.stringify(join(realpathSync.native(canonical), 'assets/guide.md').replaceAll('\\', '/'))};`,
    '生成路径必须展开运行目录的别名');
  console.log('文本资源：entry/chunk UTF-8 与 hooks VM、边界、路径别名及重处理通过');
} finally {
  rmSync(root, { recursive: true, force: true });
}
