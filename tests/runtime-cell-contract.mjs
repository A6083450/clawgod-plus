#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import * as processor from '../src/generic/runtime/post-processor.mjs';

// 整模块冻结会错误拒绝无关声明变化；闭包必须同时捕获被引用常量的变化。
assert.equal(typeof processor.cellDeclarationContract, 'function', '必须按局部声明闭包验证渲染契约');
const { cellDeclarationContract: contract } = processor;
const original = 'import{x as helper}from"/$bunfs/root/chunk-a.js";const mask=3;function draw(x){return helper(x)&mask}function unrelated(){return 1}';
const renamed = 'function unrelated(){return 999}import{z as other}from"/$bunfs/root/chunk-b.js";const width=3;function paint(y){return other(y)&width}';
assert.equal(contract(original, ['draw']).digest, contract(renamed, ['paint']).digest);
assert.notEqual(contract(original, ['draw']).digest, contract(original.replace('mask=3', 'mask=7'), ['draw']).digest);
assert.notEqual(contract(original, ['draw']).digest, contract(original.replace('helper(x)', 'helper(mask)'), ['draw']).digest);
assert.throws(() => contract(original, ['missing']));
assert.throws(() => contract('function draw(){return eval("x")}', ['draw']));
assert.throws(() => contract('let mask=3;mask=7;function draw(){return mask}', ['draw']), /顶层/);
for (const suffix of ['function init(){mask=7}init();', 'class Init{static{mask=7}}']) {
  assert.throws(() => contract(original + suffix, ['draw']), /顶层/, '间接顶层副作用必须拒绝');
}
assert.notEqual(contract('var mask=3,limit=1<<mask;function draw(){return limit}', ['draw']).digest,
  contract('var limit=1<<mask,mask=3;function draw(){return limit}', ['draw']).digest, '初始化顺序必须进入契约');

