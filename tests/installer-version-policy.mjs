#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'clawgod-version-policy-'));
try {
  const unix = readFileSync(new URL('../src/unix/lifecycle.sh', import.meta.url), 'utf8').split('CLAWGOD_ENHANCEMENT_IDS=(')[0]
    .replace('@@CLAWGOD_VERIFIED_VERSION@@', '2.1.302');
  const windows = readFileSync(new URL('../src/windows/lifecycle.ps1', import.meta.url), 'utf8').split('$EnhancementIds = @(')[0]
    .replace('@@CLAWGOD_VERIFIED_VERSION@@', '2.1.302');
  writeFileSync(join(root, 'policy.sh'), unix + '\nprintf "%s" "$VERSION"\n');
  writeFileSync(join(root, 'policy.ps1'), windows + '\nWrite-Output $Version\n');
  const cases = [
    ['fresh', '', [], {}, '2.1.302'],
    ['older', '2.1.9', [], {}, '2.1.302'],
    ['same', '2.1.302', [], {}, '2.1.302'],
    ['newer', '2.1.303', [], {}, '2.1.303'],
    ['major', '3.0.0', [], {}, '3.0.0'],
    ['stable-fallback', '2.1.303', [], { CLAWGOD_UPDATE_STABLE_FALLBACK: '1' }, '2.1.302'],
    ['explicit', '2.1.303', ['--version', '2.1.299'], {}, '2.1.299'],
    ['env', '', [], { CLAWGOD_VERSION: '2.1.303' }, '2.1.303'],
    ['latest', '', ['--version', 'latest'], { CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1' }, 'latest'],
    ['legacy-update', '2.1.301', [], { CLAWGOD_VERSION: 'latest', CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1' }, '2.1.302'],
    ['malformed', '2.1.999garbage', [], {}, null],
    ['uninstall-malformed', 'broken', ['--uninstall'], {}, ''],
    ['no-upgrade-malformed', 'broken', ['--no-upgrade'], {}, ''],
  ];
  const powershell = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' });
  for (const [label, installed, args, env, expected] of cases) {
    const home = join(root, label); mkdirSync(join(home, '.clawgod'), { recursive: true });
    if (installed) writeFileSync(join(home, '.clawgod/.source-version'), installed + '\n');
    const childEnv = { ...process.env, HOME: home, USERPROFILE: home };
    for (const key of Object.keys(childEnv)) if (key.startsWith('CLAWGOD_')) delete childEnv[key];
    Object.assign(childEnv, env);
    for (const platform of [...(process.platform === 'win32' ? [] : ['unix']), ...(powershell.status === 0 ? ['windows'] : [])]) {
      const result = platform === 'unix' ? spawnSync('bash', [join(root, 'policy.sh'), ...args], { env: childEnv, encoding: 'utf8' })
        : spawnSync('pwsh', ['-NoProfile', '-File', join(root, 'policy.ps1'), ...args.map(arg => ({ '--version': '-Version', '--uninstall': '-Uninstall', '--no-upgrade': '-NoUpgrade' })[arg] ?? arg)], { env: childEnv, encoding: 'utf8' });
      if (expected === null) assert.notEqual(result.status, 0, `${platform}/${label} 必须拒绝无效源版本，不能猜测后覆盖`);
      else { assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), expected, `${platform}/${label}`); }
    }
  }
  if (process.platform === 'win32') assert.equal(powershell.status, 0, 'Windows 必须实际执行 PowerShell 版本策略');
  else if (powershell.status !== 0) console.log('SKIP PowerShell 版本选择：pwsh 不可用');
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('安装版本策略：默认已验证、显式版本保留、旧 updater 迁移、不降级');
