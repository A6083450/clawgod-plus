# 增强选择菜单键盘交互 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把增强选择的两个菜单（顶层模式选择、自定义勾选）从行缓冲编号输入改为 raw-mode 逐键交互：↑/↓ 移动光标、空格勾选、回车确认、Esc 返回上级/顶层退出，Unix 与 Windows 两端一致。

**Architecture:** Unix 端在 `src/unix/lifecycle.sh` 内新增 raw-mode 管理原语（stty + dd 逐字节读 + VMIN/VTIME 超时区分 Esc 与箭头键前缀），重写 `choose_enhancement_mode` 与 `choose_enhancements`；Windows 端在 `src/windows/lifecycle.ps1` 内封装 `Read-EnhancementKey`（`[Console]::ReadKey`），用 `SetCursorPosition` 重绘。测试沿用现有 TTY harness（Unix 伪终端喂按键字节流）与 fixture 函数覆盖（PowerShell）。

**Tech Stack:** bash 3.2（macOS /bin/bash，installer shebang 即它）、PowerShell 5.1/7（`[Console]` API）、Bun test（测试与构建）、`script -q -e`（TTY 测试 harness）。

## Global Constraints

- 生成的 `dist/unix/install.sh` 与 `dist/win/install.ps1` 永不手改；只改 `src/` 下 canonical 源，跑 `bun build.mjs` 重建
- installer shebang 是 `#!/bin/bash`，macOS 上即 bash 3.2.57：**禁用** `read -t` 小数超时（实测报 invalid timeout specification）、`read -n1` 配 VMIN=0（死循环）；按键读取必须用 `dd bs=1 count=1` + `stty min 1 time 0` / `stty min 0 time 1` 两态
- stty 用重定向语法 `< /dev/tty`（不用 `-f`/`-F` 平台分支）；菜单输出全部走 `/dev/tty`
- 顶层 Esc 取消 = `exit 130`，取消提示文案固定为 `已取消安装`
- 勾选菜单提示行固定文案：`↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回`；顶层提示行：`回车 全部增强 · Esc 退出`
- 光标行前缀 `>`；勾选标记 `[x]`/`[ ]`；保留 `%2d)` 编号布局（仅视觉锚点）
- 全部取消后确认 → `ENHANCEMENT_CHOICE=none`；EOF（输入流提前结束）视同确认当前状态
- 测试断言配置字节精确（`assertOnlyConfig`）；不 push、不 tag、不发布（沿用项目惯例）

---

### Task 1: Unix 勾选菜单 raw-mode 键盘交互

**Files:**
- Modify: `tests/installer-enhancement-selection.mjs`（fixture PATH 加 `dd`/`stty`；`runUnixTtyCase` 支持按键字节流与期望退出码；用例迁移）
- Modify: `src/unix/lifecycle.sh:139-227`（新增 raw 原语；重写 `choose_enhancements`）
- Modify: `src/unix/lifecycle.sh:275-293`（`configure_enhancement_selection` 的 choose 分支接线）

**Interfaces:**
- Produces（供 Task 2 使用）：`clawgod_menu_raw_on` / `clawgod_menu_raw_off`（无参，返回 0/1）、`clawgod_menu_read_key`（置全局 `CLAWGOD_MENU_KEY` 为 UP/DOWN/SPACE/ENTER/ESC/EOF/`CHAR:<单字节>`）、`CLAWGOD_MENU_RENDERED_LINES`（菜单渲染状态）、`choose_enhancements`（返回 0=已确认且 `ENHANCEMENT_CHOICE` 就绪；1=raw 开启失败）

- [ ] **Step 1: fixture PATH 加入 dd 与 stty symlink**

`tests/installer-enhancement-selection.mjs` 的 `fixturePath`（约 155-171 行）中 `Object.entries({...})` 列表追加两项：

```js
    dd: '/bin/dd',
    stty: '/bin/stty',
```

（fixture 的 PATH 只有该目录，菜单用到的外部命令必须在此登记。）

- [ ] **Step 2: runUnixTtyCase 支持按键字节流输入与期望退出码**

修改 `runUnixTtyCase`（约 445-516 行）签名与 feed 逻辑：

```js
function runUnixTtyCase(label, lines, expected, {
  args = ['--choose-enhancements'],
  env = {},
  keys = null,
  expectedStatus = 0,
  expectedMenuCount = 1,
  expectedPromptCount = expectedMenuCount,
  expectedModeMenuCount = 0,
  expectedUnreadLine = null,
  expectedWarnings = [],
} = {}) {
```

shellCommand 的 feed 部分（约 465-467 行）改为：

```js
    const feed = keys === null ? `${lines.join('\n')}\n` : keys;
    const shellCommand = process.platform === 'darwin'
      ? '{ /bin/sleep 0.1; printf %s "$1"; /bin/sleep 0.1; } | "$2" -q -e /dev/null "$3"'
      : '{ /bin/sleep 0.1; printf %s "$1"; /bin/sleep 0.1; } | "$2" -q -e -c "$3" /dev/null';
```

`printf %s` 不解释转义，`keys` 是 JS 字符串时字节原样通过。status 断言（约 481 行）改为：

```js
    assert.equal(run.status, expectedStatus, `${label}: ${output}`);
```

提示行断言（约 483 行）字面量从 `'  Choice: '` 改为 `'  ↑/↓ 移动'`（新勾选菜单提示行，渲染次数与它一致）。

- [ ] **Step 3: 迁移与新增勾选用例，先跑确认失败**

