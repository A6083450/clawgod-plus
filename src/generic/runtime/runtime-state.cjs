const fs = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

const MANAGED = [
  'cli.cjs', 'cli.js', 'cli.original.js', 'cli.original.cjs',
  'cli.original.js.bak', 'cli.original.cjs.bak', 'chunks', 'chunks.bak', 'assets',
  '.source-version', '.clawgod-version', '.clean-source.json', 'patch-fallback.json',
  'patch.mjs', 'patch.js', 'extract-natives.mjs', 'post-process.mjs', 'repatch.mjs',
  'runtime-state.cjs', 'startup-check.cjs', 'vendor-transaction.mjs', 'self-update.cjs',
  'patch-fallback.cjs', 'feature-gates.cjs', 'openai-proxy.cjs', 'proxy-fetch.mjs',
  'fetch-file.mjs', 'enhancement-config.mjs', 'enhancement-manifest.json',
  'install-ripgrep.mjs', 'install-voice-asr.mjs', 'plugin-dependencies.mjs',
  'claude-mem-compat.cjs', 'apply-claude-code-chrome-fix.sh',
  'apply-claude-code-chrome-fix.ps1', 'install.sh', 'install.ps1',
  'restore-claude-3p-cu-browser.sh',
  'desktop-language.mjs', 'desktop-zh-Hans.json',
];
const VERSION = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;

function present(path) {
  try { return fs.lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function files(path, prefix = '', allowLinks = false) {
  const status = fs.lstatSync(path);
  if (status.isSymbolicLink()) {
    if (allowLinks) return { [prefix]: `symlink:${fs.readlinkSync(path)}` };
    throw new Error(`runtime-state: symbolic link is not a managed source: ${path}`);
  }
  if (status.isFile()) return { [prefix]: createHash('sha256').update(fs.readFileSync(path)).digest('hex') };
  if (!status.isDirectory()) throw new Error(`runtime-state: unsupported source type: ${path}`);
  const result = {};
  for (const name of fs.readdirSync(path).sort()) {
    Object.assign(result, files(join(path, name), prefix ? `${prefix}/${name}` : name, allowLinks));
  }
  return result;
}

function snapshot(root, transaction) {
  const backup = join(transaction, 'runtime-state');
  fs.mkdirSync(backup, { mode: 0o700 });
  const names = MANAGED.filter(name => present(join(root, name)));
  for (const name of names) files(join(root, name), '', true);
  for (const name of names) fs.cpSync(join(root, name), join(backup, name), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  fs.writeFileSync(join(backup, 'manifest.json'), JSON.stringify(names));
}

function restore(root, transaction) {
  const backup = join(transaction, 'runtime-state');
  const names = JSON.parse(fs.readFileSync(join(backup, 'manifest.json'), 'utf8'));
  if (!Array.isArray(names) || names.some(name => !MANAGED.includes(name))) throw new Error('runtime-state: invalid rollback manifest');
  for (const name of names) files(join(backup, name), '', true);
  for (const name of MANAGED) {
    fs.rmSync(join(root, name), { recursive: true, force: true });
    if (names.includes(name)) fs.cpSync(join(backup, name), join(root, name), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  }
}

function cleanManifest(root, version, backup) {
  if (!VERSION.test(version || '')) throw new Error('runtime-state: exact source version is required');
  const entry = join(root, backup ? 'cli.original.cjs.bak' : 'cli.original.cjs');
  const chunks = join(root, backup ? 'chunks.bak' : 'chunks');
  const modules = files(entry, 'cli.original.cjs');
  const hasChunks = Boolean(present(chunks));
  if (hasChunks) Object.assign(modules, files(chunks, 'chunks'));
  return { schemaVersion: 1, version, hasChunks, modules };
}

function saveClean(root, version) {
  const manifest = cleanManifest(root, version, false);
  fs.rmSync(join(root, '.clean-source.json'), { force: true });
  fs.rmSync(join(root, 'cli.original.cjs.bak'), { force: true });
  fs.rmSync(join(root, 'chunks.bak'), { recursive: true, force: true });
  fs.copyFileSync(join(root, 'cli.original.cjs'), join(root, 'cli.original.cjs.bak'));
  if (manifest.hasChunks) fs.cpSync(join(root, 'chunks'), join(root, 'chunks.bak'), { recursive: true });
  fs.writeFileSync(join(root, '.clean-source.json'), JSON.stringify(manifest) + '\n', { mode: 0o600 });
}

function restoreClean(root, version) {
  const expected = JSON.parse(fs.readFileSync(join(root, '.clean-source.json'), 'utf8'));
  const actual = cleanManifest(root, version, true);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('runtime-state: clean source version or complete module set does not match');
  fs.rmSync(join(root, 'cli.original.cjs'), { force: true });
  fs.copyFileSync(join(root, 'cli.original.cjs.bak'), join(root, 'cli.original.cjs'));
  fs.rmSync(join(root, 'chunks'), { recursive: true, force: true });
  if (actual.hasChunks) fs.cpSync(join(root, 'chunks.bak'), join(root, 'chunks'), { recursive: true });
}

module.exports = { snapshot, restore, saveClean, restoreClean };
if (require.main === module) {
  try {
    const [command, root, argument] = process.argv.slice(2);
    if (!root || !argument) throw new Error('runtime-state: command, runtime directory and transaction/version required');
    if (command === 'snapshot') snapshot(root, argument);
    else if (command === 'restore') restore(root, argument);
    else if (command === 'clean-save') saveClean(root, argument);
    else if (command === 'clean-restore') restoreClean(root, argument);
    else throw new Error(`runtime-state: unknown command ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
