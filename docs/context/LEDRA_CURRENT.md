# LEDRA_CURRENT.md — 現在の事業・プロダクト状況

> このファイルは「今の Ledra がどういう状態か」のスナップショット。更新履歴は
> 追わず、常に最新状態だけを保つ（履歴は DECISION_LOG.md / RELEASE_LOG.md 側）。
> 大きな変化があったら都度上書きすること。

最終更新: 2026-08-20

> 2026-07-30 追記: 代理店ポータルの営業資料は2系統。(1)「常に最新の商品資料」欄＝
> ライブデータから自動生成される製品資料（機能紹介/料金/比較表/セキュリティ/ROI/概要）で
> 機能増減・改定があってもDLのたびに最新版が出る（本部の差し替え不要）。(2)本部が手動
> アップロードする静的資料（契約書テンプレ等）。表示メタは `src/lib/marketing/resourceCatalog.ts`
> がマーケ資料ページと共用の単一情報源。詳細は DECISION_LOG / RELEASE_LOG 2026-07-30。

## 会社・代表者

- 運営: 株式会社HOLY（2024年11月法人化）
- 代表: 堀越友輔
  スポーツトレーナー専門学校中退 → 町の整備工場で整備・鈑金塗装・コーティング・
  用品取付を経験 → 独立し47都道府県で出張作業メインに事業展開 → 法人成り。
  自動車業界の信頼低下・大手不正を背景に、AIと現場知見を融合したLedraを開発。

## プロダクト概要

**対外ポジショニング（SEO/GEO の一言）**: 「自動車整備・コーティング店の施工履歴プラットフォーム」。
2026-07-27 に旧「WEB施工証明書SaaS」から刷新し、同日 PR TIMES の表記に合わせ「施工履歴プラットフォーム」に統一
（施工証明書は主要機能の1つとして残す。買い手検索語は description/keywords 側で確保）。
サイトの title/description/OGP・JSON-LD・robots は `src/lib/marketing/config.ts` の `siteConfig`
（siteTagline / siteDescription / keywords / featureList）を単一情報源として参照する。
詳細は DECISION_LOG.md / RELEASE_LOG.md 2026-07-27 を参照。

自動車整備 / ボディリペア / コーティング / PPF 店向けのマルチテナント SaaS。
施工証明書発行、請求・帳票、顧客ポータル、予約、保険会社（損保）との案件連携、
部品装着インテグリティ（装着部品の真正性証明）、AI 業務自動化、ブロックチェーン・
アンカリング + RFC3161 タイムスタンプによる証明書・装着記録の改ざん検知までを
一本化して提供する（出典: README.md）。

管理画面のナビゲーションは、常時表示をコア機能に絞る slim 表示＋「AIに聞く」チャット
（自由文→画面遷移）＋名前・番号での横断検索（顧客/車両/証明書/請求書）＋ピン留めで構成し、
機能過多でも目的の画面へ速く到達できるようにしている（2026-07 導入, PR #752）。

## 主要機能の柱（README.md より）

- 施工証明書 × 改ざん検知（Polygon アンカリング + 施工前後写真ゲート）
- 作業完了サインオフ・ワークフロー（完了報告 → 証明書発行 → 顧客サイン →
  お会計 → オンチェーン、`src/lib/signoff/state.ts` の `computeSignoffState` に
  順序ゲート・SLA・写真充足判定を集約）
- 部品装着インテグリティ（装着部品の真正性証明）
- 保険会社（損保）との案件連携
- AI 業務自動化（写真改ざん検知・不正スコア等）
- LINE 連携（会話フローによる予約・見積り・オプション提案・証明書通知）
- 管理画面ダッシュボードの「AIに聞く」入口（`AskLedraBar`）: 自由入力をまず決定的な
  キーワード→画面ルーティング（AI不使用・無料）で解決し、未マッチ時のみ既存の
  `qaAssistant`（施工ナレッジRAG）にフォールバック。承認インボックスは下書きごとに
  実データがある種別だけ「なぜ」（証明書=AI信頼度、発注=起票理由の実文言）を表示し、
  根拠データの無い請求書には表示しない（PR #819）。

## 外部サービス連携（2026-08-16 時点）

加盟店向けの連携はすべて `/admin/settings/connections` の1画面に集約している。
方針は「加盟店は自分のアカウントでログインするだけ。開発者コンソールでの ID・
トークン発行は求めない」。

