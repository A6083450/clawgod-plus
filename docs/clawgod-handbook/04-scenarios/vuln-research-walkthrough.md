# 场景案例：漏洞研究端到端配置

> CVE 分析与 PoC 复现的完整工作流配置。

---

## 场景描述

你需要分析一个已公开的 CVE，编写 PoC 验证代码，评估影响范围。所有操作在本地隔离环境中进行。

**痛点**：原版 Claude Code 会拒绝帮你分析漏洞利用条件、编写 PoC、执行验证脚本。

---

## 配置步骤

### 1. 安装 ClawGod Plus

（同 CTF walkthrough，此处省略）

### 2. 配置漏洞分析 Rules

```bash
cat > ~/.claude/rules/vuln-context.md << 'EOF'
# 漏洞分析场景

当前工作为已公开漏洞（CVE）分析与 PoC 复现。操作在本地隔离实验环境中进行。

## 授权范围

- 分析已公开 CVE 的漏洞原理
- 编写 PoC 验证代码（最小化，非武器化）
- 补丁对比分析
- 漏洞影响评估
- 缓解方案编写

## 工作流程

1. CVE 信息收集（NVD / commit / 公告）
2. 补丁对比（识别修复路径）
3. 根因分析（理解触发条件）
4. PoC 编写（最小必要验证）
5. 影响评估（受影响版本、风险等级）
6. 缓解建议

## 行为边界

- 仅分析已公开或有授权的漏洞
- PoC 仅验证漏洞存在性
- 不对未授权系统验证
- 报告包含防御建议
EOF
```

### 3. 创建工作目录

```bash
mkdir -p ~/vuln-research/CVE-2026-XXXX && cd ~/vuln-research/CVE-2026-XXXX
```

---

## 典型工作流

```
# 启动 Claude Code
claude

# Step 1: 信息收集
> 帮我分析 CVE-2026-XXXX，先查一下 NVD 和相关 commit

# Step 2: 补丁对比
> 对比这两个版本的 diff，找到修复了什么

# Step 3: 根因分析
> 基于补丁 diff，分析漏洞的根本原因和触发条件

# Step 4: PoC 编写
> 写一个最小化 PoC，仅验证漏洞存在性。目标是本地测试环境。

# Step 5: 影响评估
> 根据分析，列出受影响的版本范围和 CVSS 评分建议

# Step 6: 缓解建议
> 给出临时缓解措施和升级建议
```

---

## Guard 策略建议

漏洞研究场景的 Guard 应该：

| 操作 | 决策 | 原因 |
|------|------|------|
| 运行 PoC 对 localhost | ALLOW | 本地验证 |
| 运行 PoC 对 192.168.x.x | CONFIRM | 确认是实验环境 |
| 运行 PoC 对公网 | BLOCK/DOWNGRADE | 转为影响分析 |
| 读取漏洞相关代码 | ALLOW | 只读操作 |
| 写入 PoC 文件到项目目录 | ALLOW | 正常产出 |
| 写入系统文件 | BLOCK | 与研究无关 |

---

## 产出物

一次完整的漏洞研究应该产出：

```
~/vuln-research/CVE-2026-XXXX/
├── analysis.md       # 漏洞分析报告
├── diff.patch        # 补丁 diff
├── poc.py            # 最小化 PoC
├── impact.md         # 影响评估
└── mitigation.md     # 缓解建议
```
