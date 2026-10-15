#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'clawgod-wrapper-protocol-'));
let sequence = 0;
function run(config, args = [], extraEnv = {}) {
  const home = join(root, String(sequence++)), dir = join(home, '.clawgod');
  const bin = join(dir, 'vendor/ripgrep/bin');
  mkdirSync(bin, { recursive: true });
  copyFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), join(dir, 'cli.cjs'));
  if (config !== null) writeFileSync(join(dir, 'provider.json'), JSON.stringify(config));
  writeFileSync(join(dir, '.claude.json'), '{"migration":"must-stay"}');
  writeFileSync(join(dir, '.clawgod-version'), '1.0.0');
  writeFileSync(join(dir, 'openai-proxy.cjs'), 'exports.startProxy=c=>{globalThis.proxyConfig=c;return {port:12345,stop(){}}};');
  writeFileSync(join(dir, 'feature-gates.cjs'), 'exports.loadFeatureGates=()=>{require("fs").writeFileSync(__dirname+"/patches.json","{}");return {}};');
  writeFileSync(join(dir, 'preload.cjs'), 'globalThis.fetch=()=>{require("fs").writeFileSync(__dirname+"/fetch-attempt","1");throw Error("unexpected external fetch")};');
  writeFileSync(join(dir, 'cli.original.cjs'), 'console.log(JSON.stringify({proxy:globalThis.proxyConfig,env:process.env}));');
  const result = spawnSync(process.execPath, ['--preload', join(dir, 'preload.cjs'), join(dir, 'cli.cjs'), ...args], {
    encoding: 'utf8', timeout: 5000,
    env: { HOME: home, USERPROFILE: home, PATH: `${bin}${delimiter}${process.env.PATH || ''}`, CLAWGOD_INTERNAL_RIPGREP_PATH_READY: bin, ...extraEnv },
  });
  return { ...result, home, dir, value: result.status === 0 ? JSON.parse(result.stdout) : null };
}
try {
  for (const args of [['--version'], ['-v']]) {
    for (const config of [null, { protocol: 'unsupported', type: 'grok' }, { protocol: 'openai-chat', apiKey: 'key', baseURL: 'https://example.test/v1' }]) {
      const result = run(config, args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.value.proxy, undefined, '独立版本查询不能启动 provider 代理');
      assert.equal(existsSync(join(result.dir, 'patches.json')), false, '独立版本查询不创建运行时配置');
      assert.equal(existsSync(join(result.home, '.claude.json')), false, '独立版本查询不迁移配置');
      assert.equal(existsSync(join(result.dir, '.update-check')), false, '独立版本查询不写更新缓存');
      assert.equal(existsSync(join(result.dir, 'fetch-attempt')), false, '独立版本查询不能发起网络请求，即使错误被捕获');
      assert.equal(existsSync(join(result.dir, 'provider.json')), config !== null, '独立版本查询不创建 provider.json');
    }
  }
  for (const config of [
    { protocol: 'openai-chat', apiKey: 'key', baseURL: 'https://example.test/v1', timeoutMs: 1234 },
    { type: 'openai-compat', apiKey: 'key', baseURL: 'https://example.test/v1', timeoutMs: 1234 },
  ]) {
    const result = run(config);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.value.proxy.apiKey, 'key');
    assert.equal(result.value.proxy.timeoutMs, 1234);
    assert.equal(result.value.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:12345');
    assert.equal(result.value.env.DISABLE_AUTOUPDATER, '1');
    assert.equal(readFileSync(join(result.home, '.claude.json'), 'utf8'), '{"migration":"must-stay"}');
  }
  const direct = run({ protocol: 'anthropic', type: 'openai-compat', apiKey: 'direct', baseURL: 'https://example.test' });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.value.proxy, undefined, '显式 anthropic 覆盖旧 type');
  assert.equal(direct.value.env.ANTHROPIC_AUTH_TOKEN, 'direct');
  assert.equal(direct.value.env.DISABLE_AUTOUPDATER, '1');
  for (const config of [
    { protocol: 'auto' },
    { protocol: 'responses' },
    { protocol: 'openai-chat', apiKey: 'key' },
    { protocol: 'openai-chat', apiKey: 'key', baseURL: 'https://api.anthropic.com' },
    { protocol: 'openai-chat', baseURL: 'https://example.test/v1' },
  ]) {
    const result = run(config);
    assert.notEqual(result.status, 0, '非法协议/不完整 Chat Completions 配置必须失败，不能静默转发至 Anthropic');
    assert.match(result.stderr, /protocol|baseURL|API key/);
  }
  const envTimeout = run({ protocol: 'openai-chat', apiKey: 'key', baseURL: 'https://example.test/v1', timeoutMs: 1234 }, [], { API_TIMEOUT_MS: '5678' });
  assert.equal(envTimeout.value.proxy.timeoutMs, '5678', '显式环境超时优先');
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('Wrapper protocol and offline version checks passed (isolated HOME).');
