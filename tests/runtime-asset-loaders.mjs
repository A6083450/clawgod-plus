#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPatcherBundle } from '../build.mjs';

const root = mkdtempSync(join(tmpdir(), 'clawgod-asset-loaders-'));
const run = args => {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr + result.stdout);
};
try {
  const patcher = await buildPatcherBundle();
  for (const mount of ['/$bunfs/root/', 'B:/~BUN/root/']) {
    const dir = join(root, mount.startsWith('B:') ? 'windows' : 'posix', 'profile space 测试');
    mkdirSync(join(dir, 'chunks'), { recursive: true });
    mkdirSync(join(dir, 'assets'));
    copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(dir, 'post-process.mjs'));
    const assets = {};
    const templates = {};
    for (const extension of ['mjs', 'js', 'cjs', 'ts', 'tsx', 'jsx', 'md', 'txt', 'json', '']) {
      const name = `runner${extension ? '.' + extension : ''}`;
      templates[name] = `#!/usr/bin/env bun\n// @bun\nvar load=import.meta.require;const resource=${JSON.stringify(mount + 'guide.md')};process.exit(2);\n// .command("update").alias("upgrade")\n`;
      assets[mount + name] = { path: 'assets/' + name, loader: 'text' };
      writeFileSync(join(dir, 'assets', name), templates[name]);
    }
    templates['file.mjs'] = '// @bun\nprocess.exit(3);\n';
    assets[mount + 'file.mjs'] = { path: 'assets/file.mjs', loader: 'file' };
    assets[mount + 'binary.js'] = { path: 'assets/binary.js', loader: 'file' };
    assets[mount + 'guide.md'] = { path: 'assets/guide.md', loader: 'text' };
    writeFileSync(join(dir, 'assets/file.mjs'), templates['file.mjs']);
    const binary = Buffer.from([0, 255, 128, 13, 10]);
    writeFileSync(join(dir, 'assets/binary.js'), binary);
    writeFileSync(join(dir, 'assets/guide.md'), '# Guide\n');
    writeFileSync(join(dir, 'asset-loaders.json'), JSON.stringify({ schemaVersion: 1, assets }));
    writeFileSync(join(dir, 'cli.original.js'), `import{load}from${JSON.stringify(mount + 'chunk-helper.js')};var entryLoad=import.meta.require;export{load,entryLoad};`);
    writeFileSync(join(dir, 'chunks/chunk-helper.js'), `var load = import.meta.require;let assigned;assigned = import.meta['require'];const direct=import.meta.require(${JSON.stringify(mount + 'runner.mjs')});const file=import.meta['require'](${JSON.stringify(mount + 'file.mjs')});export{load,assigned,direct,file};`);
    writeFileSync(join(dir, 'external.txt'), 'outside the extracted graph');
    run([join(dir, 'post-process.mjs'), dir]);
    const check = join(dir, 'check.mjs');
    writeFileSync(check, `
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {load,entryLoad} from './cli.original.cjs';
import {assigned,direct,file} from './chunks/chunk-helper.js';
assert.equal(direct, ${JSON.stringify(templates['runner.mjs'])});
assert.equal(file, join(import.meta.dirname,'assets/file.mjs'));
const templates=${JSON.stringify(templates)};
for(const requireAsset of [load,entryLoad,assigned]) {
  for(const [name,source] of Object.entries(templates)) {
    const id=join(import.meta.dirname,'assets',name);
    assert.equal(requireAsset(id),name==='file.mjs'?id:source);
  }
  const file=join(import.meta.dirname,'assets/binary.js');
  assert.equal(requireAsset(file),file);
  assert.equal(requireAsset(join(import.meta.dirname,'assets/guide.md')),'# Guide\\n');
  assert.equal(typeof requireAsset('node:fs').readFileSync,'function');
  assert.equal(requireAsset(join(import.meta.dirname,'external.txt')).default,'outside the extracted graph');
  assert.throws(()=>requireAsset(join(import.meta.dirname,'assets/missing.txt')),/Cannot find module|ENOENT/);
}
assert.equal(load('../assets/runner.ts'),templates['runner.ts']);
assert.equal(entryLoad('./assets/runner.ts'),templates['runner.ts']);
`);
    run([check]);
    const helper = readFileSync(join(dir, 'chunks/chunk-helper.js'));
    copyFileSync(join(dir, 'cli.original.cjs'), join(dir, 'cli.original.js'));
    run([join(dir, 'post-process.mjs'), dir]);
    assert.deepEqual(readFileSync(join(dir, 'chunks/chunk-helper.js')), helper, '重处理不能嵌套资源加载器');
    run([check]);
    // 补丁与回滚只处理 entry/chunks，不能把代码形状的资源当成补丁输入。
    writeFileSync(join(dir, 'patch.mjs'), patcher);
    for (const args of [['--dry-run', '--tolerate-stale'], ['--tolerate-stale'], ['--revert']]) run([join(dir, 'patch.mjs'), ...args]);
    for (const [name, text] of Object.entries(templates)) assert.equal(readFileSync(join(dir, 'assets', name), 'utf8'), text);
    assert.deepEqual(readFileSync(join(dir, 'assets/binary.js')), binary);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('资源 loader：text/file 任意后缀、别名/赋值/direct require、幂等与补丁排除通过');
