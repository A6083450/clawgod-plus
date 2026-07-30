# ClawGod Plus Handbook

面向 Claude Code 安全研究工作流的上下文治理参考文档。

---

## 这是什么

方法论文档 + 可直接运行的 hook 脚本，帮助安全研究员在 Claude Code 中建立**可控的研究环境**。

包含：
- 方法论文档（MD）— 理解设计思想
- 可运行脚本（Python）— 复制即用，无需自己写代码
- 一键安装器 — `bash setup.sh` 或 `.\setup.ps1`

### 解决什么问题

安全研究的日常工具链在 AI Code 产品中遭遇**双层限制**：

1. **模型层**：模型把合法的安全研究请求误判为恶意请求，拒绝回答或降质
2. **客户端层**：客户端内置安全策略，在工具调用前拦截，即使模型已经同意

ClawGod Plus 解决客户端层。Session Rules 解决模型层。Guard 重建可控边界。

### 不是什么

- 不是安全研究教程
- 不是漏洞利用指南
- 不是对任何产品的攻击
- 不是绕过工具或攻击框架

---

## 快速开始

### 最小配置（5 分钟）

1. 安装 [ClawGod Plus](https://github.com/A6083450/clawgod-plus) — 解除客户端层限制
2. 复制 `01-session-rules/security-research-context.md` 到 `~/.claude/rules/`
3. 完成。两层限制同时解除。

```bash
# Step 2 一行搞定
cp 01-session-rules/security-research-context.md ~/.claude/rules/
```

### 场景配置

根据你的工作场景，额外加载对应的 rules 模板：

| 场景 | Rules 文件 | 复制到 |
|------|-----------|--------|
| CTF 竞赛 | `01-session-rules/examples/ctf-research.md` | `~/.claude/rules/` |
| 漏洞分析 | `01-session-rules/examples/vuln-analysis.md` | `~/.claude/rules/` |
| 应急响应 | `01-session-rules/examples/incident-response.md` | `~/.claude/rules/` |

不需要所有都放，只放你当前场景需要的。

### 一键安装 Hook 脚本（场景识别 + 工具守卫）

```bash
# macOS / Linux
cd clawgod-handbook/hooks && bash setup.sh

# Windows (PowerShell)
cd clawgod-handbook\hooks; .\setup.ps1
```

安装后自动生效：
- **Scene Router**：根据工作目录和关键词自动识别安全研究场景
- **Tool Guard**：Bash/Write 工具调用前的风险守卫（仅阻断 `rm -rf /` 等破坏性操作）
- **审计日志**：所有决策记录在 `~/.claude/audit/`

---

## 文档结构

```
clawgod-handbook/
├── README.md                              ← 你在这里
├── hooks/                                 ← 可直接运行的脚本
│   ├── scene-router.py                   # 场景识别 hook（复制即用）
│   ├── tool-guard.py                     # 工具守卫 hook（复制即用）
│   ├── setup.sh                          # 一键安装（macOS/Linux）
│   ├── setup.ps1                         # 一键安装（Windows）
│   └── README.md                         # 安装说明
├── 01-session-rules/                      ← Layer 1：模型层
│   ├── security-research-context.md       # 核心身份模板（必读）
│   ├── rules-reference.md                # Rules 机制解释
│   └── examples/                         # 场景 rules 模板
│       ├── ctf-research.md
│       ├── vuln-analysis.md
│       └── incident-response.md
├── 02-scene-router/                       ← Layer 2：场景识别方法论
│   ├── methodology.md                    # 三级降级设计思想
│   ├── hook-implementation.md            # Hook 实现参考
│   └── keyword-tables/                   # 关键词和否定词表
│       ├── sec-research-keywords.md
│       └── negation-filter.md
├── 03-guard-policy/                       ← Layer 3：工具守卫方法论
│   ├── pretooluse-guide.md               # Guard 实现指南
│   ├── policy-levels.md                  # 四级策略定义
│   └── examples/                         # Guard 示例
│       ├── bash-guard.md
│       ├── write-guard.md
│       └── policy-config-snippet.md
├── 04-scenarios/                          ← 端到端场景案例
│   ├── ctf-full-walkthrough.md           # CTF：从安装到解题
│   ├── vuln-research-walkthrough.md      # 漏洞研究
│   ├── code-audit-walkthrough.md         # 代码审计
│   └── ir-walkthrough.md                 # 应急响应
└── appendix/
    ├── audit-log-schema.md               # 审计日志格式
    ├── clawgod-integration.md            # 与 ClawGod Plus 配合说明
    └── compatibility.md                  # 非 Claude Code 适配
```

---

## 四层架构概览

```
用户输入
    ↓
Layer 0: ClawGod Plus Runtime Patch    ← 解除客户端黑箱限制
    ↓
Layer 1: Session Rules            ← 给模型补齐"你是谁"
    ↓
Layer 2: Scene Router             ← 判断"当前在干什么"
    ↓
Claude 模型推理
    ↓
Layer 3: PreToolUse Guard         ← 决定"工具该不该执行"
    ↓
工具执行 / 策略引擎 / 审计日志
```

**不是删除边界，而是用透明的、可配置的边界替换黑箱边界。**

---

## 设计哲学

1. **该注入时注入，不该注入时沉默** — 好的治理框架首先要知道什么时候不该介入
2. **零门槛安装** — `bash setup.sh` 一行命令，hook 脚本复制即用，不需要手写代码
3. **最小配置起效** — ClawGod Plus + 一份 Rules 文件就能解决 80% 的问题
4. **全链路可审计** — 每一层决策都可以追溯和复盘
5. **通用方法论** — 四层架构的思想可以适配其他 AI Code 产品

---

## 许可证

MIT — 自由使用、修改和分发。

与 ClawGod Plus 项目独立，不要求安装 ClawGod Plus 即可使用本文档。

---

## 免责声明

本文档仅供安全研究和教育目的。使用者应确保其行为符合当地法律法规和相关服务条款。作者不对任何滥用行为承担责任。
