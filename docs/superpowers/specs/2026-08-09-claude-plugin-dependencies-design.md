# ClawGod Plus Claude 插件依赖设计

日期：2026-08-09

## 背景

ClawGod Plus 已将用户侧 JavaScript 运行时统一为 Bun 1.3.14 或更高版本。当前安装器会在检测到 claude-mem 时配置兼容启动器，但不会安装或升级 claude-hud、claude-mem 与 Superpowers，也不会管理 claude-hud 的状态栏配置。

本机当前使用以下插件版本：

- `claude-hud@claude-hud` 0.7.0
- `claude-mem@thedotmack` 13.14.0
- `superpowers@superpowers-marketplace` 6.2.0

claude-mem 13.14.0 的 `hooks/hooks.json` 与 `.mcp.json` 仍直接执行 `node`。原样安装会重新引入 Node.js 运行时依赖，因此 ClawGod 必须提供可校验、可恢复的 Bun 兼容处理。

## 目标

- 缺失或低于基准版本时，安装或升级 claude-hud、claude-mem 与 Superpowers。
- 已安装相同或更高版本时不重装、不降级；只允许修改本设计明确列出的 HUD 配置和 claude-mem 启动入口。
- 保持 Claude Code 自身的升级语义：无参数 `claude update` 继续升级最新 Claude Code。
- 将 claude-hud 的显示配置固定为用户当前样式，并让 `statusLine` 直接通过 Bun 运行。
- 将 claude-mem 的 Claude hooks 与 MCP 启动入口从 Node.js 调整为 Bun，不重装已经满足版本要求的插件。
- 单个可选插件失败时保留原状态并警告，不让 ClawGod 核心安装失败。
- 卸载 ClawGod 时保留三个插件和 claude-mem 数据，只恢复 ClawGod 管理过的配置与启动入口。
- 保持 Unix 与 Windows 安装器行为对齐，且不新增 Node.js、npm、npx、系统 Git、curl、wget 或系统 ripgrep 依赖。

## 非目标

- 不在每次安装时动态追踪三个插件的远程 `latest`。
- 不限制、固定或降级 Claude Code 的版本。
- 不删除插件、marketplace 缓存或 `~/.claude-mem` 数据。
- 不启用、禁用或删除 `superpowers@claude-plugins-official`；ClawGod 只管理 `superpowers@superpowers-marketplace`。
- 不修改全局 Git 配置，也不向代理发送 GitHub、Claude 或 provider 凭据。
- 不在本次工作中 push、tag、发布或创建 GitHub Release。

## 版本与来源

版本常量表示 ClawGod 支持的最低基准，不表示强制安装版本。安装器必须用严格语义版本比较判断已安装版本：

- 版本等于或高于基准：保留现有安装载荷，不重新安装；HUD 配置与 claude-mem 启动入口仍按各自的受管规则处理。
- 版本低于基准或插件缺失：安装基准版本。
- 版本格式无效：不覆盖现有文件，报告可选插件警告。
- 预发布版本不自动视为高于同号稳定版，除非完整版本与 ClawGod 显式声明相同。

当前基准归档如下：

| 插件 | 基准版本 | 归档大小 | SHA-256 |
| --- | --- | ---: | --- |
| claude-hud | 0.7.0 | 754443 | `59bd3ec17e7b9181d8069c93cc7c5e1db8b1d33e6a94e4041f6589dd8b87c912` |
| claude-mem | 13.14.0 | 11817347 | `a64f7dd038308da0db52f10d8f4fc2b3b3acfec5d9ddfdcfea9f6e473e54bed0` |
| Superpowers | 6.2.0 | 516401 | `468246a7b4981d4c014c2b58d9ee538700ffded075279d5810059cdc1abeb5f3` |

归档 URL 固定为公开 GitHub 标签通过用户指定代理访问：

- `https://hub.211107.xyz/https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz`
- `https://hub.211107.xyz/https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz`
- `https://hub.211107.xyz/https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz`

安装器只为这些公开归档使用代理，不在 URL、请求头或日志中附加用户凭据。下载失败不会回退到未经校验的镜像或动态 `latest`。

## 总体架构

`install.sh` 与 `install.ps1` 生成语义相同的 Bun 插件依赖管理模块。模块负责：

1. 读取 Claude 插件安装记录和启用状态。
2. 严格比较已安装版本与基准版本。
3. 下载、校验并安全解压需要安装的基准归档。
4. 使用原版 Claude 可执行文件的插件命令安装本地 marketplace。
5. 配置 claude-hud 并生成 Bun `statusLine` 入口。
6. 对 claude-mem hooks 与 MCP 配置应用可恢复的 Bun 兼容修改。
7. 写入所有权状态、输出插件汇总，并在卸载时恢复受管内容。