| 連携 | 接続方法 | 加盟店の発行作業 |
| --- | --- | --- |
| Slack（予約通知） | OAuth（汎用基盤） | 不要 |
| Square（POS） | OAuth（個別実装） | 不要 |
| freee / マネーフォワード | OAuth（個別実装） | 不要 |
| Google カレンダー | OAuth（個別実装） | 不要 |
| Stripe Connect | オンボーディングリンク | 不要 |
| メール予約取り込み | 画面のトグル | 不要 |
| **LINE公式アカウント** | Channel ID と Channel Secret の2値を貼るだけ（トークン発行・Webhook設定はLedraが自動） | **2値のコピーのみ** |
| NexPTG（膜厚計） | Ledra 側が API キーを発行して相手アプリに設定 | 対象外（方向が逆） |

新しい OAuth 連携は `src/lib/integrations/providers/*.ts` にプロバイダ定義を1ファイル
足して `registry.ts` に1行加えるだけで載る（共通ルート `/api/admin/connect/[provider]`、
共通テーブル `tenant_integrations`。新しい API ルートも DB マイグレーションも不要）。
既存の Square / 会計 / Google カレンダーは稼働中のため個別実装のまま併存させている。

LINE だけ「ログインのみ」になっていない。完全に消すにはモジュールチャネル（申請制）が必要だが
**現在は申請の受付が停止中**のため、申請不要の Messaging API でできる自動化を先に実装した
（2026-08-16。アクセストークンの自動発行・Webhook URL の自動設定・保存時の配送テスト・
残作業の自動検出）。加盟店に残るのは Channel ID と Channel Secret のコピーのみ。
自動発行トークンは30日で失効するため、送信直前に期限が近ければ自動で再発行する。
詳細は `docs/line-module-channel-research.md` / OPEN_QUESTIONS.md。

## 技術スタック（package.json / README.md より）

```
Next.js 16.2 (App Router) + React 19.2 (React Compiler)
Supabase (Postgres + Storage + Auth) · Stripe · Upstash Redis + QStash
Sentry · Resend (+ SendGrid fallback) · Anthropic (Opus 4.8 / Sonnet 4.6 / Haiku 4.5)
@react-pdf/renderer · viem/ethers · RFC3161 TSA · Twilio · LINE · Healthchecks.io
```

- テスト: Vitest（単体）/ Playwright（E2E）
- API: 560+ Route Handlers（37 トップレベルグループ、README.md 時点）

## 実装計画（UI/UX & Development Specification v2.0、2026-08-19〜）

- 「Ledra UI/UX & Development Specification v2.0」（2026-08-19）と、それを36タスク
  （IMP-000〜IMP-054）に分解した「Claude Code Implementation Guide v1.0」を実装基準線として採用。
- **IMP-014（ドメインイベント・監査・冪等基盤）完了**: v2.0 §20 / Appendix B のドメインイベント
  基盤を型・純粋関数で整備。統一イベントカタログ（`resource.action` 命名、33 型）、既存
  AuditEventType→DomainEventType マッピング、型付きイベントエンベロープ（actor/tenant/
  store/risk/version/idempotencyKey）、イベント型別リスクレベル推定。既存の audit / outbox /
  webhook-topics は変更なし。
- **IMP-013（権限エンジン・店舗スコープ基盤）完了**: v2.0 §16 の不足分を型・純粋関数で
  補完。正準権限動詞 7 種の型定義と既存 Permission→正準動詞マッピング、操作リスクレベル
  4 段階分類、店舗スコープ型と判定関数群（hasStoreAccess/effectiveStoreRole/
  isStoreManager/accessibleStoreIds）。既存 Permission 55 種・RLS 240 テーブルは変更なし。
- **IMP-012（認証・招待・端末・step-up 基盤）完了**: v2.0 §15 の認証基盤を型・状態機械・
  ヘルパーとして整備。(1) 正準オンボーディングフロー状態機械（INVITED→LANGUAGE_SET→
  OTP_VERIFIED→STORE_ASSIGNED→BIOMETRIC_ENROLLED→ACTIVE）。(2) 汎用 OTP モジュール
  （HMAC-SHA256 ハッシュ・タイミングセーフ検証・スタッフ OTP にも使える抽象化）。
  (3) ユーザー端末管理型（デバイス登録・信頼度判定・遠隔失効）。(4) Step-up 認証
  （操作別要件マップ・利用可能手段判定）。(5) 招待フロー型（ロケール選択付き・
  トークン検証）。DB マイグレーション・画面実装なし（IMP-013 の前提条件充足が目的）。