替换现有用例块（约 518-540 行）。删除 `numbers`、`leading-zero-numbers`、`none`、`none-all`、`invalid-valid`、`invalid-overflow`、`invalid-empty-token`、`invalid-signed-token`、`invalid-whitespace-token`（数字/行输入已移除）。`enter` 用例输入改为按键字节。新增两个配置常量（放在 `withoutFirstTwoConfig` 定义后，约 108 行）：

```js
const withoutFirstConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "computer-use",
    "agents",
    "planning",
    "voice",
    "auto-mode",
    "unrestricted-tools",
    "paste-images",
    "privacy",
    "branding",
    "claude-hud",
    "claude-mem",
    "superpowers"
  ]
}
`;
const withoutSecondConfig = `{
  "schemaVersion": 1,
  "mode": "custom",
  "enabled": [
    "chrome",
    "agents",
    "planning",
    "voice",
    "auto-mode",
    "unrestricted-tools",
    "paste-images",
    "privacy",
    "branding",
    "claude-hud",
    "claude-mem",
    "superpowers"
  ]
}
`;
```

用例块（含断言帧内 `>` 标记位置）：

```js
runUnixTtyCase('enter', [], allConfig, { keys: '\r', expectedMenuCount: 1 });
runUnixTtyCase('space-toggle-first', [], withoutFirstConfig, { keys: ' \r', expectedMenuCount: 2 });
runUnixTtyCase('arrow-toggle', [], withoutSecondConfig, { keys: '\x1b[B \r', expectedMenuCount: 3 });
runUnixTtyCase('uncheck-all', [], noneConfig, { keys: ' '.repeat(13) + '\r', expectedMenuCount: 14 });
runUnixTtyCase('cursor-wrap', [], withoutFirstConfig, {
  keys: '\x1b[B'.repeat(13) + ' \r',
  expectedMenuCount: 15,
});
runUnixTtyCase('eof-confirm', [], allConfig, { keys: '', expectedMenuCount: 1 });
```

`cursor-wrap` 与 `arrow-toggle` 额外断言光标帧（放在用例调用后，借用 `runUnixTtyCase` 返回值 `output`）：

```js
{
  const output = runUnixTtyCase('arrow-cursor-frame', [], withoutSecondConfig, {
    keys: '\x1b[B \r',
    expectedMenuCount: 3,
  });
  assert.ok(output.includes('>  2) [ ] computer-use'), 'arrow-down frame must mark row 2 with >');
}
{
  const output = runUnixTtyCase('wrap-cursor-frame', [], withoutFirstConfig, {
    keys: '\x1b[B'.repeat(13) + ' \r',
    expectedMenuCount: 15,
  });
  assert.ok(output.includes('>  1) [ ] chrome'), 'wrapped cursor frame must mark row 1 with >');
}
```

`auto-custom` 用例（约 556 行）改为混合输入（本任务顶层仍是行输入，`'3\n'` 后接勾选按键字节）：

```js
runUnixTtyCase('auto-custom', [], withoutFirstTwoConfig, {
  args: [],
  keys: '3\n \x1b[B \r',
  expectedMenuCount: 4,
  expectedModeMenuCount: 1,
});
```

其余用例（`ci`、`auto-enter`、`auto-all`、`auto-core`、`auto-invalid`、`auto-noninteractive-env`）本任务不动，Task 2 处理。

- [ ] **Step 4: 运行测试确认失败**

Run: `bun test tests/installer-enhancement-selection.mjs`
Expected: 新按键用例失败——输出含 `Invalid enhancement choice:` 警告、`>  2)` 帧断言失败、配置不符（当前实现把 `\x1b[B` 当行输入）；`enter`/`auto-custom` 同样失败。旧数字用例已删除故不再出现。

- [ ] **Step 5: 实现 raw 原语 + 重写 choose_enhancements**

在 `src/unix/lifecycle.sh` 中，把 `choose_enhancements`（约 153-227 行）整体替换为：

```bash
# --- raw-mode 菜单原语 ---
CLAWGOD_MENU_RENDERED_LINES=0
CLAWGOD_MENU_SAVED_STTY=""

clawgod_menu_raw_on() {
  CLAWGOD_MENU_SAVED_STTY="$(stty -g < /dev/tty 2>/dev/null)" || return 1
  stty -icanon -echo min 1 time 0 < /dev/tty 2>/dev/null || {
    CLAWGOD_MENU_SAVED_STTY=""
    return 1
  }
}

clawgod_menu_raw_off() {
  if [ -n "$CLAWGOD_MENU_SAVED_STTY" ]; then
    stty "$CLAWGOD_MENU_SAVED_STTY" < /dev/tty 2>/dev/null
  fi
  CLAWGOD_MENU_SAVED_STTY=""
}

# 读取一个按键；置全局 CLAWGOD_MENU_KEY 为 UP / DOWN / SPACE / ENTER / ESC / EOF / CHAR:<单字节>
# 常态 min 1 time 0 下 dd 返回空即 EOF；ESC 判定窗口（min 0 time 1）下 dd 返回空即超时。
# dd bs=1 保证内核每次只交付 1 字节，多余字节留在队列，快速连按不吞键。
# 超时读的 dd 返回非零是正常路径，必须 `|| :` 兜住——脚本带 set -e，命令替换失败会终止安装器。
clawgod_menu_read_key() {
  local first second third
  first="$(dd bs=1 count=1 2>/dev/null < /dev/tty)" || { CLAWGOD_MENU_KEY=EOF; return 0; }
  case "$first" in
    $'\e')
      stty min 0 time 1 < /dev/tty 2>/dev/null
      second="$(dd bs=1 count=1 2>/dev/null < /dev/tty)" || :
      if [ -z "$second" ]; then
        CLAWGOD_MENU_KEY=ESC
      elif [ "$second" = "[" ]; then
        third="$(dd bs=1 count=1 2>/dev/null < /dev/tty)" || :
        case "$third" in
          A) CLAWGOD_MENU_KEY=UP ;;
          B) CLAWGOD_MENU_KEY=DOWN ;;
          *) CLAWGOD_MENU_KEY=ESC ;;
        esac
      else
        CLAWGOD_MENU_KEY=ESC
      fi
      stty min 1 time 0 < /dev/tty 2>/dev/null
      ;;
    $'\r'|$'\n') CLAWGOD_MENU_KEY=ENTER ;;
    ' ') CLAWGOD_MENU_KEY=SPACE ;;
    '') CLAWGOD_MENU_KEY=EOF ;;
    *) CLAWGOD_MENU_KEY="CHAR:$first" ;;
  esac
}

