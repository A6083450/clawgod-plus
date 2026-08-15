# 插件下载源改为 GitHub 直连 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三个可选增强插件的固定 tag 归档改为直接从 GitHub 拉取，失败时输出含 URL、退出码与排查建议的明确报错。

**Architecture:** 修改 `src/generic/runtime/plugin-dependencies.mjs` 的 `PLUGIN_BASELINES` 三个 URL，并在 `downloadAndStage` 的下载失败路径中生成 sanitized（无凭据、单行、截断）的错误信息；失败仍为 warning，核心安装继续。同步更新测试基线、三语 README，重建 dist 安装器。

**Tech Stack:** Bun（测试与构建运行时）、bash（安装器模板）、GitHub raw tag 归档下载。

## Global Constraints

- 三个插件版本、`bytes`、`sha256` 基线不变：hud 0.7.0 / 754443 / `59bd3ec1…c912`；memory 13.14.0 / 11817347 / `a64f7dd0…bed0`；superpowers 6.2.0 / 516401 / `468246a7…eb5f3`。
- 失败语义不变：单个插件下载失败是 warning，`ensure` 退出码保持 0，核心安装继续。
- 错误信息必须单行、不得含 `secret` / `proxy` / `token` / `stack`（词边界敏感词），不得泄漏下载器 stderr 原文。
- 不新增任何运行时依赖；不改历史设计文档；提交直接到 main（项目惯例）。
- 测试运行命令：`bun tests/installer-plugin-dependencies.mjs`；全量离线验证：`for test_file in tests/*.mjs; do bun "$test_file" || exit 1; done`（网络用例自动跳过，除非 `CLAWGOD_E2E=1`）。

---

### Task 1: GitHub 直连 URL 与失败信息（TDD）

**Files:**
- Modify: `src/generic/runtime/plugin-dependencies.mjs:32-52`（三个 `url`）、`src/generic/runtime/plugin-dependencies.mjs:1610-1623`（下载失败路径）
- Test: `tests/installer-plugin-dependencies.mjs:153-173`（expected 基线）、`tests/installer-plugin-dependencies.mjs:1982-1995`（下载失败断言）

**Interfaces:**
- Consumes: 无（首个任务）。
- Produces: `downloadAndStage(spec, context)` 失败时抛出的错误信息格式：
  `` `${spec.key}: download failed from ${spec.url} (exit code ${code}): ${sanitized stderr 摘要} — check your network connection or configure HTTPS_PROXY` ``（stderr 摘要为空或含敏感词时省略 `: 摘要` 段）。
  新增内部辅助函数 `fetchStderrSummary(result)`：读取 `result.stderr` → utf8 → 压缩空白 → 若命中 `/\b(?:secret|token|proxy|stack)\b/i` 返回空串 → 截断 300 字符。

- [ ] **Step 1: 修改测试基线 URL 与失败断言**

`tests/installer-plugin-dependencies.mjs` 中 `expected` 对象的三个 `url` 字段改为：

```js
url: 'https://github.com/jarrodwatts/claude-hud/archive/refs/tags/v0.7.0.tar.gz',
```

```js
url: 'https://github.com/thedotmack/claude-mem/archive/refs/tags/v13.14.0.tar.gz',
```

```js
url: 'https://github.com/obra/superpowers/archive/refs/tags/v6.2.0.tar.gz',
```

将下载失败断言块（约 1984-1994 行）替换为：

```js
context.env.FIXTURE_FETCH_FAIL = '1';
await assert.rejects(
  downloadAndStage(hudSpec, context),
  error => {
    assert.match(error.message, /hud: download failed/i);
    assert.ok(
      error.message.includes(`download failed from ${hudSpec.url} (exit code 23)`),
      'download errors must name the exact source URL and exit code',
    );
    assert.match(error.message, /check your network connection/i, 'download errors must include troubleshooting guidance');
    assert.doesNotMatch(error.message, /\b(?:secret|proxy|token|stack)\b/i, 'downloader errors must be credential-free');
    assert.doesNotMatch(error.message, /fixture downloader failure/i, 'downloader stderr must not leak into managed errors');
    assert.equal(error.message.split('\n').length, 1, 'downloader errors must be one line');
    return true;
  },
  'a failed downloader must report one sanitized line',
);
```

注意：原断言 `/secret|proxy|token|stack/i` 必须改为 `/\b(?:secret|proxy|token|stack)\b/i`，否则固定文案 `configure HTTPS_PROXY` 会误命中（`PROXY` 前是 `_` 词字符，无词边界，新正则不匹配）。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun tests/installer-plugin-dependencies.mjs`
Expected: FAIL，终止于 `assert.deepEqual(PLUGIN_BASELINES, expected)`（URL 仍指向镜像，与 expected 的 GitHub 直连不匹配）。该文件是顺序断言脚本，assert 失败即抛异常终止，因此 Step 3 完成前到不了新增的下载失败断言。

- [ ] **Step 3: 修改源码**

`src/generic/runtime/plugin-dependencies.mjs`：

(1) `PLUGIN_BASELINES` 三个 `url` 去掉 `https://hub.211107.xyz/` 前缀，与 Step 1 的 expected 完全一致。

(2) 在 `downloadAndStage` 上方新增辅助函数（放在 `downloadAndStage` 定义之前）：

