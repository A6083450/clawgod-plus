#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { buildPatcherBundle } from '../build.mjs';

const entryUrl = new URL('../src/generic/patcher/entry.mjs', import.meta.url).href;
const require = createRequire(import.meta.url);

export function seedPatcherAcorn(rootDir) {
  let source = process.env.CLAWGOD_TEST_ACORN_SOURCE;
  if (!source) {
    try {
      source = require.resolve('acorn');
    } catch {
      return false;
    }
  }
  const destination = join(rootDir, 'vendor', 'acorn.cjs');
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return true;
}

export async function getPatcherSources() {
  const canonicalRunner = [
    `await import(${JSON.stringify(entryUrl)});`,
    '',
  ].join('\n');
  return [
    ['canonical module graph', canonicalRunner],
    ['generated patcher bundle', await buildPatcherBundle()],
  ];
}

if (import.meta.main) {
  const sources = await getPatcherSources();
  assert.equal(sources.length, 2);
  assert.ok(sources.every(([, source]) => source.length > 0));
  console.log('patcher test source checks passed');
}
