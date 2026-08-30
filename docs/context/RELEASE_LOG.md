# RELEASE_LOG.md — 実装・公開した変更

> 「何を実装してリリースしたか」を人が読める粒度で記録する場所。コミット単位の
> 詳細は `git log` を参照すればよいので、ここには機能単位のサマリだけを書く。
> 新しい変更は先頭に追記（新しい順）。

## 2026-08-30 IMP-027（#942）を main へ取り込み。PaymentState 導出層・Policy 評価器、code-review 由来の修正4件

- 内容: IMP-027（§11 支払いモデル、branch impl/IMP-027-payment-model）を main へ取り込んだ。
  46ファイルの phantom conflict（main 側を採用）＋ resurrection 5ファイル（WorkScopeProvider.tsx /
  sync/* を7度目の再削除）を解消。`/code-review` 指摘6件のうち4件を修正:
  - `evaluateInsurance()` に UNKNOWN/CANCELED ガードを追加（保険承認後に決済が不明/取消に
    なっても `met: true` を返していたバグ。盲目リトライ禁止原則に反していた）。テスト2件追加
  - `derivePoSPaymentState` の exhaustiveness チェック変数を返り値として使い、未使用変数
    lint warning を解消
  - `derivePaymentState` の JSDoc に既存実装済みの「total <= 0 → PAID」分岐を追記
  - b2b の支払いサイクル未設定メッセージが `signoff/state.ts` と文言重複していたため、
    クロスリファレンスコメントを追加（統合はスコープ外として見送り）
  - 残り2件（B2B都度払いの CREDIT_APPROVED 未実装、payment/ 配下の呼び出し元ゼロ）は
    既存の設計方針の範囲内として不採用。詳細は DECISION_LOG 参照
- tsc/lint/vitest(4540件+新規2件)/check:schema/lint:migrations/check:migrations すべて green。

## 2026-08-30 IMP-026（#941）マージ後、db-migrate.yml が out-of-order で失敗——本番は直接確認したところ既に正しく適用済みだった

- 内容: PR #941 squash マージ後、`db-migrate.yml` が `customer_concerns` migration の
  out-of-order エラーで失敗した。本番 `supabase_migrations.schema_migrations` を直接
  SELECT し、`statements` 列の全文が私の最終修正版（`auth.users(id)` / `set_updated_at()` /
  `public.my_tenant_ids()`）と一致することを確認。さらに `customer_concerns` の実オブジェクト
  （列・FK制約・CHECK制約4本・インデックス4本・updated_at トリガー・RLS有効化・SELECT/UPDATE
  ポリシー2本、anon INSERTポリシーは無し=修正版どおり）も全種別 `pg_constraint`/`pg_indexes`/
  `pg_trigger`/`pg_policies`/`pg_class` から直接照会し、修正版と一致することを確認した
  （Codex レビュー指摘を受け、列・FKのみだった初回確認を全オブジェクト種別へ拡張）。
  db-migrate.yml の実行はこの1回のみで、再実行や後続実行は無い——にもかかわらず本番には
  正しい内容が存在する。git 経由の CI とは別経路で適用されたと推定するが、候補として
  挙げていた「Supabase MCP の apply_migration」は誤りと判明（apply_migration は呼び出し時刻
  ベースでバージョンを自動採番するため元の版番号 `20260820010000` のままでは載らない。
  Codex レビュー指摘で訂正）。版番号を保てる経路としては手動 `supabase db push --include-all`
  が最有力候補だが未検証。適用者・時期は特定できていない。
  `db-migrate.yml` の手動再実行（workflow_dispatch）を試みたが、現在のトークン権限では
  403 で拒否され、手動での green 化確認はできなかった。
- 対象: `supabase/migrations/20260820010000_customer_concerns.sql`（本番）。次に
  migrations を含む PR（IMP-027 以降）のマージ時、db-migrate.yml がこのファイルで
  再度 out-of-order にならないか確認する。詳細は DECISION_LOG「IMP-026（#941）マージ後、
  db-migrate.yml が out-of-order で失敗」参照。

## 2026-08-30 見積りフロー改善④: 停滞した見積り会話フローの再促し（nudge）cron（branch claude/line-chatbot-ledra-dy2fiq）

- 内容: お見積りの詳細（車検証写真 or 車種+年式）を依頼したまま一定時間ご返信が無い会話
  （`awaiting_quote_detail`）は、これまで 72h で黙って失効するだけで、放置された見積りリードを
  取りこぼしていた。失効前に **1回だけ「その後いかがでしょうか」の再促しを LINE で自動送信**する
  cron を追加（opt-in・既定 OFF）。
  - 対象は `awaiting_quote_detail` のみ（車検証/車種年式の再送だけで先へ進める“無状態”な再促しで、
    過去メッセージのボタン=日程/キャンセル候補の陳腐化を気にせず送れるため）。日程選択待ち等の
    再促しは古い候補ボタンの作り直しが要るため今回スコープ外。
  - 条件: 最終活動から既定24h停滞（`updated_at`）＋未失効（`expires_at` 未来）＋ line_user_id 紐付け
    ＋フォローアップ拒否でない。1会話につき1回（`notification_logs` type=flow_nudge で重複防止）。
- 実装: `src/lib/cron/flowNudges.ts`（`processStalledFlowNudges`）＋ `src/app/api/cron/flow-nudges/route.ts`
  （reservation-reminders と同じ cron-auth・`withCronLock`・opt-in テナントのキーセットページング）＋
  `vercel.json` に `0 10 * * *` を追加。opt-in キー `inbound_message.auto_flow_nudge`（actionCatalog）、
  ゲート `shouldNudgeStalledFlows`（orchestrator）、文面 `buildQuoteDetailNudge`（messages）。
  **マイグレーション不要**（notification_logs の type/target_type は自由文字列）。
- 検証: `flowNudges`（停滞のみ対象・新しい/失効は除外・dedup・未紐付けは送る・opt-out除外・
  失敗ログ）テスト8件追加。
- コードレビュー由来の追加修正（同 PR、`/code-review`）:
  - dedup ログ insert のエラーを握りつぶさず warn で可視化（送信成功後に insert 失敗すると翌日
    二重送信になり得るため。undo 不可なので送信自体は成功扱いのまま可視化）。
  - 停滞フロー取得に `order(updated_at asc)+limit(500)` を追加（PostgREST 既定行上限で無言に
    切れるのを避け、失効が近い会話から優先。溢れは翌日に dedup 済みで拾う）。
  - コード側の時刻再判定をエポックミリ秒比較に変更（ISO 文字列のオフセット表記差による誤判定を回避）。
- 全体 4474 件パス、tsc/eslint エラー0（既存 actionCatalog の `_key` 警告のみ）。
- #2「見積りフロー改善」の4件目（最後）。これで #2 の4項目が完了。

## 2026-08-30 IMP-026（#941）を main へ取り込み。check:schema・`/code-review`・Migrations Replay で計11件を修正、resurrection バグを6度目の再削除

- 内容: IMP-026（顧客懸念提起フロー、branch impl/IMP-026-customer-concern）を main へ取り込む際、
  マージ後の標準検証（`npm run check:schema`）・`/code-review`・CI の Migrations Replay で
  本PR自身のバグ11件を発見・修正。
  (1) `part_confirmation_signatures` の存在しない列 `part_installation_id` を SELECT していた
  （実列名 `installation_id`）— 本番では `parts_confirmation` 経由の懸念提起が 400 で失敗する
  状態だった。
  (2) 新設 `customer_concerns` テーブルが `scripts/schema.snapshot.json` に未登録だった —
  マイグレーション DDL から書き起こして登録。
  (3) `hasUnresolvedConcerns`（IMP-028 Certificate Gate 用のブロック判定）がクエリエラー時に
  fail-open していた — fail-closed（エラー時 true）に変更。
  (4) 同関数が tenant_id でスコープしておらず `src/lib/supabase/admin.ts` の CRITICAL 規約に
  反していた — `tenantId` 必須引数を追加。
  (5) `delivery_receipt`/`body_repair_consent` の token 解決が `purpose` 列を見ておらず、
  他フローのトークンと取り違えうる状態だった — 既存コードと同じ `purpose` フィルタを追加。
  (6) `customer_concerns` の Slack 通知が `customer_inquiries`（別系統と明言）と同じ webhook を
  共用していた — 専用の `SLACK_CUSTOMER_CONCERN_WEBHOOK_URL` を新設。
  (7) `z.enum(X as unknown as [string, ...string[]])` という型消去キャストを4箇所で全廃
  （`readonly T[]` 型注釈を外しタプル推論に任せるだけで解決）。
  (8) 懸念を再オープンした際に旧 `resolved_by`/`resolved_at` が残るバグを修正。
  (9) `hasUnresolvedConcerns`（過去にOR ロジックのリグレッション歴あり）にテスト7件を新設。
  修正・プッシュ後、CI の Migrations Replay（空DBからの全マイグレーション再生）が新規失敗し、
  マイグレーション自身のバグ2件を追加で発見・修正。
  (10) `resolved_by UUID REFERENCES profiles(id)` と RLS ポリシー2箇所が存在しないテーブル
  `profiles` を参照 — `auth.users(id)` / `public.my_tenant_ids()`（既存の確立済みパターン）に修正。
  (11) `EXECUTE FUNCTION update_updated_at()` が存在しない関数を参照 — 実在する
  `set_updated_at()` に修正。`npm run check:migrations` で「再生 OK（既知の9件を除く。増減なし）」
  まで確認。
  加えて、IMP-024/025 と同じ squash 履歴の断絶で `src/lib/sync/`・`WorkScopeProvider.tsx` が
  6度目の復活をしていたため再削除。
- 対象: `src/app/api/customer/concerns/route.ts`、`src/app/api/admin/concerns/[id]/route.ts`、
  `src/lib/concerns/{blockCheck,types}.ts`、`scripts/schema.snapshot.json`、`.env.example`、
  `supabase/migrations/20260820010000_customer_concerns.sql`。
  詳細は DECISION_LOG「IMP-026（#941）を main へ取り込み。check:schema・`/code-review`・
  CI の Migrations Replay で計11件を発見・対応」参照。

## 2026-08-29 見積りフロー改善③: 概算見積りに「正式見積り/相談」ボタン誘導＋文面整合（branch claude/line-chatbot-ledra-dy2fiq）

- 内容: LINE の概算見積り自動返信が「正式・詳細なお見積りはご来店時に承ります」で終わる**行き止まり**で、
  会話フロー（#993 で車検証OCR対応済みの正式見積りフロー）へ続く導線が無かった。むしろ概算は
  「来店で」・正式見積りフローは「LINEで送れば見積り送付」と**文面が矛盾**しており、そのせいで
  概算送信直後の自動フロー開始は意図的にスキップされていた（＝概算で会話が途切れていた）。
  - **ボタン誘導**: 概算返信の直後に「お見積りをお願いしたい」（→見積りフロー開始 `flow:start_quote`）・
    「スタッフに相談したい」（`flow:consult`）を添付（ナレッジ自動返信と同じ `buildFollowupButtons`）。
  - **文面整合**: ボタンを添えるときは締めを「正式なお見積りは下のボタンからLINEで承ります
    （車検証のお写真でより正確に）。ご来店でも承ります。」に揃え、概算＝来店のみ という矛盾を解消。
    正式見積りフローの入口 `buildQuoteDetailAsk`（車検証等で精度UP）と繋がるようにした。
- ボタン添付条件はナレッジ返信と同一（会話フロー opt-in 済み＋進行中フロー無し）。opt-in OFF や
  進行中フロー有りのテナントは従来どおりの素テキスト・来店案内で挙動不変。
- 実装: `quoteReplyAuto` に `attachButtons`／`buildRoughEstimateMessage` に `canContinueOnLine` を追加、
  `inboundAuto` から `attachFollowupButtons` を配線（ナレッジ返信と同じ値）。マイグレーション不要。
- 検証: `quoteReplyAuto`（ボタン付き=`sendCustomerLineButtons`＋start_quote/consult＋LINE整合文面／
  未指定=素テキスト＋来店文面）テスト追加。
- コードレビュー由来の追加修正（同 PR、`/code-review`）:
  - 金額なし分岐（総額0）でも `canContinueOnLine` 時は「お車を拝見して＝来店前提」の一文を出さない
    （締めの「LINEで承ります」と矛盾していた文面整合の取りこぼしを解消）。
  - `actionCatalog` の本アクション説明を「来店に誘導」からボタンで LINE 見積りフローへも誘導する旨に更新
    （runtime 挙動と capability 説明のドリフト解消）。
- 全体 4448 件パス、tsc/eslint エラー0。
- #2「見積りフロー改善」の3件目。後続: 停滞フローの再促し（最後の1件）。

## 2026-08-30 IMP-025（#940）を main へ取り込み。PII シールドの穴3件を修正、resurrection バグを5度目の再削除

- 内容: IMP-025（車両パスポート PII シールド、branch impl/IMP-025-vehicle-passport）を main へ
  取り込む際、`/code-review` で本 PR 自身の PII シールド実装に3件の穴を発見・修正。
  (1) `PIIFieldOverlap` はトップレベル `keyof` しか見ないため、`PassportVerifyResponse` の
  入れ子オブジェクト（vehicle/summary/meta_anchor/certificates[]）内の将来的な PII 追加を
  検知できなかった — 4つの入れ子形状を個別にチェックする assertion を追加。
  (2) `PublicTransferView` のチェックだけ共有レジストリを使わずハードコードされており、
  `current_owner_email`/`current_owner_name` の重複を見逃していた — `PIIFieldOverlap` ベースに
  統一し、`from_owner_email`/`from_owner_name` をレジストリに登録。
  (3) `VEHICLE_TABLE_PII_COLUMNS` が `customer_name`/`customer_email`/`customer_phone_masked`
  （マイグレーション20260321000002で既にDROP済み・実在しない列）を列挙する一方、実在する
  `plate_display`（ナンバープレート）が未登録だった — レジストリを実スキーマに合わせて修正。
  加えて、IMP-024 と同じ squash 履歴の断絶で `src/lib/sync/`・`WorkScopeProvider.tsx` が
  5度目の復活をしていたため再削除（IMP-025 が IMP-024 の再削除前のコミットから fork していたため）。
- 対象: `src/lib/passport/piiFields.ts`、`src/lib/vehicles/customerRelation.ts`、
  `src/lib/passport/__tests__/piiShield.test.ts`、`docs/context/OPEN_QUESTIONS.md`
  （未記載だった2件の未解決事項を追記）。詳細は DECISION_LOG「IMP-025（#940）を main へ
  取り込み。PII シールドの穴3件を `/code-review` で発見・修正」参照。

## 2026-08-29 IMP-024（#939）を main へ取り込み。squash 履歴の断絶で4度目の復活をしていた src/lib/sync/・WorkScopeProvider.tsx を再削除、VoiceMemoPanel の同時録音競合を修正

- 内容: IMP-024（音声メモ統合、branch impl/IMP-024-voice）を main へ取り込む際、37 ファイルが
  add/add 衝突。衝突していないファイルまで精査したところ、main の squash 済み履歴からは既に
  除かれている `src/lib/sync/`（index.ts・types.ts・conflict.ts・テスト）と
  `src/lib/navigation/WorkScopeProvider.tsx` が、衝突すら起こさずに作業ツリーへ復活していた
  （#935・#936・#937 に続く4度目）。`scripts/check-resurrected-files.sh` は今回誤って
  「OK」を返しており（ORIG_BASE が IMP-021 より前まで遡っていたため、削除される前の
  「追加」イベント自体が判定範囲に入ってしまった）、手動の `/code-review` で発見。5ファイルを
  再度削除。
- 内容2: 同じ `/code-review` で、証明書作成フォームに VoiceMemoPanel が2つ（施工内容用・
  備考用）並ぶ設計になったことで、片方が録音中にもう片方の `rec.start()` がマイクを奪う
  競合を検出。モジュールスコープの排他ロックで、同時に1つのパネルしか録音できないよう修正。
- 対象: `src/lib/sync/`・`WorkScopeProvider.tsx`（削除）、`VoiceMemoPanel.tsx`（排他ロック）、
  `CertNewFormWrapper.tsx`（死んだ dispatchEvent 呼び出しも削除）。詳細は DECISION_LOG
  「IMP-024（#939）を main へ取り込み。squash 履歴の断絶で4度目の復活をしていた
  src/lib/sync/・WorkScopeProvider.tsx を再削除」参照。

## 2026-08-29 certificate_images_guard を元の 20260820000000 へ戻す（本番は元の名前で既に適用済みだった）

- 内容: PR #996 の改名（20260820000000→20260829000000）マージ後、db-migrate.yml が今度は逆方向の
  "Remote migration versions not found in local migrations directory." で失敗した。本番の
  `schema_migrations` を直接確認したところ、`20260820000000/certificate_images_guard` が
  **元の名前のまま既に適用済み**だった（適用経緯は未確認）。改名（#996）は既に適用済みの
  ファイルを改名してしまっていたことになる——DECISION_LOG 2026-07-21／run #973 が警告している
  失敗パターンにそのまま該当。`20260829000000_certificate_images_guard.sql` を
  `20260820000000_certificate_images_guard.sql` へ戻し（SQL は無変更）、
  `supabase/__tests__/certificateImagesGuard.test.ts` のファイル名参照も元に戻した。
- 検証: `lint:migrations`（282件）OK・`check:schema` OK・`certificateImagesGuard.test.ts`（6件）OK・
  本番の適用済み全バージョンとローカルの全ファイルを機械的に突き合わせ、20260816010000 以降の
  差分ゼロを確認。
- 対象: GitHub Actions `DB migrate (apply to production)` ワークフロー。
- 限界: 20260820000000 が本番へ適用された正確な経緯（誰が・いつ）は未確認。改名前に本番の
  記録を都度再確認する運用を徹底する必要がある（DECISION_LOG 参照）。

## 2026-08-29 certificate_images_guard マイグレーションを改名し db-migrate の out-of-order 停止を解消

- 内容: PR #994 のマージ後、db-migrate.yml が
  "Found local migration files to be inserted before the last migration on remote database."
  で失敗した。`certificate_images_guard.sql`（PR #938 のドラフトが2026-08-20に作成、
  レビュー待ちの間に main が7本進んだ）が未適用のまま本番の適用済み最新（20260828000003）より
  古い日付になっていたため。`20260820000000_certificate_images_guard.sql` を
  `20260829000000_certificate_images_guard.sql` へ改名（SQL は無変更）。
  `supabase/__tests__/certificateImagesGuard.test.ts` のファイル名参照も同時に更新。
  このリポジトリで同じ停止は run #972・#976・#977 に続き4回目（DECISION_LOG 2026-07-21 の
  既存手順をそのまま適用）。
- 検証: `lint:migrations`（282件）OK・`check:schema` OK・`certificateImagesGuard.test.ts`（6件）OK。
- 対象: GitHub Actions `DB migrate (apply to production)` ワークフロー。
  `certificate_images_guard` トリガーの実体（保護ロジック）は無変更。
- 限界: レビュー待ちの長い PR が自身のマイグレーションバージョンを陳腐化させる構造的な
  問題は未解決。OPEN_QUESTIONS に起票。

## 2026-08-29 日程候補の精度向上: 日程変更で元予約の所要時間・代車・カテゴリを考慮（branch claude/line-chatbot-ledra-dy2fiq）

- 内容: LINE の日程変更（reschedule）セルフ対応で提示する日程候補が、これまで所要時間も代車も
  カテゴリも無視して「空いている枠」を一律に出していた。動かす対象の既存予約が持つ
  **実所要時間（end−start）・代車要否（loaner_car_id）** を使って候補を絞り、作業はあるが
  カテゴリ不明なので **受入制限枠は提案しない（excludeRestricted）** ようにした。
  - 副次バグの解消: 変更確定時に候補の end_time をそのまま新予約の end_time にしていたため、
    1時間の作業を3時間枠に移すと**予約が枠いっぱい（3時間）に膨らんでいた**。所要時間を
    渡すことで end_time が実作業時間（start+所要）に揃い、元予約の長さを保つ。
  - 所要時間に収まらない枠（fits=false）は顧客に提示しない（入れない枠を選べないように）。
- 実装:
  - `fetchFlowScheduleCandidates` に `estimatedMinutes` / `needsLoaner` / `excludeRestricted` を追加。
    needsLoaner 時は `loaner_cars` / `loaner_car_loans` を読んで空き代車を日別算出。fits=false を除外。
  - 代車の空き計算を純粋関数 `computeFreeLoanersByDate`（`booking/candidates.ts`）に切り出し、
    `booking-candidates` route（管理UI）と LINE 会話フローで**単一情報源**にした（在庫計算の二重実装を防止）。
  - `reservationDurationMinutes`（純粋関数）で end−start を分換算（終日/時刻なし/逆転は null）。
  - reschedule フロー起点・pick→slot・確定直前の再検証の3経路すべてで同じ条件を渡し、
    再検証の end_time 一致判定が壊れないようにした。
- 見積り（新規予約）フローは施工内容→品目→カテゴリ/所要時間の解決層が無く所要時間が不明なため
  従来どおり（estimatedMinutes=null）。人手（considerStaff）は今回スコープ外。マイグレーション不要。
- 検証: `candidates`（computeFreeLoanersByDate）／`scheduleCandidates`（所要フィルタ・代車ゲート・
  制限枠除外の結合）／`rescheduleFlowAuto`（元予約から所要・代車を渡すこと）テスト追加。
- コードレビュー由来の追加修正（同 PR、`/code-review`）:
  - **【重大】limit 食い潰しの解消**: `fits` 除外を `proposeCandidates` の `limit` 集計**後**に
    かけていたため、短い枠が先に limit を消費して入る枠が取りこぼされ、空き枠があるのに
    スタッフ引き継ぎになり得た。`proposeCandidates` に `onlyFitting` を追加し push（=limit 集計）
    より前に fits=false を除外。回帰テスト追加。
  - 確定直前の再検証を `start_time` 一致のみで同定（end_time は所要時間からの導出値なので照合に
    使わない。target 欠落時の誤コンフリクトを回避）。
  - reschedule テストで `reservationDurationMinutes` を本物（importActual）で検証。
- 全体 4444 件パス、tsc/eslint エラー0。
- #2「見積りフロー改善」の2件目。後続: 概算見積りにボタン誘導＋文面整合・停滞フローの再促し。

## 2026-08-29 IMP-023（#938）マージ後、本番にだけ存在した未追跡マイグレーションを復旧（db-migrate 停止解消）

- 内容: PR #938（証跡凍結ガード）を main へ squash merge 後、`db-migrate.yml` が
  "Remote migration versions not found in local migrations directory." で失敗した。
  本番 `cahybswpduchptvyvdkk` の `supabase_migrations.schema_migrations` を直接確認したところ、
  `20260828000003 / user_interface_preferences`（tenant_id・user_id・display_mode・
  onboarding_completed_at を持つテーブル。RLS 有効・SELECT ポリシーのみ）が本番にのみ記録されており、
  このリポジトリの git 履歴（squash 済み main を含め全履歴検索）に一度も出現していなかった。
  作成者・適用時期は特定できていない（このセッションの作業ではない）。DECISION_LOG 2026-07-21／
  過去3回（run #971・#973 ほか）と同じパターン（Supabase MCP の `apply_migration` による本番直接適用
  はリポジトリにファイルを残さない）。過去3件と異なり同一内容の別ファイルが repo に無いため、
  空プレースホルダではなく本番の `statements` をそのまま採録した
  `supabase/migrations/20260828000003_user_interface_preferences.sql` を追加して復旧した。
  `supabase migration repair`（本番台帳の書き換え）は使っていない——本番へは一切書き込んでいない。
- 検証: `lint:migrations`（281件検査）OK・`check:schema` OK（このテーブルはアプリコード未参照のため
  クエリ照合には影響なし）。
- 対象: GitHub Actions `DB migrate (apply to production)` ワークフロー全般（以後のマイグレーション
  自動適用）。`user_interface_preferences` テーブル自体はアプリコードから未参照で機能への影響なし。
- 限界: このテーブルの利用目的・書き込み経路（RLS に INSERT/UPDATE ポリシーが無い）は未確認
  【要確認】。誰が・いつ本番へ適用したかも特定できていない。OPEN_QUESTIONS に起票。

## 2026-08-29 見積りフロー改善①: 見積り詳細待ちの車検証写真をOCRで取り込む（branch claude/line-chatbot-ledra-dy2fiq）

- 内容: 見積り会話フローの詳細待ち（`awaiting_quote_detail`）中に顧客が車検証写真を送ると、
  これまでは OCR に配線されておらず「車種+年式テキスト」しか先に進めなかった。今回、写真を
  OCR（既存 `parseShakenshoAuto` を再利用）して車両（メーカー/型式/初度登録）を読み取り、
  見積りフローを前進させる。
  - 施工内容が既に context にあれば、写真の車両で正式見積り下書きまで作成（`maybeAdvanceQuoteFlowOnDetail`）。
  - 施工内容が未知（FAQ ボタン起点等）なら、読み取った車両を context に保持し施工内容だけ聞き返す
    （車両を捨てない）。
  - 車検証として読めない画像・車名不読は未処理（false）で通常の受信箱記録（スタッフ対応）に委ねる。
- 実装: `conversationFlowAuto.maybeAdvanceQuoteFlowOnPhoto`、文面 `buildQuoteServiceAskAfterPhoto`、
  `client.ts` の画像処理で車両撮影フロー（`handleVehiclePhotoMessage`）に該当しなければ本ハンドラを試す。
  OCR は身分証書類ソース（`identity_documents`）許可時のみ（既存 parse-shakken と同ゲート）。
  opt-in は既存の会話フロー（`inbound_message.auto_conversation_flow`）。マイグレーション不要。
- 検証: `conversationFlowAuto`（施工内容ありで draft／未知なら車両保持＋施工内容聞き返し／不読は未処理／
  フロー不在／ソース OFF）テスト追加。全体 4419 件パス、tsc/eslint エラー0（既存 client.ts の `text` 警告のみ）。
- コードレビュー由来の追加修正（同 PR、`/code-review`）:
  - **二重下書き防止（重要）**: `maybeAdvanceQuoteFlowOnDetail` を「下書き作成の前に quote_drafted を
    排他クレーム」する構造に変更（写真/テキストの再配信・連投で見積り下書き・お礼が二重に作られていた
    既存レースを解消。材料なしなら詳細待ちへ戻す）。写真経路もこれに合流。
  - 画像バイト列の Buffer コピーを 1 回に（2 ハンドラで二重確保していた）。
  - 未処理時に写真を二重記録しないよう記録タイミングを整理。
- #2「見積りフロー改善」の1件目。後続: 日程候補の精度向上・概算見積りにボタン誘導・停滞フローの再促し。

## 2026-08-29 IMP-023（#938）: 証跡凍結ガード。main 取り込み時に本番マイグレーションの設計不備を4件修正

- 内容: v2.0 §7 の証跡凍結ガード（`certificate_images_guard` DB トリガー）と必須ショット進捗計算
  （`evidenceProgress.ts`）を main へ統合。実装内容そのものは元の #938 のドラフト
  （2026-08-20、詳細は同日付の RELEASE_LOG エントリ参照）から変わらないが、
  **本番 DB へ自動適用されるマイグレーションを含むため、取り込み時の `/code-review` で
  4件の指摘を修正**した（うち1件は代表判断で公開区分「マイグレーション適用してマージ」の
  明示確認を得た上でのマージ）:
  1. **expired 証明書の凍結解除ループホール（重大）**: `NOT IN ('active', 'void')` を
     「制限なし」条件にしていたため、保証期間満了で自動的に expired へ遷移した瞬間
     （`cron/maintenance`）に凍結が解除され、まさに紛争が起きやすい満了後に写真の
     削除・改ざんが自由になる設計になっていた。`= 'draft'` のみを制限なしとする条件に
     修正（active/void/expired をすべて保護）。詳細は DECISION_LOG「IMP-023 凍結ガードの
     draft/expired 同列扱いは誤りだったため expired も保護対象に修正」参照。
  2. **DELETE API のストレージ削除順序**: `/api/certificates/images/[id]` が DB 行の
     ガード付き削除より先にストレージから実ファイルを消していたため、トリガーに
     ブロックされて 409 を返しても実ファイルは既に失われる状態だった。DB 削除を先に
     実行する順序へ修正。
  3. **polygon-backfill の書き込みエラー握りつぶし**: アンカー結果の UPDATE
     （`polygon_tx_hash`+`authenticity_grade` を1文にまとめていた）がガードにより
     拒否されても戻り値の error を見ておらず、成功扱いのまま進んでいた。tx hash の
     UPDATE（非保護列）と authenticity_grade の UPDATE（保護列）を分離し、後者が
     ブロックされてもアンカー自体の前進を止めないよう修正。
  4. **certificate_id の付け替えが証跡列チェックをすり抜ける穴**: 凍結保護対象の
     証跡列リストに `certificate_id` が含まれておらず、別証明書への付け替えで
     実質的に証跡を切り離せる潜在的な穴があった。リストに追加。
  - `evidenceProgress.ts` の同じ stage を共有する複数の必須ショットが同じ写真を
    二重にカウントするバグも合わせて修正（現時点で UI 未接続のため実害はなし、
    ミューテーションプローブ検証済みのテストを追加）。
  - `supabase/__tests__/certificateImagesGuard.test.ts` を新設（既存
    `partInstallations.test.ts` と同方式の静的 SQL 監査）。
- **同一 PR への Codex（`chatgpt-codex-connector[bot]`）レビューでさらに2件を追加修正**:
  5. **保護対象列の不足**: `processUploadedPhoto.ts` がアップロード時に一度だけ書き込む
     証跡フィールド（c2pa_manifest/c2pa_verified/external_c2pa_*/capture_nonce/
     capture_binding_reason/device_attestation_*/exif_*/gps_check_verdict/
     gps_distance_bucket/deepfake_score/deepfake_verdict）が凍結保護リストから漏れており、
     真正性判定の根拠そのものを発行後に書き換えられる状態だった。全16列を追加
     （polygon_tx_hash/polygon_network は事後アンカリングの正規更新のため意図的に対象外）。
  6. **polygon-backfill のグレード更新失敗を一律ガード扱いにしていた**: ガード拒否
     （P0001）以外の理由（ネットワーク断等）で失敗しても区別せず warn ログにしていたため、
     一時的な失敗が永久に再試行されなくなる恐れがあった。P0001 かどうかで
     ログレベルを分離。
  - **Codex は同時に、この移行が対応しきれていない3つの既知の限界も指摘**（マイグレーション
    ファイルのコメントに明記、この PR ではスコープ外）: (a) ガードが親ステータスを
    ロック無しで SELECT するだけなので、証明書の activate と写真 DELETE が真に同時に
    走ると理論上すり抜けられる TOCTOU（(b) certificates.status 自体は本ガードの対象外
    のため、active→draft のような逆方向遷移を直接 UPDATE されると凍結が解除される、
    (c) 親 certificates 行自体を削除する（ON DELETE CASCADE）と子の写真行はガードの
    「親が見つからない」＝「制限なし」判定に該当し、削除経路がすり抜ける。これら3件は
    `certificates` 側の別ガード・ロック機構が必要な、より大きな変更のため、IMP-030
    以降での対応を代表に提案・確認中。
