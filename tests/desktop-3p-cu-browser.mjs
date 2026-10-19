#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

if (process.platform === 'win32') {
  console.log('macOS Desktop patch checks skipped on Windows');
  process.exit(0);
}

const script = readFileSync(new URL('../src/unix/desktop/restore-claude-3p-cu-browser.sh', import.meta.url), 'utf8');
const patcher = script.match(/RESULT=\$\(python3[^\n]*<<'PYEOF'\n([\s\S]*?)\nPYEOF/)[1];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mainPath = '.vite/build/main.js';
const legacy = `
var enabled={value:true},disabled={value:false};
var base={123:disabled},browser={17519066:enabled,3990395613:enabled};
function select(c){return c.builtinBrowserEnabled?browser:base}
var config={builtinBrowserEnabled:false};
function feature(v){return {defaultValue:v}}
var renderer={...config.builtinBrowserEnabled&&{4112513247:feature(!0)}};
var provider={builtinBrowserEnabled(){return false},build(){return {builtinBrowserEnabled:this.builtinBrowserEnabled()}}};
var access={dramatic_shrimp:void 0};
function ready(){return false}function Zx(){return false}
function available(){return ready()?Zx("3990395613"):!1}
globalThis.result={main:select(config),renderer,config:provider.build(),access,available:available()};
`.replaceAll('\n', '');
// The 2.42304.0 registry and selector shapes, with unrelated entries retained.
const modern = `
var rules={123:{rule:"forced",value:!1},17519066:{rule:"forcedFor",group:"builtinBrowser",value:!0},3990395613:{rule:"forcedFor",group:"builtinBrowser",value:!0}};
var webRules={4112513247:{rule:"when",condition:"builtinBrowserEnabled",value:!0}};
function feature(v){return {value:v,on:!!v,off:!v,source:"force",experiment:null,experimentResult:null}}
function collect(test){return Object.fromEntries(Object.entries(rules).filter(([,r])=>test(r)).map(([k,r])=>[k,feature(r.value)]))}
var base=collect(r=>r.rule==="forced"),browser={...base,...collect(r=>r.rule==="forcedFor"&&r.group==="builtinBrowser")};
var hostBase={...base,host:true},hostBrowser={...browser,host:true};
function select(c){return c.selfHostedSessions?c.builtinBrowserEnabled?hostBrowser:hostBase:c.builtinBrowserEnabled?browser:base}
var provider={builtinBrowserEnabled(){return false},main(){return select({builtinBrowserEnabled:this.builtinBrowserEnabled(),selfHostedSessions:false})},build(){return {builtinBrowserEnabled:this.builtinBrowserEnabled()}}};
var renderer=Object.fromEntries(Object.entries(webRules).filter(([,r])=>r.rule==="always").map(([k,r])=>[k,{defaultValue:r.value}]));
var access={dramatic_shrimp:void 0};
function ready(){return false}function hy(){return false}
function gM(){return ready()?hy("3990395613"):!1}
globalThis.result={main:provider.main(),renderer,config:provider.build(),access,available:gM(),host:select({selfHostedSessions:true,builtinBrowserEnabled:false}).host};
`.replaceAll('\n', '');

function archive(source) {
  const entries = [
    ['compile-cache/decoy.jsc', Buffer.from('17519066 builtinBrowserEnabled')],
    [mainPath, Buffer.from(source)],
    ['after.txt', Buffer.from('unchanged trailing bytes')],
  ];
  const header = { files: {} };
  let offset = 0;
  for (const [path, bytes] of entries) {
    const parts = path.split('/');
    let directory = header;
    for (const name of parts.slice(0, -1)) directory = directory.files[name] ??= { files: {} };
    const blocks = [];
    for (let start = 0; start < bytes.length; start += 64) blocks.push(sha(bytes.subarray(start, start + 64)));
    directory.files[parts.at(-1)] = { size: bytes.length, offset: String(offset), integrity: { algorithm: 'SHA256', hash: sha(bytes), blockSize: 64, blocks } };
    offset += bytes.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const padding = (4 - json.length % 4) % 4;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + json.length + padding, 4);
  prefix.writeUInt32LE(4 + json.length + padding, 8);
  prefix.writeUInt32LE(json.length, 12);
  return { bytes: Buffer.concat([prefix, json, Buffer.alloc(padding), ...entries.map(([, bytes]) => bytes)]), hash: sha(json), entries };
}

function unpack(bytes) {
  const header = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)));
  const start = 8 + bytes.readUInt32LE(4);
  const files = new Map();
  function walk(node, path = '') {
    for (const [name, entry] of Object.entries(node.files)) {
      const key = path ? `${path}/${name}` : name;
      if (entry.files) walk(entry, key);
      else {
        const content = bytes.subarray(start + Number(entry.offset), start + Number(entry.offset) + entry.size);
        assert.equal(sha(content), entry.integrity.hash, `${key} integrity`);
        for (const [index, hash] of entry.integrity.blocks.entries()) {
          assert.equal(sha(content.subarray(index * entry.integrity.blockSize, (index + 1) * entry.integrity.blockSize)), hash, `${key} block ${index}`);
        }
        files.set(key, content);
      }
    }
  }
  walk(header);
  return files;
}

