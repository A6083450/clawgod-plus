#!/usr/bin/env bun
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = `${here}/cli.original.js`;
const dst = `${here}/cli.original.cjs`;

// Final runtime directory (~/.clawgod) — passed in by install.sh so that
// native-module / asset / worker paths can be baked as absolute paths.
// Normalise backslashes (Windows argv) to forward slashes: the baked paths
// are spliced into JS string literals, where a raw `\` would be parsed as an
// escape sequence, and Windows filesystem APIs accept forward slashes.
const clawgodDir = (process.argv[2] || here).replace(/\\/g, '/');

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'win32';
const archOs = `${arch}-${os}`;

// Bun standalone embeds are referenced as /$bunfs/root/... (POSIX) or
// B:/~BUN/root/... (Windows). Match both prefixes so every reference is
// rewritten regardless of which build produced the binary.
const BUNFS = String.raw`(?:[A-Za-z]:)?\/(?:\$bunfs|~BUN)\/root\/`;

function rewrite(code, { chunkPrefix }) {
  // (1) code-split chunk import specifiers → local relative path.
  // v2.1.246 renamed many chunks from `chunk-<hash>.js` to `_<n>.js`; both
  // are flat files under chunks/ and must be rewritten to local paths.
  code = code.replace(
    new RegExp(`${BUNFS}(chunk-[a-z0-9]+|_[0-9]+)\\.js`, 'g'),
    (match, name) => `${chunkPrefix}${name}.js`,
  );
  // (2) native .node module path (string arg to import.meta.require) → vendor.
  code = code.replace(
    new RegExp(`${BUNFS}([\\w-]+)\\.node`, 'g'),
    (m, name) => `${clawgodDir}/vendor/${name}/${archOs}/${name}.node`,
  );
  // (3) loader=file assets (design-canvas payload, chart/hljs/mermaid) → assets/.
  code = code.replace(
    new RegExp(`${BUNFS}([A-Za-z0-9_.-]+\\.(?:asset|min\\.js|md|txt))`, 'g'),
    (m, name) => `${clawgodDir}/assets/${name}`,
  );
  // (4) plugin function-hooks worker URL → local worker file.
  code = code.replace(
    new RegExp(`${BUNFS}src/plugins/functionHooks/hooks-worker/hooks-worker\\.js`, 'g'),
    `${clawgodDir}/chunks/hooks-worker.js`,
  );
  return code;
}

// ── 公开 Bun 的字符格渲染器 ────────────────────────────────────────────────
// Claude Code 2.1.269 起，Ink 的文本行绘制改由私有 Bun 内建的
// Bun.ant.CellSegmenter 完成：它按字素切分、算显示宽度、并把结果直接写进
// 屏幕字符格。官方二进制自带该内建模块，公开 Bun（stable 与 canary）都没有。
// ClawGod 用公开 Bun 运行提取出来的 JS，所以这里补一组等价实现，只替换真正
// 调用内建的四处代码，其余渲染、React 与布局逻辑原样保留。
//
// 字符格布局与上游一致（同一个 Int32Array，每格两个 i32：字符池下标 +
// styleId<<17 | hyperlinkId<<2 | width），因此 setCell 与行绘制可以接进上游
// 的 damage / atlasRecorder / 样式池流程。ANSI 分词（cmr）、样式合并（Kf）、
// 控制字符净化（Dc）与颜色归一化（MNr/LNr）都复用同分块已有实现。
export const CELL_RENDERER_SOURCE = `
// ClawGod: public-Bun replacement for the private cell segmenter renderer.
// Only the cell writer and the line painter are reimplemented; the
// packed cell layout, damage rectangles, atlas recording and style pool are
// untouched, so the rest of the renderer keeps working as upstream.
// ponytail: RTL reordering is not ported. On Windows Terminal and VS Code,
// the only hosts that request it, Arabic and Hebrew render in logical order.
// Upgrade path: compute embedding levels (a UBA implementation such as the
// MIT-licensed bidi-js) and reverse the grapheme runs above each level.
var clawgodCacheLimit = 512;
var clawgodOsc8Prefix = String.fromCharCode(27) + "]8;;";
var clawgodSgr = /^\\x1b\\[[0-9;]*m$/;
var clawgodAmbiguousNarrow = { ambiguousIsNarrow: true };
var clawgodSegmenter;
function clawgodGraphemes(text) {
  if (clawgodSegmenter === void 0) {
    clawgodSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
  }
  return clawgodSegmenter.segment(text);
}
function clawgodCsiEnd(text, start) {
  for (var index = start; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code >= 64 && code <= 126) return index;
  }
  return -1;
}
function clawgodOscEnd(text, start) {
  for (var index = start; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code === 7) return index;
    if (code === 27 && text.charCodeAt(index + 1) === 92) return index;
  }
  return -1;
}
// Only SGR and OSC 8 survive. Anything else would reach the terminal verbatim,
// which is how a rendered string turns into an injected escape sequence.
function sanitizeControlSequences(text) {
  var out = "";
  for (var index = 0; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code === 27 || code === 155) {
      if (code === 155) {
        var eightBit = clawgodCsiEnd(text, index + 1);
        if (eightBit >= 0) {
          var normalized = String.fromCharCode(27) + "[" + text.slice(index + 1, eightBit + 1);
          if (clawgodSgr.test(normalized)) out += normalized;
          index = eightBit;
        }
        continue;
      }
      var next = text.charAt(index + 1);
      if (next === "[") {
        var csi = clawgodCsiEnd(text, index + 2);
        if (csi >= 0) {
          var sequence = text.slice(index, csi + 1);
          if (clawgodSgr.test(sequence)) out += sequence;
          index = csi;
        }
        continue;
      }
      if (next === "]") {
        var osc = clawgodOscEnd(text, index + 2);
        if (osc >= 0) {
          var body = text.slice(index + 2, osc);
          var separator = body.indexOf(";", 2);
          if (body.slice(0, 2) === "8;" && separator >= 0) {
            var uri = body.slice(separator + 1);
            out += clawgodOsc8Prefix + uri + String.fromCharCode(7);
          }
          index = text.charCodeAt(osc) === 27 ? osc + 1 : osc;
        }
        continue;
      }
      if (next === "(" || next === ")" || next === "*" || next === "+") index += 2;
      continue;
    }
    if (code === 9) {
      out += text.charAt(index);
      continue;
    }
    if (code < 32 || code === 127) continue;
    out += text.charAt(index);
  }
  return Dc(out);
}
// Style runs are merged before grapheme segmentation, exactly like upstream:
// every grapheme that shares a style run shares one interned style id.
function parseStyledText(text, stylePool) {
  var cells = [];
  var styles = [];
  var hyperlink;
  var run = "";
  function flush() {
    if (run === "") return;
    var styleId = stylePool.intern(MNr(LNr(styles)));
    for (var segment of clawgodGraphemes(run)) {
      var value = segment.segment;
      cells.push({
        value: value,
        width: Bun.stringWidth(value, clawgodAmbiguousNarrow),
        styleId: styleId,
        hyperlink: hyperlink,
      });
    }
    run = "";
  }
  for (var token of cmr(text)) {
    if (token.type === "char") {
      run += token.value;
      continue;
    }
    var code = token.code;
    if (code.slice(0, clawgodOsc8Prefix.length) === clawgodOsc8Prefix) {
      flush();
      var uri = code.slice(clawgodOsc8Prefix.length, -1);
      hyperlink = uri === "" ? void 0 : uri;
      continue;
    }
    if (!clawgodSgr.test(code)) continue;
    flush();
    styles = Kf(styles, [token]);
  }
  flush();
  return cells;
}
function packCell(styleId, hyperlinkId, width) {
  return jn(styleId, hyperlinkId, width);
}
function unionDamage(first, second) {
  var x = Math.min(first.x, second.x);
  var y = Math.min(first.y, second.y);
  var right = Math.max(first.x + first.width, second.x + second.width);
  var bottom = Math.max(first.y + first.height, second.y + second.height);
  return { x: x, y: y, width: right - x, height: bottom - y };
}
function writeCell(screen, x, y, cell) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return;
  var cells = screen.cells;
  var index = (y * screen.width + x) << 1;
  var previous = cells[index + 1] & bn;
  var left = x;
  var right = x;
  if (previous === 1 && cell.width !== 1 && x + 1 < screen.width) {
    var orphanTail = index + 2;
    if ((cells[orphanTail + 1] & bn) === 2) {
      cells[orphanTail] = wo;
      cells[orphanTail + 1] = packCell(screen.emptyStyleId, 0, 0);
      right = x + 1;
    }
  }
  if (previous === 2 && cell.width !== 2 && x > 0) {
    var orphanHead = index - 2;
    if ((cells[orphanHead + 1] & bn) === 1) {
      cells[orphanHead] = wo;
      cells[orphanHead + 1] = packCell(screen.emptyStyleId, 0, 0);
      left = x - 1;
    }
  }
  cells[index] = Rx(screen, cell.char);
  cells[index + 1] = packCell(cell.styleId, xx(screen, cell.hyperlink), cell.width);
  if (screen.atlasRecorder.recording) screen.atlasRecorder.record(cells[index], cell.styleId);
  if (cell.width === 1 && x + 1 < screen.width) {
    var tail = index + 2;
    if ((cells[tail + 1] & bn) === 1 && x + 2 < screen.width) {
      var orphan = tail + 2;
      if ((cells[orphan + 1] & bn) === 2) {
        cells[orphan] = wo;
        cells[orphan + 1] = packCell(screen.emptyStyleId, 0, 0);
      }
    }
    cells[tail] = Xf;
    cells[tail + 1] = packCell(screen.emptyStyleId, 0, 2);
    right = x + 1;
  }
  var damage = { x: left, y: y, width: right - left + 1, height: 1 };
  screen.damage = screen.damage ? unionDamage(screen.damage, damage) : damage;
}
function paintCells(screen, cells, x, y) {
  var column = x;
  var blank = { char: " ", styleId: screen.emptyStyleId, width: 0, hyperlink: void 0 };
  for (var index = 0; index < cells.length; index++) {
    var cell = cells[index];
    var code = cell.value.charCodeAt(0);
    if (code <= 31) {
      if (code !== 9) continue;
      blank.char = " ";
      blank.styleId = screen.emptyStyleId;
      blank.width = 0;
      blank.hyperlink = void 0;
      var stop = hht - column % hht;
      for (var step = 0; step < stop && column < screen.width; step++) {
        writeCell(screen, column++, y, blank);
      }
      continue;
    }
    if (cell.width === 0) continue;
    var wide = cell.width >= 2;
    if (wide && column + cell.width > screen.width) {
      blank.char = " ";
      blank.styleId = screen.emptyStyleId;
      blank.width = 3;
      blank.hyperlink = void 0;
      writeCell(screen, column++, y, blank);
      continue;
    }
    blank.char = cell.value;
    blank.styleId = cell.styleId;
    blank.hyperlink = cell.hyperlink;
    blank.width = wide ? 1 : 0;
    writeCell(screen, column, y, blank);
    for (var offset = 2; offset < cell.width; offset++) {
      blank.char = "";
      blank.width = 2;
      writeCell(screen, column + offset, y, blank);
    }
    column += wide ? cell.width : 1;
  }
  return column;
}
function Ns() {
  throw new Error("ClawGod replaced the private cell segmenter with a public-Bun renderer; this path must not run.");
}
`;

