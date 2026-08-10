#!/usr/bin/env bun
import { randomUUID } from 'node:crypto';
import * as defaultFileSystem from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERATED_HEADER = 'GENERATED FILE - edit src/ and run: bun build.mjs';
export const OUTPUTS = Object.freeze([
  Object.freeze({ template: 'src/template/install.sh', output: 'install.sh', mode: 0o755 }),
  Object.freeze({ template: 'src/template/install.ps1', output: 'install.ps1', mode: 0o644 }),
]);

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const PLACEHOLDER_PATTERN = /@@CLAWGOD_([A-Z][A-Z0-9_]*)@@/g;

export function placeholder(name) {
  return `@@CLAWGOD_${name}@@`;
}

export function renderTemplate(template, replacements) {
  const declared = new Map(Object.entries(replacements));
  const occurrences = new Map();

  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    occurrences.set(name, (occurrences.get(name) || 0) + 1);
    if (!declared.has(name)) {
      throw new Error(`Undeclared placeholder: ${placeholder(name)}`);
    }
  }

  for (const name of declared.keys()) {
    const count = occurrences.get(name) || 0;
    if (count === 0) throw new Error(`Missing placeholder: ${placeholder(name)}`);
    if (count > 1) throw new Error(`Duplicate placeholder: ${placeholder(name)}`);
  }

  let rendered = template;
  for (const [name, replacementValue] of declared) {
    const token = placeholder(name);
    const value = String(replacementValue);
    rendered = value.endsWith('\n') && rendered.includes(`${token}\n`)
      ? rendered.replace(`${token}\n`, value)
      : rendered.replace(token, value);
  }

  const undeclared = rendered.match(PLACEHOLDER_PATTERN);
  if (undeclared) throw new Error(`Undeclared placeholder: ${undeclared[0]}`);
  return rendered;
}

function addGeneratedHeader(output, content) {
  const header = `# ${GENERATED_HEADER}\n`;
  if (output.endsWith('.sh') && content.startsWith('#!')) {
    const lineEnd = content.indexOf('\n');
    return `${content.slice(0, lineEnd + 1)}${header}${content.slice(lineEnd + 1)}`;
  }
  return `${header}${content}`;
}

function resolveOutput(rootDir, output) {
  if (isAbsolute(output)) throw new Error(`Output path must be relative: ${output}`);
  const target = resolve(rootDir, output);
  const traversal = relative(rootDir, target);
  if (traversal === '..' || traversal.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Output path escapes build root: ${output}`);
  }
  return target;
}

export async function renderGeneratedPair({ rootDir = ROOT_DIR, fileSystem = defaultFileSystem } = {}) {
  const featuresJson = await fileSystem.readFile(join(rootDir, 'src/generic/features.json'), 'utf8');
  return Promise.all(OUTPUTS.map(async entry => {
    const template = await fileSystem.readFile(join(rootDir, entry.template), 'utf8');
    const content = renderTemplate(template, { FEATURES_JSON: featuresJson });
    return { ...entry, content: addGeneratedHeader(entry.output, content) };
  }));
}

async function removeIfPresent(fileSystem, path) {
  try {
    await fileSystem.rm(path, { force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function writeGeneratedPair(outputs, {
  rootDir = ROOT_DIR,
  fileSystem = defaultFileSystem,
} = {}) {
  if (!Array.isArray(outputs) || outputs.length !== 2) {
    throw new Error('writeGeneratedPair requires exactly two outputs');
  }

  const transactionId = `${process.pid}-${randomUUID()}`;
  const states = outputs.map(entry => {
    const target = resolveOutput(rootDir, entry.output);
    return {
      ...entry,
      target,
      stage: join(dirname(target), `.${entry.output}.stage-${transactionId}`),
      backup: join(dirname(target), `.${entry.output}.backup-${transactionId}`),
      backedUp: false,
      published: false,
    };
  });

  try {
    for (const state of states) {
      await fileSystem.writeFile(state.stage, state.content, { flag: 'wx', mode: state.mode });
      await fileSystem.chmod(state.stage, state.mode);
    }

    for (const state of states) {
      try {
        await fileSystem.rename(state.target, state.backup);
        state.backedUp = true;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }

    for (const state of states) {
      await fileSystem.rename(state.stage, state.target);
      state.published = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const state of [...states].reverse()) {
      if (!state.published) continue;
      try {
        await removeIfPresent(fileSystem, state.target);
        state.published = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const state of [...states].reverse()) {
      if (!state.backedUp) continue;
      try {
        await fileSystem.rename(state.backup, state.target);
        state.backedUp = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const state of states) {
      try {
        await removeIfPresent(fileSystem, state.stage);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], 'Generated installer publication and rollback failed');
    }
    throw error;
  }

  for (const state of states) {
    if (state.backedUp) await removeIfPresent(fileSystem, state.backup);
  }
}

export async function checkGeneratedPair(outputs, {
  rootDir = ROOT_DIR,
  fileSystem = defaultFileSystem,
} = {}) {
  const stale = [];
  for (const entry of outputs) {
    const target = resolveOutput(rootDir, entry.output);
    try {
      const [content, status] = await Promise.all([
        fileSystem.readFile(target, 'utf8'),
        fileSystem.stat(target),
      ]);
      if (content !== entry.content || (status.mode & 0o777) !== entry.mode) stale.push(entry.output);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      stale.push(entry.output);
    }
  }
  if (stale.length > 0) throw new Error(`Stale generated output: ${stale.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: bun build.mjs [--check]');
  }
  const outputs = await renderGeneratedPair();
  if (args[0] === '--check') {
    await checkGeneratedPair(outputs);
    return;
  }
  await writeGeneratedPair(outputs);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
