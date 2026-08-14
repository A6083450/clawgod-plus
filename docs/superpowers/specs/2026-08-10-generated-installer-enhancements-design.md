# ClawGod 生成式安装器与可选增强设计

## 背景

`install.sh` 和 `install.ps1` 当前同时承担平台入口、下载流程、文件生成、补丁实现、launcher、插件管理和卸载恢复。两个文件包含大量 heredoc/here-string，已经难以独立理解、测试和同步；许多测试还需要从最终安装器中反向截取 JavaScript 才能运行。

本次重构将源码和发布产物分开：`src/` 是唯一可编辑源码，根目录两个安装器是由 Bun 确定性生成并提交的单文件发布产物。同时把现有补丁按用户能理解的能力分组，支持显式交互选择并持久化选择结果。

## 目标

- 使用 Bun 1.3.14 或更高版本运行构建和测试，不增加 Node、npm、npx 或其他 JavaScript runtime。
- 将共享 JavaScript、平台差异、安装器模板和增强补丁拆成职责单一的源文件。
- 保持 `install.sh` 和 `install.ps1` 为自包含的 GitHub Release 资产。
- 默认行为保持不变：没有选择记录、没有选择参数时启用全部增强。
- 提供显式交互选择，不让 `curl | bash`、CI 或 `claude update` 强制等待输入。
- 保存增强选择，并让后续 `claude update` 自动沿用。
- 禁用增强时，安全恢复由 ClawGod 管理的外部集成，不覆盖用户后续修改。
- 让大多数测试直接验证 `src/`，只保留必要的生成产物和端到端测试。

## 非目标

- 不把安装器改成运行时下载多个 ClawGod 源码文件。
- 不改变 Claude Code 包版本选择、Registry 下载或现有 `claude update` 路由语义。
- 不在结构迁移阶段重写现有 patch 算法或改变默认全部增强的输出。
- 不把 `features.json` 与新的增强选择配置合并。
- 不增加 Web UI、静态站点或第三方交互菜单依赖。

## 目录结构

```text
build.mjs
src/
├── generic/
│   ├── runtime/
│   │   ├── extractor.mjs
│   │   ├── post-processor.mjs
│   │   ├── repatcher.mjs
│   │   ├── wrapper.cjs
│   │   ├── fetch-file.mjs
│   │   ├── fetch-package.mjs
│   │   ├── install-ripgrep.mjs
│   │   ├── plugin-dependencies.mjs
│   │   ├── claude-hud-statusline.mjs
│   │   ├── openai-proxy.cjs
│   │   └── claude-mem-compat.cjs
│   ├── patcher/
│   │   ├── entry.mjs
│   │   ├── core.mjs
│   │   ├── registry.mjs
│   │   └── enhancements/
│   │       ├── chrome.mjs
│   │       ├── computer-use.mjs
│   │       ├── agents.mjs
│   │       ├── planning.mjs
│   │       ├── voice.mjs
│   │       ├── auto-mode.mjs
│   │       ├── unrestricted-tools.mjs
│   │       ├── paste-images.mjs
│   │       ├── privacy.mjs
│   │       └── branding.mjs
│   ├── enhancements.json
│   └── features.json
├── unix/
│   ├── launcher.sh
│   └── lifecycle.sh
├── windows/
│   ├── launcher.cmd
│   └── lifecycle.ps1
└── template/
    ├── install.sh
    └── install.ps1
```

共同 JavaScript 只保留一份。`unix/` 和 `windows/` 只保存真正依赖平台的 launcher、参数解析、交互输入和生命周期片段。最终目录名称可在实现时做小幅调整，但职责边界和单一源码原则不可改变。

## 构建系统

`build.mjs` 是唯一构建入口，使用 Bun 标准 API和 `Bun.build`：

1. 读取并验证增强 manifest。
2. 打包 patcher entry、core 和增强模块为自包含 `patch.mjs`。
3. 读取 generic runtime 和平台片段。
4. 将内容注入两个安装器模板的显式占位符。
5. 校验 heredoc/here-string 终止标记不会与源码冲突。
6. 校验每个占位符恰好出现和替换一次。
7. 在两个输出都成功后原子替换根目录安装器。

模板占位符使用固定命名，例如：

```text
@@CLAWGOD_PATCHER@@
@@CLAWGOD_WRAPPER@@
@@CLAWGOD_PLUGIN_DEPENDENCIES@@
@@CLAWGOD_PLATFORM_LIFECYCLE@@
```

生成文件顶部必须标明：

```text
GENERATED FILE - edit src/ and run: bun build.mjs
```

命令契约：

```bash
bun build.mjs          # 原子更新 install.sh 和 install.ps1
bun build.mjs --check  # 比较内存生成结果与已提交文件，不写磁盘
```

构建必须是确定性的：固定换行、固定编码、固定模块顺序、无时间戳、无工作目录路径。`--check` 在源码缺失、manifest 无效、占位符错误、生成结果陈旧或平台片段错配时返回非零。

## 增强模型

基础能力始终启用，不进入选择菜单：

