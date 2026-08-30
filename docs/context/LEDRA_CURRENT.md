# LEDRA_CURRENT.md — 現在の事業・プロダクト状況

> このファイルは「今の Ledra がどういう状態か」のスナップショット。更新履歴は
> 追わず、常に最新状態だけを保つ（履歴は DECISION_LOG.md / RELEASE_LOG.md 側）。
> 大きな変化があったら都度上書きすること。

最終更新: 2026-08-29

> 2026-08-29 追記: **IMP-023 の db-migrate.yml が最終的に green になり、`certificate_images_guard`
> トリガーが本番へ実適用されていることを直接確認した**（PR #938→#994→#996→#998 の4段階、
> 詳細は各エントリ参照）。本番の `pg_trigger`/`pg_proc` を直接 SELECT し、
> `trg_certificate_images_guard`（BEFORE DELETE OR UPDATE ON certificate_images）と
> 関数本体が、修正済みの内容（`draft` のみ制限なし・保護対象27列・`search_path=''`）と
> 完全一致することを確認済み。途中、本番にのみ存在した未追跡マイグレーション
> （user_interface_preferences）と、レビュー待ちの間に自分自身が out-of-order になる
> 問題が連続発生し、都度 DECISION_LOG 2026-07-21 の確立済み手順で復旧した。

> 2026-08-29 追記: **#938（IMP-023、証跡凍結ガード）を main へ統合。代表確認
> （「マイグレーション適用してマージ」）の上で本番マイグレーションを含めて取り込んだ。
> 取り込み時の `/code-review` で本番 DB トリガーの設計不備を検出——`certificate_images_guard`
> が `expired`（保証期間満了で自動遷移）を「制限なし」扱いにしており、まさに紛争が
> 起きやすい満了後に写真の削除・改ざんが自由になる状態だった。** `= 'draft'` のみを
> 制限なしとする条件に修正（active/void/expired をすべて保護）。あわせて
> `certificate_id` の付け替えで証跡を切り離せる穴を塞ぎ、DELETE API のストレージ削除順序
> （ガード付き DB 削除より先に実ファイルを消していた）と polygon-backfill の書き込み
> エラー握りつぶしを修正。`src/lib/certificateImages/evidenceProgress.ts` の同一 stage
> 二重カウントバグも修正（UI 未接続のため実害なし）。詳細は DECISION_LOG「IMP-023
> 凍結ガードの draft/expired 同列扱いは誤りだったため expired も保護対象に修正」参照。

> 2026-08-29 追記: **#937（IMP-022、Work List & Job Hub）を main へ統合。取り込み時の
> `/code-review` で `src/lib/sync/` と `WorkScopeProvider.tsx` の復活を検出——
> #935・#936 に続く3回目の発生。** 今回判明したのは、#936 時点で「検証済み」として
> いた検出方法（main の履歴を辿って削除有無を確認）自体が、main の squash マージ運用と
> 根本的に相性が悪いという構造的欠陥だった——1本のスタック PR 内で完結した
> 「追加してから削除」は squash 後の main の履歴に一切残らないため、main の履歴を
> 情報源にする限り原理的に検出できない。**検出方法を「マージ対象 PR 自身のコミットが
> そのファイルを触っているか」に置き換え、`scripts/check-resurrected-files.sh`
> （`npm run check:resurrected`）としてスクリプト化した**（ミューテーションプローブで
> 検出・非検出の両方を確認済み）。以降のスタック PR マージすべてでこのスクリプトを
> 実行する。詳細は DECISION_LOG「削除済みファイルの復活検出を3度目の失敗を経て
> スクリプト化した」参照。

> 2026-08-29 追記: **#936（IMP-021、3秒理解ホーム）を main へ統合。取り込み時の
> `/code-review` で重大な問題2件を修正した。**
> (1) `src/lib/sync/`（#934 で削除済み）が **#935 と同じ理由で2回目の復活**を
> していた ——「main で削除済みのファイルが、削除より前に分岐した古いブランチとの
> マージで衝突なしに復活する」構造的な穴。今回は機械的な検出手順を実際に作って
> 検証し（`comm` で作業ツリー限定のファイルを洗い出し→各ファイルの main 削除履歴を
> 確認）、以降のスタック PR マージすべてで実行する運用にした。
> (2) ダッシュボードの初期表示スコープが `defaultScope(caller.role)` に配線されており、
> **staff/viewer は無指定時に今まで見えていた店舗全体のタスクが「自分の分だけ」に
> 縮み、viewer はトグルが出ないため戻す手段も無い**ところだった。**"store"（店舗全体）
> 固定に変更し、代表確認済み（店舗全体表示を恒久維持）。**
> ほか、テストのタイムゾーン依存バグ・DB クエリの二重発行・死んだコード2件も修正。
> `todayTasks.ts` の日付計算が正のUTCオフセットで1日ずれる既存バグを発見したが
> 今回のスコープ外（OPEN_QUESTIONS 参照）。詳細は DECISION_LOG / RELEASE_LOG 2026-08-29。

