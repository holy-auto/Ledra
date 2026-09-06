# OPEN_QUESTIONS.md — 迷っていること・未解決事項

> まだ決まっていないこと、判断に迷っていることを書く場所。決まったら
> DECISION_LOG.md に移し、このファイルからは消す（削除履歴は git で追える）。

## PR #966 で `pull_request` 起因のワークフローが起動しないことが4回起きた（2026-09-06）

- 症状: push しても GitHub Actions が**1本も作られない**。Vercel と Supabase の
  チェックだけが付き、CI / Mobile CI / CodeQL / LoC が丸ごと出ない。
  「失敗」ではなく「存在しない」ので、PR 画面は緑にも赤にも見えない。
- 発生: `3acf7f6` / `097a043` / `20d3ce3` と、その前の1回。**毎回 main を取り込んで
  push し直すと解消する。**
- 切り分けで分かっていること:
  - main 側では同時刻に CI が正常に走っている（`6bc745f` で success）ので
    Actions の枠切れやリポジトリ全体の停止ではない
  - `097a043` のときは PR が `mergeable_state: dirty` で、マージ ref が作れず
    `pull_request` イベントが発火しない、という説明が付いた
  - **`20d3ce3` のときは main とのコンフリクトが無かった**のに同じ症状が出た。
    つまり「コンフリクトでマージ ref が作れない」だけでは説明できない
- 未解決: 真の原因。次の候補を実際に読んで潰す必要がある。
  - `.github/workflows/*.yml` の `on: pull_request` の `paths` / `branches` フィルタ
  - draft PR の扱い（`types: [opened, synchronize, reopened, ready_for_review]` の有無）
  - GitHub 側のマージ ref 計算がまだ終わっていないタイミングで push した場合の競合
- なぜ放置できないか: **「CI が緑」ではなく「CI が無い」状態は、見た目で区別しにくい。**
  マージ前に気づかなければ、検査を一度も通していない変更が入る。
  実際このブランチでは、私が毎回 Actions の一覧を数えて初めて気づいている。
- 起票日: 2026-09-06

## `certificates` の公開ポリシーが行ごと許可し、`is_hidden` を見ていない（2026-09-06）

anon から読める表を全件実測した際に見つけた2点。**どちらも現時点で実害0**だが、
条件が変わると露出する形なので残す。

**1. 公開ポリシーは行ごと許可する（列を絞っていない）**

`cert_public_read_active` と `public read active certificates by public_id` は
`TO anon USING (status = 'active')`。RLS は行単位なので、**行に含まれる全列**が
anon から読める。証明書が公開検証できること自体は設計どおり
（QR から誰でも真正性を確かめられるのが製品の核）。

実測したところ、anon に見える23件で埋まっているのは:

| 列 | 埋まっている件数 |
|---|---:|
| `customer_name` | 23 / 23 |
| `vehicle_info_json` | 23 / 23 |
| `remarks` | 1 |
| `service_price` | **0** |
| `customer_phone_last4` | **0** |
| `craftsman_name` | **0** |

`customer_name` と車両情報は証明書の性質上そこにあるべきもの。問題は下3つで、
**今は空だから見えないだけ**。施工価格や職人名を保存し始めた瞬間に公開される。

【要確認】これらの列を今後埋める予定があるか。埋めるなら、公開用に列を絞った
ビューを挟むのが素直（境界を型で持てる）。埋めないなら現状維持でよい。

**2. `is_hidden` を無視している**

公開ポリシーの条件は `status='active'` だけで、`certificates.is_hidden` を見ていない。
現在 `active` かつ `is_hidden` の証明書は **0件**なので露出は無いが、
「非表示」にしたつもりの証明書が anon から読めることになる。
`is_hidden` が何のための列かを確かめてから、ポリシーに足すか列を消すかを決める。

## 【対応待ち】本番 Vercel の AI コストキャップ env を設定する（2026-09-04）

コード側は対応済み。**残っているのは本番 Vercel の環境変数の設定だけ。**

代表判断 2026-09-04: **テナント1件あたり月1万円。**
1コールの概算単価が 2.0 円なので月5,000コール相当で、通常利用（Haiku で月数百円 =
150〜400コール）の25〜60倍。「普通に使う分には当たらないが、暴走は止まる」水準。

コード側は既定値を入れたので（`DEFAULT_MONTHLY_COST_CAP_JPY = 10000`）、
**env を設定しなくてもブレーキは効く**。それでも env を明示しておくと、
値を変えるのにデプロイが要らなくなる。

- **やること**: 本番 Vercel の `AI_MONTHLY_COST_CAP_JPY` に `10000` を設定
- この環境から Vercel へは出られない（プロキシが CONNECT 403）ので代表の操作が要る
- 設定しない場合もコード既定の10000が効くので、**急ぎではない**

残る論点（別途判断）:
- テナント個別上限をプランに応じて自動で入れるか（Starter は月○円、等）。
  現状は全テナント一律10000で、個別に設定したテナントはその値が優先される。
- `withCostCap` の fail-open のままでよいか。Redis が落ちている間は上限が消えるが、
  ブレーキ側の障害でサービスを止めるのも困る、というトレードオフ。
- 概算単価（1コール2.0円）が実態と合っているか。`ai_usage_logs` の実績が
  数か月たまってから見直す。

- 起票日: 2026-09-04
- 判断者: 代表（金額は決定済み。env 設定は未実施）

## 代車の返却期限が「日付だけ」で、JST の日の境界を持っていない（2026-09-04）

`LoanerCarsClient.tsx:560` は `return_due_at`（timestamptz）に
`new Date(returnDue).toISOString()` を入れている。`returnDue` は `type="date"` の
`YYYY-MM-DD` なので、**ブラウザ TZ の問題ではない**（日付のみの文字列は仕様上 UTC として
解釈されるため、どの端末でも同じ値になる）。入るのは UTC 0 時 = **JST 9 時**。

- 論点: 「9/10 返却予定」は JST の**何時**を指すべきか。現状は 9/10 09:00 JST なので、
  JST 表示すれば日付は合うが、`return_due_at` を**時刻として**比較する経路
  （延滞判定・並べ替え）は 9/10 の日中に延滞扱いになりうる。
  終業時刻（例 18:00 JST）か、翌 0 時（JST 日の終わり）か。
- 実害は未確認。**`return_due_at` を時刻比較している経路を数えるのが先**。
  日付としてしか使っていないなら現状で問題ない。

- 起票日: 2026-09-04
- 判断者: 実装側で調べたうえで代表判断（返却期限の運用上の意味）

**この項目の前身の訂正。** 起票時は「`datetime-local` を naive に UTC 変換している画面が
4つ」と書き、この代車画面を4つ目に数えていた。実際には `type="date"` で、
他の3つ（LINE 一斉配信・連絡スケジュール・パスポート消費者）とは別の問題である。
**入力欄の `type` を見ずに、変換コードの形だけで同型と判断した**（MISTAKE_LEDGER M-040）。
残り3画面は 2026-09-04 に JST 固定へ寄せて解消した。

### 【解決済み 2026-09-06】連絡スケジュールの「今日 / 今週」の境界

`ContactSchedulesClient.tsx` のタブ振り分けが、ブラウザローカルの `Date` で
境界を作っていた件。**「表示専用で自己完結している」と書いたのは誤りだった。**

同じ境界が**取得クエリの `from` / `to`** にも使われていて、UTC 端末では
8:00 JST の予定（前日 23:00Z）が**取得段階で丸ごと落ちていた**。
表示のズレではなく、行が出てこない不具合だった（Codex レビュー指摘）。

取得・振り分けの両方を JST の 0 時基準に揃えて解決。
JST は夏時間が無いので日の加算は 24 時間の加算でよい。

## レシート公開機能のデプロイ順序と、実機での送信確認（2026-09-04）

**順序の制約（確定・判断待ちではない。忘れると事故る）**:
モバイルの新ビルドは `/receipt/<public_id>` のリンクを送る。**Web を先にデプロイしないと、
そのリンクは 404 のまま**（ページも PDF ルートも存在しない）。順序は

1. ~~マイグレーション適用（`documents.public_id` ＋ 索引）~~ → **2026-09-06 適用済み**
   （`20260906094512` / `20260906094735`）。実機確認を先に回すため、Web デプロイより前に当てた
2. Web デプロイ（`/receipt/[public_id]` と `/api/receipt/pdf`）← **PR #966 のマージ待ち**
3. モバイルのビルド提出

逆順にすると、直したはずの 404 がそのまま残る。2026-08-25 に同種の順序制約を起票済み。

**未解決（一部前進）**: DB を当てたので、**Vercel プレビュー URL なら iPhone で
「リンクを開く → 領収書が出る → PDF が落ちる」までを今すぐ確認できる**（代表に手順を渡した）。
残るのは**アプリ側から送る**部分で、こちらはネイティブ再ビルド（TestFlight か dev-client）が要る。
`expo start --tunnel` で JS だけ差し替えても、この PR は `app.json` とネイティブ依存を触るので反映されない。

**未解決**: **実機（iPhone）での送信確認が未実施。** 要件 5.10 は「送れること」なので
公開ページ＋PDF で満たす想定だが、確認できていないのは
「SMS / メールアプリが実際に開くか」「送ったリンクを iPhone の Safari で開けるか」
「PDF がその場で表示・保存できるか」の3つ。Apple 審査用の録画を撮るときに合わせて見る。

**未解決（小）**: 公開ページの閲覧ログを残すか。証明書の公開ページは
`certificate_public_viewed` を監査ログに書いているが、レシート側は今回入れていない。
「いつ顧客が領収書を見たか」が要る場面があるかどうかで決める。

---

## 発注の相手方に渡す public_id は「5列」より広い開示になる（2026-09-01）

- 状況: 外注施工の証明書を受発注の双方に見せる実装で、API が返すのは非 PII の5列だけに
  絞った。しかしそのうちの `public_id` は公開ページ `/c/[public_id]` を開く鍵で、
  そこにはナンバー、**同じ車両の他の証明書**（それぞれの public_id つき）、その車両の
  予約タイトルも出る（`publicData.ts` の `vehicle_certificates` / `reservations`）。
  顧客名・連絡先・作業メモは落ちているが、外注先はその車両について元請けが持つ
  施工履歴を辿れる。
- 今回の判断: 受け入れる。相手方は現車を触っており、公開ページはもともと URL を
  持つ誰にでも開く設計（顧客・NFC タグ経由も同じ）。**ただし「5列だけ」という説明は
  この点を含めて言い直すべき**で、コード側にも明記した。
- 選択肢: (1) 現状維持。(2) 公開ページを viewer 別に絞る（同一車両の他証明書の一覧を
  出す条件を分ける）。公開ページの設計変更なので影響範囲が広い。(3) 相手方には
  public_id を渡さず、発注画面の中だけで非 PII の要約を表示する（外注先が成果物を
  開けなくなるので、今回の目的そのものを損なう）。
- 影響範囲: 元請けが同じ車両で複数の外注先を使っている場合、外注先どうしが互いの
  施工を（店名つきで）見られる。営業上の機微になりうる。
- 次のアクション: 実際に複数外注が同一車両に入る運用が出てから (2) を検討する。

## 発注管理を通さない外注は記録の紐付け対象外（2026-09-01）

- 状況: `certificates.job_order_id` は `job_orders`（テナント間の受発注）を前提にしている。
  電話や口頭で頼んだ外注のように Ledra 上に発注レコードが無いケースは紐付けられず、
  受発注画面にも出ない。
- 選択肢: (1) 現状維持（外注は発注管理を通す運用にする）。(2)
  `certificates.performed_by_tenant_id` を足して発注非依存にする（上位互換だが列が増える）。
- 影響範囲: 実運用で BtoB 発注機能がどれだけ使われているかが未確認なので、
  (1) のままだと今回の実装が実質使われない可能性がある。
- 次のアクション: 本番の `job_orders` の利用実績を確認してから判断する。**【要確認】**
  現時点で発注レコード件数を確認していない。
## iOS 側にも同種のネイティブ設定検査が要るか（2026-08-25）
- 状況: Android の minSdk 衝突が「17分ビルドして初めて分かる」形だったので、CI に
  `expo prebuild --platform android` + `check:native`（minSdk の整合検査）を入れた
  （DECISION_LOG 2026-08-25）。iOS 側の同じ構造——`expo-build-properties` の
  `ios.deploymentTarget 16.0` と、CocoaPods の各 pod が要求する最低 iOS バージョンの整合——は
  **検査していない**。同種の事故が iOS で起きうるかは未確認。【要確認】
  なお 2026-08-26 に発生したスプラッシュのリソース参照切れについては、prebuild を回して
  **iOS では起きない**ことを確認済み（DECISION_LOG 2026-08-25 の該当エントリ）。
  ただしそれとこの論点は別問題で、本項の CocoaPods 整合は依然として未検査。
- 選択肢: 案A `pod install` を CI（macOS ランナー）で回して整合を見る。確実だが macOS ランナーは
  ubuntu の約10倍のコストで、`Podfile.lock` 生成のためだけに回すには重い。案B Podspec の
  `deployment_target` を静的に走査する検査を書く（Android と同じ作り、ubuntu で動く）。
  案C 現状維持。iOS は `development-device` で継続的に実機ビルドしており、
  Android と違って「一度も通っていない」状態にはならないので、そもそも露出が小さい。
- 影響範囲: 誤ると（＝案Cのまま事故ると）iOS のリリースビルドが直前に落ちる。
  ただし iOS は実機検証で日常的にビルドしているため、Android のように長期間潜伏はしにくい。
- 次のアクション: 新しいネイティブ依存を iOS に足すときに案Bを検討する。それまでは案C。
- 起票日: 2026-08-25

## 起動オープニングで毎回1.85秒待たせることを、現場スタッフが許容するか（2026-08-23）
- 状況: モバイルアプリのコールドスタートに 2.0 秒のロゴスティングを入れた。退場条件は
  「起動処理が終わり、かつ 1500ms 経過」＋350msフェードなので、**下限が約1.85秒**になる。
  現状の起動処理は `useAuthInit` の実測で未ログイン約300ms、ログイン済み300ms〜1.5秒。
  未ログイン起動にはこの1.85秒がほぼ丸ごと上乗せになる。ログイン済みなら大半が隠れる。
  出張整備の現場でアプリを1日に何度も開き閉めする使い方だと、この差が効いてくる可能性がある。
- 選択肢:
  - 案A 現状維持（1.85秒）: ブランド体験は最大。日常の起動は毎回1.5秒前後遅くなる。
  - 案B `INTRO_MIN_MS` を下げる: 定数1つで調整できる。ただしロックアップが完成するのが
    実測1.2秒なので、1200ms を下回ると LEDRA が出きる前に消える（自己チェックが弾く）。
    実質1.2〜1.5秒の幅しか無い。
  - 案C 素材側を詰める: ロックアップ完成までの1.2秒を短くしてもらう。下限を根本的に下げられる
    唯一の手段だが、素材の作り直しが要る。
  - 案D 初回起動のみ再生: 日常の起動を一切遅くしない。2回目以降はブランド体験がゼロになる。
- 影響範囲: 誤ると、毎日使う道具の体感速度を恒久的に損なう。逆に外しすぎると、
  未リリースのアプリの第一印象を作る唯一の場面を捨てることになる。
  `INTRO_MIN_MS` は定数1つなので、後から変えるコスト自体は小さい。
- 補足（2026-08-23 追記）: 演出の直後に毎回入っていた2度目のちらつき
  （`/(tabs)` → `/(auth)/select-store` → `/(tabs)` の往復）は解消済み。
  店舗の解決を起動処理に前倒ししたため、待ち時間は変わらないが「勝手に画面が2回変わる」
  挙動は無くなった。実機で判断する際は、1.85秒の待ちだけを評価すればよい。
- 次のアクション: 代表が dev-client ビルドを実機に入れ、実際の現場の使い方で数回起動して判断する。
- 起票日: 2026-08-23

## MISTAKE_LEDGER の連番 ID が、並行 PR のたびに衝突する（2026-09-04）

`M-001`, `M-002`, ... の連番は、main と未マージの PR が**同時に次の空き番号を取る**ため、
マージのたびに衝突する。#1025 と #1020 の作業だけで**4回**付け替えた
（M-016/M-017 → M-018 → M-021 → M-026）。番号は本文中から相互参照されるので、
付け替えるたびに表・本文・PR 本文を追う必要がある。

- 対策候補 (a): **日付ベースの ID**（`M-20260904a` / `M-20260904b`）。衝突しなくなる。
  既存 26 件を改番するか、新規分だけ新形式にして混在させるかは別途判断。
- 対策候補 (b): 番号を振らず**見出しの日付＋一文**で引く。相互参照が壊れやすくなる。
- 対策候補 (c): 現状維持（衝突のたびに手で付け替える）。

**代表判断待ち。** それまでは連番のまま運用する。

## C2PA `digitalCapture` 主張の厳密化（撮影由来の暗号学的保証）（2026-09-04）
- 状況: 施工写真の入力をカメラ撮影に限定し（Web はアルバム/DnD 廃止、モバイルは元よりカメラのみ）、
  マニフェストの `digitalCapture` を正当化した（DECISION_LOG 2026-09-04）。ただし限界が残る。
- 論点: (1) `capture="environment"` はデスクトップブラウザでファイル選択にフォールバックしうる。
  (2) サーバーは magic bytes 検証のみで、撮影由来を暗号学的には保証していない。
- 選択肢: 案A 撮影シグナル（capture nonce＋端末アテステーション）を署名経路に封入し、確認できたものだけ
  `digitalCapture`。案B 実機（モバイル）に限定。案C 現状（UI 限定＋文書で限界を明記）で AL1 は許容し、
  AL2 移行時に厳密化。
- 影響範囲: 誤ると非撮影画像を「カメラ由来」と証明しうる。現状は UI 制限で経路は塞いだが保証は弱い。
- 次のアクション: AL2 検討時に案A/B を設計。それまでは案C（GPSA に限界を明記済み）。
- 起票日: 2026-09-04

## C2PA Conformance Program 申請（AL1・Backend）の未確定事項（2026-08-11）
- 状況: 申請方針は「GP / Backend / Max Assurance Level 1 先行」に決定（DECISION_LOG 2026-08-11、詳細は `docs/c2pa-conformance-application.md`）。申請前に埋める必要のある事実が残る。
- 進捗（2026-09-03）: **EOI → Legal Agreement 署名 → Program Intake Form 提出済み**（提出値は `docs/c2pa-conformance-application.md` §11）。次は Administrator のレビュー→証拠提出（サンプル＋GPSA）。
- **一部修正済み（2026-09-03、詳細は §12）**: 証拠用サンプルで判明したマニフェスト非準拠のうち **(1) actions の C2PA 2.x 非準拠を修正済み**（`c2pa.opened`→`c2pa.created`+`digitalSourceType`、`orientation`/`converted`/`edited` 維持）。実署名検証テスト `c2paSignValidate.test.ts` を新設。**全て解決（2026-09-03）**: (2) `claimSignature.mismatch` は dev 自己署名証明書だけの癖と確定 — c2patool 公式 ES256 証明書で署名すると `validation_state: Valid`／署名エラーなし（残は untrusted のみ＝適合後に解消）。**製品の署名ロジックは健全、本番鍵は不要で証明済み**。(3) HEIC も署名可能・準拠。本番鍵は適合認定後に CA から発行されるため申請時点では未保有だが、証拠サンプルは適合前でも正しい署名で提示できる。→ **署名・マニフェスト面のブロッカーは解消**。**GPSA 提出用ドラフト `docs/c2pa-gpsa.md`＋アーキ図作成済み**。v0.2 追加要件（specVersion/allActionsIncluded）も対応済み（0f860fc）。

