#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from './fixtures/acorn-8.16.0.cjs';

import {
  CELL_LINE_CELLS_SOURCE,
  CELL_RENDERER_SOURCE,
  CELL_SET_CELL_SOURCE,
  CELL_SEGMENTER_SHAPE,
  CELL_WRITE_LINE_SOURCE,
  adaptCellRenderer,
  findDeclarationEnd,
} from '../src/generic/runtime/post-processor.mjs';

// The injected renderer calls the module-level helpers that upstream already
// ships beside it. The digests in CELL_SEGMENTER_SHAPE pin those helpers to a
// known shape; the doubles below only have to honour their documented
// contract, so this suite exercises our cell logic rather than upstream's.
const RENDERER_MODULE = `
const bn = 3, wo = 0, Xf = 1, hht = 8;
let chalkLevel = 0;
function jn(style, link, width) { return (style << 17) | (link << 2) | width; }
function Rx(screen, char) { return screen.charPool.intern(char); }
function xx(screen, link) { return screen.hyperlinkPool.intern(link); }
const MNr = (codes) => codes;
const LNr = (codes) => codes;
const Dc = (text) => text.replace(/[\\u061C\\u202A-\\u202E\\u2066-\\u2069]/g, "\\uFFFD");
function bGt() { return chalkLevel; }
function setChalkLevel(level) { chalkLevel = level; }
function endCodeFor(code) {
  if (code === "" || code === "0") return "reset";
  if (code === "39" || code.startsWith("3")) return "fg";
  if (code === "49" || code.startsWith("4")) return "bg";
  return "end-" + code;
}
function cmr(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    if (text.charCodeAt(index) === 27 && text.charAt(index + 1) === "[") {
      const stop = text.indexOf("m", index + 2);
      if (stop >= 0 && /^[0-9;]*$/.test(text.slice(index + 2, stop))) {
        for (const part of text.slice(index + 2, stop).split(";")) {
          tokens.push({ type: "ansi", code: "\\u001b[" + part + "m", endCode: endCodeFor(part) });
        }
        index = stop + 1;
        continue;
      }
    }
    if (text.startsWith("\\u001b]8;;", index)) {
      const stop = text.indexOf("\\u0007", index + "\\u001b]8;;".length);
      if (stop >= 0) {
        tokens.push({ type: "ansi", code: text.slice(index, stop + 1), endCode: "osc8" });
        index = stop + 1;
        continue;
      }
    }
    tokens.push({ type: "char", value: text.charAt(index) });
    index += 1;
  }
  return tokens;
}
function Kf(styles, tokens) {
  let merged = styles.slice();
  for (const token of tokens) {
    if (token.endCode === "reset") { merged = []; continue; }
    merged = merged.filter((style) => style.endCode !== token.endCode);
    merged.push(token);
  }
  return merged;
}
${CELL_RENDERER_SOURCE}
${CELL_LINE_CELLS_SOURCE}
${CELL_SET_CELL_SOURCE}
${CELL_WRITE_LINE_SOURCE}
export { Ns, Dd, Cx, xC, setChalkLevel };
`;

const root = mkdtempSync(join(tmpdir(), 'clawgod-cell-segmenter-'));
const modulePath = join(root, 'renderer.mjs');
writeFileSync(modulePath, RENDERER_MODULE);
const renderer = await import(pathToFileURL(modulePath).href);

function createStylePool() {
  const codes = new Map([['', 0]]);
  const values = [[]];
  return {
    generation: 0,
    none: 0,
    intern(styles) {
      const key = styles.map((style) => style.code).join('\0');
      if (!codes.has(key)) codes.set(key, values.push(styles) - 1);
      return codes.get(key);
    },
    get(id) { return values[id] ?? []; },
  };
}