> 2026-08-28 追記: **#935（IMP-020）のモバイル画面6ファイルは main の実装を採用した。**
> main を取り込んで衝突を解決する過程で、モバイルアプリの5タブ画面（タブバー本体・
> 車両/証明書一覧・その他メニュー）が main とドラフト後に別々に実装されていたと判明。
> **main 側はいずれも本番相当（実データ取得・検索・独自タブバー・Quick Create FAB）**
> で、#935 側は着手時点のプレースホルダーのままだったため、**main 側をそのまま採用**し、
> #935 からは `src/lib/navigation/`（正準タブ・Quick Create・スコープ型定義）・
> CommandPalette 強化・Web サイドバーの `WEB_TABS` 参照化だけを残した。モバイル
> 下部ナビは v2.0 正準5タブ（ホーム/作業/車両/証明/その他）と**既に一致**している。
> 詳細は DECISION_LOG「#935（IMP-020）のモバイル画面は main の実装を採用し、
> ナビゲーション基盤だけ残す」参照。
> `/code-review` で5件の指摘。**うち1件は重大**: main 側が既に削除していた
> `src/lib/sync/`（型・競合検出、代表判断で削除済みのはず）が、#935 のブランチが
> 削除前の commit から分岐していたため**衝突として検出されずに復活していた**。
> 再度削除し、`QUICK_CREATE_ACTIONS` の予約/顧客 href（存在しない `/new` ページを
> 指していた）を `?create=1` に修正、`inferCreateContext` の正規表現が `/new` を
> ID として誤って拾うバグを修正、`MobileTabBar.tsx` の恒真になっていた権限フィルタ
> を削除。詳細は RELEASE_LOG 参照。

> 2026-08-27 追記1: **積み上がっていた実装 PR を main へ通し始めた。**
> #928〜#951 の22本が「前の PR をベース」に積み上がっており、**その間 CI が
> 一度も走っていなかった**（`ci.yml` は `branches: [main, staging]` でしか起動せず、
> ベース付け替えも ready 化も既定のトリガーに入っていない）。1本ずつ
> 「ベースを main へ**手動**付け替え → main を取り込み → 衝突解決 → ローカル検証 →
> push（ここで初めて CI が走る）→ 緑 → squash」で通す運用にした。
> **GitHub がベースを自動付け替えするのはベースブランチが削除されたときだけ**で、
> squash マージでは起きない（私が「自動でやってくれる」と伝えたのは誤りだった）。
> **#980・#928〜#934 をマージ済み（8本）。**
> #933 は代表の「正しく無いのが載るのはあかんな」を受けて、**正準遷移表の足りない辺を
> 8件直してから**通した（根拠は ADR・稼働中コード・同ファイル内の矛盾に限定。
> 根拠の無い3件はモジュール先頭に未解決として明記）。
> #934 は **`/code-review` と Codex が独立に同じ結論**に着いたので修正を止め ——
> `src/lib/sync/` は実際の outbox が持っていない情報を前提にしていた。代表判断は
> **(b) `src/lib/sync/`（型・競合検出）を削除し、`sync.*` のイベント名と
> `EVENT_RISK` の格付けだけ残す**。同期層の設計は IMP-032 で outbox の実際の
> 契約から作り直す（詳細は DECISION_LOG 2026-08-27）。
> #930〜#932 が足したモジュールは**稼働中コードからの import が 0 件**なので、
> マージしても実行時の挙動は変わらない。
> **Codex は 01:06 に利用上限へ達した**ため、以降は `/code-review` で代替している。
> #933 では15件のうち4件が実在し修正、残り11件は遷移表の設計論点として保留。

