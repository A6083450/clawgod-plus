#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const buildPath = join(root, 'build.mjs');
const {
  GENERATED_HEADER,
  OUTPUTS,
  checkGeneratedPair,
  placeholder,
  renderTemplate,
  writeGeneratedPair,
} = await import(pathToFileURL(buildPath).href);

assert.equal(GENERATED_HEADER, 'GENERATED FILE - edit src/ and run: bun build.mjs');
assert.deepEqual(OUTPUTS, [
  { template: 'src/template/install.sh', output: 'install.sh', mode: 0o755 },
  { template: 'src/template/install.ps1', output: 'install.ps1', mode: 0o644 },
]);
assert.equal(Object.isFrozen(OUTPUTS), true, 'OUTPUTS must be frozen');
assert.equal(OUTPUTS.every(Object.isFrozen), true, 'each OUTPUTS entry must be frozen');
assert.equal(placeholder('FEATURES_JSON'), '@@CLAWGOD_FEATURES_JSON@@');

const rendered = renderTemplate(
  'before\n@@CLAWGOD_FIRST@@\nmiddle\n@@CLAWGOD_SECOND@@\nafter\n',
  { FIRST: 'one', SECOND: 'two' },
);
assert.equal(rendered, 'before\none\nmiddle\ntwo\nafter\n', 'renderTemplate must replace each declared placeholder once');
assert.equal(
  renderTemplate('@@CLAWGOD_SOURCE@@\n', { SOURCE: 'literal $& $1 $$\n' }),
  'literal $& $1 $$\n',
  'renderTemplate must preserve replacement metacharacters as exact canonical source bytes',
);

assert.throws(
  () => renderTemplate('no marker here\n', { REQUIRED: 'value' }),
  /missing.*CLAWGOD_REQUIRED/i,
  'renderTemplate must reject missing declared placeholders',
);
assert.throws(
  () => renderTemplate('@@CLAWGOD_REPEAT@@\n@@CLAWGOD_REPEAT@@\n', { REPEAT: 'value' }),
  /duplicate.*CLAWGOD_REPEAT/i,
  'renderTemplate must reject duplicate declared placeholders',
);
assert.throws(
  () => renderTemplate('@@CLAWGOD_DECLARED@@\n@@CLAWGOD_UNDECLARED@@\n', { DECLARED: 'value' }),
  /undeclared.*CLAWGOD_UNDECLARED/i,
  'renderTemplate must reject undeclared placeholders',
);
assert.throws(
  () => renderTemplate('@@CLAWGOD_DECLARED@@\n@@CLAWGOD_lower@@\n', { DECLARED: 'value' }),
  /invalid.*CLAWGOD_lower/i,
  'renderTemplate must reject lowercase placeholder candidates',
);
assert.throws(
  () => renderTemplate('@@CLAWGOD_DECLARED@@\n@@CLAWGOD_FEATURES-JSON@@\n', { DECLARED: 'value' }),
  /invalid.*CLAWGOD_FEATURES-JSON/i,
  'renderTemplate must reject malformed placeholder candidates',
);
assert.throws(
  () => renderTemplate('@@CLAWGOD_DECLARED@@\n@@CLAWGOD_FEATURES@JSON@@\n', { DECLARED: 'value' }),
  /invalid.*CLAWGOD_FEATURES@JSON/i,
  'renderTemplate must reject malformed placeholder candidates containing at-signs',
);

function snapshot(path) {
  if (!existsSync(path)) return { exists: false };
  const status = lstatSync(path, { bigint: true });
  if (status.isFile()) {
    return {
      exists: true,
      type: 'file',
      bytes: readFileSync(path).toString('base64'),
      mode: Number(status.mode & 0o777n),
      mtimeNs: status.mtimeNs,
    };
  }
  assert.equal(status.isDirectory(), true, `${path} must be a file or directory`);
  return {
    exists: true,
    type: 'directory',
    mode: Number(status.mode & 0o777n),
    mtimeNs: status.mtimeNs,
    entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, snapshot(join(path, name))])),
  };
}

function contentSnapshot(path) {
  if (!existsSync(path)) return { exists: false };
  const status = lstatSync(path);
  if (status.isFile()) {
    return {
      exists: true,
      type: 'file',
      bytes: readFileSync(path).toString('base64'),
      mode: status.mode & 0o777,
    };
  }
  assert.equal(status.isDirectory(), true, `${path} must be a file or directory`);
  return {
    exists: true,
    type: 'directory',
    mode: status.mode & 0o777,
    entries: Object.fromEntries(readdirSync(path).sort().map(name => [name, contentSnapshot(join(path, name))])),
  };
}

function generatedPair(contentPrefix = 'new') {
  return OUTPUTS.map(entry => ({
    ...entry,
    content: `${contentPrefix}:${entry.output}\n`,
  }));
}