function createScreen(stylePool, width = 12, height = 1) {
  const buffer = new ArrayBuffer(width * height * 8);
  const characters = [' ', ''];
  const charIds = new Map([[' ', 0], ['', 1]]);
  const links = [undefined];
  const screen = {
    width,
    height,
    cells: new Int32Array(buffer),
    cells64: new BigInt64Array(buffer),
    emptyStyleId: stylePool.none,
    atlasRecorder: { recording: true, entries: [], record(...entry) { this.entries.push(entry); } },
    charPool: {
      intern(value) {
        if (!charIds.has(value)) charIds.set(value, characters.push(value) - 1);
        return charIds.get(value);
      },
    },
    hyperlinkPool: {
      intern(value) {
        if (!links.includes(value)) links.push(value);
        return links.indexOf(value);
      },
    },
    damage: undefined,
  };
  screen.char = (x, y = 0) => characters[screen.cells[(y * width + x) * 2]];
  screen.packed = (x, y = 0) => screen.cells[(y * width + x) * 2 + 1];
  screen.widthOf = (x, y = 0) => screen.packed(x, y) & 3;
  screen.stylesAt = (x, y = 0) => stylePool.get(screen.packed(x, y) >>> 17).map((style) => style.code);
  screen.hyperlinkAt = (x, y = 0) => links[screen.packed(x, y) >>> 2 & 32767];
  return screen;
}

function paint(text, options = {}) {
  const styles = createStylePool();
  const screen = createScreen(styles, options.width ?? 12, options.height ?? 1);
  const line = new renderer.Dd(styles, screen.charPool);
  const end = renderer.xC(screen, text, options.x ?? 0, options.y ?? 0, line);
  return { styles, screen, line, end };
}

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
}

check('注入源码保持 ASCII，且不引用私有 Bun API', () => {
  for (const source of [CELL_RENDERER_SOURCE, CELL_LINE_CELLS_SOURCE, CELL_SET_CELL_SOURCE, CELL_WRITE_LINE_SOURCE]) {
    assert.doesNotMatch(source, /[^\x00-\x7f]/);
  }
  assert.doesNotMatch(RENDERER_MODULE, /Bun\.ant|CellSegmenter/);
  assert.throws(() => renderer.Ns(), /must not run/);
});

check('字素按显示宽度写入字符格', () => {
  const { screen, end } = paint('A中文😀é');
  assert.equal(end, 8);
  assert.equal(screen.char(0), 'A');
  assert.equal(screen.char(1), '中');
  assert.equal(screen.widthOf(1), 1);
  assert.equal(screen.widthOf(2), 2);
  assert.equal(screen.char(3), '文');
  assert.equal(screen.widthOf(4), 2);
  assert.equal(screen.char(5), '😀');
  assert.equal(screen.char(7), 'é');
  assert.equal(screen.widthOf(7), 0);
  assert.equal(screen.atlasRecorder.entries.length, 5);
});

check('超宽字素落在右边界时写入填充格', () => {
  const { screen } = paint('中', { width: 1 });
  assert.equal(screen.widthOf(0), 3);
  assert.equal(screen.char(0), ' ');
});

check('覆盖宽字符头格时同时清尾格并扩大脏区域', () => {
  const { screen } = paint('中A', { width: 8 });
  screen.damage = undefined;
  renderer.Cx(screen, 0, 0, { char: 'x', styleId: screen.emptyStyleId, width: 0 });
  assert.equal(screen.char(0), 'x');
  assert.equal(screen.char(1), ' ');
  assert.equal(screen.char(2), 'A');
  assert.deepEqual(screen.damage, { x: 0, y: 0, width: 2, height: 1 });
});

check('覆盖宽字符尾格时同时清头格', () => {
  const { screen } = paint('中A', { width: 8 });
  screen.damage = undefined;
  renderer.Cx(screen, 1, 0, { char: 'x', styleId: screen.emptyStyleId, width: 0 });
  assert.equal(screen.char(0), ' ');
  assert.equal(screen.char(1), 'x');
  assert.deepEqual(screen.damage, { x: 0, y: 0, width: 2, height: 1 });
});