> 2026-08-27 追記2: **#935（IMP-020）着手前に、遷移表の未解決4件を代表判断で解決した。**
> REVOKED は ISSUING/VERIFYING からも遷移可、支払い UNKNOWN の解決先に
> PARTIALLY_PAID/OVERPAID を追加、工程 IN_PROGRESS/BLOCKED から SKIPPED を許可、
> Severity CRITICAL→ACTION は現状の表を維持（許可のまま）。詳細は DECISION_LOG
> 「遷移表の未解決4件を代表判断で解決」参照。あわせて `.husky/pre-push` の
> エラー握りつぶし（ブランチ名不一致時に vitest が飛ばされる件）は代表判断で
> 現状維持（修正しない）。

> 2026-08-26 追記6: **SQL と TS の二重実装を機械的に突き合わせるようにした。**
> 二重実装は2組だけ（VIN 正規化とサイズ区分）。`check_reservation_overlap` は
> TS が RPC を呼ぶだけで実装が1つ ——**これが本来の形**。
> **実害のあるズレが1件**: サイズ区分を TS が生の体積で、DB が `ROUND(_,2)` した
> 体積で分類していた（4400×1765×1545mm で TS="M" / DB="L"、**価格帯が変わる**）。
> TS 側を丸めるよう修正。検証は `supabase/__tests__/sqlTsParity.test.ts`（DB 不要）。
> **初版は検出できておらず**、code-review のプローブ3件で再現 → 修正済み。

