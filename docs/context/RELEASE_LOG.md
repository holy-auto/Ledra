# RELEASE_LOG.md — 実装・公開した変更

> 「何を実装してリリースしたか」を人が読める粒度で記録する場所。コミット単位の
> 詳細は `git log` を参照すればよいので、ここには機能単位のサマリだけを書く。
> 新しい変更は先頭に追記（新しい順）。

## 記入フォーマット

```

## YYYY-MM-DD 変更タイトル (PR #番号 / commit)
- 内容: 何を実装・変更したか
- 対象: どの画面・API・業種向けか
```

## 2026-08-09 帳票の送付履歴を詳細画面で確認できるように（送付済み自動移行は既存を確認） (branch claude/invoice-auto-transition-history-t4ddz2)
- 内容: (1) 「送付したら送付済みに自動移行」は既に共有API（`/api/admin/documents/share` POST）が draft→sent 確定＋封印まで行っており、コード確認のうえ再実装せず。(2) 不足していた「送付履歴の確認」を実装。同APIに `GET ?document_id=` を追加し、`document_share_log` をテナントスコープの service-role クライアントで新しい順に返す（ログは RLS ポリシー無し＝service-role のみ読み書きのため、tenant_id を明示して絞る）。帳票詳細画面に「送付履歴」セクションを追加し、日時・チャネル（メール/LINE/SMS）・宛先・送信済/失敗を一覧表示。共有直後に SWR mutate で即時反映。
- 対象: 帳票詳細（`admin/documents/[id]`）。全帳票種別（請求書含む）。
- 検証: 共有APIの単体テストに GET 2件（テナント絞り込み・UUID不正で400）を追加し既存5件と合わせ7件パス。tsc/eslint エラー0（既存の `any` 警告のみ）。DBスキーマ変更なし（既存 `document_share_log` を読むだけ）。

## 2026-08-09 品目選択を「検索/カテゴリで絞るまで隠す」段階表示に変更（予約作成・POS）

- 内容: 予約作成モーダル（`/admin/reservations` step2）と会計（POS）ウォークイン
  （`/admin/pos`）で、開いた直後に全品目が縦にどっと出て選びにくかった問題を解消。
  品目が一定数（`MENU_REVEAL_THRESHOLD` = 12）を超える場合は、検索語入力かカテゴリ選択
  （「すべて」含む）があるまで一覧を隠し、プロンプトを表示するようにした（POSレジ風の段階表示）。
  少数の場合は従来どおり全件表示。共有ロジック `src/lib/reservations/menuFilter.ts` に
  `shouldRevealMenu` / `resolveMenuCategory` / 番兵 `MENU_ALL` を追加し両画面で再利用（テスト付き）。
  予約作成側は一覧を隠しても選択済み品目が常に見えるよう、解除可能なチップ表示を追加。
- 対象: `/admin/reservations`（予約作成）、`/admin/pos`（ウォークイン会計）

## 2026-08-08 デモ証明書画像の Storage 400 を解消（プレースホルダ実ファイルを配置）
- 内容: デモシード `setup-demo-tenant.ts` が `certificate_images` 行（`demo/LEDRA-DEMO-XXXX/NN.jpg`）を作るのに実ファイルを Storage に置かず、公開ページの `<img>`（`object/public/assets/…`）と外部の `object/info` メタデータ取得が全て 400（Object not found）を返していた。sharp で軽量プレースホルダ JPEG を生成し、シード時に各 `storage_path` へ upsert アップロードするよう修正。旧コメントにあった「`certificate-images` バケットに placeholder を1枚」というパス共有スキームは実コード（バケット `assets` / パスは cert 単位ユニーク）と食い違っていたため、コメントも実態に合わせて更新。
- 検証: 本番プロジェクト `cahybswpduchptvyvdkk` で `assets` バケット=public・該当パスのオブジェクト0件・参照行63件を SQL で確認。プレースホルダ生成の JPEG magic byte を検証する単体テスト1件を追加（パス）。**【要確認】本番の 400 解消**: 本番 Storage への配置は `npx tsx scripts/setup-demo-tenant.ts` を本番 env で再実行（冪等）するまで未反映。
- 対象: 公開証明書ページ `/c/[public_id]` のギャラリー画像 / デモテナント provisioning スクリプト。

## 2026-08-04 電帳法: 本番でTSAタイムスタンプ封印が成立、帳票詳細に封印バッジを追加 (branch claude/edoc-seal-badge-and-logs)
- 内容: (1) 本番Vercelで写真TSA（`PHOTO_TSA_ENABLED=true` / `PHOTO_TSA_URL=http://timestamp.digicert.com`）を有効化。確定帳票の封印（`documentSeal.ts`）は専用 `DOCUMENT_TSA_*` が無ければ `PHOTO_TSA_*` を流用する実装のため、この1トグルで請求書封印にも第三者タイムスタンプが付くようになった。本番DBで実確認済み（請求書 INV-202608-001、`meta_json.integrity_seal.timestamp_token_b64` に約6KBのRFC3161トークン、genTime 2026-08-04T23:56:50Z、authority timestamp.digicert.com）。DECISION_LOGに残っていた「本番TSA実通信未検証」の穴を実データで解消。(2) 帳票詳細画面のステータス行に封印バッジを追加（`describeIntegritySeal`＝クライアント安全な純関数、`src/lib/documents/integritySealView.ts`）。タイムスタンプ付きは success バッジ＋「TS局 / 時刻(JST)」、ハッシュのみは info バッジで正直に区別表示。
- 対象: 帳票詳細（`admin/documents/[id]`）。全業種。検証: `integritySealView` 単体3件パス、tsc/eslint エラー0。封印バッジは meta_json.integrity_seal を読むだけでスキーマ変更なし。
- 残: 加盟店/税務向けの「封印の検証（ハッシュ再計算照合・TSトークン検証）」UIと電帳法の規程面は未実装。法的効力重視時は JIPDEC 認定TS局へURL差し替え（設定変更のみ）。

## 2026-08-06 レポート収益還元（実送金＋段階式）を9ラウンドの堅牢化後にマージ (PR #851 squash → main 9ced4f3)
- **【要確認】本番反映**: `main` にコードはマージ済みだが、`20260730100000_vehicle_report_payout.sql` / `20260730200000_vehicle_report_tiers.sql` の**本番DB適用は未確認**。`DB migrate (apply to production)` ワークフローが Aug 2 以降失敗し続けている（OPEN_QUESTIONS 2026-08-05 の履歴ドリフト）。適用が確認できるまで「本番稼働」ではなく「main マージ済み・本番適用要確認」として扱う。
- 内容: 2026-07-30 実装分（蓄積台帳→人手承認→Stripe Connect 実送金→返金巻き戻し、段階式レポート＋スコープ按分）を仕上げて `main` にマージ。マージ前に Codex 自動レビュー9ラウンドで金銭移動・整合性を追い込み、以下の bounded 修正を反映:
  - **finalize-on-create ＋ 原子的 claim**: Stripe が `transfer.paid` を出さないため、送金作成直後に `status='approved' かつ transfer_id IS NULL` ガード付き UPDATE で `paid` 確定。並行 cancel/refund を取りこぼさない。
  - **返金巻き戻しの純粋関数化**: `reversalActionForStatus`（terminal→skip / transfer有→reverse / 無→cancel）と `postCancelClaimAction`（cancel-claim 0行時の再読込→reverse 判定）を切り出し単体テスト。並行 payout が送金済みにした行を無条件 cancel して資金を宙に浮かせる競合を解消。
  - **空スコープ販売の拒否**: 開示レコードが0件（直近Nヶ月の窓が全記録より新しい／認証済み記録なし）の購入を checkout で拒否。空レポート課金と還元0を防ぐ。
  - **DBエラーの surface（主要経路）**: webhook の paid/refunded 遷移・refund 注文照会・reversal のロード/cancel-claim、payout の share/tenant 照会、精算バッチの systemic 障害（全行失敗）、checkout の空スコープ判定（`getAnchoredCertCountsByTenant`）、tiers カタログ/settings 読取——を throw して surface（webhook 系は `stripe_processed_events` の `processed_at=NULL` を `stripe-event-monitor` cron に載せる／バッチは cron 失敗アラート）。**未対応（#892 に計上）**: `recordVehicleReportRevenueShares` の台帳 upsert・order/settings 読取の error は現状 swallow のまま＝計上失敗が無音になりうる。
  - **非同期決済対応**: `checkout.session.async_payment_succeeded` を新設（コンビニ/銀行振込の入金確定時に paid化＋還元計上、`handleVehicleReportSessionPaid` で完了経路と共有・冪等）。
  - **一部取消の扱い**: connect-webhook `transfer.reversed` は全額取消（`transfer.reversed===true`／`amount_reversed>=amount`）時のみ台帳を terminal `reversed` に。
  - **platform-admin 堅牢化**: approve/cancel の0行遷移を競合として 4xx、pay 後は実状態 `paid` を返す、一覧は limit/offset ページネーション、オンボーディングCTAは uncapped count で判定。
- 検証: `vehicleReport` テスト32件パス（split 6＋scope 7＋access＋reversalActionForStatus 5＋postCancelClaimAction 4 等）、`tsc --noEmit` エラー0、変更ファイル eslint エラー0。
- 残（別issue #892 に切り出し）: webhook 冪等の自動 replay 化、booking↔refund の完全アトミック化、payout の durable transfer recovery、アップグレード返金時の partial entitlement 保持、passport 表示の anchor スナップショット、`stripe_connect_transfers` 監査行の paid 同期。
- 対象: 公開 `/v/[vin]` レポート課金（段階式）／施工店ポータル `/admin/report-revenue`／platform-admin 精算API／Stripe webhook（main + connect）／cron。

## 2026-08-07 会計（POS）ウォークインの品目選択にもカテゴリ絞り込みを追加

- 内容: 予約作成モーダルと同様の品目選択の課題が会計（POS）のウォークイン会計画面
  （`/admin/pos`）にもあったため、大カテゴリでの絞り込みチップを追加。既存の名前検索と
  併用でき、絞り込みロジックは既存の純関数 `src/lib/reservations/menuFilter.ts` を再利用。
- 対象: `/admin/pos`（ウォークイン会計の品目グリッド）。`PosClient` に `category_large` を取り込み。

## 2026-08-07 モバイル向けナビ整備と品目選択の絞り込み

- 内容: モバイルアプリ審査に向けた店頭画面の操作性改善。
  - 予約作成モーダルのメニュー（品目マスタ）選択に「検索」と「大カテゴリ絞り込み」を追加。
    全品目がずらっと縦に並んで選びにくかったのを、検索文字列＋カテゴリチップで絞り込める形に。
    絞り込みロジックは `src/lib/reservations/menuFilter.ts` に純関数として切り出し（ユニットテスト付き）。
  - 管理画面のモバイルナビを整理: 左上に「前の画面に戻る」ボタン、右上にハンバーガーメニュー、
    下部にどの画面でも表示される固定タブバー（ホーム/予約/顧客/帳票/証明書）を追加。
- 対象: `/admin/reservations`（新規予約モーダル）、`/admin` 全画面のモバイルレイアウト。
  `MobileTabBar` 新規、`AdminTopBar`（戻るボタン）、`SidebarShell`（ハンバーガー右上化）。

## 2026-08-07 HPトップに「AI自動化でできること」セクションを新設（LINE対応・予約・アフターフォロー・帳票の自動化を訴求） (branch claude/ledra-line-automation-5clwdq)
- 内容: マーケティングHPのトップページ（`src/app/(marketing)/page.tsx`）の「Ledra でできること」直下に、新コンポーネント
  `AiAutomationSection`（`src/components/marketing/AiAutomationSection.tsx`）を追加。既存の証明書中心の訴求では見えていなかった
  **AI自動化の5本柱**を1セクションに集約して掲載した——(1) LINE連携でお客様対応を半自動化（定型質問・概算見積りは完全自動応答／
  見積書・請求書などの帳票もLINEで自動送付）、(2) 予約はAIが受信メッセージから自動で下書き（顧客・車両・作業内容を反映）、
  (3) 作業内容に応じた作業後アフターフォローの自動連絡、(4) 証明書は撮影と確定ボタンだけ（下書き・写真監査まで自動）、
  (5) 見積書・請求書の自動作成。ブランドの幹（信頼）に合わせ、見出しは「AIが下ごしらえ、確定は人。」とし、
  金額確定・本人確認・証明書発行など責任の伴う操作は必ず人が最終確認する旨（壁3）と、AI自動化はStandardプラン以上の
  機能ごとopt-inである旨を注記。既存カードのデザイン（角丸カード/ScrollReveal/blue系アクセント）を踏襲し、掲載内容は
  実装済み機能（`docs/ai-automation-guide.md` §4.5 の auto-actions／`inboundAuto`・`documentAuto`・`certificateAuto`・
  `followUp` cron 等）に照合済み。デザインコンポーネントの追加のみで挙動変更なし。
- 対象: マーケティングHP トップページ（施工店向けの訴求）。
- 検証: `npx tsc --noEmit`（0 error）、`eslint`（新規/編集ファイル clean）。未使用の `page.full.tsx` は App Router のルート対象外のため未更新。

## 2026-08-06 送付済み請求書のステータス変更（入金済等）が「内容編集」と誤判定されブロックされる不具合を修正 (branch claude/payment-status-and-error-no5a9m)
- 内容: `PUT /api/admin/documents` で送付済み請求書を入金済に変更できなかった根本原因を修正。原因は
  `documentUpdateSchema`（`documentCreateSchema.partial().extend(...)`）で、Zod の `.partial()` が
  `.default()` を剥がさないため、ステータスのみの更新でも `show_seal`/`show_logo`/`show_bank_info`/
  `is_invoice_compliant`/`is_tax_inclusive` が `false` として parse 結果に混入し、ハンドラの
  `isContentEdit`（`!== undefined` 判定）が誤発火 → 「送付済みの請求書は内容を編集できません」で
  ブロックされていた。更新スキーマの当該フィールド（＋ `status`/`subtotal`/`tax`/`total`）を default 無しの
  `.optional()` に上書きし、送っていない項目が parse 結果に現れないよう修正。回帰テスト3件を追加。
  status の default 漏れによる「内容更新で送付済み帳票が draft に巻き戻る」二次バグも同時に解消。
- 対象: 帳票詳細／一覧のステータス変更（入金済・期限超過・取消 等）。特に送付済み請求書の入金記録。

