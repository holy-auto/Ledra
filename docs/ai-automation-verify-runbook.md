# AI auto-action 実機検証ランブック (#1/#3/#4/#5/#7/#28)

PR `claude/inspiring-thompson-OBMqc` で追加した 6 つの新規 auto-action を、**staging 環境**で
実データ駆動して確認する手順。すべて opt-in・注釈/提案のみ・壁3 不介入。

> ⚠️ **本番では実行しない**(検証用レコードが本番に残る / AI 課金 / 通知副作用)。専用 staging で行う。

## 0. 前提

| 項目 | 内容 |
|---|---|
| 環境 | staging Supabase(本番とは別 project・migration 適用済み)+ 本ブランチを `npm run dev` か preview deploy |
| env | `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` / `CUSTOMER_AUTH_PEPPER`(+任意で `UPSTASH_REDIS_*`) |
| テナント | Standard 以上・`is_active=true` の検証用テナント 1 つ |
| アカウント | スタッフ(管理)ログイン / 保険ユーザーログイン / 顧客ポータルセッション |
| ルール | `standard_rules` に ppf/coating/body_repair は seed 済(#7 用) |

### opt-in(必須)
```bash
SUPABASE_URL=<staging> SUPABASE_SERVICE_ROLE_KEY=<staging> TENANT_ID=<uuid> \
  npx tsx scripts/verify/optInAiAutomation.ts
```
または `/admin/settings/ai-automation` で「おまかせ運用」を ON。

## 1. 機能別の駆動 → 確認

| # | 駆動(実 UI = 本来のサーフェス) | 確認(UI) | 確認(DB / checker) | 必要条件 |
|---|---|---|---|---|
| **#1** | 顧客ポータルにログイン(OTP)→ 問い合わせを送信 | `/admin/customer-inquiries` で該当行に「✨AI分類(受信時に自動分類)」+カテゴリ/優先度/返信下書き | `customer_inquiries.ai_classified_at` が非NULL | Standard / `ai_inquiry_classify`(AIキー無しでもキーワード分類は動く) |
| **#3** | 保険ポータルにログイン → テナント紐付きの案件を作成(証明書/車両経由) | 案件詳細 `CaseAiBanner` に3行サマリ(受信時に自動生成) | `insurer_cases.meta.ai_summary.source='auto'` | 案件に tenant_id 紐付け + opt-in |
| **#4** | 同上(案件作成時。**振り分けルールが一致しない**ようにし、`insurer_users` を登録) | `CaseAiBanner` に担当者候補(受信時に自動提案) | `insurer_cases.meta.ai_assign_suggestion.source='auto'` | ルール未割当 + insurer ユーザーあり |
| **#7** | スタッフで `/admin/certificates/new` から証明書作成(テンプレ=ppf 等で `service_type` が入る)→ 写真アップロード | 証明書詳細の `QualityAutoPanel`(スコア/抜け漏れ) | `certificates.meta.quality_check.source='auto'` | Standard/Pro / `ai_quality_vision` + **AIキー**(Vision) + `source_policies.photos` |
| **#5** | スタッフで案件(予約)を開き、ステータスを進める(`/admin/jobs/[id]` or 予約 advance) | `JobAiSuggestPanel` に次アクション(即時表示) | `reservations.ai_next_action.source='auto'` | Standard / `ai_job_assist` + `job.next_action` が manual でない(AIキー無しでも決定論で動く) |
| **#28** | スタッフで `part_installation` を作成 → `/admin/parts-integrity/[id]` で**装着数量と食い違う**納品書画像をアップロード | 装着詳細「検知」に 三方/数量 不一致 | `part_integrity_findings.rule in (three_way_mismatch, qty_mismatch)` | **AIキー必須**(OCRはフォールバック無し)+ `source_policies.identity_documents` |

> auto-action はすべて `after()` の非同期。発火後は数秒待ってから UI 再読み込み / checker 実行。

## 2. まとめて結果確認
```bash
SUPABASE_URL=<staging> SUPABASE_SERVICE_ROLE_KEY=<staging> TENANT_ID=<uuid> \
  npx tsx scripts/verify/checkAiAutomation.ts
```
6 機能それぞれ「出力を保存済みか」を ✅/— で表示する。`—`(none)は「まだ駆動していない」。

## 3. 監視(任意)
- `/admin/platform/operations` の「AI 利用状況」で各 auto-action のコール/コスト/レイテンシ。
- `ai_usage_logs` に endpoint(例 `/api/insurer/cases#auto-summary`)別の記録。

## 4. 既知の限界
- `quality_fields_json`(#7)・`service_type` は**新規作成証明書から**入る。既存証明書の再アップロードでは
  写真品質(枚数/Vision)中心で、項目監査は限定的。
- #1 顧客ポータルの OTP セッションが最も手間(メール/SMS 経路が必要)。代替として、検証では
  顧客ポータルにログインできるテスト顧客を seed しておくと速い。
- AIキー未設定でも #1/#3/#5 は決定論フォールバックで「動く」が `ai:false`。#7 Vision と #28 OCR は
  キーが無いと**何も起きない**(設計どおり)。
