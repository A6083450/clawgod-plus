# Claude Update Patch Fail-Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 适配 Claude Code 2.1.258 的 Computer Use 启动条件，并让已有 ClawGod 安装的 `claude update` 在仅发生 bundle 补丁兼容性漂移时提交新版 clean runtime，而基础设施或运行时验证失败仍完整回滚。

**Architecture:** 将更新控制面从上游 bundle regex 迁到 `wrapper.cjs` 与独立 `self-update.cjs`；patcher 仅把可识别的 mandatory recognizer/custom-patch 失败映射为专用状态码 `42`，保持 bundle all-or-none。installer 仅在 updater 明确授权、已有 prior runtime、且非 `--no-upgrade` 时接收 `42`，以原子状态文件标记 clean fallback；candidate vendor 的发布与 Bun sanity check 必须留在同一可回滚事务中。

**Tech Stack:** Bun/JavaScript（CJS + ESM）、bash、Windows PowerShell 5.1、Node-compatible `fs/path/os/child_process` API、现有无测试框架的 `node:assert/strict` 脚本。

**Spec:** `docs/superpowers/specs/2026-08-27-update-patch-fail-open-design.md`

## Global Constraints

- 退出码 `42` 只表示 bundle patch compatibility failure；配置、读取、写入、split、spawn、vendor 和 sanity 错误不得返回 `42`。
- patcher 必须保持 all-or-none：任一 mandatory compatibility failure 时 `cli.original.cjs`、`chunks/` 字节不变，且不创建 `.bak`。
- fail-open 仅在 `CLAWGOD_UPDATE_PATCH_FAIL_OPEN=1`、安装开始时已有 `cli.original.cjs`、且当前不是 `--no-upgrade` 时授权；直接安装、首次安装和 `--no-upgrade` 始终 fail-closed。
- fallback runtime 仍通过 `wrapper.cjs` 运行，但不声称任何 bundle enhancement 生效；每次普通启动显示一次明确 warning。
- `--dry-run`、`--verify`、Compat Daily 和联网 E2E 继续严格要求 `0 failed`；产品 fallback 不得掩盖 CI recognizer 漂移。
- `dist/unix/install.sh` 与 `dist/win/install.ps1` 只能由 `bun build.mjs` 生成，不得手工编辑。
- Windows installer 必须保持无 BOM、纯 ASCII，并兼容 Windows PowerShell 5.1 与 `irm ... | iex`。
- 不新增第三方依赖；继续使用 Bun 和 Node-compatible 内置模块。
- 不自动 commit 或 push；只有在用户明确要求时才执行 Git 写操作。

## File Structure

### Create

- `src/generic/runtime/self-update.cjs` — 解析顶层 update 参数、选择可信本地或远程 installer、注入 update-only fail-open 授权并传播退出状态。
- `src/generic/runtime/patch-fallback.cjs` — 严格校验、原子写入、读取和清除 `patch-fallback.json`，供 installer 与 wrapper 共享。
- `tests/patcher-compatibility-fallback.mjs` — 锁定 patcher 的 `0 / 1 / 42` 分类和零写入契约。
- `tests/self-update.mjs` — 从旧 bundle 注入测试迁移出的独立 updater 参数、信任、下载、平台和退出传播测试。
- `tests/wrapper-self-update.mjs` — 锁定 wrapper 顶层拦截、普通 bundle 单次加载和 fallback warning。
- `tests/patch-fallback-state.mjs` — 锁定状态 schema、原子写入、权限、损坏输入和清除行为。

### Modify

- `src/generic/patcher/enhancements/computer-use.mjs` — 同时识别带/不带 macOS 前缀的 Computer Use 条件，只移除 noninteractive gate。
- `src/generic/patcher/entry.mjs` — 增加 `--allow-compatibility-fallback` 与专用状态码 `42`。
- `src/generic/patcher/core.mjs` — 删除 bundle 内 `Redirect claude update` descriptor。
- `src/generic/runtime/vendor-transaction.mjs` — 在 candidate vendor 已发布但事务尚未提交时执行 runtime validator；validator 失败复用既有身份校验回滚。
- `src/generic/runtime/wrapper.cjs` — 在加载 provider/upstream bundle 前拦截首个 `update|upgrade` 参数，并在普通命令读取 fallback 状态。
- `src/template/install.sh`、`src/template/install.ps1` — 嵌入新 runtime 模块，实现 update-only fallback、状态事务、Chrome skip 和 checked vendor publication。
- `build.mjs` — 把两个新 canonical runtime 文件加入生成 source map。
- `tests/patcher-worker-launch.mjs` — 增加 2.1.258 真实条件形态 fixture。
- `tests/patcher-registry.mjs`、`tests/fixtures/patcher-task-5-metadata.json` — 删除 update descriptor，计数改为 62，并同步 Computer Use regex metadata。
- `tests/patcher-install-no-upgrade-control-flow.mjs` — 扩充 Unix installer full-success/fallback/fatal/no-upgrade/first-install/sanity rollback 动态测试。
- `tests/installer-bun-runtime.mjs`、`tests/installer-build.mjs` — 锁定新 canonical runtime 的 Unix/Windows 嵌入字节、卸载清理和 PowerShell fallback 控制流。
- `tests/installer-e2e.mjs`、`.github/workflows/compat-daily.yml` — clean E2E 继续要求唯一 `0 failed`，并确认无 fallback 状态残留。
- `README.md`、`README_EN.md`、`README_JP.md`、`CLAUDE.md` — 说明 wrapper self-update 与 compatibility fallback 行为。

