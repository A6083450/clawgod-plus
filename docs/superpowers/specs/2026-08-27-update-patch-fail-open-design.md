# `claude update` 补丁兼容失败降级设计

日期：2026-08-27

## 背景

ClawGod Plus 当前通过 bundle patch 替换 Claude Code 的 `update` action。更新时，installer 下载并提取新版官方 Claude Code，随后运行通用 patcher。只要任一 mandatory patch 因上游代码形状变化而失败，patcher 就返回非零，installer 回滚至旧 runtime。这个 fail-closed 设计保护了运行时完整性，但也导致用户无法及时升级到新版 Claude Code。

目标是：`claude update` 遇到 **ClawGod bundle 注入兼容性失败**时，仍升级到新版 Claude Code，并以“ClawGod wrapper + clean post-processed official bundle”的方式运行；下载、提取、I/O、native vendor、Bun load 等基础设施错误仍然失败并回滚。

## 目标

1. `claude update` / `claude upgrade` 不再依赖上游 bundle 中的 update action 形状。
2. 更新期间任一 mandatory bundle patch 出现兼容性失败时，不写入任何 bundle patch，但继续提交新版 clean runtime。
3. fallback runtime 保留 ClawGod wrapper 层能力，包括 provider、proxy、managed ripgrep、feature env 和后续 ClawGod 自更新入口。
4. 直接执行 installer、首次安装和 `--no-upgrade` 重打继续 fail-closed。
5. fatal patcher/installer 错误不得被误判为兼容性 fallback。
6. fallback 状态必须对用户可见，并可在后续完整 patch 成功时自动恢复。
7. Compat E2E 的正常路径仍严格要求 `0 failed`，不能因产品 fail-open 而掩盖补丁漂移。

## 非目标

1. 不实现“成功的 patch 照用、失败的 patch 跳过”的部分注入模式。
2. 不允许损坏下载、提取失败、bundle 读写失败、native vendor 发布失败或 Bun load 失败继续安装。
3. 不改变普通 Claude 命令的 launcher/provider 行为。
4. 不把首次安装改为 silent fallback。
5. 不保留 bundle 内旧的 update redirect 作为备用入口。

## 架构概览

更新控制面迁移到 wrapper，并由独立的 `self-update.cjs` 承担 installer 选择和执行：

```text
claude update [args]
  -> launcher (auto-chrome off)
  -> wrapper.cjs
  -> self-update.cjs
  -> installer (CLAWGOD_UPDATE_PATCH_FAIL_OPEN=1)
  -> patch success: patched runtime
     or compatibility fallback: clean runtime
```

普通命令保持：

```text
claude <command>
  -> launcher
  -> wrapper.cjs
  -> cli.original.cjs
```

组件边界：

- `wrapper.cjs`：只负责严格识别顶层 `update` / `upgrade` 并委派；普通命令继续配置环境后加载 bundle。
- `self-update.cjs`：解析更新参数、选择远程或可信本地 installer、跨平台 spawn、清理临时目录、传播退出码。
- `patch.mjs`：区分完整成功、bundle compatibility failure 和 fatal failure；保持 bundle 写入原子性。
- installer：仅在 updater 明确授权时接受 compatibility fallback，提交 clean runtime 并管理 fallback 状态。

## 更新控制面迁移

### wrapper 拦截

`wrapper.cjs` 在加载 `cli.original.cjs` 之前检查用户参数。仅当 `process.argv[2]` 严格等于 `update` 或 `upgrade` 时调用 updater。不得使用 `includes()` 或扫描所有 argv，避免 prompt 或后续参数中的单词误触发。

wrapper 将 `process.argv.slice(2)` 传给 updater，并使用 updater 返回的状态结束当前进程。普通命令不得加载 updater，也不得改变现有 bundle load 次数。

### `self-update.cjs`

从现有 core patch 中迁移以下行为：

- 支持 `update` 和 `upgrade`；
- 解析 `--version <value>`；
- 解析 `--no-upgrade`、`--lean-off`、`--lean-on`、`--lean-max`；
- 未显式指定版本时设置 `CLAWGOD_VERSION=latest`；
- 无参数更新总是下载 latest Release installer；
- 仅显式 `--version` 时，若 `.clawgod-version` 与本地 installer 中唯一且格式合法的版本声明一致，允许 trusted-local 零 fetch；
- 使用现有 `fetch-file.mjs` 下载固定平台 asset；
- Unix 使用 `bash <installer>`；Windows 使用 `powershell -NoProfile -ExecutionPolicy Bypass -File <installer>`；
- installer 环境包含 `CLAWGOD_NONINTERACTIVE=1` 和 `CLAWGOD_UPDATE_PATCH_FAIL_OPEN=1`；
- spawn error、signal、null status 和非零 status 均如实传播；
- 下载临时目录权限和 `finally` 清理保持现有契约。

