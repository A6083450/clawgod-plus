#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { autoModeRegistry } from '../src/generic/patcher/enhancements/auto-mode.mjs';
import { applySemanticPatches } from '../src/generic/patcher/semantic-runner.mjs';

const descriptor = autoModeRegistry.customPatches.find(p => p.semanticId === 'auto-mode-inline-gate');
const helpers = `function providerGate(){return provider!=="firstParty"&&!allowed(provider)}
function allowed(value){return value==="anthropicAws"}`;
for (const condition of [
  'provider!=="firstParty"&&provider!=="anthropicAws"&&(model==="claude-opus-4-6"||model.includes("haiku"))',
  'provider!=="firstParty"&&!allowed(provider)&&(model==="claude-opus-4-6"||model.includes("haiku"))',
  'providerGate()&&(model==="claude-opus-4-6"||model==="claude-sonnet-4-6"||model.includes("haiku"))',
  'providerGate()&&(model==="claude-opus-4-6"||model==="claude-sonnet-4-6"||model.includes("haiku")&&model!=="claude-haiku-5-5")',
]) {
  const source = `${helpers}function check(){if(model==="denied")return!1;if(${condition})return!1;return!0}`;
  const result = descriptor.apply(source);
  assert.equal(result.status, 'applied', condition);
  const patched = result.code;
  for (const enabled of [true, false]) {
    for (const provider of ['firstParty', 'anthropicAws', 'proxy']) {
      const context = { provider, model: 'claude-opus-4-6', __clawgodPatches: { 'auto-mode-inline-gate': enabled } };
      assert.equal(runInNewContext(`${patched};check()`, context), enabled || provider !== 'proxy');
      assert.equal(runInNewContext(`${patched};check()`, { ...context, model: 'denied' }), false, 'model-only rejection survives');
    }
  }
  assert.equal(descriptor.apply(patched).status, 'already');
  assert.equal(descriptor.apply(patched).code, patched);
  for (const options of [{ dryRun: true }, { verify: true }]) assert.equal(descriptor.apply(source, options).code, source);
}

const optIn = `function optIn(route){'use strict'\nif(route==='firstParty'||route==='anthropicAws')return true;return env(process.env.CLAUDE_CODE_ENABLE_AUTO_MODE)}`;
const support = `function support(model,route){if(model==='denied')return false;if(!optIn(route))return false;if(route!=='firstParty'&&route!=='anthropicAws')return false;return true}`;
for (const typed of [false, true]) {
  const source = `${typed ? optIn.replace('function optIn(route)', 'const optIn=function(route)') + ';' : optIn}${support}`;
  const result = applySemanticPatches(source, autoModeRegistry.customPatches);
  for (const descriptor of autoModeRegistry.customPatches) assert.equal(result.results.get(descriptor).status, 'applied', descriptor.name);
  for (const enabled of [true, false]) {
    for (const route of ['firstParty', 'anthropicAws', 'proxy']) {
      const context = { process: { env: {} }, env: () => false, __clawgodPatches: {
        'auto-mode-helper-gate': enabled, 'auto-mode-inline-gate': enabled, 'auto-mode-provider-opt-in': enabled,
      } };
      assert.equal(runInNewContext(`${result.code};support('claude-opus-4-6',${JSON.stringify(route)})`, context), enabled || route !== 'proxy');
      assert.equal(runInNewContext(`${result.code};support('denied',${JSON.stringify(route)})`, context), false);
    }
  }
}
for (const source of [
  `${helpers}function check(providerGate){if(providerGate()&&(model==='claude-opus-4-6'||model==='claude-sonnet-4-6'))return false;return true}`,
  `${helpers}function check(){const providerGate=()=>true;if(providerGate()&&(model==='claude-opus-4-6'||model==='claude-sonnet-4-6'))return false;return true}`,
  `${helpers}providerGate=other;function check(){if(providerGate()&&(model==='claude-opus-4-6'||model==='claude-sonnet-4-6'))return false;return true}`,
  `${helpers}function check(){let cached=providerGate();cached=other();if(cached&&(model==='claude-opus-4-6'||model==='claude-sonnet-4-6'))return false;return true}`,
]) {
  const result = descriptor.apply(source);
  assert.equal(result.status, 'stale');
  assert.equal(result.code, source);
}
// A neighboring provider check must use the helper argument's lexical binding.
for (const check of [
  "if(other!=='firstParty'&&other!=='anthropicAws')return false;",
  "{const route=other;if(route!=='firstParty'&&route!=='anthropicAws')return false;}",
]) {
  const source = `${optIn}function support(model,route,other){if(!optIn(route))return false;${check}return true}`;
  const helper = autoModeRegistry.customPatches.find(p => p.semanticId === 'auto-mode-helper-gate');
  const result = helper.apply(source);
  assert.equal(result.status, 'stale');
  assert.equal(result.code, source);
}
for (const [semanticId, source] of [
  ['auto-mode-inline-gate', `${helpers}function check(globalThis){if(providerGate()&&(model==='claude-opus-4-6'||model==='claude-sonnet-4-6'))return false;return true}`],
  ['auto-mode-helper-gate', `${optIn}${support.replace('function support(model,route)', 'function support(model,route,globalThis)')}`],
  ['auto-mode-provider-opt-in', `function wrapper(globalThis){${optIn};return optIn}`],
]) {
  const patch = autoModeRegistry.customPatches.find(p => p.semanticId === semanticId);
  const result = patch.apply(source);
  assert.equal(result.status, 'stale', semanticId);
  assert.equal(result.code, source);
}
console.log('auto-mode AST inline/helper/opt-in and safety checks passed');
