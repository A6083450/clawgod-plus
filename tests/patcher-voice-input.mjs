#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { voiceRegistry } from '../src/generic/patcher/enhancements/voice.mjs';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const fixture = readFileSync(new URL('./fixtures/voice-composer-2.1.281.txt', import.meta.url), 'utf8');
// Run the actual upstream hooks, with only React scheduling, the clock and the
// recording controller substituted. No microphone, native ASR or network calls.
function session(source, { text = '', cursor = text.length, mode = 'hold', gates = {}, active = true, typedKeys = true, canRecord = true } = {}) {
  let state = { voiceState: 'idle', voiceInterimTranscript: '' }, effects, component, hi, ei, now = 0, timers = [], voice, keys, options;
  const refs = [[], []], deps = [[], []], cleanups = [[], []], history = [];
  const composer = { value: text, cursorOffset: cursor, setValueWithCursor(value, offset) {
    history.push({ phase: state.voiceState, value, cursor: offset }); this.value = value; this.cursorOffset = offset;
  } };
  const get = () => state, set = fn => { state = fn(state); };
  const context = {
    setTimeout(fn, ms) { const id = { fn, at: now + ms }; timers.push(id); return id; },
    clearTimeout(id) { timers = timers.filter(t => t !== id); },
    __clawgodPatches: gates,
    w: n => Array(n).fill(Symbol.for('memo')), _: Symbol.for('memo'),
    A: value => refs[component][hi++] ??= { current: value }, oe: fn => fn, J: fn => fn(), cn: () => {},
    k: (fn, values) => { const index = ei++, old = deps[component][index];
      if (!old || values.some((value, i) => value !== old[i])) {
        const owner = component;
        effects.push(() => { cleanups[owner][index]?.(); cleanups[owner][index] = fn(); });
      }
      deps[component][index] = values;
    },
    UBt: () => set, Jhe: () => get, Ym: selector => selector(state), U: selector => selector({ settings: { voice: { mode } } }),
    IO: () => true, Yr: () => ({ addNotification() {} }), Da: () => null, pW: () => false,
    Tt: () => [{ context: 'Chat', chord: [{ key: ' ' }], action: 'voice:pushToTalk' }], Io() {}, Vo() {},
    y0n: () => 'space', F$: () => '', qj: s => s.replaceAll('\u3000', ' '), Mbe: () => false, _o: () => false,
    wi: s => s.voiceState, ki: s => s.settings.voice.mode, xt: 120, wo: 5, Cn: 2, ko: 300, So: 2000,
    _i: s => s, Ii: s => s, Vi: s => s, Ei: s => s, Ai: s => s, Li: s => s, Mi: s => s,
    jt: () => ({ setTimeout(fn, ms) { const timer = { fn, at: now + ms }; timers.push(timer); return () => { timers = timers.filter(t => t !== timer); }; } }),
    Do: { useVoice(opts) { options = opts; return {
      handleKeyEvent() { if (canRecord && state.voiceState === 'idle') state = { ...state, voiceState: 'recording' }; },
      cancelRecording() { state = { ...state, voiceState: 'idle' }; },
    }; } }, m() {}, p() {}, y() {}, Hko: s => s.length,
  };
  runInNewContext(source, context);
  function render() {
    effects = []; component = 0; hi = ei = 0; voice = context.$Fe({ composer });
    component = 1; hi = ei = 0;
    keys = context.zke({ voiceHandleKeyEvent: voice.handleKeyEvent, voiceCancelRecording: voice.cancelRecording,
      stripTrailing: voice.stripTrailing, resetAnchor: voice.resetAnchor, isActive: active, composerTakesTypedKeys: typedKeys, composer });
    for (const fn of effects) fn();
  }
  function advance(ms) {
    now += ms; const due = timers.filter(t => t.at <= now); timers = timers.filter(t => t.at > now); for (const t of due) t.fn();
    render();
  }
  function press(key = ' ', ms = 30, flags = {}) {
    advance(ms);
    const event = { key, ctrl: false, meta: false, shift: false, stopped: false, defaultPrevented: false, ...flags,
      stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; },
      consume() { this.preventDefault(); this.stopImmediatePropagation(); } };
    keys.handleKeyDown(event);
    if (!event.stopped && !event.defaultPrevented && !event.ctrl && !event.meta && key !== 'escape') {
      const at = composer.cursorOffset; composer.setValueWithCursor(composer.value.slice(0, at) + key + composer.value.slice(at), at + key.length);
    }
    render(); return event;
  }
  render();
  return { composer, history, press, advance, get,
    state(voiceState) { state = { ...state, voiceState }; render(); },
    preview(text) { state = { ...state, voiceInterimTranscript: text }; render(); },
    finish(text) { if (text) options.onTranscript(text); state = { ...state, voiceState: 'idle', voiceInterimTranscript: '' }; render(); },
  };
}
function checks(source, label) {
  assert.equal(source.includes('forceRedraw'), false, 'hold input must not depend on terminal refresh workarounds');
  // 普通空格及首次重复与原生逐事件一致，不能等待长按判定后才显示。
  for (const sequence of [[[' ', 0]], [[' ', 0], ['x', 30]], [[' ', 0], [' ', 500]], [[' ', 0], [' ', 30]], [['  ', 0]], [['    ', 0]]]) {
    const baseline = session(fixture, { text: '原文  后缀', cursor: 4 });
    const patched = session(source, { text: '原文  后缀', cursor: 4 });
    for (const [key, delay] of sequence) {
      baseline.press(key, delay); patched.press(key, delay);
      assert.equal(patched.composer.value, baseline.composer.value, `${label}: space appears immediately like upstream`);
      assert.equal(patched.composer.cursorOffset, baseline.composer.cursorOffset, 'space cursor matches upstream');
    }
    baseline.advance(150); patched.advance(150);
    assert.deepEqual(patched.history, baseline.history, 'quiet timeout must not insert delayed spaces');
  }
  for (const text of ['', '前缀  ']) {
    const s = session(source, { text });
    for (let i = 0; i < 5; i++) s.press();
    assert.equal(s.get().voiceState, 'recording', 'hold starts');
    assert.equal(s.composer.value, text, `${label}: holding preserves existing text`);
    const started = s.history.length;
    for (let i = 0; i < 15; i++) assert.equal(s.press().defaultPrevented, true, 'recording consumes repeat without editing');
    assert.equal(s.history.length, started, 'no deletion or cursor updates during recording');
    s.preview('你好'); const preview = s.composer.value;
    s.state('processing'); const stopped = s.history.length;
    for (let i = 0; i < 8; i++) assert.equal(s.press().defaultPrevented, true, 'tail repeats stay owned while finalizing');
    assert.equal(s.history.length, stopped, 'no input or deletion while finalizing');
    s.finish('你好'); assert.equal(s.composer.value, preview, 'final transcript does not erase/reinsert spaces');
    assert(s.history.slice(stopped).every(change => change.value === preview), 'no intermediate cursor rollback at completion');
    s.press('x'); assert.equal(s.composer.value, preview + 'x', 'typing resumes after completion');
  }
  // A terminal may batch repeat characters into one event; consumed bytes
  // must never be subtracted from pre-existing whitespace.
  const batch = session(source, { text: '原文     ' }); batch.press('     ');
  assert.equal(batch.get().voiceState, 'recording'); assert.equal(batch.composer.value, '原文     ');
  batch.state('processing'); batch.finish(''); assert.equal(batch.composer.value, '原文     ');
  const edited = session(source); for (let i = 0; i < 5; i++) edited.press();
  edited.preview('预览'); edited.press('x'); edited.state('processing'); edited.finish('最终');
  assert.equal(edited.composer.value, '预览x', 'manual edits cannot be overwritten by final ASR');
  const focus = session(source, { text: '已有' }); focus.state('recording'); focus.press();
  assert.equal(focus.composer.value, '已有 ', 'recording not owned by this hold still permits typing');
  const middle = session(source, { text: '前缀  后缀', cursor: 4 });
  for (let i = 0; i < 5; i++) middle.press();
  assert.equal(middle.composer.value, '前缀  后缀', 'anchoring must not insert a suffix separator before transcript');
  assert.equal(middle.composer.cursorOffset, 4, 'anchoring must not move cursor');
  middle.preview('识别'); middle.state('processing'); middle.finish('识别');
  assert.equal(middle.composer.value, '前缀  识别 后缀', 'original whitespace and suffix are retained');
  const cancel = session(source, { text: '原文  ' });
  for (let i = 0; i < 5; i++) cancel.press();
  cancel.preview('取消'); cancel.press('escape'); assert.equal(cancel.composer.value, '原文  ');
  const tap = session(source, { mode: 'tap' }); tap.press(); assert.equal(tap.get().voiceState, 'recording'); assert.equal(tap.composer.value, '');
  const short = session(source, { text: '短按' }); short.press();
  assert.equal(short.composer.value, '短按 ', 'short press is immediately visible');
  short.advance(1000); assert.equal(short.composer.value, '短按 ', 'quiet timeout does not duplicate space');
  short.press('x'); short.press(); assert.equal(short.composer.value, '短按 x ');
  const failed = session(source, { text: '原文  ', canRecord: false });
  for (let i = 0; i < 5; i++) failed.press();
  assert.equal(failed.composer.value, '原文  ', 'failed recording start cannot erase original spaces');
  failed.press('x'); assert.equal(failed.composer.value, '原文  x', 'typing resumes after failed start');
  const inactive = session(source, { active: false }); for (let i = 0; i < 8; i++) inactive.press(); assert.equal(inactive.composer.value, ' '.repeat(8));
  const noTypedKeys = session(source, { typedKeys: false }); noTypedKeys.press();
  assert.equal(noTypedKeys.composer.value, ' ', 'non-composer contexts do not defer typed keys');
}
const root = mkdtempSync(join(tmpdir(), 'clawgod-voice-input-'));
try {
  seedPatcherAcorn(root);
  const descriptor = voiceRegistry.customPatches.find(p => p.id === 'voice-hold-input');
  assert.ok(descriptor);
  const legacy = await descriptor.apply(fixture + '\n/*__clawgod_voice_hold_input_v2__*/', { rootDir: root });
  assert.equal(legacy.status, 'failed'); assert.equal(legacy.code, undefined, 'old delayed patch requires clean source');
  for (const source of [fixture, new Bun.Transpiler({ loader: 'js' }).transformSync(fixture)]) {
    const result = await descriptor.apply(source, { rootDir: root }); assert.equal(result.status, 'applied', result.detail);
    checks(result.code, 'direct/minified-or-formatted');
    for (const mode of ['dryRun', 'verify']) assert.equal((await descriptor.apply(source, { rootDir: root, [mode]: true })).code, source);
  }
  const split = await descriptor.apply(fixture + '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\nexport const unrelated=1;', { rootDir: root });
  assert.equal(split.status, 'applied', split.detail);
  checks(split.code.split('\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n')[0], 'split modules');
  const drifted = fixture.replace('v(te.current+Fe,', 'v(unknownCount(),');
  const rejected = await descriptor.apply(drifted, { rootDir: root });
  assert.equal(rejected.status, 'failed'); assert.equal(rejected.code, undefined, 'unknown warmup shape fails without partial writes');
  for (const [label, runner] of await getPatcherSources()) for (const graph of [false, true]) {
    const directory = join(root, `${label}-${graph}`, '.clawgod'); mkdirSync(join(directory, 'chunks'), { recursive: true }); seedPatcherAcorn(directory); chmodSync(directory, 0o700);
    writeFileSync(join(directory, 'patch.mjs'), runner);
    writeFileSync(join(directory, 'enhancements.json'), JSON.stringify({ schemaVersion: 1, mode: 'custom', enabled: ['voice'] }, null, 2) + '\n', { mode: 0o600 });
    const target = join(directory, graph ? 'chunks/voice.js' : 'cli.original.cjs'); if (graph) writeFileSync(join(directory, 'cli.original.cjs'), '// entry\n');
    writeFileSync(target, fixture);
    const apply = () => { const result = spawnSync(process.execPath, [join(directory, 'patch.mjs'), '--root', directory, '--enhancements-file', join(directory, 'enhancements.json')], { encoding: 'utf8', timeout: 20000 });
      assert.equal(result.error, undefined, `${label}: ${result.error}`);
      assert.equal(result.status, 0, `${label} (signal=${result.signal}): ${result.stdout}\n${result.stderr}`); };
    apply(); const patched = readFileSync(target, 'utf8'); checks(patched, label);
    apply(); assert.equal(readFileSync(target, 'utf8'), patched, 'idempotent');
    const baseline = session(fixture, { text: '旧行为  ' }), disabled = session(patched, { text: '旧行为  ', gates: { 'voice-mode': false } });
    for (let i = 0; i < 8; i++) { baseline.press(); disabled.press(); }
    assert.deepEqual(disabled.history, baseline.history, 'runtime-off retains upstream behavior');
    writeFileSync(join(directory, 'enhancements.json'), JSON.stringify({ schemaVersion: 1, mode: 'custom', enabled: [] }, null, 2) + '\n');
    writeFileSync(target, fixture); apply(); assert.equal(readFileSync(target, 'utf8'), fixture, 'core-only leaves voice input unchanged');
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('Voice input: shared real hooks, warmup/recording/finalization, whitespace, short press, cancel, runtime-off and split/bundle passed; no audio.');
