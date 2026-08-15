# ClawGod Plus 插件下载源改为 GitHub 直连设计

日期：2026-08-15

## 背景

ClawGod Plus 安装器为三个可选增强插件（claude-hud、claude-mem、Superpowers）下载固定 tag 归档时，目前统一经过 `https://hub.211107.xyz/` 镜像代理转发 GitHub。用户要求不再依赖第三方镜像，改为直接从 GitHub 拉取；拉取失败时给出明确的报错说明，而不是现在只有一条 `download failed` 且丢弃了底层错误原因。

## 目标

- 三个插件基线 URL 全部直连 `https://github.com/`，不再经过 `hub.211107.xyz`。
- 拉取失败时错误信息包含：插件名、完整 URL、失败原因（HTTP 状态码或网络错误摘要）与排查建议。
- 保持现有安全模型不变：只下载固定 tag、字节长度与固定 SHA-256 双重校验通过才解压。
- 保持现有失败语义不变：单个可选插件下载失败是 warning，ClawGod 核心安装继续，`ensure` 退出码仍为 0。
- 保持 Unix 与 Windows 安装器行为对齐，不新增任何运行时依赖。

## 非目标

- 不做 GitHub 失败后的镜像自动回退（用户明确要求只用 GitHub 并报错）。
- 不把下载源做成环境变量可覆盖的配置。
- 不修改三个插件的版本、`bytes`、`sha256` 基线。
- 不改动历史设计文档（`docs/superpowers/plans/` 与既有 spec 是记录性质）。
- 不在本次工作中 push、tag、发布或创建 GitHub Release。

## 改动设计

### 1. 下载源（`src/generic/runtime/plugin-dependencies.mjs` 的 `PLUGIN_BASELINES`）

三个 `url` 字段去掉 `https://hub.211107.xyz/` 前缀：

| 插件 | 新 URL |
|---|---|
| hud | `https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz` |
| memory | `https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz` |
| superpowers | `https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz` |

### 2. 错误信息（`downloadAndStage`）

当前两处失败路径都只抛 `` `${spec.key}: download failed` ``，且 `Bun.spawnSync` 捕获的 `stderr` 被丢弃。改为：

- 读取 `result.stderr` 摘要：utf8 解码、压缩空白、截断约 300 字符，空则省略原因段。
- `exitCode !== 0` 时抛：
  `` `${spec.key}: download failed from ${spec.url} (exit code ${result.exitCode}): ${stderr 摘要} — check your network connection or configure HTTPS_PROXY` ``。
- `spawnSync` 本身抛异常时抛：
  `` `${spec.key}: download failed from ${spec.url}: ${error.message}` ``。
- 新文案以 `hud: download failed` 开头，兼容测试中的 `/hud: download failed/i` 断言。

### 3. 传播语义（不变）

`ensurePluginDependencies` 继续把下载异常转为 warning 结果；`printPluginResults` 将 detail 压缩成一行输出，完整 URL 与原因对用户可见；`ensure` 退出码保持 0，install.sh 的核心安装继续。

### 4. 测试同步（`tests/installer-plugin-dependencies.mjs`）

`expected` 基线对象中三个 `url` 改为 GitHub 直连 URL，与 `PLUGIN_BASELINES` 的 deepEqual 断言一致。其余断言不改。

### 5. 文档同步（三语 README）

三语 README 中"通过选定的 `hub.211107.xyz` 代理下载"的描述改为"直接从 GitHub 拉取固定 tag 归档"，保留"字节长度与固定 SHA-256 都匹配才解压"的说明。

### 6. 构建与验证

- `bun build.mjs` 重建 `dist/unix/install.sh` 与 `dist/win/install.ps1`。
- 运行全量离线测试（含 `installer-plugin-dependencies.mjs`），确认无回归。
- 按项目惯例直接提交 main。

## 风险与控制

- **GitHub 不可达（网络受限环境）**：失败信息包含完整 URL、HTTP 状态码与 `HTTPS_PROXY` 排查建议；核心安装不受影响，用户可稍后重跑安装器补装。
- **错误信息泄漏或过长**：stderr 摘要压缩空白并截断，只保留失败原因首段。
- **测试与源码漂移**：`expected` 基线与 `PLUGIN_BASELINES` 同步更新，全量测试锁住一致性。

## 交付边界

实现完成到本地代码、测试、文档与重建后的安装器产物。除非用户另行明确要求，不执行真实 HOME 安装、push、tag、发布或远端部署。
