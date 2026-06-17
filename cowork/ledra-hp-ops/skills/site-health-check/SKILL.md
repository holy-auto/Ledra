---
name: site-health-check
description: >
  Run pre-publish and periodic quality checks on the Ledra marketing site and report
  findings. Use when the user asks to "公開前にチェックして", "リンク切れを確認",
  "ビルドが通るか確認", "表示崩れ", "Lighthouse を回して", "サイトの健全性チェック",
  or wants a QA pass before a release. Runs lint/build/tests, checks links and basic
  rendering, and compares against the Lighthouse budget. Outputs a report; only opens a
  small PR or issue for clearly safe, in-scope fixes — a human decides on the rest.
---

Ledra の公開HPの **品質チェック**（公開前 / 定期）を行い、**レポート**にまとめるスキルです。
原則「検知して報告」。直す場合も**安全で範囲内の軽微な修正だけ**を小さな PR に。

## チェック項目（`references/qa-checklist.md` に手順詳細）

1. **ビルド / Lint / 型 / テスト**
   - `npm run lint`（ESLint）
   - `npm run build`（Next.js ビルド。型エラーもここで出る）
   - `npm run test`（Vitest。関連範囲）
   - 必要に応じ `npm run format:check`
2. **リンク切れ / 内部リンク**
   - マーケ配下のページ・記事の内部リンク、`marketingNav`/`footerNavGroups`（`src/lib/marketing/config.ts`）の参照先が存在するか。
   - 外部リンク（記事の出典 URL 等）が 4xx/5xx でないか。
3. **表示崩れ / 基本レンダリング**
   - 主要ページ（`/`, `/for-shops`, `/for-insurers`, `/pricing`, `/features`, `/news`, `/blog`）が `npm run dev`/`start` で開けるか。コンソールエラー、画像 alt 欠落、明らかなレイアウト崩れ。
4. **Lighthouse 予算**
   - `.lighthouserc.json` の閾値（performance ≥0.85, accessibility ≥0.9, best-practices ≥0.9, seo ≥0.9）。`@lhci/cli` があれば `lhci autorun`、無ければ手動 Lighthouse で主要ページ。
5. **コンテンツ衛生**
   - 公開予定の記事に `draft` 外し忘れ/付け忘れが無いか。フロントマター規約（`publish-article/references/content-conventions.md`）に沿うか。

## 手順

1. **範囲を決める**（公開前ピンポイント or 定期フルチェック）。
2. **機械チェックを走らせる**（lint/build/test → リンク → Lighthouse）。失敗は出力（ログ抜粋）とともに記録。
3. **レポートにまとめる**（`references/qa-checklist.md` のフォーマット）。重大度で分類し、原因の当たりを付ける。
4. **直すかどうか**：
   - **範囲内 & 明確 & 軽微**（リンク先 typo、`alt` 追加、記事フロントマターの修正、出典 URL 修正 など）→ 小さな PR（ブランチ `cowork/healthcheck-YYYYMMDD-<対象>`）。
   - **コード/ロジック/デザイン/性能の本質的問題** → **直さずレポート**し、人へ（必要なら Issue 化）。
5. **報告**：合否サマリ、重大度別の所見、作成した PR/Issue のリンク。

## やってはいけないこと

- ビジネスロジック/ API/ 認証/ 課金/ DB への変更（検知・報告のみ）。
- テストや lint を「通すため」に閾値を緩める・無効化する・チェックを削る。
- 失敗を握りつぶして「OK」と報告する（失敗は必ず出力付きで報告）。
- 大規模リファクタ・依存追加。

## 定期実行のヒント

`/schedule` で週次フルチェックを回し、毎回レポートを残すと公開前の手戻りが減る。
公開直前は対象記事まわりだけの軽量チェックで十分。
