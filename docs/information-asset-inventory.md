# Ledra 情報資産台帳 / データ分類

どのデータがどこに保存され、どの分類・保持・暗号化・アクセス制御が適用されるかの
一覧。ISO 27001 A.5.9（資産目録）/ A.5.12（情報分類）/ SOC 2 CC ・ 個人情報保護法
対応。リスクアセスメントと監査スコープの基礎資料。

関連: `docs/data-retention.md`（保持期間）・`docs/disaster-recovery.md`・
`docs/iso27001-soc2-prep.md`

---

## 1. データ分類定義

| 分類 | 定義 | 例 |
|------|------|-----|
| **機密 (Restricted)** | 漏えい時に重大被害。鍵・認証情報・本人確認データ | service_role key、各種 API シークレット、`CUSTOMER_AUTH_PEPPER`、本人確認 OCR、Polygon 秘密鍵 |
| **個人データ (PII)** | 個人を識別できる情報 | 顧客氏名/連絡先、車両 VIN/ナンバー、ヒアリング内容、生年月日 |
| **社外秘 (Confidential)** | 事業上の非公開情報 | 請求/決済、テナント設定、保険会社案件、原価 |
| **公開 (Public)** | 公開前提 | 公開証明書ビュー（PII リダクト済）、リファレンスマスタ |

---

## 2. 資産インベントリ（主要ストア）

| 資産 / ストア | 場所 | 分類 | 暗号化 | アクセス制御 | 保持 |
|--------------|------|------|--------|--------------|------|
| アプリ DB（Postgres） | Supabase | PII / 社外秘 | 保存時透過暗号化 + TLS | RLS（テナント分離）+ RBAC | `data-retention.md` |
| 顧客 PII（customers / vehicles / hearings） | Supabase | PII | 同上 | RLS + サービスロールは scoped ラッパ経由 | 無期限/論理削除 |
| 認証情報（customer_login_codes / sessions） | Supabase | 機密 | pepper 付きハッシュ | RLS / service_role | 30〜90 日 |
| テナントシークレット（Square/LINE/Webhook） | Supabase（暗号化カラム） | 機密 | **AES-256-GCM**（`SECRET_ENCRYPTION_KEY`） | service_role のみ | 連携解除まで |
| 本人確認 OCR | 一時処理 / 保存最小化 | 機密(PII) | TLS + 保存時暗号化 | テナント scoped | 最小限 |
| 画像 / PDF | Supabase Storage | PII | TLS + 署名付き URL | テナント scoped パス | 証明書に準ずる |
| アプリシークレット（env） | Vercel 環境変数 | 機密 | Vercel 管理 | デプロイ権限者 | ローテ: `.secrets-age.json` |
| 監査ログ（audit_logs / insurer_access_logs / pii_disclosure_logs） | Supabase | 社外秘/PII | 保存時暗号化 | platform-admin | 2〜7 年 |
| 決済 | Stripe / Square（トークン化） | 社外秘 | プロバイダ管理（PCI） | API キー（サーバのみ） | プロバイダ準拠 |
| エラー/監視 | Sentry（PII スクラブ済） | 社外秘 | プロバイダ管理 | プロジェクト権限者 | Sentry 既定 |
| ブロックチェーン アンカー | Polygon（公開台帳） | 公開（ハッシュのみ） | — | 署名鍵は KMS/MetaMask | 恒久 |

---

## 3. サブプロセッサ

| プロバイダ | 用途 | 取扱データ | 根拠 |
|-----------|------|-----------|------|
| Supabase | DB / Auth / Storage | PII / 機密 | DPA（`docs/dpa-template.md`） |
| Vercel | ホスティング / env | 機密 | DPA |
| Stripe / Square | 決済 | 決済（トークン化） | DPA / PCI |
| Sentry | エラー監視 | スクラブ済テレメトリ | DPA |
| Resend | メール送信 | 連絡先 | DPA |
| Upstash | レート制限 / キュー | 識別子（IP 等） | DPA |
| Cloudflare | 動画 / 配信 | メディア | DPA |

---

## 4. 鍵・シークレット一覧

ローテーション台帳は `.secrets-age.json`（rotated_at / ttl_days / 手順）。
`npm run check:secrets-age` で TTL 超過を監視。

主要鍵: `SUPABASE_SERVICE_ROLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` /
`CRON_SECRET` / `CUSTOMER_AUTH_PEPPER` / `RESEND_API_KEY` / `QSTASH_*` /
`POLYGON_PRIVATE_KEY` / `CLOUDFLARE_STREAM_API_TOKEN` / `SECRET_ENCRYPTION_KEY`。

---

## 5. メンテナンス

- 本台帳は新規テーブル/連携/サブプロセッサ追加時に更新する（PR レビューのチェック項目）。
- 四半期のセキュリティ監査（`docs/security-audit-framework.md`）で内容を再確認。
- データフロー図（PII の流れ）は別途整備予定（ISO 取得前必須）。

> **未整備（取得前に確定）**: データフロー図、各資産のデータオーナー氏名、
> リスクアセスメント結果（本台帳を入力として作成）。
