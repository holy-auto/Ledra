# 車両デジタルパスポート 設計ドキュメント

> Ledra Identity 強化ロードマップ **軸①**
> ドラフト: 2026-04-24

---

## 1. 目的 (Why)

Ledra は現状、**施工店（テナント）ごとの証明書管理** に最適化されている。
これを **車両（VIN）単位** のデジタルパスポートへ昇格させ、

- 車両が**所有者・テナントを越えてID（履歴）を持ち歩ける**
- 中古車売買・保険査定で「Ledra履歴のある車 = 信頼できる車」として市場価値を生む
- NFC / QR の着地点を「個別証明書」から「車両の一生」へ広げる

ことを目指す。これが Ledra を「単なるSaaS」から「車両真正性インフラ」へ引き上げる起点になる。

## 2. 非ゴール (Non-goals)

- 車検証情報の公的データベース化（行政連携は別軸）
- 車両の売買マッチング（既存の中古車マーケット `/market/` の役割）
- 所有者間での履歴の譲渡フロー v1 では対象外（将来拡張）
- 施工店が**他テナントの証明書を編集できる**ようにする（絶対にしない）

---

## 3. 現状（調査サマリ）

| 項目 | 現状 | 出典 |
|---|---|---|
| VIN フィールド | `vehicles.vin_code text NULL` | `supabase/migrations/20260313020000_core_tables.sql:54-70` |
| VIN 一意性 | **テナントスコープの index のみ**（`idx_vehicles_vin ON (tenant_id, vin_code)`）、グローバルユニークではない | 同上 |
| Polygon アンカー | `certificate_images.polygon_tx_hash` に **画像単位** で保存 | `supabase/migrations/20260412100000_polygon_anchor_tx.sql` |
| `ServiceTimeline` | `tenant_id + vehicle_id` スコープ、VIN では横断不可 | `src/app/admin/vehicles/[id]/ServiceTimeline.tsx` |
| 公開証明書ページ | `/c/[public_id]`、service role + PII マスク | `src/app/c/[public_id]/page.tsx` / `src/lib/certificate/publicData.ts:131-159` |
| NFC書き込み先 | `/c/{public_id}` 固定、証明書単位 | `src/app/admin/nfc/NfcClient.tsx:191` |

**最大の設計制約**：同一VINが複数テナントに存在しうる。例えば同じ車が A店でコーティング → B店でPPF → C店で車検整備、の場合、`vehicles` 行が3本できる。

---

## 4. 設計の肝となる決定事項

### D1. VINユニーク化はしない（**集約モデル**を採用）

既存の `vehicles` テーブルはテナント所有のまま触らず、**上位レイヤーで集約する**。
理由：
- 既存の tenant RLS / `createTenantScopedAdmin` / 請求帰属を壊さない
- 各施工店は「自店が触った車両」として `vehicles` 行を持ち続ける（所有/編集権限の単位）
- VIN単位の集約は read-only の **投影（projection）** として新テーブルで表現する

→ 新規に `vehicle_passports` テーブル（VIN正規化キー）を作り、施工店の `vehicles` と M:1 で紐付ける。

### D2. パスポートに載るのは「Polygonアンカー済み画像を持つ証明書」のみ

**理由**：改ざん検知可能なデータのみが「車のパスポート」を名乗れる。下書き・未アンカーの証明書は **除外**（施工店内 `/admin/vehicles/[id]` には引き続き表示）。

**副作用**：アンカー率がパスポートの充実度に直結するため、**アンカーのデフォルト有効化**を強く後押しする圧力になる（プロダクト戦略として望ましい）。

### D3. 公開URL は `/v/[vin]`（短い）

- NFCタグ容量（NTAG213 = 144 byte）を考慮し、ドメイン込みで 30 文字台を目指す
- 既存の `/c/[public_id]` と並列の公開ルート
- 例: `https://ledra.jp/v/JH4DC53001S000001`

