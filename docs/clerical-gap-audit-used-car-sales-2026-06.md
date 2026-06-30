# 事務作業ギャップ監査レポート — 中古車売買 (2026-06)

> 目的: 中古車販売店の現場スタッフ(営業・店長・登録事務)が、商談から納車・名義変更
> までの事務に時間を奪われずに「売る・引き渡す」に集中できるよう、Ledra で代替できる
> 事務要素と現状の断絶点を洗い出す。対象モジュールは `market_vehicles` 系
> (在庫 / 問い合わせ / 商談 / 顧客興味)。

## 全体所見

**フロント側(在庫登録・撮影・ポータル公開・問い合わせ・商談トラッキング)は完成度が
高い**一方、**契約以降の事務(諸費用見積・契約書・ローン・名義変更・納車・保証)が
ほぼ未実装**。Broadleaf 等の中古車システムが「売った後の登録事務」で工数を食う構造を
踏まえると、ここが現場の事務負担の中心であり、最大の代替余地。

幸い、見積/帳票の基盤(`documents` + `document_templates`)、所有者移転
(`passport_ownership_transfers`)、予約ワークフロー(`reservations` +
`reservation_step_logs`)、フォロー基盤(`follow_up_settings`)など**再利用できる
エンジンは既にある**。鈑金・ディテイリングと同じく「エンジンは在る、結線が無い」構造。

## 工程別ギャップ表

| 工程 | 対応 | 実装/断絶点 | 根拠 |
|---|---|---|---|
| 仕入・査定 | ⚠️ | 入庫フォームで諸元・状態・修復歴・グレード(S/A/B/C/D)・原価/仕入先/仕入日を記録。ただし**構造化された査定テンプレ/多基準スコアは無し** | `src/app/admin/market-vehicles/new/NewVehicleForm.tsx` / `market_vehicles` (cost_price, supplier_name, acquisition_date) |
| 在庫登録 | ✅ | draft 起票 → 諸元・価格・車検満了・走行・色等。車検証 OCR あり | `20260314000003_market_vehicles.sql` / `NewVehicleForm.tsx` |
| 撮影 | ✅ | 1 車両最大 20 枚、ドラッグ&ドロップ/カメラ/並び替え | `market_vehicle_images` |
| 展示・ポータル公開 | ✅ | draft→listed で `listed_at` セット、BtoB 横断公開(RLS)。長期在庫(60日+)アラート | `MarketVehiclesClient.tsx` / `src/app/market/` |
| 問い合わせ受付 | ✅ | 公開車両詳細に問い合わせフォーム(レート制限 5/15分)。`market_inquiries` 起票 | `src/app/api/market/inquiries/route.ts` / `market/[id]/InquiryForm.tsx` |
| 問い合わせ→商談 | ✅ | 売り手/買い手のスレッド、問い合わせから商談(`market_deals`)生成、車両を reserved に | `market_inquiry_messages` / `src/app/api/market/deals/route.ts` |
| 顧客興味(見込み管理) | ✅ | 車両ごとに顧客名/連絡先 + 温度感(hot/warm/cold) + フォロー日 + 状態(active/converted/lost) | `vehicle_interests` / `src/app/admin/vehicle-interests/route.ts` |
| 商談・価格交渉 | ⚠️ | `market_deals.agreed_price` と status(negotiating→agreed→completed)はあるが、**見積書(支払総額)の生成・紐付けが無い** | `src/app/admin/deals/DealsClient.tsx` |
| **諸費用・支払総額** | ❌ **断絶1** | 登録手数料・自動車税・リサイクル預託金・整備費用・自賠/任意保険・陸送費 等の**諸費用明細と総額計算が一切無し**。価格はグロス(asking/agreed)のみ | `market_deals` に該当列なし / `documents(estimate)` は汎用で deal 非連携 |
| **売買契約書** | ❌ **断絶2** | 契約書テンプレ/生成/署名/保管が無い(`documents.doc_type` に `sales_contract` 不在) | `20260314000000_documents.sql`(doc_type は estimate/invoice 等のみ) |
| 下取り・買取 | ❌ **断絶3** | 下取車の査定額・充当・買取(consignment)モデルが無い。`trade_in_vehicle_id`/`trade_in_allowance` 等の列なし | — |
| オートローン審査 | ❌ | ローン申込・与信状況・信販会社・ローン額の追跡が無い | — |
| 名義変更・登録(陸運) | ⚠️ **断絶4** | `passport_ownership_transfers` は**販売後の所有者移転通知のみ**(pending/accepted/rejected)。販売前の必要書類チェックや deal 連携が無い | `20260522000000_passport_ownership_transfers.sql` |
| 自動車税・リサイクル預託金 | ❌ | 税・預託金の計算/帳票が無し(諸費用と一体で扱うべき) | — |
| 納車 | ❌ **断絶5** | 納車予定/状態/受領サインが無い。`reservations` + `reservation_step_logs` の工程エンジンが流用可能だが deal と未連携 | 再利用候補: `reservations` / 受領サイン(`sign/receipt`) |
| 販売後アフター・保証 | ❌ | 保証期間/条件/クレーム導線が無し。`follow_up_settings` を保証満了リマインドに流用可 | 再利用候補: `follow_up_settings` |

