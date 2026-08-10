#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const patcher = readFileSync(new URL('../src/generic/patcher/entry.mjs', import.meta.url), 'utf8');
const unixHelper = readFileSync(new URL('../apply-claude-code-chrome-fix.sh', import.meta.url), 'utf8');
const powerShellHelper = readFileSync(new URL('../apply-claude-code-chrome-fix.ps1', import.meta.url), 'utf8');

for (const [name, helper] of [
  ['apply-claude-code-chrome-fix.sh', unixHelper],
  ['apply-claude-code-chrome-fix.ps1', powerShellHelper],
]) {
  assert.doesNotMatch(
    helper,
    /var __paths=.*\.getSocketPaths\(\)/,
    `${name}: helper must not synchronously inspect the async socket path result`,
  );
  assert.match(
    helper,
    /return \$\{paramName\}\.getSocketPaths\?\$\{socketCall\}:\$\{paramName\}\.bridgeConfig\?\$\{bridgeCall\}:\$\{nativeCall\}/,
    `${name}: helper must delegate async socket discovery to the socket pool client`,
  );
  assert.match(helper, /legacyClientFactory/, `${name}: helper must detect legacy synchronous Chrome patches`);
  assert.match(helper, /__ccpp_bridge_fallback_v2/, `${name}: helper must mark the async-safe Chrome patch version`);
}

function extractUnixHelperPatcher() {
  const marker = 'cat > "$PATCH_SCRIPT" << \'PATCH_EOF\'';
  const start = unixHelper.indexOf(marker);
  assert.notEqual(start, -1, 'Unix helper must embed a patcher');
  const bodyStart = unixHelper.indexOf('\n', start) + 1;
  const end = unixHelper.indexOf('\nPATCH_EOF', bodyStart);
  assert.notEqual(end, -1, 'Unix helper patcher heredoc must end');
  return unixHelper.slice(bodyStart, end);
}

function extractPowerShellHelperPatcher() {
  const marker = "$patchScript = @'\n";
  const start = powerShellHelper.indexOf(marker);
  assert.notEqual(start, -1, 'PowerShell helper must embed a patcher');
  const bodyStart = start + marker.length;
  const end = powerShellHelper.indexOf("\n'@\n", bodyStart);
  assert.notEqual(end, -1, 'PowerShell helper patcher here-string must end');
  return powerShellHelper.slice(bodyStart, end);
}

const factorySupport = `
/* Version: 2.1.218 */
function bridgeClient(config){return {kind:"bridge",config}}
function socketClient(config){return {kind:"socket",config}}
function nativeClient(config){return {kind:"native",config}}
function hasAcceptedChromeOAuthScope(){return!1}
function logChrome(message){return message}
function shouldEnableChrome(requested){if(!hasAcceptedChromeOAuthScope())return logChrome("[Claude in Chrome] Disabled: OAuth token has no scope accepted by /api/oauth/validate (needs user:profile, user:office, or user:ccr_inference; env-var and setup-token sessions default to user:inference only)"),!1;if(requested===!0)return!0;return!1}
function parseAgents(args){let r={addDir:[],pluginDir:[],pluginDirNoMcp:[],settings:void 0,mcpConfig:[],strictMcpConfig:!1};for(let a of args){if(a==="--strict-mcp-config"){r.strictMcpConfig=!0;continue}}return r}
function resolveAgents(e){return{strictMcpConfig:e.strictMcpConfig}}function afterResolve(){}
function dispatchAgents(e){return{args:[...e.strictMcpConfig?["--strict-mcp-config"]:[]]}}
globalThis.shouldEnableChrome=shouldEnableChrome;
`;

const fixtures = [
  ['pristine', `${factorySupport}
function createChromeClient(config){return config.bridgeConfig?bridgeClient(config):config.getSocketPaths?socketClient(config):nativeClient(config)}
globalThis.createChromeClient=createChromeClient;
`],
  ['legacy patched', `${factorySupport}
function createChromeClient(config){if(config.getSocketPaths){var __paths=config.getSocketPaths();if(__paths&&__paths.length>0)return socketClient(config)}return config.bridgeConfig?bridgeClient(config):nativeClient(config)}/*__ccpp_bridge_fallback*/
globalThis.createChromeClient=createChromeClient;
`],
];

function disableAcorn(dir) {
  const acornDir = join(dir, 'node_modules', 'acorn');
  mkdirSync(acornDir, { recursive: true });
  writeFileSync(join(acornDir, 'index.js'), 'throw new Error("acorn disabled for test");\n', 'utf8');
  writeFileSync(
    join(dir, 'no-fetch.cjs'),
    'globalThis.fetch = undefined; import(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });\n',
    'utf8',
  );
}

function evaluate(code) {
  const context = { globalThis: {} };
  context.globalThis = context;
  runInNewContext(code, context);
  return context;
}