check('写入宽字符时清理被覆盖的旧尾格并扩大脏区域', () => {
  const { screen } = paint('A中B', { width: 8 });
  screen.damage = undefined;
  renderer.Cx(screen, 2, 0, { char: '好', styleId: screen.emptyStyleId, width: 1 });
  assert.equal(screen.char(1), ' ');
  assert.equal(screen.char(2), '好');
  assert.equal(screen.widthOf(3), 2);
  assert.deepEqual(screen.damage, { x: 1, y: 0, width: 3, height: 1 });
});

check('制表符按起始列对齐', () => {
  const { screen, line } = paint('a\tb', { x: 3, width: 20 });
  assert.equal(screen.char(8), 'b');
  assert.equal(line.width('a\tb', 3), 6);
  assert.equal(line.width('\t', 0), 8);
  assert.equal(line.width('\t', 4), 4);
});

check('负起始列按列裁剪', () => {
  const { screen } = paint('abcd', { x: -2, width: 10 });
  assert.equal(screen.char(0), 'c');
  assert.equal(screen.char(1), 'd');
});

check('SGR 样式写入样式池并在 reset 后清除', () => {
  const { screen, styles } = paint('[31m红[0mA');
  assert.deepEqual(screen.stylesAt(0), ['[31m']);
  assert.notEqual(screen.packed(0) >>> 17, styles.none);
  assert.equal(screen.packed(3) >>> 17, styles.none);
});

check('OSC 8 超链接随样式运行写到字符格', () => {
  const { screen } = paint(']8;;https://example.com链接]8;;!');
  assert.equal(screen.hyperlinkAt(0), 'https://example.com');
  assert.equal(screen.hyperlinkAt(2), 'https://example.com');
  assert.equal(screen.hyperlinkAt(4), undefined);
  assert.equal(screen.char(4), '!');
});

// v1.9.5 regression contracts: our public-Bun renderer already uses the
// screen's own pools and absolute columns, so retain it instead of adding a shim.
check('多个链接保留各自的目标且缩进换行返回绝对结束列', () => {
  const { screen, end } = paint('\x1b]8;;https://first.example\x07A\x1b]8;;https://second.example\x07B\x1b]8;;\x07C', { x: 3 });
  assert.equal(end, 6);
  assert.equal(screen.hyperlinkAt(3), 'https://first.example');
  assert.equal(screen.hyperlinkAt(4), 'https://second.example');
  assert.equal(screen.hyperlinkAt(5), undefined);
});

check('超过 2048 个样式后仍保留旧样式 ID 与颜色', () => {
  const { line, styles, screen } = paint('\x1b[31mA\x1b[0m');
  const red = line.parse('\x1b[31mA\x1b[0m')[0].styleId;
  for (let i = 0; i < 2050; i++) styles.intern([{ code: `style-${i}`, endCode: 'fg' }]);
  line.paint(screen, '\x1b[32mB\x1b[0m', 1, 0);
  assert.ok(screen.packed(1) >>> 17 > 2048);
  assert.deepEqual(screen.stylesAt(1), ['\x1b[32m']);
  assert.deepEqual(screen.stylesAt(0), ['\x1b[31m']);
  assert.equal(line.parse('\x1b[31mA\x1b[0m')[0].styleId, red);
});

check('危险控制序列与非 SGR 转义被丢弃', () => {
  const { screen } = paint('A[2JB]52;c;payloadC(BD');
  assert.equal(screen.char(0), 'A');
  assert.equal(screen.char(1), 'B');
  assert.equal(screen.char(2), 'C');
  assert.equal(screen.char(3), 'D');
});

check('八位 CSI 被规范化为 SGR', () => {
  const { screen } = paint('31m红');
  assert.deepEqual(screen.stylesAt(0), ['[31m']);
});

