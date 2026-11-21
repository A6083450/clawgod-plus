import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adaptCellRenderer, structuralModule } from '../src/generic/runtime/post-processor.mjs';

async function checkBehavior(dir) {
  const chunk = name => join(dir, 'chunks', name);
  const load = name => import(pathToFileURL(chunk(name)).href);
  const { hxt, X$l, gxt, oe } = await load('chunk-mgh1y10w.js');
  const { yze, v8i } = await load('chunk-f64qna2j.js');
  const colored = '\x1b[31mका中\x1b[0mZ';
  assert.equal(oe('A中é👩‍💻'), 6);
  assert.equal(hxt(colored), 1);
  assert.equal(oe(colored), 5);
  assert.deepEqual([...X$l(colored)], [[7, 1], [8, 1], [13, 1]]);
  const cropped = gxt(colored, 0, 2);
  assert.match(cropped, /^\x1b\[31mका\x1b\[(?:0|39)m$/);
  assert.equal(Bun.stripANSI(gxt(colored, 2, 4)), '中');
  assert.deepEqual([...X$l('é👩‍💻')], [[2, 0], [7, 0]]);
  assert.equal(oe(colored), 5, '换输入后仍保留字素表及宽度修正');
  await Promise.resolve();
  assert.equal(oe(colored), 5, '缓存清理后仍可重新测宽');

  const { bTs, ofn } = await load('chunk-4ssv8fte.js');
  const source = readFileSync(chunk('chunk-8bkqeb5d.js'), 'utf8');
  const ast = structuralModule(source).ast;
  const method = ast.body.find(node => node.id?.name === 'TestOutput').body.body[0];
  const sanitize = ast.body.find(node => node.id?.name === 'ih');
  const re = ast.body.find(node => node.declarations?.some(item => item.id.name === sanitize.body.body[0].argument.test.callee.object.name));
  // 仅加载真实剪裁方法和净化声明；布局对象只提供其测宽接口。
  const clip = new Function('v8i', 'yze', 'gxt', 'bTs', 'ofn', source.slice(re.start, re.end) + '\n'
    + source.slice(sanitize.start, sanitize.end) + '\nreturn ({' + source.slice(method.start, method.end) + '}).cutToColumns')(v8i, yze, gxt, bTs, ofn);
  const output = { lineCells: { width: (text, col) => oe(v8i([' '.repeat(col) + text])[0]) - col } };
  assert.equal(clip.call(output, 'A\t中Z', 3, 6, 10), '  中');
  const styled = clip.call(output, '\x1b[31mA\t中\x1b[0mZ', 3, 6, 10);
  assert.equal(Bun.stripANSI(styled), '  中');
  assert.match(styled, /\x1b\[31m/);

  const names = readFileSync(chunk('chunk-jnrh77bs.js'), 'utf8');
  const check = structuralModule(names).ast.body.find(node => node.type === 'FunctionDeclaration'
    && names.slice(node.start, node.end).includes('.trimEnd()') && names.slice(node.start, node.end).includes('.indexOf('));
  const body = names.slice(check.start, check.end);
  const checkName = new Function('vg', 'Vut', body + '\nreturn ' + check.id.name)(
    value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{Cc}\p{Cf}]/gu, ''), ['anthropic-skills']);
  for (const name of ['anthropic-skills', 'ａｎｔｈｒｏｐｉｃ-skills', 'anthro​pic-skills', 'anthro\x00pic-skills']) {
    assert.equal(checkName(name), 'anthropic-skills');
  }
  assert.equal(checkName('正常技能'), undefined);
}

for (const [platform, renderer] of [
  ['darwin', 'chunk-8bkqeb5d.js'], ['linux', 'chunk-snj46q33.js'], ['win32', 'chunk-qak0qe5k.js'],
]) {
  const files = new Map(JSON.parse(readFileSync(new URL(`./fixtures/cell-contract-2.1.330-${platform}-graph.txt`, import.meta.url), 'utf8')));
  const factory = [...files].find(([, source]) => source.includes('new Bun.ant.CellSegmenter'))[0];
  for (const variant of ['valid', 'width-drift', 'unknown-consumer']) {
    const modules = new Map(files);
    if (variant === 'width-drift') {
      const source = modules.get(factory);
      const changed = source.replace('ambiguousIsNarrow:!0,substitute:', 'ambiguousIsNarrow:!1,substitute:');
      assert.notEqual(source, changed);
      modules.set(factory, changed);
    }
    if (variant === 'unknown-consumer') {
      const exportName = structuralModule(files.get(factory)).bindings[3];
      const path = structuralModule(files.get(renderer)).ast.body.find(node => node.type === 'ImportDeclaration'
        && node.source.value.endsWith('/' + factory)).source.value;
      modules.set('chunk-unknown.js', 'import{' + exportName + ' as native}from' + JSON.stringify(path) + ';native([]);');
    }
    const dir = mkdtempSync(join(tmpdir(), 'clawgod-cell-330-'));
    try {
      mkdirSync(join(dir, 'chunks'));
      copyFileSync(new URL('../src/generic/runtime/post-processor.mjs', import.meta.url), join(dir, 'post-process.mjs'));
      writeFileSync(join(dir, 'cli.original.js'), '');
      for (const [name, source] of modules) writeFileSync(join(dir, 'chunks', name), source);
      const result = spawnSync(process.execPath, [join(dir, 'post-process.mjs')], { encoding: 'utf8', timeout: 120000 });
      assert.ifError(result.error);
      if (variant === 'valid') {
        assert.equal(result.status, 0, platform + ': ' + result.stderr);
        assert.doesNotMatch(readFileSync(join(dir, 'chunks', factory), 'utf8'), /new Bun\.ant\.CellSegmenter/);
        assert.ok(adaptCellRenderer(files.get(renderer), undefined, files));
        if (platform === 'darwin') await checkBehavior(dir);
      } else {
        assert.notEqual(result.status, 0, platform + '/' + variant + ' 必须拒绝');
        assert.match(result.stderr, variant === 'width-drift' ? /渲染器形态未被 ClawGod 识别/ : /共享 CellSegmenter 出现未知调用者/);
        for (const [name, source] of modules) {
          assert.equal(readFileSync(join(dir, 'chunks', name), 'utf8'), source, '拒装不应改写 ' + name);
        }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}
console.log('2.1.330 字符格契约通过');