function originalPair(fixtureRoot) {
  const originals = [
    { path: join(fixtureRoot, 'install.sh'), content: 'old:install.sh\n', mode: 0o751 },
    { path: join(fixtureRoot, 'install.ps1'), content: 'old:install.ps1\n', mode: 0o640 },
  ];
  for (const original of originals) {
    writeFileSync(original.path, original.content);
    chmodSync(original.path, original.mode);
  }
  return originals;
}

function faultingFileSystem({ writeTarget, renameTarget }) {
  return new Proxy(fsPromises, {
    get(target, property) {
      if (property === 'writeFile' && writeTarget) {
        return async (path, ...args) => {
          if (String(path).includes(writeTarget)) throw new Error(`injected write failure: ${writeTarget}`);
          return target.writeFile(path, ...args);
        };
      }
      if (property === 'rename' && renameTarget) {
        return async (source, destination) => {
          if (String(source).includes('.stage-') && String(destination).endsWith(renameTarget)) {
            throw new Error(`injected rename failure: ${renameTarget}`);
          }
          return target.rename(source, destination);
        };
      }
      return Reflect.get(target, property);
    },
  });
}

const transactionRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-transaction-'));
try {
  originalPair(transactionRoot);
  await writeGeneratedPair(generatedPair(), { rootDir: transactionRoot });
  assert.equal(readFileSync(join(transactionRoot, 'install.sh'), 'utf8'), 'new:install.sh\n');
  assert.equal(readFileSync(join(transactionRoot, 'install.ps1'), 'utf8'), 'new:install.ps1\n');
  if (process.platform === 'win32') {
    await checkGeneratedPair(generatedPair(), { rootDir: transactionRoot });
  } else {
    assert.equal(statSync(join(transactionRoot, 'install.sh')).mode & 0o777, 0o755);
    assert.equal(statSync(join(transactionRoot, 'install.ps1')).mode & 0o777, 0o644);
  }
  assert.deepEqual(readdirSync(transactionRoot).sort(), ['install.ps1', 'install.sh'], 'successful publication must clean transaction files');

  for (const fault of [
    { label: 'write', fileSystem: faultingFileSystem({ writeTarget: 'install.ps1.stage-' }) },
    { label: 'rename', fileSystem: faultingFileSystem({ renameTarget: 'install.ps1' }) },
  ]) {
    rmSync(transactionRoot, { recursive: true, force: true });
    mkdirSync(transactionRoot, { recursive: true });
    originalPair(transactionRoot);
    const before = {
      entries: readdirSync(transactionRoot).sort(),
      shell: snapshot(join(transactionRoot, 'install.sh')),
      powershell: snapshot(join(transactionRoot, 'install.ps1')),
    };
    await assert.rejects(
      writeGeneratedPair(generatedPair(fault.label), { rootDir: transactionRoot, fileSystem: fault.fileSystem }),
      new RegExp(`injected ${fault.label} failure`),
      `${fault.label} failure must surface`,
    );
    assert.deepEqual({
      entries: readdirSync(transactionRoot).sort(),
      shell: snapshot(join(transactionRoot, 'install.sh')),
      powershell: snapshot(join(transactionRoot, 'install.ps1')),
    }, before, `${fault.label} failure must restore both original outputs byte-for-byte`);
  }
} finally {
  rmSync(transactionRoot, { recursive: true, force: true });
}

if (process.platform !== 'win32') {
  const symlinkRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-symlink-'));
  try {
    const pair = generatedPair('symlink');
    await writeGeneratedPair(pair, { rootDir: symlinkRoot });
    renameSync(join(symlinkRoot, 'install.sh'), join(symlinkRoot, 'install.sh.target'));
    symlinkSync('install.sh.target', join(symlinkRoot, 'install.sh'));
    await assert.rejects(
      checkGeneratedPair(pair, { rootDir: symlinkRoot }),
      /stale.*install\.sh/i,
      '--check must reject a generated output symlink even when target bytes and mode match',
    );
  } finally {
    rmSync(symlinkRoot, { recursive: true, force: true });
  }
}

const windowsModeRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-windows-mode-'));
try {
  const chmodCalls = [];
  const windowsFileSystem = new Proxy(fsPromises, {
    get(target, property) {
      if (property === 'chmod') {
        return async (path, mode) => {
          chmodCalls.push({ path: String(path), mode });
          return target.chmod(path, mode);
        };
      }
      return Reflect.get(target, property);
    },
  });
  const pair = generatedPair('windows-mode');
  await writeGeneratedPair(pair, {
    rootDir: windowsModeRoot,
    fileSystem: windowsFileSystem,
    platform: 'win32',
  });
  assert.deepEqual(
    chmodCalls.map(call => call.mode),
    [0o666, 0o666],
    'Windows publication must normalize Unix executable bits to writable regular-file modes',
  );
  chmodSync(join(windowsModeRoot, 'install.sh'), 0o600);
  chmodSync(join(windowsModeRoot, 'install.ps1'), 0o600);
  await checkGeneratedPair(pair, { rootDir: windowsModeRoot, platform: 'win32' });
  chmodSync(join(windowsModeRoot, 'install.sh'), 0o400);
  await assert.rejects(
    checkGeneratedPair(pair, { rootDir: windowsModeRoot, platform: 'win32' }),
    /stale.*install\.sh/i,
    'Windows --check must still reject a read-only output when the generated file is writable',
  );
} finally {
  rmSync(windowsModeRoot, { recursive: true, force: true });
}

