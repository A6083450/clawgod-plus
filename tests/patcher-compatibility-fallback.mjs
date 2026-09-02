#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const staleResolver = 'function WE(){return Bun.isStandaloneExecutable===!0}function W1t(){if(WE())return{cmd:process.execPath,prefixArgs:[]};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[t],env:{}}}';
const chunkSource = 'const chunkMustRemainByteIdentical = true;\n';

function createFixture(patcherSource, label, { targetSource = staleResolver, configSource } = {}) {
  const root = mkdtempSync(join(tmpdir(), `clawgod-patcher-compatibility-${label}-`));
  const target = join(root, 'cli.original.cjs');
  const chunks = join(root, 'chunks');
  const home = join(root, 'home');
  const clawgod = join(home, '.clawgod');
  const enhancementsFile = join(clawgod, 'enhancements.json');
  try {
    seedPatcherAcorn(root);
    writeFileSync(join(root, 'patch.mjs'), patcherSource, 'utf8');
    if (targetSource !== null) writeFileSync(target, targetSource, 'utf8');
    mkdirSync(chunks);
    writeFileSync(join(chunks, 'chunk.js'), chunkSource, 'utf8');
    mkdirSync(clawgod, { recursive: true, mode: 0o700 });
    if (configSource !== undefined) writeFileSync(enhancementsFile, configSource, { mode: 0o600 });
    return { root, target, chunks, enhancementsFile, original: targetSource };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function runPatcher(fixture, args) {
  const run = spawnSync(process.execPath, ['patch.mjs', ...args], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: { ...process.env, HOME: join(fixture.root, 'home') },
  });
  return { run, output: `${run.stdout}${run.stderr}` };
}

const cases = [
  { args: [], expected: 1 },
  { args: ['--allow-compatibility-fallback'], expected: 42 },
  { args: ['--dry-run', '--allow-compatibility-fallback'], expected: 1 },
  { args: ['--verify', '--allow-compatibility-fallback'], expected: 1 },
];

for (const [name, patcherSource] of await getPatcherSources()) {
  for (const { args, expected } of cases) {
    const fixture = createFixture(patcherSource, `${name}-${args.join('-') || 'strict'}`);
    try {
      const { run, output } = runPatcher(fixture, args);
      assert.equal(run.status, expected, `${name} ${args.join(' ') || 'strict'}: ${output}`);
      assert.match(output, /Result: \d+ applied, \d+ skipped, 1 failed/);
      assert.equal(readFileSync(fixture.target, 'utf8'), fixture.original);
      assert.equal(readFileSync(join(fixture.chunks, 'chunk.js'), 'utf8'), chunkSource);
      assert.equal(existsSync(`${fixture.target}.bak`), false);
      assert.equal(existsSync(join(fixture.root, 'chunks.bak')), false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  {
    const fixture = createFixture(patcherSource, `${name}-malformed-config`, { configSource: '{\n' });
    try {
      const { run } = runPatcher(fixture, [
        '--allow-compatibility-fallback',
        '--enhancements-file',
        fixture.enhancementsFile,
      ]);
      assert.notEqual(run.status, 0, `${name}: malformed canonical config must fail`);
      assert.notEqual(run.status, 42, `${name}: malformed canonical config must not use compatibility fallback`);
      assert.equal(readFileSync(fixture.target, 'utf8'), fixture.original);
      assert.equal(existsSync(`${fixture.target}.bak`), false);
      assert.equal(existsSync(join(fixture.root, 'chunks.bak')), false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  {
    const fixture = createFixture(patcherSource, `${name}-missing-target`, { targetSource: null });
    try {
      const { run } = runPatcher(fixture, ['--allow-compatibility-fallback']);
      assert.notEqual(run.status, 0, `${name}: missing target must fail`);
      assert.notEqual(run.status, 42, `${name}: missing target must not use compatibility fallback`);
      assert.equal(existsSync(`${fixture.target}.bak`), false);
      assert.equal(existsSync(join(fixture.root, 'chunks.bak')), false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
}

console.log('patcher compatibility fallback checks passed');