let helperAcornSource;
for (const [name, patcherSource] of [['canonical patcher', patcher]]) {
  for (const noAcorn of [false, true]) {
    for (const [fixtureName, fixture] of fixtures) {
      const mode = noAcorn ? 'regex fallback' : 'AST';
      const label = `${name} ${mode} ${fixtureName}`;
      const dir = mkdtempSync(join(tmpdir(), 'clawgod-chrome-socket-'));
      try {
        assert.doesNotMatch(patcherSource, /require\(['"]acorn['"]\)/, `${label}: ambient package caches must not select Acorn`);
        if (noAcorn) disableAcorn(dir);
        writeFileSync(join(dir, 'patch.mjs'), patcherSource, 'utf8');
        writeFileSync(join(dir, 'cli.original.cjs'), fixture, 'utf8');

        const args = noAcorn ? ['no-fetch.cjs', './patch.mjs'] : ['patch.mjs'];
        const run = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
        const output = run.stdout + run.stderr;
        assert.equal(run.status, 0, `${label}: ${output}`);

        const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
        helperAcornSource ??= readFileSync(join(dir, 'vendor', 'acorn.cjs'), 'utf8');
        assert.match(helperAcornSource, /acorn\.version|exports\.parse/);
        new Function(patched);
        assert.match(patched, /__ccpp_bridge_fallback/, `${label}: Chrome factory must be patched`);
        assert.doesNotMatch(patched, /var __paths=.*\.getSocketPaths\(\)/, `${label}: legacy synchronous probe must be removed`);

        const context = evaluate(patched);
        assert.equal(
          context.shouldEnableChrome(true),
          true,
          `${label}: an explicit --chrome request must bypass the OAuth scope gate for local socket mode`,
        );
        const asyncSocketConfig = {
          bridgeConfig: { url: 'wss://bridge.example' },
          getSocketPaths: async () => ['/tmp/claude-mcp-browser-bridge.sock'],
        };
        assert.equal(
          context.createChromeClient(asyncSocketConfig).kind,
          'socket',
          `${label}: async getSocketPaths must select the local socket client over the OAuth bridge`,
        );
        assert.equal(
          context.createChromeClient({ bridgeConfig: { url: 'wss://bridge.example' } }).kind,
          'bridge',
          `${label}: bridge-only configurations must keep using the bridge client`,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

const helperFixtures = [
  ['pristine', fixtures[0][1]],
  ['legacy patched', fixtures[1][1]],
];

for (const [name, patcher] of [
  ['apply-claude-code-chrome-fix.sh', extractUnixHelperPatcher()],
  ['apply-claude-code-chrome-fix.ps1', extractPowerShellHelperPatcher()],
]) {
  for (const [fixtureName, fixture] of helperFixtures) {
    const label = `${name} ${fixtureName}`;
    const dir = mkdtempSync(join(tmpdir(), 'clawgod-chrome-helper-'));
    try {
      assert.ok(helperAcornSource, `${label}: installer run must provide Acorn source`);
      writeFileSync(join(dir, 'acorn.cjs'), helperAcornSource, 'utf8');
      writeFileSync(join(dir, 'patch.cjs'), patcher, 'utf8');
      writeFileSync(join(dir, 'cli.js'), fixture, 'utf8');

      const run = spawnSync(process.execPath, ['patch.cjs', './acorn.cjs', 'cli.js'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, BACKUP_SUFFIX: 'test-backup' },
      });
      const output = run.stdout + run.stderr;
      assert.equal(run.status, 0, `${label}: ${output}`);

      const patched = readFileSync(join(dir, 'cli.js'), 'utf8');
      const context = evaluate(patched);
      assert.equal(
        context.shouldEnableChrome(true),
        true,
        `${label}: executing the helper patcher must bypass the OAuth scope gate for explicit --chrome`,
      );
      assert.match(
        patched,
        /__ccpp_chrome_oauth_scope_bypass/,
        `${label}: helper patcher must mark the OAuth scope bypass`,
      );
      assert.match(patched, /strictMcpConfig:!1,chrome:!1,noChrome:!1/, `${label}: agents state must be patched`);
      assert.match(patched, /if\(a==="--chrome"\)\{r\.chrome=!0;continue\}/, `${label}: agents parser must be patched`);
      assert.match(patched, /chrome:e\.chrome&&!e\.noChrome,noChrome:e\.noChrome/, `${label}: agents resolver must be patched`);
      assert.match(patched, /__ccpp_agents_chrome_dispatch/, `${label}: agents dispatch must be patched`);

      const check = spawnSync(process.execPath, ['patch.cjs', './acorn.cjs', 'cli.js', '--check'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, BACKUP_SUFFIX: 'test-backup' },
      });
      assert.equal(check.status, 2, `${label}: already-patched check state must exit 2: ${check.stdout}${check.stderr}\n${patched}`);
      assert.match(check.stdout + check.stderr, /ALREADY_PATCHED/, `${label}: check state must report already patched`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

console.log('patcher Chrome async socket checks passed');
