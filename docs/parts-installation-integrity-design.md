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
| T7 | **店による確認代行（なりすまし確定）** | 顧客の代わりに店が「顧客確認」を押して勝手に凍結する |
| T7' | **店が連絡先を支配** | 顧客欄に店の番号/LINEを登録し、OTP/リンクを店が受信して自署 |

T1〜T3・T5・T6 は**データ/会計レイヤーで詰められる**。
T4（物理すり替え）だけは物理問題で、**第三者検証＋相互矛盾検知＋経済責任**で抑止する。
T7 は **顧客本人の電話OTP所持証明＋電子署名のDB強制**で封じる（§6.4）。
T7' は **連絡先出所の検証（高額品は顧客登録連絡先必須）＋出所記録・格下げ**で封じる（§6.4.1）。

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
L5 装着検証★    : 納車時に顧客が【本人の携帯で電子署名】＋電話番号整合をDB強制（T4/T7の決め手）
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
  customer_id                     -- 顧客本人特定（電話ハッシュ整合の照合先）
  part_kind ...                   -- (上掲)
  required_assurance text         -- part_kind から導出: 'customer_otp'|'store_contact_otp'|'any'
  status     CHECK in('installed','customer_verified','disputed','voided')
  confirmation_signature_id       -- ★顧客電子署名(part_confirmation_signatures)へのFK。確定の必須条件
  customer_verified_at, customer_verified_via
  void_reason, voided_by, voided_at  -- 確定後に許される唯一の遷移(voided)の記録
  content_hash               -- サーバ計算 SHA256（canonical_manifest。署名対象 document_hash の素）
  created_at

part_confirmation_signatures  -- ★確定＝顧客本人のOTP所持証明＋電子署名（既存OTP＋鍵署名を結合）
  id, tenant_id, installation_id
  token UNIQUE, expires_at        -- 単回・短期限・レート制限のワンタイムURL
  channel CHECK in('line','sms','in_store_tablet')   -- 送信/実施経路
  assurance CHECK in('customer_otp','store_contact_otp','in_store_tablet')  -- ★保証グレード(6.4.1)
  contact_provenance CHECK in('customer','store')    -- 送り先連絡先の出所
  document_hash, document_hash_alg -- 確定時点の content_hash を封入（内容が変わると不一致）
  status CHECK in('pending','otp_verified','signed','expired','cancelled')
  -- 本人性の証跡（電子署名法 第2条第1号）
  otp_verified_at, signed_at, signer_ip, signer_user_agent
  signer_phone_full_hash          -- ★OTP検証済み電話の sha256(v1|tenant_id|E164|PEPPER)（主キー照合）
  signer_phone_last4_hash         -- 補助（従来照合互換）
  witness_staff_id                -- in_store_tablet 時の立会いスタッフ
  signature, signing_payload, public_key_fingerprint, key_version  -- 非改ざん性（同 第2号）
  tsa_token bytea, tsa_authority text, tsa_timestamp_at timestamptz  -- ★RFC3161 タイムスタンプ(存在/時刻証明)
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
- `customers` … `phone_full_hash text`（確定照合の主キー、`sha256(v1|tenant_id|E164|PEPPER)`）、
  `contact_provenance CHECK in('customer','store')`, `contact_verified_at`, `contact_verified_via`
  を追加（§6.4.1 の連絡先出所判定）。既存 `phone_last4_hash` は互換のため温存。

### 6.3 不変性（L6） — 決定: **完全凍結（service-role 含む）**

確定後は **運営/service-role を含め誰も変更できない**（決定事項 §10-1）。
既存 guard は `auth.uid() IS NULL`（service-role）を例外にしていたが、本テーブルは **例外を設けない**。

- `part_installations` … `status='customer_verified'` 以降、`BEFORE UPDATE OR DELETE` トリガで
  **`status`→`voided`（理由必須）への遷移以外のすべての更新と、DELETE を拒否（`RAISE EXCEPTION`）**。
  内容・署名・identity 列は一切変更不可。service-role でも同様（`supply_partners_guard` と同じ
  `SECURITY DEFINER` / `SET search_path=''` パターンだが、auth.uid() 分岐を持たない完全版）。
  取消の詳細ガバナンスは §6.4.5。
- `part_installation_evidence` … 生成後は `BEFORE UPDATE OR DELETE` で **常時拒否**（append-only）。
- **訂正手段**: 確定済みレコードは編集できないため、誤りは
  **`status='voided'`（取消・理由必須）＋ 新規装着レコードの再発行** でのみ表現する
  （会計の赤伝・再発行と同じ考え方。履歴は両方残る）。
