#!/usr/bin/env bun
import { existsSync, renameSync, rmSync } from 'node:fs';

import { fetchWithProxy } from './proxy-fetch.mjs';

const [url, destination] = process.argv.slice(2);
if (!url || !destination) throw new Error('usage: fetch-file.mjs <url> <destination>');

const temporary = `${destination}.${process.pid}.tmp`;
try {
  const response = await fetchWithProxy(url);
  const writer = Bun.file(temporary).writer();
  try {
    if (response.body) {
      for await (const chunk of response.body) await writer.write(chunk);
    }
  } finally {
    await writer.end();
  }
  renameSync(temporary, destination);
} finally {
  if (existsSync(temporary)) rmSync(temporary, { force: true });
}
