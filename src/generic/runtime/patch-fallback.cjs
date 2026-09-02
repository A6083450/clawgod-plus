const {
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { join } = require('node:path');

const PATCH_FALLBACK_FILENAME = 'patch-fallback.json';
const SOURCE_VERSION = /^\d+\.\d+\.\d+(?:\.\d+)?$/;
const CLAWGOD_VERSION = /^\d+\.\d+\.\d+(?:-claude\.\d+\.\d+\.\d+(?:\.\d+)?)?$/;
const REASON = 'bundle-patch-compatibility';

function validatePatchFallback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== 4 || keys.join(',') !== 'clawgodVersion,reason,schemaVersion,sourceVersion') return false;
  return value.schemaVersion === 1
    && typeof value.sourceVersion === 'string'
    && SOURCE_VERSION.test(value.sourceVersion)
    && typeof value.clawgodVersion === 'string'
    && CLAWGOD_VERSION.test(value.clawgodVersion)
    && value.reason === REASON;
}

function statePath(clawgodDir) {
  return join(clawgodDir, PATCH_FALLBACK_FILENAME);
}

function readPatchFallback(clawgodDir) {
  try {
    const value = JSON.parse(readFileSync(statePath(clawgodDir), 'utf8'));
    return validatePatchFallback(value) ? value : null;
  } catch {
    return null;
  }
}

function writePatchFallback(clawgodDir, { sourceVersion, clawgodVersion }) {
  const value = {
    schemaVersion: 1,
    sourceVersion,
    clawgodVersion,
    reason: REASON,
  };
  if (!validatePatchFallback(value)) throw new Error('invalid patch fallback state');

  mkdirSync(clawgodDir, { recursive: true });
  const temporaryPath = join(clawgodDir, `.patch-fallback.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let temporaryCreated = false;
  try {
    const descriptor = openSync(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    try {
      writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n', 'utf8');
    } finally {
      try { closeSync(descriptor); } catch {}
    }
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, statePath(clawgodDir));
    temporaryCreated = false;
    return value;
  } finally {
    if (temporaryCreated) {
      try { unlinkSync(temporaryPath); } catch {}
    }
  }
}

function clearPatchFallback(clawgodDir) {
  const path = statePath(clawgodDir);
  if (existsSync(path)) unlinkSync(path);
}

module.exports = {
  PATCH_FALLBACK_FILENAME,
  validatePatchFallback,
  readPatchFallback,
  writePatchFallback,
  clearPatchFallback,
};

if (require.main === module) {
  const [action, clawgodDir, sourceVersion, clawgodVersion, ...extra] = process.argv.slice(2);
  if ((!action || !clawgodDir)
    || (action === 'write' && (!sourceVersion || !clawgodVersion || extra.length))
    || (action === 'clear' && (sourceVersion || clawgodVersion || extra.length))
    || (action !== 'write' && action !== 'clear')) {
    process.exit(2);
  }
  try {
    if (action === 'write') writePatchFallback(clawgodDir, { sourceVersion, clawgodVersion });
    else clearPatchFallback(clawgodDir);
  } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