choose_enhancements() {
  # 返回 0=已确认（ENHANCEMENT_CHOICE 就绪）；返回 1=raw 开启失败
  local count=${#CLAWGOD_ENHANCEMENT_IDS[@]}
  local -a selected
  local cursor=0 i marker prefix
  for ((i = 0; i < count; i++)); do selected[$i]=1; done
  CLAWGOD_MENU_RENDERED_LINES=0

  if ! clawgod_menu_raw_on; then
    return 1
  fi

  while true; do
    if [ "$CLAWGOD_MENU_RENDERED_LINES" -gt 0 ]; then
      printf '\033[%dA' "$CLAWGOD_MENU_RENDERED_LINES" > /dev/tty
    fi
    printf '\n  Enhancements\n' > /dev/tty
    for ((i = 0; i < count; i++)); do
      marker=' '
      [ "${selected[$i]}" = "1" ] && marker='x'
      prefix='  '
      [ "$i" = "$cursor" ] && prefix='> '
      printf '%s%2d) [%s] %-20s %s\n' "$prefix" "$((i + 1))" "$marker" "${CLAWGOD_ENHANCEMENT_IDS[$i]}" "${CLAWGOD_ENHANCEMENT_LABELS[$i]}" > /dev/tty
    done
    printf '  ↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回\n' > /dev/tty
    printf '\033[J' > /dev/tty
    CLAWGOD_MENU_RENDERED_LINES=$((count + 3))

    clawgod_menu_read_key
    case "$CLAWGOD_MENU_KEY" in
      UP) cursor=$(( (cursor + count - 1) % count )) ;;
      DOWN) cursor=$(( (cursor + 1) % count )) ;;
      SPACE)
        if [ "${selected[$cursor]}" = "1" ]; then
          selected[$cursor]=0
        else
          selected[$cursor]=1
        fi
        ;;
      ENTER|EOF)
        local -a enabled=()
        for ((i = 0; i < count; i++)); do
          [ "${selected[$i]}" = "1" ] && enabled+=("${CLAWGOD_ENHANCEMENT_IDS[$i]}")
        done
        if [ ${#enabled[@]} -eq 0 ]; then
          ENHANCEMENT_CHOICE=none
        else
          local IFS=,
          ENHANCEMENT_CHOICE="${enabled[*]}"
        fi
        clawgod_menu_raw_off
        return 0
        ;;
    esac
  done
}
```

（ESC 键分支本任务不写——Task 2 加入 `ESC) clawgod_menu_raw_off; return 2 ;;`。）

`configure_enhancement_selection` 的 choose 分支（约 280-285 行）改为：

```bash
  if [ "$CHOOSE_ENHANCEMENTS" = "1" ]; then
    if enhancement_interaction_available && choose_enhancements; then
      persist_enhancement_selection "$ENHANCEMENT_CHOICE"
      return
    fi
    enhancement_warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
    persist_enhancement_selection '__CLAWGOD_SAVED__'
    return
  fi
