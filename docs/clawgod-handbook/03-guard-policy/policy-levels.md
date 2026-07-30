# 策略引擎：四级决策体系

> 本文档定义 Policy Engine 的四级策略、决策规则和配置方法。

---

## 四级策略定义

### ALLOW — 安全放行

**条件**：操作在授权范围内、风险可控、目标合规。

| 工具 | 典型操作 | 场景 |
|------|----------|------|
| Bash | 静态分析脚本执行 | 任意 |
| Bash | 检测规则生成与写入 | 任意 |
| Bash | 本地 sandbox 单元测试 | 任意 |
| Bash | 授权 CTF 环境操作 | ctf-competition |
| Write | 写入项目目录文件 | 任意 |
| Edit | 修改项目代码 | 任意 |
| Bash | `python analyze.py` | malware-analysis |
| Bash | `python exploit.py`（对 localhost） | ctf-competition |

**执行**：工具正常执行，决策写入审计日志。

---

### CONFIRM — 确认后执行

**条件**：操作有可控风险，需要用户显式确认。

| 工具 | 典型操作 | 场景 |
|------|----------|------|
| Bash | 实验室内网络扫描 | authorized-pentest |
| Bash | sandbox 内 exploit 复现 | vuln-analysis |
| Bash | VM 内二进制执行 | malware-analysis |
| Bash | 数据库操作（INSERT/UPDATE/DELETE） | 任意 |
| Write | 写入项目外目录 | 任意 |
| Bash | `nmap -sV 192.168.x.x` | authorized-pentest |

**执行**：暂停工具执行，向用户展示操作内容和风险，等待确认。

---

### DOWNGRADE — 降级替代

**条件**：操作目标或方式超出当前授权范围，但可提供替代方案。

| 原始操作 | 降级替代 | 原因 |
|----------|----------|------|
| 公网目标 nmap 扫描 | 转为影响分析和防御建议 | 未授权扫描公网目标 |
| exploit 开发（完整利用链） | 转为检测规则生成 | 降级为防御产出 |
| 可疑 bash 命令 | 转为静态审查建议 | 降低执行风险 |
| 生成完整 weaponized payload | 生成最小化 PoC 概念验证 | 限制产出物的可武器化程度 |

**执行**：修改工具输入，将高风险操作转为低风险替代方案。记录原始意图和降级原因。

---

### BLOCK — 直接阻断

**条件**：绝对红线，无条件阻断。

| 类别 | 操作示例 |
|------|----------|
| 凭据窃取 | `cat /etc/shadow`, `mimikatz`, `hashdump` |
| 破坏性操作 | `rm -rf /`, `mkfs`, `dd if= of=/dev/sda` |
| 未授权访问 | 对无授权目标执行攻击 |
| 持久化行为 | 植入后门、crontab 持久化、registry 自启动 |
| 大规模扫描 | `masscan 0.0.0.0/0`, `nmap -sS -p- 10.0.0.0/8` |
| 系统文件篡改 | 写入 `/etc/passwd`, `/boot/`, `/System/` |

**执行**：工具不执行。记录阻断原因到审计日志。向用户返回阻断原因和建议的替代方案。

---

## 策略配置参考

策略规则应该是可配置的，不是硬编码。以下是一个策略配置文件的参考结构：

```json
{
  "version": 1,
  "default_action": "allow",
  "rules": [
    {
      "id": "block-destructive",
      "tool": ["Bash"],
      "pattern": "rm -rf /|mkfs|dd if=.*of=/dev/",
      "action": "block",
      "reason": "破坏性操作"
    },
    {
      "id": "confirm-network-scan",
      "tool": ["Bash"],
      "pattern": "nmap|masscan|rustscan",
      "conditions": {
        "target_not_localhost": true,
        "scene_in": ["authorized-pentest", "vuln-analysis"]
      },
      "action": "confirm",
      "reason": "网络扫描需确认"
    },
    {
      "id": "downgrade-public-scan",
      "tool": ["Bash"],
      "pattern": "nmap|masscan",
      "conditions": {
        "target_is_public": true,
        "scene_not_in": ["authorized-pentest"]
      },
      "action": "downgrade",
      "downgrade_to": "影响分析",
      "reason": "公网扫描未授权"
    }
  ]
}
```

---

## 关键原则

> **如果系统只有 ALLOW，它就是绕过器。**
> **如果系统有 ALLOW / CONFIRM / DOWNGRADE / BLOCK / LOG，它才是治理层。**

1. 策略的边界由用户自己定义——不同场景、不同用户有不同的风险承受能力
2. 默认策略应该偏宽松（ALLOW）——Guard 的目标是精细化，不是重建被 ClawGod Plus 移除的黑箱
3. BLOCK 规则应该是明确和无争议的——只阻断真正不可接受的操作
4. 所有决策必须记录——没有审计的策略等于没有策略