export const CELL_LINE_CELLS_SOURCE = `
class Dd {
  constructor(stylePool, charPool) {
    this.stylePool = stylePool;
    this.charPool = charPool;
    this.cells = [];
    this.count = 0;
    this.cache = new Map();
    this.styleGeneration = stylePool.generation;
    this.chalkGeneration = bGt();
  }
  parse(text) {
    var chalkGeneration = bGt();
    if (this.styleGeneration !== this.stylePool.generation || this.chalkGeneration !== chalkGeneration) {
      this.cache.clear();
      this.styleGeneration = this.stylePool.generation;
      this.chalkGeneration = chalkGeneration;
    }
    var cached = this.cache.get(text);
    if (cached !== void 0) {
      this.cache.delete(text);
      this.cache.set(text, cached);
      return cached;
    }
    var parsed = parseStyledText(sanitizeControlSequences(text), this.stylePool);
    if (this.cache.size >= clawgodCacheLimit) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(text, parsed);
    return parsed;
  }
  segment(text) {
    this.cells = this.parse(text);
    this.count = this.cells.length;
    return this.count;
  }
  width(text, start) {
    var column = start;
    var cells = this.segment(text) ? this.cells : [];
    for (var index = 0; index < cells.length; index++) {
      var cell = cells[index];
      column += cell.value.charCodeAt(0) === 9 ? hht - column % hht : cell.width;
    }
    return column - start;
  }
  paint(screen, text, x, y) {
    return paintCells(screen, this.parse(text), x, y);
  }
}
`;

export const CELL_SET_CELL_SOURCE =
  'function Cx(screen,x,y,cell){return writeCell(screen,x,y,cell)}';

export const CELL_WRITE_LINE_SOURCE =
  'function xC(screen,text,x,y,lineCells){return lineCells.paint(screen,text,x,y)}';

// Public Bun.sliceAnsi measures a tab as zero width, so a clipped line that
// contains tabs collapses to nothing. Expand tabs against the line's real
// starting column first, using the same helper the renderer already imports.
const TAB_CLIP_ANCHOR = 'let ge=Dc(oe),ve=U.x2-B';
const TAB_CLIP_REPLACEMENT = 'let ge=Dc(oe);if(ge.indexOf(String.fromCharCode(9))>=0){'
  + 'let q=((B%hht)+hht)%hht;ge=C8(" ".repeat(q)+ge).slice(q)}let ve=U.x2-B';

// Frozen 2.1.274 shapes. Each entry is a declaration header that must be
// unique in the module plus the sha256 of that whole declaration. Anything
// else is treated as an unknown renderer and never rewritten.
export const CELL_SEGMENTER_SHAPE = Object.freeze([
  Object.freeze({ header: 'function Ns(n){', digest: '4e5755f6fa041bc684ece0de64ec2fab3ae64af71d8794b224b7516900621313' }),
  Object.freeze({ header: 'class Dd{', digest: 'a6c1f5e8fff998da5a9a47d7cb327decbb1f9f2ec41cffabafdd0c16977ec649' }),
  Object.freeze({ header: 'function Cx(n,s,u,f){', digest: 'b63f741c88dd98285e657d3e7f189a97f42b1fb3a2e2ec38aa2eb54ad92e4343' }),
  Object.freeze({ header: 'function xC(n,s,u,f,h){', digest: '575897d7252184a58fe852df1f67980083c456e82f42628568c2fbc4b9a03d73' }),
  Object.freeze({ header: 'function cmr(n,s=Number.POSITIVE_INFINITY){', digest: '29b1446b9ad065df93b7bcb55a3230d5f17d7ae36c8081b2dc1ea78c8df4dcfc' }),
  Object.freeze({ header: 'function Kf(n,s){', digest: 'bd9156be1dfb7d9044dd6aaffaacbc57ede60330c22c4aae38d5acc262f75cd1' }),
  Object.freeze({ header: 'function Dc(n){', digest: '2fb9fb7059ede30d487c8e40929369d743bb23bfb5771435c16b6e18283a2924' }),
]);

// The renderer also leans on these module-level bindings. They are checked by
// name so a renamed or removed import fails closed instead of at runtime.
const CELL_SEGMENTER_BINDINGS = Object.freeze(['hht', 'C8', 'MNr', 'LNr', 'bGt']);
const OSC8_DECLARATION = 'var Ss="\\x1B]8;;"';

