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
  let inPowerShellBlockComment = false;
  const add = (kind, lineNumber, line) => matches.push({ kind, lineNumber, line: line.trim() });
  const kindForProgram = program => {
    const normalized = program.toLowerCase();
    if (normalized.startsWith('node')) return 'node';
    if (normalized.startsWith('npm') || normalized.startsWith('npx')) return 'npm';
    if (normalized === 'curl' || normalized === 'wget') return 'external-downloader';
    if (normalized === 'invoke-webrequest' || normalized === 'irm') return 'external-downloader';
    return 'system-ripgrep';
  };

  for (const [offset, line] of source.split(/\r?\n/).entries()) {
    const lineNumber = offset + 1;
    if (inPowerShellBlockComment) {
      if (/#>/.test(line)) inPowerShellBlockComment = false;
      continue;
    }
    if (/^\s*<#/.test(line)) {
      if (!/#>/.test(line)) inPowerShellBlockComment = true;
      continue;
    }
    if (/^#!.*\bnode(?:\.exe)?\b/i.test(line)) {
      add('node', lineNumber, line);
      continue;
    }
    if (/^\s*(?:#|\/\/|\*)/.test(line)) continue;
    if (/^\s*(?:Write-(?:Err|Dim|Host)|warn|dim|info)\s+["']/.test(line)) continue;

    if (/^\s*uses:\s*actions\/setup-node@\S+/i.test(line)) add('node-setup', lineNumber, line);
    if (/^\s*node-version:\s*\S+/i.test(line)) add('node-version', lineNumber, line);
    if (/^\s*path:\s*~\/\.npm\s*$/i.test(line)) add('npm-cache', lineNumber, line);

    const command = /(?:^|&&|\|\||;|\||\$\(|\{)\s*(?:(?:if|then|do|while|until|sudo|command|exec|time|nohup|cmd(?:\.exe)?\s+\/c)\s+|env(?:\s+[A-Za-z_][\w]*=(?:"[^"]*"|'[^']*'|\S+))*\s+)*(?:&\s*)?(node(?:\.exe)?|node\.exe|npm(?:\.cmd)?|npx(?:\.cmd)?|rg(?:\.exe)?|ripgrep(?:\.exe)?|curl|wget|Invoke-WebRequest|irm)(?=\s|$)/g;
    for (const match of line.matchAll(command)) {
      add(kindForProgram(match[1]), lineNumber, line);
    }
    if (/\[['"]bash['"],['"]-c['"],['"](?:curl|wget)\b/.test(line) || /\biex\(irm\b/i.test(line)) {
      add('external-downloader', lineNumber, line);
    }

    if (/\bStart-Process\s+(?:-FilePath\s+)?node(?:\.exe)?\b/i.test(line) || /&\s+\$Node(?:Bin|Path|Exe)?\b/i.test(line)) {
      add('node', lineNumber, line);
    }

    // Shell wrappers hide another command string; scan that payload recursively.
    const commandWrapper = /\b(?:bash|sh|zsh|pwsh|powershell(?:\.exe)?|cmd(?:\.exe)?)\b.*?\s(?:-c|-command|\/c)\s+(?:"([^"]*)"|'([^']*)'|([^\r\n;|&]+))/ig;
    for (const match of line.matchAll(commandWrapper)) {
      const payload = match[1] ?? match[2] ?? match[3];
      for (const nested of findForbiddenDependencies(payload)) {
        add(nested.kind, lineNumber, line);
      }
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

  return matches.filter((match, index) =>
    matches.findIndex(candidate =>
      candidate.kind === match.kind && candidate.lineNumber === match.lineNumber && candidate.line === match.line,
    ) === index,
  );
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
  ['PowerShell Start-Process node', 'Start-Process node -ArgumentList "--version"', ['node']],
  ['PowerShell Start-Process node executable', 'Start-Process -FilePath node.exe -ArgumentList "--version"', ['node']],
  ['PowerShell variable call operator', '& $NodeBin ./helper.mjs', ['node']],
  ['PowerShell command wrapper', 'pwsh -NoProfile -c "node ./helper.mjs"', ['node']],
  ['PowerShell npm wrapper', 'powershell.exe -Command "npm ci"', ['npm']],
  ['Bash node wrapper', 'bash -c "node --version"', ['node']],
  ['Shell npm wrapper', 'sh -c "npm test"', ['npm']],
  ['Zsh ripgrep wrapper', 'zsh -c "rg --version"', ['system-ripgrep']],
  ['Cmd node wrapper', 'cmd /c "node --version"', ['node']],
  ['YAML node command', 'run: node ./helper.mjs', ['node']],
  ['YAML npm command', 'run: npm test', ['npm']],
  ['YAML nested shell node command', 'run: bash -c "node --version"', ['node']],
  ['ripgrep command', 'rg --version', ['system-ripgrep']],
  ['ripgrep executable', 'ripgrep.exe --version', ['system-ripgrep']],
  ['ripgrep lookup', 'if command -v rg >/dev/null; then true; fi', ['system-ripgrep']],
  ['PowerShell ripgrep lookup', 'Get-Command ripgrep', ['system-ripgrep']],
  ['Windows ripgrep lookup', 'where.exe rg', ['system-ripgrep']],
  ['system ripgrep package', 'sudo apt-get install -y ripgrep', ['system-ripgrep']],
  ['curl installer pipe', 'curl -fsSL https://example.test/install.sh | bash', ['external-downloader']],
  ['wget installer pipe', 'wget -qO- https://example.test/install.sh | bash', ['external-downloader']],
  ['PowerShell downloader', 'Invoke-WebRequest https://example.test/install.ps1', ['external-downloader']],
  ['PowerShell downloader alias', 'irm https://example.test/install.ps1', ['external-downloader']],
  ['nested curl downloader', 'bash -c "curl -fsSL https://example.test/install.sh | bash"', ['external-downloader']],
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
  assert.deepEqual(
    findForbiddenDependencies(source).filter(match => match.kind !== 'external-downloader'),
    [],
    `${path} must not document executable Node, npm, or system ripgrep dependencies`,
  );
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
  assert.doesNotMatch(source, /包含 8 个针对性回归脚本|includes eight focused regression scripts|8 本の回帰スクリプト/, `${path} must not hard-code the stale focused-test count`);
  for (const marker of readmeFeatureMarkers[path]) {
    assert.ok(source.includes(marker), `${path} must retain ${marker}`);
  }
}

const agents = read('AGENTS.md');
assert.match(agents, /two parts|两部分/i, 'AGENTS.md must describe the two-part repository');
assert.match(agents, /@anthropic-ai\/claude-code-<platform>/, 'AGENTS.md must use the correct Claude Code package name');
assert.match(agents, /Bun-only[\s\S]{0,100}CI|CI[\s\S]{0,100}Bun-only/i, 'AGENTS.md must document the Bun-only CI contract');
assert.match(agents, /Linux[\s\S]{0,160}Windows|Windows[\s\S]{0,160}Linux/i, 'AGENTS.md must describe the current Bun-only Linux and Windows workflow');
assert.doesNotMatch(agents, /Task 7|temporary workflow exception|cache-cleanup-weekly/i, 'AGENTS.md must reject completed-task exceptions and deleted workflow references');

const workflow = read('.github/workflows/compat-daily.yml');
assert.deepEqual(findForbiddenDependencies(workflow), [], 'compat-daily must not require an external Node, npm, or system ripgrep executable');
assert.equal(workflow.match(/FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/g)?.length, 1, 'compat-daily must retain exactly one GitHub Actions runtime setting');
assert.match(workflow, /^\s*FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*["']true["']\s*$/m, 'compat-daily must keep the exact GitHub Actions Node 24 opt-in');
assert.match(workflow, /GitHub-hosted Actions[^\n]*internals|internals[^\n]*GitHub-hosted Actions/i, 'compat-daily must explain that the Node 24 setting applies only to GitHub-hosted Actions internals');
assert.match(workflow, /uses:\s*oven-sh\/setup-bun@v2[\s\S]{0,160}bun-version:\s*canary/, 'compat-daily must use Bun canary');
assert.match(workflow, /CLAWGOD_E2E=1\s+bun\s+tests\/installer-e2e\.mjs/, 'Linux smoke must run the isolated installer E2E with Bun');
assert.match(workflow, /^\s*windows-smoke:\s*$/m, 'compat-daily must include a Windows smoke job');
assert.match(workflow, /windows-smoke:[\s\S]*github\.event_name\s*!=\s*'schedule'/, 'Windows smoke must skip scheduled daily runs');
for (const variable of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
  assert.match(workflow, new RegExp(`\\$env:${variable}\\s*=\\s*\\$sandbox`), `Windows smoke must sandbox ${variable}`);
}
for (const command of ['-LeanOn', '-NoUpgrade -LeanOff', '-Uninstall']) {
  assert.ok(workflow.includes(command), `Windows smoke must exercise install.ps1 ${command}`);
}
for (const dependency of ['node', 'npm', 'rg', 'tar', 'unzip']) {
  assert.match(workflow, new RegExp(`['"]${dependency}['"]`), `Windows smoke must trap ${dependency} with a command shim`);
}
assert.match(workflow, /\.clawgod\\vendor\\ripgrep\\bin\\rg\.exe/, 'Windows smoke must execute the private ripgrep binary');
assert.match(workflow, /forbidden dependency invoked:/, 'compat smoke must fail on the forbidden dependency marker');
assert.match(workflow, /tests\/\*\.mjs/, 'compat path filters must include every Bun test');
assert.match(workflow, /scripts\/rebuild-helper-zips\.mjs/, 'compat path filters must include the ZIP rebuild script');
assert.equal(workflow.match(/claude-browser-1\.0\.77-patched\.zip/g)?.length, 2, 'browser extension ZIP changes must trigger both push and pull-request compat runs');
assert.match(workflow, /Assert-PatchSummary/, 'Windows smoke must enforce patch summaries independently of child process exit codes');
assert.match(workflow, /\$resultLines\s*=.*Result:/, 'Windows smoke must count every Result line before parsing the canonical summary');
assert.match(workflow, /\$resultLines\.Count -ne 1/, 'Windows smoke must reject missing or additional Result lines');
assert.match(workflow, /\$summaryMatch\s*=.*'\^\\s\*Result:/, 'Windows smoke must fully parse the sole Result line');
assert.match(workflow, /patch summary windows initial:/, 'Windows smoke must emit a stable initial patch summary marker');
assert.match(workflow, /patch summary windows no-upgrade:/, 'Windows smoke must emit a stable no-upgrade patch summary marker');
assert.match(workflow, /\$sourceVersionMatch\s*=\s*\[regex\]::Match/, 'Windows smoke must validate the complete source-version file');
assert.match(workflow, /\^\\s\*\(\\d\+\\\.\\d\+\\\.\\d\+\)\\s\*\$/, 'Windows source-version parser must accept exactly x.y.z with surrounding whitespace only');
assert.match(workflow, /\(\?=\\s\|\$\)/, 'Windows wrapper version parser must require whitespace or end after x.y.z');
assert.match(workflow, /\.local\\bin\\claude\.cmd/, 'Windows uninstall checks must cover the primary launcher');
assert.match(workflow, /\.local\\bin\\claude\.exe/, 'Windows uninstall checks must cover a primary executable left by backup handling');
assert.match(workflow, /\.local\\bin\\clawgod\.cmd/, 'Windows uninstall checks must cover the explicit alias');
assert.match(workflow, /clawgod-settings-backup\.json/, 'Windows uninstall checks must cover claude-mem backup state');
assert.match(workflow, /clawgod-settings-state\.json/, 'Windows uninstall checks must cover claude-mem managed state');
assert.equal(existsSync(join(root, '.github/workflows/cache-cleanup-weekly.yml')), false, 'obsolete npm cache cleanup workflow must not return');
for (const path of readdirSync(join(root, '.github/workflows')).filter(path => /\.ya?ml$/.test(path))) {
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