该阶段在 ClawGod 核心 bundle、补丁、Bun smoke 与 launcher 全部成功后运行。插件阶段只能把自身结果标记为 installed、preserved、skipped 或 warning，不能把已经成功的核心安装改成失败。

插件命令必须调用安装流程已验证的原版 Claude 可执行文件或其稳定备份，不能调用 PATH 中的 `claude`，以免递归进入 ClawGod launcher 或命中临时 shim。生成模块只能依赖 Bun 与操作系统已有的 Shell 或 PowerShell 入口。

## 下载与本地 Marketplace

需要安装或升级插件时，管理模块执行以下流程：

1. 在 ClawGod 私有临时目录创建仅当前用户可访问的下载目标。
2. 使用现有 Bun 下载器语义处理代理、`NO_PROXY`、最多五次重定向、超时、原子落盘与凭据脱敏。
3. 对完整归档计算固定 SHA-256，并在解压前拒绝不匹配内容。
4. 使用 Bun gzip/tar 处理逻辑安全解压，拒绝绝对路径、`..` 逃逸、符号链接、硬链接、设备条目、重复冲突路径与大小异常。
5. 校验插件 manifest、插件名称、版本和必要入口与预期一致。
6. 将完整本地 marketplace 持久化到 Claude 插件目录，再调用官方插件命令安装用户级插件。
7. 验证安装记录、版本、安装目录和启用 ID 后才提交本次插件事务。

必须保持 canonical ID：

- `claude-hud@claude-hud`
- `claude-mem@thedotmack`
- `superpowers@superpowers-marketplace`

持久 marketplace 不能引用随后会被删除的临时目录或 `~/.clawgod` 路径。插件安装失败时恢复该插件原 marketplace 元数据、目录和启用状态。成功安装的 marketplace 与插件在 ClawGod 卸载后继续保留。

## claude-hud 精确样式

ClawGod 管理的 HUD 配置为：

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

只有在已安装 HUD 版本满足基准且入口验证成功后，安装器才写入配置和 `statusLine`。

### Bun 状态栏入口

安装器生成 `~/.clawgod/claude-hud-statusline.mjs`，并把 `~/.claude/settings.json` 的 `statusLine` 设置为直接执行：

```text
<resolved-bun> <managed-claude-hud-statusline.mjs>
```

不得使用 `node`、`bash -c`、`ls`、`head` 或依赖 shell glob。管理脚本必须：

1. 结构化读取 `installed_plugins.json`。
2. 只考虑 `claude-hud@claude-hud` 的有效用户级安装记录。
3. 选择最高合法语义版本，因此用户后续安装更高版本时不会被固定到 0.7.0。
4. 校验安装目录位于对应 Claude 插件 cache 根内，且 HUD 入口是受控目录中的普通文件。
5. 使用当前 Bun 转发 stdin、stdout、stderr、环境和退出码给 HUD `src/index.ts`。

Unix 与 Windows 分别写入正确引用的绝对 Bun 路径和管理脚本路径。路径可以包含空格、引号与非 ASCII 字符，不能通过字符串拼接产生可执行注入。

### HUD 备份与恢复

安装器记录 HUD 配置文件是否原本存在，并按原始字节备份存在的文件。对 `settings.json` 只记录原 `statusLine` 字段是否存在及其结构化值，不用整文件恢复覆盖其他设置。

每次准备写入时：

- 当前内容等于 ClawGod 上次写入的所有权指纹：幂等更新，不覆盖恢复点。
- 当前内容与所有权指纹不同：把当前用户内容设为新的恢复点，再写入确认过的精确样式。
- 文件或父目录是危险链接、权限不安全或 JSON 无效：不写入并报告 HUD warning。

卸载时只有当前内容仍等于 ClawGod 管理指纹才恢复。用户或插件更新已经改变内容时保留现状并警告，不强制覆盖。

## claude-mem Bun 兼容处理

满足版本基准的 claude-mem 不因兼容处理而重装或改变版本号。管理模块只处理当前安装记录指向的以下文件：

- `hooks/hooks.json`
- `.mcp.json`

处理过程必须结构化解析 JSON，并在写入前验证插件 ID、版本、安装目录包含关系、目标文件类型和预期 schema。对于 13.14.0，已知执行入口包括：

- `node "$_P/scripts/version-check.js"`
- `node "$_P/scripts/bun-runner.js" ...`
- `.mcp.json` 中 `command: "node"` 与 `-e` 启动代码

兼容处理把这些可执行入口替换为安装器解析到的绝对 Bun 可执行文件，并保留原参数、stdin、stdout、stderr、环境与退出码语义。普通描述文本、`node:` 模块导入和 `.node` 原生扩展名不应被误改。

