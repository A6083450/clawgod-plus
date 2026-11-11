# 活跃进程下原地升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 活跃 Claude 进程不再阻止升级，成功后复用现有事务清理旧版本。
**Architecture:** acquireRuntime 增加默认关闭的 allowActive 参数；安装器通过内部 lock-update 命令启用，重补丁直接传参。保留默认严格维护策略供卸载使用，不修改事务结构。
**Tech Stack:** Bun、CommonJS、Bash、PowerShell；无新依赖。
**Spec:** docs/superpowers/specs/2026-11-03-active-runtime-update-design.md

## Global Constraints

- 不终止用户进程，不运行本机安装，不提交、推送或发布。
- 只改 src 后重生成 dist，不手改生成安装器。
- 保留并发写锁、维护期启动限制、失败回滚及用户配置边界。

## Review Focus

- 警告必须写 stderr，stdout 仍仅输出 UUID，避免破坏安装器 token 解析。
- 允许活跃进程也不得允许第二个升级或维护期间新启动。
- 卸载仍须拒绝已登记或旧版未登记的进程。
- 失败事务保留恢复证据；成功清理事务而非删除当前版本 clean-source。
- Windows 调用也必须启用策略，不能仅改 Unix。

### Task 1: 放行升级并保持维护保护

**Files:** src/generic/runtime/runtime-state.cjs、src/generic/runtime/repatcher.mjs、src/template/install.sh、src/template/install.ps1、tests/runtime-session-guard.mjs、tests/installer-runtime-lock.mjs、tests/installer-windows-patch-fallback.mjs、README.md、dist/unix/install.sh、dist/win/install.ps1。

**Interfaces:** acquireRuntime(root, ownerPid = process.pid, allowActive = false) 返回 token；内部 CLI lock-update 显式允许活跃进程，lock 保持严格拒绝。

- [x] 先修改隔离子进程测试：允许活跃读者，stderr 风险提示、stdout UUID，保留互斥和卸载拒绝；安装预检 install/no-upgrade 可到下一阶段，uninstall 不可。
- [x] 运行上述测试确认因现有活跃进程拒绝而失败。
- [x] 在共享 helper 实现允许分支，并接入两平台安装和重补丁入口；同步 README，保留既有清理及回滚路径。
- [x] 运行会话守卫、安装预检、重补丁、Windows 回滚相关回归；四项红绿验证通过，Unix 回滚与自更新进入完整套件。
- [x] bun build.mjs；bun build.mjs --check；bash -n dist/unix/install.sh；git diff --check；完整本地 tests/*.mjs 回归，明确记录跳过项。

## 验证记录

- 当前工作分支：`fix/allow-active-runtime-update`；未提交或发布，保留原有 `generated-images/`。
- `runtime-session-guard`、`installer-runtime-lock`、`patcher-repatch-enhancement-selection`、`installer-windows-patch-fallback` 均先复现失败，再通过。
- 已在 macOS 的 `pwsh` 执行 Windows 安装事务测试；不等同于 Windows 系统原生验证。
- `bun build.mjs`、`bun build.mjs --check`、`bash -n dist/unix/install.sh`、`git diff --check` 通过。
- 完整套件 72 个脚本全部退出 0；联网 `installer-e2e.mjs` 因未设置 `CLAWGOD_E2E=1` 按条件跳过，其他日志无环境跳过标记。日志：`/tmp/clawgod-active-update-tests.DZYsQ9`。
- 独立审查发现 Windows `Remove-Item -ErrorAction SilentlyContinue` 可能静默保留本次事务。新增成功/回滚两种删除失败注入用例，观察红灯后补清理结果检查及明确警告，专项绿灯。
- Ruling: 被 Windows 占用或权限阻止的文件不能保证立即删除；保留已验证的新版/恢复结果并提示退出后检查清理，不杀进程、不扩大历史事务删除范围。代价：残留需人工处理，后续自动稳定版重试会保守拒绝。
- Windows 模板强制 ASCII，新增提示改用英文以保持现有 Windows PowerShell 编码契约；已重生成 dist 并通过双平台语法和构建一致性检查。
- 原生 Windows DLL 映射场景未实测；本机 `pwsh` 使用删除失败注入验证提示与安全边界。修复后完整回归 72 个脚本全部退出 0，零失败；联网安装 E2E 按配置跳过。最终日志：`/tmp/clawgod-active-update-final.OOoIFA`。未运行本机安装。
