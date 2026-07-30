# ClawGod Plus 集成说明

> 本文档说明 Handbook 与 ClawGod Plus 的配合关系。

---

## 关系定位

| 组件 | 提供者 | 解决的问题 |
|------|--------|-----------|
| ClawGod Plus | [GitHub](https://github.com/A6083450/clawgod-plus) | 客户端运行时限制（Layer 0） |
| Session Rules | 本文档 `01-session-rules/` | 模型层身份与场景声明（Layer 1） |
| Scene Router | 本文档 `02-scene-router/` | 动态场景识别（Layer 2） |
| Guard + Policy | 本文档 `03-guard-policy/` | 工具调用策略（Layer 3） |
| 审计日志 | 本文档 `appendix/audit-log-schema.md` | 全链路审计 |

**松耦合**：Handbook 的每个模块都可以独立使用，不依赖 ClawGod Plus。但没有 ClawGod Plus 时，客户端层的限制仍然存在。

---

## 配合矩阵

| 配置组合 | 效果 |
|----------|------|
| 仅 ClawGod Plus | 客户端限制解除，但模型仍可能拒绝 |
| 仅 Session Rules | 模型减少拒绝，但客户端仍会拦截工具调用 |
| ClawGod Plus + Rules | 双层限制同时解除（推荐最小配置） |
| ClawGod Plus + Rules + Guard | 解除限制 + 重建可控边界（推荐完整配置） |
| ClawGod Plus + 全栈 | 完整治理框架 |

---

## 安装顺序

```
1. 安装 ClawGod Plus        → 解除客户端层限制
2. 配置 Session Rules   → 解决模型层误判
3. （可选）配置 Scene Router Hook → 动态场景切换
4. （可选）配置 Guard Hook        → 重建可控边界
```

不需要一次全部配置。ClawGod Plus + Rules 已经能解决 80% 的问题。

---

## 版本兼容

ClawGod Plus 的 patch 通过正则匹配实现，高度依赖 Claude Code 的 minified 代码结构。

当 Claude Code 更新后：
1. ClawGod Plus 的 patch 可能失效（部分 pattern 不匹配）
2. 但 Session Rules 不受影响（它们是独立的 MD 文件）
3. Guard Hook 也不受影响（它们不修改 Claude Code 本身）

建议在 ClawGod Plus 更新后重新运行安装命令，让 patcher 重新适配新版本。
