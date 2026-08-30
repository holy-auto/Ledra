# 要件トレース — Ledra UI/UX & Development Specification v2.0 → 既存実装 → IMP タスク

- 監査日: 2026-08-19 / 対象コミット: `d2e4736`(branch `claude/imp-000-implementation-r0eje1`、main と同一内容)
- 要件ソース: `Ledra UI/UX & Development Specification v2.0`(2026-08-19)および `Ledra_Claude_Code_Implementation_Guide_v1.0.md`(36 タスク分解)
- 要件単位: v2.0 仕様書は個別の要件番号(AUTH-001 等)を列挙しておらず、§22.2 で接頭辞体系のみを定義している。そのため本書は **(a) 仕様セクション(§1〜§24)、(b) 正準画面 ID 18 件、(c) 製品不変条件(ガイド §1)** の3軸を要件単位とし、それぞれを IMP タスク(36 件)に対応付ける。将来 Figma/Issue 側で個別要件 ID が採番された場合は各表に列を追加して紐付けられる構造にしてある(独自採番はしない)。
- 現状アーキテクチャの詳細は [current-architecture.md](./current-architecture.md) を参照。

## 0. 凡例と表記規約

### 0.1 状態の凡例

| 状態 | 定義 |
|---|---|
| **実装済み** | v2.0 要件の意図・語彙とも概ね合致する実装が稼働している |
| **部分** | 意図の一部のみ実装(特定サーフェスのみ / 機能の一部のみ)。何が欠けるかを必ず併記 |
| **なし** | 対応する実装が存在しない |
| **別方式** | 意図に対応する機能は稼働しているが、v2.0 と異なる設計・語彙・フロー。優劣判定はせず差分のみ記載する。統一要否の判断は担当タスク側で行う |

### 0.2 語彙表記規約

1. 「既存実装」列には**実装の実値のみ**を `テーブル.カラム='値'` またはモジュールパスで書く。v2.0 の大文字コードを実装列に書かない(誤記防止)。
2. v2.0 語彙は大文字コード+`(v2.0)` 付きでのみ書く。並記は `reservations.status='cancelled' ⇔ CANCELED(v2.0)` の形式。
3. 実装に対応物がない v2.0 値は「概念なし」、v2.0 に無い実装値(例: `DocumentStatus='overdue'`)は「v2.0 対応なし」と双方向で記録する。
4. 状態=「別方式」の行は §1 語彙対応表を参照すること。

## 1. 語彙対応表(v2.0 Canonical ⇔ 実装実値)

v2.0 Appendix A の6軸と、既存実装のステータス実値(すべて text + CHECK 制約。詳細は current-architecture.md §5)の対応。

### 1.1 JobState(v2.0: 12値) ⇔ `reservations.status`(実値5) + サインオフ状態機械

既存実装では「予約(reservations) = 案件」であり(`src/app/admin/jobs/[id]/page.tsx` に明記)、作業後の確認〜証明〜決済の工程は `reservations.status` ではなく**サインオフ状態機械**(`src/lib/signoff/state.ts` の `computeSignoffState`: completion → certificate → signature → payment → anchor)が別軸で管理している(別方式)。

| v2.0 値 | 既存の対応 | 対応度 | 備考 |
|---|---|---|---|
| SCHEDULED | `reservations.status='confirmed'` | 同義 | |
| CHECKED_IN | `reservations.status='arrived'` | 同義 | |
| IN_PROGRESS | `reservations.status='in_progress'` | 同義 | |
| PAUSED | 概念なし | — | 中断・翌日持ち越しの状態が存在しない |
| WAITING_REVIEW | 概念なし(サインオフの completion→certificate 工程が近い) | 別方式 | 独立した店舗内レビュー状態はない |
| WAITING_CUSTOMER | 概念なし(サインオフの signature 工程=顧客サイン待ちが近い) | 別方式 | |
| WAITING_PAYMENT | 概念なし(サインオフの payment 工程が近い) | 別方式 | |
| CERTIFICATE_PROCESSING | 概念なし(サインオフの anchor 工程が近い) | 別方式 | |
| VERIFIED | `reservations.status='completed'` | 部分 | 実値 completed は「作業完了・納車」であり、検証済み証明の成立までは含意しない |
| CANCELED | `reservations.status='cancelled'` | 同義 | |
| NO_SHOW | 概念なし | — | |
| PARTIALLY_COMPLETED | 概念なし | — | |

別途 `job_orders.status`(BtoB 発注: `pending/accepted/in_progress/completed/rejected/cancelled`)が存在するが、これは店舗間発注の軸であり v2.0 JobState の対象(店舗内作業案件)とは別物。

### 1.2 StepState(v2.0: 8値) ⇔ `reservation_step_logs`(タイムスタンプ導出)

既存の作業ステップ(`reservation_step_logs`、`supabase/migrations/20260402000000_workflow_engine.sql`)には **status 列が存在しない**。工程状態は行とタイムスタンプの有無から導出される(3状態のみ)。

| v2.0 値 | 既存の対応 | 対応度 |
|---|---|---|
| NOT_STARTED | ログ行なし | 同義(導出) |
| READY | 概念なし | — |
| IN_PROGRESS | `started_at` のみ設定 | 同義(導出) |
| BLOCKED | 概念なし | — |
| WAITING_APPROVAL | 概念なし | — |
| COMPLETED | `completed_at` 設定 | 同義(導出) |
| SKIPPED | 概念なし | — |
| CANCELED | 概念なし | — |

### 1.3 Severity(v2.0: 5値) ⇔ 概念なし

全社横断の Severity 軸(`NORMAL/ACTION/HIGH/CRITICAL/RESOLVED`(v2.0))は存在しない。近接する個別実装: `part_integrity_findings`(部品不一致)、`certificate_images.deepfake_verdict='likely_real'|'suspicious'|'likely_fake'`、保険 SLA の at_risk/overdue 判定(`src/app/api/cron/insurer-sla-alerts/`)。いずれも領域固有で、影響度ベースの統一軸ではない。