async function waitForAny(paths, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = paths.find(path => existsSync(path));
    if (found) return found;
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function childResult(child, label) {
  const status = await child.exited;
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  assert.equal(status, 0, `${label} must exit cleanly\nstdout: ${stdout}\nstderr: ${stderr}`);
}

const concurrencyRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-concurrency-'));
let concurrentA;
let concurrentB;
try {
  originalPair(concurrencyRoot);
  const signals = join(concurrencyRoot, 'signals');
  mkdirSync(signals);
  const worker = join(concurrencyRoot, 'build-worker.mjs');
  writeFileSync(worker, `
import * as fs from 'node:fs/promises';
import { basename, join } from 'node:path';
import { OUTPUTS, writeGeneratedPair } from ${JSON.stringify(pathToFileURL(buildPath).href)};

const [root, generation, role] = process.argv.slice(2);
const signals = join(root, 'signals');
const signal = name => fs.writeFile(join(signals, name), '');
const waitFor = async name => {
  const path = join(signals, name);
  while (true) {
    try { await fs.access(path); return; } catch {}
    await Bun.sleep(5);
  }
};
const fileSystem = new Proxy(fs, {
  get(target, property) {
    if (property === 'link') {
      return async (source, destination) => {
        try {
          return await target.link(source, destination);
        } catch (error) {
          if (role === 'B' && basename(String(destination)) === '.clawgod-installer-build.lock' && error?.code === 'EEXIST') {
            await signal('b-contended');
          }
          throw error;
        }
      };
    }
    if (property === 'mkdir') {
      return async (path, ...args) => {
        try {
          return await target.mkdir(path, ...args);
        } catch (error) {
          if (role === 'B' && basename(String(path)) === '.clawgod-installer-build.lock' && error?.code === 'EEXIST') {
            await signal('b-contended');
          }
          throw error;
        }
      };
    }
    if (property === 'writeFile') {
      return async (path, ...args) => {
        if (role === 'B' && String(path).includes('.stage-')) await signal('b-stage');
        return target.writeFile(path, ...args);
      };
    }
    if (property === 'rename') {
      return async (source, destination) => {
        const result = await target.rename(source, destination);
        if (role === 'A' && String(source).includes('.install.sh.stage-') && String(destination).endsWith('install.sh')) {
          await signal('a-first-published');
          await waitFor('allow-a');
        }
        return result;
      };
    }
    return Reflect.get(target, property);
  },
});

await signal(\`\${role.toLowerCase()}-started\`);
await writeGeneratedPair(OUTPUTS.map(entry => ({ ...entry, content: \`\${generation}:\${entry.output}\\n\` })), {
  rootDir: root,
  fileSystem,
  lockOptions: { retryDelayMs: 5, timeoutMs: 5000 },
});
`);

  concurrentA = Bun.spawn([process.execPath, worker, concurrencyRoot, 'generation-a', 'A'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await waitForAny([join(signals, 'a-first-published')], 'generation A first publish');
  concurrentB = Bun.spawn([process.execPath, worker, concurrencyRoot, 'generation-b', 'B'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await waitForAny([join(signals, 'b-started')], 'generation B start');
  const bObservation = await waitForAny(
    [join(signals, 'b-contended'), join(signals, 'b-stage')],
    'generation B contention or stage write',
  );
  writeFileSync(join(signals, 'allow-a'), '');
  await Promise.all([
    childResult(concurrentA, 'generation A'),
    childResult(concurrentB, 'generation B'),
  ]);
  assert.equal(
    bObservation,
    join(signals, 'b-contended'),
    'the second process must contend on the build lock before any stage write',
  );
  assert.equal(existsSync(join(signals, 'b-stage')), true, 'generation B must publish after generation A releases the lock');
  assert.equal(readFileSync(join(concurrencyRoot, 'install.sh'), 'utf8'), 'generation-b:install.sh\n');
  assert.equal(readFileSync(join(concurrencyRoot, 'install.ps1'), 'utf8'), 'generation-b:install.ps1\n');
} finally {
  const allow = join(concurrencyRoot, 'signals', 'allow-a');
  if (existsSync(dirname(allow))) writeFileSync(allow, '');
  if (concurrentA && concurrentA.exitCode === null) concurrentA.kill();
  if (concurrentB && concurrentB.exitCode === null) concurrentB.kill();
  rmSync(concurrencyRoot, { recursive: true, force: true });
}

const initializationRaceRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-lock-initialization-'));
let initializationA;
let initializationB;
try {
  originalPair(initializationRaceRoot);
  const signals = join(initializationRaceRoot, 'signals');
  mkdirSync(signals);
  const worker = join(initializationRaceRoot, 'lock-initialization-worker.mjs');
  writeFileSync(worker, `
import * as fs from 'node:fs/promises';
import { basename, join } from 'node:path';
import { OUTPUTS, writeGeneratedPair } from ${JSON.stringify(pathToFileURL(buildPath).href)};

const [root, generation, role] = process.argv.slice(2);
const lockName = '.clawgod-installer-build.lock';
const lockPath = join(root, lockName);
const signals = join(root, 'signals');
const signal = name => fs.writeFile(join(signals, name), '');
const waitFor = async name => {
  const path = join(signals, name);
  while (true) {
    try { await fs.access(path); return; } catch {}
    await Bun.sleep(5);
  }
};
const fileSystem = new Proxy(fs, {
  get(target, property) {
    if (property === 'mkdir') {
      return async (path, ...args) => {
        const result = await target.mkdir(path, ...args);
        if (role === 'A' && String(path) === lockPath) {
          await signal('a-lock-visible');
          await waitFor('allow-a');
        }
        return result;
      };
    }
    if (property === 'link') {
      return async (source, destination) => {
        try {
          const result = await target.link(source, destination);
          if (role === 'A' && String(destination) === lockPath) {
            await signal('a-lock-visible');
            await waitFor('allow-a');
          }
          return result;
        } catch (error) {
          if (role === 'B' && String(destination) === lockPath && error?.code === 'EEXIST') {
            await signal('b-contended');
          }
          throw error;
        }
      };
    }
    if (property === 'writeFile') {
      return async (path, ...args) => {
        const result = await target.writeFile(path, ...args);
        if (role === 'B' && String(path) === join(lockPath, 'owner.json')) {
          await signal('b-replacement-owned');
          await waitFor('allow-b');
        }
        return result;
      };
    }
    if (property === 'rm') {
      return async (path, ...args) => {
        const result = await target.rm(path, ...args);
        if (role === 'A' && String(path) === lockPath) await signal('a-removed-replacement');
        return result;
      };
    }
    if (property === 'rename') {
      return async (source, destination) => {
        const result = await target.rename(source, destination);
        if (role === 'B' && String(source) === lockPath && basename(String(destination)).startsWith(lockName + '.stale-')) {
          await signal('b-quarantined-ownerless-lock');
        }
        return result;
      };
    }
    return Reflect.get(target, property);
  },
});

await writeGeneratedPair(OUTPUTS.map(entry => ({ ...entry, content: \`\${generation}:\${entry.output}\\n\` })), {
  rootDir: root,
  fileSystem,
  lockOptions: { retryDelayMs: 5, timeoutMs: 5000, staleMs: 0 },
});
`);

  initializationA = Bun.spawn([process.execPath, worker, initializationRaceRoot, 'initialization-a', 'A'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await waitForAny([join(signals, 'a-lock-visible')], 'generation A visible lock initialization');
  initializationB = Bun.spawn([process.execPath, worker, initializationRaceRoot, 'initialization-b', 'B'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const bInitializationObservation = await waitForAny([
    join(signals, 'b-contended'),
    join(signals, 'b-replacement-owned'),
  ], 'generation B contention or replacement ownership');
  writeFileSync(join(signals, 'allow-a'), '');

  if (bInitializationObservation === join(signals, 'b-replacement-owned')) {
    await waitForAny([join(signals, 'a-removed-replacement')], 'generation A deleting generation B replacement lock');
    writeFileSync(join(signals, 'allow-b'), '');
    initializationA.kill();
    initializationB.kill();
    await Promise.all([initializationA.exited, initializationB.exited]);
  } else {
    await Promise.all([
      childResult(initializationA, 'initialization generation A'),
      childResult(initializationB, 'initialization generation B'),
    ]);
  }

  assert.equal(
    bInitializationObservation,
    join(signals, 'b-contended'),
    'a visible lock must already carry immutable ownership, so a contender cannot reclaim its initialization window',
  );
  assert.equal(
    existsSync(join(signals, 'a-removed-replacement')),
    false,
    'a failed acquire must not delete another process replacement lock',
  );
  assert.equal(readFileSync(join(initializationRaceRoot, 'install.sh'), 'utf8'), 'initialization-b:install.sh\n');
  assert.equal(readFileSync(join(initializationRaceRoot, 'install.ps1'), 'utf8'), 'initialization-b:install.ps1\n');
} finally {
  const signals = join(initializationRaceRoot, 'signals');
  if (existsSync(signals)) {
    writeFileSync(join(signals, 'allow-a'), '');
    writeFileSync(join(signals, 'allow-b'), '');
  }
  if (initializationA && initializationA.exitCode === null) initializationA.kill();
  if (initializationB && initializationB.exitCode === null) initializationB.kill();
  rmSync(initializationRaceRoot, { recursive: true, force: true });
}

const staleLockRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-stale-lock-'));
try {
  originalPair(staleLockRoot);
  const lockPath = join(staleLockRoot, '.clawgod-installer-build.lock');
  mkdirSync(lockPath);
  writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({
    pid: 2147483647,
    token: 'dead-owner',
    startedAt: 1,
  }));
  await writeGeneratedPair(generatedPair('after-dead-owner'), {
    rootDir: staleLockRoot,
    lockOptions: { retryDelayMs: 5, timeoutMs: 1000 },
  });
  assert.equal(existsSync(lockPath), false, 'a lock whose owner process died must be reclaimed and released');
  mkdirSync(lockPath);
  await writeGeneratedPair(generatedPair('after-ownerless-lock'), {
    rootDir: staleLockRoot,
    lockOptions: { retryDelayMs: 5, timeoutMs: 1000, staleMs: 0 },
  });
  assert.equal(existsSync(lockPath), false, 'an ownerless stale lock must be reclaimed and released');

  const deadToken = 'dead-regular-file-owner';
  const ownerPath = join(staleLockRoot, `.clawgod-installer-build.lock.owner-${deadToken}`);
  writeFileSync(ownerPath, JSON.stringify({ pid: 2147483647, token: deadToken, startedAt: 1 }));
  linkSync(ownerPath, lockPath);
  await writeGeneratedPair(generatedPair('after-dead-regular-file-owner'), {
    rootDir: staleLockRoot,
    lockOptions: { retryDelayMs: 5, timeoutMs: 1000 },
  });
  assert.equal(existsSync(lockPath), false, 'a stale regular-file lock must be reclaimed and released');
  assert.equal(existsSync(ownerPath), false, 'a verified stale regular-file owner anchor must be cleaned');

  const symlinkTarget = join(staleLockRoot, 'unrelated-symlink-target');
  writeFileSync(symlinkTarget, 'must remain untouched\n');
  symlinkSync(symlinkTarget, lockPath);
  await writeGeneratedPair(generatedPair('after-stale-symlink-lock'), {
    rootDir: staleLockRoot,
    lockOptions: { retryDelayMs: 5, timeoutMs: 1000, staleMs: 0 },
  });
  assert.equal(existsSync(lockPath), false, 'a stale symlink lock must be reclaimed and released');
  assert.equal(readFileSync(symlinkTarget, 'utf8'), 'must remain untouched\n', 'reclaiming a symlink lock must not touch its target');
} finally {
  rmSync(staleLockRoot, { recursive: true, force: true });
}

const reclaimReplacementRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-lock-reclaim-replacement-'));
try {
  originalPair(reclaimReplacementRoot);
  const lockPath = join(reclaimReplacementRoot, '.clawgod-installer-build.lock');
  const deadToken = 'dead-owner-before-reclaim-race';
  const deadOwnerPath = join(reclaimReplacementRoot, `.clawgod-installer-build.lock.owner-${deadToken}`);
  writeFileSync(deadOwnerPath, JSON.stringify({ pid: 2147483647, token: deadToken, startedAt: 1 }));
  linkSync(deadOwnerPath, lockPath);

  const replacementToken = 'replacement-during-reclaim';
  const replacementOwnerPath = join(reclaimReplacementRoot, `.clawgod-installer-build.lock.owner-${replacementToken}`);
  let replacementPublished = false;
  const replacingReclaimFileSystem = new Proxy(fsPromises, {
    get(target, property) {
      if (property === 'rename') {
        return async (source, destination) => {
          const result = await target.rename(source, destination);
          if (!replacementPublished
            && String(source) === lockPath
            && String(destination).includes('.clawgod-installer-build.lock.stale-')) {
            replacementPublished = true;
            await target.writeFile(replacementOwnerPath, JSON.stringify({
              pid: process.pid,
              token: replacementToken,
              startedAt: Date.now(),
            }), { flag: 'wx' });
            await target.link(replacementOwnerPath, lockPath);
          }
          return result;
        };
      }
      return Reflect.get(target, property);
    },
  });

  await assert.rejects(
    writeGeneratedPair(generatedPair('must-not-publish-through-replacement'), {
      rootDir: reclaimReplacementRoot,
      fileSystem: replacingReclaimFileSystem,
      lockOptions: { retryDelayMs: 5, timeoutMs: 50 },
    }),
    /timed out waiting for installer build lock/i,
    'a replacement lock published during stale quarantine must remain exclusively owned',
  );
  assert.equal(replacementPublished, true, 'the stale-lock quarantine race must publish a replacement lock');
  assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).token, replacementToken, 'stale reclaim must not delete the replacement lock path');
  assert.equal(readFileSync(join(reclaimReplacementRoot, 'install.sh'), 'utf8'), 'old:install.sh\n');
  assert.equal(readFileSync(join(reclaimReplacementRoot, 'install.ps1'), 'utf8'), 'old:install.ps1\n');
} finally {
  rmSync(reclaimReplacementRoot, { recursive: true, force: true });
}

const releaseReplacementRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-lock-release-replacement-'));
try {
  originalPair(releaseReplacementRoot);
  const lockPath = join(releaseReplacementRoot, '.clawgod-installer-build.lock');
  const replacementToken = 'replacement-during-release';
  const replacementOwnerPath = join(releaseReplacementRoot, `.clawgod-installer-build.lock.owner-${replacementToken}`);
  let replacementPublished = false;
  const replacingReleaseFileSystem = new Proxy(fsPromises, {
    get(target, property) {
      if (property === 'rename') {
        return async (source, destination) => {
          const result = await target.rename(source, destination);
          if (!replacementPublished
            && String(source) === lockPath
            && String(destination).includes('.clawgod-installer-build.lock.release-')) {
            replacementPublished = true;
            await target.writeFile(replacementOwnerPath, JSON.stringify({
              pid: process.pid,
              token: replacementToken,
              startedAt: Date.now(),
            }), { flag: 'wx' });
            await target.link(replacementOwnerPath, lockPath);
          }
          return result;
        };
      }
      return Reflect.get(target, property);
    },
  });

  await writeGeneratedPair(generatedPair('published-before-release-replacement'), {
    rootDir: releaseReplacementRoot,
    fileSystem: replacingReleaseFileSystem,
  });
  assert.equal(replacementPublished, true, 'the release race must publish a replacement lock');
  assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).token, replacementToken, 'release must remove only its quarantined lock, not the replacement path');
  assert.equal(readFileSync(join(releaseReplacementRoot, 'install.sh'), 'utf8'), 'published-before-release-replacement:install.sh\n');
  assert.equal(readFileSync(join(releaseReplacementRoot, 'install.ps1'), 'utf8'), 'published-before-release-replacement:install.ps1\n');
} finally {
  rmSync(releaseReplacementRoot, { recursive: true, force: true });
}

const releaseIdentityMismatchRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-lock-release-identity-'));
try {
  originalPair(releaseIdentityMismatchRoot);
  const lockPath = join(releaseIdentityMismatchRoot, '.clawgod-installer-build.lock');
  const foreignToken = 'foreign-lock-in-release-quarantine';
  const foreignOwnerPath = join(releaseIdentityMismatchRoot, `.clawgod-installer-build.lock.owner-${foreignToken}`);
  let quarantinePath;
  const replacingQuarantineFileSystem = new Proxy(fsPromises, {
    get(target, property) {
      if (property === 'rename') {
        return async (source, destination) => {
          const result = await target.rename(source, destination);
          if (!quarantinePath
            && String(source) === lockPath
            && String(destination).includes('.clawgod-installer-build.lock.release-')) {
            quarantinePath = String(destination);
            await target.unlink(quarantinePath);
            await target.writeFile(foreignOwnerPath, JSON.stringify({
              pid: process.pid,
              token: foreignToken,
              startedAt: Date.now(),
            }), { flag: 'wx' });
            await target.link(foreignOwnerPath, quarantinePath);
          }
          return result;
        };
      }
      return Reflect.get(target, property);
    },
  });

  await assert.rejects(
    writeGeneratedPair(generatedPair('published-before-release-identity-change'), {
      rootDir: releaseIdentityMismatchRoot,
      fileSystem: replacingQuarantineFileSystem,
    }),
    /lock ownership changed during release/i,
    'release must reject a quarantine whose identity and token changed after rename',
  );
  assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).token, foreignToken, 'a foreign regular-file lock must be restored without overwrite');
  assert.equal(JSON.parse(readFileSync(quarantinePath, 'utf8')).token, foreignToken, 'an unverified quarantine must remain as explicit evidence');
} finally {
  rmSync(releaseIdentityMismatchRoot, { recursive: true, force: true });
}

const TRANSACTION_FILE = '.clawgod-installer-build.transaction.json';
for (const recoveryFault of ['published-target-remove', 'backup-restore-rename']) {
  const recoveryRoot = mkdtempSync(join(tmpdir(), `clawgod-build-recovery-${recoveryFault}-`));
  try {
    originalPair(recoveryRoot);
    let publishFailed = false;
    let recoveryFailed = false;
    const faultingRecoveryFileSystem = new Proxy(fsPromises, {
      get(target, property) {
        if (property === 'rm' && recoveryFault === 'published-target-remove') {
          return async (path, ...args) => {
            if (!recoveryFailed && String(path) === join(recoveryRoot, 'install.sh')) {
              recoveryFailed = true;
              throw new Error('injected published-target removal failure');
            }
            return target.rm(path, ...args);
          };
        }
        if (property === 'rename') {
          return async (source, destination) => {
            if (!publishFailed
              && String(source).includes('.install.ps1.stage-')
              && String(destination) === join(recoveryRoot, 'install.ps1')) {
              publishFailed = true;
              throw new Error('injected second-output publish failure');
            }
            if (String(source).includes('.backup-') && String(destination) === join(recoveryRoot, 'install.sh')) {
              if (recoveryFault === 'backup-restore-rename' && !recoveryFailed) {
                recoveryFailed = true;
                throw new Error('injected backup restore rename failure');
              }
              if (recoveryFault === 'published-target-remove' && existsSync(destination)) {
                const error = new Error('simulated Windows restore target exists');
                error.code = 'EEXIST';
                throw error;
              }
            }
            return target.rename(source, destination);
          };
        }
        return Reflect.get(target, property);
      },
    });

    await assert.rejects(
      writeGeneratedPair(generatedPair(`failed-${recoveryFault}`), {
        rootDir: recoveryRoot,
        fileSystem: faultingRecoveryFileSystem,
      }),
      /publication and rollback failed|publish failure/i,
      `${recoveryFault} must be reported as a failed publication`,
    );
    assert.equal(recoveryFailed, true, `${recoveryFault} must execute the intended recovery fault`);
    const journalPath = join(recoveryRoot, TRANSACTION_FILE);
    assert.equal(existsSync(journalPath), true, `${recoveryFault} must retain explicit transaction evidence`);
    const failedTransactionId = JSON.parse(readFileSync(journalPath, 'utf8')).id;
    await assert.rejects(
      checkGeneratedPair(generatedPair(`failed-${recoveryFault}`), { rootDir: recoveryRoot }),
      /pending installer build transaction/i,
      `${recoveryFault} transaction evidence must prevent --check from reporting clean`,
    );

    let observedRecoveredOldGeneration = false;
    const recoveryObserverFileSystem = new Proxy(fsPromises, {
      get(target, property) {
        if (property === 'writeFile') {
          return async (path, ...args) => {
            if (!observedRecoveredOldGeneration && String(path).includes('.stage-')) {
              assert.equal(readFileSync(join(recoveryRoot, 'install.sh'), 'utf8'), 'old:install.sh\n');
              assert.equal(readFileSync(join(recoveryRoot, 'install.ps1'), 'utf8'), 'old:install.ps1\n');
              const activeJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
              assert.notEqual(activeJournal.id, failedTransactionId, 'failed transaction must recover before the new transaction stages bytes');
              observedRecoveredOldGeneration = true;
            }
            return target.writeFile(path, ...args);
          };
        }
        return Reflect.get(target, property);
      },
    });
    await writeGeneratedPair(generatedPair(`recovered-${recoveryFault}`), {
      rootDir: recoveryRoot,
      fileSystem: recoveryObserverFileSystem,
    });
    assert.equal(observedRecoveredOldGeneration, true, `${recoveryFault} must recover before new staging`);
    assert.equal(readFileSync(join(recoveryRoot, 'install.sh'), 'utf8'), `recovered-${recoveryFault}:install.sh\n`);
    assert.equal(readFileSync(join(recoveryRoot, 'install.ps1'), 'utf8'), `recovered-${recoveryFault}:install.ps1\n`);
    assert.deepEqual(
      readdirSync(recoveryRoot).sort(),
      ['install.ps1', 'install.sh'],
      `${recoveryFault} recovery must clean lock, journal, stage, backup, and commit evidence`,
    );
  } finally {
    rmSync(recoveryRoot, { recursive: true, force: true });
  }
}

const cliRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-cli-'));
try {
  for (const path of [
    'build.mjs',
    'src/template/install.sh',
    'src/template/install.ps1',
    'src/generic/features.json',
    'src/generic/enhancements.json',
    'src/generic/runtime/fetch-file.mjs',
    'src/generic/runtime/fetch-package.mjs',
    'src/generic/runtime/install-ripgrep.mjs',
    'src/generic/runtime/extractor.mjs',
    'src/generic/runtime/post-processor.mjs',
    'src/generic/runtime/repatcher.mjs',
    'src/generic/runtime/wrapper.cjs',
    'src/generic/runtime/openai-proxy.cjs',
    'src/generic/runtime/claude-mem-compat.cjs',
    'src/generic/runtime/plugin-dependencies.mjs',
    'src/generic/runtime/claude-hud-statusline.mjs',
    'src/generic/patcher/entry.mjs',
    'src/generic/patcher/core.mjs',
    'src/generic/patcher/registry.mjs',
    'src/generic/patcher/enhancements/chrome.mjs',
    'src/generic/patcher/enhancements/computer-use.mjs',
    'src/generic/patcher/enhancements/agents.mjs',
    'src/generic/patcher/enhancements/planning.mjs',
    'src/generic/patcher/enhancements/voice.mjs',
    'src/generic/patcher/enhancements/auto-mode.mjs',
    'src/generic/patcher/enhancements/unrestricted-tools.mjs',
    'src/generic/patcher/enhancements/paste-images.mjs',
    'src/generic/patcher/enhancements/privacy.mjs',
    'src/generic/patcher/enhancements/branding.mjs',
  ]) {
    const destination = join(cliRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, path), destination);
  }
  writeFileSync(join(cliRoot, 'install.sh'), 'stale shell\n');
  chmodSync(join(cliRoot, 'install.sh'), 0o600);
  writeFileSync(join(cliRoot, 'install.ps1'), 'stale powershell\n');
  chmodSync(join(cliRoot, 'install.ps1'), 0o600);

  const beforeCheck = snapshot(cliRoot);
  const staleCheck = spawnSync(process.execPath, ['build.mjs', '--check'], { cwd: cliRoot, encoding: 'utf8' });
  assert.notEqual(staleCheck.status, 0, '--check must fail when an output is stale');
  assert.match(`${staleCheck.stdout}${staleCheck.stderr}`, /stale/i, '--check must identify stale output');
  assert.deepEqual(snapshot(cliRoot), beforeCheck, '--check must not write files, change modes, or create transaction files');

  const firstBuild = spawnSync(process.execPath, ['build.mjs'], { cwd: cliRoot, encoding: 'utf8' });
  assert.equal(firstBuild.status, 0, `fixture build must pass: ${firstBuild.stderr}`);
  const firstSnapshot = contentSnapshot(cliRoot);
  const secondBuild = spawnSync(process.execPath, ['build.mjs'], { cwd: cliRoot, encoding: 'utf8' });
  assert.equal(secondBuild.status, 0, `second fixture build must pass: ${secondBuild.stderr}`);
  assert.deepEqual(contentSnapshot(cliRoot), firstSnapshot, 'a second build must produce byte-identical outputs without leftover files');

  const currentCheck = spawnSync(process.execPath, ['build.mjs', '--check'], { cwd: cliRoot, encoding: 'utf8' });
  assert.equal(currentCheck.status, 0, `--check must pass after generation: ${currentCheck.stderr}`);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(cliRoot, 'install.sh')).mode & 0o777, 0o755, 'generated install.sh must be executable');
    assert.equal(statSync(join(cliRoot, 'install.ps1')).mode & 0o777, 0o644, 'generated install.ps1 must be mode 0644');
  }
} finally {
  rmSync(cliRoot, { recursive: true, force: true });
}

