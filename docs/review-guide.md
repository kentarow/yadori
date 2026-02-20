# PR Review Guide / PRレビューガイド

How to review pull requests with Claude's help.
Claudeの助けを借りてプルリクエストをレビューする方法。

---

## When a PR Arrives / PRが来たとき

### 1. Check Automated CI / 自動CIの確認

GitHub Actions runs automatically on every PR:
GitHubのPRには自動でCIが走ります:

- **Type check** (`tsc --noEmit`)
- **Tests** (`vitest run` -- 2,499 tests)
- **Build** (`tsc`)

If CI fails, the PR needs fixes before review.
CIが失敗していたら、レビュー前に修正が必要です。

### 2. Ask Claude to Review / Claudeにレビューを依頼

Open Claude Code and share the PR URL:
Claude Codeを開いて、PRのURLを共有してください:

```
このPRをレビューしてください: https://github.com/kentarow/yadori/pull/123
```

Claude will check:
Claudeが確認すること:

- **Design principles** -- One Body, One Soul / Honest Perception violations
- **Security** -- No external data transmission, no dangerous functions
- **Code quality** -- TypeScript strict compliance, test coverage
- **License compliance** -- Files in correct directories
- **Architecture** -- No cloud dependencies, runtime agnostic design

設計原則の違反、セキュリティ、コード品質、ライセンス遵守、アーキテクチャの整合性を確認します。

### 3. Post Review Comments / レビューコメントの投稿

Claude cannot post directly to GitHub. The workflow is:
ClaudeはGitHubに直接投稿できません。ワークフローは:

1. Claude provides review feedback in the conversation
   Claudeが会話内でレビューフィードバックを提供
2. You copy and post the comments on the PR
   あなたがPRにコメントをコピー&投稿
3. If changes are needed, request them from the contributor
   変更が必要なら、コントリビューターに修正を依頼
4. When satisfied, approve and merge
   問題なければ承認してマージ

---

## What to Watch For / 注意すべきポイント

### Red Flags (Reject) / 却下すべきもの

- Cloud deployment code (VPS, Docker for hosting)
  クラウドデプロイのコード（VPS、ホスティング用Docker）
- Code that passes raw data to LLM bypassing Perception Adapter
  Perception Adapterを迂回してLLMに生データを渡すコード
- External data transmission (analytics, telemetry, etc.)
  外部へのデータ送信（アナリティクス、テレメトリなど）
- Runtime dependencies added to `dependencies` (not `devDependencies`)
  `dependencies`へのランタイム依存追加
- Agent capabilities (exec, browser, automation tools)
  エージェント機能の追加（exec、ブラウザ、自動化ツール）

### Yellow Flags (Discuss) / 要確認

- New perception modes or species
  新しい知覚モードや種族の追加
- Changes to SOUL.md template or entity personality
  SOUL.mdテンプレートやエンティティの性格への変更
- Architecture changes (new layers, new adapters)
  アーキテクチャの変更（新レイヤー、新アダプター）
- Dashboard UI changes
  ダッシュボードUIの変更

### Green Flags (Likely Safe) / おそらく安全

- Bug fixes with tests
  テスト付きのバグ修正
- Documentation improvements
  ドキュメントの改善
- Test additions
  テストの追加
- Typo fixes
  タイポの修正

---

## GitHub Settings / GitHub設定

### Branch Protection (Required) / ブランチ保護（必須）

Go to: Repository > Settings > Branches > Add rule
操作: リポジトリ > Settings > Branches > Add rule

Set these for the `main` branch:
`main`ブランチに以下を設定:

1. **Branch name pattern**: `main`
2. **Require a pull request before merging**: ON
   マージ前にPRを必須にする: オン
3. **Require approvals**: 1
   承認必須数: 1
4. **Require status checks to pass before merging**: ON
   マージ前にステータスチェック必須: オン
   - Select: `build` (from CI workflow)
5. **Do not allow bypassing the above settings**: ON
   上記設定のバイパスを許可しない: オン

This ensures no one (including you) can push directly to main without a reviewed PR.
これにより、レビュー済みPRなしでは誰もmainに直接プッシュできなくなります。

### Dependabot (Already Configured) / Dependabot（設定済み）

The `dependabot.yml` file is already in the repository. Dependabot will automatically create PRs for:
`dependabot.yml`はリポジトリに設定済みです。Dependabotが自動でPRを作成します:

- Dev dependency updates (weekly, Monday)
  開発依存パッケージの更新（毎週月曜日）
- GitHub Actions updates
  GitHub Actionsの更新

These are usually safe to merge if CI passes.
CIが通っていれば、通常は安全にマージできます。

---

## Quick Reference / クイックリファレンス

```
PR arrives → CI green? → Ask Claude to review → Post comments → Approve/Request changes
PR到着 → CI緑? → Claudeにレビュー依頼 → コメント投稿 → 承認 or 修正依頼
```
