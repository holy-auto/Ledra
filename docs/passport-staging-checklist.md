# 車両パスポート公開機能 — Staging / 本番チェックリスト

`PASSPORT_PUBLIC_ENABLED=true` で公開機能をオンにする前後に走らせる
チェックリストです。E2E ブラウザテスト相当を curl ベースで再現できるよう
にした smoke スクリプトと、運営が確認すべき GUI チェックを併記します。

関連コード:
- 公開フィーチャーゲート: `src/lib/passport/featureGate.ts`
- 検証 API: `src/app/api/v1/passport/*/route.ts`
- 公開ページ: `src/app/v/[vin]/page.tsx`
- 設計: `docs/vehicle-passport-design.md` §8

---

## 1. 事前準備

### 1.1 環境変数

Vercel の staging 環境に以下を設定:

| キー | 値 | 必須 |
|---|---|---|
| `PASSPORT_PUBLIC_ENABLED` | `true` | yes |
| `CUSTOMER_AUTH_PEPPER` | (64 hex chars) | yes |
| `POLYGON_ANCHOR_ENABLED` | `true` (amoy testnet 推奨) | yes |
| `POLYGON_NETWORK` | `amoy` | staging |
| `POLYGON_RPC_URL` | `https://rpc-amoy.polygon.technology` | staging |
| `POLYGON_PRIVATE_KEY` | (署名用ウォレット) | yes |
| `POLYGON_CONTRACT_ADDRESS` | (deploy 済み LedraAnchor) | yes |
| `CRON_SECRET` | (cron 認証用) | yes |
| `STRIPE_SECRET_KEY` | `sk_test_...` (staging) | optional |
| `APP_URL` | `https://staging.example.com` | yes |

### 1.2 マイグレーション確認

```sql
-- staging Supabase で実行
\d vehicle_passports
\d passport_api_consumers
\d passport_api_keys
\d passport_api_call_logs
\d passport_api_billing_periods
\d passport_ownership_transfers
```

`meta_anchor_*` 6 列が `vehicle_passports` に存在することを確認。

### 1.3 初期データ

- 運営テナント (`PLATFORM_TENANT_ID`) のオーナーで `/admin/platform/passport-consumers`
  にアクセスできることを確認
- テスト用 consumer を 1 件作成、`passport:verify` スコープのキーを発行
  (raw key を控える → 以下 `$KEY` として使用)
- VIN 付き車両を 1 台用意し、最低 1 件のアンカー済み証明書を作成

---

## 2. Smoke テスト (curl)

`$BASE` を staging URL に、`$KEY` を発行したキーに置換して順に実行:

```bash
export BASE="https://staging.example.com"
export KEY="lpk_live_xxxxxxxx..."
export VIN="JH4DC53001S000001"    # ↑ で用意した実 VIN に置換
```

### 2.1 ゲート OFF 時の挙動 (PASSPORT_PUBLIC_ENABLED=false を一時的に)

事前に env を `false` に戻して再 deploy 後:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/v/$VIN"
# 期待: 404

curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/passport/verify?vin=$VIN"
# 期待: 404

curl -s -o /dev/null -w "%{http_code}\n" \
  "$BASE/api/passport/transfers/$(printf '0%.0s' {1..64})"
# 期待: 404

curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST -H "Content-Type: application/json" \
  -d '{"vin":"'"$VIN"'"}' "$BASE/api/public/vehicle-report/checkout"
# 期待: 404
```

`PASSPORT_PUBLIC_ENABLED=true` に戻して再 deploy 後:

### 2.2 公開ページ

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/v/$VIN"
# 期待: 200 (アンカー済み証明書がある VIN)

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/v/UNKNOWNVIN0000000"
# 期待: 404
```

### 2.3 検証 API

```bash
# 認証なし → 401
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/passport/verify?vin=$VIN"

# 不正キー → 401
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer lpk_live_garbage" \
  "$BASE/api/v1/passport/verify?vin=$VIN"

# 正常 → 200 + meta_anchor を含む payload
curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/passport/verify?vin=$VIN" | jq '{
    passport_id, summary,
    meta_anchor: .meta_anchor,
    cert_count: (.certificates|length)
  }'
```

`meta_anchor.hash` を控えて、ローカルで再計算して一致するか確認:

```bash
# certificates[].polygon_tx_hash を取り出して sorted-concat + sha256
curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/passport/verify?vin=$VIN" \
  | jq -r '[.vin_normalized] + ([.certificates[].polygon_tx_hash] | sort | unique | .[] | ascii_downcase) | join("\n")' \
  | sha256sum
# ↑ /verify レスポンスの meta_anchor.hash と一致すること
```

### 2.4 月次クォータ (429)

`monthly_quota=3` の consumer を一時的に作って 4 回叩く:

```bash
for i in 1 2 3 4; do
  echo -n "call $i: "
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $KEY_LOW_QUOTA" \
    "$BASE/api/v1/passport/verify?vin=$VIN"
done
# 期待: 200, 200, 200, 429
```

### 2.5 所有権移転 (admin)

GUI で `/admin/vehicles/<id>/passport-transfer` を開いて

1. メール送信先を staging 用テストアドレスにして「依頼を送信」
2. 受信メールのリンクが `$BASE/passport/transfer/<token>` を指していることを確認
3. リンクを開いて「受諾」ボタンが見えることを確認
4. 受諾後に GUI が「受諾済み」に変わることを確認
5. `/v/$VIN` を再読込してメタアンカーバッジが残っていることを確認

### 2.6 Cron スモーク

```bash
# 月次 billing cron — 当月をリプレイ
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE/api/cron/passport-billing?period=$(date -u +%Y-%m)"
# 期待: { ok: true, reported_count: N, ... }

# メタアンカー失敗の retry cron
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE/api/cron/passport-meta-anchor-retry"
# 期待: { ok: true, scanned: 0, anchored: 0, still_failed: 0, raced: 0 }
```

---

## 3. 自動 smoke スクリプト

`scripts/passport-staging-smoke.sh` (この PR で追加) を以下のように使用:

```bash
BASE="https://staging.example.com" \
KEY="lpk_live_xxxxxxxx" \
VIN="JH4DC53001S000001" \
  bash scripts/passport-staging-smoke.sh
```

すべての assertion が `OK` を出せば公開準備完了。1 件でも `FAIL` が出たら
ロンチを止めて該当箇所を調査する。

---

## 4. 本番ロンチ

1. staging で 2 の全項目が成功している
2. Stripe を本番 mode に切り替えるなら `docs/passport-stripe-billing-setup.md` §1 を実施済み
3. 本番 Vercel 環境変数で `PASSPORT_PUBLIC_ENABLED=true` に設定
4. デプロイ → 2.2 / 2.3 / 2.6 の本番版を再実行
5. 運営内向けに「公開機能ON」をアナウンス
6. NFC タグ書き込み先切替 (PR-5 残作業) のロールアウト
