#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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
  assert.equal(statSync(join(transactionRoot, 'install.sh')).mode & 0o777, 0o755);
  assert.equal(statSync(join(transactionRoot, 'install.ps1')).mode & 0o777, 0o644);
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

const cliRoot = mkdtempSync(join(tmpdir(), 'clawgod-build-cli-'));
try {
  for (const path of ['build.mjs', 'src/template/install.sh', 'src/template/install.ps1', 'src/generic/features.json']) {
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
  assert.equal(statSync(join(cliRoot, 'install.sh')).mode & 0o777, 0o755, 'generated install.sh must be executable');
  assert.equal(statSync(join(cliRoot, 'install.ps1')).mode & 0o777, 0o644, 'generated install.ps1 must be mode 0644');
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
  assert.equal(statSync(join(root, entry.output)).mode & 0o777, entry.mode, `${entry.output} must use its declared mode`);
}

console.log('installer build contract tests passed (write/rename rollback verified)');