check('七位和八位 CSI 丢弃不支持的 SGR 参数，不留下可见残片', () => {
  for (const prefix of ['\x1b[', '\x9b']) {
    for (const parameters of ['?25', '31:', '1$']) {
      const { screen, end } = paint(`A${prefix}${parameters}mB`);
      assert.equal(end, 2);
      assert.equal(screen.char(0), 'A');
      assert.equal(screen.char(1), 'B');
      assert.deepEqual(screen.stylesAt(1), []);
    }
  }
});

check('不完整 OSC 8 不创建链接，也不清除既有链接', () => {
  for (const terminator of ['\x07', '\x1b\\']) {
    for (const body of ['8;https://example.com', '8;']) {
      const malformed = `\x1b]${body}${terminator}`;
      const { screen, end } = paint(`A${malformed}B`);
      assert.equal(end, 2);
      assert.equal(screen.char(1), 'B');
      assert.equal(screen.hyperlinkAt(1), undefined);
      const linked = paint(`\x1b]8;id=test;https://valid.example${terminator}A${malformed}B\x1b]8;;${terminator}C`).screen;
      assert.equal(linked.hyperlinkAt(1), 'https://valid.example');
      assert.equal(linked.hyperlinkAt(2), undefined);
      assert.equal(linked.char(2), 'C');
    }
  }
});

check('双向文本控制符替换为替代字符', () => {
  const { screen } = paint('A‮B');
  assert.equal(screen.char(1), '�');
  assert.equal(screen.char(2), 'B');
});

check('解析结果按文本缓存并在样式池压缩后失效', () => {
  const { line, styles } = paint('cached');
  const first = line.parse('cached');
  assert.equal(first, line.parse('cached'));
  styles.generation += 1;
  assert.notEqual(first, line.parse('cached'));
});

check('终端颜色能力变化后缓存失效', () => {
  const { line } = paint('cached');
  const first = line.parse('cached');
  renderer.setChalkLevel(1);
  try {
    assert.notEqual(first, line.parse('cached'));
  } finally {
    renderer.setChalkLevel(0);
  }
});

check('解析缓存有上限', () => {
  const { line } = paint('');
  for (let index = 0; index < 600; index += 1) line.parse(`line ${index}`);
  assert.ok(line.cache.size <= 512);
});

check('声明扫描能跨过字符串、模板、正则与注释', () => {
  const source = 'function sample(){const braces="}{";const nested=`a${ {b:"}"} }c`;'
    + 'const pattern=/[}/]/;/* } */return {ok:true}}';
  assert.equal(findDeclarationEnd(source, source.indexOf('{')), source.length - 1);
  assert.equal(findDeclarationEnd('function broken(){', 16), -1);
});

check('三平台真实声明可适配，未知漂移仍被拒绝', () => {
  for (const platform of ['2.1.274-darwin', '2.1.274-linux', '2.1.274-win32', '2.1.276-darwin', '2.1.276-linux', '2.1.276-win32', '2.1.278-darwin', '2.1.278-linux', '2.1.278-win32', '2.1.280-darwin', '2.1.280-linux', '2.1.280-win32', '2.1.281-darwin', '2.1.281-linux', '2.1.281-win32']) {
    const source = readFileSync(new URL(`./fixtures/cell-renderer-${platform}.txt`, import.meta.url), 'utf8');
    const adapted = adaptCellRenderer(source);
    assert.notEqual(adapted, null, `${platform}: 官方声明必须可适配`);
    assert.doesNotMatch(adapted, /new Bun\.ant\.CellSegmenter/);
    const originalAst = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    parse(adapted, { ecmaVersion: 'latest', sourceType: 'module' });
    for (const node of originalAst.body.filter(node => node.type === 'ImportDeclaration' || ['Kf', 'Dc', 'cmr', 'qmr', 'Jmr'].includes(node.id?.name))) {
      assert.ok(adapted.includes(source.slice(node.start, node.end)), `${platform}: 上游依赖必须原文保留`);
    }
    for (const binding of originalAst.body.filter(node => node.type === 'ImportDeclaration').flatMap(node => node.specifiers)) {
      if (binding.local.name === 'xC') continue;
      const broken = source.slice(0, binding.local.start) + `missing_${binding.local.name}` + source.slice(binding.local.end);
      assert.equal(adaptCellRenderer(broken), null, `${platform}: 缺少 ${binding.local.name} 必须拒绝`);
    }
    assert.equal(adaptCellRenderer(source.replace('ambiguousIsNarrow:!0', 'ambiguousIsNarrow:!1')), null);
    assert.equal(adaptCellRenderer(`${source}\nvar writeCell;`), null);
  }
});

