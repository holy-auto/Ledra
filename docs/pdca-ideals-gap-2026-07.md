# 理想 9 項目 × 現状ギャップ分析 & PDCA ロードマップ (2026-07)

> 作成日: 2026-07-04
> 目的: 「Ledra の可能性を最大限にまで高める」ための上位理想 9 項目を、
> コード根拠付きで現状評価し、PDCA サイクルの優先順位を確定する。
> 関連: `docs/body-repair-clerical-gap-audit-2026-06.md` /
> `docs/clerical-gap-audit-*.md` / `docs/feature-roi-board.md` /
> `docs/ledra-goals-strategy-2026-05.md`

---

## 0. エグゼクティブサマリ

理想 9 項目のうち **7 項目は既に実装基盤が「強」〜「有」**。完全未実装だったのは
**「整備見積への日整連(JASPA)標準工数反映」の 1 点のみ**で、本サイクル (2026-07-04)
で土台を実装した (§3)。残る弱点は「中古車買取の査定価格エンジン」と
「コーティング/PPF 資材の自動再発注」の 2 つの部分ギャップ。

| # | 理想 | 現状 | 根拠 (代表) |
|---|---|---|---|
| 1 | 現場でほぼ入力業務はいらない | ◎ 強 | 車検証 OCR/QR (`src/lib/ocr/`)、音声メモ整形 (`voiceMemoReformat`)、AI 項目自動化エンジン (`src/lib/ai/automation/`)、納品書 OCR |
| 2 | お客様は確認をするだけ | ◎ 強 | 電子署名フロー群 (`/sign/*`, `/parts/confirm/*`)、承認インボックス (`/admin/inbox`)、サインオフ・パイプライン (`src/lib/signoff/state.ts`) |
| 3 | 日整連工数で見積完全自動化 | **✗ → 本サイクルで土台実装** | 従来は過去請求ベースの AI 見積のみ (`quoteFromVehicle.ts`)。工数マスタ・レバーレート概念が皆無だった |
| 4 | 板金塗装の見積・部品発注自動化 | ◎ 強 | `body_repair_jobs` 工程管理、AI 見積 draft、`parts_orders`/`purchase_orders` + 自動送信 (`decideAutoSend`)、供給ポータル |
| 5 | コーティング PPF 資材の受発注自動化 | △ 部分 | B2B 受発注 (`shop_products_and_orders`)・供給ポータル (`supply_portal_orders`) はあるが、**在庫水位連動の自動再発注が無い** |
| 6 | AI で新人教育・技術向上支援 | ○ 有 | Ledra Academy (`/admin/academy`: 事例学習・クイズ・AI フィードバック `academyFeedback.ts`・QA アシスタント) |
| 7 | 中古車買取価格向上 | △ 部分 | パスポート/履歴透明性による価値証明・買取リード (`passport_referral_leads`)・下取り (`market_deal_trade_in`) はあるが、**相場ベースの査定価格エンジンが無い** |
| 8 | 嘘偽りのないクリーンな業界 | ◎ 中核 | Polygon アンカリング + RFC3161 TSA + C2PA + 写真改ざん検知 (`photoTamperingCheck`) + ZKP。Ledra の差別化そのもの |
| 9 | 現場は修理に専念できるソフト | ○ 有 | 案件統合ワークスペース (`/admin/jobs/[id]`)、飛び込み intake、工程ガント、Cmd+K、PWA オフライン |

---

## 1. 評価方法

- 2026-07-04 時点の `main` 系ブランチを全域走査 (routes / lib / migrations 336 本 / docs)。
- 「実装基盤の有無」で評価。運用浸透度・データ量は対象外。
- 既存のギャップ監査 (`body-repair-clerical-gap-audit-2026-06.md` 等) で特定済みの
  断絶 A〜D はその後のマイグレーション (`20260622000001_body_repair_due_date.sql`,
  `20260622000004_body_repair_insurer_case.sql`, `20260703000000_job_signoff_workflow.sql`
  等) で大半が解消済みであることを確認した。

---

## 2. 唯一の完全未実装だった理想 #3 — 日整連標準工数