- **2026-09-03 Administrator が Intake 受理・証拠パッケージ要求（Record ID 01a06690-d01e-7608-ad8a-cd4f1a49d76e）**。
- **2026-09-04 方針: validate 申告を取り下げ、Generator（生成）のみで申請**（DECISION_LOG 2026-09-04）。これに伴い ingredient サンプル・crJSON harness は**不要化**（validate 依存の残タスクを削除）。
- 残タスク（生成のみ・B 方針）:
  1. **生成サンプル出力** a-d（jpeg/png/webp/heic）: **生成・内部検証済み**（全 Valid/specVersion2.4/allActionsIncluded=true、テスト証明書=untrusted 想定内）で代表へ受け渡し済み。**C2PA への提出は未**（下記 4 の Conformulator 自己テスト後に代表が実施）。
  2. ✅ **GPSA を設計レベル現状のみに改訂**＋運用文書＋図（作成済み。validate を除外し生成のみに更新）。
  3. **Administrator へ訂正メール送付**（validate 取り下げ。文面 `scratchpad/ledra-intake-correction-email.md`）— 代表が送信。
  4. **Conformulator（https://c2pa-conformulator.netlify.app/）で生成サンプルを自己テスト**後に提出。
  5. 提出はメール添付/zip/DLリンク（機密）。GPSA 一式のファイル名に "GPSA" を含める。
- 別論点: 本番 sharp が HEIF デコード不可だと HEIC の GPS 除去が効かない点は要確認。
- 確定済み: 役割=GP / 実装クラス=Backend / Max AL=1 / 申告 Spec=**2.4** / 法人名=株式会社HOLY（英字 **HOLY Inc.**）/ 登記住所=東京都港区北青山1-3-1 アールキューブ青山3F / 連絡先=info@holy-inc.jp / **生成メディアタイプ=image/jpeg・png・webp・heic（validate は今回申告せず）**。
- 残る論点と選択肢:
  - **Spec 2.4 の実出力確認**: 申告 2.4 に対し、製品が実際に v2.4 準拠マニフェストを出力しているかを Intake 用サンプルで要検証（契約上、申告版に拘束される）。
  - **Date of Earliest Public Disclosure**: CPL 公開を遅らせたい日付があるか（無ければ即時）。
  - **電話番号**: Legal Agreement/連絡用の電話番号（署名時に記入済みか要確認）。
  - CA の選定と自動エンロール認証方式: O.1/O.2 の設計を左右する最重要。方式は CA 依存。
  - 署名鍵の鍵管理: AL1 は独立鍵管理サービスで可 / AL2 を見据えるなら最初から KMS（AWS/GCP/Azure）。＋鍵ローテーション手順。
  - 対応メディアタイプの確定とサンプルアセット準備（最低 image/jpeg）。
- 影響範囲: 決定が遅れると GPSA 提出・Intake Form 記入が進まない。CA選定を誤ると O.1/O.2 の実装をやり直す。
- 次のアクション: (a) EOI 送信（全項目確定済み）、(b) CA候補調査、(c) 署名鍵のKMS移行PoC、(d) 90日修正ポリシー&OWASPカバレッジの運用文書化、(e) サンプルで v2.4 出力を検証。
- 起票日: 2026-08-11（2026-08-25 更新）

## マイグレーションの version 衝突チェックが CI で強制されていない（ローカル lint 頼み）
- 状況: `scripts/lint-migrations.js` に「同一 version prefix の2ファイルを禁止する」duplicate-version チェックが
  あるにもかかわらず、#808(cta_og) と #810(gcal) が同一 version `20260721110000` で衝突し、本番 db-migrate が
  連続失敗した（2026-07-22、forward 改名で解消）。原因は lint がどの GitHub Actions workflow でも実行されておらず
  （`npm run lint:migrations` のみ、pre-push は vitest だけ）、並行 PR の衝突をマージ前に止められないこと。
- 選択肢: 案A `lint:migrations` を PR CI（必須チェック）に追加してマージをブロック。案B db-migrate workflow の
  db push 前に `lint:migrations` を実行。案C 現状維持（衝突は事後に forward 改名で対処）。A/B はすり抜けを構造的に
  防げるが必須チェック運用の追加、C は再発リスクを許容。
- 影響範囲: 誤ると（＝再発すると）本番 db-migrate が止まり、以降の全マイグレーションがブロックされる（今回まさに
  予約投稿マイグレーションが巻き込まれた）。
- 次のアクション: CI に `lint:migrations` を組み込むか判断する（堀越）。実装は軽微（既存 npm script を workflow から呼ぶだけ）。
- 起票日: 2026-07-22

## 存在しない列を参照している2箇所（template_name / agents.stripe_connect_onboarded）をどう直すか（2026-08-02）
- 状況: 本番ログで検出。どちらもマイグレーションに定義が無く、コードだけが参照している（ドリフトではなくコード/スキーマ不整合）。(1) `certificates.template_name` を `src/app/api/admin/vehicles/[id]/last-cert/route.ts:25` が select しているが、`certificates` に `template_name` 列を追加するマイグレーションは存在しない。(2) `agents.stripe_connect_onboarded` を `src/app/api/stripe/connect-webhook/route.ts:537-543` が参照するが、`stripe_connect_onboarded` は `tenants` にのみ追加され（`20260314000005`）`agents` には無い。
- 選択肢: 各々 案A 列を追加する（その値の意味・更新経路を設計）／案B コード側を修正する（(1) はテンプレJOINのエイリアス参照に、(2) は `tenants` 参照へ、あるいは該当分岐を削除）。どちらが正しいかは「その列に意味があるか」次第。
- 影響範囲: (1) は車両詳細→証明書プリフィル経路が 500。(2) は代理店(agent)の Stripe Connect オンボーディング webhook が 500。いずれも低頻度だが該当機能は壊れている。
- 次のアクション: 各参照の意図を確認し A/B を判断。template_name はテンプレート名の表示用か（=JOIN で足りる可能性大）、agents の Stripe Connect は代理店にも Connect を持たせる設計だったか（=列追加）を確定する。
- 起票日: 2026-08-02
## 画面の権限判定がクライアント側にしか無い（2026-09-04 起票 → 2026-09-05 訂正）

**2026-09-04 に書いた「`ROUTE_PERMISSIONS` を強制している場所が無い」は誤りだった。**
実際の関数名は `getRequiredPermission` ではなく **`requiredPermissionForPath`** で、
`src/app/admin/AdminRouteGuard.tsx` が呼んでいる。存在しない名前で grep して
0 件を「誰も読んでいない」と読んだ（MISTAKE_LEDGER M-031）。

正しい状態は次のとおり。

- `AdminRouteGuard` は `admin/layout.tsx` で**全 admin 画面を包んでいる**。
  `requiredPermissionForPath(pathname)` で必要権限を引き、`useCurrentRole().can()`
  （`/api/admin/me` のロール + `hasPermission`）が false ならエラーカードに差し替える。
  **表は効いている。** ただし `"use client"` なので**判定はブラウザ側**。
- サーバ側には強制が無い（`src/middleware.ts` は実在しない）。各 `page.tsx` 任せ。

2026-09-05 に全 admin 画面（150枚）を数えた結果:

| | サーバ側でも判定 | クライアントのみ / 判定なし |
|---|---:|---:|
| 表に載っている | 9 | 69 |
| 表の外 | 17 | 55 |

- **どの画面レベルの権限判定も無いのが 55 枚**（表外かつサーバ側も無し）。
  ただし**無防備という意味ではない**。データの守りは RLS で、画面の判定はその手前の
  一枚に過ぎない。「表に無い＝無防備」は誤りで、実際に表の外でもサーバ側で
  判定している画面が 17 枚ある（`/admin/report-revenue` など）。
- 表の 48 エントリのうち **4件は行き先の画面が存在しない**
  （`/admin/templates` `/admin/registers` `/admin/payments` と、index が無い
  `/admin/parts-install`）。特に `/admin/templates` は実体が
  `document-templates` / `workflow-templates` / `inspection-templates` の3枚に
  分かれており、**どれも表に載っていないので前方一致もしない＝権限判定が無い**。

**2026-09-05 に 55枚の内訳も数えた。** 「RLS だけでは絞られないデータを Server Component で
取得しているもの」は **2枚だけ**だった。

| 分類 | 枚数 |
|---|---:|
| RLS を迂回する admin クライアントを使用 | **2** |
| ユーザーセッションでクエリ（RLS 適用） | 9 |
| ページ自身はクエリを持たない（クライアント/API 経由） | 44 |

`/admin/inspections` は `caller.tenantId` で正しく絞れており問題なし。
`/admin/academy` は2点あり、DECISION_LOG 2026-09-05 の判断で処置した。

**これで (a) middleware は割に合わないと分かった。** middleware は「ログイン済みで
権限もある人が、別テナントの数字を見る」形を1つも止められない。`/admin/academy` の
欠陥がまさにそれで、足りなかったのはロール判定ではなく**テナントのフィルタ**だった。
**(b) 該当画面だけ直す**を採る。

**数えるときに使った検出器の限界**: 「スコープ列のフィルタが無い admin クエリ」を
リポジトリ全体で走らせたら 500 件出たが、**ほぼ誤検知**だった
（`.from("tenants").eq("id", tenantId)` は `id` で正しく絞れているのに、正規表現が
`tenant_id` しか見ていなかった）。**この数字は捨てた。** まともな検出器は別タスク。

**残る未決**: 上の表の「クライアントのみ」69枚 + 「判定なし」55枚に、サーバ側ガードを
足して回るかどうか。今のところ急ぐ理由は見つかっていない（データの守りは RLS、
書き込みは `API_ROUTE_PERMISSIONS` で強制済み）。選択肢は3つ。

- (a) middleware を置いて表を強制する — 全 admin 画面の表示に
  セッション読み取りが1往復増える。効果は「クライアント判定の前に止まる」こと。
- (b) 画面ごとにサーバ側ガードを書く（`/admin/site-content` で採った形）。
  55枚ぶんの手数がかかるが、必要な画面だけ選べる。
- (c) 現状維持 —— クライアント判定 + RLS で足りているとみなす。

【要確認】として残す: 同じ「PUBLIC のままの読み取りポリシー」が `academy_cases` 以外にも
無いか。今回は1件見ただけで、棚卸ししていない。

## マイグレーション外で本番スキーマへ入ったオブジェクトが 68 個ある（2026-09-04、2026-09-06 に棚卸し）

`insurer_tenant_accesses`（複数形）と全組み合わせ自動付与トリガ2本は削除して決着した
（DECISION_LOG 2026-09-04）。「同じ経路で入った他のオブジェクトが無いか」を
2026-09-06 に棚卸しした。**あった。68 個**。

### 数えたもの（2026-09-06 時点、migrations 446 本 / main `6bc745f`）

本番 `public` スキーマのオブジェクト名を、`supabase/migrations/` 全 446 本の
`CREATE` 文（`ALTER TABLE ... RENAME TO` の改名先を含む）と突き合わせた。

| 種別 | 本番 | migrations に CREATE が無い |
|---|---|---|
| テーブル | 278 | **23** |
| ビュー | 4 | **1** |
| 関数 | 141（拡張機能所有の4本を除く） | **24** |
| トリガ | 129 | **15** |
| enum 型 | 5 | **5**（migrations に `CREATE TYPE` が1本も無い） |

- テーブル23: `certificate_maintenance_logs` `dealer_users` `dealers` `deals`
  `error_events` `industry_news` `inquiry_messages` `insurer_subscriptions`
  `inventory_listings` `job_bids` `line_follow_events` `line_link_audit_logs`
  `line_link_candidates` `line_link_sessions` `line_link_tokens` `line_pending_links`
  `listing_images` `listing_inquiries` `operator_users` `shop_price_submissions`
  `support_ticket_messages` `support_tickets` `system_health_snapshots`
- ビュー1: `v_insurer_users_list`（`20260826000005_repair_unreplayable_objects.sql`
  のコメントに「どのマイグレーションでも作られない」と既に書かれていた）
- 関数24: `current_tenant_id` `current_insurer_id` `current_uid` `is_member_of_tenant`
  `member_role_in_tenant` `is_approved_dealer` `my_dealer_id` `market_my_dealer_id`
  `market_is_approved_dealer` `insurer_is_active_subscription` `handle_updated_at`
  `update_updated_at_column` `generate_public_id` `generate_vehicle_public_id`
  `generate_case_number` `certificate_vehicle_group_key` `vehicle_group_key_from_fields`
  `norm_vehicle_plate` `norm_vehicle_text` `norm_vehicle_year` `normalize_plate_search`
  `resolve_vehicle_representative_certificate_public_id` `rls_auto_enable`
  `search_vehicles_for_cartrust`
- トリガ15・enum5 は本文末の DECISION_LOG 2026-09-06 参照。

### 危険度の切り分け（ここが本題）

**テーブル23は実質使われていない。** 23 個中 21 個が 0 行、残り 2 個も 1 行
（`insurer_subscriptions` / `operator_users`）。`src` と `apps` から
`.from("<表名>")` 相当の参照は**ゼロ**（`db.generated.ts` の型定義と、無関係な
アドオンキー文字列 `"deals"` を除く）。全 23 個が RLS 有効で、うち 7 個は
ポリシー0本＝サービスロール以外は全拒否。**露出は無い。**

**危ないのは関数のほう。** マイグレーションに定義が無い 5 本
（`market_my_dealer_id` 17 / `market_is_approved_dealer` 6 / `my_dealer_id` 5 /
`is_approved_dealer` 4 / `is_member_of_tenant` 3）を、**35 本の RLS ポリシー**が
参照している。さらに 8 本のトリガが未管理のトリガ関数
（`handle_updated_at` `update_updated_at_column` 等）を呼んでいる。
つまり **migrations だけから作った DB は、本番と同じ権限判定をしない**。

### なぜ既存の検査で見つからないか

- `Migrations Replay`（`scripts/replay-migrations.mjs`）は「全ファイルが
  エラー無しで流れるか」と RLS 打ち消し検査だけで、**できあがったスキーマを
  本番と比べていない**。だから本番にだけ在るオブジェクトは原理的に出ない。
- `npm run check:schema` の `scripts/schema.snapshot.json` は
  **実 DB から取ったコピー**なので、ドリフトごと写して合格する。

### まだ答えが出ていないこと

- **いつ・誰が・なぜ作ったか**は依然不明【要確認】。Postgres はオブジェクトの
  作成時刻を持たない。`pg_class.oid` の並びを見ると、ドリフト表は migrations 由来の
  表と入り混じっており「最初期のダッシュボード構築ぶんだけ」では説明できないが、
  同じ oid 順が migrations のファイル日付順と一致しない箇所があるため
  （`market_deals` は 2026-03-14 のファイル由来なのに oid が 2026-03-26 由来の
  `insurer_tenant_access` より大きい）、**oid 順から時期を断定はできない**【推定】。
- **恒久的な検出をどこに置くか未決**。本番の資格情報が要るので CI の
  `Migrations Replay`（空 DB）ではなく、既に本番を叩いている
  `supabase-advisors.yml`（定期実行）が置き場所の候補。今回は棚卸しのみで
  検出器は入れていない。
- **23 個の未使用テーブルを消すかどうか未決**。消せば `db.generated.ts` と
  `schema.snapshot.json` も縮む。ただし 2 個には 1 行ずつ入っており、
  中身の確認が先。

## デモ保険会社にデモ施工店の閲覧許可を入れた。実アカウントの越境アクセスは別途確認したい（2026-09-03）

配布 PDF の保険会社スライドを「データが入った状態」で撮るために調べた結果。
**当初ここに書いた「デモ保険会社が見られるのは実テナント HOLY AUTO」は誤りだった**
（下記の訂正を参照）。

- **実際の状態**: デモ保険会社（`デモ損害保険株式会社`）は `insurer_tenant_access` に
  **行を1件も持っていなかった**。だから証明書検索・車両検索・店舗検索はすべて
  「該当なし」になっていた（画面は出るが常に0件）。`scripts/setup-demo-insurer.ts` は
  保険会社とユーザーを作るだけで、テナントの閲覧許可を付与していなかったのが原因。
- **やったこと**: デモ保険会社 → デモ施工店 `Ledra Motors（デモ）` の行を1件追加し、
  シードスクリプトにも同じ upsert を入れて再現できるようにした。これでデモ保険会社に
  見えるテナントは**デモ施工店だけ**（証明書18件、すべて架空データ）。
- **【解決済み 2026-09-03】** `insurer_tenant_access` の既存の唯一の行は
  **保険会社 `東京海上日動`（実アカウント、ユーザー1名）→ 実テナント `HOLY AUTO`** だった。
  代表に確認したところ「意図してない」との回答だったため無効化した
  （`is_active=false` / `revoked_at=now()`、行は監査のため残す）。`insurer_access_logs` は
  当該保険会社について **0件**で、実際に閲覧された記録は無い。詳細は DECISION_LOG 2026-09-03。

## Server Action の完全な一覧が静的に作れない（2026-09-04）

`serverActionGuards.test.ts` は**ファイル先頭に `"use server"` を持つファイル**だけを見る。
Next.js は関数内にも `"use server"` を書けるので（`vehicles/[id]/page.tsx` の
`voidCertificate`、`LogoSealSection.tsx` の `uploadLogo` / `uploadSeal`、
`login/page.tsx` の `signIn`）、この検査は**完全ではない**。

2026-09-04 時点では関数内宣言4箇所も1つずつ読んで確認済み（すべてガードあり、
または認証前で不要）。だが新しく足されたものは検査に載らない。

案: 関数内の `"use server"` を含む関数本体を切り出して、同じ検査に掛ける。
`sourceScan.ts` の `enclosingFunctions()` が使えるかもしれない。
未解決なのは、その関数が「認可を要する書き込みをしているか」をどう判定するか。
ガードの有無だけ見ると、読み取り専用の Server Action まで引っかかる。

- 起票日: 2026-09-04
- 判断者: 未定

## 通知18タイプのうち15タイプが本番で一度も発火していない（2026-08-31）

通知タイプカタログ（`src/lib/notifications/types.ts`）には18タイプあるが、本番で実際に
書き込まれているのは3タイプだけ（`chat_message` 56件 / `ai_action` 4件 / `platform_notification`
は定義のみで0件。2026-08-31 に Supabase MCP で実測）。

未使用の15タイプ: `booking_created` / `order_created` / `order_accepted` / `order_completed` /
`order_cancelled` / `payment_confirmed` / `certificate_gate_ready` / `certificate_issued` /
`customer_concern_raised` / `rating_request` / `rating_received` / `sla_at_risk` / `sla_overdue` /
`low_stock_alert` / `follow_up_reminder`

- なぜこちらで決めないか: 「証明書を発行したら誰に通知するか」「顧客の懸念が上がったら
  誰にどのチャネルで飛ばすか」は事業側の判断であり、推測で決めれば必ず外れる。
  しかも一度送った通知は取り消せない。
- 次のアクション: 代表の判断が要る。タイプごとに (a) 発火させるか、(b) 宛先（テナント全員 /
  担当者 / 顧客）、(c) チャネル（アプリ内 / LINE / メール / Slack）を決める。
  決まった分から実装する。カタログには各タイプの `defaultChannels` が既に書いてあるので、
  それを叩き台にできる。
- 関連: 統合dispatch（既存の LINE/Slack/メール/SMS モジュールを中央エンジンへ移行）も
  この判断が決まってからでないと設計できない。
- 起票日: 2026-08-31

## notifications.priority が全行 "normal" で、読み手が1つも無い（2026-08-31）

`notifications.priority`（NOT NULL、既定 `'normal'`）は本番60件すべてが `"normal"`。
書き込み側は手で `"normal"` と入れており、**読んでいるコードは1つも無い**
（一覧APIの select にも、モバイルの一覧にも入っていない）。

一方、カタログは各タイプに severity（`urgent` / `action_required` / `informational`）を
定義しており、`"normal"` はこの語彙に存在しない。

- 影響: 現状は無害（誰も読んでいない）。ただし将来「要対応バッジ」を出すときに、
  `priority` を見て混乱する余地がある。`routing.ts` の `countActionRequired()` も
  この状態では実データに対して動かない。
- 選択肢: (a) 書き込み時にカタログの severity を入れる、(b) 列を落とす、
  (c) そのまま放置して severity は型から導出する。
- 次のアクション: 「未読バッジに何を数えるか」（全未読か、要対応のみか）が決まってから選ぶ。
  読み手がいない今整えるのは YAGNI。
- 起票日: 2026-08-31

## 認可チェックを持たない変更系APIルートが多数ある（2026-08-31）

