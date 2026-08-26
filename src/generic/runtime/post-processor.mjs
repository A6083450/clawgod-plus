#!/usr/bin/env bun
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
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
  code = code.replace(
    new RegExp(`${BUNFS}chunk-([a-z0-9]+)\\.js`, 'g'),
    `${chunkPrefix}chunk-$1.js`,
  );
  // (2) native .node module path (string arg to import.meta.require) → vendor.
  code = code.replace(
    new RegExp(`${BUNFS}([\\w-]+)\\.node`, 'g'),
    (m, name) => `${clawgodDir}/vendor/${name}/${archOs}/${name}.node`,
  );
  // (3) loader=file assets (design-canvas payload, chart/hljs/mermaid) → assets/.
  code = code.replace(
    new RegExp(`${BUNFS}([A-Za-z0-9_.-]+\\.(?:asset|min\\.js))`, 'g'),
    (m, name) => `${clawgodDir}/assets/${name}`,
  );
  // (4) plugin function-hooks worker URL → local worker file.
  code = code.replace(
    new RegExp(`${BUNFS}src/plugins/functionHooks/hooks-worker/hooks-worker\\.js`, 'g'),
    `${clawgodDir}/chunks/hooks-worker.js`,
  );
  return code;
}

const chunksDir = join(here, 'chunks');

if (existsSync(chunksDir)) {
  // ── v2.1.245+ code-split format: ESM entry + chunk graph ──────────
  // The entry point is a thin dispatcher of `import ... from "/$bunfs/root/
  // chunk-*.js"` statements. Rewrite its specifiers (chunks live one level
  // down) and rewrite every chunk (sibling specifiers) in place.
  let entry = readFileSync(src, 'utf8');
  entry = rewrite(entry, { chunkPrefix: './chunks/' });
  writeFileSync(dst, entry);
  unlinkSync(src);

  for (const name of readdirSync(chunksDir)) {
    if (!name.endsWith('.js')) continue;
    const path = join(chunksDir, name);
    let code = readFileSync(path, 'utf8');
    code = rewrite(code, { chunkPrefix: './' });
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
