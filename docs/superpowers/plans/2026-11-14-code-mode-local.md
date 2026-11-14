# Code Mode 本地启用实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Code Mode 无需官方登录或资格联网即可显式启用，模型继续使用现有 Provider。

**Architecture:** 复用官方 REPL 和 opt-in 状态机，在独立 code-mode 增强中局部替换资格函数；用既有 Acorn 与结构契约识别函数、按模块边界修改，不全局改变 Provider 或 standalone。所有安全兼容检查和用户确认保持原样。

**Tech Stack:** Bun、JavaScript ESM、Acorn、现有 custom patch/manifest 管线。

## Global Constraints

- 目标官方版本 2.1.325；2.1.322 的不同早期 opt-in 不在支持范围，可信版本头低于 2.1.323 时跳过。
- 模式本身不调用官方 flags/settings/policy 初始化；模型 API 不属于离线范围。
- 保留管理员明确禁用、工具权限、VM hardening、引擎自检、mods 和首次确认。
- 不增加依赖，不覆盖上一轮升级修复，不自动安装、git commit、push 或发布。

---

### Task 1: Code Mode 局部资格补丁及真实模块行为测试

**Files:**
- Create: `src/generic/patcher/enhancements/code-mode.mjs`
- Create: `tests/fixtures/code-mode-2.1.325.js`
- Create: `tests/patcher-code-mode.mjs`

**Interfaces:**
- Consumes: `parsePatchSource(source)`、`findNodes(node,predicate)`、custom patch `apply(source,{dryRun,verify})`。
- Produces: `codeModeRegistry={id:'code-mode',patches:[],customPatches:[{order:95,name,apply}]}`。

- [ ] 保存官方 opt-in chunk 原文为 fixture，以真实函数体做行为测试：导入函数通过可控依赖注入；网络依赖若调用立即抛错。
- [ ] 测试真实模块在第三方 Provider、无 feature payload/官方登录时不能启用，确认红灯。
- [ ] 用导出关系和函数体结构定位 opt-in roots，冻结与改名无关的局部契约，修改 runtime/provider/model/credential/flags 函数以及专属远端等待函数。
- [ ] 验证首次确认、同意持久化、重启/on；管理员禁止、权限限制、引擎失败、mods 不兼容保持拒绝。
- [ ] 验证改名、重复执行、dry-run/verify、结构漂移和歧义不写入。
- [ ] Run: `bun tests/patcher-code-mode.mjs`，全部通过后继续。

### Task 2: 增强注册、两端菜单和回归契约

**Files:**
- Modify: `src/generic/enhancements.json`
- Modify: `src/generic/patcher/registry.mjs`
- Modify: `src/generic/patcher/enhancements/agents.mjs`（Code Mode 显式请求时不隐式强开 Teams，保留原生显式 Teams）
- Modify: `src/unix/lifecycle.sh`
- Modify: `src/windows/lifecycle.ps1`
- Modify: `tests/patcher-registry.mjs`
- Modify: 受 manifest 数量/顺序影响的既有测试和 CI 断言。
- Modify: `README.md`

**Interfaces:**
- Consumes: `codeModeRegistry`，既有 manifest all/custom selection。
- Produces: all 模式启用 code-mode；custom 未选择保持上游源码不变。

- [ ] 在 manifest 的 auto-mode 邻近注册 `code-mode`，两端菜单加入 `Code Mode`。
- [ ] 接入 registry 独立 owner；同步精确 manifest/descriptor 契约，保留已有历史 descriptor 顺序。
- [ ] 测试 all/custom（包含/不包含 code-mode），并说明 `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1` 用法、首次确认与模型请求边界。
- [ ] Run: `bun tests/patcher-registry.mjs`、`bun tests/patcher-enhancement-selection.mjs`、`bun tests/installer-enhancement-selection.mjs`、`bun tests/runtime-feature-gates.mjs`。

### Task 3: 真实候选、模拟 Provider 与最终验收

**Files:**
- Regenerate: `dist/unix/install.sh`、`dist/win/install.ps1`（只经 `bun build.mjs`）。
- Create: `tests/code-mode-local.mjs`（若模拟 Provider 验证可以稳定纳入回归；否则隔离脚本与证据保存临时验收目录）。

**Interfaces:**
- Consumes: 当前 2.1.325 renderer/context 修复与 code-mode registry。
- Produces: 可重现的离线启用和 REPL 执行证据、完整测试结果。

- [ ] Run: `bun build.mjs && bun build.mjs --check && bash -n dist/unix/install.sh`。
- [ ] 隔离 HOME、禁用官方非必要联网，只向 localhost 模拟 Provider 发 Messages 请求，响应 REPL 调用并验证工具结果返回模型。
- [ ] 真实 TUI 中验证 opt-in caveat、同意重启和 Code Mode on；无 engine/private API/模块异常。
- [ ] 运行 `tests/*.mjs` 并保留每项结果，renderer 契约允许其已测约 422 秒耗时；运行 macOS 2.1.325 全增强隔离 installer E2E。
- [ ] 独立审查修改范围并修复阻塞项；给出已验证平台与未部署/未发布边界。

## 实际验收发现的必要补充

- Code Mode 专属 `team.prelude` 在 Bun 模块记录中编码为 UTF-16LE（byte48=2），原提取器保留字节而磁盘文本 loader 读 UTF-8，导致首次 REPL 初始化 NUL SyntaxError。已在 `src/generic/runtime/extractor.mjs` 按正式 encoding 元数据将 js/text 转 UTF-8，不猜编码、不改 VM；新增 `tests/extractor-text-encoding.mjs` 覆盖13项。
- 最终整批74脚本中73项通过，`installer-build.mjs` 的临时构建复制清单漏新补丁文件；补一行后独立复跑通过。
- 全部生产验证仅隔离目录，不自动部署或发布。