- 分母: 316本（テナント認証 `resolveCallerWithRole` / `resolveMobileCaller` を通し、かつ
  POST/PUT/PATCH/DELETE を export している `src/app/api/**/route.ts`）
- 認可なし: **判定条件によって125本または164本**
  - 125本 … 認可ヘルパー12種（`requirePermission` / `hasPermission` / `requireMinRole` /
    `hasMinRole` / `resolveOrgAccess` / `hasMinOrgRole` / `isPlatformAdmin` /
    `isPlatformTenantId` / `assertPlatformTenantId` / `authorizeOrgStoreRead` /
    `resolveInsurerCaller` / `resolveManufacturerCaller`）のいずれも呼ばないもの
  - 164本 … `requirePermission` / `hasPermission` / `requireMinRole` の3種だけで数えた場合
- どちらも同じソースから実測した値で、**数える対象が違うだけ**。以前この数字を「125」とだけ
  書いていたが、判定条件を書いていなかったため再現できなかった。数字を出すときは条件も併記する。
- 補足: いずれもファイル単位の判定。GET は守るが POST は素通り、という部分的な穴は含まれて
  いないため**下限値**である。
- なぜ機械的に直せないか: その多くは「自分のデータを自分で操作する」自己完結型
  （通知既読、UI設定、MFA登録、WebAuthn登録、プッシュ通知登録等）で、権限を要求するのが
  正しいとは限らない。誤って要求すると正規ユーザーを締め出す。
- 影響（本番実データ、2026-08-31時点、Supabase MCP で実測）: tenant_memberships 25件の内訳は
  owner 23 / staff 1 / super_admin 1。owner と super_admin は全権限を持つため、現時点で実際に
  影響を受け得るのは staff 1名のみ。ただしこれは今の登録状況にすぎず、staff/viewer が
  増えれば即座に実害になる。
- 次のアクション: 代表の判断が要る。「この操作は誰ができるべきか」をルート群ごとに決める。
  優先順位は `operationRisk()` の分類（critical → high → medium）に従うのが妥当。
  決まった分から `API_ROUTE_PERMISSIONS`（`src/lib/auth/permissions.ts`）へ登録すれば、
  構造テストが強制を保証する。
- 起票日: 2026-08-31

## モバイルのサインアップ確認 OTP は「メール確認済み」を永続状態として追跡していない（2026-08-31）

モバイルアプリのサインアップ直後メール確認（`/(auth)/verify-otp.tsx`、`email_otp_codes`、
2026-08-31実装）は、その場限りのUXステップとして作った——検証に成功しても、アカウントの
どこにも「このメールは確認済み」というフラグは残らない。他の機能（例: 重要な通知の送信条件、
将来のパスワードリセット等）がこの状態を参照したくなった場合、現状では参照先が存在しない。

- 影響: 今のところ参照している機能はない（ステップを通過すること自体が目的）ため実害はないが、
  将来「未確認メールへの重要通知を控える」等の要件が出た場合は設計が必要になる。
- 次のアクション: 実際にそうした要件が出るまでは追加実装しない（YAGNI）。要件が出た時点で、
  `auth.users` のメタデータ・専用カラム・`email_otp_codes` の`used_at`存在チェックのいずれかを
  検討する。
- 起票日: 2026-08-31

## 追加（2026-08-31・IMP-027 evaluateB2B の合算払い(consolidated) が CANCELED でも成立してしまう。Codex指摘で前提を訂正）

`src/lib/payment/policy.ts` の `evaluatePaymentPolicy()` は「UNKNOWN 状態では条件不成立」「CANCELED は条件不成立」という2つの原則の**例外**として、`evaluateB2B()` の合算払い（`billingCycle === "consolidated"`）分岐が `paymentState` を一切見ずに常時 `met: true` を返す、と JSDoc に明記済み（JSDoc と実装は矛盾していない）。`evaluateB2B()` 自身のコメント（「合算払いは『証明書を今出す、請求は後』なので決済状態は無関係」）は UNKNOWN に限定した言い回しではなく一般的な理由付けであり、文面上は CANCELED も含めた全 `paymentState` に等しく適用される——つまり CANCELED が含まれているのが偶発的（検討漏れ）だと断定できる根拠はない。**未解決なのは、この一般的な理由付け（決済状態は無関係）が CANCELED にも本当に妥当するかという製品判断であり、ドキュメントの不整合や検討漏れの有無ではない。**

- **訂正1（Codex指摘、2026-08-31）**: 当初「この特定ジョブの帳票が取消/却下された場合」（`documentStatus === "cancelled"/"rejected"` → `CANCELED`）とだけ書いたが、CANCELED の発生源を一つに絞りすぎていた。`derivePoSPaymentState()` は POS 取引が `voided`（取消）のときも `CANCELED` を返す（`derivePaymentState.ts:78-79`）。さらに `PaymentPolicyContext.paymentState` は正準 `PaymentState` を直接受け取る型であり、`evaluatePaymentPolicy()`/`evaluateB2B()` 自体は呼び出し元がその値をどう導出したかを一切関知しない——将来、本番配線されるときに別の第三の経路が追加される可能性も排除できない。以下の「帳票」「POS取引」は**現時点で確認できている例**であり、網羅的な列挙ではない。
- **訂正2（Codex指摘、2026-08-31）**: 「合算払いの取引先には per-order の請求書自体を作らない」という記述も不正確だった。`isConsolidatedBilling()`（`orderInvoice.ts:39-42`）が per-order 請求書をスキップする条件は `billing_cycle === "consolidated"` **かつ** `closing_day != null` の両方であり、`closing_day` は `customerCreateSchema`/`customerUpdateSchema` 上は任意項目（`optionalInt`）で null もあり得る。`closing_day` が null の consolidated 顧客には実際には per-order 請求書が作られる。**加えて `evaluateB2B()` はそもそも `closingDay` を入力に取っておらず**、`billingCycle === "consolidated"` だけで判定している——これは `src/lib/signoff/state.ts`（本番稼働中。`policy.ts` のコメントは支払いサイクル未設定時の案内文言を両者で揃えるよう明記しているが、判定predicate自体を同期させる取り決めがあるわけではない）と同じ判定基準であり、`orderInvoice.ts` 側がこの2モジュールより厳格な独自の基準（`closing_day` 必須）を持っている、という構図。3箇所（`signoff/state.ts`・`policy.ts`・`orderInvoice.ts`）の「合算払いかどうか」の定義が食い違っている。
- **さらに未検証（今回の是正で判明）**: 「合算払いのジョブに per-order 帳票が存在しないケース」を直接確認できたのは `src/lib/orders/orderInvoice.ts` が扱う `job_orders`（テナント間の受発注コラボレーション）の請求書生成パスのみである。通常の顧客（`customers` テーブル、`linked_tenant_id` を介さない一般の法人顧客）の通常のジョブについて、`billing_cycle === "consolidated"` のときに `documents`（見積/請求書）行が実際に作られるかどうかは未確認——`signoff/state.ts` は「会計ステップの UI 表示」を deferred にするだけで、帳票自体の作成有無とは別の話である可能性がある。
- **訂正3（Codex指摘、2026-08-31）**: 上記訂正2を「3箇所の判定基準を統一する必要がある」と結論づけたが、これは誤り。`isConsolidatedBilling()`（`closing_day` 必須）は `runCycleInvoices()`（`cycleInvoice.ts:66-71` で `closing_day` が null の顧客を明示的に除外）に渡す**ルーティング用ガード**であり、締め日が無ければそもそも合算請求 cron が動けないという技術的必然からの条件——「合算払いの定義」というより「このルーティング判断固有の前提条件」である。一方 `signoff/state.ts`/`policy.ts` は UI 表示・支払いゲートという別の関心事であり、`closingDay` を見ずに `billingCycle` だけで分類することが不当とは限らない。3箇所を同じ述語に統一すべきという前提そのものが誤りだった可能性が高い。
- **訂正4（Codex指摘、2026-08-31）**: 上記で `closing_day` 未設定の consolidated 顧客を「設定不備データ」と表現したが、これも不正確だった。マイグレーション `20260720000000_customers_payment_cycle.sql`（列コメント）は「`closing_day` の NULL は締め日未設定＝都度扱い」と明記しており、これは不備ではなく**仕様として定義された正当な状態**（合算払いを選んでいても締め日が決まっていない間は都度扱いにフォールバックする、というドキュメント化された設計）。
- **未解決の前提そのもの**: `evaluatePaymentPolicy()`/`evaluateCertificateGate()` は本番のどこからも呼ばれておらず（呼び出し元ゼロを確認済み）、「合算払いのジョブの `paymentState` は何から導出するのか」という、この判断の前提となる設計自体がまだ存在しない。加えて、`closing_day` が未設定（＝マイグレーションのコメント通り、仕様上は都度扱い）の consolidated 顧客を Payment Policy がどう扱うべきか（`orderInvoice.ts`/このマイグレーションのドキュメント化された仕様と同様に per-order 扱いへフォールバックすべきか、それとも現状通り billingCycle だけで合算扱いのままでよいか）という点も別途検討が必要。
- **判断が必要な点（前提が決まった後）**: 合算請求のサイクルに含まれる特定ジョブの決済起点が CANCELED の場合、そのジョブの証明書発行（Certificate Gate の `payment_policy_met` 条件）は成立させてよいか。(a) 合算請求は複数ジョブをまとめて締め日に請求するものなので、個別の決済状態（CANCELED含む）とは無関係に証明書を出してよい、という設計もあり得る。(b) 一方、CANCELED は「この取引自体が実質なかったことになった」ことを意味するなら、合算請求からも除外されるべきで、証明書も出すべきではない、という設計もあり得る。コードからは意図を判定できない。
- 現状の挙動は回帰テスト（`src/lib/payment/__tests__/policy.test.ts`「合算払い(consolidated) は CANCELED でも成立する」）で明示化済み。実害は現状ゼロ（`evaluateCertificateGate()` を呼ぶ本番ルートが1つも存在しないことを確認済み — IMP-028 未統合）。実際に Certificate Gate を本番配線するタスクに着手する前に、上記すべてを決める必要がある。

## 追加（2026-08-30・IMP-046 遅延 Codex レビュー8件中2件、指標の定義自体の決め直しが必要）

PR #956（IMP-046）マージ後の遅延 Codex レビュー8件のうち6件は機械的なバグとして
**PR #1009（`0c4646b`「8件中6件を修正」）で修正済み**。2026-09-04 に現行コードを読んで
6件とも直っていることを確認した（修正箇所にそれぞれ理由のコメントが入っている）。
残り2件は指標の**定義自体**を決める必要があり、コードを直すだけでは解決しない。

- **`computeVerifiedRate()`（`src/lib/analytics/operationalKpi.ts`）の REVOKED 証明書の扱い。** 現状は分母（NOT_READY/SUPERSEDEDを除く全件）に含め、分子（VERIFIED件数）からは除外する——つまり VERIFIED を経由してから REVOKED された証明書は「未到達」扱いになる。しかし `src/lib/domain/transitions.ts` の遷移表では REVOKED は ISSUING・VERIFYING からも遷移可能（VERIFIED を経由せずに無効化されるケースがある）。現在の `CertificateStateCounts`（状態別の件数の断面スナップショット）には「その証明書が過去に VERIFIED を通過したか」という履歴情報が無いため、単純に「REVOKED を分子に含める」という修正では、VERIFIED未経由のREVOKEDまで誤って到達扱いにしてしまう。正しく直すには入力データの形自体を変える必要がある（例: 各証明書に `everReachedVerified: boolean` を持たせる）。「到達率」の定義（現在VERIFIED件数ベースか、過去に一度でもVERIFIEDに達した件数ベースか）を先に決める必要がある。
- **`computeSlaComplianceRate()` の `at_risk` の扱い。** 現状は `at_risk`（まだ期限内だが警告域）を非遵守として扱う厳格な定義。これが意図的な設計（早期警告を促すため厳しく判定する）なのか、それとも「遵守率」という名前上は `overdue` のみを非遵守とすべきなのか、製品としての意図確認が必要（コードからは判定できない）。
- 実害は現状ゼロ（`src/lib/analytics/` は本番のどの API ルートからも呼び出されていない、呼び出し元ゼロを確認済み）。実際に KPI ダッシュボードへ統合するタスクに着手する前に、上記2点を決める必要がある。

## 追加（2026-08-30・IMP-050（#957）visibility.ts の owner_only 設計、Codex レビューで往復）

- **`canAccess()`/`DEFAULT_REQUIRED_VISIBILITY` の owner_only の扱いに、まだ解決していないトレードオフが残っている。** 3回のレビュー往復で判明: (a) owner_only を tenant_internal 以上に自動昇格させると、データ主体本人が restricted（auth.users.encrypted_password 等）まで見られてしまう（1回目の Codex 指摘、P1、修正済み）。(b) 昇格させないと、pii/confidential 要求のフィールド（DEFAULT_REQUIRED_VISIBILITY 経由）を本人自身も見られなくなる（3回目の Codex 指摘、P2、未解決）。(a)(b) は同じ「owner_only の意味」を取り合っており、単純な線形階層モデルでは同時に満たせない。現状は (a) を優先し、(b) は既知の限界として visibility.ts の JSDoc に明記（呼び出し側が isDataSubject と「レコードの所有者か」を個別判定してこの汎用機構をバイパスする想定）。
- **本来の解決策候補**: restricted 専用の「ViewerContext では絶対に満たせない」概念を VisibilityLevel とは別に導入する、または findClassificationViolations() を restricted の唯一の防御ラインとし、visibility.ts 側は pii/confidential/public の3段階＋「本人フラグによる個別バイパス」という設計に単純化する。現時点で `src/lib/privacy/` は本番コードから一切呼ばれていない（呼び出し元ゼロを確認済み）ため実害はないが、実際に API/UI へ統合するタスク（下流タスク、IMP-050 の「スコープ外」に明記済み）に着手する前に、この設計判断を確定させる必要がある。

## 追加（2026-08-30・事業ログのエントリが本文だけ消えていた）

- **`DECISION_LOG.md` の「2026-08-29 削除済みファイルの復活を機械的に検出する方法を
  作り、検証した」が、見出しだけ残して本文9項目を丸ごと失っている。** `3406749`
  （IMP-021 #937）の時点では本文があり、`30f2f2a`（IMP-022 #937）で本文だけが消えた。
  main では見出しごと消えており、現在の main に内容は残っていない。`OPEN_QUESTIONS.md`
  の「追加（2026-08-28・マージ手順の穴）」も同じ形で本文が無い。PR #982 のブランチが
  本文なしの見出しだけを持ち越していたので、9回目の衝突解消で main に合わせて削除した。
- **どこで消えたかは特定済みだが、復元するかは未判断。** 本文は `3406749` から
  そのまま取り出せる。ただし #982 は配布資料の PR で、事業ログの復旧は範囲外。
  別 PR で戻すか、失われたままにするかは代表判断。【要確認】 → 判断待ち
- **同種の欠落が他にもないかは未確認。** 見出しの直後に本文が無いエントリを機械的に
  洗い出せば分かる（DECISION_LOG は9項目が必ず続く形式なので検査しやすい）。
  マージのたびに本文が落ちる経路があるなら、`check-resurrected-files.sh` と同じく
  検査をスクリプト化する価値がある。【要確認】 → 調査要
## 追加（2026-08-30・「その他」タブが勝手にプラン画面へ飛ぶ不具合の調査）

- **クレームを送った利用者のテナントの実際の役割(role)・plan_tierが未確認。**
  動画では「プラン: フリー」の表示は見えたが、ログインアカウントの role（staff/
  viewer 等、`settings:view` を持たない役割）までは動画から判断できない。
  BillingFetchGuard 側は修正済みだが、実際にどの役割の従業員がこの画面を
  使っていたかは【要確認】（DECISION_LOG 2026-08-30 参照）。
- **`/admin/settings` が役割に関わらず全ウィジェット（`FollowUpSettings` 等、
  権限が要るサブ機能）を無条件マウントする設計自体は温存されている。**
  今回は BillingFetchGuard 側の誤判定を直したため誤リダイレクトは止まったが、
  権限の無いスタッフの端末では権限不足の背景 fetch がページ読み込みのたびに
  無駄に発生し続ける（403 を受けて何も起きないだけで実害は無いが非効率）。
  ページ側で `useCurrentRole()` の権限に応じて権限不要ウィジェットだけを
  レンダリングする設計に寄せるか判断が必要。同種の「表示だけ許可・機能は
  権限ゲート」ページが他にもないか棚卸しの余地がある。

## 追加（2026-08-30・PR #947 IMP-032 のスキップ）

- **IMP-032（SYNC_CENTER 同期レイヤ）の再設計を誰が・いつ行うか未定。** PR #947 は
  2026-08-27 の代表判断で削除された `src/lib/sync/types.ts`・`conflict.ts` の前提を
  そのまま使っており（tenant 不明時 `"unknown"` フォールバック等、拒否済みの回避策と
  同型）、main とマージすると import エラーでビルドが壊れる。ユーザー判断で PR #947 は
  スキップし、スタックの残りを先に進めることにした（DECISION_LOG 参照）。実際の
  再設計には `src/lib/outbox/queue.ts`・`types.ts` 側の変更（アイテム単位のステータス
  返却・enqueue 時の tenant_id 保存）が前提として必要（2026-08-27 のエントリで既に
  指摘済み・未着手）。本番稼働中の outbox コードに触れる変更のため、着手前に改めて
  確認が要る。PR #947 自体はドラフトのまま残っており、いつか棚卸し（クローズ or
  作り直し）が必要。

## 追加（2026-08-27・配布資料のグリフ）

- **同じグリフ網羅の検査を帳票（`src/lib/pdf/`）にも広げるか。** 配布資料と同じ
  日本語サブセットを使っており、#985 で `※` の欠落が別途起票されている。
  配布資料側には全描画文字を走査するテストを入れたが、帳票側は未対応。
  顧客に渡る PDF なので優先度は高いはず。【要確認】 → 判断待ち
- **`✓` の代替を「あり」にしたが、比較表の列幅で見え方を確認していない。**
  非対応の `—` と対で読める語を選んだが、4列の比較表で2文字が窮屈でないかは
  実物を目視していない。【要確認】 → 代表の見本確認時に併せて
- **配布資料の「中身の構成」は未着手。** 1スライド1メッセージへの割り直し、
  章扉スライドの挿入は各資料の文章を書き直す作業になる。版面と組みの破綻までは
  直した。どこまでやるかは代表判断。 → 判断待ち

## 追加（2026-08-27・配布資料）

- **ページ数のズレがいつから本番に出ていたか未特定。** 料金プラン詳細（宣言5/実測6）・
  ROI テンプレート（7/8）・機能紹介資料（10/12）。資料はリクエスト時生成なので、
  ズレ始めたのは対応するデータ（`ADD_ON_OPTIONS` 等）が増えた時点のはず。
  git log から追えるが未実施。実害の見積もりには要る。【要確認】 → 調査要
- **`pageCount` を守るテストの落ちる頻度。** ガイド項目や機能を1つ足すだけで
  無関係な PR が落ちる。数字を1つ直せば直る設計にはしてあるが、頻度が高いようなら
  カタログから `pageCount` を消す（カードの「約Nページ」表示をやめる）ことも含めて見直す。
  → 数回運用してから判断

## 追加（2026-08-30・IMP-026 マージ時の db-migrate.yml 失敗調査）

- **`customer_concerns` マイグレーションが git 経由の CI 以外の経路で本番へ適用された経緯が
  不明。** db-migrate.yml の唯一の実行は out-of-order で失敗したが、本番には正しい内容が
  既に存在していた（DECISION_LOG 参照）。適用者・時期を特定する手段が今のところ無い
  （Postgres 標準のメタデータにオブジェクト作成時刻は残らない）。次に同様の事象が起きた
  ときに備え、適用経路を特定できるログ・監査の仕組みが要るか検討の余地がある。
- **db-migrate.yml の workflow_dispatch を手動実行する権限が現在のセッションには無い
  （403 Resource not accessible by integration）。** 次回同様の状況で手動再実行による
  green 化確認が必要になった場合、権限のある人（代表またはリポジトリ管理者）に依頼する
  運用が要るか、GitHub App の権限設定を見直すか判断が必要。

