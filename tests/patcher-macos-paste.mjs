#!/usr/bin/env bun
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

// Paste for macOS can emit TIFF paths (for example, Paste.app stores copied
// browser images as .tiff files). The direct decoder does not support TIFF,
// but classifying the path as an image lets the existing macOS clipboard
// fallback convert the clipboard contents to PNG.
const imageExtensionFixture = `
var unrelatedI=/\\.(png|jpe?g|gif|webp)$/i;
var unrelatedFlags=/\\.(png|jpe?g|gif|webp)$/ig;
var unr=/\\.(png|jpe?g|gif|webp)$/i;VAu=/^(?:[A-Za-z]:\\\\|\\\\\\\\)/;
`;

// Exercise the combined behavior rather than only checking replacement text:
// a shell-escaped TIFF path is classified as an image, direct decoding returns
// null, and the patched macOS branch reads the clipboard instead of typing the
// raw path.
const tiffFallbackFixture = `
var unr=/\\.(png|jpe?g|gif|webp)$/i;VAu=/^(?:[A-Za-z]:\\\\|\\\\\\\\)/;
const calls=[];
function zAu(path){return unr.test(path)}
function KAu(){return Promise.resolve(null)}
function m(){calls.push("clipboard")}
function g(path){calls.push("text:"+path)}
function y(){}
function We(){}
function paste(x,d){if(zAu(x)){let W=[x],P=[];Promise.all(W.map(KAu)).then((R)=>{let q=R.filter((v)=>v!==null);if(q.length>0||P.length>0){}else if(N&&d)m();else We("input_image_drag","read_failed"),g(x),y()});return}g(x)}
paste("/tmp/Google\\\\ Chrome.tiff",true);
setTimeout(()=>console.log(JSON.stringify(calls)),0);
`;

const imageUrl = 'http://localhost:1024/team-bucket/recruit/HomeCarousel/d76d682171e948de9f9de4e875adb898_1920_7401678809233071.jpg';
const imageUrlPasteFixture = `
var unr=/\\.(png|jpe?g|gif|webp|tiff?)$/i;VAu=/^(?:[A-Za-z]:\\\\|\\\\\\\\)/;
const calls=[];
function qls(value){return value}
function jls(value){return value}
function zAu(value){let quoted=qls(value.trim()),path=jls(quoted);return unr.test(path)}
function KAu(){return Promise.resolve(null)}
function m(){calls.push("clipboard")}
function g(value){calls.push("text:"+value)}
function y(){}
function We(){}
function paste(value,d){if(zAu(value)){let W=[value],P=[];Promise.all(W.map(KAu)).then((R)=>{let q=R.filter((item)=>item!==null);if(q.length>0||P.length>0){}else if(N&&d)m();else We("input_image_drag","read_failed"),g(value),y()});return}g(value)}
paste(${JSON.stringify(imageUrl)},true);
setTimeout(()=>console.log(JSON.stringify(calls)),0);
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

    // TIFF paths must enter the image pipeline. Direct TIFF decoding may fail,
    // after which the existing macOS clipboard reader supplies a PNG.
    writeFileSync(join(dir, 'cli.original.cjs'), imageExtensionFixture, 'utf8');
    run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: ${output}`);
    patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    assert.match(
      patched,
      /var unr=\/\\\.\(png\|jpe\?g\|gif\|webp\|tiff\?\)\$\/i/,
      `${name}: image path detection must include TIFF so macOS can use clipboard fallback`,
    );
    assert.ok(
      patched.includes('var unrelatedI=/\\.(png|jpe?g|gif|webp)$/i'),
      `${name}: TIFF patch must not rewrite an unrelated regex with the same flags`,
    );
    assert.ok(
      patched.includes('var unrelatedFlags=/\\.(png|jpe?g|gif|webp)$/ig'),
      `${name}: TIFF patch must not partially rewrite regexes with extra flags`,
    );

    writeFileSync(join(dir, 'cli.original.cjs'), tiffFallbackFixture, 'utf8');
    run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: ${output}`);
    const behavior = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(behavior.status, 0, `${name}: ${behavior.stdout}${behavior.stderr}`);
    assert.equal(
      behavior.stdout.trim(),
      '["clipboard"]',
      `${name}: TIFF decode failure on macOS must read the clipboard instead of typing the path`,
    );

    writeFileSync(join(dir, 'cli.original.cjs'), imageUrlPasteFixture, 'utf8');
    run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: ${output}`);
    const urlBehavior = spawnSync(process.execPath, ['cli.original.cjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(urlBehavior.status, 0, `${name}: ${urlBehavior.stdout}${urlBehavior.stderr}`);
    assert.equal(
      urlBehavior.stdout.trim(),
      JSON.stringify([`text:${imageUrl}`]),
      `${name}: HTTP image URLs must remain text instead of triggering the image clipboard fallback`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher macOS paste checks passed');
