# 上游 v2.3.1 同步与冲突记录

## 范围

- 上游：`0Chencc/clawgod` 的 `v2.3.1`，提交 `ad4de4dcd9c9fd55a958c1168545755eeeae6463`。
- 前次功能同步基准：`v2.2.0`，提交 `4038ca932c3539911dfc8b97fcce3ab788185f96`。
- 本地起点：`main` 的 `713204a6168415cf4a0e9471e1742f22872fd553`；工作分支 `sync/upstream-v2.3.1`。
- 两仓没有以 v2.2.0 为共同祖先的连续合并历史。比较范围是上游两个标签之间的八个提交，采用功能移植，不直接覆盖 fork 或合入上游生成安装器。
- 本地验收阶段未更改本机安装、用户配置或现有未跟踪的 `generated-images/`，也未执行提交、推送或发布。后续发布阶段在用户另行授权后推进，远端结果以对应 PR、CI 和 Release 记录为准。

## 八项增量与处理

| 上游提交 | 功能或流程差异 | 本地处理与冲突取舍 |
| --- | --- | --- |
| `53dc028` | 屏蔽 `wiggly-dove` 自动 Git / 环境采集 | 移入 `privacy` 的 AST 补丁；独立 `wiggly-dove` 运行时开关，不新增安装增强 ID。 |
| `a2f5dda` | 说明隐私覆盖范围和开关 | 三语 README 补充默认行为、恢复方式和非全面禁遥测的边界。 |
| `0185f0f` | PR 的 AI 披露与 AST 要求 | 新增贡献文档和 PR 模板；遵循本分支 Bun-only 命令与源码生成流程。 |
| `b5cf6cb` | 恢复未配对工具结果 | 移入核心 AST 补丁 `tool-result-pairing-recovery`，保留独立开关。 |
| `b2f583c` | 恢复过程中保护词法绑定 | 使用作用域/绑定验证，覆盖同名变量、回调与嵌套作用域，不采用文本替换。 |
| `949c4c7` | 维护嵌入资源原始 loader 语义 | 不引入上游 `bunfs/` 布局；新增 `asset-loaders.json`，保留本地 `chunks/` / `assets/`，使用现有内嵌 AST 解析器。 |
| `a08cfc9` | 补丁排除嵌入资源 | 本地原本只扫描 entry/chunks，行为已等价；增加代码形状的 text/file 资源字节守恒回归，而非重写扫描器。 |
| `ad4de4d` | Auto Mode inline/helper/cached AST 识别；CI 准备阶段优化 | provider 补丁迁移为 AST，保留模型限制和开关。Linux 已使用私有、校验固定的 ripgrep 15.2.0，不降级为上游 15.1.0；定时兼容问题仅在安装阶段开始后才报告。 |

## 冲突清单

1. **源码路径和资源布局冲突**：上游 `src/shared/`、`src/templates/`、`bunfs/` 与本地组织不同。按功能映射到 `src/generic/`、`src/template/`，不覆盖整个文件。
2. **后处理器语义冲突**：本地包含 2.1.332 公共字符格渲染器与严格 ABI/import 冻结。只增加 loader 记录与资源加载变换，保持渲染器拒装机制。
3. **旧安装恢复冲突**：已安装版本可能没有 loader 元数据。`--no-upgrade` 缺元数据时恢复精确已安装版本，忽略另传的新版本，不选 `latest`；元数据加入运行时事务、clean-source 校验和卸载清理。
4. **补丁注册/开关冲突**：本地已有 Ship、Code Mode 等补丁占用 order。新增补丁使用空闲 order，保持 22 个安装增强；新增隐私与核心开关不并入其他开关。Auto Mode 原 regex 描述符迁移为 AST，而不是叠加第二组补丁。
5. **生成文件冲突**：上游根目录安装器与本地 `dist/` 均为生成物，不做文本合并；仅由本地 `bun build.mjs` 重建。
6. **流程冲突**：保留本地 Bun-only、私有 ripgrep、Windows 按变更触发、默认 Lean 关闭和发布策略；不带入上游原生 shim、Node 测试命令或多余依赖。

## 保留的 fork 功能

Bun-only 运行时、公开字符格渲染器及 2.1.332 形态、Voice / Cometix、Ship 本地资格、Code Mode 本地资格、增强选择与独立运行时开关、Provider/Lean 行为、事务回滚和活跃会话不强杀策略。

## 验证记录

### 已完成的运行时验证

