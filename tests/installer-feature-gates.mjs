#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderGeneratedPair } from '../build.mjs';

const outputs = await renderGeneratedPair();
const root = mkdtempSync(join(tmpdir(), 'clawgod-installer-gates-'));
try {
  for (const output of outputs) {
    const windows = output.output.endsWith('.ps1');
    const embedded = windows
      ? output.content.match(/\$FeatureGatesBytes = \[Convert\]::FromBase64String\('([^']+)'\)/)?.[1]
      : output.content.match(/cat > "\$CLAWGOD_DIR\/feature-gates\.cjs" << 'FEATURE_GATES_EOF'\n([\s\S]*?)\nFEATURE_GATES_EOF/)?.[1];
    assert.ok(embedded, `${output.output} 必须部署功能开关解析器`);
    const directory = join(root, windows ? 'win' : 'unix');
    mkdirSync(directory);
    const helperFile = join(directory, 'feature-gates.cjs');
    writeFileSync(helperFile, windows ? Buffer.from(embedded, 'base64') : embedded);
    writeFileSync(join(directory, 'patches.json'), '{"agent-teams":false,"classifier-tuning":false}');
    const result = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(require(process.argv[1]).loadFeatureGates(process.argv[2], undefined, {})))', helperFile, directory], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const gates = JSON.parse(result.stdout);
    assert.equal(gates['classifier-timeout'], false, '构建必须注入真实 registry 而非空 metadata');
    assert.equal(gates['classifier-model'], false);
    assert.equal(gates['classifier-retries'], false);
    assert.equal(existsSync(helperFile), true);
    assert.equal(readFileSync(join(directory, 'patches.json'), 'utf8'), '{"agent-teams":false,"classifier-tuning":false}');
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('installer feature gate checks passed');
