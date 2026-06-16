# CLAUDE.md

## PR 運用ルール

- **PR を作成したら、直後に `@codex review` というコメントを当該 PR に投稿する。**
  - 目的: 自動コードレビューを行う Codex（`chatgpt-codex-connector[bot]`）を即座にトリガーするため。
  - 背景: Codex は「非ドラフトで PR を開く」「ドラフトを ready 化」「`@codex review` コメント」のいずれかでのみ起動する。ドラフト作成→即マージだとレビューが付かないため、作成直後に明示コメントで起動させる。
  - コメント投稿には GitHub MCP の `mcp__github__add_issue_comment`（PR番号を issue_number に指定）を使う。
  - マージする場合は、Codex のレビューが付くのを確認してから（または明示の指示があってから）マージする。