const root = mkdtempSync(join(tmpdir(), 'clawgod-desktop-'));
try {
  for (const [name, source] of [['legacy', legacy], ['2.42304.0', modern], ['unsupported', 'var gate=17519066;var builtinBrowserEnabled=false;'], ['syntax-error', `${modern}function {`], ['missing-plist-hash', modern], ['wrong-plist-hash', modern]]) {
    const directory = join(root, name);
    mkdirSync(directory);
    const input = archive(source);
    const backup = join(directory, 'original.asar');
    const target = join(directory, 'app.asar');
    const plist = join(directory, 'Info.plist');
    writeFileSync(backup, input.bytes);
    writeFileSync(target, input.bytes);
    const oldHash = name === 'missing-plist-hash' ? '' : input.hash;
    const plistBefore = `<plist>${name === 'wrong-plist-hash' ? '0'.repeat(64) : oldHash}</plist>`;
    writeFileSync(plist, plistBefore);
    const patchEnv = { ...process.env, CLAWGOD_BUN_BIN: process.execPath };
    const run = () => spawnSync('python3', ['-', backup, target, directory, oldHash], { input: patcher, encoding: 'utf8', env: patchEnv });
    const result = run();
    if (['unsupported', 'syntax-error', 'missing-plist-hash', 'wrong-plist-hash'].includes(name)) {
      assert.notEqual(result.status, 0, `${name} must fail`);
      assert.deepEqual(readFileSync(target), input.bytes, `${name} must preserve the installed archive`);
      assert.equal(readFileSync(plist, 'utf8'), plistBefore, `${name} must preserve the plist`);
      continue;
    }
    assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
    const patched = readFileSync(target);
    const files = unpack(patched);
    for (const [path, bytes] of input.entries) {
      if (path !== mainPath) assert.deepEqual(files.get(path), bytes, `${name}: preserve ${path}`);
    }
    const context = {};
    runInNewContext(files.get(mainPath).toString(), context);
    const actual = context.result;
    for (const key of ['17519066', '3990395613', '4293378213', '36693946']) assert.equal(actual.main[key].value, true, `${name}: gate ${key}`);
    assert.equal(actual.main['1291166712'].value.enabled, true, `${name}: CU config`);
    assert.equal(actual.main['1291166712'].value.batchOnly, false, `${name}: interactive CU`);
    assert.equal(actual.renderer['4112513247'].defaultValue, true, `${name}: browser renderer`);
    assert.equal(actual.renderer['745998442'].defaultValue, true, `${name}: CU renderer`);
    assert.equal(actual.config.builtinBrowserEnabled, true, `${name}: renderer config`);
    assert.equal(actual.access.dramatic_shrimp, 'available', `${name}: Cowork access`);
    assert.equal(actual.available, true, `${name}: browser availability`);
    if (name === '2.42304.0') {
      assert.equal(actual.main['123'].value, false, 'preserve unrelated gates');
      assert.equal(actual.host, true, 'preserve the self-hosted selector');
    }
    assert.equal(readFileSync(plist, 'utf8'), `<plist>${sha(patched.subarray(16, 16 + patched.readUInt32LE(12)))}</plist>`);
    assert.deepEqual(readFileSync(backup), input.bytes, `${name}: preserve the original backup`);
    const rerun = spawnSync('python3', ['-', backup, target, directory, sha(patched.subarray(16, 16 + patched.readUInt32LE(12)))], { input: patcher, encoding: 'utf8', env: patchEnv });
    assert.equal(rerun.status, 0, `${name}: rerun ${rerun.stdout}\n${rerun.stderr}`);
    assert.deepEqual(readFileSync(target), patched, `${name}: repeatable patch from backup`);
    console.log(`PASS ${name}: gates, archive integrity, backup and repeatability`);
  }
  console.log('PASS unsupported input, syntax errors and missing plist hashes preserve installed files');
} finally {
  rmSync(root, { recursive: true, force: true });
}
