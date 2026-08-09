#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UTF8_FLAG = 0x0800;
const STORED_METHOD = 0;
const DOS_TIME = 0;
const DOS_DATE = 33;

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localHeader(name, data, checksum) {
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(STORED_METHOD, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  name.copy(header, 30);
  return header;
}

function centralHeader(name, data, checksum, localOffset) {
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(STORED_METHOD, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(localOffset, 42);
  name.copy(header, 46);
  return header;
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const local = localHeader(name, data, checksum);
    localParts.push(local, data);
    centralParts.push(centralHeader(name, data, checksum, localOffset));
    localOffset += local.length + data.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

export async function writeStoredZip(output, entries) {
  await Bun.write(output, buildStoredZip(entries));
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const archives = [
  {
    output: join(root, 'apply-claude-code-chrome-fix.zip'),
    sources: ['apply-claude-code-chrome-fix.ps1', 'apply-claude-code-chrome-fix.sh'],
  },
  {
    output: join(root, 'apply-claude-code-computer-use-fix.zip'),
    sources: ['apply-claude-code-computer-use-fix.sh'],
  },
];

async function archiveEntries(sources) {
  return Promise.all(sources.map(async name => ({ name, data: await Bun.file(join(root, name)).bytes() })));
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const unknown = process.argv.slice(2).filter(argument => argument !== '--check');
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);

  let stale = false;
  for (const archive of archives) {
    const entries = await archiveEntries(archive.sources);
    const expected = buildStoredZip(entries);
    if (checkOnly) {
      let current;
      try {
        current = readFileSync(archive.output);
      } catch {
        current = Buffer.alloc(0);
      }
      if (!current.equals(expected)) {
        console.error(`${archive.output} is out of date`);
        stale = true;
      }
    } else {
      await writeStoredZip(archive.output, entries);
      console.log(`wrote ${archive.output}`);
    }
  }
  if (stale) process.exit(1);
}

if (import.meta.main) await main();