### D4. VIN正規化ルール

- 大文字化、全角→半角、ハイフン除去、ゼロパディングなし（= 生VINそのまま）
- 入力時に正規化し `vin_code_normalized` 列に保存（`vehicles` と `vehicle_passports` 両方）
- 既存 `vehicles.vin_code` は触らず、追加列として導入

### D5. プライバシーモデル

既存の `/c/[public_id]` が採用している **PII マスク方針** を踏襲：
- 顧客名: 先頭1文字 + ◯ マスク（例: 田◯）
- 電話番号: 下4桁ハッシュのみ
- メール / notes / 価格: **非表示**
- 施工店名 / 施工内容 / 日付 / アンカーTx: **表示**

### D6. テナントのオプトアウト

施工店が「この車両はパスポートに載せたくない」と明示した場合、`vehicles.passport_opt_out = true` で当該施工店由来の証明書のみ非表示に。車両全体を非表示にはしない（別テナントの証明書が載っていれば表示は継続）。

### D7. NFCは段階移行、v1では**併存**

- 新規発行NFCタグのデフォルトURLを `/v/{vin}` に切替（証明書が紐付けば自動で決定）
- 既存の `/c/{public_id}` タグは**そのまま有効**（公開ページを維持）
- `/c/{public_id}` ページのヘッダに「この車両の全履歴を見る →」リンクを追加、既存タグからも誘導

---

## 5. データモデル

### 5.1 新規テーブル `vehicle_passports`

```sql
CREATE TABLE vehicle_passports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin_code_normalized  text NOT NULL UNIQUE,     -- 正規化VIN、グローバルユニーク
  display_maker        text,                     -- 代表値（最新の vehicles から拾う）
  display_model        text,
  display_year         int,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_activity_at     timestamptz NOT NULL DEFAULT now(),
  anchored_cert_count  int NOT NULL DEFAULT 0,   -- アンカー済み証明書の実本数（cache）
  tenant_count         int NOT NULL DEFAULT 0,   -- 関与テナント数（cache）
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicle_passports_last_activity
  ON vehicle_passports (last_activity_at DESC);
```

### 5.2 既存 `vehicles` への追加列

```sql
ALTER TABLE vehicles ADD COLUMN vin_code_normalized text;
ALTER TABLE vehicles ADD COLUMN passport_opt_out boolean NOT NULL DEFAULT false;

-- 既存データバックフィル（nullable のままで先にマイグレート、後続で NOT NULL 化は見送り）
UPDATE vehicles
  SET vin_code_normalized = UPPER(REPLACE(TRANSLATE(vin_code, '－‐−', '---'), '-', ''))
  WHERE vin_code IS NOT NULL;

CREATE INDEX idx_vehicles_vin_normalized
  ON vehicles (vin_code_normalized)
  WHERE vin_code_normalized IS NOT NULL;
```

※ zero-downtime 原則に従い、NOT NULL 制約は後続のマイグレーションで（バックフィル完了後に）付ける。

### 5.3 RLS ポリシー

- `vehicle_passports` は **公開読み取り** だが、書き込みはサーバ（トリガー経由のみ）
  - `GRANT SELECT ON vehicle_passports TO anon, authenticated;`
  - `INSERT/UPDATE/DELETE` は service role のみ
- `vehicles.passport_opt_out` の更新は既存のテナント RLS に従う

### 5.4 upsert トリガー（または DB 関数 + アプリ側呼び出し）

証明書の画像が**初めてアンカー成功した瞬間**に `vehicle_passports` を upsert：

1. `vehicles.vin_code_normalized` を引く（なければスキップ）
2. `vehicle_passports` に upsert（`anchored_cert_count`, `last_activity_at` を再計算）
3. `tenant_count = 関与tenant数` を recompute

**実装場所**：DB トリガーだと RLS / service role の切り分けが複雑になるため、**アプリケーション層**（`src/lib/anchoring/` のアンカー成功ハンドラ）で明示的に `upsertVehiclePassport(vin)` を呼ぶ方針を推奨。

