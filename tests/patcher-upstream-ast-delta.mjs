#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { scanAstPatches, applyAstEdits, parsePatchSource } from '../src/generic/patcher/semantic.mjs';
import { applySemanticPatch, MODULE_SEPARATOR } from '../src/generic/patcher/semantic-runner.mjs';

// 2.1.323/325 split the provider restriction across an if and a final return.
const autoModeSource = `
function thirdParty(){const route=provider;return route!=='firstParty'&&!aws(route)}
function aws(route){return route==='anthropicAws'}
function supports(input){
  const model=input;
  if(tooOld(model))return false;
  let restricted=thirdParty();
  if(restricted&&(model==='claude-opus-4-6'||model==='claude-sonnet-4-6')){return false;}
  const localRestriction=provider==='firstParty'&&firstPartyRestricted;
  return !((restricted||localRestriction)&&model.includes('haiku')&&model!=='claude-haiku-5-5');
}
function neighbor(){return thirdParty()}
`;
const autoId = 'auto-mode-inline-gate';
const autoScan = scanAstPatches(autoModeSource)[autoId];
assert.equal(autoScan.matches.length, 1);
const autoPatched = applyAstEdits(autoModeSource, autoScan.matches);
parsePatchSource(autoPatched);
assert.equal(scanAstPatches(autoPatched)[autoId].matches.length, 0);
assert.equal(scanAstPatches(autoPatched)[autoId].patched, true);
assert.ok(autoPatched.includes('function neighbor(){return thirdParty()}'));
for (const toggle of [undefined, true, false]) {
  for (const provider of ['firstParty', 'anthropicAws', 'proxy']) {
    for (const firstPartyRestricted of [false, true]) {
      for (const model of ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-haiku-5-5', 'new-model', 'too-old']) {
        const context = { provider, firstPartyRestricted, tooOld: value => value === 'too-old',
          __clawgodPatches: { [autoId]: toggle } };
        const original = runInNewContext(`${autoModeSource};supports(${JSON.stringify(model)})`, context);
        const actual = runInNewContext(`${autoPatched};supports(${JSON.stringify(model)})`, context);
        const expected = toggle !== false && provider === 'proxy' ? model !== 'too-old' : original;
        assert.equal(actual, expected, `${provider}, ${model}, toggle=${toggle}, local=${firstPartyRestricted}`);
        assert.equal(runInNewContext(`${autoPatched};neighbor()`, context), provider === 'proxy');
      }
    }
  }
}
for (const changed of [
  autoModeSource.replace('let restricted=thirdParty();', 'let restricted=unknown();'),
  autoModeSource.replace('let restricted=thirdParty();', 'let restricted=thirdParty();restricted=unknown();'),
]) {
  const result = scanAstPatches(changed)[autoId];
  assert.equal(result.present, true, 'unknown predicates must fail closed');
  assert.equal(result.matches.length, 0);
}
for (const decoy of [
  `function ordinary(){return provider!=="firstParty"&&provider!=="gateway"}`,
  `const sample=${JSON.stringify(autoModeSource)};`,
  `/* ${autoModeSource} */`,
]) {
  const result = scanAstPatches(decoy)[autoId];
  assert.equal(result.present, false, 'unrelated provider checks and text are not stale auto-mode gates');
  assert.equal(result.matches.length, 0);
}

const privacyGate = `function allowed () {'use strict';if (!firstParty()) return false;
  if (!lookup(rollout, false)) return false;return routeAllowed();}`;
const shadowedGate = `function neighbor(){const rollout='other';if(!firstParty())return false;
  if(!lookup(rollout,false))return false;return routeAllowed()}`;
