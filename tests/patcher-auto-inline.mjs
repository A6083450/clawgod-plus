#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { autoModeRegistry } from '../src/generic/patcher/enhancements/auto-mode.mjs';

const descriptor = autoModeRegistry.patches.find(p => p.name === 'Auto-mode unlock for third-party API (inline gate)');
for (const condition of [
  'provider!=="firstParty"&&provider!=="anthropicAws"&&(model==="claude-opus-4-6"||model.includes("haiku"))',
  'provider!=="firstParty"&&!allowed(provider)&&(model==="claude-opus-4-6"||model.includes("haiku"))',
  'providerGate()&&(model==="claude-opus-4-6"||model==="claude-sonnet-4-6"||model.includes("haiku"))',
  'providerGate()&&(model==="claude-opus-4-6"||model==="claude-sonnet-4-6"||model.includes("haiku")&&model!=="claude-haiku-5-5")',
]) {
  const source = `function check(){if(${condition})return!1;return!0}`;
  const patched = source.replace(descriptor.pattern, (...args) => descriptor.replacer(...args));
  assert.notEqual(patched, source, `inline recognizer must support ${condition}`);
  for (const enabled of [true, false]) {
    assert.equal(runInNewContext(`${patched};check()`, { provider: 'thirdParty', model: 'claude-opus-4-6', providerGate: () => true, allowed: () => false, __clawgodPatches: { 'auto-mode-inline-gate': enabled } }), enabled);
  }
  assert.equal(patched.replace(descriptor.pattern, (...args) => descriptor.replacer(...args)), patched);
}
console.log('auto-mode inline shape checks passed');
