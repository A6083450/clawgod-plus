# ClawGod Plus

[English](README_EN.md) | **简体中文** | [日本語](README_JP.md)

> 基于 [0Chencc/clawgod](https://github.com/0Chencc/clawgod) 持续维护的增强分支。它直接构建在官方 Claude Code 运行时之上，而不是用第三方客户端替代 Claude Code。

ClawGod Plus 从 Claude Code 的 Bun standalone 二进制中提取内嵌 JavaScript，应用跨版本补丁，并通过 Bun 运行修改后的 CLI。本分支保留上游全部能力，同时增强了浏览器、Computer Use、上下文窗口、claude-mem、Worker 运行时和回归测试。

![ClawGod Plus 补丁运行时](bypass.png)

## 本分支领先上游多少

下表以增强功能快照 `b4ed6a1` 对比上游 **v1.7.5**（提交 [`507405a`](https://github.com/0Chencc/clawgod/commit/507405a053c917c3a27c162e3f66c3d1897d4591)），核验日期为 **2026-07-30**。本次 README 重写不计入工程量统计。

| 可量化差异 | 增强分支 | 上游 v1.7.5 |
|---|---:|---:|
| 分支独有提交 | **23** | 0 |
| 改动文件 | **26** | 0 |
| 代码差异 | **+6,631 / -101 行** | 基线 |
| 补丁回归脚本 | **8** | 0 |
| 独立补丁源码脚本 | **5 个，覆盖 3 类补丁** | 0 |
| 已说明的增强领域 | **6** | 上游基础功能集 |

这些数字来自 `git rev-list upstream/main..b4ed6a1`、`git diff --shortstat upstream/main...b4ed6a1`，以及该快照下 `tests/` 目录中被 Git 跟踪的文件。它们衡量的是相对指定上游快照的工程差异，不是虚构的性能或质量倍数。

## 相较上游的改进

| 增强项 | 来源 | 实际改进 |
|---|---|---|
| **claude-mem 兼容** | 本地集成 | claude-mem 可复用已配置的 ClawGod Plus Provider，无需把凭据复制到自身 `.env`；支持托管设置备份、保留用户后续修改、重启 Worker、清理失效 Chroma 进程，以及卸载时恢复设置。 |
| **API Key 模式下的 Claude in Chrome** | **哈雷佬的补丁系列，本分支完成集成** | 通过本地 Chrome 扩展 socket 或 named pipe 工作，无需 OAuth 订阅桥接；Agent 派发时保留 `--chrome` 和 `--no-chrome`。 |
| **Computer Use 默认开启** | **哈雷佬的补丁系列，并完成本地 Launcher 集成** | 将 Feature Gate 外置、默认启用 Computer Use，并让 cmux、stream-json 等非交互 Worker 也能使用。面向机器的命令不会被自动注入 `--chrome`，避免反复打开空白页。 |
| **可配置上下文上限** | **哈雷佬的补丁系列，本分支完成集成** | 将写死的本地 200K fallback 改为依次读取 `CLAUDE_CODE_CONTEXT_LIMIT`、`CLAUDE_CODE_MAX_CONTEXT_TOKENS`，最后回退到 200K，并提供检查与恢复模式。 |
| **Bun 与 Worker 运行时加固** | 本地集成 | 同时适配新旧压缩变量形态的 Worker Resolver，并保留 Bun 共享的 standalone-executable 语义，避免 daemon、fork、MCP 和后台 Worker 互相破坏。 |
| **安装器与运行可靠性** | 本地集成 | 增加 `--no-upgrade` 控制流覆盖、本地安装器更新路由、macOS TIFF 剪贴板路径识别、更完整的 CI 触发条件，以及用于发现补丁漂移的独立回归 Fixture。 |

### 融合补丁的作者归属

独立的 `apply-claude-code-*` 脚本、对应压缩包，以及从中融合的补丁思路，均由 **哈雷佬** 创作。本分支负责将这些成果集成并加固到 Unix 和 Windows 安装器中；集成不会改变原作者归属。

相关源码包括：

- [`apply-claude-code-chrome-fix.sh`](apply-claude-code-chrome-fix.sh) 和 [`apply-claude-code-chrome-fix.ps1`](apply-claude-code-chrome-fix.ps1)
- [`apply-claude-code-computer-use-fix.sh`](apply-claude-code-computer-use-fix.sh)
- [`apply-claude-code-context-limit-patch/`](apply-claude-code-context-limit-patch/)

## 已融合的上游改动

这不是一个停滞的 Fork。本分支已包含上游至 v1.7.5 的完整演进，包括：

| 上游版本范围 | 本分支保留的改动 |
|---|---|
| **v1.3.0** | 日期标点、时区/代理/Provider 检测和撇号选择相关的地区隐写中和。 |
| **v1.6.0 - v1.6.1** | Lean Settings 控制和 macOS 图片粘贴 fallback 改进。 |
| **v1.7.0 - v1.7.2** | OpenAI 兼容代理、Provider 导入、第三方 Provider 的 Remote Control，以及 Release 版本注入。 |
| **v1.7.3 - v1.7.5** | Bun 运行时兼容、Windows 卸载清理，以及只在远端版本更高时提示更新。 |

## 完整能力集

增强分支保留上游的完整补丁能力：

| 领域 | 能力 |
|---|---|
| **功能解锁** | Internal User 模式和隐藏命令、GrowthBook 覆盖、Agent Teams、Computer Use、Auto-mode、Ultraplan 和 Ultrareview。 |
| **限制移除** | 移除 `CYBER_RISK_INSTRUCTION`、URL 猜测限制、强制谨慎操作确认，以及启动时的登录提醒。 |
| **Provider 支持** | Anthropic API Key、OAuth、Anthropic 兼容端点、OpenAI 兼容网关、Provider 导入，以及第三方 Prompt Cache Header 处理。 |
| **可靠性** | 恢复 Glob/Grep、1 小时 Prompt Cache Allowlist、Claude 升级后自动重打补丁、更新提示，以及三级 Lean Settings。 |
| **视觉识别** | 绿色补丁主题，以及对非 Anthropic Provider 的消息显示修复。 |

## 前置依赖

运行增强版安装器前，请先安装：

| 工具 | 要求 | 用途 |
|---|---|---|
| **Claude Code 原生二进制** | 当前官方安装 | 提供 ClawGod Plus 要提取和修改的 Bun standalone 二进制。 |
| **Node.js** | 18 或更高版本 | 运行提取与补丁脚本。 |
| **Bun** | 当前版本 | 运行修改后的 CLI；缺失时安装器可以自动安装。 |
| **ripgrep** | 当前版本 | Claude Code 的 Grep 工具依赖。 |

Claude Code 官方安装器：

- macOS/Linux：[`https://claude.ai/install.sh`](https://claude.ai/install.sh)
- Windows：[`https://claude.ai/install.ps1`](https://claude.ai/install.ps1)

## 安装 ClawGod Plus

安装命令直接读取 `A6083450/clawgod-plus` 的 `main` 分支，因此无需等待首个 Release。

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/A6083450/clawgod-plus/main/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/A6083450/clawgod-plus/main/install.ps1 | iex
```

常用安装参数：

```bash
bash install.sh --version 2.1.220  # 安装指定 Claude Code 版本
bash install.sh --no-upgrade      # 重新修改当前已提取的版本
bash install.sh --lean-on         # 减少未使用的工具定义
bash install.sh --lean-max        # 激进减少 Token
bash install.sh --lean-off        # 恢复完整工具集；默认值
```

绿色品牌标识表示补丁运行时已经启用。安装器会在替换命令前备份原始版本。

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

在 Claude Code 内安装：

```text
/plugin marketplace add jarrodwatts/claude-hud
/plugin install claude-hud
/reload-plugins
/claude-hud:setup
```

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

- 复用当前 ClawGod Plus Provider 或 Claude 设置，无需把凭据写入 claude-mem 的 `.env`；
- 通过专用 ClawGod Plus Launcher 启动 claude-mem SDK 子进程；
- 只备份由兼容助手托管的设置，并在卸载时恢复；
- 避免覆盖安装后由用户手动修改的 claude-mem 设置；
- 清理重复失效的 Chroma MCP 进程并重启 Worker。

如果 claude-mem 未安装、使用其他 Provider、没有可用凭据，或包含用户自有的冲突设置，ClawGod Plus 核心安装会继续执行，并且不会接管这些设置。

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

`~/.clawgod/.source-version` 记录被修改的原生版本。后续启动时，Wrapper 会检测官方 Claude Code 升级并对新二进制重新打补丁。

## 更新

使用正常命令：

```bash
claude update
```

增强补丁会在本地 ClawGod Plus 安装器存在时把更新请求路由给它，下载目标 Claude Code 包、重新提取、应用完整补丁集并重写 Launcher。

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

卸载会恢复原始 Claude Launcher，移除 ClawGod Plus 别名和生成的运行时文件，并恢复仍由兼容助手托管的 claude-mem 设置。

## 验证

本分支包含 8 个针对性回归脚本，覆盖 Claude Code 2.1.215 补丁形态、Chrome Agent 参数传递、异步 socket fallback、claude-mem 设置归属与清理、上下文上限、`--no-upgrade` 控制流、macOS 粘贴处理，以及 Worker/Computer Use 启动行为。

无需安装 ClawGod Plus 即可运行：

```bash
for test_file in tests/*.mjs; do
  node "$test_file" || exit 1
done

bash -n install.sh
git diff --check
```

GitHub 兼容性工作流还会执行完整的 Unix 安装和运行时检查。轻量测试命令不会执行本地 `bash install.sh`，因为它会替换用户当前使用的 Claude Launcher。

## 致谢与许可证

- [A6083450](https://github.com/A6083450)：ClawGod Plus 增强分支维护者。
- [0Chencc/clawgod](https://github.com/0Chencc/clawgod)：上游项目及 v1.7.5 比较基线。
- **哈雷佬**：`apply-claude-code-*` 补丁系列，以及本分支所融合对应补丁思路的作者。
- Anthropic：本项目所修改的官方 Claude Code 运行时；ClawGod Plus 与 Anthropic 没有关联。

项目使用 [GPL-3.0](LICENSE) 许可。请仅在获得授权的场景中使用，并自行承担运行补丁开发工具的风险。
