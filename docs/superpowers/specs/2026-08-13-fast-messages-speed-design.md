# Claude Code Fast Messages `speed` 注入设计

**日期：** 2026-08-13  
**状态：** 已获设计批准，待用户审核本文档

## 目标

当用户在 Claude Code 客户端启用 Fast mode（`/fast`）时，ClawGod 让当前发往任意 Anthropic Messages API 的 `/v1/messages` 请求同时携带 Fast mode 的完整能力对：

```http
anthropic-beta: fast-mode-2026-02-01
```

```json
{
  "speed": "fast"
}
```

该行为不按 `baseURL`、域名、模型或 provider 类型白名单限制。关闭 Fast mode 时，请求不得包含 `speed` 字段或 `fast-mode-2026-02-01` beta capability。

## 非目标

- 不修改 `openai-proxy.cjs`。
- 不修改 OpenAI Chat Completions 的 `/chat/completions` 请求。
- 不发送 `service_tier`。
- 不新增 provider 配置字段，也不改变 `provider.json` schema。
- 不改变 Claude Code 的 Fast mode 选择、定价、资格或服务端可用性；ClawGod 只将客户端已有的 Fast 状态表达为 Messages 请求参数。

## 架构与数据流

ClawGod 的 `install.sh` 和 `install.ps1` 都内嵌生成 `~/.clawgod/patch.mjs`。安装时，`patch.mjs` 对官方 Claude Code 解压得到的 `cli.original.cjs` 应用版本兼容补丁。

新增 Fast patch 将：

1. 定位官方 bundle 中 Fast mode 的实际运行时状态与 Anthropic Messages 请求 payload 构造位置。
2. 保持官方状态的原有语义不变。
3. 仅在该状态为启用时，为当前 `/v1/messages` payload 增加 `speed: "fast"`，并在 `anthropic-beta` 中加入 `fast-mode-2026-02-01`。
4. 保留既有的 `anthropic-beta` capability，并将 Fast capability 与其合并为单个逗号分隔的 header，不重复发送该 header。
5. 状态未启用时不写入 `speed`，也不加入该 Fast beta capability。
6. 让请求继续走 Claude Code 原本配置的 Anthropic Messages 传输路径，因此该字段和 header 会发往当前 `ANTHROPIC_BASE_URL` 指向的 `/v1/messages`。

补丁不接触 `openai-proxy.cjs`。若用户配置 `type: "openai-compat"`，其本地代理仍沿用现有转换逻辑，本功能不向 OpenAI 请求增加任何字段。

## 兼容性与故障处理

官方 Claude Code bundle 为压缩产物，内部符号和结构可随版本变化。Fast patch 必须遵循现有 patcher 的兼容性模式：

- 使用可验证的目标形状和唯一替换点，避免宽泛正则误改无关逻辑。
- 写入明确的 `appliedMarker`，并在补丁后验证注入逻辑存在。
- 不匹配的版本要在补丁汇总中明确报告 Fast patch 的匹配/应用状态。
- Fast patch 的强制性应与实际匹配稳定性一致：已确认的 bundle 版本应被验证；未知新版本不能静默声称该能力有效。
- 绝不在 Fast mode 未启用时默认写入 `speed` 或加入 Fast beta capability，避免把请求错误升级到 Fast tier。
- `speed: "fast"` 与 `anthropic-beta: fast-mode-2026-02-01` 是成对的协议能力；不得只注入其中之一。
- 对已有 `anthropic-beta` header 必须保留所有现有 capability；Fast capability 不存在时才追加，已存在时不得重复。

## 实现范围

1. 在 `install.sh` 的 `patch.mjs` 模板中增加 Fast Messages patch。
2. 在 `install.ps1` 的对应模板中加入完全等价的 Fast Messages patch。
3. 为补丁规则新增或扩展 fixture，覆盖 Fast 开启和关闭两个 payload 结果。
4. 扩展安装器模板契约测试，确保 Unix 和 Windows 生成的 patcher 都含等价 Fast patch。
5. 在 README（必要时 AGENTS.md）记录：Fast mode 开启时，ClawGod 会在 Anthropic Messages 请求中成对添加 `speed: "fast"` 和 `anthropic-beta: fast-mode-2026-02-01`；服务端是否支持该能力由当前 API provider 决定。

## 验证标准

- 对目标 Claude Code bundle fixture，Fast mode 开启的 Messages payload 包含精确的 `speed: "fast"`，且 `anthropic-beta` 包含 `fast-mode-2026-02-01`。
- Fast mode 关闭的 Messages payload 不包含 `speed`，且请求 header 不含该 Fast beta capability。
- 已有 `anthropic-beta` capability 在 Fast mode 开启与关闭时均保持不丢失、不重复。
- 原 payload 的模型、消息、流式标志、工具与其他字段保持不变。
- Unix 和 Windows 安装器生成的 `patch.mjs` 均包含并验证同一补丁。
- 现有 patcher 与安装器契约测试继续通过。
- `openai-proxy.cjs` 的实现和 OpenAI 请求 payload 均不被本功能改变。