> 2026-08-26 追記5: **本番へのマイグレーション適用がまた止まっていた。**
> #967 が持ち込んだ VIN トリガーが out-of-order になり、#976 が改名して直そうと
> したが、**そのマイグレーションは既に本番へ適用済み**だった（トリガーも
> バックフィルも本番で確認）。適用済みを改名したので不変条件を壊し、次の run も
> 失敗した。ファイル名を `20260825000000` へ戻して解除。
> **「適用済みを改名した」の2度目**（1度目は `audit_logs_reconcile`、#972 で改名 → #973 で復元）。
> 改名の可否は本番の台帳をバージョン名で名指しして引いて判断する。
> `db-migrate.yml` の手順書と Slack 通知にもこの条件を書いた —— **事故を生んだのは
> その文面の「out-of-order → 後ろの日付へ改名する」という無条件の助言だった。**
> なお `20260825000000` がいつ適用されたかは特定できていない【要確認】。
> 2026-08-26 追記4: **Vercel の Git 連携が 02:28 に復活した。** PR #975 で Preview が
> Building → Ready、02:47 の2回目も Ready。02:08 の #974 マージ時点では反応が無かった。
> **ただし `eb99600`（#974）はその前なので、本番はまだ `d2e4736` の可能性が高い**（推定）。
> 次に main へ push されたときに本番が追いつくはず。追いつかなければ Vercel の
> ダッシュボードから手動 Redeploy が要る【要確認】。
> `vercel-deploy.yml` は二重デプロイを避けるため**手動実行のみ**にした（非常用レバー）。
> 2026-08-26 追記3: **Web の本番デプロイが 8/17 で止まっていた。** 本番は
> `d2e4736`（8/17、PR #920）を配信中で、main はそこから9コミット先行している。
> 配信中のコミットの根拠は Vercel のデプロイ一覧（代表提供のスクリーンショット）だけで、
> この環境から本番を叩いた確認はできていない（プロキシが CONNECT 403）【要確認】。
> Vercel の Preview も 8/19 02:0x が最後で、以降 main の9コミットに対して 0件。**失敗ではなく無音**（Canceled も Error も1行も残っていない）。
> 実機テストの指摘⑦⑧（カード番号入力・QR が出ない）はモバイルの不具合ではなく
> これが原因 —— 本番の `posQrSessionSchema` は `tenant_id` を必須のままで、
> 新アプリは送らない。本番に無い mobile API も6本ある（証明書作成そのものを含む）。
> **モバイルを再ビルドしても、Web をデプロイするまで直らない。**
> 対応として `vercel-deploy.yml` を新設（シークレット未設定なら緑のままスキップ）、
> `db-typegen.yml` を `SUPABASE_DB_URL` 1本に寄せた（4回連続失敗の原因は
> シークレットが空だったこと）。
> **停止の原因は未特定**（連携外れ／プラン上限／自動デプロイ無効の3択）。
> 代表が Vercel の Settings → Git と Usage / Billing を見るまで確定しない【要確認】。
> 2026-08-24 追記4: **タッチ決済が読めなかった時に、カード番号を入力して決済できる
> ようにした。** 実体は既存の Stripe Checkout（QR決済と同じ経路）で、失敗直後に
> 導線を出すのと「この端末で開く」を足しただけ。Ledra 側でカード番号は扱わない。
> 併せて、**予約の会計画面の QR 決済が Ledra に記録されていなかった**のを直した
> （カードは切られているのに payments に残らず、レシートも出ない状態だった）。
> 重複防止（PaymentIntent の一意制約）はこの経路にはまだ無い。
> 2026-08-26 追記2: **実機テストの指摘8件に対応**（PR #974）。うち5件は
> 「ボタンはあるが `onPress` が空」だった。施工写真が撮れなかったのは
> 証明書が案件に紐づかないためで、根因はサーバの判定が「予約側が空」を
> 矛盾として弾いていたこと（`store_id` に続いて2度目の「誰も書かない列で
> 絞る」形）。カード番号決済と QR は**コードではなく Web デプロイ未反映**の症状。
> **未解決**: お客様確認の依頼を送る導線がモバイルに無い（本番169件すべて
> `not_requested`）。
> 2026-08-26 追記: **本番へのマイグレーション適用が復旧した**（4回目で成功）。
> `schema_migrations` は 429 件、最新は `20260826000006`。決済の重複防止
> インデックスと search_path 固定が本番で効いていることを実データで確認済み。
> #926 / #971 / #972 / #973 はすべてマージ済み。
> **次はモバイルの新ビルド** ―― Web デプロイの反映を確認してから配布する。
> 2026-08-25 追記4: **#926 をマージした**（`528ffd5`）。ただしマージで起動した
> `db-migrate` が失敗し、**本番へのマイグレーション適用は止まったまま**
> （本番 DB は無傷。未適用8本は1本も走っていない）。原因は MCP で直接適用した
> 3バージョンにリポジトリのファイルが無かったこと。#971 で解除待ち。
> **#971 がマージされ本番適用が緑になるまで、モバイルの新ビルドは配らない。**
> 2026-08-25 追記3: **モバイルの新ビルドは #926 のマージ・Web デプロイ後**。
> 本番は `main` を配信しており、`/api/mobile/academy/lessons`（ナレッジ）と
> `/api/mobile/documents`（帳票）は main に無い。カード番号決済も
> `checkout_session_id` を main が知らない。先に配ると3箇所が壊れる。
> なお **OTA（EAS Update）は動いていない**（`expo-updates` 未導入・channel 未設定）。
> 今回は `app.json` の plugins と Permissions 文言が変わっているので、
> どのみち本ビルドが要る。
> 2026-08-25 追記2: **Web から作った行にも `store_id` が入るようになった。**
> 選択 UI は作らず、`src/lib/stores/resolveStoreId.ts` でサーバが決める
> （有効な店舗がちょうど1つならそれを入れる／2つ以上なら入れない／指定された
> 店舗 ID はテナントのものか確かめる）。証明書・予約4経路・POS の売上記録・
> 顧客登録の招待とリンク・レジ登録の9箇所が通る。あわせて、送られた `store_id` を
> 検証せず書いていた経路（モバイル予約・顧客登録）を塞いだ。
> **既存の null 行 231 件の穴埋めは未実施**（本番データの書き換えは代表判断）。
> 代表判断: **Stripe Terminal のリーダーは現状導入しない**（カード番号の会計は
> Checkout で回す）。**モバイルは新ビルドを配布する。**
> 2026-08-25 追記: **カード決済の重複防止を全経路に効かせた。** 売上の記録を
> `src/lib/pos/recordSale.ts` の1関数に集約し、タッチ決済・カード番号入力・
> Web の QR 決済がすべてそこを通る。同じ PaymentIntent なら1件しか作らない。
> 代表回答: Terminal リーダーは別端末なら手入力可能／カード番号は**お客様が入力**
> する形なら規則上問題なし。リーダーの導入可否と、日本での手入力有効化の可否
> （Stripe への直接確認が必要）は未定。
> 2026-08-24 追記3: **モバイルで店舗を選ぶと一覧が空になる**不具合を直した。
> 本番の `store_id` は certificates・reservations・payments の全行が null で
> （書いているのはモバイルの作成画面だけ、Web の作成経路は入れていない）、
> `.eq("store_id", …)` で絞っていた9画面が常に0件だった。`scopeToStore()` に
> 集約し「店舗一致または店舗未設定」に変更。**Web の作成経路で `store_id` を
> 入れるかどうかは未決**（入れたら `.eq()` に戻してよい）。併せて、モバイルの
> 作業タブが select 内のコメントで 400 を返し続けていたのと、証明書 API の検索が
> 存在しない列で 400 になっていたのを修正した。
> 2026-08-24 追記2: マイグレーションの**空 DB からの再生を CI で見るようにした**
> （`npm run check:migrations` / Migrations Replay ジョブ）。失敗 171 本 → 9 本。
> 残る 9 本は履歴を書き換えない限り直せないもので、ファイル名で固定し増えたら CI が
> 落ちる。未認証から呼べる SECURITY DEFINER 関数は 22 本（RLS ヘルパー 19＋公開証明書 1
> ＋保険会社の自己登録 2）だけになった。証明書の作成は Web／モバイルとも同じ
> `createCertificate()` を通る。OPEN_QUESTIONS は 65 → 50 件に棚卸し済み
> （手を動かせば片付くのは 7 件で、残りは判断・実測・権限待ち）。
> 2026-08-24 追記: 未認証（anon）から呼べていた SECURITY DEFINER 関数 16 本の
> EXECUTE を本番で剥奪済み（記録バージョン `20260823235804`）。うち
> `pos_checkout` / `upsert_agent_user` など呼び出し元の検査が無い4本は
> **service_role 専用**。これに伴いモバイルの POS 会計は
> `/api/mobile/pos/checkout` 経由になったため、**配布済みの旧ビルドでは会計が
> 失敗する**（新ビルドの配布が要る）。残り 37 関数と search_path 固定
> （`20260823170001`）は未適用。詳細は DECISION_LOG / RELEASE_LOG 2026-08-24。