- Bun runtime 和版本检查
- Claude Code Registry 下载与提取
- wrapper、provider 和 features 加载
- ripgrep 管理
- update 路由、repatch 和 smoke verification
- launcher ownership 与卸载安全边界

用户可选择的稳定增强 ID：

| ID | 显示名称 | 负责内容 |
| --- | --- | --- |
| `chrome` | Claude in Chrome | Chrome OAuth、socket、Agents Chrome 参数与默认行为 |
| `computer-use` | Computer Use | subscription/gate/default/noninteractive 增强 |
| `agents` | Agent Teams / Agents | Agent Teams、Agents 视图与列表布局 |
| `planning` | Ultraplan / Ultrareview | Ultraplan 与多个版本形态的 Ultrareview gate |
| `voice` | Voice Mode | Voice Mode feature gate |
| `auto-mode` | Auto Mode | 第三方 provider 下的 Auto Mode 解锁 |
| `unrestricted-tools` | 工具与限制解除 | 工具恢复、过滤旁路与受限指令移除 |
| `paste-images` | macOS 粘贴与图片 | Cmd+V、TIFF、URL 与 native image processor 行为 |
| `privacy` | 隐私与地域探测处理 | geo/steganography 与地域探测中和 |
| `branding` | ClawGod 绿色品牌样式 | logo、主题色、shimmer 与标签颜色 |
| `claude-hud` | Claude HUD | marketplace、插件、精确 HUD profile 与 Bun statusLine |
| `claude-mem` | claude-mem | marketplace、插件、Hook/MCP Bun 入口与兼容 helper |
| `superpowers` | Superpowers | canonical marketplace 与插件依赖 |

一个底层 patch 只能归属于 `core` 或一个增强组。Manifest 校验拒绝重复归属、未知增强、循环依赖、缺失实现或不稳定 ID。

禁用增强的 patch 不参与匹配、应用或失败统计。启用增强中的 mandatory patch 失败会停止新安装替换，保留旧的可用安装；版本中不存在的可选形态仍按既有兼容规则报告 skipped。

## 交互选择

选择优先级：

1. `--enhancements chrome,computer-use,...` 或 PowerShell 对等参数：非交互显式选择。
2. `--choose-enhancements` 或 PowerShell 对等开关：显示交互菜单。
3. **自动询问（2026-08-14 补充）**：未传显式参数、stdin 为 TTY 且交互可用时，先显示三选一快捷菜单（全部增强 / 仅核心 / 自定义菜单）。`curl | bash`、`irm | iex`、CI 不满足 TTY 条件不询问；`claude update` 补丁向安装器注入 `CLAWGOD_NONINTERACTIVE=1` 强制跳过。
4. 已保存的 `~/.clawgod/enhancements.json`。
5. 没有任何选择信息：全部增强。

交互菜单默认全部勾选，支持输入编号切换、`a` 全选、`n` 清空、回车确认。Unix 仅在显式选择且 `/dev/tty` 可用时读取；Windows 使用 `Read-Host`。显式请求交互但没有 TTY 时打印 warning，并使用已保存选择或全部增强，不阻塞。

`curl | bash`、`irm | iex`、CI 和普通 `claude update` 都不会自动进入交互。用户可通过下载后的本地安装器或现有本地副本显式执行选择：

```bash
bash install.sh --choose-enhancements
bash ~/.clawgod/install.sh --choose-enhancements
```

```powershell
.\install.ps1 -ChooseEnhancements
```

交互中清空全部选项表示只保留核心能力。

## 持久化配置

配置文件：`~/.clawgod/enhancements.json`。

```json
{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "chrome",
    "computer-use",
    "claude-hud"
  ]
}
```

- `mode: "all"` 自动包含未来新增的增强。
- `mode: "custom"` 只启用明确保存的 ID，未来新增强默认关闭。
- 交互结果等于完整 manifest 时保存为 `all`，否则保存为 `custom`。
- 显式非交互参数也原子保存，便于后续 update 沿用。
- 数组规范化为 manifest 顺序，拒绝重复和未知 ID。
- 未知 schema、无效 JSON、符号链接、硬链接或不安全权限不会被覆盖；安装在应用 patch 前明确失败并保留旧安装。

`features.json` 继续表示 Claude Code runtime Feature Flag；`enhancements.json` 仅表示 ClawGod 安装增强。

## 安装、更新与取消选择

安装数据流：

```text
解析参数和已保存选择
  -> 必要时执行显式交互
  -> 原子保存 enhancements.json
  -> 下载并提取官方 Claude Code
  -> patch.mjs 读取已解析的选择
  -> 应用 core + enabled enhancements
  -> 生成并 smoke-test wrapper
  -> 配置或恢复插件类增强
  -> 原子发布 launcher
```

`claude update` 不弹菜单，不固定 Claude Code 版本，只读取保存的增强配置并重新运行安装流程。没有配置时按全部增强处理。

取消选择后的行为：

