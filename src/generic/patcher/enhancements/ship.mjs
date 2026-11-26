import { createHash } from 'node:crypto';
import { parsePatchSource } from '../semantic.mjs';
import { gate } from '../runtime-features.mjs';

const separator = '\n/*__CLAWGOD_MODULE_BOUNDARY__*/\n';
const feature = 'tengu_ancient_backus';
const marker = '/*__clawgod_ship_local_v1__*/';
// 冻结完整资格模块及其导入/导出；仅允许安装器重写 bunfs 路径前缀。
const contracts = new Map([
  ['b854167730939cc250c9bf1399a4eaf82097066f5da6c0a0b2f967f96da53236', '9a39459b114788feca8a934cc522828f8f5573a6e3fcf68ff79f4d5bd099369e'], // darwin-arm64
  ['927aeb9d7ecac09f1b1c769566425988fe8d96a80d08a5b70c6092d6fdef4fb6', 'bf5bdab3bd63f2eab8402bac8e87b2ceef71c9372486ca05cfa7ce430b47b030'], // linux-x64
  ['6621ef2580386a29f7bb7bfdac9517ccec8ac6ba830424ad9dd1a5909b15640e', '0833027013af36b877810009466e1c60a9d1d7f4545302f104991c0c9b1defe1'], // win32-x64
]);

function contract(ast) {
  return createHash('sha256').update(JSON.stringify(ast, (key, value) => {
    if (['start', 'end', 'raw'].includes(key)) return undefined;
    if (key === 'value' && typeof value === 'string') return value.replace(/^(?:\/\$bunfs\/root\/|[A-Z]:\/~BUN\/root\/)/, './');
    return value;
  })).digest('hex');
}

async function apply(source, { dryRun = false, verify = false } = {}) {
  if (!source.includes(feature) && !source.includes(marker)) return { status: 'skipped', detail: '本版本没有内置 ship-local' };
  try {
    const modules = source.split(separator);
    // 已修补模块即使 gate 或禁用变量发生漂移，也必须计入唯一性和契约校验。
    const candidates = modules.map((code, index) => ({ code, index })).filter(({ code }) => code.includes(marker) || (code.includes(feature) && code.includes('CLAUDE_CODE_DISABLE_SHIP')));
    if (candidates.length !== 1) throw Error(`ship 资格模块应唯一，实际 ${candidates.length}`);
    const { code, index } = candidates[0];
    const versions = [...code.matchAll(/^\/\/ Version: ([^\r\n]*)$/gm)].map(match => match[1]);
    if (versions.length !== 1 || versions[0] !== '2.1.332') throw Error('ship 版本未识别');
    const ast = parsePatchSource(code);
    const signature = contract(ast);
    if (code.includes(marker)) {
      if (![...contracts.values()].includes(signature)) throw Error('已修补 ship 资格模块发生漂移');
      return { status: 'already', detail: '本地 ship 资格已启用' };
    }
    if (!contracts.has(signature) || !/^\/\/ Version: 2\.1\.332\s*$/m.test(code)) throw Error(`ship 资格契约未识别: ${signature}`);
    const enabled = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'o');
    // 只修改 ship 的本地发布资格；远端入口、显式禁用、宿主和权限检查不变。
    const insertion = `${marker}if(${gate('ship-local')})return!s.CLAUDE_CODE_REMOTE;`;
    modules[index] = code.slice(0, enabled.body.start + 1) + insertion + code.slice(enabled.body.start + 1);
    if (contract(parsePatchSource(modules[index])) !== contracts.get(signature)) throw Error('ship 补丁输出契约不一致');
    if (verify) return { status: 'verify' };
    return { status: 'applied', count: 1, ...(dryRun ? {} : { code: modules.join(separator) }) };
  } catch (error) {
    return { status: 'stale', detail: `${error.message}; no writes` };
  }
}

export const shipRegistry = Object.freeze({
  id: 'ship', patches: Object.freeze([]), customPatches: Object.freeze([
    Object.freeze({ id: 'ship-local', order: 130, name: 'Ship: local terminal eligibility', apply }),
  ]),
});
