# HP改善ログ

## 記録ルール

すべての改善は以下の形式で記録する。新しい日付を**上に**追記（降順）。

---

## YYYY-MM-DD（テンプレート）

### 実施タイプ
日次 / 週次 / 月次 / 臨時

### 改善目的
- SEO
- CVR
- CTA
- コンテンツ
- 技術改善
- 信頼性向上

### 変更内容
-

### 変更ファイル
-

### 対象KPI
-

### 期待効果
-

### 結果確認予定日
YYYY-MM-DD

### 確認が必要なこと
-

---

<!-- ここから下に新しい日付を追記（降順） -->

## 2026-06-12

### 実施タイプ
週次

### 改善目的
- SEO
- 技術改善

### 変更内容
- トップページ以外の全マーケティングページ 10 ページに `openGraph`（title/description/url/siteName/locale/type）と `twitter: { card: "summary_large_image" }` を追加。SNS シェア時のカード表示を全ページで有効化。
- `/faq`・`/pricing` の 2 ページで欠落していた `alternates.canonical` を追加。

### 変更ファイル
- `src/app/(marketing)/faq/page.tsx`
- `src/app/(marketing)/pricing/page.tsx`
- `src/app/(marketing)/for-shops/page.tsx`
- `src/app/(marketing)/for-agents/page.tsx`
- `src/app/(marketing)/for-btob/page.tsx`
- `src/app/(marketing)/for-insurers/page.tsx`
- `src/app/(marketing)/features/page.tsx`
- `src/app/(marketing)/blog/page.tsx`
- `src/app/(marketing)/news/page.tsx`
- `src/app/(marketing)/cases/page.tsx`

### 対象KPI
- SNS 経由流入（OGP 改善でシェア時のクリック率向上）
- 重複コンテンツリスク低減（canonical 追加）

### 期待効果
- LINE・X・Slack 等でページ共有時に正しいカードタイトル・説明が表示される
- FAQ・料金ページの canonical 欠落による重複インデックスリスクを解消

### 結果確認予定日
2026-07-12

### 確認が必要なこと
- GSC・GA4 の再認証（現在 invalid_rapt/Reauthentication エラー — 人による OAuth 再連携が必要）
- OGP の動作確認（SNS シェアテスト）

---

## 2026-06-10

### 実施タイプ
臨時

### 改善目的
- 技術改善

### 変更内容
- Cowork による HP 運用ルーティン（daily/weekly/monthly）を導入。改善ログ・レポートテンプレート・スケジュールタスク用プロンプトを整備。

### 変更ファイル
- cowork/ledra-hp-ops/（プラグイン新規追加）
- docs/marketing/operation/（各種テンプレート・プロンプト）
- docs/marketing/reports/（出力先ディレクトリ）

### 対象KPI
- （全KPI共通 — 運用基盤の整備）

### 期待効果
- 日次/週次/月次の改善サイクルが回る
- KPIの定期観測・改善ログの継続的な蓄積

### 結果確認予定日
2026-07-01

### 確認が必要なこと
- Cowork コネクタ（GitHub / Gmail / GSC / GA4）の接続確認
- Scheduled Task の登録（daily 8:30 / weekly 月 9:00 / monthly 1日 9:00）