对高于基准的版本，只有 schema 和每个可执行入口都能被唯一识别时才修改。存在缺项、多个歧义匹配或未知命令结构时，不覆盖插件文件，输出 claude-mem warning，并把该插件标记为 preserved but not Bun-verified，不能把它计入 ready 数量。写入后必须重新解析并确认目标入口不再执行 Node.js，再以 Bun smoke 启动版本检查、hook 与 MCP 入口。

原文件按字节备份并记录原始与受管 SHA-256。插件更新覆盖受管文件后，下次 ClawGod 安装会把更新后的用户文件作为新恢复点，再进行结构验证。卸载只恢复仍匹配受管指纹的文件；用户或插件已经更新的文件保持不变。

现有 `claude-mem-compat.cjs` 继续负责 provider、专用 ClawGod launcher、模型角色与 worker 重启。兼容处理不得删除、迁移或重建 `~/.claude-mem` 数据库，不得改变用户端口、云同步、gateway 或 telemetry 设置。

## Superpowers 管理

ClawGod 只检查和安装 `superpowers@superpowers-marketplace`。版本满足基准时不修改插件文件或设置；缺失或较旧时安装 6.2.0。

`superpowers@claude-plugins-official` 不属于 ClawGod 所有，无论它是否存在或启用都不被修改。安装器不得因为发现重复缓存而删除目录、切换 ID 或改变用户对官方副本的选择。

## Claude Code 更新语义

插件管理不能改变现有 Claude Code 版本选择：

- `claude update`：解析并安装最新 Claude Code，再重新应用 ClawGod 补丁。
- `claude update --version <version>`：只在用户明确指定时安装该 Claude Code 版本。
- `claude update --no-upgrade`：不下载 Claude Code，只重新应用补丁。

上述三条路径都会执行插件依赖健康检查：

- 插件满足基准：不重装、不联网，只验证和修复 ClawGod 管理的 HUD/claude-mem 兼容层。
- 插件缺失或低于基准：尝试下载并安装基准版本。
- 插件高于基准：保留高版本，并仅在 schema 安全时应用兼容层。

插件检查不得覆盖 Claude Code 的目标版本、把 Claude Code 固定到某个版本，或把插件 warning 转换为核心更新失败。

## 状态、事务与卸载

ClawGod 在 `~/.clawgod` 中保存插件依赖状态和恢复数据。状态至少记录：

- 受管插件 ID、观察到的版本和安装路径。
- 归档版本、来源和校验值。
- marketplace、启用状态与安装事务恢复信息。
- HUD 配置与 `statusLine` 的原始状态、受管值和所有权指纹。
- claude-mem 原文件、受管文件和对应 SHA-256。

每个插件独立提交事务：下载与修改都先进入私有暂存路径，验证完成后原子替换。一个插件失败只回滚该插件本轮变更，不撤销其他已成功插件，也不影响 ClawGod 核心。

卸载顺序必须先读取状态并完成受管配置恢复，再删除 `~/.clawgod`。卸载后：

- 三个插件、有效 marketplace 与插件启用状态保留。
- `~/.claude-mem` 及其数据库、Chroma、日志和同步状态保留。
- HUD 配置、`statusLine` 和 claude-mem 入口按所有权规则恢复。
- ClawGod 的 HUD 管理脚本随 `~/.clawgod` 删除，且 `settings.json` 不能继续引用它。

恢复步骤失败时保留状态文件和备份，停止删除相关恢复证据并打印明确警告。不得在恢复未完成时留下指向已删除管理脚本的 `statusLine`。

## 错误处理与用户输出

核心安装成功后，插件阶段输出简洁逐项状态和最终汇总，例如：

```text
  claude-hud 0.7.0      preserved
  claude-mem 13.14.0    Bun compatibility applied
  superpowers 6.2.0     warning: download unavailable
  Optional plugins: 2 ready, 1 warning
```

以下问题只产生插件 warning：代理不可用、下载失败、哈希不匹配、危险归档、版本无效、插件命令失败、未知 claude-mem schema、HUD 配置权限冲突或用户文件所有权冲突。

所有 warning 必须说明插件与失败阶段，不输出长 Bun 堆栈、代理凭据、provider key 或无关临时路径。插件失败时保留原插件、配置、marketplace 和启用状态。核心补丁、bundle smoke 或 launcher 失败仍按现有规则终止安装，不能被可选插件策略弱化。

## 验证策略

### 离线与单元回归

