#!/usr/bin/env bun
// Original Cometix addon, pinned by source commit and SHA-256. No model setup.
// The native addon uses its upstream network service; it is NOT offline ASR.
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fetchWithProxy } from './proxy-fetch.mjs';

const commit = '68fd5465eb631ff8180631f37ca0046a2b38c85a';
const hashes = Object.freeze({
  'index.js': 'dd8c63ee0e45fe8e99329e5224108457e4abfbc252a85790520bae242314f74b',
  'package.json': '93955600a167d9adbcd94f3fdf92d448feb4582d4abe09b044b51a6fce8581d8',
  'PROVENANCE.txt': 'dc143c5bf65d2c9d507074d9e5992acbf6f00fc9406d4f2c1844be53b0ce962a',
  'libcometix-asr.darwin-arm64.node': '6a0a02e48b615f7914f53211c761cb9f91b5b09cfd09d56adfb4db4be84a754a',
  'libcometix-asr.darwin-x64.node': '1e8070ba8ac56ebbf78e1a77071386df8cfd46ba2e4233ee36174fa8b979b193',
  'libcometix-asr.linux-x64-gnu.node': '1540730bf8b5ecca36658326689c5025fad468c0710d821679bfaf6988951055',
  'libcometix-asr.win32-x64-msvc.node': 'e26b26abddc8193e3a097b34d822f6fa5d877acebdf0713021a15a2741ac3974',
});
export function voiceAsrFiles(target) {
  const suffix = { 'darwin-arm64':'darwin-arm64', 'darwin-x64':'darwin-x64', 'linux-x64':'linux-x64-gnu', 'win32-x64':'win32-x64-msvc' }[target];
  if (!suffix) throw new Error(`Cometix ASR unsupported platform: ${target}; original upstream has no addon for this target`);
  return ['package.json', 'index.js', 'PROVENANCE.txt', `libcometix-asr.${suffix}.node`];
}
export function verifyVoiceAsrFile(name, bytes) {
  if (!Object.hasOwn(hashes, name) || createHash('sha256').update(bytes).digest('hex') !== hashes[name]) throw new Error(`Cometix ASR checksum mismatch: ${name}`);
}
async function status(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(info, path) {
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing non-directory or symlink: ${path}`);
}
function checkAddon(path) {
  // Load only. Never call startSession/ensureDid or capture audio during install.
  const result = Bun.spawnSync([process.execPath, '-e', `const m=require(process.argv[1]);for(const k of ['startSession','feedPcm','finalizeSession','closeSession','isConnected'])if(typeof m[k]!=='function')throw Error('Missing ASR export: '+k)`, path], { stdout:'pipe', stderr:'pipe', timeout:15000 });
  if (result.exitCode !== 0) throw new Error(`Cometix ASR cannot load in Bun: ${result.stderr.toString().slice(0,1000)}`);
}
export async function installVoiceAsr(root, { target = `${process.platform}-${process.arch}`, download = fetchWithProxy } = {}) {
  const files = voiceAsrFiles(target);
  if (target === 'linux-x64' && process.platform === 'linux' && !process.report?.getReport?.().header?.glibcVersionRuntime) throw new Error('Cometix ASR requires glibc; upstream has no musl addon');
  directory(await status(root), root);
  const vendor = join(root,'vendor'), destination = join(vendor,'cometix-asr');
  if (!await status(vendor)) await mkdir(vendor, {mode:0o700});
  directory(await status(vendor), vendor);
  const existing = await status(destination);
  if (existing) {
    directory(existing, destination);
    try {
      const names=await readdir(destination);
      if (names.length!==files.length || names.some(n=>!files.includes(n))) throw new Error('unexpected addon files');
      for (const name of files) {
        const path=join(destination,name), info=await status(path);
        if (!info?.isFile() || info.isSymbolicLink()) throw new Error('unsafe addon file');
        verifyVoiceAsrFile(name,await readFile(path));
      }
    } catch (error) { throw new Error(`Existing Cometix ASR directory preserved: ${error.message}`); }
    checkAddon(destination);
    return 'Cometix ASR already verified (Bun load-only)';
  }
  const staging=await mkdtemp(join(vendor,'.cometix-asr-'));
  try {
    for (const name of files) {
      const response=await download(`https://raw.githubusercontent.com/CometixSpace/claude-code/${commit}/patcher/assets/cometix-asr/${name}`, {signal:AbortSignal.timeout(60000)});
      if (!response.ok || !response.body) throw new Error(`Cometix ASR download failed: ${name} HTTP ${response.status}`);
      const chunks=[];let size=0;
      for await (const chunk of response.body) {
        size+=chunk.byteLength;
        if (size>5*1024*1024) throw new Error(`Cometix ASR download too large: ${name}`);
        chunks.push(Buffer.from(chunk));
      }
      const bytes=Buffer.concat(chunks);verifyVoiceAsrFile(name,bytes);
      await writeFile(join(staging,name),bytes,{flag:'wx',mode:0o600});
    }
    checkAddon(staging);
    if (await status(destination)) throw new Error('Existing Cometix ASR directory appeared during install; preserved');
    await rename(staging,destination);
    return 'Cometix ASR installed and verified (Bun load-only; network transcription not tested)';
  } finally { await rm(staging,{recursive:true,force:true}); }
}
if (import.meta.main) {
  try {
    const root=resolve(process.argv[2] || dirname(fileURLToPath(import.meta.url)));
    const {loadEnhancementManifest,readEnhancementConfig,resolveEnhancementSelection}=await import(pathToFileURL(join(root,'enhancement-config.mjs')).href);
    const manifest=loadEnhancementManifest(await readFile(join(root,'enhancement-manifest.json'),'utf8'));
    const stored=await readEnhancementConfig({homeDir:dirname(root),manifest});
    const selected=resolveEnhancementSelection({stored},manifest).enabled.includes('voice');
    const {loadFeatureGates}=createRequire(import.meta.url)(join(root,'feature-gates.cjs'));
    const gates=loadFeatureGates(root);
    const enabled=['voice-asr-backend','voice-mode','enable-voice-mode'].every(id=>gates[id]!==false);
    if (selected && enabled && process.env.CLAUDE_CODE_ASR!=='0' && !await status(join(root,'patch-fallback.json'))) console.log(await installVoiceAsr(root));
    else console.log('Cometix ASR setup skipped (voice disabled or compatibility fallback)');
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
