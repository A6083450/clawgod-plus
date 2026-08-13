# Claude Code Fast Messages Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当 Claude Code 的 `/fast` 已启用时，让其发往 Anthropic Messages `/v1/messages` 的请求成对携带 `speed: "fast"` 与 `anthropic-beta: fast-mode-2026-02-01`。

**Architecture:** 在两份安装器嵌入的 `patch.mjs` 中增加同一份、可验证且幂等的 Fast Messages patch。该 patch 以官方 bundle 已有的 Fast 状态为条件，在其 Messages 请求构造与 header 合并路径增加 Fast capability；OpenAI 转换代理不参与此功能。

**Tech Stack:** POSIX shell、PowerShell、Bun、JavaScript、Node `assert/strict` 测试。

## Global Constraints

- 仅在 Claude Code Fast mode 启用时注入 `speed: "fast"` 和 `fast-mode-2026-02-01`。
- 两个信号必须成对注入；关闭时两者都不得存在。
- `anthropic-beta` 必须保留现有 capability，在一个逗号分隔 header 中去重合并 Fast capability。
- 不修改 `openai-proxy.cjs`、OpenAI `/chat/completions` payload、`service_tier` 或 `provider.json` schema。
- `install.sh` 与 `install.ps1` 生成的 `patch.mjs` 必须保持字节级等价（除 installer 包装外）。
- 对目标形状不匹配必须在 patch summary 中可见；不得在未验证的结构上默认注入 Fast capability。
- **用户确认的强制透传策略：** 对经严格验证的真实 Messages 闭包，只要 body 已由 Claude Code 写入 `speed: "fast"`，就必须把 `fast-mode-2026-02-01` 加入同一请求的 `anthropic-beta`；不受 bundle 中独立 beta 资格表达式（2.1.229 中为 `ae`）限制。

---

## 文件结构

- `install.sh`：Unix 安装器中的 `patch.mjs` heredoc；包含 Fast patch 与其汇总输出。
- `install.ps1`：Windows 安装器中的同一 `patch.mjs` here-string；与 Unix patcher 逻辑相同。
- `tests/patcher-2.1.215.mjs`：从两份安装器抽取 patcher，使用精简 fixture 验证匹配、注入与幂等性。
- `tests/installer-bun-runtime.mjs`：断言两份安装器所生成的 patcher 具备相同的 Fast capability 合并契约。
- `README.md`：面向用户说明 Fast mode 的 `speed` 与 beta header 透传，以及 provider 支持边界。

### Task 1: 建立真实 bundle 目标形状与失败测试

**Files:**
- Modify: `tests/patcher-2.1.215.mjs`
- Inspect: `install.sh:2293-3542`
- Inspect: `install.ps1:2323-3371`

**Interfaces:**
- Consumes: 两个 installer 中提取的 `patch.mjs`。
- Produces: 一个最小 Fast fixture，它包含同一 Fast 状态分别为 `true` 和 `false` 时的 Messages body 与 `anthropic-beta` header 构造形状；测试断言目标 patch 的输出协议。

- [ ] **Step 1: 从当前官方 Claude Code package 提取未修改 `cli.original.cjs` 并定位 Fast 代码路径**

运行当前 installer 的下载/提取辅助流程，但不要执行完整 `bash install.sh`，避免替换本机 `claude`。在解压后的 bundle 中搜索以下稳定字符串：

```bash
rg -n -C 8 'fast-mode-2026-02-01|speed.{0,24}fast|Fast mode|fastMode|anthropic-beta|/v1/messages' /path/to/cli.original.cjs
```

记录同一个请求构造闭包中三项的精确 minified 形状：Fast 状态表达式、body object/`Object.assign` 构造、headers object/`anthropic-beta` 合并。只有三者属于同一请求路径才可作为目标形状。

- [ ] **Step 2: 写入先失败的 Fast fixture 测试**

在 `tests/patcher-2.1.215.mjs` 中的现有 `fixture` 后增加独立 `fastFixture`，只保留上一步确认的真实句法骨架，并以可读的函数名包装可观察输出。fixture 必须覆盖：

```js
function buildRequest(fast, existingBeta) {
  const body = { model: 'claude-opus-5', messages: [] };
  const headers = { 'anthropic-beta': existingBeta };
  // 此处使用步骤 1 中确认的原 bundle 句法骨架，不能创造新的应用层 API。
  return { body, headers };
}
```

在每个 installer patcher 测试循环内，单独执行该 fixture，并断言当前未实现时 Fast 分支不包含 `speed` 与 beta capability：

```js
assert.doesNotMatch(patched, /__clawgod_fast_messages_protocol__/);
```

把这个断言临时放在独立失败测试中，预期现有 patcher 不会创建 marker。

- [ ] **Step 3: 运行测试并确认失败**

运行：

```bash
bun tests/patcher-2.1.215.mjs
```

