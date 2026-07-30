# 非 Claude Code 产品适配思路

> 本文档说明 Handbook 的方法论如何适配其他 AI Code 产品。
> 方法论是通用的，具体实现需要根据产品 API 调整。

---

## 双层限制模型的通用性

Claude Code 的双层限制（模型层 + 客户端层）不是个例。几乎所有 AI Code 产品都有类似结构：

| 产品 | 模型层限制 | 客户端层限制 |
|------|-----------|-------------|
| Claude Code | 安全对齐 | CYBER_RISK_INSTRUCTION + Feature Flag |
| GitHub Copilot | 内容过滤 | 代码补全策略限制 |
| Cursor | 模型安全策略 | 工具调用限制 |
| Windsurf | 模型对齐 | 运行时策略 |
| Cline | 模型安全 | VS Code 扩展策略 |

Handbook 的四层架构可以通用适配。

---

## 适配 Checklist

### Layer 0 — Runtime Patch

| 产品 | 可能的 Patch 方式 | 难度 |
|------|-------------------|------|
| Claude Code | 正则 patch cli.js（ClawGod Plus 方式） | 中 |
| Cursor | 修改扩展 JS | 高（Electron 打包） |
| Cline | 修改 VS Code 扩展 | 高（扩展签名） |
| Copilot | 修改扩展 | 高（云端+本地混合） |

**结论**：Layer 0 的适配高度产品特定，ClawGod Plus 的方式不直接可移植。

### Layer 1 — Session Rules

| 产品 | 对应机制 | 适配方式 |
|------|----------|----------|
| Claude Code | `~/.claude/rules/*.md` | 直接使用 |
| Cursor | `.cursorrules` 或 system prompt 配置 | 复制 rules 内容到 .cursorrules |
| Cline | 自定义 system prompt | 复制 rules 内容到配置 |
| Copilot | `.github/copilot-instructions.md` | 复制 rules 内容 |

**结论**：Layer 1 几乎可以直接适配——只是文件名和放置位置不同。

### Layer 2 — Scene Router

| 产品 | 对应机制 | 适配方式 |
|------|----------|----------|
| Claude Code | UserPromptSubmit hook | 本文档方案 |
| Cursor | Agent hooks / pre-flight | 类似实现 |
| 其他 | 前置代理 / middleware | 在产品前加一层 |

**结论**：场景识别的方法论通用，但实现路径不同。

### Layer 3 — Guard

| 产品 | 对应机制 | 适配方式 |
|------|----------|----------|
| Claude Code | PreToolUse hook | 本文档方案 |
| Cursor | 工具调用拦截 | 需产品支持 |
| 其他 | 代理层拦截 | 在执行层加守卫 |

**结论**：策略分级（allow/confirm/downgrade/block）的设计思想完全通用。

---

## 适配优先级

1. **先适配 Layer 1**（成本最低，效果最直接）
2. **再评估 Layer 0**（看产品是否有可 patch 的入口）
3. **最后考虑 Layer 2/3**（需要产品支持 hook 机制）

Layer 1 的 Session Rules 在几乎所有产品中都能用——因为它们本质是 system prompt / 自定义指令，这是 AI Code 产品的通用能力。
