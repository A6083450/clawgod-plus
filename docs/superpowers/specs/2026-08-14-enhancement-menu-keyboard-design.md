# 增强选择菜单键盘交互设计（箭头键导航 + Esc 退出）

日期：2026-08-14
状态：已批准设计，待实施

## 背景与问题

ClawGod 安装器的增强选择菜单（`--choose-enhancements` 与终端直接运行时的自动询问）目前是**行缓冲编号输入模式**：

- Unix（`src/unix/lifecycle.sh`）：`IFS= read -r answer < /dev/tty` 读整行，case 只识别数字 / 逗号分隔数字 / `a` / `n` / 空行
- Windows（`src/windows/lifecycle.ps1`）：`Read-Host` 行读取，同样的数字切换逻辑

用户报告的两类缺陷：

1. 自定义勾选菜单不能用箭头键移动选择——按 ↑/↓ 时终端发送的转义序列（`\e[A` / `\e[B`）被当作无效输入报错循环
2. Esc 键没有反应——行缓冲模式下单独按 Esc 甚至不会把 `\e` 字节提交给 read，无法实现返回/退出

根因：菜单从未实现按键级（raw mode）交互，只有行级解析。

## 交互规格（Unix / Windows 两端一致）

### 顶层「ClawGod Plus 增强选择」菜单（1 全部 / 2 仅核心 / 3 自定义）

| 按键 | 行为 |
|---|---|
| `1` / `2` / `3` | 立即执行对应选项（raw mode 下无需回车） |
| 回车 | 默认选 1（全部增强） |
| Esc | 打印取消提示，退出安装（exit 130，与 Ctrl-C 的 128+SIGINT 惯例一致） |

### 自定义勾选菜单（13 项，逐键响应）

| 按键 | 行为 |
|---|---|
| ↑ / ↓ | 移动光标，到顶/底后循环；当前行以 `>` 前缀标记（不用 ANSI 反显，避免老 conhost 显示乱码） |
| 空格 | 切换当前项勾选 `[x]` / `[ ]` |
| 回车 | 确认并保存当前勾选；全部取消时等同 `none`（保持现有行为） |
| Esc | 放弃本轮修改，返回顶层菜单 |

- **移除数字 / 逗号 / `a` / `n` 行输入**：勾选菜单改为纯箭头键导航（用户决策），README 三语中的数字输入示例与对应 TTY 用例同步改写
- 两个菜单底部各加一行快捷键提示：勾选菜单为 `↑/↓ 移动 · 空格 勾选 · 回车 确认 · Esc 返回`；顶层菜单为 `回车 全部增强 · Esc 退出`
- 非交互回退不变：CI / 无 tty 时仍走现有 warning 回退路径；`--enhancements` 显式参数优先，不受影响

## Unix 实现（`src/unix/lifecycle.sh`）

### Raw mode 管理

- `stty -g < /dev/tty` 保存旧状态，`stty -icanon -echo min 1 time 0 < /dev/tty` 切 raw mode（重定向写法同时兼容 macOS 与 GNU stty，无需 `-f`/`-F` 平台分支）
- 菜单所有退出路径（确认、返回、顶层退出、EOF）统一先恢复 stty 再返回；stty 切换失败则打印现有 warning 并走保存选择回退路径

### 按键读取与转义序列解析

- 常驻 raw mode 为 `stty -icanon -echo min 1 time 0`（阻塞等首字节），用 `key=$(dd bs=1 count=1 2>/dev/null < /dev/tty)` 逐字节读取——`bs=1` 保证内核每次只交付 1 字节、剩余字节留在队列，快速连按不会吞键；每次按键一个 dd 进程，spawn 开销对人无感知
- 读到 `\e`（ESC 字节）后临时切 `stty min 0 time 1`（VMIN=0 / VTIME=1，100ms 超时读）判定键序：
  - dd 读第二字节超时（空）→ 判定用户按了 Esc
  - 读到 `[` → dd 读第三字节，`A` 判 ↑、`B` 判 ↓，其他视为 Esc
  - 读到其他字节 → 视为 Esc
- 分派后切回 `min 1 time 0`
- 回车判定同时兼容 `\r`（真实终端 Enter 发送的字节）与 `\n`
- 常态 dd 返回空（EOF，输入流提前结束）→ 视同确认当前状态：勾选菜单按当前勾选确认，顶层菜单按默认 1 处理——与现有行输入模式 EOF（空 answer）语义一致
- 设计依据（已实测验证）：macOS `/bin/bash` 是 3.2.57，`read -t` 不支持小数超时（报 "invalid timeout specification"），且 `read -n1` 在 VMIN=0 下会死循环等待凑满字节；dd + VMIN/VTIME 不依赖 bash 版本特性，在 bash 3.2 + macOS pty 下原型验证通过（箭头序列三字节正确判定、单独 Esc 100ms 超时返回）