预期：两个 installer 变体均因找不到 `__clawgod_fast_messages_protocol__` 失败；已有 Ultrareview、Computer Use 和幂等性断言仍未报出无关错误。

- [ ] **Step 4: 调整 fixture 为最小、可执行且版本绑定的真实形状**

移除任何不在步骤 1 原始 bundle 中出现的包装分支。fixture 只保留 patch 所需的 request-building token 序列、`fast` true/false 两次调用以及输出断言。将已确认的 upstream package version 写入测试错误消息，例如：

```js
const FAST_FIXTURE_VERSION = '从步骤 1 得到的 package version';
```

- [ ] **Step 5: 提交失败测试基线**

```bash
git add tests/patcher-2.1.215.mjs
git commit -m "test: cover fast messages protocol patch"
```

### Task 2: 实现 Fast Messages patch 并同步双安装器

**Files:**
- Modify: `install.sh:2293-3542`
- Modify: `install.ps1:2323-3371`
- Test: `tests/patcher-2.1.215.mjs`

**Interfaces:**
- Consumes: Task 1 已冻结的真实 bundle 目标形状与 `fastFixture`。
- Produces: `applyFastMessagesProtocolPatch(source, { dryRun, verify })`，返回现有 patcher 约定的 `{ status, detail|count|code }`，并写入 marker `/*__clawgod_fast_messages_protocol__*/`。

- [ ] **Step 1: 在 Unix patcher 中编写最小实现**

在 `applyContextLimitPatch` 后、`const patches = [` 前定义：

```js
async function applyFastMessagesProtocolPatch(source, { dryRun, verify }) {
  const MARKER = '/*__clawgod_fast_messages_protocol__*/';
  if (source.includes(MARKER)) return { status: 'already', detail: 'already applied' };
  // 使用 Task 1 确认的、同一请求闭包中的精确目标形状。
  // replacement 必须：fast 为真时向 body 增加 speed:'fast'；
  // 同时把 fast-mode-2026-02-01 合并进现有 anthropic-beta（逗号分隔且去重）。
  // fast 为假时保持原 body 与 header。
}
```

实现时必须将 capability 合并为等价于以下逻辑的内联表达式，并保留原 header 值：

```js
const capabilities = String(existingBeta || '').split(',').map(x => x.trim()).filter(Boolean);
if (!capabilities.includes('fast-mode-2026-02-01')) capabilities.push('fast-mode-2026-02-01');
headers['anthropic-beta'] = capabilities.join(',');
```

replacement 的所有新局部变量必须使用唯一、bundle-safe 名称，且 marker 位于 replacement 内。匹配数不是恰好一个、找不到目标、或找到与 Fast 状态无关的 body/header 形状时都返回 `failed`，并给出可操作 detail。`verify` 只报告匹配数，不写入 code；`dryRun` 不写入 source。

- [ ] **Step 2: 将 Unix 实现逐字同步到 Windows patcher**

复制同一 JavaScript 函数到 `install.ps1` 的 `$patcherCode` here-string 对应位置。除了 PowerShell here-string 边界外，函数内容和 marker 必须相同。

- [ ] **Step 3: 接入 patcher 汇总与失败门控**

在两份 patcher 的 `contextLimitPatch` 汇总块后、Chrome patch 汇总块前，调用：

```js
const fastMessagesProtocolPatch = await applyFastMessagesProtocolPatch(code, { dryRun, verify });
```

按现有 `applied`、`verify`、`already`、`skipped`、`failed` 五种 status 处理。输出名固定为 `Fast Messages protocol`；`failed` 分支必须执行 `failed++`，使安装器现有非零退出门控生效。

- [ ] **Step 4: 完成断言并运行 Fast fixture 测试**

用在 Task 1 中冻结的执行路径，针对每个提取 patcher 断言：

```js
assert.match(patched, /__clawgod_fast_messages_protocol__/);
assert.match(patched, /speed:"fast"|speed:'fast'/);
assert.match(patched, /fast-mode-2026-02-01/);
```

执行 patched fixture，并作以下严格断言：

```js
assert.equal(fast.body.speed, 'fast');
assert.equal(fast.headers['anthropic-beta'], 'existing-beta,fast-mode-2026-02-01');
assert.equal(slow.body.speed, undefined);
assert.equal(slow.headers['anthropic-beta'], 'existing-beta');
```

再使用 `existing-beta,fast-mode-2026-02-01` 输入断言 header 中 Fast capability 只出现一次。

- [ ] **Step 5: 运行 patcher 回归测试**

运行：

```bash
bun tests/patcher-2.1.215.mjs
```

预期：退出码为 0，且输出匹配 `Result: <n> applied, <n> skipped, 0 failed`；第二次 `--dry-run` 仍以 0 退出。

- [ ] **Step 6: 提交 Fast patch**

```bash
git add install.sh install.ps1 tests/patcher-2.1.215.mjs
git commit -m "feat: forward fast messages protocol"
```

