# 管理画面ナビ 大カテゴリ再編 + 機能オプション化（確定設計）

最終更新: 2026-07-24

## 背景・目的

管理画面の機能が細かく分かれすぎている（サイドバー 9 グループ / 81 項目）。加えてカテゴリ定義が 3 系統に分裂:
`src/components/ui/Sidebar.tsx` の `NAV_GROUPS`（実描画・9 グループ）/ `src/lib/features/catalog.ts` の `FEATURE_GROUPS`（設定 UI・7 グループ）/ `FEATURES.md §12`（ドキュメント・6）。

ゴール: (1) **大きなカテゴリへ集約**、(2) **利用頻度の低い機能をオプション化**（既定非表示＋オプトイン）して既定サイドバーを短く保つ。オプション化は**全て無料**（`catalog.ts` の `tier` を advanced にするだけ。課金・Stripe 非連動、DB マイグレ不要）。

> 留保: 画面別の利用実測データは存在しない（計測は 9 ドメインの行生成数のみ）。オプション化候補は**構造的シグナル**（業種限定 / 低頻度 / 事業ライン別）に基づく推定。

## 確定カテゴリ（7 ラベル群 + 運営）

| # | カテゴリ | 内容（旧グループ） | 既定表示(core) | オプション(advanced=既定非表示) |
|---|---|---|---|---|
| 1 | **ホーム** | 旧ホーム | ダッシュボード, 承認インボックス | — |
| 2 | **業務** | 旧「予約・作業」+「在庫・部品・装備」を統合 | 予約, 案件, 証明書, 車両, 品目マスタ, スタッフ, **代車(全業種)**, **装着記録** | ガント, ワークフロー, 施工パッケージ, 在庫, NFC, 概算見積, ピット管理／業種: 鈑金・膜厚・整備提案・メンテパック・タイヤ保管 |
| 3 | **顧客・販促** | 旧「顧客」 | 顧客, **メッセージ(LINE配信を内包)** | ヒアリング, 導入ヒアリング, 問い合わせ, クーポン, 次の接触, コンタクト管理, 通知配信状況, レビュー, 店舗お知らせ |
| 4 | **売上・経営** | 旧「売上・経営」 | 請求・帳票 | Square, 経営分析／hidden: POS・価格相場 |
| 5 | **経理** | 旧「経理」+ 発注系を移動 | 売掛元帳 | **発注管理, 部品発注**（業務から移動） |
| 6 | **取引・ネットワーク** | 旧「取引ハブ」 | 組織, 本社横断 | **全事業ラインを無料オプトイン**: BtoB, 中古車マーケット, 商談, 受発注, 取引ハブ, 損保, 代理店系 |
| 7 | **情報・設定** | 旧「情報・学習」+「本社・運営」の設定/マスタ | （設定は歯車ハブへ集約） | お知らせ, HPコンテンツ, ニュース, Academy／設定: 店舗管理, ブランド証明書, ショップ, 監査 等 |
| — | **運営** | platformOnly 9 項目 | 別枠・変更なし | — |

## 個別の確定事項（ユーザー確認済み）

1. **装着記録（`/admin/parts-install/new`）は残す**。理由: 軽微な部品交換も履歴として必要。証明書を発行しない装着があるため、証明書レイヤの自動記録（`issueHooks.ts` の `completeDraftPartInstallationsForReservation`／`coatingIntegration.ts` の「証明書作成時に自動で装着レコードを1件作る」）だけでは取りこぼす。→ **業務カテゴリ内に維持**。混乱回避は「トップの別タブにしない・案件/証明書からの導線を主にする」で対応し、部品装着インテグリティ機構は現状どおり証明書発行に結線。「全業種必須」に合わせ business mode タグは維持しつつ現場運用で網羅確認。
2. **代車は業務・全業種**。`loaner-cars` の `businessModes: ["mechanic"]` を外し全業種表示に。
3. **発注管理・部品発注は経理**。`purchase-orders` / `parts-orders` の `groupKey` を `operations` → `accounting` へ。
4. **LINE配信はメッセージに統合**。独立ナビ項目を撤去し、メッセージ画面内のタブ/導線から `/admin/line-broadcasts` へ到達（ルート/機能は温存、ナビだけ統合）。
5. **Tier 3（事業ライン）は無料**。有料アドオン(B)化はせず、`catalog.ts` の advanced（無料オプトイン=C）で統一。既存 `tenant_addons` と catalog の二重定義も「無料 advanced 一本」へ寄せる（Stripe 実装不要）。

## オプション化（core → advanced、全て無料オプトイン）

- **Tier 1（業種ニッチ・ほぼ完了済み）**: 鈑金/膜厚/整備提案/メンテパック/タイヤ保管 等は既に advanced+業種タグ。→ 業種タグ網羅の検証テストを追加（catalog コメント L50〜が「lint/test 不在」と明記）。
- **Tier 2（低頻度 core を advanced へ）**: `coupons` `next-touch` `contact-schedules` `notification-logs` `reviews` `shop-announcements` `quick-quote` `booths` `agent-commissions`。
- **Tier 3（事業ラインを advanced へ・無料）**: `deals` `insurers` `market-vehicles`（現 core→advanced）。`btob` `orders` `trades` `agents` `agent-hub` は既に advanced。

## 実装対象ファイル

- `src/lib/features/catalog.ts` — `FEATURE_GROUPS` を 7 大分類へ整理、`loaner-cars` の業種タグ解除、`parts-orders`/`purchase-orders` を accounting へ、Tier 2/3 の `tier` を advanced に、`line-broadcasts` を撤去。
- `src/components/ui/Sidebar.tsx` — `NAV_GROUPS` を再編（予約・作業＋在庫を「業務」に統合、発注系を「経理」へ、LINE配信項目を撤去、情報・学習＋設定を「情報・設定」に統合、運営は別枠維持）。全 81 項目を写像し欠落ゼロ。
- `src/app/admin/messages/*` — LINE配信への導線（タブ/リンク）を追加。
- `src/app/admin/settings/features/FeaturesClient.tsx` — グルーピングを catalog に追従（自動整合）。
- `FEATURES.md §12` — 新カテゴリへ更新。
- テスト: catalog 整合テスト（旧 href 集合 == 新描画 href 集合で欠落ゼロ、advanced 項目は businessModes を持つ 等）。

## 実装順序（段階コミット）

1. **docs 清書**（本ファイル）
2. **catalog.ts**（データ層: グループ/tier/業種/撤去）+ 整合テスト
3. **Sidebar.tsx**（NAV_GROUPS 再編）
4. **messages への LINE配信統合**
5. **FEATURES.md 更新 + tsc/test 緑 + コミット/プッシュ**（ブランチ `claude/feature-inventory-muku7h`）

## 検証

- `npx tsc --noEmit` 0 error、`npm run test` green。
- 旧 `NAV_GROUPS` の href 集合と再編後の href 集合を diff し欠落ゼロ（テスト 1 本）。
- 業務モード（整備/鈑金/コーティング/PPF）切替で業種項目が正しく出入り。
- `/admin/settings/features` で advanced を ON/OFF → サイドバー反映。既定（未オプトイン）で各カテゴリの表示が短いこと。
- `npm run dev` で管理画面が新カテゴリで描画されること。