for (const declaration of ['var', 'let', 'const']) {
  const source = `(function(){${declaration} rollout = 'tengu_wiggly_dove';${privacyGate}${shadowedGate}})();`;
  const scanned = scanAstPatches(source)['wiggly-dove'];
  assert.equal(scanned.matches.length, 1, `${declaration}: match the enclosing flag binding`);
  const patched = applyAstEdits(source, scanned.matches);
  parsePatchSource(patched);
  assert.ok(patched.includes(shadowedGate), 'a shadowed flag remains untouched');
  assert.ok(patched.includes("'use strict';;if(globalThis.__clawgodPatches"), 'keep the directive first');
  assert.equal(scanAstPatches(patched)['wiggly-dove'].patched, true);
  assert.equal(scanAstPatches(patched)['wiggly-dove'].matches.length, 0);
}
for (const source of [
  `const rollout='tengu_wiggly_dove';function unknown(){return lookup(rollout,false)}`,
  `function unknown(){return lookup('tengu_wiggly_dove',false)}`,
  `const rollout='tengu_wiggly_dove';${privacyGate}function unknown(){return lookup('tengu_wiggly_dove',false)}`,
  `const rollout='tengu_wiggly_dove';${privacyGate}${privacyGate.replace('allowed', 'ambiguous')}`,
]) {
  const result = scanAstPatches(source)['wiggly-dove'];
  assert.equal(result.present, true, 'unhandled or ambiguous flag uses are stale');
  assert.equal(result.matches.length, 0, 'do not claim partial privacy protection');
}
assert.equal(scanAstPatches(`// const rollout='tengu_wiggly_dove';\nconst text="function f(){return 'tengu_wiggly_dove'}";`)['wiggly-dove'].present, false,
  'comments and source text are not flag bindings');

// tool-result-pairing-recovery AST patch tests:
// Verifies renamed history array bindings, real result recovery, missing fallback,
// idempotence, and stale sentinel detection when structures drift.
{
  const renamedSource = `
    function ensureToolResultPairing(conversationHistory, options) {
      let count = conversationHistory.length;
      let missingIds = ["call_cached", "call_missing"];
      let defaultErr = "[Tool result missing due to internal error]";
      let results = missingIds.map((item) => ({
        type: "tool_result",
        tool_use_id: item,
        content: defaultErr,
        is_error: !0
      }));
      return results;
    }
  `;
  const scannedPairing = scanAstPatches(renamedSource)['tool-result-pairing-recovery'];
  assert.equal(scannedPairing.matches.length, 1, 'matches map with renamed history parameter');
  assert.equal(scannedPairing.present, false);
  assert.equal(scannedPairing.patched, false);

  const patchedPairing = applyAstEdits(renamedSource, scannedPairing.matches);
  parsePatchSource(patchedPairing);
  assert.ok(patchedPairing.includes('for(let _m of conversationHistory)'), 'binds to the renamed parameter name');

  // Verify execution: real result recovery vs missing fallback
  const mockHistory = [
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'call_cached', content: 'PASS: suite verified', is_error: false }
        ]
      }
    }
  ];
  const evalResult = runInNewContext(`${patchedPairing};ensureToolResultPairing(mockHistory, {})`, { mockHistory });
  assert.equal(evalResult.length, 2);
  assert.equal(evalResult[0].tool_use_id, 'call_cached');
  assert.equal(evalResult[0].content, 'PASS: suite verified');
  assert.equal(evalResult[0].is_error, false);
  assert.equal(evalResult[1].tool_use_id, 'call_missing');
  assert.equal(evalResult[1].content, '[Tool result missing due to internal error]');
  assert.equal(evalResult[1].is_error, true);

  // Idempotence
  const secondScan = scanAstPatches(patchedPairing)['tool-result-pairing-recovery'];
  assert.equal(secondScan.matches.length, 0);
  assert.equal(secondScan.patched, true);
  assert.equal(secondScan.present, false);

  // Stale detection
  const staleSource = `
    const err = "[Tool result missing due to internal error]";
    function driftedFunction(unrelated) { return unrelated; }
  `;
  const staleScan = scanAstPatches(staleSource)['tool-result-pairing-recovery'];
  assert.equal(staleScan.matches.length, 0);
  assert.equal(staleScan.present, true);
  assert.equal(staleScan.patched, false);
}

// Non-target error generation function negative test:
// A function generating non-missing errors (e.g. permission errors) in the same
// file with sentinel must not be modified, and should be reported as stale.
{
  const nonTargetSource = `
    const sentinel = "[Tool result missing due to internal error]";
    function permissionErrors(history, ids) {
      void history.length;
      return ids.map(item => ({
        type: "tool_result", tool_use_id: item,
        content: "Permission denied", is_error: true
      }));
    }
  `;
  const nonTargetScan = scanAstPatches(nonTargetSource)['tool-result-pairing-recovery'];
  assert.equal(nonTargetScan.matches.length, 0, 'negative case: non-target error function is not matched');
  assert.equal(nonTargetScan.present, true, 'sentinel present in source triggers stale strategy');
  assert.equal(nonTargetScan.patched, false);
}

