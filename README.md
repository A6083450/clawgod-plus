# ClawGod Plus

[English](README_EN.md) | **简体中文** | [日本語](README_JP.md)

> 基于 [0Chencc/clawgod](https://github.com/0Chencc/clawgod) 持续维护的增强分支。它直接构建在官方 Claude Code 运行时之上，而不是用第三方客户端替代 Claude Code。

ClawGod Plus 从 Claude Code 的 Bun standalone 二进制中提取内嵌 JavaScript，应用跨版本补丁，并通过 Bun 运行修改后的 CLI。本分支保留上游全部能力，同时增强了浏览器、Computer Use、上下文窗口、claude-mem、Worker 运行时和回归测试。

![ClawGod Plus 补丁运行时](bypass.png)

## 功能

| 功能 | 说明 |
|---|---|
| **claude-mem 兼容** | claude-mem 可复用已配置的 ClawGod Plus Provider，无需把凭据复制到自身 `.env`；支持托管设置备份、保留用户后续修改、重启 Worker、清理失效 Chroma 进程，以及卸载时恢复设置。 |
| **API Key 模式下的 Claude in Chrome** | 通过本地 Chrome 扩展 socket 或 named pipe 工作，无需 OAuth 订阅桥接；Agent 派发时保留 `--chrome` 和 `--no-chrome`。 |
| **Computer Use 默认开启** | 将 Feature Gate 外置、默认启用 Computer Use，并让 cmux、stream-json 等非交互 Worker 也能使用。面向机器的命令不会被自动注入 `--chrome`，避免反复打开空白页。 |
| **可配置上下文上限** | 将写死的本地 200K fallback 改为依次读取 `CLAUDE_CODE_CONTEXT_LIMIT`、`CLAUDE_CODE_MAX_CONTEXT_TOKENS`，最后回退到 200K，并提供检查与恢复模式。 |
| **Bun 与 Worker 运行时加固** | 同时适配新旧压缩变量形态的 Worker Resolver，并保留 Bun 共享的 standalone-executable 语义，避免 daemon、fork、MCP 和后台 Worker 互相破坏。 |
| **安装器与运行可靠性** | 增加 `--no-upgrade` 控制流覆盖、本地安装器更新路由、macOS TIFF 剪贴板路径识别、更完整的 CI 触发条件，以及用于发现补丁漂移的独立回归 Fixture。 |

### 融合补丁的作者归属

独立的 `apply-claude-code-*` 脚本、对应压缩包，以及从中融合的补丁思路，均由 **哈雷佬** 创作。本分支负责将这些成果集成并加固到 Unix 和 Windows 安装器中；集成不会改变原作者归属。

相关源码包括：

- [`apply-claude-code-chrome-fix.sh`](apply-claude-code-chrome-fix.sh) 和 [`apply-claude-code-chrome-fix.ps1`](apply-claude-code-chrome-fix.ps1)
- [`apply-claude-code-computer-use-fix.sh`](apply-claude-code-computer-use-fix.sh)
- [`apply-claude-code-context-limit-patch/`](apply-claude-code-context-limit-patch/)

## 完整能力集

增强分支保留上游的完整补丁能力：

| 领域 | 能力 |
|---|---|
| **功能解锁** | Internal User 模式和隐藏命令、GrowthBook 覆盖、Agent Teams、共享协作、Harbor Kite 设置和 `/peers`、Computer Use、Auto-mode、Ultraplan 和 Ultrareview。 |
| **限制移除** | 移除 `CYBER_RISK_INSTRUCTION`、URL 猜测限制、强制谨慎操作确认，以及启动时的登录提醒。 |
| **Provider 支持** | Anthropic API Key、OAuth、Anthropic 兼容端点、OpenAI 兼容网关、Provider 导入，以及第三方 Prompt Cache Header 处理。 |
| **可靠性** | 恢复 Glob/Grep、1 小时 Prompt Cache Allowlist、Claude 升级后自动重打补丁、更新提示，以及三级 Lean Settings。 |
| **视觉识别** | 绿色补丁主题，以及对非 Anthropic Provider 的消息显示修复。 |

## 前置依赖

ClawGod Plus 只需要一个已安装的 JavaScript 运行时：**Bun 1.3.14 或更高版本**。安装器与所有独立补丁工具都由 Bun 运行。

macOS/Linux 请从 Shell 运行安装命令，Windows 请从 PowerShell 运行安装命令；Shell 和 PowerShell 是操作系统的命令入口，不是另一种 JavaScript 运行时。

安装器会从 npm Registry 获取当前平台的官方 `@anthropic-ai/claude-code-<platform>` 包，并下载、校验和私有管理 **ripgrep 15.2.0**。无需预先安装 Claude Code、Node.js、npm 或系统 ripgrep。

## 安装 ClawGod Plus

安装命令下载固定版本（v2026.8.13-claude.2.1.231）的 ClawGod Plus Release 资产。

**macOS / Linux**

```bash
curl -fsSL https://github.com/A6083450/clawgod-plus/releases/download/v2026.8.13-claude.2.1.231/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://github.com/A6083450/clawgod-plus/releases/download/v2026.8.13-claude.2.1.231/install.ps1 | iex
```

常用安装参数（不传版本时默认保持当前已安装的 Claude Code 版本，全新安装才拉取最新版）：

```bash
bash install.sh --version 2.1.220  # 安装指定 Claude Code 版本
bash install.sh --version latest   # 显式升级到最新版
bash install.sh --no-upgrade      # 重新修改当前已提取的版本
bash install.sh --lean-on         # 减少未使用的工具定义
bash install.sh --lean-max        # 激进减少 Token
bash install.sh --lean-off        # 恢复完整工具集；默认值
```

绿色品牌标识表示补丁运行时已经启用。安装器会在替换命令前备份原始版本。

## 可选增强（Enhancements）

ClawGod Plus 提供 13 项可选增强，默认启用全部。增强 ID 固定且按以下顺序排列：

| 类型 | 增强 ID |
|---|---|
| 补丁 | `chrome`、`computer-use`、`agents`、`planning`、`voice`、`auto-mode`、`unrestricted-tools`、`paste-images`、`privacy`、`branding` |
| 插件 | `claude-hud`、`claude-mem`、`superpowers` |

非交互环境（管道安装、CI、`claude update`）不传任何选项时，默认启用全部 13 项增强。选择会以严格 JSON 形式保存到 `~/.clawgod/enhancements.json`：

```json
{
  "schemaVersion": 1,
  "mode": "all",
  "enabled": []
}
```

`mode` 为 `all` 时始终启用清单中的全部增强（含未来新增的 ID）；`mode` 为 `custom` 时只启用 `enabled` 列表中的 ID。

在终端里直接运行安装器时会自动询问，无需记参数：

```
  ClawGod Plus 增强选择
   1) 全部 13 项增强（默认，回车即选）
   2) 仅核心（不装任何增强）
   3) 自定义菜单（逐项勾选）
   回车 全部增强 · Esc 退出
```

自定义菜单用键盘逐项勾选：`↑`/`↓` 移动光标（首尾循环）、`空格` 切换勾选、`回车` 确认、`Esc` 返回上级菜单。全部取消后确认等同"仅核心"。顶层按 `Esc` 取消安装。

也可以显式交互选择或非交互指定：

```bash
bash install.sh --choose-enhancements   # 直接打开逐项自定义菜单
bash install.sh --enhancements chrome,computer-use,claude-hud
bash install.sh --enhancements none   # 仅核心，不启用任何增强
```

Windows PowerShell 对应参数：

```powershell
.\install.ps1 -ChooseEnhancements
.\install.ps1 -Enhancements chrome,computer-use,claude-hud
.\install.ps1 -Enhancements none
```

后续运行 `claude update` 会复用 `~/.clawgod/enhancements.json` 中已保存的选择，并且从不主动询问。关闭 `claude-hud` 或 `claude-mem` 会恢复由 ClawGod 托管的对应配置；关闭 `superpowers` 只会停止托管，不会删除你已安装的插件。

## 命令与启动行为

```bash
claude              # 已修改的 Claude Code；交互启动默认带 --chrome
clawgod             # 明确使用补丁版本的入口
claude.orig         # 原始未修改命令的备份
```

交互启动默认注入 `--chrome`。帮助、版本、更新、认证、配置、MCP、daemon、print、permission 和结构化输入/输出模式不会自动注入。显式传入的 `--chrome` 始终保留。

单次启动或当前 Shell 禁用 Chrome 自动集成：

```bash
CLAWGOD_NO_AUTO_CHROME=1 claude
```

## 推荐搭配：Claude HUD

对于 ClawGod Plus 的多智能体和长时间运行任务，推荐搭配状态栏插件 [Claude HUD](https://github.com/jarrodwatts/claude-hud)。无需打开额外窗口，就能持续看到模型与上下文健康度、项目与 Git 状态、Claude 配置数量、用量、工具、Agent、Todo、成本、速度和会话时长。

每次安装和更新都会自动确保以下可选 Claude Code 插件依赖：

| 插件 | Canonical ID | 基线版本 |
|---|---|---|
| Claude HUD | `claude-hud@claude-hud` | `0.7.0` |
| claude-mem | `claude-mem@thedotmack` | `13.14.0` |
| Superpowers | `superpowers@superpowers-marketplace` | `6.2.0` |

缺失或低于基线时，ClawGod Plus 会安装固定基线；如果已经安装了更新版本，则保留已安装的更高版本。公开固定归档直接从 GitHub 拉取，只有字节长度和固定 SHA-256 都精确匹配才会解压。Bun 仍是唯一需要安装的 JavaScript 运行时。

对于 HUD，安装器保留下面这份精确 profile，并且只托管 `~/.claude/settings.json` 的 `statusLine` 字段。该命令用 Bun 的绝对路径运行托管的 `claude-hud-statusline.mjs`，不会增加 Node 或 Bash 状态栏运行时。可选插件警告不会导致 ClawGod Plus 核心安装失败。

下图展示的是这份推荐配置在多智能体会话中的实际效果。

![推荐的 Claude HUD 紧凑显示效果](docs/images/claude-hud-recommended.png)

推荐的 `~/.claude/plugins/claude-hud/config.json`：

```json
{
  "language": "zh",
  "lineLayout": "compact",
  "pathLevels": 1,
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos", "sessionTime"],
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": true,
    "showFileStats": true
  },
  "display": {
    "showModel": true,
    "showAddedDirs": true,
    "addedDirsLayout": "line",
    "showContextBar": true,
    "contextValue": "tokens",
    "showConfigCounts": true,
    "showCost": true,
    "showDuration": true,
    "showSpeed": true,
    "showUsage": true,
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showTokenBreakdown": true,
    "usageBarEnabled": true
  },
  "colors": {
    "context": "green",
    "usage": "brightBlue",
    "warning": "yellow",
    "usageWarning": "brightMagenta",
    "critical": "red",
    "model": "cyan",
    "project": "yellow",
    "git": "magenta",
    "gitBranch": "cyan",
    "label": "#ff4fc2",
    "custom": "#FF6600"
  }
}
```

## Claude in Chrome 浏览器插件

[`claude-browser-1.0.77-patched.zip`](claude-browser-1.0.77-patched.zip) 是已打包的 **Claude in Chrome 浏览器插件**，不是 Claude Code 插件。压缩包内包含修改后的 Manifest V3 扩展，以及由 **哈雷佬** 编写的 Unix / Windows `apply-claude-code-chrome-fix` 脚本。

1. 下载并解压 ZIP。
2. 在 Chrome 打开 `chrome://extensions`，开启右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择解压后的 `claude-browser-1.0.77-patched/` 目录。

该修改版扩展需要较广泛的浏览器权限。请先检查压缩包内源码，并仅在获得授权的环境中使用。

## Provider 配置

首次启动会创建 `~/.clawgod/provider.json`：

```json
{
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com",
  "model": "",
  "smallModel": "",
  "timeoutMs": 3000000
}
```

- 设置 `apiKey` 可跳过 OAuth，使用 Anthropic 或兼容网关。
- `apiKey` 留空时，执行 `claude auth login` 并使用标准 OAuth 路径。
- 非 Anthropic 的 `baseURL` 会自动配置兼容网关认证，并关闭可能降低 Prompt Cache 命中率的逐请求 Attribution Header。
- 现有 `~/.claude` 中的 Agent、Skill、Hook 和 MCP 设置仍然可用。

### Fast mode 请求兼容

当在 Claude Code 中通过 `/fast` 开启 Fast mode 时，ClawGod 会保留该模式对应的 Anthropic Messages 协议：请求体含 `"speed": "fast"`，`anthropic-beta` 含 `fast-mode-2026-02-01`。已有 beta capability 会被保留并合并。该能力是否可用由当前 API provider 与模型决定；若 provider 不支持 Fast mode，请关闭 `/fast` 后重试。

**2.1.229 注入点**：官方 2.1.229 bundle 的请求构造（`Ze` builder）已不再生成 `headers` 对象；beta 以请求体字段 `betas` 携带（该字段先经 `l0s`/`aku` 允许列表过滤，第三方 provider 下 Fast capability 原本会被剥离），随后由内置 SDK 的 `messages.create` 从 `{betas:…}` 解构并构造 `"anthropic-beta"` 头（`n?.toString()` 逗号拼接）。ClawGod 直接在 `betas` 字段处做强制透传：`speed === "fast"` 是唯一开关——fast 时强制 `fast-mode-2026-02-01` 进入最终 betas（完整去重），slow 时移除全部 Fast beta capability；不受内部 `ae` 资格或第三方 provider 允许列表限制。

此行为仅适用于 Anthropic Messages `/v1/messages` 请求；不会改写 OpenAI Chat Completions 请求或添加 `service_tier`。

## 可配置上下文窗口

为单次启动设置本地 fallback 上限：

```bash
CLAUDE_CODE_CONTEXT_LIMIT=1000000 claude
```

也可以在 `~/.claude/settings.json` 中持久化：

```json
{
  "env": {
    "CLAUDE_CODE_CONTEXT_LIMIT": "1000000"
  }
}
```

该设置修改 Claude Code 本地的 200K 常量和检查，**不会**绕过 Anthropic 计费、模型能力或官方长上下文资格限制。

## claude-mem 兼容

安装 claude-mem 并将其配置为 Claude Provider 后，安装器可以：

- 使用 Bun 运行选中的 claude-mem Hook 和 MCP 入口；
- 复用当前 ClawGod Plus Provider 或 Claude 设置，无需把凭据写入 claude-mem 的 `.env`；
- 通过专用 ClawGod Plus Launcher 启动 claude-mem SDK 子进程；
- 只备份由兼容助手托管的设置，并在卸载时恢复；
- 避免覆盖安装后由用户手动修改的 claude-mem 设置；
- 清理重复失效的 Chroma MCP 进程并重启 Worker。

如果 claude-mem 未安装、使用其他 Provider、没有可用凭据，或包含用户自有的冲突设置，ClawGod Plus 核心安装会继续执行，并且不会接管这些设置。

托管集成状态采用 fail-closed 策略。未知的更高 claude-mem 归属 schema 会被保留并报告为未经 Bun 验证；ClawGod Plus 不会重写或删除它。

## 独立补丁工具

本节全部工具均由 **哈雷佬** 创作，并在适用时融合到增强版安装器中。

| 补丁类型 | Unix | Windows | 检查 / 恢复 |
|---|---|---|---|
| Claude in Chrome socket 与订阅路径 | `apply-claude-code-chrome-fix.sh` | `apply-claude-code-chrome-fix.ps1` | `--check`、`--restore` |
| Computer Use 设置与默认开启 Gate | `apply-claude-code-computer-use-fix.sh` | 已融合进安装器 | `--check`、`--restore` |
| 可配置上下文上限 | `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh` | `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.ps1` | `--check`、`--restore` |

只读检查示例：

```bash
bash apply-claude-code-chrome-fix.sh --check
bash apply-claude-code-computer-use-fix.sh --check
bash apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh --check
```

这些脚本在应用改动前会创建备份。使用对应的 `--restore` 可恢复最近一次匹配的补丁备份。

## 安装器工作原理

1. 查找或下载当前平台对应的官方 Claude Code 包。
2. 从 Mach-O、ELF 或 PE 格式的 Bun standalone 二进制中提取内嵌 JavaScript。
3. 将内嵌 `.node` 原生模块提取到 `~/.clawgod/vendor/`。
4. 把 Bun 虚拟路径重写为本地模块路径。
5. 使用生成的 `patch.mjs` 应用跨版本正则和 AST 辅助补丁。
6. 应用已融合的 Chrome、Computer Use、上下文上限、Worker、粘贴、Provider 和功能补丁。
7. 验证 Bun 可以加载修改后的 CLI。
8. 备份原始 Launcher，并写入 `claude` 和 `clawgod` Launcher。
9. 使用生成的 `plugin-dependencies.mjs` 确保三个可选插件基线，再应用托管的 HUD 与 claude-mem 集成。

`~/.clawgod/.source-version` 记录被修改的原生版本。后续启动时，Wrapper 会检测官方 Claude Code 升级并对新二进制重新打补丁。

安装器脚本是确定性生成产物：`src/` 是唯一事实来源，`dist/unix/install.sh` 与 `dist/win/install.ps1` 由 `bun build.mjs` 生成，请勿手工编辑。

## 更新

使用正常命令：

```bash
claude update
```

增强补丁会在本地 ClawGod Plus 安装器存在时把更新请求路由给它。普通的 `claude update` 会选择最新 Claude Code Release，重新提取、应用完整补丁集并重写 Launcher。插件基线独立管理：更新不会把 Claude Code 固定到插件版本。

```bash
claude update --version 2.1.220  # 锁定已知 Claude Code 版本
claude update --no-upgrade      # 不下载，只重新应用补丁
```

## 卸载

**macOS / Linux**

```bash
bash ~/.clawgod/install.sh --uninstall
hash -r
```

**Windows PowerShell**

```powershell
.\install.ps1 -Uninstall
```

卸载会恢复原始 Claude Launcher，移除 ClawGod Plus 别名和生成的运行时文件，恢复之前的 HUD `statusLine` 和仍归 ClawGod 托管的 claude-mem 入口，并删除 ClawGod 自有的插件 helper、state 和 cache 文件。它会保留插件缓存、Marketplace 注册和 claude-mem 记忆数据；卸载 ClawGod Plus 不会卸载这些可选插件。

## 验证

本分支包含完整的针对性回归脚本，覆盖 Claude Code 补丁形态、Chrome Agent 参数传递、异步 socket fallback、claude-mem 设置归属与清理、上下文上限、`--no-upgrade` 控制流、macOS 粘贴处理、Worker/Computer Use 启动行为，以及安装器的 Bun-only 依赖与安全回滚契约。

无需安装 ClawGod Plus 即可运行：

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done

bash -n install.sh
git diff --check
```

GitHub 兼容性工作流还会执行完整的 Unix 安装和运行时检查。轻量测试命令不会执行本地 `bash install.sh`，因为它会替换用户当前使用的 Claude Launcher。

## 致谢与许可证

- [A6083450](https://github.com/A6083450)：ClawGod Plus 增强分支维护者。
- [0Chencc/clawgod](https://github.com/0Chencc/clawgod)：上游项目。
- **哈雷佬**：`apply-claude-code-*` 补丁系列，以及本分支所融合对应补丁思路的作者。
- Anthropic：本项目所修改的官方 Claude Code 运行时；ClawGod Plus 与 Anthropic 没有关联。

项目使用 [GPL-3.0](LICENSE) 许可。请仅在获得授权的场景中使用，并自行承担运行补丁开发工具的风险。

## 🔗 友情链接

- [linux.do](https://linux.do)：**学AI，上L站！！！**