- 任意で `content_hash` を Polygon アンカー（既存 `certificate_images.polygon_tx_hash` 経路を再利用）。

### 6.4 確定フロー（発行＝顧客本人の電子署名による確定）

> **明記事項**: 確定は **顧客本人の電話OTP所持証明＋電子署名** に限る。店は代行できない（T7）。
> 顧客確認後は一切の変更ができない。

#### 6.4.0 既存実装との整合（重要）

既存 `signature_sessions` は **「メールリンク到達＋サーバ側鍵署名」型**で、証明しているのは
*メール到達*であり*電話所持ではない*。一方、顧客ポータルには**電話OTP認証**が別系統である
（`phoneLast4Hash`／`CUSTOMER_AUTH_PEPPER`、`src/lib/customerPortalServer.ts`）。
本設計はこの **2つを結合** する: 「OTPで電話所持を証明 → 同一セッションでサーバ側鍵署名」。

#### 6.4.1 本人性の保証グレード（リスクで使い分け／決定 §10-6）

確定署名に **保証グレード(`assurance`)** を持たせ、**部品の risk に応じて必要グレードを変える**。

| assurance | 本人性の根拠 | 連絡先の出所 | 適用可能な部品 |
|---|---|---|---|
| `customer_otp` | 顧客**登録**連絡先へOTP→所持証明＋署名 | **顧客自身**が intake/予約で登録・検証 | すべて（**高額/シリアル品は必須**） |
| `store_contact_otp` | 店入力連絡先へOTP→所持証明＋署名 | 店が入力（出所を記録・格下げ） | `lot_only` / `consumable` |
| `in_store_tablet` | 顧客が**店頭タブレット**で署名（不在/電話なし時） | — | `consumable` のみ（高リスク不可） |

- **連絡先出所** は `customers` 由来で判定: `customer_intake_invitations.completed_customer_id`
  や予約で**顧客自身が登録**した行 = 検証済み(`customer`)。店が作成した行 = 未検証(`store`)。
  → `customers` に `contact_provenance text CHECK in('customer','store')`,
  `contact_verified_at`, `contact_verified_via` を追加。
- **高額の閾値（決定 §10-3）**: **税込の品目金額（単価×数量）が 100,000 円超** の部品は
  `part_kind='high_value'` とし `required_assurance='customer_otp'`（顧客登録連絡先必須）。
  閾値はテナント設定で上書き可（既定 100,000 円）。`serialized` も常に `customer_otp`。
