#!/usr/bin/env bun
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
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
];

// Every name the injected source introduces must be free in the target module;
// a collision would silently change unrelated rendering.
const CELL_RENDERER_NAMES = Object.freeze([
  'clawgodCacheLimit', 'clawgodOsc8Prefix', 'clawgodSgr', 'clawgodAmbiguousNarrow',
  'clawgodSegmenter', 'clawgodGraphemes', 'clawgodCsiEnd', 'clawgodOscEnd',
  'sanitizeControlSequences', 'parseStyledText', 'packCell', 'unionDamage',
  'writeCell', 'paintCells',
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
export function adaptCellRenderer(source, shape) {
  const profiles = shape ? [{ ...CELL_PLATFORM_SHAPES[0], shape }] : CELL_PLATFORM_SHAPES;
  for (const profile of profiles) {
    const adapted = adaptCellRendererShape(source, profile);
    if (adapted !== null) return adapted;
  }
  return null;
}

function adaptCellRendererShape(source, { shape, names, tabAnchor, tabReplacement, oscDeclaration = OSC8_DECLARATION }) {
  for (const name of CELL_RENDERER_NAMES) {
    if (source.includes(name)) return null;
  }
  if (!source.includes(oscDeclaration)) return null;
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
  return adapted.replace(tabAnchor, tabReplacement);
}

// 2.1.269+ 渲染器硬依赖私有 Bun.ant.CellSegmenter。公开 Bun 给不了，所以在
// 改写候选、发布到现有安装之前换成等价的 JS 实现；形态不认识就整体拒绝，
// 免得写出一个 --version 能过、交互界面却起不来的运行时。
const CELL_SEGMENTER_REFERENCE = /\bnew\s+Bun\s*\.\s*ant\s*\.\s*CellSegmenter\s*\(/;

function installPublicCellRenderer(modulePaths) {
  if (typeof globalThis.Bun?.ant?.CellSegmenter === 'function') return;
  const targets = [];
  for (const path of modulePaths) {
    const source = readFileSync(path, 'utf8');
    if (CELL_SEGMENTER_REFERENCE.test(source)) targets.push({ path, source });
  }
  if (targets.length === 0) return;
  if (targets.length > 1) {
    throw new Error(`多个分块都依赖私有 Bun.ant.CellSegmenter，形态无法确认；已拒绝安装（${targets.length} 个）。`);
  }
  const { path, source } = targets[0];
  const adapted = adaptCellRenderer(source);
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