---

## 6. ルート & ページ

### 6.1 公開パスポートページ `/v/[vin]`

**ファイル**: `src/app/v/[vin]/page.tsx`

**データ取得**（service role、PII マスク）:
1. `vehicle_passports` を `vin_code_normalized` で引く。ヒットしなければ 404。
2. そのVINに紐付く全 `vehicles.id`（tenant横断）を集める。
3. 各テナントの `certificates` のうち、**アンカー済み画像を1枚以上持つもの**のみ取得。
4. `vehicle_histories`（テナント横断）、`certificate_images`（アンカー情報）を JOIN。
5. `reservations` / `nfc_tags` は公開ページでは**載せない**（過剰な情報漏洩を避ける）。

**UI構成**（上から）:
1. 車両見出し（メーカー / 車種 / 年式）+ パスポート発行番号（VIN下6桁の英数）
2. サマリバッジ: `アンカー済み証明書 N件` / `関与施工店 M店` / `初回登録 YYYY-MM`
3. **Cross-tenant ServiceTimeline**（新コンポーネント、後述）
4. 各証明書カード: 施工店名 / 施工種別 / 日付 / Polygon Tx リンク / 元の `/c/{public_id}` へ遷移
5. フッター: 「この証明書の真正性は Polygon PoS ネットワーク上で検証可能です」

### 6.2 新コンポーネント `PassportTimeline`

既存 `ServiceTimeline` を継承しつつ:
- テナント横断でイベントを集約
- 各イベントに **施工店バッジ** を付ける（どこでやった施工かが分かる）
- `tenantId` をスコープに取らない API を受け付ける

**ファイル配置**: `src/components/passport/PassportTimeline.tsx`
既存 `ServiceTimeline` のロジック抽出版として `src/lib/passport/aggregateEvents.ts` に純粋関数を切り出す。

### 6.3 既存 `/c/[public_id]` の強化

公開証明書ページのヘッダに

> 🪪 **この車両の全履歴を見る** → `/v/{vin_code_normalized}`

バッジを追加。パスポート未登録のVINなら非表示。

### 6.4 管理画面からの参照導線

`/admin/vehicles/[id]` の右上に「パスポート公開ページを開く」ボタン。
opt_out 切替トグルも同ページに配置。

---

## 7. NFC移行計画

### フェーズ1（v1）: 新規タグは`/v/{vin}`、既存は据え置き

- `src/app/admin/nfc/NfcClient.tsx:191` の書き込み先を切替
  - 証明書に `vehicle.vin_code_normalized` があれば `/v/{vin}`
  - なければ従来通り `/c/{public_id}`（フォールバック）
- 既存タグの再書き込みは**施工店の任意操作**（UI から「パスポートURLに更新」ボタン）

### フェーズ2（将来）: `/c/{public_id}` アクセス時に `/v/{vin}` へソフトリダイレクト

- `/c/{public_id}` ページ先頭に「🪪 全履歴を見る」モーダルを常時表示
- 運用データで移行率を観測してから段階実施

**非破壊**: `/c/{public_id}` のURLスキームは**永久に壊さない**（既に印刷済みの紙QRが存在するため）。

---

## 8. プライバシー & 漏洩リスク

| リスク | 対策 |
|---|---|
| 同一VINで他テナントが触った事実が露出 → 施工店の営業情報が漏れる | opt-out機構 (D6)、 かつ表示する情報は**PII マスク後のデータ**のみ |
| 顧客が「自分の車の履歴をネットで見られたくない」 | 将来拡張: 顧客ポータルのOTP で「自分のVINを passport から隠す」機能。v1 では施工店側 opt-out のみで対応 |
| 偽のVINを入力してURL を生成 | `vehicle_passports` にレコードが無いVINは404 |
| `/v/{vin}` でのボット scraping | rate limit (preset: `general`)、robots.txt で disallow |

