#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const unixInstaller = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const powerShellInstaller = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function extractUnixPatcher() {
  const marker = 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'';
  const start = unixInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.sh must embed patch.mjs');
  const bodyStart = unixInstaller.indexOf('\n', start) + 1;
  const end = unixInstaller.indexOf('\nPATCHER_EOF', bodyStart);
  assert.notEqual(end, -1, 'install.sh patcher heredoc must end');
  return unixInstaller.slice(bodyStart, end);
}

function extractPowerShellPatcher() {
  const marker = "$patcherCode = @'\n";
  const start = powerShellInstaller.indexOf(marker);
  assert.notEqual(start, -1, 'install.ps1 must embed patch.mjs');
  const bodyStart = start + marker.length;
  const end = powerShellInstaller.indexOf("\n'@\n\nSet-Content", bodyStart);
  assert.notEqual(end, -1, 'install.ps1 patcher here-string must end');
  return powerShellInstaller.slice(bodyStart, end);
}

const fixture = `
/* Version: 2.1.220 */
function aNm(e){for(let t=0;t<e.length;t++){let r=e[t];if(r==="--debug"||r==="-d"||r==="--debug-to-stderr"||r==="-d2e"||r.startsWith("--debug=")||r.startsWith("--debug-file="))continue;if(r==="--debug-file"&&t+1<e.length){t++;continue}return!1}return!0}
function NNn(e){let t=[];for(let r=0;r<e.length;r++){if(e[r]==="--chrome")continue;if(e[r]==="--settings"&&r+1<e.length){r++;continue}t.push(e[r])}return{hasAgentsPositional:!1,rest:t}}
function iTT(e){return{dispatchDefaults:void 0,rest:e}}
function launch(t){let n=NNn(t),{dispatchDefaults:o,rest:i}=iTT(n.rest),s=n.hasAgentsPositional&&aNm(i);if((s||aNm(t)&&process.stdin.isTTY)&&process.stdout.isTTY){return"agents"}return"chat"}
globalThis.launch=launch;

let collapseState,stateCall=0,P9n=[];
const NRi=["blocked","active","completed"];
const Dn={
  useState(initial){let value=typeof initial==="function"?initial():initial,index=++stateCall;if(index===2)collapseState=value;return[value,(update)=>{value=typeof update==="function"?update(value):update;if(index===2)collapseState=value}]},
  useRef(current){return{current}},
  useLayoutEffect(effect){effect()},
};
function O8m({initialCollapsed:i}){let[A,R]=Dn.useState(P9n),uo="directory",oo=Dn.useRef(uo),ed=(Ve,Rr)=>Ve==="pinned"?"pinned":\`\${Rr??oo.current}:\${Ve}\`,[Aa,gp]=Dn.useState(()=>{let Ve=NRi;return new Set((i??[]).map((Rr)=>Rr==="pinned"||/^(state|directory|group):/.test(Rr)?Rr:\`\${Ve.includes(Rr)?"state":"directory"}:\${Rr}\`))}),Vd=Dn.useRef(Aa);Vd.current=Aa;let[Rc,Eh]=Dn.useState(()=>new Set),xbe={rows:[...new Set(A.map((Ve)=>Ve.state.cwd))].map((Ve)=>({kind:"header",group:Ve}))},JE=xbe.rows;if(Aa.size>0)JE=JE.filter((Ve)=>Ve.kind==="header"||!Aa.has(ed(Ve.group)));function hGe(){}let Cs=(Ve)=>gp((Rr)=>{let jr=ed(Ve),Xr=new Set(Rr);if(Xr.has(jr))Xr.delete(jr);else Xr.add(jr);return Xr});globalThis.toggleGroup=Cs;return JE}
globalThis.renderGroups=(jobs,initialCollapsed)=>{P9n=jobs;stateCall=0;return O8m({initialCollapsed})};
globalThis.getCollapsed=()=>[...collapseState].sort();
globalThis.getCollapsedDirectories=()=>[...collapseState].filter((key)=>key.startsWith("directory:")).sort();

var NRm=5;
function qr(){return globalThis.terminalSize}
function bLe(e,t,r){globalThis.windowLimit=r;let n=Math.max(0,Math.min(e-r+1,Math.max(0,t-r))),o=Math.min(n+r,t);return{windowStart:n,windowEnd:o,moreAbove:n,moreBelow:t-o}}
const Ts={jsx(){return!0}},I={};
function vvl({showWorkflows:e=!1}={}){let t=globalThis.taskList,q=globalThis.selectedTaskIndex??0,{columns:s}=qr(),a=s,{windowStart:j,windowEnd:B,moreAbove:F,moreBelow:W}=bLe(q,t.length,NRm),moreVisible=t.length>NRm&&Ts.jsx(I,{justifyContent:"flex-end",children:W});return{moreVisible,values:[j,B,F,W,a,e]}}
globalThis.visibleTaskState=(rows,count,selected=0)=>{globalThis.terminalSize={columns:120,rows};globalThis.taskList=Array.from({length:count});globalThis.selectedTaskIndex=selected;let result=vvl();return{limit:globalThis.windowLimit,moreVisible:result.moreVisible,windowStart:result.values[0],moreAbove:result.values[2],moreBelow:result.values[3]}};
`;

