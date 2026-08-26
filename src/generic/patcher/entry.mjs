#!/usr/bin/env bun
/**
 * ClawGod Plus Universal Patcher — 正则模式匹配, 跨版本兼容
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ENHANCEMENT_CONFIG_FILENAME,
  enhancementConfigPath,
  readEnhancementConfig,
  resolveEnhancementSelection,
} from '../enhancement-config.mjs';
import { inspectPatcherSource } from './core.mjs';
import { createPatchSelection, enhancementManifest } from './registry.mjs';

const DEFAULT_ROOT = dirname(fileURLToPath(import.meta.url));

// v2.1.245+ ships the CLI as an ESM entry point plus a code-split graph of
// chunk-*.js modules under <root>/chunks/. The patcher operates on the whole
// bundle (entry + chunks) as a single logical source so a patch that targets
// code inside a chunk still matches. Modules are concatenated with a marker
// that no patch pattern can accidentally match, then split back on write.
const CHUNKS_DIRNAME = 'chunks';
const MODULE_SEPARATOR = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';

function readBundle(rootDir) {
  const modules = [{ relPath: 'cli.original.cjs', code: readFileSync(join(rootDir, 'cli.original.cjs'), 'utf8') }];
  const chunksDir = join(rootDir, CHUNKS_DIRNAME);
  if (existsSync(chunksDir)) {
    for (const name of readdirSync(chunksDir).filter((n) => n.endsWith('.js')).sort()) {
      modules.push({ relPath: join(CHUNKS_DIRNAME, name), code: readFileSync(join(chunksDir, name), 'utf8') });
    }
  }
  return modules;
}

function concatModules(modules) {
  return modules.map((module) => module.code).join(MODULE_SEPARATOR);
}

function splitModules(combined) {
  return combined.split(MODULE_SEPARATOR);
}

function writeBundle(rootDir, modules) {
  for (const module of modules) {
    const target = join(rootDir, module.relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, module.code, 'utf8');
  }
}

function backupBundle(rootDir, modules) {
  const target = join(rootDir, 'cli.original.cjs');
  const backup = target + '.bak';
  if (!existsSync(backup)) copyFileSync(target, backup);
  const chunksDir = join(rootDir, CHUNKS_DIRNAME);
  const chunksBackup = join(rootDir, `${CHUNKS_DIRNAME}.bak`);
  if (existsSync(chunksDir) && !existsSync(chunksBackup)) {
    cpSync(chunksDir, chunksBackup, { recursive: true });
  }
  return { backup, chunksBackup, chunksDir };
}

function restoreBundle(rootDir) {
  const target = join(rootDir, 'cli.original.cjs');
  const backup = target + '.bak';
  if (!existsSync(backup)) return false;
  copyFileSync(backup, target);
  const chunksDir = join(rootDir, CHUNKS_DIRNAME);
  const chunksBackup = join(rootDir, `${CHUNKS_DIRNAME}.bak`);
  if (existsSync(chunksBackup)) {
    rmSync(chunksDir, { recursive: true, force: true });
    renameSync(chunksBackup, chunksDir);
  }
  return true;
}

export async function runPatcher({ rootDir = DEFAULT_ROOT, args = process.argv.slice(2) } = {}) {
  const target = join(rootDir, 'cli.original.cjs');
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const revert = args.includes('--revert');
  const enhancementFlagIndexes = args
    .map((argument, index) => argument === '--enhancements-file' ? index : -1)
    .filter(index => index >= 0);
  if (enhancementFlagIndexes.length > 1) throw new Error('--enhancements-file may only be provided once');
  const enhancementFlagIndex = enhancementFlagIndexes[0];
  let stored = null;
  if (enhancementFlagIndex !== undefined) {
    const configFile = args[enhancementFlagIndex + 1];
    if (!configFile || configFile.startsWith('--')) throw new Error('--enhancements-file requires a path');
    if (!isAbsolute(configFile)) throw new Error('--enhancements-file must be an absolute path');
    const configDirectory = dirname(configFile);
    const homeDir = dirname(configDirectory);
    if (configFile !== enhancementConfigPath(homeDir)
      || configFile !== join(homeDir, '.clawgod', ENHANCEMENT_CONFIG_FILENAME)) {
      throw new Error('--enhancements-file must name the canonical enhancements.json path');
    }
    stored = await readEnhancementConfig({ homeDir, manifest: enhancementManifest });
  }
  const selection = resolveEnhancementSelection({ stored }, enhancementManifest);
  const { patches, customPatches } = createPatchSelection(selection.enabled);

  if (revert) {
    if (!restoreBundle(rootDir)) {
      console.error('❌ No backup found');
      process.exit(1);
    }
    console.log('✅ Reverted from backup');
    return;
  }

  if (!existsSync(target)) {
    console.error('❌ Target not found:', target);
    process.exit(1);
  }

  const modules = readBundle(rootDir);
  const hasChunks = modules.length > 1;
  let code = concatModules(modules);
  const originalSize = modules.reduce((sum, module) => sum + module.code.length, 0);
  const { version } = inspectPatcherSource(code);

  console.log(`\n${'═'.repeat(55)}`);
  console.log('  ClawGod Plus (universal)');
  console.log(`  Target: cli.original.cjs (v${version})${hasChunks ? ` + ${modules.length - 1} chunks` : ''}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : verify ? 'VERIFY' : 'APPLY'}`);
  console.log(`  Enhancements: ${selection.enabled.length} enabled, ${enhancementManifest.length - selection.enabled.length} disabled`);
  console.log(`${'═'.repeat(55)}\n`);

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const patch of patches) {
    const matches = [...code.matchAll(patch.pattern)];
    let relevant = matches;

    if (patch.validate) {
      relevant = matches.filter(match => patch.validate(match[0], code));
    }

    if (patch.selectIndex !== undefined) {
      relevant = relevant.length > patch.selectIndex ? [relevant[patch.selectIndex]] : [];
    }

    if (patch.unique && relevant.length > 1) {
      console.log(`  ⚠️  ${patch.name} — ${relevant.length} matches, skipping (need 1)`);
      failed++;
      continue;
    }

    if (relevant.length === 0) {
      if (patch.knownShape?.test(code)) {
        console.log(`  ❌ ${patch.name} — known resolver shape did not match exactly`);
        failed++;
        continue;
      }
      if (patch.appliedMarker !== undefined && (patch.appliedMarker instanceof RegExp ? patch.appliedMarker.test(code) : code.includes(patch.appliedMarker))) {
        console.log(`  ✅ ${patch.name} (already applied, marker present)`);
        applied++;
        continue;
      }
      if (patch.optional) {
        console.log(`  ⏭  ${patch.name} (not present in this version)`);
        skipped++;
        continue;
      }
      if (patch.sentinel !== undefined) {
        const sentinels = Array.isArray(patch.sentinel) ? patch.sentinel : [patch.sentinel];
        const stillPresent = sentinels.filter(sentinel => code.includes(sentinel));
        if (stillPresent.length > 0) {
          console.log(`  ❌ ${patch.name} — regex stale, sentinel still in source: ${stillPresent.map(sentinel => JSON.stringify(sentinel)).join(', ')}`);
          failed++;
          continue;
        }
        console.log(`  ✅ ${patch.name} (already applied, sentinel absent)`);
        applied++;
        continue;
      }
      console.log(`  ⚠️  ${patch.name} (0 matches, no sentinel — cannot verify)`);
      skipped++;
      continue;
    }

    if (verify) {
      console.log(`  ⬚  ${patch.name} — ${relevant.length} match(es), not yet applied`);
      skipped++;
      continue;
    }

    let count = 0;
    for (const match of relevant) {
      const replacement = patch.replacer(match[0], ...match.slice(1));
      if (replacement !== match[0]) {
        if (!dryRun) code = code.replace(match[0], () => replacement);
        count++;
      }
    }

    if (count > 0) {
      console.log(`  ✅ ${patch.name} (${count} replacement${count > 1 ? 's' : ''})`);
      applied++;
    } else {
      console.log(`  ⏭  ${patch.name} (no change needed)`);
      skipped++;
    }
  }

  for (const descriptor of customPatches) {
    const result = await descriptor.apply(code, { dryRun, verify, rootDir });
    if (result.status === 'applied') {
      if (!dryRun) code = result.code;
      console.log(`  ✅ ${descriptor.name} (${result.count} replacement${result.count > 1 ? 's' : ''})`);
      applied++;
    } else if (result.status === 'verify') {
      console.log(`  ⬚  ${descriptor.name} — ${result.count} match(es), not yet applied`);
      skipped++;
    } else if (result.status === 'already') {
      console.log(`  ✅ ${descriptor.name} (${result.detail})`);
      applied++;
    } else if (result.status === 'skipped') {
      console.log(`  ⏭  ${descriptor.name} (${result.detail})`);
      skipped++;
    } else {
      console.log(`  ❌ ${descriptor.name} — ${result.detail}`);
      failed++;
    }
  }

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  Result: ${applied} applied, ${skipped} skipped, ${failed} failed`);

  if (failed === 0 && !dryRun && !verify && applied > 0) {
    backupBundle(rootDir, modules);
    const resultModules = splitModules(code);
    if (resultModules.length !== modules.length) {
      console.error(`  ❌ Bundle split mismatch: ${resultModules.length} vs ${modules.length} modules`);
      process.exit(1);
    }
    for (let i = 0; i < modules.length; i++) modules[i].code = resultModules[i];
    writeBundle(rootDir, modules);
    const difference = code.length - originalSize;
    console.log(`  📝 Written: cli.original.cjs${hasChunks ? ` + ${modules.length - 1} chunks` : ''} (${difference >= 0 ? '+' : ''}${difference} bytes)`);
  }

  console.log(`${'═'.repeat(55)}\n`);
  if (failed > 0) process.exit(1);
}

await runPatcher({
  rootDir: import.meta.main
    ? DEFAULT_ROOT
    : dirname(process.argv[1] || fileURLToPath(import.meta.url)),
});