**v1 の明示的な割り切り**：
- 顧客本人から passport への直接的な「非表示にして」UIは出さない（施工店経由）
- 既に `/c/{public_id}` で公開されている情報のみ集約するので、新規の情報漏洩は発生しない

---

## 9. 実装フェーズ（PR分割）

| PR | 内容 | 規模 |
|---|---|---|
| **PR-1** | マイグレーション: `vehicle_passports` 新規 + `vehicles` 列追加 + 既存VINバックフィル | S |
| **PR-2** | アンカー成功フックで passport upsert / VIN正規化ユーティリティ | S |
| **PR-3** | `/v/[vin]` 公開ページ + `PassportTimeline` + イベント集約ロジック（**案A: 証明書カード毎にアンカーバッジ**） | M |
| **PR-4** | `/c/[public_id]` へのパスポートバッジ追加 + 管理画面からの導線 + **施工店単位の opt-out トグル** | S |
| **PR-5** | NFC書き込み先切替 + 既存タグの「パスポートURLに更新」UI | S |
| **PR-6** | 既存証明書のパスポート集約のバッチ backfill | S |
| **PR-7 (v2)** | **パスポートメタアンカー**：VIN + 全画像txHashのmerkle root を Polygon にアンカー | M |

**v1 完了条件**：PR-1〜4 まで入れば、対外的に「パスポート機能」を名乗れる。PR-5, 6 は後追いで可。
**v2**: PR-7 でパスポート全体を1つの証拠に集約し、「この車両の全履歴が改ざんされていない」ことを単一 Tx で検証可能にする。

---

## 10. 確定事項（2026-04-24 合意）

| # | 論点 | 決定 |
|---|---|---|
| Q1 | VIN未入力車両の扱い | **VIN有のみをパスポート対象とする**。車検証OCRで VIN 入力率を上げる施策は別途。 |
| Q2 | 画像単位アンカーのUI可視化 | **案A: 各証明書カードに「この証明書の画像 N/M 枚アンカー済み ✓」バッジ**を表示（信頼性の可視化を優先） |
| Q3 | パスポートメタアンカー (v2) | **ロードマップに入れる**（PR-7）。VIN + 全画像txHash の Merkle root を Polygon にアンカー |
| Q4 | opt-out の粒度 | **施工店単位のみ**（`vehicles.passport_opt_out`）。証明書単位の opt-out は v1 では提供しない |

### 参考: 将来検討項目（論点として保留）

- **海外/輸入車VIN (17文字) と 国内車台番号 (可変長) の混在**: 正規化ルール (D4) は両対応可能だが、検索UX（部分一致 or 完全一致）は v1 では完全一致のみ。
- **顧客本人からの opt-out**: v1 では施工店経由のみ。顧客ポータル OTP からの操作は v2 以降で検討。
- **所有者変更時の履歴譲渡フロー**: v2 以降。

---

## 11. 成功指標

v1 リリース後 90日で以下を観測：

- **アンカー有効化率**: 新規発行証明書のうち Polygon アンカーが成功した割合 → 60%以上
- **パスポートアクセス**: `/v/[vin]` の月間UU → 新規発行数の 2倍（1証明書あたり平均2閲覧）
- **NFC移行**: 新規タグの `/v/{vin}` 書き込み比率 → 80%以上
- **opt-out率**: `passport_opt_out = true` のvehicles → 5%未満（低いほど健全）

---

## 参考

- `docs/architecture-roadmap.md` — 中長期アーキ全体像
- `docs/polygon-anchoring-deployment.md` — アンカリング本番投入手順
- `docs/research-blockchain-automotive-japan-2026.md` — 市場調査
- `src/lib/certificate/publicData.ts` — 公開ページのPII マスク方針
- `src/app/admin/vehicles/[id]/ServiceTimeline.tsx` — 単店舗タイムライン実装