- **IMP-011（i18n 基盤 & 自動車用語集）完了**: ロケール登録を 6 言語（ja/en/vi/id/fil/hi）に
  統一（`src/lib/i18n/locales.ts` が単一定義源）。メッセージファイル 4 言語追加、ドメインラベル
  全 6 軸を 6 言語化、自動車翻訳用語集（~28 用語）、`WithTranslations<T>` UGC 翻訳分離型を新設。
  vi/id/fil/hi 翻訳は推定（正式検証は IMP-051）。画面移行・ルーティング変更・DB マイグレーションなし。
- **IMP-010（デザイントークン & 共有コンポーネント基盤）完了**: 不足 UI プリミティブ8つ
  （SegmentedControl/StatusBadge/StatusCard/NextActionCard/ProgressCard/Alert/IconButton/
  BottomSheet）+ Badge dot + Button xl。v2.0 の色トークン値は不採用・既存デザインシステム維持
  （DECISION_LOG 2026-08-19）。
- **IMP-040（§8 部品装着インテグリティ 正準語彙）完了**:
  正準ドメイン語彙 7 軸目 `PART_INSTALLATION_STATES`（5 値）+ 遷移表 + 6 言語ラベル。
  Certificate Gate 部品整合性条件の導出関数 `derivePartsIntegrityOk()` 追加。
  DB 実装値(小文字)との対応は IMP-015 に委ねる。テスト 51 件。
- **IMP-034（§2/§4 タブレット 2-pane・共用端末 型基盤）完了**:
  3 段階デバイスクラス（mobile/tablet/desktop）、タブレット 2-pane 画面マッピング（4 ペア）、
  共用端末セッションモード・切替認証方式を型定義。UI コンポーネント・認証フロー変更なし。
  テスト 29 件。
- **IMP-033（§2 MORE メニュー IA 型基盤）完了**:
  MORE（その他）タブの項目構成を正準定義する `src/lib/navigation/moreMenu.ts` を実装。
  MoreMenuItem 型（10 項目、4 セクション）、権限ベースフィルタリング、
  プラットフォーム別表示制御（NFC 系はモバイル専用）、セクショングループ化。
  現行モバイル 7 項目を網羅しつつ、メンバー管理・店舗管理・同期センターを追加。
  UI コンポーネント変更なし（消費側が filterMoreMenuItems 経由で参照）。テスト 21 件。
- **IMP-032（§14 SYNC_CENTER 同期キュー変換・集計・競合解決）完了**:
  OutboxItem → SyncQueueItem マッパー（OutboxKind 5 種→ SyncResourceType 8 種変換、
  URL パターン推定、重複検出付き一括変換）、SyncSummary 集計計算（バッジ表示用カウント、
  要注意判定）、競合解決実行ロジック（戦略→アクション変換、不変更新適用、自動解決判定・
  一括自動解決）を `src/lib/sync/` に追加。IndexedDB 新ストア作成なし（メモリ上ビュー方式）。
  既存 outbox インフラ変更なし。テスト 54 件（合計 84 件）。
- **IMP-031（§19.1 例外フロー cancel/no-show/pause/追加作業 型基盤）完了**:
  案件例外フローの遷移評価器 5 本（evaluateCancel/evaluateNoShow/evaluatePause/
  evaluateResume/evaluatePartialComplete）を JOB_TRANSITIONS ベースで実装。
  例外メタデータ型（CancelReasonCategory 6/PauseReasonCategory 6/NoShowAction 3/
  PartialCompleteReason 5/JobExceptionEvent）、スコープ変更型（ScopeChangeCategory 5/
  ScopeChangeRecord/requiresApproval）を定義。jobStatusDisplay.ts に paused/no_show/
  partially_completed の表示構成を追加（ReservationStatus 5→8 値）。
  DB マイグレーション・API ルート変更なし。テスト 51 件。