### 菜单渲染

- 首次渲染后记录已渲染行数；每次重绘输出 `\e[{n}A` 光标回退到菜单顶，整块重画后 `\e[J` 清尾——不清用户终端的 scrollback
- 行格式保留现有 `%2d) [x] id label` 编号布局（编号仅作视觉锚点，无输入功能），当前行行首加 `>`
- 全部输出走 `/dev/tty`（沿用现有约定）

## Windows 实现（`src/windows/lifecycle.ps1`）

- 按键读取封装为 `Read-EnhancementKey` 函数（内部 `[Console]::ReadKey($true)`），返回 `ConsoleKey` 枚举——ArrowUp / ArrowDown / Spacebar / Enter / Escape / D1-D3 直接枚举匹配，无需解析转义序列；封装函数同时是测试的注入点
- 重绘用 `[Console]::SetCursorPosition(0, menuTop)` + 整块重写（纯 .NET API，不依赖 VT 序列），当前行 `>` 前缀与 Unix 一致
- `Test-EnhancementInteractionAvailable` 的 `IsInputRedirected` 检查已挡掉无控制台场景，保持不变

## 错误处理与回退

| 场景 | 行为 |
|---|---|
| CI / 非 tty（既有检查不通过） | 现有 warning 回退：使用已保存选择或全部增强 |
| stty 切换失败（tty 可读写但 termios 不可改） | 同上 warning 回退 |
| 顶层 Esc | 打印取消提示，exit 130，不写入任何配置 |
| 勾选菜单 Esc | 返回顶层菜单，勾选状态不保存 |

## 测试策略（`tests/installer-enhancement-selection.mjs`）

### Unix TTY 用例

harness 不变（`script -q -e` 伪终端 + 管道喂入），输入从「整行文本」改为「原始按键字节流」：

| 用例 | 输入字节 | 期望 |
|---|---|---|
| 顶层立即响应 | `2`（无回车） | 仅核心配置，顶层菜单渲染 1 次 |
| 顶层 Esc 退出 | `\x1b` | exit 130、无配置写入 |
| 勾选切换 | `\x1b[B` 空格 `\r` | 第 2 项关闭，其余全开 |
| Esc 返回上级 | `\x1b` `\r` | 回到顶层菜单再默认全选 |
| 全取消确认 | 空格 ×13 `\r` | `none` 配置 |
| 光标循环 | `\x1b[B` ×13 | 光标回到第 1 项（断言 `>` 标记） |
| EOF 回退 | 输入提前结束 | 等同确认当前勾选 |

- 断言口径：菜单渲染次数 = 按键次数 + 1；harness 需支持期望非零退出码（顶层 Esc 用例）
- 原数字输入用例（`numbers`、`leading-zero-numbers`、`none`、`none-all`、`invalid-*` 系列）删除
- 每个单独 Esc 判定有约 100ms 的 VTIME 超时开销，单用例总耗时可接受
- compat-daily CI 是非交互跑安装器，不触发菜单，不受影响

### Windows 用例

- fixture 机制不变（已有 override 交互函数模式）：override `Read-EnhancementKey` 注入 `ConsoleKey` 序列（与原 `promptAnswers` mock `Read-Host` 同构），断言最终配置 + 菜单渲染次数
- 静态断言同步更新：`Read-Host` 断言替换为 `ReadKey` / `ConsoleKey` / `SetCursorPosition` 断言
- CI 无 pwsh 时（`findPwsh` 返回 null）自动跳过运行时用例，静态断言始终执行

## 文档同步

- `README.md` / `README_EN.md` / `README_JP.md`：增强选择章节改为箭头键交互说明（↑↓ 移动、空格勾选、回车确认、Esc 返回/退出），删除数字输入示例
- `AGENTS.md`：同步增强选择章节的交互描述
- `docs/superpowers/specs/2026-08-10-generated-installer-enhancements-design.md`：同步菜单输入方式与 Esc 语义

## 交付步骤

1. 改 `src/unix/lifecycle.sh`：raw mode 管理 + 按键读取 + 两个菜单改造
2. 改 `src/windows/lifecycle.ps1`：`Read-EnhancementKey` 封装 + `ConsoleKey` 循环 + `SetCursorPosition` 重绘
3. 改 `tests/installer-enhancement-selection.mjs`：Unix TTY 用例改写为按键字节流 + 新用例；Windows fixture 与静态断言更新
4. `bun build.mjs` 重建 `dist/unix/install.sh` 与 `dist/win/install.ps1`
5. 跑完整测试套件验证
6. 三语 README、AGENTS.md、既有设计文档同步
7. 提交到本地 main（不 push，沿用项目惯例）
