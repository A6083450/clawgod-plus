#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const shell = readFileSync(new URL('../src/unix/desktop/restore-claude-3p-cu-browser.sh', import.meta.url), 'utf8');
const transform = shell.match(/# BEGIN STATIC CU TRANSFORM\n([\s\S]*?)# END STATIC CU TRANSFORM/);
assert.ok(transform, '需要限定第三方静态 CU 变换');
const fixture = `
var settings={remote:false},preferences={chicagoEnabled:true},original={other:{value:false,on:false}},deny=new Set;
function config(){return settings}function bootstrap(c){return c.remote}function pref(k){return preferences[k]}
function featureMap(c){return original}
class ThirdParty{builtinBrowserEnabled(){return true}hardcodedMainGrowthBookFeatures(){return featureMap({builtinBrowserEnabled:this.builtinBrowserEnabled(),selfHostedSessions:host(flag)})}growthBookRemoteAllowedKeys(){return new Set(["remote"])}growthBookSource(){let c=config();if(!bootstrap(c))return{kind:"static",features:this.hardcodedMainGrowthBookFeatures()};return{kind:"remote"}}}
class Official{hardcodedMainGrowthBookFeatures(){return null}growthBookSource(){return{kind:"remote"}}}
function host(v){return v}var flag=false;
function enabled(e={}){return!platform()||hipaa()?!1:available(e)&&pref("chicagoEnabled")}
var state={platform:true,hipaa:false,allowed:true};function platform(){return state.platform}function hipaa(){return state.hipaa}
var applied={};function merge(e){let n=provider.hardcodedMainGrowthBookFeatures();if(!n)return e;let kept={};for(let k of provider.growthBookRemoteAllowedKeys())if(k in e)kept[k]=e[k];return{...kept,...n}}
function gate(k){if(deny.has(k))return false;return applied[k]?.on??false}
function available(){return applied["1291166712"]?.value?.enabled===true}
function use(){return !hipaa()&&platform()&&state.allowed&&gate("4293378213")&&enabled()}
var provider=new ThirdParty;provider.type="3p";var updates=0,refreshCalls=0;
function globalProvider(){return provider}function applyFeatures(map,kind){applied=merge(map);updates++}
function start(){let c=globalProvider().growthBookSource();if(c.kind==="static"){applyFeatures(c.features,"map-final");return}}
function refresh(){refreshCalls++}
function setPreference(value){let input={data:"chicagoEnabled"},old=preferences.chicagoEnabled,next={data:value};preferences.chicagoEnabled=value;input.data==="chicagoEnabled"&&old!==next.data&&(refresh(),Promise.resolve().then(()=>{}))}
globalThis.api={provider,settings,preferences,original,deny,state,Official,apply(){applied=merge(provider.growthBookSource().features??{});return applied},start,setPreference,current(){return applied},updates(){return updates},refreshCalls(){return refreshCalls},use,enabled};
`;
function patch(source) {
  const result = spawnSync('python3', ['-I', '-c', transform[1] + '\nimport sys,json\nprint(json.dumps(patch_static_cu(sys.stdin.read())))'], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const patched = patch(fixture);
assert.notEqual(patched, fixture);
const context = {};
runInNewContext(patched, context);
const { api } = context;
let map = api.apply();
assert.equal(map['1291166712'].value.enabled, true);
for (const key of ['4293378213', '36693946']) assert.equal(map[key].on, true);
assert.equal(api.use(), true);
assert.equal(Object.hasOwn(api.original, '1291166712'), false, '不得原地污染共享功能表');
assert.equal(api.original.other.value, false);
api.preferences.chicagoEnabled = false;
map = api.apply();
assert.equal(Object.hasOwn(map, '1291166712'), false, '用户关闭后重新计算不返回补齐项');
assert.equal(api.use(), false);
api.preferences.chicagoEnabled = true;
api.settings.remote = true;
assert.equal(api.provider.hardcodedMainGrowthBookFeatures(), api.original, 'remote/hybrid必须原样返回');
api.settings.remote = false;
for (const value of [false, null, undefined, { value: { enabled: false }, on: false }]) {
  api.original['1291166712'] = value;
  assert.equal(api.apply()['1291166712'], value, '已有配置即使无效也不得覆盖');
}
delete api.original['1291166712'];
api.original['4293378213'] = { value: false, on: false };
assert.equal(api.apply()['4293378213'].on, false);
assert.equal(api.use(), false);
delete api.original['4293378213'];
api.apply();
for (const property of ['platform', 'allowed']) {
  api.state[property] = false;
  assert.equal(api.use(), false, '平台/授权拒绝仍应拒绝');
  api.state[property] = true;
}
api.state.hipaa = true;
assert.equal(api.use(), false);
api.state.hipaa = false;
api.deny.add('4293378213');
assert.equal(api.use(), false, '原deny优先级保留');
assert.equal(new api.Official().hardcodedMainGrowthBookFeatures(), null);
api.deny.clear();
api.preferences.chicagoEnabled = false;
api.start();
assert.equal(Object.hasOwn(api.current(), '1291166712'), false);
api.setPreference(true);
assert.equal(api.current()['1291166712']?.value.enabled, true, '正常偏好修改链必须重新应用静态功能表，不要求重启');
assert.equal(api.use(), true);
api.setPreference(false);
assert.equal(Object.hasOwn(api.current(), '1291166712'), false, '关闭后撤回补齐的缓存条目');
api.settings.remote = true;
const appliedCount = api.updates();
api.setPreference(true);
assert.equal(api.updates(), appliedCount, 'remote偏好更新不得应用本地补齐');
assert.equal(api.refreshCalls(), 3, '保留原生刷新调用');
assert.equal(patch(patched), patched, '再次补丁不得叠加');
for (const source of [fixture.replace('hardcodedMainGrowthBookFeatures(){return featureMap', 'changed(){return featureMap'), fixture + fixture, fixture + 'function {']) {
  const result = spawnSync('python3', ['-I', '-c', transform[1] + '\nimport sys\nprint(patch_static_cu(sys.stdin.read()))'], { input: source, encoding: 'utf8' });
  assert.notEqual(result.status, 0, '缺失/歧义/语法错误拒绝');
}
console.log('Static CU: opt-in static only, remote/official unchanged, explicit values and denials retained, repeatability passed');
