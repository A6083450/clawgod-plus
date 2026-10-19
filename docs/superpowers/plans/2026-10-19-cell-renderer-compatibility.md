# 稳定更新与渲染器兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 普通升级仅使用安装器已验证的 Claude Code 版本，并减少变量改名、分块改名及无关声明变化造成的渲染器误拒绝。

**Architecture:** 保留现有公开 Bun 渲染器与旧版本识别路径。在共享后处理器中增加局部结构契约识别，验证相关绑定、依赖及调用者；不绕过真实 ABI 漂移。默认版本由安装器提供，显式版本仍受原有完整兼容验证约束。

**Tech Stack:** Bun、现有内嵌 Acorn、Bash、PowerShell；无新依赖。

**Spec:** 本会话已批准的两层方案（用户：可以，你来决定吧）。由当前会话实现并验证，不自动提交、推送、发布或替换本机安装。

## Global Constraints

- 复用公开 Bun 字符格渲染器，不引入另一套 Bun.ant shim。
- 未知 ABI、歧义、未知原生调用者继续拒绝；失败不能修改已有运行时和用户配置。
- dist 只能由 `bun build.mjs` 生成。
- 当前已验证默认版本保持 2.1.302；2.1.303 只有完成相应验证才能宣称支持，不能用跳过检查冒充兼容。
- 下载和提取在隔离临时目录，脚本从仓库运行，不加载用户凭据。

## Review Focus

- 显式版本/latest 与无参更新分离，旧 update 入口传入 latest 的迁移不能继续追随未验证上游。
- 已安装较高版本时不得因普通重装默默降级。
- 绑定改名、路径改名和无关声明变化可以通过；布局常量、参数、依赖语义变化必须拒绝。
- 共享工厂的新调用者、导入别名和导出映射不能绕过校验。
- 真交互渲染与 --version 不等价；本地 macOS 通过不能宣称 Windows/Linux 原生通过。

## Task 1：局部渲染契约

**Files:** `src/generic/runtime/post-processor.mjs`、`tests/runtime-cell-structure.mjs`、必要的新契约测试与真实夹具。
**Interfaces:** 保持 `adaptCellRenderer(source, shape, dependencies = new Map())` 返回源码或 null；安装候选按原有全验证后写入。

- [x] 提取 2.1.303，比较真实声明与 2.1.302；先添加改名/无关改动通过和 ABI 漂移拒绝的失败测试。
- [x] 使用已有 AST 工具构建局部结构契约并解析真实绑定；保留相关依赖、导入导出及原生调用者校验。
- [x] 运行 `bun tests/runtime-cell-structure.mjs`、`bun tests/runtime-cell-segmenter.mjs` 和新增测试；原始/改名模块图均验证。
- [x] 在隔离候选上运行完整后处理；若 303 真实 ABI 不符则保留拒绝并准确报告，不补盲目白名单。

## Task 2：已验证版本默认值

**Files:** 现有构建器、双平台生命周期、共享自更新入口及其对应测试（探索后以实际共享边界为准）。
**Interfaces:** 无参 update 选择随安装器发布的已验证版本；显式 `--version` / `CLAWGOD_VERSION` 保留指定语义；现有安装无参重装不降级。

- [x] 在现有版本选择测试中增加默认已验证、显式版本、显式 latest、旧入口迁移和高版本保留断言，先确认失败。
- [x] 加一个版本来源并接入双平台，不增加远程 manifest 请求或多余用户开关。
- [x] 保留 trustedLocal 显式版本零 fetch 和无参更新刷新安装器的契约；运行对应测试。

## Task 3：生成、说明和验证

**Files:** `README.md`、`README_EN.md`、`README_JP.md`、`dist/unix/install.sh`、`dist/win/install.ps1`，必要的 CI 契约。

- [x] 说明默认升级已验证版本和显式尝试新版本的边界，CI 保留对 npm latest 的显式前瞻兼容检查。
- [x] `bun build.mjs`、`bun build.mjs --check`、`bash -n dist/unix/install.sh`、`git diff --check`。
- [x] 运行完整本地回归并记录失败；独立审查改动与相连代码，修复确认的问题。
- [x] 报告代码、测试、本机安装和远端发布四种状态，不擅自提交/发布/安装。
