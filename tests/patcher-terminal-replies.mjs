#!/usr/bin/env bun
// DA1-fragment cases ported from 0Chencc/clawgod v1.9.5, adapted to our registry.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import * as core from '../src/generic/patcher/core.mjs';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

assert.ok(core.coreRegistry.patches.some(p => p.id === 'terminal-reply-fragments'), 'core must preserve split DA1 replies');
const { terminalReplyDelay } = core;
const pending = { queue: [{ kind: 'sentinel', written: true }] };
const reader = (incomplete, mode = 'NORMAL') => ({ parse: { mode, incomplete }, lastInputAt: 100 });
for (const prefix of ['\x1b', '\x1b[', '\x1b[?', '\x1b[?61;4;6;']) {
  assert.equal(terminalReplyDelay(pending, reader(prefix), 150), 1950);
  assert.equal(terminalReplyDelay(pending, reader(prefix), 2100), 0);
  for (const querier of [null, {}, { queue: [] }, { queue: [{ kind: 'query' }] }, { queue: [{ kind: 'sentinel', written: false }] }]) {
    assert.equal(terminalReplyDelay(querier, reader(prefix), 150), 0);
  }
  for (const kind of ['sentinel', 'barrier']) assert.equal(terminalReplyDelay({ queue: [{ kind }] }, reader(prefix), 150), 1950);
}
for (const input of ['', 'hello', '22;23;24c', '\x03', '\x1b[A', '\x1b[?61;4c', '\x1b[x']) assert.equal(terminalReplyDelay(pending, reader(input), 150), 0);
assert.equal(terminalReplyDelay(pending, reader('\x1b[', 'IN_PASTE'), 150), 0);
assert.equal(terminalReplyDelay(pending, reader('\x1b['), NaN), 0);
assert.equal(terminalReplyDelay(pending, { parse: reader('\x1b[').parse }, 150), 0);
const root = mkdtempSync(join(tmpdir(), 'clawgod-terminal-replies-'));
try {
  for (const [label, runner] of await getPatcherSources()) for (const graph of [false, true]) {
    const directory = join(root, `${label}-${graph}`);
    mkdirSync(join(directory, 'chunks'), { recursive: true });
    seedPatcherAcorn(directory);
    writeFileSync(join(directory, 'patch.mjs'), runner);
    // The terminal fix is core reliability, not an opt-in enhancement.
    writeFileSync(join(directory, 'enhancements.json'), '{"schemaVersion":1,"mode":"custom","enabled":[]}');
    for (const [hasInput, wait, now, flush] of [['Hf', 'za', 't', 'Ry'], ['zf', 'Lr', 'n', 'E0']]) {
      const source = `globalThis.App=class{flushIncomplete=()=>{if(this.incompleteEscapeTimer=null,!${hasInput}(this.keyReader))return;if(this.props.stdin.readableLength>0){this.incompleteEscapeTimer=setTimeout(this.flushIncomplete,${wait});return}let ${now}=performance.now();this.applyKeysRead(${flush}(this.keyReader,${now}),${now})}};`;
      const target = join(directory, graph ? 'chunks/renderer.js' : 'cli.original.cjs');
      if (graph) writeFileSync(join(directory, 'cli.original.cjs'), '// entry\n');
      writeFileSync(target, source);
      function patch() {
        const result = spawnSync(process.execPath, [join(directory, 'patch.mjs'), '--root', directory], { encoding: 'utf8', timeout: 20000 });
        assert.equal(result.status, 0, `${label}: ${result.stdout}\n${result.stderr}`);
      }
      patch();
      const patched = readFileSync(target, 'utf8');
      assert.match(patched, /__clawgod_terminal_reply_fragments__/);
      patch();
      assert.equal(readFileSync(target, 'utf8'), patched, 'repeat apply is byte-identical');
      let clock = 150, scheduled, flushed = 0;
      const context = { performance: { now: () => clock },
        setTimeout: (fn, ms) => { scheduled = { fn, ms }; return 42; },
        [hasInput]: r => !!r.parse.incomplete, [wait]: 50,
        [flush]: r => { flushed++; return r.parse.incomplete; } };
      runInNewContext(patched, context);
      const app = new context.App();
      Object.assign(app, { keyReader: reader('\x1b['), querier: pending,
        props: { stdin: { readableLength: 0 } }, applyKeysRead: value => { app.delivered = value; } });
      app.flushIncomplete();
      assert.equal(flushed, 0);
      assert.equal(scheduled.ms, 1950);
      assert.equal(app.incompleteEscapeTimer, 42);
      clock = 2100; scheduled.fn();
      assert.equal(app.delivered, '\x1b[', 'timeout preserves Alt+[');
      clock = 150; app.querier = { queue: [] }; app.keyReader = reader('\x1b');
      app.flushIncomplete(); assert.equal(app.delivered, '\x1b', 'normal Escape keeps its original timing');
      app.keyReader = reader('\r'); app.flushIncomplete(); assert.equal(app.delivered, '\r', 'Enter is not swallowed');
      app.querier = pending; app.keyReader = reader('paste', 'IN_PASTE');
      app.flushIncomplete(); assert.equal(app.delivered, 'paste');
      app.props.stdin.readableLength = 1; app.flushIncomplete(); assert.equal(scheduled.ms, 50);
    }
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('DA1 fragments: bounded delay, keyboard/paste fallback, graph/legacy and generated patcher passed.');
