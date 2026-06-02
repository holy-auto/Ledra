# 部品装着インテグリティ設計（Parts Installation Integrity）

> ステータス: **設計提案 / 実装前レビュー段階**
> 目的: 整備・部品交換において「偽データの入力」と「装着部品のすり替え」を、
> 低コスト・低現場工数で実用上防止（＝必ず痕跡か矛盾が残る状態に）する。

---

## 1. 背景と達成目標

整備・板金・コーティングの部品交換で、以下を担保したい:

1. **入力時改ざん防止** — 作成されるデータ（写真・バーコード・測定値）が、入口の時点で
   偽造・加工・使い回しされていないこと。
2. **装着整合性** — 「証明書/請求に載った部品が、実際にこの車両へ装着され、納車時点でも
   そのままであること」。

### 重要な前提（正直な限界）

> **渡した物体に付けた印（シール/刻印/インク）は、車・部品・工具・時間を握る作業者の手の中にある以上、
> 物理単体では必ず破られる。** パーツクリーナーでインクは消え、シールは熱で剥離し、刻印は研磨で除去でき、
> 最終的には「部品ごとすり替え」で抜けられる。

したがって本設計は **「物理的に改ざん不能にする」ことを目標にしない**。
代わりに **「不正には複数の独立した関門をすべて欺く必要があり、必ず痕跡か矛盾が残り、割に合わない」** 状態を作る。
= 防止(prevention)ではなく **抑止＋検知＋説明責任(deterrence + detection + accountability)**。

---

## 2. 脅威モデル

| # | 脅威 | 具体例 |
|---|---|---|
| T1 | 偽データ入力 | 実測していない膜厚値をPOST／加工写真をアップロード |
| T2 | 使い回し / リプレイ | 同じバーコード・同じ写真を別案件で再提出 |
| T3 | 確定後の書き換え | 署名済み証明書の本文・測定値を後から直接UPDATE |
| T4 | **納車時すり替え (TOCTOU)** | 撮影は新品、納車前に中古/社外品へ差し替え、純正を転売 |
| T5 | 調達・請求不正 | 純正を仕入れていない／安価品を純正として請求 |
| T6 | 数量水増し・二重計上 | 1入荷を複数案件で重複請求 |

T1〜T3・T5・T6 は**データ/会計レイヤーで詰められる**。
T4（物理すり替え）だけは物理問題で、**第三者検証＋相互矛盾検知＋経済責任**で抑止する。

---

## 3. 設計原則

1. **物理対策は最小限・場所限定・任意** — シール/刻印は「破ると痕跡が残る」程度に留める。
2. **決め手は店が支配できない瞬間と第三者** — 納車時に**顧客**が検証する（出口の封鎖）。
3. **単一の印ではなく相互矛盾検知** — 写真・三方照合・在庫数量・AIの複数記録が互いに矛盾しないことを要求。
4. **整合性値はサーバ計算のみ** — ハッシュ・グレードはクライアント送信値を信用しない。
5. **記録は不変（append-only / 確定後凍結）** — 既存 guard トリガ方式を踏襲。
6. **経済・責任で割に合わなくする** — 証拠に保証・責任を紐付け、抜き取り監査。
7. **リスク階層** — 全部品に重い対策は課さない。高額部品のみ厳格、消耗品は数量/会計突合。
8. **現場工数の最小化** — 既存の作業写真に相乗り。判定はサーバ/AIで自動。

---

## 4. アーキテクチャ（レイヤー構成）

```
L7 検知・経済    : AI異常検知 / 抜き取り監査 / 保証・責任の紐付け
L6 不変記録      : append-only + 確定後凍結トリガ + (任意) Polygonアンカー
L5 装着検証★    : 納車時に顧客がスキャン照合（T4の決め手）
L4 物理(任意)    : 封印シール / レーザー刻印（場所限定・高リスク品のみ）
L3 調達整合      : 三方照合（納品書OCR ↔ 請求 ↔ 作業/証明書）+ 数量突合
L2 個体/数量整合 : シリアル全体一意 / 知覚ハッシュ重複検知 / 在庫消費突合
L1 入口プロベナンス: 測定器ペイロード署名 / サーバ側ハッシュ計算
L0 写真真正性    : C2PA・端末アテステーション・SHA256（既存 certificate_images 流用）
```

★ = T4（すり替え）に対する中核。物理(L4)が破られても L5+L2+L3+L7 の矛盾で検知する。

---

## 5. 部品タイプ別 防御マトリクス

個体識別の有無で取れる手段が変わる。**シリアル一意は一部の高額部品しか効かない**点が肝。