for (const [platform, renderFile] of [['darwin', 'chunk-7mzb8nrq.js'], ['linux', 'chunk-x66h7b21.js'], ['win32', 'chunk-1jz9m9yh.js']]) {
const files = new Map(JSON.parse(readFileSync(new URL(`./fixtures/cell-contract-2.1.303-${platform}-graph.txt`, import.meta.url), 'utf8')));
const source = files.get(renderFile);
assert.notEqual(processor.adaptCellRenderer(source, undefined, files), null, '303 的相同渲染接口无需新增版本指纹');
const rename = text => {
  const parsed = processor.structuralModule(text);
  const changes = [...new Map(parsed.identifiers.map(item => [item.start, item])).values()].sort((a, b) => b.start - a.start);
  for (const item of changes) text = text.slice(0, item.start) + (item.shorthand ? `${item.name}:` : '') + `renamed_${item.name}` + text.slice(item.end);
  return text.replace(/chunk-([\w-]+)\.js/g, 'chunk-renamed-$1.js');
};
const renamedFiles = new Map([...files].map(([name, text]) => [name.replace('chunk-', 'chunk-renamed-'), rename(text)]));
assert.notEqual(processor.adaptCellRenderer(renamedFiles.get(renderFile.replace('chunk-', 'chunk-renamed-')), undefined, renamedFiles), null, '整张模块图改名仍兼容');
assert.notEqual(processor.adaptCellRenderer(source + '\nfunction unrelatedNewFeature(){return "new"}', undefined, files), null);
const [sharedFile, sharedSource] = [...files].find(([, text]) => text.includes('new Bun.ant.CellSegmenter'));
const sharedAst = processor.structuralModule(sharedSource).ast;
const factory = sharedAst.body.find(node => node.id && sharedSource.slice(node.start, node.end).includes('new Bun.ant.CellSegmenter')).id.name;
const sharedSpecifier = processor.structuralModule(source).ast.body.find(node => node.type === 'ImportDeclaration' && basename(node.source.value) === sharedFile).source.value;
for (const variant of ['valid', 'renamed', 'unrelated', 'unknown-caller', 'alias-caller', 'text-drift', 'ansi-drift']) {
  const modules = new Map(variant === 'renamed' ? renamedFiles : files);
  if (variant === 'unrelated') for (const [file, text] of modules) {
    if (text.includes('stylePool;charPool;native=') || text.includes('.trimEnd()')) modules.set(file, text + '\nfunction unrelatedNewFeature(){return 123}');
  }
  if (variant === 'unknown-caller') modules.set('chunk-unknown.js', `import{${factory}}from${JSON.stringify(sharedSpecifier)};${factory}([]);`);
  if (variant === 'alias-caller') modules.set('chunk-unknown.js', `import{${factory} as alias}from${JSON.stringify(sharedSpecifier)};alias([]);`);
  if (variant === 'text-drift') for (const [file, text] of modules) {
    if (text.includes('.trimEnd()') && text.includes(`${factory}(`) && !text.includes('stylePool;charPool;native=')) modules.set(file, text.replace('return!1;return!0', 'return!0;return!0'));
  }
  if (variant === 'ansi-drift') for (const [file, text] of modules) {
    if (text.includes('Number.POSITIVE_INFINITY') && text.includes('type:"ansi"') && !text.includes('stylePool;charPool;native=')) modules.set(file, text.replace('Number.POSITIVE_INFINITY', '0'));
  }
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-local-contract-'));
  try {
    mkdirSync(join(dir, 'chunks'));
    copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(dir, 'post-process.mjs'));
    writeFileSync(join(dir, 'cli.original.js'), '');
    for (const [file, text] of modules) writeFileSync(join(dir, 'chunks', file), text);
    const result = spawnSync(process.execPath, [join(dir, 'post-process.mjs')], { encoding: 'utf8', timeout: 120000 });
    assert.ifError(result.error);
    if (['valid', 'renamed', 'unrelated'].includes(variant)) {
      assert.equal(result.status, 0, `${platform}/${variant}: ${result.stderr}`);
      const factoryFile = variant === 'renamed' ? sharedFile.replace('chunk-', 'chunk-renamed-') : sharedFile;
      assert.doesNotMatch(readFileSync(join(dir, 'chunks', factoryFile), 'utf8'), /new Bun\.ant\.CellSegmenter/);
    } else {
      assert.notEqual(result.status, 0, `${platform}/${variant} 必须拒绝`);
      for (const [file, text] of modules) assert.equal(readFileSync(join(dir, 'chunks', file), 'utf8'), text, '拒绝时必须零改写');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
if (platform === 'darwin') {
  const terminated = source.replace(':dg(n,f,m,p)}', ':dg(n,f,m,p); }');
  assert.notEqual(terminated, source);
  const adapted = processor.adaptCellRenderer(terminated, undefined, files);
  assert.ok(adapted);
  const draw = processor.structuralModule(adapted).ast.body.find(node => node.id?.name === 'gC');
  assert.match(adapted.slice(draw.start, draw.end), /paintCells\(n,p\.cells,f,m\)/, '分号/空格不能留下旧原生绘制调用');
  const collision = processor.adaptCellRenderer(source.replace(/\bOb\b/g, 'cmr'), undefined, files);
  assert.ok(collision);
  const line = processor.structuralModule(collision).ast.body.find(node => node.id?.name === 'gC');
  assert.match(collision.slice(line.start, line.end), /cmr\[g\]/, '上游短名不能被模板映射二次改写');
  for (const [output, node, table] of [[adapted, draw, 'Ob'], [collision, line, 'cmr']]) {
    let segmented;
    const paint = new Function('lf', 'Dl', table, 'paintCells', `${output.slice(node.start,node.end)};return gC`)(
      value => value !== undefined, () => false, { rtl: '‏' }, (_screen, cells, x) => x + cells.length);
    assert.equal(paint({}, 'X', 2, 0, { segment(text) { segmented = text; }, count: 1, cells: ['X'] }, 'rtl'), 3);
    assert.equal(segmented, '‏X', '生成的真实画行函数必须保留方向标记并调用 JS painter');
  }
  const reordered = source.replace('var $i=17,Cr=2,Sl=32767,vn=3,t1=(1<<32-$i)-1', 'var t1=(1<<32-$i)-1,$i=17,Cr=2,Sl=32767,vn=3');
  assert.notEqual(reordered, source);
  assert.equal(processor.adaptCellRenderer(reordered, undefined, files), null, '真实初始化顺序改变必须拒绝');
  for (const suffix of ['function newInit(){vn=7}newInit();', 'class ExtraInit{static{vn=7}}']) {
    assert.equal(processor.adaptCellRenderer(source + suffix, undefined, files), null, '真实模块的间接布局改写必须拒绝');
  }
  for (const [file, local, wrong] of [['chunk-jvm9gah6.js', 'he', 'F0e'], ['chunk-vx1jh0jz.js', 'ie', 'Bs']]) {
    const modules = new Map(files);
    const text = modules.get(file);
    const binding = processor.structuralModule(text).ast.body.filter(node => node.type === 'ImportDeclaration')
      .flatMap(node => node.specifiers).find(item => item.local.name === local);
    assert.ok(binding);
    modules.set(file, text.slice(0,binding.start) + `${wrong} as ${local}` + text.slice(binding.end));
    assert.equal(processor.adaptCellRenderer(source, undefined, modules), null, '辅助依赖不能导入错误导出');
  }
}
const mask = source.match(/widthMask:([\w$]+)/)[1];
const clip = source.match(/\.keepColumns\([^,]+,([\w$]+)\.x1,\1\.x2\)/)[1];
for (const [before, after] of [[`widthMask:${mask}`, 'widthMask:999'], [`${mask}=3,`, `${mask}=7,`], [`${clip}.x1,${clip}.x2`, `${clip}.x2,${clip}.x1`], ['spacerTail:2', 'spacerTail:3']]) {
  assert.ok(source.includes(before), before);
  assert.equal(processor.adaptCellRenderer(source.replace(before, after), undefined, files), null, `ABI 漂移必须拒绝：${before}`);
}
}
console.log('三平台局部渲染契约：改名/无关声明兼容，布局/调用语义漂移拒绝');