- 検証: tsc/vitest(4408件)/lint/check:schema/lint:migrations すべて green。マイグレーションは
  main マージ後に `db-migrate.yml` が自動的に本番へ適用する（承認ゲートなし）。

## 2026-08-29 予約・作業状況の問い合わせにLINEで自動返信（新規、branch claude/line-chatbot-ledra-dy2fiq）

- 内容: 顧客が LINE で「作業どうなってる?」「いつ仕上がる?」等（intent=status_inquiry）と送ると、
  その顧客本人の直近予約の状況を自動返信する。対象選択は「作業中/来店受付（進行中）→ 直近の未来予約 →
  直近の完了」の優先順。稼働中の `reservations.status`（confirmed/arrived/in_progress/completed）に
  対応する顧客向け文言で返し、in_progress は `progress_pct` があれば進捗も添える。
- 本人確認: line_user_id 紐付け済みのお客様のみ（他人の予約状況を漏らさない）。未紐付け・対象なしは
  スタッフ引き継ぎ。opt-in `inbound_message.auto_status_reply`（既定 OFF、Standard+・AI 有効）。
- 実装: 新 intent `status_inquiry`（`inboundReservationExtract`）、起点 IO `statusReplyAuto.ts`、
  文面 `buildWorkStatusReply`/`buildWorkStatusHandoff`（`messages.ts`）、`inboundAuto` で
  キャンセル/変更の後・他返信の前に判定し早期 return。
- 正準 JobState へのマッピングは持たない（ADR-0002 / IMP-015 まで）。稼働中の 5 値だけを顧客向けに翻訳。
- 検証: statusReplyAuto（opt-in/対象選択優先順/未紐付け/対象なし/進捗表示）＋ inboundAuto ゲートの
  テスト追加。全体 4414 件パス、tsc/eslint エラー0。
- コードレビュー由来の追加修正（同 PR、`/code-review`）:
  - **越境情報開示の防止（重要）**: 顧客解決を**必ず line_user_id 紐付けから**行うよう変更。inboundAuto が
    AI 抽出のメール/電話から解決した customerId を渡してきても信用しない（本文に他人のメールを書いた
    未紐付けユーザーに他人の予約状況を返さない）。回帰テスト追加。
  - status_inquiry を `knowledgeReplyAuto` の許可 intent に追加（status 返信 OFF のテナントで、状況質問が
    ナレッジ返信に拾われなくなる回帰を防ぐ。can_answer 判定があるので過剰返信しない）。
  - `progress_pct` が 0（DB 既定）のとき「進捗 0%」を出さない（未設定と 0% を区別できないため）。
  - 予約取得クエリのエラーを「予約なし」と誤断定せず引き継ぎに寄せる（ログも残す）。
- スコープ外（後続）: 証明書・支払い状況の案内、複数予約の一覧提示、作業ステップ単位の詳細。

## 2026-08-29 予約前日リマインダー（キャンセル/変更ボタン付き、新規、branch claude/line-chatbot-ledra-dy2fiq）

- 内容: 翌日(JST)に未キャンセル予約があり LINE 紐付け済みのお客様へ、前日夕方に LINE で
  「明日ご予約です」を自動送信する新規 cron。self-cancel / self-reschedule の opt-in が ON なら、
  そのままキャンセル/日程変更できるボタン（`flow:start_cancel` / `flow:start_reschedule`）を添える
  （タップで既存のセルフ対応フローが起動）。予約1件につき1回だけ（`notification_logs` で dedup）。
- opt-in `reservation.auto_day_before_reminder`（既定 OFF、`actionCatalog.ts`/`orchestrator.ts`）。
  Standard+・AI 有効・`followup_opt_out` 尊重。LINE 紐付けが無ければ送らない（ボタン前提のため）。
- 実装: cron ロジック `src/lib/cron/reservationReminders.ts`、route `/api/cron/reservation-reminders`
  （UTC 09:00 = JST 18:00、`vercel.json` 登録）、メッセージ `buildReservationReminder`、postback
  ハンドラ `flow:start_cancel`/`flow:start_reschedule`（`conversationFlowPostback`、循環回避で動的 import、
  起動不可なら consult フォールバック）。
- マイグレーション不要: opt-in は既存 `tenant_ai_automation_settings.auto_actions`(JSON)、通知記録は
  既存 `notification_logs`（`type`/`target_type` は自由記述 text、`channel="line"` は既存 check 適合）。
- 検証: cron 本体（明日抽出・dedup・opt-out/未紐付けスキップ・ボタン有無・失敗ログ）＋ postback
  ハンドラのテスト追加。全体 4404 件パス、tsc/eslint エラー0。
- コードレビュー由来の追加ハードニング（同 PR、`/code-review`）:
  - opt-in テナント発見を **tenant_id キーセットページング**に（PostgREST 既定 1000 行上限で
    opt-in 済みテナントを無言で取りこぼさない。followUp.ts と同じ理由）。
  - discovery クエリの失敗を throw させ **`sendCronFailureAlert` に上げる**（全滅を「0 件成功」で
    隠さない）。テナント単位の失敗は個別に握って他テナントを止めない。
  - リマインダーのボタン起動が false（主因=進行中フロー有り）のとき、consult フォールバックで
    **無関係なフローを human_takeover に奪わない** no-op に（見積り等の進行中フローを守る）。
- スコープ外（後続）: 送信時刻のテナント個別設定、メール併用、複数日前（2日前等）の追加。

## 2026-08-29 日程変更の空き計算を「自予約除外」に精緻化（後片付け、branch claude/line-chatbot-ledra-dy2fiq）

- 内容: 日程変更（#987）で残していた「同日内変更時に候補が過少に見えうる」を解消。
  `fetchFlowScheduleCandidates` に `excludeReservationId` を追加し、動かす対象の予約を
  空き計算から除外する（`reservations` クエリに `.neq("id", …)`）。候補提示（1件/複数の両経路）と
  確定直前の再検証の 3 箇所で対象予約 ID を渡す。これで同日内の時間帯変更でも、対象予約が
  自分の旧枠を占有したまま数えられて候補が減る/自枠に弾かれることが無くなる（二重予約は従来どおり起きない）。
- あわせて `reservations/mutate.ts` の ponytail コメントを更新: admin route.ts のキャンセル/変更を
  共有ヘルパーへ寄せる単一情報源化は**行わない**方針に修正（認可モデルが異なるため。詳細は DECISION_LOG）。
- 対象: LINE 日程変更のセルフ対応（opt-in `inbound_message.auto_self_reschedule`）。
- コードレビュー由来の追加修正: `fetchFlowScheduleCandidates` の予約取得に **`all_day` を追加**。
  終日予約はその日の全枠を占有するが、未取得だと `proposeCandidates` の占有判定をすり抜け、満杯の
  終日予約がある日にも候補が出て二重予約になりうる既存バグを修正（canonical な booking-candidates
  route と同じ理由で `all_day` を含める）。LINE の見積り→日程提示フローにも効く共有関数の修正。
  ※ fake admin は列projectionを模さないため単体では観測不能。canonical route とのパリティで担保。
- 検証: `rescheduleFlowAuto` で `excludeReservationId` 引き渡しをアサート。全体 4386 件パス、tsc/eslint エラー0。

## 2026-08-29 IMP-022（#937）: Work List & Job Hub。main 取り込み時に3度目の復活バグを修正、検出をスクリプト化

- 内容: v2.0 §6 の Work List & Job Hub（ステータス表示の単一定義源
  `jobStatusDisplay.ts`・情報階層・CTA規律）を main へ統合。実装内容そのものは
  元の #937 のドラフト（2026-08-20、詳細は同日付の RELEASE_LOG エントリ参照）
  から変わらない。
