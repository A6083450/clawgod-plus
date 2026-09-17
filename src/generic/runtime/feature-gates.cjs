'use strict';
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

function loadFeatureGates(directory, metadata = JSON.parse('@@CLAWGOD_RUNTIME_FEATURE_METADATA@@'), env = process.env, warn = text => process.stderr.write(text)) {
  const configFile = join(directory, 'patches.json');
  let config = Object.create(null);
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(config, parsed);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      try { writeFileSync(configFile, '{}\n', { flag: 'wx', mode: 0o600 }); } catch {}
    }
  }
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('CLAWGOD_FEATURE_') || (value !== 'true' && value !== 'false')) continue;
    config[name.slice('CLAWGOD_FEATURE_'.length).toLowerCase().replaceAll('_', '-')] = value === 'true';
  }
  const known = new Set(Object.values(metadata).flat());
  for (const name of Object.keys(config)) {
    if (!known.has(name)) warn(`[clawgod] Unknown runtime feature: ${JSON.stringify(name)}\n`);
  }
  return Object.fromEntries(Object.entries(metadata).map(([id, features]) => [
    id, features.some(feature => config[feature] !== false),
  ]));
}

module.exports = { loadFeatureGates };
