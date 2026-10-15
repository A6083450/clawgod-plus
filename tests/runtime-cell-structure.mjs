#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as processor from '../src/generic/runtime/post-processor.mjs';
assert.equal(typeof processor.structuralModule, 'function', '结构识别必须接入后处理器，不能只有解析器');
const { structuralModule } = processor;

const original = 'import {x as first} from "/$bunfs/root/chunk-one.js";const count=8;function draw(value){let width=count;return first(value,width)}export{draw};';
const renamed = 'import {z as other} from "/$bunfs/root/chunk-two.js";const size=8;function paint(text){let column=size;return other(text,column)}export{paint};';
assert.equal(structuralModule(original).digest, structuralModule(renamed).digest);
assert.notEqual(structuralModule(original).digest, structuralModule(renamed.replace('size=8', 'size=9')).digest);
assert.notEqual(structuralModule(original).digest, structuralModule(renamed.replace('other(text,column)', 'other(column,text)')).digest);
assert.notEqual(structuralModule('function f(x){return Math.max(x,8)}').digest, structuralModule('function f(Math){return Math.max(Math,8)}').digest);
assert.notEqual(structuralModule('function f(x){return x.width}').digest, structuralModule('function f(x){return x.height}').digest);
assert.notEqual(structuralModule('function f(x){return "width"}').digest, structuralModule('function f(x){return "height"}').digest);
assert.notEqual(structuralModule('function f(x){let y=1;return ()=>x+y}').digest, structuralModule('function f(x){let y=1;return y=>y+y}').digest);
assert.notEqual(structuralModule('import{x,y}from"fs";x()').digest, structuralModule('import{y,x}from"fs";y()').digest);
assert.throws(() => structuralModule('function f(){eval("bad")}'));
assert.throws(() => structuralModule('function {'));
assert.notEqual(structuralModule('const x=1;export{x}').digest, structuralModule('const x=1;export{x as missing}').digest, '导出缺失不能伪装成绑定改名');
assert.notEqual(structuralModule('const x=1,y=2;export{x,y}').digest, structuralModule('const x=1,y=2;export{x as y,y as x}').digest);
assert.notEqual(structuralModule('const x=null').digest, structuralModule('const x=1e400').digest, '非有限数不能签名为 null');
const source = readFileSync(new URL('./fixtures/cell-renderer-2.1.299-darwin-full.txt', import.meta.url), 'utf8');
const dependencies = new Map([
  ['chunk-eeansh1q.js', readFileSync(new URL('./fixtures/cell-renderer-2.1.299-darwin-ansi.txt', import.meta.url), 'utf8')],
  ['chunk-b970rh6w.js', readFileSync(new URL('./fixtures/cell-renderer-2.1.299-darwin-shared.txt', import.meta.url), 'utf8')],
  ['chunk-92mfkn69.js', readFileSync(new URL('./fixtures/cell-renderer-2.1.299-darwin-text.txt', import.meta.url), 'utf8')],
]);
const ast = structuralModule(source).ast;
for (const [kind, local] of [['tabs', 'wOe'], ['styles', 'Nfs'], ['chalk', 'MIe']]) {
  const imported = ast.body.find(node => node.type === 'ImportDeclaration' && node.specifiers.some(item => item.local.name === local));
  dependencies.set(imported.source.value.split('/').at(-1), readFileSync(new URL(`./fixtures/cell-renderer-2.1.299-darwin-${kind}.txt`, import.meta.url), 'utf8'));
}
assert.notEqual(processor.adaptCellRenderer(source, undefined, dependencies), null, '2.1.299 必须可适配');
const root = mkdtempSync(join(tmpdir(), 'clawgod-cell-structure-'));
try {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const fixture = kind => readFileSync(new URL(`./fixtures/cell-renderer-2.1.299-${platform}-${kind}.txt`, import.meta.url), 'utf8');
    const renderer = fixture('full');
    const imports = structuralModule(renderer).ast.body.filter(node => node.type === 'ImportDeclaration');
    const helperNames = platform === 'darwin' ? ['wOe', 'Nfs', 'MIe'] : platform === 'linux' ? ['mOe', 'ups', 'CIe'] : ['mIe', 'hps', 'ROe'];
    const factory = platform === 'darwin' ? 'eMn' : platform === 'linux' ? 'MHn' : 'j0n';
    const files = new Map([[ 'chunk-render.js', renderer ]]);
    for (const [kind, local] of [['tabs', helperNames[0]], ['styles', helperNames[1]], ['chalk', helperNames[2]], ['shared', factory]]) {
      const imported = imports.find(node => node.specifiers.some(item => item.local.name === local));
      files.set(imported.source.value.split('/').at(-1), fixture(kind));
    }
    const shared = imports.find(node => node.specifiers.some(item => item.local.name === factory)).source.value;
    const ansi = imports.find(node => node.specifiers.some(item => item.local.name === (platform === 'darwin' ? 'jst' : platform === 'linux' ? 'Hst' : 'Nst'))).source.value;
    files.set(ansi.split('/').at(-1), fixture('ansi'));
    files.set('chunk-text.js', fixture('text'));
    assert.notEqual(processor.adaptCellRenderer(renderer, undefined, files), null, `${platform} 真实模块必须通过`);
    // 重命名整张模块图，包含局部绑定和导出名，不能靠原名或原路径碰巧通过。
    const rename = text => {
      const parsed = structuralModule(text);
      const replacements = [...new Map(parsed.identifiers.map(item => [item.start, item])).values()]
        .map(item => [item.start, item.end, item.shorthand ? `${item.name}:renamed_${item.name}` : `renamed_${item.name}`]);
      let renamed = text;
      for (const [start, end, value] of replacements.sort((a, b) => b[0] - a[0])) renamed = renamed.slice(0, start) + value + renamed.slice(end);
      return renamed.replace(/chunk-([\w-]+)\.js/g, 'chunk-renamed-$1.js');
    };
    const renamed = new Map([...files].map(([name, text]) => [name.replace('chunk-', 'chunk-renamed-'), rename(text)]));
    assert.notEqual(processor.adaptCellRenderer(renamed.get('chunk-renamed-render.js'), undefined, renamed), null, `${platform} 改名不能阻断兼容`);
    for (const drift of ['valid', 'renamed', 'constant', 'helper', 'consumer', 'prefix', 'export', 'import', 'text']) {
      const modules = new Map(drift === 'renamed' ? renamed : files);
      const renderFile = drift === 'renamed' ? 'chunk-renamed-render.js' : 'chunk-render.js';
      if (drift === 'constant') modules.set(renderFile, renderer.replace('widthMask:vn', 'widthMask:999'));
      if (drift === 'helper') modules.set(ansi.split('/').at(-1), fixture('ansi').replace('Number.POSITIVE_INFINITY', '0'));
      if (drift === 'text') modules.set('chunk-text.js', fixture('text').replace('return!1;return!0', 'return!0;return!0'));
      if (drift === 'consumer') modules.set('chunk-unknown.js', `import{${factory} as alias}from"${shared}";alias([]);`);
      if (drift === 'prefix') modules.set('chunk-unknown.js', `import{${factory}}from"${shared.replace(/^(?:B:\/~BUN|\/\$bunfs)/, platform === 'win32' ? '/$bunfs' : 'B:/~BUN')}";${factory}([]);`);
      const tokenizer = platform === 'darwin' ? 'mcs' : platform === 'linux' ? 'xds' : 'Nds';
      if (drift === 'export') modules.set(ansi.split('/').at(-1), fixture('ansi').replace(new RegExp(`${tokenizer}(?=[,}])`), `${tokenizer} as missing`));
      if (drift === 'import') modules.set(renderFile, renderer.replace(/import\{(?:jst|Hst|Nst),/, `import{${tokenizer} as ${platform === 'darwin' ? 'jst' : platform === 'linux' ? 'Hst' : 'Nst'},`));
      const dir = join(root, `${platform}-${drift}`);
      mkdirSync(join(dir, 'chunks'), { recursive: true });
      copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(dir, 'post-process.mjs'));
      writeFileSync(join(dir, 'cli.original.js'), `import "/$bunfs/root/${renderFile}";`);
      for (const [file, text] of modules) writeFileSync(join(dir, 'chunks', file), text);
      const result = spawnSync(process.execPath, [join(dir, 'post-process.mjs')], { encoding: 'utf8', timeout: 20000 });
      assert.ifError(result.error);
      if (!['valid', 'renamed'].includes(drift)) {
        assert.notEqual(result.status, 0, `${platform}-${drift} 必须拒绝`);
        assert.equal(readFileSync(join(dir, 'chunks', renderFile), 'utf8'), modules.get(renderFile), '失败必须零改写');
      } else {
        assert.equal(result.status, 0, result.stderr);
        const textFile = drift === 'renamed' ? 'chunk-renamed-text.js' : 'chunk-text.js';
        const output = readFileSync(join(dir, 'chunks', textFile), 'utf8');
        const declaration = structuralModule(output).ast.body.find(node => node.type === 'FunctionDeclaration'
          && output.slice(node.start, node.end).includes('.indexOf(') && output.slice(node.start, node.end).includes('.trimEnd()'));
        const body = output.slice(declaration.start, declaration.end);
        const normalize = body.match(/let [\w$]+=([\w$]+)\([\w$]+\);return/)[1];
        const reserved = body.match(/return ([\w$]+)\.find/)[1];
        const checkName = new Function(normalize, reserved, `${body};return ${declaration.id.name}`)(
          value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{Cc}\p{Cf}]/gu, ''), ['anthropic-skills']);
        for (const name of ['anthropic-skills', 'ａｎｔｈｒｏｐｉｃ-skills', 'anthro​pic-skills', 'anthro\x00pic-skills', '💡anthropic-x-skills']) {
          assert.equal(checkName(name), 'anthropic-skills', `${platform}-${drift} 防冒充必须保留`);
        }
        assert.equal(checkName('正常技能'), undefined);
        assert.equal(checkName('café-tools'), undefined);
        assert.doesNotMatch([...modules.keys()].map(file => readFileSync(join(dir, 'chunks', file), 'utf8')).join('\n'), /new Bun\.ant\.CellSegmenter/);
      }
    }
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('结构签名：三平台真实模块与改名兼容，语义漂移和未知调用者零改写拒绝');
