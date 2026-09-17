#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderTemplate } from '../build.mjs';

const root = mkdtempSync(join(tmpdir(), 'clawgod-wrapper-gates-'));
try {
  const directory = join(root, '.clawgod');
  const ripgrepBin = join(directory, 'vendor', 'ripgrep', 'bin');
  mkdirSync(ripgrepBin, { recursive: true });
  copyFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), join(directory, 'cli.cjs'));
  const helper = readFileSync(new URL('../src/generic/runtime/feature-gates.cjs', import.meta.url), 'utf8');
  writeFileSync(join(directory, 'feature-gates.cjs'), renderTemplate(helper, {
    RUNTIME_FEATURE_METADATA: JSON.stringify({ teams: ['agent-teams'] }),
  }));
  const configFile = join(directory, 'patches.json');
  const raw = '{ "agent-teams": false }\n';
  writeFileSync(configFile, raw, { mode: 0o600 });
  const before = statSync(configFile);
  writeFileSync(join(directory, 'cli.original.cjs'), 'console.log(JSON.stringify(globalThis.__clawgodPatches ?? null));');
  for (const [env, expected] of [[{}, { teams: false }], [{ CLAWGOD_FEATURE_AGENT_TEAMS: 'true' }, { teams: true }]]) {
    const result = spawnSync(process.execPath, [join(directory, 'cli.cjs'), '--version'], {
      encoding: 'utf8', timeout: 10000,
      env: { HOME: root, USERPROFILE: root, PATH: `${ripgrepBin}${delimiter}${process.env.PATH || ''}`, CLAWGOD_INTERNAL_RIPGREP_PATH_READY: ripgrepBin, ...env },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), expected, 'wrapper 必须在上游加载前应用配置与环境开关');
  }
  assert.equal(readFileSync(configFile, 'utf8'), raw);
  assert.equal(statSync(configFile).ino, before.ino);
  assert.equal(statSync(configFile).mode, before.mode);
  assert.equal(existsSync(join(root, '.claude', 'settings.json')), false, '开关无需修改 Claude 设置');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('wrapper feature gate checks passed');