| 部品タイプ | 例 | 個体識別 | 主防御 | 物理(任意) | 現場工数 |
|---|---|---|---|---|---|
| シリアル有り | ECU・エアバッグ・EV電池 | シリアル | L2 全体一意 + L5 顧客検証 | レーザー刻印 | ≒ゼロ |
| ロットのみ | パッド・フィルター・プラグ | ロット(共通) | L3 三方照合 + L2 数量突合 + 旧品突合 | 封印シール | 撮影+旧品 |
| 液体・消耗品 | オイル・冷却水・コーティング剤 | 無し | **L3 三方照合 + 在庫数量突合** | — | ≒ゼロ |
| 高額・重要 | 触媒・タービン等 | 物による | 上記 + L4 + L5 必須 | 刻印/封印 | 中 |

旧品突合 = 取り外した部品も撮影し「新品1 ↔ 旧品1」を照合（T4補強）。

---

## 6. データモデル案

### 6.1 新規テーブル

```
part_installations            -- 装着イベント1件（どの作業で・どの車に・何を付けたか）
  id, tenant_id
  job_order_id / reservation_id   -- 作業との紐付け
  vehicle_id
  inventory_item_id (nullable)    -- 在庫マスタとの紐付け
  part_name, gtin, lot_code, serial_no (nullable)
  part_kind  CHECK in('serialized','lot_only','consumable','high_value')
  quantity, unit
  installed_by (auth.users), installed_at
  status     CHECK in('installed','customer_verified','disputed','voided')
  customer_verified_at, customer_verified_via
  content_hash               -- サーバ計算 SHA256（行内容の固定）
  created_at

part_installation_evidence    -- 装着イベントに紐づく証拠（写真/伝票/旧品）
  id, tenant_id, installation_id
  kind  CHECK in('install_photo','context_photo','old_part_photo',
                 'delivery_note','removed_part','seal','marking')
  -- 写真は certificate_images の真正性カラム群を流用/共有
  storage_path, sha256, perceptual_hash
  c2pa_verified, device_attestation_verified, authenticity_grade
  exif_captured_at, capture_nonce       -- リプレイ封じ（ワンタイム値の写し込み）
  ocr_extracted jsonb                   -- 納品書OCR結果（三方照合用）
  created_at

part_integrity_findings       -- 相互矛盾/異常の自動検知結果（L7）
  id, tenant_id, installation_id
  rule  -- 'serial_reused' | 'photo_duplicate' | 'qty_mismatch'
        -- | 'three_way_mismatch' | 'context_mismatch' | 'deepfake'
  severity, detail jsonb, status, created_at
```

### 6.2 シリアル全体横断レジストリ（決定: プラットフォーム全体一意）

シリアル品の使い回し検知は **テナント横断（プラットフォーム全体）** で行う（決定事項 §10-2）。
ただしテナント間でデータを覗かせないため、**生のシリアルではなくハッシュで照合**する。

```
part_serial_registry          -- 全テナント横断のシリアル消費台帳（個体の一回限り使用）
  id
  serial_fingerprint  text UNIQUE   -- HMAC(gtin + serial_no, platform_pepper)。生値は保存しない
  consumed_by_tenant_id            -- 監査用（RLSで他テナントには非開示）
  installation_id
  consumed_at
```

- 装着時、`serial_fingerprint` を **UNIQUE 制約**で登録 → 既存衝突なら **2件目を拒否/フラグ**（T2 使い回し）。
- 生のシリアルや所有テナントは他テナントへ開示しない（衝突の有無だけを返す `SECURITY DEFINER` 関数経由）。
- `inventory_items` … `gtin`, `default_serial_tracked boolean` を追加（現状 `sku`/`supplier_sku` のみ）。
- `inventory_movements` … `installation_id` を追加し「装着＝消費(out)」を直結（数量突合 L2 の根拠）。

### 6.3 不変性（L6） — 決定: **完全凍結（service-role 含む）**

確定後は **運営/service-role を含め誰も変更できない**（決定事項 §10-1）。
既存 guard は `auth.uid() IS NULL`（service-role）を例外にしていたが、本テーブルは **例外を設けない**。

- `part_installations` … `status='customer_verified'` 以降、
  `BEFORE UPDATE OR DELETE` トリガで **無条件に拒否（`RAISE EXCEPTION`）**。
  service-role でも編集・削除不可（`supply_partners_guard` と同じ `SECURITY DEFINER` /
  `SET search_path=''` パターンだが、auth.uid() 分岐を持たない完全版）。
- `part_installation_evidence` … 生成後は `BEFORE UPDATE OR DELETE` で **常時拒否**（append-only）。
- **訂正手段**: 確定済みレコードは編集できないため、誤りは
  **`status='voided'`（取消・理由必須）＋ 新規装着レコードの再発行** でのみ表現する
  （会計の赤伝・再発行と同じ考え方。履歴は両方残る）。
- 任意で `content_hash` を Polygon アンカー（既存 `certificate_images.polygon_tx_hash` 経路を再利用）。

### 6.4 確定フロー（発行＝納車時の顧客確認）