```

（`choose_enhancements` 失败 = raw 开启失败，走既有 warning 回退；原代码 continue 到保存分支的结构改为显式 return，语义等价。）

- [ ] **Step 6: 运行测试确认通过**

Run: `bun test tests/installer-enhancement-selection.mjs`
Expected: Task 1 迁移/新增用例全部 PASS；未动的 `auto-enter` 等用例仍 PASS（顶层还是行输入，输入 `'\n'` 等行文本不受影响）。

- [ ] **Step 7: 提交**

```bash
git add src/unix/lifecycle.sh tests/installer-enhancement-selection.mjs
git commit -m "feat: Unix 自定义勾选菜单改为箭头键+空格逐键交互"
```

---

### Task 2: Unix 顶层模式菜单 raw-mode 化（数字立即响应 / Esc 退出 / Esc 返回上级）

**Files:**
- Modify: `src/unix/lifecycle.sh`（`choose_enhancements` 增加 ESC 分支返回 2；新增 `clawgod_menu_cancel_exit`；重写 `choose_enhancement_mode`；raw 管理提升到 `configure_enhancement_selection`）
- Modify: `tests/installer-enhancement-selection.mjs`（顶层用例迁移 + Esc 用例）

**Interfaces:**
- Consumes: Task 1 的 `clawgod_menu_raw_on/off`、`clawgod_menu_read_key`、`CLAWGOD_MENU_RENDERED_LINES`
- Produces: `choose_enhancement_mode`（返回 0=已确认且 `ENHANCEMENT_CHOICE` 就绪；Esc 走 `clawgod_menu_cancel_exit` 不返回）、`clawgod_menu_cancel_exit`（打印 `已取消安装` 并 `exit 130`）、`choose_enhancements` 返回码修正为 0=确认 / 2=Esc 取消（无 1）

- [ ] **Step 1: 迁移顶层用例并新增 Esc 用例，先跑确认失败**

`auto-enter`/`auto-all`/`auto-core`/`auto-invalid` 输入改为按键字节（顶层 raw 后回车是 `\r`、数字立即响应），新增 4 个用例：

```js
runUnixTtyCase('auto-enter', [], allConfig, { args: [], keys: '\r', expectedMenuCount: 0, expectedModeMenuCount: 1 });
runUnixTtyCase('auto-all', [], allConfig, { args: [], keys: '1', expectedMenuCount: 0, expectedModeMenuCount: 1 });
runUnixTtyCase('auto-core', [], noneConfig, { args: [], keys: '2', expectedMenuCount: 0, expectedModeMenuCount: 1 });
runUnixTtyCase('auto-invalid', [], noneConfig, {
  args: [],
  keys: 'x2',
  expectedMenuCount: 0,
  expectedModeMenuCount: 2,
  expectedWarnings: ['Invalid enhancement choice: x'],
});
runUnixTtyCase('custom-escape-return', [], allConfig, {
  args: [],
  keys: '3\x1b\r',
  expectedMenuCount: 1,
  expectedModeMenuCount: 2,
});
runUnixTtyCase('mode-escape-exit', [], allConfig, {
  args: [],
  keys: '\x1b',
  expectedStatus: 130,
  expectedMenuCount: 0,
  expectedModeMenuCount: 1,
});
runUnixTtyCase('choose-escape-exit', [], allConfig, {
  args: ['--choose-enhancements'],
  keys: '\x1b',
  expectedStatus: 130,
  expectedMenuCount: 1,
});
```

`mode-escape-exit` 与 `choose-escape-exit` 的 `expected` 参数传 `allConfig` 但实际不应写入配置——在这两个用例后补专门断言（`runUnixTtyCase` 的 `assertOnlyConfig` 会失败，需改为条件执行）。修改 `runUnixTtyCase` 末尾（约 511 行）：

```js
    if (expectedStatus === 0) {
      assertOnlyConfig(fixture.home, expected);
    } else {
      assert.deepEqual(readdirSync(fixture.home), [], `${label}: cancelled install must not write any config`);
      assert.equal(countOccurrences(output, '已取消安装'), 1, `${label}: cancel must print hint once`);
    }
```

`auto-custom`（Task 1 版本 `'3\n ...'`）改为纯按键字节：

```js
runUnixTtyCase('auto-custom', [], withoutFirstTwoConfig, {
  args: [],
  keys: '3 \x1b[B \r',
  expectedMenuCount: 4,
  expectedModeMenuCount: 1,
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/installer-enhancement-selection.mjs`
Expected: Esc 用例失败（当前无 Esc 处理：勾选菜单 Esc 被忽略继续循环、顶层 Esc 走 invalid warning）；`auto-enter`（feed `'\r'` 在行输入下等价空行）恰好 PASS，其余顶层用例失败或行为不符（`auto-invalid` 的 `'x2'` 是一行）。

- [ ] **Step 3: 实现顶层菜单 raw-mode 化**

`choose_enhancements` 的 case 增加 ESC 分支（替换 Task 1 中 `case "$CLAWGOD_MENU_KEY" in` 块，在其内 `ENTER|EOF)` 之前加）：

```bash
      ESC) clawgod_menu_raw_off; return 2 ;;
```

新增取消退出辅助函数（放在 `clawgod_menu_read_key` 之后）：

```bash
clawgod_menu_cancel_exit() {
  clawgod_menu_raw_off
  printf '\n  已取消安装\n' > /dev/tty
  exit 130
}
```

`choose_enhancement_mode`（约 229-250 行）整体替换为：

```bash
choose_enhancement_mode() {
  local count=${#CLAWGOD_ENHANCEMENT_IDS[@]}
  CLAWGOD_MENU_RENDERED_LINES=0
  while true; do
    if [ "$CLAWGOD_MENU_RENDERED_LINES" -gt 0 ]; then
      printf '\033[%dA' "$CLAWGOD_MENU_RENDERED_LINES" > /dev/tty
    fi
    printf '\n  ClawGod Plus 增强选择\n' > /dev/tty
    printf '   1) 全部 %d 项增强（默认，回车即选）\n' "$count" > /dev/tty
    printf '   2) 仅核心（不装任何增强）\n' > /dev/tty
    printf '   3) 自定义菜单（逐项勾选）\n' > /dev/tty
    printf '  回车 全部增强 · Esc 退出\n' > /dev/tty
    printf '\033[J' > /dev/tty
    CLAWGOD_MENU_RENDERED_LINES=5

    clawgod_menu_read_key
    case "$CLAWGOD_MENU_KEY" in
      CHAR:1|ENTER|EOF)
        local IFS=,
        ENHANCEMENT_CHOICE="${CLAWGOD_ENHANCEMENT_IDS[*]}"
        return 0
        ;;
      CHAR:2) ENHANCEMENT_CHOICE=none; return 0 ;;
      CHAR:3)
        if choose_enhancements; then
          return 0
        fi
        CLAWGOD_MENU_RENDERED_LINES=0
        ;;
      ESC) clawgod_menu_cancel_exit ;;
      *) enhancement_warn "Invalid enhancement choice: ${CLAWGOD_MENU_KEY#CHAR:}" ;;
    esac
  done
}
```

（勾选菜单确认后直接 `return 0` 到 `configure_enhancement_selection`，无需再渲染顶层；Esc 返回后 `CLAWGOD_MENU_RENDERED_LINES=0` 让顶层换行重画。）

`configure_enhancement_selection`（约 275-293 行）整体替换为：

```bash
configure_enhancement_selection() {
  if [ -n "$ENHANCEMENTS" ]; then
    persist_enhancement_selection "$ENHANCEMENTS"
    return
  fi
  if [ "$CHOOSE_ENHANCEMENTS" = "1" ]; then
    if enhancement_interaction_available && clawgod_menu_raw_on; then
      if choose_enhancements; then
        clawgod_menu_raw_off
        persist_enhancement_selection "$ENHANCEMENT_CHOICE"
        return
      fi
      clawgod_menu_cancel_exit
    fi
    enhancement_warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
    persist_enhancement_selection '__CLAWGOD_SAVED__'
    return
  fi
  if auto_prompt_available && clawgod_menu_raw_on; then
    if choose_enhancement_mode; then
      clawgod_menu_raw_off
      persist_enhancement_selection "$ENHANCEMENT_CHOICE"
      return
    fi
    clawgod_menu_cancel_exit
  fi
  persist_enhancement_selection '__CLAWGOD_SAVED__'
}
```

（raw 管理提升到此处统一开关。**必须同步删除** Task 1 版 `choose_enhancements` 内部的 raw_on 块——顶层 `CHAR:3` 与 choose 直入分支进入时 raw 已开启，重复调用 `clawgod_menu_raw_on` 会把 `CLAWGOD_MENU_SAVED_STTY` 覆盖为 raw 状态，导致退出时 `clawgod_menu_raw_off` 恢复成 raw 而非原 termios。删除后 `choose_enhancements` 返回码集合为：0=已确认、2=Esc 取消，不再有 1。）

Task 1 版 `choose_enhancements` 中的

```bash
  if ! clawgod_menu_raw_on; then
    return 1
  fi
