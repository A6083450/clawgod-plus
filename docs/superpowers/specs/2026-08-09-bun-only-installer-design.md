# ClawGod Plus Bun-only 迁移设计

日期：2026-08-09

## 背景

ClawGod Plus 当前同时依赖 Node.js、npm 和 Bun：Node.js 执行提取、后处理、补丁与配置脚本，npm 下载 Anthropic 的平台包，Bun 运行最终生成的 `cli.cjs`。仓库还包含一个基于 npm、Vite 和 TypeScript 的静态站点。

Claude Code 2.1.226 的提取产物直接使用 `Bun.hash`、`Bun.spawn`、`Bun.stringWidth`、`Bun.listen` 等 Bun API。Node.js 虽能执行 `--version` 浅层路径，但交互启动会因缺失运行时依赖而失败，继续走 Node-only 将需要长期维护上游兼容层。因此统一到 Bun 比统一到 Node.js 更可靠。

## 目标

- 用户只需一个 JavaScript 运行时：Bun 1.3.14 或更高版本。
- 安装、卸载、升级、重补丁、辅助补丁、测试和最终 CLI 全部使用 Bun。
- 不再要求用户安装 Node.js 或 npm。
- 删除仓库中的静态站点及其构建链路。
- 保持 Unix 与 Windows 安装器行为对齐。
- 保持现有补丁、provider、claude-mem、Chrome、Computer Use、context-limit 和 launcher 行为。

## 非目标

- 不移除 ripgrep；Claude Code 的 Grep 功能仍依赖它。
- 不重写 Claude Code 上游的 Bun API。
- 不改变 provider 配置格式、feature flag 格式或安装目录。
- 不在本次迁移中发布版本、推送远端或创建 GitHub Release。
- 不要求 GitHub 托管的 JavaScript Actions 停止使用 runner 内置 Node；它不属于项目或用户前置依赖。

## 静态站点移除

删除以下跟踪内容：

- 整个 `web/` 目录，包括 Vite 配置、TypeScript、样式、package 文件和构建产物规则。
- 根目录生成的 `index.html`。

保留根目录 `bypass.png`，因为 `README.md`、`README_EN.md` 和 `README_JP.md` 都引用它。同步更新 `AGENTS.md`，移除站点命令、站点架构和 TypeScript 检查说明。

## Bun-only 架构

### 前置检查

`install.sh` 和 `install.ps1` 只检查 Bun 版本与 ripgrep。Bun 版本下限继续跟随 Anthropic 编译上游二进制所需的最低版本；当前为 1.3.14。缺少 Bun 时沿用现有自动安装或明确失败提示。

### 平台包下载

Unix 和 Windows 共用同一种逻辑语义：

1. 根据操作系统、架构和 libc 生成 `@anthropic-ai/claude-code-<platform>` 包名。
2. 用 Bun 请求 npm Registry 元数据并解析精确版本。
3. 下载 `dist.tarball`。
4. 用 Bun 兼容的 gzip 与 tar 处理代码解包到临时目录。
5. 校验平台二进制存在且大小合理，再进入提取阶段。

实现以 Windows 安装器已有的直接 Registry 下载器为基础，避免 `npm pack`。下载器必须限制重定向次数、检查 HTTP 状态、拒绝越界 tar 条目，并保证目标路径不能逃出临时目录。

### 生成脚本与运行时

所有生成的 `.mjs`、`.cjs` 和内联 JavaScript 改由 Bun 执行：

- `extract-natives.mjs`
- `post-process.mjs`
- `patch.mjs`
- `repatch.mjs`
- `claude-mem-compat.cjs`
- lean mode 设置修改脚本
- 安装后的 `cli.cjs`

可继续使用 `node:` 标准库导入，因为 Bun 原生兼容这些 API；运行命令、shebang、错误文本和文档不能再要求 Node.js。

### Acorn 加载