### 1.4 CertificateState(v2.0: 8値) ⇔ `certificates.status`(実値4)

| v2.0 値 | 既存の対応 | 対応度 | 備考 |
|---|---|---|---|
| NOT_READY | `certificates.status='draft'` | 部分 | draft は「写真ゲート未通過の下書き」で近いが、条件不足の内訳は持たない |
| READY | 概念なし | — | 発行条件成立を表す独立状態はない |
| ISSUING | 概念なし | — | |
| VERIFYING | 概念なし(`certificate_anchors.status='queued'/'batched'` が近い) | 別方式 | アンカー処理状態は別テーブルの軸 |
| VERIFIED | `certificates.status='active'`(+`certificate_anchors.status='anchored'`) | 部分 | active は発行済みを意味し、オンチェーン検証完了は別軸 |
| PENDING_CORRECTION | 概念なし(`certificate_edit_histories` は追記型の編集履歴であり状態軸ではない) | 別方式 | |
| SUPERSEDED | 概念なし(`certificate_versions` は content hash の Phase 1 のみで版遷移なし) | — | |
| REVOKED | `certificates.status='void'` | 同義 | 公開ページで無効表示あり |
| (v2.0 対応なし) | `certificates.status='expired'` | — | v2.0 に期限切れ状態はない |

### 1.5 PaymentState(v2.0: 9値) ⇔ `payments.status`(4) + `reservations.payment_status`(4) + 売掛元帳

| v2.0 値 | 既存の対応 | 対応度 | 備考 |
|---|---|---|---|
| UNPAID | `reservations.payment_status='unpaid'` / `DocumentStatus='sent'` 等 | 同義 | |
| PENDING | 概念なし | — | 処理中/確認中の状態がない |
| PARTIALLY_PAID | `reservations.payment_status='partial'`(+`payment_entries` 差額元帳) | 同義 | 元帳: `src/lib/invoice/recordPayment.ts` |
| PAID | `reservations.payment_status='paid'` / `payments.status='completed'` | 同義 | |
| OVERPAID | 概念なし | — | |
| REFUNDED | `reservations.payment_status='refunded'` / `payments.status='refunded'` | 同義 | |
| PARTIALLY_REFUNDED | `payments.status='partial_refund'` | 同義 | |
| CANCELED | `payments.status='voided'` | 近似 | |
| UNKNOWN | 概念なし | — | 結果不明を FAILED と区別する状態がない(v2.0 の重要不変条件) |

Payment Policy(v2.0 §11.3: Consumer PAID / B2B CREDIT_APPROVED / Insurance INSURER_APPROVED)に相当する評価器はないが、サインオフ状態機械が顧客区分(individual/corporate)×支払サイクル(per_job/consolidated)で会計工程を自動判定しており部分的に近い(別方式)。

### 1.6 SyncState(v2.0: 5値) ⇔ `outbox_events.status`(サーバ5) + クライアント IndexedDB キュー

| v2.0 値 | 既存の対応 | 対応度 | 備考 |
|---|---|---|---|
| SYNCED | `outbox_events.status='delivered'` | 近似 | v2.0 はクライアント→サーバ同期、outbox はサーバ→外部配送が主用途 |
| PENDING | `outbox_events.status='pending'` / クライアント `src/lib/outbox/queue.ts`(IndexedDB) | 近似 | |
| SYNCING | `outbox_events.status='in_flight'` | 近似 | |
| FAILED | `outbox_events.status='errored'` / `'dead_letter'` | 近似 | |
| CONFLICT | 概念なし | — | 競合検出・解決 UI は存在しない |

## 2. v2.0 仕様セクション別トレース

