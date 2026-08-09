#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const paths = {
  installers: ['install.sh', 'install.ps1'],
  helpers: [
    'apply-claude-code-chrome-fix.sh',
    'apply-claude-code-chrome-fix.ps1',
    'apply-claude-code-computer-use-fix.sh',
    'apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh',
    'apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.ps1',
  ],
  docs: ['README.md', 'README_EN.md', 'README_JP.md', 'AGENTS.md'],
};

assert.equal(existsSync(join(root, 'index.html')), false, 'root index.html must not return');
assert.equal(existsSync(join(root, 'web')), false, 'the retired web site must not return');
assert.equal(existsSync(join(root, 'bypass.png')), true, 'README runtime image must remain tracked');
assert.equal(existsSync(join(root, 'claude-browser-1.0.77-patched.zip')), true, 'browser helper ZIP must remain tracked');

for (const path of [...paths.installers, ...paths.helpers]) {
  assert.equal(existsSync(join(root, path)), true, `${path} must remain available`);
}

const executableNode = /(?:^|[;\r\n])\s*(?:&\s*)?(?:node(?:\.exe)?|\$NodeBin)\s+(?:--?\w|[./~$"'])|\bStart-Process\s+(?:-FilePath\s+)?node(?:\.exe)?\b/i;
const forbiddenCommands = [
  executableNode,
  /^#!.*\bnode\b/im,
  /(?:^|[;\r\n])\s*npm\s+(?:pack|root|run|install|exec)\b/i,
  /\bnpx\b/i,
  /(?:command\s+-v|Get-Command)\s+(?:rg|ripgrep)\b/i,
];
const allowedReferences = [
  "import { readFileSync } from 'node:fs';",
  'require("node:path")',
  'vendor/native-addon.node',
  '@anthropic-ai/claude-code-linux-x64 from the npm Registry',
  'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24',
];

for (const reference of allowedReferences) {
  for (const pattern of forbiddenCommands) {
    assert.doesNotMatch(reference, pattern, `policy must allow ${reference}`);
  }
}

for (const path of [...paths.installers, ...paths.helpers]) {
  const source = read(path);
  for (const pattern of forbiddenCommands) {
    assert.doesNotMatch(source, pattern, `${path} must not require an external Node, npm, or system ripgrep executable`);
  }
}

const testFiles = readdirSync(join(root, 'tests')).filter(path => path.endsWith('.mjs'));
for (const path of testFiles) {
  assert.match(read(`tests/${path}`), /^#!\/usr\/bin\/env bun\r?\n/, `tests/${path} must run under Bun`);
}

for (const path of paths.docs) {
  const source = read(path);
  assert.doesNotMatch(source, /\|\s*\*\*Node\.js\*\*\s*\|/i, `${path} must not list Node.js as a prerequisite`);
  assert.doesNotMatch(source, /(?:^|[;\r\n])\s*npm\s+(?:pack|root|run|install|exec)\b/i, `${path} must not document npm commands`);
  assert.doesNotMatch(source, /\bnpx\b/i, `${path} must not document npx`);
}

for (const path of ['README.md', 'README_EN.md', 'README_JP.md']) {
  const source = read(path);
  assert.match(source, /bypass\.png/, `${path} must retain the runtime image`);
  assert.match(source, /Bun.*1\.3\.14|1\.3\.14.*Bun/i, `${path} must require Bun 1.3.14 or newer`);
  assert.match(source, /ripgrep.*15\.2\.0|15\.2\.0.*ripgrep/i, `${path} must document installer-managed ripgrep 15.2.0`);
  assert.match(source, /Shell|PowerShell/, `${path} must describe its OS command entry point`);
  assert.match(source, /Chrome/, `${path} must retain Chrome documentation`);
  assert.match(source, /Computer Use/, `${path} must retain Computer Use documentation`);
  assert.match(source, /claude-mem/, `${path} must retain claude-mem documentation`);
  assert.match(source, /Provider/, `${path} must retain provider documentation`);
  assert.match(source, /Harbor Kite/, `${path} must retain Harbor Kite documentation`);
  assert.match(source, /\/peers/, `${path} must retain /peers documentation`);
  assert.match(source, /claude update/, `${path} must retain update documentation`);
  assert.match(source, /uninstall|Uninstall|卸载|アンインストール/, `${path} must retain uninstall documentation`);
  assert.match(source, /bun "\$test_file"/, `${path} must show Bun test commands`);
}

const agents = read('AGENTS.md');
assert.match(agents, /two parts|两部分/i, 'AGENTS.md must describe the two-part repository');
assert.match(agents, /@anthropic-ai\/claude-code-<platform>/, 'AGENTS.md must use the correct Claude Code package name');
assert.match(agents, /Bun-only[\s\S]{0,100}CI|CI[\s\S]{0,100}Bun-only/i, 'AGENTS.md must document the Bun-only CI contract');
assert.match(agents, /Task 7|temporary workflow exception/i, 'AGENTS.md must narrowly document the temporary workflow exception');

const workflow = read('.github/workflows/compat-daily.yml');
assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/, 'workflow internal GitHub Actions setting remains allowed during migration');
for (const path of readdirSync(join(root, '.github/workflows')).filter(path => /\.ya?ml$/.test(path))) {
  if (path === 'compat-daily.yml') continue;
  const source = read(`.github/workflows/${path}`);
  for (const pattern of forbiddenCommands) {
    assert.doesNotMatch(source, pattern, `.github/workflows/${path} must not add an executable Node, npm, or system ripgrep dependency`);
  }
}

for (const path of paths.installers) {
  const source = read(path);
  assert.match(source, /provider\.json/, `${path} must retain provider configuration`);
  assert.match(source, /features\.json/, `${path} must retain feature configuration`);
  assert.match(source, /CLAWGOD_NO_AUTO_CHROME/, `${path} must retain Chrome opt-out`);
  assert.match(source, /claude-mem-compat/, `${path} must retain claude-mem compatibility`);
}

console.log('bun-only repository policy checks passed');
