# ClawGod Plus

[English](README_EN.md) | [简体中文](README.md) | **日本語**

> [0Chencc/clawgod](https://github.com/0Chencc/clawgod) をベースに継続メンテナンスしている拡張ブランチです。Claude Code をサードパーティ製クライアントで置き換えるのではなく、公式ランタイム上に構築されています。

ClawGod Plus は Claude Code の Bun standalone バイナリに埋め込まれた JavaScript を抽出し、バージョン差分に強いパッチを適用して、変更済み CLI を Bun で実行します。このブランチは上流の全機能を維持しながら、ブラウザ、Computer Use、コンテキストウィンドウ、claude-mem、Worker ランタイム、回帰テストを強化しています。

![ClawGod Plus パッチ済みランタイム](bypass.png)

## 機能

| 機能 | 説明 |
|---|---|
| **claude-mem 互換性** | claude-mem の `.env` に資格情報をコピーせず、設定済み ClawGod Plus Provider を再利用できます。管理対象設定のバックアップ、後から行ったユーザー変更の保持、Worker 再起動、古い Chroma プロセスの整理、アンインストール時の復元にも対応します。 |
| **API キーモードの Claude in Chrome** | OAuth サブスクリプションブリッジを使わず、ローカル Chrome 拡張の socket または named pipe を利用します。Agent ディスパッチでも `--chrome` と `--no-chrome` を維持します。 |
| **Computer Use をデフォルト有効化** | Feature Gate を外部設定化し、Computer Use をデフォルトで有効にします。cmux や stream-json などの非対話 Worker でも利用でき、機械処理向けコマンドには `--chrome` を自動注入しないため、空白タブの反復生成を防ぎます。 |
| **設定可能なコンテキスト上限** | ハードコードされたローカル 200K fallback を、`CLAUDE_CODE_CONTEXT_LIMIT`、`CLAUDE_CODE_MAX_CONTEXT_TOKENS`、200K の順で解決するよう変更し、チェックと復元モードも提供します。 |
| **Bun と Worker ランタイムの堅牢化** | 新旧の圧縮済み Worker Resolver 形状を対象にしつつ、Bun 共有の standalone-executable セマンティクスを維持し、daemon、fork、MCP、バックグラウンド Worker の相互破損を防ぎます。 |
| **インストーラとランタイムの信頼性** | `--no-upgrade` 制御フローの検証、ローカルインストーラへの更新ルーティング、macOS TIFF クリップボードパス認識、CI トリガー拡張、パッチドリフト検出用の独立 Fixture を追加しています。 |

### 統合パッチの作者帰属

独立した `apply-claude-code-*` スクリプト、そのアーカイブ、およびそこから統合されたパッチ手法は、すべて **哈雷佬** による成果です。このブランチはそれらを Unix / Windows インストーラへ統合して堅牢化していますが、統合によって原作者の帰属が変わることはありません。

該当するソースファイル：

- [`apply-claude-code-chrome-fix.sh`](apply-claude-code-chrome-fix.sh) と [`apply-claude-code-chrome-fix.ps1`](apply-claude-code-chrome-fix.ps1)
- [`apply-claude-code-computer-use-fix.sh`](apply-claude-code-computer-use-fix.sh)
- [`apply-claude-code-context-limit-patch/`](apply-claude-code-context-limit-patch/)

## 全機能

拡張ブランチは上流の全パッチ機能を維持しています。

| 分野 | 機能 |
|---|---|
| **機能アンロック** | Internal User モードと隠しコマンド、GrowthBook オーバーライド、Agent Teams、共有コラボレーション、Harbor Kite 設定、`/peers`、Computer Use、Auto-mode、Ultraplan、Ultrareview。 |
| **制限解除** | `CYBER_RISK_INSTRUCTION`、URL 推測制限、慎重操作の強制確認、起動時ログイン通知を削除。 |
| **Provider 対応** | Anthropic API キー、OAuth、Anthropic 互換エンドポイント、OpenAI 互換ゲートウェイ、Provider インポート、サードパーティ Prompt Cache Header 処理。 |
| **信頼性** | Glob/Grep 復元、1 時間 Prompt Cache Allowlist、Claude 更新後の自動再パッチ、更新通知、3 段階 Lean Settings。 |
| **視覚識別** | 緑色のパッチ済みテーマと、非 Anthropic Provider 向けメッセージ表示修正。 |

## 必要条件

ClawGod Plus でインストール済みの JavaScript ランタイムとして必要なのは **Bun 1.3.14 以上**だけです。インストーラとすべての独立パッチツールは Bun で実行されます。

macOS/Linux では Shell、Windows では PowerShell を OS のコマンド入口として使用します。Shell と PowerShell は別の JavaScript ランタイムではありません。

インストーラは npm Registry から現行プラットフォーム向け公式 `@anthropic-ai/claude-code-<platform>` パッケージを取得し、プライベート管理の **ripgrep 15.2.0** をダウンロードして検証します。Claude Code、Node.js、npm、システム ripgrep を事前に導入する必要はありません。

## ClawGod Plus をインストール

以下のコマンドは、固定バージョン（v2026.8.13-claude.2.1.231）の ClawGod Plus Release アセットをダウンロードします。

**macOS / Linux**

```bash
curl -fsSL https://github.com/A6083450/clawgod-plus/releases/download/v2026.8.13-claude.2.1.231/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://github.com/A6083450/clawgod-plus/releases/download/v2026.8.13-claude.2.1.231/install.ps1 | iex
```

主なインストーラオプション（バージョン未指定時は現在インストール済みの Claude Code バージョンを維持し、新規インストール時のみ最新を取得）：

```bash
bash install.sh --version 2.1.220  # 指定した Claude Code バージョンをインストール
bash install.sh --version latest   # 明示的に最新へアップグレード
bash install.sh --no-upgrade      # 現在抽出済みのバージョンへ再パッチ
bash install.sh --lean-on         # 未使用ツール定義を削減
bash install.sh --lean-max        # アグレッシブなトークン削減
bash install.sh --lean-off        # 全ツールを復元。デフォルト
```

緑色のブランド表示はパッチ済みランタイムが有効であることを示します。元のコマンドは置換前にバックアップされます。

## コマンドと起動動作

```bash
claude              # パッチ済み Claude Code。対話起動では --chrome がデフォルト
clawgod             # パッチ済み版を明示するエントリポイント
claude.orig         # 元の未変更コマンドのバックアップ
```

対話起動にはデフォルトで `--chrome` が追加されます。help、version、update、auth、config、MCP、daemon、print、permission、構造化入出力モードでは自動追加されません。明示的な `--chrome` は常に維持されます。

1 回の起動または現在の Shell で Chrome 自動統合を無効化：

```bash
CLAWGOD_NO_AUTO_CHROME=1 claude
```

## 推奨コンパニオン：Claude HUD

ClawGod Plus のマルチエージェント処理や長時間タスクには、ステータスラインプラグイン [Claude HUD](https://github.com/jarrodwatts/claude-hud) を推奨します。別ウィンドウを開かずに、モデルとコンテキストの状態、プロジェクトと Git、Claude 設定数、使用量、ツール、Agent、Todo、コスト、速度、セッション時間を常時確認できます。

Claude Code 内でインストール：

```text
/plugin marketplace add jarrodwatts/claude-hud
/plugin install claude-hud
/reload-plugins
/claude-hud:setup
```

以下の画像は、この推奨設定をマルチエージェントセッションで使用した実際の表示例です。

![推奨 Claude HUD コンパクト表示](docs/images/claude-hud-recommended.png)

推奨 `~/.claude/plugins/claude-hud/config.json`：

```json
{
  "language": "zh",
  "lineLayout": "compact",
  "pathLevels": 1,
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos", "sessionTime"],
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": true,
    "showFileStats": true
  },
  "display": {
    "showModel": true,
    "showAddedDirs": true,
    "addedDirsLayout": "line",
    "showContextBar": true,
    "contextValue": "tokens",
    "showConfigCounts": true,
    "showCost": true,
    "showDuration": true,
    "showSpeed": true,
    "showUsage": true,
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showTokenBreakdown": true,
    "usageBarEnabled": true
  },
  "colors": {
    "context": "green",
    "usage": "brightBlue",
    "warning": "yellow",
    "usageWarning": "brightMagenta",
    "critical": "red",
    "model": "cyan",
    "project": "yellow",
    "git": "magenta",
    "gitBranch": "cyan",
    "label": "#ff4fc2",
    "custom": "#FF6600"
  }
}
```

## Claude in Chrome ブラウザ拡張機能

[`claude-browser-1.0.77-patched.zip`](claude-browser-1.0.77-patched.zip) は、パッケージ済みの **Claude in Chrome ブラウザ拡張機能**であり、Claude Code プラグインではありません。パッチ済み Manifest V3 拡張機能と、**哈雷佬** が作成した Unix / Windows 用 `apply-claude-code-chrome-fix` スクリプトを収録しています。

1. ZIP をダウンロードして展開します。
2. Chrome で `chrome://extensions` を開き、右上の**デベロッパーモード**を有効にします。
3. **パッケージ化されていない拡張機能を読み込む**をクリックし、展開した `claude-browser-1.0.77-patched/` ディレクトリを選択します。

このパッチ版拡張機能は広範なブラウザ権限を要求します。収録ソースを確認し、実行を許可された環境でのみ使用してください。

## Provider 設定

初回起動時に `~/.clawgod/provider.json` が作成されます。

```json
{
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com",
  "model": "",
  "smallModel": "",
  "timeoutMs": 3000000
}
```

- `apiKey` を設定すると OAuth を省略し、Anthropic または互換ゲートウェイを使用できます。
- `apiKey` を空にすると、`claude auth login` と通常の OAuth パスを使用します。
- Anthropic 以外の `baseURL` では互換ゲートウェイ認証を自動設定し、Prompt Cache ヒット率を下げる可能性があるリクエスト単位の Attribution Header を無効化します。
- 既存の `~/.claude` にある Agent、Skill、Hook、MCP 設定は引き続き利用できます。

## 設定可能なコンテキストウィンドウ

1 回の起動にローカル fallback 上限を設定：

```bash
CLAUDE_CODE_CONTEXT_LIMIT=1000000 claude
```

`~/.claude/settings.json` に永続設定することもできます。

```json
{
  "env": {
    "CLAUDE_CODE_CONTEXT_LIMIT": "1000000"
  }
}
```

これは Claude Code のローカル 200K 定数とチェックを変更します。Anthropic の課金、モデル能力、公式の長文コンテキスト利用資格を回避するものでは**ありません**。

## claude-mem 互換性

claude-mem がインストールされ、Claude Provider に設定されている場合、インストーラは次を行えます。

- claude-mem の `.env` に資格情報を書かず、現在の ClawGod Plus Provider または Claude 設定を再利用する。
- 専用 ClawGod Plus Launcher 経由で claude-mem SDK サブプロセスを起動する。
- 互換ヘルパーが管理する設定だけをバックアップし、アンインストール時に復元する。
- インストール後にユーザーが変更した claude-mem 設定を上書きしない。
- 重複した古い Chroma MCP プロセスを整理して Worker を再起動する。

claude-mem が存在しない、別 Provider を使用している、有効な資格情報がない、またはユーザー所有の競合設定がある場合でも、ClawGod Plus 本体のインストールは継続し、それらの設定を管理対象にしません。

## 独立パッチツール

このセクションの全ツールは **哈雷佬** が作成し、適用可能なものは拡張版インストーラにも統合されています。

| パッチ系列 | Unix | Windows | チェック / 復元 |
|---|---|---|---|
| Claude in Chrome socket とサブスクリプション経路 | `apply-claude-code-chrome-fix.sh` | `apply-claude-code-chrome-fix.ps1` | `--check`、`--restore` |
| Computer Use 設定とデフォルト有効 Gate | `apply-claude-code-computer-use-fix.sh` | インストーラへ統合 | `--check`、`--restore` |
| 設定可能なコンテキスト上限 | `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh` | `apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.ps1` | `--check`、`--restore` |

読み取り専用チェックの例：

```bash
bash apply-claude-code-chrome-fix.sh --check
bash apply-claude-code-computer-use-fix.sh --check
bash apply-claude-code-context-limit-patch/apply-claude-code-context-limit-patch.sh --check
```

各スクリプトは変更適用前にバックアップを作成します。対応する `--restore` で直近のパッチバックアップを復元できます。

## インストーラの仕組み

1. 現在のプラットフォーム向け公式 Claude Code パッケージを検出またはダウンロードします。
2. Mach-O、ELF、PE 形式の Bun standalone バイナリから埋め込み JavaScript を抽出します。
3. 埋め込み `.node` ネイティブモジュールを `~/.clawgod/vendor/` へ抽出します。
4. Bun 仮想パスをローカルモジュールパスへ書き換えます。
5. 生成した `patch.mjs` からバージョン差分に強い正規表現および AST ベースのパッチを適用します。
6. 統合済みの Chrome、Computer Use、コンテキスト上限、Worker、貼り付け、Provider、機能パッチを適用します。
7. Bun がパッチ済み CLI を読み込めることを検証します。
8. 元の Launcher をバックアップし、`claude` と `clawgod` Launcher を作成します。

`~/.clawgod/.source-version` はパッチ対象のネイティブ版を記録します。その後の起動で Wrapper が公式 Claude Code の更新を検出し、新しいバイナリへ再パッチします。

## アップデート

通常のコマンドを使用します。

```bash
claude update
```

ローカル ClawGod Plus インストーラが存在する場合、拡張パッチは更新をそこへルーティングし、対象 Claude Code パッケージのダウンロード、再抽出、全パッチの再適用、Launcher の再作成を行います。

```bash
claude update --version 2.1.220  # 既知の Claude Code バージョンに固定
claude update --no-upgrade      # ダウンロードせずパッチだけ再適用
```

## アンインストール

**macOS / Linux**

```bash
bash ~/.clawgod/install.sh --uninstall
hash -r
```

**Windows PowerShell**

```powershell
.\install.ps1 -Uninstall
```

アンインストールは元の Claude Launcher を復元し、ClawGod Plus エイリアスと生成済みランタイムファイルを削除し、互換ヘルパーが引き続き所有している claude-mem 設定を復元します。

## 検証

このブランチには、完全な回帰テスト群があります。Claude Code のパッチ形状、Chrome Agent の引数伝達、非同期 socket fallback、claude-mem の設定所有権と整理、コンテキスト上限、`--no-upgrade` 制御フロー、macOS 貼り付け処理、Worker/Computer Use の起動動作、インストーラーの Bun-only 依存関係と安全なロールバック契約を対象にしています。

ClawGod Plus をインストールせずに実行できます。

```bash
for test_file in tests/*.mjs; do
  bun "$test_file" || exit 1
done

bash -n install.sh
git diff --check
```

GitHub 互換性ワークフローでは、さらに Unix の完全インストールとランタイムチェックを実行します。軽量テストではローカルの `bash install.sh` を実行しません。これはユーザーが現在使用している Claude Launcher を置き換えるためです。

## クレジットとライセンス

- [A6083450](https://github.com/A6083450)：ClawGod Plus 拡張ブランチのメンテナ。
- [0Chencc/clawgod](https://github.com/0Chencc/clawgod)：上流プロジェクト。
- **哈雷佬**：`apply-claude-code-*` パッチ系列と、このブランチへ統合された対応パッチ手法の作者。
- Anthropic：このプロジェクトがパッチする公式 Claude Code ランタイム。ClawGod Plus は Anthropic と提携していません。

[GPL-3.0](LICENSE) ライセンスで提供します。許可された範囲でのみ使用し、パッチ済み開発ツールを実行するリスクを理解した上で利用してください。

## 🔗 相互リンク

- [linux.do](https://linux.do)：**AIを学ぶなら、Lサイトへ！！！**