- 使用已校验的 Bun Canary 1.4.6 重建 Unix / Windows 安装器，`build.mjs --check`、Bash 语法和 `git diff --check` 通过。
- 官方 Claude Code 2.1.332 三平台包均通过新提取器及后处理器；完整模块图 dry-run 如下。每个平台的 `wiggly-dove` 与工具结果恢复均各命中一处。

| 包平台 | chunk 数 | applied | skipped | failed | warning |
| --- | ---: | ---: | ---: | ---: | ---: |
| macOS ARM64 | 3683 | 58 | 30 | 0 | 1 |
| Linux x64 | 3664 | 56 | 32 | 0 | 1 |
| Windows x64 | 3663 | 55 | 33 | 0 | 1 |

唯一 warning 是既有 Chrome `subscriptionMsg` 识别器缺少对应形态。Auto Mode 三种 AST 补丁在真实 2.1.332 图中均无对应形态，按设计跳过；其行为由 inline/helper/cached 夹具验证，不能算作该版本的实机 Auto Mode 验证。

- macOS 上临时 HOME 的真实初装、`--no-upgrade` 重装和卸载 E2E 通过：两次安装均 `59 applied / 29 skipped / 0 failed / 1 warning`，增强选择 `22 enabled / 0 disabled`；配置与插件保留、版本一致性及卸载清理通过。首次尝试因 npm 下载 `ECONNRESET` 失败，重试通过；该网络失败不记为成功。
- 资源 loader、资源原字节、提取编码、事务恢复、缺元数据的精确版本恢复、PowerShell 回退控制流焦点测试通过。PowerShell 测试在 macOS 的 `pwsh` 执行，不等于 Windows 原生安装器 E2E。

### 独立复核与继承边界

资源链独立复核未发现本次移植新增的确定缺陷，也未确认新增事务回滚漏洞；确认以下两个已有边界，本轮保留并披露，不扩大移植范围：

1. 提取器原有的 basename 扁平化可能覆盖不同目录的同名资源。例如 `a/guide.mjs` 与 `b/guide.mjs` 会落到同一个 `assets/guide.mjs`，两个映射最终都读取后者内容。
2. 上游 v2.3.1 的直接 `import.meta.require(variable)` 不在字面量资源包装范围。若变量最终指向可执行的 text 资源，可能按模块加载，而非返回源字符串；require 别名路径和字面量路径已覆盖。

补充扫描真实 2.1.332 三平台后处理图：每个平台 247 项资源，资源目标路径碰撞均为零；排除生成 wrapper 自身的 fallback 后，动态参数的直接 `import.meta.require` 调用均为零。当前已检图未出现上述触发形态，不代表未来版本或其他输入不存在。

五套字符格回归通过：2.1.332、2.1.330、segmenter、structure、contract；其中 segmenter 包含 101 项公开 Bun 字符格渲染契约检查。

### 全量回归与最终验收

最终统一使用 Bun Canary 1.4.6，重跑全部 81 个测试入口，81 个退出零、零失败。常规循环中的 `installer-e2e.mjs` 默认跳过，不将该退出零当作真实 E2E 通过；真实初装 / 不升级重装 / 卸载 E2E 已另外执行并通过，结果见上。另对 64 项源码与构建产物逐项比较 SHA256，确认验证期间无漂移，最终 `build.mjs --check` 与 `git diff --check` 通过。

首轮以系统 Bun 1.4.4 执行时，81 个入口中 78 个退出零、3 个失败。首轮失败记录保留，没有计为成功：

- `installer-bun-runtime.mjs`：系统 Bun 1.4.4 的现场打包字节与 Canary 1.4.6 构建的安装器不同；使用同一 Canary 复验已通过，未放宽字节断言。
- `patcher-2.1.215.mjs`：AST provider opt-in 的等价语法改写及新增两个描述符使旧指纹/计数过期；核对实际输出后更新预期，单独复验通过。
- `installer-enhancement-selection.mjs`：首轮 `choose-sigint-exit` 期望退出 130、实际退出 2；未修改产品或测试时序，用 Canary 独立连续三轮均通过。保留首轮瞬时失败记录，不能由三次通过证明其根因。

三项均在最终 Canary 全量回归中通过。逐项退出码、初次失败、重试 E2E 和真实包扫描证据保存在本地验收记录中。以上为 `sync/upstream-v2.3.1` 的本地验收阶段历史记录：当时未运行远端三平台 CI、未改动本机安装，也未提交、推送或发布；完整 Windows 原生安装器验证交由后续 Windows CI。后续远端验证、合并和发布状态以对应 PR、CI 和 Release 记录为准。
