#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { seedPatcherAcorn } from './patcher-test-sources.mjs';
import { cometixPatches } from '../src/generic/patcher/enhancements/cometix.mjs';
import { loadAcorn } from '../src/generic/patcher/core.mjs';
const rootDir = mkdtempSync(join(tmpdir(), 'clawgod-voice-'));
seedPatcherAcorn(rootDir);
try {
  const descriptor = cometixPatches.find(p => p.id === 'voice-asr-backend');
  assert.ok(descriptor, 'original ASR patch belongs to voice enhancement');
  const source = `async function connect(callbacks,options,other){let msg="No OAuth token available",url="VOICE_STREAM_BASE_URL";return "stock"}
var command={name:"voice",availability:["claude-ai"]},other={name:"other",availability:["claude-ai"]};
function auth(){if(!account())return false;let token=credentials();return token!==null&&token.accessToken!==null}function account(){return false}function credentials(){return null}function call(){if(!auth())return{type:"text",value:"Voice mode requires a Claude.ai account. Please run /login to sign in."};return "allowed"}
function voiceAuthProbe(){try{if(!account())return false;return auth()}catch{return false}}function voiceFlag(){return feature("allow_voice_mode")}function voiceGate(){return voiceAuthProbe()&&voiceFlag()}function feature(){return false}
export {connect,command,other,call,voiceAuthProbe,voiceFlag};`;
  // 2.1.292 把 URL 配置移到辅助函数，连接闭包不再包含旧锚点。
  const transport292 = readFileSync(new URL('./fixtures/voice-transport-2.1.292.txt', import.meta.url), 'utf8');
  for (const input of [transport292, source + '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n' + transport292]) {
    const upgradedTransport = await descriptor.apply(input, { rootDir });
    assert.equal(upgradedTransport.status, 'applied', upgradedTransport.detail);
    const transport = upgradedTransport.code.split('\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n').at(-1);
    assert.match(transport, /async function __ccppAsrConnect/, '真实新版连接模块必须注入 ASR，而非仅修改开关');
    assert.match(transport, /async function sDr\(e,o,d\)\{if\([^;]+return __ccppAsrConnect\(e,o\);/);
    assert.match(transport, /function oDr\(\)\{if\([^;]+return!0;/, '传输可用性与连接使用同一后端');
    assert.equal((await descriptor.apply(upgradedTransport.code, { rootDir })).status, 'already');
    assert.equal((await descriptor.apply(input, { rootDir, dryRun: true })).code, input);
  }
  const unknownTransport = await descriptor.apply(source + '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n' + transport292.replace('use_conversation_engine', 'unknown_protocol'), { rootDir });
  assert.equal(unknownTransport.status, 'failed', '未知连接形态不能仅凭开关修改报告成功');
  assert.equal(unknownTransport.code, undefined, '整包失败时不输出部分改写');
  const result = await descriptor.apply(source, { rootDir });
  assert.equal(result.status, 'applied', result.detail);
  assert.equal((await descriptor.apply(result.code, {rootDir})).status, 'already');
  assert.equal((await descriptor.apply(source, {rootDir,dryRun:true})).code, source);
  const legacy = result.code.replace('/*__clawgod_cometix_voice-asr-backend_v2__*/','/*__clawgod_cometix_voice-asr-backend__*/')
    .replace(/(function voiceAuthProbe\(\)\{)if\(.*?return!0;/,'$1')
    .replace(/(function voiceFlag\(\)\{)if\(.*?return!0;/,'$1');
  const upgraded=await descriptor.apply(legacy,{rootDir});assert.equal(upgraded.status,'applied',upgraded.detail);
  assert.equal(upgraded.code.match(/async function __ccppAsrConnect/g).length,1,'upgrade must not duplicate the adapter');
  assert.match(upgraded.code,/function voiceAuthProbe\(\)\{if\(/);
  assert.equal((await descriptor.apply(upgraded.code,{rootDir})).status,'already');
  const fixtureRoot=join(rootDir,'fixture');mkdirSync(fixtureRoot);
  const vendor = join(fixtureRoot,'vendor','cometix-asr');
  mkdirSync(vendor,{recursive:true});
  writeFileSync(join(vendor,'index.js'), `exports.startSession=(config,cb)=>{globalThis.asrCallback=cb;globalThis.asrConfig=config;return 7};exports.feedPcm=(id,pcm)=>{globalThis.asrPcm=pcm};exports.finalizeSession=()=>{};exports.closeSession=()=>{globalThis.asrClosed=true};`);
  for (const [index,subdir] of ['', 'chunks'].entries()) {
    const dir=join(fixtureRoot,subdir);mkdirSync(dir,{recursive:true});
    const file=join(dir,'voice.mjs');writeFileSync(file,result.code);
    const mod=await import(pathToFileURL(file).href);
    // 执行真实新版连接闭包，原生依赖由本测试的 vendor 替代；不能只检查注入字符串。
    const patched292 = await descriptor.apply(transport292, { rootDir });
    const acorn = await loadAcorn(rootDir);
    const ast292 = acorn.parse(patched292.code, { ecmaVersion: 'latest', sourceType: 'module' });
    const connector292 = ast292.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'sDr');
    const availability292 = ast292.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'oDr');
    const adapter292 = ast292.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === '__ccppAsrConnect');
    const file292=join(dir,'voice292.mjs');
    writeFileSync(file292,'function Gl(){return false}function mn(){return null}function B(){return false}async function sa(){}function t(){}\n'
      +[availability292,adapter292,connector292].map(n=>patched292.code.slice(n.start,n.end)).join('\n')+'\nexport {sDr,oDr};');
    const mod292=await import(pathToFileURL(file292).href);
    const preview292=[];
    const api292=await mod292.sDr({onTranscript:(...value)=>preview292.push(value),onError:msg=>assert.fail(msg)},{});
    assert.ok(api292, '真实新版连接入口必须返回替代 ASR');assert.equal(mod292.oDr(),true);
    globalThis.asrCallback(null,JSON.stringify({type:'transcript',text:'新版识别',display:'新版识别',stage:'interim'}));
    const done292=api292.finalize();
    globalThis.asrCallback(null,JSON.stringify({type:'transcript',text:'新版识别',stage:'session_final'}));
    assert.equal(await done292,'session_final');assert.deepEqual(preview292,[['新版识别',false],['新版识别',true]]);api292.close();
    for(const [gates,env] of [[{'voice-asr-backend':false},''],[{'voice-mode':false},''],[{},'0']]) {
      globalThis.__clawgodPatches=gates;process.env.CLAUDE_CODE_ASR=env;
      assert.equal(await mod292.sDr({},{}),null,'关闭增强后仍走新版原生认证路径');
      assert.equal(mod292.oDr(),false);
    }
    delete globalThis.__clawgodPatches;delete process.env.CLAUDE_CODE_ASR;
    const previews=[], errors=[];let ready=0;
    const api=await mod.connect({onReady(){ready++},onTranscript:(...v)=>previews.push(v),onError:(...v)=>errors.push(v)},{});
    assert.ok(api);assert.equal(globalThis.asrConfig,'{}');
    assert.equal(mod.voiceAuthProbe(),true,'recording UI auth probe must use the alternate transport');assert.equal(mod.voiceFlag(),true,'recording UI voice flag must be enabled');
    globalThis.asrCallback(null,JSON.stringify({type:'ready'}));
    globalThis.asrCallback(null,JSON.stringify({type:'ready'}));
    assert.equal(ready,1);
    assert.equal(mod.command.availability,undefined);assert.deepEqual(mod.other.availability,['claude-ai']);assert.equal(mod.call(),'allowed');
    api.send(Buffer.from([0,0]));assert.equal(globalThis.asrPcm.length,2);
    for(const text of ['你好','你好世界'])globalThis.asrCallback(null,JSON.stringify({type:'transcript',text,stage:'interim'}));
    const done=api.finalize();
    for(let i=0;i<2;i++)globalThis.asrCallback(null,JSON.stringify({type:'transcript',text:'你好世界',stage:'session_final'}));
    assert.equal(await done,'session_final');assert.deepEqual(previews,[['你好',false],['你好世界',false],['你好世界',true]]);
    api.close();assert.equal(api.isConnected(),false);assert.equal(globalThis.asrClosed,true);assert.deepEqual(errors,[]);
    // Synthetic snapshots reproduce delayed 3→6 / 10→13 prefix duplication without audio.
    const scenarios=[
      ['delayed display rewrite',[
        {text:'甲乙丙',display:'甲乙丙'},
        {text:'丁戊己',display:'丁戊己'},
        {text:'丁戊己庚辛壬癸子丑寅',display:'丁戊己庚辛壬癸子丑寅'}
      ],['甲乙丙','丁戊己','丁戊己庚辛壬癸子丑寅'],140],
      ['display overrides stable prefix',[
        {text:'甲乙丙',display:'甲乙丙',stage:'stable'},
        {text:'丁戊己',display:'丁戊己'}
      ],['甲乙丙','丁戊己'],140],
      ['display contraction is not a parallel projection',[
        {text:'甲乙丙丁戊己',display:'甲乙丙丁戊己'},
        {text:'甲乙丙',display:'甲乙丙'},
        {text:'甲乙丙',display:'甲乙丙'}
      ],['甲乙丙丁戊己','甲乙丙'],0],
      ['phrase reset without display',[
        {text:'甲乙丙'},
        {text:'丁戊己'},
        {text:'丁戊己庚'}
      ],['甲乙丙','甲乙丙丁戊己','甲乙丙丁戊己庚'],140]
    ];
    for(const [name,events,expected,delay] of scenarios){
      const transcripts=[];
      const bridge=await mod.connect({onTranscript:(...v)=>transcripts.push(v),onError:msg=>assert.fail(msg)},{});
      const realNow=Date.now;let now=realNow();
      try{
        Date.now=()=>now;
        for(const event of events){
          now+=delay;
          globalThis.asrCallback(null,JSON.stringify({type:'transcript',stage:'interim',...event}));
        }
        assert.deepEqual(transcripts,expected.map(text=>[text,false]),name);
        const done=bridge.finalize(),final=expected.at(-1);
        for(let n=0;n<2;n++)globalThis.asrCallback(null,JSON.stringify({type:'transcript',text:final,display:final,stage:'session_final'}));
        assert.equal(await done,'session_final');
        assert.deepEqual(transcripts,[...expected.map(text=>[text,false]),[final,true]],name+' commits once');
      }finally{Date.now=realNow;bridge.close()}
    }
  }
  for(const [name,gates,env] of [['disabled',{'voice-asr-backend':false},''],['voice-disabled',{'enable-voice-mode':false},''],['stock',{},'0']]) {
    globalThis.__clawgodPatches=gates;process.env.CLAUDE_CODE_ASR=env;
    const file=join(fixtureRoot,name+'.mjs');writeFileSync(file,result.code);
    const mod=await import(pathToFileURL(file).href);
    assert.equal(await mod.connect({},{}),'stock');assert.deepEqual(mod.command.availability,['claude-ai']);assert.match(mod.call().value,/requires/);assert.equal(mod.voiceAuthProbe(),false);assert.equal(mod.voiceFlag(),false);
  }
  delete globalThis.__clawgodPatches;delete process.env.CLAUDE_CODE_ASR;
  rmSync(vendor,{recursive:true});
  // A fresh location bypasses require's module cache and must not silently use stock ASR.
  const absent=join(fixtureRoot,'missing');mkdirSync(absent);writeFileSync(join(absent,'voice.mjs'),result.code);
  const mod=await import(pathToFileURL(join(absent,'voice.mjs')).href);let error;
  assert.equal(await mod.connect({onError:(msg,detail)=>{error=detail}},{}),null);
  assert.equal(error.connectFailureCode,'cometix_asr_missing');
  console.log('PASS original voice ASR bridge: legacy/chunks, previews/final, conditional command auth, missing vendor');
} finally { delete globalThis.__clawgodPatches;delete process.env.CLAUDE_CODE_ASR;rmSync(rootDir,{recursive:true,force:true}); }