const featuresJson = readFileSync(join(root, 'src/generic/features.json'), 'utf8');
assert.deepEqual(JSON.parse(featuresJson), {
  tengu_harbor: true,
  tengu_session_memory: true,
  tengu_amber_flint: true,
  tengu_auto_background_agents: true,
  tengu_destructive_command_warning: true,
  tengu_immediate_model_command: true,
  tengu_desktop_upsell: false,
  tengu_malort_pedway: { enabled: true },
  tengu_amber_quartz_disabled: false,
  tengu_prompt_cache_1h_config: { allowlist: ['*'] },
  tengu_amber_redwood3: 'enabled',
}, 'canonical features.json must preserve the existing feature payload');

for (const entry of OUTPUTS) {
  const output = readFileSync(join(root, entry.output), 'utf8');
  assert.equal(output.includes(placeholder('FEATURES_JSON')), false, `${entry.output} must not retain the features placeholder`);
  assert.equal(output.split(featuresJson.trimEnd()).length - 1, 1, `${entry.output} must embed canonical features.json exactly once`);
  assert.equal(output.split(GENERATED_HEADER).length - 1, 1, `${entry.output} must contain one generated-file header`);
  const actualMode = statSync(join(root, entry.output)).mode;
  if (process.platform === 'win32') {
    assert.equal(actualMode & 0o200, entry.mode & 0o200, `${entry.output} must preserve its writable attribute`);
  } else {
    assert.equal(actualMode & 0o777, entry.mode, `${entry.output} must use its declared mode`);
  }
}

console.log('installer build contract tests passed (lock, recovery, symlink, and mode policies verified)');