## 2026-08-06 モバイルApp Store一般公開に向けたサインアップ/退会/push/TTP UX整備 (PR #891)
- 内容:
  - **アプリ内サインアップ**（要件2.x）: `apps/mobile/src/app/(auth)/signup.tsx` を新設。既存 `POST /api/signup` を再利用してテナント+ownerを作成し、そのまま `signInWithPassword`→店舗選択まで**アプリ内で完結**。login画面に導線追加。
  - **アプリ内アカウント削除**（Apple 5.1.1(v)）: `DELETE /api/mobile/account` を新設。唯一のownerならテナントを `is_active=false` 化＋連絡先PII消去、それ以外は本人のみ削除（auth削除で `tenant_memberships` は ON DELETE CASCADE）。設定画面に確認ダイアログ付き導線。
  - **プライバシーマニフェスト**: `app.json` の `ios.privacyManifests` に Required Reason API（FileTimestamp/UserDefaults/SystemBootTime/DiskSpace）を宣言。
  - **ホームのTap to Payバナー**（要件3.1）: iPhone時に有効化導線を表示し `/settings/tap-to-pay` へ誘導（閉じる可）。
  - **push基盤**（要件3.3）: `expo-notifications`/`expo-device` を導入し `lib/push.ts` でトークン取得→`POST /api/mobile/push/register`。認証後にroot layoutで自動登録。
  - **checkout微修正**: 副決済ボタンのアイコンを `contactless-payment` に統一（5.5）、未使用の `ReceiptShareDialog` 導線を削除（B-8）。
  - **設定画面「有効化済み」表示の修正**: `termsAccepted` をTTP接続成功時にセット（checkoutはこのフラグでゲートせず＝要件5.3準拠）。
  - **ドキュメント**: `tap-to-pay-submission-guide.md` を Custom Apps 前提から **App Store 一般公開前提**に全面改訂（動画台本3本・ASCメタデータ・審査用デモアカウント・提出前Go/No-Go・審査項目対応表）。`tap-to-pay-distribution-checklist.md` に方針変更の注記。
  - **実機起動の修復（RN依存整合）**: `react-native` を Expo SDK55 の pin 版へ（0.86.0→0.83.6、`@react-native/codegen` 0.83.x と一致）ほか react/reanimated/worklets 等7点を整合。不整合で Metro バンドルが `VirtualView` codegen エラーになり実機/devビルドが起動不能だったのを解消。
  - **TTP location 取得の修復**: `GET /api/mobile/pos/terminal/location` の Terminal Location 自動作成を日本住所形式 `address_kanji` に修正（標準 `address` は JP で Stripe 400 になり Location を作成できず、TTP有効化が常に「location取得失敗」になっていた）。
  - **entitlement plugin**: `withRemoveTapToPayEntitlement` を app.json に登録し、Development型プロファイル(development/development-device)のみ TTP entitlement を保持・Distribution型(preview/production)は除去（Apple の publishing entitlement 未付与のため。付与後に preview/production を条件へ戻す）。
- 対象: モバイルアプリ（`apps/mobile`、Expo SDK55）／モバイル用API（signup再利用・account削除・push登録・terminal location）。iOS App Store 提出準備。
- 補足: 動画3本の**撮影は代表が実施**（台本はsubmission-guideに用意）。mobile typecheck パス。実機は `development-device` ビルド（entitlement 保持）で起動確認。**A-1=Apple の Distribution entitlement は未付与で確定**（実ビルド署名失敗より）。

## 2026-08-05 帳票共有のLINE宛先を顧客の連携済みLINEに自動選択 (branch claude/payment-status-and-error-no5a9m)
- 内容: 帳票共有モーダルの LINE タブで、顧客に連携済みの `customers.line_user_id` があれば宛先を
  自動選択し「◯◯様のLINEに送信します（連携済み）」と表示（生IDの手入力が不要に）。未連携時、
  または「別のユーザーIDを指定」選択時のみ手動入力欄を出すフォールバック。`/api/admin/customers`
  の select に `line_user_id` を追加し、モーダルは顧客がいる限り常に取得するよう変更。
- 対象: 帳票詳細の「共有」→ LINE タブ。

## 2026-08-05 滞留PRバックログを整理し、機能3件を現mainへ再適用してマージ (PR #884 / #885 / #886)
- 内容:
  - #884: サインアップ失敗時のロールバック（auth user / tenant / membership 削除）失敗を検知し、「孤児レコード・要手動クリーンアップ」を3つの失敗パスすべてでログ化（`src/app/api/signup/route.ts`）。
  - #885: 保険ケースのステータス変更で基幹ソフト連携向け webhook（`insurer_case.status_changed`）を発火（7ファイル）。加えて単一ケース PATCH に status compare-and-swap を追加し、同時更新時の webhook 二重発火を防止（bulk/messages ルートと整合、`cases/[id]/__tests__/route.test.ts` で3挙動を検証）。
  - #886: CMS予約投稿の日時を JST↔UTC で正しく変換する `src/lib/datetime.ts` を新設し、`new Date().toISOString()` の素朴な変換を置換（14ファイル、`datetime.test.ts` 10件）。
- 補足: 依存Bump #853/#775/#774 をマージ、陳腐化docs等（#757/#823/#822/#864/#863）をクローズ、履歴断絶した旧 #821/#748/#826 は上記再適用でクローズ。WIP実送金 #851・大型UIキット同期 #760 は保留。
- 対象: サインアップAPI、保険会社ポータル（ケース管理）、CMS予約投稿、依存関係。

## 2026-08-05 帳票ステータスの 'overdue' を DB 制約に追加＋種別クイックナビ追加 (branch claude/chouhyo-kanri-kaizen-fkgzaa)
- 内容:
  - `documents_status_check` に 'overdue'（期限超過）を追加。アプリは遷移・表示で 'overdue' を使うのに
    制約が欠いており、詳細画面「期限超過に変更」で PUT が CHECK 違反(23514)の 500 になりステータス変更が
    適用されなかったのを修正（マイグレーション `20260805085225_documents_status_overdue.sql`。本番へ直接適用済み）。
  - 帳票管理一覧のヘッダーバーに帳票種別クイックナビ（すべて／見積書／請求書／領収書…）を追加。ワンタップで
    種別を切り替えられる（既存の種別フィルタ状態を再利用）。
  - 一覧の「入金」クイックボタンを `consolidated_invoice`（合算請求書）にも表示（詳細画面と条件を統一）。
  - 再発防止テスト `statusConstraint.test.ts`（アプリが遷移し得る全ステータス ⊆ DB許可集合）を追加。
- 補足: 「入金済の変更が適用されない」の主因は 20260715 バッチのマイグレーション・ドリフト（`documents.staff_member_id`
  未反映で GET/PUT が 500）で、修復マイグレーション `20260731144359` が本番適用済みのため入金済更新自体は復旧済み。
- 対象: 帳票管理（`/admin/documents`）一覧・詳細、`documents` テーブル。

## 2026-08-05 帳票（請求書等）を LINE・メール・SMS で PDF リンク付き送付 (branch claude/payment-status-and-error-no5a9m)
- 内容: 帳票共有（`POST /api/admin/documents/share`）で主帳票 PDF をレンダリングし、非公開 Storage
  バケット（既存 `line-media` 再利用）へ保存して長期署名 URL を発行、各 channel の本文に含めるように
  した。LINE Messaging API は生ファイル（PDF）を push できないため、URL 送付が唯一の方法。LINE は
  `sendDocumentLink` に `pdfUrl` を追加して本文へ「PDFはこちら」リンクを付与、メールは既存の未使用
  `pdfUrl` 引数（「PDFを表示」ボタン）を配線、SMS は本文に PDF URL を付記。PDF 生成失敗は fail-soft で
  本文のみ送信。PDF ルートと共有で重複していたレイアウト解決を `src/lib/documents/pdfShare.ts` に集約。
- 対象: 帳票詳細／一覧の「共有」→ LINE・メール・SMS（全帳票種別。請求書を含む）。

## 2026-08-05 通知ベルの「すべて既読」がサーバに永続化されず未読が復活する不具合を修正 (branch claude/payment-status-and-error-no5a9m)
- 内容: `NotificationBell` の「すべて既読」がローカル状態のみ更新で API を呼ばず、ポーリング再取得で
  未読が復活していた。一括既読 API `PUT /api/admin/notifications/read-all`（テナント宛＋本人宛の未読を
  `read_at` で既読化）を追加し、ベルを「楽観更新 → API → 再取得」に修正。
- 対象: 管理画面トップバーの通知ベル。

## 2026-08-04 帳票一覧が本番で常に0件になる不具合を修正（金額フィルタ未指定を total=0 と誤解釈していた根本原因）(PR #879 / 93eeeea)
- 内容: 帳票一覧API `GET /api/admin/documents` が、金額検索 `amount_min`/`amount_max` 未指定時に
  `Number("") === 0` によりフィルタ値を 0 と解釈し、クエリに `total>=0 AND total<=0`（＝ total=0）を
  常時付与していた。金額>0 の全帳票が一致せず、本番で「帳票がありません（0件）」になっていた根本原因を修正。
  金額パースを純関数 `parseAmountParam`（`src/lib/api/amountFilter.ts`）へ切り出し、空・空白・未指定は
  null（フィルタ無し）を返し、明示的な "0" のみ 0 とするよう修正。回帰防止テスト
  `src/lib/api/__tests__/amountFilter.test.ts`（4ケース）を追加。あわせて #878 で入れた
  「接続過渡的0件」への多重リトライ／診断 `_diag`（誤診に基づく対症策）を撤去し、
  service-role 単一クエリのシンプルな取得に戻した。本番デプロイ後、表示回復を確認済み。
- 対象: 帳票管理一覧 `/admin/invoices`・`/admin/documents`（帳票取得API `GET /api/admin/documents`）。

## 2026-08-03 帳票明細: 品番のみ入力した明細が詳細画面・PDFで消えて見える不具合を修正 (branch claude/chouhyo-functionality-check-7fbgko)
- 内容: 帳票明細の「内容(description)」が空で「品番(item_code)」だけ入力された明細が、詳細画面・PDF・印刷で
  すべて「-」表示になり、入力した品番・商品名が丸ごと不可視になっていた（＝「DBに反映されない／吸い上げられない」
  と誤認される）不具合を修正。データ自体は `documents.items_json` に保存されており欠損ではなく、描画側が
  `description || "-"` のみで `item_code` を一切表示していなかったことが原因。表示ルールを純関数
  `itemContentLines`（`src/lib/documents/itemDisplay.ts`）に集約し、「内容が空でも品番があれば品番を内容として
  昇格表示」「両方あれば内容を主・品番を従(品番: …)に表示」に統一。詳細画面(`DocumentDetailClient.tsx`)と
  PDF(`pdfDocument.tsx`)の両描画経路へ適用。純関数の単体テスト `itemDisplay.test.ts` を追加。
  既存の帳票もデータ移行なしで即復旧する。
- 対象: 帳票詳細 `/admin/documents/[id]`、帳票PDF `/admin/documents/pdf`、印刷表示（全帳票種別）。

## 2026-08-03 帳票明細の品目入力を「入力欄＋検索欄」の2段に整理（選択UIの重複を解消） (PR #860)
- 内容: 明細1行あたり3要素あった品目入力（品番検索・「品目マスタから選択」ドロップダウン・品目入力欄）のうち、
  冗長な `<select>`「品目マスタから選択」を削除。品目名での選択が入力欄の datalist 補完と二重で、かつ select 側だけが
  全項目を埋め datalist 側は単価しか埋めないという不整合もあった。品番検索（`ItemCodeField`）と品目・内容の入力欄の
  2段構成へ統一し、入力欄を上に配置。純粋な JSX の再構成で挙動変更なし。マスタ未登録の入力内容を保存時に品目マスタへ
  自動反映する `autoRegisterMenuItems` は従来どおり動作（documents/invoices 両 API）。
- 対象: 帳票作成フォーム `src/app/admin/documents/DocumentForm.tsx`（見積書・請求書等の明細入力）。

## 2026-08-03 顧客登録の支払条件を請求書へ自動反映（プリフィル経路の取りこぼしを是正） (branch claude/customer-payment-terms-invoice-0q1v5p)
- 内容: 顧客登録で入力した支払条件（`billing_terms_note`、無ければ支払サイクルのラベル）が請求書に反映されない不具合を修正。
  原因は、顧客の敬称・住所・支払条件を宛先詳細へ自動反映するロジックが顧客セレクトの `onChange` 内にしか無く、
  「請求書を作成」ボタン（`/admin/invoices/new?customer_id=...`）等の URL プリフィル経路（`onChange` を経由しない）では
  未適用だったこと。導出ロジックを純関数 `customerFormDefaults` に集約し、`onChange` とプリフィル `useEffect` の双方から
  呼ぶよう修正。純関数の単体テスト `customerFormDefaults.test.ts` を追加。
- 対象: 帳票作成フォーム `src/app/admin/documents/DocumentForm.tsx`（請求書・見積書等の新規作成）。

## 2026-08-03 サインアップもパスワード必須に統一（パスワードレス登録の締め出しを予防） (branch claude/email-sso-login-issue-1f9upn)
- 内容: ログインを password のみにしたのに合わせ、新規登録も password 必須に統一。既定 `mode="magic"`（パスワードレス
  ＝メールリンク）と方式切替トグル・magic 分岐を撤去。これで「パスワード無しアカウント＋メールリンクログイン撤去」による
  将来の締め出し（Codex P1 指摘）を予防。既存パスワードレスユーザーは 0 件のため移行不要。サーバー(`signupSchema`)は
  passwordless 省略時に password 8 文字以上を必須化済みで二重に担保。
- 対象: `/signup`。API `/api/signup` と passwordless 分岐はバックエンド温存（UI からは未使用）。

## 2026-08-03 ログイン画面をパスワードのみに簡素化（メールリンク/SSO の導線を撤去） (branch claude/email-sso-login-issue-1f9upn)
- 内容: ログイン画面から「メールリンクでログイン（パスワード不要）」「会社の SSO でログイン」ボタン・区切り線・
  SSO 必須バナー・password 経路の SSO 強制分岐を撤去し、パスワードログインのみのシンプルな画面に。未使用の
  `MagicLinkSignIn.tsx` / `SsoSignInButton.tsx` を削除（252 行削除）。バックエンド API（`/api/auth/magic-link`,
  `/api/auth/sso/start`）と `ssoPolicy`/`sso` lib は温存し、可逆に。
