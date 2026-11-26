#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adaptCellRenderer, structuralModule, cellDeclarationContract } from '../src/generic/runtime/post-processor.mjs';

async function checkBehavior(dir, renderer) {
  const load = name => import(pathToFileURL(join(dir, 'chunks', name)).href);
  const { oe, A0t, Pnd, R0t } = await load('chunk-480y177d.js');
  const { Kpa, Z4e } = await load('chunk-0dhtd7pr.js');
  const colored = '\x1b[31mका中\x1b[0mZ';
  assert.equal(oe('A中é👩‍💻'), 6);
  assert.equal(oe(colored), 5);
  assert.equal(A0t(colored), 1);
  assert.deepEqual([...Pnd(colored)], [[7, 1], [8, 1], [13, 1]]);
  assert.equal(Bun.stripANSI(R0t(colored, 0, 2)), 'का');
  assert.equal(Bun.stripANSI(R0t(colored, 2, 4)), '中');
  await Promise.resolve();
  assert.equal(oe(colored), 5, '清缓存后仍使用公开字素测宽');

  const source = readFileSync(join(dir, 'chunks', renderer), 'utf8');
  const ast = structuralModule(source).ast;
  const cut = ast.body.find(node => node.id?.name === 'TestOutput').body.body[0];
  const sanitize = [...cellDeclarationContract(source, ['jf']).declarations.values()].map(item => item.source).join('\n');
  const { IMt, cWs, vkn } = await load('chunk-pht8tavk.js');
  const sanitizeText = new Function('IMt', 'cWs', 'vkn', sanitize + '\nreturn jf;')(IMt, cWs, vkn);
  assert.equal(sanitizeText('a' + String.fromCharCode(0x202e) + 'b'), 'a�b', '必须保留双向控制字符净化');
  const clip = new Function('Kpa', 'R0t', 'IMt', 'cWs', 'vkn', 'Z4e', sanitize + '\nreturn ({'
    + source.slice(cut.start, cut.end) + '}).cutToColumns')(Kpa, R0t, IMt, cWs, vkn, Z4e);
  const output = { lineCells: { width: (text, col) => oe(Kpa([' '.repeat(col) + text])[0]) - col } };
  assert.equal(clip.call(output, 'A\t中Z', 3, 6, 10), '  中');
  assert.equal(Bun.stripANSI(clip.call(output, '\x1b[31mA\t中\x1b[0mZ', 3, 6, 10)), '  中');

  // 执行实际注入类与写行入口：裁剪后的 cells 必须被绘制，不能重新解析原文本。
  const contract = cellDeclarationContract(source, ['sm', 'gh']);
  const declarations = [...contract.declarations.values()].map(item => item.source).join('\n');
  const styleSource = readFileSync(join(dir, 'chunks', 'chunk-aerdqn17.js'), 'utf8');
  const styleDeclarations = [...cellDeclarationContract(styleSource, ['Okl', 'Pkl']).declarations.values()].map(item => item.source).join('\n');
  const stylesApi = new Function('A2r', 'BA', styleDeclarations + '\nreturn {Okl,Pkl}')(() => 3, {rendersItalicAsStandout:() => false});
  const supplied = { ...await load('chunk-0dhtd7pr.js'), ...await load('chunk-480y177d.js'),
    ...await load('chunk-cdbaw74g.js'), ...stylesApi, cWs, vkn, a_t:() => 0 };
  const bindings = contract.imports.map(edge => edge.local);
  const values = contract.imports.map(edge => {
    assert.ok(edge.imported in supplied, '缺少执行依赖 ' + edge.imported);
    return supplied[edge.imported];
  });
  const lineNode = ast.body.find(node => node.id?.name === 'Cv');
  const api = new Function(...bindings, declarations + '\nconst Ev={};function lm(){return false}function _l(){return false}\n'
    + source.slice(lineNode.start, lineNode.end) + '\nreturn {sm,gh,Cv}')(...values);
  const pool = initial => ({ generation:0, values:[...initial], intern(value) {
    const key = JSON.stringify(value), index = this.values.findIndex(item => JSON.stringify(item) === key);
    if (index >= 0) return index;
    this.values.push(value); return this.values.length - 1;
  } });
  const styles = pool([[]]), chars = pool([' ', '']), links = pool([undefined]);
  const line = new api.sm(styles, chars);
  const screen = {width:16,height:2,cells:new Int32Array(64),emptyStyleId:0,charPool:chars,hyperlinkPool:links,
    atlasRecorder:{recording:true,records:[],record(...args){this.records.push(args)}}};
  assert.equal(line.width('A\t中Z', 3), 8);
  assert.equal(line.trailingSpaces('A  '), 2);
  assert.equal(api.Cv(screen, 'A\t中Z', 3, 0, line, undefined, {x1:6,x2:10}, false), 10);
  assert.equal(chars.values[screen.cells[8 << 1]], '中');
  assert.equal(screen.cells[(8 << 1) + 1] & 3, 1);
  assert.equal(screen.cells[(9 << 1) + 1] & 3, 2);
  assert.equal(screen.cells[(10 << 1) + 1] & 3, 0);
  assert.ok(screen.atlasRecorder.records.length > 0);
  const overlap = {...screen, width:8, height:1, cells:new Int32Array(16), damage:undefined};
  api.Cv(overlap, '中', 1, 0, line, undefined, undefined, false);
  overlap.damage = undefined;
  api.Cv(overlap, '中', 0, 0, line, undefined, undefined, false);
  assert.equal(chars.values[overlap.cells[2 << 1]], ' ');
  assert.deepEqual(overlap.damage, {x:0,y:0,width:3,height:1}, '重绘区域必须包含被覆盖宽字的旧尾格');
  api.gh(screen, 9, 0, {char:'x',styleId:0,width:0});
  assert.equal(chars.values[screen.cells[8 << 1]], ' ', '覆写尾格要清理孤儿宽字符');
  assert.ok(screen.damage.x <= 8 && screen.damage.x + screen.damage.width >= 10);
  assert.equal(api.Cv(screen, '\x1b]8;;https://example.invalid\x07中\x1b]8;;\x07', 0, 1, line, undefined, undefined, false), 2);
  assert.equal(links.values[(screen.cells[(16 << 1) + 1] >>> 2) & 32767], 'https://example.invalid');
  styles.generation++;
  assert.equal(line.width('é👩‍💻', 0), 3, '样式代际变化后重新解析');
}

