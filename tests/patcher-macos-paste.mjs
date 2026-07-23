#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const unixInstaller = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function extractUnixPatcher() {
  const marker = 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'';
  const start = unixInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed patch.mjs');
  const bodyStart = unixInstaller.indexOf('\n', start) + 1;
  const end = unixInstaller.indexOf('\nPATCHER_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh patcher heredoc must end');
  return unixInstaller.slice(bodyStart, end);
}

function extractPowerShellPatcher() {
  const marker = "$patcherCode = @'\n";
  const start = powerShellInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must embed patch.mjs');
  const bodyStart = start + marker.length;
  const end = powerShellInstaller.indexOf("\n'@\n\nSet-Content", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 patcher here-string must end');
  return powerShellInstaller.slice(bodyStart, end);
}

// Pre-v2.2 paste handler: the clipboard-read fallback was gated behind the
// TemporaryItems screenshot-path check (N&&d), so other image paths got typed
// as raw text when file reads failed.
const legacyPasteFixture = `
function paste(x){if(isImagePath(x)){let W=[],P=[];if(W.length>0||P.length>0){display(W,P)}else if(N&&d)m();else We("input_image_drag","read_failed"),g(x),y()}}
`;

// Current paste handler: the clipboard-read fallback is already unconditional
// upstream (else if(d)m()), but the image processor loader N8e only tries the
// vendored native image-processor.node behind the standalone-executable gate
// (WE). clawgod forces that gate to false, so under Bun the loader falls
// through to import("sharp") — not installed — and KAu throws, which makes the
// paste handler's .catch type the raw temp PNG path as text.
const imageProcessorFixture = `
async function N8e(){if(tco)return tco.default;if(WE())try{let r=await Promise.resolve().then(() => (Blo(),Flo)),n=r.sharp||r.default;return tco={default:n},n}catch{console.warn("Native image processor not available, falling back to sharp")}let e=await Promise.resolve().then(() => R(vAu(),1)),t=gGg(e);return tco={default:t},t}
`;

for (const [name, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-macos-paste-'));
  try {
    writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');

    // Legacy paste handler fallback patch still applies to old bundles.
    writeFileSync(join(dir, 'cli.original.cjs'), legacyPasteFixture, 'utf8');
    let run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    let output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: ${output}`);
    let patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.match(
      patched,
      /else if\(d\)m\(\);else We\("input_image_drag","read_failed"\),g\(x\),y\(\)/,
      `${name}: macOS image paste fallback must read the clipboard for any failed image path`,
    );

    // Image processor loader must try the vendored native module even when
    // the standalone-executable predicate is patched to false.
    writeFileSync(join(dir, 'cli.original.cjs'), imageProcessorFixture, 'utf8');
    run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: ${output}`);
    patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.ok(
      !patched.includes('if(WE())try{'),
      `${name}: image processor loader must not be gated by the standalone check`,
    );
    assert.match(
      patched,
      /return tco\.default;try\{let r=await Promise\.resolve\(\)\.then\(\(\) => \(Blo\(\),Flo\)\)/,
      `${name}: native image processor branch must be tried unconditionally`,
    );
    assert.ok(
      patched.includes('Native image processor not available, falling back to sharp'),
      `${name}: npm sharp fallback must be preserved`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher macOS paste checks passed');
