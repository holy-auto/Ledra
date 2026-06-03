# 部品装着インテグリティ Go-Live チェックリスト

> 対象: docs/parts-installation-integrity-design.md で設計し Phase 1〜8 で実装した
> 「部品交換の改ざん防止」機能を、本番で実際に動かすための設定・確認手順。

機能コードは全て実装・本番DB適用済み。**残るのは環境変数の設定と動作確認のみ**。
各機能は env 未設定でも安全に degrade する（SMS/アンカー/TSA は no-op、確定依頼自体は止めない）。

---

## 1. 環境変数

### 1-1. 必須（確定フローの中核）

| 変数 | 用途 | 備考 |
|---|---|---|
| `PARTS_SERIAL_PEPPER` | シリアル横断フィンガープリント(HMAC) | 32文字以上のランダム。**設定後は不変**（変えると過去のシリアル照合が壊れる） |
| `CUSTOMER_AUTH_PEPPER` | 電話フルハッシュ / OTP ハッシュ | 既存。部品確定でも流用。**不変** |
| `LEDRA_SIGNING_PRIVATE_KEY` | 確定の事業者署名（ECDSA P-256 秘密鍵 PEM） | 既存の電子署名基盤と共用 |
| `LEDRA_SIGNING_PUBLIC_KEY` | 署名検証用 公開鍵 PEM | 同上 |
| `LEDRA_SIGNING_KEY_VERSION` | 鍵バージョン（既定 `v1`） | ローテーション時に更新 |
| `NEXT_PUBLIC_APP_URL` | 確定リンク `/parts/confirm/[token]` のベースURL | SMS本文のリンクに使用 |

> ペッパー生成例: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 1-2. SMS 配信（顧客への確定リンク/OTP）

| 変数 | 用途 |
|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Twilio SMS |

未設定なら SMS は送られず、店は確定依頼APIの応答 `confirm_url` を顧客へ手動共有して運用可能。

### 1-3. ブロックチェーンアンカー（Phase 4 高額個別 / Phase 8 全件メタ）

| 変数 | 用途 |
|---|---|
| `POLYGON_ANCHOR_ENABLED` | `"true"` で有効。未設定/false は no-op |
| `POLYGON_NETWORK` | `polygon`(本番) / `amoy`(テスト) |
| `POLYGON_RPC_URL` | RPC エンドポイント |
| `POLYGON_PRIVATE_KEY` | 署名ウォレット秘密鍵（書き込み用） |
| `POLYGON_CONTRACT_ADDRESS` | LedraAnchor コントラクト |
| `CRON_SECRET` | `/api/cron/parts-anchor` の認証（Vercel cron 署名） |

### 1-4. RFC3161 タイムスタンプ（Phase 3・任意）

| 変数 | 用途 |
|---|---|
| `PARTS_TSA_ENABLED` | `"true"` で有効。未設定は no-op |
| `PARTS_TSA_URL` / `PARTS_TSA_AUTHORITY` | 国内 JIPDEC 認定TS局のエンドポイント |
| `PARTS_TSA_USERNAME` / `PARTS_TSA_PASSWORD` | 任意（TSAが Basic 認証を要求する場合） |

> 汎用 RFC3161 クライアント実装済み（`src/lib/parts/rfc3161.ts`）。**準拠エンドポイントを
> `PARTS_TSA_URL` に設定すれば動作する**（ベンダ固有 SDK 不要）。TimeStampReq(DER) を
> `application/timestamp-query` で POST し、TimeStampToken(CMS) と genTime を取得・保存する。
> 失敗時は例外（黙って無署名にしない）。投入前に実エンドポイントで 4-2 のスモークを実施すること。

> **コスト方針（決定）**: 当面は **TSA を契約せず無料運用**（`PARTS_TSA_ENABLED=false`）。
> 第三者による時刻・存在証明は **Polygon アンカー（§6.5・実質$0）** が担う。
> 認定タイムスタンプが必要になる要件（電子帳簿保存法のスキャナ保存・長期署名(LTV)の認定・
> 訴訟での認定時刻の証拠力 等）が生じた時点で、**国内 JIPDEC 認定TS局へ有料移行**する。
> 移行はコード変更不要——TS局契約 → `PARTS_TSA_URL`(＋必要なら Basic 認証) 設定 →
> `PARTS_TSA_ENABLED=true` → スモーク(4-2)、のみ。
> 注: 不安定な無料 TSA を本番採用する場合は、`signConfirmation` の TSA 呼び出しを
> ベストエフォート化（失敗しても署名＋アンカーで確定継続）する小調整を入れること。

