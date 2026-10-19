#!/usr/bin/env bun
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const ionPath = 'Contents/Resources/ion-dist';
const oldLocales = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
const chineseLocales = oldLocales.slice(0, -1) + ',"zh-Hans"]';
const hash = bytes => bytes === null ? null : createHash('sha256').update(bytes).digest('hex');
function status(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(path) {
  const info = status(path);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`Unsafe Desktop directory or symlink: ${path}`);
}
function safePath(root, name) {
  if (typeof name !== 'string' || isAbsolute(name) || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe Desktop backup path');
  directory(root);
  let path = root;
  for (const part of name.split('/')) {
    path = join(path, part);
    if (status(path)?.isSymbolicLink()) throw new Error(`Refusing Desktop symlink: ${path}`);
  }
  return path;
}
function bytes(path) {
  const info = status(path);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsafe Desktop file: ${path}`);
  return readFileSync(path);
}
function catalog(value, allowEmpty = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (!allowEmpty && !Object.keys(value).length)
    || Object.values(value).some(text => typeof text !== 'string')) throw new Error('Invalid Desktop Chinese catalog');
}
function atomicWrite(path, data) {
  if (data === null) { if (existsSync(path)) unlinkSync(path); return; }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.clawgod-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, data, { flag: 'wx', mode: 0o644 });
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
function apply(changes) {
  const written = [];
  try {
    for (const change of changes) { atomicWrite(change.path, change.after); written.push(change); }
  } catch (error) {
    const errors = [error];
    for (const change of written.reverse()) {
      try { atomicWrite(change.path, change.before); } catch (rollback) { errors.push(rollback); }
    }
    throw new AggregateError(errors, 'Desktop language write failed; attempted rollback');
  }
}
function readBackup(app, backup) {
  directory(backup);
  const value = JSON.parse(readFileSync(safePath(backup, 'manifest.json'), 'utf8'));
  if (value?.schemaVersion !== 1 || value.appPath !== app || !Array.isArray(value.files) || !value.files.length) throw new Error('Invalid Desktop language backup manifest');
  const seen = new Set();
  for (const file of value.files) {
    if (!file || typeof file.path !== 'string' || !file.path.startsWith(`${ionPath}/`) || seen.has(file.path)
      || (file.before !== null && !/^[a-f0-9]{64}$/.test(file.before)) || !/^[a-f0-9]{64}$/.test(file.after)) throw new Error('Invalid Desktop language backup record');
    safePath(app, file.path); safePath(backup, `files/${file.path}`); seen.add(file.path);
  }
  return value;
}
function originalBytes(backup, file) {
  const value = bytes(safePath(backup, `files/${file.path}`));
  if (hash(value) !== file.before) throw new Error('Desktop language backup content changed');
  return value;
}
function owned(current, file) {
  if (hash(current) !== file.after && hash(current) !== file.before) throw new Error(`Desktop language ownership changed; user-modified file preserved: ${file.path}`);
}

export function installDesktopChinese(app, backup, catalogs) {
  app = resolve(app); backup = resolve(backup);
  if (!status(app)) return 'Claude Desktop not installed; Chinese language skipped';
  directory(app);
  catalogs ??= JSON.parse(readFileSync(new URL('./desktop-zh-Hans.json', import.meta.url), 'utf8'));
  if (catalogs?.schemaVersion !== 1 || catalogs.locale !== 'zh-Hans') throw new Error('Invalid Desktop Chinese catalog schema');
  catalog(catalogs.base); catalog(catalogs.dynamic, true);
  const ion = safePath(app, ionPath), assets = safePath(app, `${ionPath}/assets`);
  directory(ion); directory(assets);
  const changes = [];
  const plan = (path, after) => {
    const before = bytes(path);
    if (before === null || !before.equals(after)) changes.push({ path, before, after });
  };
  let count = 0;
  for (const name of readdirSync(assets, { recursive: true })) {
    if (!name.endsWith('.js')) continue;
    const path = safePath(app, `${ionPath}/assets/${name.split(sep).join('/')}`);
    const source = bytes(path).toString('utf8');
    count += source.split(oldLocales).length - 1 + source.split(chineseLocales).length - 1;
    if (!source.includes(oldLocales)) continue;
    const patched = source.replaceAll(oldLocales, chineseLocales);
    new Bun.Transpiler({ loader: 'js' }).transformSync(patched);
    plan(path, Buffer.from(patched));
  }
  if (count !== 2) throw new Error(`Desktop locale lists changed: expected 2, found ${count}`);
  for (const [name, messages] of [['i18n/zh-Hans.json', catalogs.base], ['i18n/dynamic/zh-Hans.json', catalogs.dynamic]]) {
    const path = safePath(app, `${ionPath}/${name}`), current = bytes(path);
    if (current === null) plan(path, Buffer.from(JSON.stringify(messages)));
    else catalog(JSON.parse(current.toString()), name.includes('dynamic/'));
  }
  const index = safePath(app, `${ionPath}/index.html`);
  let html = bytes(index).toString('utf8');
  const meta = html.match(/<meta\b[^>]*name=["']i18n-catalogs["'][^>]*>/g);
  if (meta) {
    if (meta.length !== 1 || !/data-i18n-catalogs="[^"]*"/.test(meta[0])) throw new Error('Desktop catalog manifest format changed');
    const patched = meta[0].replace(/data-i18n-catalogs="([^"]*)"/, (match, value) => value.split(',').some(entry => entry.startsWith('zh-Hans:')) ? match : `data-i18n-catalogs="${value}${value ? ',' : ''}zh-Hans:1.1.1"`);
    html = html.replace(meta[0], patched);
  } else {
    if (html.split('</head>').length !== 2) throw new Error('Desktop HTML format changed');
    const locales = new Set(readdirSync(safePath(app, `${ionPath}/i18n`)).filter(name => /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\.json$/.test(name)).map(name => name.slice(0, -5)));
    locales.add('zh-Hans');
    html = html.replace('</head>', `<meta name="i18n-catalogs" data-i18n-catalogs="${[...locales].sort().map(locale => `${locale}:1.1.1`).join(',')}"></head>`);
  }
  plan(index, Buffer.from(html));
  if (!changes.length) return 'Claude Desktop already has the native Simplified Chinese option';

  if (status(backup)) {
    const saved = readBackup(app, backup);
    for (const file of saved.files) { originalBytes(backup, file); owned(bytes(safePath(app, file.path)), file); }
    for (const change of changes) {
      const file = saved.files.find(file => file.path === relative(app, change.path).split(sep).join('/'));
      if (!file || file.after !== hash(change.after)) throw new Error('Desktop language backup patch shape changed');
    }
  } else {
    mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
    const staging = mkdtempSync(`${backup}.staging-`);
    try {
      const files = changes.map(change => {
        const name = relative(app, change.path).split(sep).join('/');
        if (change.before !== null) {
          const path = safePath(staging, `files/${name}`);
          mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, change.before, { flag: 'wx', mode: 0o600 });
        }
        return { path: name, before: hash(change.before), after: hash(change.after) };
      });
      writeFileSync(join(staging, 'manifest.json'), JSON.stringify({ schemaVersion: 1, appPath: app, files }) + '\n', { flag: 'wx', mode: 0o600 });
      renameSync(staging, backup);
    } finally { if (existsSync(staging)) rmSync(staging, { recursive: true, force: true }); }
  }
  apply(changes);
  return 'Claude Desktop native language menu now includes Simplified Chinese (current language preserved)';
}

export function restoreDesktopChinese(app, backup) {
  app = resolve(app); backup = resolve(backup);
  if (!status(backup)) return 'No managed Desktop language backup; existing language resources preserved';
  const saved = readBackup(app, backup);
  const changes = saved.files.map(file => {
    const path = safePath(app, file.path), before = bytes(path);
    owned(before, file);
    return { path, before, after: originalBytes(backup, file) };
  }).filter(change => hash(change.before) !== hash(change.after));
  apply(changes);
  return 'Managed Desktop language resources restored; backups retained';
}

if (import.meta.main) {
  try {
    const [command, app, backup] = process.argv.slice(2);
    if (!app || !backup || !['install', 'restore'].includes(command)) throw new Error('usage: desktop-language.mjs install|restore <Claude.app> <backup-directory>');
    console.log(command === 'install' ? installDesktopChinese(app, backup) : restoreDesktopChinese(app, backup));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