```

三行删除（连同其前空行）。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/installer-enhancement-selection.mjs`
Expected: 全部用例 PASS（含 Task 1 用例回归、顶层 Esc 退出 130、勾选 Esc 返回上级）。

- [ ] **Step 5: 提交**

```bash
git add src/unix/lifecycle.sh tests/installer-enhancement-selection.mjs
git commit -m "feat: Unix 顶层增强菜单 raw-mode 化，Esc 返回上级/退出安装"
```

---

### Task 3: Windows 端 ReadKey 按键交互

**Files:**
- Modify: `src/windows/lifecycle.ps1:86-144`（`Read-EnhancementKey` 封装；重写 `Read-EnhancementChoice` 与 `Read-EnhancementMode`；渲染函数 + 光标重绘）
- Modify: `src/windows/lifecycle.ps1:171-185`（`Initialize-EnhancementSelection` 的 Esc 取消接线）
- Modify: `tests/installer-enhancement-selection.mjs:580-585`（静态断言）、`:609-636`（fixture 覆盖 `Read-EnhancementKey`）、`:662-676`（`runPowerShell` 加 `keySequence`）、`:679-760`（运行时用例迁移）

**Interfaces:**
- Produces: `Read-EnhancementKey`（无参，返回 `[ConsoleKey]`）、`Write-EnhancementChoiceMenu`（`[int]$Cursor, [bool[]]$Selected`）、`Write-EnhancementModeMenu`（无参）、`Read-EnhancementChoice`（返回 CSV / `none` / `$null`=Esc）、`Read-EnhancementMode`（返回 CSV / `none` / `'__CLAWGOD_CANCELLED__'`）

- [ ] **Step 1: 静态断言与 fixture 改造，先跑确认失败**

静态断言（约 582 行）：

```js
assert.match(windowsLifecycle, /Read-EnhancementKey/, 'PowerShell menu must read keys through a dedicated function');
assert.match(windowsLifecycle, /\[Console\]::ReadKey/, 'PowerShell key reading must use Console.ReadKey');
assert.match(windowsLifecycle, /\[ConsoleKey\]::ArrowUp/, 'PowerShell menu must handle ArrowUp');
assert.match(windowsLifecycle, /\[ConsoleKey\]::Spacebar/, 'PowerShell menu must handle Spacebar');
assert.match(windowsLifecycle, /\[ConsoleKey\]::Escape/, 'PowerShell menu must handle Escape');
assert.match(windowsLifecycle, /SetCursorPosition/, 'PowerShell menu must redraw via SetCursorPosition');
```

原 `Read-Host` 断言（582 行）删除。

`createPowerShellFixture`（约 609-636 行）的 mock 段整体替换：

```js
function createPowerShellFixture(prefix, promptAnswers = null, keySequence = null) {
  const fixture = createUnixFixture(prefix);
  const script = join(fixture.fixtureRoot, 'selection fixture.ps1');
  writeFileSync(script, `${windowsLifecycle}