// Variable collision avoidance tests:
// 1. History parameter renamed to _m: should not emit `for(let _m of _m)` which causes ReferenceError.
{
  const shadowedHistorySource = `
    function ensureToolResultPairing(_m, ids) {
      void _m.length;
      const missingErr = "[Tool result missing due to internal error]";
      return ids.map(item => ({
        type: "tool_result", tool_use_id: item,
        content: missingErr, is_error: true
      }));
    }
  `;
  const scan = scanAstPatches(shadowedHistorySource)['tool-result-pairing-recovery'];
  assert.equal(scan.matches.length, 1);
  const patched = applyAstEdits(shadowedHistorySource, scan.matches);
  parsePatchSource(patched);
  // Ensure we didn't declare let _m of _m
  assert.ok(!patched.includes('for(let _m of _m)'), 'fresh variable avoids history parameter name collision');

  // Must execute without ReferenceError on missing fallback
  const mockHistory = [];
  const evalResult = runInNewContext(`${patched};ensureToolResultPairing(mockHistory, ["call_none"])`, { mockHistory });
  assert.equal(evalResult.length, 1);
  assert.equal(evalResult[0].tool_use_id, 'call_none');
  assert.equal(evalResult[0].content, '[Tool result missing due to internal error]');
  assert.equal(evalResult[0].is_error, true);
}

// 2. Callback parameter renamed to _p: should not emit `(_p)=>{let _p;...}` which causes SyntaxError.
{
  const shadowedCallbackSource = `
    function ensureToolResultPairing(history, ids) {
      void history.length;
      const missingErr = "[Tool result missing due to internal error]";
      return ids.map(_p => ({
        type: "tool_result", tool_use_id: _p,
        content: missingErr, is_error: true
      }));
    }
  `;
  const scan = scanAstPatches(shadowedCallbackSource)['tool-result-pairing-recovery'];
  assert.equal(scan.matches.length, 1);
  const patched = applyAstEdits(shadowedCallbackSource, scan.matches);
  parsePatchSource(patched);
  assert.ok(!patched.includes('(_p)=>{let _p;'), 'fresh variable avoids callback parameter name collision');

  // Must execute and recover correctly
  const mockHistory = [
    {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'call_rec', content: 'RECOVERED_OK', is_error: false }]
      }
    }
  ];
  const evalResult = runInNewContext(`${patched};ensureToolResultPairing(mockHistory, ["call_rec", "call_miss"])`, { mockHistory });
  assert.equal(evalResult.length, 2);
  assert.equal(evalResult[0].content, 'RECOVERED_OK');
  assert.equal(evalResult[0].is_error, false);
  assert.equal(evalResult[1].content, '[Tool result missing due to internal error]');
  assert.equal(evalResult[1].is_error, true);
}

// Nested functions and parameter shadowing tests:
// Outer wrapper accessing config[0] must not be mistaken for history array,
// and must not create overlapping edits on inner function's map call.
{
  const nestedSource = `
    function outerWrapper(config) {
      void config[0];
      function ensureToolResultPairing(innerHistory, missingIds) {
        let count = innerHistory.length;
        let defaultErr = "[Tool result missing due to internal error]";
        return missingIds.map(item => ({
          type: "tool_result",
          tool_use_id: item,
          content: defaultErr,
          is_error: !0
        }));
      }
      return ensureToolResultPairing;
    }
  `;
  const scan = scanAstPatches(nestedSource)['tool-result-pairing-recovery'];
  assert.equal(scan.matches.length, 1, 'exactly one match without outer scope claiming inner statement');
  const patched = applyAstEdits(nestedSource, scan.matches); // Throws if overlapping
  parsePatchSource(patched);
  assert.ok(patched.includes('for(let _m of innerHistory)'), 'binds to innerHistory, not outer config');
  assert.ok(!patched.includes('for(let _m of config)'), 'does not bind to outer wrapper parameter');

  const mockHistory = [
    {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'inner ok', is_error: false }]
      }
    }
  ];
  const evalResult = runInNewContext(`${patched};outerWrapper({})(mockHistory, ["c1", "c2"])`, { mockHistory });
  assert.equal(evalResult.length, 2);
  assert.equal(evalResult[0].content, 'inner ok');
  assert.equal(evalResult[1].content, '[Tool result missing due to internal error]');
}

