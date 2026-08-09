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

const allowedReferences = [
  "import { readFileSync } from 'node:fs';",
  'require("node:path")',
  'vendor/native-addon.node',
  '@anthropic-ai/claude-code-linux-x64 from the npm Registry',
  'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24',
];

function findForbiddenDependencies(source) {
  const matches = [];
  const add = (kind, lineNumber, line) => matches.push({ kind, lineNumber, line: line.trim() });
  const kindForProgram = program => {
    const normalized = program.toLowerCase();
    if (normalized.startsWith('node')) return 'node';
    if (normalized.startsWith('npm') || normalized.startsWith('npx')) return 'npm';
    return 'system-ripgrep';
  };

  for (const [offset, line] of source.split(/\r?\n/).entries()) {
    const lineNumber = offset + 1;
    if (/^#!.*\bnode(?:\.exe)?\b/i.test(line)) {
      add('node', lineNumber, line);
      continue;
    }
    if (/^\s*(?:#|\/\/|\*)/.test(line)) continue;

    if (/^\s*uses:\s*actions\/setup-node@\S+/i.test(line)) add('node-setup', lineNumber, line);
    if (/^\s*node-version:\s*\S+/i.test(line)) add('node-version', lineNumber, line);
    if (/^\s*path:\s*~\/\.npm\s*$/i.test(line)) add('npm-cache', lineNumber, line);

    const command = /(?:^|&&|\|\||;|\||\$\(|\{)\s*(?:(?:if|then|do|while|until|sudo|command|exec|time|nohup|cmd(?:\.exe)?\s+\/c)\s+|env(?:\s+[A-Za-z_][\w]*=(?:"[^"]*"|'[^']*'|\S+))*\s+)*(?:&\s*)?(node(?:\.exe)?|npm(?:\.cmd)?|npx(?:\.cmd)?|rg(?:\.exe)?|ripgrep(?:\.exe)?)(?=\s|$)/g;
    for (const match of line.matchAll(command)) {
      add(kindForProgram(match[1]), lineNumber, line);
    }

    const powerShellCommand = /\b(?:pwsh|powershell(?:\.exe)?)\s+(?:-[A-Za-z]+\s+)*(?:-c|-command)\s+["']?(node(?:\.exe)?|npm(?:\.cmd)?|npx(?:\.cmd)?|rg(?:\.exe)?|ripgrep(?:\.exe)?)(?=\s|$)/ig;
    for (const match of line.matchAll(powerShellCommand)) {
      add(kindForProgram(match[1]), lineNumber, line);
    }

    if (/(?:^|&&|\|\||;|\||\$\(|\{)\s*(?:if\s+)?(?:command\s+-v|which|where(?:\.exe)?|Get-Command)\s+(?:rg|ripgrep)(?:\.exe)?\b/i.test(line)) {
      add('system-ripgrep', lineNumber, line);
    }
    if (/(?:^|&&|\|\||;|\||\$\(|\{)\s*(?:sudo\s+)?(?:apt(?:-get)?|brew|choco|winget|dnf|yum|apk|pacman)\b[^;|&]*\b(?:install|add)\b[^;|&]*\b(?:rg|ripgrep)\b/i.test(line)) {
      add('system-ripgrep', lineNumber, line);
    }
    const yamlCommand = /^\s*run:\s*(node(?:\.exe)?|npm(?:\.cmd)?|npx(?:\.cmd)?|rg(?:\.exe)?|ripgrep(?:\.exe)?)(?=\s|$)/i.exec(line);
    if (yamlCommand) {
      add(kindForProgram(yamlCommand[1]), lineNumber, line);
    }
  }

  return matches;
}

const executableDependencyFixtures = [
  ['node file', 'node ./helper.mjs', ['node']],
  ['node eval', 'node -e "console.log(1)"', ['node']],
  ['node executable', 'node.exe --version', ['node']],
  ['shell conditional', 'if node --version; then true; fi', ['node']],
  ['shell operator', 'prepare && node ./helper.mjs', ['node']],
  ['environment wrapper', 'env CLAWGOD_TEST=1 node ./helper.mjs', ['node']],
  ['environment npm wrapper', 'env CI=1 npm test', ['npm']],
  ['sudo wrapper', 'sudo npm ci', ['npm']],
  ['cmd npm wrapper', 'cmd /c npm test', ['npm']],
  ['npm command', 'npm test', ['npm']],
  ['npm run command', 'npm run build', ['npm']],
  ['npm version', 'npm --version', ['npm']],
  ['PowerShell call operator', '& node.exe --version', ['node']],
  ['PowerShell command wrapper', 'pwsh -NoProfile -c "node ./helper.mjs"', ['node']],
  ['PowerShell npm wrapper', 'powershell.exe -Command "npm ci"', ['npm']],
  ['YAML node command', 'run: node ./helper.mjs', ['node']],
  ['YAML npm command', 'run: npm test', ['npm']],
  ['ripgrep command', 'rg --version', ['system-ripgrep']],
  ['ripgrep executable', 'ripgrep.exe --version', ['system-ripgrep']],
  ['ripgrep lookup', 'if command -v rg >/dev/null; then true; fi', ['system-ripgrep']],
  ['PowerShell ripgrep lookup', 'Get-Command ripgrep', ['system-ripgrep']],
  ['Windows ripgrep lookup', 'where.exe rg', ['system-ripgrep']],
  ['system ripgrep package', 'sudo apt-get install -y ripgrep', ['system-ripgrep']],
];
const allowedDependencyFixtures = [
  "import { readFileSync } from 'node:fs';",
  'vendor/native-addon.node',
  '@anthropic-ai/claude-code-linux-x64 from the npm Registry',
  'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24',
];

for (const [label, source, expected] of executableDependencyFixtures) {
  assert.deepEqual(findForbiddenDependencies(source).map(match => match.kind), expected, `${label} must be rejected`);
}
for (const source of allowedDependencyFixtures) {
  assert.deepEqual(findForbiddenDependencies(source), [], `${source} must remain allowed`);
}

for (const reference of allowedReferences) {
  assert.deepEqual(findForbiddenDependencies(reference), [], `policy must allow ${reference}`);
}

for (const path of [...paths.installers, ...paths.helpers]) {
  const source = read(path);
  assert.deepEqual(findForbiddenDependencies(source), [], `${path} must not require an external Node, npm, or system ripgrep executable`);
}

const testFiles = readdirSync(join(root, 'tests')).filter(path => path.endsWith('.mjs'));
for (const path of testFiles) {
  assert.match(read(`tests/${path}`), /^#!\/usr\/bin\/env bun\r?\n/, `tests/${path} must run under Bun`);
}

for (const path of paths.docs) {
  const source = read(path);
  assert.doesNotMatch(source, /\|\s*\*\*Node\.js\*\*\s*\|/i, `${path} must not list Node.js as a prerequisite`);
  assert.deepEqual(findForbiddenDependencies(source), [], `${path} must not document executable Node, npm, or system ripgrep dependencies`);
}

const readmeFeatureMarkers = {
  'README.md': ['Agent Teams', 'GrowthBook', '共享协作', 'Harbor Kite', '/peers', 'Computer Use', 'Auto-mode', 'Ultraplan', 'Ultrareview'],
  'README_EN.md': ['Agent Teams', 'GrowthBook', 'shared collaboration', 'Harbor Kite', '/peers', 'Computer Use', 'Auto-mode', 'Ultraplan', 'Ultrareview'],
  'README_JP.md': ['Agent Teams', 'GrowthBook', '共有コラボレーション', 'Harbor Kite', '/peers', 'Computer Use', 'Auto-mode', 'Ultraplan', 'Ultrareview'],
};
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
  for (const marker of readmeFeatureMarkers[path]) {
    assert.ok(source.includes(marker), `${path} must retain ${marker}`);
  }
}

const agents = read('AGENTS.md');
assert.match(agents, /two parts|两部分/i, 'AGENTS.md must describe the two-part repository');
assert.match(agents, /@anthropic-ai\/claude-code-<platform>/, 'AGENTS.md must use the correct Claude Code package name');
assert.match(agents, /Bun-only[\s\S]{0,100}CI|CI[\s\S]{0,100}Bun-only/i, 'AGENTS.md must document the Bun-only CI contract');
assert.match(agents, /Task 7|temporary workflow exception/i, 'AGENTS.md must narrowly document the temporary workflow exception');

const workflow = read('.github/workflows/compat-daily.yml');
assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/, 'workflow internal GitHub Actions setting remains allowed during migration');
assert.deepEqual(
  findForbiddenDependencies(workflow).map(({ kind, line }) => ({ kind, line })),
  [
    { kind: 'node-setup', line: 'uses: actions/setup-node@v4' },
    { kind: 'node-version', line: 'node-version: 24' },
    { kind: 'npm-cache', line: 'path: ~/.npm' },
    { kind: 'system-ripgrep', line: 'sudo apt-get update -qq && sudo apt-get install -y ripgrep' },
    { kind: 'system-ripgrep', line: 'rg --version | head -1' },
    { kind: 'node', line: 'node --version' },
    { kind: 'node', line: 'node "$test"' },
  ],
  'compat-daily may contain only the current Task 7 legacy dependency occurrences',
);
for (const path of readdirSync(join(root, '.github/workflows')).filter(path => /\.ya?ml$/.test(path))) {
  if (path === 'compat-daily.yml') continue;
  const source = read(`.github/workflows/${path}`);
  assert.deepEqual(findForbiddenDependencies(source), [], `.github/workflows/${path} must not add an executable Node, npm, or system ripgrep dependency`);
}

for (const path of paths.installers) {
  const source = read(path);
  assert.match(source, /provider\.json/, `${path} must retain provider configuration`);
  assert.match(source, /features\.json/, `${path} must retain feature configuration`);
  assert.match(source, /CLAWGOD_NO_AUTO_CHROME/, `${path} must retain Chrome opt-out`);
  assert.match(source, /claude-mem-compat/, `${path} must retain claude-mem compatibility`);
}

console.log('bun-only repository policy checks passed');
