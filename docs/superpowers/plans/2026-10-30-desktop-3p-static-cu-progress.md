# SDD ledger — plan: docs/superpowers/plans/2026-10-30-desktop-3p-static-cu.md

- Spec: /Users/liangjiaquan/.claude/plans/woolly-singing-clock.md（用户已批准）。
- Existing branch: fix/desktop-4-language；已有汉化和暂停自动Desktop未提交改动，全部保留，不提交/推送。
- Pre-flight: Task1 Python patch_static_cu(source)->str由Task2调用；共享archive/repack仅扩展unpacked处理，不复制归档解析器。
- Ruling: 本任务是用户主动选择的本地3p static功能补缺，不把通用not_enabled当账号资格结论，不覆盖实际拒绝 — 已核对具体调用链 — 若仍受其他条件阻断则报告，不追加恒真绕过。
- Ruling: 继续普通任务分支，不创建worktree/不提交 — 用户未要求，且已批准保留现有未提交适配 — 成本是需严守并发文件保护。
- Task1: complete — 新增desktop-3p-static-cu先RED后GREEN，用户opt-in+static、既有false/null/undefined/对象保留、remote/1p不变、deny/HIPAA/平台/授权拒绝、冷切换与幂等通过；真实主chunk只内存变换成功。
- Task2: complete — --prepare-cu集成先RED后GREEN；主包unpacked元数据保留、ion字节不变、语言ownership衔接、CU mode坏记录拒绝、源漂移不发布、候选位于源内拒绝。focused四组及自动暂停保护通过。
- 实包候选：/Users/liangjiaquan/Downloads/ai-update/claude4-static-cu-validation-20261030-Hg7vWk/Claude-CU.app，离线verify-cu.py通过，只有主chunk一条目变化，ion完全不变，双归档与framework digest/codesign通过；尚未安装或GUI启动。
- Task3: repo根canary build/check、shell syntax、diff --check通过；完整回归72项 FAILED0，网络E2E默认跳过；独立review进行中。
- Final review: 独立review发现Important：CU偏好切换后原生static刷新不重算缓存；新增真实preference→refresh链RED→GREEN，限定3p/static同步使用原apply/通知函数刷新，其余refresh调用保留。最终72项全量再次通过，FAILED0，网络E2E默认跳过。候选重新生成且独立校验通过。
- Final: minor (deferred): 增加CU fixture对非目标dedup及完整元数据/digest的直接断言；现有实包独立验证已确认全部正确，fixture的更细断言留作后续覆盖。
- Final: Ruling: reviewer搁置的既有汉化/自动暂停、legacy策略、not_enabled账号资格推断维持既定边界 — 本轮只恢复本地static缺省，不扩旧强开或其他部署 — 无法等价恢复所有旧功能时报告。
- 一次性CU安装脚本已准备但未执行：/Users/liangjiaquan/Downloads/ai-update/claude4-static-cu-install-20261030-wxyJtq/install-cu.sh；独立3测试先RED后GREEN（运行中不替换/备份/发布失败恢复）。等待review结果，不提前安装。