// 同版本跨平台会重命名压缩标识符。只映射注入源码，绝不重命名上游模块；
// 每个平台仍须通过完整声明的 SHA-256 校验，而不是依赖运行机器的平台。
const CELL_PLATFORM_SHAPES = [
  {
    shape: CELL_SEGMENTER_SHAPE,
    names: {},
    tabAnchor: TAB_CLIP_ANCHOR,
    tabReplacement: TAB_CLIP_REPLACEMENT,
  },
  {
    shape: [
      { header: 'function Ns(n){', digest: 'ac30ce81cada59843be0fa495b883808c0c4338bfe199d068e9ed5eab5062e74' },
      { header: 'class Dd{', digest: '7bed0618f1608b4b221fefa36167bb319d0c9f5cd2cd4d819277b89d7bbe1903' },
      { header: 'function xx(n,s,u,f){', digest: 'deac5d3bb248a2fd8dbdd347f4e1024ddef40623eb5b13fd7a60ddbc2c528925' },
      { header: 'function SC(n,s,u,f,m){', digest: 'bb6854b10f0e6846cfcf1af6749b3b185f171370589b580a2ea1948dd22310f5' },
      { header: 'function qmr(n,s=Number.POSITIVE_INFINITY){', digest: '59a3a009130c86c7223ce4ff3c8f24c9b71727cf157199cb24c9b8337cd5e42d' },
      { header: 'function Kf(n,s){', digest: '833c8aba97c1c5351305daabf62c531b87b37f9da291fa067416c99332cdf285' },
      { header: 'function Dc(n){', digest: 'b906f74a22265209d7f233e752a1b43bc1b5172fd7dc8d1028ef90f928805658' },
    ],
    names: { Cx: 'xx', xC: 'SC', cmr: 'qmr', Rx: 'Cx', xx: 'Ex', hht: 'nht', C8: '_Y', MNr: 'LVn', LNr: 'wdt', bGt: 'nqt' },
    tabAnchor: 'let be=Dc(oe),ge=F.x2-w',
    tabReplacement: 'let be=Dc(oe);if(be.indexOf(String.fromCharCode(9))>=0){let q=((w%nht)+nht)%nht;be=_Y(" ".repeat(q)+be).slice(q)}let ge=F.x2-w',
  },
  {
    shape: [
      { header: 'function Ns(n){', digest: '736a25ec268896d71d07162d41f0d171a6eac36db7902a2f07bbcde9f8ceed5d' },
      { header: 'class Dd{', digest: '77c3b10775ae166bf39189f35445bac7d3b0a1afc92ddc5ba3e4998fcb7b5e87' },
      { header: 'function Rx(n,s,u,f){', digest: '96c198edfb189f58e281309e2820ecb8e82d86a90f4b682ba124f71190e2f045' },
      { header: 'function CC(n,s,u,f,h){', digest: '8a4b8e4f74ae43c7e26c9337de933ead26d765b64f863ff3675a948ed600863b' },
      { header: 'function Jmr(n,s=Number.POSITIVE_INFINITY){', digest: 'b6efb306c3b5a4a2a7fe779f214f8747a08cf149d3fce068802c2580f35085ab' },
      { header: 'function Kf(n,s){', digest: '7696e200d0fdf7b4c84049db7941177071620a5c6b68272fae60f5ebf0d41db1' },
      { header: 'function Dc(n){', digest: '55e89daf20204474e099191c0f4d1a843cf51c94fbd569f4051c69b7bc726149' },
    ],
    names: { Cx: 'Rx', xC: 'CC', cmr: 'Jmr', Rx: 'Mx', xx: 'Cx', hht: 'tht', C8: 'v8', MNr: 'zVn', LNr: 'vdt', bGt: 'oqt' },
    tabAnchor: 'let be=Dc(oe),ge=L.x2-H',
    tabReplacement: 'let be=Dc(oe);if(be.indexOf(String.fromCharCode(9))>=0){let q=((H%tht)+tht)%tht;be=v8(" ".repeat(q)+be).slice(q)}let ge=L.x2-H',
  },
  // 2.1.276 darwin
  {
    shape: [
      { header: 'function Ss(n){', digest: 'a0dd4522389a8dc1967f76410f73889df40bdf86f47e95cd08d6d0673018b9dd' },
      { header: 'class Cd{', digest: '00fdec476f2ad30e68b1594fad389af0be769b0a9ffaceac093f6f773eaad1ef' },
      { header: 'function cx(n,s,u,f){', digest: '551fdb0cb11d12cab8e0396011a0a0149f3fcfcf3f2689d810df561d48716037' },
      { header: 'function cC(n,s,u,f,m){', digest: 'd3381a42bb35979e80423552684344b3903928fd7017af1504e3f424a86b41db' },
      { header: 'function _br(n,s=Number.POSITIVE_INFINITY){', digest: 'fcf061b6dfef0ef35dc17cc5d65bcaa25defad452f687dc78b7efe93bce698e3' },
      { header: 'function Lf(n,s){', digest: '20026d512dbaf213e8b6886de96427524a408b128630cf018a1663a93153ffec' },
      { header: 'function xc(n){', digest: '43b72b923bf142999721ae83f4750b4068e184b05835b6d0e90fc11d7675d332' },
    ],
    names: { Ns: 'Ss', Dd: 'Cd', Cx: 'cx', xC: 'cC', cmr: '_br', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Ho', Xf: 'Kf', Rx: 'fx', xx: 'ux', hht: 'j_t', C8: 'uY', MNr: 'g2r', LNr: 'h2r', bGt: 'mqt' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=U.x2-H',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%j_t)+j_t)%j_t;fe=uY(" ".repeat(q)+fe).slice(q)}let ge=U.x2-H',
  },
  // 2.1.276 linux
  {
    shape: [
      { header: 'function Ss(n){', digest: 'a8789e212cdc179cb9dcab6d0b151df1e54374f229abf06269d8af3dfa2608e3' },
      { header: 'class Cd{', digest: 'da7e444b7296895b90e3e95e3e95119eec19f9030cc6857db42c4bfc892777b8' },
      { header: 'function ax(n,s,u,f){', digest: '07bbebc3e21c46baaf7c5852eefcd63c69e253e3c4608774e7171dd15a544040' },
      { header: 'function uC(n,s,u,f,m){', digest: '17493b884635fc837b3f66dd2eaae3ffa99f758080e8e229e47b0ae24f4e1a5d' },
      { header: 'function Wbr(n,s=Number.POSITIVE_INFINITY){', digest: '825eda9f6c8a22e2090a41d5b1df77d96e74024840bd2239e86186aef6e0b493' },
      { header: 'function Lf(n,s){', digest: 'd8a635ea00ff8f6b75098bdea95b0a4e683f4e7e26440b65dbce03a5524dad22' },
      { header: 'function xc(n){', digest: 'b7d454b07e4d7443691841d0bbfbf998743050241f8a8f6dba819fdf69eff375' },
    ],
    names: { Ns: 'Ss', Dd: 'Cd', Cx: 'ax', xC: 'uC', cmr: 'Wbr', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Bo', Xf: 'Kf', Rx: 'sx', xx: 'rx', hht: 'R_t', C8: 'r9', MNr: 'LBr', LNr: 'DBr', bGt: 'X4t' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=P.x2-B',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((B%R_t)+R_t)%R_t;fe=r9(" ".repeat(q)+fe).slice(q)}let ge=P.x2-B',
  },
  // 2.1.276 win32
  {
    shape: [
      { header: 'function Ss(n){', digest: '4dc4fb9aec1e8d12f2142a2e3af9592e8eee119c0e5574d8000244527b3ce6ef' },
      { header: 'class Cd{', digest: '05def87fb3a883645f33f12486e5e529b7ab519173d7f890b2733675dc6258d2' },
      { header: 'function ux(n,s,u,f){', digest: '7b878069aae21e0c2e94304adfcd4bb225a7217b0d0343cb8dc35b5c94d007ba' },
      { header: 'function uC(n,s,u,f,m){', digest: '3f43193067f814623bf3a7b97d60e15eef7ca6990204fb562702c9591c6e17a8' },
      { header: 'function Ybr(n,s=Number.POSITIVE_INFINITY){', digest: '0d3186c7f2bf757c66164290f4a839f76a3e25547f392972da8ef7b56b5e0b89' },
      { header: 'function Lf(n,s){', digest: '60da48ed9f91315e49151c21cbbd6b219fba63d2db6c8e9a0159888e07e69ebd' },
      { header: 'function xc(n){', digest: 'edc201f072ecabe926a01ecda3ed3abe904fb2e0be9bb7e86fe796b08e73af19' },
    ],
    names: { Ns: 'Ss', Dd: 'Cd', Cx: 'ux', xC: 'uC', cmr: 'Ybr', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Ho', Xf: 'Kf', Rx: 'cx', xx: 'sx', hht: 'R_t', C8: 'l9', MNr: '$Br', LNr: 'FBr', bGt: 'e3t' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=U.x2-H',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%R_t)+R_t)%R_t;fe=l9(" ".repeat(q)+fe).slice(q)}let ge=U.x2-H',
  },
  // 2.1.278 darwin
  {
    shape: [
      { header: 'function vs(n){', digest: 'd4a8296094cac9707122b9e5460138ae8b0c3f9194e3185e141db1216ca70cfc' },
      { header: 'class Mf{', digest: '134c725be2ec7ec795ad0ca288e0671abdfabda01fcce28e1370b47069096721' },
      { header: 'function px(n,s,u,f){', digest: '6fed0460bd35861f2649f88e19c888f6051aa8b8ed05f4e2f6b0854af10d41d1' },
      { header: 'function xC(n,s,u,f,m){', digest: '74f0a5164e92d9e99518b27ff2d9007552c0c1627eb5b7fac281e5fe7756a2b8' },
      { header: 'function bCr(n,s=Number.POSITIVE_INFINITY){', digest: '857ed54815e1d96529dc71cf7f4d9655613aadbeecfc3a10885b3b0ecbc8e43d' },
      { header: 'function Bd(n,s){', digest: 'd37554a039a8c7364ee2ff7d6ff28bb15920c627ecfb909de192406c1c5e7c78' },
      { header: 'function Ec(n){', digest: 'cd3da2b7dc88940ea34fc9da20134e596a9e4dbcd1f39238d8aad7199e82fe8c' },
    ],
    names: { Ns: 'vs', Dd: 'Mf', Cx: 'px', xC: 'xC', cmr: 'bCr', Kf: 'Bd', Dc: 'Ec', bn: 'gn', wo: 'Ho', Xf: 'kd', Rx: 'yx', xx: 'mx', hht: 'cwt', C8: 'fX', MNr: 'bzr', LNr: 'wzr', bGt: 'T5t' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=Ec(oe),ge=F.x2-H',
    tabReplacement: 'let fe=Ec(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%cwt)+cwt)%cwt;fe=fX(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.278 linux
  {
    shape: [
      { header: 'function Ss(n){', digest: '0634b77a7740a9fcde19c3985049d09b24618d1b5baee2e60a65ff90e8215e00' },
      { header: 'class Rf{', digest: '3e9a874886729829a6e370f9d6ecc83a888c1d2eb0f2ffd6273d464464be6956' },
      { header: 'function hx(n,s,u,f){', digest: '820518bd51fa6bc8177cfb53fc0ffde817122bfdaed171895a220ae552f53b63' },
      { header: 'function xC(n,s,u,f,m){', digest: '21bfc2d2353fb3ef83d702a609b6f592dcd742d3a2ef9170ba2417610d2893f6' },
      { header: 'function ckr(n,s=Number.POSITIVE_INFINITY){', digest: '3473ce0607774850f4803c3b31d478a6ead374ce5dfd6f93fdfc4c77f43f3589' },
      { header: 'function Bd(n,s){', digest: '2c8459be8474405142e31e0dfc24151411ace0cb7e6e6c28dc0b961aa2deadf0' },
      { header: 'function xc(n){', digest: 'c0b05868714c4c6446bedf98f853769dd91c76c3fde53648567e2f2f6c20c48c' },
    ],
    names: { Ns: 'Ss', Dd: 'Rf', Cx: 'hx', xC: 'xC', cmr: 'ckr', Kf: 'Bd', Dc: 'xc', bn: 'gn', wo: 'Bo', Xf: 'kd', Rx: 'mx', xx: 'fx', hht: 'YSt', C8: 'iX', MNr: 'FGr', LNr: 'UGr', bGt: 'l8t' },
    oscDeclaration: 'var gs="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=L.x2-B',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((B%YSt)+YSt)%YSt;fe=iX(" ".repeat(q)+fe).slice(q)}let ge=L.x2-B',
  },
  // 2.1.278 win32
  {
    shape: [
      { header: 'function Ss(n){', digest: 'b72e953d299ddf87ee7906bc25cb673fe56a2f54f6ee57e726a893981e43e0d8' },
      { header: 'class Mf{', digest: '27fe1ba7d7289fafac5ae625645228a8eb1c343f839a23d6b927e2fa484a3bb9' },
      { header: 'function px(n,s,u,f){', digest: '0fa001b973bafe1401fd0fe20d57103a567428bd2dec5f0ef98c95d1176cb422' },
      { header: 'function EC(n,s,u,f,m){', digest: 'b5c9f67c07cc451feeb200cf93cdca3c6d07e1557a66151b39cbeb3725c3d4e8' },
      { header: 'function mkr(n,s=Number.POSITIVE_INFINITY){', digest: 'c9855fa3632f839f5955da35f7a6522e6041afd7e6b79918ad025b92726d6b1c' },
      { header: 'function Bd(n,s){', digest: '9b1427b49efb55c454c6c935d2c62bb145184d0f55214c3ea8ce399cd6622935' },
      { header: 'function Ec(n){', digest: '7008506e2fe7aa92fa08c1c468397756e853d7bdf8c15a6c68cf99da7bbdb4dc' },
    ],
    names: { Ns: 'Ss', Dd: 'Mf', Cx: 'px', xC: 'EC', cmr: 'mkr', Kf: 'Bd', Dc: 'Ec', bn: 'gn', wo: 'Ho', Xf: 'kd', Rx: 'yx', xx: 'mx', hht: 'YSt', C8: 'uX', MNr: 'zGr', LNr: 'WGr', bGt: 'pYt' },
    oscDeclaration: 'var gs="\\x1B]8;;"',
    tabAnchor: 'let fe=Ec(oe),ge=F.x2-H',
    tabReplacement: 'let fe=Ec(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%YSt)+YSt)%YSt;fe=uX(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.280 darwin
  {
    shape: [
      { header: 'function gs(n){', digest: '451500eeb2148705f8efb2c6f462a4694d35db36e8a58249e5e8bcf43797a2ad' },
      { header: 'class Kd{', digest: '4a95b3099242d27d4a1f3368c69b2369e185abc422dcfc5799018c8452906388' },
      { header: 'function WE(n,s,u,f){', digest: '8ad35a3ee724264f7d7864935000c0006feedc300a40ad1e4f982c7611131b19' },
      { header: 'function $x(n,s,u,f,m){', digest: 'a170ead8f986ec28ddeacd93f1490a957866dcf321ccb0bc5f8d182d6596c07a' },
      { header: 'function UMr(n,s=Number.POSITIVE_INFINITY){', digest: '3a703d643b7b327d93744ac87f44b91ce6a42811266b121eb9800533dd0c9148' },
      { header: 'function ud(n,s){', digest: 'f8d29d2b93f36ba509529c3c3622438cbedea3495018f8d51e373296dbbc2306' },
      { header: 'function gc(n){', digest: 'fee256ff9a34ed06a504164cc065414a5c334259f6ff1f90a96e36d700b31208' },
    ],
    names: { Ns: 'gs', Dd: 'Kd', Cx: 'WE', xC: '$x', cmr: 'UMr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'Do', Xf: 'pd', jn: 'Yn', Rx: 'qE', xx: 'jE', hht: 'ITt', C8: 'eJ', MNr: 'WXr', LNr: 'GXr', bGt: 'QZt' },
    oscDeclaration: 'var ms="\\x1B]8;;"',
    tabAnchor: 'let fe=gc(oe),ge=F.x2-H',
    tabReplacement: 'let fe=gc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%ITt)+ITt)%ITt;fe=eJ(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.280 linux
  {
    shape: [
      { header: 'function gs(n){', digest: '6763991fc5b3df480c2dbf79f805a87c753c1b0bb15419b2aa1a1b11473009f2' },
      { header: 'class Kd{', digest: 'd0409e7aa3498854187ed619ed7f298f580f26acf778719f50916e3c70ffa203' },
      { header: 'function IE(n,s,u,f){', digest: '946b728782e4f0af594653a125a01fc96dece05cbd302693511cb3f86bd807c3' },
      { header: 'function Qx(n,s,u,f,m){', digest: 'b78125da953622f610cae658a8dc00cb95c0976efd1db8343c79490145841ecf' },
      { header: 'function pLr(n,s=Number.POSITIVE_INFINITY){', digest: '3098b06aad5590987e5c7deb10540401bceca300517d3df03116f21c01d06b9f' },
      { header: 'function ud(n,s){', digest: 'dfbad4e6a5fd98ae20c0f403e57f3e1ca8478a2d25c22e20ea3f972070b9d066' },
      { header: 'function gc(n){', digest: '98db97d40a90642343d59bc908e66b1b50ef8e6e4bc850bfd95a36abd70b965a' },
    ],
    names: { Ns: 'gs', Dd: 'Kd', Cx: 'IE', xC: 'Qx', cmr: 'pLr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'No', Xf: 'pd', jn: 'Yn', Rx: 'KE', xx: 'kE', hht: 'yTt', C8: 'VJ', MNr: 'sXr', LNr: 'iXr', bGt: 'DZt' },
    oscDeclaration: 'var ms="\\x1B]8;;"',
    tabAnchor: 'let fe=gc(oe),ge=L.x2-B',
    tabReplacement: 'let fe=gc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((B%yTt)+yTt)%yTt;fe=VJ(" ".repeat(q)+fe).slice(q)}let ge=L.x2-B',
  },
  // 2.1.280 win32
  {
    shape: [
      { header: 'function gs(n){', digest: '73e2f2b383b85627c5e55c4e655693826e1ccb51de1993ef14acfca15984afae' },
      { header: 'class Kd{', digest: 'b4413fb01fca4840d1ab17e566c666215192bf15ed74f9615c2d9a5d305a9d53' },
      { header: 'function IE(n,s,c,f){', digest: '7d59d694db37fc2f83d1eae6f375fe5d52c969c7b5069d5c041ab535b196af69' },
      { header: 'function Zx(n,s,c,f,m){', digest: '41ceded8b5e47c852cdb8d5b95f8e3f91f3b5cb926dd76b63ec25561b65409e2' },
      { header: 'function ILr(n,s=Number.POSITIVE_INFINITY){', digest: '1ee383323def178309c1f1a5217d7d92a1a14459d56948be4d0ddcb8f65f9cc3' },
      { header: 'function ud(n,s){', digest: 'a025d26a071a69d37db47f5264fc030dae50e46640ca0d216b77295a62bbf0ad' },
      { header: 'function gc(n){', digest: '32f70c54b303068cdc05668408c2f0f2dd7b54cc2a91862a2646a93cc3df7f97' },
    ],
    names: { Ns: 'gs', Dd: 'Kd', Cx: 'IE', xC: 'Zx', cmr: 'ILr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'No', Xf: 'pd', jn: 'Yn', Rx: 'KE', xx: 'kE', hht: '_Ct', C8: 'QJ', MNr: 'dXr', LNr: 'uXr', bGt: 'UZt' },
    oscDeclaration: 'var ms="\\x1B]8;;"',
    tabAnchor: 'let fe=gc(oe),ge=F.x2-H',
    tabReplacement: 'let fe=gc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%_Ct)+_Ct)%_Ct;fe=QJ(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.281 darwin
  {
    shape: [
      { header: 'function Rs(n){', digest: '9a0c2f80ef7f4e227d78ce236f0bae24587e439ac90b03cdbb34db2d149d54f0' },
      { header: 'class tf{', digest: 'c68ca011843f621bef8a7e74d0323ae9ac0eb5d2a190d3047e084de577786239' },
      { header: 'function ex(n,d,f,m){', digest: 'c9b4f151ba15d44851e343bf7e9ec52a691e2f200a89b54181cd0d12d5816475' },
      { header: 'function uC(n,d,f,m,y){', digest: 'b0c5d22aa99966eaea3d4760abfb33306cb5b11bd690aa8d8ce3ec1f587aaf32' },
      { header: 'function X6r(n,d=Number.POSITIVE_INFINITY){', digest: '5047f9a32564548b7813e7475839874785647ec8017a3086b9afc2ea6a700b3d' },
      { header: 'function vd(n,d){', digest: '3a300dc65b17c443fbb2485449c4e4faf15a5f14a27659ad0afd9197b0f27cad' },
      { header: 'function Tc(n){', digest: '6e14ebbea67d98ab0d6a10563da9ecb1a1c520772e11bfc04d81f9b7954a289d' },
    ],
    names: { Ns: 'Rs', Dd: 'tf', Cx: 'ex', xC: 'uC', cmr: 'X6r', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Ll', Xf: 'Md', jn: 'Vn', Rx: 'tx', xx: '$E', hht: 'wIt', C8: 'KQ', MNr: 'Koo', LNr: 'Yoo', bGt: 'Fsn' },
    oscDeclaration: 'var Ss="\\x1B]8;;"',
    tabAnchor: 'let me=Tc(re),ge=k.x2-U',
    tabReplacement: 'let me=Tc(re);if(me.indexOf(String.fromCharCode(9))>=0){let q=((U%wIt)+wIt)%wIt;me=KQ(" ".repeat(q)+me).slice(q)}let ge=k.x2-U',
  },
  // 2.1.281 linux
  {
    shape: [
      { header: 'function Cs(n){', digest: '697172aa9a012689dec1039f928cf1cd5555787ed484cd643bb7df1c422c334f' },
      { header: 'class tf{', digest: '963ec5f0e002f5e92f2be66ed1796b30d6861881c858029b783c9c7836c94702' },
      { header: 'function ix(n,d,f,m){', digest: '82313b116143d3a00a72b2c6962dd0dd58692901e1e68407b839f6425766cdf8' },
      { header: 'function fC(n,d,f,m,y){', digest: '321d46c4530acf46bfa4bdaa013e5fe9e0076b3f8a37b59ad30ff53850364d59' },
      { header: 'function V2r(n,d=Number.POSITIVE_INFINITY){', digest: 'f456f8a2d6ef62003a6fc96bacdd883f883ecea431e1d009225354f75cc88cd7' },
      { header: 'function vd(n,d){', digest: '62e53b0823f83835e1b9cfc224431d49961bd469c6a480fa61823b95b7eeb1f3' },
      { header: 'function Tc(n){', digest: 'f68dedcc478ff81e06e5f1c6a65c6f574d770386d989053682137a8b58591ff9' },
    ],
    names: { Ns: 'Cs', Dd: 'tf', Cx: 'ix', xC: 'fC', cmr: 'V2r', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Pl', Xf: 'Md', jn: 'Vn', Rx: 'ox', xx: 'nx', hht: 'aPt', C8: 'FQ', MNr: 'foo', LNr: 'moo', bGt: 'Ssn' },
    oscDeclaration: 'var Ss="\\x1B]8;;"',
    tabAnchor: 'let me=Tc(re),ge=k.x2-U',
    tabReplacement: 'let me=Tc(re);if(me.indexOf(String.fromCharCode(9))>=0){let q=((U%aPt)+aPt)%aPt;me=FQ(" ".repeat(q)+me).slice(q)}let ge=k.x2-U',
  },
  // 2.1.281 win32
  {
    shape: [
      { header: 'function Ms(n){', digest: '72f21af750a40d4dcda7fd8b1673694e3f489d934153b35c11f70ae97e0f7b0c' },
      { header: 'class tf{', digest: '6e58e78427d424277d8ffb34cbe55bf0e46925cd773a890745b6d88e2a1a63df' },
      { header: 'function nx(n,d,f,m){', digest: '897adb575822f3887bee660507b9a7eb6609d3520d7b48ce0adef47c06ca90b4' },
      { header: 'function fC(n,d,f,m,y){', digest: '16363df1b5e8f33477b55a969b60aac260188f588682e471a69ef6bfbb6b95ad' },
      { header: 'function Jzr(n,d=Number.POSITIVE_INFINITY){', digest: 'fdeefec3214acc2e60164bb21cdead6e40daa9e251bf0901eaf29ad0061db6e7' },
      { header: 'function vd(n,d){', digest: 'f1732946d8f5a8838578ed6ba55acccc632dc105446fda0d92f80bfea6a0596f' },
      { header: 'function Tc(n){', digest: '407be17e8cb9bc2f7066a130e1debbc8824eee8b27287d5fab48ef1670563c31' },
    ],
    names: { Ns: 'Ms', Dd: 'tf', Cx: 'nx', xC: 'fC', cmr: 'Jzr', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Pl', Xf: 'Md', jn: 'Vn', Rx: 'ix', xx: 'tx', hht: 'sIt', C8: 'W7', MNr: 'hoo', LNr: 'yoo', bGt: 'Tsn' },
    oscDeclaration: 'var Ss="\\x1B]8;;"',
    tabAnchor: 'let me=Tc(re),ge=I.x2-U',
    tabReplacement: 'let me=Tc(re);if(me.indexOf(String.fromCharCode(9))>=0){let q=((U%sIt)+sIt)%sIt;me=W7(" ".repeat(q)+me).slice(q)}let ge=I.x2-U',
  },
  // 2.1.285 darwin：ANSI 辅助函数已拆到冻结的依赖分块。
  {
    shape: [
      { header: 'function ys(n){', digest: 'cde64cf325e8da5fe5e25b08a745d5e2ebf7afa9a3a13249dc975569d9615629' },
      { header: 'class Kd{', digest: 'a219f5e963fd90cf05bbf0f05a11baab6fab6345e3b3284560b45756a7f9f273' },
      { header: 'function N1(n,d,f,m){', digest: 'f11514b07f290a7834dd4d77f3305814c17813418c23df8cf2217b8ec6e9f192' },
      { header: 'function Lx(n,d,f,m,y){', digest: '4b8fa5266696dab2714759543f4d6e88594a9673e676123ca11aead7f99f9800' },
      { header: 'function bc(n){', digest: '06f34db54c4db085e25a8abac7041bfd9d10de3346a01e90134d615eae6923f0' },
    ],
    names: { Ns: 'ys', Dd: 'Kd', Cx: 'N1', xC: 'Lx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'bc', bn: 'En', wo: 'Hl', Xf: 'dd', jn: 'Vn', Rx: 'A1', xx: 'T1', hht: 'XFt', C8: 'Cne', MNr: 'Ovo', LNr: 'Dvo', bGt: 'qgn' },
    dependency: { specifier: '/$bunfs/root/chunk-rq9vt4dd.js', digest: '6f57031332df9bc09e5fa53e405715071ea34bfffae53a07e236d808ea0babbc', tokenizer: 'OEo', normalizeStyles: 'Drn' },
    tabAnchor: 'let Ee=bc(ae),pe=G.x2-U',
    tabReplacement: 'let Ee=bc(ae);if(Ee.indexOf(String.fromCharCode(9))>=0){let q=((U%XFt)+XFt)%XFt;Ee=Cne(" ".repeat(q)+Ee).slice(q)}let pe=G.x2-U',
  },
  // 2.1.285 linux
  {
    shape: [
      { header: 'function ys(n){', digest: '2f07348ed297e7c4af1b937c6d29f5a998eefe51af0af649ebaa0bb708768294' },
      { header: 'class Id{', digest: '86b8542dd47127b6eecfcdf4a75aa7bddbf87b76d9d7285f32b25916e4f4cb1b' },
      { header: 'function _1(n,d,f,m){', digest: '256cb0c2d178419fff7701080581159fb31008a2f518f67b5ee3312f4fb7d325' },
      { header: 'function Px(n,d,f,m,y){', digest: '013cf547bb3ab4351184c79b1ac7a154a9f1c4385cf1235e6d1b5c8e2fb31d92' },
      { header: 'function bc(n){', digest: '0919440b08ebc48d0416f8efe20b0c71e9f6119ecc13f084a0c45cc2898b16de' },
    ],
    names: { Ns: 'ys', Dd: 'Id', Cx: '_1', xC: 'Px', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'bc', bn: 'En', wo: 'Hl', Xf: 'dd', jn: 'Vn', Rx: 'D1', xx: 'A1', hht: 'L$t', C8: 'hne', MNr: 'Xvo', LNr: 'Jvo', bGt: 'xgn' },
    dependency: { specifier: '/$bunfs/root/chunk-63gmfw50.js', digest: '9bb893dfcdb68982c86db1392f92daa7db6f0c8fc15d65c2e9c5b67b6c265ee8', tokenizer: 'Jwo', normalizeStyles: 'hrn' },
    tabAnchor: 'let Ee=bc(ae),pe=k.x2-F',
    tabReplacement: 'let Ee=bc(ae);if(Ee.indexOf(String.fromCharCode(9))>=0){let q=((F%L$t)+L$t)%L$t;Ee=hne(" ".repeat(q)+Ee).slice(q)}let pe=k.x2-F',
  },
  // 2.1.285 win32
  {
    shape: [
      { header: 'function ys(n){', digest: '47b2cb945d61439d46e90be9286209ae9ce20de5c57c3563fd2305f34c0413a5' },
      { header: 'class Kd{', digest: '4da4a86fbaf106eee3ca5a9063a469a783cea879cc0a1e678a430ef609a78c08' },
      { header: 'function D1(n,d,f,m){', digest: 'dd5e791308b46be577475d28ccdc2bd1b9c2c7ccfcc7db33ad616c1c47a80386' },
      { header: 'function zx(n,d,f,m,y){', digest: '00f7347d22ebd1b5bb33fb313127c234cca04ea49569275c927711c41a371945' },
      { header: 'function bc(n){', digest: 'b7cd54dd30f7a4cf5a2fa67652f6dd81954d4112318fd54b25e537b653bb4180' },
    ],
    names: { Ns: 'ys', Dd: 'Kd', Cx: 'D1', xC: 'zx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'bc', bn: 'En', wo: 'Ol', Xf: 'dd', jn: 'Vn', Rx: 'w1', xx: '_1', hht: 'FFt', C8: 'Sne', MNr: 'tEo', LNr: 'nEo', bGt: 'Lgn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-e9tkhk3c.js', digest: '7afc65e2947df22dc031264fe732ec31c0f805896d350dc63ca9ef1432d54981', tokenizer: 'rvo', normalizeStyles: 'Srn' },
    tabAnchor: 'let Ee=bc(ae),pe=I.x2-U',
    tabReplacement: 'let Ee=bc(ae);if(Ee.indexOf(String.fromCharCode(9))>=0){let q=((U%FFt)+FFt)%FFt;Ee=Sne(" ".repeat(q)+Ee).slice(q)}let pe=I.x2-U',
  },
  // 2.1.291 linux
  {
    shape: [
      { header: 'function Es(n){', digest: 'a32a7137022622acc46eb9378bb835df31699cd8c74300e90c4e6b3de6ea694b' },
      { header: 'class tf{', digest: '727d5c0a49ca31a7947dd049045268150523465aa2ffbf186981d2538f4972e7' },
      { header: 'function Gx(n,u,f,m){', digest: 'a9b91dc61ba7ae6fe04ed1cae75681a0cacba6947074d17c6f7326c711c4a00f' },
      { header: 'function Z1(n,u,f,m,y){', digest: '99781d2c0f3a53b3d82ac3d6033a9ab330ee98f93d55650ea90f3d79d330d092' },
      { header: 'function Ka(n){', digest: 'e4560bf3a51adfb3391e4368fac331beb89f2a7fb54f969df9853165aab9cab2' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Gx', xC: 'Z1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ka', bn: 'Cn', wo: 'Lr', Xf: 'Md', jn: 'Jn', Rx: 'Yx', xx: 'Ix', hht: 'Gkt', C8: 'Qdr', MNr: 'i3o', LNr: 's3o', bGt: 'uMn' },
    dependency: { specifier: '/$bunfs/root/chunk-ftptxc63.js', digest: '63aa66862c7747246fbfc88c322829913144d759725428da8e8491ec295de73f', tokenizer: 'IGo', normalizeStyles: 'P_n' },
    tabAnchor: 'let se=Ka(me),ue=K.x2-B',
    tabReplacement: 'let se=Ka(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%Gkt)+Gkt)%Gkt;se=Qdr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  // 2.1.291 win32
  {
    shape: [
      { header: 'function Es(n){', digest: '469b58f79e65664849a5d4509bc649fb1949e1d9fd8f70f447897a62224689be' },
      { header: 'class tf{', digest: '49c80d3e5ca1400182aa3f449d95fd0808ee720081870904cc0d44b430238d66' },
      { header: 'function Fx(n,u,f,m){', digest: 'ee252a4e0b3a10c87a86483d27d4723cfdfd4ca36a498437c0331a8c4b50005f' },
      { header: 'function V1(n,u,f,m,y){', digest: '4c61c92e9a77b5435bcc9583ed5f4a9bd49fc63fa36ec2e7ff8f11ef5996e9f6' },
      { header: 'function Ya(n){', digest: '88282e0b191770af4e254185c98f6612b3e35761ded6d91d749cefef76363e06' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Fx', xC: 'V1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Md', jn: 'Jn', Rx: 'Ux', xx: 'zx', hht: 'Ykt', C8: 'iur', MNr: 'tYo', LNr: 'eYo', bGt: 'bMn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-1dws3qtz.js', digest: 'e263e43718cbb1e2f25310a355862a6e7fe7ce1bf66f181c14f96b03c538556f', tokenizer: 'F2o', normalizeStyles: 'H_n' },
    tabAnchor: 'let se=Ya(me),ue=K.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%Ykt)+Ykt)%Ykt;se=iur([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  // 2.1.292 linux
  {
    shape: [
      { header: 'function Es(n){', digest: 'fe4ca7f27a3ebd1d01381e3c995ceca1cf6a3ac5dc2d003cd0594c86464dfa41' },
      { header: 'class nf{', digest: '81d9d65fbbf54f5107689b62dc09267401b4f7533db7d8f388cdc9952f30461e' },
      { header: 'function Ux(n,u,f,m){', digest: '04e4977e3cd31208566109716851bcd5c89a6284e8fa88cf7bccf4f97da3a4ec' },
      { header: 'function V1(n,u,f,m,y){', digest: 'fae50fac8d73a94331fedd083f76119a2165e797ab83dbe17d3871a4e4ec0491' },
      { header: 'function ja(n){', digest: 'f9718bb0776413ab6fa13cbd5a82d111ef20178964a66e9fdf0fbcbaf1cc6ab2' },
    ],
    names: { Ns: 'Es', Dd: 'nf', Cx: 'Ux', xC: 'V1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'ja', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'kx', xx: 'Fx', hht: 'GAe', C8: '$_r', MNr: 'Z9o', LNr: 'Q9o', bGt: 'H0n' },
    dependency: { specifier: '/$bunfs/root/chunk-y4a70sha.js', digest: '29670ade86173894e52907b34a5925877c37c2146331b61d7b12d44736d05d71', tokenizer: 's3o', normalizeStyles: 'Twn' },
    tabAnchor: 'let se=ja(me),ue=G.x2-B',
    tabReplacement: 'let se=ja(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%GAe)+GAe)%GAe;se=$_r([" ".repeat(q)+se]).join("").slice(q)}let ue=G.x2-B',
  },
  // 2.1.292 win32
  {
    shape: [
      { header: 'function Es(n){', digest: '6f7d80edd90a31f2cf3c0dc01974190ee964253e1263aca2e5c5bdb8cc566dee' },
      { header: 'class nf{', digest: 'ac8d649c33a345a12da667ed30cd802e0c85fa0d2fb021408373b01a61c57128' },
      { header: 'function Ux(n,u,f,m){', digest: '93dc6f7ab7c23024a7847f7247d1ba81a40d8280dca83c606575d6794f1a2149' },
      { header: 'function V1(n,u,f,m,y){', digest: 'fae50fac8d73a94331fedd083f76119a2165e797ab83dbe17d3871a4e4ec0491' },
      { header: 'function Ya(n){', digest: '7888f8eeadceda95a2bbf6133b6b2b182644ebfd1399795a49ca0229e0e3ee0e' },
    ],
    names: { Ns: 'Es', Dd: 'nf', Cx: 'Ux', xC: 'V1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'kx', xx: 'Fx', hht: 'GCe', C8: 'Y_r', MNr: 'KXo', LNr: 'qXo', bGt: 'WLn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-eya2x6wc.js', digest: '77715bd017f885a84758ea411e639c28268ac82225e0e8ab1935141c811ffb4a', tokenizer: 'p3o', normalizeStyles: 'Mwn' },
    tabAnchor: 'let se=Ya(me),ue=G.x2-z',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((z%GCe)+GCe)%GCe;se=Y_r([" ".repeat(q)+se]).join("").slice(q)}let ue=G.x2-z',
  },
  // 2.1.292 darwin
  {
    shape: [
      { header: 'function Es(n){', digest: 'e75b78d3c1e0b0bcd57b4af4e7e9c5e17fd6ee6b9f9258d37ba278bcdeb46681' },
      { header: 'class nf{', digest: '681d119f33fe5caf2ae4104987610e9f270d2ae157204ddf76ff62c67e965503' },
      { header: 'function Ix(n,u,f,m){', digest: 'd5bf73d68abd1c541fd882741caabaadaa49b21764a66868dd1c436b2df639c4' },
      { header: 'function Q1(n,u,f,m,y){', digest: 'd73889c55bcc3fc73fcf6bc09735b8534faf335abfc1bee9688d4f7cf6e52b42' },
      { header: 'function Ya(n){', digest: '06cc2a8c1597f053dfead458403cdf3e8824f1fb7cf978eaae807e90610dbfeb' },
    ],
    names: { Ns: 'Es', Dd: 'nf', Cx: 'Ix', xC: 'Q1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Gx', xx: 'kx', hht: 'QAe', C8: 'aSr', MNr: 'NXo', LNr: 'FXo', bGt: 'QDn' },
    dependency: { specifier: '/$bunfs/root/chunk-wsc1qqhv.js', digest: 'df830446dc1a91768a02957b0e5c7c01d46974963793634eac48db7c1c33bdfb', tokenizer: 'W3o', normalizeStyles: 'Gwn' },
    tabAnchor: 'let se=Ya(me),ue=G.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%QAe)+QAe)%QAe;se=aSr([" ".repeat(q)+se]).join("").slice(q)}let ue=G.x2-B',
  },
  // 2.1.295：共享工厂和 ANSI 分块重新压缩，继续冻结渲染及名称校验。
  {
    shape: [
      { header: 'function vs(n){', digest: '532ff22019d6005e3857308e514519e2945a4df8728e8e485ed232d4346f5da2' },
      { header: 'class ef{', digest: 'bdf6488a3baeb5e9593953fad917f29e89d67485768bd1abb1221cd09ac15a21' },
      { header: 'function k1(n,u,f,m){', digest: 'f4a9cc24679c791f85134cf87854338c495c067975732d2ff8d6873dbaa3feb1' },
      { header: 'function Xx(n,u,f,m,y){', digest: 'd28ce25a4b14e53e4fb90311192de4fdcad95fcc88bd794663c5cd355eace398' },
      { header: 'function Nc(n){', digest: '315d0c5a38f5932dbf123e09bfb31ab00256534eae4ca39f9c4f811b1764b23c' },
    ],
    names: { Ns: 'vs', Dd: 'ef', Cx: 'k1', xC: 'Xx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Nc', bn: 'Cn', wo: 'Pr', Xf: 'Md', jn: '$n', Rx: 'I1', xx: 'U1', hht: 'Axe', C8: 'AAo', MNr: 'Aas', LNr: 'Tas', bGt: '_jn' },
    dependency: { specifier: '/$bunfs/root/chunk-bjcznv89.js', digest: 'fe6454a7120901eb212f2c216fdaff4558ea8f371bd427196b3ca63ab1cc77ee', tokenizer: 'dns', normalizeStyles: 'hRn' },
    shared: { specifier: '/$bunfs/root/chunk-2v0x57v3.js', digest: '28b6d2f6ce3b8222020d2e6386244a1b6c3bed2e09a4f024ef3004e9b5310a55', factory: 'xIn', renderer: 'chunk-fg8psmve.js', text: 'chunk-nve3vbhq.js', textDigest: '29eeaf1a67f96c164d40199ff7a09cd843d18e4c15caae282bec619fef9c288d', textBranch: 'if(!B.test(n))return b(M(n));' },
    tabAnchor: 'let ue=Nc(he),se=K.x2-z',
    tabReplacement: 'let ue=Nc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((z%Axe)+Axe)%Axe;ue=AAo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-z',
  },
  {
    shape: [
      { header: 'function vs(n){', digest: 'b0edfaea0c238cf172fa0c418f835a0833de6f7c8fd089fefbc5f9b02b7be27d' },
      { header: 'class ef{', digest: '0218a1127d4c2aa7e375bea4046529015c353fcfe0e7076145663ac42fef2478' },
      { header: 'function k1(n,u,f,m){', digest: 'affd2baa17a78b1b4556231441ee182133cc1418a578702afa541f650b72f25b' },
      { header: 'function Qx(n,u,f,m,y){', digest: 'fddad497696c9991a165b374a3a4b46122d04dce0c3377f5568cecd6979ae7a0' },
      { header: 'function Nc(n){', digest: 'abd722f2874aac5cb74ef3627ebd226a1ed6e1f353d7020e1b822aaa24cb7a7a' },
    ],
    names: { Ns: 'vs', Dd: 'ef', Cx: 'k1', xC: 'Qx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Nc', bn: 'Rn', wo: 'Pr', Xf: 'Rd', jn: '$n', Rx: 'G1', xx: 'U1', hht: 'bxe', C8: 'YTo', MNr: 'Bis', LNr: 'jis', bGt: 'ejn' },
    dependency: { specifier: '/$bunfs/root/chunk-ch6xv8ya.js', digest: '109dbce5fcc6f1a73a9d496c2f6dc3f46bd116092126824d46d8abe336d47ec9', tokenizer: 'Tts', normalizeStyles: 'JCn' },
    shared: { specifier: '/$bunfs/root/chunk-7stz4g07.js', digest: '965478bef3b3b9d546801b3b832bb61ef66756289f5417be68cc4b97328c489c', factory: 'uIn', renderer: 'chunk-x31wb8sb.js', text: 'chunk-ha9h2ky5.js', textDigest: '738e6c85c861e781dff13a6aff30ca78d6c17d761d18b5c952ae1250eb596e24', textBranch: 'if(!B.test(n))return x(M(n));' },
    tabAnchor: 'let ue=Nc(he),se=K.x2-U',
    tabReplacement: 'let ue=Nc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((U%bxe)+bxe)%bxe;ue=YTo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-U',
  },
  {
    shape: [
      { header: 'function vs(n){', digest: '7d5402e152b2ec82851a45ccf3492fa79dccb0ac00261d5d285ec5a4de78192c' },
      { header: 'class ef{', digest: 'c89d809cdec1e9e2595f825951d16cb4b9c4232a46edf5f32bc6062352c76b5e' },
      { header: 'function K1(n,u,f,m){', digest: '17dee4ca5f3c38c189129a97dcef2838cdda8dfd98377b09fd7065f68551a410' },
      { header: 'function Zx(n,u,f,m,y){', digest: '2d66a862dfaa473fe800dc127fe200119914b4a28cc5b0f99fdfe81626ac22ad' },
      { header: 'function Nc(n){', digest: 'd20b9222ee25d17314607cc7babc8b5772e5c08882b40dbabda7ba185d0b8111' },
    ],
    names: { Ns: 'vs', Dd: 'ef', Cx: 'K1', xC: 'Zx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Nc', bn: 'Cn', wo: 'Pr', Xf: 'Rd', jn: '$n', Rx: 'Y1', xx: 'G1', hht: 'bxe', C8: 'rCo', MNr: 'Kis', LNr: 'Yis', bGt: 'wjn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-zwq6ady6.js', digest: '32bb4b7b5a5f154fbf834c73c6859f1f0355934409ba8b2e54a90dec1a4fa401', tokenizer: 'Mts', normalizeStyles: 'lAn' },
    shared: { specifier: 'B:/~BUN/root/chunk-v3xrx1m7.js', digest: '2808d1f22b13620fd4aa558595181555e80491da88ce6e19466142391210e239', factory: 'kIn', renderer: 'chunk-x7q5npp7.js', text: 'chunk-m6rh6mh9.js', textDigest: 'a6ac77a5eb46310d55b99d90e09771f6ac2e298ccebb2190a387ff279d60e798', textBranch: 'if(!B.test(n))return k(R(n));' },
    tabAnchor: 'let ue=Nc(he),se=K.x2-k',
    tabReplacement: 'let ue=Nc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((k%bxe)+bxe)%bxe;ue=rCo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-k',
  },
  // 2.1.293：私有工厂拆成共享分块，渲染和技能名称校验分别冻结。
  {
    shape: [
      { header: 'function Es(n){', digest: '41de312730741d27988f7e5719459a32b95bb063a1c1c1d989bfe4d59dcd3d17' },
      { header: 'class tf{', digest: 'e286c9d0872021b22f6dd5a20afc9b9da998c69fa896da1892ccc10ee693fda1' },
      { header: 'function Ix(n,u,f,m){', digest: '470613d5099aa5afd9532960b174543e2f956089fd435dea9192d858556512f7' },
      { header: 'function X1(n,u,f,m,y){', digest: '33a0924b43d9ff7cc2f9608e070a90efbf8d80a151089895d5dcf0a7fe444fc9' },
      { header: 'function Ya(n){', digest: '86889c0ce5efce9cd73e96554e0691db0e4ecef8a67f80d2115ef95f0733381a' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Ix', xC: 'X1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Gx', xx: 'kx', hht: 'OTe', C8: 'Hwr', MNr: 'iZo', LNr: 'aZo', bGt: 'YNn' },
    dependency: { specifier: '/$bunfs/root/chunk-zy1atq7h.js', digest: '4c92442e56932318cf556da27822f5237302e3f7e923bfbc24b55de1347f0e13', tokenizer: 'c8o', normalizeStyles: '_vn' },
    shared: { specifier: '/$bunfs/root/chunk-y1vajssn.js', digest: '5827d42c03d63ef37aa3ef11d63602fbf0235ff15a78ebaa2348156955a66578', factory: 'WAn', renderer: 'chunk-5a58rh2c.js', text: 'chunk-f7dwnabf.js', textDigest: '8f5df74b5b0d2b91f77b9794a6cc68234384f7be5577c4ad9d796a5547cf0cf5', textBranch: 'if(!F.test(n))return b(M(n));' },
    tabAnchor: 'let se=Ya(me),ue=K.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%OTe)+OTe)%OTe;se=Hwr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  {
    shape: [
      { header: 'function Es(n){', digest: '32b6bdc25d9ef2457819ede122a5d60401e21706c218c94eb2ab799e107bc364' },
      { header: 'class tf{', digest: '70955c89453b7fed4e809d482ba43028fe2864d62ccbbfdfafa6459c84b4498a' },
      { header: 'function zx(n,u,f,m){', digest: '8ac68fa1c2a90a6b043726e9d0b02f8a5c5a273d02d550cc82543cf6b4f2a42c' },
      { header: 'function W1(n,u,f,m,y){', digest: 'fd4c0c75a6d3744210ead3e03c6579f1c1ee7337e8598a82a6c35aa9c0f0f200' },
      { header: 'function Ya(n){', digest: '31cd1e73058f9146e7ac88163fddaa6b91c5eb3d64adaf034c81a398f6ed0563' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'zx', xC: 'W1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Fx', xx: 'Bx', hht: 'TCe', C8: 'dwr', MNr: 'w7o', LNr: 'v7o', bGt: 'INn' },
    dependency: { specifier: '/$bunfs/root/chunk-jf5janxj.js', digest: '81c5382396e6636438956e9ffe5e19ec63fcc0c0a1ccb6c15177d6240c5d8e3f', tokenizer: 'T5o', normalizeStyles: 'Zvn' },
    shared: { specifier: '/$bunfs/root/chunk-pxa7nhh6.js', digest: '3a6b334ec4b4da0a9e98e0ed704a8ee34c8f34af6608eb71c4b59a8db091fa1d', factory: 'TAn', renderer: 'chunk-c47fp7vb.js', text: 'chunk-5tfk4bjh.js', textDigest: '8860223dde0477ed095b13bf15957d22413241e92672e7711fbee669bd4e9843', textBranch: 'if(!F.test(n))return k(M(n));' },
    tabAnchor: 'let se=Ya(me),ue=K.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%TCe)+TCe)%TCe;se=dwr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  {
    shape: [
      { header: 'function Es(n){', digest: '7c9f88f31a22d56d095584087a3baccc99aed457bc6830c25709f004a050b597' },
      { header: 'class tf{', digest: '2be013d46b8110134803ea26d40210e5551d320d75ebf59ac771fa7560515839' },
      { header: 'function zx(n,u,f,m){', digest: 'dc0605f6d38771de60d9ba11769271c10cc9446b53e9add42b7d94506ac18194' },
      { header: 'function W1(n,u,f,m,y){', digest: 'fd4c0c75a6d3744210ead3e03c6579f1c1ee7337e8598a82a6c35aa9c0f0f200' },
      { header: 'function ja(n){', digest: '41936c76938dcb1d24839b0e0b41955c1f73ccaa75a62f6ccac2d7362b642789' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'zx', xC: 'W1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'ja', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Fx', xx: 'Bx', hht: 'TRe', C8: 'vwr', MNr: 'yZo', LNr: '_Zo', bGt: 'UFn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-9zg6kjjc.js', digest: '48c10018bef18377f19847e55712cfcb4148a84109718de5bcef9e3621d33726', tokenizer: 'M5o', normalizeStyles: 'lkn' },
    shared: { specifier: 'B:/~BUN/root/chunk-pvgfk8na.js', digest: 'dadd6baa3126841ad76f6f81fed7ec7395b0570cff8fa58bf7756cb5086a3d72', factory: 'NCn', renderer: 'chunk-7725e2h3.js', text: 'chunk-q1s4dte4.js', textDigest: 'd385cdddaa0e83bab6ea07351cf1ca61e6f5e47f6425e7b648d51b12a9d1a494', textBranch: 'if(!F.test(n))return b(R(n));' },
    tabAnchor: 'let se=ja(me),ue=K.x2-z',
    tabReplacement: 'let se=ja(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((z%TRe)+TRe)%TRe;se=vwr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-z',
  },
  // 2.1.291 darwin：制表符展开改用上游数组接口。
  {
    shape: [
      { header: 'function Es(n){', digest: '476aa6ef7fe9eaa699e0bd3e85f4d4c14ce7c1bbe41d10d47b3088d15b882aaa' },
      { header: 'class tf{', digest: 'cbe12c7e89d7d31465b51e8ff428edf2fc9a3a41aa5f359b7952b255e893a161' },
      { header: 'function Ix(n,u,f,m){', digest: '357638962a695be54a90d989dcfca49184e809631b38639ebe4d112783465403' },
      { header: 'function Z1(n,u,f,m,y){', digest: '99781d2c0f3a53b3d82ac3d6033a9ab330ee98f93d55650ea90f3d79d330d092' },
      { header: 'function Ka(n){', digest: 'd16c8cfcef18134c0d1a7a253d97388508941dfe947ee26069d3cabf0f05e0e9' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Ix', xC: 'Z1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ka', bn: 'Cn', wo: 'Lr', Xf: 'Md', jn: 'Jn', Rx: 'Gx', xx: 'kx', hht: 'nkt', C8: 'Sur', MNr: 'G3o', LNr: 'z3o', bGt: 'x0n' },
    dependency: { specifier: '/$bunfs/root/chunk-byc0q3za.js', digest: '0ce4df7ad6e277579f445d4a8764fac5eb3d7263bde3b7c383059303d775e9ac', tokenizer: 'g6o', normalizeStyles: 'Y_n' },
    tabAnchor: 'let se=Ka(me),ue=K.x2-U',
    tabReplacement: 'let se=Ka(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((U%nkt)+nkt)%nkt;se=Sur([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-U',
  },
  // 2.1.287 darwin
  {
    shape: [
      { header: 'function ms(n){', digest: '2e5738134455a51222b83a73e6a0eb8e28afd921b10b8bea100da2923355aef6' },
      { header: 'class Wd{', digest: '4782b232c1318c7de2bca9c008ef5c792323d4b830dd7e4a9475ddf91a206041' },
      { header: 'function A1(n,u,f,m){', digest: '27ca9965ee1ffb9e5886a1b1c7598ae68fccc6e65f8b66ff859556b2273c08ed' },
      { header: 'function zx(n,u,f,m,y){', digest: 'c6e50c879cdec717e94d7b6faec2ed91744ea55204728f5376e2bf5a6088a300' },
      { header: 'function Cc(n){', digest: '4c9f180a6f959383310b9299d40e876f62f32972d459c9ba0c3214107d53ef8b' },
    ],
    names: { Ns: 'ms', Dd: 'Wd', Cx: 'A1', xC: 'zx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Cc', bn: 'En', wo: 'Ll', Xf: 'yd', jn: 'Vn', Rx: '_1', xx: 'N1', hht: 'D6t', C8: 'v8', MNr: 'tFo', LNr: 'nFo', bGt: 'tCn' },
    dependency: { specifier: '/$bunfs/root/chunk-e8ww06j7.js', digest: '26c20c59c750bf8bd3b5f318173d231cd83287e77994b6f07f7260785206cd24', tokenizer: 'BLo', normalizeStyles: 'ppn' },
    tabAnchor: 'let ge=Cc(le),me=K.x2-L',
    tabReplacement: 'let ge=Cc(le);if(ge.indexOf(String.fromCharCode(9))>=0){let q=((L%D6t)+D6t)%D6t;ge=v8(" ".repeat(q)+ge).slice(q)}let me=K.x2-L',
  },
  // 2.1.287 linux
  {
    shape: [
      { header: 'function ms(n){', digest: '7ae771af98437550783f7e1fbef588f2a7611ddcf77d836477ef0836bb44eff5' },
      { header: 'class Wd{', digest: 'e29e595ba621965960baadf575cdfb7533c7c07cb757ec7b7f000b7b9851ddd3' },
      { header: 'function w1(n,u,f,m){', digest: 'd551441ff7fadf2ad8dda9a8ab9f4e509c35c8746a6b534f6fbdf23082908e70' },
      { header: 'function Ux(n,u,f,m,y){', digest: 'f22eb89c891aba31a05ef51550aa663a99e2b1fdad41e235fd7e2121e09f4bf6' },
      { header: 'function Cc(n){', digest: '4dd03f284a9635eac0af4adfc7bea1787879aa8fb203bee16beaaba31a522337' },
    ],
    names: { Ns: 'ms', Dd: 'Wd', Cx: 'w1', xC: 'Ux', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Cc', bn: 'En', wo: 'Ll', Xf: 'yd', jn: 'Vn', Rx: 'D1', xx: '_1', hht: '_Gt', C8: 'h8', MNr: 'SNo', LNr: 'bNo', bGt: 'OEn' },
    dependency: { specifier: '/$bunfs/root/chunk-xm85yzmk.js', digest: 'c3a9632a58e060d50e2161534e0e124c0175141bae4ccdf73bc088796a61f0dc', tokenizer: 'sLo', normalizeStyles: 'qun' },
    tabAnchor: 'let ge=Cc(le),me=K.x2-B',
    tabReplacement: 'let ge=Cc(le);if(ge.indexOf(String.fromCharCode(9))>=0){let q=((B%_Gt)+_Gt)%_Gt;ge=h8(" ".repeat(q)+ge).slice(q)}let me=K.x2-B',
  },
  // 2.1.287 win32
  {
    shape: [
      { header: 'function ms(n){', digest: '210a40e1a396208fbaf523a1032a73116d35b15504bdd175e937ffe58ba5d061' },
      { header: 'class Wd{', digest: 'eafcfebd00770e4802e5f4de6e50357f01f1d88605bc134bf8576e9c5a507954' },
      { header: 'function w1(n,u,f,m){', digest: '611c770cc8121a5f8f5b1b89870cd21b831f9c7854642e8356825d3b4d6ba300' },
      { header: 'function Ux(n,u,f,m,y){', digest: '0dc7db9e7b7c04738eb456511434285740bceeb67a12e0cbaed9568c84c01cd5' },
      { header: 'function xc(n){', digest: 'dc4582fad33ff5b03de83fe7f7b6326fe017e2f154d5abf18c336cf289279105' },
    ],
    names: { Ns: 'ms', Dd: 'Wd', Cx: 'w1', xC: 'Ux', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'xc', bn: 'En', wo: 'Ll', Xf: 'yd', jn: 'Vn', Rx: 'D1', xx: '_1', hht: 'S2t', C8: '_8', MNr: 'kHo', LNr: 'EHo', bGt: 'UEn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-7wywdnvg.js', digest: 'f2053904c1d113f1aa435e61268c37aa495309d327125d1065754b0e506e400a', tokenizer: 'dNo', normalizeStyles: 'epn' },
    tabAnchor: 'let ge=xc(le),me=K.x2-B',
    tabReplacement: 'let ge=xc(le);if(ge.indexOf(String.fromCharCode(9))>=0){let q=((B%S2t)+S2t)%S2t;ge=_8(" ".repeat(q)+ge).slice(q)}let me=K.x2-B',
  },
];

// Every name the injected source introduces must be free in the target module;
// a collision would silently change unrelated rendering.
const CELL_RENDERER_NAMES = Object.freeze([
  'clawgodCacheLimit', 'clawgodOsc8Prefix', 'clawgodSgr', 'clawgodAmbiguousNarrow',
  'clawgodSegmenter', 'clawgodGraphemes', 'clawgodCsiEnd', 'clawgodOscEnd',
  'sanitizeControlSequences', 'parseStyledText', 'packCell', 'unionDamage',
  'writeCell', 'paintCells', 'clawgodAnsiTokens', 'clawgodNormalizeStyles', 'clawgodMergeStyles',
]);

// Locates the closing brace of a declaration. The result is always checked
// against a frozen digest before anything is rewritten, so a mis-scan can only
// cause a rejected candidate, never a corrupted one.
export function findDeclarationEnd(source, start) {
  let depth = 0;
  let previous = '';
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      index = source.indexOf('\n', index);
      if (index < 0) return -1;
      continue;
    }
    if (char === '/' && next === '*') {
      index = source.indexOf('*/', index);
      if (index < 0) return -1;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index = findStringEnd(source, index, char);
      if (index < 0) return -1;
      previous = 'value';
      continue;
    }
    if (char === '/' && startsExpression(previous)) {
      index = findRegexEnd(source, index);
      if (index < 0) return -1;
      previous = 'value';
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(char)) {
      while (index + 1 < source.length && /[A-Za-z0-9_$]/.test(source[index + 1])) index += 1;
      previous = 'value';
      continue;
    }
    if (!/\s/.test(char)) {
      if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) return index;
      previous = char;
    }
  }
  return -1;
}

function findStringEnd(source, start, quote) {
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === quote) return index;
    if (quote === '`' && char === '$' && source[index + 1] === '{') {
      const end = findDeclarationEnd(source, index + 1);
      if (end < 0) return -1;
      index = end;
    }
  }
  return -1;
}

function findRegexEnd(source, start) {
  let inClass = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '\n') return -1;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return index;
  }
  return -1;
}

function startsExpression(previous) {
  return previous === '' || !/[)\]}\w$]/.test(previous);
}

/**
 * Rewrites a frozen private-runtime renderer into the public-Bun one.
 * Returns null when the module matches no frozen platform shape, so the caller
 * can refuse the candidate instead of installing a runtime that cannot start.
 * `shape` is a parameter so the guard rails around the rewrite can be
 * exercised offline; production callers always use the frozen table.
 */
export function adaptCellRenderer(source, shape, dependencies = new Map()) {
  const profiles = shape ? [{ ...CELL_PLATFORM_SHAPES[0], shape }] : CELL_PLATFORM_SHAPES;
  for (const profile of profiles) {
    const adapted = adaptCellRendererShape(source, profile, dependencies);
    if (adapted !== null) return adapted;
  }
  return null;
}

function adaptCellRendererShape(source, { shape, names, tabAnchor, tabReplacement, dependency, shared, oscDeclaration = OSC8_DECLARATION }, dependencies) {
  if (shared) {
    const factory = dependencies.get(basename(shared.specifier));
    if (typeof factory !== 'string' || createHash('sha256').update(factory).digest('hex') !== shared.digest) return null;
    const imports = [...source.matchAll(/import\{([^}]*)\}from"([^"]+)";/g)]
      .filter(match => match[2] === shared.specifier);
    if (imports.length !== 1 || !imports[0][1].split(',').includes(shared.factory)
      || [...source.matchAll(new RegExp(`\\b${shared.factory}\\b`, 'g'))].length !== 2) return null;
  }
  for (const name of CELL_RENDERER_NAMES) {
    if (source.includes(name)) return null;
  }
  let ansiImport = '';
  if (dependency) {
    // 2.1.285 把 ANSI 分词和样式合并拆到独立模块；冻结整个依赖，不能只信导出名。
    const ansi = dependencies.get(basename(dependency.specifier));
    if (typeof ansi !== 'string' || createHash('sha256').update(ansi).digest('hex') !== dependency.digest) return null;
    const imports = [...source.matchAll(/import\{[^}]*\}from"([^"]+)";/g)]
      .filter(match => match[1] === dependency.specifier);
    if (imports.length !== 1) return null;
    ansiImport = `import{${dependency.tokenizer} as clawgodAnsiTokens,${dependency.normalizeStyles} as clawgodNormalizeStyles}from${JSON.stringify(dependency.specifier)};\n`
      + 'function clawgodMergeStyles(styles,codes){return clawgodNormalizeStyles([...styles,...codes])}\n';
  } else if (!source.includes(oscDeclaration)) return null;
  for (const binding of CELL_SEGMENTER_BINDINGS) {
    const local = names[binding] ?? binding;
    const present = [...source.matchAll(/import\{([^}]*)\}from/g)].some((match) =>
      match[1].split(',').some(specifier => specifier.trim().split(/\s+as\s+/).at(-1) === local));
    if (!present) return null;
  }
  if (source.split(tabAnchor).length !== 2) return null;
  const spans = [];
  for (const { header, digest } of shape) {
    const start = source.indexOf(header);
    if (start < 0 || source.indexOf(header, start + header.length) >= 0) return null;
    const end = findDeclarationEnd(source, start + header.length - 1);
    if (end < 0) return null;
    if (createHash('sha256').update(source.slice(start, end + 1)).digest('hex') !== digest) return null;
    spans.push({ start, end: end + 1 });
  }
  const replacements = [
    [spans[0], CELL_RENDERER_SOURCE],
    [spans[1], CELL_LINE_CELLS_SOURCE],
    [spans[2], CELL_SET_CELL_SOURCE],
    [spans[3], CELL_WRITE_LINE_SOURCE],
  ].sort((first, second) => second[0].start - first[0].start);
  let adapted = source;
  for (const [span, text] of replacements) {
    // 注入模板中的这些短名只作为标识符出现；单次替换避免 Cx→Rx→Mx 连锁改名。
    const mapped = text.replace(/\b(?:Ns|Dd|Cx|xC|cmr|Kf|Dc|bn|wo|Xf|jn|Rx|xx|hht|C8|MNr|LNr|bGt)\b/g, name => names[name] ?? name);
    adapted = adapted.slice(0, span.start) + mapped + adapted.slice(span.end);
  }
  return ansiImport + adapted.replace(tabAnchor, tabReplacement);
}

// 2.1.269+ 渲染器硬依赖私有 Bun.ant.CellSegmenter。公开 Bun 给不了，所以在
// 改写候选、发布到现有安装之前换成等价的 JS 实现；形态不认识就整体拒绝，
// 免得写出一个 --version 能过、交互界面却起不来的运行时。
const CELL_SEGMENTER_REFERENCE = /\bnew\s+Bun\s*\.\s*ant\s*\.\s*CellSegmenter\s*\(/;

function installPublicCellRenderer(modulePaths) {
  if (typeof globalThis.Bun?.ant?.CellSegmenter === 'function') return;
  const targets = [];
  const dependencies = new Map();
  for (const path of modulePaths) {
    const source = readFileSync(path, 'utf8');
    dependencies.set(basename(path), source);
    if (CELL_SEGMENTER_REFERENCE.test(source)) targets.push({ path, source });
  }
  if (targets.length === 0) return;
  if (targets.length > 1) {
    throw new Error(`多个分块都依赖私有 Bun.ant.CellSegmenter，形态无法确认；已拒绝安装（${targets.length} 个）。`);
  }
  const sharedProfile = CELL_PLATFORM_SHAPES.find(profile => profile.shared
    && basename(profile.shared.specifier) === basename(targets[0].path));
  if (sharedProfile) {
    const { shared } = sharedProfile;
    const renderer = modulePaths.map(path => ({ path, source: dependencies.get(basename(path)) }))
      .filter(({ source }) => adaptCellRendererShape(source, sharedProfile, dependencies) !== null);
    const text = dependencies.get(shared.text);
    if (renderer.length !== 1 || typeof text !== 'string'
      || createHash('sha256').update(text).digest('hex') !== shared.textDigest) {
      throw new Error('共享 CellSegmenter 的渲染器或名称校验分块发生漂移；已拒绝安装。');
    }
    const factorySource = targets[0].source;
    const factoryHeader = `function ${shared.factory}(`;
    const factoryStart = factorySource.indexOf(factoryHeader);
    const factoryEnd = findDeclarationEnd(factorySource, factorySource.indexOf('{', factoryStart));
    const exports = factorySource.match(/export\{([^}]+)\};/)[1].split(',');
    for (const path of modulePaths) {
      const source = dependencies.get(basename(path));
      if (!source.includes(shared.specifier)) continue;
      const imports = [...source.matchAll(/import(?:\{([^}]*)\}from)?"([^"]+)";/g)]
        .filter(match => match[2] === shared.specifier);
      const references = source.split(shared.specifier).length - 1;
      if (imports.length !== references || imports.some(match => match[1]?.split(',').some(binding =>
        !exports.includes(binding) || binding === shared.factory
        && path !== renderer[0].path && basename(path) !== shared.text))) {
        throw new Error('共享 CellSegmenter 出现未知调用者；已拒绝安装。');
      }
    }
    // ponytail: 非 ASCII 技能名沿用上游保守子序列校验，可能多拒绝名称；
    // 原生文本 ABI 可公开验证等价后再恢复精确判断，不能为兼容跳过防冒充。
    const updates = new Map([
      [renderer[0].path, adaptCellRendererShape(renderer[0].source, sharedProfile, dependencies)],
      [modulePaths.find(path => basename(path) === shared.text), text.replace(shared.textBranch, '')],
      [targets[0].path, factorySource.slice(0, factoryStart)
        + `function ${shared.factory}(){throw Error("ClawGod 已替换私有 CellSegmenter；不支持新增的原生调用路径。")}`
        + factorySource.slice(factoryEnd + 1)],
    ]);
    for (const [path, source] of updates) writeFileSync(path, source);
    console.log('已用公开 Bun 字符格渲染器替换共享私有实现，并保留技能名称防冒充校验。');
    return;
  }
  const { path, source } = targets[0];
  const adapted = adaptCellRenderer(source, undefined, dependencies);
  if (adapted === null) {
    throw new Error('此 Claude Code 依赖私有 Bun.ant.CellSegmenter，且渲染器形态未被 ClawGod 识别；'
      + '已拒绝安装，避免产生无法进入交互界面的运行时。请用 --version 安装受支持的版本。');
  }
  writeFileSync(path, adapted);
  console.log(`已用公开 Bun 字符格渲染器替换私有实现: ${path.slice(here.length + 1)}`);
}

function processCandidate() {
  const chunksDir = join(here, 'chunks');
  const split = existsSync(chunksDir);
  const chunkPaths = split
    ? readdirSync(chunksDir).filter((name) => name.endsWith('.js')).map((name) => join(chunksDir, name))
    : [];

  installPublicCellRenderer([src, ...chunkPaths]);

  if (split) {
    // ── v2.1.245+ code-split format: ESM entry + chunk graph ──────────
    // The entry point is a thin dispatcher of `import ... from "/$bunfs/root/
    // chunk-*.js"` statements. Rewrite its specifiers (chunks live one level
    // down) and rewrite every chunk (sibling specifiers) in place.
    let entry = readFileSync(src, 'utf8');
    entry = rewrite(entry, { chunkPrefix: './chunks/' });
    writeFileSync(dst, entry);
    unlinkSync(src);

    for (const path of chunkPaths) {
      const code = rewrite(readFileSync(path, 'utf8'), { chunkPrefix: './' });
      writeFileSync(path, code);
    }
    console.log(`cli.original.cjs: ${entry.length} bytes (code-split, chunks rewritten)`);
  } else {
    // ── legacy monolithic CJS bundle ──────────────────────────────────
    let code = readFileSync(src, 'utf8');

    // Strip leading @bun pragma comments (e.g. "// @bun @bytecode @bun-cjs\n")
    // Bun requires the file to start directly with "(function" to recognize
    // the CommonJS wrapper; any preceding comment breaks that detection.
    code = code.replace(/^(?:\/\/[^\n]*\n)+/, '');

    // (1) bunfs .node module paths → runtime vendor lookup
    code = code.replace(
      /require\(['"](\/\$bunfs\/root\/([\w-]+)\.node)['"]\)/g,
      (m, _full, name) =>
        `require(require('path').join(__dirname,'vendor',${JSON.stringify(name)},\`\${process.arch==='arm64'?'arm64':'x64'}-\${process.platform==='darwin'?'darwin':process.platform==='linux'?'linux':'win32'}\`,${JSON.stringify(name + '.node')}))`,
    );

    // (2) build-time fileURLToPath() leaks → use cli.cjs's own __filename
    code = code.replace(
      /[\w$]+\.fileURLToPath\("file:\/\/\/home\/runner\/work\/claude-cli-internal\/claude-cli-internal\/[^"]*"\)/g,
      () => '__filename',
    );

    // (3) make the outer (function(...){...}) actually run
    code = code.replace(/\}\)\s*$/, '})(exports, require, module, __filename, __dirname)');

    writeFileSync(dst, code);
    unlinkSync(src);
    console.log(`cli.original.cjs: ${code.length} bytes (monolithic)`);
  }
}

if (import.meta.main) processCandidate();
