import { AST_PATCH_IDS, applyAstEdits, parsePatchSource, scanAstPatches } from './semantic.mjs';

export const MODULE_SEPARATOR = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';

export function applySemanticPatches(source, descriptors, { dryRun = false, verify = false } = {}) {
  const modules = source.split(MODULE_SEPARATOR);
  const scans = modules.map(scanAstPatches);
  const results = new Map();
  const edits = modules.map(() => []);
  for (const descriptor of descriptors) {
    const id = descriptor.semanticId;
    if (!AST_PATCH_IDS.includes(id)) throw new Error(`Unknown semantic patch: ${id}`);
    const matches = scans.flatMap(scan => scan[id].matches);
    const present = scans.some(scan => scan[id].present);
    if (scans.some(scan => scan[id].ambiguous) || (id === 'remote-settings-off' && matches.length > 1)) {
      results.set(descriptor, { status: 'failed', detail: `ambiguous AST patch sites: ${id}` });
    } else if (present) {
      results.set(descriptor, { status: 'stale', detail: `AST matcher stale: ${id}` });
    } else if (matches.length) {
      results.set(descriptor, { status: verify ? 'verify' : 'applied', count: matches.length });
      for (let i = 0; i < scans.length; i++) edits[i].push(...scans[i][id].matches);
    } else {
      results.set(descriptor, { status: scans.some(scan => scan[id].patched) ? 'already' : 'skipped', detail: 'AST gate present or feature absent' });
    }
  }
  const next = modules.map((code, index) => {
    if (!edits[index].length) return code;
    const patched = applyAstEdits(code, edits[index]);
    parsePatchSource(patched);
    return patched;
  }).join(MODULE_SEPARATOR);
  return { code: dryRun || verify ? source : next, results };
}

export function applySemanticPatch(source, options = {}) {
  const descriptor = { semanticId: options.semanticId };
  const result = applySemanticPatches(source, [descriptor], options);
  return { ...result.results.get(descriptor), code: result.code };
}
