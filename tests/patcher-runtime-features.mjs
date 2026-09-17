#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const { runtimeFeatureMetadata } = await import('../src/generic/patcher/registry.mjs');

assert.deepEqual(runtimeFeatureMetadata, {
  'agent-teams': ['agent-teams'],
  'computer-use-sub': ['computer-use'],
  'computer-use-default': ['computer-use'],
  'computer-use-gate': ['computer-use'],
  ultraplan: ['ultraplan'],
  'ultrareview-gate': ['ultrareview'],
  'ultrareview-direct': ['ultrareview'],
  'voice-mode': ['voice-mode'],
  'auto-mode-helper-gate': ['auto-mode'],
  'auto-mode-inline-gate': ['auto-mode'],
  'auto-mode-provider-opt-in': ['auto-mode'],
  'classifier-timeout': ['classifier-tuning'],
  'classifier-model': ['classifier-tuning'],
  'classifier-retries': ['classifier-tuning'],
  'theme-logo-rgb': ['theme'],
  'theme-logo-ansi': ['theme'],
  'theme-claude-rgb-dark': ['theme'],
  'theme-claude-rgb-light': ['theme'],
  'theme-shimmer-rgb': ['theme'],
  'theme-shimmer-rgb-light': ['theme'],
  'theme-hex': ['theme'],
  'theme-claude-ansi': ['theme'],
  'theme-shimmer-ansi': ['theme'],
  'theme-brief-rgb-dark': ['theme'],
  'theme-brief-rgb-light': ['theme'],
  'theme-brief-ansi': ['theme'],
  'geo-stego-date': ['geo-neutralize'],
  'geo-detect-probe': ['geo-neutralize'],
  'geo-apostrophe-stego': ['geo-neutralize'],
  'remove-cyber-risk': ['cyber-risk'],
  'remove-url-restriction': ['url-restriction'],
  'remove-cautious-actions': ['cautious-actions'],
  'remove-not-logged-in': ['not-logged-in'],
  'attachment-filter-bypass': ['message-filter'],
  'message-filter-legacy': ['message-filter'],
  'message-filter-s8': ['message-filter'],
}, 'runtime patch metadata must expose every upstream runtime feature mapping');