### 1-5. 任意（既定値あり）

| 変数 | 既定 | 用途 |
|---|---|---|
| `PARTS_OTP_TTL_MIN` | 10 | OTP 有効期限（分） |
| `PARTS_CONFIRM_LINK_TTL_HOURS` | 72 | 確定リンク有効期限（時間） |

---

## 2. 適用済みマイグレーション（確認用）

| ファイル | 内容 |
|---|---|
| `20260603000000_part_installations.sql` | コア5テーブル＋拡張＋RLS |
| `20260603000001_part_installations_guard.sql` | 完全凍結ガード・追記専用・シリアル照合 |
| `20260603000003_part_confirmation_otp.sql` | 確定署名 OTP 列 |
| `20260603000004_part_installation_anchors.sql` | 高額個別アンカー記録 |
| `20260603000005_part_vehicle_meta_anchors.sql` | 車両単位 全件メタアンカー |

> いずれも本番(WEB施工証明書)へ適用済み。`supabase/migrations` にも存在。
> （索引の `CONCURRENTLY` 版は適用経路の都合で除外済み。必要時に別途追加。）

---

## 3. Cron

`vercel.json` に登録済み：

```
/api/cron/parts-anchor   毎時30分 ("30 * * * *")
```

`POLYGON_ANCHOR_ENABLED!=true` の間は skip 応答（個別アンカー・メタアンカーとも no-op）。

---

## 4. 動作確認（本番投入前のスモーク）

### 4-1. DB オブジェクト
- `part_installations` / `part_installation_evidence` / `part_serial_registry` /
  `part_integrity_findings` / `part_confirmation_signatures` /
  `part_installation_anchors` / `part_vehicle_meta_anchors` が存在し RLS 有効。
- トリガ `trg_part_installations_guard`（完全凍結）等が存在。

### 4-2. 装着→確定→凍結（最重要）
1. `POST /api/parts/installations`（店ログイン）で装着を作成 → `content_hash` が返る。
2. `POST /api/parts/confirmations` `{installation_id}` → `confirm_url` と（非本番のみ）`otpDevCode`。
3. 顧客が `confirm_url` を開く → OTP 入力（`POST .../verify-otp`）→ 内容確認 → 署名（`POST .../sign`）。
4. 装着が `customer_verified` になり、以後の内容変更は DB が拒否（完全凍結）。
   - 直叩きで `content_hash` 変更や `customer_verified` 後の UPDATE が `RAISE EXCEPTION` になることを確認。

> 完全凍結ガードは Phase 1 で本番DBに対しロールバック前提の機能テスト済み
> （署名なし確定の拒否・確定後改ざんの拒否・取消のみ許可・シリアル横断検知）。

### 4-3. 監査ダッシュボード
- `/admin/parts-integrity` を開き、`part_integrity_findings` が重大度順に表示される。
- 写真重複・シリアル使い回し・三方/数量不一致が検知時に critical/warning で並ぶ。

### 4-4. アンカー（POLYGON 有効時のみ）
- `CRON_SECRET` 付きで `/api/cron/parts-anchor` を叩く → `{individual, meta}` の件数が返る。
- `part_installation_anchors`（高額）・`part_vehicle_meta_anchors`（全件）に tx hash が記録される。

---

## 5. セキュリティ運用上の注意

- **ペッパー類（`PARTS_SERIAL_PEPPER` / `CUSTOMER_AUTH_PEPPER`）は一度設定したら変更しない**。
  変更すると過去のフィンガープリント・電話ハッシュ照合が一致しなくなる。
- **署名鍵をローテーションする場合**は `LEDRA_SIGNING_KEY_VERSION` を更新し、旧公開鍵は
  `signature_public_keys` に残す（過去署名の検証のため）。
- T7' 防止のため、**高額部品（税込10万円超）/シリアル品は顧客自身が登録した連絡先**でのみ確定可。
  店が顧客連絡先を入力する運用では、その顧客は高額確定ができない（仕様どおり）。

---

## 6. 残課題（コード外・後続）

- **④ 実 TSA ベンダ連携**：✅ 汎用 RFC3161 クライアント実装済み。あとは TS局を契約し
  `PARTS_TSA_URL`（＋必要なら Basic 認証）を設定し `PARTS_TSA_ENABLED=true` にするだけ。
  投入前に実エンドポイントでスモーク（4-2）。任意で長期署名(LTV)対応は将来拡張。
- LINE 配信（顧客 LINE 連携後）、findings の対応操作（resolved 化）、装着詳細ドリルダウン、
  公開検証への parts meta-anchor 露出。
