# 事務作業ギャップ監査レポート — 中古車売買 (2026-06)

> 目的: 中古車販売店の現場スタッフ(営業・店長・登録事務)が、商談から納車・名義変更
> までの事務に時間を奪われずに「売る・引き渡す」に集中できるよう、Ledra で代替できる
> 事務要素と現状の断絶点を洗い出す。対象モジュールは `market_vehicles` 系
> (在庫 / 問い合わせ / 商談 / 顧客興味)。
>
> 注: 本レポートは Codex レビュー (PR #635) の事実指摘 9 点を反映済み。当初「完成度が
> 高い」とした前段フローにも、**クライアント↔スキーマ不整合による破損**や**バックエンドが
> 入力を落とす欠落**が複数あり、見かけより結線が弱いことが判明した。

## 全体所見

**データモデル(在庫・問い合わせ・商談・顧客興味・多店舗・仕入先)は広く揃っている**が、
**フロントの結線に実バグが複数**あり、**契約以降の事務(諸費用見積・契約書・ローン・
名義変更・納車・保証)はほぼ未実装**。現場の事務負担の中心はこの「契約以降」であり、
最大の代替余地だが、**着手前にまず破損した既存フロー(問い合わせ→商談)を直す必要がある**。

再利用できるエンジン(`documents` + `document_templates`、`reservations` 工程、
`follow_up_settings`、`passport_ownership_transfers`)は在るが、いずれも**そのままでは
market_vehicles と繋がらず**、アダプタ/ブリッジが要る(下表 注記)。

## A. 既存フローの破損(実装バグ・要修正) ← 最優先

監査の過程で、UI からは「できる」ように見えるが**実際にはエラーになる**結線不整合を発見:

| # | 破損箇所 | 症状 | 根拠 |
|---|---|---|---|
| B1 | 問い合わせ返信 | `InquiriesClient.handleReply` が `{ body }` を POST するが `inquiryReplySchema` は `message` + `sender_type` を要求 → **常にバリデーションエラー** | `src/app/admin/inquiries/InquiriesClient.tsx:135` / `src/lib/validations/market.ts:174-176` |
| B2 | 問い合わせ→商談化 | `handleCreateDeal` が `{ inquiry_id }` のみ POST するが `dealCreateSchema` は `vehicle_id`/`buyer_name`/`buyer_email`/`message` を要求 → **商談が作れない** | `InquiriesClient.tsx:161` / `market.ts:147-150` |
| B3 | 仕入原価の保存 | 入庫フォームは `cost_price`/`supplier_name`/`acquisition_date` を入力させるが、`marketVehicleCreateSchema` にも `MV_COLS` にも含まれず **バックエンドが落とす**(在庫粗利が計算できない) | `src/lib/validations/market.ts` / `src/app/api/admin/market-vehicles/route.ts` |
| B4 | AI 見積の参照 | `quotes/ai-from-vehicle` が `invoices` ビューから `total_amount` を select するが、当該ビューが公開する列は `total`(列名不一致) | `src/app/api/admin/quotes/ai-from-vehicle/route.ts:85-92` |
| B5 | 問い合わせの対象ガード | 公開問い合わせ API が `market_vehicles` を `id` のみで lookup し `status='listed'` を確認しない → **下書き/予約済/売却済の車両 ID でも問い合わせを作れる** | `src/app/api/market/inquiries/route.ts` |

→ **B1/B2 は中古車営業の根幹(問い合わせ対応・商談化)を止めている**。諸費用見積など
契約以降の機能は商談(deal)が作れることが前提なので、**B2 の修正が断絶1 の前提条件**。

## B. 工程別ギャップ表

| 工程 | 対応 | 実装/断絶点 | 根拠 |
|---|---|---|---|
| 仕入・査定 | ⚠️ | 諸元・状態・修復歴・グレード(S/A/B/C/D)は入力可。ただし**構造化査定テンプレ無し**、かつ**原価/仕入先/仕入日はバックエンドが落とす(B3)** | `NewVehicleForm.tsx` / `market_vehicles` |
| 在庫登録(諸元) | ✅ | draft 起票 → 諸元・価格・車検満了・走行・色等 | `20260314000003_market_vehicles.sql` |
| 車検証 OCR | ⚠️ | `parse-shakken` ハンドラは実在するが UI が `{false && (...)}` で**一時非表示**(現状アクセス不可) | `NewVehicleForm.tsx:247` |
| 撮影 | ✅(部分) | 1 車両最大 20 枚、ドラッグ&ドロップ/カメラ/サムネ選択。ただし**並び替え(sort_order 更新)導線は無し** | `market_vehicle_images` |
| 展示・ポータル公開 | ✅ | draft→listed で `listed_at` セット、BtoB 横断公開(RLS)。長期在庫(60日+)アラート | `MarketVehiclesClient.tsx` / `src/app/market/` |
| 問い合わせ受付 | ⚠️ | 公開フォーム + レート制限はあるが、**listed 限定ガードが無い(B5)** | `src/app/api/market/inquiries/route.ts` |
| 問い合わせ→商談 | ❌ | UI はあるが**返信(B1)・商談化(B2)がクライアント↔スキーマ不整合で機能しない** | `InquiriesClient.tsx` / `market.ts` |
| 顧客興味(見込み管理) | ⚠️ | 車両ごとに顧客名/連絡先 + 温度感 + フォロー日は登録可。だが**`status`(active/converted/lost)を route が select/受理せず、専用の admin ページも無い** | `vehicle_interests` / `src/app/api/admin/vehicle-interests/route.ts` |
| 商談・価格交渉 | ⚠️ | `market_deals.agreed_price` と status はあるが、商談化自体が B2 で詰まり、**見積書(支払総額)生成・紐付けも無い** | `src/app/admin/deals/DealsClient.tsx` |
| **諸費用・支払総額** | ❌ **断絶1** | 登録手数料・自動車税・リサイクル預託金・整備費・自賠/任意保険・陸送費 等の**諸費用明細と総額計算が一切無し**。価格はグロスのみ | `market_deals` に該当列なし / `documents(estimate)` は汎用で deal 非連携 |
| **売買契約書** | ❌ **断絶2** | 契約書テンプレ/生成/署名/保管が無い | `documents` の doc_type に `sales_contract` 不在 |
| 下取り・買取 | ❌ **断絶3** | 下取車の査定額・充当・買取モデルが無い | — |
| オートローン審査 | ❌ | ローン申込・与信状況・信販会社・ローン額の追跡が無い | — |
| 名義変更・登録(陸運) | ⚠️ **断絶4** | `passport_ownership_transfers` は**販売後の所有者移転通知のみ**。かつ VIN/`vehicle_passports`・`vehicles` 起点のため **market_vehicles と直結しない(ブリッジ要)** | `20260522000000_passport_ownership_transfers.sql` |
| 自動車税・リサイクル預託金 | ❌ | 税・預託金の計算/帳票が無し(諸費用と一体で扱うべき) | — |
| 納車 | ❌ **断絶5** | 納車予定/状態/受領サインが無い | 再利用候補: `reservations` / 受領サイン |
| 販売後アフター・保証 | ❌ | 保証期間/条件/クレーム導線が無し | 再利用候補: `follow_up_settings` |

凡例: ✅ = 実装済 / ⚠️ = 部分的(データはあるが結線/UI が欠落・または破損) / ❌ = 未実装

## C. 断絶トップ5(現場事務の重み順)

### 断絶1 — 諸費用・支払総額の見積(最重 / 前提: B2 修正)
中古車事務の核心。車両本体価格に諸費用(登録手数料・自動車税(月割)・リサイクル預託金・
整備費・自賠/任意保険・陸送費・印紙)を積み上げて「支払総額」を出す作業を Ledra で代替。
- **再利用**: `documents`(doc_type=`estimate`) + `items_json` で明細化。`market_deals` に
  `estimate_document_id`(nullable FK)を追加して商談に紐付け。
- **注(Codex B4/#6)**: 既存 `quoteFromVehicle` は **`vehicles` テーブル前提 + invoices 列名バグ**の
  ため、market_vehicles 用アダプタと列修正が無いとそのまま使えない。**初期実装は諸費用
  プリセット(純関数)から組み立て**、AI 化は後続でアダプタを足す。
- **前提**: deal が作れること = **B2 の修正が先**。

### 断絶2 — 売買契約書の生成・保管
- **再利用**: `documents` + `document_templates`。ただし **`doc_type='sales_contract'` の追加は
  DB の CHECK だけでなく TS/Zod 側の doc_type リスト 3 箇所**(`documentCreateSchema` /
  `templateCreateSchema` / `DOC_TYPES`)**にも追加が要る**(Codex #7)。署名は既存フロー流用。

### 断絶3 — 下取り・買取の査定→充当
- **再利用**: 下取車も `market_vehicles` として起票し、`market_deals` に
  `trade_in_vehicle_id` / `trade_in_allowance` を nullable 追加して充当。

### 断絶4 — 名義変更・登録事務(販売前→陸運)
- **再利用 + ブリッジ**: `passport_ownership_transfers` は `vehicle_passports`/VIN・`vehicles`
  起点のため、market_vehicles と繋ぐには **VIN(chassis_number)による明示ブリッジか FK 再設計**が
  必要(Codex #8)。加えて必要書類(印鑑証明・委任状・譲渡証明・車庫証明)チェックリスト。

### 断絶5 — 納車スケジュール・受領
- **再利用**: `reservations` + `reservation_step_logs` に `market_deal_id` を足して
  「納車予約 + 工程 + 受領サイン」を構成。

## D. 再利用マップ(アダプタ/ブリッジ必須を明記)

| 断絶 | 再利用エンジン | 結線の最小単位 | 追加で必要なもの |
|---|---|---|---|
| 諸費用・支払総額 | `documents(estimate)` | `market_deals.estimate_document_id` FK + 諸費用プリセット | (AI 化する場合)market_vehicle アダプタ + invoices 列修正 |
| 売買契約書 | `documents` + `document_templates` | `doc_type='sales_contract'` | DB CHECK + TS/Zod 3 リストへの追加 |
| 下取り | `market_vehicles` | `market_deals.trade_in_vehicle_id` / `trade_in_allowance` | — |
| 名義変更 | `passport_ownership_transfers` | deal リンク + 書類チェックリスト | VIN/market_vehicle ブリッジ or FK 再設計 |
| 納車 | `reservations` + `reservation_step_logs` + 受領サイン | `market_deal_id` FK | — |
| 保証アフター | `follow_up_settings` | 保証満了リマインド種別 | — |

## E. 推奨着手順(ROI 順・各 PR 独立)

0. **既存フローの破損修正**(A の B1/B2、できれば B3/B5)— 小さく高 ROI。中古車営業の
   根幹(返信・商談化・原価記録)を復旧する。**断絶1 の前提**。
1. **諸費用・支払総額の見積結線**(断絶1)— `market_deals.estimate_document_id` +
   諸費用プリセット + 商談画面からの見積生成(初期は AI 非依存)。
2. **売買契約書**(断絶2)— `sales_contract` を DB + TS/Zod 全リストに追加 + テンプレ + 署名。
3. **納車ワークフロー**(断絶5)/ **下取り**(断絶3)/ **名義変更ブリッジ**(断絶4)/ **保証リマインド** — 順次。

## 留意

- 金額・本人確認・契約の自動化は **下書き生成までに留め、確定は人**(既存の NEVER_AUTO 方針)。
- 諸費用は地域/車種で変動するため、テナント別プリセット + 手編集を前提にする。
- 法定書面(古物営業法・割賦販売法・自動車リサイクル法)はテンプレ側で吸収し、
  スキーマは汎用(documents/items_json)に寄せる。
