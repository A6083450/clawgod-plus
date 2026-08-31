#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const launcherAssignment = readFileSync(new URL('../src/unix/launcher.sh', import.meta.url), 'utf8');

function invokeLauncher(inheritedHerdrAgent) {
  const root = mkdtempSync(join(tmpdir(), 'clawgod-herdr-agent-'));
  try {
    const clawgod = join(root, '.clawgod');
    const bun = join(root, 'fake-bun');
    const launcher = join(root, 'claude');
    mkdirSync(clawgod, { recursive: true });
    writeFileSync(join(clawgod, 'cli.cjs'), '', 'utf8');

    const rendered = spawnSync('/bin/bash', ['-c', `${launcherAssignment}\nprintf '%s' "$LAUNCHER_CONTENT"`], {
      encoding: 'utf8',
      env: {
        HOME: root,
        PATH: '/usr/bin:/bin',
        CLAWGOD_DIR: clawgod,
        BUN_BIN: bun,
        CLAUDE_BIN: launcher,
      },
    });
    assert.equal(rendered.status, 0, rendered.stderr);
    writeFileSync(launcher, rendered.stdout, 'utf8');
    chmodSync(launcher, 0o755);
    writeFileSync(bun, '#!/bin/sh\nprintf \'%s\' "$HERDR_AGENT"\n', 'utf8');
    chmodSync(bun, 0o755);

    const invoked = spawnSync('/bin/bash', [launcher, '--version'], {
      encoding: 'utf8',
      env: {
        HOME: root,
        PATH: '/usr/bin:/bin',
        ...(inheritedHerdrAgent === undefined ? {} : { HERDR_AGENT: inheritedHerdrAgent }),
      },
    });
    assert.equal(invoked.status, 0, invoked.stderr);
    return invoked.stdout;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.equal(invokeLauncher(), 'claude', 'Unix launcher must expose the default Claude identity to Herdr');
assert.equal(invokeLauncher('custom-agent'), 'custom-agent', 'Unix launcher must preserve an inherited HERDR_AGENT');
assert.equal(invokeLauncher(''), '', 'Unix launcher must preserve an explicitly empty HERDR_AGENT');

console.log('Unix Herdr agent identity checks passed');
