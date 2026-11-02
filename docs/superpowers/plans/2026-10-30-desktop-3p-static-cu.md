# Desktop 4.4212.0 第三方静态 CU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为用户主动启用 CU 的第三方本地静态部署补齐缺失功能项，保留已有拒绝与系统授权。

**Architecture:** 复用现有桌面 shell 的私有候选、Python ASAR 校验/重建、Electron 完整性字典 digest 和逐组件签名；新增显式 --prepare-cu，只改 3p 方法受限分支。保留已安装汉化和普通汉化操作。

**Tech Stack:** Bash、Python 3 标准库、Bun、macOS codesign。

**Spec:** `/Users/liangjiaquan/.claude/plans/woolly-singing-clock.md`（已批准）。

## Global Constraints

- 仅 4.4212.0；3p static 且用户 chicagoEnabled===true 才补三个不存在的 own-key。
- 1p、remote/hybrid、已有 false/null/对象、组织、HIPAA、OS/TCC、逐应用授权/TTL 不变。
- 只新增 --prepare-cu，不自动安装、退出或启动应用，不恢复安装器自动增强。
- 保留汉化/浏览器，不提交、不推送、不覆盖并发改动或清理备份。

## Review Focus

- source map 后续过滤：测试真实 hardcoded 合并链，不能只改 source 返回值。
- 用户关闭及切换 remote：每次读取重新按条件计算，不复用已经补齐的共享 map。
- 主 ASAR unpacked/dedup：保留原 metadata，不能把 native 模块当空文件重建。
- ownership/完整性共存：CU 后语言标记 main 合法更新，ion 不变；未知修改先拒绝。
- 候选发布漂移：核对主/界面/框架/plist/ownership，失败不发布，源应用不变。

## Task 1: CU 源码变换与行为测试

**Files:** shell 的现有 PACKED_LANGUAGE_EOF Python、`tests/desktop-3p-static-cu.mjs`。
**Interfaces:** Python `patch_static_cu(source: str) -> str`，仅替换唯一 3p hardcoded 方法；已知补丁幂等，未知/歧义拒绝。

- [ ] 增加从真实方法/source/配置读取器提炼的 fixture，断言 static+用户开关真补缺、既有值保留、remote/1p不变、deny/平台/HIPAA/逐应用拒绝仍生效。
- [ ] 运行新增测试，确认缺少实现而失败。
- [ ] 最小变换：原 map 新副本，仅三个 defaults，使用原生 feature entry 结构，不改 source/filter/security 函数。
- [ ] 同时测关开用户开关、static↔remote切换、语法与重复目标拒绝，再确认通过。

## Task 2: 候选归档与 ownership 集成

**Files:** 同一 shell；新 CU 测试和现有 packed 测试。
**Interfaces:** `--prepare-cu <源.app> <全新候选.app>`，Python 第四参数区分 language/cu。

- [ ] 测试完整双归档 fixture，先失败：主条目变更，ion字节不变，unpacked/dedup保留，language marker衔接、CU marker幂等及坏所有权拒绝。
- [ ] 复用 archive/repack，将重排逻辑扩展为跳过unpacked、保留其他元数据；更新主包头哈希、plist、framework digest，重签前完成全部预检。
- [ ] 发布前复查源身份与ownership，失败不产生候选、不动原应用；普通汉化及自动暂停回归通过。

## Task 3: 构建、全量测试、实包与最终审查

**Files:** README、生成的 dist/unix/install.sh；验证记录放 ai-update 新独立目录。

- [ ] 说明窄分支、本地开关和显式拒绝保留、签名/手动更新取舍。
- [ ] repo根canary构建/check、完整 tests/*.mjs、shell语法、git diff --check，报告条件跳过。
- [ ] 对当前汉化版生成离线CU候选，不启动共享profile；核验唯一主条目、ion不变、双归档/框架digest、codesign通过。
- [ ] 独立只读审查；重要问题先红后绿修复。提示实际结果后再安排用户完全退出和替换，不用launchd后台或强杀。