### Task 3: 验证安装器模板等价性与文档

**Files:**
- Modify: `tests/installer-bun-runtime.mjs:878-925`
- Modify: `README.md`
- Inspect: `AGENTS.md:1-15`

**Interfaces:**
- Consumes: Task 2 生成的 Unix/Windows `patch.mjs` 模板和 marker。
- Produces: 安装器契约断言及用户可见的 Fast mode 协议说明。

- [ ] **Step 1: 写入先失败的模板契约断言**

在 `tests/installer-bun-runtime.mjs` 的 `unixTemplates`、`windowsTemplates` 构造后添加：

```js
for (const [name, patcher] of [
  ['install.sh', unixTemplates['patch.mjs']],
  ['install.ps1', windowsTemplates['patch.mjs']],
]) {
  assert.match(patcher, /applyFastMessagesProtocolPatch/, `${name} must embed the Fast Messages patch`);
  assert.match(patcher, /__clawgod_fast_messages_protocol__/, `${name} must mark the Fast Messages patch`);
  assert.match(patcher, /fast-mode-2026-02-01/, `${name} must include the Fast beta capability`);
  assert.match(patcher, /speed[\s:]+["']fast["']/, `${name} must include the Fast body field`);
}
```

在 Task 2 未完成时运行会失败；完成后作为双模板持续契约。

- [ ] **Step 2: 运行模板测试并确认通过**

运行：

```bash
bun tests/installer-bun-runtime.mjs
```

预期：退出码为 0；现有 Bun runtime、PowerShell 模板与 patch failure gate 检查全部通过。

- [ ] **Step 3: 在 README 增加用户说明**

在 provider/运行行为相关章节添加以下内容（按相邻中文文档样式调整标题层级）：

```markdown
### Fast mode 请求兼容

当在 Claude Code 中通过 `/fast` 开启 Fast mode 时，ClawGod 会保留该模式对应的 Anthropic Messages 协议：请求体含 `"speed": "fast"`，`anthropic-beta` 含 `fast-mode-2026-02-01`。已有 beta capability 会被保留并合并。该能力是否可用由当前 API provider 与模型决定；若 provider 不支持 Fast mode，请关闭 `/fast` 后重试。

此行为仅适用于 Anthropic Messages `/v1/messages` 请求；不会改写 OpenAI Chat Completions 请求或添加 `service_tier`。
```

- [ ] **Step 4: 运行完整静态验证**

运行：

```bash
bun tests/patcher-2.1.215.mjs
bun tests/installer-bun-runtime.mjs
git diff --check
```

预期：三条命令均以退出码 0 完成；不得运行 `bash install.sh`，因为它会修改 `~/.clawgod` 与本机 `claude` launcher。

- [ ] **Step 5: 提交契约测试与文档**

```bash
git add tests/installer-bun-runtime.mjs README.md
git commit -m "docs: describe fast mode messages protocol"
```

### Task 4: 复核目标 bundle 与最终验证

**Files:**
- Inspect: `install.sh`
- Inspect: `install.ps1`
- Inspect: `tests/patcher-2.1.215.mjs`
- Inspect: `tests/installer-bun-runtime.mjs`

**Interfaces:**
- Consumes: Tasks 1-3 的所有变更。
- Produces: 有证据的完成结论或明确的上游 bundle 不匹配报告。

- [ ] **Step 1: 对目标官方 bundle 执行生成后的 patcher**

在隔离临时目录中放入步骤 1 下载的真实 `cli.original.cjs` 与从 `install.sh` 提取的 `patch.mjs`，运行：

```bash
bun patch.mjs
bun patch.mjs --dry-run
```

预期：首次输出 `Fast Messages protocol` 为 applied；第二次为 already 或 no change needed；两次都以 `0 failed` 结束。

- [ ] **Step 2: 比对 Unix 与 Windows 生成 patcher 的 Fast 函数**

从两份 installer 提取 `patch.mjs`，提取 `applyFastMessagesProtocolPatch` 起至下一个函数/`const patches` 前的文本，并比较：

```bash
diff -u unix-fast-function.js windows-fast-function.js
```

预期：无差异。若存在差异，只允许 installer heredoc 转义所必需的差异；JavaScript 语义差异必须修复。

- [ ] **Step 3: 运行全部要求的验证并记录结果**

运行：

```bash
bun tests/patcher-2.1.215.mjs
bun tests/installer-bun-runtime.mjs
git diff --check
git status --short
```

预期：前两项及 diff 检查成功；工作区除计划执行产生且尚未提交的预期文件外无意外改动。

- [ ] **Step 4: 提交最终验证修正（若步骤 1-3 产生代码或测试修正）**

```bash
git add install.sh install.ps1 tests/patcher-2.1.215.mjs tests/installer-bun-runtime.mjs README.md
git commit -m "test: verify fast messages patch"
```

若步骤 1-3 未产生文件改动，不创建空提交。