- **main への取り込み時の `/code-review` で `src/lib/sync/` と
  `WorkScopeProvider.tsx` の復活（3回目）を検出・修正**: #935・#936 で二度
  発生し二度直したはずの「main で削除済みのファイルが古いブランチとの
  マージで衝突なしに復活する」バグが、#937 でも三度目の発生をした。今回は
  #936 時点で「検証済み」としていた検出手順（main の履歴を `git log
  --diff-filter=D` で辿る方式）自体に構造的な欠陥があったと判明: main の
  squash マージでは、1本のスタック PR 内で完結した「追加してから削除」が
  main の履歴に一切残らないため、main の履歴を情報源にする限り原理的に
  検出できない。検出方法を「main の履歴」ではなく「今回マージしている PR
  自身のコミットが当該ファイルを触っているか」に置き換え、
  `scripts/check-resurrected-files.sh`（`npm run check:resurrected`）として
  スクリプト化した。ミューテーションプローブ（削除前=検出・削除後=クリーン）
  で動作確認済み。詳細は DECISION_LOG「削除済みファイルの復活検出を3度目の
  失敗を経てスクリプト化した」参照。

## 2026-08-29 LINEで顧客が予約の日程を自分で変更できるセルフ対応（reschedule、branch claude/line-chatbot-ledra-dy2fiq）

- 内容: キャンセルのセルフ対応（#983）に続く第二弾。顧客が LINE で「予約の日程を変更したい」
  （intent=change_reservation）と送った時点で、**本人の今後の予約を提示（複数なら選択）→
  空いている新しい日程候補をボタンで選択→即時反映**（`scheduled_date`/`start_time`/`end_time`
  を更新＋Google カレンダー更新＋スタッフ通知）を自動化した。会話フロー基盤を再利用。
  - 締め切りは**作業日の前日まで**（キャンセルと同じ `scheduled_date > todayJst()`）。当日・過去・
    対象なし・**空き候補なし**・未紐付けはスタッフ引き継ぎ。反映は即時自動。
  - 新状態 `awaiting_reschedule_pick`/`awaiting_reschedule_slot`、新イベント
    `reschedule_pick_selected`/`reschedule_slot_selected`（`states.ts`/`interpret.ts`）。
    共有ヘルパー `rescheduleReservationById`（`reservations/mutate.ts`：日時更新＋gcal 更新、
    所有者＋締め切り＋終端ガード、`.select("id")` で 0 行更新を成功と誤認しない）。起点 IO
    `ai/automation/rescheduleFlowAuto.ts`、実行は `conversationFlowPostback.ts`。
  - 安全性: 確定直前に空き状況を再検証（埋まっていれば conflict 引き継ぎ）、closed 楽観クレームで
    二重更新防止、締め切りを実 DB 値で再検証。候補ボタン配信失敗時は行を `expired` に落とす。
  - 「その他の日程を相談する」（既存 `flow:cancel`→handoff）で人手にも切替可能。consult ボタンは
    self-reschedule のみ有効なテナントでも受ける（死にボタン回避）。
  - opt-in `inbound_message.auto_self_reschedule`（既定 OFF、`actionCatalog.ts`/`orchestrator.ts`）。
    会話フロー・自己キャンセルの opt-in とは独立。
- 対象: LINE 受信の AI 自動応答（全業種、Standard プラン以上・opt-in）。#983 とは別 PR。
- 検証: 単体テスト追加（`reservations/mutate`・`rescheduleFlowAuto`・`conversationFlowPostback`・
  `inboundAutoReplyGate`・`interpret`・`states`）。automation+line+reservations 299 件、全体 4373 件パス、tsc/eslint エラー0。
- コードレビュー由来の追加ハードニング（同 PR、`/code-review`）:
  - 変更先の日程も「前日まで」に揃える。`fetchFlowScheduleCandidates(fromDate)` を追加し、日程変更の
    候補は**翌日起点**で出す（当日への自己変更を防ぐ。締め切りの対象を旧日付だけでなく新日付にも適用）。
  - 変更先が埋まっていた場合、`closed` のままにせず `human_takeover` へ移す（スタッフがトークを
    引き継いで別日程を調整できるように。`handleSlotSelected` と挙動を揃える）。
  - 「その他の日程を相談する」引き継ぎに `logAutoActionExecuted` を追加（見積りフロー側と監査粒度を統一）。
- スコープ外（後続）: リマインダー本文へのキャンセル/変更ボタン添付、admin route.ts のキャンセル/
  変更処理を共有ヘルパーへ寄せる単一情報源化。

## 2026-08-29 IMP-021（#936）: 3秒理解ホーム。main 取り込み時に重大な復活バグと初期表示スコープの問題を修正

- 内容: v2.0 §5 のダッシュボード「3秒理解」（NEXT ACTION セクション・今日の進捗
  ProgressCard・3段階ワークスコープ切替 HomeScopeToggle）を main へ統合。実装内容
  そのものは元の #936 のドラフト（2026-08-19、詳細は同日付の RELEASE_LOG エントリ
  参照）から変わらない。
- **main への取り込み時の `/code-review` で5件を修正**（うち2件は重大）:
  1. **`src/lib/sync/` の復活（2回目）**: #935 で一度直した「main で削除済みの
     モジュールが古いブランチとのマージで衝突なしに復活する」バグが、#936 でも
     同じ理由で再発した。今回は機械的な検出方法を実際に作って検証し（DECISION_LOG
     「削除済みファイルの復活を機械的に検出する方法を作り、検証した」参照）、それで
     見つけて再度削除した。
  2. **ダッシュボード初期表示スコープの回帰**: `defaultScope(caller.role)` を
     無指定時のフォールバックに使うと、staff/viewer は今まで見えていた店舗全体の
     タスクが「自分の分だけ」に縮み、viewer はトグルが出ないため戻す手段も無くなる
     ところだった。代表判断が出るまで現状維持（"store" 固定）に変更。詳細は
     DECISION_LOG「IMP-021 の初期表示スコープは代表判断が出るまで既存の
     tenant-wide 表示を維持」参照。
  3. 新規テスト2件が UTC より遅いタイムゾーン（米国等）で失敗するバグを修正
     （`now` を深夜0時UTCから正午UTCへ変更、既存の姉妹テストと同じ規約）。
  4. `TodayOverviewSection` と `TodayTasksWidget` が同一リクエスト内で
     `fetchTodaySignals` を同じ引数で二重に呼んでいた（DB クエリが2倍）。
     `fetchTodaySignals` を React `cache()` でラップして解消。
  5. 死んだコード2件を削除: `WorkScopeProvider.tsx`（呼び出し元ゼロの投機的な
     抽象化）、`TodayTasksScopeToggle.tsx`（HomeScopeToggle に統合済みで
     import 元ゼロ）。
- まだ答えが出ていないこと: staff/viewer の初期表示スコープを self にすべきか
  現状維持でよいかは代表判断待ち。`todayTasks.ts` の日付計算が正のUTCオフセット
  （JST 等）で1日ずれる既存バグを発見したが、今回のスコープ外として保留
  （OPEN_QUESTIONS 参照）。
- テスト: 既存5件 + 修正後全通過。全4391テスト通過、`tsc --noEmit` クリーン、
  lint 0 エラー。

## 2026-08-20 IMP-026 §10 顧客確認Web — 「気になる点を伝える」懸念提起フロー（branch impl/IMP-026-customer-concern / PR #941）

- 内容: v2.0 §10 Customer Confirmation Web の残ギャップ「気になる点を伝える→Customer Issue
  作成→請求/証明ブロック」を実装。
  (1) `customer_concerns` テーブル（DBマイグレーション）— source_type 4系統
  （delivery_receipt/parts_confirmation/body_repair_consent/body_repair_tracking）×
  status 4状態（open/investigating/resolved/dismissed）×category 5分類。
  job_id/certificate_id FK によるブロック判定対応。
  (2) `RaiseConcernButton` コンポーネント — 4確認ページに「気になる点を伝える」UI を統合。
  ダーク/ライトバリアント対応（受領サインはダークテーマ、部品/板金はライト）。
  カテゴリ選択・テキスト入力・お名前・メール（任意）のフォーム。
  (3) 顧客API（POST /api/customer/concerns）— トークンからテナント/ジョブ/証明書を
  逆引き解決。レート制限+Slack 通知。管理者API（GET/PATCH /api/admin/concerns）。
  (4) ブロック判定ヘルパー（`hasUnresolvedConcerns`）— IMP-028 Certificate Gate で使用。
  (5) 型モデル（`src/lib/concerns/types.ts`）+テスト15件。
- 対象: 受領サイン・部品確認・板金同意・進捗追跡の4確認ページ。IMP-028 の前提条件。

## 2026-08-20 IMP-025 §9 車両パスポート基盤 — PII遮断体系検証・車両顧客関係型モデル（branch impl/IMP-025-vehicle-passport / PR #940）

- 内容: v2.0 §9 車両デジタルパスポートの残ギャップ2件をクローズ。
  (1) PII遮断体系検証 — `piiFields.ts` でコンパイル時型アサーション4型分（PassportCertCard /
  PassportData / PassportVerifyResponse / PublicTransferView）を導入。公開サーフェスの型キーが
  PII フィールドと重複しないことを TS 型レベルで保証。`piiShield.test.ts` で実行時検証18件
  （クエリ SELECT 列監査、フィールド形状検証、前所有者 PII 非露出検証）。
  (2) 車両顧客関係型モデル — ADR-0006 に基づく `customerRelation.ts` を新設。
  `VehicleCustomerRelation` / `VehicleRelationEndReason` / `PublicVehicleIdentity` 型と
  `VEHICLE_TABLE_PII_COLUMNS` / `PASSPORT_TABLE_PII_COLUMNS` レジストリを定義。
  DB マイグレーション（`vehicle_customer_relationships` テーブル化）は IMP-050 に委譲。
  車両パスポートの既存インフラ（DB / 公開ページ / 所有権移転 / API / メタアンカー）は
  変更なし — これらは既に稼働中。
- 対象: パスポート公開サーフェス全般。IMP-026/050 の前提条件。

## 2026-08-20 IMP-024 §7 音声→AI構造化→人間確認 — オフライン検知・多言語音声・備考接続（branch impl/IMP-024-voice / PR #939）

- 内容: v2.0 §7 の音声メモ→AI構造化パイプラインの統合ギャップ3件をクローズ。
  (1) VoiceMemoPanel にオフライン検知追加 — `navigator.onLine` チェックで AI 呼び出し前に
  明示的エラー表示（従来は無言のネットワークエラー）。
  (2) `speechLang` prop + `LOCALE_SPEECH_LANG` マッピング追加 — Web Speech API の
  `SpeechRecognition.lang` をハードコード `ja-JP` から呼び出し側が指定可能に（6言語対応
  の基盤）。
  (3) 証明書作成フォームの備考欄に VoiceMemoPanel(note variant)接続 — feature audit
  指摘の「ほぼゼロ工数」ギャップをクローズ。
  モバイル音声入力は未実装（OPEN_QUESTIONS.md に設計選択肢が記録済み、iOS マイク権限未設定）。
- 対象: 証明書作成フォーム、音声メモパネル、i18n ロケール基盤。IMP-026 の前提条件。

## 2026-08-28 IMP-020（#935）: ナビゲーション基盤は残し、モバイル画面は main の実装を採用

- 内容: (1) `src/lib/navigation/tabs.ts`（正準タブ定義 `CANONICAL_TABS`/`WEB_TABS`/
  `MOBILE_TABS`）・`quickCreate.ts`（権限ゲート+コンテキスト継承付き Quick Create、
  5アクション）・`scope.ts`（Role別ワークスコープ型定義）を新設。(2) CommandPalette
  にエンティティ検索（`/api/admin/search`、300msデバウンス）+ Quick Create セクションを
  統合。(3) Web サイドバーの `MobileTabBar.tsx` を `WEB_TABS` 参照に変更。
- **main への取り込み時の判断**: モバイルアプリのタブ画面6ファイル（タブバー本体・
  車両/証明書一覧・その他メニュー）は、#935 のドラフト作成（8/19）後に main 側で
  独立に本番相当の実装が入っていたため、**衝突解決では main 側をそのまま採用**し、
  #935 側のプレースホルダー実装は破棄した。詳細は DECISION_LOG 参照。
- 対象: モバイル下部ナビは v2.0 正準5タブ（ホーム/作業/車両/証明/その他）と一致済み。
  Web の CommandPalette は権限ゲート付き Quick Create に対応。モバイル FAB との統合・
  Role別スコープ切替 UI は未着手（IMP-021 待ち）。
- テスト: `src/lib/navigation/__tests__/navigation.test.ts` 28件追加。
- **`/code-review` の指摘5件を修正**（うち1件は重大）:
  1. **`src/lib/sync/` の復活**: main が #934 で削除済みのモジュールが、#935 の
     分岐時点がその削除より前だったため衝突なしで復活していた。再度削除。
     詳細は DECISION_LOG「マージが『衝突なし』で削除済みモジュールを復活させる
     ことがある」参照。
  2. `QUICK_CREATE_ACTIONS` の予約/顧客 href が存在しない `/admin/*/new` を
     指していた（実際は一覧ページの `?create=1` でモーダルを開く方式）。href を
     修正し、`ReservationsClient.tsx`/`ReservationsModeSwitch.tsx` に
     `?create=1` 対応を追加（`CustomersClient`/`CustomersModeSwitch` と同じ規約）。
     `applyCreateContext()` も、href が既にクエリを持つ場合に `&` で連結するよう修正
     （`?` が2つできるバグを防止）。
  3. `inferCreateContext()` の正規表現が `/admin/vehicles/new` 等の `new` を
     ID として誤って拾っていた（`vehicleId: "new"` のような存在しない ID が
     混入しうる）。`new` を除外するよう修正。
  4. `MobileTabBar.tsx` の権限フィルタが、`TAB_HREFS` と `TABS` が同じ配列から
     作られているため常に true になる死んだ分岐だった。削除して簡素化
     （意図（正準タブは権限で消さない）はコメントに残す）。
  5. `CommandPalette.tsx` のエンティティ→チップ変換が `entityResultsToChips()`
     （`src/lib/search/entities.ts`）と同種のロジックを手で再実装しており将来
     ズレる可能性がある。型が異なり単純な流用はできないため、ponytail コメントで
     並存を明記するに留めた（未着手）。
  テスト6件追加（`/new` 除外・`?create=1` href・クエリ連結）。全 4348 テスト通過、
  `tsc --noEmit` クリーン、lint 0 エラー。

## 2026-08-27 「正しく無いのが載るのはあかん」——遷移表を直してから通した（#933）／同期基盤は止めた（#934）

### #933: 正準遷移表の足りない辺を8件直してからマージ

`/code-review` が11件の「足りない辺」を出した。**現場を知らずに書き足さない**ため、
リポジトリの中に根拠があるものだけを直した。根拠は3種類 —— ADR、稼働中のコード、
同じファイル内の矛盾。

| 直した辺 | 根拠 |
|---|---|
| `UNPAID → PAID` / `→ PARTIALLY_PAID` | `StorefrontBilling.tsx:55-64` の「入金を記録 (本日)」が未入金の請求書へ `status:"paid"` を**直接書いている**。稼働中の1手操作 |
| `UNKNOWN → UNPAID` | §11.3 が禁じるのは「**UNKNOWN のまま**再決済」であって、照合して結果を確定させることではない |
| `READY → NOT_READY` | ADR-0005 決定1 の 10 条件には**後から崩れるもの**がある |
| `ISSUING → READY` / `VERIFYING → ISSUING` | ADR-0005 決定3。ジョブが動かす以上、**ジョブは失敗する** |
| `PENDING_CORRECTION` を `ISSUING` → `READY`/`NOT_READY` | READY を飛ばすのは決定4 が代表承認を求める「Gate バイパス」 |
| Severity の表をコメントに合わせる | コメントは「CRITICAL → NORMAL の直接降格だけ禁止」と書いていたが、表は `NORMAL → RESOLVED` も塞いでいた |
| `COMPLETED → IN_PROGRESS` | 同ファイルの `JOB_TRANSITIONS` が手戻りを許しているのに工程が再開できなかった |
| `SYNCING → PENDING` | 中断した同期に、起きていない `FAILED`（サーバに拒否された）を書くしかなかった |
| `CHECKED_IN → NO_SHOW` を**削除** | 入庫済みは「来店なし」になりえない |

**8件すべてを元に戻す mutation probe で11テストが落ちる**ことを確認した。
根拠の無い3件（REVOKED の到達範囲・部分キャプチャ・着手済み工程の SKIPPED）は
書き足さず、モジュール先頭に未解決として明記した。

あわせてレビューが見つけた実在の欠陥も直した ——
`isValidTransition` が `"toString"` で TypeError、`isTerminalState` が未知の状態を
「終端」と答える（稼働中の `reservations.status` の `completed` が完了扱いに化ける）。

### #934: 同期基盤は、修正を止めて設計の話として上げた

`/code-review` で5件直した直後に **Codex が同じ `src/lib/sync/` に7件返した。**
指摘が収束していないので1件ずつ潰すのをやめた。**二人のレビュアーが独立に
同じ結論に着いている** —— この module は「outbox がこういう情報をくれる」前提で
設計されているが、実際の outbox はその情報を持っていない。

- 409 を拾う経路が**二重に**塞がっている（`queue.ts:423` と `public/sw.js:359`）
- **ETag/version の楽観ロックはリポジトリに1件も無い。**409 はすべて重複・多重防止
- `OutboxItem` に tenant 欄が無く、`IdleAutoLogout` はキューを消さない
- `MenuItemsClient.tsx:299` の `kind:"other"` を `SyncResourceType` が表せない
- 証明書のオフライン作成は意図的に3種を順に積むのに、全部「競合」になる
- outbox が二度と送らないと決めたアイテムに「再試行」を出すことになる

### ついでに直した既存コードの穴（IMP-016 とは無関係）

- **`otp.ts`**: 壊れた有効期限で OTP が失効しなかった（`NaN < Date.now()` は false）
- **`permissionVerbs.ts`**: `platform:operations` が「閲覧」に分類されていた。
  未知の動詞の既定も `VIEW` → **`MANAGE`** に変更（低リスク側に倒さない）
- **prototype 素引きが4ファイル**: `transitions.ts`・`conflict.ts`・`negotiate.ts`・
  `catalogue.ts`。`table["constructor"]` が関数を返し、`?.` も `?? null` も捕まえない
- **`vehicle.created`** が「統一カタログ」に無く、足したら今度は `EVENT_RISK` 未登録で
  同義の `vehicle.registered`（medium）と格付けが割れた

## 2026-08-27 積み上がっていた実装 PR を main へ通し始めた（#928〜#932 マージ）

前のセッションが #928 → #929 → … → #951 と**前の PR をベースにして22本積み上げて**
いた。1本ずつ main へベースを付け替えて通す運用に切り替え、**6本をマージ**した。

| PR | 内容 | 状態 |
|---|---|---|
| #980 | SQL↔TS パリティテスト、`calcSizeClass` の丸めを SQL に合わせる | マージ済 |
| #928 | IMP-010 デザイントークン & 共有コンポーネント | マージ済 |
| #929 | IMP-011 i18n 基盤（6言語・用語集・翻訳分離型） | マージ済 |
| #930 | IMP-012 認証基盤（オンボーディング・OTP・端末・step-up・招待） | マージ済 |
| #931 | IMP-013 権限エンジン・店舗スコープ | マージ済 |
| #932 | IMP-014 ドメインイベント・監査・冪等 | マージ済 |
| #933 | IMP-015 状態機械・遷移表・Certificate Gate 型 | **マージ済**（遷移表を直してから） |
| #934 | IMP-016 オフライン同期キュー・競合検出 | **代表判断待ち**（下記） |

**#930〜#932 が追加したモジュールは、いずれも稼働中コードからの import が 0 件**
（`src/lib/auth/*`・`lib/events`・`lib/sync`・`lib/domain/{transitions,certificateGate}`）。
配線は後続タスクで行うので、マージしても実行時の挙動は変わらない。
#929 の `SUPPORTED_LOCALES` 2→6 も、唯一の実行時消費者 `responseI18n.ts` に
呼び出し元が 0 件なので同じ。

### 途中で見つけて直したもの

- **`useDialogA11y`**: フォーカストラップが `display:none` / `hidden` / `tabindex="-1"`
  の要素を候補に含めており、「最後の要素」を取り違えて**フォーカスがダイアログの外へ
  抜けていた**。body スクロールロックも、閉じたダイアログがマウントされるだけで
  他のモーダルのロックを解除していた。`Modal.tsx` / `Drawer.tsx` を同じ hook に
  載せ替えて**書き込み口を1つに**した（-126 行）。
- **`negotiateLocale`**: `Accept-Language: tl;q=0` が `fil` を返していた。
  RFC 9110 で `q=0` は「受け入れ不可」。候補から外していなかった。
- **`ProgressCard`**: `percent={0 / 0}` で `aria-valuenow="NaN"` と見える `NaN%` を
  描画していた。clamp は NaN を素通しする。
- **`WithTranslations`**: 「`shop_announcements.translations` の形式化」と書きながら、
  そのテーブルが実際に書いている `zh` を型が弾いていた（UI ロケール6言語に無い）。
  翻訳先の集合を型引数にした。
- **`isValidTransition`**: `"toString"` を渡すと `TypeError` で落ちていた。
  `?.` は prototype 由来の値を守らない。`isTerminalState` は未知の状態を
  「終端」と答えており、`reservations.status` の `completed` が完了扱いになった。

いずれも mutation probe（修正を戻すと落ちること）を実行確認したテストを添えた。
## 2026-08-26 LINEで顧客が予約を自分でキャンセルできるセルフ対応（第一弾・キャンセルのみ、branch claude/line-chatbot-ledra-dy2fiq）

- 内容: これまで `cancel` intent は抽出しても人手に回していたが、顧客が LINE で「予約を
  キャンセルしたい」と送った時点で、**本人の今後の予約を提示→確認ボタン→即時キャンセル**
  （`status=cancelled`＋`cancelled_at`/`cancel_reason`＋Google カレンダー削除＋スタッフ通知）
  を自動化した。会話フロー基盤（`line_conversation_flows` 状態機械）を再利用。
  - 締め切りは **作業日の前日まで**（`scheduled_date > 今日(JST, todayJst)`）。当日・過去・
    対象なし・未紐付けはスタッフ引き継ぎ。反映は**即時自動**（合意事項）。
  - 破壊的操作のため必ず確認ボタン（`flow:cancel_confirm`/`flow:cancel_abort`）を挟み、
    **本人の予約のみ**対象（`cancelReservationById` が tenant＋customer 一致を検証、既
    cancelled/completed は冪等 no-op）。確定直前に締め切りを再検証、closed 楽観クレームで
    二重実行を防止。
  - 新状態 `awaiting_cancel_pick`/`awaiting_cancel_confirm`、新イベント（`states.ts`/`interpret.ts`）。
    共有ヘルパー `src/lib/reservations/mutate.ts`（キャンセル＋gcal 削除）、起点 IO
    `src/lib/ai/automation/cancelFlowAuto.ts`、実行は `conversationFlowPostback.ts`。
  - opt-in `inbound_message.auto_self_cancel`（既定 OFF、`actionCatalog.ts`/`orchestrator.ts`）。
    会話フロー opt-in とは独立（キャンセルのボタン postback は会話フロー OFF でも処理）。
- 対象: LINE 受信の AI 自動応答（全業種、Standard プラン以上・opt-in）。#908 とは別 PR。
- 検証: 単体テスト追加（`reservations/mutate`・`cancelFlowAuto`・`conversationFlowPostback`・
  `inboundAutoReplyGate`・`interpret`・`states`）。automation+line+reservations 全 274 件パス、tsc/eslint エラー0。
- コードレビュー由来の追加ハードニング（同 PR、`/code-review`）:
  - 提示ボタン（キャンセル確認）が届かなければ作った `awaiting_cancel_*` 行を `expired` に落とす
    （残すと顧客はボタン無しで前進できず 72h 他フローも塞がる）。`cancelFlowAuto` と pick→confirm の両経路。
  - 「スタッフに相談したい」（`flow:consult`）を **self-cancel のみ有効なテナントでも受ける**
    （キャンセル選択画面にも出るボタンなので、会話フロー OFF だと死にボタンになっていた）。
  - 締め切り「前日まで」を **確定直前の実 DB 値**でも検証（`cancelReservationById(cutoffDate)`）。
    提示スナップショット依存の pre-check に加え、提示後にスタッフが当日へ日程変更した場合も安全。
  - `cancelReservationById` の UPDATE に `.select("id")` を付け、ガードで 0 行更新になったケースを
    成功と誤認しない（冪等 no-op として `alreadyFinal:true`）。
- スコープ外（後続PR）: 日程変更（reschedule、既存の日程候補提示＋既存予約 UPDATE の再利用）、
  リマインダーへのキャンセルボタン添付、admin route.ts のキャンセル処理の共有ヘルパー寄せ。

## 2026-08-26 SQL と TS の二重実装を機械的に突き合わせる（サイズ区分の丸め違いを修正）

「ズレは全部直さなあかん」への対応。洗い出した二重実装は2組だけだった
（`check_reservation_overlap()` は TS 側が RPC を呼ぶだけで実装が1つ ——
これが本来の形）。

**実害のあるズレが1件あった。** `calcSizeClass()` は生の体積で分類していたが、
SQL 側は呼び出し4箇所すべてが `ROUND((l*w*h)/1000000000, 2)` を渡し、
`vehicle_size_master.volume_m3` 自体も `numeric(5,2)` の生成列だった。

    4400×1765×1545mm → 生の体積 11.99847
      TS  : 11.99847 < 12.0     → "M"
      DB  : ROUND して 12.00    → "L"

**サイズ区分は価格帯に効くので、これは金額が変わる。** TS 側も丸めるよう修正。
現時点で食い違うデータは確認されていない（潜在的なズレ）。

あわせて `calcSizeClass` の入力ガードを関数側へ1回だけ置いた（`NaN` で
"XL"＝最も高い区分を返していた。呼び出し元5箇所すべてがガードしていたので
到達しなかったが、5箇所の記憶に頼らない）。0 と負値は**弾かない** ——
SQL は `0 < 8.0` で "SS" を返すので、弾くと新しいズレを作る。

**`supabase/__tests__/sqlTsParity.test.ts` を追加。** DB を起動せず、
マイグレーション本文から規則を抽出して TS と突き合わせる。既存の静的監査
（`posReceiptCounter` / `partInstallations`）と同じ置き場・同じ作法。

初版は**ズレを検出できていなかった**。`/code-review` が3つのプローブで再現:
`public.` 修飾つきの後発再定義が見えない / 文字クラスから文字を消すと assert
ごと消える / `NFKC` の一致がコメント本文で満たされる。いずれも緑のまま通って
いた。修正後は3つとも落ちることを実行確認した。

## 2026-08-26 VIN トリガーのマイグレーションを元の `20260825000000` へ戻した（2度の停止と復旧）

PR #967 のマージ後、`db-migrate`（本番への自動適用）が**2回止まった**。
どちらも同じファイル `vehicles_vin_normalized_trigger` が原因。

**1回目（out-of-order・run 32947490344）**

```
Found local migration files to be inserted before the last migration on remote database.
supabase/migrations/20260825000000_vehicles_vin_normalized_trigger.sql
```

PR #967 の作業中に、`main` とのバージョン衝突を避けて `20260823000000` → `20260825000000` へ
改名した。その後 `main` に #971〜#974 が入り本番の適用済み最新が `20260826000006` まで進んだため、
マージ時点で「適用済み最新より古い未適用ファイル」になっていた。

**2回目（remote にあるバージョンのファイルが repo に無い・run 32948320109）**

1回目の対処として `20260826000007` へ改名した（PR #976）。ところが**その間に
`20260825000000` が本番へ適用されていた**（`supabase_migrations.schema_migrations` に
`20260825000000 / vehicles_vin_normalized_trigger` が存在することを実データで確認）。
適用済みのバージョンを改名したので、今度は invariant 1 に抵触した。

```
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260825000000
```

これは #973 が直したのと**同じ間違い**である（「改名してよいのは未適用のものだけ」）。

**対処**: `20260825000000_vehicles_vin_normalized_trigger.sql` へ戻す。中身は一貫して無変更。
これで repo と本番の台帳が一致し、未適用のファイルも無くなる。
`supabase migration repair` は使わない（本番データの書き換えは代表判断）。

**本番のスキーマは正しく入っている**（実データで確認・2026-08-26）:

| 確認項目 | 実測 |
| --- | --- |
| `vin_normalize()` 関数 | 存在する |
| `trg_vehicles_vin_normalized` トリガー | 存在する |
| 車体番号ありで正規化列が NULL の車両 | **0台**（全25台中） |

つまり4か月間 `/v/[vin]` から引けなかった車両は、これで全部引けるようになっている。

**再発防止**: マイグレーションを含む PR は、マージ**直前**に本番の `schema_migrations` と
突き合わせる。`lint-migrations` は同一バージョンの重複しか見ず、`Migrations Replay` は
空DBからの再生なので、**どちらも本番の状態を見ていない**（詳細は DECISION_LOG 2026-08-26）。

**補足（本 PR）**

- 本番で実体まで確認した: トリガー `trg_vehicles_vin_normalized` が `vehicles` に実在し、
  VIN を持つ車両 **7/7** が `vin_code_normalized` 済み（2026-08-26 08:4x 実測。
  マイグレーション冒頭のコメント時点は6台で、その後1台増えた）。記録だけでなく
  バックフィルまで走っていた。
- **「適用済みを改名した」はこれで2度目。**1度目は `20260823000000_audit_logs_reconcile`
  （#972 で改名 → #973 で復元）。
- **事故を生んだのは `db-migrate.yml` の手順書そのものだった。** 運用コメントと Slack 通知が
  「out-of-order → 後ろの日付へ改名する」と**無条件に**書いており、「本番に入っていないことを
  確かめてから」が抜けていた。2回とも、その一文どおりに動いた結果である。両方に条件と
  確かめ方（バージョン名で名指しして引く／降順 LIMIT で代用しない）を書いた。

## 2026-08-26 デプロイと型生成の自動化を復旧させる

止まっていた2つの workflow への対応。**どちらも失敗ではなく無音だった。**

- **`vercel-deploy.yml`（新規・手動実行のみ）** — `vercel pull → build → deploy --prod`
  を回す。Vercel の GitHub 連携が 8/19〜8/22 のどこかで止まり、本番が `d2e4736`（8/17）
  のまま9コミット取り残されていた。デプロイ記録が Canceled も Error も含めて1件も
  作られていないため、リポジトリ側から明示的に叩ける経路を用意した。
  `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` が**未設定でもジョブは
  落とさない**（落とすと main が恒久的に赤くなり、本当の失敗が埋もれる。db-migrate は
  2026-08-02〜08-15 の13日間それで見逃された）。ただし `::warning::` とサマリで
  「デプロイしていません」と出す —— 印の付かない緑は「デプロイできている」と読め、
  このワークフローが直そうとしている無音そのものになる。失敗時は `db-migrate.yml` と
  同じ `SLACK_WEBHOOK_URL` へ通知する。**2026-08-26 02:28 に Vercel の Git 連携が
  復活した**（PR #975 で Preview が Ready）ため、二重デプロイを避けて起動を
  `workflow_dispatch` のみにした。push ブロックはコメントで残してあり、また
  無音で止まったら外せば戻せる。`vercel pull` を先に回すのは Vercel 側に
  登録された環境変数を取り込むため。CLI はバージョンを固定した（`@latest` だと
  破壊的変更が PR も CI も通らずに本番へ直行する）。docs だけのマージでは走らせない。
- **`db-typegen.yml`** — `--project-id` + アクセストークンをやめ、`db-migrate.yml` と
  同じ `SUPABASE_DB_URL` 1本に寄せた。4回連続で失敗していた原因は、
  `SUPABASE_PROJECT_ID` と `SUPABASE_ACCESS_TOKEN` が**空**だったこと。
  `db-migrate.yml` は同じ理由で既に `--db-url` へ移っており、db-typegen だけが
  取り残されていた（新しい判断ではなく、既存の規約への追従）。
  未設定時は CLI の `Access token not provided.` 任せにせず名指しで落とす。
  `create-pull-request` は `add-paths` で生成物1ファイルだけに限定し、ブランチ名を
  固定した（`run_id` を混ぜると実行のたびに別の PR が開き、同じタイトルの衝突する
  PR が積み上がる）。起動も `push` から **db-migrate の成功後**に変更 —— 両方が
  同じトリガーで並走しており、**適用途中のスキーマから型を作りうる**状態だった。
  出力は一時ファイルに書いて成功時だけ差し替える（CLI はエラーも stdout に書くので、
  直接リダイレクトすると失敗時に型定義がエラーJSONに化ける。実行して確認済み）。

この修正で分かったこと: 実機テストの指摘⑦⑧（カード番号入力と QR が出ない）は
モバイルの不具合ではなく、**本番が 8/17 のコードのままだったこと**が原因。
本番の `posQrSessionSchema` は `tenant_id` を必須にしており、新アプリは送らない。
本番に存在しない mobile API も6本ある（`/api/mobile/certificates`・`/documents`・
`/academy/lessons` と `/[id]`・`/messages` と `/[key]`）。
**モバイルを再ビルドしても、Web をデプロイするまで直らない。**

## 2026-08-26 実機テストの指摘8件に対応（モバイル）

代表の実機テストで出た8件。**5件は「ボタンはあるが `onPress` が空」**だった。

- **施工写真が「証明書が必要です」で弾かれる（無限ループ）** — 証明書が案件に
  紐づかないため。モバイルが `reservation_id` を送っていなかったのに加え、
  サーバの判定が「予約側が空」を矛盾として弾いていた（本番の予約169件のうち
  `customer_id` は5件・`vehicle_id` は0件なので、ほぼ全件が紐付かない）。
  判定を `linkToReservation.ts` の純関数へ切り出し、両方に値があって
  食い違うときだけ弾く形に変更。テストで固定済み。
- **証明書の PDF・QRコード・共有** — 3つとも空ハンドラだった。PDF は公開ルートを
  ブラウザで開く（Web と同じ生成経路）。QR と共有は公開URLを渡す。
  URL 組み立ては `lib/certificateLinks.ts` に集約（NFC もここへ統一。
  以前は `cert.ledra.co.jp` という別の既定ドメインを焼いていた）。
- **施工写真のプレビュー** — 画像は正常で、タイルがタップできる要素で
  なかった。拡大表示を追加し、読み込み失敗も表示する。
- **カード番号入力・QR が出ない** — コードではなく **Web デプロイ未反映**の症状
  （旧サーバは `tenant_id` を必須にしており、新アプリは送らない）。
  ただし失敗が無言だったので、エラー表示を追加した。
- **使用部品・資材** — 予約作成時にしか書けなかった明細を、案件から追加できる
  ようにした。見積額は再計算せず**足した分だけ引き上げる**（再計算すると
  `menu_items_json` 由来でない見積が消え、Web の POS が実額より小さく会計する）。
- **お客様確認** — 「未確認」のベタ書きをやめ、`reservations.signoff_*` から
  「未依頼／依頼済み・未確認／期限超過／確認済み」を出す。Web と同じ列を見る。
- **備考** — 空でも開けるようにした。

`/code-review` の指摘15件も反映済み（最重要は「1回目の修正が効いていなかった」）。

検証: web `tsc` / `vitest` 3903 tests / モバイル `tsc`・`expo lint`(0 errors)・
自己チェック13件 / `check-schema` OK。

**未解決**: お客様確認の依頼を送る導線がモバイルに無い（本番は169件すべて
`not_requested`）。既存45件の証明書の `reservation_id` は null のまま。

## 2026-08-26 本番へのマイグレーション適用が復旧（4回目で成功・未適用7本を適用）

- `db-migrate` が **success**（run 32915211501）。**3回連続の失敗から復旧した。**
- 本番の `schema_migrations` は 422 → **429件**。適用されたのは:
  `20260824020000_payments_stripe_pi_unique` /
  `20260826000001_audit_logs_indexes` / `000002_repair_drift_20260823` /
  `000003_revoke_anon_from_secdef_rpcs` / `000004_pin_function_search_path_round2` /
  `000005_repair_unreplayable_objects` / `000006_revoke_anon_round2`。
- 適用の効果を実データで確認:
  - `payments_stripe_payment_intent_id_key`（決済の重複防止インデックス）**存在する**
  - `search_path` が固定されていない SECURITY DEFINER 関数 **0本**
  - 未認証（anon）から呼べる SECURITY DEFINER 関数 **22本**
    （RLS ヘルパー19＋公開証明書1＋保険会社の自己登録2。想定どおり）
- 4回かかった理由は1つ ―― **MCP で本番へ直接当てた3件**が
  `db-migrate.yml` の2つの不変条件を壊し、さらにその修復中に
  適用済みファイルを改名して1つ目の条件を再び壊したこと。
- **次に同じことをしないための手順**: MCP で本番へ当てたら、その場で
  同バージョン名のファイルを repo に置く。改名の前に本番の
  `schema_migrations` と1件ずつ突き合わせ、**適用済みのものは改名しない**。

## 2026-08-26 走行距離の必須化を「発行の瞬間」へ移し、メーター写真の OCR 取り込みを足した

- **必須化の場所を発行のチョークポイント3本へ移した。**
  `PUT /api/admin/certificates/status`（draft→active / void→active）・
  `POST /api/certificates/activate-by-key`（オフライン発行）・
  `POST /api/mobile/certificates/[id]/activate`（モバイル発行）で、
  `maintenance_json.mileage` が有効値でなければ 400 で止める。
  判定は `certificateMileageKm()`（`src/lib/maintenance/mileage.ts`）1つ。
  写真必須ルール（`certificateHasRequiredPhotos`）と同じ位置・同じ形。
- **これで作成経路を1本も触らずに全経路が塞がる。** `POST /api/certificates/create` は
  必ず `status: "draft"` で作るため、外部APIから作られた証明書もこの3本を必ず通る。
  作成経路（Web / モバイル / 外部API / AI自動起票 / オフライン再送）が増えても漏れない。
  発行経路の数え漏れ自体を防ぐため、`triggerCertificateIssued` を発火するファイルを走査して
  全部がゲートを通っているか確かめるテストを足した
  （`src/lib/certificates/__tests__/activationGates.test.ts`）。
- **AI自動起票は走行距離が無い限り発行しない。** `certificateRecordAuto.ts` は
  insert で直接 `active` を作れる唯一の経路なので、そこにも同じ条件を課した。
  結果として自動発行は `draft` に落ち、承認インボックスで人が確認して発行する。
- **証明書フォームにメーター撮影→OCR 取り込みを足した**（`OdometerOcrButton`）。
  既存の `/api/admin/inspection-records/ocr`（`target=odometer`）をそのまま呼ぶ。
  `confidence < 0.7` と `warnings`（ブレ / 反射 / 一部欠け）は加工せず画面に出し、
  撮り直しを促す。読めなければ**何も入力しない** —— 常時表示の手入力欄にフォールバックする。
  OCR は下書きを埋めるだけで、発行するのは人（＝最終確認は人間）。
- **編集API (`PUT /api/certificates/edit`) は「入れられるが消せない」。**
  既存値がある状態で `mileage` の無い `maintenance_json` を送っても既存値を引き継ぐ。
  不正値（0・負・小数・`"35000km"`・配列）は 400。
  この編集APIがそのまま**遡及入力の経路**になる（DBトリガーは `UPDATE OF maintenance_json`
  でも発火し、`vehicle_mileage_logs` に積まれる）。専用画面は作っていない。
- **証明書詳細の編集フォームに走行距離欄を足した**（メーターOCRボタン付き）。
  発行前の下書きと、必須化より前に作られた証明書の遡及入力を兼ねる唯一の窓口。
  空欄で保存しても既存値は消えない。
- 使われていない Server Action `activateCertAction` / `voidCertAction` と
  `CertStatusActions.tsx` を削除した（どこからも描画されておらず、写真ゲートも通らない経路だった）。
- **走行距離ゲートは初回発行 (draft→active) のみ。** `void→active` の再発行に掛けると、
  必須化より前の走行距離なしの証明書を void した瞬間に戻せなくなる
  （編集フォームは void 中は出ないので入力窓口が無い）。
- **承認インボックスと案件サインオフの「発行」ボタンを修正した。** どちらも
  `POST /api/admin/certificates/status` を叩いていたが、このルートは `PUT` しか
  公開していないため 405 で必ず失敗していた（今回の変更以前からの不具合）。
- 既存45件の一括バックフィルはしない（施工時点のメーター値の復元元が無い。
  判る分だけ編集APIから入れる）。詳細は `docs/mileage-followup-checklist.md`。

## 2026-08-26 db-migrate を3回目で緑にする — 適用済みのファイルを改名してはいけない

- #972 のマージで `db-migrate` が**3回目**の失敗（run 32914468133）。
  `Remote migration versions not found in local migrations directory.` が
  `20260823000000` について再発した。
- **原因は私の誤り。** `20260823000000_audit_logs_reconcile.sql` は #971 の
  マージ時（run 32913587260）に**本番へ適用されていた**。out-of-order の
  対処として7本を改名したとき、この1本も一緒に改名してしまい、
  「本番にあるバージョンのファイルが repo に無い」状態を自分で作った。
- **「本番 DB は変更されていない」と2度述べたが誤りだった。** 実際には
  `audit_logs_reconcile` が適用されていた（冪等な修復マイグレーションなので
  害は無く、いずれ適用されるはずのものではあった）。
- 対処: `20260826000000` → `20260823000000` に戻す。適用済みなので
  out-of-order の判定対象にはならない（未適用のものだけが判定される）。
- 教訓: **改名してよいのは未適用のものだけ。** 改名の前に、本番の
  `schema_migrations` と1件ずつ突き合わせること。ログのエラー文だけを見て
  対処すると、次の状態を作ってしまう。

## 2026-08-25 PR #926 をマージ / db-migrate の停止を解除（#971）

- **#926 をマージした**（squash、`528ffd5`）。IMP-000 の監査ドキュメントから
  スキーマ照合・決済の重複防止・`store_id` をサーバが決める対応まで一式。
- マージで起動した `db-migrate` が失敗した。本番の `schema_migrations` に
  記録されているのにリポジトリにファイルが無いバージョンが3件あり、
  `supabase db push` が適用前の照合で停止した。
  **本番 DB は変更されていない**（未適用の8本は1本も走っていない）。
- 原因は Supabase MCP の `apply_migration` で本番へ直接当てた3件
  （`20260824005513` / `20260824011814` / `20260824012132`）。この方式は
  Supabase が採番したバージョンを台帳に記録するだけでファイルを作らない。
- 対応（#971）: 本番のバージョンに対応するコメントのみのファイルを3つ置いた。
  SQL の実体は既存の3ファイルが持つ。本番のデータは書き換えていない。
- **1回では終わらなかった。** #971 をマージすると今度は不変条件2（out-of-order）で停止した。
  MCP が採番したバージョン（08-24 00:55〜01:21）が repo の未適用ファイルより新しく、
  未適用7本が「適用済み最新より古い」状態だったため。**同じ近道が2つの不変条件を壊していた。**
  対処は7本の改名（`20260826000000`〜`000006`）。ただし `audit_logs_reconcile` は
  **この時点で既に本番へ適用済み**だったため改名してはならず、3回目の失敗を招いた
  （`20260823000000` に戻した）。`--include-all` は順序不変性が崩れるため
  DECISION_LOG 2026-07-21 で不採用と決めてある。
- 検証: `lint:migrations` PASS（276本）/ 空DBからの再生 PASS（既知の9件のみ・増減なし）/
  不変条件1・2を機械的に照合して違反ゼロを確認。

## 2026-08-25 Web から作った行にも `store_id` が入るようにした

- **`src/lib/stores/resolveStoreId.ts` を1つ作り、作成経路をそこへ通した。**
  指定があればそのテナントの店舗かを確かめて使い、指定が無ければ
  **有効な店舗がちょうど1つのときだけ**入れる。2つ以上なら推測で入れない。
- 通した経路（14箇所）: 証明書2経路（`createCertificate` と
  `/api/certificates/create`）と証明書の複製／予約6経路（管理・お客様予約・
  取引先 API・モバイル・仮押さえの変換・Google カレンダー取り込み・AI 起票2種）／
  POS の売上記録（現金・タッチ決済・カード番号入力・QR がすべて `recordPosSale` を
  通る）／入金の手動作成と更新／顧客登録の招待とリンク／レジの登録。
- **他テナントの店舗 ID を通さなくなった。** `store_id` の外部キーは `stores(id)` を
  指すだけでテナントの条件が無いため、`/api/mobile/reservations`・管理画面の
  入金作成/更新・顧客登録の招待とリンクは送られた店舗 ID をそのまま書いていた
  （他店の行として記録できた）。入金の更新は汎用ループが `store_id` を素通しにしていた。
- **止めてよい所と、止めてはいけない所を分けた。** 会計の記録は既にカードが切れて
  いるので、店舗が決まらなくても `store_id` を空にして売上は残す（失敗にすると
  再操作しても同じ所で落ち、**金は取れたのに記録が無い**状態が固定される）。
  公開予約・カレンダー取り込み・AI 起票も止めない（`storeIdOrNull`、理由をログに残す）。
  手で入力する経路だけ 400 で弾く。
- **照合に失敗したときは「無かった」と読まない。** 一時的な失敗を
  「そのテナントの店舗ではない」と読むと正しい作成を弾き、「店舗が無い」と読むと
  黙って null を書いてこの関数を足した意味が消える。
- 指定された店舗も `is_active` で絞る（既定を選ぶ側だけ絞っていて、
  「指定すれば無効な店舗にも書ける」ずれがあった）。
- 証明書の複製が `store_id` を落としていたのを直した（コピーだけが
  店舗で絞った画面から消える）。
- `registers` にだけ手書きされていたテナント確認を共有関数に置き換えた。
- 実測（2026-08-25 時点の本番）: 証明書 45/45・予約 169/169・入金 11/11・
  顧客登録の招待 5/5・店舗用リンク 1/1 が `store_id` null。**既存行の穴埋めは
  未実施**（代表判断待ち）。
- 店舗の選択 UI は作っていない。本番の3テナントはいずれも有効な店舗が1つで、
  サーバ側の既定で全件埋まるため（`StoreSelector` は存在するがどこからも
  描画されていない死んだコードのまま）。
- 判定を壊すとテストが落ちることを確認済み
  （`src/lib/stores/__tests__/resolveStoreId.test.ts` の2件が失敗する）。
- `/code-review` の指摘14件を反映済み。うち自分が書いた事実誤り2件
  （`StoreSelector` の描画状況・`store_id` の外部キー）と、
  カード決済後に店舗の照合で売上を落とす実害1件を出荷前に潰した。

## 2026-08-25 Stripe Terminal のリーダーは導入しないと決定

- カード番号が必要な会計は、2026-08-24 に入れた Stripe Checkout（お客様が入力）で回す。
  リーダー上の手入力が日本で有効化できるかは【要確認】のまま残る。
- モバイルは新ビルドを配布する（`pos_checkout` の service_role 化以降、
  旧ビルドでは会計が失敗するため）。

## 2026-08-25 カード決済の重複防止を全経路に効かせた

- **`src/lib/pos/recordSale.ts` に売上記録の入口を1つ作った。** 同じ PaymentIntent が
  既に記録されていれば `pos_checkout` を呼ばず1件目を返す。一意制約に当たった場合は
  **失敗として返す**（黙って ok にすると二重請求が見えなくなる）。
- タッチ決済（Terminal）・カード番号入力（Checkout）・**Web の POS の QR 決済**が
  すべてこの関数を通る。起票時は気づいていなかったが、Web 側にも同じ穴が空いていた。
- **鍵はクライアントに送らせない。** `posCheckoutSchema` が受けるのは
  Checkout Session（`cs_`）で、サーバがそれを Stripe から取り直して
  支払済み・テナント一致・金額を自分で確かめ、PaymentIntent を引く
  （`resolvePaidCheckoutSession`）。`pi_` を直接受けると、**記録済みの値を
  現金会計に付けて売上を消せてしまう**。
- 金額も Stripe の実額（`amount_total`）で記録する。
- 照合は一意インデックスに合わせてテナントで絞らない。照合が失敗したら
  **作らない**（失敗を「無かった」と読むと重複を作る）。
- Web の POS: 記録に失敗しても「記録中...」で止まらず、**同じセッションで
  やり直せる**ボタンを出す（新しくQRを出すと二重に請求される）。
  重なったポーリングで2回記録するのも止めた。
- Web の POS の会計完了パネルが `{ok, result}` の封筒を読んでいて
  「お会計 -」・領収書番号なしになっていたのを修正（既存の不具合）。
- 記録済みだった場合は在庫を引き直さない（従来の形だと在庫だけ二重に減る）。
- 重複防止の分岐を外すとテストが落ちることを確認済み（`src/lib/pos/__tests__/recordSale.test.ts`）。

## 2026-08-24 決済まわりの取りこぼしを修正（code-review 指摘13件）

- **カードが既に切れている時は、新しい決済を作らせない。** タッチ決済は
  確定後に記録で落ちると `pendingCapturePaymentIntentId` が残る。この状態で
  「カード番号で決済」を出すと**客が二重に請求される**。`tapFailureAction()` が
  `retry_record`（記録のやり直しだけ）と `card_entry` を出し分ける。
- **金額と明細はリンクを作った時点で固定する。** ポーリング中にカートを編集
  できるため、決済完了時の値で記録すると Stripe の請求額と食い違っていた。
- **記録に失敗したら画面を移さない。** 従来は Snackbar を出した直後に
  レシート画面へ遷移しており、店員はエラーを見られなかった。再試行ボタンを出す。
- **やめた時に Checkout Session を失効させる**（`DELETE /pos/checkout/qr-session`）。
  30分生きるので、端末で開いたページから後で決済できてしまっていた。
- **`/pos/qr-complete` を作った。** success_url が指しているのにページが無く、
  決済後に 404 が出ていた（店の端末で開けるようにしたので店員の目にも入る）。
- **入金先テナントをクライアント任せにしない。** `qr-session` はペイロードの
  `tenant_id` で Connect アカウントを引いていた。トークンのテナントを使う。
- 2画面の重複を `useCardEntry()` に集約。支払方法を変えた時の状態の消し忘れ、
  ボタンの二度押し、リンクを開けなかった時の無反応も合わせて修正。

## 2026-08-24 タッチ決済が読めない時のカード番号決済 / 予約QR決済の記録漏れを修正

- **タッチ決済が失敗した直後に「カード番号で決済する」導線を出すようにした。**
  押すと Stripe Checkout のセッションを作り、QR とリンクを出す。カード番号は
  Stripe の画面に入力されるので、Ledra は番号を受け取らない（PCI の範囲外）。
- **「この端末で開く」を追加。** お客様のスマホが無い／QR を読めない時に、
  店の端末で決済画面を開いて渡せる。
- **予約の会計画面の QR 決済が記録されていなかったのを修正。** 決済完了後に
  `/pos/checkout` を呼ぶ。従来は記録せずレシート画面へ遷移していたため、
  **カードは切られているのに payments に1行も残らず、レシートも出なかった**
  （Stripe の webhook にも POS の Checkout を受ける処理は無い）。
- **この経路の売上は `card` として記録する。** 経路は QR と同じでも実体はカード。
- 2画面に重複していた QR カードを `CardEntryPanel` に集約。判定は
  `shouldOfferCardEntry()` / `recordedMethod()` に出し、自己チェックで固定。

## 2026-08-24 店舗で絞ると一覧が空になる不具合を修正（証明書・予約・作業・POS）

- **モバイルの店舗絞り込みを `scopeToStore()` に集約した**（`apps/mobile/src/lib/storeScope.ts`）。
  従来の `.eq("store_id", 店舗ID)` を「店舗一致 **または** 店舗未設定」に変更。
  本番の `store_id` は certificates 45/45・reservations 169/169・payments 11/11 が
  すべて null で、**店舗を選んでいる端末では一覧が必ず空**になっていた。
  差し替えたのは8箇所（ホーム4・作業・証明書・予約・POS）。
- **モバイルの作業タブが 400 を返し続けていた**のを修正。select 文字列の中に
  `//` の注記が入っており、PostgREST がそれを列名として受け取っていた。
- **`/api/admin/certificates` の検索が 400 になる**のを修正。`certificates` に無い
  `plate_display` / `vehicle_maker` / `vehicle_model` で絞っていた。
- **スキーマ照合の穴を2つ塞いだ**（`scripts/check-schema.mjs`）。
  (1) 埋め込みの別名を `:` の後ろだけで判定していたため、select 内のコメントが
  別名として飲み込まれて素通りしていた。(2) `query = query.or(...)` のように
  代入で足したフィルタを見ていなかった。どちらも**壊れた状態で落ちることを確認**済み
  （`scripts/__tests__/check-schema-parse.test.ts` に固定）。

## 2026-08-24 積み残し6件と判断待ち4件を実施 / OPEN_QUESTIONS 65件を棚卸し

- **マイグレーションの再生を CI で見るようにした**。`npm run check:migrations` が
  空の PostgreSQL に 424 本を流し直す。多重パスで順序の前後を吸収し、
  `CREATE INDEX CONCURRENTLY` のファイルだけトランザクションを外す。
  **失敗 171 本 → 9 本。** 残る 9 本は履歴を書き換えない限り直せないもので
  （`tenant_members` という一度も存在しなかったテーブルを参照している等）、
  ファイル名の一覧で固定し**増えたら CI が落ちる**。
  本番にあるのに再生で作られないテーブル 5 つ・関数 5 つを本番の定義そのまま
  書き起こした（本番では no-op であることを実測確認）。
  運用は `docs/operations/migrations.md`。
- **未認証から呼べる SECURITY DEFINER 関数の第2弾**（本番適用済み）。
  残り 37 本を呼び出し経路まで1本ずつ確認し、9本は anon のみ、6本は
  anon+authenticated を剥奪。適用後に anon から呼べるのは 22 本
  （RLS ヘルパー 19＋公開証明書 1＋保険会社の自己登録 2）だけになった。
- **スキーマ照合がフィルタの列名も見るようにした**。`.eq()` などと
  `.or("col.op.val")` を照合。**実バグ2件**を検出:
  保険会社ポータルのガードが `insurer_users.auth_user_id`（実列は `user_id`）で
  400 → ログイン画面へ戻していた／モバイルのレジ画面が
  `register_sessions.store_id`（存在しない）で絞っていた。
- **読めないクエリ 54 → 32**。`const rows = xs.map((x) => ({...}))` を読めるように
  した結果、`notifications.type`（実列は `notification_type`）という
  **100% 失敗していた書き込み**が見つかった（運営から全メンバーへの通知が
  1件も作られていなかった）。
- **証明書作成の入口を1つにした**。モバイルは `certificates` へ直接 insert して
  いたため、テンプレートのスキーマ写し取り・メーカー認定テンプレートの検証・
  撮影来歴の nonce 発行・車両履歴の記録を飛ばしていた。
  Web の Server Action と新設した `/api/mobile/certificates` が同じ関数を通る。
- **Tap to Pay の二重請求対策**（本番適用済み）。`payments.stripe_payment_intent_id`
  に部分一意インデックスを張り、記録処理を共通化して同じ PaymentIntent の再送で
  2件目を作らないようにした。レート制限を IP 単位から利用者単位へ。
- **OPEN_QUESTIONS を 65 → 50 件に棚卸し**。11件は実装して削除、2件は重複統合、
  3件は前提が誤っていたので書き換え。残り 50 件を
  「代表の判断 20 / 実機・実運用の確認 19 / 技術的負債 7 / 環境設定 4」に分類した。

## 2026-08-24 権限剥奪マイグレーションを本番適用 / モバイル POS をサーバ経由へ / Tap to Pay の二重計上を修正

- **未認証から呼べていた SECURITY DEFINER 関数 16 本の EXECUTE を本番で絞った**
  （記録バージョン `20260823235804`）。適用後に `has_function_privilege` で実測:
  16 本すべて `anon = false`、うち呼び出し元の検査が無い4本
  （`pos_checkout` / `upsert_agent_user` / `billing_analytics_stats` /
  `management_kpi_stats`）と トリガ専用2本は `authenticated` も false、
  `service_role` のみ true。RLS ポリシー内で使う 19 本（`my_tenant_ids` など）は
  anon 実行可のまま＝公開ページの読み取りは影響なし。
- **モバイルの POS 会計をサーバ経由に変えた**（直接 RPC の呼び出し4箇所を削除）。
  `apps/mobile` からの `supabase.rpc("pos_checkout")` は 0 件になり、
  `/api/mobile/pos/checkout` と `/api/mobile/pos/terminal/capture` だけが入口になる。
  テナント ID と担当者はサーバがトークンから決めるので画面からは渡さない。
  副産物として、直接 RPC では素通りしていた**レート制限とロール確認**が
  モバイルの会計にも効くようになった（会計に `staff` 以上が要る）。
  **在庫の引き落としは効かない** —— `deductInventoryForPosItems` は明細に
  `inventory_item_id` がある行だけを見るが、モバイルの明細はそれを持たない。
  加えて Tap to Pay が通る `/pos/terminal/capture` は在庫処理を呼んでいない。
  OPEN_QUESTIONS に起票した。
- **Tap to Pay が1回の決済で支払を2件作っていた不具合を修正**。
  `processCardPayment` は内部で `/pos/terminal/capture` を呼び、そこで
  `pos_checkout` が走って支払が1件できている。画面側はその後もう一度
  `pos_checkout` を呼んでいた（ウォークインは `if` を抜けた後そのまま下の
  会計処理へ落ちる作りだった）。明細を capture 側へ渡し、画面側の呼び出しを削除。
  本番の `payments` は 11 件・最終 2026-03-23 の試験データのみで、
  **実売上には到達していない**。
- 共通化: `apps/mobile/src/lib/pos.ts` に `paymentIdOf`（サーバの戻りから
  payment_id を取り出す）と `toPosItems`（画面の明細を pos_checkout の形へ揃える）。
  `pos.check.ts` で固定し、モバイルの `npm test` に追加（自己チェック 9 → 10 本）。
- code-review 指摘の修正（同日）:
  - **サーバがテナントを決めるようになったのに、その決め方に並び順が無かった。**
    `resolveMobileCaller` は `tenant_memberships` を `.limit(1)` で引くだけで
    `ORDER BY` が無く、複数テナントに属する利用者では呼ぶたびに違うテナントが
    返り得た。アプリ側と `checkRole.ts` はどちらも「最も古いメンバーシップ」を
    採るので、同じ並び順に揃えた。ずれると**別テナントに売上が載る**。
  - **スマホで切った領収書は Web/PDF で品名が出ていなかった。** 帳票の明細の
    正準キーは `description`（`DocumentItem` / Web POS / 表示側すべて）だが、
    モバイルだけ `name` で送っていた。`pos_checkout` は `p_items_json` を
    そのまま `documents.items_json` に入れるだけなので、表示側は
    `item.description || "小計"` を出していた。`toPosItems` を
    `description` に揃え、モバイルのレシート画面は旧データ用に
    `description ?? name` で読む。
  - **QR 決済がカード売上として記録されていた。** ウォークインの QR 完了処理が
    `payment_method: "card"` 固定だった（iPhone の「QR」選択時も card）。
    画面の選択値をそのまま渡すよう修正。iPad/Android の「カード」は QR 経由
    なので card のままで正しい。
  - **Tap to Pay を取り消したのにレシート画面へ進んでいた。** 取り消しは例外では
    ないため mutation が成功扱いになり、支払が無いまま `onSuccess` が遷移して
    いた。取り消しを戻り値で伝えて遷移を止める。
  - 本番へ適用された記録バージョン（`20260823235804`）でマイグレーションを
    置き直し、旧ファイル名（`20260823170000`）は中身を空にしたポインタにした。

## 2026-08-23 code-review 指摘の修正: 権限剥奪が効いていなかった / 代理店設定が保存できなかった

- **用意した権限剥奪のマイグレーションは、実は何も変えていなかった。**
  関数の EXECUTE は既定で PUBLIC に付与されており、`anon` の権限はそこ由来なので、
  `revoke ... from anon` では PUBLIC の付与が残る。PostgreSQL 16 で実測:

  | 操作 | `has_function_privilege('anon', f, 'EXECUTE')` |
  |---|---|
  | 関数の作成直後 | true（`proacl` は NULL＝既定の PUBLIC 付与） |
  | `revoke ... from anon` | **true のまま** |
  | `revoke ... from public` | false |

  → `from public, anon` で剥奪し、必要なロールへ grant し直す形に修正。
  既存の `20260616000002` も同じ形だった。**「対策した」と報告した内容が
  実際には無効だった**ので、実測してから書き直した。
- 併せて、呼び出し元の検査が無い4関数（`pos_checkout` / `upsert_agent_user` /
  `billing_analytics_stats` / `management_kpi_stats`）は **service_role 専用**にし、
  呼び出し元7箇所をサービスロールのクライアントに変更。ルート側は既に
  `caller.tenantId` で権限確認済みなので、認証済みユーザによる他テナントへの
  書き込み・読み取りも塞がる。`auth.uid()` を内部で見る関数は authenticated を残す。
- **代理店の設定が保存できなくなっていた**。画面は通知トグルを既定 true で毎回送るが、
  保存先の列が無く「保存できません」で 400 になっていた（名前を直すだけでも保存不可）。
  `agents.email_notifications` を追加（本番適用済み）。
- **振込先の入力欄が画面に無かった**ため、追加した列は到達不能なコードだった。
  設定画面に振込先（銀行名・支店・口座種別・口座番号・名義）とウェブサイトの
  入力欄を追加。**口座情報は管理者にだけ表示・保存**する（RLS は列を絞れないので、
  API 側で role によって読む列を切り替える）。
- 空文字で「消す」経路が通らなかったのも修正（`z.string().url()` と `z.enum()` は
  `""` を弾くため、明示的に許可）。
- スキーマ照合の解析をさらに修正し、**テストを追加した**（`scripts/__tests__/`）:
  括弧の対応が取れないときに空文字を返して「引数なしの select」と同じ扱いになる
  （＝壊れたクエリが素通り）、式の途中のコメントで不明扱いに落ちる、`+` の分割が
  クォートを見ない、書き込みのキー走査が文字列内の `}` で切れる、三項演算子を読めない。
  10 件のテストで固定した。
- 法定の開示文書（個人情報保護法33条 / GDPR 15条）でテナント取得のエラーを
  握り潰していたのを修正。失敗したら部分的な文書を出さずに止める。

## 2026-08-23 本番とマイグレーションのずれを全テーブルで洗い出して修復 / 代理店の口座情報の保存先を追加 / 未認証で呼べる RPC の権限を剥奪

- **マイグレーション 417 本をローカルの空 PostgreSQL に流し、本番と全テーブルで
  突き合わせた**。`audit_logs` 1件の話ではなく、**本番にあるのにマイグレーションの
  どこにも書かれていない列が 26 個 / 9 テーブル**あった。
  空 DB から作った環境ではこれらが欠け、同じコードが環境によって動かない。

| テーブル | 欠けていた列 |
|---|---|
| `tenants` | `subscription_status` / `current_period_start` / `cancel_at` / `cancel_at_period_end` / `trial_end`（**契約・課金の状態**） |
| `customers` | `line_link_status` / `line_link_source` / `line_linked_at` / `line_unlinked_at` / `line_unlink_reason` |
| `job_orders` | `service_category` / `desired_date` / `city` / `budget_min` / `budget_max` |
| `signature_sessions` | `remind_count` / `last_reminded_at` / `notified_channel` |
| `agent_signing_requests` | `sign_engine` / `sign_url` / `ledra_session_id` / `ledra_verified` / `notified_channel` |
| `documents` | `job_status` |
| `insurer_users` | `last_login_at` |

  → `20260823160000_repair_drift_20260823.sql` で本番の定義のまま取り込み、
  再突き合わせで**差分 0 件**を確認。

- **代理店の口座情報を保存できるようにした**（本番適用済み）。`agents` に
  `bank_info`（jsonb、`tenants.bank_info` と同じ形）/ `postal_code` / `website_url`
  を追加。1項目だけ更新しても他の項目が消えないよう、既存の中身に重ねる。
  保存先がまだ無い項目（会社名・メール通知）は引き続き**黙って捨てず**
  「保存できません」と返す。

- **未認証（anon）から呼べる SECURITY DEFINER 関数が 53 本あった**。
  advisor の指摘を `has_function_privilege` で実測し、さらに関数の本体を読んで
  内部の検査の有無まで確認した。危険度が高く剥奪しても壊れない 16 本に絞って
  `20260823170000_revoke_anon_from_secdef_rpcs.sql` を用意。
  **本番未適用（適用の判断は代表へ）。**
  併せて search_path が固定されていない 6 関数を固定（`20260823170001`）。

- **スキーマ照合にもう1つ盲点があった**。`"a, b" + "c, d"` のような**文字列の連結**を
  1つ目のリテラルだけで判断しており、2つ目に混ざった存在しない列を見逃していた
  （`tenants.updated_at` が実際にそれで通っていた）。`.select(` の引数を括弧の
  対応で取り出し、連結・テンプレート・定数の混在を解決する方式に変更。
  引数なしの `.select()` は全列として扱う。対象 select は 2107 → 2109 件。

- 検証: マイグレーション 4 本ともローカルの空 DB で実行を確認 /
  `lint:migrations` OK / `tsc` 型エラーなし / `vitest` 全通過 /
  スキーマ照合 実バグ0件・ドリフト0件。

## 2026-08-23 Web の壊れたクエリ 189 箇所を修正 / スキーマ照合を Web+モバイル共通で CI に入れる

- モバイルで見つけた「存在しない列を SELECT していてクエリごと 400 になる」不具合を
  **Web 側にも展開して全面修正**。58 ファイル・189 箇所。残り 0 件。
- 照合をモバイル専用から repo 直下の **`scripts/check-schema.mjs`** へ移し、
  `src/`（select 2003 件 / 書き込み 699 件）と `apps/mobile/src/`（62 件 / 8 件）を
  同じ仕組みで見る。`npm run check:schema` と CI、モバイルの `npm test` の三方から走る。
- **検査そのものを先に直した**。最初は 334 件を報告したが、うち約 145 件が誤検知だった:
  `.from("a").update(...)` の直後の `.from("b").select(...)` を取り違える／FK 列名での
  埋め込み（`tenants:tenant_id(name)`）を解決できない／JSDoc の `@example` を実コードと見なす。
  そのまま直しに入っていたら、壊れていない 145 箇所を書き換えていた。
  併せて `${定数}` で列を持つ書き方を解決できるようにし（同名定数はファイル内優先）、
  縮退を自前で実装している箇所は `schema-check-ignore:` で**理由を書かせて**除外する形にした。

### 見つかった主な不具合（すべて 100% 失敗していたもの）

| 症状 | 原因 |
|---|---|
| **監査ログが1行も残っていない** | `audit_logs` へのテナント側の書き込み6箇所が `table_name` / `record_id` / `performed_by` / `ip_address` という存在しない列を使用。実列は `actor_type` / `actor_user_id` / `target_public_id` / `query_json` / `ip`。しかも `actor_type` は NOT NULL なのに未設定。**証明書の有効化・取消、NFC の紐付け・書き込み、レジ締め、証明書の訂正が記録されていなかった** |
| モバイルから予約を作れない | `reservations.created_by` が存在せず insert ごと失敗 |
| 代理店の設定が表示も保存もできない | `agents` に `company_name` / `logo_url` / `commission_rate` / `bank_*` が無い（実列は `name` / `logo_asset_path` / `default_commission_rate`、銀行口座は列そのものが無い） |
| 顧客ポータルの閲覧履歴が常に 500 | `audit_logs` の `target_type` / `actor_role` / `occurred_at` / `subject_customer_id` などをすべて存在しない列で読んでいた |
| AI 下書き・AI 説明・アカデミーのフィードバック/事例要約が空入力 | `certificates` に `service_name` / `description` / `material_info` / `warranty_period` が無い（実列は `service_type` / `content_free_text` / `coating_products_json` / `expiry_value`） |
| フォローアップ配信が動かない | `certificates.vehicle_maker` 等は列ではなく `vehicle_info_json` の中身 |
| 保険会社の契約情報・ユーザー管理が 400 | `insurers.max_users` 列が無い → プラン別上限 `INSURER_MAX_USERS` に置き換え |
| 受領サイン・署名リンクが開けない | `certificates.cert_type`、`vehicles.car_number` / `car_name` が無い |

- 重複していた形は共有モジュールに集約した:
  `lib/audit/tenantLog.ts`（監査ログの形を1箇所に）、
  `lib/certificates/aiFields.ts`（AI に渡す証明書項目と実列の対応表）、
  `lib/agents/profileColumns.ts`（代理店プロフィールの対応表）。
- **保存先の列が無い項目は黙って捨てず、保存できないと返す**（代理店の銀行口座・ウェブサイト）。
  証明書の取消理由は `meta` に残し、監査ログにも入れる。
- 役目を終えていたコードを削除: 平文シークレットの暗号化バックフィル
  （`lib/crypto/backfillSecrets.ts` と管理画面・API）。対象の平文列は
  マイグレーション `20260428000000_tenant_secrets_drop_plaintext.sql` で削除済みで、
  実行すると必ず失敗するだけの状態だった。
- CI: lighthouse の `timeout-minutes` を 15 → 25 に変更。実測 14分04秒〜14分25秒で
  余裕が1分を切っており、1度自前の上限で cancelled になっていた。
- 検証: `tsc --noEmit` 型エラーなし / `vitest` 3813 件全通過（417 ファイル） /
  `lint` エラー0・警告 1258 件で変更前後とも一致 / モバイル自己チェック9件 OK /
  **照合を壊すと実際に落ちることを確認してから採用**。

## 2026-08-23 モバイル: 画面を横に切る仕切り線を撤去

- 代表の指摘（車両詳細のヘッダー周辺の線）を受けて、**画面の上下の帯を区切る
  横線**を撤去した。背景を白で統一したため、線を引くと画面が横に切られて見える。
- **本体はナビゲーションヘッダー自身の線**。`@react-navigation/native-stack` は
  既定でヘッダー下に細い線を描く。共通の `tabStackScreenOptions` に
  `headerShadowVisible: false` を1行足して**全 Stack から一度に消した**
  （車両詳細・証明書詳細・予約詳細・POS・NFC・設定・ナレッジ・規約・
  メッセージ・帳票など、ヘッダーを持つ全画面）。
- 併せて、ヘッダー直下の固定バーが自前で引いていた線も撤去:
  予約一覧の日付バーと絞り込みバー、飛び込み受付の品目フィルタ、
  ナレッジの検索バー、証明書写真の段階セレクタ。
- 画面下端の固定バー（飛び込み受付の合計バー、証明書写真のアクション、
  メッセージの入力欄）は線を消すと**白地に白で境界が消える**ため、
  影で浮かせる形にした。影は下端バー専用の `shadows.bar`（上向き）を使う。
  - ※ 当初この記録に「タブバーと同じく `shadows.card`」と書いたが**誤り**。
    タブバーの帯自体は透明で影も無く、丸が見えているのは
    `surfaceVariant`（薄いグレー）の**塗り**があるからで、影の効果ではない。
    `shadows.card` は下向き（offset +2）なので、下端バーに使うと影の大半が
    画面外へ落ち、**境界が要る上端側にほとんど残らない**。
    そのため上向き（offset −2）の `shadows.bar` を新設して使い分けた。
- 併せて、下端バーまわりで見つかった以下の不具合も直した。
  - **Android で通知（Snackbar）が固定バーに完全に隠れていた**。Android は
    兄弟要素の重なりを `elevation` で決めるが、Paper の Snackbar の外枠は
    `elevation` を持たない（0）。バーを `elevation: 3` で浮かせた結果、
    バーが上に来て通知が1件も見えなくなっていた。Snackbar 側に
    `wrapperStyle={{ elevation: 8 }}` を付けて解消（共通の
    `ToastProvider` にも同じ対処を入れた）。
  - **下端バーがホームバー（ジェスチャー領域）に食い込んでいた**。
    メッセージの入力欄と証明書写真のアクションに `insets.bottom` が
    無く、送信ボタンやアップロードボタンの下半分がシステムのスワイプ領域と
    重なっていた（飛び込み受付は元から対応済み）。
  - **予約一覧の日付バーと絞り込みバーが1つの白い帯に見えていた**。
    線を消した結果、別々の操作である2列がつながって見えるため、
    地色を1本挟んで分けた（画面を横断する罫線は引かない）。
- **カードの中の行区切りは残す**（作業詳細の情報行、その他メニュー、
  ダッシュボードの指標、帳票詳細、ホームのタイムライン）。
  これは「画面を切る線」ではなく項目の区切りで、消すと逆に読みにくくなる。
- 検証: mobile `tsc --noEmit` 型エラーなし / 自己チェック9件 OK / `lint` エラー0、
  警告は変更前後とも 77 件。

## 2026-08-23 モバイル: 実在しない列・テーブルを参照していたクエリを全面修正（車両一覧が空だった原因）

- **症状**: 車両が登録されているのにモバイルの車両一覧に何も出ない。
- **原因**: クエリが `vehicles.customer_name` を SELECT していたが、**その列は存在しない**
  （あるのは `customer_id`）。PostgREST はクエリごと 400 を返し、画面は
  「車両がまだ登録されていません」と表示する。**データはあるのに空に見える**ため、
  実機で触っても「まだ登録していないのだろう」と読めてしまい発見が遅れていた。
- **全画面を機械照合したところ、同じ壊れ方が 13 画面・27 箇所あった**。実 DB の
  `information_schema` と全 `supabase.from().select()` を突き合わせて確定させた。

| 誤り | 実際 | 影響画面 |
|---|---|---|
| `vehicles.customer_name` | 列なし。`customers` を埋め込む | 車両一覧・車両詳細・証明書作成 |
| `certificates.certificate_no` | `public_id` が証明書番号 | 証明書一覧・証明書詳細・車両詳細・NFCスキャン・NFCタグ台帳・NFC書き込み |
| `certificates.issued_date` | 列なし。`signed_at`（未署名なら `created_at`） | 証明書詳細・車両詳細 |
| `certificates.content` | `content_free_text` | 証明書詳細 |
| `certificates.vehicle_maker` / `vehicle_model` / `plate_display` | 列なし。発行時スナップショットの `vehicle_info_json` | 証明書詳細・NFC書き込み |
| `reservation_items` テーブル | **存在しない**。明細は `reservations.menu_items_json` | 作業一覧・作業詳細・POS一覧・会計・レシート・予約詳細 |
| `staff` テーブル | `staff_members`（`display_name` ではなく `name`） | 作業一覧 |
| `reservations.notes` | `note` | 予約詳細 |

- 明細の取り出しは `lib/reservationItems.ts` に集約（`menu_items_json` は
  `[{name, price, menu_item_id}]` で**数量を持たない**ので、表示から数量列を落とした）。
  壊れた jsonb でも画面を落とさないよう均す。自己チェック付き。
- **再発防止**: 実スキーマのスナップショット `lib/schema.snapshot.json` をコミットし、
  `lib/schema.check.ts` が `src/` 配下すべての `select`（62件）と
  `insert`/`update`/`upsert` のキー（8件）を `npm test` で照合する。
  壊した状態で実際に落ちることを確認済み。更新手順は `schema.snapshot.README.md` に記載。
- **根本的には** `npm run db:typegen` の生成型でクエリを型付けすべき（`tsc` が直接落とす）。
  生成型が未コミットで Metro もアプリ外を解決しないため、まずこの照合で止める。

### `/code-review` で自作の不具合を検出し同時修正（実装と同じバッチ）

- **同じ不具合を作り直していた**。修正の説明として `//` コメントを **select の文字列の中**に
  書いてしまい、`postgrest-js` は空白を除くだけで中身をそのまま送るため、
  会計・POS一覧・レシート・予約詳細・作業詳細の**5画面が再び 400 で空**になっていた。
  文字列の外へ出した。
- **その5件を自分のチェックが見逃していた**。読めないトークンを「たぶん大丈夫」として
  黙って飛ばす作りだったため。**読めないものは失敗として扱う**よう変更し、
  同時に (a) `select(` とリテラルの間のコメントを許容、(b) `app/` と `hooks/` だけでなく
  `src/` 配下すべてを走査、(c) `insert`/`update`/`upsert` のキーも照合、
  (d) 検出数が急減したら落ちる下限を追加。
- **書き込み側にも3件あった**（`select` しか見ていなかったため未検出）。
  いずれも**その画面からの登録が必ず失敗する**状態だった。
  - 車両登録: `vehicles.customer_name` に書き込み → `customer_id` のみに
  - 顧客登録: `customers.store_id` に書き込み → 顧客はテナント単位なので削除
  - 証明書作成: `content` / `vehicle_maker` / `vehicle_model` / `plate_display` に書き込み
    → `content_free_text` と `vehicle_info_json` へ。`public_id` は DB 側の
    `generate_public_id()` が採番する（レビューの「必須なのに未指定」は誤り。実 DB で確認）
- **予約詳細の備考が出ていなかった**。`select` は `note` に直したのに型と描画が `notes` のまま
  （`as unknown as` でキャストしているため型チェックも通っていた）。
- **金額の扱いが Web と食い違っていた**。Web の POS は `unit_price ?? price` と
  `quantity ?? 1` を読むのに、モバイルは `price` だけを見て数量を無視していた。
  **同じ予約が Web とアプリで違う金額になる**。Web に揃えた。
  さらに、数値でない金額を黙って 0 円にしていたのを「金額不明」として持ち上げ、
  **不明な明細があるときと合計が 0 のときは決済ボタンを押せない**ようにした
  （そのままだと ¥0 の売上が立つ）。
- **未署名の下書きに発行日が出ていた**。`signed_at` が無いときに作成日を「発行日」として
  表示しており、顧客が保証の起算日として読む書類に発行していない日付が載っていた。
  署名済みのときだけ出す。
- 作業一覧の担当者は `staff_members` の RLS が owner/admin 以上に限定されているため、
  staff / viewer では埋め込みが null になり表示されない（エラーにはならない）。
  追いかけずに済むようコメントで明示した。
- 検証: mobile `tsc --noEmit` 型エラーなし / 自己チェック**9件** OK / `lint` エラー0、
  警告は変更前後とも 77 件。実スキーマに対する再監査で select・書き込みとも 0 件。

## 2026-08-23 モバイル: メッセージに画像送信を追加

- 代表の指示で、モバイルのメッセージから顧客へ画像を送れるようにした。
  サーバ側（`sendLineImageFromForm`）は管理画面で既に動いていたので、
  モバイルの POST に multipart 分岐を足して同じ関数を呼ぶだけ。
- **新しいネイティブモジュールは不要**。`expo-image-picker` は既に導入済み
  （施工写真の撮影で使用中）なので EAS 再ビルドは要らない。
- カメラ撮影とライブラリ選択の両方に対応。**送る前にサムネイルで確認でき、
  取り消せる**（相手に届いたら戻せないため、選んだ瞬間には送らない）。
- **HEIC 対策**: iPhone のライブラリは既定で HEIC を返すが LINE は JPEG / PNG しか
  受け付けない。`preferredAssetRepresentationMode: "compatible"` を指定して
  iOS 側で JPEG へ変換させる。それでも通らない形式とサイズ超過は、
  **アップロードする前に**画面で止める（サーバ側も同じ検証をする二重防御）。
- LINE の画像メッセージには本文が付かないので、画像を控えているときは画像を先に送り、
  入力中の文章は欄に残す（続けてもう一度押せば送れる）。
- iOS の権限文言を「施工写真の撮影／選択」から、顧客へ送る画像も含む表現へ変更
  （**次のビルドから反映**）。
- **`/code-review` で自作の不具合を検出し同時修正**（実装と同じバッチ）:
  - **Android でライブラリの写真が一切送れなかった**。`asset.mimeType` は Android では
    **元ファイル**の MIME（HEIC のまま）を返すのに、`quality < 1` の圧縮で書き出される
    実体は JPEG。mimeType を優先していたため「JPEG なのに HEIC 判定で弾く」状態だった。
    **書き出されたファイルの拡張子**から決めるよう反転（iOS の mimeType はもともと
    produced file の拡張子から作られているので、両 OS とも正しくなる）。
  - **サーバが宣言された Content-Type しか見ていなかった**。`image/jpeg` と名乗る任意の
    ファイルを、自ドメインの署名付き URL で配信できてしまう。証明書写真のアップロードで
    既に使っている `detectMagicByteMime`（先頭バイト判定）を `sendImage.ts` に導入し、
    **検出した型で保存する**。共有関数なので管理画面側の送信にも同時に効く。
  - **上限 10MB は届かない数字だった**。LINE の仕様は 10MB だが、その手前で
    **Vercel の関数ボディ上限（約4.5MB）**に当たり、ハンドラに届く前に 413 が返る。
    JSON ですらないので画面には生のステータスしか出ない。Web の証明書アップロードと
    同じ 4MB に揃えた。
  - **サイズ判定が Android では元ファイルのサイズだった**。圧縮後 3MB のものを
    「12MB なので送れません」と弾いていた。`expo-file-system` で**書き出された
    ファイルの実サイズ**を見るよう変更（0 バイトを素通りさせる `&&` 判定も修正）。
  - **画像と文章を両方入れて送ると文章が黙って消えた**。LINE の画像メッセージに本文は
    付かないため画像だけ送っていたが、入力欄に文章が残るだけで「送っていない」と
    分からない。**2通続けて送る**よう変更（画像が届かなかった場合は文章を止めて確認を促す）。
  - **ピッカーの例外が握り潰されて「押しても何も起きない」状態になりえた**。
    `Alert.alert` の `onPress` に async 関数を直接渡していたため。結果型で返して表示する。
  - **選び直しに失敗すると前の画像が残っていた**。形式やサイズで弾かれたとき控えを
    消していなかったので、「差し替えたつもりが前の画像を顧客に送る」事故になりえた。
  - 画像取得の手順（拡張子→MIME、`PickedImage`、RN の FormData 形式）が施工写真の
    撮影画面と二重化していたので `lib/pickImage.ts` に集約し、両方から使う。
    **この二重化こそが Android の不具合を見逃した原因**（片方は拡張子優先、
    もう片方は mimeType 優先に分岐していた）。
  - 種別判定の自己チェックを追加し、**画面とサーバの許可形式・上限のズレも機械検出**する
    （画面の上限がサーバを超えていたら落ちる）。`app.json` に残っていた死文の
    `NSCameraUsageDescription`（plugin 側が勝つため無効）を削除。
  - `LEDRA_CURRENT.md` の重複行を削除し、方針転換（画像送信を載せる判断）を
    `DECISION_LOG.md` へ9項目で記録。
- 検証: web `tsc --noEmit` 型エラーなし / vitest 全件通過 / `lint` エラー0。
  mobile `tsc --noEmit` 型エラーなし / 自己チェック**7件** OK / `lint` エラー0、
  警告は変更前後とも 77 件。

## 2026-08-23 モバイル: メッセージと帳票の画面を追加し、通知の遷移を実際に発火させる

- **背景**: 通知タップで該当画面へ飛ぶ仕組みは入れたが、実際に発行されている
  `link_path` は `/admin/messages`（LINE 受信）と `/admin/documents?doc_type=estimate`
  （AI の見積ドラフト起票）の2種だけで、どちらもモバイルに対応画面が無く**遷移が
  一度も発火しない**状態だった。その2画面を作って導線を通した。
- **メッセージ**（`app/messages/`）: LINE などから届いた顧客メッセージの受信箱と会話。
  未読バッジ・予約候補バッジ付きの一覧、会話の吹き出し表示、テキスト返信、
  開いた時点での一括既読。添付画像は署名付き URL で表示する。
  - 画像の**送信**は管理画面のみ（サーバは対応済み。現場は文字で足りる）。
  - LINE が紐付いていないスレッドとメールスレッドは送信欄を出さず理由を書く。
  - 送信が失敗しても履歴には残る仕様なので、`delivered:false` のときは警告を出す
    （黙って成功に見せない）。
- **帳票**（`app/documents/`）: 見積・請求の一覧（種別セグメント）と詳細（明細・税・合計）。
  詳細から**ステータス変更**ができる。確定（下書き→送付済）は電帳法の封印・自動送付・
  見積フローの進行を伴うので、押す前に取り消せない旨を確認する。
- **サーバ側**: 管理画面のロジックを複製せず共有した。
  - `src/lib/messages/threads.ts`（新規）にスレッドの畳み込み・解決・メッセージ収集・
    既読化を集約し、`/api/admin/messages` と新設の `/api/mobile/messages` の両方が使う。
    純関数 `foldThreads` / `threadKeyOf` に vitest を追加。
  - `src/lib/documents/statusEffects.ts`（新規）に「入金時の売掛元帳記帳」と
    「確定時の封印・自動送付・見積フロー進行」を集約。管理画面 PUT と
    新設の `/api/mobile/documents` PUT が同じ関数を通る。**片方だけ封印が漏れて
    真実性の担保が無い帳票ができるのを構造的に防ぐ**。
  - モバイル PUT は**ステータス変更のみ**扱う（作成・編集は採番リトライと明細の
    再計算が絡むので管理画面に任せる）。遷移は画面と同じ `nextStatusesFor` で弾く。
    外注請求書は管理画面と同じく管理ロール限定。
- **型の共有**: `apps/mobile/src/types/document.ts` は Web と乖離した古いコピーで、
  かつどこからも import されていないデッドコードだった。Web の `src/types/document.ts`
  を正としてコピーし直し、ズレを `document.check.ts` が `npm test` で検出する
  （法務文書と同じ方式。Metro がアプリディレクトリ外を解決しないため import 共有ができない）。
- **通知の遷移先**: `/admin/messages` → `/messages`、`/admin/documents` → `/documents` を追加。
  クエリは既定で落とす仕様だったが、落とすと意味が変わるものだけ変換するようにした。
  - `?thread=c:xxx` → `/messages/c%3Axxx`（会話を直接開く。落とすと受信箱トップになる）
  - `?doc_type=estimate` → `/documents?type=estimate`
  - 形式が合わない `thread` は無視して受信箱トップへ（不正値でルートを組み立てない）
- **ついでに塞いだ穴**: `/nfc` と `/legal` は配下の画面しか無い（index が無い）のに
  素のパスを通していた。子セグメント必須にして白画面になる経路を消した。
- 「その他」に「やり取り・帳票」セクションを追加（通知以外からも開けるように）。
- **注記**: Web の `/admin/documents` は `?type=` を読むのに、通知の発行側は
  `?doc_type=` を書いている。**Web 側では種別フィルタが効いていない**（モバイルは
  どちらのキーでも拾うようにした）。Web の修正は別途。
- **`/code-review` で自作の不具合を検出し同時修正**（実装と同じバッチ）:
  - **モバイル帳票 PUT にロール下限が無かった**。`viewer` でも確定（＝封印＋顧客への
    自動送付）や入金記帳ができた。他のモバイル書き込みルートと同じ `staff` 以上に。
  - **レート制限が無かった**（`/api/mobile/` は middleware を通らないので、
    ルート側で掛けないと素通し）。LINE 送信は課金対象で連投もできるため、
    既存の書き込み系プリセット（60回/分）を送信と帳票更新の両方に適用。
  - **読んでから書くまでの間の遷移を弾けていなかった**。連打・再送で確定が2回走ると
    封印と自動送付が二重に動く。UPDATE に読んだ時点のステータスを条件として足し、
    0 行なら競合として返す。
  - **`updated_at` を入れ忘れていた**。`documents` に更新トリガは無く管理画面は明示的に
    入れているため、アプリから確定すると封印済みなのに更新日が作成時のまま残っていた。
  - **存在確認のエラーを握り潰していた**。一時的な DB 障害を「帳票が見つかりません」と
    伝えてしまい、再試行すれば直る状態が永続的な失敗に見えていた。
  - **`mobileApi` がサーバのエラーコードを投げていた**。画面のスナックバーに
    「validation_error」「forbidden」と出る。人間向けの `message` を優先するよう変更
    （共有関数なので全画面に効く）。
  - **取得失敗を「まだありません」と表示していた**（帳票一覧・メッセージ一覧）。
    実際は有るのに無いと読める。`isError` で出し分け、再読み込みボタンを出す。
  - **帳票詳細が読み込み失敗で真っ白のまま止まっていた**。スピナーとエラー表示を追加。
  - **通知の `type` クエリを初期値としてしか読んでいなかった**。画面が開いたままだと
    別種別の通知から来ても前の絞り込みが残る。クエリから導出して手動選択だけ
    上書きする形に変更（効果を使わずに済む）。
  - 会話のポーリングは 15 秒だと毎回スレッド全体＋署名付き URL を取り直すため、
    従量回線を考えて 30 秒に。詰めるなら差分取得が要ることをコメントに明記。
- **根本側も直した**: 通知の発行側 (`quoteDraftCore.ts`) が `?doc_type=estimate` を
  書いていたのを `?type=estimate` に修正。**Web の一覧が読むキーと食い違っていて
  絞り込みが効いていなかった**バグの根本。モバイル側の両キー対応は、既に発行済みの
  通知が DB に残っているため互換として残す。
- 検証: web `tsc --noEmit` 型エラーなし / vitest 3813 件通過 / `lint` エラー0。
  mobile `tsc --noEmit` 型エラーなし / 自己チェック6件 OK / `lint` エラー0、
  警告は変更前後とも 77 件で内容も同一。ルートの機械照合で到達不能リンク・
  index の無いルートへの遷移ともゼロ。

## 2026-08-23 モバイル: アプリロック（起動時の生体認証）

- **問題**: セッションは端末に残るので、一度ログインすると次の起動から素通りになる。
  現場の端末を人に渡した瞬間、顧客情報・車両情報がそのまま見える。
- **実装**: 起動時と「5分以上アプリを離れたあとの復帰時」に生体認証（Face ID / Touch ID /
  指紋）を挟む。ロック中は全画面を覆うオーバーレイを出す。画面ツリーは差し替えないので、
  解除すると元の画面と入力途中の内容がそのまま戻る。
- **新しいネイティブモジュールは足していない**。`expo-local-authentication` を入れると
  EAS 再ビルドが必要で、代表の手元にある既存ビルドが使えなくなる。代わりに**既に入っている
  `expo-secure-store` の `requireAuthentication`** を使う。生体認証を要求するキーチェーン項目
  （「番人」）を1つ置き、それを読めたかどうかで本人確認する。iOS で必要な
  `NSFaceIDUsageDescription` は expo-secure-store の config plugin が既に入れていることを
  `expo config --type introspect` で確認済み（**現ビルドのまま動く**）。
  併せて権限文言を英語の既定から日本語へ変更（**次のビルドから反映**）。
- **有効化の導線**: 設定（その他 → アカウント設定）に「アプリロックを有効にする」を追加。
  サインアップ直後の `(auth)/biometric-setup` も、これまで未インストールのモジュールを
  動的 import して必ず「この環境では利用できません」になっていたのを実装に差し替えた。
- **有効化・無効化の両方で本人確認を通す**。有効化は保存直後に1回解除を試し、通らなければ
  自動で無効へ戻す（次回起動で開けなくなるのを防ぐ）。無効化にも認証を要求する
  （端末を渡された第三者に切られては意味がない）。
- **締め出さない**: iOS は生体情報を追加・変更すると項目が無効化される
  （`.biometryCurrentSet`）。この場合は認証プロンプトすら出ずに空が返るため、
  再試行しても永久に開かない。専用の画面を出して「ロックを解除して続ける」または
  「ログアウト」を選べるようにした。
- 状態遷移（未ログイン／無効／離席時間／ロック中の復帰）は純関数
  `lib/appLockPolicy.ts` に切り出し、自己チェックを `npm test` に組込。
- 既知の上限（コード内に `ponytail:` で明記）: これはアプリ内の目隠しなので、
  iOS のアプリスイッチャーに残るサムネイルまでは隠せない。隠すにはネイティブ側の
  実装が必要で EAS 再ビルドを伴う。
- 対象: `lib/appLock.ts`・`lib/appLockPolicy.ts`（+ check）・`components/AppLockGate.tsx`
  が新規。`app/_layout.tsx`、`app/(auth)/biometric-setup.tsx`、`app/settings/index.tsx`、
  `app.json`、`package.json` を変更。
- **`/code-review` で自作の不具合を検出し同時修正**（実装と同じバッチ）:
  - **ロックが上から突破される経路**: オーバーレイを素の View で置いていたため、
    react-native-paper の Dialog（Portal）と BottomSheet（RN の Modal）がその上に残った。
    施工写真や顧客名を出しているダイアログを開いたまま離席すると、ロック後もそれが見える。
    ゲートを `Portal` に入れ（Dialog より後＝上に描かれる）、ネイティブの別ウィンドウで
    被せられない BottomSheet は `useAppLockStore` を見て自分から閉じるようにした。
  - **有効フラグの読み取り失敗で認証なしに開いていた**: 状態遷移が `enabled` を
    「ロック中か」より先に見ていた。`isAppLockEnabledSync()` は例外を握って false を返すため、
    キーチェーンの読みが1回失敗しただけでロックが外れる。順番を入れ替え、閉じている側を
    先に返すようにして自己チェックを追加。
  - **端末の時刻を戻すと再ロックを飛ばせた**: 離席時間が負になると閾値比較が常に false。
    負は「経過時間が不明」としてロックする。
  - **袋小路**: ロック画面の2つの脱出ボタンに try/catch が無く、`disableAppLock()` が
    失敗すると `busy` が真のまま全ボタンが無効になり、強制終了しても同じ状態で戻ってきた。
    無効化はキャッシュを先に落とす設計に変え、脱出は必ず成立するようにした。
  - **ログアウトでキャッシュを消していなかった**: 同じ端末で次にログインした人に、
    前のアカウントの顧客・車両が（再取得が終わるまで）見える。設定画面の既存ログアウトと
    401 ハンドラにも同じ穴があったため、`lib/signOut.ts` に入口を1つ作って3箇所を寄せた。
  - **ログアウト前にロックを外していた**: 順番を逆にし、サインアウトを済ませてから外す。
  - **ログアウト時にも覆いが外れていた**: 401 で `reset()` された瞬間にゲートが消え、
    ログイン画面へ遷移し終わるまでの数フレーム中身が見えた。ログイン成立（false→true）の
    向きだけで開くようにした。
  - **起動時にロックが効かない初期化順**: ロック状態をストアに移した際、モジュール読み込み時
    （＝セッション復元より前）に初期値を決めており、常に「開いている」と判定されていた。
    セッション復元直後に `initAppLockState()` で確定させる形に修正。
  - **Android で1回の操作に2回スキャンさせていた**: Android は書き込みにも生体認証が要るため、
    有効化の「保存 → 確認のため1回解除」が2回のプロンプトになる。Android は保存時の認証を
    もって確認済みとする。
  - **機種変で必ず「再設定が必要」画面に落ちる**: 有効フラグだけ既定のアクセス制御
    （バックアップ対象）で、番人は `THIS_DEVICE_ONLY`（対象外）だった。両方を揃えた。
  - **連続失敗の逃げ道**: 読み取りエラーはキャンセルと区別できず、再試行しても開かない場合が
    ある。2回続けて失敗したら「解除して続ける」「ログアウト」を前に出す。
  - 有効化の「保存 → 確認 → 失敗なら戻す」手順が設定画面とサインアップ導線に丸ごと
    重複していたので `enableAppLockVerified()` に集約。設定のトグル表示も、ロック画面側で
    無効化されたときにずれないよう画面復帰のたび読み直す。
- **端末パスコードへのフォールバックは出せない**（コード内に `ponytail:` で明記）。
  expo-secure-store が iOS のアクセス制御を `.biometryCurrentSet` 固定で作るため。
  指が濡れている・手袋で通らないときの逃げ道は「ログアウトしてパスワードで入り直す」。
- 検証: `tsc --noEmit` 型エラーなし。自己チェック5件 OK。`lint` エラー0、警告は
  変更前後とも 77 件で内容も同一（行番号のずれを除いて突き合わせ済み）。

## 2026-08-23 モバイル: 画面名の帯を検索窓に置き換え、通知を全画面から到達可能に

- **通知タップで該当画面へ遷移**: 通知一覧はこれまで既読にするだけで、本文に紐づく
  画面へ行けなかった。`notifications.link_path` は管理画面向けの Web パス
  （`/admin/...`）で入るため、モバイル側の対応パスへ変換する
  `src/lib/notificationTarget.ts` を追加。対応画面が無い通知は `null` を返し、
  chevron を出さない（押せそうに見えて何も起きない行を作らない）。
  変換規則は `notificationTarget.check.ts` で検証（`npm test` に組込）。
  **現状の制約**: 実際に発行されている `link_path` は `/admin/messages` と
  `/admin/documents?doc_type=estimate` の2種のみで、どちらもモバイルに対応画面が
  無いため今は遷移しない。対応画面を作った時点で PATH_MAP に1行足せば有効になる。
- **日時選択の月表記を数字へ（iOS のみ）**: 飛び込み受付・予約作成の `DateTimePicker` が端末
  ロケール既定（英語だと "Aug"）だった。`locale="ja-JP"` を指定し数字の年月日に固定。
  **`locale` は `@react-native-community/datetimepicker` の iOS 専用 prop**（Android の
  型定義には存在しないが union 型なので `tsc` は通る）。英語設定の Android 端末では
  依然として英語表記のまま。Android を直すにはアプリロケールのネイティブ設定が必要で
  EAS 再ビルドを伴うため、実機検証が iOS 中心の現状では見送った。
- **ベース背景を白に統一**: `colors.background` を `#F6F7F9` → `#FFFFFF`。
  白地に白カード（`colors.surface`）が溶けるため、`shadows.card` を
  `shadowOpacity` 0.06 → 0.10（iOS）+ `elevation` 2 → 3（Android は shadowOpacity を
  見ないため両方要る）に上げてカードの輪郭を保った。タブバーの丸ボタンは白のままだと
  白地に消えるので、非選択時を `surfaceVariant`（薄いグレー）に変更。
- **画面名の帯を撤去し検索窓に置換**: 「作業」「車両」「証明」「その他」の各タブは
  ヘッダーに画面名を出していたが、その情報はタブバーのアイコンで既に分かる。
  一等地を検索に譲り、共通コンポーネント `components/TabTopBar.tsx`（検索窓＋通知ベル）
  に置き換えた。ホームも同様にヘッダーを非表示にし、既存の日付＋挨拶ヘッダーを上端へ。
  ヘッダーが無くなった分のセーフエリアは各画面で `insets.top` を自前で確保。
  - 作業: ナンバー・メーカー・車種・顧客名・担当者・メニューを横断検索
  - 車両: 既存の独自検索バーを TabTopBar に置換（重複解消）
  - 証明: 証明書番号・顧客名・サービス・車両。既存のステータス絞り込みと直列に適用
  - その他: メニュー項目名で絞り込み、空になったセクションは非表示
  - `headerShown: false` は各 `_layout.tsx` の `screenOptions` ではなく
    `Stack.Screen name="index"` 側に置いた。screenOptions に置くと、将来その配下へ
    詳細画面を足したとき戻るボタンごと消える（過去に3回起きた不具合と同じ形）。
- **通知をどの画面からも開けるように**: TabTopBar のベル（未読数バッジ付き）を全タブに常設。
  未読件数は `hooks/useUnreadNotifCount.ts` に集約し、ホームのインラインクエリを置換。
- **ホームの無反応な検索ボタンを撤去**: `onPress={() => {}}` で押しても何も起きなかった。
  各タブに検索窓が付いたので役目が無い。
- 対象: `components/TabTopBar.tsx`・`hooks/useUnreadNotifCount.ts`・
  `lib/notificationTarget.ts`（+ check）が新規。`constants/tokens.ts`、
  `(tabs)/_layout.tsx`、`(tabs)/{index,work,vehicles,certificates,more}` の
  `_layout.tsx`/`index.tsx`、`app/notifications.tsx`、`reservations/new.tsx` を変更。
- **`/code-review` で自作の不具合を検出し同時修正**:
  - 通知の遷移先が「/admin 以外は素通し」になっており、モバイルに無いパスは白画面、
    `//example.com` はプロトコル相対 URL として外部遷移になりえた。`link_path` は
    このリポジトリ外が書く値なので、モバイルに実在するルートの許可リストと
    「単一スラッシュ区切りの安全な文字だけ」の形式チェックを通す方式に変更。
  - 既読にしても `notif-unread-count` を無効化しておらず、5画面に出るようになった
    ベルのバッジが最大30秒古い数字を出していた。
  - 作業タブの検索が `reservation_items` を `?.` なしで展開しており、同ファイルの
    別箇所は nullish 扱いだった（1文字目の入力でタブごと落ちうる）。
  - 検索中の1タップ目がキーボード閉じに吸われる（`keyboardShouldPersistTaps` 未指定）。
    既存10画面が設定済みの規約を4画面に適用。
  - 検索窓に `autoCapitalize="none"` / `autoCorrect={false}` が無く、置き換え前の
    車両検索バーにはあった。ナンバーや車種の入力が自動修正で別語に化ける。
  - `clearButtonMode`（iOS 専用）と自前の × が二重に出ていたため前者を撤去。
  - 車両タブだけ `trim()` の結果ではなく生の入力で照合しており、日本語変換確定後の
    末尾スペースで0件になっていた。
  - 検索0件のときに「まだ登録がありません」と出て、実際は有るのに無いと読めた
    （作業・証明・その他）。車両タブに既にあった分岐の形へ統一。
  - 通知バッジのマークアップがホームと TabTopBar で二重化しており、ホーム側だけ
    99+ の打ち切りが無かった。`components/NotifBell.tsx` に集約。
  - 撤去した検索バーの残骸（未使用 import・未使用スタイル3件）と、
    どの画面でも描画されなくなったタブナビゲータのヘッダー設定13行を削除。
- 検証: `tsc --noEmit` 型エラーなし。自己チェック4件すべて OK。`lint` エラー0、
  警告は変更前後とも 77 件で**警告1件ずつを突き合わせて同一**であることを確認済み
  （件数の増減だけを見ると入れ替わりを見落とす。実際、途中の版で
  `RNTextInput` の未使用 import が1件増えていたのをこの照合で検出して撤去した）。

## 2026-08-22 モバイル: 規約・問い合わせ・ナレッジをアプリ内で完結させる

- **規約・プライバシーポリシー**: 外部ブラウザへ飛ばすのをやめ、アプリ内で表示。
  本文は `src/lib/legal/documents.json` を正とし、`apps/mobile/src/constants/legalDocuments.json`
  に**同梱**する。当初はサーバー API から取得する設計にしたが、アプリと Web の
  リリース時期がずれた瞬間に表示できなくなる（実機で 404 になった）ため同梱に変更。
  オフラインの現場でも読める。2ファイルのズレは `legal.check.ts` が検出（`npm test` に組込）。
  Web の `(marketing)/terms・privacy` も同じ JSON から描画するよう書き換え（文言は不変）。
- **お問い合わせ**: `app/legal/contact` にネイティブフォームを追加し、既存の
  `/api/contact` へ送信。受信側（メール + Slack）は Web と共通。店舗名と
  「アプリから送信」を自動付与。
- **ナレッジ**: `app/knowledge` を追加。**新テーブル・新スキーマなし**。
  - 共有: `academy_lessons` の published。RLS が `status='published'` を全認証ユーザーへ
    開いているため、運営コンテンツと**他店舗の投稿**が横断で読める（既存設計）
  - 自店舗: `tenant_field_knowledge`（施工の勘所・車種別メモ、自テナントのみ）
  - 出所が分かるよう「Ledra 公式」「他店舗の知見」バッジを表示
- **ナレッジの投稿・取り消し**: `POST/PATCH/DELETE /api/mobile/academy/lessons[/[id]]` を追加。
  スキーマ・権限判定・行の組み立ては `src/lib/academy/createLesson.ts` に集約し、
  管理画面の既存ルートも同じモジュールを使うよう書き換え。Supabase へ直接 insert
  させないのは、RLS だけだと staff でも書けてしまい「投稿は admin 以上」という
  管理画面のルールが崩れるため。編集・削除は「作者本人 or 運営」（テナント管理者でも不可）。
  公開を選んだときだけ「他店舗のスタッフからも読める」旨と、顧客名・車両番号を
  書かない注意を出す。一覧の「自分の投稿」タブは下書きも含め、取り消した投稿が
  辿れなくなる行き止まりを防ぐ。
- **タブバー**: 自前描画に変更（React Navigation 既定の項目内 padding で丸ボタンが潰れた）。
  絶対配置にして内容がその下を流れるようにし、丸ボタンだけが浮く形に。ラベルは廃止。
- 注記: 投稿・取り消しは `/api/mobile/academy/lessons` が**未デプロイのため本番反映後に動く**。
  規約類は同梱したので即動く。

## 記入フォーマット

```

## YYYY-MM-DD 変更タイトル (PR #番号 / commit)
- 内容: 何を実装・変更したか
- 対象: どの画面・API・業種向けか
```

## 2026-08-20 IMP-023 §7 JOB_EVIDENCE — 証跡凍結ガード・必須ショット進捗（branch impl/IMP-023-evidence / PR #938）

- 内容: v2.0 §7 の証跡撮影基盤ギャップを2件クローズ。(1) `certificate_images_guard` DB
  トリガー — 発行済み(active)/取消済み(void)証明書に紐づく写真行の DELETE を DB レベルで
  ブロック。証跡列(sha256/original_sha256/perceptual_hash/stage/authenticity_grade/
  tsa_token/tsa_authority/tsa_timestamp_at/c2pa_manifest_cid/storage_path)の破壊的 UPDATE
  も拒否。非証跡列(sort_order 等)の更新は許可。DELETE API route にトリガーエラーの 409
  ハンドリング追加。(2) `evidenceProgress.ts` — 工程ガイドの必須ショット宣言とアップロード
  済み写真の stage タグを突合せ、進捗(total/fulfilled/missing)を返す純関数。テスト 8 件。
- 対象: 証明書写真システム。設計原則 10「原本証跡は不変/追記のみ」の充足。IMP-024/026 の前提条件。

## 2026-08-20 IMP-022 §6 Work List & Job Hub — ステータス統一・情報階層・CTA規律（branch impl/IMP-022-work-list-job-hub / PR #937）

- 内容: v2.0 §6 の Work List & Job Hub を実装。(1) 予約ステータス表示統一
  (`src/lib/domain/jobStatusDisplay.ts` — 5値×色/ラベル/ヒント/BadgeVariant の単一定義源。
  ReservationsClient/CalendarView/JobStatusPanel/StorefrontJobWorkflow の 4 箇所の重複
  STATUS_CONFIG を置換)。(2) ステッパー情報階層 — 現ステップを拡大(border-2, text-sm,
  px-3.5)、完了/未着手を圧縮(text-[11px], px-2.5)。JobStatusPanel + JobSignoffPanel
  の両ステッパーに適用。(3) CTA 規律 — Next Actions セクションをステータスで出し分け:
  作業前(confirmed/arrived)は証明書/請求書非表示、完了後は予約編集非表示、キャンセルは
  全非表示。(4) types.ts の STATUS_FLOW/STATUS_LABEL/STATUS_HINT を共有モジュールからの
  再エクスポートに置換。新 DB クエリ・マイグレーションなし。テスト 7 件。
- 対象: 案件ワークフロー画面、予約一覧/カレンダー。IMP-023/024/026/027/028 の前提条件。

## 2026-08-19 IMP-021 §5 HOME — 3秒理解ホーム（branch impl/IMP-021-home / PR #936）

- 内容: v2.0 §5 のダッシュボード「3秒理解」を実装。(1) NEXT ACTION セクション —
  今日のタスクタイル（todayTasks.ts ベース）から最優先 1 件を NextActionCard で提示。
  優先度→Severity 自動変換（urgent→CRITICAL、warn→HIGH、normal→ACTION）、
  CTA ボタン付き。(2) 今日の進捗 ProgressCard — 当日予約の完了/合計を円形プログレスで表示。
  (3) WorkScopeProvider — React Context（自分/店舗/全店舗 3 段階切替、URL params 連動）。
  (4) HomeScopeToggle — SegmentedControl ベースの 3 段階スコープ切替（旧 2 段階から拡張、
  PageHeader の actions に配置）。(5) ダッシュボードレイアウト再構築 — NEXT ACTION →
  Progress → Approval → Setup → QuickActions → TodayTasks → Stats の順に再配置。
  新 DB クエリ・マイグレーションなし（既存 fetchTodaySignals を再利用）。テスト 13 件。
- 対象: 管理画面ダッシュボード。IMP-022（Work List）・IMP-029（Job Detail）の前提条件。

## 2026-08-19 IMP-016 オフライン同期キュー・競合検出基盤（branch impl/IMP-016-offline-sync / PR #TBD）

- 内容: v2.0 §14 のオフライン同期基盤を型・純粋関数で整備。(1) 同期キュー型
  （`SyncQueueItem` — 既存 OutboxItem を正準 SyncState に接続。`SyncResourceType` 8 種で
  ドメインレベルのリソース分類）。(2) 競合検出・解決型（`SyncConflict` 3 種別 ×
  `ConflictResolutionStrategy` 4 方針。HTTP レスポンスからの競合検出関数。重複キュー
  検出関数）。(3) リソースタイプ別デフォルト解決戦略（証明書・部品＝手動、予約・顧客＝
  クライアント優先）。(4) 同期ドメインイベント 5 種を DOMAIN_EVENT_TYPES に追加
  （sync.started/completed/failed/conflict_detected/conflict_resolved）。(5) 同期サマリー
  型（`SyncSummary` — SYNC_CENTER 画面の状態別件数表示用）。既存の outbox インフラ
  （IndexedDB キュー・Background Sync・SW）は変更なし。DB マイグレーションなし。
  テスト 30 件。
- 対象: 開発基盤（IMP-032 SYNC_CENTER 画面・IMP-023 作業エビデンス・IMP-053 エラー契約の前提条件）。
- **後日訂正（2026-08-27）**: (1)〜(3)・(5) の `src/lib/sync/`（型・競合検出ヘルパー）は
  **削除した。**`/code-review` と Codex が独立に、実際の outbox（`src/lib/outbox/`）が
  持たない情報（メソッド別ステータス・tenant・恒久ブロック状態）を前提にしていると
  指摘し、修正が収束しなかったため（DECISION_LOG 2026-08-27）。(4) の `sync.*` 5
  イベントと `EVENT_RISK` の格付けだけ残した。同期層の型・競合解決は IMP-032 で
  outbox の実際の契約に合わせて設計し直す。

## 2026-08-19 IMP-015 状態機械・遷移表・Certificate Gate 型（branch impl/IMP-015-state-machines / PR #TBD）

- 内容: v2.0 §19 の状態機械基盤を型・純粋関数で整備。(1) 正準 6 軸（Job/Step/Severity/
  Certificate/Payment/Sync）の遷移表（`Record<State, readonly State[]>`）。
  (2) 汎用遷移検証関数（`isValidTransition` / `validNextStates` / `isTerminalState`）と
  拒否理由生成（`rejectTransition`）。(3) Certificate Gate 10 条件の型定義
  （v2.0 §19.4 / ADR-0005。評価器の実装は IMP-028）。(4) UNKNOWN → PENDING 禁止
  （v2.0 §11.3）・CRITICAL → NORMAL 直接降格禁止を遷移表で構造的に表現。
  既存の signoff 状態機械・photoRequirement・API ルートの遷移ロジックは変更なし。
  DB マイグレーションなし。テスト 54 件。
- 対象: 開発基盤（IMP-016 オフライン同期・IMP-028 Certificate Gate・IMP-031 例外状態の前提条件）。
- ADR-0002 判断事項（既存値→正準値マッピング方針）: TS 層マッピングは各消費タスクで
  段階的に導入する。IMP-015 では遷移表のみ定義し変換関数は作らない。
- **後日追記（2026-08-27）**: 根拠が無く保留していた4件を代表判断で追加。
  証明書 REVOKED を ISSUING/VERIFYING からも遷移可に、支払い UNKNOWN の解決先に
  PARTIALLY_PAID/OVERPAID を追加、工程 IN_PROGRESS/BLOCKED から SKIPPED を許可、
  Severity CRITICAL→ACTION は現状の表（許可のまま）で確定。詳細は DECISION_LOG
  「遷移表の未解決4件を代表判断で解決」参照。テスト 6 件追加（mutation-probe 検証済み）。

## 2026-08-19 IMP-014 ドメインイベント・監査・冪等基盤（branch impl/IMP-014-domain-events / PR #932）

- 内容: v2.0 §20 / Appendix B のドメインイベント基盤を型・純粋関数で整備。(1) 統一ドメイン
  イベントカタログ（`resource.action` 命名規約で 33 イベント型を網羅。既存 AuditEventType 27 種
  + AiAuditAction 1 種 + 未型化 2 種 + webhook topics 由来 3 種）。(2) 既存 AuditEventType→
  DomainEventType マッピング（段階的移行用）。(3) 型付きドメインイベントエンベロープ
  （actor 5 種・テナント/店舗スコープ・リスクレベル・冪等キー・バージョン・subject 参照）。
  (4) イベント型別リスクレベル推定（IMP-013 operationRisk と整合）。既存の AuditEventType /
  WebhookTopic / logAuditEvent / emitTenantEvent は変更なし。DB マイグレーション・
  パイプライン変更なし。
- 対象: 開発基盤（IMP-044 イベントパイプライン・IMP-015 状態機械の前提条件）。

## 2026-08-19 IMP-013 権限エンジン・店舗スコープ基盤（branch impl/IMP-013-permission-engine / PR #931）

- 内容: v2.0 §16 の不足分を型・純粋関数で補完。(1) 正準権限動詞 7 種（VIEW/EDIT/CONFIRM/
  APPROVE/ISSUE/MANAGE/EXPORT）の型定義と既存 Permission→正準動詞マッピング。
  (2) 操作リスクレベル 4 段階（low/medium/high/critical）の分類と判定関数（IMP-012
  step-up 認証と連携）。(3) 店舗スコープ型（store_memberships DB スキーマ対応）と
  判定関数群（hasStoreAccess/effectiveStoreRole/isStoreManager/accessibleStoreIds）。
  既存の Permission 型・ROLE_PERMISSIONS マトリクスは変更なし。DB マイグレーションなし。
- 対象: 開発基盤（IMP-014 ドメインイベント・監査の前提条件）。

## 2026-08-19 IMP-012 認証・招待・端末・step-up 基盤（branch impl/IMP-012-auth-foundation / PR #930）

- 内容: v2.0 §15 の認証基盤を型・状態機械・ヘルパーとして整備。(1) 正準オンボーディング
  フロー状態機械（6 ステップ: INVITED→ACTIVE）。(2) 汎用 OTP モジュール（生成・HMAC ハッシュ・
  タイミングセーフ検証）。(3) ユーザー端末管理型（登録・信頼度3段階・遠隔失効）。
  (4) Step-up 認証（7 操作カテゴリの要件マップ・利用可能手段判定）。(5) 招待フロー型
  （ロケール選択付き・トークン検証・有効期限）。DB マイグレーション・画面実装なし。
- 対象: 開発基盤（IMP-013 権限エンジンの前提条件）。

## 2026-08-19 IMP-011 i18n 基盤 & 自動車用語集（branch impl/IMP-011-i18n-foundation / PR #929）

- 内容: v2.0 §17 の i18n 基盤を整備。(1) ロケール登録を 6 言語（ja/en/vi/id/fil/hi）に
  統一（`src/lib/i18n/locales.ts` を単一定義源化、`labels.ts` の `DOMAIN_LOCALES` は再エクスポートに変更）。
  (2) メッセージファイル 4 言語追加（`messages/{vi,id,fil,hi}.json` 各 8 エラーキー）。
  (3) ドメインラベル全 6 軸を 6 言語化（~188 ラベル文字列）。(4) 自動車翻訳用語集
  （`src/lib/i18n/glossary.ts` ~28 用語、`getGlossaryForLocale()` で translateContent.ts 連携可）。
  (5) `WithTranslations<T>` UGC 翻訳分離型（`src/lib/i18n/translated.ts` 型定義のみ）。
  (6) `LOCALE_LABELS` マップ（言語選択 UI 用）。vi/id/fil/hi 翻訳は推定、正式検証は IMP-051。
- 対象: 開発基盤（画面変更なし。IMP-012/020/024/026/051 の前提条件）。
## 2026-08-10 LINE自動返信（ナレッジ）に「次の行動」誘導ボタンを追加（branch claude/line-chatbot-ledra-dy2fiq）

- 内容: LINE のナレッジ自動返信（`knowledgeReplyAuto.ts`）が回答をプレーンテキストで
  返すだけで会話が途切れやすかった問題に対し、回答の末尾に quick-reply 誘導ボタン
  （「お見積りをお願いしたい」「スタッフに相談したい」）を添付できるようにした。
  タップで既存の見積り会話フロー（`awaiting_quote_detail` を作成し車検証/車種+年式を依頼）
  開始、またはスタッフ引き継ぎ（`human_takeover`＋通知）に繋がる。既存の
  `sendCustomerLineButtons` / `handleFlowPostback` / `createFlow` / `buildQuoteDetailAsk` を
  再利用し、状態機械（`states.ts`）とDBスキーマは変更なし。
  - 新 postback: `flow:start_quote` / `flow:consult`（`conversationFlowPostback.ts` が
    状態非依存で処理。`parseFlowPostback` で判定）。
  - ボタン定義は `buildFollowupButtons()`（`src/lib/line/flow/messages.ts`、単一情報源）。
  - **会話フロー opt-in（`shouldRunConversationFlow`）が有効なテナントのみ**ボタン化。
    OFF のテナントは従来どおりテキスト送信で挙動不変（blast radius 最小）。
- 挙動の要点（自動コードレビュー Codex を2ラウンド回して堅牢化）:
  - `flow:consult`（相談）: スタッフへ通知＋お客様へ相談受付案内し、以降の自動処理を止める
    `human_takeover` 状態を**永続化**する（進行中フローがあれば検証＋1回再試行で落とし、無ければ
    マーカーを新規作成）。単発相談でもボットが再応答しない。マーカーは 72h で失効し getActiveFlow
    が無視して自動応答が自然復帰する。**失効行 rot の対策**として `createFlow` に「同一キーの失効
    済み進行中行を expired へ掃除するスイープ」を追加した（一意インデックスは `state NOT IN
    (closed,expired)` で張られ他に失効スイープが無いため、これが無いと期限切れ human_takeover 行が
    残って同一キーの createFlow が永久に失敗する rot が起きる）。
  - `flow:start_quote`（見積り）: **紐付け顧客のみ** `awaiting_quote_detail` を作成（未紐付けは
    フローを作らずスタッフ引き継ぎ＝詰まり防止）。本番 webhook は customerId を渡さないため
    `line_user_id` から顧客を解決し、フロー作成・照会のキーを inbound 側（customer_id 優先）と
    一致させる。施工内容が未知の入口なので施工内容＋車種年式を**テキストで**依頼
    （`buildQuoteDetailAskWithService`。車検証写真は `awaiting_quote_detail` で OCR 未配線のため
    求めない）。
  - `inboundAuto`: 返信・**予約自動起票の前**にフロー状態を一度見て、`human_takeover` の間は
    顧客向け自動処理（予約起票・ナレッジ・概算・フロー開始）を全て止める（受信箱の下書き＝受動
    抽出は残す）。進行中フローがある間は誘導ボタンを付けない（`attachButtons` を渡す）。
  - webhook（`client.ts`）: `maybeAutoProcessInboundMessage` の**前**に送る決定的な定型返信
    （「予約」→予約リンク、未紐付けの連携案内）も `human_takeover` 中は抑止する（`isHumanTakeoverActive`。
    返す定型返信が実際にある回のみ判定してホットパスに無駄なクエリを足さない）。これで AI 層・
    決定的層の両方で takeover が一貫して効く。
- 対象: LINE 受信の AI 自動応答（全業種、Standard プラン以上・opt-in）。
- 検証: 単体テスト追加（`conversationFlowPostback.test.ts`・`knowledgeReplyAuto.test.ts`・
  `inboundAutoReplyGate.test.ts`）。automation+line 全体で 200 件パス、tsc/eslint エラー0。
- フロー照会のキー堅牢化: `getActiveFlow` を `customer_id` **または** `line_user_id` の
  いずれか一致に変更（全 LINE フローは line_user_id を持つ）。未紐付けで作った行を後から
  紐付いた顧客 ID で照会しても取りこぼさず、紐付け前後で進行中フローを見失って抑止/前進が
  切れる問題を解消（この keying 不整合は複数の経路で再発していた根本原因）。
- 配信失敗の後始末: `start_quote` で `createFlow` 後に LINE push が失敗した場合、作った
  `awaiting_quote_detail` 行を `expired` に落とす（届いていない詳細依頼のフローが残って以降の
  ボタン再提示・見積り前進を 72h 塞ぐのを防ぐ）。takeover 遷移時は `expires_at` を今から 72h に
  更新し、競合作成で `createFlow` が弾かれた場合は最新フローを読み直して落とす。
- 未対応（別PR/フェーズ）: `awaiting_quote_detail` 中の車検証写真→OCR 配線、未紐付け客の
  自動登録導線（現状は未紐付けはスタッフ引き継ぎ）。
- 補足: 「FAQで答えられる内容そのものを増やす」のは `tenant_line_knowledge` への登録
  （データ運用）であり本PRの範囲外。本PRは「登録済みFAQに答えた後の誘導UX」を担当。
  概算見積り返信（`quoteReplyAuto`）へのボタン適用は、現行文面「ご来店時に承ります」と
  誘導が矛盾するため後続PRに回した。

## 2026-08-25 恒久失敗キューの取りこぼしを修正（コードレビュー2巡目の反映）
- 内容: 前項の修正に対するコードレビューで、恒久失敗の判定が**別の壊し方をしていた**ことが分かり6件を修正した。
- 実装:
  - `src/app/api/admin/certificates/route.ts`: **`/api/admin/certificates` はあらゆる失敗を 400 で返していた**。
    DB障害のような一時的なエラーまで 400 になるため、新しい恒久失敗判定が
    「二度と送れない」と誤認して未送信の証明書を止めてしまう状態だった。
    入力が原因のコード（`ACTION_VALIDATION_ERRORS`）は **422**、それ以外は **500** に分けた。
  - `src/lib/outbox/queue.ts`: **404 を恒久扱いから外した**。証明書の作成がまだ同期されていない段階で
    後続（発行・写真アップロード）が走ると 404 になりうるが、これは順番の問題で次回の drain では通る。
  - `public/sw.js`: **Background Sync 側に drain ループのもう1つのコピーがあり、前項の修正が入っていなかった**。
    タブを閉じている間だけ永久リトライが復活する状態だったので、`isPermanentClientError` / `markBlocked` を同じ規則で実装。
    両者を必ずそろえる旨をコメントに明記。
  - `src/lib/outbox/queue.ts`: `countOutbox()` が blocked を数えていたため、バッジが
    「N 件 同期待ち」のまま減らないのに同期を押すと「同期待ちはありません」と出る食い違いがあった。blocked を除外。
  - `src/app/admin/certificates/PendingOfflineCerts.tsx`: 恒久失敗は**種別を問わず**表示するようにした。
    発行 (`certificate_activate`) や写真アップロードが止まっているのにどこにも出ないと、
    証明書が draft のまま残っていることに利用者が気づけない。
  - `apps/mobile/src/app/certificates/new.tsx`: 車両マスタの自動作成を**ナンバー入力時のみ**に限定。
    ナンバーが無いと同一車両を identify できず、入庫のたびに別の `vehicles` 行ができて
    走行距離の履歴が1点ずつ分かれてしまうため。
- 検証: API のステータス分岐テスト2件（入力エラー→422 / 想定外エラー→500）を追加。
  404 を再送継続側に移したテストも更新。`node --check public/sw.js` 通過。
  モバイルはローカルで型検査緑。`tsc` クリーン / 全テスト **417ファイル 3,821件** 緑。
- **未対応（正直な記録）**: 「証明書を作る経路を洗い出して全部に入れた」と前項に書いたが、これは不正確だった。
  AI自動化 (`src/lib/ai/automation/certificateRecordAuto.ts`) と `POST /api/certificates/create` は
  `maintenance_json` を書かないため走行距離が積まれない。どちらも人が値を入力する画面が無く、
  必須化しても満たしようがないため今回は変更していない。OPEN_QUESTIONS 2026-08-25 に起票。
## 2026-08-25 オフラインキューの永久リトライを止め、モバイルの車両マスタ自動作成を実装
- 内容: 走行距離必須化のコードレビューで残していた2件を修正した。どちらも「静かに失敗する」状態を解消するもの。
- 対象: オフライン送信キュー（全機能）、モバイルの証明書作成、`/admin/certificates` の保留中証明書UI。
- 実装:
  - `src/lib/outbox/types.ts`: `OutboxItem.blockedAt` を追加。恒久的に送れないと判定した時刻。
  - `src/lib/outbox/queue.ts`:
    - `isPermanentClientError()` を追加。**400 / 404 / 405 / 410 / 413 / 415 / 422** は再送しても結果が変わらないので恒久扱い。
      **401 / 403**（再ログイン・権限付与で回復）と **408 / 429 / 5xx**（時間をおけば通る）は従来どおり再送を続ける。
    - `drainItems` が恒久エラーで `markBlocked` を呼び、`blockedAt` の付いたアイテムは以後スキップする。
      これで**永久リトライが後続アイテムの送信機会を食い潰すことがなくなる**。
    - `markOutboxBlocked()` を追加。**削除はしない** — 利用者が内容を確認してから取り消せるようにするため。
    - `DrainResult` に `blocked` を追加。
  - `src/app/admin/certificates/PendingOfflineCerts.tsx`: 恒久失敗のアイテムを「作り直しが必要」として明示し、
    「この内容では発行できないため再送を止めています。取消してから作り直してください」と案内。同期結果メッセージにも件数を出す。
  - `apps/mobile/src/app/certificates/new.tsx`: `resolveVehicleId()` を追加し、車両マスタ未選択でも
    **ナンバーで既存を探す → 無ければ新規作成**して `vehicle_id` を埋める（WEB の `createCertAction` と同じ手順）。
    トリガー `fn_sync_mileage_from_certificate` は `vehicle_id` が null だと早期 return するため、
    これが無いとマスタ未選択の発行で走行距離が積まれなかった。車両作成に失敗しても証明書の発行自体は止めない。
- 検証: outbox のテスト3件を追加（400で再送を止める／401・403・408・429・500・503は再送を続ける／
  blocked済みは後続を止めない）。**恒久エラー判定を潰すと実際に落ちること**も確認。
  既存の drain テスト8箇所を新しい `DrainDeps` に更新。
  モバイルは依存をインストールして**ローカルで型検査・単体テストとも緑**（CI の `Mobile Typecheck & Unit Tests` も緑）。
  `tsc` クリーン / 変更ファイルの `eslint` エラー0 / 全テスト **417ファイル 3,820件** 緑。
## 2026-08-25 証明書の走行距離を必須化（全施工種別・常時表示）
- 内容: 走行距離を任意の付加情報から**必須項目**に変更し、整備テンプレート限定・折りたたみの中という配置をやめて、
  施工種別を問わず車種選択の直後に常時表示するようにした。本番の走行距離タイムライン `vehicle_mileage_logs` が
  0件だった（証明書45件すべてで値が空）のを解消するのが目的。
- 対象: 証明書の新規作成（WEB管理画面・外部/オフラインJSON API・モバイル）。既存の証明書と編集画面は対象外。
- 実装:
  - `src/lib/maintenance/mileage.ts` (新規): `parseMileageKm()` / `MAX_MILEAGE_KM`。
    判定条件は「DBトリガー `fn_sync_mileage_from_certificate` が捨てない値」＝1以上の整数・上限200万km。
    空・0・負数・小数・`"35000km"` のような単位付き・桁間違いを弾く。フォームとサーバーで同じ関数を使う。
  - `src/app/admin/certificates/new/CertNewFormWrapper.tsx`: 常時表示の必須入力を車両セクション直下に追加。
    送信前チェックも追加（**オフライン経路は Server Action を通らずキューに積むため、ここを通さないと
    「保存できたのに復帰後の同期で必ず失敗する」証明書が溜まる**）。`mileage_required` のエラー文言を追加。
  - `src/app/admin/certificates/new/actions.ts`: 信頼境界としてサーバー側で必須チェック。
    値は既存の `maintenance_json.mileage` に載せ、**既存トリガーに `vehicle_mileage_logs` へ落とさせる**
    （新テーブル・新マイグレーションなし）。整備欄の描画は公開ページ・PDF とも `service_type === "maintenance"`
    で閉じているため、コーティング等の証明書に整備欄が出ることはない。
  - `src/app/admin/certificates/new/MaintenanceDetailsSection.tsx`: 重複する走行距離欄を削除（入力欄は1つに集約）。
  - `src/lib/certificates/createCertificateApi.ts`: `certCreateJsonSchema` に `mileage_km` を必須で追加し、
    JSON→FormData / FormData→JSON の両変換に載せた。ここを optional にすると
    「フォームだけ必須・APIは素通り」の抜け道になるため。
  - `apps/mobile/src/app/certificates/new.tsx` + `apps/mobile/src/lib/mileage.ts` (新規):
    モバイルは Supabase へ直 insert していて Server Action を通らないため、同じ必須化を個別に実装。
    パスエイリアスが無いので判定関数はミラーコピー（両者を揃える旨をコメントに明記）。
- 検証: `parseMileageKm` の単体テスト4件（正常・トリガーが捨てる値・単位付き/小数・桁間違い）、
  スキーマの必須化テスト、**オフライン往復（json→FormData→json）で値が落ちないテスト**を追加。
  既存テストのフィクスチャ14件を新しい契約に更新。`tsc` クリーン、全テスト **417ファイル 3,815件** 緑。
  モバイル分は**CI の `Mobile Typecheck & Unit Tests`（`apps/mobile` で `npm ci` → `tsc`）が緑**。
  ローカルでは依存が未インストールで筆者が回せなかっただけで、型検査は通っている。未検証なのは実機動作のみ。
- コードレビュー反映: (1) `maintenance_json` が常に非空になることで製造元品質フラグ `no_service_detail` が
  どの証明書でも立たなくなる回帰を修正（走行距離は「何をしたか」の記録ではないので施工内容の判定から除外。
  `src/lib/manufacturers/qualityFlags.ts`）。(2) `maintenance_json` に配列が来ると `typeof [] === "object"` で
  素通りし、配列への `.mileage` 代入が JSON 化で消えて走行距離が黙って失われる問題を修正（配列を弾く）。
  (3) モバイルは車両マスタを自動作成しないため、マスタ未選択だとトリガーが早期 return して走行距離が
  積まれない点をコメントで明示し OPEN_QUESTIONS に起票（挙動自体は未修正）。
  (4) デプロイ前にオフラインキューへ滞留したアイテムが 400 で永久リトライになる件も OPEN_QUESTIONS に起票。
## 2026-08-23 入力された車体番号が車両パスポートに反映されないバグを修正（VIN正規化のトリガー化）
- 内容: `vehicles.vin_code_normalized` を `vin_code` から自動導出する DB トリガーを追加し、取り残されていた行をバックフィルした。
  マイグレーション `20260424000004` はこの列を追加して**一度だけ**バックフィルしたが、以降この列を埋める仕組みが無く、
  アプリ側の書き込み経路（車両作成API・CSVインポート・車検証OCRからの作成・パスポートupsert・管理画面の新規/編集フォーム）は
  いずれも `vin_code` しか書いていなかった。結果、**バックフィル以降に入力された車体番号はすべて NULL のまま**で、
  `/v/[vin]`（車両パスポート）・有料車両履歴レポート・加盟店への収益還元のいずれからも引けなくなっていた。
  本番実測では車体番号入力済み6台のうち5台（2026-05-08〜2026-08-21に作成）がこの状態だった。
- 対象: 車両パスポート `/v/[vin]`、車両履歴レポート（`src/lib/vehicleReport/*`）、加盟店収益還元、外部 v1 API のVIN照会。
  車両を作るすべての経路（Web管理画面・CSVインポート・車検証OCR・モバイル・外部API）。
- 実装:
  - `supabase/migrations/20260825000000_vehicles_vin_normalized_trigger.sql` (新規):
    - `set_vehicle_vin_normalized()` + `BEFORE INSERT OR UPDATE` トリガー。書き込み経路が5箇所以上あるため、
      呼び出し元ごとではなく DB 側の一点で担保する（既存の `set_updated_at` と同じパターン）。
    - 元のバックフィルに無かった **NFKC 正規化を追加**。全角で入力された車体番号も引けるようになる。
      式はアプリ側の `src/lib/passport/normalizeVin.ts` と一致（NFKC → 大文字化 → 空白とハイフンの除去）。
    - 取り残された行のバックフィル（`IS DISTINCT FROM` 条件で冪等）。
    - 自己検証を同梱: (1) トリガーが実際に正規化するかを一時テーブルで確認、(2) 車体番号があるのに引けない車両が
      残っていないかを確認。どちらか壊れていればマイグレーションが例外で落ちる。
  - `src/lib/passport/getPassportData.ts`: `/v/[vin]` の VIN 照合を `trim().toUpperCase()` から
    共通ヘルパー `normalizeVin()` に変更。保存側を正規化しても照合側がハイフン・全角を処理していなかったため、
    `/v/JH4-DC5-3001` のような URL では車両を引けなかった（コードレビューで発見）。
    生の入力を正規化しているのはここ1箇所だけで、他の `trim().toUpperCase()` は正規化済みの値への防御的な呼び出し。
  - `src/lib/passport/__tests__/normalizeVin.test.ts`: U+FEFF（BOM）を除去するケースを追加。
    PostgreSQL の `\s` は U+FEFF に一致しないため、SQL 側では明示的に列挙して JS と挙動を揃えている。
- 既知の副作用（意図的）: VIN を編集すると正規化キーが変わり、`vehicle_report_orders`・`vehicle_passports` が
  旧キーに取り残される。カスケードは範囲外として OPEN_QUESTIONS に起票（現時点でレポート購入実績0件のため実害なし）。
- 検証: ローカルの PostgreSQL 16 に修正前の本番状態（正規化済み1件・取り残し5件・全角VIN・重複VIN・NULL/空白VIN・値が古い行）を
  再現して適用。バックフィル結果・新規INSERT時の正規化・VIN編集時の再正規化・VIN削除時のクリア・無関係な列のUPDATEで壊れないこと・
  再適用の冪等性を確認。正規化ルールが JS 側の `normalizeVin()` と
全10ケース（全角・ハイフン・NBSP・U+3000・BOM・プレースホルダ含む）で一致することも突き合わせた。
正規化ルールを壊した版・バックフィルを外した版のそれぞれで自己検証が実際に落ちること（検証が空回りしていないこと）も確認済み。
## 2026-08-23 super_admin RLS修正・エラー表示改善 (PR #963)
- 内容: `my_tenant_role()`関数で`super_admin`→`owner`にマッピングし、全テーブルのRLS書き込みポリシーがsuper_adminを許可するように修正。`StoresClient.tsx`のエラー表示を`data.message`優先に変更。
- 対象: 全テーブルのRLSポリシー（stores, certificates, vehicles, customers等）、店舗管理画面。
- 実装:
  - `supabase/migrations/20260822000000_fix_super_admin_rls.sql` (新規): my_tenant_role()のCASE式追加
  - `src/app/admin/stores/StoresClient.tsx`: エラーハンドリング3箇所で`data.message || data.error`に変更
## 2026-08-21 全画面デザイントークン適用 & 認証/オンボーディングフロー新設（branch claude/imp-000-implementation-r0eje1 / PR #926）
- 内容: モバイルアプリの全41画面をLedraデザイントークン準拠にする最終仕上げ。
  - **既存28画面の一括トークン移行**: hardcoded colors→tokens, Card→View+card styles,
    Button→LedraButton, Chip→StatusBadge, SegmentedButtons→SegmentedControl,
    Dialog→Alert.alert()/LedraAlert, Searchbar→native TextInput, Divider→View+colors.divider
  - **認証フロー新規4画面**: OTP認証（verify-otp: 6桁個別入力+自動フォーカス+60秒リセンド）、
    生体認証セットアップ（biometric-setup: 3メリット+アニメーション成功画面）、
    オンボーディング（3スライド横スワイプ+ページインジケーター+スキップ）、
    パスワードリセット（forgot-password: ブランドヘッダー+成功画面）
  - **認証フロー既存3画面リデザイン**: ログイン（Ledra Blueブランドヘッダー+角丸フォームカード）、
    サインアップ（同ブランドヘッダーパターン）、店舗選択（コンパクトブランドバー）
- 対象: モバイルアプリ（`apps/mobile/`）。全41画面（スクリーン）がデザイントークン準拠。
- 検証: `npx tsc --noEmit` 通過、`expo lint` エラー0件、テスト通過。
  32ファイル変更、+4903行/-2859行。
## 2026-08-21 UI-040/060/070 モバイルアプリ UI リデザイン Phase 2（branch claude/imp-000-implementation-r0eje1 / PR #926）
- 内容: Phase 1（UI-010/020/030）に続き、残りの主要画面をLedraデザイントークンベースに全面リデザイン。
  - **UI-040（作業リスト & Job Hub）**: 作業一覧を StatusBadge+車両アイコン+メタ行のカード形式に再構成。
    作業詳細を Vehicle heroカード+ProgressRing+NEXT ACTION+ステッパー+5タブ（概要/作業/証拠/書類/履歴）の
    多機能ハブに拡張。
  - **UI-060（車両 & 証明書タブ）**: 車両タブのスタブを検索バー付き一覧に実装（証明書数バッジ付き）。
    車両詳細を Vehicle Passport レイアウト（Heroカード+2x2 Stat Grid+証明書タイムライン+NFCタグ一覧）に刷新。
    証明書タブのスタブを SegmentedControl（すべて/有効/下書き）フィルター付き一覧に実装。
    証明書詳細を VERIFIED shield hero+完全性検証チェック（写真同期/NFC/ステータス）+PDF/QR/共有アクションに刷新。
  - **UI-070（通知センター）**: 新規画面作成。すべて/未読フィルター、タイプ別カラーアイコン、相対時刻表示、
    未読インジケーター（青ドット+左ボーダー）。
- 対象: モバイルアプリ（`apps/mobile/`）。ウェブ管理画面は対象外。
- 検証: `npx tsc --noEmit` 通過、`npm run lint` エラー0件、全3806テスト通過。
  7ファイル変更、+2217行/-571行。
## 2026-08-20 UI-010/020/030 モバイルアプリ UI リデザイン Phase 1（branch claude/imp-000-implementation-r0eje1 / PR #926）
- 内容: Ledra_UIUX_Development_Specification_v2.0 のリファレンス画像を視覚目標として、
  モバイル Expo アプリ（`apps/mobile/`）の UI を全面リデザイン。3タスクを一括実装。
  - **UI-010（デザインシステム基盤）**: `apps/mobile/src/constants/tokens.ts` を新規作成し、
    色・タイポグラフィ・余白・角丸・サイズ・影のすべてのトークンを単一定義源に集約。
    react-native-paper テーマ（`theme.ts`）をトークンから導出するよう接続。
    9 つの共有 UI コンポーネントを新規作成（LedraButton / StatusBadge / SegmentedControl /
    NextActionCard / StatusCard / ProgressRing / LedraAlert / Skeleton / BottomSheet）。
    既存コンポーネント（EmptyState / LoadingScreen / OfflineBanner / Steps）もトークン移行。
  - **UI-020（モバイルシェル）**: タブレイアウトを v2.0 正準5タブ（ホーム/作業/車両/証明/その他）に再編。
    浮遊型 Ledra Blue 円形アクティブインジケータ、Quick Create FAB（+ボタン）、
    QuickCreateSheet（車両登録/顧客登録/予約作成/作業開始の4アクション）を実装。
  - **UI-030（ホーム & MORE 画面）**: ホーム画面をリファレンス01_home に合わせ全面再構築
    （日付挨拶・3段階スコープ・作業サマリカード+ProgressRing・NEXT ACTION・進行中一覧・
    対応必要一覧・タイムライン）。MORE 画面をリファレンス07 に合わせセクション別リストに再編。
- 対象: モバイルアプリ（`apps/mobile/`）。ウェブ管理画面は対象外。
- コードレビュー: 自己レビューで BottomSheet の閉じアニメーション未再生バグと
  onRefresh の try/finally 欠如を発見・修正してから push。
- 検証: `npx tsc --noEmit`（モバイル・ルート両方）通過、`npm run lint` エラー0件。
  25ファイル変更、+2589行/-552行。

## 2026-08-19 IMP-010 デザイントークン & 共有コンポーネント基盤（branch impl/IMP-010-design-tokens / PR #928）

- 内容: v2.0 §3 の不足 UI プリミティブ8つを新設 — SegmentedControl（ピル型切替、3箇所の
  重複実装の共通化先）/ StatusBadge（Badge+statusMaps の定型接続）/ StatusCard /
  NextActionCard / ProgressCard（円形進捗+ゼロ除算ガード）/ Alert（169箇所のインライン
  警告 div の共通化先）/ IconButton（44px タッチターゲット）/ BottomSheet（モバイル用、
  共通 a11y フック useDialogA11y=フォーカストラップ+復元付き）。既存部品への追加:
  Badge に dot、Button に xl（48px CTA）。statusMaps に SEVERITY_VARIANT_MAP
  （正準 Severity → 表示 variant）。使用0件の旧 `src/components/StatusBadge.tsx`
  （独自スタイル二重管理）を削除。予約ステータスの中央マップ追加は既存2定義
  （pos-constants / ReservationsClient）との配色衝突が判明したため見送り
  （統合は IMP-022 で判断）。DESIGN_SYSTEM.md のコンポーネント表を新設分まで更新。
- 対象: 開発基盤（既存画面の見た目は不変。新部品は IMP-020 以降の画面で使用）。

## 2026-08-19 IMP-001 実装ガードレール & 正準ドメイン語彙（branch impl/IMP-001-domain-vocabulary / PR #927）

- 内容: v2.0 の6状態軸（Job/Step/Severity/Certificate/Payment/Sync）を正準語彙モジュール
  `src/lib/domain/states.ts`（値集合+型+型ガード）と `src/lib/domain/labels.ts`
  （ja/en ラベル、ja は v2.0 Appendix A 準拠、未収録ロケールは ja フォールバック）として新設。
  ADR 6本（`docs/adr/0001`〜`0006`）と「アドホック状態禁止」ルール（CLAUDE.md）を追加。
  ユニットテスト29件（値集合・型ガード・legacy 値拒否・ラベル網羅・フォールバック）。
  既存の稼働コード・DB には変更なし。
- 対象: 開発基盤（ユーザー向け画面の変更なし）。

## 2026-08-19 IMP-000 リポジトリ監査 & 実装ベースライン（branch claude/imp-000-implementation-r0eje1 / PR #926）

- 内容: v2.0 仕様書（UI/UX & Development Specification v2.0）の実装に先立つリポジトリ監査。
  `docs/implementation/current-architecture.md`（現状アーキテクチャ＋検証ベースライン＋不可逆リスク台帳）と
  `docs/implementation/requirement-trace.md`（v2.0 要件⇔既存実装⇔IMP タスク36件のトレース表）を新規作成。
  既存検証（lint / lint:migrations / tsc / vitest coverage / build / mobile typecheck+test）を無変更で実行し
  ベースラインを記録。コード変更ゼロ。
- 対象: 開発プロセス（ユーザー向け機能の変更なし）。

## 2026-08-22 SEO/LLMO改善: llms.txt, OGメタデータ補完, canonical追加, Twitterハンドル設定 (PR #962)
- 内容: AIクローラー向けllms.txt/llms-full.txtを新規追加、ブログ・事例詳細ページのOG/Twitter/JSON-LD補完、法的ページのcanonical URL追加、Twitterハンドル(@detailing_holy)の全ページ反映。
- 対象: マーケティングサイト全体（SEO/LLMO/SNSシェア）。
- 実装:
  - `src/app/llms.txt/route.ts` (新規): siteConfigから動的生成する簡潔版AI向けテキスト
  - `src/app/llms-full.txt/route.ts` (新規): 料金・機能・全ページリンク・キーワード含む詳細版
  - `src/components/marketing/JsonLd.tsx`: ArticleJsonLdにpathPrefix/articleTypeパラメータ追加（後方互換）
  - `src/app/(marketing)/blog/[slug]/page.tsx`: OG(article)/Twitter/BlogPosting JSON-LD追加
  - `src/app/(marketing)/cases/[slug]/page.tsx`: OG(article)/Twitter/Article JSON-LD + publishedAt伝搬
  - `src/app/(marketing)/news/[slug]/page.tsx`: twitter site/creator追加
  - `src/lib/marketing/config.ts`: twitterHandle追加
  - `src/app/layout.tsx`: twitter.site/creator反映
  - `/privacy`, `/terms`, `/law`, `/contact`: canonical追加
  - `/tokusho`: canonical・og:urlを/lawに統一、sitemapから除去


## 2026-08-16 LINE連携の入力を「Channel ID と Secret の2つだけ」に（branch claude/multi-integration-login-opnzfh）

- 内容: LINE公式アカウント連携で加盟店に求めていた7手順のうち3つを自動化し、入力を2値に削った。
  モジュールチャネル（申請制・現在受付停止中）を待たず、申請不要の Messaging API だけで実現している。
- 対象: 加盟店管理画面の LINE 連携（`/admin/settings/connections`）、全業種。
- 実装 (`src/lib/line/provisioning.ts` 新規):
  - **アクセストークンの自動発行**: `POST /v2/oauth/accessToken` (client_credentials)。
    加盟店が LINE Developers Console で「チャネルアクセストークン（長期）」を発行してコピーする工程が消えた。
  - **Webhook URL の自動設定**: `PUT /v2/bot/channel/webhook/endpoint`。
    Ledra が表示した URL を加盟店が Console に貼り戻す工程（最も事故る工程）が消えた。
  - **保存時の配送テスト**: `POST /v2/bot/channel/webhook/test`。
    「保存はできたのに届かない」を保存の瞬間に検出する。
  - **残作業の自動検出**: `GET /v2/bot/info` の `chatMode` と webhook の `active` を読み、
    **API で変更できない2項目**（Webhookの利用ON / 応答モードをBotに）だけを、
    その状態のときに限って1行ずつ案内する。全部済んでいれば「完了」と言い切る。
  - **「接続を再確認」ボタン**（`action: "verify"`）: トークンを発行し直し、Webhook を設定し直して
    配送テストまで実行する。失効時の手動復旧口も兼ねる。
- 失効対策: 自動発行されるトークンは **30日で失効する**（手入力の長期トークンは無期限だった）。
  放置すると30日後に通知が静かに全部止まるため、`tenants.line_channel_token_expires_at` に失効時刻を
  保存し、送信直前に期限が3日以内なら自動で再発行する（`getLineConfig`）。再発行に失敗しても
  既存トークンはまだ有効なので送信自体は止めない（ログのみ）。
- 後方互換: 手入力の長期トークンで運用中の既存テナントは同カラムが NULL のままで再発行の対象外。
  API も `channel_access_token` を任意で受け付け続けるため、既存の連携はそのまま動く。
- 検証: 416ファイル 3804テスト green（新規17テスト: トークン発行のパラメータと失効時刻の計算 /
  401の日本語メッセージ / Webhook の PUT 内容 / 残作業の判定3パターン / GET 404 を「未設定」として扱う /
  手入力トークンは再発行しない / 失効判定7ケース）。`tsc` エラーなし、`lint:migrations` OK。

## 2026-08-16 外部サービス連携を1画面に集約し、Slack を「ログインするだけ」に（branch claude/multi-integration-login-opnzfh）

- 内容: 加盟店が連携のたびに開発者コンソールで ID・トークンを発行して貼り付ける手間を無くすため、
  (1) 汎用 OAuth 基盤、(2) Slack のワンクリック連携、(3) 連携ページの集約、を実装した。
  LINE は申請が必要な法人限定機能に依存するため調査のみ（`docs/line-module-channel-research.md`）。
- 対象: 加盟店管理画面 `/admin/settings/connections`（新設）、全業種。
- 実装:
  - **汎用 OAuth 基盤** `src/lib/integrations/`。`OAuthProviderSpec` を実装した
    プロバイダ定義1ファイルを `providers/` に置き `registry.ts` に1行足すと、
    共通ルート `/api/admin/connect/[provider]`（GET=状態 / POST=認可URL / DELETE=解除）と
    `/callback` がそのまま使える。新しい API ルートも DB マイグレーションも不要。
    保存先は新テーブル `tenant_integrations`（`provider` に CHECK 制約を意図的に置かず、
    連携先追加でマイグレーションが要らないようにしている）。トークンは既存の
    envelope 暗号化（`@/lib/crypto/tenantSecrets`）で `_ciphertext` 列にのみ保管。
  - **Slack 連携**（基盤の最初の実装）。`incoming-webhook` スコープのみを要求し、
    bot トークンは保存しない（`storeTokens: false`）。受け取った webhook URL は
    **既存の** `tenants.booking_notify_slack_webhook_ciphertext` に書くため、
    通知の送信側 `src/lib/notifications/bookingNotify.ts` は1行も変えていない。
    手入力フォームも従来どおり使え、既に設定済みのテナントはそのまま動く。
    Slack が返した URL も手入力と同じ `isSlackIncomingWebhookUrl()` で
    `hooks.slack.com/services/...` に限定する（顧客名・日時・備考を任意のサーバーへ
    POST させないため。判定は設定フォームと共通化した）。
  - **連携ページ集約** `/admin/settings/connections`。Slack / LINE / Square /
    メール予約取り込み / NexPTG のセクションを店舗設定から移設し、Google カレンダー・
    freee・マネーフォワード・Stripe への導線と接続状況を1画面にまとめた。各連携に
    「ログインのみ / 発行作業あり」のラベルを出し、手間が残っている連携が分かるようにしている。
  - `oauthState.ts` を `src/lib/accounting/` から `src/lib/integrations/` に移設（全連携共通化）。
    署名鍵は `INTEGRATION_OAUTH_STATE_SECRET`、後方互換で
    `ACCOUNTING_OAUTH_STATE_SECRET` → `FREEE_CLIENT_SECRET` にフォールバックする。
    32文字未満の鍵は拒否するが、**既存の会計連携が突然切れないよう、長さチェックは
    新しい env にのみ課している**。
- 運営側の必要作業: Slack アプリを1度だけ登録し `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` /
  `INTEGRATION_OAUTH_STATE_SECRET` を設定する。未設定の間は Slack カードが
  「運営側の設定待ち」と表示され、ボタンは押せない（加盟店が失敗を踏まないようにするため）。
- 検証: 全 411 ファイル 3744 テスト green。新規 18 テスト（認可URL組み立て / トークン交換 /
  state の署名・provider不一致・改竄・期限切れ・短い鍵 / Slack の `ok:false` 拒否・
  ホスト限定・解除時の webhook 列クリア）。`npm run build` 通過、`lint:migrations` OK。
## 2026-08-15 連絡先が欠けているお客様に、マイページから自分で登録してもらう導線を追加

- 内容: LINE連携だけで作られた顧客は email（や電話）が空で、メール通知が届かず PC など
  LINE 以外からログインもできない。マイページに「お客様情報のご登録のお願い」を出し、
  本人が入力して保存できるようにした（欠けている項目だけ表示）。LINE の連携案内メッセージにも、
  email が無いお客様にだけ登録のお願いを 1 行添える。
- 対象: 顧客マイページ（`/customer/[tenant]`）、`POST /api/customer/profile`（新規）、LINE通知。
- 安全側: 更新できるのは**セッションに紐づいた customer_id の行のみ**（customer_id を持たない
  旧 OTP セッションは 401。フォーム自体も出さないよう profile API が `canEditContact` を返す）。
  **空欄を埋めるだけで、登録済みの値は上書きできない**（登録済み email はマイページの
  ログイン identity そのもので、本人確認なしの差し替えは乗っ取り経路になるため。変更は店舗経由）。
  同一テナント内で他の顧客が使っている email は拒否（重複チェックのクエリが失敗したときは
  書き込まず 500＝fail-open にしない。`ilike` の `_`/`%` ワイルドカードで誤判定しないよう
  候補を引いたうえで完全一致だけを見る）。ログには値そのものを残さず「どの項目を埋めたか」だけ記録。
- 既存の登録フォーム（intake 招待）は使わなかった: あれは**身元が未知の新規客**向けで、
  email/電話の一致による突合を通るため、既に customer_id が確定しているこのケースでは
  重複顧客を作る危険がある。セッションで本人が確定している以上、その行を直接更新するのが素直。
- 【要確認】入力された email は検証していない（確認コードを送っていない）。スタッフが管理画面から
  入力する既存の経路も未検証なので、それに揃えた。誤入力の宛先に通知が飛ぶ余地は残る。
- 検証: 新規テスト `src/app/api/customer/profile/__tests__/route.test.ts` 7件
  （自分の行だけ更新・重複emailの拒否・customer_id 無しセッションの401・形式不正）。
  ユニット全体 3756件パス、tsc エラー0、eslint/migrations lint OK。

## 2026-08-15 email が無い顧客もマイページに入れるように（LINE連携＝本人性での単回使用トークンログイン）

- 内容: マイページのログインは email 一致＋メール宛OTPのみで、email を持たない顧客
  （受信箱からスタッフが作った顧客・登録フォームで email を空にした顧客）は入る手段が
  無かった。LINE連携済みなら本人性は取れているので、連携時と「マイページ」受信時に
  **単回使用・期限付き（既定7日、`PORTAL_LINE_LOGIN_TTL_MIN`）のログイントークン**を発行し、
  `GET /my/line?t=` で `customer_id` 紐付きのポータルセッションに引き換える。
  生トークンはDBに保存せず sha256+pepper のみ。tenant はトークン側の値を正とし、
  URLパラメータでの上書きを許さない。期限切れ・使用済みは `/my` に戻し、LINEに
  「マイページ」と送れば無料の応答メッセージで再発行できる旨を表示する。
- 対象: 顧客マイページ（`/my/line`、`/customer/[tenant]`）、LINE通知。全業種共通。
- DB: `supabase/migrations/20260815110000_customer_portal_line_login.sql`
  （`customer_sessions` の email/下4桁ハッシュを NULL 許容化＋「customer_id があるか
  email+下4桁が揃っているか」のCHECK / 新表 `customer_portal_login_tokens` /
  `customer_inquiries` に customer_id 追加・下4桁ハッシュ NULL 許容 /
  `customer_deletion_requests` の email NULL 許容）。CHECK は `NOT VALID` で追加してから
  別途 `VALIDATE`（既存行の全走査で ACCESS EXCLUSIVE を取らないため）。索引は
  `CONCURRENTLY` が要るので `20260815110001_customer_inquiries_customer_index.sql` に分離。
  **適用は main マージ時に db-migrate ワークフローが自動で行う**（#917 で復旧済み）。
  バージョンは #917 の `20260815000000/000001` と衝突していたため `20260815110000/110001` へ改番
  （重複すると片方が「適用済み」と記録されたまま中身が実行されず、#917 が修復したドリフトそのものになる）。
- Codex レビューでの修正: (1) `customer_sessions.customer_id` の外部キーを SET NULL → CASCADE に
  変更し、`customer_inquiries` / `customer_deletion_requests` の CHECK は付けないことにした。
  SET NULL のままだと LINE 由来の行（email も下4桁も無い）で顧客削除が CHECK 違反になり、
  **個人情報の削除請求の実行そのものが失敗する**。(2) 連携の競合で敗者にもログインURLを
  送っていた経路を塞いだ（条件付き UPDATE の結果を確認し、トークン発行の直前にも宛先が
  現在の連携相手かを確認する）。(3) ログインリンクは GET で消費せず確認画面のボタン（POST）で
  引き換える — LINE のリンクプレビューやクローラの先読みで単回使用トークンが焼き切れ、
  実際にタップしたお客様が入れなくなるため。(4) 自己登録の重複チェックで `ilike` の
  ワイルドカードをエスケープ（`%` を含むアドレスで検知漏れになる）。(5) 「空欄のときだけ
  埋める」を UPDATE の条件にも入れて競合時の上書きを防止。(6) 電話番号は桁数も検証。
- 秘匿: 案内本文には生のログイントークンが載るため、受信箱 (`customer_messages`) へ
  記録する本文では `recordOutboundLineMessage` が `?t=` を伏せる（`maskPortalLoginToken`）。
  伏せないと店舗スタッフが受信箱からコピーして顧客本人としてログインできてしまう。
- 併せて修正: `/api/customer/list`・`/api/customer/inquiry` の認証ゲートが下4桁ハッシュ
  必須だったため customer_id でも通るように。問い合わせ一覧は customer_id と下4桁ハッシュの
  OR で引く（customer_id 列が無かった時代の行を取りこぼさないため）。`/my` を proxy の
  PUBLIC_PREFIXES に追加（Supabase auth ではなく専用cookieで認証するため）。
- 検証: 新規テスト `src/lib/__tests__/customerPortalLineLogin.test.ts` 8件
  （ハッシュのみ保存・期限切れ/使用済み/並行クレーム負け/不正形式の拒否・tenantはトークン側優先）。
  ユニット全体 3745件パス、tsc エラー0、eslint 追加警告0。

## 2026-08-15 LINE連携が完了したら、マイページURLを自動でLINE送信（branch claude/customer-history-check-eoqjsy）

- 内容: 顧客が LINE 連携を済ませても、マイページ（証明書・施工履歴・予約の閲覧口）の URL が
  自動では届いていなかった。連携成立の共通チョークポイント `linkLineUserToCustomer()`
  （`src/lib/line/linkCustomer.ts`）に「d. マイページ案内の送信」を追加し、3つの連携経路
  （受信箱からの手動紐づけ / 連携コード / 登録フォーム intake 完了）すべてで 1 通だけ届くようにした。
  本文組み立ては `buildPortalWelcomeText(tenantId)` に切り出し、`NEXT_PUBLIC_APP_URL` 未設定または
  tenant slug 不明のときは **null を返して送信を見送る**（`/my?...` という壊れた相対リンクを
  顧客に送らないため）。
- 対象: 顧客向け LINE 通知。マイページ導線 `/my?tenant={slug}`。全業種共通。
- コスト配慮: 連携コード経路は直後に**無料の応答メッセージ**を返しているので、そこへ案内を同梱し、
  従量課金のプッシュは送らない（`suppressPortalMessage` オプションで抑止）。他の2経路はプッシュ 1 通。
- 送信条件（自動コードレビューの指摘を受けて追加）: (1) 顧客に email が無ければ送らない
  — マイページのログインはメール宛OTPのみで、email 無しの顧客はURLを開いても入れないため
  （開けない導線を案内しない）。(2) 既に同じ LINE ユーザーで連携済みなら送らない（再連携での
  二重送信・二重課金を防ぐ）。(3) 連携コードがグループ/ルームに送られた場合、URL入りの案内は
  同梱しない（リプライは参加者全員に届くため。`linkPrompt.ts` と同じ 1:1 限定方針）。
- 検証: 新規テスト `src/lib/line/__tests__/linkCustomer.test.ts` 7件パス（URL組み立て・末尾スラッシュ重複・
  APP_URL未設定/slug不明のスキップ・プッシュ抑止・送信失敗時も連携は成功扱い）。
  ユニット全体 3734件パス、tsc エラー0、eslint 追加警告0（既存の未使用変数警告1件のみ）。

## 2026-08-15 本番DBマイグレーション失敗を Slack に通知するようにした（branch claude/issuance-failure-ug8bdo）

- 内容: `db-migrate`（本番へのマイグレーション自動適用）が失敗したとき、Slack へ通知するステップを追加した。
  同ジョブは 2026-08-02 から 08-15 までの**13日間ずっと赤**で、その間スキーマ変更が一切本番へ
  届いていなかった。気づいたのは「証明書が発行できない」という本番障害の調査中で、
  赤かったこと自体は誰も見ていなかった（#917）。
- 実装: 記事ドラフト通知（`notify-article-pr.yml`）が既に使っている `SLACK_WEBHOOK_URL` を流用し、
  新しいシークレットも仕組みも増やしていない。`if: failure()` なので成功時は無音（成功通知はノイズ）。
  **配信できなかったら必ずステップを赤くする**設計にした——`set -euo pipefail`（jq 失敗時に空ボディを
  POST して緑で終わるのを防ぐ）、`curl --fail-with-body`（Slack は無効な webhook にも HTTP 4xx を
  返すが、`--fail` 系が無いと curl は exit 0 で未配信に気づけない）。`continue-on-error` は**付けていない**
  ——このステップは `if: failure()` でしか動かず、その時点でジョブの結論は既に failure なので、
  付けても「通知ステップ自身の失敗を隠す」効果しか無い（初版では付けており、レビュー指摘で撤去）。
  シークレット未設定時は warning を出して skip（通知の不在で本来の失敗を隠さない）。
  通知本文には、実際に踏んだ2つの失敗パターン（repo に無いリモートバージョン / out-of-order）と
  それぞれの直し方を載せて、受け取った人がログを読む前に当たりを付けられるようにした。
- 対象: `.github/workflows/db-migrate.yml`。
- 検証: ワークフローYAMLから当該ステップの `run` ブロックを実際に取り出し、`curl`/`jq` をスタブ化して
  4経路を実行確認。(1) 正常系＝有効なJSONを生成し、複数行コミットメッセージから1行目だけを抜く。
  (2) `SLACK_WEBHOOK_URL` 未設定＝curl を呼ばず exit 0。(3) Slack が 4xx＝exit 22 で赤。
  (4) jq 失敗＝exit 1 で赤。(3)(4) は初版では両方 exit 0（緑）で、レビュー指摘により修正した。
  `workflow_dispatch` では `head_commit` が null になるため `github.sha` へフォールバックする
  （マイグレーションを直した後の再実行はまさにこの経路）。
- 限界: この経路は**失敗時にしか実行されない**ため、通常運用では動作確認されない
  （「必要なときに壊れている」という、今回直した問題と同じ構造のリスクが残る）。

## 2026-08-15 証明書の新規発行が全件失敗していたスキーマドリフトを修復し、db-migrate の停止も解消（branch claude/issuance-failure-ug8bdo）

- 内容: 本番DBに `certificates.damage_map_json` が存在せず、証明書の新規発行が
  PostgREST の "Could not find the 'damage_map_json' column of 'certificates' in the schema cache"
  で**全件失敗**していた（発行 insert は傷マップ未使用でも常にこのキーを送るため、
  傷マップを使わない発行も落ちる）。原因は `supabase_migrations.schema_migrations` に
  「適用済み」と記録されているのに DDL が本番に反映されていないマイグレーションドリフト。
  リポジトリの全マイグレーションを機械パースして本番の `information_schema` / `pg_class` と突合し
  （テーブル250・列472・CONCURRENTLY索引180）、欠落していたのは**6ファイル・列3つ・索引3つ**と特定した:
  `20260710000001`（`square_orders.receipt_document_id`）/ `20260710000002`（`idx_square_orders_receipt_document`）/
  `20260711000003`（`idx_vehicles_public_id`, UNIQUE）/ `20260714000002`（`idx_part_installations_one_draft_per_reservation`, UNIQUE）/
  `20260716000000`（`reservations.ai_assignee_suggestion`）/ `20260717000000`（`certificates.damage_map_json`）。
  20260731144359 と同じ方式で、元ファイルは変更せず冪等な再適用マイグレーションを追加した。
  索引2本は当初の列だけの突合では見落としており、自動コードレビューの指摘で気づいて追加した。
  うち `idx_part_installations_one_draft_per_reservation` は性能用ではなく、
  `src/lib/parts/installationService.ts` が「予約あたり下書き1件」の冪等性を一意制約違反(23505)に
  依存して担保しているため、欠落は二重タップ・オフライン再送で下書きが複数できることを意味していた
  （本番に重複は0件で、そのまま作成できることを確認済み）。
- あわせて修復: この修復を本番へ届ける経路である GitHub Actions `db-migrate` 自体が
  2026-08-02 以降ずっと赤で、`supabase db push` が
  "Remote migration versions not found in local migrations directory." で停止していた
  （OPEN_QUESTIONS 2026-08-05 追記で既知）。本番履歴にしか存在しなかった3バージョンを
  リポジトリ側に揃えて解消した——`20260802154302` は既存ファイル
  `20260802000000_fix_search_path_bare_refs_certificates_insurers.sql` の改名で対応し、
  `20260802154541`（同 v2）と `20260804064418`（documents の SELECT ポリシー追加）は
  本番 `schema_migrations.statements` から内容を復元してファイル化した。
  さらに out-of-order で止まる `20260730100000` / `20260730200000`（vehicle_report 系、
  いずれも本番未適用）を、適用済み最新 `20260805085225` より後の
  `20260815100000` / `20260815100001` へ改名（DECISION_LOG 2026-07-21 の webauthn と同じ方式）。
- 検証: 突合クエリで「本番履歴にあってリポジトリに無いバージョン」が0件、未適用4本すべてが
  適用済み最新より後（out-of-order 無し）になったことを確認。`lint-migrations` 通過（257件検査）。
- 対象: `/admin/certificates/new`（証明書の新規発行）。副次的に Square 領収書リンク、
  入庫時の担当メカニック候補提案、および以後のマイグレーション自動適用全般。
- 限界: 突合はテーブル・列・CONCURRENTLY索引までを対象にした。CHECK 制約・RLS ポリシー・
  関数・テーブル定義内に書かれた索引のドリフトは未検証（2026-07-31 のドリフトはこの範囲を含んでいた）。
  この範囲の自動突合は OPEN_QUESTIONS に起票済み。
- 補足: CONCURRENTLY 索引180本のうち欠落は上記3本のみで、いずれも「記録済み・未実行」の
  マイグレーションに属する。つまり CONCURRENTLY 自体は本番で正常に動いており、ドリフトの原因ではない。

## 2026-08-15 車検証OCRの失敗理由を画面に表示（無反応の解消） (branch claude/vehicle-inspection-cert-reading-5347oo)

- 内容: 車検証の読み取りが「押しても何も起きない」状態になり得た経路を修正。(1) `parseShakensho` が
  Vision 呼び出しの例外を握りつぶして空データを返していたのをやめ、例外を投げるように変更（QRが
  読めていれば `parseShakenshoAuto` がQR分だけ返して degrade）。(2) `/api/vehicles/parse-shakken` と
  `/api/admin/vehicle-size/ocr` は OCR 基盤の失敗を 502 +「AI OCR に接続できませんでした」で返す。
  (3) 表示判定を `src/lib/ocr/shakenshoAutofill.ts` に集約し、「AI自動入力が無効（設定/月次コスト上限）」
  「1項目も読めなかった」「自動入力できた項目名」を全画面で同じ文言に統一。LINE の車検証自動登録は
  従来どおりスタッフ引き継ぎに倒す（例外で止めない）。
- 対象: 車両登録（`/admin/vehicles/new`）、車両編集（`/admin/vehicles/[id]/edit`）、
  証明書発行の車両ピッカー（`/admin/certificates/new`）、車両サイズOCR（`VehicleSizeOCR`）

## 2026-08-10 品目選択を「純POSレジ型（常にカテゴリタブ＋グリッド表示）」に変更（予約作成・POS）

- 内容: 前日の「検索/カテゴリで絞るまで隠す」段階表示（#903）を、代表の要望により純POSレジ型へ作り替え。
  一覧を隠すゲート（`shouldRevealMenu` / `resolveMenuCategory` / 番兵 `MENU_ALL` /
  `MENU_REVEAL_THRESHOLD`）を撤去し、カテゴリタブと品目グリッドを**常時表示**するように戻した
  （カテゴリ選択は従来どおり `null`=すべて）。予約作成モーダルは選びにくい**縦積みのピル一覧を
  マス目状のグリッド**（2〜3列）に変更し、POSウォークインと同じ操作感に統一。検索・カテゴリタブ・
  選択済みチップ表示は維持。
- 対象: `/admin/reservations`（予約作成）、`/admin/pos`（ウォークイン会計）
- 注意: カテゴリタブは大カテゴリが2つ以上あるときのみ表示。品目マスタが未分類のみの店舗では
  タブが出ず、グリッド＋検索での運用になる（グリッド化で縦長の羅列は解消済み）。

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
- **【要確認】本番反映**: `main` にコードはマージ済みだが、**本番DB適用は未実施**（2026-08-15 時点で本番に `vehicle_report_tiers` テーブルと `vehicle_report_orders.tier_key`/`scope_*` が存在しないことを確認済み。「未確認」ではなく「未適用」と確定）。原因は `DB migrate (apply to production)` ワークフローが Aug 2 以降失敗し続けていたこと（OPEN_QUESTIONS 2026-08-05 の履歴ドリフト）。2026-08-15 の PR #917 でワークフローの停止を解消し、2ファイルを `20260815100000_vehicle_report_payout.sql` / `20260815100001_vehicle_report_tiers.sql` へ改名して適用対象に載せた。**#917 マージ時に本番へ適用される**ので、適用後に本番稼働として扱う。
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
  (1) スキーマ（`20260815100001_vehicle_report_tiers.sql`、旧 `20260730200000` から改名）: `vehicle_report_tiers`（tier_key/label/price_jpy/scope_type/scope_months/enabled/sort、直近1年¥1,500＋全履歴¥3,000 を seed）。`vehicle_report_orders` に `tier_key`/`scope_type`/`scope_months`/**`scope_from`（購入時アンカーの絶対カットオフ）**を追加。
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
  (1) スキーマ（`20260815100000_vehicle_report_payout.sql`、旧 `20260730100000` から改名）: `stripe_connect_transfers.source_type` に `vehicle_report`、`vehicle_report_orders.status` に `refunded` を追加（DROP/ADD CHECK, NOT VALID+VALIDATE）。
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

## 2026-08-22 モバイル: ウォークイン会計の品目選択を POS レジ型に刷新／タブバーを丸ボタン化

- 内容（会計）: ウォークイン会計の品目選択が可変幅ピルの折り返し配置で、全品目を縦スクロールへ
  直に流し込んでいたため、品数が増えるほど見た目も操作も破綻していた。POS レジのレイアウトに作り替え。
  - 等幅タイルのグリッド（ウィンドウ幅で 2/3/4 列）。端数行は null パディングして最後の1枚が横に伸びない
  - FlatList 化で画面分のみ描画。品目が増えても描画コストが増えない
  - 検索バーとカテゴリタブをグリッドから分離して常時固定（従来は一緒にスクロールで流れて消えた）
  - 「よく使う」カテゴリ（`menu_items.sort_order` 上位12件）を追加し、12件超のテナントでは既定表示
  - 検索中はカテゴリを跨いで検索。カート投入済みタイルは枠と数量バッジで区別
  - 品目選択 → 明細・支払いの2ステップ化。下部に「◯点 / ¥合計」バーを常設
- 内容（タブバー）: 「押しにくい・隣との境界が見えない」への対応。
  - 各タブを直径48px（最小タップ領域44pt以上）の丸ボタン化。**非選択時も背景と枠線を出して境界を可視化**
  - `sizing.tabBarHeight` を 84 → 80（中身のみ）に変更し、実高さは `insets.bottom` を足して算出
  - クイック作成の + を右下からタブバー中央の真上へ移設（白縁取り+影、8px 離して重ならない）
  - `sizing.fabClearance` を追加し、中央 + に最後の行が隠れないようタブ配下5画面の下余白に適用
- `/code-review` で検出した自作バグの同時修正:
  - カスタム品目（自由入力）が会計ステップにしか無いのに、遷移ボタンをカート空で無効化していた
    → メニュー未登録の店舗・都度見積りの会計が成立しなくなる。ボタンを常時有効化
  - `useDeviceType` をウィンドウ幅判定にしたため iPad Split View で `isIPad` が取引中に反転し、
    決済手段の構成が入れ替わる（`"qr"` のまま iPad 構成になると QR を出さずに記帳）
    → 端末固有の事実である `Platform.isPad` で判定するよう修正
  - 会計ステップでの端末バック／ヘッダー戻るが画面ごと閉じてカートを黙って捨てる
    → `BackHandler` と `headerLeft` で品目選択へ戻すよう結線
  - タブバーに数値 height を渡すと react-navigation はセーフエリアを足さないため、固定 paddingBottom では
    Android のジェスチャーバー配下にラベルが潜る → `insets.bottom` を自前で加算
  - QR 提示中もカートを編集できたため Stripe の請求額と `pos_checkout` の記帳額がずれ得た
    → `qrPolling` 中は数量操作・カスタム品目追加・品目選択への復帰を止める
  - 数量バッジが角丸タイルの外にはみ出しており Android でクリップされる → タイル内のフローに移動
  - 合成カテゴリ名（「すべて」「よく使う」）と同名の実カテゴリで key 重複と誤表示 → 実カテゴリ側を弾く
  - おつりの色が `Math.max` で丸めた後の値を見ていて、預かり不足でも緑 → `received >= total` で判定
- 対象: `apps/mobile/src/app/pos/walk-in.tsx`、`apps/mobile/src/app/(tabs)/_layout.tsx`、
  `apps/mobile/src/constants/tokens.ts`、`(tabs)/{index,more/index,work/index,vehicles/index,certificates/index}.tsx`、
  `apps/mobile/src/lib/menuFilter.ts`（新規・純ロジック）、`menuFilter.check.ts`（新規・自己チェック、`npm test` に追加）。
- 注記: 「よく使う」は店舗が手で並べた `sort_order` の上位であり**実売上頻度ではない【要確認】**。
  頻度順にするなら `payment_items` の集計クエリが要る。
  タブは v2.0 §2 の正準5構成のままなので、+ を列の中に入れると必ず中心からずれる（6スロットでは
  41.7% か 58.3%）。列の上に浮かせるのが中央に置ける唯一の形として採用した。

## 2026-08-22 モバイル: ルート衝突の解消（戻るボタン欠落・二重ヘッダーの根因）

- 内容: 代表から「戻るボタンが追加されていない、もう3回目」との指摘。原因は**同一 URL を指す
  ルートファイルの重複**で、戻るボタンを入れた側が影に隠れて表示されていなかった。
  - `app/(tabs)/reservations/index.tsx` と `app/reservations/index.tsx` が両方 `/reservations` を指し、
    タブ側が URL を握っていた。タブ側は Tabs ナビゲーターの内側で描画されるため戻るボタンを出せず、
    さらに `href: null` の `Tabs.Screen` に `headerShown: false` が無かったため、
    Tabs のヘッダー（タイトル未設定＝ルート名 "reservations"）と入れ子 Stack のヘッダー「予約」で
    **二重ヘッダー**になっていた。同じ重複が `/certificates` `/vehicles` にも存在
  - 対処: 予約・会計は v2.0 §2 の正準5タブに含まれないため、タブから外してトップレベル Stack へ集約。
    `(tabs)/reservations/` と `(tabs)/pos/` を削除（`pos/index.tsx` はトップレベルへ移動）、
    到達不能だった `certificates/index.tsx` `vehicles/index.tsx` を削除
- 再発防止: 戻るボタンを8つの `_layout.tsx` に手書きしていたのが取りこぼしの温床だったため、
  `components/screenOptions.tsx` に `stackScreenOptions` として集約。各 Stack はこれを渡すだけ。
- ヘッダーを持たない単体画面の修正: `notifications` `dashboard` はルート Stack が
  `headerShown: false` で、Stack も持たないため**戻る導線が一切無かった**。個別にヘッダーを付与。
- クイック作成（+）の死んだ導線を修正: 「予約作成」`/(tabs)/reservations/new`、
  「作業開始」`/(tabs)/work/new` はいずれも**存在しないファイル**を指しており無反応だった。
  `/reservations/new` と `/reservations/new?type=walk_in` に修正し、
  `reservations/new.tsx` が `type` クエリで飛び込みを初期選択できるようにした。
- 「その他」の死んだリンク6本を撤去: `/sync` `/help` `/feedback` `/about` `/settings/staff`
  `/settings/general` は画面が存在せず無反応だった。`/contact` `/terms` `/privacy` は Web
  （`app.ledra.co.jp`）に実在するため `Linking.openURL` で外部リンク化し、アイコンで区別。
  代わりに実在する「NFCタグ台帳」「Tap to Pay」を追加。
- タブバーの + は中央配置をやめ、右下の独立した FAB に戻した（代表の指示）。
  タブ5枚では列内で中央に置けず、列の上に浮かせるとリスト行の中央に恒常的に重なるため。
- 検証: 全ナビゲーション先（`route:` と `router.push/replace`）がファイルとして実在するかを
  機械的に照合し、アプリ内リンクの欠落ゼロを確認。
- 対象: `apps/mobile/src/components/screenOptions.tsx`（新規）、8つの `_layout.tsx`、
  `app/_layout.tsx`、`(tabs)/_layout.tsx`、`(tabs)/index.tsx`、`(tabs)/more/index.tsx`、
  `components/ui/QuickCreateSheet.tsx`、`reservations/new.tsx`、`notifications.tsx`。
  削除: `(tabs)/reservations/`、`(tabs)/pos/`（`pos/index.tsx` へ移動）、
  `certificates/index.tsx`、`vehicles/index.tsx`。
- 注記: 撤去した6項目（Sync Center / ヘルプ / フィードバック / Ledraについて / スタッフ権限 /
  各種設定）は**画面を実装したらメニューに戻す**。認証フロー7画面は前進のみの線形フローのため
  戻るボタンは付けていない。

## 2026-08-22 モバイル: 日付の UTC/ローカル不一致を解消、ルーティング再編の取りこぼしを修正

- ルーティング再編（同日の別エントリ）に `/code-review` をかけて検出した分の修正。
- **日付が朝9時前にずれる（4箇所）**: `toISOString().split("T")[0]` は UTC 日付を返すのに、
  時刻や画面表示はローカルだった。JST 09:00 前は日付だけ前日になる。
  - `reservations/new.tsx`: 飛び込み受付・予約作成が**前日の日付で登録される**（開店前受付が直撃）
  - `reservations/index.tsx`: 見出しは今日なのにクエリは前日を引く（前回まで影に隠れていた画面）
  - `(tabs)/index.tsx`: 同ファイルで `dayjs` を使っているのにここだけ UTC。今日の集計が前日になる
  - 対処: 既存依存の `dayjs().format("YYYY-MM-DD")` に統一
- **レジ管理を到達不能にしていた**: 「その他」の POS 導線を `/pos/register` から `/pos` に
  変えた結果、レジの開設・締め画面へ行く手段が消えていた。専用行を復帰。
  前回の検証が「リンク→ファイル」の一方向しか見ていなかったため検出できていなかった。
- **孤立していた画面2つに導線追加**: `/nfc/scan`（NFCスキャン）と `/dashboard`
  （店舗ダッシュボード）はどこからも開けなかった。「その他」に追加。
- **ディープリンク直起動で戻るボタンが無反応**: `ledra://` スキームで直接起動すると履歴が空で
  `router.back()` が何も起こさない。`canGoBack()` で分岐しホームへ戻すよう修正。
- **Web リンクの env 取り違え**: `EXPO_PUBLIC_API_URL`（API ベース）を使っていた。
  `settings/index.tsx` に既にある `EXPO_PUBLIC_WEB_URL` + フォールバック + `canOpenURL` の
  パターンへ寄せ、失敗時は Snackbar で理由を出す（無反応で消えない）。
- **タブ根4つのヘッダー体裁が不揃い**: 作業・その他が素の `Stack` で既定ヘッダーのままだった。
  `tabStackScreenOptions` を追加して車両・証明と統一。
- 「その他」の店舗カードは chevron を出しながら何も起きなかったため、店舗切替へ結線。
- `@react-navigation/native-stack` の直 import をやめ、`Stack` の props から型を借用
  （expo-router の推移的依存にしか無く、インストール方式によっては解決に失敗する）。
- 検証: ナビゲーションを**双方向**で照合（リンク→ファイル / 画面→到達導線）。欠落・孤立ともゼロ。

## 2026-08-27 帳票PDF: 発注書・発注請書・検収書のタイトルから「御」を撤去

- 対象: `src/lib/pdfDocument.tsx`（全帳票 PDF 生成）、admin の帳票テンプレート編集画面
  （`TemplatesClient.tsx` / `LayoutPreview.tsx`）。
- 変更: purchase_order（発注書）/ order_confirmation（発注請書）/ inspection（検収書）の
  3種別は、本文の挨拶文が自社主語（「発注いたします」「検収いたしました」）のため、
  テナントの「御」プレフィックス設定に関わらずタイトルへ常に付けないようにした
  （`src/types/document.ts` の `hasNoHonorificPrefix()` を唯一の出所として参照）。
- 編集画面: 該当3種を選択しているときは「御」プレフィックスのトグルを disabled にし、
  「発注書・発注請書・検収書は自社が発行する書類のため、「御」は常に付きません。」と
  ヒント文を表示。設定しても反映されない状態を防ぐ。
- 経緯: PR #985（帳票の基本テンプレートを PDF プレビューするスクリプト追加）で全9種別を
  実際に出力して目視確認した際に発覚。判断は DECISION_LOG.md 2026-08-27 を参照。
- 影響なし: 見積書・納品書・領収書・請求書・合算請求書・外注請求書の6種は変更なし
  （引き続きテナントの `layout.title.prefix` 設定に従う）。
