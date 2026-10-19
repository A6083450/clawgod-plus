# 本地 Design Canvas 资源

从官方 npm 包 `@anthropic-ai/claude-code-darwin-arm64@2.1.278` 提取，供上游改为云端 `/design` 后恢复旧版本地画布流程。保留上游版权声明；这些资源不因放入此仓库而改用仓库许可证。`SKILL.md` 为本地专用指导，格式与设计指导部分沿用旧技能。

未经修改的上游文件与 SHA-256：

- `seed-canvas.mjs`：`31a2a1528c7a30b624b7370cc542d8378a3643d97cc14ff3e6a4bce842878cd8`
- `payload.template.html`：`76a2b0a4e5d4efccc9b8c825ed70aa320179cbc95541755be2af50bfd6d36196`（仓库保存为 `payload.html.gz.b64`，gzip + base64；打包补丁内联，调用技能时解码）

分发模板会在未经修改的上游内容后附加 `LICENSE.md` 许可注释，并随生成 HTML 保留；上述模板哈希只校验该原始内容。

旧 helper 将模板从 live-store 模式切到单页文档模式，保留文件名、容量、状态转义和提取覆盖校验。无 Artifact 发布能力时，仅承诺浏览器查看及 PNG/PDF 导出，不承诺 GUI 保存。模板含第三方字体和 CDN fallback；本地运行不等于完全离线。
