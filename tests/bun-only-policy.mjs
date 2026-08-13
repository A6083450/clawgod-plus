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

const GENERATED_INSTALLER_CONTRACT_TESTS = new Set([
  'installer-build.mjs',
  'installer-bun-runtime.mjs',
  'installer-e2e.mjs',
  'installer-e2e-contract.mjs',
]);

function collectCanonicalSources() {
  const sources = ['build.mjs'];
  const walk = directory => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relativePath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(relativePath);
      else if (entry.isFile()) sources.push(relativePath);
    }
  };
  walk('src');
  return sources;
}

function findReverseExtraction(source) {
  const matches = [];
  for (const [offset, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (/['"]\.\.\/install\.(?:sh|ps1)['"]/.test(trimmed)) {
      matches.push({ lineNumber: offset + 1, line: trimmed });
    } else if (/join\([^)]*root[^)]*,\s*['"]install\.(?:sh|ps1)['"]/.test(trimmed)) {
      matches.push({ lineNumber: offset + 1, line: trimmed });
    }
  }
  return matches;
}

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
  'The node: protocol and native .node files are implementation details.',
  'The Git.Exe executable is mentioned here as ordinary prose.',
  '@anthropic-ai/claude-code-linux-x64 from the npm Registry',
  'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24',
];

const allowedBadgePublishGitCommands = new Set([
  'git init -q -b badges',
  'git config user.email "github-actions[bot]@users.noreply.github.com"',
  'git config user.name "github-actions[bot]"',
  'git add claude-version.json',
  'git commit -q -m "compat-daily: claude $version verified"',
  'git push -fq "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:badges',
]);

function findForbiddenDependencies(source, options = {}) {
  const matches = [];
  let inPowerShellBlockComment = false;
  let badgeStepIndent = null;
  let badgeRunIndent = null;
  let heredocTerminator = null;
  let lineIndent = 0;
  const add = (kind, lineNumber, line) => {
    const trimmed = line.trim();
    if (kind === 'system-git' && options.allowBadgePublishGit === true
      && badgeStepIndent !== null && badgeRunIndent !== null && lineIndent > badgeRunIndent
      && allowedBadgePublishGitCommands.has(trimmed)) return;
    matches.push({ kind, lineNumber, line: trimmed });
  };
  const kindForProgram = program => {
    const normalized = program.replaceAll('\\', '/').split('/').at(-1).toLowerCase();
    if (normalized === 'git' || normalized === 'git.exe') return 'system-git';
    if (normalized === 'node' || normalized === 'node.exe') return 'node';
    if (/^(?:npm|npx)(?:\.cmd|\.exe)?$/.test(normalized)) return 'npm';
    if (/^(?:curl|wget)(?:\.exe)?$/.test(normalized)) return 'external-downloader';
    if (normalized === 'invoke-webrequest' || normalized === 'irm') return 'external-downloader';
    if (/^(?:rg|ripgrep)(?:\.exe)?$/.test(normalized)) return 'system-ripgrep';
    return null;
  };
  const splitCommandSegments = line => {
    const segments = [];
    let start = 0;
    let quote = '';
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (quote) {
        if (character === quote && line[index - 1] !== '\\') quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === ';' || character === '|'
        || (character === '&' && line[index + 1] === '&')) {
        segments.push(line.slice(start, index));
        if (line[index + 1] === character) index += 1;
        start = index + 1;
      }
    }
    segments.push(line.slice(start));
    return segments;
  };
  const readCommandToken = segment => {
    let remainder = segment.trim()
      .replace(/^-\s+run:\s*/i, '')
      .replace(/^run:\s*/i, '');
    while (true) {
      const before = remainder;
      remainder = remainder.replace(/^(?:if|then|do|while|until|sudo|command|exec|time|nohup)\s+/i, '');
      remainder = remainder.replace(/^env(?:\s+[A-Za-z_][\w]*=(?:"[^"]*"|'[^']*'|\S+))+\s+/i, '');
      if (remainder === before) break;
    }
    remainder = remainder.replace(/^&\s+/, '');
    const token = /^(?:"([^"]+)"|'([^']+)'|([^\s(){}]+))/.exec(remainder);
    if (token && remainder.slice(token[0].length).trimStart().startsWith(':')) return '';
    return token?.[1] ?? token?.[2] ?? token?.[3] ?? '';
  };

  for (const [offset, line] of source.split(/\r?\n/).entries()) {
    const lineNumber = offset + 1;
    if (heredocTerminator !== null) {
      if (line.trim() === heredocTerminator) heredocTerminator = null;
      continue;
    }
    const heredocStart = /<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/.exec(line);
    if (heredocTerminator === null && heredocStart) heredocTerminator = heredocStart[1];
    lineIndent = /^\s*/.exec(line)[0].length;
    const listItem = /^(\s*)-\s+/.exec(line);
    if (badgeStepIndent !== null && listItem && listItem[1].length <= badgeStepIndent) {
      badgeStepIndent = null;
      badgeRunIndent = null;
    } else if (badgeStepIndent !== null && line.trim() && lineIndent <= badgeStepIndent) {
      badgeStepIndent = null;
      badgeRunIndent = null;
    }
    const badgeStep = /^(\s*)-\s+name:\s+Publish supported-Claude-version badge\s*$/.exec(line);
    if (badgeStep) {
      badgeStepIndent = badgeStep[1].length;
      badgeRunIndent = null;
    } else if (badgeStepIndent !== null && /^\s*run:\s*\|\s*$/.test(line) && lineIndent > badgeStepIndent) {
      badgeRunIndent = lineIndent;
    }
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

    if (/^\s*uses:\s*actions\/setup-node@\S+/i.test(line)) add('node-setup', lineNumber, line);
    if (/^\s*node-version:\s*\S+/i.test(line)) add('node-version', lineNumber, line);
    if (/^\s*path:\s*~\/\.npm\s*$/i.test(line)) add('npm-cache', lineNumber, line);

    for (const segment of splitCommandSegments(line)) {
      const kind = kindForProgram(readCommandToken(segment));
      if (kind) add(kind, lineNumber, line);
    }
    if (/\[['"]bash['"],['"]-c['"],['"](?:curl|wget)\b/.test(line) || /\biex\(irm\b/i.test(line)) {
      add('external-downloader', lineNumber, line);
    }

    const startProcess = /\bStart-Process\s+(?:-FilePath\s+)?(?:"([^"]+)"|'([^']+)'|([^\s]+))/i.exec(line);
    if (startProcess) {
      const kind = kindForProgram(startProcess[1] ?? startProcess[2] ?? startProcess[3]);
      if (kind) add(kind, lineNumber, line);
    }
    if (/&\s+\$Node(?:Bin|Path|Exe)?\b/i.test(line)) {
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
  }

  return matches.filter((match, index) =>
    matches.findIndex(candidate =>
      candidate.kind === match.kind && candidate.lineNumber === match.lineNumber && candidate.line === match.line,
    ) === index,
  );
}

const executableDependencyFixtures = [
  ['git command', 'git status --short', ['system-git']],
  ['git executable', 'git.exe status --short', ['system-git']],
  ['environment git wrapper', 'env CI=1 git status --short', ['system-git']],
  ['sudo git wrapper', 'sudo git status --short', ['system-git']],
  ['PowerShell call operator git', '& git.exe status --short', ['system-git']],
  ['PowerShell Start-Process git', 'Start-Process git -ArgumentList "status --short"', ['system-git']],
  ['PowerShell Start-Process git executable', 'Start-Process -FilePath git.exe -ArgumentList "status --short"', ['system-git']],
  ['PowerShell git wrapper', 'pwsh -NoProfile -Command "git status --short"', ['system-git']],
  ['Bash git wrapper', 'bash -c "git status --short"', ['system-git']],
  ['Shell git executable wrapper', 'sh -c "git.exe status --short"', ['system-git']],
  ['Cmd git wrapper', 'cmd /c git status --short', ['system-git']],
  ['Cmd quoted git wrapper', 'cmd.exe /c "git.exe status --short"', ['system-git']],
  ['YAML git command', 'run: git status --short', ['system-git']],
  ['command after PowerShell log', 'Write-Host "checking"; git status --short', ['system-git']],
  ['mixed-case Git executable', 'Git.Exe status --short', ['system-git']],
  ['mixed-case Node executable', 'Node.Exe --version', ['node']],
  ['nested mixed-case Git executable', 'PwSh -NoProfile -Command "Git.Exe status --short"', ['system-git']],
  ['absolute Unix Git executable', '/usr/bin/git status --short', ['system-git']],
  ['wrapped absolute Unix Git executable', 'env CI=1 /usr/bin/git status --short', ['system-git']],
  ['absolute Unix Node executable', '/opt/homebrew/bin/node --version', ['node']],
  ['absolute Windows Git executable', "& 'C:\\Program Files\\Git\\cmd\\git.exe' status --short", ['system-git']],
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
  ['PowerShell Start-Process npm', 'Start-Process npm.cmd -ArgumentList "test"', ['npm']],
  ['PowerShell Start-Process npx', 'Start-Process -FilePath npx.cmd -ArgumentList "tool"', ['npm']],
  ['PowerShell Start-Process curl', 'Start-Process curl.exe -ArgumentList "https://example.test"', ['external-downloader']],
  ['PowerShell Start-Process wget', 'Start-Process -FilePath wget.exe -ArgumentList "https://example.test"', ['external-downloader']],
  ['PowerShell Start-Process ripgrep', 'Start-Process rg.exe -ArgumentList "pattern"', ['system-ripgrep']],
  ['PowerShell Start-Process absolute Git', "Start-Process -FilePath 'C:\\Program Files\\Git\\cmd\\Git.Exe' -ArgumentList 'status'", ['system-git']],
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
const heredocFixtures = [
  ['quoted heredoc body', "cat <<'EOF'\ngit status --short\nEOF", []],
  ['unquoted heredoc body', 'cat <<EOF\ngit status --short\nEOF', []],
];

const badgePublishFixture = `
      - name: Publish supported-Claude-version badge
        run: |
          git init -q -b badges
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git add claude-version.json
          git commit -q -m "compat-daily: claude $version verified"
          git push -fq "https://x-access-token:\${GH_TOKEN}@github.com/\${GITHUB_REPOSITORY}.git" HEAD:badges
`;

for (const [label, source, expected] of executableDependencyFixtures) {
  assert.deepEqual(findForbiddenDependencies(source).map(match => match.kind), expected, `${label} must be rejected`);
}
for (const source of allowedDependencyFixtures) {
  assert.deepEqual(findForbiddenDependencies(source), [], `${source} must remain allowed`);
}
for (const [label, source, expected] of heredocFixtures) {
  assert.deepEqual(findForbiddenDependencies(source), expected, `${label} commands must be ignored`);
}
assert.deepEqual(
  findForbiddenDependencies(badgePublishFixture, { allowBadgePublishGit: true }),
  [],
  'the existing badge-publish Git commands must remain the only system Git workflow exception',
);
assert.deepEqual(
  findForbiddenDependencies(badgePublishFixture.replace('git add claude-version.json', 'git status --short'), { allowBadgePublishGit: true })
    .map(match => match.kind),
  ['system-git'],
  'an unlisted Git command inside the badge-publish step must be rejected',
);
assert.deepEqual(
  findForbiddenDependencies('run: |\n  git add claude-version.json', { allowBadgePublishGit: true }).map(match => match.kind),
  ['system-git'],
  'a badge Git command outside the named badge-publish step must be rejected',
);
assert.deepEqual(
  findForbiddenDependencies(`${badgePublishFixture}\n      - name: Other step\n        run: |\n${[...allowedBadgePublishGitCommands].map(command => `          ${command}`).join('\n')}`, { allowBadgePublishGit: true })
    .map(match => match.kind),
  Array(allowedBadgePublishGitCommands.size).fill('system-git'),
  'every badge Git command must be rejected after the named badge-publish step ends',
);
assert.deepEqual(
  findForbiddenDependencies(badgePublishFixture.replace('Publish supported-Claude-version badge', 'Publish another badge'), { allowBadgePublishGit: true })
    .map(match => match.kind),
  Array(6).fill('system-git'),
  'the exact badge-publish name must be required for every allowed Git command',
);
assert.deepEqual(
  findForbiddenDependencies(badgePublishFixture, { allowBadgePublishGit: false }).map(match => match.kind),
  Array(6).fill('system-git'),
  'a non-compat workflow must reject all badge-shaped Git commands',
);

for (const reference of allowedReferences) {
  assert.deepEqual(findForbiddenDependencies(reference), [], `policy must allow ${reference}`);
}

const reverseExtractionFixtures = [
  ['URL read install.sh', `readFileSync(new URL('../install.sh', import.meta.url), 'utf8')`],
  ['URL read install.ps1', `readFileSync(new URL('../install.ps1', import.meta.url), 'utf8')`],
  ['Bun.file read install.sh', `await Bun.file(new URL('../install.sh', import.meta.url)).text()`],
  ['Bun.file read install.ps1', `await Bun.file(new URL('../install.ps1', import.meta.url)).text()`],
  ['root join read install.sh', `readFileSync(join(root, 'install.sh'), 'utf8')`],
  ['root join read install.ps1', `readFileSync(join(root, 'install.ps1'), 'utf8')`],
];
for (const [label, source] of reverseExtractionFixtures) {
  assert.equal(findReverseExtraction(source).length, 1, `${label} must be detected as reverse extraction`);
}
const allowedReverseExtractionFixtures = [
  ['canonical template read', `readFileSync(new URL('../src/template/install.sh', import.meta.url), 'utf8')`],
  ['canonical launcher read', `readFileSync(new URL('../src/unix/launcher.sh', import.meta.url), 'utf8')`],
  ['fixture installer write', `writeFileSync(join(localClawgod, 'install.sh'), 'local installer', 'utf8')`],
];
for (const [label, source] of allowedReverseExtractionFixtures) {
  assert.equal(findReverseExtraction(source).length, 0, `${label} must not be treated as reverse extraction`);
}

const canonicalSources = collectCanonicalSources();
const requiredCanonicalSources = [
  'build.mjs',
  'src/template/install.sh',
  'src/template/install.ps1',
  'src/unix/lifecycle.sh',
  'src/unix/launcher.sh',
  'src/windows/lifecycle.ps1',
  'src/windows/launcher.cmd',
  'src/generic/enhancement-config.mjs',
  'src/generic/enhancements.json',
  'src/generic/runtime/plugin-dependencies.mjs',
  'src/generic/patcher/entry.mjs',
];
for (const path of requiredCanonicalSources) {
  assert.ok(canonicalSources.includes(path), `policy must scan canonical source ${path}`);
}
for (const path of canonicalSources) {
  const source = read(path);
  assert.deepEqual(
    findForbiddenDependencies(source),
    [],
    `${path} must not require an external Node, npm, system Git, downloader, or system ripgrep executable`,
  );
}

for (const path of [...paths.installers, ...paths.helpers]) {
  const source = read(path);
  assert.deepEqual(findForbiddenDependencies(source), [], `${path} must not require an external Node, npm, or system ripgrep executable`);
}

const testFiles = readdirSync(join(root, 'tests')).filter(path => path.endsWith('.mjs'));
for (const path of testFiles) {
  assert.match(read(`tests/${path}`), /^#!\/usr\/bin\/env bun\r?\n/, `tests/${path} must run under Bun`);
}
for (const path of testFiles) {
  if (path === 'bun-only-policy.mjs' || GENERATED_INSTALLER_CONTRACT_TESTS.has(path)) continue;
  const source = read(`tests/${path}`);
  assert.deepEqual(
    findReverseExtraction(source),
    [],
    `tests/${path} must import/execute canonical src/ files instead of reverse-extracting the root generated installers`,
  );
}
assert.deepEqual(
  findForbiddenDependencies(read('tests/installer-e2e.mjs')),
  [],
  'the network installer E2E must trap rather than execute system Git, Node, npm, downloaders, or system ripgrep',
);

for (const path of paths.docs) {
  const source = read(path);
  assert.doesNotMatch(source, /\|\s*\*\*Node\.js\*\*\s*\|/i, `${path} must not list Node.js as a prerequisite`);
  assert.deepEqual(
    findForbiddenDependencies(source).filter(match => !['external-downloader', 'system-git'].includes(match.kind)),
    [],
    `${path} must not document executable Node, npm, or system ripgrep dependencies`,
  );
  if (path.startsWith('README')) {
    const installSection = source.match(/## (?:安装 ClawGod Plus|Install ClawGod Plus|ClawGod Plus をインストール)[\s\S]*?(?=\n## )/)?.[0];
    assert.equal(typeof installSection, 'string', `${path} must retain its install section`);
    assert.deepEqual(
      findForbiddenDependencies(installSection).filter(match => match.kind === 'system-git'),
      [],
      `${path} install requirements must not depend on system Git`,
    );
  }
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
  for (const marker of [
    'claude-hud@claude-hud', 'claude-mem@thedotmack', 'superpowers@superpowers-marketplace',
    '0.7.0', '13.14.0', '6.2.0', 'hub.211107.xyz', 'statusLine',
  ]) {
    assert.ok(source.includes(marker), `${path} must document managed plugin dependency marker ${marker}`);
  }
  assert.match(source, /SHA-256/i, `${path} must document fixed plugin archive hashes`);
  assert.match(source, /statusLine[\s\S]{0,240}Bun|Bun[\s\S]{0,240}statusLine/i, `${path} must document the Bun HUD statusLine`);
  const claudeMemSection = source.match(/## claude-mem[^\n]*\n[\s\S]*?(?=\n## )/i)?.[0] ?? '';
  for (const marker of ['Bun', 'MCP']) assert.ok(claudeMemSection.includes(marker), `${path} claude-mem section must document ${marker} entrypoints`);
  assert.match(claudeMemSection, /hooks?|Hook/i, `${path} claude-mem section must document Hook entrypoints`);
  assert.match(source, /warning|警告/i, `${path} must explain optional plugin warning semantics`);
  for (const marker of readmeFeatureMarkers[path]) {
    assert.ok(source.includes(marker), `${path} must retain ${marker}`);
  }
}

const localizedPluginContracts = {
  'README.md': ['保留已安装的更高版本', '不会把 Claude Code 固定到插件版本', '保留插件缓存、Marketplace 注册和 claude-mem 记忆数据', '保留并报告为未经 Bun 验证'],
  'README_EN.md': ['preserves any installed newer version', 'does not pin Claude Code to plugin versions', 'keeps plugin caches, marketplace registrations, and claude-mem memory data', 'preserved and reported as not Bun-verified'],
  'README_JP.md': ['インストール済みの新しいバージョンを維持', 'Claude Code をプラグインのバージョンに固定しません', 'プラグインキャッシュ、Marketplace 登録、claude-mem のメモリデータを保持', '保持し、Bun 未検証として報告'],
};
for (const [path, markers] of Object.entries(localizedPluginContracts)) {
  const source = read(path);
  for (const marker of markers) assert.ok(source.includes(marker), `${path} must document: ${marker}`);
}

const agents = read('AGENTS.md');
assert.match(agents, /two parts|两部分/i, 'AGENTS.md must describe the two-part repository');
assert.match(agents, /@anthropic-ai\/claude-code-<platform>/, 'AGENTS.md must use the correct Claude Code package name');
assert.match(agents, /Bun-only[\s\S]{0,100}CI|CI[\s\S]{0,100}Bun-only/i, 'AGENTS.md must document the Bun-only CI contract');
assert.match(agents, /Linux[\s\S]{0,160}Windows|Windows[\s\S]{0,160}Linux/i, 'AGENTS.md must describe the current Bun-only Linux and Windows workflow');
assert.match(agents, /plugin-dependencies\.mjs/, 'AGENTS.md must name the generated optional plugin manager');
assert.match(agents, /bun tests\/installer-plugin-dependencies\.mjs/, 'AGENTS.md must name the focused optional plugin dependency test');
assert.doesNotMatch(agents, /Task 7|temporary workflow exception|cache-cleanup-weekly/i, 'AGENTS.md must reject completed-task exceptions and deleted workflow references');

const workflow = read('.github/workflows/compat-daily.yml');
const installerE2E = read('tests/installer-e2e.mjs');
assert.match(installerE2E, /\['node', 'npm', 'rg', 'tar', 'unzip', 'git'\]/, 'Unix installer E2E must trap system Git with the other forbidden dependencies');
assert.match(installerE2E, /claude-hud-current-style\.json/, 'Unix installer E2E must execute the committed HUD golden fixture');
for (const marker of [
  'HUD statusline: bun-only current-style=exact',
  'claude-mem entrypoints: hooks=bun mcp=bun',
  'plugin retention: hud=present memory=present superpowers=present',
]) {
  assert.ok(installerE2E.includes(marker), `Unix installer E2E must produce ${marker}`);
}
assert.equal(installerE2E.match(/validatePluginSummary\((?:initialInstallOutput|noUpgradeOutput)\)/g)?.length, 2, 'Unix installer E2E must validate the exact optional plugin summary after both installs');
assert.match(installerE2E, /expectedSettingsAfterUninstall/, 'Unix installer E2E must derive settings by removing only managed statusLine');
assert.match(installerE2E, /claude-mem[\s\S]{0,160}sentinel/i, 'Unix installer E2E must preserve claude-mem sentinel data');
assert.deepEqual(findForbiddenDependencies(workflow, { allowBadgePublishGit: true }), [], 'compat-daily must not require an external Node, npm, system Git, or system ripgrep executable outside badge publishing');
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
for (const dependency of ['node', 'npm', 'rg', 'tar', 'unzip', 'git', 'git.exe']) {
  assert.match(workflow, new RegExp(`['"]${dependency}['"]`), `Windows smoke must trap ${dependency} with a command shim`);
}
assert.match(workflow, /Join-Path\s+\$shimDir\s+['"]git\.exe['"]/, 'Windows smoke must create a real git.exe shim path');
assert.match(workflow, /\$bunBin\s+build\s+--compile[\s\S]{0,240}\$gitExeShim/, 'Windows smoke must compile the real git.exe shim with Bun');
assert.match(workflow, /Assert-ForbiddenShim[\s\S]{0,200}git\.cmd[\s\S]{0,200}Assert-ForbiddenShim[\s\S]{0,200}git\.exe/, 'Windows smoke must execute git and git.exe shims before the installer');
assert.match(workflow, /\.clawgod\\vendor\\ripgrep\\bin\\rg\.exe/, 'Windows smoke must execute the private ripgrep binary');
assert.match(workflow, /forbidden dependency invoked:/, 'compat smoke must fail on the forbidden dependency marker');
assert.equal(workflow.match(/['"]tests\/\*\*['"]/g)?.length, 2, 'compat path filters must include all tests and fixtures for push and pull requests');
for (const path of ['README.md', 'README_EN.md', 'README_JP.md', 'AGENTS.md']) {
  assert.equal(workflow.match(new RegExp(`['"]?${path.replace('.', '\\.')}['"]?`, 'g'))?.length, 2, `compat path filters must include ${path} twice`);
}
assert.equal(workflow.match(/docs\/superpowers\/specs\/2026-08-09-claude-plugin-dependencies-design\.md/g)?.length, 2, 'compat filters must include the plugin design spec twice');
assert.equal(workflow.match(/docs\/superpowers\/plans\/2026-08-09-claude-plugin-dependencies\.md/g)?.length, 2, 'compat filters must include the plugin plan twice');
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
assert.match(workflow, /ConvertFrom-Json/, 'Windows plugin assertions must parse JSON with PowerShell APIs');
assert.match(workflow, /claude-hud-current-style\.json/, 'Windows smoke must execute the committed HUD golden fixture');
assert.match(workflow, /Assert-HudGoldenFixture\s+\$settings/, 'Windows HUD smoke must consume the persisted settings command');
assert.match(workflow, /FileName\s*=\s*\$env:ComSpec/, 'Windows HUD smoke must execute through the cmd.exe command host');
assert.match(workflow, /ArgumentList\.Add\(['"]\/d['"]\)[\s\S]{0,160}ArgumentList\.Add\(['"]\/s['"]\)[\s\S]{0,160}ArgumentList\.Add\(['"]\/c['"]\)/, 'Windows HUD smoke must use cmd.exe /d /s /c');
assert.match(workflow, /CLAWGOD_E2E_CONTRACT['"]?\s*=\s*['"]plugin-retention['"]/, 'Windows smoke must invoke the shared Bun retention validator');
assert.match(workflow, /CLAWGOD_E2E_CONTRACT['"]?\s*=\s*['"]plugin-selection['"]/, 'Windows smoke must consume the shared Bun strict-SemVer selection');
assert.doesNotMatch(workflow, /\[version\]/i, 'Windows smoke must not use the looser PowerShell version parser');
assert.match(workflow, /mcpSearch\.args\.Count\s+-ne\s+2/, 'Windows claude-mem checks must require exact MCP args');
assert.match(workflow, /Assert-ClaudeMemMcpConsumer[\s\S]{0,4000}claude-mem: mcp server not found/, 'Windows smoke must execute the saved MCP command in its safe missing-server branch');
assert.match(workflow, /expectedSettingsAfterUninstall/, 'Windows smoke must derive settings by removing only managed statusLine');
for (const marker of [
  'Optional plugins: 3 ready, 0 warnings',
  'HUD statusline: bun-only current-style=exact',
  'claude-mem entrypoints: hooks=bun mcp=bun',
  'plugin retention: hud=present memory=present superpowers=present',
]) {
  assert.ok(workflow.includes(marker), `Windows smoke must assert ${marker}`);
}
assert.equal(existsSync(join(root, '.github/workflows/cache-cleanup-weekly.yml')), false, 'obsolete npm cache cleanup workflow must not return');
for (const path of readdirSync(join(root, '.github/workflows')).filter(path => /\.ya?ml$/.test(path))) {
  const source = read(`.github/workflows/${path}`);
  const matches = findForbiddenDependencies(source, { allowBadgePublishGit: path === 'compat-daily.yml' });
  assert.deepEqual(
    matches,
    [],
    `.github/workflows/${path} must not add a product Node, npm, downloader, system Git, or system ripgrep dependency; compat Git is limited to badge publishing`,
  );
}

for (const path of paths.installers) {
  const source = read(path);
  assert.match(source, /provider\.json/, `${path} must retain provider configuration`);
  assert.match(source, /features\.json/, `${path} must retain feature configuration`);
  assert.match(source, /CLAWGOD_NO_AUTO_CHROME/, `${path} must retain Chrome opt-out`);
  assert.match(source, /claude-mem-compat/, `${path} must retain claude-mem compatibility`);
}

console.log('bun-only repository policy checks passed');
