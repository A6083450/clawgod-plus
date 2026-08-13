#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPatcherBundle } from '../build.mjs';

const entryUrl = new URL('../src/generic/patcher/entry.mjs', import.meta.url).href;
const acornFixturePath = fileURLToPath(new URL('./fixtures/acorn-8.16.0.cjs', import.meta.url));

export function seedPatcherAcorn(rootDir) {
  const source = process.env.CLAWGOD_TEST_ACORN_SOURCE || acornFixturePath;
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