function Write-Warn {
    param([string]$Message)
    [Console]::Error.WriteLine($Message)
}
$BunBin = $env:CLAWGOD_TEST_BUN
if ($env:CLAWGOD_TEST_KEYS) {
    $script:ClawGodTestKeys = @(ConvertFrom-Json $env:CLAWGOD_TEST_KEYS)
    $script:ClawGodTestKeyIndex = 0
    function Test-EnhancementInteractionAvailable { return $true }
    function Read-EnhancementKey {
        if ($script:ClawGodTestKeyIndex -ge $script:ClawGodTestKeys.Count) {
            throw 'key fixture exhausted'
        }
        $key = [ConsoleKey]$script:ClawGodTestKeys[$script:ClawGodTestKeyIndex]
        $script:ClawGodTestKeyIndex++
        return $key
    }
    function Write-EnhancementChoiceMenu {
        param([int]$Cursor, [bool[]]$Selected)
        Write-Host ''
        Write-Host '  Enhancements'
        for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
            $marker = if ($Selected[$i]) { 'x' } else { ' ' }
            $prefix = if ($i -eq $Cursor) { '> ' } else { '  ' }
            Write-Host ('{0}{1,2}) [{2}] {3,-20} {4}' -f $prefix, ($i + 1), $marker, $EnhancementIds[$i], $EnhancementLabels[$i])
        }
        Write-Host '  ↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回'
    }
    function Write-EnhancementModeMenu {
        Write-Host ''
        Write-Host '  ClawGod Plus 增强选择'
        Write-Host ('   1) 全部 {0} 项增强（默认，回车即选）' -f $EnhancementIds.Count)
        Write-Host '   2) 仅核心（不装任何增强）'
        Write-Host '   3) 自定义菜单（逐项勾选）'
        Write-Host '  回车 全部增强 · Esc 退出'
    }
}
Initialize-EnhancementSelection
`, 'utf8');
  return { ...fixture, script, promptAnswers, keySequence };
}
```

（fixture 覆盖渲染函数为纯 `Write-Host`——真实实现用 `SetCursorPosition`，在无控制台的测试进程里会抛异常，必须覆盖。`promptAnswers` 参数保留兼容签名，本任务内全部改用 `keySequence`。）

`powerShellEnvironment`（约 657 行）中原 promptAnswers 注入行：

```js
    ...(fixture.promptAnswers === null ? {} : { CLAWGOD_TEST_PROMPT_ANSWERS: JSON.stringify(fixture.promptAnswers) }),
```

替换为：

```js
    ...(fixture.keySequence === null ? {} : { CLAWGOD_TEST_KEYS: JSON.stringify(fixture.keySequence) }),
```

`runPowerShell`（约 662 行）签名加 `keySequence = null`，fixture 创建改：

```js
  const fixture = createPowerShellFixture(`clawgod-selection-pwsh-${label}-`, promptAnswers, keySequence);
```

- [ ] **Step 2: 迁移 PowerShell 运行时用例**

约 692-700 行：

```js
  output = runPowerShell(pwsh, 'auto-enter', [], allConfig, { keySequence: ['Enter'] });
  assert.doesNotMatch(output, /interactive enhancement selection unavailable/i, 'PowerShell auto prompt must not fall back');
  assert.equal(countOccurrences(output, 'ClawGod Plus 增强选择'), 1, 'PowerShell auto prompt exact quick-menu count');
  runPowerShell(pwsh, 'auto-core', [], noneConfig, { keySequence: ['D2'] });
  runPowerShell(pwsh, 'auto-custom', [], withoutFirstTwoConfig, { keySequence: ['D3', 'Spacebar', 'ArrowDown', 'Spacebar', 'Enter'] });
  runPowerShell(pwsh, 'auto-noninteractive', [], allConfig, {
    env: { CLAWGOD_NONINTERACTIVE: '1' },
    keySequence: [],
  });
  runPowerShell(pwsh, 'custom-escape-return', [], allConfig, { keySequence: ['D3', 'Escape', 'Enter'] });
```

勾选用例块（约 723-760 行）替换：

```js
  for (const [label, keySequence, expected, warnings] of [
    ['enter', ['Enter'], allConfig, []],
    ['arrow-toggle', ['ArrowDown', 'Spacebar', 'Enter'], withoutSecondConfig, []],
    ['uncheck-all', [...Array(13).fill('Spacebar'), 'Enter'], noneConfig, []],
  ]) {
    output = runPowerShell(pwsh, `prompt-${label}`, ['-ChooseEnhancements'], expected, { keySequence });
    assert.doesNotMatch(output, /interactive enhancement selection unavailable/i, `PowerShell ${label} prompt must not fall back`);
    assert.equal(countOccurrences(output, '  Enhancements'), keySequence.filter(k => k !== 'Enter').length + 1, `PowerShell ${label} exact menu count`);
    for (const warning of warnings) assert.equal(countOccurrences(output, warning), 1, `PowerShell ${label} exact warning count`);
  }
```

Esc 退出用例（fixture home 应为空）：

```js
  {
    const fixture = createPowerShellFixture('clawgod-selection-pwsh-cancel-', null, ['Escape']);
    try {
      const run = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fixture.script], {
        encoding: 'utf8',
        env: powerShellEnvironment(fixture),
      });
      assert.equal(run.status, 130, `PowerShell cancel must exit 130: ${run.stdout}${run.stderr}`);
      assert.deepEqual(readdirSync(fixture.home), [], 'PowerShell cancel must not write config');
    } finally {
      rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
  }
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test tests/installer-enhancement-selection.mjs`
Expected: 静态断言失败（`Read-EnhancementKey` 不存在）；若本机有 pwsh，运行时用例也失败（fixture 覆盖的函数不存在 → 调用原 `Read-Host`）。

- [ ] **Step 4: 实现 PowerShell 按键交互**

`src/windows/lifecycle.ps1` 中，`Read-EnhancementChoice` 与 `Read-EnhancementMode`（约 86-144 行）整体替换：

