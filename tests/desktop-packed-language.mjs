#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = readFileSync(new URL('../src/unix/desktop/restore-claude-3p-cu-browser.sh', import.meta.url), 'utf8');
const language = new URL('../src/unix/desktop/desktop-language.mjs', import.meta.url).pathname;
const patcher = helper.match(/<<'PACKED_LANGUAGE_EOF'\n([\s\S]*?)\nPACKED_LANGUAGE_EOF/);
assert.ok(patcher, '4.4212.0 needs a packed language preparation path');
const sha = data => createHash('sha256').update(data).digest('hex');
const digestSentinel = Buffer.from('AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A');
const integrityDigest = integrity => Buffer.from(sha(Object.keys(integrity).sort().map(key => key + integrity[key].algorithm + integrity[key].hash).join('')), 'hex');
const locales = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
function archive(entries) {
  const header = { files: {} }, data = []; let offset = 0;
  for (const [path, text] of Object.entries(entries)) {
    const bytes = Buffer.from(text), names = path.split('/'); let dir = header;
    for (const name of names.slice(0, -1)) dir = dir.files[name] ??= { files: {} };
    dir.files[names.at(-1)] = { size: bytes.length, offset: String(offset), integrity: { algorithm: 'SHA256', hash: sha(bytes), blockSize: 64, blocks: Array.from({ length: Math.max(1, Math.ceil(bytes.length / 64)) }, (_, i) => sha(bytes.subarray(i * 64, (i + 1) * 64))) } };
    data.push(bytes); offset += bytes.length;
  }
  const json = Buffer.from(JSON.stringify(header)), pad = (4 - json.length % 4) % 4, prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0); prefix.writeUInt32LE(json.length + pad + 8, 4); prefix.writeUInt32LE(json.length + pad + 4, 8); prefix.writeUInt32LE(json.length, 12);
  return { bytes: Buffer.concat([prefix, json, Buffer.alloc(pad), ...data]), hash: sha(json) };
}
function unpack(raw) {
  const header = JSON.parse(raw.subarray(16, 16 + raw.readUInt32LE(12))), start = 8 + raw.readUInt32LE(4), files = {};
  function walk(node, prefix = '') {
    for (const [name, entry] of Object.entries(node.files)) {
      const path = prefix + name;
      if (entry.files) walk(entry, path + '/');
      else {
        const data = raw.subarray(start + Number(entry.offset), start + Number(entry.offset) + entry.size);
        assert.equal(sha(data), entry.integrity.hash);
        entry.integrity.blocks.forEach((hash, i) => assert.equal(sha(data.subarray(i * entry.integrity.blockSize, (i + 1) * entry.integrity.blockSize)), hash));
        files[path] = data.toString();
      }
    }
  }
  walk(header); return files;
}
const root = mkdtempSync(join(tmpdir(), 'desktop packed language '));
try {
  for (const name of ['valid', 'ambiguous', 'corrupt', 'wrong-plist', 'wrong-version', 'corrupt-digest', 'unknown-digest', 'missing-digest', 'duplicate-digest']) {
    const app = join(root, name, 'Claude.app'), resources = join(app, 'Contents/Resources');
    mkdirSync(resources, { recursive: true });
    const script = `var langs=${locales};function valid(e){return langs.includes(e)}var fallback="en-US",startup=${locales};function choose(e,t=startup){return t.includes(e)?e:fallback}`;
    const entries = { 'assets/v1/locales.js': script, 'i18n/en-US.json': '{"greeting":"Hello","new":"New"}', 'i18n/dynamic/en-US.json': '{"model":"Model"}', 'index.html': '<html><head></head><body></body></html>', 'unchanged.txt': 'preserve this content' };
    if (name === 'ambiguous') entries['assets/v1/duplicate.js'] = script;
    const cuSource = 'var config=()=>({remote:false}),bootstrap=c=>c.remote,preference=k=>true,base=c=>({other:{value:false,on:false}}),host=x=>x,flag=false;class ThirdParty{builtinBrowserEnabled(){return true}hardcodedMainGrowthBookFeatures(){return base({builtinBrowserEnabled:this.builtinBrowserEnabled(),selfHostedSessions:host(flag)})}growthBookRemoteAllowedKeys(){return new Set}growthBookSource(){let c=config();if(!bootstrap(c))return{kind:"static",features:this.hardcodedMainGrowthBookFeatures()};return{kind:"remote"}}}function enabled(e={}){return!platform()||hipaa()?!1:available(e)&&preference("chicagoEnabled")}function start(){let c=currentProvider().growthBookSource();if(c.kind==="static"){applyFeatures(c.features,"map-final");return}}function changed(input,old,next){input.data==="chicagoEnabled"&&old!==next.data&&(refresh(),Promise.resolve().then(()=>{}))}';
    const main = archive({ '.vite/build/main.js': cuSource }), ion = archive(entries);
    // 官方打包后签名的 unpacked 原生模块长度可能不同于 ASAR 记录。
    const mainHeader = JSON.parse(main.bytes.subarray(16, 16 + main.bytes.readUInt32LE(12)));
    mainHeader.files['native.node'] = { size: 1, unpacked: true, integrity: { algorithm: 'SHA256', hash: sha('x'), blockSize: 64, blocks: [sha('x')] } };
    mainHeader.files['duplicate-main.js'] = structuredClone(mainHeader.files['.vite'].files.build.files['main.js']);
    const headerBytes = Buffer.from(JSON.stringify(mainHeader)), headerPad = (4 - headerBytes.length % 4) % 4, headerPrefix = Buffer.alloc(16);
    headerPrefix.writeUInt32LE(4, 0); headerPrefix.writeUInt32LE(headerBytes.length + headerPad + 8, 4); headerPrefix.writeUInt32LE(headerBytes.length + headerPad + 4, 8); headerPrefix.writeUInt32LE(headerBytes.length, 12);
    main.bytes = Buffer.concat([headerPrefix, headerBytes, Buffer.alloc(headerPad), main.bytes.subarray(8 + main.bytes.readUInt32LE(4))]);
    main.hash = sha(headerBytes);
    mkdirSync(join(app, 'Contents/MacOS'));
    writeFileSync(join(app, 'Contents/MacOS/Claude'), Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
    mkdirSync(join(resources, 'app.asar.unpacked'));
    writeFileSync(join(resources, 'app.asar.unpacked/native.node'), 'signed native bytes');
    if (name === 'corrupt') ion.bytes[ion.bytes.length - 1] ^= 1;
    writeFileSync(join(resources, 'app.asar'), main.bytes); writeFileSync(join(resources, 'ion-dist.asar'), ion.bytes);
    const plist = { CFBundleShortVersionString: name === 'wrong-version' ? '4.9999.0' : '4.4212.0', CFBundleVersion: '4.4212.0', CFBundleIdentifier: 'com.anthropic.claudefordesktop', ElectronAsarIntegrity: { 'Resources/app.asar': { algorithm: 'SHA256', hash: main.hash }, 'Resources/ion-dist.asar': { algorithm: 'SHA256', hash: name === 'wrong-plist' ? '0'.repeat(64) : ion.hash } } };
    const frameworkDir = join(app, 'Contents/Frameworks/Electron Framework.framework/Versions/A');
    mkdirSync(frameworkDir, { recursive: true });
    const frameworkPath = join(frameworkDir, 'Electron Framework');
    const slot = Buffer.concat([digestSentinel, Buffer.from([1, name === 'unknown-digest' ? 2 : 1]), integrityDigest(plist.ElectronAsarIntegrity)]);
    if (name === 'corrupt-digest') slot[34] ^= 1;
    const framework = Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), name === 'missing-digest' ? Buffer.alloc(66) : slot, name === 'duplicate-digest' ? slot : Buffer.from('unchanged framework code')]);
    writeFileSync(frameworkPath, framework, { mode: 0o755 });
    const plistPath = join(app, 'Contents/Info.plist');
    const p = spawnSync('python3', ['-I', '-c', 'import sys,json,plistlib;plistlib.dump(json.load(sys.stdin),open(sys.argv[1],"wb"))', plistPath], { input: JSON.stringify(plist) });
    assert.equal(p.status, 0, p.stderr.toString());
    const beforePlist = readFileSync(plistPath);
    const run = () => spawnSync('python3', ['-I', '-', app, language, process.execPath], { input: patcher[1], encoding: 'utf8' });
    const result = run();
    if (name !== 'valid') {
      assert.notEqual(result.status, 0, `${name} must refuse`);
      assert.deepEqual(readFileSync(join(resources, 'app.asar')), main.bytes);
      assert.deepEqual(readFileSync(join(resources, 'ion-dist.asar')), ion.bytes);
      assert.deepEqual(readFileSync(plistPath), beforePlist);
      assert.deepEqual(readFileSync(frameworkPath), framework);
      continue;
    }
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(readFileSync(join(resources, 'app.asar')), main.bytes, 'native browser/CU policies must remain unchanged');
    const output = readFileSync(join(resources, 'ion-dist.asar')), files = unpack(output);
    assert.match(files['assets/v1/locales.js'], /zh-Hans/);
    assert.ok(JSON.parse(files['i18n/zh-Hans.json']).greeting);
    assert.ok(JSON.parse(files['i18n/dynamic/zh-Hans.json']).model);
    assert.equal(files['unchanged.txt'], entries['unchanged.txt']);
    const verifyPlist = spawnSync('python3', ['-I', '-c', 'import sys,plistlib,json;print(json.dumps(plistlib.load(open(sys.argv[1],"rb"))))', plistPath], { encoding: 'utf8' });
    const updated = JSON.parse(verifyPlist.stdout);
    assert.equal(updated.ElectronAsarIntegrity['Resources/app.asar'].hash, main.hash);
    assert.equal(updated.ElectronAsarIntegrity['Resources/ion-dist.asar'].hash, sha(output.subarray(16, 16 + output.readUInt32LE(12))));
    const updatedFramework = readFileSync(frameworkPath);
    assert.deepEqual(updatedFramework.subarray(38, 70), integrityDigest(updated.ElectronAsarIntegrity), 'Electron must accept the updated plist integrity dictionary at startup');
    assert.deepEqual(updatedFramework.subarray(0, 38), framework.subarray(0, 38), 'keep digest validation enabled');
    assert.deepEqual(updatedFramework.subarray(70), framework.subarray(70), 'framework code must remain unchanged');
    assert.equal(statSync(frameworkPath).mode & 0o777, 0o755, 'preserve executable framework permissions');
    assert.equal(run().status, 0, 'packed transform must support repeat preparation');
    assert.deepEqual(readFileSync(join(resources, 'ion-dist.asar')), output, 'rerun must preserve archive bytes');
    assert.deepEqual(readFileSync(frameworkPath), updatedFramework, 'rerun must preserve the framework digest');
    const ownership = join(resources, 'clawgod-language.json');
    assert.ok((await import('node:fs')).existsSync(ownership), 'packed changes must record application ownership');
    const record = JSON.parse(readFileSync(ownership));
    writeFileSync(ownership, JSON.stringify({ ...record, build: 'other-build' }));
    const refused = run();
    assert.notEqual(refused.status, 0, 'mismatched ownership must refuse before writes');
    assert.deepEqual(readFileSync(join(resources, 'ion-dist.asar')), output);
    writeFileSync(ownership, JSON.stringify(record));
  }
  if (process.platform === 'darwin') {
    const source = join(root, 'valid', 'Claude.app');
    const bin = join(root, 'bin'); mkdirSync(bin);
    const shell = join(root, 'helper.sh'); writeFileSync(shell, helper);
    writeFileSync(join(root, 'desktop-language.mjs'), readFileSync(language));
    writeFileSync(join(root, 'desktop-zh-Hans.json'), '{"schemaVersion":1,"locale":"zh-Hans","base":{"greeting":"你好"},"dynamic":{"model":"模型"}}');
    const { chmodSync, existsSync } = await import('node:fs');
    for (const [name, script] of Object.entries({
      codesign: '[ "${SIGN_FAIL:-0}" = 1 ] && [ "$1" = --force ] && exit 72\nif [ -n "${MUTATE_APP:-}" ] && [ "$1" = --force ]; then printf "concurrent change" > "$MUTATE_APP/Contents/Resources/app.asar"; fi\nexit 0',
      ps: 'printf "%s\\n" "${RUNNING_DESKTOP:-/no-running-app}"',
      pgrep: 'exit 1',
      open: 'exit 99',
      osascript: 'exit 99',
    })) { const path = join(bin, name); writeFileSync(path, '#!/bin/sh\n' + script + '\n'); chmodSync(path, 0o700); }
    const env = { ...process.env, HOME: join(root, 'home'), PATH: `${bin}:${process.env.PATH}`, CLAWGOD_BUN_BIN: process.execPath };
    const candidate = join(root, 'prepared.app');
    const prepare = spawnSync('/bin/bash', [shell, '--prepare', source, candidate], { env, encoding: 'utf8' });
    assert.equal(prepare.status, 0, prepare.stdout + prepare.stderr);
    assert.ok(existsSync(join(candidate, 'Contents/Resources/ion-dist.asar')));
    const cuCandidate = join(root, 'prepared-cu.app');
    const sourceIon = readFileSync(join(source, 'Contents/Resources/ion-dist.asar'));
    const sourceMain = readFileSync(join(source, 'Contents/Resources/app.asar'));
    const cu = spawnSync('/bin/bash', [shell, '--prepare-cu', source, cuCandidate], { env, encoding: 'utf8' });
    assert.equal(cu.status, 0, cu.stdout + cu.stderr);
    assert.deepEqual(readFileSync(join(source, 'Contents/Resources/app.asar')), sourceMain, 'CU preparation must leave the installed source untouched');
    assert.deepEqual(readFileSync(join(cuCandidate, 'Contents/Resources/ion-dist.asar')), sourceIon, 'CU must preserve all existing language resources');
    const cuMain = readFileSync(join(cuCandidate, 'Contents/Resources/app.asar'));
    assert.notDeepEqual(cuMain, sourceMain);
    const cuHeader = JSON.parse(cuMain.subarray(16, 16 + cuMain.readUInt32LE(12)));
    assert.equal(cuHeader.files['native.node'].unpacked, true);
    assert.equal(Object.hasOwn(cuHeader.files['native.node'], 'offset'), false, 'unpacked native modules must not acquire packed offsets');
    assert.equal(cuHeader.files['native.node'].size, 1, 'preserve original unpacked metadata');
    const cuOwnership = JSON.parse(readFileSync(join(cuCandidate, 'Contents/Resources/clawgod-language.json')));
    assert.equal(cuOwnership.main, sha(cuMain));
    const cuRecord = JSON.parse(readFileSync(join(cuCandidate, 'Contents/Resources/clawgod-cu.json')));
    assert.equal(cuRecord.before, sha(sourceMain));
    assert.equal(cuRecord.after, sha(cuMain));
    const repeated = spawnSync('/bin/bash', [shell, '--prepare-cu', cuCandidate, join(root, 'repeated-cu.app')], { env, encoding: 'utf8' });
    assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
    assert.deepEqual(readFileSync(join(root, 'repeated-cu.app/Contents/Resources/app.asar')), cuMain);
    const cuBad = join(root, 'bad-cu-ownership.app');
    const { cpSync: copyApp } = await import('node:fs');
    copyApp(cuCandidate, cuBad, { recursive: true });
    const badRecordPath = join(cuBad, 'Contents/Resources/clawgod-cu.json');
    writeFileSync(badRecordPath, JSON.stringify({ ...cuRecord, mode: 'unrelated-mode' }));
    const invalidCu = spawnSync('/bin/bash', [shell, '--prepare-cu', cuBad, join(root, 'bad-cu-output.app')], { env, encoding: 'utf8' });
    assert.notEqual(invalidCu.status, 0, 'unknown CU ownership mode must refuse');
    assert.equal(existsSync(join(root, 'bad-cu-output.app')), false);
    const drifting = join(root, 'drifting-source.app');
    copyApp(source, drifting, { recursive: true });
    const driftingOutput = join(root, 'drifting-output.app');
    const drifted = spawnSync('/bin/bash', [shell, '--prepare-cu', drifting, driftingOutput], { env: { ...env, MUTATE_APP: drifting }, encoding: 'utf8' });
    assert.notEqual(drifted.status, 0, 'source changed during CU preparation must not publish');
    assert.equal(existsSync(driftingOutput), false);
    const nested = spawnSync('/bin/bash', [shell, '--prepare-cu', source, join(source, 'nested.app')], { env, encoding: 'utf8' });
    assert.notEqual(nested.status, 0, 'a candidate inside the source application must be refused');
    const failed = join(root, 'failed.app');
    const denied = spawnSync('/bin/bash', [shell, '--prepare', source, failed], { env: { ...env, SIGN_FAIL: '1' }, encoding: 'utf8' });
    assert.notEqual(denied.status, 0, 'sign failure must not publish a candidate');
    assert.equal(existsSync(failed), false);
    const { symlinkSync } = await import('node:fs');
    const unsafe = join(root, 'unsafe', 'Claude.app'); mkdirSync(unsafe, { recursive: true });
    symlinkSync(join(source, 'Contents'), join(unsafe, 'Contents'));
    const unsafeResult = spawnSync('/bin/bash', [shell, '--prepare', unsafe, join(root, 'unsafe-candidate.app')], { env, encoding: 'utf8' });
    assert.notEqual(unsafeResult.status, 0, 'symlinked application resource roots must not be modified or signed');
    assert.equal(existsSync(join(root, 'unsafe-candidate.app')), false);
    const beforeRunning = readFileSync(join(source, 'Contents/Resources/ion-dist.asar'));
    const running = spawnSync('/bin/bash', [shell, '--install', source], { env: { ...env, RUNNING_DESKTOP: `${source}/Contents/MacOS/Claude` }, encoding: 'utf8' });
    assert.equal(running.status, 0, running.stdout + running.stderr);
    assert.deepEqual(readFileSync(join(source, 'Contents/Resources/ion-dist.asar')), beforeRunning);
    assert.equal(existsSync(join(env.HOME, 'Library/Application Support/Claude-3p')), false, 'running app must be skipped before creating backups');
    const aliasRoot = join(root, 'source-alias');
    symlinkSync(join(root, 'valid'), aliasRoot);
    for (const alias of [join(aliasRoot, 'Claude.app'), join(root, 'valid', 'claude.app')]) {
      if (!existsSync(alias) || statSync(alias).ino !== statSync(source).ino) continue;
      const aliasHome = join(root, 'alias-home');
      const result = spawnSync('/bin/bash', [shell, '--install', alias], { env: { ...env, HOME: aliasHome, RUNNING_DESKTOP: `${source}/Contents/MacOS/Claude` }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /正在运行/, '路径别名也必须识别运行中的同一应用');
      assert.equal(existsSync(join(aliasHome, 'Library')), false, '路径别名不得绕过退出检查并创建备份');
      assert.deepEqual(readFileSync(join(source, 'Contents/Resources/ion-dist.asar')), beforeRunning);
    }
    const { cpSync, unlinkSync } = await import('node:fs');
    const concurrentApp = join(root, 'concurrent', 'Claude.app');
    cpSync(source, concurrentApp, { recursive: true });
    const concurrent = spawnSync('/bin/bash', [shell, '--install', concurrentApp], { env: { ...env, HOME: join(root, 'concurrent-home'), MUTATE_APP: concurrentApp }, encoding: 'utf8' });
    assert.notEqual(concurrent.status, 0, 'source changed during preparation must not be overwritten');
    assert.equal(readFileSync(join(concurrentApp, 'Contents/Resources/app.asar'), 'utf8'), 'concurrent change');
    const trailingApp = join(root, 'trailing', 'Claude.app');
    cpSync(source, trailingApp, { recursive: true });
    const trailingHome = join(root, 'trailing-home');
    const trailing = spawnSync('/bin/bash', [shell, '--install', trailingApp + '/'], { env: { ...env, HOME: trailingHome, RUNNING_DESKTOP: `${trailingApp}/Contents/MacOS/Claude` }, encoding: 'utf8' });
    assert.equal(existsSync(join(trailingHome, 'Library')), false, 'a trailing slash must not bypass the running-app guard or create a backup');
    assert.notEqual(trailing.status, 0, 'noncanonical install paths must be refused');
    const missingApp = join(root, 'missing-layout', 'Claude.app');
    cpSync(source, missingApp, { recursive: true });
    unlinkSync(join(missingApp, 'Contents/Resources/ion-dist.asar'));
    const missingHome = join(root, 'missing-home');
    const missing = spawnSync('/bin/bash', [shell, '--install', missingApp], { env: { ...env, HOME: missingHome }, encoding: 'utf8' });
    assert.notEqual(missing.status, 0, '4.x missing its language archive must refuse');
    assert.equal(existsSync(join(missingHome, 'Library')), false, '4.x must never enter the legacy mutating fallback');
    const badArgs = spawnSync('/bin/bash', [shell, '--typo', source], { env });
    assert.notEqual(badArgs.status, 0);
  } else {
    console.log('macOS Desktop shell integration skipped; portable archive checks passed');
  }
  console.log('Packed Desktop: language, dual integrity, unchanged main policies, drift refusal, candidates and running-app guards passed');
} finally { rmSync(root, { recursive: true, force: true }); }