最終更新: 2026-08-19

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
（siteTagline / siteDescription / keywords / featureList / twitterHandle）を単一情報源として参照する。
AIクローラー向けには `llms.txt`（簡潔版）と `llms-full.txt`（料金・機能・全リンク含む詳細版）を
Route Handlerで動的提供（siteConfig + PLANSから自動追従）。Xハンドルは `@detailing_holy`。
詳細は DECISION_LOG.md / RELEASE_LOG.md 2026-07-27, 2026-08-22 を参照。

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

## 走行距離の記録（2026-08-25 必須化 / 2026-08-26 発行時ゲートへ移動）

証明書に**走行距離が無ければ発行できない**（施工種別を問わず、全テナント一律・サーバ強制）。
値は `certificates.maintenance_json.mileage` に入り、DBトリガー `trg_sync_mileage_from_certificate` が
`vehicle_mileage_logs` に走行距離タイムラインとして落とす。判定ルールは `src/lib/maintenance/mileage.ts`
（`parseMileageKm()` / `certificateMileageKm()`）に集約している。

強制する場所は**発行のチョークポイント3本だけ**:
`PUT /api/admin/certificates/status`・`POST /api/certificates/activate-by-key`・
`POST /api/mobile/certificates/[id]/activate`。
写真必須ルール（`certificateHasRequiredPhotos`）と同じ位置・同じ形。
作成経路（Web / モバイル / 外部API `POST /api/certificates/create` / AI自動起票 / オフライン再送）は
どれも `draft` で作るため、経路が増えてもここを通らずに `active` になることはない。
AI自動起票（`certificateRecordAuto.ts`）だけは insert で直接 `active` を作れるので、
そこにも同じ条件を課してある（走行距離が無ければ `draft` に落ち、承認インボックスへ）。

入力は手入力が既定で、メーター写真からの OCR 取り込み（`OdometerOcrButton` →
`/api/admin/inspection-records/ocr` の `target=odometer`）が補助として付く。
OCR は鮮明度（`confidence` / ブレ・反射・欠けの `warnings`）を出し、読めなければ何も入力しない。
**最終確認は人間** —— OCR は下書きを埋めるだけで、発行操作をするのは人。

編集API（`PUT /api/certificates/edit`）では走行距離を**入れられるが消せない**。
証明書詳細の編集フォームに走行距離欄（メーターOCR付き）があり、発行前の下書きと
必須化より前に作られた証明書の遡及入力を兼ねる。

