# 車体整備 透明性ガイドライン 準拠マッピング

出典: 国土交通省 物流・自動車局 自動車整備課
「**車体整備の消費者に対する透明性確保に向けたガイドライン**」(令和6年3月)

本書は、同ガイドライン「4.2 実施することが求められる取組み」(1)〜(5) および
「4.3 実施することが望ましい取組み」(A)(B) に対する Ledra の実装状況を、
根拠 (テーブル / API / UI) とともに対応付けるものである。

---

## 4.2 実施することが求められる取組み

### (1) 車体整備作業に係る画像情報の記録・保存 — ✅ 対応

| ガイドライン要求 | 実装 |
| --- | --- |
| ①入庫後〜作業開始前 / ②作業実施中 / ③作業実施後 の段階別記録 | `certificate_images.stage` (`intake_before` / `in_progress` / `after` / `unspecified`)。アップロード API (`/api/certificates/images/upload`) が `stage` フォーム値を受理し格納。 |
| 撮影時刻の記録 | `certificate_images.exif_captured_at` (EXIF 撮影時刻) + `created_at` (アップロード時刻)。 |
| 一定期間の電磁的保存 | Supabase Storage + `certificate_images` 行。証明書は Polygon アンカリングで改ざん検知 (`certificateAnchorService`)。 |
| ピントが合い見やすい画像であること | アップロード時に AI 品質監査 (`photoQualityAuto`) が走り、発行はブロックしないが注釈を付与。 |

段階別の事後検証は `idx_certimg_stage (certificate_id, stage)` で高速に抽出できる。

### (2) 作業の内容・方法に係る情報の記録・保存 — ✅ 対応

| ガイドライン要求 | 実装 |
| --- | --- |
| 作業開始前の予定内容・方法・部品・塗料 | `body_repair_jobs.planned_work_json` (`{repair_type, panels, methods, parts, paint}`)。新規案件ダイアログで入力。 |
| 作業実施後の実績内容・方法・部品・塗料 | `body_repair_jobs.actual_work_json`。案件編集ダイアログ「作業実績の記録」で入力。 |
| 予定と異なる場合の理由 | `body_repair_jobs.deviation_reason`。 |
| 記録者の明示 | `body_repair_jobs.recorded_by` (作成・更新した `auth.users.id` を自動記録)。 |
| 特定整備は記録簿として2年保存 | `body_repair_jobs.is_specified_maintenance` + `record_retention_until` (特定整備=完了から2年、それ以外=1年を `computeRetentionUntil` で設定)。 |

### (3) 車体整備の料金に係る情報の記録・保存 — ✅ 対応

| ガイドライン要求 | 実装 |
| --- | --- |
| 作業開始前の概算見積り (内容・部品・塗料・合計) | `documents` (doc_type=`estimate`, `items_json` で項目別)。案件には `estimate_amount` + `estimate_document_id` で関連付け。 |
| 作業実施後の実績料金 | `body_repair_jobs.actual_amount` + `invoice_document_id` (doc_type=`invoice`/`delivery`)。 |
| 一定期間の電磁的保存 | `documents` テーブル。 |

### (4) 車体整備に係る情報の関連付け — ✅ 対応

画像 (1)・作業内容 (2)・料金 (3) を **1 案件 = 1 車両** で束ねる:

- `body_repair_jobs.certificate_id` → 画像 (`certificate_images`)
- `body_repair_jobs.planned_work_json` / `actual_work_json` / `deviation_reason` → 作業内容・方法
- `body_repair_jobs.estimate_document_id` / `invoice_document_id` → 料金
- `customer_id` / `vehicle_id` で顧客・車両に紐付け

すべて同一 Postgres (Supabase) に保存され、`my_tenant_ids()` による RLS でテナント分離。

### (5) 消費者等への適切な説明と消費者等の了承 — ✅ 対応

| 段階 | 状況 |
| --- | --- |
| ①作業前 (見積同意) | ✅ 実装済。`purpose='estimate_consent'` + `body_repair_consents` (kind=`pre_work`)。署名フロー = 受領サイン基盤を流用 (二要素認証 + 同意文ハッシュ + ECDSA 署名 + Polygon アンカリング)。 |
| ②作業中 (変更同意) | ✅ 実装済。`purpose='change_consent'` + `body_repair_consents` (kind=`change`)。同フロー。 |
| ③作業後 (受領サイン) | ✅ 実装済。`delivery_receipts` + `signature_sessions`。 |
| ④引き渡し後の問い合わせ対応 | ✅ 顧客ポータル / 問い合わせ機能で対応。 |

`body_repair_consents.explanation_json` に説明時点のスナップショットを不変保存する。
管理画面の案件編集ダイアログから「作業前同意を依頼」「変更同意を依頼」で署名 URL を発行し、
顧客は `/sign/consent/[token]` で電話番号下4桁の本人確認を経て電子署名する。

**フロー実装**:
- 依頼発行: `POST /api/admin/body-repair-jobs/[id]/consent-request`
- セッション取得: `GET /api/signature/body-repair-consent/session/[token]`
- 署名実行: `POST /api/signature/body-repair-consent/sign/[token]`
- 署名ページ: `src/app/sign/consent/[token]/`
- ドメインロジック: `src/lib/signature/bodyRepairConsent.ts`

---

## 4.3 実施することが望ましい取組み (任意)

### (A) 車体整備作業の見える化 — ✅ 対応

社内向けの工程 Kanban (`/admin/body-repair`) に加え、**顧客向けの進捗トラッキング**を実装。
案件編集ダイアログの「進捗リンクを発行」で `body_repair_jobs.track_token` を発行し、顧客は
ログイン不要で `/track/[token]` から工程ステージ (受付→協定→鈑金→塗装→完成→出庫) の進捗と
到達時刻を確認できる (PII 最小)。

- 発行 API: `POST /api/admin/body-repair-jobs/[id]/track-link`
- 公開ページ: `src/app/track/[token]/page.tsx`

### (B) 消費者に対する積極的な情報発信 — ✅ 対応

公開店舗プロフィール `/shop/[slug]` を実装。提供サービス・標準料金 (`menu_items`)、
メーカー認定 (`manufacturer_certified_tenants`)、整備士資格・専門スキル (`staff_members.skills`)
を公開表示する。

- 公開ページ: `src/app/shop/[slug]/page.tsx`

---

## 実装ファイル一覧

- マイグレーション: `supabase/migrations/20260620000000_body_repair_transparency.sql`,
  `20260621000000_body_repair_tracking.sql` (+ `..._index.sql`)
- バリデーション: `src/lib/validations/body-repair-job.ts` (+ `__tests__/body-repair-job.test.ts`)
- 同意ロジック: `src/lib/signature/bodyRepairConsent.ts` (+ `__tests__/bodyRepairConsent.test.ts`)
- 案件 API: `src/app/api/admin/body-repair-jobs/route.ts` (+ `[id]/consent-request`, `[id]/track-link`)
- 同意署名 API/ページ: `src/app/api/signature/body-repair-consent/*`, `src/app/sign/consent/[token]/`
- 公開ページ: `src/app/track/[token]/`, `src/app/shop/[slug]/`
- 画像アップロード (stage): `src/app/api/certificates/images/upload/route.ts`
- 管理 UI: `src/app/admin/body-repair/BodyRepairClient.tsx`

## 保存期間ポリシー

`record_retention_until` は「この日まで保持する」マーカーであり、データ保持 cron
(`/api/cron/data-retention`) は車体整備記録をこの日付より前に削除してはならない。
特定整備記録簿の2年保存義務 (道路運送車両法) を満たすため。
