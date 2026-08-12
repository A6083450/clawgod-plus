#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const installers = [
  ['install.sh', '../install.sh', 'cat > "$CLAWGOD_DIR/patch.mjs" << \'PATCHER_EOF\'', '\nPATCHER_EOF'],
  ['install.ps1', '../install.ps1', "$patcherCode = @'", "\n'@\n\nSet-Content"],
];

function extractPatcher(file, marker, closingMarker) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${file}: patcher heredoc must exist`);
  const bodyStart = source.indexOf('\n', start) + 1;
  const end = source.indexOf(closingMarker, bodyStart);
  assert.notEqual(end, -1, `${file}: patcher heredoc must close`);
  return source.slice(bodyStart, end);
}

const fixtures = [
  {
    name: '2.1.226 symbols',
    functionName: 'q3v',
    parseSubcommand: 'K9l',
    source: `function q3v(e,t,r){let n=iEh(r.SKILL_PROMPT,r),o=n.indexOf("## Reading Guide"),s=[o!==-1?n.slice(0,o).trimEnd():n],a=j3v.replace(/\\{lang\\}/g,e??"unknown");if(e){let c=Object.keys(r.SKILL_FILES).filter((u)=>u.startsWith(\`${'${e}'}/\`)||u.startsWith("shared/"));s.push(a),s.push(\`---\\n\\n## Included Documentation\\n\\n\`+nEh(c,r.SKILL_FILES,r))}else{if(s.push(a),K9l(t)!=="prompt-audit")s.push("No project language was auto-detected.");s.push(\`---\\n\\n## Included Documentation\\n\\n\`+nEh(Object.keys(r.SKILL_FILES),r.SKILL_FILES,r))}let l=n.indexOf("## When to Use WebFetch");if(l!==-1)s.push(n.slice(l).trimEnd());if(t)s.push(\`## User Request\\n\\n${'${t}'}\`);return s.join(\`\\n\\n\`)}`,
  },
  {
    name: '2.1.227 symbols',
    functionName: 'MrE',
    parseSubcommand: 'HYl',
    source: `function MrE(e,t,r){let n=GLh(r.SKILL_PROMPT,r),o=n.indexOf("## Reading Guide"),s=[o!==-1?n.slice(0,o).trimEnd():n],a=HrE.replace(/\\{lang\\}/g,e??"unknown");if(e){let c=Object.keys(r.SKILL_FILES).filter((u)=>u.startsWith(\`${'${e}'}/\`)||u.startsWith("shared/"));s.push(a),s.push(\`---\\n\\n## Included Documentation\\n\\n\`+zLh(c,r.SKILL_FILES,r))}else{if(s.push(a),HYl(t)!=="prompt-audit")s.push("No project language was auto-detected.");s.push(\`---\\n\\n## Included Documentation\\n\\n\`+zLh(Object.keys(r.SKILL_FILES),r.SKILL_FILES,r))}let l=n.indexOf("## When to Use WebFetch");if(l!==-1)s.push(n.slice(l).trimEnd());if(t)s.push(\`## User Request\\n\\n${'${t}'}\`);return s.join(\`\\n\\n\`)}`,
  },
];

for (const [name, file, marker, closingMarker] of installers) {
  const patcher = extractPatcher(file, marker, closingMarker);
  for (const fixture of fixtures) {
    const label = `${name} (${fixture.name})`;
    const dir = mkdtempSync(join(tmpdir(), 'clawgod-claude-api-skill-'));
    try {
      writeFileSync(join(dir, 'patch.mjs'), patcher, 'utf8');
      writeFileSync(join(dir, 'cli.original.cjs'), fixture.source, 'utf8');

      const run = spawnSync(process.execPath, ['patch.mjs'], { cwd: dir, encoding: 'utf8' });
      const output = run.stdout + run.stderr;
      assert.equal(run.status, 0, `${label}: patcher must succeed\n${output}`);

      const patched = readFileSync(join(dir, 'cli.original.cjs'), 'utf8');
      new Function(patched);
      assert.match(patched, new RegExp(`function ${fixture.functionName}\\(e,t,r\\)`), `${label}: claude-api prompt builder must be replaced`);
      assert.match(patched, new RegExp(`p=${fixture.parseSubcommand}\\(t\\),d=\\[\\]`), `${label}: prompt builder must preserve the detected subcommand parser`);
      assert.match(patched, /shared\/model-migration\.md/, `${label}: migrate documentation must remain available`);
      assert.match(patched, /shared\/prompt-audit\.md/, `${label}: prompt-audit documentation must remain available`);
      assert.doesNotMatch(patched, /Object\.keys\(r\.SKILL_FILES\)\.filter\(\(u\)=>u\.startsWith/, `${label}: broad language/shared documentation loading must be removed`);

      const second = spawnSync(process.execPath, ['patch.mjs', '--dry-run'], { cwd: dir, encoding: 'utf8' });
      const secondOutput = second.stdout + second.stderr;
      assert.equal(second.status, 0, `${label}: second patcher run must succeed\n${secondOutput}`);
      assert.match(secondOutput, /Claude API skill lazy docs \(already applied\)/, `${label}: patch must be idempotent`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

console.log('patcher claude-api skill load checks passed');
