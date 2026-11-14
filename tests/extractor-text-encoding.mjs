#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extractor = fileURLToPath(new URL('../src/generic/runtime/extractor.mjs', import.meta.url));
const entry = { name: 'entry.js', content: Buffer.from('globalThis.fixture = true;'), loader: 1, encoding: 0 };

// 最小 PE 夹具保留 Bun 的 52 字节模块记录和 encoding/loader 字段偏移。
function peBunFixture(modules) {
  const data = [];
  const records = [];
  let cursor = 0;
  for (const module of modules) {
    const name = Buffer.from(module.name);
    const nameOffset = cursor;
    data.push(name, module.content);
    cursor += name.length + module.content.length;
    const record = Buffer.alloc(52);
    record.writeUInt32LE(nameOffset, 0);
    record.writeUInt32LE(name.length, 4);
    record.writeUInt32LE(nameOffset + name.length, 8);
    record.writeUInt32LE(module.content.length, 12);
    record.writeUInt8(module.encoding, 48);
    record.writeUInt8(module.loader, 49);
    records.push(record);
  }
  const table = Buffer.concat(records);
  const offsets = Buffer.alloc(32);
  offsets.writeUInt32LE(cursor, 8);
  offsets.writeUInt32LE(table.length, 12);
  const payload = Buffer.concat([...data, table, offsets, Buffer.from('\n---- Bun! ----\n')]);
  const section = Buffer.alloc(8 + payload.length);
  section.writeBigUInt64LE(BigInt(payload.length), 0);
  payload.copy(section, 8);

  const peOffset = 0x80;
  const optionalHeaderSize = 0x20;
  const sectionTable = peOffset + 0x18 + optionalHeaderSize;
  const rawOffset = 0x200;
  const binary = Buffer.alloc(rawOffset + section.length);
  binary.write('MZ', 0, 'ascii');
  binary.writeUInt32LE(peOffset, 0x3c);
  binary.write('PE\0\0', peOffset, 'ascii');
  binary.writeUInt16LE(0x8664, peOffset + 0x04);
  binary.writeUInt16LE(1, peOffset + 0x06);
  binary.writeUInt16LE(optionalHeaderSize, peOffset + 0x14);
  binary.writeUInt16LE(0x20b, peOffset + 0x18);
  binary.write('.bun', sectionTable, 'ascii');
  binary.writeUInt32LE(section.length, sectionTable + 0x10);
  binary.writeUInt32LE(rawOffset, sectionTable + 0x14);
  section.copy(binary, rawOffset);
  return binary;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'clawgod-extractor-encoding-'));

function extract(modules) {
  const root = mkdtempSync(join(fixtureRoot, 'case-'));
  const binary = join(root, 'fixture.exe');
  const output = join(root, 'output');
  writeFileSync(binary, peBunFixture(modules));
  const run = spawnSync(process.execPath, [extractor, binary, output], { encoding: 'utf8' });
  return { run, output };
}

try {
  for (const { label, module, outputPath, expected } of [
    { label: 'UTF-16LE 入口', module: { ...entry, content: Buffer.from('globalThis.fixture = "中文😀";', 'utf16le'), encoding: 2 }, outputPath: 'cli.original.js', expected: 'globalThis.fixture = "中文😀";' },
    { label: 'UTF-16LE JS chunk', module: { name: 'chunk.js', content: Buffer.from('export const value = "中文😀";', 'utf16le'), loader: 1, encoding: 2 }, outputPath: 'chunks/chunk.js', expected: 'export const value = "中文😀";' },
    { label: 'UTF-16LE 文本资源', module: { name: 'team.prelude.ts.asset', content: Buffer.from('globalThis.team = "中文😀";', 'utf16le'), loader: 13, encoding: 2 }, outputPath: 'assets/team.prelude.ts.asset', expected: 'globalThis.team = "中文😀";' },
    { label: 'Latin-1 JS chunk', module: { name: 'latin.js', content: Buffer.from('export const value = "é";', 'latin1'), loader: 1, encoding: 1 }, outputPath: 'chunks/latin.js', expected: 'export const value = "é";' },
    { label: 'Latin-1 文本资源', module: { name: 'latin.asset', content: Buffer.from('café', 'latin1'), loader: 13, encoding: 1 }, outputPath: 'assets/latin.asset', expected: 'café' },
    { label: 'Binary 编码旧版 JS', module: { ...entry, content: Buffer.from('globalThis.fixture = "中文é";') }, outputPath: 'cli.original.js', expected: 'globalThis.fixture = "中文é";' },
    { label: 'Binary 编码旧版文本', module: { name: 'legacy.asset', content: Buffer.from('中文é'), loader: 13, encoding: 0 }, outputPath: 'assets/legacy.asset', expected: '中文é' },
    { label: '空 UTF-16LE 文本', module: { name: 'empty.asset', content: Buffer.alloc(0), loader: 13, encoding: 2 }, outputPath: 'assets/empty.asset', expected: '' },
  ]) {
    const modules = module.name === 'entry.js' ? [module] : [entry, module];
    const { run, output } = extract(modules);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readFileSync(join(output, outputPath)), Buffer.from(expected), `${label}不得保留原字符串编码`);
    if (outputPath === 'cli.original.js') assert.doesNotThrow(() => new Function(readFileSync(join(output, outputPath), 'utf8')));
  }

  {
    const bytes = Buffer.from([0x00, 0xff, 0x80, 0x00, 0x42]);
    const compressed = Buffer.from([0x1f, 0x8b, 0x00, 0xff, 0x80]);
    const { run, output } = extract([
      entry,
      { name: 'payload.asset', content: bytes, loader: 5, encoding: 2 },
      { name: 'native/image.node', content: bytes, loader: 10, encoding: 2 },
      { name: 'opaque.asset', content: bytes, loader: 9, encoding: 255 },
      { name: 'shell.gz', content: compressed, loader: 5, encoding: 0 },
    ]);
    assert.equal(run.status, 0, run.stderr);
    for (const path of ['assets/payload.asset', 'vendor/image/x64-win32/image.node', 'assets/opaque.asset']) {
      assert.deepEqual(readFileSync(join(output, path)), bytes, `${path}不得按字符串转码`);
    }
    assert.deepEqual(readFileSync(join(output, 'assets/shell.gz')), compressed);
  }

  for (const loader of [1, 13]) {
    for (const { label, content, encoding, error } of [
      { label: '奇数字节 UTF-16LE', content: Buffer.from([0x41, 0x00, 0x42]), encoding: 2, error: /UTF-16.*(?:odd|even)|(?:odd|even).*UTF-16/i },
      { label: '未知字符串编码', content: Buffer.from('valid ascii'), encoding: 255, error: /(?:unknown|unsupported).*encoding.*255/i },
    ]) {
      const module = { name: loader === 1 ? 'entry.js' : 'invalid.asset', content, encoding, loader };
      const { run, output } = extract(loader === 1 ? [module] : [entry, module]);
      assert.notEqual(run.status, 0, `${label}应明确报错而非静默输出乱码`);
      assert.match(run.stderr, error);
      assert.equal(existsSync(output), false, '模块解析失败不应写出部分运行时');
    }
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
console.log('extractor text encoding checks passed');
