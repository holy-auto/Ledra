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

## 2026-07-15 Ledra UIキットを claude.ai/design に同期 (PR #760)
- 内容: `src/components/ui/` の46ファイル中31コンポーネントを、実際にビルド
  されたコード（esbuildバンドル + 実際のprops型 + レンダリング済みプレビュー）
  として既存の「Ledra Design System」プロジェクトに取り込んだ（15個は同期対象外
  ——アプリシェル結合・データ層結合・重い外部依存など、詳細は
  `.design-sync/NOTES.md` の exclusion 一覧）。うち16コンポーネント
  （Button, Card, Badge, Modal, Drawer, ConfirmDialog, フォーム系, StatCard,
  EmptyState, Skeleton, FloatingField, ToastProvider, SectionTag）はLedraの
  実際の業務文脈（施工証明書・車両・保険）に沿ったサンプルを手作業で作成し
  グレーディング済み。残り15個は実プロパティ型付きで機能するが、プレビュー
  カードは「未作成」の正直な表示のまま。**訂正（2026-07-17）**: 当初「33
  コンポーネント・残り17個」と記録していたが、その後のレビュー往復で
  `BarcodeScanner`（重い外部依存のため）を同期対象から除外し、実際の数値は
  31・15に変わった。
- 対象: claude.ai/design 上でのデザイン作業（Ledraの実コンポーネントを使った
  デザイン生成の土台）。**訂正（2026-07-17）**: 初回同期の時点ではアプリ本体
  （Next.jsランタイム）への変更は無かったが、その後のコードレビュー往復
  （Codex）で実際のアプリ側バグが複数見つかり修正した。詳細は次のエントリ。
- 副産物: 同期ツールのデフォルト設定 `guidelinesGlob` が `docs/` 配下の機密
  文書84件を巻き込む事故を未然に検知・修正（詳細は DECISION_LOG.md）。

## 2026-07-17 design-sync PR (#760) のレビューで見つかった実バグを修正
- 内容: claude.ai/design 同期作業のコードレビュー往復（Codex）で、
  `src/components/ui/` の複数コンポーネントに同期処理とは無関係の実バグが
  見つかり修正した。アプリ本体（Next.jsランタイム）への変更を含む:
  - `Drawer` のフォーカストラップ用 ref がパネル要素に未接続で、Tabキーが
    ドロワー外に抜けられた（アクセシビリティ）。
  - `Modal`/`Drawer` が閉じるたびに body のスクロールロックを無条件解除して
    おり、入れ子（例: Drawer内で開いたModal）を閉じると外側のオーバーレイの
    ロックまで解けていた。共有のref-countedロックに変更。
  - 同上の入れ子構成で、外側のキーダウンハンドラ（Escape/フォーカストラップ）
    が内側のダイアログにも反応してしまう問題。DOM包含関係 + 開いた順で
    「最前面」を判定する共有モジュール（`overlayStack.ts`）を追加。
  - `DataTable` の `sortable` 列がヘッダーの矢印だけ表示され、実際には行が
    並び替わらなかった。`sortValue` アクセサを追加し実装。
  - `FirstUseInlineGuide` の `tone="info"` が存在しない CSS トークンを参照し
    無効なスタイルになっていた。
  - `ConfirmDialog` のボタンに `type="button"` が無く、フォーム内に置かれると
    意図せずフォーム送信を発火し得た。
  - `FormField` のラベルが `<div>` で、フォームコントロールと
    `htmlFor`/`id` で関連付いておらず、クリックでフォーカスできず
    支援技術からも認識されなかった。
  - `DashboardWidgets` が localStorage の永続化データの形をバリデーション
    せず、壊れたデータで描画時に例外を投げ得た。
  - （design-syncの同期対象選定の過程で先に発見・修正済み: `border-border`/
    `border-divider` という存在しないTailwindクラスを使っていた
    `FloatingField`/`InspectionSignaturePad`/`Pagination` — 詳細は
    `.design-sync/NOTES.md`）
- 対象: 上記コンポーネントを使う全画面（Modal/Drawer/ConfirmDialogは
  アプリ全体で汎用的に使用）。design-sync自体はレビュー用の副次的な
  発見経路であり、修正内容はアプリのランタイム挙動に影響する。
- 判断: design-sync PR上で見つかったが、design-syncとは無関係の
  プリエクスィスティングバグのため、同じPR内で修正して1本化した
  （スコープが分かれるほど大きくないため）。

## 直近のリリース（git log 直近30件より、2026-07 時点で把握できるもの）

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
