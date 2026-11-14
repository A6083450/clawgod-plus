# 移除 ClawGod 的 Superpowers 集成

用户于 2026-11-14 确认执行：本机已卸载，ClawGod 产品不再携带、显示、下载或自动安装 Superpowers。

- 移除增强清单、Unix/Windows 菜单、插件基线与专属包装逻辑，只保留 Claude HUD 和 claude-mem 的插件管理。
- 旧版持久化配置中的 superpowers 选择仅在读取时兼容移除；未知、重复、非规范 JSON 仍拒绝，显式新选择不接受废弃 ID。保留其他增强选择，原本 custom 覆盖全部剩余项目时规范化为 all。
- 不自动卸载其他用户原有插件，不清理历史文档、会话或其他市场。
- 同步三语产品说明、CI 与测试；生成安装器只能由 bun build.mjs 重建。
- 保留当前工作区未提交的 Code Mode 等改动；不提交、不发布、不重装本机运行时。
