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

## 2026-07-27 SEOカテゴリ語を「施工履歴プラットフォーム」に統一 (branch claude/ledra-seo-keywords-7vnacz)
- 内容: 主カテゴリ語を PR TIMES と揃え「施工履歴プラットフォーム」に統一（旧「AI業務管理SaaS」から変更）。
  タイトル「Ledra｜自動車整備・コーティング店の施工履歴プラットフォーム」。`siteConfig`(single source) 経由で
  title/description/OGP/JSON-LD(applicationSubCategory)/Hero バッジ/Footer/OG画像/PDF/オンボメール等を一括統一
  （14ファイル27箇所）。keywords に「施工履歴プラットフォーム/施工履歴 管理/整備履歴 管理/整備記録簿 電子化」を
  追加（19語）。買い手検索語（整備工場 管理システム 等）は description/keywords に温存する二層構成。
- 対象: 公開マーケLP全体のメタデータ・構造化データ・OGP・ブランド表記。全業種（整備/鈑金/コーティング/PPF）。

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
