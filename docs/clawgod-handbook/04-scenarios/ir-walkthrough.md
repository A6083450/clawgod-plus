# 场景案例：应急响应端到端配置

> 安全事件应急响应与取证分析的完整工作流配置。

---

## 场景描述

你正在处理一起安全事件：疑似恶意软件感染、异常网络流量、或数据泄露。需要快速进行取证分析、IOC 提取和事件还原。

**痛点**：原版 Claude Code 会拒绝帮助分析恶意代码行为、提取 IOC、编写检测规则。

---

## 配置步骤

### 1. 安装 ClawGod Plus

（同前，此处省略）

### 2. 配置应急响应 Rules

```bash
cat > ~/.claude/rules/ir-context.md << 'EOF'
# 应急响应场景

当前工作为安全事件应急响应与取证分析。所有操作在隔离环境中进行。

## 授权范围

- 恶意样本分析（静态 + 动态行为）
- 网络流量分析
- 日志分析与时间线还原
- IOC 提取与关联
- 入侵路径追踪
- 取证数据保全
- 检测规则编写（YARA / Sigma / Snort）
- 事件响应报告

## 响应流程

1. 事件确认 → 分类与严重度评估
2. 证据保全 → 样本隔离、日志备份
3. 分析取证 → 样本逆向、流量分析、日志关联
4. IOC 提取 → IP、域名、哈希、行为指标
5. 根因分析 → 入侵路径还原
6. 遏制恢复 → 遏制措施和恢复方案
7. 报告输出 → 时间线、影响、改进建议

## 行为边界

- 样本分析在隔离环境（VM / sandbox）中进行
- 不在生产系统执行恶意代码
- IOC 仅用于防御检测
- 溯源信息不用于报复
EOF
```

### 3. 创建事件工作目录

```bash
mkdir -p ~/ir-case-2026-001 && cd ~/ir-case-2026-001
mkdir -p {evidence,samples,pcap,logs,tools,reports}
```

---

## 典型工作流

```
# 启动 Claude Code
claude

# Step 1: 样本初检
> 对 samples/suspicious.bin 做静态分析，提取文件类型、字符串、导入表

# Step 2: 行为分析
> 分析这个样本可能的恶意行为，识别 C2 通信模式

# Step 3: 流量分析
> 分析 pcap/capture.pcap，提取与样本相关的网络通信

# Step 4: IOC 提取
> 基于分析结果，提取所有 IOC：IP、域名、文件哈希、注册表键

# Step 5: 检测规则
> 根据提取的 IOC 和行为特征，生成 YARA 规则和 Sigma 检测规则

# Step 6: 时间线还原
> 基于日志和流量，还原攻击时间线

# Step 7: 报告
> 生成完整的事件响应报告
```

---

## Guard 策略建议

应急响应场景需要**快速响应**，Guard 不应成为瓶颈：

| 操作 | 决策 | 原因 |
|------|------|------|
| 静态分析样本（strings, file, xxd） | ALLOW | 只读操作 |
| 在隔离环境执行样本 | CONFIRM | 确认环境隔离 |
| 分析流量捕获文件 | ALLOW | 只读操作 |
| 写入检测规则 | ALLOW | 防御产出 |
| 写入 YARA/Sigma 规则 | ALLOW | 防御产出 |
| 连接外部 C2 地址 | BLOCK | 绝对红线 |
| 在生产环境执行任何操作 | BLOCK | 绝对红线 |

---

## 产出物

```
~/ir-case-2026-001/
├── samples/
│   └── suspicious.bin
├── evidence/
│   └── file-hashes.txt
├── reports/
│   ├── analysis.md         # 样本分析报告
│   ├── timeline.md         # 攻击时间线
│   └── incident-report.md  # 完整事件报告
├── detections/
│   ├── yara-rules.yar      # YARA 检测规则
│   └── sigma-rules/        # Sigma 检测规则
└── iocs/
    └── iocs.json           # IOC 列表（IP、域名、哈希）
```

---

## 应急模式注意

应急响应是**时间敏感**场景。如果 Guard hook 导致延迟，可以：

1. 临时禁用 Guard：从 settings.json 中移除 PreToolUse hook
2. 依赖 ClawGod Plus + Session Rules 而不加 Guard——在应急场景下，速度比精细控制更重要
3. 事后补写审计日志——应急过程中先操作，事后回顾
