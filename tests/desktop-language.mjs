#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const helper = new URL('../src/unix/desktop/desktop-language.mjs', import.meta.url);
assert.ok(existsSync(helper), 'Desktop enhancement must include native Chinese language support');
const { installDesktopChinese, restoreDesktopChinese } = await import(helper.href);
const oldList = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
const catalogs = { schemaVersion: 1, locale: 'zh-Hans', base: { greeting: '你好', language: '语言' }, dynamic: { model: '模型' } };
const root = mkdtempSync(join(tmpdir(), 'clawgod Desktop Chinese '));
function fixture(name, source = `var supported=${oldList},fallback=${oldList};`) {
  const app = join(root, name, 'Claude.app');
  const ion = join(app, 'Contents/Resources/ion-dist');
  mkdirSync(join(ion, 'assets/v1'), { recursive: true });
  mkdirSync(join(ion, 'i18n/dynamic'), { recursive: true });
  writeFileSync(join(ion, 'assets/v1/shared-renamed.js'), source);
  writeFileSync(join(ion, 'i18n/en-US.json'), '{"greeting":"Hello"}');
  writeFileSync(join(ion, 'index.html'), '<html><head><title>Claude</title></head><body></body></html>');
  writeFileSync(join(app, 'Contents/Resources/app.asar'), 'existing CU/browser patch');
  writeFileSync(join(app, 'user-settings.json'), '{"locale":"en-US","keep":true}');
  return { app, ion, backup: join(root, name, 'language-backup'), script: join(ion, 'assets/v1/shared-renamed.js') };
}
try {
  const absent = join(root, 'missing.app');
  installDesktopChinese(absent, join(root, 'missing-backup'), catalogs);
  assert.equal(existsSync(absent), false, 'absent Desktop must not be created');
  assert.equal(existsSync(join(root, 'missing-backup')), false, 'absent Desktop must not create a backup');

  const f = fixture('supported');
  const originalScript = readFileSync(f.script, 'utf8');
  const originalIndex = readFileSync(join(f.ion, 'index.html'), 'utf8');
  installDesktopChinese(f.app, f.backup, catalogs);
  const context = {};
  runInNewContext(readFileSync(f.script, 'utf8'), context);
  assert.equal(context.supported.includes('zh-Hans'), true, 'native language choices must include Chinese');
  assert.equal(context.fallback.includes('zh-Hans'), true, 'native locale negotiation must accept Chinese');
  assert.equal(context.supported.includes('ja-JP'), true, 'existing language choices must remain');
  assert.match(readFileSync(join(f.ion, 'index.html'), 'utf8'), /zh-Hans:1\.1\.1/);
  assert.deepEqual(JSON.parse(readFileSync(join(f.ion, 'i18n/zh-Hans.json'))), catalogs.base);
  assert.deepEqual(JSON.parse(readFileSync(join(f.ion, 'i18n/dynamic/zh-Hans.json'))), catalogs.dynamic);
  assert.equal(readFileSync(join(f.app, 'user-settings.json'), 'utf8'), '{"locale":"en-US","keep":true}', 'adding the option must not force a language');
  assert.equal(readFileSync(join(f.app, 'Contents/Resources/app.asar'), 'utf8'), 'existing CU/browser patch');
  const manifest = readFileSync(join(f.backup, 'manifest.json'), 'utf8');
  installDesktopChinese(f.app, f.backup, catalogs);
  assert.equal(readFileSync(join(f.backup, 'manifest.json'), 'utf8'), manifest, 'reruns must preserve the original backup');
  restoreDesktopChinese(f.app, f.backup);
  assert.equal(readFileSync(f.script, 'utf8'), originalScript);
  assert.equal(readFileSync(join(f.ion, 'index.html'), 'utf8'), originalIndex);
  assert.equal(existsSync(join(f.ion, 'i18n/zh-Hans.json')), false, 'restore removes only the catalog created by the helper');
  assert.equal(existsSync(join(f.ion, 'i18n/dynamic/zh-Hans.json')), false);
  restoreDesktopChinese(f.app, f.backup);
  installDesktopChinese(f.app, f.backup, catalogs);
  assert.equal(readFileSync(join(f.backup, 'manifest.json'), 'utf8'), manifest, 'reapplying after restore must reuse the original backup');

  writeFileSync(f.script, 'user modified the asset');
  const indexBeforeRefusal = readFileSync(join(f.ion, 'index.html'), 'utf8');
  assert.throws(() => restoreDesktopChinese(f.app, f.backup), /modified|ownership|changed/i);
  assert.equal(readFileSync(f.script, 'utf8'), 'user modified the asset');
  assert.equal(readFileSync(join(f.ion, 'index.html'), 'utf8'), indexBeforeRefusal, 'restore must validate every file before changing any');

  for (const [name, source, data] of [
    ['drift', `var supported=${oldList};`, catalogs],
    ['syntax', `var supported=${oldList},fallback=${oldList};function {`, catalogs],
    ['bad-catalog', `var supported=${oldList},fallback=${oldList};`, { ...catalogs, base: { invalid: 42 } }],
  ]) {
    const f = fixture(name, source);
    assert.throws(() => installDesktopChinese(f.app, f.backup, data), undefined, `${name} must fail before writes`);
    assert.equal(readFileSync(f.script, 'utf8'), source);
    assert.equal(existsSync(join(f.ion, 'i18n/zh-Hans.json')), false);
    assert.equal(existsSync(f.backup), false);
  }

  const existing = fixture('user-catalog');
  writeFileSync(join(existing.ion, 'i18n/zh-Hans.json'), '{"greeting":"用户词表"}');
  installDesktopChinese(existing.app, existing.backup, catalogs);
  restoreDesktopChinese(existing.app, existing.backup);
  assert.equal(readFileSync(join(existing.ion, 'i18n/zh-Hans.json'), 'utf8'), '{"greeting":"用户词表"}', 'a pre-existing catalog remains user-owned');

  const bundled = fixture('bundled-catalog');
  installDesktopChinese(bundled.app, bundled.backup);
  const realCatalog = JSON.parse(readFileSync(join(bundled.ion, 'i18n/zh-Hans.json')));
  assert.ok(Object.keys(realCatalog).length > 30000, 'installer must ship the complete cached Chinese catalog');

  const malformed = fixture('bad-manifest');
  installDesktopChinese(malformed.app, malformed.backup, catalogs);
  const state = join(malformed.backup, 'manifest.json');
  const saved = JSON.parse(readFileSync(state));
  const originalFiles = saved.files;
  writeFileSync(state, JSON.stringify({ ...saved, schemaVersion: 999 }));
  assert.throws(() => restoreDesktopChinese(malformed.app, malformed.backup), /backup|schema|manifest/i);
  const outside = join(root, 'outside'); writeFileSync(outside, 'preserve');
  writeFileSync(state, JSON.stringify({ ...saved, files: [{ ...originalFiles[0], path: '../outside' }] }));
  assert.throws(() => restoreDesktopChinese(malformed.app, malformed.backup), /path|backup|manifest/i);
  assert.equal(readFileSync(outside, 'utf8'), 'preserve');

  if (process.platform !== 'win32') {
    const linked = fixture('linked-backup');
    const other = join(root, 'other-backup'); mkdirSync(other);
    symlinkSync(other, linked.backup);
    assert.throws(() => installDesktopChinese(linked.app, linked.backup, catalogs), /symlink|directory|backup/i);
    assert.equal(existsSync(join(other, 'manifest.json')), false);
    assert.equal(readFileSync(linked.script, 'utf8'), originalScript);
  }
  console.log('Desktop Chinese: native choices, bundled catalogs, repeatability, restore ownership and failure preservation passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
