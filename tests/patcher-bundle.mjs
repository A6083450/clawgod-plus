#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertDeterministicPatcherBundles,
  buildPatcherBundle,
  findRelativeModuleLoads,
  validatePatcherBuildResult,
} from '../build.mjs';

const bundle = await buildPatcherBundle();
assert.match(bundle, /^#!\/usr\/bin\/env bun/, 'generated patcher must remain directly executable by Bun');
assert.deepEqual(findRelativeModuleLoads(bundle), [], 'generated patcher must not retain relative module loads');

for (const [kind, source] of [
  ['static import', 'import "./left-behind.mjs";\n'],
  ['dynamic import', 'await import("../left-behind.mjs");\n'],
  ['export from', 'export { value } from "./left-behind.mjs";\n'],
  ['literal require', 'require("./left-behind.cjs");\n'],
]) {
  await assert.rejects(
    validatePatcherBuildResult({ success: true, logs: [], outputs: [new Blob([source])] }),
    /unresolved local import|relative module load/i,
    `${kind} must not remain in a successful self-contained output`,
  );
}

const harmlessLoadText = [
  '// import "./comment-only.mjs";',
  '/* require("../comment-only.cjs"); */',
  'const examples = ["import(\\"./string-only.mjs\\")", "export {x} from \\"./string-only.mjs\\""];',
  '',
].join('\n');
assert.equal(
  await validatePatcherBuildResult({ success: true, logs: [], outputs: [new Blob([harmlessLoadText])] }),
  harmlessLoadText,
  'comments and string contents that resemble loads must not be rejected',
);

await assert.rejects(
  validatePatcherBuildResult({ success: true, logs: [{ level: 'warning', message: 'fixture warning' }], outputs: [new Blob(['ok'])] }),
  /warning/i,
  'any Bun.build warning must fail closed',
);
await assert.rejects(
  validatePatcherBuildResult({ success: true, logs: [], outputs: [new Blob(['one']), new Blob(['two'])] }),
  /exactly one output/i,
  'multiple Bun.build outputs must fail closed',
);
assert.throws(
  () => assertDeterministicPatcherBundles('first', 'second'),
  /non-deterministic/i,
  'different repeat-build bytes must fail closed',
);

const unresolvedRoot = mkdtempSync(join(tmpdir(), 'clawgod-patcher-unresolved-'));
try {
  const patcherDir = join(unresolvedRoot, 'src', 'generic', 'patcher');
  mkdirSync(patcherDir, { recursive: true });
  writeFileSync(join(patcherDir, 'entry.mjs'), "import './missing.mjs';\n", 'utf8');
  await assert.rejects(
    buildPatcherBundle({ rootDir: unresolvedRoot }),
    /build failed|bundle failed|resolve|missing/i,
    'an unresolved graph import must fail the real Bun.build boundary',
  );
} finally {
  rmSync(unresolvedRoot, { recursive: true, force: true });
}

console.log('patcher bundle checks passed');
