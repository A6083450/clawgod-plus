#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { coreRegistry } from '../src/generic/patcher/core.mjs';

const patch = coreRegistry.patches.find(descriptor => descriptor.name === 'Redirect `claude update` to clawgod self-update');
assert.ok(patch, 'core must own the claude update redirect patch');

const chain = '.command("update").alias("upgrade").description("Check for updates and install if available")';
const legacyActionShape = `${chain}.action(async()=>{`;
const tWrappedActionShape = `${chain}.action(t(async(s)=>{`;

for (const [label, shape] of [
  ['legacy .action(async()=>{', legacyActionShape],
  ['2.1.231 .action(t(async(s)=>{', tWrappedActionShape],
]) {
  const matches = [...shape.matchAll(patch.pattern)];
  assert.equal(matches.length, 1, `update redirect regex must match the ${label} shape exactly once`);
  const match = matches[0];
  assert.equal(match.length, 3, `update redirect regex must expose the full match plus exactly two capture groups for ${label}`);
  assert.equal(match[1], chain, `chain capture group must capture the command chain for ${label}`);
  assert.match(match[2], /^\.action\((?:t\()?async\([^)]*\)=>\{$/, `action capture group must capture the action opening for ${label}`);

  const replaced = patch.replacer(match[0], match[1], match[2]);
  assert.ok(
    replaced.startsWith(`${chain}.allowUnknownOption()${match[2]}`),
    `replacer must insert allowUnknownOption after chain and the injected body after action for ${label}`,
  );
  assert.ok(
    replaced.includes("[clawgod] 'claude update' is handled by clawgod self-update."),
    `replacer must inject the clawgod self-update body for ${label}`,
  );
}

console.log('patcher update action-shape checks passed');
