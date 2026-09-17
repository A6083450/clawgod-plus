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
          if (text.charAt(eightBit) === "m") {
            out += String.fromCharCode(27) + "[" + text.slice(index + 1, eightBit + 1);
          }
          index = eightBit;
        }
        continue;
      }
      var next = text.charAt(index + 1);
      if (next === "[") {
        var csi = clawgodCsiEnd(text, index + 2);
        if (csi >= 0) {
          if (text.charAt(csi) === "m") out += text.slice(index, csi + 1);
          index = csi;
        }
        continue;
      }
      if (next === "]") {
        var osc = clawgodOscEnd(text, index + 2);
        if (osc >= 0) {
          var body = text.slice(index + 2, osc);
          if (body.slice(0, 2) === "8;") {
            var payload = body.slice(2);
            var uri = payload.slice(payload.indexOf(";") + 1);
            out += uri === ""
              ? clawgodOsc8Prefix + String.fromCharCode(7)
              : clawgodOsc8Prefix + uri + String.fromCharCode(7);
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
const CELL_SEGMENTER_BINDINGS = Object.freeze(['hht', 'C8', 'MNr', 'LNr']);
const OSC8_DECLARATION = 'var Ss="\\x1B]8;;"';

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
 * Returns null when the module is not the known 2.1.274 shape, so the caller
 * can refuse the candidate instead of installing a runtime that cannot start.
 * `shape` is a parameter so the guard rails around the rewrite can be
 * exercised offline; production callers always use the frozen table.
 */
export function adaptCellRenderer(source, shape = CELL_SEGMENTER_SHAPE) {
  for (const name of CELL_RENDERER_NAMES) {
    if (source.includes(name)) return null;
  }
  if (!source.includes(OSC8_DECLARATION)) return null;
  for (const binding of CELL_SEGMENTER_BINDINGS) {
    if (!new RegExp(`import\\{[^}]*\\b${binding}\\b[^}]*\\}from`).test(source)) return null;
  }
  if (source.split(TAB_CLIP_ANCHOR).length !== 2) return null;
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
    adapted = adapted.slice(0, span.start) + text + adapted.slice(span.end);
  }
  return adapted.replace(TAB_CLIP_ANCHOR, TAB_CLIP_REPLACEMENT);
}

// 2.1.269+ 渲染器硬依赖私有 Bun.ant.CellSegmenter。公开 Bun 给不了，所以在
// 改写候选、发布到现有安装之前换成等价的 JS 实现；形态不认识就整体拒绝，
// 免得写出一个 --version 能过、交互界面却起不来的运行时。
const CELL_SEGMENTER_REFERENCE = /\bnew\s+Bun\s*\.\s*ant\s*\.\s*CellSegmenter\s*\(/;

function installPublicCellRenderer(modulePaths) {
  if (typeof globalThis.Bun?.ant?.CellSegmenter === 'function') return;
  const targets = modulePaths.filter((path) => CELL_SEGMENTER_REFERENCE.test(readFileSync(path, 'utf8')));
  if (targets.length === 0) return;
  if (targets.length > 1) {
    throw new Error(`多个分块都依赖私有 Bun.ant.CellSegmenter，形态无法确认；已拒绝安装（${targets.length} 个）。`);
  }
  const adapted = adaptCellRenderer(readFileSync(targets[0], 'utf8'));
  if (adapted === null) {
    throw new Error('此 Claude Code 依赖私有 Bun.ant.CellSegmenter，且渲染器形态未被 ClawGod 识别；'
      + '已拒绝安装，避免产生无法进入交互界面的运行时。请用 --version 安装受支持的版本。');
  }
  writeFileSync(targets[0], adapted);
  console.log(`已用公开 Bun 字符格渲染器替换私有实现: ${targets[0].slice(here.length + 1)}`);
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