- 対象: `/login`（施工店・代理店の入口）。

## 2026-08-02 メールリンク/サインアップ/SSO の PKCE コールバックを同一オリジンへ戻す修正 (branch claude/email-sso-login-issue-1f9upn)
- 内容: `resolveBaseUrl` に opt-in の `preferRequestOrigin` を追加し、magic-link / signup(パスワードレス) /
  sso-start の `emailRedirectTo`/`redirectTo` をリクエストと同一オリジンに変更。PKCE の code_verifier Cookie は
  リクエストオリジンに張られるため、コールバックが APP_URL(正規ドメイン)だと交換に失敗してログインできない問題を是正。
  純関数の単体テスト `src/lib/__tests__/url.test.ts` を追加。
- 対象: ログイン導線（`/api/auth/magic-link`, `/api/signup`, `/api/auth/sso/start`）。共通ヘルパ `src/lib/url.ts`。
- 注記: 本修正の効果は「ユーザーが実アクセスするオリジンが Supabase の Redirect URLs 許可リストに含まれる」ことが前提。
  SSO は Supabase 側に IdP 未登録（プロバイダ 0 件）のため別途設定が必要。詳細は DECISION_LOG / OPEN_QUESTIONS 2026-08-02。

## 2026-08-02 証明書/保険会社系 SECURITY DEFINER 関数の search_path バレ参照＋enum バグを修復 (branch claude/payment-status-and-error-no5a9m)
- 内容: 本番 `cahybswpduchptvyvdkk` のログに `relation "certificates"/"insurers" does not exist` が継続発生。原因は `20260404000000` が4関数に `SET search_path=''` を付けた際に本体のテーブル参照を `public.` 修飾へ直さなかったこと（`20260725125332` の第1弾修正が取りこぼした4関数）。さらに `platform_certificate_stats`・`insurer_get_vehicle_certificates` は enum に無い `'expired'`（`certificate_status_enum` は active/void/draft のみ）を参照しており、バレ参照を直すと enum 例外に変わる二重バグだった。`20260802000000_fix_search_path_bare_refs_certificates_insurers.sql` で4関数を `public.` 修飾＋`status::text` 比較に修正し本番へ適用。
- 対象: `get_certificate_service_price`（証明書料金）/ `platform_certificate_stats`・`platform_insurer_count`（管理ダッシュボードのプラットフォーム統計、super_admin 表示）/ `insurer_get_vehicle_certificates`（保険会社ポータルの車両別証明書一覧）。
- 限界: 別2件のコード/スキーマ不整合は未修正で要判断として残す — `certificates.template_name`（`api/admin/vehicles/[id]/last-cert` が参照するがマイグレーション未定義）、`agents.stripe_connect_onboarded`（stripe connect webhook が参照するが列は `tenants` にのみ存在し `agents` には無い）。
- 検証: 適用後 `platform_certificate_stats()`＝{total:38, active:23, void:14, expired:0, draft:1}、`platform_insurer_count()`＝2 がエラーなく返ることを本番で確認。

## 2026-07-31 帳票管理エラー・入金済更新不可を修復（20260715* マイグレーションドリフトの再適用） (branch claude/payment-status-and-error-no5a9m)
- 内容: 本番 `cahybswpduchptvyvdkk` で `20260715000000`〜`20260715000003` の4本が `schema_migrations` に記録済みなのに DDL 未反映（ドリフト）だったため、`/api/admin/documents` の GET/PUT が `column documents.staff_member_id does not exist` で 500 になり、帳票管理の一覧表示と「入金済」への更新ができなかった。4本の DDL を冪等にまとめた修復マイグレーション `supabase/migrations/20260731144359_repair_20260715_batch_drift.sql` を新規作成し本番へ適用。復旧した機能: 帳票管理一覧・書類確認、請求書の入金済（入金確定）更新、外注請求書（staff_invoice）、支社担当者ロール（store_memberships.role）、売上分析の週別集計、外注職人のレス率。
- 対象: 管理画面 帳票管理（`/admin/documents`）・請求書入金確定 / `/api/admin/documents` GET・PUT / 本番DB スキーマ。
- 限界: 元の4マイグレーションファイルは履歴再現性のため未変更（修復は別マイグレーションで冪等再適用）。ドリフトの根本原因（記録済みなのに未適用になった経緯）は未究明で OPEN_QUESTIONS に起票。
- 検証: 適用前に FK/CHECK 検証の安全性を確認（store_memberships 0行・孤児user_id 0、documents/document_templates の doc_type 逸脱 0）。適用後、7オブジェクト（`documents.staff_member_id`／`staff_members.commission_rate`／`store_memberships.role`／documents・document_templates の doc_type CHECK の staff_invoice／RESTRICTIVE ポリシー／billing_analytics_stats の週別）の実在と、PUT ハンドラの全 SELECT 列（38列）が本番でエラーなく解決することを確認。

## 2026-07-30 代理店ポータルに「常に最新の商品資料」欄を追加（自動生成PDFの再利用） (branch claude/agency-franchise-document-updates-3pdw2w)
- 内容: 代理店資料が静的アップロード（`agent-materials` バケット）のみで、機能追加・料金改定のたびに本部が差し替えないと陳腐化する問題に対応。既にライブデータ（`PLANS`/`FEATURE_GROUPS`/`SECURITY_BLOCKS` 等）からリクエスト時に自動生成しているマーケ資料（`RESOURCE_PDFS` → `/api/marketing/resources/[key]/pdf`）を代理店ポータルにも露出させ、「常に最新の商品資料」欄として配置。機能の増減・改定があってもダウンロードのたびに最新版が出力され、本部の差し替え作業は不要になる。
  - 実装: 6資料（サービス概要/機能紹介/セキュリティ/導入事例/ROI/料金）のタイトル・説明・DLリンクを、これまでマーケ資料ページにローカル定義していた配列から共有モジュール `src/lib/marketing/resourceCatalog.ts`（純データ、重い依存なし＝クライアント同梱を回避）へ抽出し単一情報源化。`ResourceCard` の `Resource` 型もカタログ由来に統一。`/agent/materials`（`src/app/agent/materials/page.tsx`）に緑の「ALWAYS LATEST」欄＋各資料の「最新版をDL」＋「全資料一括DL（ZIP）」を追加。マーケ資料ページ（`/resources`）は共有カタログを参照するよう置換（表示は不変）。
  - 対象: 代理店ポータル（agent）資料画面 / マーケ資料ページ（表示不変のリファクタ）。
  - 限界: 自動最新化されるのは元データを持つ製品資料のみ。契約書テンプレ等・機能増減と連動しない定型文書は従来どおり本部が手動更新（静的アップロード欄は併存）。プレビューは attachment 配信のため欄内 iframe ではなく新規タブDLとした。
  - 検証: 新規 parity テスト（catalog↔`RESOURCE_PDFS` の双方向カバレッジ・DLリンク整合）3件＋`src/lib/marketing` 全66件パス、tsc エラー0、eslint エラー0（既存 warning 2件は無関係の別箇所）。

## 2026-07-28 「レドラ」音声起動の運用手順を追加（アシスタント経由・コード変更なし）
- 内容: `apps/mobile/docs/VOICE_LAUNCH.md` を新規作成。既存の `ledra://` URL スキーム（expo-router の自動ディープリンク解決）を使い、iOS ショートカット／Android ルーティンに「レドラ」を登録して `ledra://certificates/new` 等でデータ入力画面へ直行させる手順を文書化。アプリ側の追加実装はゼロ。アプリ内ウェイクワード（B）とネイティブ App Intents は実装ロードマップとして同ドキュメントに記載（実機ビルド待ち・未実装）。
- 対象: モバイルアプリ（`apps/mobile`、Expo）／現場の施工士による音声起点のデータ入力。