// End-to-end orphan detection pipeline test:
// Tests a full pairing repair function that models the real upstream deduplication,
// orphan check, and synthesis logic.
// Validates:
// 1. Before patch: synthesis injects missing errors for missing tool results.
// 2. After patch: recovers authentic results from message history.
// 3. True failure preservation: real errors retain is_error: true and original error content.
// 4. Fallback: unseen tool_use correctly synthesizes missing error.
// 5. Pairing constraints: every assistant tool_use has exactly one tool_result in the following user message.
{
  const fullPairingSource = `
    const SENTINEL = "[Tool result missing due to internal error]";
    function ensureToolResultPairing(messages) {
      let repaired = [];
      let modified = false;
      let seen = new Set();
      for (let i = 0; i < messages.length; i++) {
        let msg = messages[i];
        if (msg.type !== "assistant") {
          repaired.push(msg);
          continue;
        }
        let assistantIds = new Set();
        let valid = msg.message.content.filter(b => {
          if (b.type === "tool_use") {
            if (seen.has(b.id)) { modified = true; return false; }
            seen.add(b.id);
            assistantIds.add(b.id);
          }
          return true;
        });
        repaired.push(valid.length !== msg.message.content.length ? { ...msg, message: { ...msg.message, content: valid } } : msg);
        let nextMsg = messages[i + 1];
        let userIds = new Set();
        if (nextMsg?.type === "user" && Array.isArray(nextMsg.message.content)) {
          for (let b of nextMsg.message.content) {
            if (b?.type === "tool_result") userIds.add(b.tool_use_id);
          }
        }
        let missing = [...assistantIds].filter(id => !userIds.has(id));
        let unexpected = [...userIds].filter(id => !assistantIds.has(id));
        if (missing.length === 0 && unexpected.length === 0) continue;
        modified = true;
        let synthetic = missing.map(id => ({
          type: "tool_result",
          tool_use_id: id,
          content: SENTINEL,
          is_error: true
        }));
        if (nextMsg?.type === "user") {
          let content = Array.isArray(nextMsg.message.content) ? nextMsg.message.content : [{ type: "text", text: nextMsg.message.content }];
          if (unexpected.length > 0) {
            let unexpSet = new Set(unexpected);
            content = content.filter(b => !(b?.type === "tool_result" && unexpSet.has(b.tool_use_id)));
          }
          i++;
          repaired.push({ ...nextMsg, message: { ...nextMsg.message, content: [...synthetic, ...content] } });
        } else if (synthetic.length > 0) {
          repaired.push({ type: "user", message: { content: synthetic } });
        }
      }
      return modified ? repaired : messages;
    }
  `;

  // Realistic sanitized sequence:
  // Turn 1:
  // assistant calls fetch_spec.
  // user returns fetch_spec result, AND pre-delivers concurrent results for run_batch (success)
  // and lint_check (failure: exit code 1) from parallel execution.
  // Turn 2:
  // assistant plans next step and emits run_batch, lint_check, and a totally fresh build_final.
  // user responds with plain text "continue", missing results in immediate next turn.
  const sampleMessages = [
    {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'call_fetch', name: 'fetch_spec', input: {} }]
      }
    },
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'call_fetch', content: 'SPEC CONTENT OK', is_error: false },
          { type: 'tool_result', tool_use_id: 'call_batch', content: 'PASS: 42 batch tests executed', is_error: false },
          { type: 'tool_result', tool_use_id: 'call_lint', content: 'exit code 1: trailing whitespace in parser.js', is_error: true }
        ]
      }
    },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'call_batch', name: 'run_batch', input: {} },
          { type: 'tool_use', id: 'call_lint', name: 'lint_check', input: {} },
          { type: 'tool_use', id: 'call_build', name: 'build_final', input: {} }
        ]
      }
    },
    {
      type: 'user',
      message: {
        content: [{ type: 'text', text: 'continue' }]
      }
    }
  ];

  // 1. Verify unpatched baseline: injects synthetic missing errors
  const unpatchedResult = runInNewContext(`${fullPairingSource};ensureToolResultPairing(sampleMessages)`, {
    sampleMessages: structuredClone(sampleMessages)
  });
  const unpatchedTurn2User = unpatchedResult[3];
  const unpatchedBatchResult = unpatchedTurn2User.message.content.find(b => b.tool_use_id === 'call_batch');
  const unpatchedLintResult = unpatchedTurn2User.message.content.find(b => b.tool_use_id === 'call_lint');
  const unpatchedBuildResult = unpatchedTurn2User.message.content.find(b => b.tool_use_id === 'call_build');

  assert.equal(unpatchedBatchResult.content, '[Tool result missing due to internal error]', 'unpatched injects missing error');
  assert.equal(unpatchedBatchResult.is_error, true);
  assert.equal(unpatchedLintResult.content, '[Tool result missing due to internal error]', 'unpatched overwrites real lint error');
  assert.equal(unpatchedBuildResult.content, '[Tool result missing due to internal error]');

  // 2. Scan and patch full pairing function
  const scan = scanAstPatches(fullPairingSource)['tool-result-pairing-recovery'];
  assert.equal(scan.matches.length, 1);
  const patched = applyAstEdits(fullPairingSource, scan.matches);
  parsePatchSource(patched);

  // 3. Verify patched execution
  const patchedResult = runInNewContext(`${patched};ensureToolResultPairing(sampleMessages)`, {
    sampleMessages: structuredClone(sampleMessages)
  });
  const patchedTurn2User = patchedResult[3];
  const patchedBatchResult = patchedTurn2User.message.content.find(b => b.tool_use_id === 'call_batch');
  const patchedLintResult = patchedTurn2User.message.content.find(b => b.tool_use_id === 'call_lint');
  const patchedBuildResult = patchedTurn2User.message.content.find(b => b.tool_use_id === 'call_build');

  // Verify successful result recovery
  assert.equal(patchedBatchResult.content, 'PASS: 42 batch tests executed', 'recovers authentic success result');
  assert.equal(patchedBatchResult.is_error, false);

  // Verify authentic failure state preservation
  assert.equal(patchedLintResult.content, 'exit code 1: trailing whitespace in parser.js', 'preserves real error description');
  assert.equal(patchedLintResult.is_error, true, 'strictly preserves authentic failure state (is_error: true)');

  // Verify missing fallback
  assert.equal(patchedBuildResult.content, '[Tool result missing due to internal error]', 'fallback to synthesized error when truly absent');
  assert.equal(patchedBuildResult.is_error, true);

  // 4. Verify Anthropic API pairing constraints
  for (let i = 0; i < patchedResult.length; i++) {
    const msg = patchedResult[i];
    if (msg.type === 'assistant') {
      const next = patchedResult[i + 1];
      assert.ok(next && next.type === 'user', 'every assistant message must be followed by a user message');
      const toolUses = msg.message.content.filter(b => b.type === 'tool_use');
      const toolResults = next.message.content.filter(b => b.type === 'tool_result');
      const resultIdSet = new Set(toolResults.map(r => r.tool_use_id));
      for (const tu of toolUses) {
        assert.ok(resultIdSet.has(tu.id), `every tool_use (${tu.id}) has a corresponding tool_result`);
      }
    }
  }
}