このタイムラインは整備リマインダー（`src/lib/cron/serviceReminders.ts`）・劣化予測・車両パスポートの
走行距離履歴が共通で参照する。2026-08-25 以前は任意入力だったため本番の記録は0件で、
これらの機能は実質的に入力ゼロの上で動いていた。既存45件は遡及せず、タイムラインは
実質「次回入庫から」始まる。詳細は DECISION_LOG / RELEASE_LOG 2026-08-25 と 2026-08-26。

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

## 検討中の新規事業: 信用回復ローン（2026-08-23 時点）

Ledra と自動車ローンを組み合わせた「信用回復ローン」をパートナーと立ち上げる方針。**まだ検討段階でパートナー未定。**

- **Ledra は貸さない・保証しない。**組成主体は指定信用情報機関（CIC / JICC）の加盟会員である信販会社または貸金業者に限定する。
  市場に既にある「自社ローン」は支払い実績が信用情報機関に登録されないため、完済しても信用は回復しない。
  「信用回復」を事実にできるのは加盟会員が組成したときだけで、ここが提携相手の第1選定基準になる。
- Ledra の役割は3点: 担保（車）の状態証明＝改ざん検知付き施工履歴、契約後の担保モニタリング、全国の実行ネットワーク。
  この形なら Ledra 側に新たな業登録は要らない（見込み。弁護士確認中）。
- Phase 0 は**新規コード0行**。既存の `/v/[vin]` 有料車両履歴レポートをそのまま与信レポートとして提携先に見せる。
- **ボトルネックはデータ量。**本番の VIN 付き車両は実測1台（登録24台）で、Phase 1 以降は現時点では成立しない。
  パートナー交渉より「VIN 入力率を上げる」が最優先。
- 詳細は `docs/credit-recovery-loan-partnership-2026-08.md`、判断の経緯は DECISION_LOG / OPEN_QUESTIONS 2026-08-23。

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
- **IMP-025（§9 車両パスポート基盤 — PII遮断体系検証・車両顧客関係型モデル）完了**:
  パスポート公開サーフェスの PII 遮断をコンパイル時型アサーション（4型分）+テスト18件で体系的に検証。
  ADR-0006 に基づく車両顧客関係型モデル(`customerRelation.ts`)を新設 — 型のみ、DB変更なし。
  車両パスポートの既存インフラ（10マイグレーション、公開ページ、所有権移転、API、メタアンカー、
  ペイウォール、収益分配）は変更不要 — 既に稼働中。DB マイグレーション（関係テーブル化）は IMP-050 に委譲。
- **IMP-024（§7 音声→AI構造化→人間確認 — オフライン検知・多言語音声・備考接続）完了**:
  VoiceMemoPanel に3つの統合ギャップをクローズ。(1) オフライン検知 — AI 呼び出し前に
  `navigator.onLine` チェック、明示的エラー表示。(2) `speechLang` prop + `LOCALE_SPEECH_LANG`
  マッピング — Web Speech API の言語をハードコード ja-JP から呼び出し側指定に。
  (3) 証明書備考欄に VoiceMemoPanel(note variant)接続。モバイル音声は未実装(設計選択未解決)。
  main 取り込み時の `/code-review` で、squash 履歴の断絶により `src/lib/sync/` と
  `WorkScopeProvider.tsx`（過去に4度目の復活・いずれも代表判断/コードレビューで削除済み）
  の再削除、および1画面に2つになった VoiceMemoPanel の同時録音競合をモジュールスコープの
  排他ロックで修正。
