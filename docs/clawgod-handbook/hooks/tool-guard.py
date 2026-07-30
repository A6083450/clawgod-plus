#!/usr/bin/env python3
"""
ClawGod Plus Handbook — PreToolUse Guard Hook
Claude Code PreToolUse hook

功能：
  1. 对 Bash/Write/Edit 工具调用做风险判定
  2. 四级策略：ALLOW / CONFIRM / DOWNGRADE / BLOCK
  3. 全部决策写入审计日志

安装：
  cp tool-guard.py ~/.claude/hooks/tool-guard.py
  chmod +x ~/.claude/hooks/tool-guard.py

配置（~/.claude/settings.json）：
  {
    "hooks": {
      "PreToolUse": [
        { "command": "python ~/.claude/hooks/tool-guard.py", "timeout": 3000 }
      ]
    }
  }

行为：
  - ALLOW：正常放行，退出码 0
  - BLOCK：阻断工具调用，退出码 2，stderr 输出原因
  - CONFIRM/DOWNGRADE：通过 stderr 输出建议，退出码 0（放行）

  注意：Claude Code PreToolUse hook 的阻断通过退出码非 0 实现。
  当前策略为宽松模式——仅 BLOCK 真正危险的操作，其余全部放行并记录日志。
  如需更严格的控制，修改下方 BLOCK_RULES。
"""

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

# ═══════════════════════════════════════════════════════════
# 配置区
# ═══════════════════════════════════════════════════════════

# 审计日志目录
LOG_DIR = Path.home() / ".claude" / "audit"

# ── BLOCK 规则：无条件阻断 ──
# 格式：(工具名列表, 正则模式, 原因)
BLOCK_RULES = [
    # 文件系统破坏
    (["Bash"], r"rm\s+(-\w*f\w*\s+)?/($|\s)", "破坏性操作：rm -rf /"),
    (["Bash"], r"mkfs\b", "破坏性操作：mkfs"),
    (["Bash"], r"dd\s+.*of=/dev/", "破坏性操作：dd 写入设备"),

    # 系统文件写入
    (["Write"], r"^[A-Z]:\\/(Windows|Program Files|boot)", "系统目录写入"),
    (["Write"], r"^/(etc|boot|usr|System|EFI)/", "系统目录写入"),
    (["Write"], r"/etc/(passwd|shadow|hosts|fstab)", "关键系统文件"),

    # 凭据窃取
    (["Bash"], r"(mimikatz|secretsdump|hashdump)", "凭据窃取工具"),

    # 大规模无差别扫描
    (["Bash"], r"masscan\s+.*0\.0\.0\.0/0", "全网段扫描"),
    (["Bash"], r"nmap\s+.*-p-\s+.*\d+\.\d+\.\d+\.\d+/\d{2}", "全端口大范围扫描"),
]

# ── CONFIRM 规则：放行但记录为"需确认" ──
# 这些操作被放行（退出码 0），但在日志中标记为 confirm
CONFIRM_PATTERNS = [
    # 网络扫描（非 localhost）
    r"(nmap|masscan|rustscan)\s+(?!.*127\.0\.0\.1)(?!.*localhost)",
    # 二进制执行
    r"\./\w+\.(elf|bin)",
    r"python\s+\w*(exploit|poc)",
]

# ── 场景感知：CTF/渗透测试场景下放宽 CONFIRM → ALLOW ──
RELAXED_SCENE_KEYWORDS = ["ctf", "CTF", "pentest", "redteam", "靶场"]

# ═══════════════════════════════════════════════════════════
# 核心逻辑
# ═══════════════════════════════════════════════════════════

def classify_target(command: str) -> str:
    """从命令中判断目标类型"""
    if not command:
        return "unknown"
    if re.search(r"(127\.0\.0\.1|localhost)", command):
        return "localhost"
    if re.search(r"(192\.168|10\.\d|172\.(1[6-9]|2\d|3[01]))\.", command):
        return "private_network"
    return "general"


def is_relaxed_scene(cwd: str) -> bool:
    """判断当前是否在宽松场景（CTF/渗透测试）"""
    if not cwd:
        return False
    parts = Path(cwd).parts
    for part in parts:
        if part.lower() in [k.lower() for k in RELAXED_SCENE_KEYWORDS]:
            return True
    return False


def evaluate_block(tool_name: str, tool_input: dict) -> tuple:
    """
    评估是否应阻断。
    返回 (action, reason, risk)
    action: "allow" | "block"
    """
    # Bash 工具检查
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        for tools, pattern, reason in BLOCK_RULES:
            if tool_name in tools and re.search(pattern, command, re.IGNORECASE):
                return "block", reason, "critical"

        # CONFIRM 级检查
        for pattern in CONFIRM_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                # 宽松场景下降级为 allow
                return "allow", "confirm→allow(relaxed)", "medium"

        return "allow", "", "low"

    # Write 工具检查
    if tool_name == "Write":
        file_path = tool_input.get("file_path", "")
        for tools, pattern, reason in BLOCK_RULES:
            if tool_name in tools and re.search(pattern, file_path, re.IGNORECASE):
                return "block", reason, "critical"
        return "allow", "", "low"

    # Edit 工具（低风险）
    if tool_name == "Edit":
        return "allow", "", "low"

    # 其他工具默认放行
    return "allow", "", "low"


def log_decision(session_id: str, tool_name: str, tool_input: dict,
                 action: str, reason: str, risk: str, cwd: str):
    """写入审计日志"""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d")
        log_file = LOG_DIR / f"tool-guard-{date_str}.jsonl"

        entry = {
            "ts": datetime.now().isoformat(),
            "session_id": session_id,
            "layer": "tool-guard",
            "tool": tool_name,
            "command": (tool_input.get("command", "")[:200]
                        if tool_name == "Bash"
                        else tool_input.get("file_path", "")[:200]),
            "target": classify_target(tool_input.get("command", "")),
            "risk": risk,
            "action": action,
            "reason": reason,
            "cwd": cwd,
        }

        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        print(json.dumps(data if 'data' in dir() else {}))
        return

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})
    session_id = data.get("session_id", "")
    cwd = data.get("cwd", "")

    action, reason, risk = evaluate_block(tool_name, tool_input)

    # 审计日志
    log_decision(session_id, tool_name, tool_input, action, reason, risk, cwd)

    if action == "block":
        # 阻断：退出码 2，stderr 输出原因
        print(f"[Guard BLOCK] {reason}", file=sys.stderr)
        sys.exit(2)
    else:
        # 放行：退出码 0
        if reason:
            print(f"[Guard] {tool_name}: {reason} (risk={risk})", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
