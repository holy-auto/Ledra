# 管理画面ナビ 大カテゴリ再編 + 機能オプション化（設計）

最終更新: 2026-08-05

## 背景・目的

管理画面の機能が細かく分かれすぎている。ナビは 9 グループ（`予約・作業` / `在庫・部品・装備` / `顧客` / `売上・経営` / `取引ハブ` / `情報・学習` / `経理` / `本社・運営` ＋ホーム）に分割され、項目数も多い。

ゴール: (1) **大きなカテゴリへ集約**して認知負荷を下げる、(2) **利用頻度の低い機能をオプション化**（既定非表示＋オプトイン）して既定サイドバーを短く保つ。オプション化は**全て無料**（`catalog.ts` の `tier` を `advanced` にするだけ。課金・Stripe 非連動、DB マイグレ不要。既存ユーザーは `/admin/settings/features` で opt-in）。

> 留保: 画面別の利用実測データは存在しない（計測は 9 ドメインの行生成数のみ）。オプション化候補は**構造的シグナル**（業種限定 / 低頻度 / 事業ライン別）に基づく推定。

## 変更後のカテゴリ（7 大カテゴリ + 運営）

ナビ定義は `src/components/ui/adminNav.tsx` の `NAV_GROUPS`（AIナビ・コマンドパレット・サイドバー共通の単一情報源）。

| カテゴリ | 内容 |
|---|---|
| **ホーム** | ダッシュボード / 承認インボックス |
| **業務** | 旧「予約・作業」+「在庫・部品・装備」を統合。予約・案件・証明書・車両・品目マスタ・スタッフ・**代車**・装着記録 等。低頻度は既定非表示 |
| **顧客・販促** | 顧客・メッセージ（**LINE配信はメッセージ画面の導線に統合**）ほか |
| **売上・経営** | 請求・帳票 / Square / 経営分析 / レポート収益 等 |
| **経理** | 売掛元帳 + **発注管理・部品発注**（業務から移動） |
| **取引・ネットワーク** | 旧「取引ハブ」。BtoB / マーケット / 商談 / 損保 / 代理店系（全て無料オプトイン） |
| **情報・設定** | 旧「情報・学習」+ 設定/マスタ + 本社横断。設定・マスタ系（hub）は歯車ハブに集約されサイドバー非描画 |
| **運営** | platformOnly 項目（別枠・変更なし） |

## オプション化（`catalog.ts` の tier core→advanced、全て無料）

- **代車**は全業種表示に（`loaner-cars` の business mode タグ解除）。
- **発注管理・部品発注**の `groupKey` を `operations` → `accounting`（設定UIの分類も経理へ）。
- **低頻度 core を advanced へ**: クーポン / 次の接触 / コンタクト管理 / 通知配信状況 / レビュー / 店舗お知らせ / 概算見積 / ピット管理 / 代理店コミッション。
- **事業ラインを advanced へ**: 商談 / 保険会社 / 中古車マーケット。
- 装着記録は**残す**（軽微な部品交換も履歴。証明書発行の自動記録＝`issueHooks`/`coatingIntegration` では取りこぼす経路があるため）。業務カテゴリに配置。

## 実装ファイル

- `src/components/ui/adminNav.tsx` — `NAV_GROUPS` を 7 大カテゴリへ再編。
- `src/lib/features/catalog.ts` — tier / businessModes / groupKey の調整。
- `src/lib/features/__tests__/catalog.test.ts` — 「後から隠さないガード」の対象から意図的 advanced 化項目を除外し、別途 advanced を固定するアサーションを追加。
- `src/app/admin/messages/MessagesInboxClient.tsx` — ヘッダに「LINE一斉配信」導線（`/admin/line-broadcasts` ルートは温存）。

## 注意点（要周知）

- **既存ユーザーの既定サイドバーから、advanced 化した項目が消える**（opt-in 前提）。各ユーザーは `/admin/settings/features` で再表示可能。「既存ユーザーには従来どおり出したい」場合は `user_feature_prefs.visible_features` へのバックフィル移行が別途必要。
- `report-revenue`（レポート収益）は catalog 上 `revenue` だが adminNav 上は業務カテゴリに配置（main 由来）。整合させるなら売上・経営へ移動が別途必要（本 PR ではスコープ外）。
- 事業ラインの有料アドオン化（`tenant_addons` + Stripe）は見送り、無料オプトインに一本化。

## 検証

- `npx tsc --noEmit` 0 error、`npm run test` green。
- 旧 `NAV_GROUPS` の href 集合と再編後を diff し欠落ゼロ（LINE配信の 1 件のみ減）。
- 業務モード（整備/鈑金/コーティング/PPF）切替で業種項目が正しく出入り。
- `/admin/settings/features` で advanced を ON/OFF → サイドバー反映。