### Delete

- `tests/patcher-update-action-shapes.mjs` — wrapper 拦截后不再依赖上游 `.command("update")...action(...)` 形态。
- `tests/patcher-update-bun-only.mjs` — 其有效覆盖迁移到 `tests/self-update.mjs`，不保留重复 bundle-injection 测试。

---

### Task 1: 适配 Claude Code 2.1.258 Computer Use 条件（TDD）

**Files:**
- Modify: `tests/patcher-worker-launch.mjs:13-37`
- Modify: `src/generic/patcher/enhancements/computer-use.mjs:24-32`

**Interfaces:**
- Consumes: descriptor `Computer Use in noninteractive sessions` 的现有 sentinel 和 applied marker。
- Produces: 单一 descriptor 同时接受：
  - `if(U()==="macos"&&!He()&&!Oe&&Pet())...` → `if(U()==="macos"&&!Oe&&Pet())/*marker*/...`
  - `if(!Oe()&&!je&&Elt())...` → `if(!je&&Elt())/*marker*/...`

- [ ] **Step 1: 添加 2.1.258 失败 fixture**

在 `fixtures` 追加：

```js
{
  version: '2.1.258',
  workerResolver: 'function W1t(e={}){if(!e.pinToCurrentBinary&&yRo()){let r=Xon();return{cmd:r,prefixArgs:[]}}if(WE())return{cmd:process.execPath,prefixArgs:[]};let t=process.argv[1];if(!t)return{cmd:process.execPath,prefixArgs:[]};return{cmd:process.execPath,prefixArgs:[t]}}',
  computerUseStartup: 'async function computerUseStartup(){if(!Oe()&&!je&&Elt())try{let{setupComputerUseMCP:Ie}=await loadComputerUse(),{mcpConfig:We,allowedTools:dt}=Ie();return{We,dt}}catch(Ie){}}',
  computerUseGate: /if\(!je&&Elt\(\)\)\/\*__clawgod_computer_use_noninteractive__\*\//,
  plainBunResult: { cmd: '/runtime/bun', prefixArgs: ['/install/cli.cjs'] },
  standaloneResult: { cmd: '/native/claude', prefixArgs: [] },
},
```

保留 2.1.250 和 legacy fixtures，确保旧形态不回归。

- [ ] **Step 2: 运行测试，确认修复前失败**

Run:

```bash
bun tests/patcher-worker-launch.mjs
```

Expected: FAIL；2.1.258 输出包含 `Computer Use in noninteractive sessions — regex stale`，patcher status 非零。

- [ ] **Step 3: 最小扩展 recognizer**

将 descriptor 的 pattern/replacer 改为：

