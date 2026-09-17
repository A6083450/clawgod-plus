#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = new URL('../src/generic/runtime/feature-gates.cjs', import.meta.url);
assert.ok(existsSync(source), '运行时必须提供功能开关解析器');
const { loadFeatureGates } = await import(source);
const metadata = {
  teams: ['agent-teams'],
  shared: ['agent-teams', 'ultraplan'],
  classifier: ['classifier-tuning'],
};
const root = mkdtempSync(join(tmpdir(), 'clawgod-feature-gates-'));
const configFile = join(root, 'patches.json');
const warnings = [];
const load = (env = {}) => loadFeatureGates(root, metadata, env, text => warnings.push(text));
try {
  assert.deepEqual(load(), { teams: true, shared: true, classifier: true });
  assert.equal(readFileSync(configFile, 'utf8'), '{}\n', '首次启动创建稀疏配置');
  for (const [config, env, expected] of [
    ['{"agent-teams":false}', {}, { teams: false, shared: true, classifier: true }],
    ['{"agent-teams":false,"ultraplan":false}', {}, { teams: false, shared: false, classifier: true }],
    ['{"agent-teams":false}', { CLAWGOD_FEATURE_AGENT_TEAMS: 'true' }, { teams: true, shared: true, classifier: true }],
    ['{}', { CLAWGOD_FEATURE_CLASSIFIER_TUNING: 'false' }, { teams: true, shared: true, classifier: false }],
    ['{"agent-teams":false}', { CLAWGOD_FEATURE_AGENT_TEAMS: '0' }, { teams: false, shared: true, classifier: true }],
    ['{"agent-teams":"false","classifier-tuning":0}', {}, { teams: true, shared: true, classifier: true }],
    ['null', {}, { teams: true, shared: true, classifier: true }],
    ['[]', {}, { teams: true, shared: true, classifier: true }],
    ['false', {}, { teams: true, shared: true, classifier: true }],
    ['{ invalid json', {}, { teams: true, shared: true, classifier: true }],
    ['{"__proto__":{"agent-teams":false},"toString":false}', {}, { teams: true, shared: true, classifier: true }],
  ]) {
    writeFileSync(configFile, config, { mode: 0o600 });
    const before = statSync(configFile);
    assert.deepEqual(load(env), expected, `${config} / ${JSON.stringify(env)}`);
    const after = statSync(configFile);
    assert.equal(readFileSync(configFile, 'utf8'), config, '不改写用户配置，包括无效配置');
    assert.equal(after.ino, before.ino, '读取不得替换配置 inode');
    assert.equal(after.mode, before.mode, '读取不得修改配置权限');
  }
  warnings.length = 0;
  writeFileSync(configFile, '{"unknown-feature":false}');
  load();
  assert.ok(warnings.some(text => text.includes('unknown-feature')), '未知功能必须给出诊断');
  assert.equal({}['agent-teams'], undefined, '配置不得污染对象原型');
  rmSync(configFile);
  mkdirSync(configFile);
  assert.deepEqual(load(), { teams: true, shared: true, classifier: true }, '配置无法读取时保持升级前行为');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('runtime feature gate checks passed');
