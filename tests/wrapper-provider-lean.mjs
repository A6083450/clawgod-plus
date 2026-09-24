#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'clawgod-provider-lean-'));
let sequence = 0;
function run({ config = {}, env = {}, settings = {}, flags = [], args = [] } = {}) {
  const home = join(root, String(sequence++)), directory = join(home, '.clawgod');
  const bin = join(directory, 'vendor/ripgrep/bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(home, '.claude'));
  const settingsFile = join(home, '.claude/settings.json');
  writeFileSync(settingsFile, JSON.stringify(settings));
  if (config !== null) writeFileSync(join(directory, 'provider.json'), JSON.stringify(config));
  for (const flag of flags) writeFileSync(join(directory, flag), '');
  copyFileSync(new URL('../src/generic/runtime/wrapper.cjs', import.meta.url), join(directory, 'cli.cjs'));
  writeFileSync(join(directory, 'openai-proxy.cjs'), `exports.startProxy=config=>{globalThis.proxyConfig=config;return {port:12345,stop(){}}};`);
  writeFileSync(join(directory, 'cli.original.cjs'), 'console.log(JSON.stringify({env:process.env,proxy:globalThis.proxyConfig}));');
  const result = spawnSync(process.execPath, [join(directory, 'cli.cjs'), ...args], {
    encoding: 'utf8', timeout: 10000,
    env: { HOME: home, USERPROFILE: home, PATH: `${bin}${delimiter}${process.env.PATH || ''}`, CLAWGOD_INTERNAL_RIPGREP_PATH_READY: bin, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return { ...(result.stdout.trim() ? JSON.parse(result.stdout) : {}), settings: JSON.parse(readFileSync(settingsFile)),
    config: JSON.parse(readFileSync(join(directory, 'provider.json'))),
    off: existsSync(join(directory, '.lean-disabled')), max: existsSync(join(directory, '.lean-max')) };
}
const custom = { apiKey: 'provider-key', baseURL: 'https://gateway.example.test', effort: 'high' };
try {
  assert.equal(run({ config: null }).config.effort, '', 'new provider config includes effort');
  for (const mem of [false, true]) {
    for (const token of [undefined, '', '   ', ' env-token ']) {
      const result = run({ config: custom, env: { ...(mem ? { CLAWGOD_CLAUDE_MEM: '1' } : {}), ANTHROPIC_API_KEY: 'stale-key', ...(token === undefined ? {} : { ANTHROPIC_AUTH_TOKEN: token }) } });
      assert.equal(result.env.ANTHROPIC_API_KEY, undefined, 'custom providers must not send both auth headers (including claude-mem)');
      assert.equal(result.env.ANTHROPIC_AUTH_TOKEN, token?.trim() || 'provider-key');
      assert.equal(result.env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
    }
    const official = run({ config: { apiKey: 'official-key' }, env: { ANTHROPIC_AUTH_TOKEN: 'stale-token', ...(mem ? { CLAWGOD_CLAUDE_MEM: '1' } : {}) } });
    assert.equal(official.env.ANTHROPIC_API_KEY, 'official-key');
    assert.equal(official.env.ANTHROPIC_AUTH_TOKEN, undefined);
    for (const type of ['grok', 'openai-compat']) {
      const result = run({ config: { ...custom, type, timeoutMs: 12345 }, env: { CLAUDE_CODE_EFFORT_LEVEL: 'max', ...(mem ? { CLAWGOD_CLAUDE_MEM: '1' } : {}) }, settings: { env: { ANTHROPIC_API_KEY: 'settings-key', ANTHROPIC_AUTH_TOKEN: 'settings-token', ANTHROPIC_BASE_URL: 'https://must-not-replace-proxy.test' } } });
      assert.equal(result.env.ANTHROPIC_API_KEY, undefined);
      assert.equal(result.env.ANTHROPIC_AUTH_TOKEN, 'proxy-passthrough');
      assert.equal(result.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:12345');
      assert.equal(result.proxy.effort, 'max');
      assert.equal(result.env.API_TIMEOUT_MS, '12345');
      assert.equal(result.env.CLAUDE_CODE_EFFORT_LEVEL, 'max');
      const fallback = run({ config: { ...custom, type }, env: mem ? { CLAWGOD_CLAUDE_MEM: '1' } : {} });
      assert.equal(fallback.proxy.effort, 'high');
      assert.equal(fallback.env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
    }
  }
  assert.equal(run({ config: {}, env: { ANTHROPIC_AUTH_TOKEN: 'oauth-token' } }).env.ANTHROPIC_AUTH_TOKEN, 'oauth-token', 'no provider key preserves OAuth');
  assert.equal(run({ config: custom, env: { CLAUDE_CODE_EFFORT_LEVEL: 'low', API_TIMEOUT_MS: '5678' } }).env.API_TIMEOUT_MS, '5678');

  const settings = { disableRemoteControl: true, disableBundledSkills: true, permissions: { deny: ['Bash(custom)', 'EnterPlanMode'] }, unrelated: 'preserve' };
  for (const config of [{}, custom]) {
    for (const flags of [[], ['.lean-disabled'], ['.lean-max'], ['.lean-max', '.lean-disabled']]) {
      const max = flags.includes('.lean-max') && !flags.includes('.lean-disabled');
      const result = run({ config, settings, flags });
      assert.equal(result.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, max ? '1' : undefined);
      assert.deepEqual(result.settings, settings, 'startup must not silently undo user or max-mode Remote Control settings');
      for (const value of ['0', '1']) assert.equal(run({ config, flags, env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: value } }).env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, value);
    }
    for (const mode of ['on', 'off', 'max']) {
      const result = run({ config, settings, flags: ['.lean-max'], args: [`--lean-${mode}`] });
      assert.equal(result.settings.disableRemoteControl, mode === 'max' ? true : undefined);
      assert.equal(result.settings.disableBundledSkills, mode === 'max' ? true : undefined);
      assert.equal(result.settings.unrelated, 'preserve');
      assert.ok(result.settings.permissions.deny.includes('Bash(custom)'));
      assert.equal(result.settings.permissions.deny.includes('EnterPlanMode'), mode === 'max');
      assert.equal(result.off, mode === 'off');
      assert.equal(result.max, mode === 'max');
    }
  }
  // Exercise the exact embedded installer JS without running a real installer.
  for (const platform of ['unix', 'windows']) {
    const source = readFileSync(new URL(`../src/template/install.${platform === 'unix' ? 'sh' : 'ps1'}`, import.meta.url), 'utf8');
    const code = platform === 'unix' ? source.match(/"\$BUN_BIN" -e '\n(const fs = require\("fs"\);\nconst settingsPath[\s\S]*?)\n' "\$CLAUDE_SETTINGS" "\$LEAN_IS_MAX"/)?.[1]
      : source.match(/\$leanApplyScript = @'\n([\s\S]*?)\n'@/)?.[1];
    assert.ok(code, `${platform} lean installer body`);
    const script = join(root, `lean-${platform}.mjs`), target = join(root, `settings-${platform}.json`);
    writeFileSync(script, code);
    for (const isMax of ['true', 'True', 'false', 'False']) {
      writeFileSync(target, JSON.stringify(settings));
      const result = spawnSync(process.execPath, platform === 'unix' ? ['-e', code, target, isMax] : [script, target, isMax], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const saved = JSON.parse(readFileSync(target));
      assert.equal(saved.disableRemoteControl, isMax.toLowerCase() === 'true' ? true : undefined, `${platform} ${isMax}: Remote Control`);
      assert.equal(saved.permissions.deny.includes('EnterPlanMode'), isMax.toLowerCase() === 'true');
      assert.ok(saved.permissions.deny.includes('Bash(custom)'));
      assert.equal(saved.unrelated, 'preserve');
    }
    const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const hasPowerShell = platform === 'windows' && !spawnSync(powershell, ['-NoLogo', '-NoProfile', '-Command', 'exit 0'], { timeout: 10000 }).error;
    if (platform === 'windows' && process.platform === 'win32') assert.ok(hasPowerShell, 'Windows requires native PowerShell regression');
    if (hasPowerShell) {
      // Execute the actual PowerShell heredoc + Bun invocation, including the
      // native boolean-to-string conversion. Never point it at the real HOME.
      const nativeBody = source.match(/(\$leanApplyScript = @'[\s\S]*?\n    \} catch \{\})/)?.[1];
      assert.ok(nativeBody);
      const nativeFile = join(root, 'lean-native.ps1');
      writeFileSync(nativeFile, `param([string]$BunBin,[string]$ClawDir,[string]$claudeSettings,[switch]$Max)\n$ErrorActionPreference='Stop'\n$leanIsMax=[bool]$Max\nfunction Write-OK($message) {}\n${nativeBody}\n`);
      for (const max of [true, false]) {
        writeFileSync(target, JSON.stringify(settings));
        const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', nativeFile,
          '-BunBin', process.execPath, '-ClawDir', root, '-claudeSettings', target, ...(max ? ['-Max'] : [])], { encoding: 'utf8', timeout: 20000 });
        assert.equal(result.status, 0, result.stderr);
        const saved = JSON.parse(readFileSync(target));
        assert.equal(saved.disableRemoteControl, max ? true : undefined, 'native PowerShell Lean boolean');
        assert.ok(saved.permissions.deny.includes('DesignSync'), 'native PowerShell actually invoked Bun');
        assert.equal(saved.permissions.deny.includes('EnterPlanMode'), max);
        assert.equal(saved.unrelated, 'preserve');
      }
    }
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('Provider auth, proxy effort, Lean runtime and embedded installer checks passed (isolated HOME).');