```js
pattern: /if\((?:([\w$]+)\(\)==="macos"&&)?!([\w$]+)\(\)((?:&&![\w$]+)?)&&([\w$]+)\(\)\)try\{let\{setupComputerUseMCP:/g,
replacer: (match, platform, isNonInteractive, safetyCondition, gate) => {
  const retainedConditions = [
    platform ? `${platform}()==="macos"` : '',
    safetyCondition.replace(/^&&/, ''),
    `${gate}()`,
  ].filter(Boolean).join('&&');
  return `if(${retainedConditions})/*__clawgod_computer_use_noninteractive__*/try{let{setupComputerUseMCP:`;
},
```

不要移除 `!restricted` 或 feature gate；`isNonInteractive` capture 只用于证明被删除的是第一项函数 gate。

- [ ] **Step 4: 运行 targeted test**

Run:

```bash
bun tests/patcher-worker-launch.mjs
```

Expected: PASS；legacy、2.1.250、2.1.258 和 idempotence 全部通过。

- [ ] **Step 5: 用真实 2.1.258 bundle 做隔离验证**

在临时目录下载 `@anthropic-ai/claude-code-darwin-arm64@2.1.258`，使用当前 extractor/post-processor，并把 generated patcher 与固定 Acorn fixture 写到同一个 runtime root：

```bash
REPO=/Users/liangjiaquan/gitReposition/clawgod
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
npm pack @anthropic-ai/claude-code-darwin-arm64@2.1.258 --silent --pack-destination "$work"
tar -xzf "$work"/*.tgz -C "$work"
bun "$REPO/src/generic/runtime/extractor.mjs" "$work/package/claude" "$work/runtime"
cp "$REPO/src/generic/runtime/post-processor.mjs" "$work/runtime/post-process.mjs"
bun "$work/runtime/post-process.mjs" "$work/runtime"
mkdir -p "$work/runtime/vendor"
cp "$REPO/tests/fixtures/acorn-8.16.0.cjs" "$work/runtime/vendor/acorn.cjs"
REPO="$REPO" RUNTIME="$work/runtime" bun -e '
  import { writeFileSync } from "node:fs";
  const { buildPatcherBundle } = await import(`${process.env.REPO}/build.mjs`);
  writeFileSync(`${process.env.RUNTIME}/patch.mjs`, await buildPatcherBundle());
'
bun "$work/runtime/patch.mjs" --dry-run
```

Expected: 唯一 summary 为 `0 failed`，Computer Use 项为 1 replacement；shell 退出时 trap 删除临时目录。

---

### Task 2: 给 patcher 增加 compatibility 专用退出协议（TDD）

**Files:**
- Create: `tests/patcher-compatibility-fallback.mjs`
- Modify: `src/generic/patcher/entry.mjs:80-117, 233-251`

**Interfaces:**
- Consumes: `runPatcher({ rootDir, args })`；现有 `failed` 只由 recognizer/descriptor 明确失败递增。
- Produces: `export const PATCH_COMPATIBILITY_EXIT_CODE = 42`；仅 apply 模式的 `--allow-compatibility-fallback` 将 `failed > 0` 映射为 `42`。

- [ ] **Step 1: 写 `tests/patcher-compatibility-fallback.mjs`**

对 `getPatcherSources()` 返回的 canonical graph 和 generated bundle 各运行以下表格：

```js
const cases = [
  { args: [], expected: 1 },
  { args: ['--allow-compatibility-fallback'], expected: 42 },
  { args: ['--dry-run', '--allow-compatibility-fallback'], expected: 1 },
  { args: ['--verify', '--allow-compatibility-fallback'], expected: 1 },
];
```

fixture 使用已知 stale resolver shape（与 `patcher-worker-launch.mjs` stale fixture 相同）。每个 case 断言：

```js
assert.equal(run.status, expected);
assert.match(output, /Result: \d+ applied, \d+ skipped, 1 failed/);
assert.equal(readFileSync(target, 'utf8'), original);
assert.equal(existsSync(`${target}.bak`), false);
assert.equal(existsSync(join(root, 'chunks.bak')), false);
```

另建 malformed canonical `enhancements.json` case，并传 `--allow-compatibility-fallback --enhancements-file <absolute canonical path>`，断言 status 非零且不等于 42；再建 missing target case，断言也不等于 42。

- [ ] **Step 2: 运行测试，确认 `42` case 失败**

Run:

```bash
bun tests/patcher-compatibility-fallback.mjs
```

Expected: FAIL；当前授权 case 实际 status 为 1。

- [ ] **Step 3: 实现严格授权条件**

在 `entry.mjs` 顶层加入：

```js
export const PATCH_COMPATIBILITY_EXIT_CODE = 42;
```

在参数解析处加入：

```js
const allowCompatibilityFallback = args.includes('--allow-compatibility-fallback')
  && !dryRun
  && !verify
  && !revert;
```

结尾保持 summary 输出不变，只替换最终退出：

```js
if (failed > 0) process.exit(
  allowCompatibilityFallback ? PATCH_COMPATIBILITY_EXIT_CODE : 1,
);
```

不要 catch `readBundle`、配置读取、custom patch throw、backup/write/split 错误；让它们沿现有 fatal 路径以普通非零退出。

- [ ] **Step 4: 运行 patcher 协议和既有原子性测试**

Run:

```bash
bun tests/patcher-compatibility-fallback.mjs
bun tests/patcher-worker-launch.mjs
bun tests/patcher-enhancement-selection.mjs
```

Expected: 全部 PASS；旧 strict cases 仍返回非零而不是 42。

---

### Task 3: 把 self-update 从 bundle patch 提取为独立模块（TDD）

**Files:**
- Create: `src/generic/runtime/self-update.cjs`
- Create: `tests/self-update.mjs`
- Reference/migrate: `tests/patcher-update-bun-only.mjs`

**Interfaces:**
- Produces:

```js
parseUpdateArgs(argv) -> {
  command: 'update' | 'upgrade',
  explicitVersion: boolean,
  version: string,
  noUpgrade: boolean,
  leanOff: boolean,
  leanOn: boolean,
  leanMax: boolean,
}

runSelfUpdate(argv, options?) -> { status: number, signal: string | null }
exitWithOutcome(outcome, processObject?) -> never
```

`options` 的稳定测试接口：

```js
{
  platform = process.platform,
  homeDir = homedir(),
  temporaryRoot = tmpdir(),
  execPath = process.execPath,
  env = process.env,
  stderr = process.stderr,
  spawn = spawnSync,
}
```

- [ ] **Step 1: 从旧测试迁移 updater cases**

创建 `tests/self-update.mjs`，直接 `require('../src/generic/runtime/self-update.cjs')`，保留旧测试的临时 HOME、带空格路径、forbidden downloader、fake `fetch-file.mjs`、fake bash/powershell 和以下断言：

- 只有显式 `--version` 才可能 trusted-local；无参 update 强制下载 Latest Release installer。
- `.clawgod-version` 必须匹配：

```js
/^[0-9]+[.][0-9]+[.][0-9]+(?:-claude[.][0-9]+[.][0-9]+[.][0-9]+(?:[.][0-9]+)?)?$/
```

- local installer 必须恰好有一个同值声明，否则远程刷新。
- Unix command 为 `['bash', installer]`；Windows command 为 `['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',installer]`。
- child env 精确包含：

```js
CLAWGOD_NONINTERACTIVE: '1',
CLAWGOD_UPDATE_PATCH_FAIL_OPEN: '1',
CLAWGOD_VERSION: explicitVersion || 'latest',
```

并按 flags 设置/清除 `CLAWGOD_NO_UPGRADE`、`CLAWGOD_LEAN_OFF`、`CLAWGOD_LEAN_ON`、`CLAWGOD_LEAN_MAX`，不得继承未由本次 argv 指定的 stale 值。
- download/installer 的 nonzero status 原样返回；spawn error 返回 1 并打印 `[clawgod] update failed:`；signal 保留在 outcome；临时目录在所有分支清理。

- [ ] **Step 2: 运行测试确认模块缺失**

Run:

```bash
bun tests/self-update.mjs
```

Expected: FAIL with module-not-found for `self-update.cjs`。

- [ ] **Step 3: 实现参数解析**

核心解析保持小而明确：

```js
function parseUpdateArgs(argv) {
  const [command, ...args] = argv;
  if (command !== 'update' && command !== 'upgrade') {
    throw new Error('self-update requires update or upgrade as the first argument');
  }
  const versionIndex = args.indexOf('--version');
  const explicitVersion = versionIndex >= 0 && typeof args[versionIndex + 1] === 'string' && args[versionIndex + 1] !== '';
  return {
    command,
    explicitVersion,
    version: explicitVersion ? args[versionIndex + 1] : 'latest',
    noUpgrade: args.includes('--no-upgrade'),
    leanOff: args.includes('--lean-off'),
    leanOn: args.includes('--lean-on'),
    leanMax: args.includes('--lean-max'),
  };
}
```

若 `--version` 无值，抛出明确错误，不把它静默当 latest。

- [ ] **Step 4: 迁移可信 installer 与运行逻辑**

把 `core.mjs` 旧 replacer 中的逻辑展开成可读函数：

```js
function runSelfUpdate(argv, options = {}) {
  // resolve defaults
  // parse args
  // inspect <home>/.clawgod/.clawgod-version and install.sh|install.ps1
  // download through managed fetch-file.mjs when local installer is not trusted
  // spawn installer with exact argv and sanitized per-invocation env
  // return { status, signal }
  // finally rmSync temporary directory
}
```

必须显式检查 `fetch-file.mjs` 与 `proxy-fetch.mjs` 都存在，远程 URL 固定为：

```js
https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh
https://github.com/A6083450/clawgod-plus/releases/latest/download/install.ps1
```

`exitWithOutcome` 对 signal 先尝试 `processObject.kill(processObject.pid, signal)`，失败则 `exit(1)`；普通结果 `exit(status)`。模块末尾必须提供真正的独立 CLI 入口：

```js
if (require.main === module) {
  exitWithOutcome(runSelfUpdate(process.argv.slice(2)));
}
```

- [ ] **Step 5: 运行 updater tests**

Run:

```bash
bun tests/self-update.mjs
```

Expected: PASS，且临时目录无 `clawgod-update-*` 残留。

---

### Task 4: 建立 fallback 状态模块并切换 wrapper 控制面（TDD）

**Files:**
- Create: `src/generic/runtime/patch-fallback.cjs`
- Create: `tests/patch-fallback-state.mjs`
- Create: `tests/wrapper-self-update.mjs`
- Modify: `src/generic/runtime/wrapper.cjs:1-54, 266-290`
- Modify: `src/generic/patcher/core.mjs:203-225`
- Modify: `src/generic/patcher/registry.mjs` consumers via tests only
- Modify: `tests/patcher-registry.mjs`
- Modify: `tests/fixtures/patcher-task-5-metadata.json`
- Modify: `build.mjs:164-179`
- Modify: `src/template/install.sh`、`src/template/install.ps1`（只嵌入/清理新模块，本任务不启用 fallback）
- Modify: `tests/installer-bun-runtime.mjs`、`tests/installer-build.mjs`
- Delete: `tests/patcher-update-action-shapes.mjs`
- Delete after coverage parity: `tests/patcher-update-bun-only.mjs`

**Interfaces:**
- `patch-fallback.cjs` exports:

```js
PATCH_FALLBACK_FILENAME
validatePatchFallback(value) -> boolean
readPatchFallback(clawgodDir) -> validState | null
writePatchFallback(clawgodDir, { sourceVersion, clawgodVersion }) -> validState
clearPatchFallback(clawgodDir) -> void
```

- Installer-facing CLI（`require.main === module`）严格支持：

```text
patch-fallback.cjs write <clawgod-dir> <source-version> <clawgod-version>
patch-fallback.cjs clear <clawgod-dir>
```

缺参数或未知 action 返回 2；校验、写入、rename、清理失败返回普通非零，绝不返回 42。

- Wrapper behavior: only `process.argv[2] === 'update' || process.argv[2] === 'upgrade'` invokes updater；其他位置出现同词不拦截。

- [ ] **Step 1: 写状态模块测试**

`tests/patch-fallback-state.mjs` 覆盖：

```js
const valid = {
  schemaVersion: 1,
  sourceVersion: '2.1.258',
  clawgodVersion: '2026.9.2-claude.2.1.258',
  reason: 'bundle-patch-compatibility',
};
```

断言 exact four-key schema；unknown key、错误 schema/reason、非字符串、换行、path-like version、四段以上非法版本均无效。写入后 bytes 等于 `JSON.stringify(valid, null, 2) + '\n'`、mode 为 `0600`（POSIX）、无 temp 残留；覆写是 rename（inode 改变）；clear 幂等；损坏 JSON 的 read 返回 null 不抛出。

- [ ] **Step 2: 写 wrapper 拦截和 warning 测试**

在隔离 HOME 中复制 canonical `wrapper.cjs`，准备 managed ripgrep PATH，使用 stub `self-update.cjs` 与 `cli.original.cjs` 捕获调用：

```js
assert.deepEqual(run(['update', '--version', '2.1.258']).updaterArgs,
  ['update', '--version', '2.1.258']);
assert.deepEqual(run(['upgrade']).updaterArgs, ['upgrade']);
assert.equal(run(['-p', 'please run update']).upstreamLoads, 1);
assert.equal(run(['--version', 'update']).upstreamLoads, 1);
```

update path 断言不创建 `provider.json`、不加载 upstream、退出码/signal 经 `exitWithOutcome` 传播。普通 path 断言 upstream 恰好加载一次。

写入 valid fallback state 后普通命令 stderr 必须逐字包含：

```text
[clawgod] Running Claude Code 2.1.258 without bundle enhancements because patch compatibility failed.
[clawgod] Run 'claude update' to retry after a ClawGod update.
```

update path 不重复 warning；损坏/unknown schema 不 warning 且仍加载 upstream。

- [ ] **Step 3: 运行测试确认缺失行为**

Run:

```bash
bun tests/patch-fallback-state.mjs
bun tests/wrapper-self-update.mjs
```

Expected: 第一项 module-not-found；第二项 wrapper 仍加载 upstream/update stub 未调用。

- [ ] **Step 4: 实现 `patch-fallback.cjs`**

校验 pattern 固定为：

```js
const SOURCE_VERSION = /^\d+\.\d+\.\d+(?:\.\d+)?$/;
const CLAWGOD_VERSION = /^\d+\.\d+\.\d+(?:-claude\.\d+\.\d+\.\d+(?:\.\d+)?)?$/;
```

写入使用同目录 `flag:'wx'`、mode `0o600` 的临时文件，再 `renameSync`；`finally` 只清理由本调用创建的临时路径。不得跟随或信任 state 内任何路径。

- [ ] **Step 5: 在 wrapper 最早安全点拦截 update**

放在 managed ripgrep re-exec 完成之后、provider/config/proxy 初始化之前：

```js
const topLevelCommand = process.argv[2];
if (topLevelCommand === 'update' || topLevelCommand === 'upgrade') {
  const { exitWithOutcome, runSelfUpdate } = require('./self-update.cjs');
  exitWithOutcome(runSelfUpdate(process.argv.slice(2)));
}
```

普通命令随后通过 `readPatchFallback(clawgodDir)` 输出 warning，再继续现有 provider/feature/lean/update-check/upstream 流程。

- [ ] **Step 6: 删除旧 bundle update descriptor 并同步 registry contract**

从 `core.mjs` 删除 order 29 descriptor。同步：

- `ownedDescriptors.length`: `63` → `62`；
- wording: `all 63` → `all 62`；
- `expectedRegexOrder` 删除 update descriptor；
- `expectedCore` 删除 update descriptor，并改为 identity/worker/GrowthBook/shell/context；
- fixture 删除对应 descriptor object；
- fixture 的 Computer Use `patternSource` 更新为 Task 1 的新 source。

不要重新编号其他 descriptor order；order 29 留空是兼容性历史的一部分。

- [ ] **Step 7: 加入生成链与卸载清理**

`build.mjs` 的 `runtimeSourceFiles` 加入：

```js
SELF_UPDATE_CJS: 'src/generic/runtime/self-update.cjs',
PATCH_FALLBACK_CJS: 'src/generic/runtime/patch-fallback.cjs',
```

两个 installer 写出 `self-update.cjs` 和 `patch-fallback.cjs`；Unix mode 700，Windows 用 `WriteAllBytes`。卸载清理：两个模块、`patch-fallback.json`、`.patch-fallback.*.tmp`；保留 provider/features/enhancement/lean 用户状态的既有规则。

同步 `installer-bun-runtime.mjs` 的 `canonicalRuntime`、`runtimeDefinitions`、Unix template、PowerShell payload，以及 `installer-build.mjs` 的 isolated build source list。

- [ ] **Step 8: 运行迁移后的测试集合**

Run:

```bash
bun tests/patch-fallback-state.mjs
bun tests/self-update.mjs
bun tests/wrapper-self-update.mjs
bun tests/patcher-registry.mjs
bun tests/installer-build.mjs
bun tests/installer-bun-runtime.mjs
```

Expected: 全部 PASS；仓库不再有 `Redirect \`claude update\`` descriptor 或 action-shape test 引用。

---

### Task 5: 让 vendor 发布与 runtime sanity 处于同一可回滚事务（TDD）

**Files:**
- Modify: `src/generic/runtime/vendor-transaction.mjs:342-427`
- Modify/Test: `tests/installer-bun-runtime.mjs` vendor transaction section

**Interfaces:**
- Extend:

```js
publishVendorTransaction({
  liveVendor,
  candidateVendor,
  transactionDir,
  afterPublish,
  validatePublished,
})
```

`validatePublished()` 在所有 candidate entries 已发布、所有 root identity 再验证后调用；它抛出时进入现有 `rollback(...)`。

- New CLI:

```text
vendor-transaction.mjs publish-checked <live-vendor> <candidate-vendor> <transaction-dir> <bun> <cli>
```

运行 `<bun> <cli> --version`；失败/无 status/signal 作为 publish transaction failure，输出 bounded diagnostic，并依既有回滚结果返回 20/21/22。

- [ ] **Step 1: 添加 checked publication tests**

建立 prior vendor、candidate vendor、managed ripgrep 和 fake runtime：

1. validator status 0：candidate live、prior 位于 transaction `old-vendor`，CLI status 0。
2. validator status 37：candidate 从 live 隔离、prior bytes/mode/inode 恢复，status 20。
3. validator 输出 `Expected CommonJS module to have a function wrapper`：diagnostic 保留该文本，便于 installer 打印 Bun canary 指引。
4. validator 被 signal 终止或 spawn error：普通 fatal status，绝不被解释为 patch compatibility 42。
5. checked rollback 中制造既有 root/entry identity conflict：仍返回 21/22 并保留 evidence，不降低现有安全边界。

- [ ] **Step 2: 运行测试确认当前 CLI 不认识 `publish-checked`**

Run:

```bash
bun tests/installer-bun-runtime.mjs
```

Expected: FAIL at checked publication usage/status assertion。

- [ ] **Step 3: 在成功 publication 尾部调用 validator**

在 `publishVendorTransaction` 的 final `verifyRoots(roots)` 后加入：

```js
validatePublished?.();
verifyRoots(roots);
```

validator 的任何 throw 都由现有 catch 捕获，复用内存中的 `published`/`oldEntries` 身份记录回滚，不另写一套宽松 rollback。

- [ ] **Step 4: 实现 bounded runtime checker CLI**

使用 `spawnSync(bun, [cli, '--version'], { encoding: 'utf8', env: process.env })`。组合 stdout/stderr 最多保留 64 KiB；`error`、`signal`、`status === null`、`status !== 0` 均抛出包含原因的 Error。成功不打印版本噪声。

- [ ] **Step 5: 运行完整 vendor tests**

Run:

```bash
bun tests/installer-bun-runtime.mjs
```

Expected: PASS，包括此前 publish rollback、symlink、root replacement 和 Windows status tests。

---

### Task 6: 实现 Unix installer update-only fallback 事务（TDD）

**Files:**
- Modify: `tests/patcher-install-no-upgrade-control-flow.mjs`
- Modify: `src/template/install.sh:321-415, 595-652, 736-778`

**Interfaces:**
- Authorized patch argv:

```bash
--enhancements-file "$CLAWGOD_DIR/enhancements.json" --allow-compatibility-fallback
```

仅当：

```bash
[ "${CLAWGOD_UPDATE_PATCH_FAIL_OPEN:-}" = "1" ] \
  && [ "$NO_UPGRADE" != "1" ] \
  && [ "$RUNTIME_HAD_TARGET" = "1" ]
```

- Patch status state machine: `0=patched`, `42=clean fallback when authorized`, other nonzero=fatal rollback。

- [ ] **Step 1: 扩充 Unix lifecycle fixture**

给 `runLifecycleCase` 增加 options/env 与 observations：

```js
updateFailOpen
priorFallback
sanityExit
chromeMarker
fallbackState
```

fake patcher 记录 argv 并返回 `PATCH_EXIT`；fake Bun 对 `patch-fallback.cjs` 和 `vendor-transaction.mjs publish-checked` 委派真实 canonical 模块，对 `cli.cjs --version` 使用 `SANITY_EXIT`。Chrome fixture 在实际调用时写 marker。由于 generated test installer 的 self version 是 `0.0.0-dev`，fixture 创建 `lifecycleSpan` 时将该唯一声明替换为 `2026.9.2-claude.2.1.258`，使状态校验测试使用真实 release 格式。

- [ ] **Step 2: 添加状态矩阵断言**

至少覆盖：

| Case | Env / prior | patch | Expected |
|---|---|---:|---|
| direct existing install | 无授权 + prior | 42 | nonzero，prior runtime/source/vendor/state 恢复 |
| updater existing install | 授权 + prior | 42 | 0，candidate clean runtime/source/vendor 提交，valid state 写入，Chrome 未运行 |
| first install | 授权 + 无 prior runtime | 42 | nonzero，不创建 launcher-ready fallback |
| no-upgrade | 授权 + prior + `--no-upgrade` | 42 | nonzero，patch argv 无 allow flag，prior 恢复 |
| fatal patcher | 授权 + prior | 41 | nonzero，prior 全恢复 |
| full patch | 授权 + prior fallback | 0 | 0，fallback state 清除，Chrome 正常适用 |
| fallback + sanity fail | 授权 + prior | 42 + 37 | nonzero，checked vendor 与 runtime/source/state 回滚 |
| fallback + vendor conflict | 授权 + prior | 42 + conflict | nonzero，维持既有 recovery evidence 语义 |

- [ ] **Step 3: 运行测试确认 fallback case 当前失败**

Run:

```bash
bun tests/patcher-install-no-upgrade-control-flow.mjs
```

Expected: FAIL；authorized status 42 当前直接中止并恢复 prior runtime。

- [ ] **Step 4: 把 fallback state 纳入 runtime transaction**

在 transaction 初始化保存：

```bash
RUNTIME_HAD_PATCH_FALLBACK=0
if [ -f "$CLAWGOD_DIR/patch-fallback.json" ]; then
  cp -p "$CLAWGOD_DIR/patch-fallback.json" "$RUNTIME_TRANSACTION_DIR/patch-fallback.json"
  RUNTIME_HAD_PATCH_FALLBACK=1
fi
```

rollback 中按 flag restore 或删除 live state。这样 full success 清除后若 vendor/sanity fatal，旧 fallback state 仍恢复。

- [ ] **Step 5: 构造 patcher argv 与结果状态机**

使用 bash array，不能拼接 shell 字符串：

```bash
patch_args=(--enhancements-file "$CLAWGOD_DIR/enhancements.json")
patch_fallback_authorized=0
if [ "${CLAWGOD_UPDATE_PATCH_FAIL_OPEN:-}" = "1" ] \
  && [ "$NO_UPGRADE" != "1" ] \
  && [ "$RUNTIME_HAD_TARGET" = "1" ]; then
  patch_args+=(--allow-compatibility-fallback)
  patch_fallback_authorized=1
fi
```

status 0 调 `patch-fallback.cjs clear`；status 42 且 authorized 调 `write "$CLAWGOD_DIR" "$NATIVE_BIN_LABEL" "$CLAWGOD_SELF_VERSION"` 并打印醒目 warning；其他状态保持 `Mandatory patching failed` 并 exit。

- [ ] **Step 6: 调整 Chrome、vendor、sanity、commit 顺序**

- fallback：跳过 `run_claude_code_chrome_fix`；
- full patch：在 transaction commit 前运行 Chrome helper，使其修改也受随后 sanity 验证；
- 抽出 `verify_runtime()`，封装现有 `cli.cjs --version`、错误文本输出和 Bun canary 指引；
- 修改 `commit_runtime_transaction()`：有 candidate vendor 时只调用一次 `vendor-transaction.mjs publish-checked ... "$BUN_BIN" "$CLAWGOD_DIR/cli.cjs"`；无 candidate vendor（`--no-upgrade`）时调用 `verify_runtime()`；验证成功后该函数立即清 transaction 和 EXIT trap；
- call site 只调用一次 `commit_runtime_transaction`，不得预先另调 `publish-checked`，也不得在 commit 成功前放置其他可失败操作；
- helper status 20/22 更新既有 rollback flags；21 保留 recovery evidence；runtime-check diagnostic 包含 Bun wrapper错误时继续显示现有 canary 指引。

- [ ] **Step 7: 运行 Unix targeted tests**

Run:

```bash
bun tests/patcher-install-no-upgrade-control-flow.mjs
bun tests/installer-bun-runtime.mjs
bash -n src/template/install.sh
```

Expected: PASS；所有 fallback/fatal 矩阵符合表格。

---

### Task 7: 实现 Windows PowerShell 5.1 对等 fallback（TDD）

**Files:**
- Modify: `src/template/install.ps1:409-468, 628-714, 803-860`
- Modify: `src/windows/lifecycle.ps1:1-38` only if an explicit parsed variable is required
- Modify/Test: `tests/installer-bun-runtime.mjs`
- Modify/Test: `tests/patcher-install-no-upgrade-control-flow.mjs` static parity section

**Interfaces:**
- 与 Unix 完全相同的授权三条件、patch exit `0/42/other`、state transaction 和 checked vendor semantics。
- PowerShell invocation 使用 argument array；不得构造 `Invoke-Expression` 或 shell command string。

- [ ] **Step 1: 添加 PowerShell static contract**

断言生成 installer 包含：

```powershell
$PatchFallbackAuthorized = ($env:CLAWGOD_UPDATE_PATCH_FAIL_OPEN -ceq '1') -and (-not $NoUpgrade) -and $RuntimeHadTarget
if ($PatchFallbackAuthorized) { $patchArgs += '--allow-compatibility-fallback' }
```

以及 strict `42` branch、`patch-fallback.cjs write|clear`、fallback Chrome skip、`publish-checked`、state rollback、uninstall cleanup。mutation tests 分别删除授权条件中的 `$RuntimeHadTarget` 和 `-not $NoUpgrade`，contract 必须失败。

- [ ] **Step 2: 添加可选 native `pwsh` lifecycle matrix**

沿用 `findPwsh()`；存在时运行从 generated installer 提取的 transaction/patch block，使用 fake Bun 与临时 `USERPROFILE` 覆盖 Task 6 的七类核心 case。不存在时只输出：

```text
PowerShell native patch fallback checks skipped: pwsh unavailable
```

Windows GitHub runner 上该测试不得 skip。

- [ ] **Step 3: 运行测试确认 Windows contract 未实现**

Run:

```bash
bun tests/installer-bun-runtime.mjs
bun tests/patcher-install-no-upgrade-control-flow.mjs
```

Expected: FAIL at PowerShell fallback static/native assertion。

- [ ] **Step 4: 对等修改 PowerShell transaction**

新增 `$RuntimeHadPatchFallback` 并在 rollback finally 恢复/删除 state。构造：

```powershell
$patchArgs = @('--enhancements-file', (Join-Path $ClawDir 'enhancements.json'))
$PatchFallbackAuthorized = ($env:CLAWGOD_UPDATE_PATCH_FAIL_OPEN -ceq '1') -and (-not $NoUpgrade) -and $RuntimeHadTarget
if ($PatchFallbackAuthorized) { $patchArgs += '--allow-compatibility-fallback' }
$patchOutput = & $BunBin (Join-Path $ClawDir 'patch.mjs') @patchArgs 2>&1
```

status 42 只在 `$PatchFallbackAuthorized` 时继续；写/清状态失败进入现有 try/finally rollback。fallback 不调用 `Invoke-ChromePostInstallFix`。

- [ ] **Step 5: 使用 `publish-checked` 完成 sanity-before-commit**

PowerShell 通过：

```powershell
& $BunBin (Join-Path $ClawDir 'vendor-transaction.mjs') publish-checked `
  $RuntimeVendorDir $RuntimeCandidateVendor $RuntimeRollbackDir $BunBin (Join-Path $ClawDir 'cli.cjs')
```

传播 20/21/22 到现有 rollback flags。无 candidate vendor 才走 direct sanity。success 后设置 `$RuntimeTransactionCommitted = $true` 并清 transaction；不要在此之前清 recovery data。

- [ ] **Step 6: 运行跨平台 contracts**

Run:

```bash
bun tests/installer-bun-runtime.mjs
bun tests/patcher-install-no-upgrade-control-flow.mjs
bun build.mjs
bun build.mjs --check
```

Expected: PASS；`dist/win/install.ps1` 首 9 bytes 为 `#Requires`、无 byte > `0x7f`、无 BOM。

---

### Task 8: 更新文档、clean E2E 契约并完成全量验证

**Files:**
- Modify: `README.md:316-330`
- Modify: `README_EN.md:316-330`
- Modify: `README_JP.md:316-330`
- Modify: `CLAUDE.md` update/runtime sections
- Modify: `tests/installer-e2e.mjs` cleanup/runtime assertions
- Modify: `.github/workflows/compat-daily.yml` clean-state assertions
- Generated: `dist/unix/install.sh`、`dist/win/install.ps1`

**Interfaces:**
- Public behavior: `claude update` 若完整 patch 成功则无 warning；若仅 compatibility failure 则命令返回 0、版本升级、普通启动显示 fallback warning；fatal failure 返回非零并保留 prior runtime。

- [ ] **Step 1: 更新三语 README 与 CLAUDE.md**

中文更新段明确写：

```text
`claude update` 由 wrapper 直接交给 ClawGod updater，不再依赖上游 bundle 的 update action 形状。若新版只有 mandatory bundle recognizer 兼容性漂移，更新会提交 clean post-processed Claude Code runtime，并显示 fallback warning；下载、提取、vendor 发布或 Bun load 失败仍回滚。直接运行 installer、首次安装和 `--no-upgrade` 不启用该降级。
```

英文、日文表达相同语义，不声称部分增强仍工作。

- [ ] **Step 2: 保持联网 clean E2E 严格**

`tests/installer-e2e.mjs` 在 initial/no-upgrade clean path 断言：

```js
assert.equal(existsSync(join(tempHome, '.clawgod', 'patch-fallback.json')), false);
assert.equal(existsSync(join(tempHome, '.clawgod', 'self-update.cjs')), true);
assert.equal(existsSync(join(tempHome, '.clawgod', 'patch-fallback.cjs')), true);
```

uninstall 后三个文件都不存在。Compat Daily 的 `Assert-PatchSummary` 和 Unix grep 继续只接受唯一 `0 failed`；另加 clean install 不存在 `patch-fallback.json` 的断言，不接受 status 42 作为兼容 smoke 成功。

- [ ] **Step 3: 重建 generated installers**

Run:

```bash
bun build.mjs
bun build.mjs --check
bash -n dist/unix/install.sh
git diff --check
```

Expected: 全部 status 0；只由 canonical sources 推导出的两个 dist 文件变化。

- [ ] **Step 4: 运行所有离线测试**

Run:

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done
```

Expected: 全部 PASS；无 `*.test.*` 框架依赖；若本机无 pwsh，唯一允许的 skip 是明确的 PowerShell native skip 行。

- [ ] **Step 5: 运行联网隔离 E2E（不会修改真实 `~/.clawgod`）**

Run:

```bash
CLAWGOD_E2E=1 bun tests/installer-e2e.mjs
```

Expected: latest Claude Code（当前 2.1.258）initial 与 no-upgrade summary 都唯一且 `0 failed`，wrapper version 等于 `.source-version`，clean state 无 `patch-fallback.json`，uninstall cleanup 完整。

- [ ] **Step 6: 审查最终 diff 和生成一致性**

Run:

```bash
git status --short
git diff --stat
git diff --check
bun build.mjs --check
```

检查没有手改 dist、没有遗留旧 bundle update descriptor、没有把 `42` 当作任意 fatal 的通用成功码。

---

### Task 9: 修复本机失败的 2.1.258 更新并验证真实命令

**Files:**
- Runtime only: `~/.clawgod/**`、当前 ClawGod launcher（不改仓库源文件）

**Interfaces:**
- Consumes: Task 1–8 已验证的 generated Unix installer。
- Produces: 本机 active `.source-version` 与 `claude --version` 均为 `2.1.258`，完整 patch 路径无 fallback state。

- [ ] **Step 1: 记录安装前状态**

Run:

```bash
claude --version
printf 'source=' && tr -d '\n' < "$HOME/.clawgod/.source-version" && printf '\n'
test ! -e "$HOME/.clawgod/patch-fallback.json"
```

Expected before repair: active/source 为 2.1.252（或用户当时的 prior runtime），不存在 fallback state。

- [ ] **Step 2: 用已验证的本地 generated installer 安装 2.1.258**

Run:

```bash
bash dist/unix/install.sh --version 2.1.258
```

这是有意修改真实 `~/.clawgod` 和 launcher 的步骤；只在前述测试全部通过后执行。Expected: patch summary 唯一且 `0 failed`，Bun sanity 成功，launcher replacement 完成。

- [ ] **Step 3: 验证本机 active runtime**

Run:

```bash
claude --version
printf 'source=' && tr -d '\n' < "$HOME/.clawgod/.source-version" && printf '\n'
test ! -e "$HOME/.clawgod/patch-fallback.json"
bun "$HOME/.clawgod/patch.mjs" --verify --enhancements-file "$HOME/.clawgod/enhancements.json"
```

Expected: `claude --version` 与 source 都是 `2.1.258`；无 fallback warning/state；verify summary 为 `0 failed`（已应用项由 marker/sentinel 识别）。

- [ ] **Step 4: 报告结果，不自动提交或推送**

报告：根因、2.1.258 recognizer 结果、fail-open/fatal 矩阵、离线/联网/本机验证状态，以及本机是否有 pwsh native 覆盖。除非用户另行要求，不执行 `git commit`、tag、push 或发布。
