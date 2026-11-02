# Claude Desktop 4.4212.0 汉化适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 4.4212.0 版本的前提下恢复简体中文选项，不绕过新版浏览器或 CU 权限。

**Architecture:** 复用现有语言模块的词表与变换，新增仅接收归档条目的纯变换接口。现有 shell/Python 负责归档验证、候选应用、plist 完整性和签名；新版不修改主 app.asar。旧散装接口和测试保留。

**Tech Stack:** Bun、Python 3 标准库、macOS codesign、ASAR。

**Spec:** `/Users/liangjiaquan/.claude/plans/woolly-singing-clock.md`（用户已批准）。

## Global Constraints

- 目标为 4.4212.0；不改账号、组织限制、CU 安全设置、系统及 per-app 授权。
- 不运行全套 CLI 安装器；不提交或推送；保留 generated-images/。
- 先独立候选静态验证，当前官方应用不动；替换和重启另行提示确认。
- 只改 ion-dist.asar 和对应 plist 完整性、签名；主 app.asar 原字节保留。
- 译文缺失或格式不兼容时保留新版英文；语言偏好不强制修改。

## Review Focus

- 列表只补菜单而未补冷启动：测试两处都包含中文。
- 缺 dynamic 或坏 ICU 译文：测试加载资源齐备，缺译回退英文。
- 损坏归档、重复候选或 symlink：写入前拒绝，原应用不变。
- 签名或发布中途失败：候选不发布，官方完整备份保留。
- 漏判应用进程或版本漂移：运行中拒绝、未知参数与不支持版本拒绝。

### Task 1: 新版语言资源纯变换

**Files:** `src/unix/desktop/desktop-language.mjs`、`tests/desktop-language.mjs`

**Interfaces:** 保留 install/restore 导出；新增 `patchPackedDesktopChinese(entries, catalogs)`，输入归档相关路径到 UTF-8 文本的对象，输出变更条目对象及覆盖统计；CLI `packed` 通过 stdin/stdout JSON 调用。

- [ ] 新增两处语言列表、英文 base/dynamic、HTML 注册 fixture；断言新增中文、缺译回退、原资源不修改、两次调用幂等、坏结构拒绝。
- [ ] 运行 `bun tests/desktop-language.mjs`，先确认新增用例失败。
- [ ] 实现纯变换，复用 catalog 校验与内嵌词表，不新增归档解析器。
- [ ] 再运行测试，检查旧散装场景仍全部通过。

### Task 2: 新版候选归档与安装安全门禁

**Files:** `src/unix/desktop/restore-claude-3p-cu-browser.sh`、`tests/desktop-3p-cu-browser.mjs`、`tests/installer-desktop.mjs`

**Interfaces:** 保留 --install/--restore，增加新版分支；新分支先准备完整候选，成功后才允许替换；新版资源 restore 与官方全包回滚有明确区别。

- [ ] 新增新版 ASAR 小 fixture、双 plist entry、命令 stub。断言主包不变、语言包哈希正确、ownership 和失败无发布。
- [ ] 运行相关测试，确认未适配时失败。
- [ ] 在已有 Python ASAR 代码中增加新版分支，调用 Task 1 变换；校验输入 offset/hash/block/path，保留未改条目。
- [ ] shell 做严格参数和完整进程检查；候选失败不改目标，保存完整回滚副本；正常退出超时中止，不强杀。
- [ ] 运行上述两项测试及语言测试；负向场景不能调用真实 macOS 变更命令。

### Task 3: 生成产物与实包验收

**Files:** `README.md`、必要的 `AGENTS.md`、生成的 `dist/unix/install.sh`

- [ ] 文档注明 4.x 语言布局、英文回退、浏览器原生支持及 CU 未强开、失去官方签名和手动更新。
- [ ] `bun build.mjs`、`bun build.mjs --check`、全部 `tests/*.mjs`、`bash -n dist/unix/install.sh`、`git diff --check`；报告跳过或失败。
- [ ] 在新空目录解压已有官方 ZIP；脚本放外部，Python -I；在候选上运行适配并静态校验两个归档及 codesign，不打开共享 profile。
- [ ] 展示实际验证结果和回滚路径，用户确认退出后才替换；实际运行版本、中文选择和真实工具会话另验，不用静态结果冒充 GUI 成功。