for (const [platform, names, headers] of [
  ['2.1.274-linux', { Cx: 'xx', xC: 'SC', cmr: 'qmr', Rx: 'Cx', xx: 'Ex', hht: 'nht', C8: '_Y', MNr: 'LVn', LNr: 'wdt', bGt: 'nqt' },
    ['function Ns()', 'class Dd ', 'function xx(', 'function SC(']],
  ['2.1.274-win32', { Cx: 'Rx', xC: 'CC', cmr: 'Jmr', Rx: 'Mx', xx: 'Cx', hht: 'tht', C8: 'v8', MNr: 'zVn', LNr: 'vdt', bGt: 'oqt' },
    ['function Ns()', 'class Dd ', 'function Rx(', 'function CC(']],
  ['2.1.276-darwin', { Ns: 'Ss', Dd: 'Cd', Cx: 'cx', xC: 'cC', cmr: '_br', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Ho', Xf: 'Kf', Rx: 'fx', xx: 'ux', hht: 'j_t', C8: 'uY', MNr: 'g2r', LNr: 'h2r', bGt: 'mqt' },
    ['function Ss()', 'class Cd ', 'function cx(', 'function cC(']],
  ['2.1.276-linux', { Ns: 'Ss', Dd: 'Cd', Cx: 'ax', xC: 'uC', cmr: 'Wbr', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Bo', Xf: 'Kf', Rx: 'sx', xx: 'rx', hht: 'R_t', C8: 'r9', MNr: 'LBr', LNr: 'DBr', bGt: 'X4t' },
    ['function Ss()', 'class Cd ', 'function ax(', 'function uC(']],
  ['2.1.276-win32', { Ns: 'Ss', Dd: 'Cd', Cx: 'ux', xC: 'uC', cmr: 'Ybr', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Ho', Xf: 'Kf', Rx: 'cx', xx: 'sx', hht: 'R_t', C8: 'l9', MNr: '$Br', LNr: 'FBr', bGt: 'e3t' },
    ['function Ss()', 'class Cd ', 'function ux(', 'function uC(']],
  ['2.1.278-darwin', { Ns: 'vs', Dd: 'Mf', Cx: 'px', xC: 'xC', cmr: 'bCr', Kf: 'Bd', Dc: 'Ec', bn: 'gn', wo: 'Ho', Xf: 'kd', Rx: 'yx', xx: 'mx', hht: 'cwt', C8: 'fX', MNr: 'bzr', LNr: 'wzr', bGt: 'T5t' },
    ['function vs()', 'class Mf ', 'function px(', 'function xC(']],
  ['2.1.278-linux', { Ns: 'Ss', Dd: 'Rf', Cx: 'hx', xC: 'xC', cmr: 'ckr', Kf: 'Bd', Dc: 'xc', bn: 'gn', wo: 'Bo', Xf: 'kd', Rx: 'mx', xx: 'fx', hht: 'YSt', C8: 'iX', MNr: 'FGr', LNr: 'UGr', bGt: 'l8t' },
    ['function Ss()', 'class Rf ', 'function hx(', 'function xC(']],
  ['2.1.278-win32', { Ns: 'Ss', Dd: 'Mf', Cx: 'px', xC: 'EC', cmr: 'mkr', Kf: 'Bd', Dc: 'Ec', bn: 'gn', wo: 'Ho', Xf: 'kd', Rx: 'yx', xx: 'mx', hht: 'YSt', C8: 'uX', MNr: 'zGr', LNr: 'WGr', bGt: 'pYt' },
    ['function Ss()', 'class Mf ', 'function px(', 'function EC(']],
  ['2.1.280-darwin', { Ns: 'gs', Dd: 'Kd', Cx: 'WE', xC: '$x', cmr: 'UMr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'Do', Xf: 'pd', jn: 'Yn', Rx: 'qE', xx: 'jE', hht: 'ITt', C8: 'eJ', MNr: 'WXr', LNr: 'GXr', bGt: 'QZt' },
    ['function gs()', 'class Kd ', 'function WE(', 'function $x(']],
  ['2.1.280-linux', { Ns: 'gs', Dd: 'Kd', Cx: 'IE', xC: 'Qx', cmr: 'pLr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'No', Xf: 'pd', jn: 'Yn', Rx: 'KE', xx: 'kE', hht: 'yTt', C8: 'VJ', MNr: 'sXr', LNr: 'iXr', bGt: 'DZt' },
    ['function gs()', 'class Kd ', 'function IE(', 'function Qx(']],
  ['2.1.280-win32', { Ns: 'gs', Dd: 'Kd', Cx: 'IE', xC: 'Zx', cmr: 'ILr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'No', Xf: 'pd', jn: 'Yn', Rx: 'KE', xx: 'kE', hht: '_Ct', C8: 'QJ', MNr: 'dXr', LNr: 'uXr', bGt: 'UZt' },
    ['function gs()', 'class Kd ', 'function IE(', 'function Zx(']],
  ['2.1.281-darwin', { Ns: 'Rs', Dd: 'tf', Cx: 'ex', xC: 'uC', cmr: 'X6r', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Ll', Xf: 'Md', jn: 'Vn', Rx: 'tx', xx: '$E', hht: 'wIt', C8: 'KQ', MNr: 'Koo', LNr: 'Yoo', bGt: 'Fsn' },
    ['function Rs()', 'class tf ', 'function ex(', 'function uC(']],
  ['2.1.281-linux', { Ns: 'Cs', Dd: 'tf', Cx: 'ix', xC: 'fC', cmr: 'V2r', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Pl', Xf: 'Md', jn: 'Vn', Rx: 'ox', xx: 'nx', hht: 'aPt', C8: 'FQ', MNr: 'foo', LNr: 'moo', bGt: 'Ssn' },
    ['function Cs()', 'class tf ', 'function ix(', 'function fC(']],
  ['2.1.281-win32', { Ns: 'Ms', Dd: 'tf', Cx: 'nx', xC: 'fC', cmr: 'Jzr', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Pl', Xf: 'Md', jn: 'Vn', Rx: 'ix', xx: 'tx', hht: 'sIt', C8: 'W7', MNr: 'hoo', LNr: 'yoo', bGt: 'Tsn' },
    ['function Ms()', 'class tf ', 'function nx(', 'function fC(']],
]) {
  const source = readFileSync(new URL(`./fixtures/cell-renderer-${platform}.txt`, import.meta.url), 'utf8');
  const adapted = adaptCellRenderer(source);
  const declarations = headers.slice(1).map(header => {
    const start = adapted.indexOf(header);
    assert.ok(start >= 0, `${platform}: 缺少 ${header}`);
    return adapted.slice(start, findDeclarationEnd(adapted, adapted.indexOf('{', start)) + 1);
  });
  const publicStart = adapted.indexOf('// ClawGod:');
  const publicEnd = findDeclarationEnd(adapted, adapted.indexOf('{', adapted.indexOf(headers[0], publicStart))) + 1;
  // 保持原测试的屏幕接口，只替换边界上的上游依赖名；执行的是适配器实际输出。
  const helpers = RENDERER_MODULE.slice(0, RENDERER_MODULE.indexOf(CELL_RENDERER_SOURCE))
    .replace(/\b(?:Ns|Dd|Cx|xC|cmr|Kf|Dc|bn|wo|Xf|jn|Rx|xx|hht|C8|MNr|LNr|bGt)\b/g, name => names[name] ?? name);
  const actual = new Function(`${helpers}\n${adapted.slice(publicStart, publicEnd)}\n${declarations.join('\n')}\nreturn { Dd: ${names.Dd ?? 'Dd'}, paint: ${names.xC} };`)();
  check(`${platform} 注入输出实际绘制宽字符、制表符、样式及超链接`, () => {
    const styles = createStylePool();
    const screen = createScreen(styles, 20);
    const line = new actual.Dd(styles, screen.charPool);
    const end = actual.paint(screen, '\x1b[31m中\x1b[0m\t\x1b]8;;https://example.com\x07A\x1b]8;;\x07', 0, 0, line);
    assert.equal(end, 9);
    assert.equal(actual.paint(screen, 'AB', 10, 0, line), 12, `${platform}: indented wrap returns an absolute column`);
    assert.equal(screen.char(0), '中');
    assert.equal(screen.widthOf(1), 2);
    assert.deepEqual(screen.stylesAt(0), ['\x1b[31m']);
    assert.equal(screen.char(8), 'A');
    assert.equal(screen.hyperlinkAt(8), 'https://example.com');
    assert.equal(line.width('中\tA', 0), 9);
    assert.equal(line.parse('A\x1b[?25mB').map(cell => cell.value).join(''), 'AB');
  });
}

check('裁剪制表符时使用上游展开函数', () => {
  for (const [version, platform, sanitize, tabWidth, helper] of [
    ['2.1.280', 'darwin', 'gc', 'ITt', 'eJ'],
    ['2.1.280', 'linux', 'gc', 'yTt', 'VJ'],
    ['2.1.280', 'win32', 'gc', '_Ct', 'QJ'],
    ['2.1.281', 'darwin', 'Tc', 'wIt', 'KQ'],
    ['2.1.281', 'linux', 'Tc', 'aPt', 'FQ'],
    ['2.1.281', 'win32', 'Tc', 'sIt', 'W7'],
  ]) {
    const source = readFileSync(new URL(`./fixtures/cell-renderer-${version}-${platform}.txt`, import.meta.url), 'utf8');
    const adapted = adaptCellRenderer(source);
    const start = adapted.indexOf('function tabClip(');
    const declaration = adapted.slice(start, findDeclarationEnd(adapted, adapted.indexOf('{', start)) + 1);
    const clip = new Function(sanitize, helper, tabWidth, 'Bun', `${declaration};return tabClip`)(
      text => text,
      text => {
        assert.equal(text, '   a\tb');
        return '   a    b';
      },
      8,
      { sliceAnsi: text => text },
    );
    assert.equal(clip('a\tb', 3, 0, { x2: 20 }), 'a    b', `${version}-${platform}`);
  }
});

check('未知渲染器形态一律拒绝', () => {
  assert.equal(adaptCellRenderer('function render(){return new Bun.ant.CellSegmenter({});}'), null);
  assert.equal(adaptCellRenderer(''), null);
});

check('冻结形态通过改写，并逐条挡住结构漂移', () => {
  const { shape, source } = CellSegmenterFixture();
  const adapted = adaptCellRenderer(source, shape);
  assert.notEqual(adapted, null);
  assert.doesNotMatch(adapted, /new Bun\.ant\.CellSegmenter/);
  assert.match(adapted, /function writeCell\(screen, x, y, cell\)/);
  assert.doesNotMatch(adapted, /let ge=Dc\(oe\),ve=U\.x2-B/);
  assert.match(adapted, /Bun\.sliceAnsi|ge=C8\(/);
  for (const broken of [
    source.replace('import{hht,C8}from"./a.js";', 'import{hht}from"./a.js";'),
    source.replace('var Ss="\\x1B]8;;";', 'var Ss="\\x1B]8;";'),
    source.replace('let ge=Dc(oe),ve=U.x2-B', 'let ge=null'),
    source.replace('function Dc(n){}', 'function Dc(n){return n}'),
    `${source}\nvar writeCell;`,
  ]) {
    assert.equal(adaptCellRenderer(broken, shape), null);
  }
});

{
  const processor = new URL('../src/generic/runtime/post-processor.mjs', import.meta.url);
  const constructor = 'function render(){return new Bun.ant.CellSegmenter({});}';
  for (const split of [false, true]) {
    for (const required of [false, true]) {
      for (const available of [false, true]) {
        const dir = join(root, `install-${split}-${required}-${available}`);
        mkdirSync(dir);
        copyFileSync(processor, join(dir, 'post-process.mjs'));
        const source = required ? constructor : 'console.log("compatible");';
        const entry = join(dir, 'cli.original.js');
        writeFileSync(entry, split ? 'import "/$bunfs/root/chunk-render.js";' : source);
        let chunk;
        if (split) {
          mkdirSync(join(dir, 'chunks'));
          chunk = join(dir, 'chunks', 'chunk-render.js');
          writeFileSync(chunk, source);
        }
        const originalEntry = readFileSync(entry, 'utf8');
        const preload = join(dir, 'runtime.mjs');
        writeFileSync(preload, available
          ? 'Bun.ant = { CellSegmenter: class CellSegmenter {} };'
          : 'Bun.ant = undefined;');
        const result = spawnSync(process.execPath, ['--preload', preload, join(dir, 'post-process.mjs')], {
          encoding: 'utf8', timeout: 10000,
        });
        assert.ifError(result.error);
        if (required && !available) {
          assert.notEqual(result.status, 0, '缺少私有 API 时必须拒绝候选版本');
          assert.match(result.stderr, /Bun\.ant\.CellSegmenter/);
          assert.match(result.stderr, /--version/);
          assert.equal(existsSync(join(dir, 'cli.original.cjs')), false);
          assert.equal(readFileSync(entry, 'utf8'), originalEntry, '拒绝时不能改写候选入口');
          if (chunk) assert.equal(readFileSync(chunk, 'utf8'), source);
        } else {
          assert.equal(result.status, 0, result.stderr);
          assert.equal(existsSync(entry), false);
          assert.equal(readFileSync(join(dir, 'cli.original.cjs'), 'utf8'),
            split ? 'import "./chunks/chunk-render.js";' : source);
        }
      }
    }
  }
  checks += 8;
  console.log('PASS 安装流程对未知私有渲染器形态的拒绝与放行矩阵');
}

// A synthetic module with the same declared shape as the real renderer, so the
// guard rails around the rewrite can be exercised offline. The frozen table is
// checked separately by the installation matrix below.
function CellSegmenterFixture() {
  const shape = CELL_SEGMENTER_SHAPE.map(({ header }) => {
    const text = `${header}}`;
    return { header, digest: createHash('sha256').update(text).digest('hex') };
  });
  return {
    shape,
    source: [
      'import{hht,C8}from"./a.js";',
      'import{MNr,LNr,bGt}from"./b.js";',
      'var Ss="\\x1B]8;;";',
      'function useScreen(n){let ge=Dc(oe),ve=U.x2-B;return ge}',
      shape.map(({ header }) => `${header}}`).join('\n'),
    ].join('\n'),
  };
}

rmSync(root, { recursive: true, force: true });
console.log(`${checks} 项公开 Bun 字符格渲染契约检查通过`);