- **IMP-023（§7 JOB_EVIDENCE — 証跡凍結ガード・必須ショット進捗）完了**:
  (1) `certificate_images_guard` DB トリガーで発行済み/取消済み/**期限切れ**証明書の
  写真行 DELETE を DB レベルでブロック（draft のみ制限なし）。証跡列 11 列
  （+`certificate_id`）の破壊的 UPDATE も拒否（sort_order 等の表示列は許可）。
  DELETE API route にトリガーエラーの 409 ハンドリング追加（ストレージ削除は
  ガード付き DB 削除の後に実行）。設計原則 10 充足。
  (2) `evidenceProgress.ts` — 必須ショット宣言とアップロード済み stage の突合せ進捗計算
  （純関数、同一 stage の複数必須ショットが写真を二重カウントしないよう消費型で算出）。
  テスト 9 件。main 取り込み時の `/code-review` で expired ループホール等4件を修正
  （DECISION_LOG 2026-08-29 参照）。
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
- **IMP-016（オフライン同期キュー・競合検出基盤）部分**: `src/lib/sync/`
  （同期キュー型・競合検出ヘルパー）は**削除**した。`/code-review` と Codex が
  独立に同じ結論に着いた —— 実際の outbox（`src/lib/outbox/`）が持っていない情報
  （メソッド別ステータス・tenant・恒久ブロック状態）を前提にした型・関数だった
  （DECISION_LOG 2026-08-27）。**イベントカタログの `sync.*` 5 イベント＋
  `EVENT_RISK` の格付けだけ残す**（`src/lib/events/catalogue.ts`）。
  同期層の型・競合解決は IMP-032（SYNC_CENTER）で outbox の実際の契約に
  合わせて設計し直す。
- **IMP-015（状態機械・遷移表・Certificate Gate 型）完了**: `src/lib/domain/transitions.ts`
  （正準 6 軸の遷移表＋汎用遷移検証関数）、`src/lib/domain/certificateGate.ts`
  （v2.0 §19.4 の 10 条件型定義）。既存値→正準値マッピングは各消費タスクで段階的に
  導入する方針を確定（DECISION_LOG 2026-08-19）。テスト 54 件。
- **IMP-001（実装ガードレール & 正準ドメイン語彙）完了**: `src/lib/domain/{states,labels}.ts`
  （6軸の正準値+ロケール別ラベル）、`docs/adr/0001`〜`0006`、アドホック状態禁止ルール
  （CLAUDE.md）。既存語彙との統一・マッピングは IMP-015 で判断（ADR-0002）。
- 起点タスク **IMP-000（リポジトリ監査 & 実装ベースライン）完了**。成果物:
  - `docs/implementation/current-architecture.md` — 実査に基づく現状マップ＋検証ベースライン＋不可逆リスク台帳
  - `docs/implementation/requirement-trace.md` — v2.0 要件 ⇔ 既存実装 ⇔ IMP タスクのトレース表（36タスク全件）
- コード変更ゼロ。v2.0 の正準語彙（JobState 12値等）と既存実装の語彙（reservations.status 5値等）は
  別体系であり、統一の要否は IMP-001 以降で判断する（DECISION_LOG 2026-08-19 参照）。
- **UI-010/020/030（モバイル UI リデザイン Phase 1）完了**（2026-08-20、PR #926 に追加コミット）:
  - デザインシステム基盤: `tokens.ts` 単一定義源、react-native-paper テーマ接続、共有 UI コンポーネント9種新規
  - モバイルシェル: v2.0 正準5タブ（ホーム/作業/車両/証明/その他）、Quick Create FAB
  - ホーム画面: 3秒理解レイアウト（日付挨拶・3段階スコープ・作業サマリ+ProgressRing・NEXT ACTION・対応必要一覧・タイムライン）
  - MORE 画面: セクション別リストに再編（リファレンス07準拠）
- **UI-040/060/070（モバイル UI リデザイン Phase 2）完了**（2026-08-21、PR #926 に追加コミット）:
  - 作業リスト: Ledraスタイルカード（車両アイコン+ナンバー+StatusBadge+メタ行）
  - Job Hub（作業詳細）: Vehicle heroカード+ProgressRing、NEXT ACTION、5ステップ、5タブ（概要/作業/証拠/書類/履歴）
  - 車両リスト: 検索バー付き一覧、証明書数表示
  - Vehicle Passport（車両詳細）: Heroカード+2x2 Stat Grid+証明書タイムライン+NFCタグ一覧
  - 証明書リスト: SegmentedControl（すべて/有効/下書き）フィルター
  - 証明書詳細: VERIFIED shield hero、完全性検証チェック、PDF/QR/共有アクション
  - 通知センター: すべて/未読フィルター、タイプ別アイコン、相対時刻表示
- **全画面デザイントークン適用 & 認証/オンボーディングフロー新設 完了**（2026-08-21、PR #926 に追加コミット）:
  - 既存28画面をLedraデザイントークンに一括移行（hardcoded colors→tokens, Card→View+card styles,
    Button→LedraButton, Chip→StatusBadge, SegmentedButtons→SegmentedControl, Dialog→Alert.alert()/LedraAlert,
    Searchbar→native TextInput）
  - 認証フロー新規4画面: OTP認証（verify-otp）、生体認証セットアップ（biometric-setup）、
    オンボーディング（3スライド）、パスワードリセット（forgot-password）
  - 認証フロー既存3画面リデザイン: ログイン（ブランドヘッダー）、サインアップ、店舗選択
  - **モバイルアプリの全41画面がLedraデザイントークン準拠**。実機確認待ち
- **実機テストによる差し戻し修正（2026-08-21〜22、PR #926 に追加コミット）**: 代表の実機確認で
  出た指摘を修正。第1弾は戻るボタン／オフラインバナーのノッチ被り／通知バッジと一覧の件数不一致
  （`notifications` の実カラムは `notification_type`・`read_at`）。第2弾は**ウォークイン会計の
  品目選択を POS レジ型に作り直し**（等幅タイル2列グリッド・FlatList 仮想化・検索とカテゴリタブの
  固定・「よく使う」既定表示・品目選択と会計の2ステップ化）と、**タブバーを独立した丸ボタン化**
  （非選択時も背景+枠線で境界を可視化、直径48px、+ ボタンを右下から中央上へ移設）。
  `/code-review` で自作の実害バグ4件（カスタム品目への導線消失・iPad Split View での決済手段
  取り違え・端末バックによるカート消失・タブバーのセーフエリア未加算）を検出し同時に修正。
  品目絞り込みの純ロジックは `lib/menuFilter.ts` に切り出し自己チェック付き。
  **「よく使う」は sort_order 上位＝実売上頻度ではない【要確認】**。詳細は DECISION_LOG / RELEASE_LOG 2026-08-22。
  第3弾（2026-08-23）は**タブ画面の一等地を画面名から検索へ**。「作業」「車両」「証明」
  「その他」とホームのヘッダーを撤去し、共通の `TabTopBar`（検索窓＋未読バッジ付き通知ベル）
  へ置換。画面名はタブバーのアイコンで既に分かるため情報が重複していた。通知は
  `link_path`（管理画面向け Web パス）をモバイルのルートへ変換して遷移させる。
  発行されている2種の遷移先（メッセージ・見積）はいずれも第5弾で実装済み。
  ベース背景を白に統一（`shadows.card` の不透明度を 0.06→0.10 に上げてカードの輪郭を維持）、
  日時ピッカーを `locale="ja-JP"` で数字表記に固定。詳細は DECISION_LOG / RELEASE_LOG 2026-08-23。
  第4弾（2026-08-23）は**アプリロック**。セッションが端末に残るため一度ログインすると
  次の起動から素通りになり、端末を人に渡すと顧客情報がそのまま見えていた。起動時と
  「5分以上アプリを離れたあとの復帰時」に生体認証を挟む。**新しいネイティブモジュールは
  足さず**、既に入っている `expo-secure-store` の `requireAuthentication`（キーチェーン項目の
  読み出しに OS の生体認証を要求する）で実現しているため**現ビルドのまま動く**。
  有効化は設定（その他 → アカウント設定）から。**再ロックの閾値5分は仮置きで実測なし
  【要確認】**、既定は OFF。iOS のアプリスイッチャーに残るサムネイルは隠せておらず、
  **端末パスコードへのフォールバックも出せない**（指が濡れている・手袋で通らないときの
  逃げ道は「ログアウトしてパスワードで入り直す」のみ）。
  第5弾（2026-08-23）は**メッセージと帳票のモバイル画面**。通知の遷移先が
  実在しない状態を解消するため、LINE 受信箱（一覧・会話・テキスト返信・既読化）と
  見積/請求（一覧・詳細・ステータス変更）を追加。管理画面のロジックは複製せず
  `src/lib/messages/threads.ts` と `src/lib/documents/statusEffects.ts` へ抜いて共有した
  （帳票の確定は電帳法の封印・自動送付・見積フロー進行を伴うため、入口を1つにして
  片方だけ抜ける事故を構造的に防ぐ）。読み取りは Supabase 直読み、副作用のある操作だけ
  `/api/mobile/*` を通す既存の使い分けを踏襲。メッセージは画像も送れる
  （`expo-image-picker` は導入済みなので再ビルド不要。iOS の HEIC は
  `preferredAssetRepresentationMode: "compatible"` で JPEG に変換させる）。
  詳細は DECISION_LOG / RELEASE_LOG 2026-08-23。



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
