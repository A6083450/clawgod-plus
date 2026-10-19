#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { renderGeneratedPair } from '../build.mjs';

if (process.platform === 'win32') {
  console.log('macOS Desktop installer checks skipped on Windows');
  process.exit(0);
}

const generated = (await renderGeneratedPair()).find(pair => pair.output === 'dist/unix/install.sh').content;
const start = generated.indexOf('run_claude_desktop_enhancement() {');
const end = generated.indexOf('\n# ─── Check PATH', start);
assert.ok(start >= 0 && end > start, 'generated installer must include the optional Desktop hook');
const hook = generated.slice(start, end);
const helperName = 'restore-claude-3p-cu-browser.sh';
const helperSource = readFileSync(new URL(`../src/unix/desktop/${helperName}`, import.meta.url), 'utf8');
const languageSource = readFileSync(new URL('../src/unix/desktop/desktop-language.mjs', import.meta.url), 'utf8');
const catalogSource = readFileSync(new URL('../src/unix/desktop/desktop-zh-Hans.json', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = mkdtempSync(join(tmpdir(), 'clawgod desktop installer '));
function executable(path, source) {
  writeFileSync(path, `#!/bin/sh\n${source}\n`);
  chmodSync(path, 0o755);
}
try {
  for (const [name, options] of [
    ['absent', {}],
    ['linux', { platform: 'Linux', installed: true }],
    ['disabled', { installed: true, enabled: [] }],
    ['present', { installed: true }],
    ['user-app', { userApp: true }],
    ['failed', { installed: true, status: 7 }],
    ['invalid-selection', { installed: true, invalid: true }],
  ]) {
    const directory = join(root, name);
    const home = join(directory, 'home');
    const runtime = join(home, '.clawgod');
    const bin = join(directory, 'bin');
    mkdirSync(runtime, { recursive: true, mode: 0o700 });
    mkdirSync(bin);
    const systemApp = join(directory, 'Applications/Claude.app');
    const userApp = join(home, 'Applications/Claude.app');
    const app = options.userApp ? userApp : systemApp;
    if (options.installed || options.userApp) {
      mkdirSync(join(app, 'Contents/Resources'), { recursive: true });
      writeFileSync(join(app, 'Contents/Resources/app.asar'), 'original app');
    }
    copyFileSync(new URL('../src/generic/enhancement-config.mjs', import.meta.url), join(runtime, 'enhancement-config.mjs'));
    copyFileSync(new URL('../src/generic/enhancements.json', import.meta.url), join(runtime, 'enhancement-manifest.json'));
    const selection = options.enabled ? { schemaVersion: 1, mode: 'custom', enabled: options.enabled } : { schemaVersion: 1, mode: 'all', enabled: [] };
    writeFileSync(join(runtime, 'enhancements.json'), options.invalid ? 'invalid JSON' : `${JSON.stringify(selection, null, 2)}\n`, { mode: 0o600 });
    executable(join(bin, 'uname'), `printf '%s\\n' '${options.platform || 'Darwin'}'`);
    // Only the macOS mutation boundary is replaced; selection and installer shell are real.
    executable(join(bin, 'bash'), 'printf "%s\\n" "$@" > "$DESKTOP_CALL"\nexit "${DESKTOP_STATUS:-0}"');
    const fixture = join(directory, 'installer-hook.sh');
    writeFileSync(fixture, `set -e\ninfo() { echo "INFO:$*"; }\nwarn() { echo "WARN:$*"; }\ndim() { echo "DIM:$*"; }\n${hook.replace('for candidate in "/Applications/Claude.app"', 'for candidate in "$DESKTOP_SYSTEM_APP"')}\necho CORE_INSTALL_CONTINUES\n`);
    const call = join(directory, 'desktop-call');
    const result = spawnSync('/bin/bash', [fixture], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, CLAWGOD_DIR: runtime, BUN_BIN: process.execPath, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, DESKTOP_SYSTEM_APP: systemApp, DESKTOP_CALL: call, DESKTOP_STATUS: String(options.status || 0) },
    });
    assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /CORE_INSTALL_CONTINUES/, `${name}: optional Desktop work must not abort the CLI install`);
    const shouldRun = ['present', 'user-app', 'failed'].includes(name);
    assert.equal(existsSync(call), shouldRun, `${name}: run Desktop patch only when installed and selected on macOS`);
    assert.equal(existsSync(join(runtime, helperName)), shouldRun, `${name}: no helper is installed when Desktop work is skipped`);
    assert.equal(existsSync(join(runtime, 'desktop-language.mjs')), shouldRun, `${name}: no language helper without Desktop`);
    assert.equal(existsSync(join(runtime, 'desktop-zh-Hans.json')), shouldRun, `${name}: no catalog without Desktop`);
    if (shouldRun) {
      assert.equal(readFileSync(call, 'utf8'), `${join(runtime, helperName)}\n--install\n${app}\n`, `${name}: use noninteractive mode with the detected app`);
      assert.equal(readFileSync(join(runtime, helperName), 'utf8').trimEnd(), helperSource.trimEnd(), 'release installer must embed the current canonical helper');
      assert.equal(statSync(join(runtime, helperName)).mode & 0o777, 0o700);
      assert.equal(readFileSync(join(runtime, 'desktop-language.mjs'), 'utf8').trimEnd(), languageSource.trimEnd());
      assert.equal(sha(readFileSync(join(runtime, 'desktop-zh-Hans.json'))), sha(catalogSource), 'compressed installer payload must reproduce the bundled catalog exactly');
      assert.equal(statSync(join(runtime, 'desktop-zh-Hans.json')).mode & 0o777, 0o600);
      assert.equal(readFileSync(join(app, 'Contents/Resources/app.asar'), 'utf8'), 'original app', 'test must never invoke real macOS mutation commands');
    }
    if (name === 'failed' || name === 'invalid-selection') assert.match(result.stdout, /WARN:/, `${name}: report the optional failure`);
    assert.equal(existsSync(join(home, 'Library/Application Support/Claude-3p')), false, 'skip and dispatch checks must not create Desktop user data');
  }

  // Exercise the real helper's installer mode without launching or signing a real app.
  for (const running of [true, false]) {
    const directory = join(root, `helper-${running}`);
    const home = join(directory, 'home');
    const bin = join(directory, 'bin');
    const app = join(directory, 'Claude.app');
    mkdirSync(join(app, 'Contents/Resources'), { recursive: true });
    mkdirSync(home);
    mkdirSync(bin);
    writeFileSync(join(app, 'Contents/Resources/app.asar'), 'fixture');
    writeFileSync(join(app, 'Contents/Info.plist'), '<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.42304.0</string></dict></plist>');
    const ion = join(app, 'Contents/Resources/ion-dist');
    mkdirSync(join(ion, 'assets/v1'), { recursive: true });
    mkdirSync(join(ion, 'i18n'), { recursive: true });
    const locales = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
    const scriptBefore = `var supported=${locales},fallback=${locales};`;
    writeFileSync(join(ion, 'assets/v1/locale.js'), scriptBefore);
    writeFileSync(join(ion, 'index.html'), '<html><head></head><body></body></html>');
    writeFileSync(join(ion, 'i18n/en-US.json'), '{"hello":"Hello"}');
    writeFileSync(join(directory, 'desktop-language.mjs'), languageSource);
    writeFileSync(join(directory, 'desktop-zh-Hans.json'), '{"schemaVersion":1,"locale":"zh-Hans","base":{"hello":"你好"},"dynamic":{}}');
    executable(join(bin, 'pgrep'), `exit ${running ? 0 : 1}`);
    executable(join(bin, 'python3'), 'cat >/dev/null\nprintf "RESULT=PATCH_OK\\n"');
    executable(join(bin, 'codesign'), 'case " $* " in *" --preserve-metadata=entitlements,flags,runtime "*) exit "${CODESIGN_STATUS:-0}" ;; *) exit 71 ;; esac');
    for (const name of ['open', 'osascript', 'sleep']) executable(join(bin, name), 'printf "%s\\n" "$0" >> "$UNEXPECTED_DESKTOP_ACTION"\nexit 0');
    const fixture = join(directory, helperName);
    writeFileSync(fixture, helperSource.replace('APP="/Applications/Claude.app"', `APP="${app}"`));
    const action = join(directory, 'unexpected-action');
    const result = spawnSync('/bin/bash', [fixture, '--install', app], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CLAWGOD_BUN_BIN: process.execPath, UNEXPECTED_DESKTOP_ACTION: action },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(existsSync(action), false, 'installer mode must never quit, launch or wait for Desktop');
    assert.equal(existsSync(join(home, 'Library/Application Support/Claude-3p')), !running, 'running Desktop must be skipped before backups or writes');
    assert.equal(existsSync(join(ion, 'i18n/zh-Hans.json')), !running, 'real shell must apply the language helper only to a stopped Desktop');
    if (running) assert.equal(readFileSync(join(ion, 'assets/v1/locale.js'), 'utf8'), scriptBefore);
    else {
      assert.match(readFileSync(join(ion, 'assets/v1/locale.js'), 'utf8'), /zh-Hans/);
      const restoreEnv = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CLAWGOD_BUN_BIN: process.execPath, UNEXPECTED_DESKTOP_ACTION: action };
      const failedRestore = spawnSync('/bin/bash', [fixture, '--restore', app], {
        encoding: 'utf8', env: { ...restoreEnv, CODESIGN_STATUS: '72' },
      });
      assert.notEqual(failedRestore.status, 0, 'restore must report a signing failure instead of claiming success');
      const restored = spawnSync('/bin/bash', [fixture, '--restore', app], { encoding: 'utf8', env: restoreEnv });
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
      assert.equal(readFileSync(join(ion, 'assets/v1/locale.js'), 'utf8'), scriptBefore, 'shell restore must restore native language resources');
      assert.equal(existsSync(join(ion, 'i18n/zh-Hans.json')), false);
    }
  }
  const uninstallHome = join(root, 'uninstall-home');
  const uninstallRuntime = join(uninstallHome, '.clawgod');
  const backupDirectory = join(uninstallHome, 'Library/Application Support/Claude-3p');
  mkdirSync(uninstallRuntime, { recursive: true });
  mkdirSync(backupDirectory, { recursive: true });
  writeFileSync(join(uninstallRuntime, helperName), helperSource);
  writeFileSync(join(uninstallRuntime, 'desktop-language.mjs'), languageSource);
  writeFileSync(join(uninstallRuntime, 'desktop-zh-Hans.json'), catalogSource);
  writeFileSync(join(uninstallRuntime, 'provider.json'), 'user provider');
  writeFileSync(join(backupDirectory, 'app.asar.orig-fixture'), 'user Desktop backup');
  const cleanup = generated.match(/^  rm -rf "\$CLAWGOD_DIR\/node_modules"[^\n]+/m)?.[0];
  assert.ok(cleanup, 'uninstall must retain its managed cleanup step');
  const uninstalled = spawnSync('/bin/bash', ['-c', cleanup], {
    encoding: 'utf8', env: { ...process.env, HOME: uninstallHome, CLAWGOD_DIR: uninstallRuntime },
  });
  assert.equal(uninstalled.status, 0, uninstalled.stdout + uninstalled.stderr);
  assert.equal(existsSync(join(uninstallRuntime, helperName)), false, 'uninstall must remove the managed Desktop helper');
  assert.equal(existsSync(join(uninstallRuntime, 'desktop-language.mjs')), false);
  assert.equal(existsSync(join(uninstallRuntime, 'desktop-zh-Hans.json')), false);
  assert.equal(readFileSync(join(uninstallRuntime, 'provider.json'), 'utf8'), 'user provider');
  assert.equal(readFileSync(join(backupDirectory, 'app.asar.orig-fixture'), 'utf8'), 'user Desktop backup', 'Desktop backups remain user-owned');
  console.log('Desktop integration: absence/selection/platform guards, app dispatch, optional failures, sessions and uninstall ownership passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
