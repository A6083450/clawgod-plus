# Code Mode 本地启用设计

## 已确认目标

用户于 2026-11-14 确认移除 Code Mode 专属的官方登录、Provider/模型资格和联网初始化限制；模型请求继续使用已有 Provider API，不要求离线模型推理。保留显式启用、首次风险确认、工具权限、沙箱、管理员明确禁用、mods 兼容性和引擎自检。不自动安装、提交或发布。

## 实现边界

Claude Code 2.1.325 内置 Code Mode 是本地 JavaScript REPL，入口是 `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1`，不是 `/code` 命令。公开 Bun 1.4.4 的原始 VM 自检及 hardening 已实测通过，不伪造全局 standalone 或 Bun.ant。2.1.322 带有不同的早期 opt-in 实现，但不属于本补丁支持范围；旧版本必须按版本下界跳过，不能因其同名 feature 字串而阻止稳定版安装。

复用既有 custom patch 管线，新建独立 `code-mode` 增强，默认 all 模式包含；custom 模式未选择则不改。只修改 Code Mode opt-in 模块的本地资格函数：公开 Bun 可运行、允许第三方 Provider/凭据和模型，不读取远端 feature gate；review/finalize 不等待 feature/settings/policy 网络，也不要求远端组织身份已读取。仍检查本地 managed env 明确禁用、工具 deny、交互入口限制、HIPAA/ZDR/OTel 兼容限制、引擎检查和 mods。

## 安全和漂移

不改 REPL 执行器、VM hardening、auto mode 的审核单位、原工具调用权限和用户确认。现有 Agents 增强默认强制开启 Teams，会与 Code Mode 的官方安全互斥冲突；显式请求 Code Mode 时，只停止 ClawGod 隐式强开 Teams，原生显式 Teams 仍由原互斥拒绝。以相关局部函数的结构契约和导出关系识别形态；缺失、歧义或函数语义变化返回 stale，不能部分写入。重跑幂等，dry-run/verify 不写入。不新增依赖。

## 验收

- 真实 2.1.325 opt-in 模块离线行为：第三方 Provider、无官方账号和 feature payload 可进入首次确认，确认后进入 on；不调用官方 flags/settings/policy 初始化。
- shell/settings 显式关闭、管理员禁用、工具拒绝、非交互/远控、引擎失败、mods 不兼容仍拒绝。
- 保留首次 caveat 持久化和重启流程。
- 漂移、歧义、改名、幂等和增强选择测试。
- 隔离 HOME 的完整候选启动及本地模拟 Provider 的 REPL 工具 round-trip，不发送真实模型请求。
- 生成双平台安装器，运行受影响测试和全套回归；不把 macOS 验收外推成 Linux/Windows 原生验收。