// Same-spelled identifiers must resolve to their actual lexical bindings.
{
  const sentinel = '[Tool result missing due to internal error]';
  const object = '{type:"tool_result",tool_use_id:item,content:err,is_error:true}';
  const map = `ids.map(item=>(${object}))`;
  const outer = `const err=${JSON.stringify(sentinel)};`;
  for (const source of [
    `${outer}function pairing(history,ids){void history.length;const err="Permission denied";return ${map}}`,
    `${outer}function pairing(history,ids,err){void history.length;return ${map}}`,
    `${outer}function pairing(history,ids){void history.length;{const err="Permission denied";return ${map}}}`,
    `${outer}function pairing(history,ids){void history.length;try{throw "Permission denied"}catch(err){return ${map}}}`,
    `function other(){const err=${JSON.stringify(sentinel)}}function pairing(history,ids){void history.length;const err="Permission denied";return ${map}}`,
    `let err=${JSON.stringify(sentinel)};err="Permission denied";function pairing(history,ids){void history.length;return ${map}}`,
    `${outer}function pairing(history,ids){void history.length;{const history={};return ${map}}}`,
    `${outer}function pairing(history,ids){void history.length;return ids.map(item=>{const err=${JSON.stringify(sentinel)};return ${object}})}`,
    `${outer}function pairing(history,ids){void history.length;return ids.map(item=>{record(item);return ${object}})}`,
    `${outer}function pairing(history,ids){void history.length;return ids.map(item=>({...${object},metadata:42}))}`,
  ]) {
    const result = scanAstPatches(source)['tool-result-pairing-recovery'];
    assert.equal(result.matches.length, 0, source);
    assert.equal(result.present, true, 'unsupported bindings and callback bodies must be stale');
    assert.equal(applyAstEdits(source, result.matches), source);
  }

  // Both declaration initializers and Bun-style deferred assignments are supported.
  for (const declaration of [outer, `var err;function initialize(){err=${JSON.stringify(sentinel)}}initialize();`]) {
    for (const callback of [`item=>(${object})`, `function(item){return ${object}}`]) {
      const source = `${declaration}function pairing(history,ids){void history.length;return ids.map(${callback})}`;
      const result = scanAstPatches(source)['tool-result-pairing-recovery'];
      assert.equal(result.matches.length, 1);
      const patched = applyAstEdits(source, result.matches);
      parsePatchSource(patched);
      const history = [{type:'user',message:{content:[{type:'tool_result',tool_use_id:'cached',content:'real output',is_error:false}]}}];
      const recovered = runInNewContext(`${patched};pairing(history,['cached','missing'])`, {history});
      assert.equal(recovered[0].content, 'real output');
      assert.equal(recovered[1].content, sentinel);
    }
  }

  // The original map parameter may legally reuse the history parameter's name.
  const source = `${outer}function pairing(history,ids){void history.length;return ids.map(history=>({type:"tool_result",tool_use_id:history,content:err,is_error:true}))}`;
  const result = scanAstPatches(source)['tool-result-pairing-recovery'];
  assert.equal(result.matches.length, 1);
  const patched = applyAstEdits(source, result.matches);
  parsePatchSource(patched);
  const history = [{type:'user',message:{content:[
    {type:'tool_result',tool_use_id:'cached',content:'real output',is_error:false},
    {type:'tool_result',tool_use_id:'failed',content:'exit code 1',is_error:true},
  ]}}];
  for (const enabled of [true, false]) {
    const recovered = runInNewContext(`${patched};pairing(history,['cached','failed','missing'])`, {
      history, __clawgodPatches: {'tool-result-pairing-recovery':enabled},
    });
    assert.equal(recovered[0].content, enabled ? 'real output' : sentinel);
    assert.equal(recovered[0].is_error, !enabled);
    assert.equal(recovered[1].content, enabled ? 'exit code 1' : sentinel);
    assert.equal(recovered[1].is_error, true);
    assert.equal(recovered[2].content, sentinel);
  }
  assert.equal(scanAstPatches(patched)['tool-result-pairing-recovery'].patched, true);
}