- **IMP-030（§12.3-12.4 訂正・supersede・Integrity Incident・revoke 型基盤）完了**:
  訂正リクエスト型（5 状態 × 5 カテゴリ + 訂正可否判定 + 状態遷移検証）、
  Integrity Incident 型（6 カテゴリ × 3 重大度 × 5 状態 + revoke 可否判定 + 即時 revoke 判定）、
  版遷移ヘルパー（evaluateSupersede/evaluateRevoke/resolveVersionRedirect）を
  `src/lib/certificates/` に実装。Certificate Gate の `no_pending_corrections` 条件を
  実装接続（`correctionRequests` 入力追加、後方互換あり）。DB マイグレーションなし。テスト 57 件。
- **IMP-029（§13 通知・エスカレーション・Deep Link 中央通知エンジン型基盤）完了**:
  中央通知エンジンの型基盤を `src/lib/notifications/` に実装。(1) 通知タイプカタログ
  （18 タイプ × Severity 3 段 × Channel 6 種 × Category 11 種）、(2) Deep Link 生成
  （10 エンティティ × 3 ロール、実ルート構造に合致）、(3) SLA エスカレーション評価器
  （insurer-sla-alerts cron の純関数部分を汎用化）、(4) チャネル解決・要対応カウント・
  カテゴリグルーピング・重要度フィルタ。既存の用途別通知モジュールは変更なし（共存）。
  DB マイグレーションなし（純関数方式）。テスト 35 件。
- **IMP-028（§12 Certificate Gate 単一評価器）完了**:
  v2.0 §19.4 / ADR-0005 の Certificate Gate 10 条件を一括判定する純関数 `evaluateCertificateGate()`
  を `src/lib/certificates/gateEvaluator.ts` に実装。実装済み条件: required_evidence_present
  （写真枚数＋Before/After）、payment_policy_met（IMP-027 連携）、no_unresolved_alerts
  （IMP-026 連携）。残り 7 条件はデフォルト met:true のスタブ。活性化ルートへの統合は後続。テスト 17 件。
- **IMP-027（§11 支払いモデル — PaymentState 導出層・Policy 評価器）完了**:
  既存3系統（documents/payments/reservations）の支払いステータスから正準 PaymentState を
  導出する純関数3本（`deriveDocumentPaymentState`/`derivePoSPaymentState`/
  `deriveReservationPaymentState`）と、Certificate Gate の `payment_policy_met` 条件を
  評価する Policy 評価器（consumer/b2b/insurance の3ポリシー）を `src/lib/payment/` に実装。
  UNKNOWN 状態での盲目リトライ禁止ガード付き。DB マイグレーションなし（純関数導出方式）。テスト 40 件。
- **IMP-026（§10 顧客確認Web — 「気になる点を伝える」懸念提起フロー）完了**:
  確認フロー4系統（受領サイン・部品確認・板金同意・進捗追跡）に「気になる点を伝える」UI を統合。
  `customer_concerns` テーブル（DBマイグレーション）+ 顧客API（トークン→テナント逆引き）+
  管理者API（GET/PATCH）+ ブロック判定ヘルパー（`hasUnresolvedConcerns` — IMP-028 用）。
  customer_inquiries（一般問い合わせ）とは別系統。Certificate Gate への実際の統合は IMP-028。
- **IMP-025（§9 車両パスポート基盤 — PII遮断体系検証・車両顧客関係型モデル）完了**:
  パスポート公開サーフェスの PII 遮断をコンパイル時型アサーション（4型分）+テスト18件で体系的に検証。
  ADR-0006 に基づく車両顧客関係型モデル(`customerRelation.ts`)を新設 — 型のみ、DB変更なし。
  車両パスポートの既存インフラ（10マイグレーション、公開ページ、所有権移転、API、メタアンカー、
  ペイウォール、収益分配）は変更不要 — 既に稼働中。DB マイグレーション（関係テーブル化）は IMP-050 に委譲。
- **IMP-024（§7 音声→AI構造化→人間確認 — オフライン検知・多言語音声・備考接続）完了**:
  VoiceMemoPanel に3つの統合ギャップをクローズ。(1) オフライン検知 — AI 呼び出し前に
  `navigator.onLine` チェック、明示的エラー表示。(2) `speechLang` prop + `LOCALE_SPEECH_LANG`
  マッピング — Web Speech API の言語をハードコード ja-JP から呼び出し側指定に。
  (3) 証明書備考欄に VoiceMemoPanel(note variant)接続。モバイル音声は未実装（設計選択未解決）。