补丁器优先加载 `~/.clawgod/vendor/acorn.js`，不存在时由 Bun 下载固定版本并缓存。加载方式必须兼容 Bun 的 CommonJS/ESM 解析，不能依赖 Node 专属的 `createRequire` 行为。下载失败时保留现有正则回退，但安装结果仍必须准确报告未匹配的必选补丁。

### 独立辅助补丁

以下脚本统一使用 Bun 执行内嵌补丁器：

- `apply-claude-code-chrome-fix.sh` / `.ps1`
- `apply-claude-code-computer-use-fix.sh`
- `apply-claude-code-context-limit-patch/*.sh` / `*.ps1`

自动定位优先支持 `~/.clawgod/cli.original.cjs`。删除通过 `npm root -g` 搜索全局安装的逻辑；用户仍可通过显式路径处理其他 bundle。迁移后重建仓库中跟踪的辅助补丁 zip，并校验压缩包内容与对应源码一致，不能让源码与分发产物分叉。

## CI 与文档

- `compat-daily.yml` 删除项目级 Node setup、Node 版本输出和 npm cache，改为 Bun-only 安装、测试与 smoke 路径。
- 全部 `tests/*.mjs` 使用 Bun shebang，并由 Bun 运行。
- 删除 `.github/workflows/cache-cleanup-weekly.yml`；Bun-only 下载流程不再使用 npm cache。
- 三份 README 的前置条件、架构说明和测试命令改为 Bun-only。
- `AGENTS.md` 更新为当前真实命令和架构，不再描述已删除的 `web/`。

## 错误处理

- 下载元数据、tarball、解包、提取、后处理或打补丁任何一步失败都必须停止安装。
- 错误信息应指出失败阶段、包名、版本和可执行的恢复方式，但不得输出凭据。
- 临时目录在成功与常规失败路径上清理；需要保留现场时明确打印路径。
- 安装器不得在 Bun-only 迁移失败后留下半写入 launcher。
- Unix 与 PowerShell 对相同错误条件给出等价结果。

## 验证策略

### 聚焦回归

- 先增加会在现状失败的检查：安装器不得硬检查或调用 Node/npm；站点文件不得继续被架构文档引用；Bun 下 Acorn AST 路径必须创建缓存并工作。
- Bun 运行全部现有 `tests/*.mjs`，修复测试夹具中对 Node 可执行路径的假设。
- 对 Unix 和 PowerShell 内嵌脚本做成对断言，防止两套安装器漂移。

### 安装流程

- 在没有 `node` 和 `npm` 的隔离 PATH 中运行 Unix 安装器测试路径。
- Windows CI 或可用环境验证 PowerShell 下载、解包和安装路径。
- 验证 `--no-upgrade`、卸载、lean toggle、claude-mem helper 与重补丁。
- 验证生成的 `cli.cjs --version`、交互启动、后台 worker、Chrome 和 `/peers`。

### 完成标准

- 用户执行安装与运行流程不需要 Node.js 或 npm。
- 仓库用户脚本、文档和测试命令不再调用 `node` 或 `npm`。
- `node:` 导入和 `.node` 原生模块扩展名允许保留，它们不是 Node 运行时依赖。
- 所有 Bun 回归、shell 静态检查和兼容 smoke 通过。
- `web/` 与根 `index.html` 已删除，README 图片仍正常引用。

## 风险与控制

- **Bun 兼容差异**：先用回归测试覆盖 Acorn、`vm`、`spawnSync` 和 CJS 加载，再替换安装器调用。
- **代理环境下载失败**：下载器尊重标准代理环境；失败时给出明确提示，不回退到 npm。
- **tar 路径穿越**：解包前规范化路径并拒绝绝对路径、`..` 逃逸和非普通文件类型。
- **上游 Bun 版本漂移**：保留最低版本与实际加载 smoke 双重检查。
- **旧辅助脚本兼容范围收窄**：保留显式 `--cli-path`，文档明确自动定位只保证 ClawGod 安装目录。

## 交付边界

本次工作完成到本地代码、测试和文档验证。除非用户另行明确要求，不执行 push、tag、发布或远端部署。