## 追加（2026-08-20・IMP-025 車両顧客関係モデル実装時）

- **`vehicles.customer_name/customer_email/customer_phone_masked` のレガシー列 DROP タイミング。**
  これらは既にマイグレーション `20260321000002` で `vehicles` テーブルから削除済みだが、
  `customerRelation.ts` の `VEHICLE_TABLE_PII_COLUMNS`（PII 参照レジストリ）には長らく
  残存していた（IMP-025 の `/code-review` で発見・削除済み）。「削除済み列を DROP する
  タイミング」自体は元々 IMP-050（プライバシー強化）に委譲する判断だったが、実質的には
  既に完了している。IMP-050 着手時に本項目が二重管理になっていないか確認すること。
- **`vehicle_customer_relationships` テーブル新設の具体的トリガー条件。** IMP-025 で型定義
  （`customerRelation.ts` の `VehicleCustomerRelation` 等）のみ導入し、DB マイグレーションは
  「同一テナント内での所有者変更追跡が必要になった時点」まで先送りした。その時点をどう
  判定するか（機能要求ベースか、件数閾値か）は未定。IMP-050 で判断。

## 追加（2026-08-29・certificate_images_guard 改名時）


## 追加（2026-08-29・#938 IMP-023 マージ時、db-migrate 復旧に伴う発見）

- **本番にのみ `user_interface_preferences` テーブルが存在し、リポジトリの git 履歴に
  一度も出現していなかった。** version `20260828000003`、直前の成功 db-migrate run
  （2026-08-28T09:02, run 33157712227）より後、このセッションのマージ（2026-08-29T14:54）までの
  間に、Supabase MCP の `apply_migration` で本番へ直接適用されたと推定される（このセッションの
  作業ではない）。誰が・いつ・何のために適用したかは特定できていない。復旧は
  `supabase/migrations/20260828000003_user_interface_preferences.sql` を本番の実際の statements
  で追加する形で行った（DECISION_LOG 2026-08-29「本番にだけ存在した user_interface_preferences
  マイグレーションをリポジトリへ採録」参照）。
- テーブル自体も未完成の疑いがある: RLS は有効だが SELECT ポリシーのみで、INSERT/UPDATE の
  ポリシーが無い（サービスロール経由の書き込みを想定した設計か、単に未完成のまま放置されたかは
  不明）。アプリコードからの参照も0件（grep 確認済み）。用途未定のまま本番にテーブルだけが
  存在している状態。
- 本番への適用方法は 2026-09-05 に決着（既定は `db-migrate.yml` 経由、手動の直接適用は
  「本番の修正」「かなり大きな変更・追加」の2つに限る。DECISION_LOG 2026-09-05）。
  「適用直後に同名ファイルを置く」を徹底しないと同じ停止が再発する点は変わらない。

## 追加（2026-08-29・#938 IMP-023 マージ、Codex レビュー指摘）

`certificate_images_guard`（証跡凍結ガード）は親 `certificates.status` を都度
SELECT で読んで判定する設計のため、以下3つの回避経路が理論上残っている
（マイグレーションのコメントにも明記済み）。いずれも「アプリの正規の操作」
経由ではなく、テナントの owner/admin/staff 権限がある前提での直接 SQL・
極端なタイミング競合が必要。この PR ではスコープ外として出荷するかどうか、
代表確認中。

- **(a) activate との TOCTOU 競合**: 証明書の activate（draft→active）と、
  同じ写真行への DELETE が真に同時に走ると、ガードのロック無し SELECT が
  古い draft を読んで削除を許してしまう可能性。
- **(b) certificates.status の逆方向遷移で凍結解除**: `certificates` テーブル
  自体には遷移を制限するガードがなく、active/void/expired から draft へ
  直接 UPDATE されると、それ以降その証明書の写真は無制限に編集・削除できる。
- **(c) 親行の CASCADE 削除で凍結をすり抜け**: 親 `certificates` 行自体が
  削除される（`ON DELETE CASCADE`）と、子の `certificate_images` 側からは
  「親が見つからない」＝「制限なし」に見えるため、削除経路自体が凍結を
  すり抜ける。

対応するには `certificates` 側にも遷移ガード（またはロック）が必要で、
`certificate_images_guard` 単体の修正では閉じられない。IMP-030（訂正・
supersede・Integrity Incident・revoke）が該当タスクの候補。

## 追加（2026-08-28・#935 IMP-020 マージ）

- **モバイルの Quick Create FAB（`QuickCreateSheet.tsx`）と `src/lib/navigation/quickCreate.ts` が未統合。**
  FAB は固定4項目（車両登録/顧客登録/予約作成/作業開始）で権限ゲート・コンテキスト継承なし。
  `quickCreate.ts` 側（権限ゲート+コンテキスト継承、5項目）は現状 Web の CommandPalette からしか
  使われていない。統合するかどうか、するなら FAB 側の項目数・文言をどちらに合わせるかは未定。→ 未着手

- **`src/lib/navigation/scope.ts`（Role別ワークスコープ: 自分/店舗/全店舗）が実 UI と未連携。**
  型定義（`WORK_SCOPES` / `availableScopes` / `defaultScope`）のみで、既存の StoreSelector
  との統合や、実際のスコープ切替 UI（IMP-021 予定）はまだない。→ IMP-021 待ち

## 追加（2026-08-27・IMP-016 同期基盤）

（Severity の `CRITICAL → ACTION` を許すかどうかの読み方の割れは、代表判断で解決済み
（2026-08-27。現状の表＝ACTIONへの部分的な降格も許可、を正とする）。詳細は
DECISION_LOG「遷移表の未解決4件を代表判断で解決」参照。）

（`src/lib/sync/` の型・競合検出をめぐる項目5件は、モジュール自体を削除したことで
解消した。詳細は DECISION_LOG 2026-08-27「レビューの指摘が収束しなくなったら…」を
参照。同期層の設計は IMP-032 で outbox の実際の契約から作り直す。）

## 追加（2026-08-27・スタック PR の消化）

（`src/lib/domain/transitions.ts` の遷移表の足りない辺 11 件のうち、8 件は #933 で
ADR・稼働中コードを根拠に修正済み。残る 3 件（REVOKED 到達性・支払い UNKNOWN 解決先・
着手後 SKIPPED）に加えて、#933/#934 のマージで新たに生じた Severity `CRITICAL → ACTION`
の読み方の割れも合わせた計 4 件を、2026-08-27 に代表判断で解決済み。詳細は
DECISION_LOG「遷移表の未解決4件を代表判断で解決」参照。）

- **v2.0 §19.1 の仕様書本文がこのリポジトリに無い。** そのため遷移表を**書かれた仕様と
  突き合わせられていない**。照合できたのは `docs/adr/` と稼働中コードだけ。
  仕様書をリポジトリに置くか、置かない方針なら遷移表の正しさを何で担保するかを決める。【要確認】

（`.husky/pre-push` がブランチ名不一致時に `@{push}` のエラーを `2>/dev/null` で
握りつぶし、doc-only 判定に落ちてテストを飛ばす件は、代表判断で**現状維持（修正しない）**
に決定（2026-08-27）。詳細は DECISION_LOG「遷移表の未解決4件を代表判断で解決」参照。）

- **スタックした PR に CI を走らせる手段が無い。** `ci.yml` は `branches: [main, staging]` の
  `push` / `pull_request` でしか起動せず、`workflow_dispatch` も無い。ベース付け替えと
  `ready_for_review` は既定の `pull_request` トリガーに含まれない。
  `workflow_dispatch` を足すか、`types` に `ready_for_review` を足すかは未定。 → 方針未定

- **Codex が利用上限に達した（2026-08-27 01:06）。** 以降の PR には Codex レビューが付かない。
  CLAUDE.md の代替運用どおり `/code-review` を回しているが、クレジット追加や
  アップグレードをするかは代表判断。 → 代表判断待ち

- **`certificateGate.ts` の `isCertificateGateCondition` が `states.ts` の `makeGuard` を
  手で書き直している。** 同じイディオムが同一フォルダに2つあるので、`makeGuard` を
  固めても Gate 条件だけ取り残される。今回は触っていない。 → 未着手

## 追加（2026-08-26・マイグレーション運用 2）

- **`20260825000000` がいつ・どの経路で適用されたか特定できていない。** `fa14d46` の
  `db-migrate` は out-of-order で失敗しているのに、適用はされている。
  **最も確からしいのは MCP の `apply_migration` による直接適用**（下の項目と同じ形）。
  切り分けは `schema_migrations` の挿入順序を `20260826000006` と比べれば付く。
  これが外れた場合にだけ「失敗した run が一部を適用している」を疑う。【要確認】 → 調査要

## 追加（2026-08-26・デプロイ/CI）

- **Vercel が止まった原因は結局分からないまま復活した。** 8/19〜8/26 02:28 の間、
  デプロイ記録が1件も作られなかった。原因が分からないと**また同じことが起きても
  気づけない**。デプロイ記録が1件も作られない
  症状は「GitHub App の連携外れ」「プラン上限に到達」「自動デプロイ無効」の
  どれでも起きる。この環境からは `ledra.co.jp` / `app.ledra.co.jp` へ出られない
  （プロキシが CONNECT 403）ので確認できない。**代表が Vercel の Settings → Git と
  Usage / Billing を見る必要がある。**【要確認】 → 代表判断
- **`VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` が未登録。** 追加した
  `vercel-deploy.yml` は3本が揃うまでスキップする（`::warning::` は出る）。
  いまは Vercel の連携が生きているので急がないが、**非常用レバーとして効かせるなら
  登録が要る**。`ORG_ID` と `PROJECT_ID` は `.vercel/project.json` にある。 → 代表対応
- **本番が `eb99600` に追いついているか。** Vercel の連携は 2026-08-26 02:28 に
  復活したが、`eb99600`（#974 のマージ）は 02:08 でその前。次の main への push で
  追いつくはずだが、追いつかなければ Vercel のダッシュボードから手動 Redeploy が要る。
  この環境からは本番を叩けない（プロキシが CONNECT 403）。**代表の確認が必要**【要確認】
- **`vercel-deploy.yml` を自動に戻すか。** 連携が復活したので、いまは二重デプロイを
  避けて `workflow_dispatch` のみにしてある。連携がまた無音で止まったら push ブロックの
  コメントを外せば自動に戻せる（そのときは Vercel 側の自動デプロイを切ること）。 → 代表判断
- **`db-typegen.yml` の修正を通しで検証できていない。** 本番の接続URIがこの環境に
  無いため。`--db-url` が存在することは CLI のヘルプで確認済み。
  `workflow_dispatch` から手動実行すれば確かめられる。

## 追加（2026-08-26・モバイル実機テスト）

- **お客様確認の依頼を送る導線がモバイルに無い。** 表示は `reservations.signoff_*`
  から正しく出るようにしたが、本番は169件すべて `not_requested` で、
  モバイルから依頼を作れない。代表は「お客様確認も届いていて確認してる」と
  言っており、それが Ledra の機能でないなら（LINE など別経路なら）、
  この画面は作り直しになる。**どの経路で送っているか要確認。** → 代表判断
- **お客様が「開いたか」は記録していない。** 「届いたが読んでいない」は出せない。
  出したいなら開封を記録する列と導線が要る。→ 代表判断
- **既存45件の証明書の `reservation_id` は null のまま。** 今後作る分は紐づくが、
  過去分はどの案件のものか後から機械的に決められない。→ 代表判断
- **「誰も書かない列で絞る」を機械的に検出できないか。** `store_id`・
  `reservation_id` と2度起きた。どちらも**エラーが出ずに0件**を返すので、
  実データを数えるまで分からなかった。`check-schema` は列の存在は見るが、
  「その列に値が入っているか」は見ていない。手を動かせば片付く技術的負債。

## 追加（2026-08-26・マイグレーション運用）

- **MCP の `apply_migration` で本番へ直接当てる運用を続けるか。** 2026-08-26 に
  `db-migrate` が3回連続で失敗した原因はこれ（本番だけにバージョンが増え、
  repo のファイルと食い違う）。続けるなら「当てた直後に同バージョン名のファイルを
  repo に置く」を手順として固定する必要がある。`db-migrate` に一本化する案もある。
  → 代表判断
- **本番と repo の食い違いを CI で検知できないか。** 現状は `db-migrate` が
  落ちて初めて分かる。本番の `schema_migrations` と `supabase/migrations` の
  ファイル一覧を突き合わせるチェックがあれば、マージ前に気づける。
  手を動かせば片付く技術的負債。

## 追加（2026-08-25・モバイル配布）

- **モバイルの新ビルドは PR #926 のマージ・Web デプロイ後に作る。** 代表判断は
  「新しくビルドする」。ただし本番（`app.ledra.co.jp`）は `main` を配信しており、
  #926 はドラフトのまま未マージ。今ビルドして配ると次が壊れる（2026-08-25 実測）:
  - `/api/mobile/academy/lessons`（ナレッジ画面）が **main に存在しない** → 404
  - `/api/mobile/documents`（帳票画面）が **main に存在しない** → 404
  - カード番号決済はモバイルが `checkout_session_id` を送るが、main の
    `/api/mobile/pos/checkout` はこの項目を知らない → 400
  → **順序: #926 をマージ → Web デプロイ確認 → `eas build`。**
- **OTA（EAS Update）は動いていない。** `expo-updates` 未導入・`eas.json` に
  `channel` の記述なし・`app.json` の `updates` / `runtimeVersion` 未設定
  （`apps/mobile/docs/EAS_UPDATE.md` が「設定済み」と書いていたので訂正した）。
  そもそも今回は `app.json` の plugins と Permissions 文言が変わっているので、
  OTA を有効化していても届かない。OTA を実際に整備するかは未定。→ 代表判断
- **【要確認】`expo-font` が2版ロックされている**（`expo-font@57.0.1` と
  `expo/node_modules/expo-font@55.0.8`）。`expo-doctor` が
  「native builds は同一ネイティブモジュールを1版しか含められない」と警告する。
  ただし `package-lock.json` は 2026-08-10 から変わっておらず、**このロックで
  ビルドが落ちるかは未検証**。配布直前に依存解決を触るのは危険なので、
  今回は手を入れていない。ビルドが落ちたら
  `"overrides": { "expo-font": "~55.0.8" }` で1版に寄せる。

## 追加（2026-08-25・決済／店舗）

> リーダー導入と「Web の作成経路で `store_id` を入れるか」は 2026-08-25 に決着し、
> DECISION_LOG へ移した（それぞれ「導入しない」「入れる（UI を作らずサーバが決める）」）。

- **既存の `store_id` が null の行 231 件をどう埋めるか。** 内訳は証明書 45・予約 169・
  入金 11・顧客登録の招待 5・店舗用リンク 1（2026-08-25 実測）。本番の3テナントは
  いずれも有効な店舗が1つなので、`resolveStoreId()` と同じ規則で機械的に決まる。
  ただし**本番データの書き換えは代表判断**（自動では実行しない）。→ 代表判断
- **埋まったあと、モバイルの `scopeToStore()` を `.eq()` に戻すか。** 現在は
  「店舗一致または店舗未設定」で拾っている。既存行が埋まり、かつ作成経路が
  必ず店舗を入れるようになれば `.eq()` に戻せる。戻すと、店舗未設定の行は
  どの店舗からも見えなくなる。
- **有効な店舗が2つ以上のテナントが現れたときの選択 UI。** 現状 `resolveStoreId()` は
  推測で入れないので `store_id` は null のままになる。`StoreSelector` は実装済みだが
  どこからも描画されていない。2店舗目が現れてから配線する。
- **【要確認】Stripe Terminal のリーダー上の手入力が日本で有効化できるか。**
  導入しないと決めたので急がないが、再検討するときは Stripe への直接確認が要る。
- **【要確認】「タッチ決済が読めない」が実際に何件・どの頻度で起きているか。**
  計測していない。分かればリーダー導入の是非も判断できる。

## 棚卸し（2026-08-24）

**65件 → 50件。** 内訳:

| 分類 | 件数 | 内容 |
|---|---|---|
| 実装して解決したので削除 | 11 | 空DBからの再生・SECURITY DEFINER の権限・フィルタ列の照合・モバイルの証明書作成・Tap to Pay の二重請求・POS 2画面の重複 ほか |
| 重複していたので統合 | 2 | 「空DBから再生できない」2件、「本番⇄リポジトリのマイグレーション・ドリフト」2件 |
| 前提が誤っていたので書き換え | 3 | 保存先が無い項目／POS の在庫紐付け／決済の冪等キー |
| そのまま残る | 50 | 下記の4分類 |

**残り50件の内訳**: 代表の判断が要る 20件 / 実機・実運用での確認待ち 19件 /
技術的負債 7件 / 環境設定・権限（コード外）4件。

**手を動かせば片付くのは「技術的負債」の7件だけ**で、残り43件は判断か実測か
権限が要る。ここが詰まっている限り件数は減らない。

## 記入フォーマット

```

## 論点タイトル
- 状況: 何が問題／何を迷っているか
- 選択肢: 案A / 案B / ...（それぞれの長所短所）
- 影響範囲: 決定が遅れると／誤ると何が起きるか
- 次のアクション: 誰が・何をすれば決着するか
- 起票日: YYYY-MM-DD
```

## Phase 0→1 ゲート判断の具体的閾値（2026-08-18）
- 状況: 競争優位ロードマップでPhase 0（Pre-Funding）→ Phase 1（記録集積）への
  ゲート判断基準を「シード調達クローズ + 30店舗」と設定したが、調達が遅延した場合に
  Phase 1をブートストラップ（サブスク売上のみ）で開始する閾値が未定。
- 選択肢:
  - 案A: 調達がQ1'27末まで未了でもPhase 1に進む（サブスク売上でFree枠を段階拡大）
  - 案B: 調達クローズを厳格な前提条件とし、未了ならPhase 0を延長
  - 案C: 30店舗到達時点でMRRが一定額（例: 月50万）を超えていればブートストラップ可
- 影響範囲: Phase 1開始が遅れるとAITURBOに無料記録の先行優位を取られるリスク。
  一方で資金なしのFree全開放は月次赤字が制御不能になるリスク。
- 次のアクション: シード調達の進捗に応じてQ4'26末に判断。具体的な閾値はMRRと
  Free赤字の実績値を見て設定。
- 起票日: 2026-08-18

## 損保ヒアリングの初期アプローチ先（2026-08-18）
- 状況: 競争優位ロードマップPhase 0で損保1社との非公式ヒアリングを計画しているが、
  具体的なアプローチ先が未定。Big Motor事件の余波で損保各社の「施工品質の可視化」
  への関心が高まっている可能性があるが、温度感は未確認。
- 選択肢:
  - 案A: 大手3社（東京海上/損保ジャパン/三井住友海上）の代理店経由でボトムアップ
  - 案B: イノベーション/DX部門に直接アプローチ
  - 案C: 損保系の業界団体・協会経由で紹介を得る
  - 案D: 既存加盟店の取引損保を起点にする
- 影響範囲: Phase 2の損保API収益（推定月2,000万円@フル稼働）の実現可能性を左右。
  PoC 1社の獲得がPhase 1→2のゲート条件。
- 次のアクション: 代表の既存ネットワークで損保接点があるか確認。ANOBAKA等の投資家
  経由で損保のDX担当者を紹介してもらえないか打診。
- 起票日: 2026-08-18

## マイグレーション履歴が空DBから再生できない（Supabase Preview が新規マイグレーションのあるPRで必ず赤くなる）（2026-08-16）
- 状況: PR #920 で新しいマイグレーションを追加したところ、`Supabase Preview` チェックが
  `ERROR: relation "tenants" does not exist` で失敗した。失敗箇所は**リポジトリの最初の
  マイグレーション** `20260312000000_tenants_contact_fields.sql`（2026-03-12）で、
  `tenants` を `ALTER TABLE` しているが `tenants` を作るのは4番目の
  `20260313020000_core_tables.sql`。つまり**履歴は最初から空DBに再生できない**。
  ローカルの PostgreSQL 16 で検証したところ、`origin/main` の履歴でも**同じ1ファイル目で
  同じエラー**が出る（＝PR #920 の変更とは無関係の既存条件）。
  空DBに全411ファイルを流すと**169ファイルが失敗**する（うち一部はローカル shim に
  `storage.buckets` 等の Supabase 固有オブジェクトが無いことによるもので、実環境での
  真の失敗数はこれより少ない）。
  これまで表面化しなかったのは、マイグレーションを含まないPRでは Supabase Preview が
  `skipped` になるため（例: PR #919 は skipped）。マイグレーションを足すPRでのみ赤くなる。