该模块导出可测试函数，并在直接执行时运行 CLI。wrapper 通过 `require('./self-update.cjs')` 使用同一实现，不复制逻辑。

### 删除旧 bundle patch

从 `coreRegistry` 删除 `Redirect claude update to clawgod self-update` descriptor，删除其 action-shape 测试，并更新 registry 冻结 metadata、descriptor 总数和文案。不得同时保留两套更新入口。

## patcher 状态协议

### 三类结果

1. `success`
   - mandatory patches 无失败；
   - optional patches 可以正常 `skipped`；
   - patcher 写入完整 patched bundle；
   - 退出码 `0`。

2. `compatibility-fallback`
   - mandatory regex 的匹配数/known shape/sentinel 验证失败；
   - custom patch 明确返回 `failed`；
   - patcher 不写任何 bundle 文件，也不创建 `.bak`；
   - 仅在显式 fail-open CLI 模式下返回专用退出码。

3. `fatal`
   - enhancement config 读取或校验失败；
   - bundle 读取、concatenate/split、backup/write 失败；
   - patcher 自身抛出异常或内部不变量失败；
   - 返回普通非零退出码，绝不允许 installer fallback。

### 专用调用模式

installer 在 `CLAWGOD_UPDATE_PATCH_FAIL_OPEN=1` 且不是 `--no-upgrade` 时，为 patcher 增加 `--allow-compatibility-fallback`。patcher 只有在该参数存在且失败全部属于兼容性分类时才返回专用退出码 `42`。

直接 installer、首次安装、`--no-upgrade`、`--dry-run` 和 `--verify` 不启用该参数，维持现有严格退出语义。即使手动同时传入 `--allow-compatibility-fallback` 与 `--dry-run` / `--verify`，patcher 也必须忽略 fallback 授权并按原严格状态退出。

退出码 `42` 作为 patcher/installer 共享契约在测试中锁定。installer 不能通过解析人类可读日志判断是否 fallback；任何其他非零状态都属于 fatal。

### 原子性

patcher 继续在内存中尝试完整 patch set：

```text
read clean bundle
  -> calculate all replacements in memory
  -> no compatibility failures: backup + write all modules
  -> any compatibility failure: write nothing
```

fallback runtime 必须是 clean post-processed bundle，不能是部分成功的混合 bundle。

## installer 行为

### 完整成功

1. patcher 返回 `0`；
2. 发布 candidate native vendor；
3. 原子删除旧 `patch-fallback.json`；
4. 运行适用的 Chrome helper；
5. 执行 `cli.cjs --version` Bun sanity check；
6. 更新 launcher；
7. 返回成功。

### compatibility fallback

仅当以下条件同时成立时继续：

- `CLAWGOD_UPDATE_PATCH_FAIL_OPEN=1`；
- patcher 返回约定的 compatibility 状态码；
- 当前不是 `--no-upgrade`；
- clean post-processed bundle 和 candidate vendor 已正确 staging。

继续流程：

1. 打印醒目的 fallback 警告和 patcher 原始摘要；
2. 原子写入 `~/.clawgod/patch-fallback.json`；
3. 发布 candidate native vendor；
4. 跳过 legacy Chrome post-install helper，避免 fallback 后再次部分修改 bundle；
5. 执行 clean runtime 的 Bun sanity check；
6. sanity 成功后更新 launcher并返回 `0`。

### fatal failure

以下情况无论 fail-open 环境变量是否存在，都必须非零退出并触发事务回滚：

- patcher 普通非零状态；
- patcher 输出/状态协议不一致；
- candidate vendor 发布失败；
- Bun sanity check 失败；
- download/extract/post-process/I/O 失败。

回滚继续恢复 prior CLI、chunks、source marker 和 native vendor。未知 vendor 冲突保留现有 recovery evidence 语义。

## fallback 状态

### 文件格式

路径：`~/.clawgod/patch-fallback.json`

```json
{
  "schemaVersion": 1,
  "sourceVersion": "2.1.247",
  "clawgodVersion": "2026.8.27-claude.2.1.247",
  "reason": "bundle-patch-compatibility"
}
```

写入要求：