> **明記事項**: 顧客確認後は一切の変更ができない。

```
installed            装着・証拠登録済み（この間は店が修正可能）
   │  ← 発行(納車)時、顧客に内容(部品・数量・写真・証拠)を「再提示」
   ▼
[顧客が内容を確認・同意]   ← customer_verified_at / via を記録
   ▼
customer_verified    ★ ここで完全凍結。店も運営も service-role も変更不可
```

- 発行時 UI で **確定前に内容を再表示**し、顧客の明示的な確認操作をもって `customer_verified` に遷移。
- 遷移は一方向（`installed → customer_verified` のみ）。`customer_verified` からの更新は
  トリガが拒否するため、UI 上も編集導線を出さない。
- 訂正が必要な場合は §6.3 の **取消＋再発行** のみ（顧客の再確認が再度必要）。

---

## 7. 既存コードへの影響分析

| 領域 | 既存資産 | 本設計での扱い | 影響度 |
|---|---|---|---|
| 写真真正性 | `certificate_images`（C2PA/アテステーション/sha256/知覚ハッシュ/Polygon） | **流用**。装着写真も同パイプラインに通す | 低（再利用） |
| 監査/不変性 | `certificate_edit_histories`・`order_audit_log`（append-only）、`supply_partners_guard` | **パターン踏襲**で新トリガ追加 | 低 |
| 作業 | `job_orders`（明細なし）・`reservations` | `part_installations` から FK。job明細は新設 | 中 |
| 在庫 | `inventory_items` / `inventory_movements` | カラム追加＋装着消費の直結 | 中 |
| 調達 | `suppliers` / `purchase_orders`(draft→received) / 供給パートナーWebhook | L3 三方照合の突合相手。将来は電子納品データ源 | 中 |
| AI | `ai_usage_logs` / `ai_extracted` / `ai_auto_actions` / thickness `ai_anomaly` | 納品書OCR・矛盾検知に流用 | 低（再利用） |
| 顧客検証 | `customer` ポータル / `passport` / `verify` / `my/verify` | **L5 納車時検証 UI** を追加 | 中（新UI） |
| 測定器 | `/api/external/nexptg/sync`（静的APIキー認証） | L1: ペイロード署名検証を追加（後方互換） | 中 |
| RLS | `my_tenant_ids()` / `tenant_memberships` 規約 | 新テーブルへ同規約で適用 | 低 |

**破壊的変更なし**を原則とする（既存カラムは追加のみ、既存挙動は不変）。

---

## 8. 段階導入計画

- **Phase 1（土台・低工数）**: `part_installations` + `part_evidence` 新設、装着写真を
  `certificate_images` 真正性パイプラインに接続、サーバ側ハッシュ、append-only/凍結トリガ。
  → T1・T2・T3 を即カバー。現場は「写真を撮るだけ」。
- **Phase 2（会計整合）**: 納品書OCR（AI流用）＋ `purchase_orders`/在庫との三方照合・数量突合。
  → T5・T6 をカバー。
- **Phase 3（装着検証）**: 納車時の顧客スキャン検証 UI（passport/verify 流用）＋ 旧品突合。
  → T4 の中核を投入。
- **Phase 4（任意・高リスク）**: 封印シール/レーザー刻印の固有番号発行・照合、Polygonアンカー、
  AI相互矛盾検知の自動フラグ、抜き取り監査ダッシュボード。

---

## 9. 残存リスク（明記）

- 物理すり替え(T4)は**確率的抑止**であり、ゼロにはできない。封印・刻印は破られ得る。
- 顧客検証(L5)は顧客の協力に依存（未実施なら出口が開く）→ 高額部品は必須運用に。
- ロットのみ/消耗品は個体追跡不能 → 数量・会計突合と顧客信頼で代替。
- 部品商が紙主体のため、L3 は当面 **納品書OCR** が現実線（電子納品は将来）。

---

## 10. 意思決定

### 決定済み
1. ✅ **凍結の例外 → 完全凍結**。`customer_verified` 後は service-role/運営含め一切変更不可
   （§6.3・§6.4）。訂正は「取消＋再発行＋顧客の再確認」のみ。
2. ✅ **シリアル一意のスコープ → プラットフォーム全体横断**。テナント秘匿のため
   ハッシュ(`serial_fingerprint`)で衝突照合（§6.2）。

### 未決（Phase 進行に合わせて確定）
3. **顧客検証の必須範囲**: 高額部品のみ必須か、全件任意か（Phase 3 で確定）。
4. **アンカーの対象**: 全装着 / 高額のみ / 無効化（Phase 4・コスト判断）。
5. **測定器署名(L1)**: 既存テナントAPIキーとの後方互換と鍵配布方式（Phase 1〜2）。

---

_本書は実装前の合意形成用。承認後、Phase 1 からデータモデル/マイグレーションに着手する。_