for (const [installerName, patcher] of [
  ['install.sh', extractUnixPatcher()],
  ['install.ps1', extractPowerShellPatcher()],
]) {
  const dir = mkdtempSync(join(tmpdir(), 'clawgod-default-agents-'));
  try {
    writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
    writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

    const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, `${installerName}: ${run.stdout}${run.stderr}`);

    const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
    const context = {
      process: { stdin: { isTTY: true }, stdout: { isTTY: true } },
    };
    runInNewContext(patched, context);

    assert.equal(
      context.visibleTaskState(8, 10).limit,
      2,
      `${installerName}: short terminals must reserve rows around the Agent list`,
    );
    assert.equal(
      context.visibleTaskState(12, 10).limit,
      5,
      `${installerName}: normal terminals should retain the five-Agent window`,
    );
    assert.equal(
      context.visibleTaskState(8, 4).moreVisible,
      true,
      `${installerName}: an adaptive window must still show that more Agents exist`,
    );
    const lastTask = context.visibleTaskState(8, 3, 2);
    assert.equal(lastTask.windowStart, 1, `${installerName}: the last Agent must be reachable`);
    assert.equal(lastTask.moreAbove, 1, `${installerName}: navigation must expose the upper overflow`);
    assert.equal(lastTask.moreBelow, 0, `${installerName}: the selected last Agent must be in view`);

    assert.equal(
      context.launch(['--chrome']),
      'agents',
      `${installerName}: auto-injected --chrome must still honor defaultToAgentsView`,
    );
    assert.equal(
      context.launch([
        '--chrome',
        '--session-id',
        '11111111-2222-4333-8444-555555555555',
        '--settings',
        '{}',
      ]),
      'agents',
      `${installerName}: session metadata must not suppress defaultToAgentsView`,
    );
    assert.equal(
      context.launch([
        '--chrome',
        '--session-id',
        '11111111-2222-4333-8444-555555555555',
        '--settings',
        '{}',
        'answer this prompt',
      ]),
      'chat',
      `${installerName}: a real prompt must still open the normal chat view`,
    );

    context.renderGroups([
      { state: { cwd: '/repo/alpha' } },
      { state: { cwd: '/repo/beta' } },
    ]);
    assert.deepEqual(
      Array.from(context.getCollapsedDirectories()),
      ['directory:/repo/alpha', 'directory:/repo/beta'],
      `${installerName}: newly loaded directory groups must default to collapsed`,
    );
    context.toggleGroup('/repo/alpha');
    assert.deepEqual(
      Array.from(context.getCollapsedDirectories()),
      ['directory:/repo/beta'],
      `${installerName}: manually expanding one directory must leave the other collapsed`,
    );
    const persistedWithOneExpanded = context.getCollapsed();
    context.renderGroups(
      [
        { state: { cwd: '/repo/alpha' } },
        { state: { cwd: '/repo/beta' } },
      ],
      persistedWithOneExpanded.length ? persistedWithOneExpanded : undefined,
    );
    assert.deepEqual(
      Array.from(context.getCollapsedDirectories()),
      ['directory:/repo/beta'],
      `${installerName}: an explicitly expanded directory must remain expanded after remount`,
    );

    context.renderGroups([{ state: { cwd: '/repo/only' } }]);
    context.toggleGroup('/repo/only');
    const persistedWithAllExpanded = context.getCollapsed();
    context.renderGroups(
      [{ state: { cwd: '/repo/only' } }],
      persistedWithAllExpanded.length ? persistedWithAllExpanded : undefined,
    );
    assert.deepEqual(
      Array.from(context.getCollapsedDirectories()),
      [],
      `${installerName}: expanding every directory must still survive remount`,
    );

    const rerun = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(rerun.status, 0, `${installerName} idempotence: ${rerun.stdout}${rerun.stderr}`);
    assert.match(
      rerun.stdout + rerun.stderr,
      /Chat Agent list fits terminal height \(already applied, marker present\)/,
      `${installerName}: rerun must recognize the applied Agent-list marker`,
    );
    assert.match(
      rerun.stdout + rerun.stderr,
      /Chat Agent list keeps overflow indicator \(already applied, marker present\)/,
      `${installerName}: rerun must recognize the applied overflow-indicator marker`,
    );
    assert.equal(
      readFileSync(join(dir, 'cli.original.cjs'), 'utf8'),
      patched,
      `${installerName}: applying the patcher twice must not change the startup gate again`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('patcher default Agents view checks passed');