for (const [platform, renderer, directionNames] of [
  ['darwin', 'chunk-yp26xq50.js', ['IMt', 'cWs', 'vkn']],
  ['linux', 'chunk-da2eq5at.js', ['aMt', 'BBs', 'Xbn']],
  ['win32', 'chunk-99wjzz28.js', ['lMt', 'VBs', 'tkn']],
]) {
  const files = new Map(JSON.parse(readFileSync(new URL(`./fixtures/cell-contract-2.1.332-${platform}-graph.txt`, import.meta.url), 'utf8')));
  const factory = [...files].find(([, source]) => source.includes('new Bun.ant.CellSegmenter'))[0];
  for (const variant of ['valid', 'direction-test-drift', 'direction-replace-drift', 'width-drift', 'renderer-drift', 'unknown-consumer']) {
    const modules = new Map(files);
    if (variant === 'width-drift') {
      const source = modules.get(factory), changed = source.replace('ambiguousIsNarrow:!0,substitute:', 'ambiguousIsNarrow:!1,substitute:');
      assert.notEqual(source, changed); modules.set(factory, changed);
    }
    if (variant === 'direction-test-drift' || variant === 'direction-replace-drift') {
      const source = modules.get(renderer), [first, test, replace] = directionNames;
      const changed = source.replace(first + ',' + test + ',' + replace, variant === 'direction-test-drift'
        ? first + ',' + replace + ' as ' + test + ',' + replace
        : first + ',' + test + ',' + test + ' as ' + replace);
      assert.notEqual(source, changed); modules.set(renderer, changed);
    }
    if (variant === 'renderer-drift') {
      const source = modules.get(renderer), changed = source.replace('widthMask:3', 'widthMask:7');
      assert.notEqual(source, changed); modules.set(renderer, changed);
    }
    if (variant === 'unknown-consumer') {
      const exportName = structuralModule(files.get(factory)).bindings[3];
      const path = structuralModule(files.get(renderer)).ast.body.find(node => node.type === 'ImportDeclaration'
        && node.source.value.endsWith('/' + factory)).source.value;
      modules.set('chunk-unknown.js', 'import{' + exportName + ' as native}from' + JSON.stringify(path) + ';native([]);');
    }
    const dir = mkdtempSync(join(tmpdir(), 'clawgod-cell-332-'));
    try {
      mkdirSync(join(dir, 'chunks'));
      copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(dir, 'post-process.mjs'));
      writeFileSync(join(dir, 'cli.original.js'), '');
      for (const [name, source] of modules) writeFileSync(join(dir, 'chunks', name), source);
      const result = spawnSync(process.execPath, [join(dir, 'post-process.mjs')], {encoding:'utf8',timeout:120000});
      assert.ifError(result.error);
      if (variant === 'valid') {
        assert.equal(result.status, 0, platform + ': ' + result.stderr);
        assert.doesNotMatch(readFileSync(join(dir, 'chunks', factory), 'utf8'), /new Bun\.ant\.CellSegmenter/);
        assert.ok(adaptCellRenderer(files.get(renderer), undefined, files));
        if (platform === 'darwin') {
          const path = join(dir, 'chunks', renderer);
          writeFileSync(path, readFileSync(path, 'utf8') + '\nexport{sm,Cv,gh};\n');
          await checkBehavior(dir, renderer);
        }
      } else {
        assert.notEqual(result.status, 0, platform + '/' + variant + ' 必须拒绝');
        assert.match(result.stderr, variant === 'unknown-consumer' ? /共享 CellSegmenter 出现未知调用者/ : /渲染器形态未被 ClawGod 识别/);
        for (const [name, source] of modules) assert.equal(readFileSync(join(dir, 'chunks', name), 'utf8'), source, '拒装不应改写 ' + name);
      }
    } finally { rmSync(dir, {recursive:true,force:true}); }
  }
}
console.log('2.1.332 字符格契约通过');
