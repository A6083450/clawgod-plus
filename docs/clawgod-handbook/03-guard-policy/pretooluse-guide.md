# PreToolUse Guard 实现指南

> 本文档解释 Claude Code 的 PreToolUse hook 机制，以及如何用它构建工具调用守卫。
> 给出方法思路和配置片段，不是可直接运行的代码。

---

## 为什么需要 Guard

ClawGod Plus 解除了客户端层的黑箱限制后，工具调用不再被自动拦截。这带来一个新问题：

**Agent 时代真正危险的不是模型说了什么，而是它准备提交什么动作。**

模型可以安全地讨论 SQL 注入原理（text output），但如果它尝试对生产数据库执行 `DROP TABLE`（tool call），这才是真正的风险。

PreToolUse Guard 把工具调用从黑箱动作变成可治理的事务。

---

## PreToolUse Hook 机制

### 触发时机

```
用户输入 prompt
    ↓
Claude 推理
    ↓
Claude 决定调用工具（tool_use）
    ↓
[PreToolUse Hook] ← 在这里拦截
    ↓
工具执行 / 被阻断
```

### Hook 输入

Hook 通过 stdin 接收 JSON：

```json
{
  "session_id": "xxx",
  "tool_name": "Bash",
  "tool_input": {
    "command": "nmap -sV 192.168.1.0/24",
    "description": "Network service scan"
  },
  "cwd": "/home/user/projects/pentest",
  "hook_event_name": "PreToolUse"
}
```

### Hook 输出

```json
{
  "decision": "allow|confirm|downgrade|block",
  "reason": "授权范围内的网络扫描",
  "modified_input": null,
  "log": true
}
```

---

## 策略决策框架

### 四级策略

| 级别 | 含义 | 执行方式 |
|------|------|----------|
| ALLOW | 安全，直接放行 | 工具正常执行，记录日志 |
| CONFIRM | 可控风险，需确认 | 弹出确认提示给用户 |
| DOWNGRADE | 高风险，转为替代方案 | 修改工具输入，降低风险 |
| BLOCK | 绝对红线，直接阻断 | 工具不执行，记录原因 |

### 决策输入

Guard 做决策时需要以下信号：

| 信号 | 来源 | 示例 |
|------|------|------|
| tool_name | hook 输入 | Bash, Write, Edit |
| command / content | hook 输入 | 实际命令或文件内容 |
| cwd | hook 输入 | 当前工作目录 |
| scene | Scene Router | ctf-competition, vuln-analysis |
| target | 上下文推断 | localhost, 192.168.x, 公网 IP |

### 风险评估矩阵

| 工具 | 操作 | 目标 | 场景 | 风险 | 决策 |
|------|------|------|------|------|------|
| Bash | `python analyze.py` | 本地文件 | malware-analysis | LOW | ALLOW |
| Bash | `nmap -sV 192.168.1.0/24` | 内网 | authorized-pentest | MEDIUM | CONFIRM |
| Bash | `nmap -sV target.com` | 公网 | vuln-analysis | HIGH | DOWNGRADE |
| Bash | `rm -rf /` | 系统 | any | CRITICAL | BLOCK |
| Write | `/tmp/yara-rule.yar` | 临时目录 | malware-analysis | LOW | ALLOW |
| Write | `/etc/passwd` | 系统文件 | any | CRITICAL | BLOCK |

---

## 配置片段

### settings.json 中注册 hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "command": "python ~/.claude/hooks/tool-guard.py",
        "timeout": 3000
      }
    ]
  }
}
```

### 工具分类参考

```
高敏感工具（需要严格守卫）：
  - Bash（可执行任意命令）
  - Write（可覆盖文件）

中敏感工具（轻量守卫）：
  - Edit（修改已有文件，范围有限）

低敏感工具（可默认放行）：
  - Read, Glob, Grep（只读操作）
  - WebSearch（查询操作）
```

---

## 实现思路

### 分层检测

```
1. 解析 tool_name → 确定工具类型
2. 解析 tool_input → 提取实际命令/内容
3. 模式匹配 → 识别危险模式（rm -rf、dd、mkfs、格式化等）
4. 目标识别 → 判断目标是本地/内网/公网/系统文件
5. 场景关联 → 结合 Scene Router 结果
6. 策略匹配 → 查找匹配的策略规则
7. 输出决策 → allow / confirm / downgrade / block
```

### 危险模式库

```
BLOCK 级（无条件阻断）：
  - rm -rf /, rm -rf /*, mkfs, dd if= of=/dev/
  - 写入系统文件：/etc/passwd, /etc/shadow, /boot/
  - 凭据窃取：cat /etc/shadow, mimikatz, dump hashes
  - 持久化：crontab -, launchctl load, registry run keys
  - 大规模扫描：masscan 0.0.0.0/0

CONFIRM 级（需用户确认）：
  - 网络扫描（非 localhost）
  - 文件写入（非项目目录）
  - 二进制执行（非已知安全工具）
  - 数据库操作（非 SELECT）

DOWNGRADE 级（自动降级）：
  - 公网扫描 → 转为影响分析
  - exploit 开发 → 转为检测规则生成
  - 可疑命令 → 转为静态审查建议
```

---

## 设计原则

1. **默认不阻断** — Guard 的目标是精细化控制，不是把安全研究也拦住
2. **场景感知** — CTF 环境下的 nmap 扫描和公网上的 nmap 扫描是完全不同的风险等级
3. **决策可追溯** — 每次决策都记录到审计日志，包括决策理由
4. **可配置** — 策略规则应该是配置文件，不是硬编码。用户可以调整自己的风险边界
5. **Guard 不是替代 ClawGod Plus 的限制** — 而是用透明的、可配置的策略替换黑箱限制
