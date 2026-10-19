# 最新版优先升级

用户明确规则：`claude update` 先升级 npm 最新版，升级失败才回退安装器稳定最新版。替代此前默认固定 verified 的普通更新策略。

实现：
- 普通 update/upgrade（非显式版本、no-upgrade、Lean操作）下载一次最新 installer，第一轮 argv 指定 latest。
- 第一轮和稳定重试均禁用 UPDATE_PATCH_FAIL_OPEN，避免无增强 runtime 冒充升级成功；显式 tolerate-stale 保留自身语义。
- 双平台现有事务安全恢复并清理后，向 updater 私有临时目录写 `restored\n` 回执。恢复失败、vendor冲突、保留证据不写；提交成功也不写。
- updater 仅在普通失败、非信号/取消、回执匹配且无残留事务时用同一installer重试一次，无VERSION采用既有稳定默认策略。
- 保留已装高版本不自动降级：稳定默认=max(installed,verified)。显式version只尝试指定版本；下载installer失败或无法确认恢复不重试。
- 运行时提交后launcher失败属于已有事务边界，不声称已恢复，不启动第二轮覆盖。

验证：新双平台顺序/失败/中断/残留/未确认回归；Unix真实installer与PowerShell事务回执；全量脚本；隔离latest全增强E2E。

交付边界：本轮修改和验证，不自行再次发布/安装。共享工作区desktop/build/runtime-state变更来自其他会话，保留不覆盖。