const root = mkdtempSync(join(tmpdir(), 'clawgod-runtime-patches-'));
try {
  const source = `
function teams(){if(!enabled(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)&&!local())return!1;if(!flag("tengu_amber_flint",!0))return!1;return!0}
function sub(){let plan=currentPlan();return plan==="max"||plan==="pro"}
function cu(){if(hipaa("hipaa"))return!1;return zQ()&&oL8().enabled}
const planning={name:"ultraplan",argumentHint:"<prompt>",availability:["claude-ai"],isEnabled:()=>originalPlan()};
function review(){return getter()?.enabled===!0&&ready()&&!disabled()}
function voice(){return!flag("tengu_amber_quartz_disabled",!1)}
function autoProvider(e){if(e==="firstParty"||e==="anthropicAws")return!0;return env(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
function timeout(e){let n=Math.max(0,Math.ceil((e-50000)/50000));return Math.min(cap,base+n*1e4)}
function model(){let e=at(),n=Ih(),r=usr(n?.modelByMainModel,{vet:ok});return{value:r,src:"default"}}
function retries(){let n=Ih()?.maxRetries;return typeof n==="number"&&Number.isInteger(n)&&n>=0?{value:n,src:"gb"}:{value:four,src:"default"}}
const theme={clawd_body:"rgb(215,119,87)",claude:"rgb(255,153,51)",claudeShimmer:"rgb(255,183,101)",hex:"#da7756"};
const risk="IMPORTANT: Assist with authorized security testing only";
function careful(){return\`# Executing actions with care\n\nConfirm scope.\`}
const login="Not logged in. Run login to authenticate.";
function attachments(q){if(userType()!=="ant"&&types.has(q.attachment.type))return null;return q}
function privateDate(e){let t=rdp(),n=odp(t?.known??!1,t?.labKw??!1),r=t?.cnTZ?e.replaceAll("-","/"):e;return\`Today\${n}s date is \${r}.\`}
`;
  const sourceFile = join(root, 'input.mjs');
  const scriptFile = join(root, 'check.mjs');
  writeFileSync(sourceFile, source);
  const autoMode = await import('../src/generic/patcher/enhancements/auto-mode.mjs');
  const computerUse = await import('../src/generic/patcher/enhancements/computer-use.mjs');
  const planning = await import('../src/generic/patcher/enhancements/planning.mjs');
  const voice = await import('../src/generic/patcher/enhancements/voice.mjs');
  const agents = await import('../src/generic/patcher/enhancements/agents.mjs');
  const branding = await import('../src/generic/patcher/enhancements/branding.mjs');
  const privacy = await import('../src/generic/patcher/enhancements/privacy.mjs');
  const unrestricted = await import('../src/generic/patcher/enhancements/unrestricted-tools.mjs');
  const descriptors = [
    ...agents.createAgentsRegistry({ chromeEnabled: false }).patches,
    ...computerUse.computerUseRegistry.patches,
    ...planning.planningRegistry.patches,
    ...voice.voiceRegistry.patches,
    ...autoMode.autoModeRegistry.patches,
    ...branding.brandingRegistry.patches,
    ...privacy.privacyRegistry.patches,
    ...unrestricted.unrestrictedToolsRegistry.patches,
  ];
  let patched = source;
  for (const descriptor of descriptors) {
    patched = patched.replace(descriptor.pattern, (match, ...args) => descriptor.replacer(match, ...args.slice(0, -2)));
  }
  for (const descriptor of descriptors) {
    assert.equal(descriptor.pattern.test(patched), false, `${descriptor.name} must not nest when patched twice`);
    descriptor.pattern.lastIndex = 0;
  }
  const gateIds = new Set([...patched.matchAll(/__clawgodPatches\?\.\["([^"]+)"\]/g)].map(([, id]) => id));
  assert.deepEqual([...gateIds].sort(), Object.keys(runtimeFeatureMetadata).filter(id => patched.includes(`__clawgodPatches?.["${id}"]`)).sort(), 'every emitted runtime gate ID must be exported metadata');
  writeFileSync(sourceFile, patched);
  writeFileSync(scriptFile, `
const text = await Bun.file(${JSON.stringify(sourceFile)}).text();
const calls = [];
function enabled(){ return false } function local(){ return false } function flag(){ return true }
function currentPlan(){ return "free" } function hipaa(){ return true } function zQ(){ return false } function oL8(){ return { enabled: false } }
function originalPlan(){ return false } function getter(){ return { enabled: false } } function ready(){ return false } function disabled(){ return true }
function env(){ return false } const cap=120000,base=60000; function at(){} function Ih(){ return { maxRetries: 7 } } function usr(){ return "gb-model" } function ok(){} const four=4;
function rdp(){ return { known: true, labKw: true, cnTZ: true } } function odp(){ return "x" } function userType(){ return "external" } const types = new Set(["x"]);
function load(table){globalThis.__clawgodPatches=table;return Function("enabled","local","flag","currentPlan","hipaa","zQ","oL8","originalPlan","getter","ready","disabled","env","cap","base","at","Ih","usr","ok","four","rdp","odp","userType","types",text+";return {teams,sub,cu,planning,review,voice,autoProvider,timeout,model,retries,theme,risk,careful,login,attachments,privateDate}")(enabled,local,flag,currentPlan,hipaa,zQ,oL8,originalPlan,getter,ready,disabled,env,cap,base,at,Ih,usr,ok,four,rdp,odp,userType,types)}
const off = { "agent-teams": false, "computer-use-sub": false, "computer-use-gate": false, "ultraplan": false, "ultrareview-gate": false, "voice-mode": false, "auto-mode-provider-opt-in": false, "classifier-timeout": false, "classifier-model": false, "classifier-retries": false, "theme-logo-rgb": false, "theme-claude-rgb-light": false, "theme-shimmer-rgb-light": false, "theme-hex": false, "remove-cyber-risk": false, "remove-cautious-actions": false, "remove-not-logged-in": false, "attachment-filter-bypass": false, "geo-stego-date": false };
let { teams, sub, cu, planning, review, voice, autoProvider, timeout, model, retries, theme, risk, careful, login, attachments, privateDate } = load(off);
if(teams()!==false||sub()!==false||cu()!==false||planning.isEnabled()!==false||planning.availability[0]!=="claude-ai"||review()!==false||voice()!==false||autoProvider("third")!==false||timeout(1)!==60000||model().value!=="gb-model"||retries().value!==7||theme.clawd_body!=="rgb(215,119,87)"||theme.claude!=="rgb(255,153,51)"||theme.claudeShimmer!=="rgb(255,183,101)"||theme.hex!=="#da7756"||risk!=="IMPORTANT: Assist with authorized security testing only"||careful()!=="# Executing actions with care\\n\\nConfirm scope."||login!=="Not logged in. Run login to authenticate."||attachments({attachment:{type:"x"}})!==null||privateDate("2026-01-01")!=="Todayxs date is 2026/01/01.") throw Error("off semantics");
process.env.CLAWGOD_CLASSIFIER_TIMEOUT_MS="130001.8"; process.env.CLAWGOD_CLASSIFIER_MODEL="  custom  "; process.env.CLAWGOD_CLASSIFIER_RETRIES="3";
({ teams, sub, cu, planning, review, voice, autoProvider, timeout, model, retries, theme, risk, careful, login, attachments, privateDate } = load({}));
if(teams()!==true||sub()!==true||cu()!==true||planning.isEnabled()!==true||planning.availability!==undefined||review()!==true||voice()!==true||autoProvider("third")!==true||timeout(1)!==130001.8||model().value!=="custom"||retries().value!==3||theme.clawd_body!=="rgb(34,197,94)"||theme.claude!=="rgb(22,163,74)"||theme.claudeShimmer!=="rgb(34,197,94)"||theme.hex!=="#22c55e"||risk!==""||careful()!==""||login!==""||attachments({attachment:{type:"x"}})?.attachment.type!=="x"||privateDate("2026-01-01")!=="Today's date is 2026-01-01.") throw Error("on semantics");
`);
  const run = spawnSync(process.execPath, [scriptFile], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}



const entryUrl = new URL('../src/generic/patcher/entry.mjs', import.meta.url).href;
const entryRoot = mkdtempSync(join(tmpdir(), 'clawgod-runtime-entry-idempotency-'));
try {
  const home = join(entryRoot, 'home');
  const root = join(home, '.clawgod');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const config = join(root, 'enhancements.json');
  const runner = join(root, 'run.mjs');
  const fixture = `
function teams(){if(!enabled(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)&&!local())return!1;if(!flag("tengu_amber_flint",!0))return!1;return!0}
function cu(){if(hipaa("hipaa"))return!1;return zQ()&&oL8().enabled}
function autoProvider(e){if(e==="firstParty"||e==="anthropicAws")return!0;return env(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}
const theme={hex:"#da7756"};
const risk="IMPORTANT: Assist with authorized security testing only";
function careful(){return\`# Executing actions with care\n\nConfirm scope.\`}
function privateDate(e){let t=rdp(),n=odp(t?.known??!1,t?.labKw??!1),r=t?.cnTZ?e.replaceAll("-","/"):e;return\`Today\${n}s date is \${r}.\`}
function rdp(){if(firstParty())return null;let e=url(),t=zone(),n=t==="Asia/Shanghai"||t==="Asia/Urumqi";if(!e)return{known:!1,labKw:!1,cnTZ:n,host:null};return{known:!1,labKw:!1,cnTZ:n,host:e}}
`;
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(join(root, 'cli.original.cjs'), fixture);
  writeFileSync(config, '{\n  "schemaVersion": 1,\n  "mode": "custom",\n  "enabled": [\n    "computer-use",\n    "agents",\n    "auto-mode",\n    "unrestricted-tools",\n    "privacy",\n    "branding"\n  ]\n}\n', { mode: 0o600 });
  writeFileSync(runner, `await import(${JSON.stringify(entryUrl)});`);
  const run = () => spawnSync(process.execPath, [runner, '--enhancements-file', config], { cwd: root, encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  rmSync(join(root, 'cli.original.cjs.bak'));
  const once = readFileSync(join(root, 'cli.original.cjs'), 'utf8');
  const second = run();
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  assert.match(second.stdout, /Written: cli\.original\.cjs \(\+0 bytes\)/, 'second idempotency run must make no source changes');
  assert.equal(readFileSync(join(root, 'cli.original.cjs'), 'utf8'), once, 'second entry run must not nest runtime gates');
} finally {
  rmSync(entryRoot, { recursive: true, force: true });
}

console.log('patcher runtime feature checks passed');
