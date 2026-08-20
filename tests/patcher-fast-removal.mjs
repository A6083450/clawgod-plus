#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPatcherSources, seedPatcherAcorn } from './patcher-test-sources.mjs';

const fixture = `
// Version: 2.1.237
function qR(name,header){return{name,header}}
let NDr=qR("speed","fast-mode-2026-02-01"),Uxt=qR("oauth_auth","oauth");
function e4(values){return values.map(value=>value.header)}
function dJs(values){return values}
function Hn(){return!1}
function Pu(){return!0}function xz(){return!0}function pje(){return!1}function Uk(){return!0}
let y="claude-opus-5",ee=!0,_e=!1;
function buildRequest(Le,eligibility,existing){_e=eligibility;let Tt=[...existing],ju;if(Pu()&&xz()&&!pje()&&Uk(y)&&!!Le.fastMode)ju="fast";if(_e&&!Tt.includes(NDr))Tt.push(NDr);let Nd=Hn(process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE),Fa=Nd?Tt.filter((Ss)=>Ss===Uxt):Tt;let body={model:y,...ee&&(!Nd||Fa.length>0)&&{betas:e4(dJs(Fa))},...ju!==void 0&&{speed:ju}};return body}
function NV(){return"Opus 5"}
var Q={};
function g0o(){return Q.CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK}
`;

for (const [name, patcher] of await getPatcherSources()) {
  const root = mkdtempSync(join(tmpdir(), 'clawgod-fast-removal-'));
  try {
    seedPatcherAcorn(root);
    const target = join(root, 'cli.original.cjs');
    writeFileSync(join(root, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(target, fixture, 'utf8');

    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: root, encoding: 'utf8' });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, `${name}: a Fast-shaped upstream request must not block patching: ${output}`);
    assert.doesNotMatch(output, /Fast Messages protocol|Fast mode org check bypass|Fast mode model label reflects provider model/, `${name}: Fast patches must not run`);
    assert.equal(readFileSync(target, 'utf8'), fixture, `${name}: Fast request, UI label, and org check must retain upstream bytes`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('patcher Fast removal checks passed');