**確認結果**: `日整連` / `JASPA` / `標準工数` / `レバーレート` は 2026-07-03 時点で
ニュース記事 (`src/app/api/cron/news/route.ts`) とリサーチ文書にしか登場せず、
スキーマ・見積ロジックのどこにも存在しなかった。既存の見積補助はすべて
「過去の請求実績」ベース (`src/lib/ai/quoteFromVehicle.ts`,
`menuPriceEstimate.ts`) で、整備業界標準の
**工賃 = 標準工数 (指数) × レバーレート** という積算方式が欠けていた。

**制約**: 日整連の標準作業点数表 (指数データ) は有償ライセンスであり、
Ledra が同梱配布することはできない。したがって Ledra が担うのは
**「取込の器」と「自動計算・一括再計算のエンジン」**である。

---

## 3. 本サイクル (Do) — 標準工数 × レバーレート エンジン

設計原則: `menu_items.unit_price` を単一の真実として維持する。工数から算出した
工賃も unit_price に保存するため、**見積 (`documents`)・クイック見積・AI 見積・
パッケージなど下流は 1 行も変更せずに工賃が反映される**(最小差分)。

実装内容:

| 層 | 変更 | ファイル |
|---|---|---|
| DB | `tenants.labor_rate_per_hour` (レバーレート円/h)、`menu_items.labor_hours` (標準工数h) | `supabase/migrations/20260704000000_labor_rate_and_hours.sql` |
| 純関数 | `calcLaborPrice(hours, rate) = round(hours × rate)` + 単体テスト | `src/lib/pricing/labor.ts` (+ `__tests__/labor.test.ts`) |
| 設定 | 設定画面「工賃設定」にレバーレート入力。保存時に工数持ち品目の unit_price を**一括再計算**(レート改定が全見積に即反映) | `src/app/admin/settings/{SettingsForm,page,actions}.tsx/ts` |
| 品目マスタ | 標準工数入力欄 + 工数×レートの単価自動算出 (利益率方式と同じ UX)。一覧に工数列 | `src/app/admin/menu-items/MenuItemsClient.tsx` |
| CSV 取込 | 5 列目に標準工数を追加。**単価空欄 + 工数あり + レート設定済みなら単価を自動算出** — 日整連指数表の一括取込導線 | `src/app/api/admin/menu-items/route.ts` |

運用フロー (見積自動化の完成形):
1. 設定 > 工賃設定 でレバーレートを 1 回入力
2. ライセンス取得済みの指数データを CSV で品目マスタに取込 (単価は空欄で OK)
3. 以後、見積・請求書・クイック見積・AI 見積のすべてで工賃が自動反映
4. レート改定時は設定を保存するだけで全品目の工賃が一括更新

---

## 4. 次サイクル候補 (優先順)

| 優先 | テーマ | 理想 | 概要 | 規模感 |
|---|---|---|---|---|
| P1 | 見積行での工数表示 | #3 | `documents.items_json` の行に工数を持たせ、見積 PDF に「工数 × レバーレート」内訳を印字 (協定見積・保険提出で必要) | 小〜中 |
| P2 | 資材の在庫水位連動 自動再発注 | #5 | `inventory_management` + `purchase_orders` + `decideAutoSend` は既存。**発注点 (reorder point) と結線するだけ**で自動再発注が完成する | 中 |
| P3 | 買取査定価格エンジン | #7 | パスポート履歴 (整備記録の完全性) を査定加点として構造化し、AI + 過去成約データで買取上限価格を提示。「記録がきれいな車は高く買える」を定量化 | 中〜大 |
| P4 | 車種クラス別工数補正 | #3 | 日整連指数は車格で変わる。`vehicles` のサイズクラス (車検証 OCR 済) × 工数の補正係数 | 中 |
| P5 | Academy × 実案件連携 | #6 | 実際の施工写真・工数実績を教材化 (匿名化) し、新人の実案件 OJT ループへ | 中 |

判断基準: 「既にあるエンジン同士を繋ぐ」ものを優先 (P1, P2)。新規エンジンが
必要な P3 は差別化インパクトが大きいため次々回サイクルの本命。

---

## 5. Check の観点 (次回レビュー時に確認すること)

- レバーレート設定済みテナント数 / CSV 工数取込件数 (採用率)
- 見積作成の所要時間 (工数取込前後での比較)
- 一括再計算の実行時間 (品目数千件超のテナントが現れたら SQL 一括 UPDATE 化)