// Fork contracts: scoped collisions, directives, runner safety and no mutation.
{
  const semanticId = 'tool-result-pairing-recovery';
  const sentinel = '[Tool result missing due to internal error]';
  const object = '{type:"tool_result",tool_use_id:item,content:err,is_error:true}';
  const source = `const err=${JSON.stringify(sentinel)};function pairing(history,ids){'use strict'\n` +
    `let _p,_m,_b,_id;const Map=0,Set=0,Array=0;void history.length;return ids.map(item=>(${object}))}`;
  const result = applySemanticPatch(source, { semanticId });
  assert.equal(result.status, 'applied');
  const input = [{ type: 'user', message: { content: [
    { type: 'tool_result', tool_use_id: 'ok', content: 'verified', is_error: false },
    { type: 'tool_result', tool_use_id: 'error', content: 'failed', is_error: true },
  ] } }];
  const before = JSON.stringify(input);
  for (const enabled of [undefined, true, false]) {
    const output = runInNewContext(`${result.code};pairing(history,['ok','error','missing'])`, {
      history: input, __clawgodPatches: { [semanticId]: enabled },
    });
    assert.equal(output[0].content, enabled === false ? sentinel : 'verified');
    assert.equal(output[1].content, enabled === false ? sentinel : 'failed');
    assert.equal(output[1].is_error, true);
    assert.equal(output[2].content, sentinel);
    assert.notEqual(output[0], input[0].message.content[0], 'recovered result is a shallow copy');
  }
  assert.equal(JSON.stringify(input), before, 'recovery cannot mutate conversation history');
  assert.equal(applySemanticPatch(result.code, { semanticId }).status, 'already');
  assert.equal(applySemanticPatch(result.code, { semanticId }).code, result.code);
  for (const options of [{ dryRun: true }, { verify: true }]) {
    const checked = applySemanticPatch(source, { semanticId, ...options });
    assert.equal(checked.code, source);
    assert.equal(checked.count, 1);
  }
  for (const declaration of [
    'const {err}=other;', 'const [err]=other;', 'class err {}',
    'for(let err of other){return ids.map(item=>(' + object + '))}',
    'for(err of other){}', 'err++;', '({err}=other);',
    'const history=[];',
  ]) {
    const candidate = `const err=${JSON.stringify(sentinel)};function pairing(history,ids){void history.length;{${declaration}return ids.map(item=>(${object}))}}`;
    const checked = applySemanticPatch(candidate, { semanticId });
    assert.equal(checked.status, 'stale', declaration);
    assert.equal(checked.code, candidate);
  }
  // Bound sentinel copied from callback parameter cannot leak into generated code.
  const callbackShadow = `const err=${JSON.stringify(sentinel)};function pairing(history,ids){void history.length;return ids.map(err=>({type:'tool_result',tool_use_id:err,content:err,is_error:true}))}`;
  assert.equal(applySemanticPatch(callbackShadow, { semanticId }).status, 'stale');
  const duplicate = source + MODULE_SEPARATOR + source;
  const multiple = applySemanticPatch(duplicate, { semanticId });
  assert.equal(multiple.status, 'applied');
  assert.equal(multiple.count, 2);
}
{
  const semanticId = 'wiggly-dove';
  const source = `const rollout='tengu_wiggly_dove';${privacyGate}`;
  const result = applySemanticPatch(source, { semanticId });
  assert.equal(result.status, 'applied');
  for (const enabled of [true, false]) {
    let calls = 0;
    const actual = runInNewContext(`${result.code};allowed()`, {
      firstParty: () => true, lookup: () => { calls++; return true; }, routeAllowed: () => true,
      __clawgodPatches: { [semanticId]: enabled, 'geo-neutralize': !enabled },
    });
    assert.equal(actual, !enabled, 'privacy has its own runtime toggle');
    assert.equal(calls, enabled ? 0 : 1, 'disabled collection gate never probes rollout');
  }
  for (const options of [{ dryRun: true }, { verify: true }]) assert.equal(applySemanticPatch(source, { semanticId, ...options }).code, source);
  for (const candidate of [
    source + privacyGate.replace('allowed', 'duplicate'), source + MODULE_SEPARATOR + source,
  ]) {
    for (const options of [{}, { dryRun: true }, { verify: true }]) {
      const checked = applySemanticPatch(candidate, { semanticId, ...options });
      assert.equal(checked.status, 'failed');
      assert.equal(checked.code, candidate);
    }
  }
  const shadow = `function wrapper(globalThis){${source};return allowed}`;
  const shadowed = applySemanticPatch(shadow, { semanticId });
  assert.equal(shadowed.status, 'stale');
  assert.equal(shadowed.code, shadow);
  const drift = source + `function neighbor(){return lookup(rollout,false)}`;
  assert.equal(applySemanticPatch(drift, { semanticId }).status, 'stale');
}

console.log('upstream AST delta regression checks passed');