| v2.0 § | 要件領域 | 既存実装(代表パス) | 状態 | ギャップ / 語彙差 | 担当 IMP |
|---|---|---|---|---|---|
| §1 | 製品定義・デザイン原則(証明書は結果、3秒理解、AI提案/人間確定) | 製品全体。証明書写真ゲート `src/lib/certificates/photoRequirement.ts`、AI 自動化ポリシー `src/lib/ai/automation/policy.ts`(suggest デモート=人間確定) | 部分 | 「3秒理解」「One screen, one decision」の体系的適用は未評価 | IMP-001 |
| §2 | サーフェス・IA(5タブ、Role別スコープ) | モバイル5タブ実値: ホーム/作業/車両/証明/その他(`apps/mobile/src/app/(tabs)/_layout.tsx`。v2.0 正準と一致。IMP-020 着手後、別途 main で先行実装された)。admin は slim ナビ+AIに聞く | 部分 | タブ構造自体は一致。Role別スコープ切替(自分/店舗/全店舗)は StoreSelector が近いが `src/lib/navigation/scope.ts`(WORK_SCOPES 型定義)とは未連携 | IMP-020, 033, 034 |
| §3 | デザインシステム・アクセシビリティ | `src/app/globals.css`(Tailwind 4 CSS-first トークン)+`DESIGN_SYSTEM.md`+`src/components/ui/`(49コンポーネント)。Lighthouse CI a11y ≥0.9 | 部分 | v2.0 トークン実値(Primary #155EEF 等)との照合は未実施。WCAG AA の体系的監査なし | IMP-010, 051 |
| §4 | グローバルナビ・検索・Quick Create | 横断検索(顧客/車両/証明書/請求書)+CommandPalette(エンティティ検索+コンテキスト継承 Quick Create、IMP-020)+AskLedraBar。モバイルの Quick Create FAB(`QuickCreateSheet.tsx`)は固定4項目で権限ゲート・コンテキスト継承なし | 部分 | VIN/部品/Serial 横断検索・カテゴリ別 Deep Link なし。モバイル FAB と `src/lib/navigation/quickCreate.ts` の統合は未着手 | IMP-020 |
| §5 | Home(今日・今・次、NEXT ACTION) | `/admin`(ダッシュボード+NextActionSection+TodayProgressCard+TodayTasksWidget+承認インボックス)、mobile ホームタブ | 実装済み | NEXT ACTION 1件大表示(NextActionCard)+今日の進捗(ProgressCard)+3段階スコープ切替。説明可能な優先度理由はタイル hint で表示。priority エンジン(IMP-044)で高度化予定 | IMP-021, 044 |
| §6 | Work List & Job Hub | `/admin/reservations`(一覧+カレンダー)+`/admin/jobs/[id]`(統合ワークスペース: ステータス/サインオフ/写真/部品/点検/証明書ドラフト/AI) | 実装済み | ステータス表示統一(5値の単一定義源)+情報階層(現ステップ拡大・完了圧縮)+CTA規律(ステータス別表示)。「作業完了=証明書発行」CTA禁止はサインオフ分離で充足 | IMP-022 |
| §7 | Evidence / Photo / Voice | 段階タグ4値(`src/lib/certificateImages/stage.ts`)+before/after 必須ゲート+単回撮影 nonce+真正性グレード+改ざん検知 AI+凍結ガード(`certificate_images_guard`)。必須ショット進捗(`evidenceProgress.ts`)。音声は Web のみ(`VoiceMemoPanel`+Haiku 構造化→フォーム確認)+オフライン検知+多言語音声認識(LOCALE_SPEECH_LANG)+備考欄接続 | 実装済み | モバイル音声入力なし(設計選択未解決)。UI文字列のi18n化は docs/operations/i18n.md 方針で先送り | IMP-023, 024 |
| §8 | Parts & Installation Integrity | `src/lib/parts/`(3-way match、凍結ガード、OTP 署名、TSA、アンカー)+`/admin/parts-integrity` | 実装済み | v2.0 の Part statuses 語彙とは差異あり(実値: `draft/installed/customer_verified/disputed/voided`)。Certificate Gate との自動連動は部分 | IMP-040 |
| §9 | Vehicle Digital Passport | `/admin/vehicles/[id]`+`/v/[vin]`(公開履歴)+`vehicle_passports`(所有権移転)+車検証 OCR+PII遮断検証(`piiFields.ts`コンパイル時型アサーション+18テスト)+車両顧客関係型(`customerRelation.ts`) | 実装済み | 顧客関係DBマイグレーション(`vehicle_customer_relationships`テーブル化)はIMP-050に委譲。レガシーPII列(`vehicles.customer_name/email/phone_masked`)のDROPはIMP-050。モバイル車両タブはプレースホルダのみ(IMP-033) | IMP-025 |
| §10 | Customer Confirmation Web | 受領サイン `/sign/receipt/[token]`(下4桁2FA+同意文言版管理+内容スナップショット)、部品確認 `/parts/confirm/[token]`、板金同意 `/sign/consent/[token]`、板金進捗 `/track/[token]`。`RaiseConcernButton`で4系統に「気になる点を伝える」UI+`customer_concerns`テーブル+管理者API+ブロック判定ヘルパー(`hasUnresolvedConcerns`) | 実装済み | Certificate Gateへのブロック統合はIMP-028。admin UI(懸念一覧画面)は最小API提供のみ(画面は後続) | IMP-026 |
| §11 | Estimate / Invoice / Payment | `documents` 統合モデル(9帳票種+遷移マップ `nextStatusesFor()`)+`payment_entries` 売掛元帳+Stripe/Square/Tap to Pay | 部分 | PaymentState 語彙差(§1.5)。UNKNOWN/OVERPAID/PENDING なし。Payment Policy 評価器なし。Provider 分離は UI 上概ね充足 | IMP-027, 043 |
| §12 | Certificate / Integrity / Correction | 写真ゲート+void+編集履歴(`certificate_edit_histories`)+content hash(`certificate_versions` Phase 1)+アンカー2層+Certificate Gate評価器(`gateEvaluator.ts`、10条件一括判定)+訂正リクエスト型(`correction.ts`：5状態×5カテゴリ+訂正可否判定+状態遷移検証+Gate条件`no_pending_corrections`実装接続)+Integrity Incident型(`integrityIncident.ts`：6カテゴリ×3重大度×5状態+revoke可否判定+即時revoke判定)+版遷移ヘルパー(`versionTransition.ts`：VERIFIED→SUPERSEDED/REVOKED遷移評価+旧版誘導情報生成) | 部分 | Gate評価器は純関数で実装済み(4条件実装+6スタブ)。活性化ルートへの統合は後続。READY→ISSUING→VERIFYING→VERIFIEDの自動遷移なし(§1.4)。訂正リクエスト型・Incident型・版遷移ヘルパーは定義済み(DB・ルート実装は後続) | IMP-028, 030 |
| §13 | Notification / Escalation | 用途別通知モジュール群+outbox+SLA エスカレーション(保険のみ)+LINE/Slack/メール/SMS。Push はトークン登録まで+中央通知エンジン型基盤(`types.ts`18タイプカタログ+Severity3段+Channel6種+Category11種)+Deep Link生成(`deepLink.ts`10エンティティ×3ロール)+汎用SLAエスカレーション評価器(`escalation.ts`)+チャネル解決・要対応カウント・カテゴリグループ・重要度フィルタ(`routing.ts`) | 部分 | 統合dispatch未実装。既存通知モジュールの中央エンジン移行(配管変更)は後続。Assignment軸ルーティング未実装 | IMP-029 |
| §14 | Offline / Sync / Loading / Error | Web PWA: IndexedDB outbox+SW+multipart(`src/lib/outbox/`)。モバイル: 検知バナーのみ。エラー契約(error_code/is_data_safe 等)なし | 部分 | モバイル同期キューなし。CONFLICT 解決なし。構造化エラー契約なし。ローディング規律(0.3s/2s)未体系化 | IMP-016, 032, 053 |
| §15 | 認証・オンボーディング・端末セキュリティ | スタッフ: password+SSO+MFA(`src/lib/auth/`)。顧客: メール OTP+LINE。WebAuthn は重要操作署名ゲート(`src/lib/webauthn/gate.ts`)。招待 `/join` | 別方式 | v2.0 正準フロー(Invite→言語→OTP→Store/Role→生体必須→Home)は存在しない。端末登録・遠隔失効なし(モバイルは Supabase セッションのみ) | IMP-012 |
| §16 | Roles & Permission Model | Role 5段+Permission 約55種(`src/lib/auth/permissions.ts`)+RLS 240テーブル+組織ロール別軸+店舗スコープ | 部分 | v2.0 の7ロール束・権限動詞(VIEW/EDIT/CONFIRM/APPROVE/ISSUE/MANAGE/EXPORT)と語彙差。Assignment(担当)軸・Risk Level 軸なし。「承認を依頼」ワークフローなし | IMP-013, 045 |
| §17 | Localization & Terminology | 自前 i18n 基盤(`src/lib/i18n/`)。6言語(ja/en/vi/id/fil/hi)のロケール登録・メッセージ・ドメインラベル・自動車用語集・original/translated 分離型(IMP-011 で実装)。AI 翻訳 `translateContent` は別系統 | 部分 | **基盤は完了。画面適用はゼロのまま**(ハードコード日本語の移行は範囲外、docs/operations/i18n.md 方針)。vi/id/fil/hi の訳語検証は IMP-051 | IMP-011(基盤済) / IMP-051(訳語検証) |
| §18 | Privacy / Data Access / Retention | データ保持 cron(`data-retention`)+顧客削除リクエスト(`customer_deletion_requests`)+PII 開示制御(保険 `is_pii_disclosed()`)+`docs/data-retention.md` | 部分 | データクラス4分類・可視性4レベルの体系なし。公開レンディションのマスキングなし。Export 監査は部分(`document_share_log` 等) | IMP-050 |
| §19 | State Machines & Certificate Gate | サインオフ状態機械(`computeSignoffState`: 順序ゲート+SLA+写真充足)+写真ゲートのサーバ側チョークポイント3箇所 | 別方式 | v2.0 の単一バックエンド Certificate Gate 評価器(10条件)はない。ゲート条件が写真+サインオフに分散。無効遷移の網羅的拒否表なし | IMP-015, 028, 031 |
| §20 | Event Architecture / NEXT ACTION / Prediction | `vehicle_histories`(AuditEventType 23種)+`outbox_events`+冪等性3系統(current-architecture.md §6)。AI `jobNextAction`/`nextActionAuto` | 部分 | v2.0 Core Event Catalogue(29イベント)との命名・網羅差。イベント→優先度再計算→通知評価のパイプラインなし。scheduled/predicted/actual の3分離は部分(`estimated_min` 等) | IMP-014, 044 |
| §21 | Analytics & Management | `/admin/management`(KPI)+ダッシュボード+価格/スタッフ/工程/課金分析+店舗利用状況 | 部分 | v2.0 指標セット(VERIFIED率・Evidence不足率・レビュー待ち時間等)は未実装。スタッフ表示は実績分析であり capacity visibility 方式ではない | IMP-041, 046 |
| §22 | Screen IDs & Requirement IDs | 本書(トレーサビリティ確立) | 部分 | 個別要件 ID の採番は仕様書側に存在しない(前文参照) | IMP-000, 001 |
| §23 | QA / Acceptance Criteria | Playwright 15 spec(認可・公開ページ・シード付きフルフロー)。ただし CI から E2E 削除済み(実バックエンド依存) | 部分 | v2.0 必須 E2E(正常フロー+例外10種)は未自動化。CI で E2E が回らない | IMP-052 |
| §24 | Delivery Priorities & Handoff | 本書 §6(P0 充足サマリ)+`docs/implementation/` | 部分 | P0 リリースゲートは IMP-054 で実施 | IMP-054 |

## 3. 正準画面 ID トレース(18件)

| 画面ID | v2.0 目的 | 最も近い既存画面(実ルート) | 状態 | 担当 IMP |
|---|---|---|---|---|
| AUTH_INVITE | 招待/言語/OTP 入口 | `/join`(招待参加+メール検証) | 部分(言語選択なし) | IMP-012 |
| AUTH_OTP | OTP 検証 | 顧客のみ `/customer/[tenant]/login`+`/my`(メール6桁)。スタッフ OTP ログインなし | 部分 | IMP-012 |
| AUTH_BIOMETRIC | 生体登録 | なし(WebAuthn は操作署名用 `src/lib/webauthn/`) | なし | IMP-012 |
| HOME | 今日/次/問題 | `/admin`(ダッシュボード — NextAction+Progress+Tasks)+mobile `(tabs)/index` | 実装済み | IMP-021 |
| WORK_LIST | 作業一覧 | `/admin/reservations`+mobile `(tabs)/work` | 部分 | IMP-022 |
| JOB_HUB | 1台の案件ハブ | `/admin/jobs/[id]`(統合ワークスペース) | 部分 | IMP-022 |
| JOB_EVIDENCE | 証跡撮影 | `/admin/certificates/[public_id]`(写真)+mobile `certificates/[id]/photos`+凍結ガード+進捗計算 | 実装済み | IMP-023 |
| JOB_DOCUMENTS | 見積/請求/決済/確認 | `/admin/invoices`+`/admin/payment-ledger` | 部分 | IMP-027, 043 |
| VEHICLE_LIST | 車両検索/一覧 | `/admin/vehicles` | 実装済み | IMP-025 |
| VEHICLE_DETAIL | 車両パスポート | `/admin/vehicles/[id]`+公開 `/v/[vin]`+PII遮断検証済み | 実装済み | IMP-025 |
| CERTIFICATE_LIST | 証明書一覧 | `/admin/certificates` | 実装済み | IMP-028 |
| CERTIFICATE_DETAIL | 証明書+整合性+版 | `/admin/certificates/[public_id]`+公開 `/c/[public_id]` | 部分(状態軸差 §1.4) | IMP-028 |
| MORE | その他メニュー | mobile `(tabs)/more`+`src/lib/navigation/moreMenu.ts` | **実装済み** | IMP-033 |
| SYNC_CENTER | 同期/競合 | なし(`PendingOfflineCerts`+`OfflineBanner` が部分) | なし | IMP-032 |
| ANALYTICS_STORE | 店舗分析 | `/admin/management`+`/admin/analytics/*` | 部分 | IMP-046 |
| STAFF_MANAGEMENT | スタッフ/設備 | `/admin/staff`+`/admin/members`+`/admin/mechanic-gantt`+`/admin/booths` | 実装済み(概ね) | IMP-045 |
| WORKFLOW_BUILDER | ワークフローテンプレ | `/admin/workflow-templates`(エディタあり) | 部分(バージョン管理なし) | IMP-042 |
| SECURITY_PRIVACY | セキュリティ/プライバシー | `/admin/settings`(配下に security 系設定) | 部分 | IMP-050 |

## 4. 製品不変条件トレース(ガイド §1、13項目)

| # | 不変条件(v2.0/ガイド) | 既存実装の現状 | 状態 | 担当 IMP |
|---|---|---|---|---|
| 1 | 証明書生成は正しく回した作業の結果(証明書作成アプリにしない) | サインオフ状態機械で完了報告→証明書→サイン→会計→オンチェーンの順序ゲートあり | 部分(別方式) | IMP-015, 028 |
| 2 | モバイル下部ナビは ホーム/作業/車両/証明/その他 で固定 | 実値: ホーム/作業/車両/証明/その他(`(tabs)/_layout.tsx`)。一致 | 実装済み | IMP-020 |
| 3 | 「作業完了して証明書発行」CTA を出さない | 発行はサインオフ工程に分離。証明書は写真ゲート通過後に activate | 部分 | IMP-022, 028 |
| 4 | Job/Step/Severity/Certificate/Payment/Sync は独立軸 | 実装の各軸は §1 参照。Severity 軸なし、Step は導出 | 部分 | IMP-001, 015 |
| 5 | 正式証明/VERIFIED は同期済み必須証跡+全 Gate 条件 | Certificate Gate評価器(`gateEvaluator.ts`)で10条件を一括判定。実装済み3条件(写真/支払い/懸念)+7スタブ。活性化ルートへの統合は後続 | 部分 | IMP-028 |
| 6 | PaymentState.UNKNOWN は失敗ではない/盲目リトライ禁止 | UNKNOWN に相当する状態が存在しない | なし | IMP-027 |
| 7 | 予測は事実ではない(scheduled/predicted/actual 分離) | `estimated_min`(予定)と `started_at/completed_at/duration_sec`(実績)は分離。predicted 系フィールドなし | 部分 | IMP-014, 044 |
| 8 | AI は構造化/提案/予測、重要記録は人間確定 | `src/lib/ai/automation/policy.ts`(FieldPolicy: manual/suggest/自動、confidence 未満は suggest デモート、壁3安全弁) | 実装済み | IMP-024 |
| 9 | 車両 identity は顧客 PII から独立 | `vehicles` は独立エンティティ+`vehicle_passports` 所有権移転あり。公開サーフェスのPII遮断はコンパイル時型アサーション+テスト18件で検証済み。顧客紐付けは `vehicles.customer_id` 直付け(関係型モデル定義済み、DBマイグレーションはIMP-050) | 実装済み | IMP-025, 050 |
| 10 | 原本証跡は不変/追記のみ(黙示上書き禁止) | 部品側は凍結ガード(`part_installations_guard`)+TSA。証明書写真も凍結ガード(`certificate_images_guard` — active/void 時 DELETE 不可+証跡列変更不可) | 実装済み | IMP-023, 030 |
| 11 | オフラインでも作業継続、正式証明は同期後 | Web PWA outbox で部分実現。モバイルは検知のみ | 部分 | IMP-016, 032 |
| 12 | 初期6言語 ja/en/vi/id/fil/hi | 6ロケール登録・メッセージ・ドメインラベル収録済(IMP-011)。**画面適用はゼロのまま** | 部分 | IMP-051(訳語検証) |
| 13 | 20代に洗練・40〜60代に自明のビジュアル | `DESIGN_SYSTEM.md` に設計原則あり。v2.0 トークンとの照合未実施 | 部分 | IMP-010, 051 |

## 5. IMP タスク逆引き表(36件・全件網羅)

| IMP | Phase/優先度 | 対応 v2.0 § / 画面ID | 現状サマリ(状態) | 依存 |
|---|---|---|---|---|
| IMP-000 | 0 / P0 | §22, §24(監査・トレース) | 本書+current-architecture.md で完了(実装済み=本タスク) | なし |
| IMP-001 | 0 / P0 | §1, §19, Appendix A(語彙・ガードレール) | **実装済み**(2026-08-19): 正準6軸 `src/lib/domain/states.ts`+ロケール別ラベル `labels.ts`+テスト、ADR 0001〜0006(`docs/adr/`)、アドホック状態禁止ルール(CLAUDE.md)。既存語彙との統一・マッピングは IMP-015 で判断(ADR-0002) | 000 |
| IMP-010 | 1 / P0 | §3(デザイントークン・共有部品) | **実装済み**(2026-08-19): 不足8プリミティブ(SegmentedControl/StatusBadge/StatusCard/NextActionCard/ProgressCard/Alert/IconButton/BottomSheet)+Badge dot+Button xl(48px CTA)+`SEVERITY_VARIANT_MAP` を新設。v2.0 §3.1 の色値(#155EEF 等)は既存 DESIGN_SYSTEM トークン維持のため不採用(DECISION_LOG 2026-08-19)。Storybook 相当なし(既存方針どおり) | 001 |
| IMP-011 | 1 / P0 | §17, L10N(i18n 基盤・用語集) | **完了**。6言語のロケール登録統一・`messages/{vi,id,fil,hi}.json`・ドメインラベル6言語・自動車用語集・original/translated 分離型。画面移行と next-intl 配線は範囲外 | 001 |
| IMP-012 | 1 / P0 | §15, AUTH_*(認証・招待・端末・step-up) | password 認証+WebAuthn 操作ゲートあり。正準フロー(Invite→OTP→生体)・端末管理なし(別方式) | 000, 001, 011 |
| IMP-013 | 1 / P0 | §16(権限エンジン・店舗スコープ) | Role5段+Permission55種+RLS240 稼働。権限動詞・Assignment/Risk 軸なし(部分) | 001, 012 |
| IMP-014 | 1 / P0 | §20, Appendix B(ドメインイベント・監査・冪等) | AuditEventType23種+outbox+冪等3系統あり。イベントカタログ網羅・パイプラインなし(部分) | 001, 013 |
| IMP-015 | 1 / P0 | §19(状態機械) | **実装済み**(2026-08-19): 正準6軸遷移表(`src/lib/domain/transitions.ts`)+汎用遷移検証関数+Certificate Gate 10条件型定義(`certificateGate.ts`)。既存値→正準値マッピングは消費タスク(IMP-028/031/027)で段階的導入。既存signoff/photoRequirement変更なし。残っていた設計論点4件(REVOKED到達性・支払いUNKNOWN解決先・着手後SKIPPED・Severity CRITICAL→ACTION)は2026-08-27に代表判断で解決済み(DECISION_LOG参照) | 001, 014 |
| IMP-016 | 1 / P0 | §14(オフライン永続・同期キュー・競合) | **部分**(2026-08-27): 同期ドメインイベント5種をカタログに追加(`src/lib/events/catalogue.ts`)+EVENT_RISK格付け。同期キュー型・競合検出ヘルパー(`src/lib/sync/`)は削除 — 実際の outbox(`src/lib/outbox/`)が持たない情報(メソッド別ステータス/tenant/恒久ブロック状態)を前提にしていたため(DECISION_LOG 2026-08-27)。型・競合解決の設計はIMP-032へ | 001, 014, 015, 032 |
| IMP-020 | 2 / P0 | §2, §4, HOME 他(ナビ・検索・Quick Create) | **部分**(2026-08-28): 5タブ構造は v2.0 正準と一致(main で先行実装済み)。`src/lib/navigation/`(正準タブ・Quick Create・スコープ型定義)+CommandPalette 強化(エンティティ検索+コンテキスト継承 Quick Create)+Web サイドバーの `WEB_TABS` 参照化を追加。**当初計画していたモバイル画面自体(タブバー本体・車両/証明書一覧・その他メニュー)は、ドラフト後に main 側で独立に実装済みだったため、稼働中の実装を優先しそちらを採用**(DECISION_LOG 2026-08-27)。モバイル FAB の Quick Create 統合・Role別スコープ切替は未着手 | 010, 011, 013 |
| IMP-021 | 2 / P0 | §5, HOME(3秒理解ホーム) | **実装済み**(2026-08-19): NEXT ACTION セクション(最優先タイル→NextActionCard)+今日の進捗 ProgressCard+3段階スコープ切替(HomeScopeToggle→SegmentedControl)+WorkScopeProvider(React Context)+レイアウト再構築。既存 fetchTodaySignals 再利用、新DBクエリなし。IMP-044 で priority エンジン高度化予定 | 010, 013, 015, 020 |
| IMP-022 | 2 / P0 | §6, WORK_LIST/JOB_HUB | **実装済み**(2026-08-20): ステータス表示統一(`jobStatusDisplay.ts` — 5値×色/ラベル/ヒント/variant の単一定義源。ReservationsClient/CalendarView/JobStatusPanel/StorefrontJobWorkflow の4箇所の重複 STATUS_CONFIG を置換)+ステッパー情報階層(現ステップ拡大・完了/未着手圧縮。JobStatusPanel+JobSignoffPanel 両方)+CTA規律(Next Actions をステータスで出し分け: 作業前は証明書/請求書非表示、完了後は予約編集非表示) | 015, 020, 021 |
| IMP-023 | 2 / P0 | §7, JOB_EVIDENCE(証跡撮影・必須ショット・不変連鎖) | **実装済み**(2026-08-20): (1) `certificate_images_guard` DB トリガー — active/void 証明書の写真行 DELETE 禁止+証跡列(sha256/stage/grade/TSA/C2PA/storage_path)の破壊的 UPDATE 禁止。DELETE API route にトリガーエラーの 409 ハンドリング追加。(2) `evidenceProgress.ts` — 必須ショットとアップロード済み写真の stage 突合せ進捗計算(純関数)。テスト 8 件 | 016, 022 |
| IMP-024 | 2 / P0 | §7(音声→AI構造化→人間確認) | **実装済み**(2026-08-20): (1) VoiceMemoPanel にオフライン検知(navigator.onLine チェック→明示エラー)。(2) `speechLang` prop + `LOCALE_SPEECH_LANG` マッピング(6言語BCP47対応)。(3) 証明書備考欄に VoiceMemoPanel(note variant)接続。モバイル音声は未実装(設計選択未解決、OPEN_QUESTIONS.md) | 011, 016, 022 |
| IMP-025 | 2 / P0 | §9, VEHICLE_*(車両パスポート基盤) | **実装済み**(2026-08-20): (1) PII遮断体系検証 — `piiFields.ts` でコンパイル時型アサーション(PassportCertCard/PassportData/PassportVerifyResponse/PublicTransferView の4型がPIIフィールドと重複しないことをTS型レベルで保証)。`piiShield.test.ts` で実行時検証18件(クエリSELECT列監査、フィールド形状検証、前所有者PII非露出検証)。(2) 車両顧客関係型モデル — `customerRelation.ts` でADR-0006に基づく関係エンティティ型(`VehicleCustomerRelation`/`VehicleRelationEndReason`/`PublicVehicleIdentity`)とPIIフィールドレジストリ(`VEHICLE_TABLE_PII_COLUMNS`/`PASSPORT_TABLE_PII_COLUMNS`)を定義。DBマイグレーションはIMP-050に委譲 | 013, 015 |
| IMP-026 | 2 / P0 | §10(顧客確認 Web) | **実装済み**(2026-08-20): (1) `customer_concerns` テーブル(DBマイグレーション) — source_type 4系統×status 4状態×category 5分類。job_id/certificate_id FK でブロック判定可能。(2) `RaiseConcernButton` コンポーネント — 4確認ページ(受領サイン/部品確認/板金同意/進捗追跡)に「気になる点を伝える」UI統合。(3) 顧客API(POST /api/customer/concerns — トークンからテナント/ジョブ/証明書を逆引き+Slack通知)+管理者API(GET/PATCH /api/admin/concerns)。(4) ブロック判定ヘルパー(`hasUnresolvedConcerns` — IMP-028 Certificate Gate で使用)。(5) 型モデル(`src/lib/concerns/types.ts` — ConcernSource/ConcernCategory/ConcernStatus/CustomerConcern)+テスト15件 | 011, 022, 023, 025 |
| IMP-027 | 2 / P0 | §11, JOB_DOCUMENTS(支払モデル・Policy) | 売掛元帳+返金あり。UNKNOWN/OVERPAID/Policy 評価器なし(部分) | 013, 014, 015, 022 |
| IMP-028 | 2 / P0 | §12, CERTIFICATE_*(Certificate Gate・発行・公開検証) | **実装済み**(2026-08-20): 単一 Certificate Gate 評価器(`gateEvaluator.ts`)— v2.0 §19.4 / ADR-0005 の10条件を一括評価する純関数。実装済み条件: required_evidence_present(写真枚数+Before/After)、payment_policy_met(IMP-027連携)、no_unresolved_alerts(IMP-026連携)。残り7条件はデフォルトmet:trueのスタブ(後続タスクで実装時に追加)。`CertificateGateInput`型で呼び出し側がデータを組み立て、`CertificateGateResult`(ready+10条件詳細)を返す。テスト17件 | 015, 023, 026, 027 |
| IMP-029 | 2 / P0 | §13(通知・エスカレーション・Deep Link) | **実装済み**(2026-08-20): (1) 通知タイプカタログ(`types.ts`)— 18タイプ×Severity3段(urgent/action_required/informational)×Channel6種×Category11種。`isActionRequired()`で要対応判定、`getTypeConfig()`で未知タイプの安全フォールバック。(2) Deep Link生成(`deepLink.ts`)— 10エンティティ(job/order/certificate/customer/vehicle/document/invoice/reservation/insurer_case/thickness_report)×3ロール(admin/insurer/customer)。実ルート構造に合致。(3) SLAエスカレーション評価器(`escalation.ts`)— insurer-sla-alerts cronの純関数部分を汎用化。`evaluateEscalation()`(createdAt+priority+thresholds+now→stage/remaining/elapsed/ratio)+`shouldEscalate()`(重複抑止・エスカレーション遷移)。(4) チャネル解決・要対応カウント(`routing.ts`)— `resolveChannels()`(disable/add override付き)、`countActionRequired()`(未読×urgent/action_required)、`groupByCategory()`、`filterBySeverity()`。テスト35件 | 014, 021, 028 |
| IMP-030 | 3 / P0 | §12.3-12.4(訂正・supersede・Integrity Incident・revoke) | **実装済み**(2026-08-20): (1) 訂正リクエスト型(`correction.ts`)— 5状態(pending/approved/rejected/applied/cancelled)×5カテゴリ(content_error/measurement_error/evidence_error/expiry_error/other)+訂正可否判定(VERIFIED+未処理訂正なしのみ許可)+状態遷移検証(承認を飛ばせない等)+`hasPendingOrApprovedCorrection()`(Gate条件用)。(2) Integrity Incident型(`integrityIncident.ts`)— 6カテゴリ(tampering/fraud/legal_request/gross_negligence/evidence_compromise/other)×3重大度(critical/high/medium)×5状態(reported→investigating→confirmed→revoked/dismissed)+revoke可否判定(VERIFIEDのみ)+即時revoke判定(critical=全即時、high+tampering=即時)。(3) 版遷移ヘルパー(`versionTransition.ts`)— `evaluateSupersede()`(VERIFIED→SUPERSEDED+新版VERIFIED)+`evaluateRevoke()`(VERIFIED→REVOKED)+`resolveVersionRedirect()`(旧版アクセス時の誘導情報生成)。(4) Gate条件`no_pending_corrections`実装接続 — `gateEvaluator.ts`に`correctionRequests`入力追加、`hasPendingOrApprovedCorrection()`で判定(後方互換あり)。テスト57件 | 014, 023, 028 |
| IMP-031 | 3 / P0 | §19.1 例外(cancel/no-show/pause/追加作業) | **実装済み**(2026-08-20): 例外遷移評価器5本(`jobExceptions.ts`)— evaluateCancel(8状態→CANCELED)/evaluateNoShow(SCHEDULED→NO_SHOW。CHECKED_IN不可=入庫済みは来店なしになりえない)/evaluatePause(IN_PROGRESS→PAUSED)/evaluateResume(PAUSED→IN_PROGRESS, NO_SHOW→SCHEDULED, PARTIALLY_COMPLETED→IN_PROGRESS)/evaluatePartialComplete(IN_PROGRESS→PARTIALLY_COMPLETED)。全てJOB_TRANSITIONSベース。例外メタデータ型: CancelReasonCategory(6)/PauseReasonCategory(6)/NoShowAction(3)/PartialCompleteReason(5)/JobExceptionEvent。スコープ変更型: ScopeChangeCategory(5)/ScopeChangeRecord/requiresApproval()。jobStatusDisplay.ts: paused/no_show/partially_completedの表示構成追加(ReservationStatus 5→8値)。isExceptionState()ヘルパー。DBマイグレーション・APIルート変更なし(型基盤先行)。テスト51件 | 015, 022, 027, 030 |
| IMP-032 | 3 / P0 | §14, SYNC_CENTER | なし(OfflineBanner+PendingOfflineCerts が部分) | 016, 020 |
| IMP-033 | 3 / P0 | §2, MORE(その他メニュー IA) | **実装済み** | 010, 013, 020, 032 |
| IMP-034 | 3 / P0 | §2, §4(タブレット2-pane・共用端末) | レスポンシブは admin Web 側のみ。タブレット専用レイアウト・ユーザー切替なし(なし〜部分) | 010, 021, 022, 023, 033 |
| IMP-040 | 4 / P1 | §8(部品・装着インテグリティ) | 3-way match+凍結ガード+OTP署名+TSA+アンカーで深い(実装済み。語彙差あり) | 023, 030 |
| IMP-041 | 4 / P1 | §21(設備/リフト稼働) | ブース管理+ガントあり。占有予測・NEXT ACTION 連動なし(部分) | 014, 021, 022 |
| IMP-042 | 4 / P1 | WORKFLOW_BUILDER(版管理テンプレート) | エディタあり。テンプレ版管理・実行中ジョブの版凍結なし(部分) | 015, 013 |
| IMP-043 | 4 / P1 | §11(見積/請求ワークフロー) | documents 統合モデル+PDF+送付履歴あり。顧客承認額の版管理なし(部分) | 027, 031 |
| IMP-044 | 4 / P1 | §20.2(Priority/NEXT ACTION エンジン) | AI `jobNextAction`/`nextActionAuto` あり。説明可能スコアリングサービスなし(部分) | 014, 021, 041 |
| IMP-045 | 4 / P1 | §16, STAFF_MANAGEMENT(多店舗・スタッフ) | 店舗/組織/メンバー招待/上限あり。移籍・停止・最終管理者保護は【要確認】(部分) | 013, 034 |
| IMP-046 | 4 / P1 | §21, ANALYTICS_STORE(経営分析) | KPI+個別分析あり。v2.0 指標セット・capacity visibility なし(部分) | 014, 029, 041, 045 |
| IMP-050 | 5 / P0 | §18, SECURITY_PRIVACY(プライバシー・保持・Export) | 保持 cron+削除リクエスト+PII 開示制御あり。可視性4レベル・マスク公開なし(部分) | 013, 025, 028 |
| IMP-051 | 5 / P0 | §3.5(アクセシビリティ・多言語監査) | Lighthouse CI(a11y ≥0.9、マーケのみ)。6言語 QA なし(部分) | 010, 011, 034 |
| IMP-052 | 5 / P0 | §23(必須 E2E スイート) | Playwright 15 spec(CI 外)。v2.0 必須フロー・例外系未自動化(部分) | 021, 022, 023, 026, 027, 028, 031, 032 |
| IMP-053 | 5 / P0 | §14.4(可観測性・エラー契約・復旧) | Sentry+Healthchecks+cron 失敗抑制あり。構造化エラー契約(is_data_safe 等)なし(部分) | 014, 016, 028, 052 |
| IMP-054 | 5 / P0 | §24(P0 リリースゲート) | 未着手(なし) | 050, 051, 052, 053 |

## 6. P0 充足サマリ(v2.0 §24.1 → 受入条件の証跡)

v2.0 §24.1 の P0(Ledra Core)10項目すべてに、既存実装参照または担当タスクが存在することの確認。

| P0 項目 | 既存実装参照 | 担当 IMP |
|---|---|---|
| Invite / OTP / Biometric | `/join`+顧客 OTP(生体ログインなし) | IMP-012 |
| Home / Work List / Job Hub | `/admin`+`/admin/reservations`+`/admin/jobs/[id]`(別方式で稼働) | IMP-020, 021, 022 |
| Workflow + Photo Evidence + Voice | ワークフローエンジン+写真ゲート+Web 音声 | IMP-022, 023, 024 |
| Vehicle | `/admin/vehicles`+`/v/[vin]` | IMP-025 |
| Customer Confirmation | `/sign/receipt/[token]` ほか署名付き URL 系統 | IMP-026 |
| Payment state + Certificate + VERIFIED | 売掛元帳+写真ゲート+アンカー(語彙差あり) | IMP-027, 028 |
| Role / Permission | Role5段+Permission55種+RLS240 | IMP-013 |
| Basic Offline / Sync | Web PWA outbox(モバイルなし) | IMP-016, 032 |
| Basic Notifications | 用途別通知+outbox+中央通知エンジン型基盤+Deep Link+SLAエスカレーション評価器+チャネル解決+要対応カウント | IMP-029 |
| Localization foundation | 6言語の i18n 基盤(IMP-011 で整備、画面適用はゼロ) | IMP-051(訳語検証) |

**結論**: P0 全10項目に担当タスクまたは既存実装参照があり、IMP-000 受入条件「Every P0 requirement has an owner task or existing implementation reference」を満たす。