- 「店が自分の番号を顧客欄に入れて代行」(T7') は、**高額/シリアル品で `customer_otp` を必須**にし
  店入力連絡先(`store`)を弾くことで封じる。低リスク品は `store_contact_otp` を許容しつつ
  **出所を記録して監査・格下げ**（リスクに見合った運用）。

#### 6.4.2 状態機械

```
installed                装着・証拠登録済み（店が修正可能）
   │ ① 店が「確定依頼」。part_confirmation_signatures を pending 作成。
   │   送信先は assurance ルールで決定（customer_otp:登録連絡先 / store_contact_otp:店入力 /
   │   in_store_tablet:タブレット）。リンク/コードは店端末に出さない（タブレット型を除く）。
   │   チャンネル（決定 §10-9）: **LINE 優先、LINE 未連携/送信失敗時は SMS にフォールバック**。
   ▼
otp_verified             ② 顧客が自分の携帯でOTPコード入力→電話所持を証明（タブレット型は店頭で本人操作）
   │ ③ 内容(部品・数量・写真・証拠の要約)を再提示し、顧客が署名
   ▼
signed                   signer_phone_full_hash / assurance / signed_at / signature を記録
   │ ④ part_installations.status を customer_verified へ遷移（DBが下記を検証）
   ▼
customer_verified ★      完全凍結。店も運営も service-role も変更不可
```

- 期限切れ/未署名は `installed` のまま（**未凍結**＝決定 §10-7「確定保留」）。リンクは単回・短期限・
  レート制限（既存 `signature/session` の bruteforce 保護に倣う）。再発行で再送。

#### 6.4.3 何に署名するか（署名対象の正準化）

`content_hash = sha256(canonical_manifest)`。`canonical_manifest` は
**装着内容（部品名/GTIN/lot/serial_fingerprint/数量/金額）＋ 全 evidence の sha256 一覧 ＋ 顧客識別ハッシュ
＋ 確定時刻 ＋ nonce** を正準JSONで連結。署名は既存 `buildSigningPayload`/`signature_public_keys`
を流用し `document_hash := content_hash`。→ 写真や数量を後で差し替えると hash 不一致で確定が無効化。

#### 6.4.3b タイムスタンプ（決定 §10-10：TSA を付与）

署名強度は **事業者署名型（サーバ鍵）＋ RFC3161 タイムスタンプ局(TSA)** で確定。
署名後、`signature`（または `document_hash`）に対して **TSA から RFC3161 タイムスタンプトークンを取得**し
`tsa_token`/`tsa_authority`/`tsa_timestamp_at` に保存。これにより
**「その時刻にその内容が存在し、以後改変されていない」ことを第三者(TSA)が証明** = 署名日時の事後改ざんも防ぐ。

- TSA は外部プロバイダ（JIPDEC 認定TS局 等）を利用。`verify` ページでトークンを検証表示。
- 既存 Polygon アンカー(L6)は分散型の時刻証明として**併用可**だが、本件は TSA を一次手段とする。
- 検証経路は既存 `/api/signature/verify` に TSA 検証を追加して流用。

#### 6.4.4 DB レベルの強制（アプリを信用しない）

`part_installations` の `BEFORE UPDATE` トリガは、`installed → customer_verified` 遷移を
以下 **すべて満たさなければ `RAISE EXCEPTION`**:

1. `confirmation_signature_id` の署名が **`status='signed'`** かつ `installation_id` 一致。
2. 署名の `document_hash` ＝ 現在の `content_hash`（確定後に内容不変）。
3. **電話整合**: 署名の `signer_phone_full_hash` ＝ 顧客
   (`customer_id`→`customers.phone_full_hash`) と一致。
   ※ 下4桁(`phone_last4_hash`)は衝突空間 10⁴ で弱いため、確定の主キーは
   **フル番号ハッシュ** `sha256(v1|tenant_id|E164|PEPPER)` を新設して使う（下4桁は従来照合の補助に残す）。
4. **保証グレード充足**: 署名の `assurance` が、`part_installations.required_assurance`
   （`part_kind` から導出: serialized/high_value→`customer_otp`, lot_only→`store_contact_otp`以上,
   consumable→任意）の要求を満たす。

→ 店が PostgREST 直叩きで `customer_verified` に書き換えても、**本人署名・電話一致・保証グレードが
揃わなければ DB が拒否**。アプリの迂回でも凍結ゲートは破れない。

#### 6.4.5 確定後の取消ガバナンス（完全凍結の例外は「取消のみ」）

完全凍結だが、誤りの訂正のため **`customer_verified → voided` の status 遷移だけは許可**する。
凍結トリガは次を強制:

- 許可するのは `status` を `voided` にする更新**のみ**。**内容・署名・identity 列の変更は不可、DELETE も不可**。
- `void_reason`（必須）, `voided_by`, `voided_at` を記録（原本・署名は履歴として残す）。
- 訂正は **新規 `part_installations` を再発行 → 顧客の電子署名を再取得**（§6.3）。
  → 店が原本を取り消して改ざん版を出しても、再発行には**再度の顧客署名が必要**なので隠せない。

#### 6.4.6 店頭タブレット署名の残存リスク（明記）

`in_store_tablet` は店の端末で行うため**代行リスクが残る**。よって:
- **`consumable` 限定**（高額/シリアル/lot は不可）。
- 立会いスタッフ(`witness_staff_id`)・端末識別・署名時の対面状況を記録し、`assurance` は最低位。
- 高リスク品は必ず顧客自身の携帯OTP(`customer_otp`)を要求＝タブレットでは確定不可。

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
| 電子署名 | `signature_sessions`（メールリンク＋サーバ鍵署名・電子署名法準拠）／`buildSigningPayload`／`signature_public_keys` | **鍵署名部分を流用**。装着確定用に別テーブル `part_confirmation_signatures` を新設 | 中 |
| 本人確認(OTP) | `phoneLast4Hash`/`CUSTOMER_AUTH_PEPPER`/`/api/customer/verify-code`（電話OTP）／`customers.phone_last4_hash` | **OTP所持証明を結合**。確定主キーは新規 `phone_full_hash`、整合をDB強制（T7/T7'封じ） | 中（新hash列＋トリガ） |
| 通知チャンネル | LINE/メール送信基盤（既存）・SMS | 確定リンク/OTPを **LINE優先→SMSフォールバック**で配信 | 低〜中（SMS連携が新規なら中） |
| タイムスタンプ | （新規）RFC3161 TSA プロバイダ・`/api/signature/verify` | 署名にTSAトークン付与・検証。**外部依存が新規** | 中（外部TS局契約・実装） |
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
- **Phase 3（装着検証・本人確認）**: 確定を **顧客の電話OTP所持証明＋電子署名** に
  （`part_confirmation_signatures` ＋ `phone_full_hash`/保証グレード/出所のDB強制トリガ、既存OTP＋鍵署名を結合）。
  保証グレードの risk 使い分け（§6.4.1・高額=税込10万円超）、LINE優先→SMSのOTP配信（§6.4.2）、
  RFC3161 TSA タイムスタンプ付与（§6.4.3b）、店頭タブレットfallback（§6.4.6）、取消ガバナンス（§6.4.5）、
  納車時検証 UI（passport/verify 流用）＋ 旧品突合。→ T4・**T7/T7'** の中核を投入。
- **Phase 4（任意・高リスク）**: 封印シール/レーザー刻印の固有番号発行・照合、Polygonアンカー、
  AI相互矛盾検知の自動フラグ、抜き取り監査ダッシュボード。

---

## 9. 残存リスク（明記）

- 物理すり替え(T4)は**確率的抑止**であり、ゼロにはできない。封印・刻印は破られ得る。
- 顧客検証(L5)は顧客の協力に依存（未実施なら `installed` のまま未凍結）→ 高額部品は必須運用に。
- 店頭タブレット署名(`in_store_tablet`)は店端末ゆえ**代行リスクが残る** → `consumable` 限定・立会い記録・
  高リスク不可で限定（§6.4.6）。
- 電話下4桁ハッシュは衝突空間が小さく単体では弱い → 確定照合は**フル番号ハッシュ**を主キーにする（§6.4.4）。
- 連絡先出所が `store` の確定は本人性が一段弱い（OTP所持は証明するが番号の帰属は店依存）→ 低リスク品のみ・監査対象。
- ロットのみ/消耗品は個体追跡不能 → 数量・会計突合と顧客信頼で代替。
- 部品商が紙主体のため、L3 は当面 **納品書OCR** が現実線（電子納品は将来）。

---

## 10. 意思決定

### 決定済み
1. ✅ **凍結の例外 → 完全凍結**。`customer_verified` 後は service-role/運営含め一切変更不可
   （§6.3・§6.4）。訂正は「取消＋再発行＋顧客の再確認」のみ。
2. ✅ **シリアル一意のスコープ → プラットフォーム全体横断**。テナント秘匿のため
   ハッシュ(`serial_fingerprint`)で衝突照合（§6.2）。
6. ✅ **確定の本人性 → 電話OTP所持証明**（§6.4.0/6.4.2）。既存OTP＋サーバ鍵署名を結合。
7. ✅ **連絡先の信頼 → リスクで使い分け**（§6.4.1）。高額/シリアル品は顧客登録連絡先(`customer_otp`)必須、
   低リスク品は店入力(`store_contact_otp`)を出所記録＋格下げで許容。
8. ✅ **顧客不在/電話なし → 店頭タブレット署名**（§6.4.6）。`consumable` 限定・立会い記録・最低保証グレード。
3. ✅ **高額の閾値 → 税込品目金額 100,000 円超**（§6.4.1）。超過は `high_value`＝`customer_otp` 必須。
   テナントで上書き可（既定 10万円）。
9. ✅ **OTPチャンネル → LINE 優先、未連携/失敗時 SMS フォールバック**（§6.4.2）。
10. ✅ **タイムスタンプ → RFC3161 TSA を付与**（§6.4.3b）。事業者署名型＋TSA で存在/時刻を証明。

### 未決（Phase 進行に合わせて確定）
4. **アンカーの対象**: 全装着 / 高額のみ / 無効化（Phase 4・コスト判断。TSA とは併用可）。
5. **測定器署名(L1)**: 既存テナントAPIキーとの後方互換と鍵配布方式（Phase 1〜2）。
11. **TSA プロバイダ選定**: JIPDEC 認定TS局の具体ベンダ・コスト・API（Phase 3 着手時）。

---

_本書は実装前の合意形成用。承認後、Phase 1 からデータモデル/マイグレーションに着手する。_
