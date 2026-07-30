# Claude Code Rules 机制参考

> 本文档解释 Claude Code 的 rules 加载机制，帮助理解 session rules 的生效原理和配置方法。

---

## Rules 加载层级

Claude Code 从以下位置自动加载 rules，按优先级从高到低：

| 优先级 | 位置 | 作用域 | 路径示例 |
|--------|------|--------|----------|
| 1 | 系统指令 | 全局，不可覆盖 | 内置 |
| 2 | 项目级 CLAUDE.md | 当前项目 | `./CLAUDE.md` |
| 3 | 项目级 .claude/rules/ | 当前项目 | `./.claude/rules/*.md` |
| 4 | 用户级 CLAUDE.md | 所有项目 | `~/.claude/CLAUDE.md` |
| 5 | 用户级 rules/ | 所有项目 | `~/.claude/rules/*.md` |

`~/.claude/rules/` 目录下的所有 `.md` 文件会在每次会话启动时自动加载到上下文中。

## 生效机制

Rules 的本质是**上下文注入**——它们被写入每次对话的 system prompt 中。模型根据这些上下文理解用户身份、工作场景和行为边界。

关键点：
- Rules 不修改模型权重或运行时逻辑
- Rules 的效力取决于模型对指令的遵循程度
- 过长或相互矛盾的 rules 会稀释效果（控制总量在合理范围）
- Rules 对**模型层**拒绝有效，对**客户端层**拦截无效

## 配置方法

### 创建 rules 目录

```bash
mkdir -p ~/.claude/rules
```

### 添加 rules 文件

```bash
# 复制模板
cp security-research-context.md ~/.claude/rules/

# 或直接创建
cat > ~/.claude/rules/my-context.md << 'EOF'
# My Context
你的身份和场景声明...
EOF
```

### 验证 rules 生效

在 Claude Code 中：
```
/rules
```
查看当前已加载的 rules 列表。

### 多 rules 组合

`~/.claude/rules/` 下可以有多个 `.md` 文件，Claude Code 会全部加载。建议按场景拆分：

```
~/.claude/rules/
├── security-research-context.md   # 身份与授权声明
├── coding-style.md                # 编码风格偏好
└── project-conventions.md         # 项目特定约定
```

## Session Rules vs Hooks

| 机制 | 作用时机 | 能做什么 | 不能做什么 |
|------|----------|----------|------------|
| Rules | 会话启动时加载 | 影响模型对请求的理解和判断 | 无法修改请求内容或拦截工具调用 |
| Hooks | 运行时触发 | 修改 prompt、拦截工具调用、追加上下文 | 无法改变模型对身份的理解 |

Rules 解决"模型懂不懂你"，Hooks 解决"工具链能不能跑"。

## 与 ClawGod Plus 的关系

| 限制类型 | 由谁解决 | 机制 |
|----------|----------|------|
| 模型拒绝/降质 | Session Rules | 上下文注入，让模型正确理解场景 |
| 客户端 CYBER_RISK 拦截 | ClawGod Plus | Runtime patch 移除拦截指令 |
| Feature Flag 限制 | ClawGod Plus | GrowthBook override |
| 工具调用前阻断 | ClawGod Plus + Guard Hook | Patch 移除限制 + Hook 重建可控边界 |

**只有 Rules 没有 ClawGod Plus**：模型愿意回答但客户端仍会拦截。
**只有 ClawGod Plus 没有 Rules**：客户端不拦截但模型仍然会拒绝。
**两者配合**：双层限制同时解除。
