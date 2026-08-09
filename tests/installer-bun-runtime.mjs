#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const unix = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const windows = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');

function unixTemplate(name, marker) {
  const start = unix.indexOf(marker);
  assert.notEqual(start, -1, `install.sh must generate ${name}`);
  const bodyStart = unix.indexOf('\n', start) + 1;
  const end = unix.indexOf(`\n${marker.match(/<< '([^']+)'/)?.[1]}`, bodyStart);
  assert.notEqual(end, -1, `install.sh ${name} template must end`);
  return unix.slice(bodyStart, end);
}

function powerShellTemplate(name, firstLine) {
  const marker = `@'\n${firstLine}`;
  const start = windows.indexOf(marker);
  assert.notEqual(start, -1, `install.ps1 must generate ${name}`);
  const bodyStart = start + 3;
  const end = windows.indexOf("\n'@", bodyStart);
  assert.notEqual(end, -1, `install.ps1 ${name} template must end`);
  return windows.slice(bodyStart, end);
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.doesNotMatch(source, /#!\/usr\/bin\/env node/, `${name}: generated scripts must use Bun shebangs`);
  assert.doesNotMatch(source, /Get-Command node|command -v node|\bnode\s+-e\b|\bnode\s+["'$]/, `${name}: must not execute Node`);
  assert.match(source, /claude-mem-compat\.cjs["']?\s+uninstall/, `${name}: uninstall must still restore claude-mem`);
  assert.match(source, /Bun:|Bun version/, `${name}: Bun preflight must remain visible`);
}

const unixTemplates = {
  'claude-mem-compat.cjs': unixTemplate('claude-mem-compat.cjs', 'cat > "$CLAWGOD_DIR/claude-mem-compat.cjs" << \'CLAUDE_MEM_COMPAT_EOF\''),
  'extract-natives.mjs': unixTemplate('extract-natives.mjs', 'cat > "$CLAWGOD_DIR/extract-natives.mjs" << \'EXTRACTOR_EOF\''),
  'post-process.mjs': unixTemplate('post-process.mjs', 'cat > "$CLAWGOD_DIR/post-process.mjs" << \'POSTPROC_EOF\''),
  'repatch.mjs': unixTemplate('repatch.mjs', 'cat > "$CLAWGOD_DIR/repatch.mjs" << \'REPATCH_EOF\''),
  'patch.mjs': unixTemplate('patch.mjs', 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\''),
  'fetch-file.mjs': unixTemplate('fetch-file.mjs', 'cat > "$CLAWGOD_DIR/fetch-file.mjs" << \'FETCH_FILE_EOF\''),
};
const windowsTemplates = {
  'claude-mem-compat.cjs': powerShellTemplate('claude-mem-compat.cjs', '#!/usr/bin/env bun\nconst fs = require'),
  'extract-natives.mjs': powerShellTemplate('extract-natives.mjs', '#!/usr/bin/env bun\n/**\n * ClawGod Plus Bun section extractor'),
  'post-process.mjs': powerShellTemplate('post-process.mjs', "#!/usr/bin/env bun\nimport { readFileSync, writeFileSync, unlinkSync } from 'fs';"),
  'repatch.mjs': powerShellTemplate('repatch.mjs', "#!/usr/bin/env bun\n// Re-extract + post-process + patch the user's currently-installed"),
  'patch.mjs': powerShellTemplate('patch.mjs', '#!/usr/bin/env bun\n/**\n * ClawGod Plus Universal Patcher'),
  'fetch-file.mjs': powerShellTemplate('fetch-file.mjs', "#!/usr/bin/env bun\nimport { existsSync, renameSync, rmSync } from 'node:fs';"),
};

for (const [name, body] of Object.entries(unixTemplates)) {
  assert.match(body, /^#!\/usr\/bin\/env bun\n/, `install.sh ${name} must run with Bun`);
  assert.match(windowsTemplates[name], /^#!\/usr\/bin\/env bun\n/, `install.ps1 ${name} must run with Bun`);
}

for (const [installerName, fetchFile] of [['install.sh', unixTemplates['fetch-file.mjs']], ['install.ps1', windowsTemplates['fetch-file.mjs']]]) {
  assert.match(fetchFile, /HTTPS_PROXY \|\| process\.env\.https_proxy/, `${installerName}: fetch-file must prefer HTTPS proxies`);
  assert.match(fetchFile, /HTTP_PROXY \|\| process\.env\.http_proxy/, `${installerName}: fetch-file must support HTTP proxies`);
  assert.match(fetchFile, /NO_PROXY \|\| process\.env\.no_proxy/, `${installerName}: fetch-file must honor NO_PROXY`);
  assert.match(fetchFile, /AbortSignal\.timeout\(300000\)/, `${installerName}: fetch-file must use the five-minute timeout`);
  assert.match(fetchFile, /redirects <= 5/, `${installerName}: fetch-file must cap redirects`);
  assert.match(fetchFile, /response\.status !== 200/, `${installerName}: fetch-file must reject non-200 responses`);
  assert.match(fetchFile, /renameSync\(temporary, destination\)/, `${installerName}: fetch-file must atomically replace completed downloads`);
}

for (const [name, source] of [['install.sh', unix], ['install.ps1', windows]]) {
  assert.match(source, /fetch-file\.mjs/, `${name}: remote helpers must use fetch-file.mjs`);
  const chromeStart = source.indexOf(name === 'install.sh' ? 'install_chrome_fix_script' : 'function Install-ChromeFixScript');
  const chromeEnd = source.indexOf(name === 'install.sh' ? 'run_claude_code_chrome_fix' : 'function Invoke-ChromePostInstallFix');
  assert.ok(chromeStart >= 0 && chromeEnd > chromeStart, `${name}: Chrome helper must be defined`);
  const chromeHelper = source.slice(chromeStart, chromeEnd);
  assert.match(chromeHelper, /fetch-file\.mjs/, `${name}: Chrome helper download must use fetch-file.mjs`);
  assert.doesNotMatch(chromeHelper, /curl|Invoke-WebRequest/, `${name}: Chrome helper download must use fetch-file.mjs`);
  const importStart = source.indexOf(name === 'install.sh' ? 'Download clawgod-import binary' : 'Download clawgod-import binary');
  assert.notEqual(importStart, -1, `${name}: clawgod-import download must remain available`);
  const importDownload = source.slice(importStart, importStart + 1200);
  assert.match(importDownload, /fetch-file\.mjs/, `${name}: clawgod-import download must use fetch-file.mjs`);
  assert.doesNotMatch(importDownload, /curl|Invoke-WebRequest/, `${name}: clawgod-import download must use fetch-file.mjs`);
}

const dir = mkdtempSync(join(tmpdir(), 'clawgod-fetch-file-'));
try {
  const fetchFile = join(dir, 'fetch-file.mjs');
  await Bun.write(fetchFile, unixTemplates['fetch-file.mjs']);
  chmodSync(fetchFile, 0o700);
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/redirect') return Response.redirect(new URL('/payload', url), 302);
      if (url.pathname === '/payload') return new Response('downloaded fixture');
      return new Response('not found', { status: 404 });
    },
  });
  try {
    async function runFetch(...args) {
      const child = Bun.spawn([process.execPath, fetchFile, ...args], { stdout: 'pipe', stderr: 'pipe' });
      const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      return { status, stderr };
    }

    const destination = join(dir, 'result.bin');
    const success = await runFetch(`http://127.0.0.1:${server.port}/redirect`, destination);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(await Bun.file(destination).text(), 'downloaded fixture');
    assert.equal(readdirSync(dir).some(name => name.startsWith('result.bin.') && name.endsWith('.tmp')), false, 'completed downloads must not leave their temporary file behind');

    const failure = await runFetch(`http://127.0.0.1:${server.port}/missing`, destination);
    assert.notEqual(failure.status, 0, 'non-200 responses must fail');
    assert.equal(await Bun.file(destination).text(), 'downloaded fixture', 'failed downloads must not replace an existing destination');
  } finally {
    server.stop(true);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('installer Bun lifecycle checks passed');