```js
function fetchStderrSummary(result) {
  if (!result?.stderr) return '';
  const text = Buffer.from(result.stderr).toString('utf8').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/\b(?:secret|token|proxy|stack)\b/i.test(text)) return '';
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
```

(3) 将 `downloadAndStage` 中下载段（约 1612-1623 行）改为：

```js
      let result;
      try {
        result = Bun.spawnSync({
          cmd: [context.bunPath, context.fetchFilePath, spec.url, temporaryArchive],
          env: context.env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
      } catch (error) {
        throw new Error(`${spec.key}: download failed from ${spec.url}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (result.exitCode !== 0) {
        const summary = fetchStderrSummary(result);
        throw new Error(`${spec.key}: download failed from ${spec.url} (exit code ${result.exitCode})${summary ? `: ${summary}` : ''} — check your network connection or configure HTTPS_PROXY`);
      }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun tests/installer-plugin-dependencies.mjs`
Expected: PASS，无输出错误。

- [ ] **Step 5: 提交**

```bash
git add src/generic/runtime/plugin-dependencies.mjs tests/installer-plugin-dependencies.mjs
git commit -m "feat: 插件下载源改为 GitHub 直连并增强失败信息"
```

---

### Task 2: 三语 README 同步

**Files:**
- Modify: `README.md:160`、`README_EN.md:160`、`README_JP.md:160`（"hub.211107.xyz 代理"描述行）

**Interfaces:**
- Consumes: 无（纯文档）。
- Produces: 三语 README 不再出现 `hub.211107.xyz` 字样。

- [ ] **Step 1: 替换三处描述**

`README.md` 中：

原文：`公开固定归档通过选定的 \`hub.211107.xyz\` 代理下载，只有字节长度和固定 SHA-256 都精确匹配才会解压。Bun 仍是唯一需要安装的 JavaScript 运行时。`

改为：`公开固定归档直接从 GitHub 拉取，只有字节长度和固定 SHA-256 都精确匹配才会解压。Bun 仍是唯一需要安装的 JavaScript 运行时。`

`README_EN.md` 中：

原文：`Public fixed archives use the selected \`hub.211107.xyz\` proxy and are accepted only after their exact byte length and fixed SHA-256 match. Bun remains the only installed JavaScript runtime dependency.`

改为：`Public fixed archives are downloaded directly from GitHub and are accepted only after their exact byte length and fixed SHA-256 match. Bun remains the only installed JavaScript runtime dependency.`

`README_JP.md` 中：

原文：`公開固定アーカイブは選択済みの \`hub.211107.xyz\` プロキシを使用し、正確なバイト長と固定 SHA-256 の両方が一致した場合だけ展開します。インストールが必要な JavaScript ランタイムは引き続き Bun だけです。`

改为：`公開固定アーカイブは GitHub から直接ダウンロードし、正確なバイト長と固定 SHA-256 の両方が一致した場合だけ展開します。インストールが必要な JavaScript ランタイムは引き続き Bun だけです。`

- [ ] **Step 2: 验证仓库中不再有镜像残留引用**

Run: `/usr/bin/grep -rn "211107" README.md README_EN.md README_JP.md AGENTS.md src/ tests/`
Expected: 无输出（历史 `docs/superpowers/` 文档除外，不检查）。

- [ ] **Step 3: 提交**

```bash
git add README.md README_EN.md README_JP.md
git commit -m "docs: 三语 README 同步 GitHub 直连下载描述"
```

---

### Task 3: 重建安装器与全量验证

**Files:**
- Regenerate: `dist/unix/install.sh`、`dist/win/install.ps1`（由 `bun build.mjs` 生成，不手改）
- Test: `tests/*.mjs` 全量

**Interfaces:**
- Consumes: Task 1 的源码改动（构建时内嵌进安装器）。
- Produces: dist 安装器内嵌的 `plugin-dependencies.mjs` 含 GitHub 直连 URL 与新错误信息。

- [ ] **Step 1: 重建安装器**

Run: `bun build.mjs`
Expected: 退出码 0，`dist/unix/install.sh` 与 `dist/win/install.ps1` 时间戳更新。

- [ ] **Step 2: 确认 dist 内嵌内容已更新**

Run: `/usr/bin/grep -c "hub.211107.xyz" dist/unix/install.sh dist/win/install.ps1; /usr/bin/grep -c "https://github.com/jarrodwatts/claude-hud/archive" dist/unix/install.sh dist/win/install.ps1`
Expected: 第一组均为 `0`；第二组均为 `1`（hud URL 出现一次）。

- [ ] **Step 3: 全量离线测试**

Run: `for test_file in tests/*.mjs; do bun "$test_file" || exit 1; done`
Expected: 全部 PASS（installer-e2e 网络用例因未设 `CLAWGOD_E2E=1` 自动跳过）。

- [ ] **Step 4: 提交**

```bash
git add dist/unix/install.sh dist/win/install.ps1
git commit -m "build: 重建含 GitHub 直连下载的安装器"
```

---

## 完成标准

- `bun tests/installer-plugin-dependencies.mjs` 通过；全量 `tests/*.mjs` 通过。
- 仓库活跃代码与三语 README 中无 `hub.211107.xyz` 残留。
- dist 安装器与 src 同步重建并已提交。
- 下载失败时用户可见：插件 id、完整 GitHub URL、退出码、非敏感的失败原因摘要、排查建议；核心安装继续。