- 選択肢:
  - 案A: 履歴の先頭数ファイルの順序問題だけを直す（`ALTER TABLE` を `IF EXISTS` にする、
    または `to_regclass` ガードで囲む）。ファイル名・順序は変えないので本番の適用履歴とは
    ずれない（Supabase CLI はバージョン番号で適用要否を判定するため、内容編集で本番が
    再適用・チェックサム不一致になることはない）。
    長所: 変更が小さい。 短所: ファイル横断の順序問題は5件だが、その先にポリシー・関数・
    seed 由来の失敗が残る可能性があり、1回では緑にならないかもしれない。
  - 案B: 現在の本番スキーマから squash した baseline マイグレーションを1本作り、以降を
    その上に積む。長所: 根本解決で、以後の preview / ローカル開発が確実に動く。
    短所: 履歴の作り直しになり、本番の `schema_migrations` との突き合わせを慎重にやる必要がある。
  - 案C: Supabase Preview を必須チェックから外す。 短所: マイグレーションの事前検証を失う。
    ドリフトで2度本番を落としている経緯（2026-07-31 / 2026-08-15）を踏まえると悪手。
- 影響範囲: マイグレーションを含むPRが常に赤くなり、「赤いのが普通」になると本物の
  マイグレーション不具合を見逃す。これは 2026-08-15 に踏んだ「db-migrate が13日間赤でも
  誰も見ていなかった」と同じ構図。
- 次のアクション: 案Aを小さく試し、空DB replay がどこまで進むかを測る（この作業環境の
  ローカル PostgreSQL で再現・計測できることは確認済み）。その結果を見て案Bの要否を決める。
  PR #920 自体はこの問題とは独立のため、切り離して進める。
- 起票日: 2026-08-16

---

# 代表の判断が要る（プロダクト・事業の意思決定）（23件）

## 信用回復ローン: 提携（A）で始めるか、自ら貸金業登録（C-2）を取るか（2026-08-24）
- 状況: 代表より「単独展開で Ledra を活かす場合と活かさない場合の比較」の依頼を受けて整理したところ
  （`docs/credit-recovery-loan-partnership-2026-08.md` 追補）、本編の「A（加盟会員と組む）一択」は
  やや単純すぎたことが分かった。**自ら貸金業登録を取る C-2 でも加盟会員になれる**（個人向け貸付の
  貸金業者は指定信用情報機関への加入と個人信用情報の提供が法令上の義務）。A と C-2 は排他ではなく壁の種類が違う。
  さらに、**提携モデルの致命傷だった VIN カバレッジ不足は、単独モデルでは構造的に消える**
  （扱う車を自分で決められるので初日から100%にできる）。Ledra 活用の前提条件は単独モデルのほうが揃っている。
- 選択肢:
  - 案A: 加盟会員（信販会社・貸金業者）と組む。長所: 登録も原資も要らず、Phase 0 は新規コード0行ですぐ着手できる。
    短所: Ledra の取り分がレポート販売と送客手数料だけで薄い。**現状の VIN カバレッジ（実測1台）では提携先の申込と交差しない。**
  - 案C-2: 自ら貸金業登録を取る。長所: 金利・手数料を全部取れ、Ledra が融資のライフサイクル全局面で効く。
    カバレッジ問題が消える。短所: 純資産5,000万円以上・常勤の貸金業務取扱主任者・**貸付業務3年以上の経験を持つ常務役員**が必要で、
    融資原資も別途要る。登録に数か月。
  - 案C-1: 自社割賦（登録なし）。**「信用回復」を名乗れないので除外**（JICC の加盟資格は貸金業法または
    割賦販売法に基づく登録事業者に限られ、自社割賦は該当しない）。
  - 案D: A で小さく回して自社の貸倒率・回収率の実データを取り、それを見てから C-2 に進むか決める。
- 影響範囲: C-2 は人材採用（貸付経験3年以上の役員）から始まるので、決めるのが遅れるほど着手が遅れる。
  逆に A を飛ばして C-2 に賭けると、貸倒率・回収率の見込みを持たないまま原資を投じることになる。
- 次のアクション: (1) 代表が C-2 の登録要件を行政書士・弁護士に確認する（特に「貸付業務3年以上の常務役員」の
  運用実態と、純資産要件の充足時期）。(2) 並行して A のパートナー候補を洗い出す。
  (3) VIN 入力率の改善は**どちらに進んでも必要**なので先に着手する。
- 起票日: 2026-08-24

## 信用回復ローン: Phase 1 に進めるVINカバレッジの閾値が決まっていない（2026-08-23）
- 状況: 信用回復ローンのスキームは決めた（DECISION_LOG 2026-08-23 / `docs/credit-recovery-loan-partnership-2026-08.md`）が、
  事業の前提であるデータ量が足りていない。本番実測で登録車両24台、車体番号入力済み6台、
  車両パスポートから引ける車両は**1台**だった（うち5台は正規化バグによるもので、本日修正済み）。
  Phase 0（提携先1社にレポートを見せて反応を測る）は24台でも実行できるが、
  Phase 1（審査システムへのAPI提供）に進む条件——「提携先の申込車両とLedraのVINが実用的に交差する台数」——の定義が無い。
- 選択肢:
  - 案A: 絶対台数で決める（例: VIN付き車両1,000台）。長所: 分かりやすい。短所: 提携先の商圏と重ならなければ台数があっても交差しない。
  - 案B: 提携先の直近の申込リスト（VINのみ）と Ledra を突き合わせてヒット率を実測し、閾値をヒット率で決める。
    長所: 交差を直接測れる。短所: 提携先の協力が要るので、パートナーが決まるまで測れない。
  - 案C: 閾値を決めず、VIN入力率の改善を進めながら Phase 0 の反応で判断する。
    長所: いま動ける。短所: 「いつ次に進むか」の基準が属人的になる。
- 影響範囲: 誤ると、提供できるデータが無いまま提携先と契約してしまい、Ledra側が約束を履行できない。
  逆に閾値を高く置きすぎると、いつまでも着手できない。
- 次のアクション: まずVIN入力率を上げる施策（入力の必須化・未入力車両の一覧化・既存顧客への遡及入力。車検証OCRは既にある）を
  開発が実施し、1か月後の実数で再判断する。並行して代表がパートナー候補を洗い出し、案Bが取れる相手かを見る。
- 起票日: 2026-08-23

## 信用回復ローン: 法務の未確認事項3件（2026-08-23）
- 状況: スキーム設計（`docs/credit-recovery-loan-partnership-2026-08.md` §5）で、弁護士確認が要る点が3つ残った。
  いずれも本環境から一次資料（e-Gov・経済産業省・個人情報保護委員会の各サイト）に到達できず、**推定のまま**である。
  1. Ledraが提携先に渡すのが「車両（VIN）の履歴のみ」であれば、個人データの第三者提供に当たらないと整理できるか。
     加盟店が「施工・請求のため」に取得した顧客情報を与信目的に回すのは当初の利用目的の外にある可能性が高く、
     車両情報と個人情報を分けられるかどうかがPhase 0が成立するかを決める。
  2. Ledraの関与がどこから貸付の「媒介」になるか。申込書を預かる・条件を説明する・審査結果を伝えるに踏み込むと
     Ledra側にも登録が要る可能性がある。Phase 1 の送客導線の設計がこれに依存する。
  3. 自社割賦（販売店が自ら後払いの分割で売る形）に業登録が不要という理解の正否。
     経済産業省の資料では許可・登録が要るのは前払式割賦販売業・前払式特定取引業（許可）と
     包括／個別信用購入あっせん業・クレジットカード番号等取扱契約締結事業（登録）とされており、
     後払いの割賦販売そのものには登録制度が置かれていないと読めるが、条文の直接確認ができていない。
- 選択肢: 3件まとめて1回で相談する／1（Phase 0の可否を決める）だけ先に相談する。
- 影響範囲: 1が否なら Phase 0 の形を変える必要がある。2が未確定のまま送客導線を作ると無登録営業のリスク。
  3は案Cを検討する場合のみ効く（現時点では案A推奨なので優先度は低い）。
- 次のアクション: 代表が顧問弁護士に1〜3を照会する。1を最優先。パートナー選定と並行して進められる。
- 起票日: 2026-08-23

## 整備記録簿の電磁的取扱い（令和7年7月8日通知）への準拠ギャップをどこまで埋めるか（2026-07-28）
- 状況: 国交省「点検整備記録簿、特定整備記録簿及び指定整備記録簿の電磁的方法による作成、保存又は交付に関する取扱い」（令和7年7月8日周知）に対する Ledra 実装の準拠マッピングを作成（`docs/e-maintenance-record-compliance.md`）。多くの要件（電磁的作成・保存・表示、改ざん防止、検索、交付、入力エラー検出）は対応済みだが、システムで埋めうるギャップが5点残る。(G1) 法定資格ロール（自動車検査員/整備主任者/起票入力）が権限体系に無く、汎用ロール（owner/admin/staff/viewer）のみ〔第２ ３（１）①〕。(G2) 更新箇所＋作業者の自動履歴が証明書以外（documents/inspection_records/body_repair_jobs）で不完全、かつ「消去」の日時をログする実装が未確認〔第２ ２（３）〕。(G3) 電子交付方法の「事前承諾」を専用取得する仕組みが無い（汎用同意基盤は流用可）〔第２ ４（３）〕。(G4) 使用者起点の「交付承諾の撤回」フローと撤回後の交付ブロックが無い（cancel=無効化は有）〔第２ ４（４）〕。(G5) 指定整備記録簿の法定様式（指定整備事業規則第10条の２）出力が未確認〔第２ １（４）〕。
- 選択肢: 案A まず G5（指定整備記録簿の様式）を確認し、指定自動車整備事業者を顧客に取るなら様式出力を最優先で実装。案B G1（資格ロール）を integrations として RBAC に追加し、法定資格の職責分離を満たす。案C G3+G4（電子交付の事前承諾・撤回）を既存署名基盤の流用で実装。案D 現状はマッピングのみとし、加盟店に指定整備事業者/特定整備記録簿の電子交付ニーズが出た時点で着手。
- 影響範囲: 特定整備事業者・指定整備事業者を明確なターゲットにするほど G1/G4/G5 の重みが増す（法定様式・資格分離・撤回権は「準拠している」と対外表明する前提になり得る）。埋めないまま「電子整備記録簿対応」を訴求すると実態との乖離リスク。G6（バックアップ明示）・G7（管理規程・操作マニュアル）は事業者運用領域で、SaaS 側はテンプレ提供で差別化余地。
- 次のアクション: (1) Ledra の主要顧客が「特定整備事業者/指定整備事業者」か「認証工場でない整備・用品・鈑金」中心かを代表が確定（対象次第で G5/G1 の優先度が決まる）。(2) 確定後、案A〜Cの着手順を判断。マッピング資料自体はコード変更なしで main へ。
- 起票日: 2026-07-28

