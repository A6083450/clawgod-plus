# 移除 Superpowers 实施计划

**目标：** ClawGod 不再携带、安装或显示 Superpowers，旧配置继续可升级。

**约束：** 用户已确认范围；保留已有未提交改动、历史文档和用户其他插件；不提交、不推送、不重装本机。

## Task 1：产品移除与回归

文件：src/generic/enhancements.json、src/generic/enhancement-config.mjs、src/generic/runtime/plugin-dependencies.mjs、src/{unix,windows}/lifecycle.*、tests/ 对应契约、.github/workflows/compat-daily.yml、README{,_EN,_JP}.md、AGENTS.md。

1. 先新增 tests/remove-superpowers.mjs，验证插件基线仅 hud/memory、共享 manifest 与菜单无此项、默认/旧版配置不启用此项、显式废弃 ID 拒绝。运行 bun tests/remove-superpowers.mjs，记录预期失败。
2. 删除插件基线、映射、专属源包装和分支；移除菜单项与标签；保持其他插件完整安全验证。
3. 读取旧 canonical 配置时仅迁移 superpowers；保留 schema、重复/未知 ID、规范顺序与格式校验。显式 CSV 继续严格校验。
4. 同步现有测试中的清单、计数（22→21，其他计数按实际 manifest）、插件保留 marker（仅 hud/memory）；归档安全用例改用保留插件，不降低安全测试。已有 Superpowers 用户安装应不被后续 ensure 改动。
5. 更新三语产品说明与 AGENTS.md，只保留两项插件；历史 docs/superpowers/ 不改写。
6. 运行针对性测试：bun tests/remove-superpowers.mjs、bun tests/enhancement-config.mjs、bun tests/installer-plugin-dependencies.mjs、bun tests/installer-enhancement-selection.mjs、bun tests/patcher-registry.mjs、bun tests/patcher-enhancement-selection.mjs、bun tests/installer-e2e-contract.mjs、bun tests/bun-only-policy.mjs。

## Task 2：生成物与独立验收

1. 运行 bun build.mjs 与 bun build.mjs --check，不手改 dist。
2. 运行构建契约与所有 tests/*.mjs，记录失败并区分既有问题。
3. 基于卸载前快照生成本次增量 diff，独立审查：无 Superpowers 下载/安装路径、旧配置迁移无额外行为、未触碰历史文档和用户数据。
4. 保存验证结果并更新工作状态；报告是否修改本机运行时（本任务不重装）。