- **IMP-023（§7 JOB_EVIDENCE — 証跡凍結ガード・必須ショット進捗）完了**:
  (1) `certificate_images_guard` DB トリガーで発行済み/取消済み証明書の写真行 DELETE を
  DB レベルでブロック。証跡列 10 列の破壊的 UPDATE も拒否（sort_order 等の表示列は許可）。
  DELETE API route にトリガーエラーの 409 ハンドリング追加。設計原則 10 充足。
  (2) `evidenceProgress.ts` — 必須ショット宣言とアップロード済み stage の突合せ進捗計算
  （純関数）。テスト 8 件。
- **IMP-022（§6 Work List & Job Hub）完了**: 予約ステータス表示を単一定義源
  （`src/lib/domain/jobStatusDisplay.ts` — 5 値×色/ラベル/ヒント/variant）に統一し、
  4 箇所の重複 STATUS_CONFIG を置換。ステッパー情報階層（現ステップ拡大・完了/未着手圧縮）を
  JobStatusPanel + JobSignoffPanel に適用。Next Actions CTA をステータスで出し分け
  （作業前は証明書/請求書非表示、完了後は予約編集非表示、キャンセルは全非表示）。テスト 7 件。
- **IMP-021（§5 HOME — 3秒理解ホーム）完了**: ダッシュボードに NEXT ACTION セクション
  （最優先タスク 1 件を NextActionCard で提示）と今日の進捗 ProgressCard を追加。
  3 段階ワークスコープ切替（HomeScopeToggle — SegmentedControl ベース、自分/店舗/全店舗）。
  WorkScopeProvider（React Context）を新設。レイアウトを v2.0 §5 準拠に再構築
  （NEXT ACTION → 進捗 → 承認 → セットアップ → クイックアクション → タスク → 統計）。
  新 DB クエリなし（既存 fetchTodaySignals 再利用）。テスト 13 件。
- **IMP-020（ナビゲーション・検索・Quick Create 基盤）完了**: `src/lib/navigation/` に
  正準 5 タブ定義（Home/作業/車両/証明/その他 — v2.0 製品不変条件 #2 準拠）、Quick Create
  アクション 5 種（コンテキスト継承・権限ゲート付き）、ワークスコープ 3 段階
  （self/store/all_stores）を定義。Expo モバイルタブ再配置（車両・証明タブ新設、
  予約・会計をその他に移動）。Web MobileTabBar を正準タブに準拠。CommandPalette に
  エンティティ横断検索を統合（顧客/車両/証明書/請求書、300ms デバウンス）。テスト 28 件。
- **IMP-016（オフライン同期キュー・競合検出基盤）完了**: `src/lib/sync/` に
  同期キュー型（`SyncQueueItem` — 既存 OutboxItem の上位ビュー）、競合検出・解決型
  （`SyncConflict` 3 種別 × `ConflictResolutionStrategy` 4 方針）、リソースタイプ別
  デフォルト解決戦略を定義。イベントカタログに `sync.*` 5 イベント追加。テスト 30 件。
- **IMP-015（状態機械・遷移表・Certificate Gate 型）完了**: `src/lib/domain/transitions.ts`
  （正準 6 軸の遷移表＋汎用遷移検証関数）、`src/lib/domain/certificateGate.ts`
  （v2.0 §19.4 の 10 条件型定義）。既存値→正準値マッピングは各消費タスクで段階的に
  導入する方針を確定（DECISION_LOG 2026-08-19）。テスト 54 件。
- **IMP-001（実装ガードレール & 正準ドメイン語彙）完了**: `src/lib/domain/{states,labels}.ts`
  （6軸の正準値+ロケール別ラベル）、`docs/adr/0001`〜`0006`、アドホック状態禁止ルール
  （CLAUDE.md）。既存語彙との統一・マッピングは IMP-015 で判断済み。
- 起点タスク **IMP-000（リポジトリ監査 & 実装ベースライン）完了**。成果物:
  - `docs/implementation/current-architecture.md` — 実査に基づく現状マップ＋検証ベースライン＋不可逆リスク台帳
  - `docs/implementation/requirement-trace.md` — v2.0 要件 ⇔ 既存実装 ⇔ IMP タスクのトレース表（36タスク全件）