```powershell
function Read-EnhancementKey {
    return [Console]::ReadKey($true).Key
}

function Write-EnhancementChoiceMenu {
    param([int]$Cursor, [bool[]]$Selected)
    if ($script:ClawGodMenuRendered -gt 0) {
        [Console]::SetCursorPosition(0, $script:ClawGodMenuTop)
    } else {
        $script:ClawGodMenuTop = [Console]::CursorTop
    }
    Write-Host ''
    Write-Host '  Enhancements'
    for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
        $marker = if ($Selected[$i]) { 'x' } else { ' ' }
        $prefix = if ($i -eq $Cursor) { '> ' } else { '  ' }
        Write-Host ('{0}{1,2}) [{2}] {3,-20} {4}' -f $prefix, ($i + 1), $marker, $EnhancementIds[$i], $EnhancementLabels[$i])
    }
    Write-Host '  ↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回'
    $script:ClawGodMenuRendered = $EnhancementIds.Count + 3
}

function Write-EnhancementModeMenu {
    if ($script:ClawGodMenuRendered -gt 0) {
        [Console]::SetCursorPosition(0, $script:ClawGodMenuTop)
    } else {
        $script:ClawGodMenuTop = [Console]::CursorTop
    }
    Write-Host ''
    Write-Host '  ClawGod Plus 增强选择'
    Write-Host ('   1) 全部 {0} 项增强（默认，回车即选）' -f $EnhancementIds.Count)
    Write-Host '   2) 仅核心（不装任何增强）'
    Write-Host '   3) 自定义菜单（逐项勾选）'
    Write-Host '  回车 全部增强 · Esc 退出'
    $script:ClawGodMenuRendered = 5
}

function Read-EnhancementChoice {
    $selected = @($EnhancementIds | ForEach-Object { $true })
    $cursor = 0
    $script:ClawGodMenuRendered = 0
    while ($true) {
        Write-EnhancementChoiceMenu -Cursor $cursor -Selected $selected
        $key = Read-EnhancementKey
        if ($key -eq [ConsoleKey]::ArrowUp) { $cursor = ($cursor + $EnhancementIds.Count - 1) % $EnhancementIds.Count }
        elseif ($key -eq [ConsoleKey]::ArrowDown) { $cursor = ($cursor + 1) % $EnhancementIds.Count }
        elseif ($key -eq [ConsoleKey]::Spacebar) { $selected[$cursor] = -not $selected[$cursor] }
        elseif ($key -eq [ConsoleKey]::Enter) {
            $enabled = @()
            for ($i = 0; $i -lt $EnhancementIds.Count; $i++) {
                if ($selected[$i]) { $enabled += $EnhancementIds[$i] }
            }
            if ($enabled.Count -eq 0) { return 'none' }
            return $enabled -join ','
        }
        elseif ($key -eq [ConsoleKey]::Escape) { return $null }
    }
}

function Read-EnhancementMode {
    $script:ClawGodMenuRendered = 0
    while ($true) {
        Write-EnhancementModeMenu
        $key = Read-EnhancementKey
        if ($key -eq [ConsoleKey]::Enter -or $key -eq [ConsoleKey]::D1) { return ($EnhancementIds -join ',') }
        if ($key -eq [ConsoleKey]::D2) { return 'none' }
        if ($key -eq [ConsoleKey]::D3) {
            $choice = Read-EnhancementChoice
            if ($null -ne $choice) { return $choice }
            $script:ClawGodMenuRendered = 0
            continue
        }
        if ($key -eq [ConsoleKey]::Escape) { return '__CLAWGOD_CANCELLED__' }
        Write-Warn ("Invalid enhancement choice: $key")
    }
}
```

`Initialize-EnhancementSelection`（约 171-185 行）改为：

```powershell
function Initialize-EnhancementSelection {
    if ($EnhancementsSpecified) {
        if ([string]::IsNullOrEmpty($Enhancements)) { throw '-Enhancements requires a non-empty CSV value' }
        Write-EnhancementSelection -Explicit $Enhancements
        return
    }
    if ($ChooseEnhancements) {
        if (Test-EnhancementInteractionAvailable) {
            $choice = Read-EnhancementChoice
            if ($null -eq $choice) {
                Write-Host '  已取消安装'
                exit 130
            }
            Write-EnhancementSelection -Explicit $choice
            return
        }
        Write-Warn 'Interactive enhancement selection unavailable; using saved selection or all enhancements.'
    }
    elseif (Test-EnhancementAutoPromptAvailable) {
        $choice = Read-EnhancementMode
        if ($choice -eq '__CLAWGOD_CANCELLED__') {
            Write-Host '  已取消安装'
            exit 130
        }
        Write-EnhancementSelection -Explicit $choice
        return
    }
    Write-EnhancementSelection -Explicit '__CLAWGOD_SAVED__'
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test tests/installer-enhancement-selection.mjs`
Expected: 静态断言 PASS；有 pwsh 时全部运行时用例 PASS（无 pwsh 时运行时跳过、静态断言仍验）。

- [ ] **Step 6: 提交**

```bash
git add src/windows/lifecycle.ps1 tests/installer-enhancement-selection.mjs
git commit -m "feat: Windows 增强菜单改为 ReadKey 按键交互（箭头/空格/Esc）"
```

---

### Task 4: 重建安装器 + 全套验证

**Files:**
- Regenerate: `dist/unix/install.sh`, `dist/win/install.ps1`（`bun build.mjs` 产出，不手改）

- [ ] **Step 1: 重建安装器**

Run: `bun build.mjs`
Expected: 退出码 0，重写两个 dist 文件。

- [ ] **Step 2: 生成产物一致性校验**

Run: `bun build.mjs --check`
Expected: 退出码 0（无 Stale generated output）。

- [ ] **Step 3: 完整测试套件**