## 2026-07-30 車両レポートの段階式ティア（部分/フル）＋スコープ按分 (branch claude/merchant-revenue-sharing-22tuq3)
- 内容: 単一定額レポートを、無料サマリ→部分（直近N ヶ月）→全履歴フルの段階式へ拡張。開示範囲と還元対象を一致させる。
  (1) スキーマ（`20260730200000_vehicle_report_tiers.sql`）: `vehicle_report_tiers`（tier_key/label/price_jpy/scope_type/scope_months/enabled/sort、直近1年¥1,500＋全履歴¥3,000 を seed）。`vehicle_report_orders` に `tier_key`/`scope_type`/`scope_months`/**`scope_from`（購入時アンカーの絶対カットオフ）**を追加。
  (2) スコープ純粋関数（`src/lib/vehicleReport/tiers.ts`）: `scopeFromRow`/`scopeCutoffIso`/`isCreatedAtInScope`（カレンダー月・テスト7件）。`getReportTiers`/`getReportTierByKey`。
  (3) 課金配線: checkout が `tier` を受け取り、価格・スコープをティアから決定し `scope_from` を確定して保存（クライアント値は不使用）。access は `scopeFromIso` を返す。
  (4) 表示: `/v/[vin]` は購入スコープ（`scope_from` 絶対境界）内の記録のみ表示。部分購入者には全履歴レポートへのアップセル導線。会員（ログイン施工店）は従来どおり全表示。
  (5) 還元按分: `recordVehicleReportRevenueShares` が注文の `scope_from` で記録を絞り、**開示した記録の施工店にのみ**件数比例で按分（見せていない店は対象外）。表示と按分が同一境界。
  (6) UI: `PurchaseReportCard` をティア一覧＋compact アップセルに刷新。
- 対象: 車両パスポート/レポート課金（全業種）・公開ページ `/v/[vin]`・checkout。
- 検証: vehicleReport 系テスト27件パス（scope 7＋access＋split 6＋payout 5 等）、`lint:migrations` OK、tsc エラー0、変更ファイル eslint エラー/警告0。設計書 `docs/merchant-revenue-sharing-design.md` §9。
- 残（スコープ外）: 部分軸は期間のみ（種別/店は将来）、ティア価格の妥当性、段階購入の差額課金、運営ティア編集 UI。

## 2026-07-30 レポート収益還元の実送金（Connect 精算）＋返金巻き戻し (branch claude/merchant-revenue-sharing-22tuq3)
- 内容: 蓄積台帳（PR #848）の後続。台帳の還元分を Stripe Connect で施工店へ実送金し、返金時に巻き戻す。既存の代理店コミッション精算と同型。
  (1) スキーマ（`20260730100000_vehicle_report_payout.sql`）: `stripe_connect_transfers.source_type` に `vehicle_report`、`vehicle_report_orders.status` に `refunded` を追加（DROP/ADD CHECK, NOT VALID+VALIDATE）。
  (2) 精算: `src/lib/vehicleReport/payout.ts`。`payVehicleReportRevenueShare` は `approved` の share のみ送金（`metadata.source_type=vehicle_report`＋idempotencyKey、`stripe_transfer_id` を刻むだけで確定は webhook）。`settleApprovedRevenueShares` が一括精算。cron `/api/cron/vehicle-report-payout`（毎日 05:20 UTC・`withCronLock`）。
  (3) 確定: connect-webhook の `transfer.paid`→share を `paid`、`transfer.reversed`→`reversed`（agent_commission と同じ分岐に vehicle_report ケース追加）。
  (4) 承認ゲート（人手）: platform-admin API `GET /api/admin/platform/report-revenue`（一覧）＋ `PATCH .../<id>`（approve/pay/cancel）。還元率70%確定まで approve しなければ 1 円も動かない安全弁。
  (5) 返金巻き戻し: メイン webhook `charge.refunded`（全額のみ）→ `reverseVehicleReportRevenueSharesForOrder`。送金済み share は Stripe reversal（webhook で `reversed`）、未送金は `cancelled`、注文は `refunded`。判定は純粋関数 `reversalActionForStatus`（テスト5件）。
  (6) 導線: `/admin/report-revenue` に未精算かつ Connect 未連携時の登録 CTA（既存 `/admin/settings` 連携を再利用）。vercel.json に cron 登録。
- 対象: 車両レポート課金の後精算（全業種）・Stripe connect/main webhook・施工店 admin ポータル・platform-admin。
- 検証: `reversalActionForStatus` テスト5件＋`splitRevenueByRecordCount` 6件パス、`lint:migrations` OK、tsc エラー0、変更ファイル eslint エラー0。
- 残（スコープ外）: 部分返金対応、承認/精算の専用管理 UI（現状 API のみ）、最低支払額・精算頻度の調整、還元率70%の最終確定。

## 2026-07-30 車両全履歴レポート収益の施工店還元（蓄積台帳）(branch claude/merchant-revenue-sharing-22tuq3)
- 内容: 有料の車両全履歴レポート売上を、記録を残した施工店へ按分して蓄積する仕組みを実装。
  (1) スキーマ: `vehicle_report_settings.merchant_share_bps`（還元率、既定 7000bps=70%）を追加。
  台帳 `vehicle_report_revenue_shares`（1売上×施工店で1行、`UNIQUE(order_id, tenant_id)`、
  RLS は service-role のみ）を新設（`supabase/migrations/20260730000000_vehicle_report_revenue_shares.sql`）。
  (2) 按分: `src/lib/vehicleReport/revenueShare.ts` の純粋関数 `splitRevenueByRecordCount` が
  プール = floor(売上×bps/10000) を記録件数比例で配分し、丸め残差を件数上位へ1円ずつ配って
  Σ=プールを保証（円の生成/消失なし）。記録の定義は `/v/[vin]` タイムラインと同じ
  「opt-in 車両のアンカー済み証明書」。
  (3) 配線: レポートが paid 化する2経路（Stripe webhook / 成功URLの unlock フォールバック）から
  冪等な `recordVehicleReportRevenueShares(orderId)` を呼ぶ。二重計上は UNIQUE + ignoreDuplicates で防止。
  計上失敗は非致命化し、購入者のアクセス付与や webhook をブロックしない。
  (4) 可視化: 施工店ポータル `/admin/report-revenue`（サーバコンポーネント）に「あなたの記録が生んだ収益」
  （累計還元額・未精算・回数・VIN 末尾別内訳）と「技術が、資産になる。」の価値説明を表示。
  サイドバー nav（証明書の近く）＋ feature カタログ（revenue グループ・advanced・`payments:view`）に追加。
- 対象: 車両パスポート/レポート課金（全業種）・施工店 admin ポータル・Stripe webhook。
- 検証: `splitRevenueByRecordCount` 単体テスト6件パス、feature カタログ整合テスト継続パス、tsc エラー0、
  変更ファイル eslint エラー0。設計書 `docs/merchant-revenue-sharing-design.md`。
- 残（スコープ外）: 実送金の自動化（`stripe_connect_transfers.source_type` に vehicle_report 追加＋精算バッチ／
  Connect オンボーディング導線は別 PR）、返金時の台帳巻き戻し。

## 2026-07-25 CMS予約投稿のタイムゾーンずれを修正（保存・表示の両方） (branch claude/cms-scheduled-post-bug-ejccnb)
- 内容: サイトコンテンツ（お知らせ/ブログ/イベント）の予約公開が指定時刻に公開されず、かつ管理/公開画面の日時表示も入力とずれていた不具合を修正。
  - **保存**: `datetime-local` が生成する TZ 無しの壁時計文字列（例 `2026-07-30T14:00`）を server action が `new Date(x).toISOString()` でそのまま変換していた。Vercel ランタイムの TZ が UTC のため JST 14:00 の予約が `14:00Z`（＝JST 23:00）で保存され、cron 自体は正常でも公開が9時間遅れていた。
  - **表示**: 管理一覧・公開イベント/ニュース/ブログ・NewsTeaser の日時整形がサーバ側で `new Date().getHours()` / `iso.slice(0,10)` を使い、SSR(UTC)で JST 入力が9時間ずれて（日付のみ表示は深夜帯で1日）表示されていた。
  - 共有ヘルパー `src/lib/datetime.ts` を新設（`jstLocalInputToUtcIso` / `utcIsoToJstLocalInput` / `jstParts` / `formatJstDateTime` / `formatJstDateTimeJa` / `formatJstDateJa`）。naive 入力を常に JST(UTC+9) として保存し、表示も常に JST で描画（実行環境TZ非依存）。散在していた各ページのローカル日時整形関数を撤去して集約。ユニットテスト追加（UTC/JST/他TZの各サーバで検証）。
- 対象: `/admin/site-content`（作成・編集 server action / 一覧）、公開 `/events`・`/news/[slug]`・`/news`・`/blog`・`/blog/[slug]`・トップ NewsTeaser、cron `/api/cron/publish-scheduled` の対象データ

## 2026-07-27 AIナビ＆横断検索でサイドバーをスリム化 + 監査ゲート恒久修正 (PR #752 / e19d92c)
- 内容:
  (1) サイドバー刷新: 常時表示をコア8機能に絞る slim 表示と、全 NAV_GROUPS を出す full トグル。
  ピン留めを localStorage 永続化。ナビ定義を `adminNav.tsx` に抽出し単一の出典化。
  (2) AIナビ（`AssistantChat` + `/api/admin/assistant/navigate` + `navIntent`）: 自由文→画面 href。
  モデル出力の href は `resolveHrefFromCatalog` で既知カタログ照合（ハルシネーション/オープン
  リダイレクト防止）。到達先は `AdminRouteGuard` が担保。⌘/Ctrl+J で起動。
  (3) 横断検索: 名前・番号で顧客/車両/証明書/請求書を検索し詳細へ。staff 以上に限定。
  (4) 自動レビュー(Codex)対応: ログイン後リダイレクトのループ修正（会員資格なしは
  `/admin/certificates` へ）、AIナビ API のユーザ単位レート制限、ダイアログ閉/リセット時の
  in-flight fetch 中断、本社専用ユーザへナビ限定許可、フォールバック語一致のトークン化
  （`navTokens.ts`）、ピン留めボタンのタッチ/キーボード a11y、告知バナーの実マウント。
  (5) `npm audit` high 脆弱性(postcss/brace-expansion/minimatch)を override 統一で恒久解消し
  CI 必須チェックを緑化（詳細は DECISION_LOG 2026-07-27）。
  (6) お知らせ「【アップデート予告】AIナビ＆横断検索」を publish（公開日付 0:00 JST）。
- 対象: 管理画面（admin）サイドバー / AIナビ API / ログイン後遷移 / CI・依存。

## 2026-07-27 電子帳簿保存法 対応：確定帳票の封印（真実性）＋金額・取引先検索（可視性） (branch claude/c2pa-production-deployment-nlv0gs)
- 内容: 電帳法の2要件を加盟店向けに満たす実装。
  (1) 真実性の確保 — 確定（draft→sent）した帳票の不変フィールド（doc_number/issued_at/金額/税/明細/取引先等）から SHA-256 ハッシュを算出し、可能なら RFC3161 タイムスタンプ（第三者による存在時刻証明）を付けて `documents.meta_json.integrity_seal` に保存（新規 `src/lib/documents/documentSeal.ts`）。TS は写真 TSA と同じ機構（`fetchTimestamp`）を流用し、専用 env `DOCUMENT_TSA_*` が無ければ有効化済みの `PHOTO_TSA_*` にフォールバック。TS 局未契約/失敗/締切超過はハッシュのみの封印へ正直に degrade（付いていない TS を騙らない）。送付済み帳票が編集不可である既存運用と合わせ、後から再計算で改ざん検知できる基盤になる。確定パスは3経路すべてに配線：PUT の draft→sent、POST の status=sent 直接作成、共有送付（`documents/share/route.ts`）の draft→sent 一括更新。
  (2) 可視性の確保 — 帳票一覧 API/画面に「取引金額（下限・上限）」「取引先（顧客名 or 宛先名の部分一致）」検索を追加（`GET /api/admin/documents`・`DocumentsClient.tsx`）。既存の日付（issued_at）絞り込みと合わせ、電帳法が求める「取引年月日・金額・取引先」での検索を満たす。取引先は `customers(tenant_id, name)` 索引を使う ilike と `recipient_name` の OR。
- 対象: 帳票管理（見積書/納品書/請求書/領収書等、全業種）。スキーマ変更なし（封印は `meta_json` に格納）。検証: `documentSeal` 単体テスト4件＋`src/lib/documents` 全31件パス、tsc エラー0、eslint エラー0。
- 残: 検証器（封印の照合UI・TS トークン検証表示）は未実装。`DOCUMENT_TSA_*`/`PHOTO_TSA_*` 未設定時はハッシュのみ（TS 付与には TS局の有効化が必要）。

## 2026-07-27 C2PA署名パイプラインの本番導入ブロッカー2件を修正 (branch claude/c2pa-production-deployment-nlv0gs)
- 内容: 施工写真の C2PA 署名（`src/lib/anchoring/providers/`）が dev-signed / production いずれのモードでも実際には署名できず、無署名フォールバックしていた根本原因2件を特定・修正。
  (1) `c2pa.ts`: `new Builder({...})` は @contentauth/c2pa-node の誤用（コンストラクタはネイティブ handle を取る）で、以降の `addAssertion`/`sign` が `failed to downcast ... NeonBuilder` を throw → try/catch で握りつぶし無署名になっていた。静的ファクトリ `Builder.withJson({...})` に修正（`claim_generator` → `claim_generator_info`）。
  (2) `c2paSigner.ts`: dev-signed の自己署名証明書が C2PA の end-entity 証明書プロファイルを満たさず、c2pa-rs が sign 時に「the certificate is invalid」で拒否。EKU=emailProtection(1.3.6.1.5.5.7.3.4)・SubjectKeyIdentifier・AuthorityKeyIdentifier・BasicConstraints(CA:FALSE) を付与し、notBefore を 60 秒バックデート。
  併せて実 JPEG を実コードパスで署名し manifest を読み戻す happy-path テストを追加（従来テストは disabled と失敗フォールバックしか見ておらず本バグを検出できていなかった）。`.env.example` に production 証明書要件（PEM チェーン / PKCS#8 鍵 / trust list チェーン）を明記。
- 対象: 証明書画像アップロード（`processUploadedPhoto` → `invokeAllUploadProviders` → `signC2pa`）の C2PA 来歴署名。整備/鈑金/コーティング/PPF 全業種。ネイティブモジュールは optionalDependency のため、この環境（Node 22/linux）でビルド成功を確認済み。

## 2026-07-27 TSA（タイムスタンプ）有効化を当面の推奨経路として整備 (branch claude/c2pa-production-deployment-nlv0gs)
- 内容: C2PA 本番証明書（重い適合認定が必要）を待たず、既存実装済みの写真 TSA（PHOTO_TSA_*、RFC3161）を有効化して撮影時封印を成立させる方針をドキュメント化。コード変更は不要（processUploadedPhoto → requestPhotoTimestamp は配線済み）。`.env.example` に推奨 TS局（無料の DigiCert 公開 TSA、国内法対応時は JIPDEC 認定局に差し替え）と有効化に必要な2変数を明記。`docs/c2pa-production-deployment.md` §6 に日本語の有効化手順・正直なスコープ（TSA 単独では grade は verified まで上がらず、別途デバイス認証＋nonce が必要）・動作確認方法を追記。
- 対象: 施工写真の改ざん検知（撮影時封印）の運用。証明書取得不要で即有効化できる軽量経路。

## 2026-07-27 C2PA本番証明書の取得手順ドキュメント + 切替前プリフライト検証スクリプト (branch claude/c2pa-production-deployment-nlv0gs)
- 内容: production 署名証明書の取得〜切替を代表が実行できるよう整備。(1) `docs/c2pa-production-deployment.md` に取得フロー（C2PA Conformance Program 登録 → Conforming Products List → trust list CA 発行。商用発行は主に DigiCert / SSL.com）・env 形式（PEM チェーン / PKCS#8 鍵 / EKU 等）・鍵保管（env or KMS）・当面の TSA 代替を集約。公式 C2PA Trust List（c2pa-org/conformance-public、確認時点で 28 証明書）の実態を明記。(2) `scripts/verify-c2pa-cert.mjs`: 候補証明書で Ledra と同じ manifest を実署名し、公式 Trust List を anchor に読み戻して `validation_state==="Trusted"` のときだけ GO(exit0)、Valid/Invalid は NO-GO(exit1) と判定する切替前検証ツール。自己署名証明書で NO-GO(Invalid) になることを実測確認。
- 対象: C2PA production 導入の運用手順・ツール。証明書取得自体は Conformance Program 登録を伴い代表判断待ち（OPEN_QUESTIONS 参照）。

## 2026-07-27 SEOカテゴリ語を「施工履歴プラットフォーム」に統一 (branch claude/ledra-seo-keywords-7vnacz)
- 内容: 主カテゴリ語を PR TIMES と揃え「施工履歴プラットフォーム」に統一（旧「AI業務管理SaaS」から変更）。
  タイトル「Ledra｜自動車整備・コーティング店の施工履歴プラットフォーム」。`siteConfig`(single source) 経由で
  title/description/OGP/JSON-LD(applicationSubCategory)/Hero バッジ/Footer/OG画像/PDF/オンボメール等を一括統一
  （14ファイル27箇所）。keywords に「施工履歴プラットフォーム/施工履歴 管理/整備履歴 管理/整備記録簿 電子化」を
  追加（19語）。買い手検索語（整備工場 管理システム 等）は description/keywords に温存する二層構成。
- 対象: 公開マーケLP全体のメタデータ・構造化データ・OGP・ブランド表記。全業種（整備/鈑金/コーティング/PPF）。

## 2026-07-27 AITURBO対抗フェーズ2：C2PA本格統合・GPS真正性・真正性エンジン統合・写真ファースト (PR #832–#841)
- 内容: フェーズ1に続き、C2PAの本格活用と多層GPS整合による真正性強化＋入力低摩擦化を一括実装。すべて opt-in・デフォルト無害・生座標非保存を貫いた。
  - **A2 フォーム写真ファースト化** (PR #833): 証明書発行フォームで施工写真セクションを車種選択直後へ移動、任意項目を折りたたみ `<details>`「詳細を追加」に格納。必須3項目（顧客名・車両・写真1枚）は常時表示。UIのみ・ロジック不変。
  - **A3 写真→施工内容ドラフト** (PR #834): 施工写真1〜2枚から `serviceCategory`＋施工内容下書き（≤120字）を Vision 生成する opt-in 自動アクション `photo.auto_draft_content`（既定OFF・「おまかせ」プリセット外＝精度実証まで個別opt-in・fail-open）。`certificates.meta.content_draft_suggestion` に提案のみ保存、発行前に人が確認（壁3不介入）。
  - **C5 写真GPS×店舗位置の整合性** (PR #836): 純関数 `checkPhotoLocation`＋`haversineMeters`。写真EXIFのGPSをアップロード処理中にメモリ内で店舗座標と照合し、**判定(verdict)と距離帯だけ**を `certificate_images.gps_check_verdict/gps_distance_bucket` に保存して生座標は破棄。証明書詳細に「撮影場所の整合性」チップ。
  - **B2 C2PAマニフェスト要約の永続化・表示** (PR #837): 署名時に封入した内容（署名者モード・actions台帳・封入VIN・TSA/nonce封入有無）を決定的に要約して `certificate_images.c2pa_manifest`(jsonb) に保存。証明書詳細・保険照会で読み戻し表示。**単回nonceの生値は保存しない**（真偽のみ）。
  - **B4 真正性エンジンにC2PA/GPS統合** (PR #838): 改ざんスクリーニング集約に、C2PA検証結果とGPS整合をフラグ統合。`gps_mismatch_store`（出張は正当なので非決定的）、`c2pa_missing`（本番署名運用時のみ）。GPS/C2PAは画素で確認できないため Vision抽出から除外し無駄な課金を防止。既定運用（署名OFF・店舗座標なし）ではフラグ増えず＝デフォルト無害。
  - **C4 出張モバイルGPS＋写真×作業場所照合** (PR #840): 作業開始/完了時にモバイル端末GPSを予約(`reservations.work_lat/lng/gps_at`)へ記録し、写真を「店舗 or 出張作業場所」いずれかと照合（新verdict `match_worksite`）。出張現場の写真の誤警告を根本解消。作業場所座標は**スタッフ運用限定**（顧客/保険ポータル非公開）。CSP `geolocation=(self)`。
  - **B3 外部C2PAマニフェスト検証** (PR #841): カメラ/他アプリの Content Credential をアップロード時に検証（`@contentauth/c2pa-node` v0.6.0 Reader API・fail-open）。**再エンコード前の原バイト**に対して実施。`external_c2pa_invalid`（存在するのに無効＝撮影後改変）を決定的フラグとして真正性エンジンに統合。
- 対象: 証明書発行フォーム・写真アップロード（cookie/モバイル両経路）・証明書詳細・保険照会・モバイル予約API・改ざんスクリーニング。全業種（出張作業を含む）。
- 備考: **B1 本番C2PA署名の有効化は env 運用**（`C2PA_MODE=production`＋メンバー証明書・`PINATA_JWT`をVercel環境変数に設定＝コード変更なし）。外部C2PA検証の実署名/改変サンプルによる統合確認はステージング推奨（ネイティブ依存がCIに未インストールのため）。

## 2026-07-27 AITURBO対抗フェーズ1：写真打刻・進捗ラベル自動化・C2PA VIN封入・店舗座標 (PR #830 / 87a90d5)
- 内容: 競合 AITURBO（株式会社ルクレ）の「写真を撮るだけ」低摩擦入力と改ざん不能な証跡を吸収する第一弾。既存資産の接続が中心。
  - **A1 写真打刻**: 施工写真の EXIF 撮影時刻から施工日・作業時間を推定する純関数 `deriveWorkStamp`（`src/lib/certificates/workStamp.ts`＋8テスト）。写真アップロード後の `after()` で `certificates.meta.work_stamp` に提案保存する opt-in 自動アクション `photo.auto_work_stamp`（既定OFF・**LLM 不使用で無料**、`src/lib/ai/automation/workStampAuto.ts`）。証明書詳細に読み取り専用の推定チップを表示。`exif_captured_at` はサーバ tz=UTC 取り込み前提で UTC 成分を施工日とし（tz変換で日付が±9hずれるのを回避）、EXIF欠落・壊れた時計・広すぎる時間幅は提案しない（捏造防止）。
  - **A4 モバイル進捗ラベル自動化**: `progress_label` を任意化し、未指定時は現ワークフロー工程名から補完（純関数 `resolveProgressLabel`、`src/app/api/mobile/progress/[reservationId]`）。職人が写真だけで進捗を送れる。
  - **B1 C2PA VIN封入**: 証明書対象車両の VIN を `CaptureBinding` に渡し `com.ledra.capture` アサーションへ封入（署名の別車両流用を防ぐ束縛、`processUploadedPhoto`/`uploadHandler`）。本番署名の有効化は env 運用。
  - **C2 店舗座標**: `stores` に `latitude`/`longitude` 列を追加（追加のみ・安全なマイグレーション）、`/admin/stores` に座標入力欄。写真GPS整合チェック（Phase 2）の基準座標。
- 対象: 証明書発行・写真アップロード（cookie/モバイル両経路）、モバイル進捗API、店舗設定。整備/鈑金/コーティング/PPF 全業種。
- 備考: A2（証明書フォームの写真ファースト化）は実アプリ目視確認が必要なため別変更に延期。後続 Phase 2 は写真→施工内容Visionドラフト・C2PAマニフェスト永続化/外部検証・GPS整合チェック本体・出張作業のモバイルGPS取得。

## 2026-07-27 SEO/GEOポジショニング刷新：「AI業務管理SaaS」へ (branch claude/ledra-seo-keywords-7vnacz)
- 内容: サイト全体のSEO文言を「WEB施工証明書SaaS」→「自動車整備・コーティング店のAI業務管理SaaS」へ統一。
  `siteConfig`（`src/lib/marketing/config.ts`）に siteTagline / siteDescription / keywords(15語) /
  featureList(9項目) / siteNameAlt「レドラ」を集約し、root layout・(marketing) layout・トップページ・
  features/for-shops の各 metadata と JSON-LD がここを参照する単一情報源に。
  JSON-LD(SoftwareApplication) に featureList・audience(BusinessAudience)・keywords・alternateName・
  applicationSubCategory・inLanguage を追加（生成AI検索が「何ができる/誰向け」を事実で拾えるように）。
  `robots.ts` で主要AIクローラー（GPTBot / OAI-SearchBot / ChatGPT-User / ClaudeBot / PerplexityBot /
  Google-Extended / Applebot-Extended）を名指しで allow。Hero バッジ・Footer タグライン・OG画像(root/marketing/og.tsx)・
  video レイアウト/ページ・サービス概要PDF・オンボーディングメールのタグラインも新ポジションへ更新。
- 対象: 公開マーケLP全体のメタデータ・構造化データ・OGP、およびAI検索(GEO/AEO)向け露出。全業種（整備/鈑金/コーティング/PPF）。

## 2026-07-24 コアフロー横断バグ監査：実バグ8系統を修正 (branch claude/dazzling-ride-9mnfsp)
- 内容: 予約受付〜会計終了のコア機能を監査し、以下を修正。
  (1) 並列ブース枠（max_bookings>1）で2件目が必ず弾かれる不具合。容量スロットが支配する
  予約は max_bookings を同時受付数の権威とし、枠に載らない予約（終日/枠未設定）のみ重複判定
  （`customer/booking`・`external/booking`）。
  (2) 返金の累計上限チェック欠如・`refund_amount` 上書きによる過剰返金。累計判定＋累計保存に修正、
  回帰テスト追加（`payments/[id]/refund`）。
  (3) 売掛元帳が見積等の非請求帳票を未回収額に混入。`doc_type in (invoice, consolidated_invoice)`
  に限定（`payment-entries/ledger`）。
  (4) ショップ会計の税端数が Stripe 実請求額と1円ズレ。単価端数×数量に統一し DB total=請求額
  （`shop/checkout`）。
  (5) 見積AIの合計をLLM出力のまま採用 → 明細から再計算（`quoteFromVehicle`）。
  (6) `vehicle-size/ocr` にレート制限・staff権限・空/MIME検証・AI停止/コストキャップを追加（兄弟
  OCRルートと統一）。
  (7) ワークフロー完了通知が最終工程の可視設定・車両IDに依存して飛ばないケースを解消、完了/進捗
  通知と工程到達AI自動化を after() 化して serverless 打ち切りを防止（`reservations/[id]/advance`）。
  (8) ジョブ写真取得に tenant_id フィルタを付与（`jobs/[id]/photos`）。
- 対象: 顧客/外部予約API、ワークフロー進行、ジョブ写真・車検証OCR、見積AI、返金・売掛・ショップ会計。

## 2026-07-23 予約が入った際の店舗宛通知（メール/Slack）(PR #820)
- 内容: 顧客予約（`/api/customer/booking` Web予約フォーム、`/api/external/booking`
  Googleマップ予約/LINE LIFF）が作成されると、テナントのオーナー/管理者へ
  「予約が入りました」メールを自動送信（`src/lib/notifications/bookingNotify.ts`）。
  GCal同期・LINE確認通知と同じ non-blocking fire-and-forget で呼び出し、予約成立自体は
  阻害しない。加えて `/admin/settings` の「予約通知」欄に Slack Incoming Webhook URL
  （`tenants.booking_notify_slack_webhook_ciphertext`、LINE/Squareと同じ規約で`buildSecretWrite`/
  `readSecret`により暗号化保存・write-only表示）を設定すると同内容をSlackにも通知（未設定なら
  スキップ）。管理画面から作成した予約（`/api/admin/reservations`）は対象外。
- 対象: 顧客Web予約フォーム、Googleマップ予約/LINE LIFF経由の外部予約、`/admin/settings`
  店舗設定画面。

## 2026-07-23 保険会社ケース更新をテナントAPI webhook基盤に接続 (PR #821)
- 内容: `insurer_cases` の作成・ステータス変更は、これまでテナント（施工店）へはメール通知
  （`sendCaseStatusNotification`）のみが届いており、既存の outbound webhook 基盤
  （`tenant_webhooks` / `webhook-topics.ts`、certificate/customer/vehicle/work_history
  のみ対応）には接続されていなかった。`insurer_case.created` / `insurer_case.status_changed`
  をトピックレジストリに追加し、`POST /api/insurer/cases`（作成時）と
  `PATCH /api/insurer/cases/[id]`（ステータス変更時）から `emitEntityWebhook()` で発火する
  ようにした。既存のメール通知とは独立して動作し、購読が無いテナントには no-op。
- 対象: 保険会社ポータル `/insurer/cases`（案件管理）と、テナント側の連携管理 UI
  `/admin/integrations`（Webhook トピック選択に新トピックが自動反映）。

## 2026-07-22 管理画面ダッシュボードに「Ledraに聞く」入口 + 承認インボックスに根拠表示 (PR #819)
- 内容: ダッシュボード最上部に自由入力欄 `AskLedraBar` を新設。まず決定的なキーワード→
  画面ルーティング（`src/lib/ai/askRouter.ts`、AI不使用・無料・全プラン対象）を試し、
  マッチしなければ既存の `qaAssistant.generateQAAnswer`（施工ナレッジ・Academy事例の
  RAG）にフォールバックする（`/api/admin/ask`、`field-knowledge/ask` と同じプラン制限・
  レート制限・AI設定ゲート）。また承認インボックス（`ApprovalInboxWidget`、既に
  ダッシュボード最上部に常設済み）の各下書きに「なぜ」を追加: 証明書は元の予約に
  保存された実際のAI信頼度（`reservations.ai_certificate_draft`）、発注は起票時の実際の
  理由文言（`purchase_orders.note`）を表示。請求書は自動/手動を区別する実データが無い
  ため意図的に非表示（捏造しない）。
- 対象: 管理画面ダッシュボード `/admin`（全業種のテナント管理画面）。

## 直近のリリース（git log 直近30件より、2026-07 時点で把握できるもの）

## 2026-07-22 予約管理UI整理・案件ワークフローのエラー表示バグ修正・証明書発行の下書き補助 (PR #817)
- 内容:
  - **エラー表示バグ修正**: `apiError()` は `{error: エラーコード, message: 人間向けメッセージ}` を
    返す設計だが、案件・予約ワークフロー系のフロントエンド catch 節が `message` ではなく
    `error`（コード文字列そのもの）を読んでいたため、失敗理由に関わらず `"internal_error"` 等の
    コードがそのままユーザーに表示されていた（施工担当/部品交換トグルの操作で顕在化）。
    予約一覧・案件ワークフロー配下の該当17箇所を `message` 優先に統一。同じ誤りパターンは
    アプリ全体の他画面にも広く残っている（下記 OPEN_QUESTIONS 参照）。
  - **予約一覧の整理**: 一覧カードに「案件を開く」導線が2系統（`/admin/jobs/[id]`
    への遷移リンクと、同じ内容を再実装したインラインの「ワークフロー詳細ドロワー」）
    重複していたのを解消。ドロワー（`WorkflowStepper`/`CaseTimeline` の再描画・約150行の
    関連 state/handler）を削除し、案件を開く操作は同ページへの遷移のみに一本化。
    カードの「詳細」展開は編集/取消/削除の操作パネルとして残した。
  - **予約一覧の既定表示**: 一覧クエリがページネーション無しで全件・日付昇順のみ
    だったため、古い予約が無制限に読み込まれ本日以降の予約が埋もれていた。既定で
    本日以降のみ取得するよう変更し、過去分は「過去の予約も表示」ボタンで明示的に
    読み込む方式にした。
  - **証明書発行フォーム**: コーティング剤セクションに、部品/液剤の納品書を撮影→
    AI Vision（Claude, `deliveryNoteOcr.ts` 既存実装を流用）で品名・品番を読み取り
    下書き行として追加する機能を新設（`POST /api/admin/certificates/delivery-note-extract`、
    何も永続化しない下書き補助のみ）。品番フィールドを新設し、製品名もマスター未登録品
    向けに自由入力できるようにした。Standardプラン以上（既存 `ai_draft` ゲート）。
  - **作業中の撮影導線**: 完了後だと証跡を残しづらい作業もあるため、案件ワークフロー画面の
    「作業中」ステータスに撮影を促すバナーを追加。証明書発行フォームへ `stage=in_progress`
    付きで遷移し、下書き保存すれば途中の証跡を残せるようにした（写真アップロードAPI側に
    以前から存在した `stage` タグをUIから初めて配線）。
  - 予約カードの時刻表示から装飾的な時計絵文字🕐を削除。
- 対象: 管理画面 `/admin/reservations`（予約管理）・`/admin/jobs/[id]`（案件ワークフロー）・
  `/admin/certificates/new`（証明書発行）。全業種共通。

## 2026-07-22 HPコンテンツの予約投稿（scheduled）＋令和の虎記事を放送5分前に自動公開 (PR #811 / 修正 #813・#815)
- 内容: `site_content_posts.status` に `scheduled`（予約）を追加。予約 = `status='scheduled'` ＋
  `published_at=未来時刻` として保存し、`/api/cron/publish-scheduled`（vercel.json で 5分おき起動）が
  公開日時を過ぎた予約を `published` へ自動昇格する。公開読み取りの RLS は `status='published'` のみ許可
  のため、昇格まで予約記事は非公開のまま（管理者は編集可）。純関数 `publishScheduledPosts()` は昇格後に
  記事種別のパスを revalidate。CMS フォームは status に「予約」を追加し、予約選択時は公開日時必須（zod
  superRefine）。
- 対象: 管理画面 `/admin/site-content`（HPコンテンツ管理）＋公開側 `/news`。全業種。
- 運用への適用: 令和の虎 出演記事（slug `2026-07-25-reiwa-no-tora`、CTA=/poc・/contact/insurers、OGP設定済み）を
  本番CMSで `scheduled` にし `published_at=2026-07-25T09:55:00Z`（＝7/25 18:55 JST、放送19:00の5分前）へ設定。
  cron が当日18:55 JST 前後に自動公開する。MDX版（`src/content/news/2026-07-25-reiwa-no-tora.mdx`, draft:true）は
  本番では非表示、公開後は同slugでDB版が優先されるため二重公開なし。
- 補足（マイグレーション詰まりの解消）: 予約用の status 制約張り替えマイグレーションが本番 db-migrate で連続失敗して
  いた。真因は #808(cta_og) と #810(gcal) が同一 version `20260721110000` で衝突し、gcal は本番へ別 version
  `20260722025744` として out-of-band 適用されていたドリフト。ローカルの scheduled 用を `20260722030000` へ、gcal を
  本番記録に一致する `20260722025744` へ改名（forward 解消）し、db push を復旧。制約は
  `('draft','scheduled','published','archived')` に更新済み。

## 2026-07-22 polygon-signer cron の秘密鍵形式エラーを堅牢化（0x補完＋不正時skip）
- 内容: 残高監視 cron `polygon-signer` が `POLYGON_PRIVATE_KEY` の形式不備（`0x` 無し・空白等）で
  viem `privateKeyToAccount` の "invalid private key" を毎時投げ、failure streak が 510超に膨れていた。
  共有関数 `getPolygonAccount` に純関数 `normalizePolygonPrivateKey`（`0x` 補完・trim・小文字化・64hex 検証）を
  通す実装を追加し、monitor/anchor 双方の「0x 無しで貼った鍵」等を吸収。monitor cron は鍵が正規化不能なら
  error ではなく **skip** を返し（失敗記録を積まない）、anchor 側は明示エラーメッセージにした。正規化の
  純関数テスト2件を追加。※ 鍵の**値自体**が誤り/未設定の場合は env 設定（ユーザー対応）が別途必要。
- 対象: `/api/cron/polygon-signer`（残高監視）・Polygon アンカリング署名（`polygonBatch`）。全業種（アンカリング利用時）。

## 2026-07-22 Googleカレンダー: 複数カレンダー同期＋「予定あり(非公開)」モード
- 内容: これまで gcal 連携は1カレンダーだけ（読み取り＝ブロック確認も書き込み＝予約作成も同一）だった。
  「個人カレンダーも時間は押さえたいが私用の予定名は Ledra に出したくない」要望に対応し、追加の読み取り
  カレンダーとモードを持たせた。`tenants.gcal_read_calendars`(jsonb=`[{id,mode}]`) を新設。mode=full は予定名も
  取り込み、mode=busy は時間だけ「予定あり」ブロックとして押さえ予定名・内容は保存しない（純関数
  `desiredReservationFields` でマスキング／終日予定はブロック対象外）。pull を複数カレンダーでループする実装に
  refactor（`pullOneCalendar`、1カレンダーの失敗は他に波及させない）。`reservations.gcal_calendar_id` で由来を
  記録し、カレンダーを外す/書き込み先を替えると、その未来の取り込みブロックだけ掃除。書き込み先(メイン)は従来
  どおり単一。管理UI（予約管理の gcal 設定）を「予約の書き込み先」＋カレンダー別モード選択（使わない/内容も同期/
  予定あり(非公開)）に更新。純関数テスト6件（`multiCalendar.test.ts`）。migration `20260721110000`（本番先行適用済み）。
- 対象: 管理画面 `/admin/reservations` の Googleカレンダー連携設定・定期/手動同期。全業種（連携テナント）。

## 2026-07-21 令和の虎「収録後のアップデート」を全ページ最上部の期間限定バーで訴求 (PR #807)
- 内容: 収録済み放送（7/25 19:00 公開）に合わせ、「番組で見た Ledra」と「公開当日の Ledra」のギャップを
  全訪問者へ訴求する期間限定バーを追加。表示期間 **2026-07-25 19:00〜08-08 23:59 (JST)**。`PromoBannerClient`
  が表示可否（期間 or `?preview_promo=1` プレビュー）と「閉じる」（セッション中再表示なし）をクライアントで
  判定（サーバ判定＋クエリ/cookie 参照は ISR を壊すため）。マーケ全ページ最上部にマウント。リンクに
  `utm_source=promo-banner` を付け #804 の first-touch 帰属で「バナー経由」を分離計測。あわせて令和の虎記事に
  「収録後も、Ledra は進化を続けています」節（LINE見積り／現場DX／予約・取引先連携／指名BtoB請求／証明書AI
  下書き＝実在アップデートのみ）を追加。割り込みモーダル/全体リダイレクトは SEO・モバイル・導線を損なうため
  不採用（DECISION_LOG 参照）。プレビュー抜け道は #808 で追加。
- 検証: `promo` 単体テスト9件（期間境界＋プレビュー）・`next build` 成功・tsc/eslint 緑。
- 対象: 公開マーケサイト全ページ（最上部バー・期間限定）／令和の虎お知らせ記事。全業種（HP）。
- 要対応（人手）: 7/25 19:00 に令和の虎記事を公開（draft のままだとバナーのリンクが 404）。

## 2026-07-21 令和の虎(/tora)経由の問い合わせを first-touch UTM でサーバ側帰属（proxy cookie） (PR #804)
- 内容: `/tora` バニティ着地（`/news?utm_source=tora`）の utm が、CTA で `/poc`・`/contact/insurers` へ遷移すると
  URL から消え、放送経由の問い合わせが `utm_source` 無印になっていた。既存 proxy（`src/proxy.ts`、Next 16 の
  middleware 規約）に first-touch UTM 捕捉を統合し、着地リクエストで utm を初回のみセッション cookie（`ledra_utm`）へ
  **サーバ側で保存**。`LeadForm` は送信時に `readUtm`（URL 優先→cookie）で読む。クライアント JS のハイドレートに
  依存しないため、ハイドレ前に CTA をタップしても取りこぼさない（Codex レビュー P2 対応）。判定は純関数
  `utmToPersist` に分離、utm 値は 120字上限で防御。単体テスト9件。あわせて事業ログ（news 種別の本番適用確認・
  db-typegen シークレット未設定）も確定。
- 対象: 公開サイトのリードフォーム全般（`/poc`・`/contact/insurers` ほか）／全公開ページ（proxy）。全業種（HP）。

## 2026-07-21 予約設定「保存すると初期に戻る」不具合を修正
- 内容: 外部予約受付設定（受付時間スロット/定休日）で、一括生成・グリッド塗り・一覧編集をしても
  「保存する」を押すと編集前の状態に戻る不具合を修正。原因は保存ボタンが PageHeader→PageBar へ publish
  される際、PageBar が `actions` を初回 publish 時のスナップショットとして保持し slots 変更で再 publish
  しない（無限ループ防止の意図的設計）ため、バー上の保存ボタンの `onClick` がロード直後の `handleSave`
  （初期 slots を束縛）に固定されていたこと。`handleSave` が最新 state を `ref` 経由で読むようにして、
  固定クロージャからでも保存ペイロードへ最新の編集を載せる。あわせて保存失敗時にサーバのエラー内容を
  トーストへ表示（従来は "保存に失敗しました" 固定で原因が見えなかった）。PageBar 実物を載せた回帰
  テスト2本を追加（修正前は落ちることを確認済み）。
- 対象: 管理画面 `/admin/booking-settings`（外部予約受付設定）。全業種。

## 2026-07-21 お知らせ(/news)を「HPコンテンツ管理」からブラウザ公開できるように（CMSに「お知らせ」種別を追加）
- 内容: これまで `/news`（お知らせ）は MDX ファイル専用でデプロイしないと公開できなかった。CMS
  (`site_content_posts`) に種別 `news`（お知らせ）を追加し、`/news` 一覧・詳細・トップの `NewsTeaser`・
  sitemap を `/blog` と同じ「MDX + DB マージ（同一 slug は DB 優先）」方式に変更。以後、管理画面
  「HPコンテンツ管理」から お知らせ を作成・**公開/下書き切替**でき、デプロイ不要。公開/下書き変更時に
  `/news` とトップを revalidate。DB の `type` CHECK 制約を `NOT VALID`+`VALIDATE` で拡張。マージ処理は
  純関数 `mergeContentItems` に集約し単体テスト。
- 対象: 運営の HPコンテンツ管理（お知らせ）／公開サイト `/news`・トップページ。全業種（HP）。
- 本番適用確認: マージ時のマイグレーション自動適用 `db-migrate`（commit b4dbc1c7）が success。
  `site_content_posts_type_check` が `('blog','news','event','webinar')` へ拡張済み＝お知らせ種別は
  本番で有効。以後 HPコンテンツ管理から お知らせ を作成・公開可能。

## 2026-07-21 本番ビルド破綻を修正: reflect-metadata polyfill 追加（tsyringe / @peculiar/x509）
- 内容: `next build` の page-data 収集が `tsyringe requires a reflect polyfill` で失敗し、**本番デプロイ・
  Vercel プレビュー・lighthouse が全滅**していた。原因は `@peculiar/x509`(→`tsyringe`) が要求する
  `reflect-metadata` がどこからも import されていなかったこと（WebAuthn `@simplewebauthn/server` v13 と
  証明書署名 c2pa/jpki/appAttest の両方が x509 を使う）。`reflect-metadata` を直接依存に追加し、x509/
  simplewebauthn を直接 import する7ファイル（webauthn ルート4＋anchoring/jpki lib3）の先頭で
  `import "reflect-metadata"` を読むようにした（ESM の記述順評価で x509 より前に polyfill が効く。
  instrumentation の register はビルドの page-data 収集では走らないため import グラフ内に置くのが確実）。
- 対象: ビルド/デプロイ基盤（全ルート）。WebAuthn・施工証明書PDF・アンカリング。
- 検証: reflect-metadata 無し→x509 ロードで throw を再現、有り→正常ロードを node で実証。tsc/eslint 緑。
  フルビルドはローカル(c2pa ネイティブ未導入)で完走不可のため最終確認は CI。

## 2026-07-21 未連携LINEユーザーへの連携案内を後ろ倒し（既定2→4通目・env可変） (PR #792)
- 内容: 未連携LINEユーザーへの【LINE連携のお願い】自動返信を、受信2通目→4通目に後ろ倒し
  (`LINE_LINK_PROMPT_AFTER_INBOUND` 既定 2→4)。友だち追加直後（初っ端）の要求で離脱するのを防ぐ。文面は変更なし。
  `.env.example` に `LINE_LINK_PROMPT_AFTER_INBOUND` / `LINE_LINK_PROMPT_COOLDOWN_DAYS` を明記し現場調整可能に。
  `buildLineLinkPrompt` のゲート（閾値/クールダウン/紐付け済み）に回帰テストを追加。
- 対象: LINE 公式アカウント連携（opt-in テナントのみ動作・既定 OFF）。全業種。

## 2026-07-20 本番マイグレーション詰まりの復旧（certificate_versions の孤立旧テーブル是正）
- 内容: 本番の自動マイグレーション（`db-migrate`）が `20260719000001_certificate_versions.sql` で
  停止し、#781 以降の未適用分（#783 の4本＋終日予約 `20260720000004`）が全てブロックされていた
  障害を復旧。本番に旧スキーマの孤立テーブル `certificate_versions(…, snapshot_json)` が存在し
  `create table if not exists` がスキップ→`tenant_id` インデックス作成で失敗していた。当該マイグレーション
  に「tenant_id を欠く場合のみ・0行を確認して作り直す（データがあれば中断）」ドリフト是正ブロックを前置し、
  `create policy` も `drop policy if exists` で再実行可能化。
  **実施（2026-07-20）**: 終日予約コードが本番デプロイ済みなのに `all_day` 列が無く「予約保存が全滅」する本番障害
  が出たため、詰まっていた6本（certificate_versions 是正 → #783 の4本 → 終日予約 `20260720000004`）を Supabase MCP で
  **本番へ直接適用**し `schema_migrations` に記録。予約の INSERT→読み戻し・overlap RPC を実測し保存復旧を確認。
  #783 の CONCURRENTLY 索引2本は小テーブルのため非CONCURRENTLYで同一の最終形を作成。
- 対象: DB マイグレーション基盤（本番適用の復旧）。証明書バージョニング（#781）・指名BtoB請求（#783）・
  終日予約（#784）の各マイグレーションがこの復旧で本番適用済みになった。

## 2026-07-21 Googleカレンダー定期同期(cron)を追加
- 内容: gcal 同期はこれまで push(予約変更時のイベント駆動)＋手動 pull のみで定期実行が無かったため、
  新 cron `/api/cron/gcal-sync` を追加。連携有効テナント(gcal_sync_enabled かつ refresh token あり)を対象に、
  JST「7日前〜60日先」の窓で push＋pull を双方向同期し `gcal_last_synced_at` を更新。`vercel.json` に 15分毎
  (`*/15 * * * *`)で登録。個別テナント失敗は他に波及せず(ベストエフォート)・55秒タイムアウトガード・失敗ストリーク
  記録つき(既存cron作法)。同期期間の算出は純関数 `computeSyncWindow`(単体3件)。既存の push/pull/cron 認証関数を再利用。
- 対象: Googleカレンダー連携(全業種共通・連携有効テナントのみ)。
- 補足: 本番実績では有効テナント2/12・直近同期が11日前だったため、GCal 発の変更取り込みと push 取りこぼしの自己修復を
  定期化。将来 Google Push 通知(即時)へ上げる余地あり(現状ポーリングで許容)。

## 2026-07-20 公開予約フローを仮押さえ対応に（Phase 2 fast-follow） (PR #794)
- 内容: 一般客向け公開予約（`/api/external/booking`・`/api/customer/booking`）の容量/空き判定に、取引先の有効な
  仮押さえ(`reservation_holds`)を占有として加算。指名で押さえた枠に一般客予約が入る（限定的オーバーセル）のを解消。
  - 両 POST の時間枠容量チェックに有効hold件数を合算（`(予約+hold) >= max_bookings` で満席）。
  - `customer/booking` の終日予約は当日に有効hold があれば拒否（併存不可）。
  - `external/booking` GET の空き表示も有効holdを占有として減算、終日可否も hold を考慮。
  - 有効hold = `status='pending' かつ expires_at > now`（空き計算・claim と同判定、失効は自己修復）。
- 対象: 一般客向け公開予約（Web フォーム・API・LINE）。全業種共通。Phase 2 の既知の限界を解消。

## 2026-07-20 取引先の空き確認＋枠の仮押さえ→承認で本予約（Phase 2） (PR #785)
- 内容: 指名発注フローに「相手店舗の空きを見て枠を仮押さえ→相手の受注承認で本予約化」を追加（電話レス）。
  - 許可制ゲート: Phase 1 の `customers.linked_tenant_id`（B が A を取引先登録＝同意）を再利用。
    `customers.share_availability`(既定true, kill-switch) を追加。
  - 仮押さえ: 新 `reservation_holds` テーブル＋`claim_reservation_hold` 関数（`pg_advisory_xact_lock` で
    (対象,日,枠)を直列化し、占有=予約(all_day含む)+有効holdを数えて空きがあれば INSERT＝二重押さえ防止）。
  - 空き参照: 新 `GET /api/admin/partners/availability`（取引先ゲート＋`proposeCandidates` 再利用、有効holdを
    占有として合算）。発注フォームに空き枠ピッカーを追加、送信時に枠押さえ（埋まっていれば409で再選択）。
  - 受注承認→本予約: `orders` PUT の pending→accepted(isTo) で hold を accepted 化し B のカレンダーに
    `reservations`(confirmed) を作成、`job_orders.reservation_id` を張る（三重ガードで冪等）。却下/取消で解放。
  - 失効: 毎時 cron `/api/cron/reservation-holds-expire`（自己修復のため状態揃えのみ）。
- 対象: 受発注(`/admin/orders`)・予約(`reservations`)。取引先連携のある店舗向け。
- 既知の限界: 一般客向け公開予約(`external/booking`)は hold を数えないため、押さえ枠に一般客予約が入り得る
  （承認変換は hold を必ず尊重）。解消は fast-follow（OPEN_QUESTIONS 参照）。

## 2026-07-20 指名BtoB請求（手数料0・請求書払い・支払サイクル自動生成・確認後送付） (PR #783)
- 内容: Ledra 加盟店同士の受発注(`job_orders`)のうち「指名」依頼を、公開案件(手数料10%+Stripe送金)
  と分けて請求できるようにした。
  - `job_orders.billing_method`(platform/invoice)を追加し、発注作成時に `to_tenant_id` 指定＝指名なら
    `invoice`＋`platform_fee_rate=0` を確定（公開案件は従来どおり platform）。
  - 指名は Stripe Connect 自動送金をスキップ（両店が請求書で直接精算）。
  - 受発注の請求書を `documents` 帳票として保存（`sendOrderInvoiceEmail` を「ensure＋公開のみメール」に
    作り替え）。両者が受発注詳細で PDF 閲覧・DL 可能（新 `GET /api/admin/orders/[id]/invoice-pdf`、当事者認可）。
    発行元は `/admin/invoices` にも表示。
  - 支払サイクル: `customers` に `closing_day`(締め日)・`payment_terms_days`(支払サイト)・`linked_tenant_id`
    (取引先テナント紐付け)を追加し顧客管理UIから設定可能に。合算・締め払い顧客は、締め日に合算請求書
    (`consolidated_invoice`)を**下書き**で自動生成する日次 cron `runCycleInvoices`（`/api/cron/cycle-invoices`）を追加。
  - 確認後送付: 指名の請求書は必ず下書きで生成し、発行元が既存の `documents/share` で送付する（自動送信しない）。
  - 入金連動: 双方支払確認で紐づく請求書を `paid` にし売掛元帳(`payment_entries`)へ記帳（`markOrderInvoicePaid`、
    `recordInvoicePaymentBalance` 再利用・冪等）。
- 対象: 受発注(`/admin/orders`)・顧客管理(`/admin/customers`)・請求/帳票(`documents`)。BtoB 指名取引の店舗向け。
- 補足: 「他店の空き確認＋枠押さえ」は規模が大きいため別PR(Phase 2)に分離（OPEN_QUESTIONS 参照）。

## 2026-07-20 終日予約（1日お預かり）に対応
- 内容: 予約に「終日」を追加。`reservations.all_day` 列を新設し、終日予約は時刻NULLで保存。
  `check_reservation_overlap` RPC を更新して終日予約が当日を丸ごと占有（時間枠予約・終日どうしとも
  ダブルブッキング検知）するようにした。空き状況・日程候補は終日占有を数える共通純粋関数
  `reservationBlocksSlot`（`src/lib/booking/slots.ts`）に集約。顧客Web予約ページ
  `customer/[tenant]/booking` に「終日（1日お預かり）」ボタンを追加（当日に既存予約が無い日のみ提示）、
  管理画面 `admin/reservations` の作成フォームに「終日」チェックボックスと一覧/カレンダー/店頭表示への
  「終日」ラベルを追加。gcal 同期は既存の「時刻NULL=終日イベント」処理をそのまま利用。
- 対象: 顧客向け公開予約ページ・管理画面の予約作成/一覧/カレンダー・空き状況/候補提案API（全業種共通）。

## 2026-07-19 公開予約カレンダー（週表示）の空き「○」左ズレを修正
- 内容: 顧客共有用の予約ページ `customer/[tenant]/booking` の週グリッドで、空き枠の
  「○」だけが `flex`（block-level flex）の `<button>` に包まれ、幅が内容サイズに縮んで
  セル左端に寄っていた（×/– は素の span で td の `text-center` により中央のため、○のみ
  左にずれて見えた）。`inline-flex` に変更し `text-center` を効かせて中央寄せに統一。
  月表示はセル全体が `items-center` の flex ボタンで○が中央のため影響なし。
- 対象: 個人客向け公開予約カレンダー（週表示）の見た目のみ。挙動・データ変更なし。
- 内容: `conversationFlowPostback.ts` の `handleSlotSelected`（LINE会話フローでお客様が
  日程を選び予約が確定する箇所）で、勘定科目提案・ワークフロー提案・Googleカレンダー同期の
  3件が `void`／`.catch` の撃ちっぱなしで発火されており、LINE webhook の `after()`（レスポンス
  送出後）内では外側コールバックが先に解決して serverless に無言で打ち切られ得た（PR #761 で
  直した「レスポンス後に処理が打ち切られる」のと同じクラス）。3件を `await Promise.all` に変更し
  完走を保証。after() 内なのでお客様への 200 応答は遅れない。各処理はエラーを内包（`maybeAuto*`は
  内部try/catch、gcalは`.catch`）するため1件の失敗が他や予約確定を壊さない。回帰テスト1件追加
  （撃ちっぱなしだと落ち、await完走なら通る）。
- 対象: LINE会話フローの予約枠確定（全業種共通、opt-inの自動提案／カレンダー連携）。挙動の
  ユーザー可視な変化なし（取りこぼしていた背景処理が確実に走るようになる内部修正）。

## 2026-07-19 DBマイグレーションの本番自動適用(GitHub Actions)を追加
- 内容: `.github/workflows/db-migrate.yml` を追加。main へ `supabase/migrations/**` の変更が
  入ったら `supabase db push` で未適用マイグレーションを本番へ自動適用(手動実行も可、
  concurrencyで直列化)。これまで手動だったDB適用を「マージ=適用」に。
- 対象: CI/CD(DBマイグレーション)。
- 要対応: GitHub Secret `SUPABASE_DB_PASSWORD`(本番DBパスワード)の新規登録が必要
  (`SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_ID`は既存)。未登録だと初回ジョブが失敗する。

## 2026-07-19 車種サイズマスタの一括CSVインポータ(運営専用)を追加
- 内容: `vehicle_size_master` に車種をCSVで一括登録・更新できる運営専用機能を追加。
  グローバル共有データのため、書き込みは platform admin (`isPlatformAdmin` +
  `createPlatformScopedAdmin`) のみに限定。API `POST /api/admin/platform/vehicle-size-master`
  (CSVパース→size_classを寸法から自動決定→(maker,model)でupsert、500件ずつ分割)、
  純関数 `parseVehicleMasterCsv`(`src/lib/vehicles/vehicleMasterImport.ts`、単体8件)、
  運営ページ `/admin/platform/vehicle-size-master`(CSV貼付/ファイル/結果表示)、サイドバー
  「本社・運営」に導線を追加。これで手打ちに頼らず、正規ライセンス諸元データや自前の
  車種リストを青天井で投入できる(size_classは既存の calcSizeClass で自動)。
- 対象: 運営(platform admin)。車種サイズマスタ。

## 2026-07-18 車種マスタにアメ車+国産絶版車を追加 + 決定的パーサをマスタ参照化
- 内容: 全車種マスタ `vehicle_size_master`(既存・全テナント共有、寸法→体積でサイズ区分
  SS〜XLを自動決定)を拡充。(1)抜けていたアメリカ車(フォード/シボレー/キャデラック/GMC/
  ダッジ/RAM/クライスラー/リンカーン/ハマー + テスラ/ジープの車種)33車種。(2)国産の
  絶版車・旧車・軽トラ/軽バン・商用など(マークX/マークII/ヴィッツ/bB/エスティマ/
  プロボックス/シルビア/RX-7/S2000/パジェロ/ハイエース系/軽トラ各種 等)約136車種。
  いずれも代表寸法だけを入れ、size_classは既存の体積計算式で自動決定(size_classは手で
  決めず寸法から導出=事実由来)。本番の関数で寸法→区分を検算済み(書き込みなし)。
  国産の登録は193→約329車種に拡大。あわせて決定的車種パーサ(`deterministicServiceVehicle`)
  を、固定辞書に加えて `vehicle_size_master` の語彙も引くように配線し(`inboundAuto`)、
  マスタに車種を足せばLINE車種認識も自動で広がる形にした(前回レビューで指摘された辞書の
  二重管理を解消)。複数一致時は最長=最も具体的な車種を採用。数値/短英数字の誤爆語彙は除外。
- 対象: 車種サイズマスタ、LINE車種認識・概算見積り。全業種共通。
- 補足: カーセンサー/グーネット等の外部サイトのスクレイピングは規約・法的リスクのため不採用。
  完全な全車種は正規のライセンス諸元データ取り込み + 車検証OCRでの継続更新で埋める方針
  (DECISION_LOG / OPEN_QUESTIONS 参照)。

## 2026-07-18 LINE抽出の取りこぼしを決定的キーワードフォールバックで補完
- 内容: LINE受信の車種・施工内容のAI抽出(`inboundReservationExtract`)が、同形式の
  メッセージでも埋めたり埋めなかったりと不安定(本番実績で6件中2件しか埋まらず、
  「トヨタ ハイエース 2026年式 ボディコーティング…」のような明示的な文でも失敗)で、
  空だと概算見積り等の自動応答がすべて沈黙していた問題を解消。AI抽出が空のときだけ、
  車メーカー/主要車種名と施工内容の固定辞書でキーワード補完する純関数
  `deterministicServiceVehicle`(`src/lib/ai/deterministicInboundParse.ts`)を追加し、
  `inboundAuto` の抽出直後に適用(AIが埋めた値は上書きしない安全設計)。単体10件+統合2件のテスト付き。
- 対象: LINE自動応答全般(概算見積り・会話フロー・予約起票が抽出結果に依存するため横断的に改善)。

## 2026-07-18 LINE概算見積りに品目マスタ (menu_items) を接続
- 内容: 概算見積り自動返信 (`quoteReplyAuto.ts`) が過去請求実績のみを参照し、品目
  マスタ (`/admin/menu-items`) を一切参照していなかった不具合を解消。施工内容
  (service) と品目のカテゴリ (`category_large`) が一致する品目があれば、その登録
  単価を過去請求からの推測より優先して概算の土台にする。一致が無ければ従来どおり
  過去請求ベースにフォールバックする (実害の無い変更)。会話フローのオプション提案
  (`fetchAddonRecommendations`) で既に使われている「登録メニュー優先・実績は
  フォールバック」パターンを踏襲。単体テスト2件追加。
- 対象: LINE概算見積り自動返信 (`quote.auto_reply_rough_estimate`)。

## 2026-07-18 LINE概算見積りが実行されない不具合をAIプロンプト是正で修正
- 内容: 「概算見積りを送ってほしいのにヒアリングが先に来る」報告を、HOLY AUTOテナントの
  実会話・監査ログをDBで確認して調査。原因は2つ: (a) 抽出AI (`inboundReservationExtract.ts`)
  が「[車種]の[施工]見積りが欲しい」構文で車種・施工内容の抽出に毎回失敗していた
  (has_service/has_vehicle ともに false)。(b) ナレッジ回答AI (`knowledgeReply.ts`) が、
  登録ナレッジに無関係な内容の車両見積り依頼に can_answer=true と誤判定し、「スタッフより
  連絡します」という当たり障りない返信で概算見積りをブロックしていた。両プロンプトへ
  ルール・例を追加して是正 (コード分岐・実行順序は変更なし)。
- 対象: LINE自動応答 (概算見積り自動返信・店舗ナレッジ自動返信)。全業種共通。

## 2026-07-17 工程ガイドUIを共有コンポーネント化（StepGuidePanel）

- 内容: 第1弾/第2弾で `WorkflowStepper`（予約詳細）と `JobStatusPanel`（案件画面）に重複
  していた工程ガイド（写真ガイド／確認チェックリスト）の表示を、表示専用の共有コンポーネント
  `src/components/workflow/StepGuidePanel.tsx` に一本化。判定は既存の純関数 `computeStepGuideState`、
  チェック状態は各呼び出し側が保持し、本コンポーネントは描画のみ。**挙動は不変（内部リファクタ）**。
  差分は正味 −18 行で、以後ガイドUIの変更は1箇所で済む。第1弾のコードレビュー指摘1（重複）を解消。
- 対象: 予約詳細ステッパー・案件画面の進行パネル（UI/挙動の変更なし）。

## 2026-07-17 現場DX残り3機能: 請求書OCR / 前後写真自動分類 / 傷ダメージマップ (field-dx-remaining)
- ③ 請求書OCR: 仕入先/外注請求書の写真を Vision OCR し帳票明細へ下書き取込。
  `deliveryNoteOcr` を雛形に `invoiceOcr`（スキーマ＋純関数 `toDocumentItems`, テスト6件）、
  `/api/admin/documents/ocr`、`DocumentForm` に `InvoiceOcrButton`（カメラ直行）を追加。
  金額の確定・送付は人（壁3）。
- ① 施工写真の before/after 自動分類（opt-in `photo.auto_classify_stage`, 既定OFF）:
  未タグ(stage=unspecified)写真を Vision で分類し `certificates.meta.stage_suggestions` に
  提案保存。`photoTamperingAuto` 同型、分類器は純関数の選定/マッピング（テスト6件）。
  stage 確定・発行ゲートには不介入（提案のみ）。uploadHandler の after() で順次実行。
- ② 傷・損傷ダメージマップ: 証明書フォーム（板金）に車両展開図をタップして傷位置を置く
  `DamageMapSection`。座標は 0..1 正規化で `certificates.damage_map_json`（新マイグレーション）
  へ保存。検証・直列化は純関数 `damageMap.ts`（テスト10件）。actions/createCertificateApi の
  round-trip（オフライン同期）も対応。
- 対象: 帳票フォーム、証明書写真アップロード、証明書作成フォーム（板金）、AI自動化設定。

## 2026-07-17 証明書AI下書きの取りこぼし解消（施工箇所・使用材料・保証候補も適用）
- 内容: 証明書作成フォームの「AI下書き生成」(`AiDraftPanel`) と音声メモが、適用時に
  title/description/cautions しか施工内容へ流し込まず、AI が生成・表示していた施工箇所
  (workAreas)・使用材料 (materials)・保証候補 (warrantyCandidates) を破棄していた問題を解消。
  適用ロジックを純関数 `composeAiDraftContent`（`src/lib/certificates/`, テスト5件）に集約し、
  空セクションは見出しごと省く・重複や空値は除去したうえで、施工内容フリーテキスト
  (`content_free_text`) へ見出し付きでまとめる。値は下書きで確定前に人が編集できる。
- 対象: 証明書作成フォーム (`/admin/certificates/new` の `CertNewFormWrapper` / `AiDraftPanel` /
  `VoiceMemoPanel`)。構造化フィールド(coating_products_json 等)への流し込みは施工種別依存の
  ため別スコープ。

## 2026-07-17 工程ガイドを案件画面（JobStatusPanel）にも展開（第2弾）

- 内容: 第1弾（PR #764）で `WorkflowStepper`（予約詳細）に出した工程ごとの写真ガイド／
  確認チェックリストを、案件画面 `/admin/jobs/[id]` の進行ボタン（`JobStatusPanel`）にも
  表示。進行中の工程の「撮る写真」「確認項目」をガイド表示し、未確認のまま進めようと
  すると一度だけソフト警告（二度目のタップで必ず進める＝進行不能にしない）。判定は
  既存の純関数 `src/lib/workflow/stepChecklist.ts`（`computeStepGuideState`）を再利用、
  マイグレーション・新規APIなし。第1弾のコードレビュー指摘2（案件画面未対応）を解消。
- 対象: 案件ワークフロー画面（`/admin/jobs/[id]` の `JobStatusPanel`）。全業種共通。
  共有型 `WorkflowStep`（`src/app/admin/jobs/[id]/types.ts`）に任意の
  `required_photos`/`checklist` を追加（後方互換）。

## 2026-07-17 工程ごとの写真ガイド／確認チェックリスト（撮り忘れ・確認漏れ防止）

- 内容: ワークフローテンプレの各ステップに「この工程で撮る写真」「確認する項目」を
  任意で宣言できるようにした（`workflow_templates.steps[]` は JSONB のためマイグレーション
  不要・後方互換）。ベテランがテンプレエディタ (`WorkflowTemplateEditor`) で工程ごとに
  1行1項目で登録すると、作業者のステッパー (`WorkflowStepper`) に写真ガイド／チェック
  リストとして表示され、タップで確認済みにできる。未確認のまま進めようとすると一度だけ
  「このまま進める？」のソフト警告を出す（思想「強制停止は最小限」に従い、二度目のタップで
  必ず進めるため、進行不能バグを起こさない）。判定は IO を持たない純関数
  `src/lib/workflow/stepChecklist.ts`（`computeStepGuideState` 等）に集約し単体テスト付き。
- 対象: 予約/案件ワークフロー（`/admin/reservations` 詳細のステッパー、`/admin/workflow-templates`
  テンプレ編集）。全業種共通。バンドルB「工程ゲート統一」の第1弾（アイデア6/7/25の土台）。

## 2026-07-16 現場DX フロントUI: 点検OCR取込ボタン + AI担当提案ワンタップ割当 (repair-workflow-ai 続き)

- 内容:
  - 点検フォーム (`InspectionRecordForm`) に「走行距離を撮影 / タイヤ残溝を撮影」
    ボタンを追加 (`InspectionOcrIntake`)。撮影→OCR (`/api/admin/inspection-records/ocr`)
    →ラベル一致する numeric 項目へ流し込み、所見 (残溝/スリップサイン/交換目安/劣化)
    は特記事項へ追記。対応項目が無くても取りこぼさず notes に残す。証明書フォームの
    「膜厚計から取り込み」と同じカメラ直行パターン。流し込み先の判定は純関数
    `ocrIntake.ts`（テスト7件）。確定=保存は人。
  - 案件詳細 (`/admin/jobs/[id]` の `JobStatusPanel`) の施工担当ピッカーに、未割当時のみ
    AI 担当提案 (`reservations.ai_assignee_suggestion`) の最有力候補を
    「🤖 AI提案: {名前} を割当」ワンタップボタンで表示。自動割当はせず確定は人。
- 対象: 点検入力フォーム、案件詳細の施工担当アサイン。
- 補足: バックエンド (OCR API / 担当提案保存) は PR #763 で実装済み。本変更でUIを接続。

## 2026-07-16 現場DX: 点検写真OCR + 担当メカニック自動提案 (PR #763)

- 内容:
  - 点検写真OCR (`/api/admin/inspection-records/ocr`): 走行距離メーター/タイヤ
    残溝の写真を Anthropic Vision で読み取り、点検表フォームへ自動入力する数値を
    返す。身分証OCR (`identityOcr.ts`) と同型の二段構え（Sonnet→低信頼のみ
    Opus昇格）。DB非永続、確定=保存は人。タイヤは残溝/スリップサインから交換
    要否の目安（次回提案の下書き）も添える。正規化・目安判定は純関数
    (`inspectionOcrSchema.ts`) に集約し単体テストで担保。
  - 担当メカニック自動提案 (`mechanic.auto_assign_suggest`, opt-in/既定OFF):
    案件登録(入庫)時に、メニューから必要スキルを推定し職人スキル
    (`staff_members.skills`) と過去の同種施工履歴で担当候補をランク付けして
    `reservations.ai_assignee_suggestion` に保存。保険案件の3段振り分け
    (`caseAssignSuggest.ts`) を整備向けに転用し、`staff/skills.ts` を再利用。
    自動割当はせず、割当確定はスタッフが1タップ（壁3不介入）。
  - LINE見積→承認→支払いは既存 opt-in アクションの合成で成立するため新規実装なし
    （判断は DECISION_LOG 2026-07-16 参照）。
- 対象: 点検記録フォーム、案件(予約)登録、AI自動化設定 (`/admin/settings/ai-automation`)。

## 2026-07-16 LINE Webhookのバックグラウンド処理をafter()で保護 (PR #761)

- 内容: 「LINEの自動返信が返ってこない」報告を調査し、Webhookハンドラが
  イベント処理 (`handleWebhookEvents`) をレスポンス確定前に素のfire-and-forget
  Promiseとして切り離していた不具合を修正。Next.jsの `after()` でラップし、
  レスポンス送信後もサーバーレス実行環境が処理完了まで生きるようにした。
  あわせて `maxDuration = 60` を設定し、OCR/LLM呼び出しチェーンが既定の
  実行時間で打ち切られないようにした。
- 対象: LINE Webhook (`/api/line/webhook`)、自動返信・自動化フロー全般。

## 2026-07 現場入力の負担軽減ブラッシュアップ (PR #759)

- 内容:
  - 点検フォーム (`InspectionRecordForm`) を格上げ。写真を base64 インライン保存から
    Supabase Storage アップロード (`/api/admin/inspection-records/images`) に置換、
    カメラ直行 (`capture="environment"`) とアルバム選択の2入力化、音声メモ (VoiceMemoPanel
    note バリアント) を所見入力に流用、テンプレ再取得を呼び出し元からの受け渡しで省略。
  - 証明書フォームの膜厚セクションに写真OCR取込を追加。膜厚計/測定シート写真から
    部位別μmを Vision OCR で抽出し編集可能な行として差し込む (`/api/admin/certificates/thickness/ocr`,
    `src/lib/ai/thicknessGaugeOcr.ts`)。部位名正規化は純関数 `mapPanelToPreset`。
  - 車検証OCR (`VehiclePickerSection`)・納品書OCR (`DeliveryNoteUpload`) の画像入力に
    `capture="environment"` を追加し、現場文書撮影のカメラ直行を横断統一。
- 対象: 点検フロー (`/admin/jobs/[id]` 点検タブ)、証明書発行フォーム、車検証/納品書OCR入力。

## 2026-07 モバイル/タブレットのUI不具合修正 (PR #754)

- 内容: サイドバースクロールと通知ドロップダウンの見切れを修正。
- 対象: モバイル/タブレット全般。

## 2026-07 予約ワークフローとメカニック稼働管理の連動 (commit a1d39c5)

- 内容: 予約ワークフローとメカニック稼働管理を連動、部品交換記録・証明書の
  LINE通知を追加。進行ボタンの完了不能バグ・GCal/AI下書き欠落・証明書誤記載を
  レビューで修正。
- 対象: 案件進行管理、LINE通知。

## 2026-07 帳票管理の強化 (PR #753, #751, #747)

- 内容: 顧客ごとの売上推移グラフ切り替え、帳票の車両情報（車種・ナンバー・
  車台番号）表示、一括送付・顧客別集計・グラフ表示を追加。
- 対象: 帳票管理画面。

## 2026-07 品目マスタの登録・編集エラー修正 (PR #749)

- 内容: 品目マスタ登録・編集時のサーバーエラーを修正。
- 対象: menu-items 管理画面。

## 2026-07 LINE会話フロー Phase 1〜3 (PR #750, #745, #746, #740, #739, #737, #734)

- 内容: 自動予約への案件登録フック、オプション提案（アップセル）、可否ゲート
  （見積り送付→OK/NG分岐）、日程調整の自動化、未登録車両の証明書分岐を段階的に実装。
- 対象: LINE経由の顧客対応フロー。

## 2026-07 その他

- SEOブログ（施工証明書ハブ+スポーク2本）追加 (commit de42c1e)
- 短尺プロダクトツアーの Remotion コンポジション追加 (commit 2e7d902)
- ホーム最終CTAコピーのA/B実験を追加 (commit d81dc63)
- マイグレーションのCHECK制約追加をNOT VALID+VALIDATEに変更 (commit 0e49489,
  詳細は DECISION_LOG.md)

## 2026-07 店舗利用状況ダッシュボード（運営専用）

- 内容: 運営が店舗ごとの利用状況を横断確認できるダッシュボードを追加。
  - 店舗別 月間: 操作回数 / 予約 / 請求 / アクティブ会員 / 最終ログイン
  - 累計件数: 予約・作業記録・請求（全期間・全店舗）
  - 機能別利用率: 当月に各機能を使った店舗の割合（予約/作業記録/請求/証明書/顧客/決済）
- 対象: `/admin/platform/store-usage`（platformOnly）。API `/api/admin/platform/store-usage`、
  集計 `src/lib/analytics/storeUsage.ts`（ユニットテスト付き）。
- 注記: ログイン「回数」は未記録のため、last_sign_in_at ベースの「アクティブ会員」で近似。

## 2026-08-07 モバイル: 複数テナント所属ユーザーのログイン修正 (PR #897)

- 内容: fetchUserProfile が tenant_memberships を .single() で取得しており、2件以上の
  membership を持つユーザー（自店オーナーが他店に staff 招待された等）でログイン不可
  （「テナント情報が見つかりません」）だった不具合を修正。Web の checkRole.ts と同じく
  created_at 昇順 + limit(1) + maybeSingle() で最古の1件を採用するよう統一。
- 対象: apps/mobile/src/lib/auth.ts。
- 注記: モバイルは1ユーザー=1テナント前提のUX（select-store はテナント内の店舗選択のみ）。
  将来のマルチテナント対応は select-store 拡張が上限（ponytail コメントで明記）。

## 2026-08-09 モバイル: 証明書写真を WEB 真正性パイプラインへ統一（カメラ限定・後からDL）

- 内容: モバイルの証明書写真キャプチャを WEB と同一の真正性パイプライン
  （/api/mobile/certificates/images/upload → uploadHandler：ハッシュ・GPS/EXIF除去・
  TSA封印・撮影nonce消費・段階タグ・グレード判定）経由に統一。
  - カメラ限定（ライブラリ選択を撤去＝強制起動）。撮影は端末に保存せずDBのみに保存。
  - 段階セレクタ（施工前 intake_before / 作業中 in_progress / 施工後 after）を付与。
  - 撮影セッションごとに capture-nonce（/api/mobile/certificates/[id]/capture-nonce）を取得し、
    全写真を単一 multipart で送信（nonce はリクエストにつき1回消費のため必ずまとめて送る）。
  - 証明書詳細で正規 certificate_images を storage_path から公開URL表示（段階/グレードチップ付き）。
  - 「端末に保存」ボタンで後から明示DL（expo-media-library）。WEB管理は既存の署名/公開URLでDL可。
- 対象: apps/mobile/src/app/certificates/[id]/photos.tsx（新規・カメラ限定キャプチャ）、
  certificates/[id]/index.tsx（正規画像読取＋端末保存＋写真導線、[id].tsx から移動）、
  apps/mobile/src/lib/api.ts（mobileMultipart）、apps/mobile/src/lib/photoStage.ts（新規）、
  work/[id]/index.tsx（壊れた列/バケット参照を撤去し証明書束縛へ集約）、work/[id]/photos.tsx（削除）、
  src/lib/certificateImages/stage.ts（段階定数の単一化＋テスト）、uploadHandler.ts（共有定数を参照）。
  依存追加: expo-media-library ~55.0.19 / expo-file-system ~55.0.24（app.json に保存権限プラグイン）。
- 注記: バックエンドの真正性エンドポイントは既存で新設なし（未使用だったものを結線）。
  実DBで certificates.public_id は generate_public_id() 自動採番、certificate_images に
  image_url/reservation_id/caption 列は無く work-photos バケットも不在＝旧モバイル写真フローは
  現行スキーマに対して壊れていたため撤去。端末アテステーションは別フェーズ（グレードは basic 超まで）。

## 2026-08-09 モバイル: 入力進捗ステッパー（Steps）追加

- 内容: 各項目の入力・操作の進捗を可視化する汎用ステッパー（Steps インジケーター）を追加。
  完了ステップは番号→チェックに置換、現在ステップを強調、先のステップは淡色。
  connector（線）は通過済みを primary、先を outline で描画。Web では現在ステップに
  `aria-current="step"` を付与。
- 対象: `apps/mobile/src/components/Steps.tsx`（汎用UI）、
  `apps/mobile/src/lib/reservationSteps.ts`（モード別ステップ定義と現在ステップ導出の純ロジック、
  自己チェック `reservationSteps.check.ts` 付き）。
  予約作成画面 `apps/mobile/src/app/reservations/new.tsx` に組み込み、入力状態から進捗を自動導出。
- 注記: 日時はデフォルト値が常に入り「常に完了」表示になるためステップから除外（ponytail）。
  飛び込み受付は顧客・車両が任意のため「メニュー→確認」の2段に簡略化。