## 電子帳簿保存法：残りの対応範囲をどこまでやるか（2026-07-27、2026-08-04更新）
- 状況: 真実性の確保（確定帳票への SHA-256 ＋ RFC3161 TS 封印）と可視性の確保（金額・取引先検索）を実装済み（選択肢2＋3）。**2026-08-04 更新: 選択肢C（TS局有効化）完了——本番で PHOTO_TSA を有効化し、実請求書の封印に DigiCert のTSトークンが付くことを本番DBで確認済み（真実性が本番成立）。封印バッジ（タイムスタンプ付き/ハッシュのみを区別表示）も帳票詳細に追加済み。** 残る項目: (a') **検証**UI——バッジで「封印済み」の可視化はしたが、ハッシュ再計算照合・TSトークンの独立検証（本当に改ざんされていないかをその場で確かめる）機能はまだ無い。(c) 電帳法の運用・規程要件（相互関連性の確保、事務処理規程の備付け等）はコード範囲外で未着手。(d) 内部資料（competitor-analysis 等）の「電帳法対応」表記（選択肢1）は未修正——実体が伴った今、表記を実態に合わせるか。
- 選択肢: 案A 封印**検証**UI（ハッシュ再計算照合・TSトークン検証）まで作り「電帳法対応」を対外訴求できる状態にする。案B 現状（保存＋バッジ表示）で止め、加盟店から要望が出た時点で検証UI・規程テンプレを追加。案C（済）TS局有効化。将来: 法的効力を厳密に重視する段階で JIPDEC 認定TS局へURL差し替え（設定変更のみ）。
- 影響範囲: 検証UIが無いと「封印が本物か」を加盟店・税務対応でその場で示しにくい（バッジは「付いている」までは示せる）。規程面は SaaS 側がテンプレを用意すると導入が楽になる（差別化にもなる）。
- 次のアクション: 加盟店の電帳法ニーズの強さを確認し、検証UI（案A）まで踏み込むか判断。内部資料の表記修正（選択肢1）は独立して着手可。
- 起票日: 2026-07-27（更新: 2026-08-04 選択肢C完了・バッジ追加）

## 証明書 auto_issue が実質無効（写真検査結果に未接続）（2026-07-24 バグ監査）
- 状況: `certificateRecordAuto.ts` は `shouldAutoIssueCertificate` を `photoQualityPassed:false, tamperingCheckPassed:false` 固定で呼ぶため autoIssue は常に false になり、`certificate.auto_issue` を opt-in しても証明書は必ず status=draft のまま。安全側（誤発行しない）だが、宣伝している自動発行が発火しない。
- 選択肢: 案A `photo.auto_quality_check`/`photo.auto_tampering_check` の実結果を読んで渡し、両方合格時のみ自動 active 化する。案B 機能自体を撤回（opt-in項目を隠す）。案C 現状維持（常に下書き）。
- 影響範囲: 誤発行リスクは無い（安全側）が、Proテナントの期待と実挙動が食い違う。法的効力のある証明書のため自動発行の設計は慎重に。
- 次のアクション: 自動発行を実効化するか撤回するかを製品判断。実効化するなら写真検査アノテーションの読み取り経路を実装。
- 起票日: 2026-07-24

## 証明書PDF/公開ページに 品番(product_code) が表示されない（PR #817、Codexレビュー指摘）
- 状況: 証明書発行フォームのコーティング剤セクションに 品番 (product_code) を保存できるようにしたが（納品書OCR取り込み・手入力とも）、PDF (`pdfCertificate.tsx`)・ブランドテンプレートPDF (`renderBrandedCertificate.tsx`)・公開ページ (`c/[public_id]/page.tsx` 等) はいずれも `coating_products_json` から brand_name/product_name/film_type しか描画しておらず、品番は保存されるだけで発行物には出ない。特に「製品名が未登録で品番だけ入力した」行では、証明書上は製品が識別できない表示になる。既存の `lot_number`（ロット番号）も同様に「内部記録のみ・発行物には出さない」設計のため、今回は同じ扱いとして据え置いた。
- 選択肢: 案A 現状維持（品番は内部記録専用。ロット番号と同じ扱い）。案B PDF/公開ページの明細行に品番を追加表示する（`pdfCertificate.tsx`・`renderBrandedCertificate.tsx`・公開ページの3箇所を変更、証明書という顧客向け文書のレイアウトが変わる）。
- 影響範囲: 案Aのままだと、品番のみで製品を識別した行は発行された証明書上で製品が分からないままになる（トラブル時の遡及調査は社内の下書きデータでは可能だが、顧客に渡る証明書には出ない）。案Bは複数ファイルにまたがる証明書レイアウト変更になるため、単独の判断で進めず代表確認を経てから着手する。
- 次のアクション: 証明書に品番を印字すべきか（会社としての証明書フォーマット方針の判断）を堀越が判断する。
- 起票日: 2026-07-23

## POS の明細が在庫と紐付いていない（**モバイル固有ではない**）（2026-08-24）
- **2026-08-24 の棚卸しで前提を訂正**: 起票時は「モバイルの明細が在庫と紐付いていない」と
  書いたが、実際には **Web の POS も紐付けていない**。`deductInventoryForPosItems` は
  明細に `inventory_item_id` がある行だけを引き落とすが、その値を明細に載せている画面は
  Web を含めて**1つも無い**（`InventoryWarningsBanner.tsx` のコメントにも
  「Roadmap: cart-side inventory_item_id linkage」と書いてある）。
  さらに `menu_items` に在庫品目への紐付け列自体が無いので、サーバ側で補うこともできない。
  → つまり **POS 会計で在庫が減る経路は現状どこにも存在しない**。
- 実装に必要なもの: (1) `menu_items.inventory_item_id` 列、(2) 品目マスタ画面での紐付け UI、
  (3) カートが明細にその値を載せる、の3点。**機能追加であって不具合修正ではない。**
- 影響範囲: 在庫数が POS 会計で減らない。手動の棚卸しで合わせている想定【要確認】。
- 次のアクション: 在庫を POS 会計で自動的に減らしたいか（＝現場が在庫機能を使っているか）を
  代表が判断する。必要なら上記3点を1つの機能として起票し直す
- 起票日: 2026-08-24

## 会社名（agents）と証明書の category に保存先が無い（2026-08-23 / 2026-08-24 縮小）
- **2026-08-24 の棚卸しで前提を訂正**: 起票時に挙げた項目のうち、以下は既に保存されていた。
  - 証明書の**等級** → `vehicle_info_json` に入っている（公開ページが読んでいる）
  - 証明書の**点検日** → `maintenance_json.next_service_date`
  - 証明書の **PDF URL** → PDF は都度生成（`/admin/certificates/pdf-one`）なので列は不要
  - `certificates.work_areas` → `content_preset_json.work_areas` に入っている。
    **読む側が拾っていなかった**ので、`certAiFields` が読むよう修正済み（2026-08-24）
  - 代理店の銀行口座・郵便番号・ウェブサイト・メール通知 → 列を追加済み（本番適用済み）
- 残っているのは2つだけ:
  - **会社名（agents）**: `agents.name` 一本。画面にも入力欄が無く、実際にここへ値が
    来ることはない。別に会社名を持つ必要が出たら列を足す。
    現状は「この項目は現在保存できません」と返す（黙って捨てない）。
  - **証明書の category**: 保存先が無い。いちばん近い `service_type`（施工名）は
    AI へ `service_name` として既に渡しているので、同じ値を category として重ねて
    渡すことはしていない。
- 次のアクション: 代表に、会社名を `name` と別に持つ必要があるか確認する
- 起票日: 2026-08-23（2026-08-24 に縮小）

## 帳票フォームの「内容」欄と「品番」欄の二段構成が誤入力を誘発する件（2026-08-03）
- 状況: 品番検索/入力欄に商品名を直接入力し「内容」欄を空のまま保存する運用が定着しており（本番実データで確認）、表示側を品番昇格表示に直して復旧はしたが、入力導線自体が「内容が空の明細」を作りやすい。
- 選択肢: 案A 現状維持（表示修正で実害は消えたため）／案B 品番欄で品目マスタ非マッチの自由入力を確定した際、内容が空なら内容へ複写する／案C 内容欄を必須化しフォーム側で空明細を弾く。
- 影響範囲: 誤ると帳票の見た目・伝わり方に影響（信頼に直結）。ただし表示修正済みのため緊急度は中。
- 次のアクション: 代表の実運用（品番欄をどう使っているか）を確認して A/B/C を判断。
- 起票日: 2026-08-03

## Ledra の対 AITURBO 差別化戦略をどこに置くか（2026-07-27 競合調査）
- 状況: 株式会社ルクレの AITURBO（2026/6/30発表）が、鈑金塗装（BP）工場向けに「写真を撮るだけ」の記録DX＋AIガント工程表＋改ざん不能な証跡（写真打刻・特許出願中 特願2026-97959）で参入。対象顧客・課題が Ledra と正面衝突。ルクレは建設DX「蔵衛門」（10万ユーザー／工事写真12億枚）の資本力・配布力・特許を持つ確立企業。AITURBO 側は見積/原価を自社で持たず外部ソフトAPI連携方針、保険会社ポータルは無し、というギャップがある。
- 選択肢: 案A 記録DX（写真／案件／工程管理）で正面勝負し、現場入力UXを AITURBO 同等以上に磨く（真っ向勝負・機能数リスク）。案B 保険会社ポータル＋ブロックチェーン第三者検証＋業務一気通貫（証明書→サイン→会計連携）＋多業種（コーティング/PPF）で非対称の堀を作り、記録DXは"必要十分"に留める。案C 両立（コア入力UXは最低限追随しつつ差別化は川下エコシステムへ寄せる）。
- 影響範囲: 誤ると、資本力のある競合に BP工場の現場受注で正面から削られる／逆に差別化へ寄せすぎて現場の初期採用（入力の手軽さ）で負ける。数年でルクレのロードマップ（車検/一般整備、見積API、経営データ基盤）が Ledra 領域に到達する見込みのため放置は不可。
- 次のアクション: (1) BP工場1〜2店で AITURBO と Ledra の「作業記録にかかる時間」を実測比較。(2) 代表が差別化の主軸（案A/B/C）を選択。(3) AITURBO の料金・契約形態を営業経由で確認【要確認】。
- 起票日: 2026-07-27

## 全車種マスタの完全化（正規諸元データの調達 + 車検証OCR自動投入）
- 状況: `vehicle_size_master` にアメ車を追加し、決定的パーサをマスタ参照化した
  (DECISION_LOG 2026-07-18)。ただし「国内正規販売の全車種」を完全網羅するには、正規に
  ライセンスされた諸元マスタの一括取り込みが要る。カーセンサー/グーネットのスクレイピングは
  規約・法的リスクのため不採用と決定済み。
- 進捗: **一括CSVインポータは実装済み**(運営専用 `/admin/platform/vehicle-size-master`、
  API `POST /api/admin/platform/vehicle-size-master`)。CSVを貼り付け/アップロードすれば
  `vehicle_size_master` に upsert され、size_class は寸法から自動決定。既存 (maker,model) は
  更新(再インポートで補正可)。→ あとは「投入するデータ本体」を用意すれば青天井で増やせる。
- 選択肢(残: データ本体の調達): (a) 商用ライセンス諸元マスタ(システム・ロケーション /
  Japan Data Service 等)を購入しインポータで投入 / (b) 国交省 MOTAS の型式・車種コードを
  取り込み / (c) 車検証OCRから自動投入(ただし車検証の model は型式であり通称車種名を持たない
  ため、型式→通称名マッピングが別途必要) / (d) 当面は代表車種の手動キュレーション+
  スプレッドシートをインポータ経由で投入し、漏れは det_fallback ログで補充。
- 影響範囲: マスタに無い車種はLINEで認識されず概算が沈黙する / サイズ区分が引けない。
- 次のアクション: (1)ユーザーが諸元データを調達するか(供給元・費用)を判断、(2)型式→通称名
  マッピングの要否を車検証OCRの実データで検討、(3)必要ならインポータにサイズ区分の手動
  上書き列や差分プレビューを追加。
- 起票日: 2026-07-18（インポータ実装により更新）

## sso_required（パスワードログイン遮断契約）の扱い — SSO 撤去に伴う整合
- 状況: 2026-08-03、ログイン画面を password のみに簡素化する際、password 経路の `checkPasswordSignInAllowed`
  （`tenants.sso_required` ドメインの password ログイン遮断）を撤去した。`docs/enterprise-readiness.md` は
  「sso_required=true はパスワードを遮断する」と記載しているため、将来この列を有効化すると挙動と文書が乖離する。
  現状は `sso_required=true` のテナントは 0 件で実害なし、SSO ログイン導線自体も撤去済み（＝遮断しても代替が無い）。
- 選択肢: (a) SSO を実提供する段階で、SSO ログイン導線と `checkPasswordSignInAllowed` 遮断をセットで復活（推奨）/
  (b) SSO を提供しない方針が確定なら、`tenants.sso_required`/`sso_email_domain` 列と関連 lib・docs を整理して撤去 /
  (c) 現状維持（ドキュメントに「導線復活まで遮断は非適用」と注記）。
- 影響範囲: (b)は schema マイグレーションと enterprise 文書の改訂を伴う不可逆寄りの判断。SSO は損保系エンタープライズ
  導入向けに earmark 済みのため、独断で撤去しない。
- 次のアクション: SSO 提供方針（やる/やらない）をユーザーが確定 → (a) か (b) を選択。それまでは (c) 相当で保留。
- 起票日: 2026-08-03

## モバイルの `work-photos` バケット/汎用作業写真の正式廃止と、端末アテステーション
- 状況: 2026-08-09、モバイルの証明書写真キャプチャを WEB 真正性パイプラインへ統一。旧
  `work/[id]/photos.tsx`（`work-photos` バケット＋`certificate_images` の phantom 列 image_url/caption/
  reservation_id へ書込）は実DBスキーマに対して壊れていたため削除し、写真は証明書束縛の1系統に集約した。
- 未解決:
  (1) 予約に証明書が無い段階での「作業ドキュメンテーション写真」を残す需要があるか。現状は
      証明書必須（無ければ証明書作成へ誘導）。汎用作業写真が要るなら専用テーブル/バケットを別途設計する
      （壊れた `work-photos` を復活させない）。
  (2) 端末アテステーション（Play Integrity / App Attest）はモバイル未実装。撮影nonce により basic は
      超えるが `verified` グレードには届かない。ネイティブ実装は別フェーズ（部品装着インテグリティ移植と同時期を想定）。
  (3) `work-photos` バケットの正式廃止手続き（本番に実在しないため実害は無いが、参照ゼロを確認して台帳から外す）。
- 次のアクション: (1) の需要有無をユーザー確認 →（有）専用設計 /（無）現状の証明書束縛で確定。
  (2)(3) は部品装着インテグリティのモバイル移植フェーズでまとめて扱う。
- 起票日: 2026-08-09

## 保留中PR #760（大型UIキット同期）の扱い（2026-08-05）
- 状況: PRバックログ整理で保留とした2件のうち、**#851（実送金）は 2026-08-06 に完成・マージ済み**（DECISION_LOG 2026-08-06、残タスクは issue #892）。残るは大型UIキット同期 #760（55ファイル・レビュー20件）のみ。
- 選択肢: #760 → 55ファイルを手動レビューしてマージ／小さく分割し直す／クローズ。
- 影響範囲: 放置するとmainとの乖離が拡大し再び陳腐化。緊急度は低〜中。
- 次のアクション: 代表に #760 を今レビューするか分割するかを確認。
- 起票日: 2026-08-05（2026-08-06 に #851 分を解決済みへ更新）

## モバイルのアプリ内ウェイクワード「レドラ」をどの方式で実装するか（2026-07-28）
- 状況: アシスタント経由の音声起動（A）は既存 `ledra://` スキームで手順化済み（`apps/mobile/docs/VOICE_LAUNCH.md`）。残るは B（アプリ起動中に「レドラ」で音声データ入力を開始）。オンデバイス音声認識が必要で、当環境に実機・EAS ビルドが無く未実装。
- 選択肢: 案A Picovoice Porcupine でカスタムワード「レドラ」をオンデバイス常時（フォアグラウンド）検知→検知後だけ本格 STT（低消費・オフライン、ただし SDK 導入とライセンス）。案B `expo-speech-recognition` / `@react-native-voice/voice` で端末 STT を直接使い認識テキストに「レドラ」を含むかで判定（軽いが常時待受に不向き）。案C 深掘り版 A のネイティブ App Intents（Swift/`shortcuts.xml` を config plugin で注入）まで踏み込み、手動ショートカット登録自体を不要にする。
- 影響範囲: B はフォアグラウンド限定・マイク常時使用のためバッテリーとプライバシー表示の設計が要る。iOS は `app.json` の `ios.infoPlist` に `NSMicrophoneUsageDescription` が無く、B 実装時に追加必須（未対応ギャップ）。取り違えると「声で入力できる」と訴求して実態と乖離するリスク。
- 次のアクション: (1) A（手順運用）を実機で検証し現場で回るか確認。(2) 需要が確認できたら案A/Bを選定し、iOS マイク権限追加＋dev-client 再ビルドで PoC。サーバ経路は既存 `voiceMemoReformat` / `/api/admin/certificates/voice-memo` を流用。
- 起票日: 2026-07-28

## C2PA本番証明書（trust list準拠）をどう取得・保管するか（2026-07-27）
- 状況: 署名パイプラインのコード側は実装・検証済み（PR #831）。残るブロッカーは本番署名証明書の取得のみ。調査の結果、これは単なる証明書購入ではなく **C2PA Conformance Program への登録（Ledra を Conforming Product として適合性・セキュリティ評価 → CPL 登録）→ trust list CA から発行** という手順だと判明。公式 C2PA Trust List（c2pa-org/conformance-public の trust-list/C2PA-TRUST-LIST.pem、2026-07-27 確認時点で 28 証明書）にサードパーティ発行している商用 CA は主に **DigiCert** と **SSL.com**（他は Google/Xiaomi/Adobe 等のデバイス自社署名系）。手順・env 形式・切替前検証は docs/c2pa-production-deployment.md に集約済み。プリフライト検証スクリプト `scripts/verify-c2pa-cert.mjs`（証明書が Trusted になるかをローカルで GO/NO-GO 判定）も用意済み。
- 選択肢: 案A DigiCert / SSL.com の C2PA claim signing 証明書を Conformance Program 経由で取得＝trust list 準拠が確実だが評価プロセス・費用・更新運用が発生。案B 当面 production は用意せず、撮影時刻封印は既存 RFC3161 TSA（PHOTO_TSA_*）で担保、C2PA は dev-signed(埋め込みのみ・グレード非加算) or disabled に留める＝コストゼロだが「C2PA検証済み」は名乗れない。案C 鍵保管を KMS（CallbackSigner 経由・未実装）か env 直置き（現行対応）か。
- 影響範囲: 本番証明書が無い限り「C2PA検証済み写真」を対外提供できない（HP/保険会社向け訴求の弱点）。誤って自己署名を本番投入すると Invalid 表示で逆効果 → 切替前に verify-c2pa-cert.mjs で必ず GO 確認。
- 次のアクション（代表判断）: (1) 狙う Assurance Level を決める（上位は HW attestation 要求の可能性）。(2) DigiCert / SSL.com へ Expression of Interest・見積依頼（費用・日本からの契約可否・審査期間は【要確認】）。(3) 取得後 verify-c2pa-cert.mjs で Trusted を確認してから C2PA_MODE=production を反映。(4) 鍵保管方式（KMS or env）を決定。
- 起票日: 2026-07-27

## フェーズ2で残した真正性まわりの未確定事項（2026-07-27 C2PA/GPS実装後）
- 状況: 真正性強化（C2PA本格統合・多層GPS整合）のコードはフェーズ2で main に入ったが、本番有効化・検証・ポリシーに未確定が残る。
- 選択肢/論点:
  - **B1 本番C2PA署名の有効化**: `C2PA_MODE=production`＋メンバー発行の署名証明書/鍵＋`PINATA_JWT` を Vercel 環境変数に設定すれば動く（コード変更なし）。中間CA連鎖を `LocalSigner` にどう渡すか（現状2 PEMのみ）は実署名時に要検証。→ いつ・誰が本番証明書を入れるか。
  - **外部C2PA検証の統合確認**: `@contentauth/c2pa-node` がネイティブ依存でCIに未インストールのため、実署名/改変サンプルでの `external_c2pa_verified` の正誤はステージング未確認。→ ステージングで実サンプル検証。
  - **出張作業場所座標(work_lat/lng)の保持期間**: スタッフ限定で保持する方針は決めたが、保持期間ポリシー（何日で消すか/匿名化するか）は未確定。顧客宅位置になり得るため要設計。
  - **プライバシーポリシー本文**: 「写真GPSは照合のみ・座標非保存／出張作業場所は最小権限保持」の外部公開文面（`src/app/(marketing)/privacy`）は未反映・代表確認待ち。
- 影響範囲: B1未設定の間は自社C2PA署名は dev-signed 止まり（真正性グレードの本番seal寄与が出ない）。保持期間・プライバシー文面の未確定は、出張運用が広がると法的・信頼リスクになり得る。
- 次のアクション: (1) 代表が本番C2PA証明書の入手・env設定タイミングを決定。(2) ステージングで外部検証を実サンプル確認。(3) work_lat/lng の保持期間ポリシーを決めてプライバシー文面へ反映（代表確認）。
- 起票日: 2026-07-27

## 請求書ドラフトに「なぜ」を出すには documents に自動作成フラグが必要（PR #819）
- 状況: 承認インボックスの証明書・発注ドラフトには実データに基づく「なぜ」表示を追加したが、請求書ドラフト（`documents` テーブル）には自動作成か手動作成かを区別するフラグが無く、全件に一律の説明を出すと手動作成分について事実と異なる可能性があるため、今回は意図的に非表示のままにした。
- 選択肢: 案A `documents` に `created_via` 等のフラグ列を追加し、`invoiceRecordAuto.ts` の insert 時にセットする（スキーマ変更が必要）。案B 現状維持（請求書は「なぜ」なしのまま）。
- 影響範囲: 案Aを取らない限り、請求書ドラフトだけ他の2種別と表示が非対称なままになる。
- 次のアクション: 優先度が高ければスキーマ変更（マイグレーション追加）を検討する（堀越の判断待ち）。
- 起票日: 2026-07-22

## スタッフ/管理者のログイン回数を実測するか（login_events テーブルの要否）
- 状況: 店舗利用状況ダッシュボード(`/admin/platform/store-usage`)で「月間ログイン回数」を
  出そうとしたが、スタッフ/管理者のログインイベントを記録するテーブルが無い。現状は
  auth.users.last_sign_in_at（最新ログインのみ）から「当月アクティブ会員数」で近似している。
  そのため過去月は実際より少なく表示される（最新ログインで上書きされるため）。
- 選択肢: (a) login_events テーブル＋ログイン時の記録処理を追加し回数を実測する /
  (b) 近似のまま運用し、当月のアクティブ会員数として割り切る / (c) Supabase の auth ログ
  (GoTrue audit) を別経路で集計する。
- 影響範囲: (a)は書き込み経路とテーブルが増える。(b)は過去月のログイン指標が過小のまま。
  運営がログイン頻度で「離脱しかけの店舗」を検知したい場合は精度が問題になりうる。
- 次のアクション: 運営が月次ログイン回数を実際に意思決定に使うか確認し、使うなら(a)を起票。
- 起票日: 2026-07-16

## 「重要な」実装・判断の線引き基準
- 状況: CLAUDE.md に「重要な実装・事業判断・方針変更が発生した場合、
  docs/context/ を都度更新する」運用ルールを追加したが、何をもって「重要」と
  するかの基準（記録対象とそうでないものの境界）が未定義。
- 選択肢: (a) 影響範囲で線引き（複数画面/テナントに波及するか）/
  (b) 不可逆性で線引き（元に戻しづらい変更か）/ (c) 線引きせず迷ったら記録する
  （記録漏れより過剰記録の方が安全という前提）。
- 影響範囲: 基準が緩すぎると事業ログが雑多になり検索性が落ち、厳しすぎると
  本来残すべき決定が漏れる。
- 次のアクション: 運用してみて記録が多すぎる/少なすぎると感じたタイミングで
  基準を決め、DECISION_LOG.md に決定として記録する。
- 起票日: 2026-07-15

---

# 実機・実運用での確認待ち（19件）

## モバイルの POS 会計は新しいビルドを配らないと使えない（2026-08-24）
- 状況: `pos_checkout` の EXECUTE を service_role 専用にしたため、**配布済みの
  モバイルアプリ（RPC を直接呼ぶ旧ビルド）では POS 会計が失敗する**。
  端末からサーバ経由（`/api/mobile/pos/checkout`）で呼ぶ修正はこの PR に入っている
  ので、**新しいビルドを配れば解消する**。
  適用の判断材料: `payments` は 11 件・最終 2026-03-23 で、POS 会計は 5 か月間
  稼働実績ゼロ（一方 `reservations` は 2026-08-23 15:01 まで稼働中）。
  止まる利用者が居ない状態と判断して適用した。
- 次のアクション: PR をマージし、モバイルの新ビルドを配布する。
  配布前に実機で会計（現金・QR・Tap to Pay）を1回ずつ通す。
- 起票日: 2026-08-24

## アプリロックの再ロック閾値と既定 ON/OFF（2026-08-23）
- 状況: 起動時と「5分以上バックグラウンドにいた復帰時」に生体認証を挟むアプリロックを実装した。
  5分は「レジで別アプリを開いて戻る」を邪魔せず「置きっぱなしの離席」を捕まえる線として
  仮置きした値で、**現場の実測に基づいていない【要確認】**。また現状は本人が設定で
  有効にする方式で、既定は OFF。
- 選択肢:
  - 閾値: 1分（厳しめ・都度認証が増える）/ 5分（現状）/ 15分（緩い）/ 店舗設定で可変
  - 既定: OFF のまま（現状）/ 新規ログイン時に ON を推奨 / テナント管理者が強制できるようにする
- 影響範囲: 短すぎると現場が認証疲れで使わなくなる。長すぎると端末を渡したときに情報が見える。
- 次のアクション: 代表が実機を数日使って体感を判断する
- 起票日: 2026-08-23

## アプリロックに端末パスコードのフォールバックが無い（2026-08-23）
- 状況: expo-secure-store は iOS のアクセス制御を `.biometryCurrentSet` 固定で作るため、
  生体認証が通らないときに「パスコードを入力」を出せない。整備・コーティングの現場では
  手が濡れている・オイルが付いている・手袋という条件が普通にあり、指紋が読めないことは起きる。
  現状の逃げ道は「ログアウトしてパスワードで入り直す」のみ（作業中だと痛い）。
- 選択肢:
  - 案A: 現状のまま（ログアウト→パスワード）。追加コストなし
  - 案B: expo-local-authentication を入れて `disableDeviceFallback: false` で
    パスコード併用にする。EAS 再ビルドが必要
  - 案C: アプリ独自の PIN を持つ。保管と総当たり対策を自前で持つことになる
- 影響範囲: 認証が通らない場面が現場で頻発すると、ロック自体を切られて機能が無意味になる。
- 次のアクション: 代表が実機を数日使い、指紋が読めない頻度を見る
- 起票日: 2026-08-23

## モバイルのメッセージ機能で管理画面に残した操作（2026-08-23）
- 状況: 画像送信は追加した。まだモバイルに無いのは、AI 返信ドラフト・未紐付け LINE
  スレッドの顧客紐付け・予約候補の確認。いずれもサーバ側は動いており、必要なのは UI。
- 選択肢: 現状維持 / 未紐付けスレッドの顧客紐付けだけ足す（受け付けの現場で使いそう）/ 全部載せる
- 影響範囲: 友だち追加直後の相手を顧客として登録するのに管理画面へ戻る必要がある。
- 次のアクション: 代表が実機で使って、足りない操作を挙げる
- 起票日: 2026-08-23

## 白背景でカードが見分けられるか（屋外・明るい環境での実機確認）（2026-08-23）
- 状況: ベース背景を白に統一した結果、白いカードを区切るのは影（`shadows.card`）だけになった。
  不透明度を 0.06 → 0.10 に上げてはいるが、屋外の明るい場所や輝度を下げた端末で
  カードの境界が見えるかは実機でしか分からない。
- 選択肢: 影のまま / カードに細い枠線を足す / カードを薄いグレーにする（＝背景と役割を入れ替える）
- 影響範囲: 見分けがつかないと、どこまでが1件かが読めず作業ミスにつながる。
- 追記（2026-08-23）: 仕切り線の撤去に伴い、**画面下端の固定バー**（飛び込み受付の
  合計バー、証明書写真のアクション、メッセージの入力欄）も白地に白のまま
  影（`shadows.bar`、上向き offset −2）だけで境界を作る形になった。カードと
  同じ確認対象。足りない場合はタブバーの丸と同じく薄い塗り（`surfaceVariant`）を
  足す。影の値（opacity 0.10 / radius 8）は屋内の目視で決めた仮置き【要確認】。
- 次のアクション: 代表が屋外の実機で確認する（カードと下端バーの両方）
- 起票日: 2026-08-23

## 車検証が読み取れない実際の原因の特定（2026-08-15）
- 状況: 代表から「車検証の読み取りが出来ない」と報告があり、失敗が画面に出ない設計上の欠陥は修正した（DECISION_LOG 2026-08-15）。ただし今回の事象が **どの原因だったかは未特定【要確認】**。候補は (a) AI自動入力OFF / 月次コスト上限超過、(b) OCR基盤の失敗（`ANTHROPIC_API_KEY` 未設定・レート制限・サーキットオープン）、(c) 画像の写り、(d) 二次元コードのカメラ読み取り（`@zxing/browser`）、(e) iPhone の HEIC 画像（現状 JPG/PNG/GIF/WEBP のみ許可のため 400）。
- 選択肢: 案A 修正後の表示メッセージを代表に再現してもらい原因を1つに絞る（最短・追加実装なし）／案B 先に HEIC 変換対応を入れる（sharp の HEIF サポート依存で重い）／案C 二次元コードの分割印字（複数シンボル結合）対応を先に入れる（仕様確認が必要）。
- 影響範囲: 原因が (a) なら設定変更だけで解決。(b) なら本番環境変数・コスト上限の問題で他のAI機能にも波及。(e) なら iPhone 利用者全員が画像アップロードを使えない。
- 次のアクション: 代表が修正版で再試行し、画面に出るメッセージ（「AI自動入力が無効…」／「AI OCR に接続できませんでした」／「情報を読み取れませんでした」／「JPG / PNG / GIF / WEBP 形式の…」）のどれかを共有する。
- 起票日: 2026-08-15

## Tap to Pay 本番リリースの残論点（App Store一般公開・2026-08-06）
- 状況: モバイルをApp Store一般公開する方針に決定し必須要件を実装したが、Apple提出前に確定が要る点が残る。
- 論点と選択肢:
  1. **Apple 本番(Distribution) entitlement の付与状況【確定: 未付与】**: 2026-08-06 の実機向け `preview`(AdHoc) ビルドで、fastlane が `Entitlement com.apple.developer.proximity-reader.payment.acceptance not found and could not be included in profile` で失敗 → **Distribution/publishing entitlement は未付与**と確定。暫定対応として `withRemoveTapToPayEntitlement` を app.json plugins に登録し、development のみ entitlement を保持・preview/production は除去するよう修正済み（実機動作確認ビルドは TTP 無しで通る）。**残作業**: 審査動画3本を提出して publishing entitlement を取得 → 付与後に plugin 条件へ preview/production を戻して TTP 入りビルドを出す（submission-guide の Go/No-Go）。
  2. **要件1.6 T&C取得**: Stripe Terminal SDK が Apple 保存の T&C 同意状態を返すAPIを持つか【要確認】。現状 `termsAccepted` は接続成功から派生した表示専用フラグ（checkoutはゲートしないので要件の趣旨=ローカル変数依存の禁止には抵触しない想定）。SDKにAPIがあれば置換。
  3. **要件3.2 初回スプラッシュ告知**: 全画面モーダルの初回告知が審査ブロッカーか。基盤(push/banner)はあるが全画面スプラッシュは未実装。→ 審査で問われたら追加。
  4. **要件4.1 ProximityReaderDiscovery**: Stripe Terminal SDK が内部で使用しているか【要確認】。教育コンテンツ(4.4-4.8)の充足可否に影響。
  5. **単独owner退会時のデータ保持方針**: `DELETE /api/mobile/account` は単独ownerのときテナントを無効化＋連絡先PII消去に留め、施工履歴等の業務レコードは物理削除していない。施工履歴の保持義務・個人情報保護法の削除請求との整合をどう定義するか（法務判断）。→ 保持期間ポリシーを決めて明文化。
- 影響範囲: 1が未確定だと本番ビルドが通らずリリース不可。2〜4は審査差し戻しリスク。5は将来的な法務・信頼リスク。
- 次のアクション: 代表が(1)Apple Portalのステータス確認・(4)は提出前にSDK挙動確認。(2)(3)は審査反応を見て対応。(5)は保持方針を決定しDECISION_LOGへ。
- 起票日: 2026-08-06

## 顧客向け履歴表示の残課題3点（2026-08-15 の調査で判明・未着手）
- 状況: 「顧客が履歴を見られるか」の調査で、マイページURL自動送信（実装済み）とは別に3点の穴が残った。
  1. **公開ページに監査ログが混ざる**: `vehicle_histories` は施工履歴と監査ログを兼ねており（`src/lib/audit/certificateLog.ts`）、`certificate_public_viewed` などが description に閲覧者IPを含んだまま入る。`/c/[public_id]` の「サービス履歴」は type フィルタ無しで車両の全履歴を出す（`src/lib/certificate/publicData.ts` の該当クエリ）ため、**閲覧者のIPが公開ページに出る**うえ、閲覧ログが自己増殖して50件枠を食い潰し本来の施工履歴を押し出す。
  2. **マイページの施工履歴が一部しか出ない**: `listHistoryForCustomer` は certificate_id 経由でしか引かないため（`src/lib/customerPortalServer.ts`）、基幹ソフトから取り込んだ作業履歴（`POST /api/v1/ingest/work-history`、vehicle_id のみで certificate_id 無し）が1件も出ない。公開ページ（車両ベース）には出るので、同じ顧客が経路によって違う履歴を見る。
  3. **フォロー通知に証明書URLが無い**: 発行直後・30日後・有効期限リマインダーは LINE/メールとも本文にリンクが無く、対象取得クエリが `public_id` を select していない（`src/lib/cron/followUp.ts`）。メールしか連絡先が無い顧客には自動でURLが届かない。
- 選択肢: (1) 顧客向けに見せる type のホワイトリストを1箇所に定義し公開ページ・マイページ両方に適用 / 監査ログを別テーブルへ分離（大きい）。(2) マイページの履歴取得を certificate_id 基準から vehicle_id 基準へ寄せる。(3) フォロー通知に public_id を通して本文へ1行足す。
- 影響範囲: 1は個人情報（閲覧者IP）の公開露出で、放置すると信頼を直接損なう。2は「履歴プラットフォーム」の看板に対して顧客が見る履歴が欠ける。3は連絡先がメールのみの顧客にマイページが届かないまま。
- 次のアクション: 代表が着手可否を判断（1は優先度高）。着手時は3点まとめて1PRでよい規模。
- 起票日: 2026-08-15

## LINEログイン導入後の残論点（2026-08-15）
- 状況: 代表の判断で案B（単回使用トークンでのLINEログイン）を採用・実装した（DECISION_LOG 2026-08-15）。実装後に残った運用面の論点。
  1. **トークンTTL 7日が妥当か**: LINEのトークに残ったリンクを後日タップする前提で7日にした（`PORTAL_LINE_LOGIN_TTL_MIN` で再デプロイ無しに変更可）。「切れてから再発行する」割合が高ければ延ばす、URL転送を警戒するなら縮める。**実測値は【要確認】**。
  2. **「マイページ」再発行の発見性**: 期限切れ時の導線はLINEに「マイページ」と送る方式のみ。リッチメニューに項目を足すかは未決。
  3. **email 無し顧客の割合**: この機能の主対象だが実数は【要確認】。
  4. **既存OTPセッションとの一本化**: `customer_sessions` に「email+下4桁」と「customer_id のみ」の2形態が並ぶ。将来 customer_id 一本に寄せるかは未決（現状はDB側のCHECKでどちらかを強制）。
  5. **入力された email を検証するか**: マイページからの自己登録も、スタッフが管理画面から入力する既存経路も、確認コードを送っていない。誤入力の宛先に通知が飛ぶ余地が残る。やるなら両方まとめて揃えるべきで、片方だけ厳しくしても保証は上がらない。
  6. **登録をどこまで強く促すか**: 現在は非ブロッキングの「お願い」のみ（履歴閲覧は連絡先が無くてもできる）。登録率が低ければ、初回ログイン時にモーダルで求めるなどの強化を検討。登録率は【要確認】。
- 影響範囲: 1と2を誤るとマイページに入れない顧客が出る（サポート負荷）。4は放置しても壊れないが認証経路が2本ある状態が続く。
- 次のアクション: 本番投入後に1〜3の実測を取り代表が判断。4は次に顧客ポータルを触るときに再検討。
- 起票日: 2026-08-15

## LINE のモジュールチャネルは受付再開したら申請するか（2026-08-16 / 受付停止中）
- 状況: モジュールチャネルを使えば LINE 連携を「公式アカウント管理者がログインして許可するだけ」に
  できることは確認済み（`docs/line-module-channel-research.md`）。ただし**現在は申請の受付が停止中**
  （代表より）で、この経路は今は選べない。
  再開時期は【要確認】。
  受付停止を受けて、**申請不要の Messaging API だけでできる自動化は 2026-08-16 に実装済み**
  （トークンの自動発行 / Webhook URL の自動設定 / 配送テスト / 残作業の自動検出）。
  加盟店の作業は 7手順 → 「Channel ID と Channel Secret の2値を貼る」まで減っている。
  したがってこの論点は**緊急度が下がった**が、完全な「ログインのみ」にはモジュールチャネルが要る。
- 選択肢:
  - 案A: 受付再開を定期的に確認し、再開したら申請する。
    長所: 残った2値の入力も消え、Console を一度も開かせずに済む。実装は汎用OAuth基盤に
    `providers/line.ts` を1ファイル足すだけで載る。 短所: 再開時期が読めない。審査・費用も未知。
  - 案B: 現状（2値入力）で確定させ、モジュールチャネルは追わない。
    長所: これ以上の investigation コストがゼロ。 短所: Console を開く工程自体は残る。
- 影響範囲: 現状でも導入の障壁は大きく下がったため、緊急ではない。判断を先送りしても
  実害は「Console を開く2値コピーが残る」だけ。
- 次のアクション: 四半期に一度など低頻度で LINE の受付状況を確認する。再開が確認できた時点で
  `docs/line-module-channel-research.md` の「まだ分かっていないこと」1〜5 を照会する。
- 起票日: 2026-08-16（同日更新: 受付停止の判明と代替実装の完了を反映）

## 指名BtoB請求 Phase 1 の残論点（締め日粒度・顧客紐付け・遡及）
- 状況: 指名BtoB請求(手数料0・請求書払い・支払サイクル自動生成・確認後送付)を実装(DECISION_LOG 2026-07-20)。
  設計上、いくつか運用で詰めるべき点が残る。
- 選択肢/論点:
  (a) 締め日の粒度: 現状 `customers.closing_day` は月1回の締め(1-31, 末日丸め)。複数締め(月2回等)や
      「翌月末以外の支払日固定」は未対応。→ 実運用で要望が出たら拡張。
  (b) 顧客未紐付け時の扱い: `linked_tenant_id` 未設定/締め日なしの指名オーダーは per-order の**下書き**請求書に
      フォールバック(請求漏れ防止)。この既定でよいか、それとも「未設定なら請求を止めて設定を促す」か。
  (c) billing_method の遡及: 既存オーダーは全て `platform` 継続(無回帰優先)。過去の指名取引を invoice に
      遡及補正する必要があるか。
  (d) 指名の税区分: 現状 per-order/合算とも `tax_rate=0`(現行 orderInvoice 踏襲、金額不変)。適格請求書として
      消費税を明示する必要が出たら `buildTaxBreakdown` 接続を検討。
- 影響範囲: 締め日運用が実態に合わないと請求タイミングがずれる。税区分は適格請求書要件に関わる。
- 次のアクション: 数店舗で試験運用し、締め日・フォールバック・税表示の要否を実データで確認してから拡張。
- 起票日: 2026-07-20

## 事業者間コラボ Phase 2（空き確認＋枠押さえ）実装後の残論点
- 状況: Phase 2（取引先の空き確認＋仮押さえ→承認で本予約）を実装(DECISION_LOG 2026-07-20)。
  取引先ゲート=`customers.linked_tenant_id`＋`share_availability`、仮押さえ=`reservation_holds`＋
  `claim_reservation_hold`(advisory lock)、受注承認で本予約変換、失効 cron。残る論点:
- 選択肢/論点:
  (a) ~~公開予約フローとの整合~~ **【対応済 2026-07-20】**: `external/booking`・`customer/booking` の容量/空き判定に
      有効holdを占有として加算（RELEASE_LOG 参照）。ただし count+insert は非原子のまま（既存予約同士と同レベル）。
      厳密な原子性が要るなら公開予約も `claim` 同様の DB 関数＋advisory lock 経由にする（次段）。
  (b) `share_availability` を厳密 opt-in（既定 false＋B 側トグル）にするか。現状は「顧客登録＝許可」で既定 true。
  (c) 変換の失敗回収: hold を accepted 化した後に reservations 作成が失敗すると「accepted だが予約なし」で滞留。
      現状はログのみ。リカバリ（再試行/戻し）が要るか。
  (d) 複数スロット連結・空き○の粒度（時間帯まで見せるか）・変換時の GCal 同期・`reservations.source='partner'` 追加。
- 影響範囲: (c)は稀だが予約漏れ。(a) は表示/拒否は入ったが原子性は既存同等。
- 次のアクション: 試験運用で (c) の滞留有無・(a) の原子性強化の要否を見てから判断。
- 起票日: 2026-07-20

## 決定的フォールバック(2026-07-18)のカバレッジ実測 + AI抽出の不安定さの解明
- 状況: 本番監査ログで、AI抽出(`inboundReservationExtract`)が同形式のメッセージでも
  service/vehicle を埋めたり埋めなかったりと不安定(6件中2件のみ成功)と判明。#770の
  プロンプト修正では解消せず、決定的キーワード辞書のフォールバック
  (`deterministicServiceVehicle`)を追加した(DECISION_LOG 2026-07-18参照)。
  この開発環境には `ANTHROPIC_API_KEY` が無いため、(1)フォールバックの本番カバレッジ、
  (2)そもそもAI抽出がなぜ同形式で成否が割れるか、はまだ検証できていない。
- 選択肢: (a) 本番の `customer_messages.ai_extracted.det_fallback` フラグと
  `ai_usage_logs` を追跡し、フォールバックが実際に発火・補完しているか、辞書漏れが
  どれくらいあるかを実測する / (b) 辞書漏れが多ければ、施工内容は menu_items、車両は
  vehicles テーブルから語彙を動的生成して固定辞書に足す(ponytailの上げ代) /
  (c) AI抽出の不安定さ自体を、モデル変更・プロンプト再設計・required化などで別途調査。
- 影響範囲: フォールバックが辞書漏れで空を返すケースでは、依然として概算が沈黙する。
- 次のアクション: 数日運用後に det_fallback の発火率と辞書漏れ事例を確認し、(b)/(c)の要否を判断。
- 起票日: 2026-07-18（旧「プロンプト是正の効果検証」から更新）

## 「Ledraに聞く」のキーワードルーティングとルートテストが未成熟（PR #819）
- 状況: `src/lib/ai/askRouter.ts` は「証明書」「発行」等の固定キーワードでマッチさせているが、実運用でどんな聞き方をされるかはまだ観測できていない。「発注を発行して」のような発話が意図せず証明書一覧へ誤ルーティングする可能性がある。また `/api/admin/ask` ルートハンドラ自体（認証→ルート一致→AIフォールバックの分岐、gating順序）の統合テストが無く、純関数（`matchAskRoute`・`buildApprovalInbox`）のみテスト済み。
- 選択肢: 案A 本番の質問ログ（`ai_usage_logs`等）を見てキーワードを継続調整＋ルートレベルテストを追加。案B 埋め込み/簡易分類に置き換える（精度は上がるがコスト・複雑さも増える）。案C 現状維持で様子見。
- 影響範囲: 誤ルーティングが多いと「聞く」機能自体への信頼が下がり、結局ナビで探す従来行動に戻ってしまう。
- 次のアクション: リリース後1〜2週間、実際の質問内容とマッチ成否をログで確認してからキーワード調整・ルートテスト追加を判断する。
- 起票日: 2026-07-22

## 写真アップロードの stage タグが1リクエスト全体に1つしか付けられない（同一証明書内で施工前/作業中/施工後を写真ごとに使い分けられない）
- 状況: `handleCertificateImageUpload`（`src/lib/certificateImages/uploadHandler.ts`）は `stage`
  （`intake_before`/`in_progress`/`after`/`unspecified`）をリクエスト単位の1値としてしか受け取らない。
  今回、案件ワークフロー画面の「作業中」ステータスに撮影導線を追加し（`?stage=in_progress` 付きで証明書発行
  フォームへ遷移）、下書き保存すればその時点でアップロードした写真は `in_progress` として記録できるようにした。
  ただし同一の証明書ドラフトに、後から施工前/施工後の写真を追加する場合も、そのアップロード操作全体が同じ
  `stage` 値になってしまい、写真1枚ごとに個別の段階タグを付けることはまだできない。
- 選択肢: 案A 現状維持（複数回に分けてアップロードする運用でカバー：作業中の写真は「作業中の写真を撮る」導線から
  都度アップロードし、施工前/後は別のタイミングでアップロードすれば、実質的に段階分けは可能）。案B
  `PhotoUploadSection.tsx` にプレビューごとの stage セレクタを追加し、アップロードAPIも `stages[]`（ファイルと
  1:1対応の配列）を受け付けるよう拡張する（UIとAPI両方の変更が必要、対応工数中程度）。
- 影響範囲: 案Aのままでも「作業中の写真を撮る」導線自体は機能する（今回実装した範囲は動く）。ただし同じ
  アップロード操作で複数段階の写真をまとめて追加したい場合にタグ付けの精度が落ちる。
- 次のアクション: 案Bへ拡張する必要があるか、実際の利用状況（作業中導線がどれくらい使われるか）を見てから
  判断する（堀越）。
- 起票日: 2026-07-22

## 店舗別月内集計の全スキャン上限（RPC 化のタイミング）
- 状況: `/api/admin/platform/store-usage` は月内行(tenant_id のみ)を 1 テーブル最大 20000 件
  取得し JS 集計する。超過時は truncated=true で UI 警告するが、集計値は過小になる。
- 選択肢: (a) 現状維持（テナント数が少ない今は十分）/ (b) per-tenant 集計の SQL RPC
  （staff_performance_stats と同様）に置き換え、上限を撤廃する。
- 影響範囲: テナント/活動量が増えて月内行が 20000 を超えると、警告は出るが数字がずれる。
- 次のアクション: truncated 警告が実際に出るようになったら (b) を実装。
- 起票日: 2026-07-16

## freee連携で複数税率を単一税区分（既定10%）で計上している（2026-07-24 バグ監査）
- 状況: `accounting/freee/client.ts` が breakdown 全行に `tax_code=既定(10%課税売上)` を付与しており、8%軽減税率の行も10%の税区分で計上される（vat額自体は明示で渡すが税区分の分類が誤る）。コメント上は固定マッピングのMVP割り切りとして明記されている。
- 選択肢: 案A 行の税率(8/10)に応じて freee の税区分コードを出し分ける（軽減税率マスタの対応表が必要）。案B 現状維持（軽減税率取引が無い加盟店には無害）。
- 影響範囲: 軽減税率対象（部品に紛れる飲食・一部消耗品等は稀）を扱う加盟店で会計区分が崩れる。頻度は業種的に低い見込み。
- 次のアクション: 軽減税率取引の実発生有無を確認し、あるなら税区分マッピングを実装。
- 起票日: 2026-07-24

## polygon-signer cron の秘密鍵形式エラー（コード側は対処済み・残りは env 値の確認）
- 状況: `cron_failure_streaks` で `polygon-signer` が 510回超 連続失敗。エラーは
  "invalid private key, expected hex or 32 bytes, got string"。原因は `POLYGON_PRIVATE_KEY` が viem の
  `privateKeyToAccount` が要求する `0x`+64桁hex でないこと（0x 無し/空白/桁違い等）。GCal 調査中に発見。
- **コード側の対処済み（2026-07-22 PR）**: 共有関数 `getPolygonAccount` に `normalizePolygonPrivateKey`
  （0x 補完・空白除去・小文字化・検証）を通す実装を追加。monitor cron は鍵が正規化できない場合 error ではなく
  **skip** を返し failure streak を伸ばさない。→「0x 無しで貼っていた」なら本修正で monitor/anchor とも復旧。
- 残（ユーザー対応が要る場合）: 鍵の**値自体**が誤り/プレースホルダ/未設定なら、正しい `POLYGON_PRIVATE_KEY`
  （0x+64hex）を Vercel env に設定する必要がある（鍵の値は開発側からは参照・設定できない）。
  アンカリング（on-chain 証跡）を使わないなら `POLYGON_ANCHOR_ENABLED` を外して monitor ごと止めるのも可。
- 次のアクション: デプロイ後に polygon-signer が skip か healthy かを確認。healthy になれば復旧完了。
  skip のままなら鍵の値を正しく設定 or アンカリング自体の要否を判断。
- 起票日: 2026-07-22（同日中にコード対処を追記）

---

# 技術的負債（実装すれば片付く）（9件）

## モバイルの走行距離必須化が実機で動くか（2026-08-25）
- 状況: 走行距離まわりの2件（人が入力しない作成経路・編集API と既存45件の遡及）は
  2026-08-26 に決着し DECISION_LOG へ移した（発行時ゲート1箇所に集約／一括バックフィルはしない）。
  残っているのは**モバイルの実機未確認**のみ。型検査・単体テストはローカルと CI の両方で緑だが、
  実際に画面が出て保存できるかは確認していない。
- 影響範囲: 次回モバイルリリース前に潰す必要がある。走行距離欄が出ない／保存できないと、
  モバイルからの発行が発行時ゲートで止まる（400）。
- 次のアクション: モバイルの次回ビルド時に実機確認する。
- 起票日: 2026-08-25（2026-08-26 に範囲を縮小）

## VIN を編集したとき、正規化キーを参照している行をどう追随させるか（2026-08-23）
- 状況: `vehicles.vin_code_normalized` を自動導出するトリガーを入れた（RELEASE_LOG 2026-08-23）。
  これで VIN の編集が正規化キーに正しく反映されるようになったが、そのキーを結合キーとして使っている
  `vehicle_report_orders`（購入済みレポートの閲覧権）と `vehicle_passports`（Polygon アンカリング済み）は
  旧キーのまま取り残される。VIN の打ち間違いを直すと、購入者が支払い済みのレポートを見られなくなり、
  アンカリング済みパスポートが孤児になって `upsertVehiclePassport()` が新キーで作り直す（＝再アンカリング）。
  トリガーを入れない場合はもっと悪く、車両が「持っていない VIN」で引けたままになる。今回はキーを正しく保つ方を採った。
  **現時点でレポート購入実績は0件、パスポート対象車両も1台なので実害は出ていない。**
- 選択肢:
  - 案A: VIN 編集時に `vehicle_report_orders` / `vehicle_passports` の該当行も新キーへ移す（DBトリガーまたはアプリ層）。
    長所: 利用者から見て一貫する。短所: アンカリング済みパスポートのキー変更はオンチェーンの記録と食い違う可能性があり、
    「アンカリング済みのものは書き換えない」という原則に触れる。
  - 案B: VIN の編集自体を制限する（証明書やパスポートが紐づいた後は変更不可、変更したい場合は運営に依頼）。
    長所: 改ざん検知を掲げるプロダクトとして筋が通る。短所: 入力ミスの訂正が重くなり、VIN 入力率を上げたい方針と衝突する。
  - 案C: 現状のまま（旧キーの行は残る）。長所: 何もしない。短所: 購入者が支払い済みレポートを失う。
- 影響範囲: レポート販売と信用回復ローンのPhase 0/1 が動き出すと、購入済みレポートが見られなくなる事故に直結する。
  レポートの実売が始まる前に決めておきたい。
- 次のアクション: レポートの実売が始まる前に案A〜Cを比較する。アンカリング済みパスポートの扱いは
  `docs/anchoring-roadmap.md` の原則と突き合わせて判断する。
- 起票日: 2026-08-23

## 決済系の冪等キー付与（残り）とモバイル/Web advance の共通化（2026-07-24 / 2026-08-24 更新）
- **2026-08-24 に一部解決**: Stripe Terminal の記録（Tap to Pay）は
  `@/lib/pos/terminalCapture` に共通化し、同じ PaymentIntent の再送で2件目を作らない
  ようにした。`payments.stripe_payment_intent_id` に部分一意インデックスも張った（本番適用済み）。
  Web の管理画面とモバイルは同じ関数を通る。
- **2026-08-25 に Checkout も解決**: 売上の記録を `@/lib/pos/recordSale` の1関数に
  集約し、タッチ決済・カード番号入力（Checkout）・Web の QR 決済がすべてそこを通る。
  冪等キー（PaymentIntent）はクライアントから受け取らず、Checkout Session を
  サーバが Stripe から取り直して引く。
- 残っているもの: advance（前受金）の冪等キー付与と、モバイル/Web の advance 処理の共通化。
- 次のアクション: advance の共通化のリファクタ規模を見積もってから判断
- 起票日: 2026-07-24（2026-08-25 更新）

## 予約の二重登録（TOCTOU）をDBレベルで防ぐか（2026-07-24 バグ監査）
- 状況: 一般客予約（`customer/booking`・`external/booking`）は容量/重複チェックの後にロック無しで reservations を INSERT する。取引先ホールドの `claim_reservation_hold` は `pg_advisory_xact_lock` で守られているが、一般予約INSERTパスはロックも排他制約も無い。ほぼ同時の2POSTが両方 count=0 を読み、同一枠に二重登録し得る。reservations に時間重複を防ぐ EXCLUDE/UNIQUE 制約は存在しない（マイグレーション全走査で確認）。
- 選択肢: 案A `reservations` に `tstzrange`/時間帯の EXCLUDE 制約（GiST）を追加し、DB側で重複INSERTを弾く。案B 予約INSERT前に日付+テナント単位の advisory lock を取る（ホールドと同じ方式）。案C 現状維持（発生は同時POST時のみ・店側で気づけるとして許容）。
- 影響範囲: 案A/BともコアのINSERTパスに触れるため、既存の容量/終日/カテゴリ判定との整合を崩さないか要検証。案Cのままだと繁忙時間帯に同一枠の二重予約が現場で発生し得る。
- 次のアクション: EXCLUDE制約（案A）を第一候補に、既存予約データで制約違反が起きないかを検証してから小さく導入するか代表判断。
- 起票日: 2026-07-24

## PageBar の `actions` 初回スナップショット固定は他ページでも潜在バグになりうる
- 状況: PageHeader→`usePublishPageBar` は `actions`（ページ上部バーの操作ボタン群）を初回 publish 時の
  スナップショットとして保持し、`sig`（title/description/activeTab/tabs/有無）が変わらない限り再 publish しない
  （無限ループ防止の意図的設計）。このため頻繁に state を変える画面では、バー上のボタンの `onClick` が
  ロード直後のクロージャに固定され「操作は効くが実行時は古い state」になる。booking-settings の保存不具合が
  この実例で、ローカルに ref 修正で対処済み（DECISION_LOG 2026-07-21）。
- 選択肢:
  (a) 各ページ側で必要な state を ref 経由にする（現状の対処）― 差分最小・低リスクだが、同種バグを個別に踏むまで気づけない。
  (b) PageBar を根治：publish 時に ReactNode ではなく「最新を返す ref/レンダー関数」を渡し、AdminPageBar が
      描画時に最新 actions を解決する ― 全ページ一括で解消。ただし publish 契約の変更でアンマウント時の
      `publish(null)` 掃除や既存呼び出しへの影響検証が要る。
- 影響範囲: バー上の操作ボタンで「実行時に最新 state を読む」前提のものは、同じ固定クロージャ罠にはまりうる
  （保存・送信など不可逆操作だとデータ齟齬）。現時点で確認済みの実害は booking-settings のみ。
- 次のアクション: バー actions を持つ画面を棚卸しし、頻繁に state 変化するものが他にあるか確認 → あれば (b) の
  根治を検討。無ければ (a) 個別対処を継続。
- 起票日: 2026-07-21

## npm audit 対応の minimatch@10 override をいつ外すか（2026-07-27）
- 状況: `brace-expansion` の advisory は 5.0.8 のみ非脆弱で、旧 minimatch@3（eslint/config-array 等が依存）は 5.x で壊れる。暫定策として `minimatch=^10.2.5` を override で全体固定して両立させ CI を緑化した（DECISION_LOG 2026-07-27）。これは対症療法寄り。
- 選択肢: 案A ツールチェーン（eslint/glob 等）が minimatch@10 系へ自然移行したら override を削除。案B 現状維持（override を明示コメント付きで残す）。
- 影響範囲: 放置しても実害は小さいが、将来の依存更新で override が競合・陳腐化する恐れ。外し忘れると不要な固定が残る。
- 次のアクション: 依存更新のタイミングで `overrides` から minimatch/brace-expansion を外して `npm audit` と `eslint`・`vitest` を再走行し、通れば削除。
- 起票日: 2026-07-27

## マイグレーションの「記録済みなのに未適用」ドリフトの根本原因と再発防止（2026-07-31）
- 状況: 2026-06-01 に repo↔本番の履歴を完全整合させた後に追加された `20260715000000`〜`20260715000003` の4本が、また「`schema_migrations` に記録済みなのに DDL 未反映」というドリフトを起こしていた（帳票管理エラー・入金済更新不可の原因、2026-07-31 に冪等修復マイグレーションで復旧済み）。なぜ記録だけ残り中身が適用されないのかが不明で、7/15 以外にも潜在ドリフトがある可能性が残る。
- 選択肢: 案A デプロイ手順（`supabase db push`／CI）を調べ、DDL 失敗時に version だけ記録されうる経路や `migration repair` の誤用が無いか特定して手順を是正。案B 全 version について「作成オブジェクトが本番に実在するか」を突合する検証スクリプトを CI 化し、ドリフトを継続検知（6月の手動照合の自動化）。案C 主要テーブル/列/制約/関数の存在を叩くヘルスチェックを定期実行し、欠落を即アラート。
- 影響範囲: 放置すると「コードは正しいのに本番だけ機能が動かない」障害が今後も突発的に起き、原因調査に毎回ログ探索が必要。金銭系（入金・請求）に当たると業務停止に直結する。
- 次のアクション: (1) 7/15 以外の直近マイグレーションも実在突合して潜在ドリフトの有無を確認。(2) デプロイ経路を特定し記録タイミングと DDL 実行の順序を是正。(3) 検証を CI 化するか判断（案B）。
- 起票日: 2026-07-31

---

# 環境設定・権限（コード外の作業）（3件）

## メールリンク/サインアップ確認/SSO のログイン成立に必要な Supabase・ドメイン設定（コード外）
- 状況: 2026-08-02 実査。magic-link は auth.flow_state に「code 発行済み・未交換」が複数残り交換が systemic に
  失敗。SSO は auth.sso_providers / sso_domains / saml_providers が 0 件で「会社の SSO でログイン」は常に 404。
  コード側は PKCE コールバックを同一オリジンへ戻す修正を実施済みだが、以下は設定側で未確認・未変更。
- 要確認/要対応:
  (1) 本番 Vercel の環境変数 `APP_URL` / `NEXT_PUBLIC_APP_URL` の実値（正規ドメイン app.ledra.co.jp か、
      vercel URL か）。ユーザーが実際にアクセスするオリジンと一致しているか。
  (2) Supabase Auth → URL Configuration の Site URL と Redirect URLs（許可リスト）に、実アクセスする
      オリジン（ledra-...vercel.app と、使うなら app.ledra.co.jp）＋ `/auth/callback` が登録されているか。
      未登録だと Supabase がリンクを Site URL に差し替え、交換に到達しない。
  (3) 正規ドメイン app.ledra.co.jp が実際に接続・配信されているか（未接続なら vercel URL に統一する）。
  (4) SSO を提供するなら、対象 IdP(SAML/OIDC)を Supabase に登録（Pro プラン要）。登録が無い限り SSO ボタンは
      機能しない（現状は仕様上「未設定」）。
- 影響範囲: (1)〜(3)未整備だと magic-link/サインアップ確認/パスワード復旧の一部が成立せず、パスワードレス
  アカウントが孤児化しうる。(4)未整備だと SSO 導線は常にエラー。
- 次のアクション: ユーザー（Supabase/Vercel ダッシュボード権限保有）が (1)(2)(3) を確認・是正。SSO 提供有無を
  決めて (4)。コード修正の効果は「実アクセスするオリジンが許可リストに含まれる」ことが前提。
- 起票日: 2026-08-02

## db-migrate 失敗通知の「通知経路そのものが生きているか」の確認方法（2026-08-15）
- 状況: 「db-migrate が赤くなったことに気づく仕組みが無い」件は解決した——`db-migrate.yml` に
  `if: failure()` の Slack 通知ステップを追加した（既存 `SLACK_WEBHOOK_URL` を流用、DECISION_LOG 2026-08-15）。
  ただしこの経路は**失敗時にしか実行されない**ため、通常運用では一度も動かない。
  「必要なときに壊れている」という、今回直したもの（記録はあるのに実体が無い）と同じ構造のリスクが残る。
  実装時にワークフローYAMLから `run` ブロックを取り出し curl をスタブ化して両経路
  （正常系・シークレット未設定）を実行検証したが、本物の Slack への疎通は未確認。
- 選択肢: 案A 一度だけ意図的に失敗させて実地確認する（例: 壊れたマイグレーションをブランチで
  workflow_dispatch）。長所: 確実。短所: 本番DBへ向くジョブなので、失敗のさせ方を誤ると危険。
  ／案B `SLACK_WEBHOOK_URL` の疎通だけを確認する軽い workflow_dispatch を別に用意する。
  長所: 本番DBに触れずに確認できる。短所: ワークフローが1本増える。
  ／案C 何もしない（次に本当に失敗したときに分かる）。
- 影響範囲: 通知が壊れていた場合、次の db-migrate 失敗もまた気づかれない。今回13日放置された
  のと同じことが起きる。
- 次のアクション: 案B が安全そう。ただし「確認用ワークフローを足す」こと自体が増築なので、
  まずは案C で様子を見て、次に失敗が起きたときに通知が届いたかを見る判断もある。代表と相談。
- 起票日: 2026-08-15

## db-migrate 以外の重要ワークフローの失敗可視性（2026-08-15）
- 状況: 今回通知を足したのは `db-migrate` のみ。他の重要ワークフロー（Vercel デプロイ、
  `supabase-advisors`、`db-typegen` 等）が赤くなった場合の可視性は手つかず。
  db-migrate を選んだのは、止まると以降のスキーマ変更が全部本番へ届かず影響がプロダクト全体に
  及ぶため。他は影響が局所的だが、放置されやすさは同じ。
- 選択肢: 案A 同じ通知ステップを重要ワークフローへ個別にコピーする（明示的だが重複する）／
  案B `workflow_run` をトリガーにした共通の失敗通知ワークフローを1本作り、対象を列挙する
  （重複しないが間接的で、対象の登録漏れに気づきにくい）／案C 現状維持。
- 影響範囲: 誤ると「気づかないまま壊れている」状態が他の領域でも起きる。緊急度は中。
- 次のアクション: db-migrate の通知が実際に機能することを確認してから、案B の共通化を検討する。
- 起票日: 2026-08-15


## PDF 同梱フォント（Noto Sans JP サブセット）に ※ ○ が無く、帳票上で文字化けする（2026-08-27）
- 状況: 帳票の基本テンプレート（`DEFAULT_LAYOUT`）を本番レンダラー `src/lib/pdfDocument.tsx` で
  実際に PDF 出力して目視確認したところ、インボイス注記「※ この書類は適格請求書等保存方式…」の
  先頭 `※` が別の記号として描画された。`public/fonts/NotoSansJP-{400,700}.ttf`（各 6,886 グリフの
  サブセット）の cmap を fontTools で確認したところ、`※`(U+203B) と `○`(U+25CB) が欠落している
  （他に △ ▲ ● ◯ □ ■ ☑ ✓ → ← № ♪ ① ② も欠落。`×`(U+00D7) は収録あり）。
- 影響範囲: 同じフォントを使う全 PDF。確認できた `※` の使用箇所は
  `src/lib/pdfDocument.tsx`（軽減税率マーカー / 軽減税率の注記 / インボイス注記の3箇所）、
  `src/lib/pdfInvoice.tsx`（同3箇所）、`src/lib/marketing/resourcePdf.tsx`（注記多数）。
  軽減税率対象品目を含む請求書を実際に出力して確認済み（2026-08-27 追記）。化け方は2通りで、
  行内マーカー `※軽減` は `※` が消えて「サンプル飲料（軽減税率対象） 軽減」と出る（記号が
  落ちるだけなので気づきにくい）、凡例は `;は軽減税率 (8%) 対象品目` と別記号に置き換わる。
  顧客へ渡る帳票なので、金額は正しくても「作りが雑」に見えるリスクがある。
  再現: `npx tsx scripts/render-template-preview.ts invoice --reduced`
- 選択肢: 案A サブセットを作り直して不足記号を追加する（元の生成手順がリポジトリに無いため、
  生成スクリプトごと用意する必要がある。ファイルサイズは増える）／
  案B `※` を font に有る文字（例: `*` や `注`）へ置換する（フォントは触らないが、
  日本語の帳票表現としては後退する）／案C 現状維持。
- 次のアクション: 案A が本筋。ただしサブセット生成手順が不明なため、まず現行 TTF の出所を
  確認する必要がある（【要確認】: `public/fonts/*.ttf` をどう生成したか）。
- 起票日: 2026-08-27

## Certificate Gate (IMP-028) 本番配線後も残る3条件の未接続（2026-08-31）
- 状況: `evaluateCertificateActivationGate()` を証明書 active化の本番4経路（admin/certificates/status・
  mobile/certificates/[id]/activate・certificates/activate-by-key・AI自動発行`certificateRecordAuto.ts`）
  すべてに統合した（IMP-028）。10条件のうち実データで判定するのは required_evidence_present（写真）・
  no_unresolved_alerts（懸念）・parts_integrity（部品整合性）の3条件。残り7条件のうち3つは、配線しない
  理由が調査で判明した:
  - **workflow_completed**: `reservations.status`/`work_completed_at` から機械的には出せるが、現場が
    実際にこの完了報告を確実に行ってから証明書を発行しているか（逆に「証明書発行」自体を完了の代わりに
    している運用がないか）を確認できていない。誤って配線すると本番の発行を広く止めかねない。
  - **customer_confirmation_current**: `src/lib/signoff/state.ts` の `canRequestSignature` は証明書が
    `active` であることを条件に署名依頼可能になる設計。ここに「署名済み」を要求すると、発行→署名→発行
    が要求される循環になり証明書を永久に発行できなくなる。署名フロー自体の設計変更（例: 署名依頼を
    active化前に前倒しする）が前提になるため、単独では解けない。
  - **payment_policy_met**: 評価ロジック自体（`evaluatePaymentPolicy()`）は実装済みだが、合算払いの
    CANCELED 扱いや paymentState の導出元が未決（本ファイル「evaluateB2B の合算払い×CANCELED不整合」
    エントリ参照）のため、証明書発行経路への実データ配線を見送っている。
  - 残る in_store_review / evidence_synced / approvals_complete / no_pending_corrections は機能自体が
    未設計（no_pending_corrections は対応する DB テーブルすら存在しない）。
- 影響: v2.0 §19.4 が定める「10条件すべてを満たしたときのみ READY」は現状 3/10 条件のみ実効。
  ADR-0005 は「バックエンド共通 Gate が唯一の判定源」であることを求めており、単一評価器への集約
  自体は満たしているが、条件の網羅性はまだ途上。
- 次のアクション: workflow_completed は現場の完了報告運用の実態確認が先（【要確認】）。
  customer_confirmation_current は signoff フローの設計変更を伴うため、対応方針を代表判断が必要
  （署名依頼のタイミングを見直すか、この条件をGateから外すか）。
- 起票日: 2026-08-31