Run: `bun test tests/installer-enhancement-selection.mjs tests/installer-build.mjs tests/installer-e2e-contract.mjs`
Expected: 全部 PASS。再跑全量离线套件：
Run: `bun test tests/`
Expected: 全部 PASS（含 `bun-only-policy.mjs`、`patcher-*` 回归）。`installer-e2e.mjs` 若需网络且失败于网络错误（非断言失败），记录输出并与改前基准对比，不阻塞本计划——菜单只在交互 tty 触发，非交互安装路径不受本次改动影响。

- [ ] **Step 4: 提交**

```bash
git add dist/unix/install.sh dist/win/install.ps1
git commit -m "build: 重建含键盘交互菜单的安装器"
```

---

### Task 5: 文档同步（三语 README / AGENTS.md / 既有 spec）

**Files:**
- Modify: `README.md:102-118`, `README_EN.md:102-118`, `README_JP.md:102-118`, `AGENTS.md:79`, `docs/superpowers/specs/2026-08-10-generated-installer-enhancements-design.md`（菜单输入方式段落）

- [ ] **Step 1: README.md 中文版**

`README.md` 约 102-110 行菜单示例后补充按键说明，并在 114-118 行示例后说明 Esc 行为：

```markdown
在终端里直接运行安装器时会自动询问，无需记参数：

```
  ClawGod Plus 增强选择
   1) 全部 13 项增强（默认，回车即选）
   2) 仅核心（不装任何增强）
   3) 自定义菜单（逐项勾选）
   回车 全部增强 · Esc 退出
```

自定义菜单用键盘逐项勾选：`↑`/`↓` 移动光标（首尾循环）、`空格` 切换勾选、`回车` 确认、`Esc` 返回上级菜单。全部取消后确认等同"仅核心"。顶层按 `Esc` 取消安装。
```

- [ ] **Step 2: README_EN.md 英文版**

同段落改为：

```markdown
When running the installer directly in a terminal it asks automatically, no flags to remember:

```
  ClawGod Plus 增强选择
   1) 全部 13 项增强（默认，回车即选）
   2) 仅核心（不装任何增强）
   3) 自定义菜单（逐项勾选）
   回车 全部增强 · Esc 退出
```

The custom menu is keyboard-driven: `↑`/`↓` move the cursor (wrapping at the ends), `Space` toggles the item, `Enter` confirms, `Esc` returns to the mode menu. Confirming with everything unchecked equals core-only. Pressing `Esc` at the top level cancels the install.
```

- [ ] **Step 3: README_JP.md 日文版**

同段落改为：

```markdown
端末でインストーラーを直接実行すると自動で質問されるため、引数を覚える必要はありません：

```
  ClawGod Plus 增强选择
   1) 全部 13 项增强（默认，回车即选）
   2) 仅核心（不装任何增强）
   3) 自定义菜单（逐项勾选）
   回车 全部增强 · Esc 退出
```

カスタムメニューはキーボード操作です：`↑`/`↓` でカーソル移動（先頭・末尾でループ）、`Space` でチェック切り替え、`Enter` で確定、`Esc` で上位メニューに戻ります。すべて解除して確定するとコアのみと同じ扱いです。最上位で `Esc` を押すとインストールを中止します。
```

（三语都删除旧的 `选择 [1]:` 提示行与数字输入描述，若段落中存在。）

- [ ] **Step 4: AGENTS.md 同步**

`AGENTS.md:79` 的句子更新菜单交互描述，替换为：

```markdown
Direct local installers accept `--enhancements <csv>` / `--choose-enhancements` (Unix) and `-Enhancements <csv>` / `-ChooseEnhancements` (PowerShell). Running the installer directly in a terminal auto-prompts a quick choice (all / core-only / custom menu) via stdin-TTY detection; the menus are key-driven (`↑`/`↓` move, `Space` toggles, `Enter` confirms, `Esc` returns to the parent menu and cancels the install at the top level); piped installs, CI, and `claude update` never prompt (the update patch marks its installer spawn with `CLAWGOD_NONINTERACTIVE=1`) and reuse the saved selection, defaulting to all enhancements. Disabling `claude-hud` or `claude-mem` restores the configuration ClawGod owns, while disabling `superpowers` never deletes the user's installed plugin.
```

- [ ] **Step 5: 既有设计文档同步**

`docs/superpowers/specs/2026-08-10-generated-installer-enhancements-design.md:155` 的原文：

```markdown
交互菜单默认全部勾选，支持输入编号切换、`a` 全选、`n` 清空、回车确认。Unix 仅在显式选择且 `/dev/tty` 可用时读取；Windows 使用 `Read-Host`。显式请求交互但没有 TTY 时打印 warning，并使用已保存选择或全部增强，不阻塞。
```

替换为：

```markdown
交互菜单默认全部勾选，键盘逐键操作：`↑`/`↓` 移动光标（首尾循环）、`空格` 切换勾选、`回车` 确认、`Esc` 返回上级菜单（顶层为取消安装，exit 130）。Unix 用 `stty` 临时 raw mode + `dd` 逐字节读键，仅在显式选择且 `/dev/tty` 可用时交互；Windows 用 `[Console]::ReadKey`。显式请求交互但没有 TTY 时打印 warning，并使用已保存选择或全部增强，不阻塞。键盘交互细节见 [2026-08-14-enhancement-menu-keyboard-design.md](2026-08-14-enhancement-menu-keyboard-design.md)。
```

- [ ] **Step 6: 提交**

```bash
git add README.md README_EN.md README_JP.md AGENTS.md docs/superpowers/specs/2026-08-10-generated-installer-enhancements-design.md
git commit -m "docs: 三语 README 与 AGENTS 同步键盘交互菜单说明"
```