- コード変更ゼロ。v2.0 の正準語彙（JobState 12値等）と既存実装の語彙（reservations.status 5値等）は
  別体系であり、統一の要否は IMP-001 以降で判断する（DECISION_LOG 2026-08-19 参照）。

## 直近の開発フォーカス（git log 直近30件より、2026-07 時点）

- **モバイルの証明書写真キャプチャを WEB 真正性パイプラインへ統一（2026-08-09, branch claude/mobile-app-workflow-c8ucag）**: モバイルの施工写真を WEB と同一の真正性パイプライン（`/api/mobile/certificates/images/upload`→`uploadHandler`：ハッシュ・GPS/EXIF除去・TSA封印・撮影nonce消費・段階タグ・グレード）経由に統一。**カメラ限定（ライブラリ選択撤去＝強制起動）／撮影は端末非保存でDB直行／段階セレクタ（施工前・作業中・施工後）／撮影セッション単位の capture-nonce を全写真1リクエストで送信**。証明書詳細は正規 `certificate_images`（storage_path→公開URL）を段階/グレードチップ付きで表示し、「端末に保存」ボタンで**後から明示DL**（WEB管理は既存署名/公開URLでDL可）。バックエンドの真正性エンドポイントは既存（未使用だったものを結線・新設なし）。旧モバイル写真フロー（`work-photos` バケット＋`certificate_images` の存在しない列 image_url/reservation_id/caption）は実DBスキーマに対して壊れていたため撤去し、写真は証明書束縛の1系統に集約。端末アテステーション（Play Integrity/App Attest）と部品装着インテグリティのモバイル移植は別フェーズ（グレードは basic 超まで）。詳細は DECISION_LOG / RELEASE_LOG 2026-08-09。
- **モバイル(iOS)を Tap to Pay 込みで App Store 一般公開へ（2026-08-06, branch claude/ledra-tap-to-pay-strategy-v08fcp）**: 配布方針を旧 Custom Apps（招待制・手動配布）から**App Store 一般公開**へ転換。必須化する審査要件を実装——アプリ内サインアップ（`(auth)/signup.tsx`、既存 `/api/signup` 再利用）、アプリ内アカウント削除（`DELETE /api/mobile/account`、Apple 5.1.1(v)）、プライバシーマニフェスト（`ios.privacyManifests`）、ホームのTTP有効化バナー、push基盤（expo-notifications→`/api/mobile/push/register`）。Tap to Pay 決済フロー自体（専用ボタン・進捗・レシート・T&C導線）は既存実装済み。実機起動を阻んでいたRN系依存不整合(0.86→0.83.6)と、TTP location取得を阻んでいたStripe Terminal Locationの日本住所形式(address_kanji)も修正。審査動画3本の撮影は代表が実施（台本は `docs/tap-to-pay-submission-guide.md`）。Apple本番entitlement付与状況(A-1=未付与で確定)・要件1.6/3.2/4.1・単独owner退会時のデータ保持は要確認（OPEN_QUESTIONS 2026-08-06）。詳細は DECISION_LOG / RELEASE_LOG 2026-08-06。
- **レポート収益の施工店還元（2026-07-30 実装 → 2026-08-06 実送金・段階式まで main マージ, PR #848 / #851）**: 有料の車両履歴レポート売上を、記録を残した施工店へ**記録件数に比例して按分**し蓄積台帳（`vehicle_report_revenue_shares`）に計上。還元率は設定値 `merchant_share_bps`（既定 70%）。施工店ポータル `/admin/report-revenue` で「あなたの記録が生んだ収益」として可視化し**「技術が、資産になる。」を実体化**。**実送金（Stripe Connect 精算）・返金巻き戻し・段階式レポート（全履歴／直近Nヶ月）＋スコープ按分**まで PR #851 で main にマージ済み（squash `9ced4f3`）。人手承認（platform-admin）した `approved` の share を cron `/api/cron/vehicle-report-payout` が送金（`transfer.paid` 非発火のため finalize-on-create＋原子的claim）、`charge.refunded`/`transfer.reversed` で巻き戻す。開示範囲＝還元対象を同一 `scope_from` で一致させ、**開示0件の購入は checkout で拒否**（空レポート課金なし）。マージ前に Codex 自動レビュー9ラウンドで金銭移動の実バグ（誤reverse・資金の取り残し・空課金・DBエラー握り潰しによるcron無音）を解消し tsc/eslint/テスト32件緑。**還元率70%は【要確認】で、承認しない限り送金は走らない**安全弁付き。共有基盤の堅牢化（webhook自動replay化・booking↔refund完全アトミック化・durable transfer recovery 等）は**別issue #892**にトラッキング。詳細は DECISION_LOG / RELEASE_LOG 2026-07-30・2026-08-06。
- **AITURBO対抗フェーズ2（PR #832–#841, 2026-07-27）**: C2PA本格統合と多層GPS整合による真正性強化＋入力低摩擦化を一括実装・main反映。写真ファースト化(A2)・写真→施工内容Visionドラフト(A3 `photo.auto_draft_content`)、写真GPS×店舗の整合(C5・結果のみ保存)、C2PAマニフェスト要約の永続化/表示(B2)、外部C2PAマニフェスト検証(B3・原バイトに実施)、真正性エンジンへのC2PA/GPS統合(B4)、出張モバイルGPS＋作業場所照合(C4・`match_worksite`)。設計原則は**デフォルト無害・非決定的優先・生座標非保存・無駄な推論を呼ばない**。**B1 本番C2PA署名は env 有効化（コード変更なし）で未実施**、外部検証のステージング実サンプル確認・work_lat/lng保持期間・プライバシー文面は未確定（OPEN_QUESTIONS）。詳細は DECISION_LOG / RELEASE_LOG 2026-07-27。
- **AITURBO対抗フェーズ1（PR #830, 2026-07-27）**: 競合 AITURBO（株式会社ルクレ）の「写真を撮るだけ」低摩擦入力を既存資産の接続で吸収。写真打刻（EXIF撮影時刻→施工日/作業時間の提案 `photo.auto_work_stamp`・LLM不使用）、モバイル進捗ラベルの自動補完、C2PA署名への車両VIN封入、`stores` 位置座標列を追加。A2（証明書フォームの写真ファースト化）とPhase2（写真→施工内容Visionドラフト・C2PAマニフェスト永続化/外部検証・GPS整合チェック本体・出張モバイルGPS）は後続。詳細は DECISION_LOG / RELEASE_LOG 2026-07-27、競合分析は同日エントリ参照。
- LINE 会話フロー（Phase 1〜3: 自動予約・日程調整・可否ゲート・オプション提案・
  未登録車両の証明書分岐）の作り込み