凡例: ✅ = 実装済 / ⚠️ = 部分的(データはあるが結線/UI が欠落) / ❌ = 未実装

## 断絶トップ5(現場事務の重み順)

### 断絶1 — 諸費用・支払総額の見積(最重)
中古車事務の核心。車両本体価格に対し**登録手数料・自動車税(月割)・リサイクル預託金・
整備費用・自賠/任意保険・陸送費・印紙**等を積み上げて「支払総額」を出す作業は手計算/
別Excel になりがち。Ledra で代替する価値が最も高い。
- **再利用**: `documents`(doc_type=`estimate`) + `items_json` で明細化。`market_deals` に
  `estimate_document_id` を nullable 追加して商談に紐付け。`AI 見積`(`quoteFromVehicle`)の
  横展開で「車両 + カテゴリ → 諸費用込み下書き」も狙える。
- **規模感**: スキーマ最小(deal↔document の FK 1 本) + 諸費用プリセット + UI 結線。

### 断絶2 — 売買契約書の生成・保管
注文書/契約書/重要事項の作成・署名・保管が無い。
- **再利用**: `documents` + `document_templates`(レイアウト上書き基盤)に
  `doc_type='sales_contract'` を追加。署名は既存の受領/エージェント署名フローを流用。
- **留意**: 法定書面(古物・割賦)要件はテンプレ側で吸収。スキーマ変更は doc_type 追加のみ。

### 断絶3 — 下取り・買取の査定→充当
下取車を別在庫として査定し、その充当額を商談の支払総額から差し引く導線が無い。
- **再利用**: 下取車も `market_vehicles` として起票し、`market_deals` に
  `trade_in_vehicle_id` / `trade_in_allowance` を nullable 追加して充当。

### 断絶4 — 名義変更・登録事務(販売前→陸運)
`passport_ownership_transfers` は販売後通知のみ。登録に必要な書類(印鑑証明・委任状・
譲渡証明・車庫証明)のチェックリストと deal 連携が無い。
- **再利用**: `passport_ownership_transfers` を deal にリンク + 必要書類チェックリスト
  (`reservation_step_logs` 的な進捗ログ)を追加。

### 断絶5 — 納車スケジュール・受領
納車日・状態・受領サインの管理が無い。
- **再利用**: `reservations` + `reservation_step_logs` の工程エンジンに `market_deal_id` を
  足して「納車予約 + 工程 + 受領サイン」を構成。

## 横展開で埋められる箇所(既存エンジンの再利用マップ)

| 断絶 | 再利用エンジン | 結線の最小単位 |
|---|---|---|
| 諸費用・支払総額 | `documents(estimate)` + `quoteFromVehicle`(AI) | `market_deals.estimate_document_id` FK + 諸費用プリセット |
| 売買契約書 | `documents` + `document_templates` + 署名フロー | `doc_type='sales_contract'` 追加 |
| 下取り | `market_vehicles`(在庫) | `market_deals.trade_in_vehicle_id` / `trade_in_allowance` |
| 名義変更 | `passport_ownership_transfers` | deal リンク + 必要書類チェックリスト |
| 納車 | `reservations` + `reservation_step_logs` + 受領サイン | `market_deal_id` FK |
| 保証アフター | `follow_up_settings` | 保証満了リマインド種別の追加 |

## 推奨着手順(ROI 順・各 PR 独立)

1. **諸費用・支払総額の見積結線**(断絶1) — `market_deals.estimate_document_id` +
   諸費用プリセット + 商談画面からの見積生成。鈑金 #620 / ディテイリングと同型の横展開で、
   最も事務負担が重く、既存 `documents` で構造的に支えられる。**最優先。**
2. **売買契約書**(断絶2) — `doc_type='sales_contract'` + テンプレ + 署名。
3. **納車ワークフロー**(断絶5) — `reservations` エンジンに deal を連携。
4. **下取り充当**(断絶3) / **名義変更チェックリスト**(断絶4) / **保証リマインド** — 順次。

## 留意

- 金額・本人確認・契約の自動化は **下書き生成までに留め、確定は人**(既存の NEVER_AUTO 方針)。
- 諸費用は地域/車種で変動するため、テナント別プリセット + 手編集を前提にする。
- 法定書面(古物営業法・割賦販売法・自動車リサイクル法)はテンプレ側で吸収し、
  スキーマは汎用(documents/items_json)に寄せる。