- 从两个安装器提取生成模块并断言 Unix/Windows 关键逻辑一致。
- 在显式临时 HOME、Claude config 与 fixture-only PATH 中运行，PATH 只提供 Bun 和必要操作系统入口。
- 用确定性 tar.gz fixture 覆盖固定 SHA-256、截断内容、路径穿越、链接、重复路径、异常大小、重定向、代理、真实 `NO_PROXY`、超时、原子替换与凭据脱敏。
- 覆盖缺失、低版本、相同版本、高版本、预发布版本和无效版本；相同或高版本不得触发插件重装，安装记录和非受管文件必须保持字节不变，只有 HUD 配置和 claude-mem 两个明确入口允许按所有权规则变化。
- 用官方 Claude 插件命令的隔离 shim 验证 argv、退出码、marketplace 持久路径、启用状态与逐插件回滚，不触碰真实 HOME。
- 静态 Bun-only policy 拒绝生成或执行 `node`、`node.exe`、npm、npx、系统 Git、curl、wget 和系统 ripgrep。

### HUD 回归

- 对受管 JSON 做精确快照，字段、顺序和值必须与本设计一致。
- 覆盖配置不存在、已有用户配置、ClawGod 已管理、用户后改、无效 JSON、链接与权限错误。
- 使用实际 HUD 0.7.0 入口和固定 stdin fixture 生成 golden stdout，逐字比较当前展示布局、顺序与颜色输出。
- 验证 Bun 管理脚本选择最高合法 HUD 版本，拒绝 cache 根外路径，并完整转发 stdin、stdout、stderr 和退出码。
- 断言 `statusLine` 直接执行 Bun，不包含 Node、`bash -c`、`ls`、`head` 或 glob。

### claude-mem 回归

- 对 13.14.0 真实 `hooks/hooks.json` 与 `.mcp.json` fixture 执行结构化兼容处理。
- 验证 normal hook、version-check、worker lifecycle 和 MCP `-e` 入口均由 Bun 启动。
- 覆盖已修改文件、高版本已知 schema、高版本未知 schema、歧义命令、插件更新后重补与卸载恢复。
- 验证 claude-mem 数据目录、设置字节、端口、数据库和 worker 状态不会被插件安装回滚或卸载删除。

### 集成与验收

- 全部 `tests/*.mjs` 使用 Bun 运行，网络 E2E 未显式启用时不得联网或修改真实 HOME。
- 授权的网络 E2E 通过代理下载三个固定归档，在隔离 HOME 中安装并运行真实插件入口。
- 验证普通安装、`claude update`、指定 Claude 版本、`--no-upgrade`、重复安装和卸载。
- 验证 `claude update` 的 Claude Code 目标版本不受插件基准影响。
- 对网络 E2E 前后的真实 HOME 关键路径做只读指纹，必须零变化。
- Windows 原生 CI 验证 PowerShell 路径、空格引用、绝对 Bun 路径、插件命令和卸载恢复。

## 完成标准

- 对基准版本和 schema 已验证的更高版本，用户只需 Bun 1.3.14 或更高版本即可完成 ClawGod 与三个插件依赖的安装和运行；未知高版本会被保留并明确标记为未通过 Bun 验证。
- 当前或更高插件版本不被重装或降级，除明确批准的 HUD 配置和 claude-mem 启动入口外不覆盖插件文件。
- claude-hud 的可见输出与确认的当前样式 golden 一致，`statusLine` 直接使用 Bun。
- claude-mem Claude hooks 与 MCP 入口不再执行 Node.js，且插件版本和记忆数据保持不变。
- Superpowers canonical 插件可用，官方重复副本不被修改。
- `claude update` 继续升级最新 Claude Code，插件逻辑不会固定 Claude Code 版本。
- 单个插件失败只产生简洁 warning，核心安装仍成功，原插件状态不受损。
- 卸载保留插件和 claude-mem 数据，并按所有权规则恢复 HUD 与 claude-mem 受管内容。
- 完整 Bun 回归、ZIP 校验、Shell 语法、PowerShell CI、diff check 和隔离网络 E2E 通过。

## 风险与控制

- **插件上游结构变化**：先校验版本、manifest 和 schema；未知或歧义结构只警告，不猜测修改。
- **高版本被错误降级**：严格语义版本比较并用字节不变测试锁定 preserve 路径。
- **HUD 样式漂移**：固定配置快照并执行真实入口 golden 测试，而不是只检查字段存在。
- **Bun 路径或插件路径含特殊字符**：使用参数数组、结构化 JSON 和绝对路径，不拼接 shell 命令。
- **代理或供应链风险**：只下载固定公开标签，校验内嵌 SHA-256，拒绝动态 latest 和未校验回退。
- **插件失败污染核心安装**：每个插件独立事务，先验证后提交，失败恢复原 marketplace、启用状态和配置。
- **卸载覆盖用户后续修改**：所有恢复都受当前所有权指纹保护，冲突时保留用户内容。
- **状态目录先被删除**：卸载先恢复、后清理；恢复失败时保留证据并阻止产生悬空 `statusLine`。

## 交付边界

实现完成到本地代码、测试、文档与隔离验收。除非用户另行明确要求，不执行真实 HOME 安装、push、tag、发布或远端部署。