- 予約ワークフローとメカニック稼働管理の連動、部品交換記録・証明書LINE通知
- 予約に「終日（1日お預かり）」対応（`reservations.all_day`）: 顧客Web予約・管理画面の
  両方で作成でき、終日予約は当日を丸ごと占有（ダブルブッキング判定・空き状況に反映）
- 顧客予約が入った際の店舗宛通知（メール常時 + Slack任意）を追加。宛先はテナント
  （加盟店）のオーナー/管理者。詳細は DECISION_LOG.md 2026-07-23 を参照
- 帳票管理（一括送付・顧客別集計・グラフ表示・車両情報表示）
- 電子帳簿保存法対応（本番稼働）: 確定帳票に SHA-256＋RFC3161 タイムスタンプの封印（真実性、TS局=DigiCert 公開TSA・本番実データで確認済み）、帳票一覧の金額・取引先検索（可視性）、帳票詳細の封印バッジ表示。封印検証UI・規程面は今後。
- マイグレーション運用の安全化（CHECK 制約は NOT VALID + VALIDATE で追加）
- モバイル/タブレットのUI不具合修正（サイドバースクロール、通知ドロップダウン）
- 運営向け店舗利用状況ダッシュボード（`/admin/platform/store-usage`）: 店舗別の
  月間操作回数・予約/作業記録/請求の累計・機能別利用率を横断確認（ログイン回数は
  未記録のため last_sign_in_at ベースのアクティブ会員で近似）

## 使い方

- 新しい決定は DECISION_LOG.md、実装・公開した変更は RELEASE_LOG.md、
  迷っていることは OPEN_QUESTIONS.md、note記事のネタは NOTE_CANDIDATES.md に書く。
- このファイルは上記4ファイルの要約を随時反映し、「今の状態」を1枚で把握できる
  ようにする。