- 普通 runtime patch：每次从官方 Claude Code 重新生成，禁用后自然消失。
- `branding`：重新生成未改品牌的 runtime。
- `claude-hud`：恢复仍由 ClawGod 管理的 statusLine、HUD config 和相关状态；保留插件、marketplace 和用户后改。
- `claude-mem`：恢复仍由 ClawGod 管理的 Hook/MCP 入口；保留插件、memory 数据、用户设置和后改。
- `superpowers`：不再安装或升级该依赖；已安装插件和 marketplace 保留。

卸载必须忽略当前启用列表并恢复所有 ownership state 中仍由 ClawGod 管理的集成，避免用户先禁用配置再卸载时遗留修改。

## 错误与原子性

- 构建只有在两个安装器都成功渲染和校验后才写输出。
- 选择配置只有在完整验证后才原子替换。
- patcher 不发布部分成功的 runtime；mandatory failure 保留旧安装。
- 插件下载或插件配置 warning 不使 ClawGod core 安装失败，但必须保留明确摘要。
- ownership restoration conflict 不覆盖用户文件，并保留恢复证据。
- 生成模块和临时文件沿用现有 symlink、hardlink、ancestor identity、size、mode 与 race 防护。
- PowerShell 与 Unix 对相同 manifest 和配置必须得到相同 enabled ID 列表。

## 测试策略

### 构建测试

- `bun build.mjs --check` 验证生成产物最新。
- 缺失、重复和未知占位符均有失败测试。
- delimiter collision、换行、UTF-8 与平台错配有失败测试。
- 构建两次产生完全相同字节。
- 生成失败不改变任一根安装器。

### 源码测试

- patcher、Registry、archive、ripgrep、wrapper、plugin dependency 和 HUD 测试直接导入 `src/`。
- patch registry 测试确认每个 patch 恰好属于 core 或一个增强组。
- 每个增强组都有 enabled/disabled/missing-pattern/already-applied 行为测试。
- 默认全增强 patcher 对现有 fixture 生成与重构前完全相同的 patched bytes。

### 选择测试

- 无配置默认全部。
- `all` 包含以后新增增强。
- `custom` 不包含以后新增增强。
- 显式列表覆盖保存值并持久化。
- 交互切换、全选、清空和确认。
- 无 TTY 时不阻塞。
- 未知 schema 和不安全配置 fail closed。
- Unix/Windows 解析产生相同结果。
- `claude update` 沿用配置且不交互。

### 生命周期测试

- 全部、子集和 core-only 安装。
- HUD、claude-mem、Superpowers 的启用、保留较新版本、取消选择和卸载恢复。
- 用户后改和 missing managed file 保留为 conflict。
- default-all 的安装摘要、wrapper 和 runtime 与重构前等价。

### 最终验收

- 完整离线 `tests/*.mjs`。
- `bun build.mjs --check`。
- helper ZIP 可复现性检查。
- `bash -n install.sh`。
- PowerShell CI 解析与 native Windows workflow。
- 隔离临时 HOME/PATH 的 opt-in network E2E。
- 真实 HOME 指纹在验收前后完全一致。

## 文档与发布

- AGENTS 和三语 README 说明源码目录、生成命令、禁止直接编辑根安装器、交互参数和默认全部增强语义。
- `.github/workflows/compat-daily.yml` 验证 default-all、subset、core-only 和 update persistence。
- `.github/workflows/release.yml` 在上传前运行 `bun build.mjs --check`。
- 已授权将 `release.yml` 纳入范围，移除现有两处 system Git `git log`，改成不依赖 system Git 的 release-note 生成方式。
- GitHub Actions 自身的 Node24 runtime 仍不是产品依赖。

## 迁移顺序

1. 保留并完成当前 Bun-managed plugin 分支上的 Task 7 修复和审查，包含新授权的 `release.yml` policy 收口。
2. 建立 build contract、模板和 generation check，但暂不改变默认安装行为。
3. 逐块提取共同 runtime 源码，保证生成安装器与迁移前等价。
4. 拆分 patcher core 与增强模块，先保证 default-all patched bytes 等价。
5. 增加 manifest、选择解析、交互和配置持久化。
6. 接入插件增强的启用、取消选择和恢复。
7. 将测试从反向提取迁移到直接源码测试，同时保留少量生成产物契约。
8. 更新文档、CI、release workflow，执行完整隔离验收。

每个阶段独立 RED/ GREEN、提交和审查；结构迁移与功能变化不得放在同一个不可审查的大提交中。

## 验收标准

- 根安装器不再是手工源码，均能由 `bun build.mjs` 重现。
- common JavaScript 不在 Unix/Windows 目录重复维护。
- 默认无选择时全部增强，行为与重构前一致。
- 显式交互、显式列表、保存选择和 update 沿用均可用。
- 13 个增强组能独立启用或禁用；core 始终启用。
- 取消插件类增强能安全恢复 owned integrations，并保留用户数据和后改。
- CI 能发现生成文件陈旧、平台错配、policy 回归和默认行为漂移。
- 用户安装仍只需要 Bun；Shell/PowerShell 仅作为操作系统入口。