- 固定 schema 和 reason；
- source/clawgod version 来自 installer 已解析的可信值；
- 使用同目录临时文件 + rename 原子替换；
- 权限遵循现有 managed config 私有权限约束；
- 完整成功时删除；
- fatal rollback 不得错误清除此前有效状态；
- uninstall 删除该文件和临时残留。

### runtime warning

wrapper 在普通命令启动时读取并严格校验状态文件。有效状态每次启动写一次 stderr：

```text
[clawgod] Running Claude Code 2.1.247 without bundle enhancements because patch compatibility failed.
[clawgod] Run 'claude update' to retry after a ClawGod update.
```

损坏或未知 schema 的状态文件不得影响启动，也不得信任其中任意路径/命令。更新命令自身不重复打印 runtime fallback warning，只打印 updater 状态。

## wrapper 层能力

fallback 仍经 `wrapper.cjs` 加载 clean bundle，因此保留：

- `provider.json` 的 Anthropic-compatible provider 环境；
- OpenAI-compatible local proxy；
- managed ripgrep PATH；
- timeout/nonessential traffic/runtime env；
- `features.json` 到 `CLAUDE_INTERNAL_FC_OVERRIDES` 的注入；
- design payload 路径（若 clean bundle使用该环境）；
- Lean mode wrapper 控制；
- 新的 wrapper self-update 控制面。

所有 bundle 内增强均视为不可用；状态 warning 不声称任何具体增强仍工作。

## 平台和生成链

新增 canonical runtime 文件 `src/generic/runtime/self-update.cjs`，并在 `build.mjs` 中加入 runtime source map：

- Unix installer 以内联 heredoc 写入 `~/.clawgod/self-update.cjs`；
- Windows installer 以 base64 写入同一路径；
- uninstall 清理该文件；
- installer build tests 锁定 canonical source 被准确嵌入；
- generated `dist/unix/install.sh` 与 `dist/win/install.ps1` 只由 `bun build.mjs` 更新，不手工编辑。

## 测试策略

### updater / wrapper

- wrapper 仅对首个参数 `update` / `upgrade` 拦截；
- prompt/后续参数中的同名单词不拦截；
- fallback 状态下仍能再次调用 updater；
- 普通命令只加载一次 upstream bundle；
- updater 无参数远程刷新 latest installer；
- 显式可信版本保留 local zero-fetch；
- 不可信 installer 强制远程刷新；
- 参数、跨平台 command array、环境变量和退出码完全传播；
- 临时目录在成功/失败/spawn error 下都清理；
- provider 环境在 fallback 普通运行时仍传给 bundle。

### patcher

- compatibility failure + 专用参数返回专用状态；
- target/chunks 字节不变且无 `.bak`；
- compatibility failure 无专用参数仍非零；
- fatal config/read/write error 不使用专用状态；
- success 保持完整 patch 和 backup；
- `--dry-run` / `--verify` 维持严格现有行为。

### installer

- update compatibility fallback 提交新 runtime/source/vendor，写状态，跳过 Chrome helper，sanity 后返回 `0`；
- 直接 installer 相同 patch failure 回滚；
- `--no-upgrade` 相同 patch failure 回滚；
- fatal patcher error 即使授权也回滚；
- vendor/sanity failure 回滚；
- full success 清除旧状态；
- Unix 生命周期动态测试和 Windows canonical/static/native PowerShell 契约同步覆盖。

### registry 与 CI

- descriptor 冻结总数从 63 调整为 62，重新生成 metadata hash；
- 删除旧 update action-shape 测试，现有 update runtime 测试迁移到 `self-update.cjs`；
- Compat Daily 正常 E2E 继续严格解析唯一 `Result: ... 0 failed`；
- 新增离线 fallback lifecycle 契约，不降低联网兼容 smoke 的失败敏感度；
- 运行全部 `tests/*.mjs`、installer build/check、shell syntax 和 `git diff --check`。

## 成功标准

1. 人为制造 mandatory patch compatibility failure 后，`claude update` 返回 `0`，source version 升级，wrapper 可运行 clean bundle。
2. 同一失败在直接 installer 和 `--no-upgrade` 下仍返回非零并恢复 prior runtime。
3. fallback runtime 的 `claude update` 可再次进入 ClawGod updater。
4. 完整 patch 成功后 fallback 状态自动清除，warning 消失。
5. fatal/infrastructure 故障从不被 fail-open。
6. Unix 与 Windows 生成 installer 一致，完整本地 regression 通过；无本机 `pwsh` 时明确报告 Windows native execution 未在本地运行。
