# MISTAKE_LEDGER.md — やらかしと、その後どうしたか

> **目的**: 同じ種類のミスを二度やらないため、そして次に別のことでやらかしたときに
> 「これは前のどれと同じ形か」を即座に引けるようにするための台帳。
>
> **書き方**: 1件につき Before（何を信じて、何をしたか）と After（実際はどうで、
> 何を変えたか）を必ず対にする。**再発を止める仕組み**を書けないものは、まだ直って
> いない。仕組みが無いなら「仕組み無し（判断に依存）」と正直に書く。
>
> **いつ書くか**: レビュー・テスト・本番のどこかで自分の誤りが判明した時点。
> 作業完了前に書く。直したことより「なぜ気づけなかったか」を書く。
>
> 新しい記録は先頭に追記（新しい順）。

---

## ID について（2026-09-15 変更）

**ID は `M-<日付>-<スラッグ>` 形式。** 連番はやめた。

連番は並行セッションが同じ番号を取り合って衝突し続けた。改番で直そうとして
**4回とも失敗**している（改番が次の衝突を生む／一括置換が経過の表と他人の参照を壊す）。
経緯は `OPEN_QUESTIONS.md` に残してある。日付とスラッグなら、同じ日に同じ表現を
選ばない限り衝突しない。衝突しても中身が違うので、マージ時に必ず気づく。

**旧番号は各見出しの末尾に `旧 M-NNN` として残してある。** 既存の参照
（DECISION_LOG / RELEASE_LOG / OPEN_QUESTIONS / コード内コメントなど）は
書き換えていないので、`M-060` で grep すればこれまでどおり当たる。
移行時に 104 件を変換した（うち2件は移行作業中に `main` 側で追加されたもので、
マージのときに同じ形に揃えた —— **連番で書かれたエントリが並行して増え続けるのが
この問題の実物**である）。
下の「型」の表も旧番号のままである（**2026-09-15 以降の新規エントリだけ新 ID で載る**）。

### 旧番号が重複していた10組

この10番号は**2つのエントリが同じ番号を持っていた**ため、旧番号で引くと両方に当たる。
新 ID で区別すること。

| 旧番号 | 日付 | 新 ID | 表題 |
|---|---|---|---|
| `M-060` | 2026-09-07 | `M-20260907-no-negative-control` | 自作の検査に陽性対照だけ置き、陰性対照を置かなかった |
| `M-060` | 2026-09-08 | `M-20260908-null-made-guard-fail-open` | セキュリティガード `A and B` の A を NULL 混入に気づかず書き、fail-open を作った |
| `M-061` | 2026-09-06 | `M-20260906-zero-refs-read-as-unused` | 「アプリから参照ゼロ」を「使われていない」と読み、その分類を PR にして出した |
| `M-061` | 2026-09-08 | `M-20260908-x-forwarded-for-unverified` | Cloudflare の `x-forwarded-for` の扱いを検証せず「上書きされるはず」で優先順位を書いた |
| `M-062` | 2026-09-06 | `M-20260906-prototype-numbers-reported` | 試作の検出器の数字を、検証せずに確定として報告しマージした |
| `M-062` | 2026-09-08 | `M-20260908-tested-only-touched-dir` | セキュリティ修正の直後、変更に直接関係するディレクトリだけ test を回して次に進んだ |
| `M-063` | 2026-09-06 | `M-20260906-stripped-security-invoker` | 定義を「書き写す」つもりで、ビューの security_invoker を剥がしていた |
| `M-063` | 2026-09-08 | `M-20260908-mixed-axes-in-fix` | 「存在しない値との比較」を直したら、直した先で別軸を混同した |
| `M-064` | 2026-09-07 | `M-20260907-sufficient-condition-false` | ガードの根拠として書いた「十分条件」が、そもそも成り立っていなかった |
| `M-064` | 2026-09-08 | `M-20260908-bulk-replace-without-context` | 複数ファイルへの機械的な文字列置換を、ファイルごとの周辺文脈を見ずに実行した |
| `M-065` | 2026-09-06 | `M-20260906-notify-never-delivered` | 「失敗を知らせる」通知が、シェルの引用ミスで一度も飛んでいなかった |
| `M-065` | 2026-09-08 | `M-20260908-scan-script-two-errors` | F-4（未接続モジュール調査）で、自作の走査スクリプトを2種類の誤りに気づかず信用しかけた |
| `M-081` | 2026-09-09 | `M-20260909-fixed-red-without-checking-others` | リポジトリ全体を止めている赤を、「誰かが既に直していないか」を見ずに直した |
| `M-081` | 2026-09-13 | `M-20260913-ineffective-css-claimed-fixed` | 効かない CSS を「直した」と書いた |
| `M-082` | 2026-09-11 | `M-20260911-merged-20s-after-review` | レビューが届いた20秒後にマージし、その中の実害ある指摘を読まなかった |
| `M-082` | 2026-09-13 | `M-20260913-regex-missed-two-digit-cols` | 検出器の正規表現が2桁の列数に当たらず、国勢調査が不完全だった |
| `M-083` | 2026-09-11 | `M-20260911-payment-failure-single-message` | 決済失敗通知を1種類の文言にして、二重請求リスクを埋め込んだ |
| `M-083` | 2026-09-13 | `M-20260913-counted-two-populations` | 直した数を、2つの違う範囲で数えて混ぜた |
| `M-084` | 2026-09-11 | `M-20260911-dts-as-behavior-evidence` | .d.ts の型定義を、SDKの実際の挙動の証拠として扱った |
| `M-084` | 2026-09-13 | `M-20260913-ci-test-timeout` | 手元で 2.5 秒だったテストが、CI で 5 秒のタイムアウトに掛かった |

**新しいエントリを書くときは番号を採らない。** `M-<YYYYMMDD>-<英小文字とハイフンのスラッグ>`
を付ける。重複は `npm run check:ledger-ids` が落とす。

---

## 分類: この台帳で繰り返し出てくる失敗の「型」

個別のミスより、型を覚えた方が速い。新しいミスはまずここに当てはまるか見る。

| 型 | 中身 | 該当 |
|---|---|---|
| **A. 道具を検証しない** | 変更したコードは検証したのに、「何を変えるべきか判断するために使った道具」（検出器・正規表現・スクリプト・クエリ）を検証していない。道具の出力を事実として扱う。**そのクエリが何を確定させたのかを確かめずに、確定したつもりになる**のもこの型。**自分の想定だけで検証するのも同じ**（当たりを取る「既知の1件」を自分で作る）。**動作を主張するコメントを、その根拠（スキーマ・型定義）を確認せずに書く**のも同じ。**検査の「該当なし」を、その検査が何件を見たか数えずに受け取る**のも同じ | M-001, M-002, M-003, M-006, **M-010**, M-012, M-016, M-017, **M-022**, **M-024**, **M-031**, M-036, **M-041**, **M-044**, **M-046**, **M-050**, **M-055**, **M-056**, **M-057**, **M-060**, **M-061**, **M-062**, **M-064**, **M-065**, **M-068**, **M-075**, **M-078**, **M-079**, **M-084**, **M-085**, **M-089**, **M-092**, **M-093**, **M-20260915-dupe-count-from-truncated-grep**, **M-20260918-silent-skip-made-detector-never-run**, **M-20260918-replay-db-lacked-prod-column**, **M-20260918-read-detector-blindness-as-stale-list**, **M-20260919-attributed-an-overloads-call-to-its-sibling**, **M-20260919-swept-for-the-literal-not-the-bug-class**, **M-20260919-cancel-2xx-treated-as-final**, **M-20260921-compared-counts-where-names-differed**, **M-20260921-detector-covered-half-the-tables-i-had-listed**, **M-20260921-said-the-drift-checker-ignores-policies**, **M-20260922-wrote-constraint-bodies-from-their-names**, **M-20260922-enumerated-actions-from-typescript-only**, **M-20260921-restated-my-own-summary-as-fact**, **M-20260923-committed-conflict-markers-from-truncated-merge-output**, **M-20260923-counted-only-page-files-for-tenant-bug**, **M-20260925-grep-missed-the-generic-upsert-helper**, **M-20260927-read-a-failed-rebuild-as-a-measurement**, **M-20260927-checks-were-green-on-rows-production-would-reject**, **M-20260927-said-evaluated-all-while-filtering-the-population**, **M-20260927-grep-filter-hid-vitest-errors-line**, **M-20260929-build-oom-cause-guessed-three-times**, **M-20261001-grep-filtered-vitest-summary-again**, **M-20261002-asserted-conformance-impact-from-our-own-gpsa**, **M-20260929-assumed-ingredient-needs-original-bytes**, **M-20260929-swapped-fetch-broke-formdata-uploads**, **M-20260927-c2pa-ledger-tested-only-on-exif-free-images**, **M-20260927-read-c2pa-valid-as-conformant**, **M-20260929-never-tested-the-gps-leak-premise**, **M-20261002-relayed-the-notes-framing-as-the-fix**, **M-20261005-log-edit-replaced-heading-prefix-and-dropped-it**, **M-20261005-test-tsa-echoed-my-own-content-type-assumption**, **M-20261005-declared-auth-root-cause-without-retest**, **M-20261005-said-loader-table-unreadable-after-granting-select**, **M-20261005-statement-splitter-split-inside-comments**, **M-20261005-hoisted-a-try-scoped-name-and-trusted-eslint-zero-errors**, **M-20261005-truncated-grep-hid-the-mobile-pdf-caller**, **M-20261005-took-sharps-limit-as-the-limit-of-what-i-could-verify**, **M-20261007-committed-ours-theirs-conflict-markers**, **M-20261008-wrote-subagent-feature-claims-unchecked** |
| **B. 読まずに分類する** | コードの形（関数名・構造・コメント）から中身を推測して分類し、実際に読んでいない。**1段だけ深く読んで止まる**のも同じ（条件式は読んだが、その値の既定を追っていない）。**その値がどこから来るかを見ない**のも同じ（既定・サンプル・過去の配布物に同じ値が無いか）。**列や機能が「ある」ことを「使われている」と読む**のもこの型。**値の出所を変えたのに、その値を使う式が旧い出所の前提（排他性等）を暗黙に置いたままか確認しない**のも同じ。**部品が直ったことを、その部品を使う機能が直ったことと読む**のも同じ | M-004, M-020, **M-032**, M-035, M-036, **M-039**, **M-040**, **M-048**, **M-052**, **M-063**, **M-074**, **M-083**, **M-088**, **M-20260920-hashed-a-file-i-never-opened**, **M-20260920-asked-for-a-decision-that-was-already-made-in-the-file-i-cited**, **M-20260921-classified-rls-impact-from-one-policy**, **M-20260922-copied-a-check-without-checking-the-default**, **M-20260924-blamed-all-ten-inserts-on-the-check**, **M-20260924-called-a-tolerant-job-the-real-check**, **M-20260927-anon-customer-names-read-as-by-design**, **M-20260930-diagnosable-fix-left-without-anyone-watching**, **M-20260929-assumed-ingredient-needs-original-bytes**, **M-20260929-left-crjson-time-fallback-unread**, **M-20261002-delete-ignored-legal-retention**, **M-20261002-relayed-the-notes-framing-as-the-fix**, **M-20261006-grant-ui-removed-opt-out-the-comment-said-to-keep** |
| **C. 経路を1本しか見ない** | 同じ操作に複数の入口があるのに、目についた1本だけ直す。**同じ事実を2箇所に書いて片方だけ直す**のも同じ（文書に出た形）。**排他にすべき組み合わせのうち一部のペアだけをチェックする**のも同じ | M-005, M-007, M-013, M-019, **M-023**, **M-025**, M-038, **M-058**, **M-061**, **M-072**, **M-076**, **M-087**, **M-20260918-verification-skippable-via-transition-flag**, **M-20260919-exclusivity-guard-only-in-admin-route**, **M-20260919-exclusivity-checked-one-pair-not-all**, **M-20260920-called-it-all-no-op-while-fixing-the-one-statement-that-runs**, **M-20260922-enumerated-actions-from-typescript-only**, **M-20260922-renamed-a-migration-the-preview-db-had-applied**, **M-20260923-new-key-axis-not-traced-to-every-entry-point**, **M-20261001-cited-sources-i-never-opened-in-decision-log**, **M-20261001-reported-applied-migrations-as-not-applied**, **M-20260929-swapped-fetch-broke-formdata-uploads**, **M-20260929-checked-exif-gps-but-not-manifest-gps**, **M-20260929-closed-vercel-app-bypass-for-uploads-only**, **M-20261002-tls-check-covered-www-but-app-host-is-app-ledra**, **M-20261002-gpsa-o5-traced-upload-path-only**, **M-20261002-tls13-guard-scanned-providers-dir-only**, **M-20261002-added-holy-inc-category-without-ledra-cms-list**, **M-20261002-checked-one-side-effect-and-called-it-no-orphans**, **M-20261003-fixed-the-pr-body-and-left-the-business-logs-wrong**, **M-20261005-truncated-grep-hid-the-mobile-pdf-caller**, **M-20261006-breakdown-ids-wiped-by-draft-edit**, **M-20261006-widened-delete-without-checking-cycle-invoice-links**, **M-20261007-service-role-read-trusted-client-consolidation-check**, **M-20261009-consolidated-invoice-left-sources-receivable** |
| **D. 移設で弱める** | 「同じものを別の場所に置くだけ」のつもりが、検査の強さや信号が落ちている。**移設先の信頼境界（誰の書き換えを受けるか・どんな権限を持つか）が変わっているのに気づかない**のもこの型。**移設でなく「追加」で弱めるのも同じ** —— 制約を1本足したら、同じ対象を別の観点で見ていた既存の検査が、その制約のせいで区別できなくなる | M-008, **M-028**, **M-029**, **M-042**, **M-047**, **M-054**, **M-060**, **M-062**, **M-063**, **M-065**, **M-20260924-shared-resolver-dropped-error-to-500**, **M-20260925-my-not-null-blinded-the-sibling-check**, **M-20261005-reused-oauth-state-signer-with-shared-fallback-key** |
| **J. 兄弟実装と揃えていない** | 同じ理由で複数箇所に同種のガード・分岐を書いたのに、片方にしか適用しなかった／既存の兄弟実装が既に持っていた条件を新しい実装に持ち込まなかった。**「同じパターンで書いた」つもりが実は違う**のがこの型の核。**「AをBに置き換える」判断をしたのに、A自体を全リポジトリでgrepせず一部だけ置き換えて終わる**のも同じ | M-066, **M-069**, **M-092**, **M-093**, **M-20260916-timeout-branch-missed-sibling-fix**, **M-20260919-cancel-checkout-scattered-across-4-handlers**, **M-20260919-handled-completed-branch-not-failed-branch**, **M-20260919-else-fix-not-swept-to-siblings**, **M-20260921-claimed-all-db-errors-swept-but-left-booking-upsert**, **M-20260923-fixed-url-length-in-one-route-not-its-sibling**, **M-20261001-new-loader-dropped-query-error-unlike-siblings**, **M-20261005-abs-chevron-reserved-space-in-one-row-only**, **M-20261005-rewrote-customer-resolver-that-already-existed**, **M-20261007-paid-scope-copied-the-window-not-the-opt-out** |
| **K. 新しいコード経路を、それが実際に呼ばれる文脈で動かして試していない** | 単体の変更としては正しいのに、それが実際に発火する呼び出し元・エラー経路まで通して動かしていない。ユニットテストがあっても「起こりうる呼び出し順」を再現していなければ検出できない | **M-067**, **M-20260923-draft-autosave-baseline-before-prefill**, **M-20261005-fail-closed-flag-read-blocked-non-opt-in-tenants**, **M-20261006-breakdown-ids-wiped-by-draft-edit** |
| **L. 既定を開いたまま守る（除外リスト）** | 「見せないもの」を並べて塞ぐ。塞いだ時点では実データと一致していても、**既定が公開**なので、値が増えるたびに漏れる。**母集団を数えていない**のが根（「今あるもの」を実測して、「入りうるもの」を数えていない）。外向けの経路では許可リストにして、知らないものを既定で落とす | **M-077** |
| **E. 手元とCIの差を忘れる** | 手元では通るのに CI だけ落ちる構成を作る。書いた本人には見えない。**リポジトリが用意した「CIと同じ検査」を走らせず、思い出せる検査だけ個別に走らせる**のも同じ | M-009, **M-030**, **M-084**, **M-089**, **M-094**, **M-20260922-pushed-without-ci-parallel-checks**, **M-20260923-schema-snapshot-missed-again**, **M-20260929-build-oom-cause-guessed-three-times**, **M-20260929-merged-main-without-migration-order-lint** |
| **F. 確認できる事実を確認しない** | 環境から1コマンドで確かめられる事実（今日の日付・件数・バージョン・設定ファイルの中身・**CI が実際に走ったか**・**同じ問題を直している PR が既に開いていないか**）を、確かめずに書く。**自分がこれから追記しようとしているログファイル自身に、既に矛盾する記述が無いか確認しない**のも同じ。**本番の実データをそのまま調査ログ・事業ログに転記する**のも同じ（PIIのマスクを確認事実として扱わない） | M-011, M-014, M-015, M-016, **M-018**, **M-021**, **M-026**, **M-027**, M-034, M-037, **M-045**, **M-049**, **M-053**, **M-059**, **M-070**, **M-071**, **M-073**, **M-080**, **M-081**, **M-082**, **M-086**, **M-088**, **M-090**, **M-20260915-dupe-count-from-truncated-grep**, **M-20260918-called-it-untraceable-without-checking-open-prs**, **M-20260919-said-no-open-pr-has-it-again**, **M-20260919-hand-applied-ahead-of-a-pending-migration**, **M-20260919-skipped-the-check-i-had-just-written**, **M-20260919-green-ci-read-as-production-applied**, **M-20260919-credited-my-own-dirty-tree-to-another-session**, **M-20260919-wrote-a-replay-count-i-never-read**, **M-20260920-hashed-a-file-i-never-opened**, **M-20260920-counted-12-as-11-again**, **M-20260921-reported-a-subtraction-as-a-measurement**, **M-20260921-two-samples-read-as-all**, **M-20260921-restated-my-own-summary-as-fact**, **M-20260922-said-typegen-red-on-every-merge**, **M-20260922-said-ten-checks-without-listing-them**, **M-20260923-git-add-all-swept-a-formatted-generated-file**, **M-20260925-migration-timestamp-collided-with-parallel-pr**, **M-20260927-anon-customer-names-read-as-by-design**, **M-20261001-cited-sources-i-never-opened-in-decision-log**, **M-20261001-wrote-not-observed-over-my-own-vercel-font-record**, **M-20261001-said-fix-reaches-production-before-deploy-checked**, **M-20261001-reported-applied-migrations-as-not-applied**, **M-20261002-asserted-conformance-impact-from-our-own-gpsa**, **M-20261002-said-no-mechanism-without-reading-the-workflow-that-exists**, **M-20261001-acted-on-dependabot-pr-without-checking-it-was-closed**, **M-20261001-duplicated-an-open-pr-for-four-days**, **M-20260929-logged-the-wrong-zip-as-sent**, **M-20261003-fixed-the-pr-body-and-left-the-business-logs-wrong**, **M-20261005-called-ci-green-from-check-runs-only**, **M-20261005-blamed-migrations-for-a-stale-clone**, **M-20261005-handed-user-cli-commands-i-never-ran**, **M-20261005-diagnosed-device-from-origin-not-users-checkout**, **M-20261005-took-sharps-limit-as-the-limit-of-what-i-could-verify**, **M-20261006-built-on-a-not-null-premise-from-my-own-log**, **M-20261007-read-elastic-build-machine-as-fixed-16gb**, **M-20261007-claimed-env-vars-apply-only-to-new-session**, **M-20261007-posted-rerun-done-before-result**, **M-20261008-claimed-terms-absent-without-grep** |
| **G. 構造テストを振る舞いの証明として扱う** | ソースを grep して「その語が書かれている」を確かめただけで、**値が通るか**を確かめていない。テストは緑、機能は壊れている。**ファイルに在ること**を、**その経路が実際に動く/覆われている**ことの証拠として扱うのも同じ | **M-033**, **M-20260921-file-content-read-as-behavior**, **M-20261002-closed-open-question-on-settings-screen-not-build-log**, **M-20261002-checked-one-side-effect-and-called-it-no-orphans** |
| **H. 未確定の前提の上に作る** | 依頼者しか決められない前提を確認しないまま、その前提が変われば丸ごと消える実装を先に作る | **M-043** |
| **I. 前提が途中で変わったのに読み直さない** | 判断したときは正しかった観察が、その後の `main` 取り込みなどで無効になっているのに、変更を見直さない。**衝突しなかったファイルにこそ潜む**。**自分が書いた実測値が、自分のマージで古くなる**のも同じ | **M-047**, **M-051**, **M-20260925-my-own-merge-staled-the-replay-count**, **M-20260929-merged-main-without-migration-order-lint** |

---

## M-20261009-consolidated-invoice-left-sources-receivable 合算請求書を作れるようにしたのに、元の請求書が売掛・督促に残り続けることを見なかった（2026-10-09・型 C）

**Before**: 合算請求書（一覧で複数の納品書・請求書を選んで1枚にまとめる）を作り、その後も内訳表示・削除・明細の組み直しを何度も直した（#1256・#1260 ほか）。
「合算請求書は元帳票をまとめ直しただけで、元帳票は証跡として残す」と考え、元の請求書には何も書き込まなかった。

**After**: 代表から「合算請求書と個別の請求書が二重で計上される」と報告された。元の請求書は送付済のまま残り、帳票一覧の未入金額・売掛元帳・
今日のタスク・督促 cron（期限超過化と督促メール）が、どれも `invoice` と `consolidated_invoice` の両方を数えていた。督促は顧客に届く。
合算請求書が生きている間は元の請求書をキャンセル扱いにし、取消・削除で戻すようにした。既存データもマイグレーションで揃えた（DECISION_LOG 2026-10-09）。

**なぜ気づけなかったか**: 合算請求書の改修は毎回「その帳票自体（明細・PDF・削除）」の中で閉じていて、**同じ金額を持つ帳票が2枚になったら、
金額を数える側はどうなるか**を一度も引かなかった。`consolidated_invoice` で grep すれば、集計・督促が `["invoice", "consolidated_invoice"]` で
両方を数えている箇所がすぐ出た。

**型 C の再発防止が効かなかった理由**: 型 C の習慣は「同じ**操作**の入口を数える」で、今回は操作ではなく**同じ金額が2つの行に載る**という
データの重複だった。入口ではなく**読む側（集計）**を数える必要があった。

**再発防止**: 今回の分はテストで止める（`consolidatedSupersede.test.ts`・`route.consolidated.test.ts`）。一般形は仕組み無し（判断に依存）。
- 習慣: 既存のデータを「まとめる・写す・置き換える」帳票を作るときは、元の行と新しい行の両方を読む集計・通知を grep し、
  どちらを数えるべきかを決めてから作る。

## M-20261008-wrote-subagent-feature-claims-unchecked 入口ページの機能説明を、調査役の報告からそのまま書き、コードで確かめなかった（2026-10-08・型 A）

**Before**: 業態別の入口ページ（#1276）を書くとき、業態ごとの機能を調査役（別のエージェント）に洗い出させ、その報告を元に本文を書いた。
報告に「NexPTG の取り込みは Pro のみ」「AI 見積は Standard 以上」「車検満了の約 60 日前に自動メール」「膜厚は車体図の上で入力」とあり、
自分で確かめたのは工程の名前・様式の名前・お知らせの既定日数の 3 点だけだった。

**After**: コードレビューで本文の誤りが 7 件見つかった。プランの条件は 2 つとも実装と違い（NexPTG には制限が無い／AI 見積は Starter から）、
車検のお知らせは 1 台 1 回で止まる、記録簿 PDF には指定番号・所在地が入らない、セラミックのひな形は無い、膜厚は表に入力する（車体図は表示だけ）、
PPF のパネルは 19（20 はフルボディを含む数）で、メモは部分施工のときだけ。公開前に直した。
直したあと「残りも根拠の行を開いて確かめた」と PR に書いたが、翌日 Codex のレビューでさらに 4 件見つかった。
ロット番号・膜厚・損傷マップは**保存されるが、証明書（PDF・公開ページ）にも管理画面にも表示されない**のに「証明書に残せます」と書いていた。
部品交換のお知らせは LINE 連携済みのお客様には LINE で送られ、メールは LINE が失敗したときだけなのに「メールでお知らせ」と書いていた。
同じ型の「施工後のフォローメール」は、指摘された 1 か所だけ直して残し、もう一度 Codex に指摘された（同じ送信の仕組みを使う機能をまとめて見直さなかった）。

**なぜ気づけなかったか**: 調査役の報告は行番号つきで具体的だったので、確かめた気になった。抜き取りで当たった 3 点が、残りも正しい根拠になると思った。
また「機能がある」と「その機能が宣伝文どおりに動く」（毎回届く・法定様式として足りる）を分けて考えていなかった。

**型 A の再発防止が効かなかった理由**: 型 A は「判断に使った道具を検証しない」。今回の道具は調査役の報告で、道具だと認識していなかった。
コードを読んだのは自分ではないのに、自分が読んだ扱いで本文の根拠にした。

**再発防止**: 仕組み無し（判断に依存）。外に出る文（HP・営業資料）に書く機能の主張は、1 つずつ自分で根拠の行を開いてから書く。
特にプラン・回数・法定様式のように「条件」を含む主張は、判定している関数（`canUseFeature` など）まで追う。調査役の報告は「どこを見ればよいか」の地図として使う。
「証明書に載る」「お客様に届く」と書くときは、入力欄や保存処理ではなく、**表示・送信する側のコード**（PDF の描画、公開ページ、送信の分岐）で確かめる。
入力欄があることは、その値がお客様に見えることの証拠にならない（2 回目の見落としはここだった）。

## M-20261008-claimed-terms-absent-without-grep 「本文にこの言葉が無い」と、言葉ごとに検索せずに PR と OPEN_QUESTIONS に書いた（2026-10-08・型 F）

**Before**: #1266（トップを 10 セクションに絞る）の本文と OPEN_QUESTIONS に、「メタ情報は『鈑金塗装』『請求・帳票』『顧客360』を挙げているが、
絞った後の本文にはこの言葉が無い」と書いた。代表はこれを判断材料として受け取り、未決のままマージした。

**After**: 続きの作業で本文（`page.tsx` と残した各セクション）を言葉ごとに grep すると、「鈑金」「帳票」は確かに無かったが、
「顧客 360」（空白入り）は「できること」の見出しにあり、「請求」もその説明文（予約・請求をひとまとめ）にあった。3語中1語半が誤りだった。
メタ情報を直す方針自体は変わらない（「鈑金塗装」「帳票」は本文に無い）ので、DECISION_LOG 2026-10-08 で訂正を添えて決めた。

**なぜ気づけなかったか**: 外したセクションの一覧（機能カタログ・業態別導線）から「その言葉は外した側にあったはず」と推して書き、
残した側を1語ずつ検索しなかった。表記の揺れ（「顧客360」と「顧客 360」）も考えていなかった。

**型 F の再発防止が効かなかった理由**: 型 F は「1コマンドで確かめられる事実を確かめずに書く」。今回は「無い」という否定の主張で、
推論の形（外したものにあったはず）がもっともらしく、確かめる対象だと感じなかった。

**再発防止**: 仕組み無し（判断に依存）。「◯◯が無い／使われていない」と書くときは、その語を1つずつ、表記揺れ（空白・全角半角）を含めて grep してから書く。
否定の主張は検索 1 回で確かめられるので、確かめずに書かない。

## M-20261007-posted-rerun-done-before-result PR に「再実行しました」と、再実行の結果を見る前に書いて投稿した（2026-10-07・型 F）

**Before**: #1267 の `lighthouse` が `NO_NAVSTART`（計測の記録の失敗）で落ちた。失敗ジョブの再実行と、PR へのコメントを同じターンで並べて呼び、
コメントに「失敗したジョブを1回だけ再実行しました」と書いた。

**After**: 再実行は `403 Resource not accessible by integration` で失敗していた。コメントは投稿済みだったので、すぐに編集して
「再実行はできていない。代表に Re-run を頼む」に直し、訂正した旨を残した。

**なぜ気づけなかったか**: 結果に依存する文（「再実行しました」）を、その操作と並列に投げた。操作が成功する前提で文面を先に書いていた。
権限が足りるかは、この環境で一度も試していなかった。

**型 F の再発防止が効かなかった理由**: 型 F は「確かめられる事実を確かめずに書く」。今回は確かめる手段（再実行の戻り値）があったのに、
それを待たずに外向けの文を出した。並列化で「確かめる → 書く」の順序が消えた。

**再発防止**: 仕組み無し（判断に依存）。外に出る文（PR コメント・チャット）が操作の成否を報告するときは、その操作の結果を受け取ってから書く。
操作とその報告を同じターンで並列に呼ばない。
## M-20261007-committed-ours-theirs-conflict-markers 事業ログのコンフリクトを解消したつもりで、`ours`/`theirs` の記号を残したままコミット・プッシュした（2026-10-07・型 A）

**Before**: #1265 に main を取り込んだとき、事業ログ3ファイルのコンフリクトを Python で解消した。最初の解消で空行を潰してしまったので
`git checkout -m` で衝突をやり直し、同じスクリプト（`<<<<<<< HEAD` と `>>>>>>> origin/main` の行を消す）をもう一度流してコミットした（`116e476`）。

**After**: `git checkout -m` が作り直す記号は `<<<<<<< ours` / `>>>>>>> theirs` で、スクリプトの正規表現に当たらず、DECISION_LOG・NOTE_CANDIDATES・
RELEASE_LOG に記号が残ったままプッシュしていた。次の main 取り込みで grep したときに気づき、マージ前に消した。

**なぜ気づけなかったか**: 解消後の確認を `git diff --numstat`（行数）と日付・ID のチェックだけで済ませ、記号そのものを grep しなかった。
記号の書式が作り方で変わる（`HEAD`/`origin/main` か `ours`/`theirs` か）ことを考えず、1つ目のときに作ったスクリプトをそのまま信じた。

**型 A の再発防止が効かなかった理由**: 型 A は「判断に使った道具を検証しない」。今回の道具は自作の解消スクリプトで、条件（衝突の作り方）が変わったのに
検証し直さなかった。

**再発防止**: 仕組み無し（判断に依存）。コンフリクトを解消したら、ラベルを問わず `grep -rnE '^(<{7}|>{7}|={7})( |$)'` を通してからコミットする。
`check:context-dates` などの既存チェックは記号を見ないので、それが緑でも解消済みの証拠にならない。

## M-20261007-claimed-env-vars-apply-only-to-new-session 「環境変数の変更は新しいセッションからしか反映されない」と確かめずに言い切った（2026-10-07・型 F）

**Before**: GA4 接続の手順で、代表がクラウド環境に `GOOGLE_ADC_B64` を足したあと「もう一回分析して」と言った。
このセッションに値が無かったのを見て、「環境変数の変更はこのセッションの途中では反映されない。新しいセッションから反映される」と
原因として言い切り、新しいセッションを開くよう案内した。

**After**: 少しあとで、同じセッションに `GOOGLE_ADC_B64`（496 文字）が届いていた（コンテナが入れ替わった時点で反映されたとみられる）。
値が無かったのは「まだ反映されていなかった」だけで、「このセッションでは使えない」は誤り。代表は不要な新セッションを開き、
そちらで同じ調査をやり直すことになった。

**なぜ気づけなかったか**: クラウド環境の挙動を記憶から書いた。`read_documentation` という確かめる手段があったのに使わず、
「1回見て無かった」を「この先も無い」に広げた。観察（今は無い）と仕組み（いつ反映されるか）を分けずに、仕組みを断定した。

**型 F の再発防止が効かなかった理由**: 型 F は「1コマンドで確かめられる事実」を想定していて、今回も `env` は確かめていた。
確かめたのは「今の値」だけで、それを根拠に「いつ反映されるか」という別の主張まで言い切ったのが漏れた。

**再発防止**: 仕組み無し（判断に依存）。環境の挙動（いつ反映されるか・何が引き継がれるか）を言うときは、
`read_documentation` を引くか、引けなければ「推定」と書く。観察した事実（今は無い）だけを断定する。

## M-20261007-read-elastic-build-machine-as-fixed-16gb 設定画面の「Elastic・16 GB」を固定 16 GB と読み、8 GB で走ったのを「設定が効いていない」と診断した（2026-10-07・型 F）

**Before**: 2026-10-02 に代表が共有した設定画面（Build Machine: Elastic・8 vCPU・16 GB）を「16 GB に切り替え済み」と読み、
OPEN_QUESTIONS に「8 GB なら設定が効いていない」と書いた。2026-10-07 に `9df2d3c` が 8 GB で走ったのを見て、
「設定が効いていない、または効かない回がある」とし、代表に「16 GB に固定できるか」を確認事項として出した（#1263）。

**After**: 代表の回答で、Elastic は費用を抑えるため意図して選んだ運用と分かった（代表の説明は「重そうなときだけ 16 GB、普段は小さい機械」）。
挙動そのものは別で、Codex のレビュー（#1264）によると Vercel の資料では「直近のビルド時間の履歴で大きさを決める」（原文は環境から開けず未確認【要確認】）。
8 GB の回があるのは設定どおりで、不備ではない。問いを「8 GB の回のフルビルド OOM をどう減らすか」に変え、決定を
DECISION_LOG 2026-10-07 に残した（#1264）。

**なぜ気づけなかったか**: 画面の「Elastic」という語の意味（固定か可変か）を確かめず、隣の「16 GB」だけを読んだ。
10-07 の時点で「Elastic が回ごとに選ぶのではないか」という仮説は自分で書いていたのに、それを代表に先に聞かず、
「設定が効いていない」側の診断を本文に残した。設定の意図は代表しか知らないのに、意図を聞く前に不具合扱いした。

**型 F の再発防止が効かなかった理由**: 型 F の既存の対策は「環境から1コマンドで確かめられる事実は確かめる」で、
ファイル・CI・日付など**自分の手元で引ける事実**を想定している。今回の事実（Elastic が固定か可変か、なぜ選んだか）は
手元から引けない（vercel.com は環境から開けない）、**設定した人に聞いて初めて分かる事実**だった。手元で確かめられないものを
「確かめようがない」と扱い、聞くという確かめ方を選ばずに、画面の値を事実として先に進めた。

**再発を止める仕組み**: 仕組み無し（判断に依存）。外部サービスの設定値が名前で挙動を表す種類（Elastic・Auto など）のときは、
診断を書く前に、2つを分けて確かめる: (1) **挙動**（固定か可変か、何で決まるか）は提供元の資料・サポートで確かめる。
資料を開けないときは【要確認】のまま、設定した人に資料の確認を頼む（設定した人の理解が挙動の根拠にはならない）。
(2) **選んだ理由**（費用など）は設定した人に聞く。

## M-20261007-service-role-read-trusted-client-consolidation-check 元帳票の明細をサービスロールで読んで顧客向けに載せるのに、合算条件をクライアントの判定だけに任せた（2026-10-07・型 C）

**Before**: 合算請求書の1枚目に元帳票の明細を載せるため、帳票作成 API が `meta_json.source_document_ids` の帳票をサービスロールで読み、
明細をそのまま合算請求書にコピーするようにした。「同じ顧客の納品書・請求書だけ」という合算条件は一覧画面の `canConsolidateDocuments` にある
ので、それで足りると考えた。

**After**: `/code-review` で、API を直接叩けば別顧客の帳票や管理者限定の外注請求書の ID を入れられ、その明細が新しい帳票に写って読める
（顧客に送る請求書にも載る）と指摘された。API でも元帳票を読み直したうえで `isConsolidatableDoc`・同じ顧客・全件そろっていることを確かめ、
外れたら 400 にした。テストを追加。なお、この穴は 2026-10-01 の別紙の内訳（PDF の2ページ目）から既にあった。

**なぜ気づけなかったか**: 「どの帳票を合算できるか」は一覧画面の話だと思っていて、**サービスロールで読む＝RLS が効かない**経路に ID を渡すのが
クライアントだという信頼境界を見なかった。読み出した中身を顧客向けの PDF に載せるのに、入力を誰が決めているかを確かめていない。

**再発防止**: 今回の分はテストで止める（`route.consolidated.test.ts`）。一般形は仕組み無し（判断に依存）。
- 習慣: サービスロールのクライアントで読む ID がリクエストから来るときは、その ID が「呼び出し元が見てよいもの」かを API 側で確かめる行を書いてから読む。

## M-20261006-widened-delete-without-checking-cycle-invoice-links 送付後の合算請求書を削除可にしたとき、オーダー締めの合算が job_orders に番号を刻んでいることを見なかった（2026-10-06・型 C）

**Before**: 代表の「合算請求書を削除できるように」に対し、`isDocumentDeletable` を「合算請求書は入金済以外なら削除可」に広げ、
入金記録（payment_entries の cascade）だけを API で止めた。合算請求書は「一覧で選んでまとめたもの」だと思っていた。

**After**: `/code-review` で、合算請求書にはオーダー締め（`cycleInvoice.ts`）が作るものもあり、作成時に
`job_orders.invoice_number` へ番号を刻むと指摘された。消すとオーダーが「請求済み」のまま残り、次の締めは
`invoice_number is null` で拾うので**二度と請求されない**。`meta_json.source = 'job_order_cycle'` の送付済みは削除対象から外し、
送付済みの削除を管理者ロールに限った。テストを追加。

**なぜ気づけなかったか**: `on delete` 付きの外部キーは migrations を grep して数えたが、**FK ではない紐付け（番号の文字列コピー）**を
数えなかった。`doc_type = 'consolidated_invoice'` を作る経路を grep すれば `cycleInvoice.ts` が出たのに、
自分が直している「一覧の合算」1本だけを母集団にしていた。

**再発防止**: 今回の分はテストで止める（`route.consolidated.test.ts`）。一般形は仕組み無し（判断に依存）。
- 習慣: 削除できる範囲を広げるときは、その種別の行を**作る経路**を全部 grep し、各経路が他テーブルへ書き込む値（FK でない番号・ID のコピーを含む）を並べる。

**同じ PR でもう1件（Codex 指摘）**: `on delete cascade` の FK を migrations で grep したとき、出力に `billing_splits`（支払者按分）が
**載っていたのに**、守ったのは `payment_entries` だけだった。按分は `BillingSplitPanel` が合算請求書にも作れる。grep の結果を
「1行ずつ、この行が消えて困るか」で読まず、思い当たった1つで止めた。按分も削除対象から外し、テストを足した。
- 習慣: cascade を grep したら、出てきた全行について「消えてよいか」を1行ずつ書いてから閉じる。

**さらにもう1件（Codex 指摘）**: オーダー締めの判定を `meta_json.source` だけで書いた。**同じ PR で直している不具合が、まさに
その meta_json を編集で消していた**のに、既存の帳票では目印が消えている可能性を考えなかった。更新 API で書き換わらない
`counterparty_tenant_id` でも見分けるようにした。
- 習慣: 「この値は消える／壊れる」という不具合を直したら、その値を新しく判定に使うコードが、壊れた既存データでも正しく動くかを見る。

## M-20261006-breakdown-ids-wiped-by-draft-edit 合算内訳を meta_json の ID に頼って載せたのに、帳票の編集保存が meta_json を丸ごと置き換えることを確かめなかった（2026-10-06・型 C／K）

**Before**: 2026-10-01 に合算請求書の内訳を詳細画面・PDF・顧客共有へ載せた。元帳票は作成時に保存する `meta_json.source_document_ids` から引く。
作成直後の合算請求書で詳細画面と PDF に内訳が出ることを確かめ、「送付にも載る」と記録した。

**After**: 代表から「送付すると内訳が表示されていない」と報告。帳票更新 API（PUT）は明細を保存するとき
`meta_json = { ...送られた meta_json, is_tax_inclusive }` で丸ごと置き換えていて、編集フォームは meta_json を送らない。
**下書きを一度編集保存すると ID が消え、送付 PDF から内訳が落ちていた**。既存の meta_json を土台に重ねるよう直し、
「フォームが meta_json を送らなくても ID が残る」ルートテストを足した。

**なぜ気づけなかったか**: 内訳の出口（詳細・PDF・共有）は3本とも数えたが、**内訳の元データ（meta_json の ID）を書き換える入口**を数えなかった。
合算請求書は「作成 → 下書きを直す → 送付」が普通の流れなのに、確認は「作成直後」の1本だけだった。
読み出す側が正しくても、保存した値が途中で消えれば外には届かない。

**再発防止**: 今回の分はテストで止める（`src/app/api/admin/documents/__tests__/route.consolidated.test.ts`）。一般形は仕組み無し（判断に依存）。
- 習慣: JSON カラムのキーに機能を載せたら、そのカラムに書き込む UPDATE を grep し（`meta_json` 等）、**丸ごと置き換える書き方が無いか**見る。
- 習慣: 外に出るものの確認は「作成直後」ではなく、利用者が実際に通る順（作成 → 編集 → 確定 → 送付）で1回通す。

## M-20261007-paid-scope-copied-the-window-not-the-opt-out 「履歴レポートと同じ境界」と書いて、期間だけ写し、レポートが除外する opt-out 車両を写さなかった（2026-10-07・型 J）

**Before**: #1262 で公開証明書の写真を「履歴レポート購入者には見せる」とき、`/v/[vin]` の開示範囲（scope_from 〜 購入時点）を
`certInReportScope` に切り出して共用し、「`/v/[vin]` と同じ境界」と PR・DECISION_LOG に書いた。購入の判定は「その証明書の車両の VIN で
有効な購入があるか」だけにした。同じ PR で、写真を見せない閲覧者には `url` だけ null にし、保存パス（`storage_path`）は残した。

**After**: /code-review で 2 点指摘された。(1) レポート本体（`getPassportData`）は `passport_opt_out=false` の車両の証明書しか載せない。
同じ VIN でも opt-out した別テナントの車両の証明書は購入に含まれないのに、その公開ページを開けば写真が見えた。opt-out と
パスポート公開の機能フラグも判定に入れた。(2) 写真の保存先は公開バケットなので、保存パスだけで写真に届く。今のページは `url` しか
読まないが、データ関数の戻り値としては漏れていた。パスも落とした。

**なぜ気づけなかったか**: (1) 「境界」を時間の範囲のことだと思い込み、`/v/[vin]` の画面側のコードだけ読んで、その画面が受け取るデータを
作る `getPassportData` の絞り込みを読まなかった（兄弟実装の条件のうち、目に入った半分だけ持ち込んだ）。(2) バケットが公開であることは
調査の時点で確認していたのに、「URL を消す」を「写真を消す」と同じものとして扱い、URL を作る材料（パス）が残ることを結び付けなかった。

**再発防止**: (1) テスト（opt-out の車両は購入していても見せない）を追加。「X と同じ範囲」と書くときは、X の画面だけでなく
X のデータを作る関数の絞り込み（`.eq` / `.in` / `.filter`）を全部数えてから書く。(2) 仕組み無し（判断に依存）。公開の保存先にある物を
隠すときは、URL だけでなく URL を組み立てられる値（パス・キー）が応答に残っていないかを型の項目ごとに見る。

---

## M-20261006-built-on-a-not-null-premise-from-my-own-log 「`audit_logs.tenant_id` は NOT NULL」を自分たちの OPEN_QUESTIONS から引き写し、スキーマを見ずに設計の前提にした（2026-10-06・型 F）

**Before**: #1255 で保持期限 cron の監査を作るとき、OPEN_QUESTIONS に「`audit_logs.tenant_id` が NOT NULL なので単一行では残せない」と
書いてあったのをそのまま前提にした。テナントを持たない `stripe_processed_events` の分は「監査に残せないのでアプリログのみ」とし、
コードのコメントと RELEASE_LOG にも「NOT NULL なので」と書いた。

**After**: /code-review で、`20260929150300` が NOT NULL を外していること、`db.generated.ts` でも `string | null` であることを指摘された。
本番でも `is_nullable = YES` を実測。テナント無しの分は `tenant_id = NULL` の 1 行で残すように直し、コメント・RELEASE_LOG・OPEN_QUESTIONS の
記述を訂正した。同じレビューで、同じ cron の stripe ルールが存在しない列 `received_at` を見ていて一度も消していなかったことも見つかった
（これは既存の不具合だが、私は同じ行を触っていたのに列名を確かめていなかった）。

**なぜ気づけなかったか**: OPEN_QUESTIONS は自分たちの過去の記録なので、確認済みの事実として読んだ。書かれた時点では正しかったかもしれないが、
その後のマイグレーションで変わっていた。スキーマは `db.generated.ts` を 1 回 grep すれば分かる距離にあった。型 F の「確認できる事実を確認しない」で、
既存の再発防止（「1コマンドで確かめられる事実は確かめる」）が効かなかったのは、**自分たちのログを「事実」側に分類した**から。

**再発防止**: 仕組み無し（判断に依存）。習慣として、設計の前提にするスキーマの性質（NOT NULL・列名・FK）は、ログやコメントからではなく
`db.generated.ts` か本番の `information_schema` から引く。触る行に列名が書いてあれば、その列が実在するかも同じ grep で見る。

---

## M-20261006-grant-ui-removed-opt-out-the-comment-said-to-keep 顧客ポータルに承諾の表示を足すとき、未承諾のお客様から「お断り」の導線を消した。すぐ上のコメントが残せと書いていた（2026-10-06・型 B）

**Before**: #1254 で顧客ポータルのパネルに本人承諾を足すとき、「承諾済みなら撤回ボタン、それ以外（未承諾・撤回済み）なら承諾フォーム」
と分岐を書き換えた。未承諾のお客様には「事前のご承諾が必要です」と案内した。

**After**: /code-review で、未承諾（none）のお客様から撤回（お断り）のボタンが消えたと指摘された。事前承諾を必須にしていない店舗では
未承諾でも電子交付されるので、お客様が「希望しない」と事前に言える手段が無くなり、「承諾が必要」という案内も事実と違った。
書き換えた分岐の**すぐ上のコメント**に「撤回の導線は承諾の有無に関わらず提示してよい（none でも事前の意思表示として有効）」と
書いてあった。未承諾には承諾とお断りの両方を出し、文面を店舗の設定に関わらず正しい言い方に直した。

**なぜ気づけなかったか**: 分岐を「承諾済み／それ以外」の 2 つに整理することを先に決め、元の分岐が `revoked／それ以外` だった理由
（none を granted 側に入れていた）を読まなかった。理由はコメントに書いてあったのに、自分が消す予定のコードとして読み飛ばした。
型 B の「1 段だけ深く読んで止まる」。あわせて、店舗が記録した承諾をポータルから上書きできる作りにもしていた（同じレビューで修正）。

**再発防止**: テストは画面側に無い（仕組み無し、判断に依存）。習慣として、分岐を書き換えるときは**元の分岐の各ケースが、新しい分岐の
どこへ行くか**を表にしてから書く（none: 撤回ボタンあり → 承諾フォームのみ、のように）。消える導線があればそこで止まる。

---

## M-20261005-took-sharps-limit-as-the-limit-of-what-i-could-verify 「sharp が HEIC を作れない」を「HEIC の署名可否は確かめられない」と書いた（2026-10-05・型 A／F）

**Before**: #1209 で本番の C2PA 署名を必須にしたとき、「HEIC を c2pa-node が署名できるか」を【要確認】として残した。
手元の sharp のプリビルドは HEVC を書けず HEIC が作れない。それを確認したうえで
**「手元の sharp の heif は avif 専用で HEIC を作れず検証できなかったので、実機で撮った HEIC で確かめること」**
と書き、PR 本文にも「署名できなければ iPhone 既定の HEIC が全部 503」と重い警告として載せた。
この未確認が本番オンを塞ぐ2件のうち1件になった。

**After**: 2026-10-05 に確かめたら**署名できた**。必要だったのは読める HEIC ではなく、
**HEIF コンテナと `image/heic` という形式名だけ**だった —— manifest の埋め込みは ISO BMFF の box 構造しか触らず、
画素をデコードしない。sharp が作れる AVIF（同じ HEIF 族）の `ftyp` メジャーブランドを `heic` に差し替えて
署名させると通り、読み戻した failure コードは `signingCredential.untrusted` と `claimSignature.mismatch` の2つだけ
（jpeg/png/webp と同一＝dev 証明書の癖、内容・構造のエラーはゼロ）。入口の `detectMagicByteMime` も
ブランド `heic`/`mif1` を `image/heic` と判定する。`c2paSignValidate.test.ts` に恒久ケースとして追加し、
変異2本（署名失敗／ブランド差し替えの黙殺）で赤になることも確かめた。

**なぜ気づけなかったか**: **道具の限界を、問いの限界だと思い込んだ。** 「HEIC を作れない」は事実で、
そこまでは正しく検証した。やらなかったのは次の一手 —— **「この問いに本当に必要なものは何か」を分解すること**。
署名が画素のデコードを要するかどうかを一度も確かめていない。確かめれば5分で分かり、
`c2pa.ts` は入力バッファをそのまま c2pa-node に渡すだけなので読めば分かる話だった。
CLAUDE.md の「判断の道具そのものを検証する」は**検出器の正しさ**を疑う話として書いてあるが、
ここで要ったのは**道具が無いときに問いを言い換える**ことで、そちらの型を持っていなかった。

**型 F（確認できる事実を確認しない）の再発防止が効かなかった理由**: 型 F は「環境から1コマンドで
確かめられる事実」を対象にしていて、私はそれを**答えが1コマンドで出る問いだけ**に当てはめていた。
`npm test` 1本で出る話ではないので「確かめられない側」に分類し、型 F の網に入れなかった。
実際に要ったのは1コマンドではなく**20行の使い捨てスクリプト**で、それは「確かめられる」の側である。
型 F は「コマンドの長さ」ではなく「**この環境で答えが出るか**」で引くべきだった。
**同じ取りこぼしを、この件の中でもう一度やっている** —— `git log -1 -S` が返すのは最新の一致で
初出ではないのに、その出力を初出の日付として4箇所に書いた（`--reverse` を付ければ 2026-09-05 と出る。
`/code-review` の指摘で気づいた）。道具の出力の意味を確かめずに使った点で、型 A と型 F が同時に出ている。
さらに悪いのは、**この「検証不可」を重い警告として代表に渡した**ことである。確かめられるものを
「確かめられない」と報告すると、相手は待つしかなくなる。未確認の報告は、相手の手を止める。

**同じファイルの中に答えが半分あった**: `OPEN_QUESTIONS` には 2026-09-05 に「(3) HEIC も署名可能・準拠」と
書かれた一文が既にあった（800行離れた位置。初出は `09888187`・PR #914）。私は自分の【要確認】を書くとき、**同じファイルを grep しなかった**。
ただしその一文も**書かれた時点では根拠が無く**、同じ 2026-09-03 の DECISION_LOG は「(d) HEIC 署名可否を
実ファイルで確認」を**残**と書いている。つまり**矛盾する2つの記述が同じファイルに同居していた**。
結論は当たっていたが、確かめずに「全て解決」に入れた記述だったので、引いていても根拠にはならなかった。
両方に印を付けた。

**再発防止**: 仕組み無し（判断に依存）。習慣として2つ。
- **「確かめられない」と書く前に、問いを分解して「本当に必要なもの」を名指しする。**
  道具が作れないもの（デコードできる HEIC）と、問いに必要なもの（HEIF コンテナ＋形式名）は別物でありうる。
  実装を読めば、何が必要かは書いてある（`c2pa.ts` は入力バッファをそのまま渡す）。
- **【要確認】を新しく書く前に、同じファイルをその語で grep する。** 今回は `HEIC` で引けば
  既存の記述が出た。出てきたものが根拠付きかは別に確かめる（今回は根拠なしだった）。


## M-20261005-reused-oauth-state-signer-with-shared-fallback-key 承諾ゲートを通す署名に OAuth state の署名を流用し、鍵が freee と共有の鍵へフォールバックすることを考えなかった（2026-10-05・型 D）

**Before**: #1247 でモバイルのスタッフ用 PDF 署名を作るとき、既存の `createOAuthState` / `verifyOAuthState`（HMAC・期限・テナント入り）を
用途名 `staff-pdf:<public_id>` で流用した。「既存のものを再利用」に沿った、鍵も環境変数も増えない良い形だと考えた。

**After**: /code-review で、oauthState の鍵は専用鍵 `INTEGRATION_OAUTH_STATE_SECRET` が無いと `ACCOUNTING_OAUTH_STATE_SECRET` →
`FREEE_CLIENT_SECRET`（freee と共有、長さ検査なし）へフォールバックすると指摘された。CSRF 用の state なら弱い鍵でも被害は限られるが、
今回の署名は**承諾ゲートを通す権限**そのもので、その鍵を知る第三者が任意テナントの撤回済み顧客の PDF を取れる。専用鍵（32 文字以上）
があるときだけ有効にし、フォールバック鍵で正しく署名されたものも拒否するよう直した（テストあり）。その後 CodeQL も同じ署名関数への
新しい呼び出し経路に high アラートを出したので、流用自体をやめ、専用鍵だけを使う数十行の HMAC を `staffPdfLink.ts` に持たせた。

**なぜ気づけなかったか**: `getStateSecret` のフォールバックは**読んでいた**。それでも「同じ署名関数を使う」ことを「同じ強さで守られる」
ことと同一視し、**用途の重さが上がったときに鍵の要件も上がる**ことを考えなかった。型 D の「移設先の信頼境界が変わっているのに気づかない」
—— 移設ではなく流用で起きた形。

**再発防止**: テストで固定した（`staffPdfLink.test.ts`: 専用鍵なし・短い鍵・フォールバック鍵の署名は無効）。習慣として、既存の
認証・署名の部品を新しい用途に流用するときは「**この部品が守っていたもの**」と「**新しく守らせるもの**」を並べ、後者の方が重いなら
鍵・期限・フォールバックの要件を見直す。

---

## M-20261005-truncated-grep-hid-the-mobile-pdf-caller 公開 PDF の呼び出し元を head で切れた grep で数え、モバイルアプリのスタッフも同じ URL を使っていることを見落とした（2026-10-05・型 A / C）

**Before**: #1246 で公開 PDF（`/api/certificate/pdf`）に承諾ゲートを入れた。呼び出し元を `src` の grep で数え、「お客様が PDF を
取りに来る出口は 1 本、他は店舗側の管理用ダウンロードとプレビュー」と DECISION_LOG と NOTE 候補に書いた。

**After**: /code-review で、モバイルアプリ（`apps/mobile/src/app/certificates/[id]/index.tsx` → `certPdfUrl`）も同じ公開 URL を
端末ブラウザで開いていると指摘された。撤回した顧客の証明書は、書面で渡すための印刷すらスタッフがモバイルから出せなくなる。
Web 管理画面の PDF 出力は公開経路を通らないので印刷はできる。モバイル用の認証付き経路は未決として OPEN_QUESTIONS に残し、
文書の「出口は 1 本」を訂正した。

**なぜ気づけなかったか**: 最初の呼び出し元 grep（`grep -rn "api/certificate/pdf" src apps … | head`）は `apps` も対象にしていて、
**モバイルの 3 行にも当たっていた**。全 20 行のうちモバイルは 18〜20 行目で、`| head` が先頭 10 行で切ったので見ていない。
切れた出力を「全部」と読んだ。2026-09-15 の `M-20260915-dupe-count-from-truncated-grep`（切れた grep を全件と読んで 8 倍外した）
と同じ型 A。その再発防止は「件数を書いたら `| wc -l` で数え直す」だったが、今回は件数ではなく**一覧**から「他に無い」と
結論したので、件数の習慣に引っかからなかった。結果として型 C（入口を 1 本しか見ない）になった。

**再発防止**: 仕組み無し（判断に依存）。習慣として、「他に無い」と結論する grep には **`| head` を付けない**（付けるなら先に
`| wc -l` で総数を見て、表示した行数と比べる）。ガードを入れる URL / 関数の呼び出し元は `src` と `apps` の両方で数え、
「誰が（お客様 / スタッフ / 外部）この入口を使うか」を一覧にしてから止める範囲を決める。

---

## M-20261005-hoisted-a-try-scoped-name-and-trusted-eslint-zero-errors try の中にあった変数を外に出して同名の宣言と衝突させ、eslint の「0 error」で正しいと思っていた（2026-10-05・型 A）

**Before**: 公開 PDF に承諾ゲートを入れるとき、閲覧ログ用に try の中で取っていた `certRow` を関数スコープに出した。
eslint を回して 0 error だったので、コードは正しいと思っていた。

**After**: route の配線テストを書いて走らせたら、変換の段階で `Identifier certRow has already been declared` で落ちた。
同じ関数の後半に、PDF 描画用の `const certRow: CertRow` が元からあった（以前は try のブロックに閉じていたので衝突しなかった）。
変数名を `gateRow` に変えた。コミット前に見つかったので、外には出ていない。調べると、このリポジトリの eslint は
同一スコープの二重宣言を error にしない（わざと二重宣言を入れても 0 error だった）。

**なぜ気づけなかったか**: 「eslint 0 error」を、構文と宣言が正しいことの証拠として扱っていた。eslint が何を検査しているかを
確かめていなかった。型 A の「道具の出力を、その道具が何を見たか確かめずに受け取る」。変数をスコープの外に出すときに、
**出した先のスコープに同名が無いか**を見ていなかった。

**再発防止**: 仕組みはある（tsc と vitest の変換はどちらも検出する）。習慣として、正しさの根拠は **tsc とテストの実行**で言い、
eslint の 0 error を根拠にしない。変数をブロックの外へ出したら、出した先のスコープで同じ名前を grep する。

---

## M-20261005-blamed-migrations-for-a-stale-clone 代表の手元の古いクローンで落ちた `db push` を、マイグレーションの順序問題だと診断した（2026-10-05・型 F）

**Before**: 新規の staging プロジェクト（`Ledra-staging`）に代表が `npx supabase db push` を流したところ、最初の
`20260312000000_tenants_contact_fields.sql` で `relation "tenants" does not exist` になった。私は「tenants を作るのは翌日付の
`core_tables` なので、空 DB へは `db push` できないレガシー順序問題」と断定し、代わりの経路（手元で replay → スキーマをダンプ →
分割 → 公開 API 経由の受け皿テーブル → 私の接続で実行）を組んで、代表に何往復もコマンドを打たせた。

**After**: `main` のこのファイルには、tenants が無ければ skip するガードが #1025（2026-09-05）で入っている。代表の `db push` が
表示した文（ガードの無い素の `ALTER TABLE tenants ...`）は**それより古い中身**だった。`C:\Users\admin\Ledra` は以前からある古い
クローンで、`git clone` が失敗しても `cd Ledra` でそこに入っていたと見られる（推定。代表の手元の `git log -1` は未確認）。
`docs/operations/migrations.md` には「空 DB にファイル名順・1パスで通る」と書いてあり、私はそれを読んでいたのに、目の前の
エラーと食い違うことを突き合わせなかった。

**なぜ気づけなかったか**: エラーに出た SQL の**本文**を、`main` のファイルと見比べなかった。「最初のファイルが tenants に依存
している」というファイル名の並びだけで原因を決め、手順書の記述（1パスで通る）との矛盾を「手順書が古い」側で解消した。
実行した側のチェックアウトが最新かどうかは、1コマンドで確かめられる事実だった。

**再発防止**: 仕組み無し（判断に依存）。習慣として、**相手の環境でリポジトリの中身を流して失敗したら、まずその中身が `main` と
同じかを確かめる**（エラーに出た文を `main` のファイルと比べる、相手に `git log -1 --oneline` を打ってもらう）。手順書と
目の前の結果が食い違ったら、手順書が古いと決める前に、自分の前提（どの版を流したか）を疑う。

---

## M-20261005-handed-user-cli-commands-i-never-ran 自分で一度も動かしていないコマンドを、代表の Windows 環境向けに渡し続けた（2026-10-05・型 F）

**Before**: staging 構築の途中で、代表の PowerShell 向けに次を渡した。`npx supabase db dump --schema-only`、
`winget install PostgreSQL.PostgreSQL`、「どちらか」のつもりの2案とプレースホルダ（`<staging の接続文字列>`）を1つの実行ブロックに
混ぜたもの、`$env:PGPASSWORD="..."` に「記号OK」と添えたもの。

**After**: `supabase db dump` には `--schema-only` が無く（v2.119.0 のヘルプで確認）、そもそも Docker が要って代表の PC では
動かなかった。winget は「一致するパッケージなし」。混ぜたブロックは丸ごと実行され、`db push` が再実行されて `psql` 未導入の
エラーになった。PowerShell のダブルクォートは `$` 以降を変数展開するので、`$` を含むパスワードは途中で切れて送られていた。

**なぜ気づけなかったか**: 自分が動かせない環境（Windows・Docker 無し・psql 無し）向けのコマンドを、記憶から書いた。どれも
`--help` や公式ドキュメントで1回確かめれば分かることだった。代表がそのままコピーして打つ前提なのに、案と注記を実行ブロックの中に
書いた。

**再発防止**: 仕組み無し（判断に依存）。習慣として、相手に打ってもらうコマンドは (1) フラグをヘルプかドキュメントで確かめる、
(2) 前提のツール（Docker・psql など）が相手の環境にあるかを先に聞くか、無くても動く方法を選ぶ、(3) 実行ブロックには
**そのまま打てる行だけ**を書き、案の比較とプレースホルダはブロックの外に出す、(4) PowerShell で秘密を渡すときはシングルクォート。

---

## M-20261005-declared-auth-root-cause-without-retest pooler の認証失敗の原因を「特定した」と言ったが、直しても失敗し続けた（2026-10-05・型 A）

**Before**: staging の pooler に `password authentication failed` が続いたとき、PowerShell の `$` 展開でパスワードが切れていたことに
気づき、「原因、特定した」と代表に伝えた。

**After**: シングルクォートにしても、記号を含まない英数字のパスワードにリセットしても、同じエラーが出た。環境変数には17文字が
正しく入っていた（`len 17 head Le` で確認）。**本当の原因は分からないまま**で、最終的に pooler を使わない経路（公開 API 経由）で
スキーマを入れた。

**なぜ気づけなかったか**: もっともらしい仕組みを1つ見つけた時点で、再試行の結果を待たずに「原因」と呼んだ。

**再発防止**: 仕組み無し（判断に依存）。直した後の再試行が通るまでは「候補」と書く。

---

## M-20261005-said-loader-table-unreadable-after-granting-select 受け皿テーブルに anon の読み取りを付けた直後に「外から読めない」と説明した（2026-10-05・型 A）

**Before**: staging の受け皿テーブル `_schema_loader` へのアップロードが RLS で弾かれたので、RLS を外し `grant select, insert ... to anon`
を実行した。同じ返信で代表に「受け皿テーブルは外部から読めない」と書いた。

**After**: anon に SELECT を付けていたので、説明は誤り（中身はリポジトリにあるスキーマ定義だけで、秘密は無い）。次の返信で
訂正し、`revoke all ... from anon` の後に `has_table_privilege` で anon の SELECT/INSERT が false であることを確かめた。

**なぜ気づけなかったか**: 権限の説明を、直前に実行した SQL ではなく「最初に意図した設計」から書いた。

**再発防止**: 仕組み無し（判断に依存）。アクセスできる・できないを書くときは、`has_table_privilege` などの実測結果から書く。

---

## M-20261005-statement-splitter-split-inside-comments SQL を文単位に分ける自作スクリプトが、コメント行の中の `;` で分割していた（2026-10-05・型 A）

**Before**: スキーマのダンプを、一度に送れる大きさに分けるスクリプトを書いた。ドル記号で囲んだ関数本体の中の `;` は避けたが、
`--` コメントは考えなかった。

**After**: pg_dump のコメント行 `-- Name: public; Type: SCHEMA; ...` が `;` で切られ、`Type: SCHEMA;` のような SQL ではない断片が
「文」として出来ていた。適用する前に最初の断片を読んで気づき、ドル記号の外の行コメントを読み飛ばすように直し、
`Type:/Name:/Schema:/Owner:` で始まる断片が0件であることを確かめてから使った。

**なぜ気づけなかったか**: 分割スクリプトの出力（文の件数）だけ見て、中身を1件も読まずに次へ進んでいた。

**再発防止**: 仕組み無し（スクリプトは使い捨てで、リポジトリに入れていない）。自作の変換スクリプトは、使う前に出力の
先頭を読み、壊れていると分かる形（ここでは `Type:` で始まる断片）が0件であることを確かめる。

---

## M-20261005-rewrote-customer-resolver-that-already-existed 証明書の顧客紐付けで、既存の共通リゾルバを探さずに名寄せ処理を書き直した（2026-10-05・型 J）

**Before**: #1244 で `/api/certificates/create` に顧客の自動紐付けを入れるとき、`createCertificate` の中にあった名寄せ/自動作成の
ブロックを `resolveCustomerIdByName` として切り出し、両経路から呼ぶ形にした。「既存の処理を流用した」つもりだった。

**After**: /code-review で、同じ処理が既に `src/lib/customers/resolveCustomer.ts` の `createCustomerResolver`（車両取込/CSV で使用中、
閾値は定数 `CUSTOMER_AUTO_LINK_THRESHOLD`、候補の読み込み失敗をログに出す）として共通化されていると指摘された。私の切り出しは
3つ目の実装を増やしただけで、閾値 0.85 を直書きし、読み込み失敗も握りつぶしていた。切り出しを取り消し、route から
`createCustomerResolver` を呼ぶ形に直した。あわせて共通リゾルバ側の「候補を読めないと重複顧客を作る」穴を塞いだ。

**なぜ気づけなかったか**: 流用元を「目の前のファイル（`createCertificate`）」だけで探した。`createCertificate` 自身が共通リゾルバを
使っていない（同じ処理を内側に持っている）ので、そこから辿っても共通版には行き着かない。CLAUDE.md の「既存のものを再利用」を、
`fuzzyMatchCustomer` や `customers` の insert で grep して確かめていなかった。型 J の「既存の兄弟実装が持っていた条件を
新しい実装に持ち込まない」。

**再発防止**: 仕組み無し（判断に依存）。習慣として、処理を新しく切り出す・関数を足す前に、**その処理の中核の呼び出し**
（ここなら `fuzzyMatchCustomer(` と `.from("customers").insert(`）を src 全体で grep し、既に包んでいる関数が無いか見る。
`createCertificate` 内の重複実装の統合は別タスク（OPEN_QUESTIONS G3/G4 #2）。

---

## M-20261005-fail-closed-flag-read-blocked-non-opt-in-tenants 既定 OFF の opt-in フラグの読み取り失敗を fail-closed にし、opt-in していない全テナントを止める作りにした（2026-10-05・型 K）

**Before**: #1243 の未承諾ハードブロック（`tenants.require_delivery_consent`、既定 false）で、承諾状態のクエリと同じく
テナント設定の読み取り失敗も「確認できない → ブロック」（fail-closed）にした。承諾まわりは安全側に倒すのが正しいと考えた。

**After**: /code-review で、マイグレーションはデプロイと同時に走るので、列ができる前の数分間はクエリが失敗し、opt-in していない
全テナントで承諾未記録の顧客（＝ほぼ全員）への交付が 409 になると指摘された。マージ前に、設定の読み取り失敗は既定（必須でない）
扱いに直した（fail-closed は撤回を見落とすと規制違反になる承諾状態のクエリにだけ残す。DECISION_LOG 2026-10-05）。

**なぜ気づけなかったか**: 「規制の保護だから fail-closed」という一つの原則を、**既定値が逆向きの設定の読み取り**にまで広げた。
新しい列を読むコードが、その列がまだ無い状態（デプロイとマイグレーションの順序差）で呼ばれる文脈を想定しなかった。
同じリポジトリの `tenantRequiresInspectorQualification` は fail-open で書かれていたのに、揃えなかった。

**再発防止**: テストで固定した（`deliveryConsent.test.ts`: テナント設定の読み取り失敗は通す）。習慣として、新しい列を読む
コードを書いたら「この列がまだ無い本番」で何が起きるかを1行で書く。fail-closed にするのは、**読めなかったときに既定値と
同じ挙動になる**ことを確かめてからにする。

---

## M-20261005-diagnosed-device-from-origin-not-users-checkout 代表の端末に出ている画面を、手元のチェックアウトではなく GitHub 上のコードから推論し続けた（2026-10-05・型 F）

**Before**: 代表の実機で「`>` の修正が効いていない」「昔の UI に戻った」と言われるたびに、GitHub 上の main とブランチを
調べて原因を推論した。(1)「`git switch main` → `git pull` → 再起動」を指示した。(2) 戻した先を「リモートに無いローカル専用
ブランチ」と断定した。(3) main が古く見えるのは「表示モード（simple）のせい」と推定した。(4) `Test-Path` で止めるつもりの
確認を、後続コマンドと同じブロックに入れて渡した。

**After**: (1) 代表の手元の main は **2026-08-07（#894）のまま 389 コミット遅れ**ていて、表示されていたのはその時期にしか無い
タブ（予約・会計）と文言だった。`pull` が効いたかを `git log` で確かめる手順が無かった。(2) 実際は**同じ共有ブランチ**が
656 コミット遅れていただけ。(3) 表示モードは無関係。(4) `False` が出ても `npm ci` まで走り、`node_modules` が空になった。
最終的に `git log --oneline -1` と実機のスクリーンショットの文言を git 履歴で引いて原因が確定し、
`if ($LASTEXITCODE -eq 0)` で止まる形のコマンドに直して解決した。

**なぜ気づけなかったか**: 検証はすべて **origin に対して**していて、**代表のチェックアウトに対しては一度もしていなかった**。
「main には修正が入っている」は正しかったが、それは「代表の端末が main を読んでいる」ことを何も示さない。
調べられる側（リモート）を調べ尽くしたことで、調べていない側（手元）まで確かめた気になっていた。
加えて、スクリーンショットという一次証拠が手元にあったのに、**画面の文言を git 履歴で引けば何時のコードか分かる**ことに
3往復目まで思い至らなかった。

**再発防止**: 仕組み無し（判断に依存）。代表の環境で状態を変えるコマンドを渡すときは:

1. **最後に状態を名指しで返すコマンドを付け、その出力を見てから次を判断する**（`git log --oneline -1`、`git status -sb`）。
   「直ったはず」で止めない。
2. **止めたい確認は `if ($LASTEXITCODE -eq 0) { ... }` で後続を条件付きにする**。同じブロックに並べただけでは止まらない。
3. 実機の画面がおかしいと言われたら、推論の前に**画面の固有の文言を `git log -S` で引いて、どの時期のコードかを確定する**。

**追記（同日・同じ型を自分のシェルで再発）**: 上の再発防止 #2「止めたい確認で後続を条件付きにする」を書いた
その日に、#1242 のマージ前の競合解消で**自分が同じことをした**。Python の解消スクリプトが assert で止まったのに、
ヒアドキュメントの次の行から始まる `git add && git commit && git push` は前の終了コードを見ていないので走り、
**競合マーカー付きの `MISTAKE_LEDGER.md` を PR ブランチに push した**（`9c56c5a2`、main には入っていない。
`70d855e4` で解消）。代表に渡すコマンドだけを直して、**自分が実行するコマンドには同じ規則を当てていなかった**。
再発防止: 書き換えスクリプトの直後に commit / push を続けるときは `python3 ... && git add ...` のように
**同じ論理行で `&&` につなぐ**か、push の直前に `grep -rn '^<<<<<<<\|^>>>>>>>'` で0件を確かめる。

---

## M-20261005-test-tsa-echoed-my-own-content-type-assumption TSA の中継が Content-Type を素通しし、テストの TSA も同じ値を返していたので通っていた（2026-10-05・型 A）

**Before**: #1231 で、c2pa-rs の TSA 要求を 127.0.0.1 の中継で受けて `tls13HttpsFetch` で転送する形にした。中継は TSA の返答の
`Content-Type` をそのまま c2pa-rs に返していた。テスト（`c2paTimeStamp.test.ts`）は openssl のローカル TSA を自分で書き、
その TSA は `application/timestamp-reply` を返していたので、付与テストは通った。この形で PR を出し、/code-review も通した。

**After**: 実 TSA（ssl.com）の連鎖を c2pa-rs で再現する検証用スクリプトで、ローカル TSA に Content-Type を付け忘れたところ
`service responded with an HTTP error (status = 200, content-type = None)` で署名が失敗した。c2pa-rs は
`application/timestamp-reply` 以外の返答を中身ごと拒否する。中継が素通しする限り、ラベルの違う TSA では**毎回**
タイムスタンプなしに落ちる（写真は止まらないので、黙って効かない）。中継が常に `application/timestamp-reply` を付けるよう直し、
テストの TSA を `application/octet-stream` で返す形に変えた（素通しに戻すと付与テストが落ちることを確認、2953dc39）。
実 TSA の Content-Type は未確認のまま（代表の PC の curl は HEAD と POST の本文だけを見た）。

**なぜ気づけなかったか**: テストの TSA を**自分の想定どおりに作った**ので、テストは「想定が正しいか」を一度も試していない。
中継が転送する値のうち、本文だけを検証対象と思い、ヘッダーは「そのまま返せば正しい」と考えた。c2pa-rs が Content-Type を
検査することは、ライブラリの挙動として調べていなかった。型 A の「自分の想定だけで検証する（当たりを取る既知の1件を自分で作る）」。

**再発防止**: テストで固定した（`c2paTimeStamp.test.ts` の TSA は標準外の Content-Type を返す）。習慣として、外部サービスの
テスト用の偽物を書くときは、**本物が返しうる値の幅の端**（ヘッダー欠落・別ラベル・空本文）を1つは返させる。

---

## M-20261005-called-ci-green-from-check-runs-only check-runs だけ見て「CI 全部緑」と報告し、commit status の失敗を見落とした（2026-10-05・型 F）

**Before**: #1232 をマージする前に CI を確認し、代表に「head `dd8ef08` のチェックは全部緑」と
報告してマージした。見ていたのは GitHub Actions の **check-runs** だけだった。

**After**: #1237（事業ログ）で Vercel の Preview デプロイが失敗し、調べ直したところ
**`dd8ef08` でも同じ Vercel デプロイは failure だった**（`commits/<sha>/status` の
commit status 側）。GitHub の CI 結果には **check-runs と commit statuses の2系統**があり、
Vercel のデプロイ結果は後者に出る。前者だけを数えて「全部緑」と言っていた。
マージ自体の判断は変わらない（main の a70a5eb / 48b4a4e は success、#1220 / #1222 / #1224 も
同じ Preview 失敗のままマージされて main は緑）が、**報告した事実が間違っていた**。

**なぜ気づけなかったか**: 「CI が緑か」を**自分が叩いた API の返り値の範囲**で判断し、
その API が CI の一部しか返さないことを確認しなかった。`check-runs` は名前のとおり
check-runs しか返さない。**道具の網羅範囲を検証せずに「全部」と言った**
（CLAUDE.md「判断の道具そのものを検証する」）。さらに「11件」と件数まで添えたことで、
数えた＝網羅したように見えてしまった。件数は網羅の証明にならない。

**再発防止**: 仕組み無し（判断に依存）。マージ前の CI 確認は、次の2つを**両方**見る。

1. `repos/{owner}/{repo}/commits/{sha}/check-runs` — GitHub Actions 等の check-runs
2. `repos/{owner}/{repo}/commits/{sha}/status` — commit statuses（Vercel など外部連携）

`pull_request_read` の `get_status` は後者を返すので、**両方を突き合わせてから**
「緑」と言う。片方しか見ていないときは「check-runs は緑」と範囲を付けて言う。

**同日追記（別セッション・C2PA のタイムスタンプ作業）**: 同じ日に、並行していた別セッションが同じ形を繰り返した。
#1238 / #1239 のマージ前に check-runs だけで「CI は全部通っています」と代表に報告したが、
その時点の commit status は Vercel が `pending`（#1239 の head `bd282b22` は 13:03 UTC 時点でも pending のまま）。
失敗は無く、マージの判断は変わらないが、「全部通った」は事実と違った。
**この台帳のエントリは並行セッションで書かれており、こちらのセッションは書かれた時点でそれを読んでいなかった** ——
再発防止を書いても、同時に走る別セッションには届かない。習慣として、セッションの区切り（事業ログ反映）で
その日の新しいエントリを読み、自分の作業に同じ形が無かったかを照らす（今回はそれで見つけた）。

---

## M-20261005-abs-chevron-reserved-space-in-one-row-only 絶対配置の「>」の逃げ幅を、目の前で重なった1行にだけ入れた（2026-10-05・型 J）

**Before**: 一覧カードの右端に「>」を `position: absolute; right: spacing.lg` で置き、
重なりを避ける `paddingRight: spacing["3xl"]` を **work の dense バリアント**と
**field-test の meta 行**にだけ入れた。その2箇所で見た目が直ったので完了にした。

**After**: 代表の実機スクショで、work の**既定バリアント**のステータスバッジに
「>」が重なっていた。chevron はカードの**縦中央に置かれた高さ20pxの帯**で、
水平方向は右端 **16〜36px**（dense は 8〜28px）を占める。カードの `padding` は
16 なので、その帯に届く行はすべて潜る。**どの行が潜るかはカードの高さで決まる**
ので、行ごとに逃げ幅を入れる限り必ず取りこぼす。
最終的に、行ではなく**カードの `paddingRight` で帯ごと確保**する形にした
（既定 40 / dense 32、simple は chevron を出さないので対象外）。

**なぜ気づけなかったか**: 絶対配置は「親のどの子とも重なりうる」のに、
**重なりを“その行の不具合”として扱い、“その親に絶対配置を置いた時点で
全行に生じる条件”として扱わなかった**。直した2箇所はたまたま先に目に入っただけで、
そこに固有の理由は無い。加えて表示モード（default / simple / dense）で行の中身が
変わるのに、確認したのは1モードだけだった。**条件が成立する範囲を数えていない**。

**再発防止**: 仕組み無し（判断に依存）。`position: absolute` の要素を親に足したら、
次の2つを習慣にする。

1. **その要素が占める帯を座標で出し**（右端から `right` 〜 `right + サイズ`）、
   同じ親の子のうち、その帯に届く行を**全部列挙してから**予約を入れる。
   「見た目で重なっている行」ではなく「重なりうる行」を数える。
2. **バリアント分岐（表示モード・compact・dense 等）があれば全バリアントを見る。**
   1モードで直っても、他モードは行構成が違う。

検証は、chevron を絶対配置している `.tsx` を列挙し、**カードの各バリアント**の
実効 `paddingRight` が帯の右端以上かを座標で突き合わせる形にした（8バリアント / NG 0）。

**追記（同日・`/code-review` の指摘）**: 上の再発防止 #1 を、**それを書いた修正自体で
実行していなかった**。最初の修正ではヘッダー行にだけ逃げ幅を入れ、検証も
`cardHeader` の `paddingRight` を数えるだけだった。chevron が縦中央にある以上、
背の高いカードで帯が横切るのは中段の行（`serviceText` / `desc` / `metaRow`）であり、
6画面中2〜3画面はそのまま残っていた。レビューに指摘されるまで気づいていない。
**再発防止を書いた直後の自分の手がそれを守らない**という形なので、
「帯を座標で出す」を文章の中だけでなく**検証スクリプトの形**に落とした（上記）。

---

## M-20261005-log-edit-replaced-heading-prefix-and-dropped-it RELEASE_LOG の先頭追記で、既存の見出しの前半を置換の目印にして消し、見出しを壊した（2026-10-05・型 A）

**Before**: RELEASE_LOG に新しいエントリを先頭追記するため、Python の `str.replace` で既存の先頭見出しの**前半**
（`## 2026-10-03 documents / body_repair_jobs`）を目印にし、「新エントリ＋目印」に置き換えるつもりで書いた。
置換後の文字列の末尾に**目印そのものを戻し忘れた**。`git diff --stat` の行数だけ見て、置換後のファイルを読まなかった。

**After**: #1231 の `/code-review` が指摘した。既存の見出しが「` の作成・更新・削除を監査ログ化（G2）`」だけの行になり、
G2 監査ログのリリース記録が見出しを失って、新しい C2PA のエントリの続きに見える状態だった。見出しを戻した。
同じコミットで書いた他の4ファイル（LEDRA_CURRENT / DECISION_LOG / OPEN_QUESTIONS / NOTE_CANDIDATES）は、
置換後の文字列に目印を含めていたことを読み直して確認した。

**なぜ気づけなかったか**: 編集スクリプトは「件数1回の一致」を assert していたので、**一致したこと**を
**正しく置き換わったこと**と取り違えた。assert が見ていたのは置換前の文字列だけで、結果は何も見ていない。
型 A の「道具の出力を事実として扱う」が、検出器ではなく**編集の道具**で起きた形。
check:context-dates と check:ledger-ids は日付と ID を見る検査で、見出しの破損は見ない。

**再発防止**: 仕組み無し（判断に依存）。習慣として、事業ログへの先頭追記は**目印を見出しの行全体**にし、
置換後に `git diff` の該当ハンクを読んで、元の見出しが `-` 行に出ていない（＝消えていない）ことを確かめる。

---

## M-20261003-fixed-the-pr-body-and-left-the-business-logs-wrong レビューの指摘で PR 本文は訂正したのに、同じ誤りを書いた事業ログ4ファイルを直さなかった（2026-10-03・型 C）

**Before**: #1209 の `/code-review` が「断ってもストレージに孤児は残らない」「既存の経路がそのまま人の読める
メッセージを出す」の2つを誤りだと指摘した。私は**PR 本文を書き直し**、MISTAKE_LEDGER に
`M-20261002-checked-one-side-effect-and-called-it-no-orphans` を足して、訂正は済んだと思った。
同じ PR で RELEASE_LOG と LEDRA_CURRENT にも同じ理解で書いた文があることを見ていない。

**After**: マージ直後に事業ログを読み返して見つけた。**4ファイルに残っていた。**

1. **RELEASE_LOG**: 「既存のアップロード経路がそのまま人の読めるメッセージを出す」と**断定したまま** main に
   入っていた（実際は `uploadHandler` が `uploaded === 0` のときしか失敗を表に出さないので一部成功は HTTP 200 で
   通る。だから `c2paRefused` の 422 集約を足した）。
2. **LEDRA_CURRENT**: 「判定はストレージ書き込みの前なので孤児ファイルは残らない」。ストレージの話としては
   正しいが、`anchorToPolygon` が同じ `Promise.all` で走るため、**Polygon が有効かつ設定済みなら**送信は済んでおり
   取り消せない（無効・未設定なら送信前に返る。**この条件を書かずに断定したのを Codex に指摘された** —— 下の経緯参照）。
3. **OPEN_QUESTIONS**: 決着の記述が「ストレージ書き込みの前に断る（孤児ファイルを残さない）」のままで、
   **出荷した2段構え（先行検査の 503 ＋ 写真ごとの 422）が一言も入っていなかった**。
4. **DECISION_LOG の項目7（判断理由）**: 「断っても孤児ファイルは残らない」。同じエントリの同日追記で設計は
   訂正してあるのに、**判断理由そのものは誤ったまま**だった。

ついでに RELEASE_LOG の「2つの変異で当たりを取った」も、同じエントリの後半が3つ目の変異を書いているのに
**2**のままだった（型 F）。訂正の印を残し、元の文を消さない形で直した。

**この件自体で、同じ形を続けて3回やった。**

1. **1周目**: 最初にこのエントリを「事業ログ**2**ファイル」と記憶で書いた。下の再発防止に書いた grep を
   実際に走らせたら OPEN_QUESTIONS と DECISION_LOG が出て4ファイルになった。
   **自分で書いた再発防止を、書いた直後に自分が守っていなかった。**
2. **2周目**: その訂正文で今度は「オンチェーン送信は済んでおり取り消せない」と**条件を落として断定した**。
   `anchorToPolygon` は `POLYGON_ANCHOR_ENABLED` が false・鍵/コントラクト未設定・SHA-256 不正の3経路で
   **送信前に返る**（`polygon.ts:116` / `:119` / `:125`）。**「無害だ」の誤りを「必ず害がある」の誤りに差し替えていた。**
   同じく「422 で何枚目が欠けたかを返す」も、全滅時は `uploaded === 0` の分岐が先に返るので成り立たない。
   Codex（#1222・P2 3件）が指摘。
3. **3周目**: 再発防止に書いた grep の結果を「4ファイル」と書いたが、その grep は実際には**5ファイル**を返す
   （5つ目は訂正済みの本エントリ自身）。**再現手順と結果が合っていない再発防止**を書いていた。同じ指摘で発覚。

**3回に共通する形は「検証した事実と、書いた文の強さが合っていない」である。** 1周目は数えずに数を書き、
2周目は条件を落として断定し、3周目は手順と結果を突き合わせずに書いた。訂正のたびに文が強くなるのは、
**直したい気持ちが文体に出る**からで、誤りの方向が反転しただけで性質は同じである。

**なぜ気づけなかったか**: 「訂正する」を**レビューが指差した成果物を直す**ことだと解釈し、
**同じ誤解から派生した文の一覧**を作らなかった。PR 本文・RELEASE_LOG・LEDRA_CURRENT・MISTAKE_LEDGER は
同じ作業中に同じ理解で書いたので、1つが誤りなら残りも誤りである可能性が高い —— それを数えていない。
型 C の「同じ事実を2箇所に書いて片方だけ直す」が、コードではなく**自分の記録**で起きた形。
型 C の再発防止（入口を grep で数える）はコードの経路を数える習慣で、**文書の記述を数える**形になっていなかった。
より悪いのは、事業ログは後から検証できない唯一の出典だという点である。コードの誤りはテストが拾うが、
ログの誤文は誰も落とさない。

**再発防止**: 仕組み無し（判断に依存）。習慣として、**レビューや代表の指摘で主張を1つ取り下げたら、
その主張の語句で `docs/context/` を grep し、当たった全箇所を同じコミットで直す**。
今回の3語（「孤児」「人の読めるメッセージ」「ストレージ書き込みの前」）を親ツリー `e9dbb95e` に当てると
**5ファイル・28行**が出る（DECISION_LOG 11 / RELEASE_LOG 7 / MISTAKE_LEDGER 6 / OPEN_QUESTIONS 3 / LEDRA_CURRENT 1）。
**grep は当たりを絞るだけで、件数を出す道具ではない** —— 「孤児」は DB の孤児行にも使う語で、
MISTAKE_LEDGER の6行は訂正済みのエントリ本体である。**1行ずつ読んで、まだ誤りを主張している文だけを数える。**
そうして残ったのが4ファイルだった。
**件数は grep の出力を数えてから書く。**「2ファイル」と書いた時点で grep は走っていなかった
（CLAUDE.md の「件数を書いたら数え直す」が、自分の台帳の中で破れていた）。
あわせて、マージ直前の件数の数え直し（CLAUDE.md）は PR 本文だけでなく**事業ログの件数**にも掛ける。


## M-20261002-added-holy-inc-category-without-ledra-cms-list holy-inc に分類「イベント」を足したが、同じ分類一覧を持つ Ledra 管理画面側を見なかった（2026-10-02・型 C）

**Before**: holy-auto/holy-inc#14（Bizweek 出展のお知らせ）で、既存の分類に合うものが無いと判断し、holy-inc の
パーサに分類「イベント」（と英語表記）を足してマージした。holy-inc リポジトリの中だけで完結する変更だと思っていた。

**After**: マージ後に事業ログを更新する際、Ledra の RELEASE_LOG（2026-09-15）に「holy-inc は英語タイトルと4分類」
とあり、`src/lib/marketing/externalSites.ts` の `HOLY_INC_CATEGORIES` が**同じ4分類を写して持っている**ことに気づいた。
コメントには「勝手な訳を作らないよう既存の4分類に閉じる」とある。holy-inc 側だけ5分類になり、Ledra 管理画面からは
「イベント」を選べない。公開済み記事への実害は無い。Ledra 側の追加は OPEN_QUESTIONS に残した（英語表記を holy-inc
から写す必要があり、この記録の時点で holy-inc を読めないため推測で足さない）。
同日、代表の依頼で holy-inc から英訳 `Event` を写して `HOLY_INC_CATEGORIES` に追加した（RELEASE_LOG 2026-10-02）。

**なぜ気づけなかったか**: holy-inc の分類を「holy-inc のパーサだけが持つ事実」だと思い、**他リポジトリに写しがあるか**を
探さなかった。3サイト投稿の仕組み（2026-09-15）は Ledra 側に相手の検証規則を複製する設計で、それを知っていれば
最初に `HOLY_INC_CATEGORIES` を引けた。型 C の「同じ事実を2箇所に書いて片方だけ直す」が、リポジトリをまたいで起きた形。
型 C の再発防止（入口を数える）は**同じリポジトリ内**の grep で回しており、リポジトリ境界の外を数えていなかった。

**再発防止**: 仕組み無し（判断に依存。2リポジトリをまたぐ検査は現状無い）。習慣として、holy-inc / MobileWash の
**記事の書式・分類・必須項目**を変えるときは、先に Ledra で `externalSites.ts` を引き、写しを同じ日に揃える。

## M-20261002-delete-ignored-legal-retention 指定整備記録簿に消去 API を足したが、2年保存義務（record_retention_until）を確認しなかった（2026-10-02・型 B）

**Before**: G2（作成・更新・**消去**の自動記録）を満たすため、`inspection_records` に owner/admin 限定の
DELETE を足し、消去を監査ログに残してから物理削除する実装にした。監査ログの付随情報として
`record_retention_until` を**選んで読んでいた**のに、その値の意味（2年保存・保持期間中は消してはならない）を
消去の可否に結びつけていなかった。UI にも「消去」ボタンを足した。

**After**: code-review で2点指摘。(1) 保持期間中でも物理削除でき、2年保存義務と CASCADE で測定値ごと消える。
(2) 完成検査は作成時に必ず2年の `record_retention_until` が付くので、ボタンは実質常にブロックされるべきで無意味。
→ **消去 API と UI を撤回**。アプリに消去経路を持たないこと自体が保存義務に沿う、と整理し直した。保持期限後の
消去経路を将来設けるなら「期限経過の確認＋消去の監査」を必須にする、と OPEN_QUESTIONS に残した。

**なぜ気づけなかったか**: `record_retention_until` を監査ペイロードに**読んでいた**のに、「保存義務」という
**値の意味**を追わなかった（型 B そのもの —— 1段読んで止まる）。「消去の記録を残す」に気を取られ、
「そもそも消してよいのか」を問わなかった。保持列を触るコードを書くなら、まずその列が課す不変条件を言う。

**再発防止**: 仕組み無し（判断に依存）。習慣として、**保存期限・不変条件を持つ列**（`*_retention_until`、
`locked_at`、`void` 等）を読む/書くコードでは、**その列が禁止している操作**を先に一文で書いてから実装する。
`record_retention_until` 経過前の物理削除を禁じる検査は、消去経路を実際に設ける時に behavior 検査として足す。

## M-20261002-tls13-guard-scanned-providers-dir-only 外部連携の TLS 1.3 修正で providers だけを見て、cron の Polygon RPC を落とした（2026-10-02・型 C）

**Before**: 同じ日に `M-20261002-gpsa-o5-traced-upload-path-only` を書き、再発防止に「呼び出し元を grep で列挙してから書く」とした。
直後の #1215 で、Hive・Pinata・Polygon の呼び出しを `src/lib/anchoring/providers` 配下でだけ探して直し、テストもそこだけを走査し、
GPSA に「外部連携は TLS 1.3 最低」と書いた。

**After**: `/code-review` が `src/app/api/cron/polygon-signer/route.ts` の `http(config.rpcUrl)`（毎時の残高確認）を見つけた。
viem を import する src 全ファイルを走査するテストに広げ、cron も `tls13Fetch` にした（cron だけ戻すとテストが落ちることを確認）。

**なぜ気づけなかったか**: 「どこを探すか」をディレクトリ名（providers）で決めた。連携先は**ライブラリ（viem）と宛先ホスト**で
決まるのに、置き場所で探した。直前に書いた再発防止は「grep する」だったが、grep の**範囲**を決める基準を書いていなかった。

**再発防止**: 仕組みあり（一部）。`integrationsTls13.test.ts` が viem を import する src 全ファイルのトランスポートを見る。
- 習慣: 通信経路を数えるときは、ディレクトリではなく**ライブラリの import と宛先ホスト名**で `src` 全体を grep する。
- 前のエントリの再発防止が効かなかった理由: 「grep する」とだけ書き、何で grep するか（置き場所か、ライブラリ・ホストか）を書かなかった。

## M-20261002-gpsa-o5-traced-upload-path-only GPSA O.5 を写真アップロードの経路だけで書き直し、クライアント→Supabase の直通信と外部連携を落としたまま再提出させた（2026-10-02・型 C）

**Before**: Cloudflare で TLS 1.2 拒否を実測できたので、GPSA §2.5 を「クライアント→Backend は Cloudflare 経由で最低 TLS 1.3、
Backend→Supabase も最低 TLS 1.3」と書き直し、運用管理策 A02 を「HTTPS only, TLS 1.3 minimum」と言い切りに変えた。
文書だけの PR なので `/code-review` は省き、レビューの前に代表へ「送信前の確認はすべて完了」と伝え、代表が送信した。

**After**: 送信の数分後に Codex が #1213 で指摘。(1) Web とモバイルは Supabase の Auth・PostgREST・Storage に Cloudflare を
通らず直接つなぐ（`src/lib/supabase/client.ts`、`apps/mobile/src/lib/supabase.ts`）。§1.6 で Supabase を TOE 内としながら
§2.5 と TOE 図にこの経路が無い。(2) Full (strict) は Cloudflare→Vercel の最低 TLS 版を強制しない。(3) Hive・Pinata・Polygon は
素の通信で TLS 1.2 になりうるのに、A02 を言い切りにした。いずれもコードで確認した。送信済みの提出物に入っている。
A02 は正確な範囲に直し、穴3つを OPEN_QUESTIONS に記録した。追送するかは代表判断待ち。

**なぜ気づけなかったか**: O.5 を「写真がどこを通るか」で読み、**TOE 内の部品（Supabase）にクライアントがどこからつながるか**を
数えなかった。直前に `app` ホストの見落とし（同日・型 C）を直したばかりで、ホスト名は数えたのに経路は数えなかった。
さらに「文書だけだからレビュー不要」と扱ったが、審査に出す文書の一文は製品の主張そのもので、外に出たら直せない。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: GPSA の通信の節を書くときは、TOE 内の各部品について「誰が・どのクライアントライブラリで・どのホストに」つなぐかを
  `grep -rn "createClient\|createBrowserClient\|fetch(" src apps/mobile/src` で列挙し、表にしてから文を書く。
- 習慣: 審査・顧客など外に出す文書は、文書だけの PR でも送信前に `/code-review`（または Codex）を通し、
  レビューが返る前に「送ってよい」と言わない。

## M-20261002-closed-open-question-on-settings-screen-not-build-log 自分で「ビルドログで 16GB を見たら閉じる」と書いた未解決事項を、設定画面だけで閉じた（2026-10-02・型 G）

**Before**: 数時間前の #1210 で OPEN_QUESTIONS に「切り替え後のビルドログの `Build machine configuration` 行が 16 GB なら閉じる」
と自分で書いた。代表が Vercel の設定画面（Enhanced・16 GB）を共有したので、#1211 でその項を消した。LEDRA_CURRENT には
「確認したのは設定で、ビルドログは未確認」と書いていた。

**After**: Codex のレビュー（#1211）で指摘された。完了条件を満たしていないのに閉じている。「切り替えた」と回答があった後にも
8GB 機でビルドが走った前例（`5f54e29`）があり、設定画面は実ビルドの証拠にならない。項を残し、「設定は確認済み・実ビルドは
未確認」に書き換えた（6bcd9ce）。

**なぜ気づけなかったか**: 「設定が正しい」を「その設定で動いた」として扱った（型 G: 在ることを動くことの証拠にする）。
しかも「未確認」と同じ PR の LEDRA_CURRENT に自分で書いていた —— 未確認と書いた文と、項を閉じる操作が同じコミットに並んでいる。
完了条件を書いた本人が、条件を読み返さずに閉じた。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: OPEN_QUESTIONS の項を消す前に、その項の「確認したいこと／閉じる条件」の行を読み、満たした証拠をコミットメッセージに書く。
  書けないなら消さずに現状を追記する。
- 習慣: 同じ差分に「未確認」と書いたら、その事柄を「完了」として扱う操作（項を閉じる・チェックを付ける）を同じ差分でしない。

## M-20261002-tls-check-covered-www-but-app-host-is-app-ledra Cloudflare 手順書の確認対象を `www.ledra.co.jp` だけにし、Web とモバイルが実際に使う `app.ledra.co.jp` を落としていた（2026-10-02・型 C）

**Before**: 手順書 `cloudflare-tls13-runbook.md` の DNS 例（§1）と確認コマンド（§5）を `www` と apex だけで書き、
代表の `www.ledra.co.jp` での TLS 1.2 拒否の実測をもって GPSA O.5 を「Cloudflare 経由・TLS 1.2 拒否」と書き直した。
§0 では「モバイルの接続先が `www.ledra.co.jp` **など**の独自ドメインか確認」とだけ書いていた。

**After**: 再提出メールの文面を確かめるためコードを引くと、`apps/mobile/eas.json` の `EXPO_PUBLIC_API_URL` は
`https://app.ledra.co.jp`。`src`・`apps/mobile/src`・`eas.json` の自ドメイン URL も `app.ledra.co.jp` が最多（54件、`www` は1件）。
`app` が Cloudflare を通っていない（灰色雲）と、`CF_ORIGIN_SECRET` を入れた本番では写真アップロードが全部 403 になり、
TLS 1.2 も通る。同日に代表が確認し、`app` も Cloudflare 経由（TLS 1.2 は exit 35、`Server: cloudflare`）で実害は無かった。手順書・GPSA・図・メール下書きを `app` を含む形に直した。

**なぜ気づけなかったか**: 手順書を書いたとき、製品がどのホスト名で使われているかを**コードから引かず**、
サイトの顔である `www` を前提にした。確認コマンドも同じ前提で書いたので、代表の実測が通った時点で
「O.5 は実測済み」と読めてしまった。実測が正しくても、**測った対象が製品の経路でなければ証拠にならない**。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: インフラ手順書や GPSA にホスト名を書く前に、`grep -rhoE "https://[a-z0-9.-]*ledra\.co\.jp"` で
  コードとモバイル設定が実際に使うホストを数え、確認コマンドをそのホストで書く。
- 型 C の「入口が複数あるのに1本だけ見る」が、コードではなくホスト名で起きた形。

## M-20261002-checked-one-side-effect-and-called-it-no-orphans ゲートをストレージ書き込みの前に置いて「孤児は残らない」と書いたが、不可逆の送信は既に済んでいた（2026-10-02・型 C）

**Before**: 「本番で C2PA 署名に失敗したら保存を断る」を実装し、`processUploadedPhoto` の
ストレージ書き込み（`admin.storage.upload`）の直前にゲートを置いた。`admin` を触ったら落ちる
スタブでテストを書き、変異（ゲート無効化）で赤になることまで確かめた。そして PR 本文に
**「判定はストレージ書き込みの前なので、断っても孤児ファイルは残りません」**と書き、
**「既存のアップロード経路がそのまま人の読めるメッセージを出します」**と書いた。

**After**: `/code-review` が3件の致命的な指摘を出し、**4件すべて自分で追試して正しいと確認した。**

1. **「孤児は残らない」は誤り。** ゲートの直前で走る `invokeAllUploadProviders` は
   `signC2pa` と `anchorToPolygon` を同じ `Promise.all` に入れている。`anchorToPolygon` は
   `writeContract` → `waitForTransactionReceipt` を await するので、**ゲートに到達した時点で
   オンチェーン送信は完了している**（ガス消費・取り消し不能）。ストレージのファイルは残らないが、
   消せないものが残る。`POLYGON_ANCHOR_ENABLED` の既定が false なのが唯一の救いだった。
2. **「人の読めるメッセージが出る」も誤り。** `uploadHandler` は写真ごとの失敗を
   `lastFailure` に入れて `continue` し、**`uploaded === 0` のときしか表に出さない**。
   5枚中1枚だけ弾かれると HTTP 200 の「4枚アップロードしました」で終わる。
   **「黙って未署名」を「黙って写真が欠ける」に置き換えただけで、証明書は揃ったように見えるので
   むしろ悪い。**
3. **ピンがゲートを誤発火させる。** IPFS ピン（最大 20MB・「失敗したら null」の非ブロッキング）が
   `signC2pa` の中で素のまま await され、8 秒枠に入っていた。遅いと **署名は成功したのに
   `timeout` 扱いで写真が弾かれる**。
4. **nonce は先に焼かれる。** 単回 nonce の消費はループより前。既存の `ponytail:` が
   「全ファイルが落ちても実害は稀」と書いて許容していたが、**私のゲートはそれを常態にした。**

直し方: 本番モードなら **nonce・sharp・TSA・Polygon・ストレージより前**に署名器の有無を
先行検査して全体を 503 で断る（原因は写真に依らないので1枚ずつ弾く意味が無い）。写真ごとの
失敗には `c2paRefused` を立て、一部成功でも 422 で何枚目が欠けたかを本文に出す。
ピンは 3 秒で自分から打ち切る。

**なぜ気づけなかったか**: **副作用を1種類だけ数えて「無い」と言った。** 「孤児」と聞いて
ストレージのファイルしか思い浮かべず、**同じ `Promise.all` に不可逆の送信が同居していることを
見ていなかった**。`invokeAllUploadProviders` は読んでいた（`withTimeout` の fallback を直すために
開いている）のに、**自分の関心（c2pa の行）しか見ていなかった。**
もう1つは、**自分の return が呼び出し側でどう扱われるかを読まずに「メッセージが出る」と書いた**こと。
`{ ok: false }` を返す作法に揃えたのは正しかったが、揃えた先が一部成功を 200 で返すことは
確かめていない。**「既存の経路に乗せた」は「既存の経路が期待どおり振る舞う」の証拠にならない。**

**効いた仕組み**: **CLAUDE.md が義務化している `/code-review`。** コードは自分でテストし変異まで
確かめたのに、見つけたのはレビューだった。変異テストは**自分が想定した壊れ方**しか試せない。
（併せて、同じ回のレビューで自分のテストの嘘も1つ割れた —— dev-signed の失敗分岐を固定した
つもりのテストが、実は dev-signed では署名が成功するため一度も通っていなかった。
「ゲートを広げる」変異が捕まらないことで気づき、provider を差し替える形に直した。
**変異テストは書いた直後に両方向で回す**。）

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: **「ここで断れば副作用は無い」と書く前に、その行より前に走るものを1つずつ列挙する。**
  特に `Promise.all` の中は、自分が見たい1行だけでなく**全要素**を読む。
  不可逆なもの（送金・オンチェーン送信・外部への通知・単回トークンの消費）を名指しで確認する。
- 習慣: **自分の戻り値を呼び出し側で追う。** 「既存の作法に揃えた」で止めず、
  その作法が自分のケースで何を出すかを呼び出し側のコードで確かめる。
  とくに**ループの中で `continue` される失敗**は、集約のされ方を必ず読む。
- 仕組み: コード変更を含む PR では `/code-review` を必ず通す（CLAUDE.md の既存ルール）。
  今回はこれが唯一の発見経路だった。**自分のテストが緑でも、レビュー前に「直った」と言わない。**


## M-20261001-acted-on-dependabot-pr-without-checking-it-was-closed 閉じていた Dependabot PR を「main と競合」と書き、作り直しのコメントまで投稿した（2026-10-01・型 F）

**Before**: #1191 の PR 本文に「Dependabot #1181 は main と競合している」と書き、マージ後に #1181 へ
`@dependabot recreate` を投稿した。根拠は、数時間前に取った #1181 の `mergeable_state: dirty` だけだった。

**After**: #1181 は Dependabot 自身が 13:11 UTC に「不要になった」として閉じており、後継の #1190（さらに #1193）が
出ていた。投稿したコメントはこのセッションの投稿経路でメンションが無効化されており、Dependabot には届いていなかった
（実害なし）。#1190 も、代表から「1190」と言われた時点で既に閉じていた。

**なぜ気づけなかったか**: 前に取った PR の状態を、行動する時点の状態として使った。`mergeable_state` は見たが
`state`（open/closed）を見ていない。Dependabot の PR は新しい依存更新や main の変化で**自動で閉じ・作り直される**ので、
番号は数時間で別物になる。さらに「コメントで Dependabot に指示できる」と、自分の投稿経路で確かめずに前提にした。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: PR に対して何かする（コメント・マージ・本文で言及）直前に、その PR を取り直して `state` と head を見る。
  Dependabot の PR は特に、番号ではなく「今開いている minor-and-patch の PR」を一覧から引き直す。
- 事実: このセッションからの GitHub 投稿では `@dependabot` のメンションが無効化される。Dependabot への指示が要るときは、
  `.github/dependabot.yml` を変えるか、代表に GitHub 上で直接コメントしてもらう。

## M-20261002-relayed-the-notes-framing-as-the-fix 「依存区分を移せばランタイムの fail-open が閉じる」と繰り返し報告した（2026-10-02・型 B）

**Before**: 代表への判断待ち一覧で、C2PA の項をこう書き続けた ——
「`@contentauth/c2pa-node` を `optionalDependencies` → `dependencies` へ移すか。
**移せば Vercel ランタイムの fail-open が閉じます**が、ネイティブビルドが失敗する環境では
`npm ci` 自体が丸ごと落ちるようになります」。同じ文をこのセッションで何度も出し、
チェックインの引き継ぎプロンプトにも書いた。出所は OPEN_QUESTIONS の既存エントリで、
そこには「ランタイム（Vercel）でのフェイルオープンは塞げていない。下の【要確認】と同じ論点」
とあり、その【要確認】は「本番で `@contentauth/c2pa-node` が実際に入っているか」だった。
**つまりノートは「インストールの問題」として枠を作っていて、私はその枠をそのまま中継した。**

**After**: 代表の「黙って未署名はダメだ」で初めて `signC2pa` を読んだ。**塞がらなかった。**
黙る出口は6本あり、(a) 署名器が作れない (b) 出力バッファ無し (c) 署名中の例外
(d) `withTimeout` の打ち切り (e) disabled (f) 成功 —— **(a)〜(d) のすべてが (e) と同じ
`DISABLED_RESULT` を返していた**のが根だった。依存区分が効くのは (a) のうち「モジュール不在」だけで、
証明書不正・鍵不正・env 未投入・c2pa-rs のエラー・タイムアウトは全部残る。
`C2paResult` に `failure` を足して区別できるようにし、本番では保存を断るようにした（DECISION_LOG 同日）。

**なぜ気づけなかったか**: **自分の（あるいは過去の自分の）ノートの要約を、コードの実態として読んだ。**
OPEN_QUESTIONS の「ランタイムのフェイルオープン」という語は症状の名前で、どの経路で起きるかは
書いていない。にもかかわらず「依存区分で塞がる」という因果を足して代表に渡した。
`signC2pa` を開けば5分で分かる話で、**一次情報（コード）はいつでも手元にあった。**
しかも悪いことに、これは代表が**外部との判断に使う値**だった（§3 の急所）。
「判断待ち」として並べ続けたことで、誤った因果が何度も強化された。

**効いた仕組み**: 無い。**気づかせたのは代表の言い直しである。** 代表が名指しの解決策（依存区分）ではなく
問題（黙って未署名）を言ったので、私は初めて解決策から問題へ戻った。
常設指示書 §1 は「依頼が解決策を名指ししているとき、根底にある問題を一文で言い直せ」と書いてあるが、
**私はそれを「依頼を受けたとき」にしか適用しておらず、「自分が提案を書くとき」には適用していなかった。**

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: **判断待ちとして代表に出す項目は、その提案が問題を解くことをコードで確かめてから出す。**
  「Xすれば Y が閉じる」と書く前に、Y が起きる経路を全部 grep して数え、X が何本塞ぐか言えるようにする。
  本数が言えないなら「Xすれば閉じる」と書かない。
- 習慣: **既存のノート・OPEN_QUESTIONS を根拠に使わない。** あれは過去の自分の読みであって一次情報ではない。
  ノートの語（ここでは「ランタイムのフェイルオープン」）を因果の説明に昇格させるときは、
  その語が指すコードを開く。
- 習慣: **同じ文を2回以上出していることに気づいたら、そこで一度出所を確かめる。**
  繰り返しは確度を上げない。今回は繰り返しが確度の錯覚を作った。
  （型 A の `M-20260921-restated-my-own-summary-as-fact` と同じ根。その型の再発防止は
  「文書に書く前に開く」の形だったので、**会話で繰り返す場面に効かなかった。**）


## M-20261002-asserted-conformance-impact-from-our-own-gpsa 規格文書を開かずに「審査では重い」と代表に言った（2026-10-02・型 F）

**Before**: 代表から「C2PA の `optionalDependencies` → `dependencies` は C2PA の審査にも影響する？」と聞かれた。
社内資料（`docs/c2pa-gpsa.md` §2.3 の O.3、`docs/c2pa-conformance-gap-analysis.md`、`docs/c2pa-conformance-application.md`）と
コード（`signC2pa` が catch で `DISABLED_RESULT` を返すフェイルオープン）を読み、こう答えた ——
「依存区分そのものは審査項目に無い。ただし**ランタイムのフェイルオープンは、提出する GPSA が
『claim 署名』を TOE 内と宣言しているのに本番で署名していない状態を作る。これは提出物と実態のズレで、
パッケージングの話より重い**」。

**After**: 代表の「取って」で一次資料（`c2pa-org/conformance-public` の
`docs/v0.2/C2PA Generator Product Security Requirements.md`）を clone して読んだ。
**「審査では重い」は誤りだった。** 脅威モデル T.1〜T.6 の6つすべてが「偽の来歴を作る／鍵を盗む／
改ざんする／傍受する」側で、**「署名しない」は脅威に入っていない**。未署名の画像は世の中の既定状態なので
C2PA から見て攻撃ではない。O.3・O.4 の Level 1 要件は「依存に SCA/SBOM を掛けて NVD 脆弱性を検出」
「CRITICAL/HIGH を90日以内に修正」の2つだけで、Dynamic Evidence は "No stipulation"。
**フェイルオープンは O.1〜O.6 のどの指摘にもならない。** プロダクトの問題（写真が黙って未署名になる）
であって、適合性の問題ではなかった。訂正して OPEN_QUESTIONS に根拠付きで記録した。

**なぜ気づけなかったか**: **社内の GPSA を「要件そのもの」として読んだ。** GPSA は要件への
*こちらの主張*であって、要件の原文ではない。O.3 の社内記述（SCA/SBOM と90日ポリシーの2点）を見て
「要件はこの2点」とは受け取らず、逆に「ここに書かれていない観点（配備の完全性）が原文にあるかもしれない」と
疑ったのに、**疑ったまま原文を開かずに結論だけ先に口に出した**。
一次資料は `git clone` 1本で取れる場所にあった（型 F）。
加えて、脅威モデルを見ていれば「C2PA が何を守ろうとしている規格か」は最初に分かった ——
守っているのは**偽の来歴から見る人を守ること**で、署名率ではない。目的を確認せずに
「提出物と実態のズレ」という一般論の尺度を当てた。

**効いた仕組み**: 常設指示書 §6 の自己攻撃。送信前に「結論が間違っているとしたら」を書いたところ、
まさにこの穴（O.3 の原文に配備完全性の条項があるかもしれない）が出て、「決着させる1手」として
原文の §6.3 を読むことを答えに明記した。代表がそれを選んで「取って」と言い、修正に至った。
**穴は答えの中で自分から名指しできていた。足りなかったのは、名指ししたなら口に出す前に読む、という一段。**

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: **外部の規格・規約・契約が何を要求するかを述べるときは、社内資料ではなく原文を引く。**
  原文を開いていないなら、結論を言わずに「原文未読」と言って取りに行く。
  社内資料は「原文をこう読んだ」という主張として扱い、根拠にしない。
- 習慣: 規格の個別要件を当てる前に**脅威モデル／目的の節を読む。** 何を守る規格かが分かれば、
  当てる要件を間違えない。
- 習慣: **§6 の自己攻撃で「これを1つ確認すれば決着する」と書けたものは、送信前に確認する。**
  書いて送るだけでは、確認コストを読み手に渡しているだけになる。
  （先行例 `M-20261001-cited-sources-i-never-opened-in-decision-log` は「事業ログに書く前に開く」の形で
  同じ根を持つ。その習慣を**文書に書く場面にしか適用していなかった**のが、今回効かなかった理由。
  代表への口頭の答えも、代表が外部とのやりとりで使う以上、同じ強さで扱う必要がある。）

## M-20261002-said-no-mechanism-without-reading-the-workflow-that-exists 「仕組みで止められていない」と未解決に書いたが、仕組みは既にあった（2026-10-02・型 F）

**Before**: #1174 の版番号が main に追い越された件について、DECISION_LOG の「まだ答えが出ていないこと」に
「**この形を仕組みで止められていない。** `lint:migrations` は PR の CI で赤くなるが、CI が回った後に
main が進むと赤くならないままマージできる」と書き、代表への報告でも同じことを言った。
`.github/workflows/` を一度も開いていない。

**After**: `.github/workflows/stale-migration-check.yml` が**まさにこれを見る仕組み**だった。
毎日 00:20 UTC に open PR の日付を `lint:migrations` で再検査し、追い越されていれば PR に
コメントを貼る（2026-09-05 の代表判断で入り、ヘッダーのコメントに「このリポジトリで4回起きている」と
経緯まで書いてある）。無いのではなく、**働かなかった**。
働かなかった理由を実測した: #1172 が版を入れたのは `2026-09-29 14:54 UTC`
（`git log -1 --format=%cI e37b2db3`）、マージは同日 15:22 UTC。**その28分の間に cron は走っていない。**
契機が「時間」であって「main が動いたこと」ではなかった。`push: branches: [main]` の契機を足した。

**なぜ気づけなかったか**: **「無い」と書く前に探さなかった。** 自分が踏んだ穴なので
「仕組みが無いから踏んだ」と因果を先に決め、仕組みの有無を確かめる手順を飛ばした。
`ls .github/workflows/` は1コマンドで、ファイル名（`stale-migration-check.yml`）だけで当たりがつく。
前日に `M-20261001-cited-sources-i-never-opened-in-decision-log` で
「X が禁じている、と書く前に X を開く」を習慣に足したが、**それは肯定の主張についての習慣で、
「無い」という否定の主張には適用していなかった**。型 F の定義にある
「1コマンドで確かめられる事実を確かめない」そのもの。
さらに悪いのは、**既にある仕組みを「無い」と報告すると、代表が二重に作る判断をしうる**こと。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: **「仕組みが無い」「検査が無い」「前例がない」と書く前に、探した場所を同じ行に書く。**
  探した場所を書けないなら探していない。CI の話なら最低限 `ls .github/workflows/` と
  `grep -rl <主題の語> .github/ scripts/`。
- 習慣: 自分が踏んだ穴について「仕組みが無いから」と書きたくなったら、
  **「あるのに働かなかった」側を先に疑う。** 働かなかった理由のほうが、無いことより直しやすい
  （今回は契機の種類を1つ足すだけで済んだ）。

---

## M-20261001-duplicated-an-open-pr-for-four-days 同じ GPSA 是正を進めている open PR #1173 を確かめずに PR #1183 を作り、4日分の作業を重複させた（2026-10-01・型 F）

**Before**: 2026-09-29、代表から GPSA 審査の結果（DOES NOT MEET）を受け取り、「Path A で直す」と提案して Ledra を
クローンし、`c2pa.ts`・GPSA 文書・構成図・事業ログを直して PR #1183 を開いた。その後も CI・コンフリクト・脆弱性勧告への
対応で4回 push した。この間、open PR の一覧は一度も引いていない。

**After**: 2026-10-01、`npm audit` の勧告を直す PR が既に無いか探すために open PR を一覧したところで、
**PR #1173「Conformance 不適合の是正（c2pa.opened＋原本 ingredient、ルーブリック、TLS 1.3 前段）と証拠一式」**を見つけた。
2026-09-27 から別セッションが同じ審査結果を直していて、範囲も深さも #1183 より上（原本 ingredient の位置情報の redaction、
Cloudflare 前段、crJSON ハーネス、提出版の英語 GPSA）。#1173 は #1183 の `tls13Fetch` を取り込み済みだった。
#1183 はクローズし、#1173 に無い部分（公開文言の訂正と、この台帳）だけを別 PR に切り出した。

**なぜ気づけなかったか**: 依頼が「審査結果を直す」という**新しい依頼に見えた**ので、既存の作業を探す段階を飛ばした。
`M-20260918-called-it-untraceable-without-checking-open-prs` と `M-20260919-said-no-open-pr-has-it-again` の再発防止は
「出所が分からない」「どこにも無い」と**書く前**に open PR を引く、だった。今回は何かが「無い」と書く場面ではなく、
**作り始める場面**だったので、その習慣が発火しなかった。再発防止の発火条件が、書く場面に限られていたのが根。

**再発防止**: 仕組み無し（判断に依存）。習慣を広げる ——
**新しいブランチを切る前に、対象のファイル名と主題の語で open PR を引く**（`gh pr list --search` か GitHub API の
`pulls?state=open` を題名・変更ファイルで照合）。「書く前」だけでなく「作る前」も同じ確認をする。

---

## M-20260929-swapped-fetch-broke-formdata-uploads Supabase クライアントの fetch を undici パッケージの fetch に丸ごと差し替え、Storage の multipart アップロードを壊した。対象の洗い出しでは proxy.ts を grep から自分で除外していた（2026-09-29・型 A、併せて型 C）

**Before**: GPSA O.5 のために、Backend → Supabase を TLS 1.3 に固定しようとした。undici パッケージの `fetch` と
`Agent({ connect: { minVersion: "TLSv1.3" } })` を組み合わせた関数を作り、サーバー側の Supabase クライアント4つの
`global.fetch` に差し込んだ。テストは「1.2 のみのサーバーを拒否する」実ハンドシェイクだけだった。クライアントの洗い出しは
`grep ... | grep -v "src/lib/supabase/\|__tests__\|src/proxy.ts"` で行い、GPSA に「サーバー側の全 Supabase クライアントに適用」と書いた。

**After**: PR #1183 の `/code-review` が2点を指摘し（コードはその後 PR #1173 に取り込まれた）、どちらも再現した。
(1) undici パッケージの fetch は Node 組み込みの `FormData` を FormData と認識せず、`"[object FormData]"`（17 バイトの
text/plain）として送る。storage-js は Blob/File を `new FormData()` で包むので、**service-role 経由の Blob/File アップロードが
全部壊れる**。`Request` 入力も解釈できない。Next がパッチした fetch も通らなくなり、計測とメモ化が外れる。
(2) `src/proxy.ts` の `createServerClient` 3箇所と `public.ts` が未適用だった。proxy.ts は、洗い出しの grep から**自分で除外していた**。
fetch 本体はグローバル（Next 版）のまま、dispatcher だけを渡す形に直した。本文が壊れないテストを足し、8箇所すべてに適用した。

**なぜ気づけなかったか**: 差し替えた fetch を「同じ fetch」とみなし、**型のキャスト（`as unknown as typeof fetch`）で
非互換を黙らせた**。テストは「足した性質（TLS 版）」だけを見ていて、「差し替えで失いうる性質（本文の形・入力の型）」を
見ていなかった（型 A: 自分の想定だけで検証した）。proxy.ts の除外は、別の目的（呼び出し元の一覧を短くする）で書いた
フィルタを、そのまま「対象の全数」を数えるのに使ったため（型 C: 入口を全部見ていない）。

**再発防止**: 仕組みあり（PR #1173 に取り込まれた `tls13Fetch.test.ts` が、マージ後に FormData/Blob と Request の本文を実サーバーで検査する。undici の fetch に
戻すと落ちることを確認済み）＋習慣。
- 習慣: 標準の関数を別実装に差し替えるときは、**差し替えで失いうる性質を1つ挙げてテストに入れる**。キャストで型を黙らせたら、
  それは非互換のしるしとして扱う。「全部に適用した」と書く前に、**除外のない grep で対象を数え直す**。

---

## M-20260929-assumed-ingredient-needs-original-bytes 「ingredient には原本を埋め込む必要がある」と確かめずに決め、`c2pa.opened` を捨てて `digitalCapture` を主張した（2026-09-29・型 A、併せて型 B）

**Before**: 2026-09-03、C2PA 2.x の `c2pa.opened` は ingredient の参照が必須だと分かった。そこで「ingredient にするには
原本を埋め込むことになり、原本は GPS を含むので使えない」と判断した。先頭アクションを `c2pa.created`＋`digitalCapture` に替え、
2026-09-04 には入力をカメラ撮影に限定して「これで `digitalCapture` は正当」とした（DECISION_LOG 2026-09-03 / 09-04）。

**After**: GPSA 審査（2026-09-28）で O.4 **DOES NOT MEET**。撮影クライアントを TOE の外に置いた Backend が、撮影を
署名で主張していた。UI の制限は Backend から検証できないので、主張の根拠にならない。加えて、前提そのものが誤っていた。
c2pa-node の `addIngredient` は**原本のバイト列なしで、定義（タイトル・形式・関係）だけを受け付ける**。その形なら
`c2pa.opened` は検証を通り、サムネイルも上流マニフェストも持ち込まない（2026-09-29、実署名→検証で確認）。
先頭を `c2pa.opened` に戻し、撮影主張をやめた（PR #1183。同じ方向の PR #1173 に一本化した）。

**なぜ気づけなかったか**: `addIngredient` に原本を渡す形しか試さず、「ingredient＝原本の埋め込み」を API の性質として
扱った（型 A: 判断の根拠にした道具の挙動を確かめていない）。また「カメラ限定の UI にしたから撮影と言える」は、
**主張している主体（Backend）がそれを検証できるか**を見ていなかった（型 B: 仕組みが「ある」ことを「保証されている」と読んだ）。
GPSA 本文には限界として書いていたが、その限界がそのまま審査の非適合理由だった。

**再発防止**: 仕組みは PR #1173 の行為台帳テスト（先頭が `c2pa.opened`、opened に digitalSourceType を付けない）が
マージ後に担う（#1183 で書いた同種の検査は、#1183 のクローズで main には入らない）＋習慣。
- 習慣: 「この API ではできない」と書く前に、**引数を減らした最小の形**（今回はバイト列を渡さない形）を1回試す。
  署名で何かを主張するときは、**その主張を署名者自身が検証できるか**を1行で書き出す。書けないものは主張しない。

---

## M-20261001-new-loader-dropped-query-error-unlike-siblings 新しく書いた元帳票の取得関数で、クエリの `error` を見ずに空配列を返していた（2026-10-01・型 J）

**Before**: 合算請求書の内訳表示（#1196）のため、`src/lib/documents/consolidatedSources.ts` に元帳票を引く関数を書いた。
`const { data } = await client.from("documents")...` と `data` だけ受け取り、`data ?? []` で並べ替えて返した。
テスト・型チェック・lint は通り、そのまま push した。

**After**: `/code-review` が「クエリが失敗すると `[]` が返り、詳細画面・PDF・顧客共有から内訳が黙って消える。
顧客は内訳の無い合算請求書を受け取り、誰も気づかない」と指摘した。マージ前に `logger.warn` で記録するよう直した（`39651bb`）。
内訳は請求額を変えない参考情報なので、取得失敗でも帳票本体の表示・PDF は止めない判断はそのままにした。

**なぜ気づけなかったか**: 同じ PR で呼び出し元にした `pdfShare.ts` は、文書・テナントの取得失敗をすべて `logger.warn` で
残している。それを読んでから関数を書いたのに、新しく書いた関数には持ち込まなかった。
「失敗しても空なら画面は壊れない」と表示側の安全だけを考えて、**黙って欠けた PDF が顧客に届く**ことを失敗として数えていなかった。
テストは「成功時に内訳が出る」しか見ておらず、取得失敗の経路は1本も通していない。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: Supabase の `{ data }` だけを受け取る分割代入を書いたら、同じファイルや呼び出し元の兄弟が `error` をどう扱っているか見て揃える。
  「失敗したら空」で続ける場合も、ログは必ず残す。
- 習慣: 外（顧客）に出るものを組み立てる関数は、「失敗したら何が届くか」を1行で言えるようにしてから push する。

## M-20261001-grep-filtered-vitest-summary-again vitest の出力を再び `grep "Test Files|Tests|FAIL"` で絞り、その件数を事業ログに書いた（2026-10-01・型 A）

**Before**: #1196 の検証で、vitest を `| grep -E "Test Files|Tests|FAIL"` で流して「21 passed / 149 passed」を読み、
RELEASE_LOG に「vitest（帳票関連 21 ファイル）緑」と書いた。

**After**: マージ後に事業ログを書く前に MISTAKE_LEDGER を読んで、`M-20260927-grep-filter-hid-vitest-errors-line` と同じ形だと気づいた。
出力をファイルに落として、終了コードと要約の塊（`tail`）で取り直した。結果は exit=0・21 files・149 tests で、
`Errors` 行は無く、書いた件数は正しかった。CI の Lint, Type Check & Unit Tests も緑だった。**今回は害が出なかっただけ**である。

**なぜ気づけなかったか**: 前回の再発防止は「習慣」で、**台帳を読む時点（作業の終わり）まで思い出す手がかりが無かった**。
テストを流すコマンドは手が覚えている形を打つので、習慣を書いただけでは打つ瞬間に止まらない。

**再発防止**: 仕組み無し（判断に依存）。前回の習慣は効かなかった。
- 習慣: テストの件数を文書に書く直前に、そのコマンドが `grep` を含んでいないかを見る。含んでいたら書かずに取り直す。
- 仕組みの候補: `npm test` 相当のスクリプトが要約3行と終了コードを1行で出すようにすれば、絞る理由が無くなる（未着手）。

## M-20261001-said-fix-reaches-production-before-deploy-checked critical 修正のマージ報告で「本番にも届く」と書き、本番デプロイの失敗を見ずに作業を閉じた（2026-10-01・型 F）

**Before**: #1184（next 16.3.8 の critical 修正を含む）をマージし、代表に「本番の Vercel にもこの修正が届きます」と
報告した。注意点に「本番デプロイの成功は未確認」とも書いたが、確認はせずに PR の監視を外し、作業を閉じた。

**After**: 代表の「他にやれることある？」を受けて main のコミットステータスを見たら、`5f54e29` の Vercel 本番デプロイは
13:14 UTC に**失敗**していた。本番は修正前の版（next 16.3.5）のままだったと推定され、代表の再デプロイで 13:36 UTC に
直った。確認は `curl https://api.github.com/repos/<repo>/commits/<sha>/status` の1コマンドで済んだ。

**なぜ気づけなかったか**: `M-20260919-green-ci-read-as-production-applied` と同じ形 —— 確認の範囲が PR の中
（CI・レビュー・マージ）で閉じていて、マージの先（本番に届いたか）を見ていない。前回の再発防止は「マージ後の
`db-migrate` を見る」と DB に寄せて書いていて、**Vercel のデプロイも「マージの先」だ**という一般化をしていなかった。
「未確認」と注意点に書いたことで、確認した気になった（書くことが確認の代わりになった）。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: main へのマージを報告する前に、マージコミットのステータス（Vercel 本番デプロイ・`db-migrate`）が success になるのを
  見てから「本番に届いた」と書く。待てないときは「届いた」と書かず、確認の予約（send_later）を残してから閉じる。
- 習慣: 注意点に「未確認」と書いたら、それは次にやる作業の一覧でもある。書いた時点で、いつ誰が確認するかを決める。

## M-20261001-wrote-not-observed-over-my-own-vercel-font-record 同じファイル群に「Vercel でも落ちた」記録があるのに、判断ログに「Vercel では観測なし」と書いた（2026-10-01・型 F）

**Before**: #1184 で CI のフォント取得失敗に1回の再試行を入れ、DECISION_LOG 2026-09-29 の「まだ答えが出ていないこと」に
「Vercel 側のビルドでも同じフォント取得失敗が起きうるか（今のところ観測なし）」と書いた。「以前の考え」には
「フォントは同梱されるので問題ない」と書き、再試行を初めて検討する案のように扱った。

**After**: Codex のレビュー（#1184、04a5ea8）で指摘された。OPEN_QUESTIONS の 2026-09-23 項に、**2026-09-24 に Vercel の
デプロイが同じ失敗で落ちた記録（再発の記録 2回目、#1114）**があり、そこでは「(f) リトライを足す」を一度**不採用**にしていた。
DECISION_LOG の記述を訂正し、再試行は CI の誤検知を止める目的に限ること、Vercel の経路は無防備のままであることを書いた。
OPEN_QUESTIONS の項は閉じずに、3回目（#1172）を再発の記録に足した。

**なぜ気づけなかったか**: OPEN_QUESTIONS から消したのは 2026-09-29 に自分が足した項だけで、同じ主題の古い項（2026-09-23）を
`grep` しなかった。「この判断の材料は今回の PR で見たもの」と範囲を自分で狭め、**これから書くログ自身に、既に矛盾する
記述が無いか**を見ていない（型 F の定義にある形そのもの）。型 F の再発防止は「1コマンドで確かめられる事実を確かめる」だが、
「観測なし」という**否定の主張**は、確かめる対象を思いつかないと素通りする。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: 「観測なし」「前例なし」「初めて」と書く前に、主題の語（今回なら `フォント` / `Google Fonts`）で `docs/context/` を
  `grep` し、ヒットした項を開いてから書く。否定の主張は、探した場所を同じ行に書く。
- 習慣: OPEN_QUESTIONS の項を閉じるときは、同じ主題の他の項も同じ grep で拾い、閉じるか追記するかを1件ずつ決める。

## M-20261001-reported-applied-migrations-as-not-applied 「本番未適用」と事業ログに書き、代表にもそう報告した。実際は main にマージした時点で適用済みだった（2026-10-01・型 C＋F）

**Before**: #1174（`20260929150200` / `20260929150300`）を main にマージしたあと、`db-migrate` の
ワークフローを手で回していないので「**本番未適用**」と判断した。LEDRA_CURRENT に「まだ本番には当てていない」、
RELEASE_LOG の見出しに「本番未適用」、残作業として「`db-migrate` の実行と結果確認」を書き、
代表への報告でも「本番適用まで進めますか」と聞いた。本番の台帳は一度も引いていない。

**After**: Codex のレビューが「Branching が未停止なのに未適用と記録してよいのか」と指摘。
本番に読み取りのみで問い合わせたら、**適用台帳に両方とも入っていた**（`list_migrations`）。
列定義も実際に変わっており、`job_orders.status` の既定は `'pending'::text`、`insurer_users.role` は
`'viewer'::text`。既定が自表の CHECK の許可配列に含まれることも定義から確認した
（`job_orders_status_check` / `insurer_users_role_check`、どちらも `convalidated: true`）。
つまり**直したかったものは既に直っており、残作業は存在しなかった**。
LEDRA_CURRENT / RELEASE_LOG / NOTE_CANDIDATES を実測に合わせて訂正した。

**なぜ気づけなかったか**: **同じコミットで「本番に書き込む経路は2つある」と自分で書いておきながら、
状態の判断では経路 (a) だけを見た。** しかも (a) は「自分が実行したか」で、(b) は「main に入ったか」である。
マージした瞬間に (b) の条件は満たされていたのに、「自分がまだ何もしていない」を
「本番は変わっていない」と読み替えた。`list_migrations` は1コールで、PR を開く前にも打てた。
型 F（確認できる事実を確認しない）と型 C（経路を1本しか見ない）が同時に出ている。
さらに悪いのは、**この誤りを代表への報告（残作業・判断待ち）にそのまま載せた**こと。
誤った「未適用」は、次に `db-migrate` を回す・回さないの判断を狂わせる。

**再発防止**: 仕組み無し（判断に依存）。lint は事業ログの状態記述を検証しない。
- 習慣: **「本番未適用」「本番適用済み」と書く前に、本番の適用台帳を引く**（Supabase MCP の
  `list_migrations`、または版番号を名指しした `schema_migrations` の select）。読み取りだけなので
  省く理由がない。`db-migrate` を回したかどうかは**根拠にならない**。
- 習慣: 台帳に在ることと、DDL が効いていることは別。**列定義・制約も1クエリ読む**。
- 根の問題として、`supabase/migrations/**` は main に入ると誰も実行しなくても本番へ入る。
  OPEN_QUESTIONS の「Branching の自動適用を切る」が未実施である限り、
  **「まだ当てていない」と書ける状態は存在しない**。

## M-20261001-cited-sources-i-never-opened-in-decision-log 事業ログの「理由」欄に、開いていないファイルを出典として書いた2件（2026-10-01・型 C＋F）

**Before**: #1174 のマージを DECISION_LOG に起こすとき、2つの根拠を記憶から書いた。
(1)「古い版番号のままマージすると本番の `supabase db push` が止まり、**この2本だけでなく以降のすべての
マイグレーションが本番へ届かなくなる**」。(2)「`supabase/migrations.allowlist` へ足す案は **CLAUDE.md が
禁じている**」。どちらも数字ではないので、出典を名指しする手順（§4）を通していない。

**After**: Codex のレビューが2件とも誤りだと指摘し、どちらも1コマンドで確認できた。
(1) `.github/workflows/db-migrate.yml` に、本番の台帳に書く経路が**2つ**あることが書いてある ——
(a) この Actions の `supabase db push`（順序に厳密・out-of-order で exit 1）と
(b) Supabase の GitHub 連携（Branching、**順序を見ない**・main への push で本番へ当てる・Actions にログが出ない）。
2026-08-26 に postgres_logs で (a) の失敗から **22秒後**に (b) が適用した実測まで載っている。
つまり「届かなくなる」ではなく「赤いログと本番の台帳が食い違う」が起きる。
(2) 禁止規則は `supabase/migrations.allowlist` の先頭コメント（`DO NOT add new entries here.`）にあり、
**CLAUDE.md には allowlist の語が1度も出てこない**（`grep -rn allowlist CLAUDE.md .claude/` が0件）。
DECISION_LOG の項目4・6・7を直し、項目8に経路が1本に絞れていないことを未解決として足した。

**なぜ気づけなかったか**: **数字には出典を要求したのに、「理由」と「影響」の文には要求しなかった。**
件数・日付は `wc -l` や `date -u` を通す習慣があるのに、「◯◯が禁じている」「◯◯すると全部止まる」という
**規則と因果の主張**は、文章だから検算の対象外だと扱っていた。どちらも PR 本文に書いた数字と同じく、
読んだ人が自分で確かめずに行動する主張である。しかも(1)は「経路は2つある」と**同じリポジトリが明示的に警告している**
事柄で、過去に2回この経路の食い違いでやらかしている（型 C の常習）。記憶の中では「止まる」で完結していた。

**再発防止**: 仕組み無し（判断に依存）。lint は文章の出典を見ない。習慣で止める。
- 習慣: 事業ログ・PR 本文に **「Xが禁じている / Xに書いてある」と書く前に、その X を開いて語で grep する**。
  開かずに書けるのは「自分がこのセッションで変更した内容」だけ。
- 習慣: **「こうすると全部止まる／全部届かない」と書く前に、その経路が1本だと確認する。**
  本番への書き込み経路については `db-migrate.yml` の「なぜ台帳が勝手に進むのか」の節が唯一の出典。
- 事業ログの「判断理由」「違和感・問題」の欄も、§4（数値・日付の検証）と同じ扱いにする。

## M-20260930-diagnosable-fix-left-without-anyone-watching 「失敗理由を記録する」修正で止め、記録を誰が見るかを決めず、原因が出てから17日放置された（2026-09-30・型 B）

**Before**: 2026-09-08、「請求書のメール送付が出来ない」報告に対し、失敗理由が握り潰されていたのを直した
（理由を `document_share_log.error_message` に残す）。「次に失敗すれば原因が分かる」と OPEN_QUESTIONS に書き、
代表への確認事項（Resend ダッシュボード・環境変数）を並べて作業を終えた。

**After**: 9/13 に代表が4回送り直し、4回とも `resend(403) The ledra.co.jp domain is not verified` が記録された。
原因はこの時点で分かっていた。だが通知の仕組みが無く、OPEN_QUESTIONS も「未特定」のまま。9/30 に代表が
スクリーンショットで「修正できてなかったの？」と聞くまで17日間、誰も気づかなかった。
メール以外の経路（アプリのベル＋運営 Slack）で失敗を知らせるようにし、OPEN_QUESTIONS を原因特定済みに更新した。

**なぜ気づけなかったか**: **部品（診断できること）が直ったことを、報告された症状（送れない）が片付いたことと読んだ。**
9/8 の修正は「次の失敗を誰かが見る」ことを前提にしていたが、その「誰か」と「いつ」を決めていなかった。
見に行かなければ分からない記録は、報告者から見れば何も変わっていない。さらに、壊れているのがメールなので、
仮にメールで知らせる仕組みがあっても届かなかった。

**再発防止**: 仕組みあり（帳票メールの失敗は `document_email_failed` のベル通知と運営 Slack に出る。
`share-email.test.ts` が「失敗時に通知する」を固定）＋習慣。
- 習慣: 「記録・ログを足して原因を待つ」形の修正で終えるときは、**その記録に誰がいつ気づくか**を同じ PR で決める
  （通知・定期確認・代表への具体的な依頼のどれか）。決められないなら、症状は未解決と報告する。
- 習慣: 失敗を知らせる経路は、**壊れうる経路と別にする**（メールの失敗をメールで知らせない）。

---

## M-20260929-merged-main-without-migration-order-lint main を取り込んだあと、マイグレーション版の順序を見る lint を回さずにプッシュした（2026-09-29・型 I、併せて型 E）

**Before**: PR #1172 に main（#1170）を取り込み、`check:migrations`（空 DB への再生）と `check:schema` が
通ったのでプッシュした。

**After**: main 側で `20260927142855` などが入っており、この PR の `20260927114500` が base の最新より前に
なっていた。このままマージすると本番の `supabase db push` が out-of-order で停止する形だった。Supabase
プレビューの「Applied out-of-order migrations」警告で気づき、`20260929132849` へ改名した。CI の
`lint:migrations` も取り込み直後のコミットで落ちていた。改名の副作用でプレビュー DB が
「Remote migration versions not found」で落ち、手順書どおりのリセットもロック上限（SQLSTATE 53200）で
失敗したため、分岐を削除して解消した（手順を `docs/operations/migrations.md` に追記）。

**なぜ気づけなかったか**: 「再生が通る」と「本番に順序どおり当たる」を同じものとして扱った。再生は空 DB へ
全ファイルを順に当てるだけで、本番の適用済み版との前後関係は見ない。それを見るのは
`MIGRATIONS_BASE_REF=origin/main npm run lint:migrations` で、取り込み後に回していなかった。
型 I の再発防止（取り込んだら前提を読み直す）は「衝突しなかったファイル」を想定していたが、
**衝突どころか差分にも出ない「版の前後関係」**という前提は読み直しの対象として思い浮かばなかった。
型 E の再発防止（リポジトリの CI 相当の検査を回す）も、思い出せた検査だけを回した点で効いていない。

**再発防止**: 仕組みあり（CI の `lint:migrations` と毎日の `Stale migration dates` ワークフローが止める）＋習慣。
- 習慣: マイグレーションを持つ PR に main を取り込んだら、プッシュ前に必ず
  `MIGRATIONS_BASE_REF=origin/main npm run lint:migrations` を回す。

## M-20260929-build-oom-cause-guessed-three-times Vercel ビルド失敗の原因を計測せずに3回言い当てようとして3回外した（2026-09-29・型 E、併せて型 A）

**Before**:
- 手元の `next build` が通ったので「Vercel 側の一時的な問題の可能性が高い」と PR にコメントした（手元は 16GB・Sentry 無し）。
- 1本目のログが途中で切れていたので「45分タイムアウト」と推測した。
- OOM と判明した後、`tsc` 単体が約5.3GB だったことから「型チェック段が原因」とし、`typescript.ignoreBuildErrors` を
  Vercel 上だけ有効にする修正を提案・実装した。

**After**: 実ログは 8GB 機での OOM → SIGKILL で、ビルドキャッシュが大きすぎて破棄されフルビルドになっていた。
1秒ごとの `free -m` で段階別に計測すると、ピークは Turbopack のコンパイル終盤（約85〜90秒時点）で、型チェックを
省いてもピークは 7216MB で下がらなかった。ワーカー1本・プレビューで Sentry を包まない、を足しても 7054MB で
計測誤差の範囲だった。設定変更は取り消し、PR コメントを訂正した。**さらに「次もまた落ちる」と予想した直後に、
設定を変えないまま 79b9d60 で通った**（約25分かかった）。上限すれすれで、通るかどうかは揺れる。

**なぜ気づけなかったか**: 手元の再現はメモリ量も Sentry の有無も本番と違う条件だった。「手元で通る」を
「コードに問題が無い」の証拠にした（型 E: 手元と CI の差を忘れる）。型 E の再発防止は CI（GitHub Actions）を
想定していて、**Vercel のビルド機も「手元と違う CI」だ**という発想が無かった。さらに「tsc 単体が重い」という
1つの数字からビルド全体のピーク位置を推論し、段階別の計測をしないまま修正を書いた（型 A: 判断に使った数字を検証しない）。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: ビルドのメモリ・時間の問題では、原因を口にする前に本番と同じ条件（コア数・メモリ・環境変数）で段階別に
  計測し、ピークがどの段にあるかを確認する。修正を入れたら同じ条件で前後を測り、効果が誤差を超えない限りコミットしない。
- 習慣: 上限すれすれの失敗は「次は通る／落ちる」を予想しない。揺れるものとして報告する。

## M-20260929-left-crjson-time-fallback-unread crJSON の validationTime の別経路を「実データでは通らない」と読まずに決め、README に「入力時刻を使う」と書いた（2026-09-29・型 B）

**Before**: crJSON ハーネスで検証時刻を差し替えるパッチを書いた際、`crjson.rs` に `Utc::now()` の代替経路が2つあるのを見たが、
「validation_results に時刻が無いときだけの保険」と読んで対象外にした。README には「報告する validationTime は入力時刻」と書いてコミット・push した。

**After**: `/code-review` の指摘。2つ目の代替経路は、**ingredient の manifest で検証結果が署名時の記録と同じ（差分なし）とき**に必ず通る。
下書きサンプル4形式のうち3形式で、ingredient 側の validationTime に実行時の時計が出ていた（再現済み）。2経路ともパッチに加え、
自己テストに「2段の ingredient を持つ資産を、署名時と同じ条件（信頼リスト空・有効期間内）で検証し、全 manifest の validationTime が入力値」
を追加（修正前のバイナリで落ちることを確認）。未提出・未マージのため実害なし。

**なぜ気づけなかったか**: **代替経路の条件式を1段だけ読んで止まった。** 1つ目（`validation_time()` が無いとき）は確かに実データで通らないが、
2つ目は「map に無い manifest」で、map に何が入るかを読まずに同じ扱いにした。加えて最初に足したテストは、信頼リストと時刻を署名時と
変えていたため全段に差分が出て、その経路を一度も通っていなかった（修正前でも緑）。

**再発防止**: 仕組みあり（この経路）＋習慣。
- 仕組み: `selftest.mjs` の ingredient 2段ケース（修正前のバイナリで落ちることを確認済み）。
- 習慣: **「この代替経路は通らない」と判断する前に、その条件を満たす入力を1つ作って実際に通るか試す。** 足したテストは、直す前のコードで落ちることを見てから信じる。

## M-20260929-closed-vercel-app-bypass-for-uploads-only `*.vercel.app` 直アクセスの抜け道を写真アップロードでだけ塞ぎ、同じ手順書で有効にさせた `TRUST_CF_HEADERS` の偽装を見なかった（2026-09-29・型 C）

**Before**: GPSA O.5（最低 TLS 1.3）対応で、Cloudflare だけが付ける秘密ヘッダを照合して `*.vercel.app` への直アクセスを
写真アップロードから弾くガードを入れた。同じ手順書で `TRUST_CF_HEADERS=1` を設定させ、`*.vercel.app` の保護は「推奨」に留めた。

**After**: `/code-review` の指摘。`TRUST_CF_HEADERS=1` にすると `getClientIp` は `cf-connecting-ip` を最優先で信じる。`*.vercel.app` に直接
来たリクエストは Cloudflare を通らないので、そのヘッダを毎回変えるだけで**全 API の IP レート制限（OTP 発行など）を迂回できた**。
照合を `src/lib/edgeOrigin.ts` に切り出し、`getClientIp` も秘密ヘッダが一致するときだけ CF ヘッダを信じるよう修正、テスト化
（陰性対照: 照合を外すと落ちる）。手順書・`.env.example` も更新。未マージ・環境変数未設定のため実害なし。

**なぜ気づけなかったか**: **「`*.vercel.app` は Cloudflare を通らない」という同じ事実を、自分が作ったガード1本の理由としてしか使わなかった。**
型 C の習慣「ガードを入れたら他の入口を見る」は「同じ操作の別の入口」を探す形で覚えていたが、今回は**同じ抜け道が効く別の信頼判断**
だった。しかも `TRUST_CF_HEADERS` の既定を安全側に倒した経緯（M-20260908-x-forwarded-for-unverified）を知りながら、その opt-in を
自分の手順書で開けさせた。

**再発防止**: 仕組みあり（この経路）＋習慣。
- 仕組み: `rateLimit.test.ts` の「Cloudflare を通っていないリクエストの cf-connecting-ip は無視する」テスト。
- 習慣: **手順書で環境変数・設定を有効にさせるときは、その変数を読むコードを grep し、「この構成の抜け道から来たら何を信じるか」を1件ずつ見る。**

## M-20260929-checked-exif-gps-but-not-manifest-gps 原本 ingredient の GPS 漏れを EXIF だけで確かめ、原本自身の C2PA manifest 経由の漏れを見なかった（2026-09-29・型 C）

**Before**: `c2pa.opened`＋原本 ingredient に切り替える際、「原本の GPS は漏れない」を EXIF に GPS を持つ原本で実測し、テストにして
コミット・push した。

**After**: `/code-review` の指摘。C2PA 対応カメラ/スマホの写真は**自分の C2PA manifest の中に位置を持てる**（`c2pa.metadata` 等）。
ingredient に原本を入れると、その manifest ごと Ledra の出力に複写され、EXIF 除去を素通りする。`c2pa.metadata` に GPS を入れた
署名済み原本で再現（出力バイトに座標が残る）。原本 manifest store 内のメタデータ系アサーションを C2PA redaction（`c2pa.PII.present`）
で除去するよう修正し、テスト化（陰性対照: redaction を外すと落ちる）。本番は C2PA 未稼働で、この変更も未マージのため実害なし。

**なぜ気づけなかったか**: **「位置情報が出力に入る経路」を1本（EXIF）しか数えなかった。** ingredient の仕組みが「原本の manifest を
抱えて運ぶ」ことは同じ日の実験で見ていた（CA.jpg の ingredient に activeManifest が入った）のに、それをプライバシーの経路として
数え直さなかった。validate の証拠として喜んだ性質が、そのまま漏れの経路だった。

**再発防止**: 仕組みあり。
- 仕組み: `c2paSignValidate.test.ts` に「原本 manifest の c2pa.metadata に入った位置が出力に残らない」テスト。
- 習慣: **「X が漏れない」を確かめるときは、X が入りうる容器（EXIF / XMP / 埋め込み manifest / サムネイル）を列挙してから、それぞれで試す。**

## M-20260929-logged-the-wrong-zip-as-sent 代表の「送信済み」を、確かめずに最新版（3版目）の送信と読んで事業ログに書いた（2026-09-29・型 F）

**Before**: 代表から「送信済み」と一言届いた。直前まで3版目のサンプルを Conformulator で確認していたので、送ったのは3版目で、
送信前に全て合格していたと読み、LEDRA_CURRENT・RELEASE_LOG・OPEN_QUESTIONS に「送信前に Conformulator で4枚とも合格」と書いてコミットした。

**After**: 送信されたのは **9/27 15:32 UTC の1版目**（Gmail の送信記録。Administrator の返信に引用された本文も1版目の文言
`c2pa.edited (exif_gps_metadata_removed)`）。1版目を渡した9分後に送られており、ルーブリック不合格2件を含んだまま審査された。
3つのログを訂正した。

**なぜ気づけなかったか**: **「いつ・どの版を送ったか」を確かめず、会話の流れから推した。** Gmail コネクタで送信記録（時刻・添付サイズ）を
1回引けば分かった。さらに根本では、1版目を渡したとき「送信前に Conformulator で確認して」と書いたが、**zip を渡す＝送れる状態を作った**のに、
確認前に送られうることを止める仕組み（「未検証」と zip 名に入れる、確認後に渡す）を置かなかった。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: **外部への送信を記録するときは、送信記録（Gmail の SENT・時刻・添付）で版を確かめてから書く。**
- 習慣: 未検証の提出物は渡さない。渡すなら名前に `UNVERIFIED` を入れる。

## M-20260929-never-tested-the-gps-leak-premise 「ingredient にすると GPS が漏れる」という前提を試さないまま設計を決め、3週間載せ続けた（2026-09-29・型 A）

**Before**: 9/4、`c2pa.opened` には ingredient が要ると分かった時点で「元写真は GPS を含むので ingredient にできない」と判断し、
`c2pa.created`（digitalCapture）を選んだ。GPSA にもそう書き、Administrator への説明にも使った。

**After**: 実測すると c2pa-rs の ingredient は原本のハッシュ・形式・画素から作り直したサムネイルだけを持ち、EXIF/GPS を運ばない
（原本 GPS あり → 署名後ファイル・manifest JSON・ingredient サムネイルとも GPS なし）。前提は偽で、Administrator に
「Backend は created 不可」と差し戻された。`c2pa.opened`＋原本 ingredient に作り替え、漏れないことをテストに固定した。

**なぜ気づけなかったか**: **設計の分岐点を決めた前提が、もっともらしい推論のまま一度も実行されなかった。** 「ingredient＝原本の埋め込み」と
思い込み、ライブラリが実際に何を ingredient に入れるかを見ていない。型 A の再発防止「既知の1件で当たりを取る」は検出器向けで、
**設計の前提そのもの**を試す習慣が無かった。

**再発防止**: 仕組みあり＋習慣。
- 仕組み: `c2paSignValidate.test.ts` に「GPS 付き原本を ingredient にしても出力・manifest に GPS が出ない」テスト（陰性対照あり）。
- 習慣: **「〜だからできない」で選択肢を捨てるときは、その「〜」を1回実行してから捨てる。** 捨てた理由を DECISION_LOG に書くときは、実測か推論かを明記する。

## M-20260927-read-c2pa-valid-as-conformant c2pa-rs の `Valid` を Conformance の合格と読み、ルーブリック不合格2件を見落とした（2026-09-27・型 A）

**Before**: 証拠サンプルを c2pa-node の `Reader` で読み戻し、4枚とも `validation_state: Valid`（指摘は untrusted のみ）
だったので「提出できる状態」と代表に報告した。返信メール下書きにも「Conformulator で自己テスト済み、指摘は untrusted のみ」と
**実施前に**書いた。代表が見せた概要画面の黄色ラベル "Contains ambiguous actions" は、汎用 `c2pa.edited` が原因と
**推定だけで**決めて `c2pa.edited.metadata` に替え、「これで消えるはず」と再テストを頼んだ。

**After**: 代表が Rubrics タブを貼ると、v0.2 / Spec 2.4 ルーブリックで2件不合格だった —
`inception_action_position`（actions が created_assertions に無い）と
`mandatory_dst_for_perceptible_transformations`（`c2pa.orientation` に digitalSourceType が無い）。黄色ラベルは
シグナル（分類表示）で不合格ではなく、私の推定は的外れだった。created 指定と DST 付与で直し、両方をテストに固定した。

**なぜ気づけなかったか**: **「署名が検証を通る」と「プログラムの適合要件を満たす」を同じものとして扱った。**
c2pa-rs の検証は構造・ハッシュ・署名しか見ず、Conformance Program のルーブリック（action の配置や DST の必須化）は見ない。
判断に使った道具（Reader の validation_state）が何を確かめる道具かを確認していなかった。9/3 の「全 Valid・v0.2 対応済み」も
同じ道具の上に立っていた。加えて、画面の一部（概要タブ）だけを見て原因を推定し、コード変更まで進めた —
不合格の一覧（Rubrics）を先に取り寄せていれば1往復で済んだ。

**再発防止**: 仕組み半分。
- 仕組み: 判明したルーブリック2件は `c2paSignValidate.test.ts` に固定した（修正を戻すと3件落ちる）。
  ルーブリック全体は Conformulator にしか無く、この環境から到達できないので CI 化できない（仕組み無し）。
- 習慣: **Conformance の合否は Conformulator の Rubrics タブの結果でだけ言う。** `Valid` は「署名が壊れていない」とだけ書く。
  外部ツールの画面を根拠に直すときは、要約画面ではなく**合否の一覧を先にもらう**。

## M-20260927-c2pa-ledger-tested-only-on-exif-free-images C2PA の行為台帳を EXIF の無い画像でしか試さず、回転と WebP のメタデータ除去を記録し損ねていた（2026-09-27・型 A）

**Before**: 2026-09-04 に C2PA マニフェストを「実際に効果のあった変換だけを載せる」形にした
（`orientationApplied` / `metadataRemoved` を `imageExif.ts` が返し、`c2pa.ts` が行為台帳に反映）。
`orientationApplied` は `exifr.parse` の `Orientation` が **number で 1 より大きい**ときに true とした。
検証は `c2paSignValidate.test.ts`（sharp で作った無地画像を署名→読み戻し）と、証拠サンプル4枚が
全部 `Valid` になったこと。これで「台帳は正直」と GPSA と RELEASE_LOG に書いた。

**After**: exifr は既定（`translateValues: true`）で Orientation を `"Rotate 90 CW"` という**文字列**で返す。
`typeof === "number"` は常に偽なので、`sharp().rotate()` が実際に画像を回しても `c2pa.orientation` は
一度も載らず、それでいて `allActionsIncluded = true` を主張していた。さらに exifr は **WebP を読めない**
（`Unknown file format`）ので、WebP の EXIF/GPS を sharp が消しても `c2pa.edited:exif_gps_metadata_removed`
が載らなかった。9/27 に C2PA 提出用サンプルを「回転＋GPS 付き」の入力で作り直して発覚。
判定を sharp 自身の `metadata()`（実際に回転・除去する側）に寄せ、回転＋EXIF 付きの jpeg/webp で
両方が true になるテストを足した（修正前に 2 件失敗することを確認）。本番は C2PA 未稼働
（LEDRA_CURRENT 2026-09-21 時点で C2PA 列 0 件）のため、誤った台帳の署名済み画像は出ていない。

**なぜ気づけなかったか**: **検証に使った入力が、検証したい分岐を1つも踏まない画像だった。**
無地の合成画像には EXIF も回転も無いので、`orientationApplied` / `metadataRemoved` が常に false でも
テストもサンプルも `Valid` になる。`Valid` は「マニフェストの構造が正しい」であって
「台帳が起きたことと一致する」ではない。exifr の戻り値の型も、ライブラリの既定を読まずに
TypeScript の型注釈（`Orientation?: number`）を書いて、それを根拠にしていた。
型 A の再発防止「既知の1件で当たりを取る」は、**当たりを取るべき陽性の入力（回転・EXIF 付き）を
用意していなかった**ので効かなかった。

**再発防止**: 仕組みあり。
- 仕組み: `imageExif.test.ts` に「回転 6 ＋ EXIF 付きの jpeg / webp で `orientationApplied` と
  `metadataRemoved` が true、出力は回転済みで EXIF 無し」のテストを追加（修正を戻すと落ちる）。
  証拠サンプル生成（`docs/c2pa-evidence/generate-samples.mts`）の入力も回転＋GPS 付きにした。
- 習慣: **「効果があったときだけ載せる」系の条件は、効果がある入力で1回、無い入力で1回試す。**
  外部ライブラリの戻り値の型は、自分で書いた型注釈ではなく実際の戻り値で確かめる。

## M-20260927-grep-filter-hid-vitest-errors-line vitest の出力を `grep "Test Files|Tests|FAIL"` で絞り、`Errors 1 error` を見ずに「通った」と事業ログに書いた（2026-09-27・型 A）

**Before**: 所有権移転の受諾処理に旧オーナーへの通知を足した。テストは
`npx vitest run ... | grep -E "Test Files|Tests|FAIL"` で流した。出力は「47 passed / 506 passed」だけだったので、
RELEASE_LOG に「関連テスト（47ファイル・506件）も通った」と書いてコミットした。

**After**: push の pre-push フックが落ちた。既存の `respond.test.ts` は `./email` をモックしていたが、
足した関数 `sendTransferCompletedToPreviousOwner` がモックに無かった。そのため、`void` で投げた通知が
**テストの外で未処理のエラー**になっていた。vitest は全テストを passed と数えたうえで、別の行に
`Errors  1 error` と出す。**私の grep はその行を拾わない形だった**（`Errors` は `Tests` にも `FAIL` にも当たらない）。
モックを足し、移転時に旧オーナーの証明書を外すこととメール送信のテストを2件足した。RELEASE_LOG の件数も数え直した（508件）。
**直した直後にもう一度同じ形をやった**: フックを `bash .husky/pre-push | tail -4; echo "exit=$?"` で流し、
`exit=0` を見た。これは `tail` の終了コードで、フックの終了コードではない。出力をファイルに落とし、
フック自体の終了コード（0）を取り直した。

**なぜ気づけなかったか**: **出力を絞る道具（grep・tail）を、何を見えなくするか確かめずに使った。**
「Tests が全部 passed なら緑」と思い込んでいて、vitest がテストの成否とは別の行で失敗を報告することを
検査の設計に入れていなかった。パイプの後ろの `$?` がパイプの最後のコマンドのものであることも、同じく道具の性質で、
確かめずに使った。型 A そのものである。pre-push フックが絞らずに終了コードで判定したので、main に届く前に止まった。

**再発防止**: 仕組みあり（pre-push フックの `vitest --changed` は終了コードで判定する）＋習慣。
- 習慣: テスト結果は **`tail` で要約の塊ごと見る**（`Test Files` / `Tests` / `Errors` の3行が並ぶ）。
  終了コードを見るときは**パイプに通さず**、出力をファイルへ落としてから `$?` を取る。件数を文書に書くのは、
  コマンド自身の終了コード 0 を見てから。

## M-20260927-anon-customer-names-read-as-by-design anon から顧客名が 23/23 件読めると実測しながら「証明書の性質上あるべき」と分類し、21日据え置いた（2026-09-27・型 B、併せて型 F）

**Before**: 2026-09-06 に「anon から読める表を全件実測」した。`certificates` について、
anon に見える23件で `customer_name` が 23/23 件埋まっていることまで数えた。そのうえで
「`customer_name` と車両情報は証明書の性質上そこにあるべきもの」と分類した。問題として挙げたのは
「今は空の `service_price` / `craftsman_name` などが将来埋まったら出る」ことだけで、
**実害0**と書いた（OPEN_QUESTIONS 2026-09-06、LEDRA_CURRENT 2026-09-06）。
2026-09-08〜10 は同じポリシーを「本番だけにあるドリフト」として扱い、危険度を「不明」とした。

**After**: 2026-09-27 に別件（公開ページのナンバー）で同じ経路を追った。すると、
**アプリは顧客名を匿名の閲覧者に一切見せない設計だった。** 公開ページ（`publicData.ts`「所有者名は公開(外部)表示では返さない
(個人情報保護)」）、公開ビュー（20260531100001 で `customer_name` を NULL 化）、公開 PDF（`customer_name: ""`）の
3経路とも伏せている。anon の表直読みだけがその外にあった。公開されている anon キーだけで、`/rest/v1/certificates` から
全テナントの顧客名を列挙できた（2026-09-27 時点で24行・6テナント、`set local role anon` で件数のみ確認）。
即日、PDF ルートをサービスロールに替え、ポリシーの DROP と anon 権限の REVOKE を入れた。

**なぜ気づけなかったか**: **「設計どおり」を、同じデータを扱う他の経路と照らさずに決めた。**
顧客名が証明書に「ある」ことと、匿名の閲覧者に「見せてよい」ことは別の問いである。後者の答えは、
コードの3箇所にコメント付きで書いてあった。**列が「ある」ことを「見せてよい」と読んだ**。
型 B の「列や機能が『ある』ことを『使われている』と読む」と同じ形をしている。
その後の2回（09-08、09-10）は「消したら何が壊れるか」だけを調べていて、
「残したら何が漏れるか」は 09-06 の分類を引き継いで問い直さなかった。

**この記録を書く途中でも、同じ形をやりかけた（型 F）**: 最初の下書きには
「anon に何が読めるかは誰も確かめていなかった」と書いた。`OPEN_QUESTIONS.md` を
`cert_public_read_active` で grep して3箇所当たっていたのに、読んだのは1箇所（09-08）だけだった。
09-06 の実測を読んで、コミット前に書き直した。grep で当たった箇所を全部読まずに「誰も〜していない」と書くのは、
型 F の「追記しようとしているログファイル自身に、既に矛盾する記述が無いか確認しない」そのものである。

**再発防止**: 仕組み半分。
- 仕組み: 今回のマイグレーションで anon の `certificates` / `certificates_public` 権限を REVOKE した。ポリシーがまた足されても届かない。
- 習慣: **anon に見える列を「設計どおり」と分類する前に、その列を公開ページ・公開 API・公開 PDF がどう扱っているかを grep する。**
  どこか1つでも伏せているなら、表の直読みで見えるのは設計違反である。
  「〜は誰も確かめていない」と書く前に、ログを識別子で grep し、当たった箇所を全部読む。
- 仕組みにできる余地: `src/lib/privacy/classification.ts` の PII 分類と、本番で anon が SELECT できる列を突き合わせる検査。未実装【要確認】。

## M-20260927-said-evaluated-all-while-filtering-the-population 「評価不能0だから全部見た」と書いたが、母集団を自分で削っていた（2026-09-27・型 A）

**Before**: 既定値が自表の CHECK に弾かれる列を探す検査を書いた。判定を正規表現ではなく
Postgres 自身にやらせ、さらに**「評価不能が1件でもあれば落とす」**仕組みまで入れた。
「違反0」を「全部見た」と読み替えないための配慮のつもりで、PR 本文にも
「**評価不能が0件なので、違反2件は全部見た上で2件です**」と書いた。

**After**: その検査は `cardinality(con.conkey) = 1` で**複数列の CHECK を母集団から落としていた**。
落としたことを「評価不能」にも数えていないので、**「評価不能 0」は「見ていないものは数えていない」
という意味**だった。`/code-review` が `b (lo int default 5, hi int default 1, check (lo <= hi))` という
1例で示した —— 初版はこれを全部クリアと報告する。実際の schema では 351 本の CHECK のうち
164 本が母集団の外だった。全 CHECK を母集団にし、(1) 評価した / (2) 対象外（理由付き・件数と列名を出す）
/ (3) 評価不能（1件でも落とす）の3つに必ず分類する形に直した。複数列の陰性対照も取った。

**なぜ気づけなかったか**: **「取りこぼしを数える仕組み」を入れたことで、取りこぼしを数えた気になった。**
`n_skip` が数えていたのは「probe を作ろうとして失敗した組」だけで、
**そもそも probe を作ろうとしなかった組**は最初の `WHERE` で消えている。
カウンタは自分が見た範囲の中しか数えられない —— **母集団を決める条件は、カウンタの外側にある。**
「違反0」を疑う仕組みは入れたのに、「母集団がすべてか」は疑わなかった。
台帳の型 A（道具を検証しない）で、今回の道具は「母集団の定義」そのものだった。

**再発防止**: 仕組み半分。
- 仕組み: 検査が**全 CHECK 件数（351）と評価した件数（187）と対象外件数（164）を毎回出す**。
  「評価した件数」だけでなく「母集団の総数」を印字するので、差が見える。
- 習慣: 絞り込みの `WHERE` を書いたら、**落とした行を数えて出す**。
  「0 件でした」と報告する前に、**分母を言えるか**を確かめる。
  分母を言えない「0 件」は「問題なし」ではなく「分からない」である。

## M-20260927-read-a-failed-rebuild-as-a-measurement 再構築が失敗したのに、その後のクエリが古い DB を読んで「変化なし」という数字を出した（2026-09-27・型 A）

**Before**: 列属性を揃えるマイグレーションを書いた後、効果を確かめるために再生 DB を
`--keep` で作り直し、同じクエリで digest を取り直した。出力は「残った差: 39（修正前は 39）」。
一瞬「マイグレーションが効いていない」と読みかけた。

**After**: 再構築そのものが失敗していた。手元の PostgreSQL が落ちていて
`bootstrap.sql が流せません: Connection refused` が出ており、**その後の digest クエリだけが
（別の経路でサーバを起こしてから）古いスキーマを読んでいた**。つまり 39 は
「揃える前の DB をもう一度測った数字」で、比較としては無意味だった。
順序を直して作り直したら 39 → **20** になった（残りは繰延べ分と本 PR が直す分だけ）。

**なぜ気づけなかったか**: **「同じ数字が出た」を結果として読み、そこへ至る工程が
成功したかを確かめなかった。** しかも失敗のログは同じ出力の中に印字されていた。
1つのコマンドに「作り直す」と「測る」を詰めたので、前半が失敗しても後半は実行され、
**後半だけが数字を出す**構造になっていた。台帳の型 A（道具を検証しない）そのもので、
今回の道具は「再生 DB が最新のマイグレーションから作られていること」という前提だった。
加えて `replay-migrations.mjs --dsn` は既存スキーマを落とさないので、
生きている DB に流すと衝突で 414/512 しか適用されない（これも後で判明）。

**再発防止**: 仕組み半分。
- 仕組み: 測る前に**適用できたファイル数を読む**（`512 / 512` でなければ数字を使わない）。
  再生は使い捨ての DB を `CREATE DATABASE` してから流す（既存 DB に流さない）。
- 習慣: 「作る」と「測る」を同じコマンドに入れない。入れるなら、
  **前段の成功を明示的に確認してから**後段に進む（`&&` で繋ぐ／終了コードを見る）。
  比較の数字が「変わらなかった」ときは、まず**比較対象が入れ替わったか**を疑う。

## M-20260927-checks-were-green-on-rows-production-would-reject 5本の再生検査が、本番では入らない行の形で緑になっていた（2026-09-27・型 A）

**Before**: `scripts/replay/checks/` の検査は「本物の Postgres に行を入れて確かめる」形で
書いてきた。再生 DB に行が入り、期待どおりのエラーコードが返れば、
**本番でも同じことが起きる**と考えていた。

**After**: 再生 DB が本番より**緩かった**ので、本番では 23502 で落ちる行の形が再生では通っていた。
本番に合わせて NOT NULL を 12 列足した瞬間、既存の検査が5本落ちた。

| 検査 | 省いていた列 | 本番では |
|---|---|---|
| `certificate_images_column_shape.sql` | `tenants.slug` | NOT NULL |
| `insurer_rls_suspension_gate.sql` | `certificates.customer_name` | NOT NULL |
| `insurer_users_system_actor.sql` | `insurers.slug` | NOT NULL |
| `vehicles_public_id_default.sql` | `vehicles.maker` / `model` | NOT NULL |
| `insurer_suspension_gate.sql` | `insurer_users.role`（既定に依存） | 既定が CHECK 違反 |
| `pii_disclosure_owner_consent.sql`（**6本目・後から**） | `certificates.customer_name` | NOT NULL |

最後の1本は、**本番の壊れた既定値を陰性対照として再生に入れた瞬間**に落ちて分かった。
つまりこの検査は「本番では成立しない前提」の上で緑だった。

**なぜ気づけなかったか**: **検査の土台（再生 DB）が本番と同じ形かを、検査を書く前に確かめていない。**
「本物の Postgres で確かめている」ことに安心して、その Postgres が**本番と同じ制約を持つか**を
問わなかった。列の名前しか比べない検出器は、この差を一度も見せてくれない。
検査が緑であることは「再生 DB でその行が入る」ことの証明でしかなく、
**本番でも入るかは別の主張**である。

**再発防止**: 仕組み半分。
- 仕組み: `defaults_satisfy_own_check.sql` を追加し、既定値と CHECK の矛盾は再生で必ず落ちるようにした。
  列属性の差そのものは `20260929150300` で揃えたので、**今後の検査は本番と同じ厳しさの DB で走る**。
- 習慣: 検査の fixture は**必要な列を明示で渡す**（既定値や NULL 許容に頼らない）。
  頼ると、その既定・許容が本番と違ったときに検査ごと意味を失う。
  本番との属性差は名前を見る検出器には映らないので、**新しい表に検査を書くときは
  その表の NOT NULL と既定値を本番側で1度読む。**

**追記（2026-09-29）**: **6本目が、この台帳を書いた後に増えた。** #1170 が並行して
`pii_disclosure_owner_consent.sql` を main に入れており、それも `certificates.customer_name` を
省いていた。main では緑（再生が緩い）、本 PR を取り込むと 23502 で落ちる。
**「今後の検査は本番と同じ厳しさの DB で走る」は、本 PR がマージされた後にしか成り立たない。**
それまでに書かれた検査は、書いた時点の緩い DB で緑になっている。
上の「5本」は本 PR をマージする時点の実数ではなく、**書いた時点の実数**だった（型 I）。
`20260929150300` が main に入るまでは、新しい fixture が同じ形で入り続ける。
## M-20260925-my-not-null-blinded-the-sibling-check 自分が足した NOT NULL が、隣の検査の識別力を奪ったことを見ていない（2026-09-25・型 D）

**Before**: #1166 で `certificate_images.file_name` / `content_type` を `SET NOT NULL` にした。
同表には既に `certificate_images_file_size.sql` という振る舞い検査があり、
**`file_size` を省いた insert が 23502 になること**で「既定なし・NOT NULL」を確かめていた。
再生は 7 件すべて緑。3件それぞれの陰性対照も取ったので、検証は済んだと思っていた。

**After**: その検査の insert は `file_size` だけでなく `file_name` / `content_type` も
省いていた。私の NOT NULL が入った後は、**どの列で落ちても 23502** なので、
`20260922141100`（`file_size` の既定を外して NOT NULL にしたマイグレーション）を
丸ごと戻しても検査は通る。つまり**その検査は `file_size` を見なくなっていた**。
`/code-review` の指摘。insert に `file_name, content_type` を明示で渡すよう直し、
`20260922141100` を空にすると `23514`（既定 0 が CHECK に弾かれる）で落ちることを実測した。

**なぜ気づけなかったか**: **自分の検査が通ることだけを確かめ、隣の検査が
「まだ何を区別しているか」を確かめなかった。** SQLSTATE で判定する検査は、
同じ SQLSTATE を出す原因が増えた瞬間に識別力を失う。7/7 緑は
「7件が落ちなかった」であって「7件が今も意味のあることを見ている」ではない。
陰性対照も**自分が足した3件**にしか取っていない —— 既存の検査の陰性対照を
取り直せば、その場で分かった。

**再発防止**: 仕組み半分。
- 仕組み: 検査ファイル自身に「同表に NOT NULL 列を足す PR は、この insert にも
  その列を足すこと」を書いた。SQLSTATE 判定の検査が何に依存しているかを明文化した。
- 習慣: **NOT NULL・CHECK・一意制約を足したら、同じ表を見ている既存の振る舞い検査を
  開き、その陰性対照を取り直す**（対象の migration を空にして落ちるか）。
  「7/7 緑」は識別力の証明ではない。

## M-20260925-grep-missed-the-generic-upsert-helper 汎用ヘルパ経由の insert を grep が拾えず「唯一の書き手」と書いた（2026-09-25・型 A）

**Before**: `certificate_images` を NOT NULL にして安全か判断するため、書き手を洗い出した。
`from("certificate_images")` と insert を組み合わせて grep し、
`src/lib/certificateImages/processUploadedPhoto.ts` の1箇所だけが当たった。
SQL 関数からの insert は `pg_proc` で0件。よって**「唯一の書き手」**とマイグレーションの
ヘッダ・RELEASE_LOG・OPEN_QUESTIONS の3箇所に書いた。

**After**: `scripts/setup-demo-tenant.ts` も書き手だった。こちらは
`upsert("certificate_images", imageRows, "id")` という**汎用ヘルパ**を呼んでいるので、
表名と `insert` が同じ行に並ばず、私の grep には原理的に映らない。
`/code-review` の指摘。3列とも明示で渡していたので**結論（NOT NULL にしても落ちない）は
生き残った**が、それを支えた根拠は不完全だった。3箇所を「書き手は2箇所」に直した。

**なぜ気づけなかったか**: **grep の語形が、探している概念より狭いことを確かめなかった。**
「表への書き込み」を探すのに、「表名と insert が近接する」という**実装の書き方**を条件にした。
汎用ヘルパは表名を引数で受けるので、その条件を満たさない。しかも `src` に絞って
`scripts/` を見ていない。台帳の型 A の再発防止は「自作の走査スクリプトは既知の1件で
当たりを取る」だが、**当たりを取る「既知の1件」を自分の grep の結果から選んだ**ので、
取りこぼしは原理的に見えなかった。既知の1件は**別の経路で**選ばないと意味がない。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: 表への書き手を数え切ったと言う前に、**表名だけ**で全リポジトリ（`src` に絞らない）を
  grep し、当たった行を1つずつ読む。`from(...)` の形を条件にしない。
  汎用ヘルパ（`upsert(` / `insertRows(` 等）が表名を引数で受けていないかを必ず見る。
- 「唯一の」と書きたくなったら、その語が grep の語形に依存していないか確かめる。

## M-20260925-my-own-merge-staled-the-replay-count 自分のマージで再生件数が 509→510 になったのに、書いた数字を読み直さなかった（2026-09-25・型 I）

**Before**: #1166 の事業ログと PR 本文に「`check:migrations` 再生 509/509」と書いた。
コミット `c92ac915` の時点では実測どおりで正しかった。その後 `origin/main` を取り込み、
コンフリクト（RELEASE_LOG）を解消して push した。

**After**: `main` がマイグレーションを1本足していたので、マージ後の実数は **510/510**。
`/code-review` の指摘。マージ後に走らせた再生の出力にも `510 / 510` と出ていたのに、
文書の 509 を直していなかった。510 に修正した。

**なぜ気づけなかったか**: **マージを「コンフリクトの解消」としてしか見ていない。**
衝突しなかった行の中に、`main` の変更で意味が変わる数字があることを見なかった
（型 I そのもの）。しかも直前にマージ後の再生を走らせて `510 / 510` を**目で見ている**。
出力を「緑か」だけで読み、数字を自分の文書と突き合わせなかった。

**再発防止**: 仕組み無し（判断に依存）。
- 習慣: `origin/main` を取り込んだら、**自分の文書に書いた実測値を grep して洗い直す**
  （件数・ファイル数・テスト数）。マージ後に検査を走らせたなら、その出力の数字を
  文書の数字と1つずつ突き合わせる。緑かどうかだけを見ない。

## M-20260925-migration-timestamp-collided-with-parallel-pr マイグレーションのタイムスタンプをキリのいい 16:00:00 に丸め、並行 PR と同じ番号を取った（2026-09-25・型 F）

**Before**: A/B の PR（#1159）で `current_insurer_id()` を落とすマイグレーションを
`20260924160000_drop_dead_current_insurer_id.sql` と名付けた。作成時刻（`date -u` では 16:27）を
使わず、キリのいい「16:00:00」に丸めた。自分のブランチでは `lint:migrations` も
`check:migrations` 再生も緑だったので、番号は問題ないと思っていた。

**After**: 並行して進んでいた #1162（G5 完成検査）が **同じ `20260924160000`** を
`20260924160000_indicated_inspection_measurements.sql` に使っていた。#1162 が先に `main` へ入り、
こちらのマージ直前に `origin/main` を取り込んだ**そのとき初めて衝突が表面化**した。同一バージョンが
2本並ぶと適用順が不定になり、`lint:migrations` の重複検査にも掛かる。自分の方を
`20260924160200`（#1162 の最後 `20260924160100` の後）へ改番し、Supabase プレビューで再適用が
緑（Migrations ✅）になることを確認してからマージした。

**なぜ気づけなかったか**: **バージョン番号を「自分のブランチの中だけ」で検証した。**
`lint:migrations` は自分のツリーに重複が無いことしか見ない —— 並行ブランチが同じ番号を
取っているかは `main` を取り込むまで分からない。しかも番号を実時刻ではなく「16:00:00」に
丸めたので、**別セッションも同じ丸め方をすれば必ず一致する**空間に自分を置いた。
キリのいい番号は衝突を招く。これは台帳の「ID について」（連番を並行セッションが取り合う）と
同じ根で、識別子を実測ではなく人が丸めて付けると衝突する。

**再発防止**: 仕組み半分。
- 仕組み: マージ時の `origin/main` 取り込みで衝突は必ず表面化する（`lint:migrations` の
  重複検査＋マージのファイル並び）。**本番へ出る前には止まる**が、マージ直前まで見えない。
- 習慣: マイグレーションのタイムスタンプは**キリの良い時刻に丸めず**
  `date -u +%Y%m%d%H%M%S` の実測値を使う（衝突空間を広げる）。長く滞留したブランチは
  **マージ前に `origin/main` を取り込み、追加したマイグレーションが最新の番号より後ろに
  来ているか**を確認する。改番するときは、プレビュー DB が旧名で適用済みでないか併せて見る
  （型 C の `M-20260922-renamed-a-migration-the-preview-db-had-applied`。今回は Supabase の
  Migrations が緑で問題化しなかったが、同じ綱渡り）。

## M-20260924-blamed-all-ten-inserts-on-the-check 10 箇所の失敗原因をどれも読まずに CHECK のせいにし、3本を直し残した（2026-09-24・型 B）

**Before**: `insurer_access_logs` への直 insert が 10 箇所あり、どれも戻り値の `error` を
捨てていた。本番の同表が2行しか無かったことと、CHECK が4値しか許していなかったことから、
**10 箇所すべてが CHECK に弾かれている**と読んだ。#1135 の PR 本文にも
「(C) TypeScript の直 insert 10 箇所 — 黙って記録だけ落ちる」と、原因が1つであるかのように書いた。

**After**: 実際は7箇所と3箇所で原因が違った。`caseSummaryAuto` / `caseAssignAuto` /
`fraudScoreAuto` の3本は `insurer_id` / `action` / `meta` しか渡しておらず、
`insurer_user_id`（NOT NULL・既定なし）が欠けている。本番で実測すると **23502**:

```
null value in column "insurer_user_id" of relation "insurer_access_logs"
violates not-null constraint
```

CHECK を 20 値へ広げた #1135 では、**この3本は1行も直っていない**。語彙には
`case_summary_auto` 等が入ったが、NOT NULL で先に落ちる。

**なぜ気づけなかったか**: **「同じ表に書いていて、どれも無言で落ちている」を
「同じ理由で落ちている」と読んだ。** 10 箇所の insert が渡している列を、1つも数えていない。
本番の CHECK を実測したことで「原因を確かめた」気になり、そこで止まった。
確かめたのは「CHECK が弾く値がある」であって、「各 insert がなぜ落ちるか」ではない。
症状（無言で落ちる）が同じでも、原因が1つとは限らない。

**再発防止**: 仕組み半分。
- 仕組み: 直 insert を共有ヘルパー `recordInsurerAccessLog` に寄せ、引数を
  `InsurerAccessLogRow` 型にした。**必須列を渡し忘れると tsc が落ちる。**
  この3本は型を通す過程で「渡す id が無い」ことが表に出た。
  再生検査 `insurer_users_system_actor.sql` が、自動処理の監査行が実際に入ることを見る。
- 習慣: **「N 箇所が同じ症状」を「N 箇所が同じ原因」と書く前に、N 箇所の引数を並べて見る。**
  1件で原因を特定したら、残り N-1 件が本当にその形かを確かめてから件数を書く。

## M-20260924-called-a-tolerant-job-the-real-check 「このジョブが緑なら本番ビルドも通る」と、ジョブの中身を読まずに代表へ伝えた（2026-09-24・型 B）

**Before**: `overrides.ox` を viem に追従させた PR（#1114）で、代表に
「`overrides.ox` が古いとビルドが落ちる、というのがこの検査の根拠なので、
**`Client Bundle Size` ジョブが緑になることが本来の確認**です」と書いた。
`check-ox-override.mjs` が「下回ると `next build` が『Export ... doesn't exist』で落ちる」と
書いており、`next build` を回すジョブ＝`Client Bundle Size` だから、そこが緑なら確認済み、
という筋で組み立てた。

**After**: `ci.yml` の当該ジョブは **`next build` の非ゼロ終了を意図的に許容している**。

```
npm run build || echo "::warning::next build exited non-zero (page-data collection needs runtime secrets CI does not provide); ..."
if [ ! -f .next/build-manifest.json ]; then
  echo "::error::.next/build-manifest.json missing — client compilation failed (not a secrets issue)"
  exit 1
fi
```

確認できるのは**クライアントのコンパイルが通ること**までで、page data 収集以降は見ていない
（本物のシークレットが無いと必ず落ちるため）。**「このジョブが緑＝本番ビルドが通る」ではない。**
実際その直後に、**GitHub CI 全緑・Vercel のビルド失敗**という組み合わせが起きた。
自分が「本来の確認」と呼んだものは、Vercel の失敗を1つも予告できていない。

**なぜ気づけなかったか**: **ジョブの名前と `run:` の1行目から中身を決めつけた。**
`ci.yml` の当該ブロックには、なぜ非ゼロを許すのかが **20行のコメント**で書いてある。
開けば数秒で分かることを、開かずに断定した。根は
**「`next build` を実行するジョブは `next build` の成否を見ているはずだ」という名前からの推論**で、
型 B（読まずに分類する）そのもの。9月21日から続く「名前を出す前にそのファイルを開く」の系列
（`M-20260921-said-the-drift-checker-ignores-policies` /
`M-20260922-said-typegen-red-on-every-merge`）の3件目にあたる。
前2件は**否定形**（「Xは〜を見ていない」）だったが、今回は**肯定形**（「Xが緑なら〜が保証される」）。
**保証を約束する文も、否定形と同じだけ危ない。**

**再発防止**:
- 仕組み無し（判断に依存）。習慣は1つ: **「このチェックが緑なら X が保証される」と書く前に、
  そのジョブの `run:` を最後まで読む。** CI のステップは「落ちたら赤」とは限らず、
  この repo には**意図的に許容している箇所が現にある**。
- 前2件の再発防止（「名前を出して否定形を書く前に開く」）を、
  **「名前を出して保証を書くときも開く」に広げる。**

---

## M-20260924-shared-resolver-dropped-error-to-500 課金 API を共通関数へ寄せたとき、元の「DB エラーなら 500」を落とした（2026-09-24・型 D）

**Before**: 課金 API（checkout / portal / resume）の所属取得を `resolveActiveMembership` に置き換えた。元のコードには
`if (m.error) return apiInternalError(...)` があったが、共通関数は `data` だけを見て `error` を捨てる作りにした
（`resolveCallerWithRole` の既存実装をそのまま切り出したため）。

**After**: `/code-review` の指摘。選択中テナントの問い合わせが一時的に失敗すると「所属なし」と読まれ、
**最も古い所属テナントへ落ちて、そちらの契約を操作しうる**。以前は 500 で止まっていた。共通関数は問い合わせ失敗で
例外を投げ（課金ルートは既存の try/catch で 500）、`resolveCallerWithRole` は失敗時に null（未認証扱いで止まる）にした。
失敗時に 500 になり Stripe を呼ばないテストを追加し、修正を戻すと 3 件落ちることを確認。

**なぜ気づけなかったか**: 置き換え先の共通関数を「既に全画面で使われている＝正しい」と扱い、置き換え**元**が持っていた
エラー処理が移設先にあるかを見なかった。既存実装は表示系で使われていたので、失敗して別テナントに落ちても実害が小さかったが、
課金の操作に持ち込むと意味が変わる。**同じ関数でも、呼び出し元が変わると失敗時の許容度が変わる。**

**再発防止**: 仕組みとして上記テスト。習慣として: 処理を共通関数へ寄せるときは、置き換え元の分岐（特にエラー時の return）を
1つずつ書き出し、移設先で同じ扱いになっているかを確認する。フォールバックを持つ関数は「失敗」と「該当なし」を区別する。

## M-20260923-counted-only-page-files-for-tenant-bug 「最初の所属テナントで引く」箇所を page.tsx だけで数え、10件と報告した（2026-09-23・型 A）

**Before**: #1140 の Codex 指摘（詳細ページが選択中テナントを見ない）を直したあと、同じ書き方の残りを
`grep -rln 'from("tenant_memberships")' src/app/admin --include=page.tsx | xargs grep -L "resolveCallerWithRole\|active_tenant"`
で数え、「管理画面10ページに残っている」と代表に報告し、別タスクの提案にも10件と書いた。

**After**: 着手時に絞り込みを外して数え直すと **18 ファイル**だった。(1) `--include=page.tsx` で、同じ書き方の
**ルート 7 本**（証明書 CSV/PDF 出力 5・帳票 PDF・請求書 PDF）を落としていた。(2) `grep -L resolveCallerWithRole` で、
**別の箇所で正しい関数を使っているだけのファイル**（顧客詳細）を「直っている」側に分類していた。
さらに `src/lib/billing/adminFeatureGate.ts` と課金 API 5 本にも同じ書き方があった。

**なぜ気づけなかったか**: 検出器（grep）の絞り込み条件を、**症状が出た形（ページ）**で決めた。バグの本体は
「`tenant_memberships` を `limit(1)` で引く」という書き方で、ページかルートかは関係ない。除外条件
（`resolveCallerWithRole` を含む）も「その関数で**このクエリを置き換えている**」ことではなく「ファイルのどこかに在る」ことしか見ていない。

**再発防止**: 仕組みとして `src/lib/auth/__tests__/adminActiveTenant.test.ts`（`src/app/admin` が `tenant_memberships` を
直接引いたら落ちる。修正前のコードで 2 件とも落ちることを確認）。習慣として: 残りを数える grep は**バグの書き方そのもの**で引き、
ファイル種別で絞らない。除外条件は「同じファイルに良いものが在る」ではなく「悪いものが無い」で書く。

## M-20260923-new-key-axis-not-traced-to-every-entry-point 工数マスタに TC の軸と 0h の例外を足し、入口を全部たどらず5件の穴を残した（2026-09-23・型 C）

**Before**: 代表の指示で「食い違いは 0h を採らない」と「TC コードで差があれば TC 別に持つ」を実装した（#1138）。
`/code-review` を2回回して指摘6件を直し、テスト42件・`ci-parallel-checks` 8項目が緑だったので「マージ可」と報告した。

**After**: マージ直前に Codex が5件を指摘し、5件とも実際に起きる不具合だった（#1138 の中で修正し、squash コミット `dd9b947` として main に入った。テスト44件）。
1. 品番で見つかる「TC 問わず」の行を、品名でしか引けない TC 専用の行より先に返していた（照合の順が範囲の外側で回っていた）
2. 帳票画面の「工数マスタに登録」が TC を CSV に入れず、TC 別の工数を「TC 問わず」で登録していた
3. 型式共通 `*` に TC を付けた行を受け付けて保存するが、引く側はそれを一度も見ない
4. 0h の判定を小数2桁に丸める前にしていて、`0.001` が例外をすり抜けた
5. 0h を除いて採ったときも「後の行の 1.4h を採用」と表示していた

**なぜ気づけなかったか**: **新しい軸（TC・0h の例外）を、それを作る入口と使う入口の全部に通したかを数えなかった。**
工数の行ができる入口は4つ（貼り付け・工数マスタ形式 CSV・d-Happy 収集表・帳票画面からの登録）、引く入口は2つ
（品番・品名）ある。変更は目の前の2〜3入口に入れ、残り（帳票画面からの登録、品名での照合、型式共通）は
「前からある経路」として見なかった。テストも自分が触った入口にしか書いていないので、緑は穴の不在を示さない。
`/code-review` も差分の中しか見ないため、差分に現れない入口（触っていない `register()`）は原理的に映らない。

**型 C の再発防止が効かなかった理由**: 型 C の習慣（「ガードを入れたら、その操作を起こす画面に他の入口が無いか見る」）は
**ガード＝拒否の条件**を想定していて、今回の「値の作り方の規則（0h を採らない・TC を付ける）」には当てはめなかった。
規則もガードと同じく、入口の数だけ入れる必要がある。

**再発防止**: 仕組み無し（判断に依存）。習慣として:
- キー・軸・例外ルールを足すときは、**その値が「作られる入口」と「読まれる入口」を先に列挙し、表にして PR に書く。**
  各入口に「対応した／対象外（理由）」を付け、空欄のまま「マージ可」と言わない。
- 数値の比較（0 か、同じか）は **保存される形（丸め・正規化の後）で行う**。比較の直前に、その値がこの後どう変換されるかを読む。
- 表示する理由文（「後の行を採用」等）は、選んだ値から作る。規則を足したら、文言が規則と合っているかも確認する。

## M-20260923-draft-autosave-baseline-before-prefill 帳票フォームの自動保存を、テナント軸と URL プリフィルの経路を試さずに PR にした（2026-09-23・型 K）

**Before**: 帳票の新規作成フォームに localStorage の自動保存を入れた（PR #1140）。「空フォームは保存しない」ために、
マウント時の状態を基準にして差分があるときだけ保存した。キーは URL プリフィル（顧客・車両・案件・外注職人）だけで分けた。
テストは「プリフィル無しで入力→開き直して復元→破棄」と「空フォームは保存しない」の2本だけで、緑を確認して PR を開いた。

**After**: `/code-review` で3件の実害を指摘された。(1) キーにテナント・ユーザーが無く、テナント切替や共有端末の別スタッフに
宛先の住所・電話と別テナントの顧客 ID が復元される。(2) 基準はプリフィル適用**前**に取っていたので、顧客リンクから開いて
何も触らず戻るだけで保存され、次回「復元しました」になってプリフィルが効かない（コメントに書いた意図と逆）。
(3) 顧客なしの下書きを破棄すると支店の保留マーカーが残り、以降は顧客を変えても支店がリセットされない。
キーを `/api/admin/me` のテナント × ユーザー込みにし、保存は「人が最初に操作した時点」との差分だけにし、マーカーは顧客が
変わらないときは持たないように直した。3件それぞれにテストを足し、修正を戻すと落ちることを確認した。
その途中、(3) のテストが最初は**修正を戻しても緑**だった（別顧客の選択肢に古い支店 ID が無いので DOM 上は常に空に見える）。
元の顧客に戻して確かめる形に直した。

**なぜ気づけなかったか**: 自分が書いたテストは「プリフィル無し・1テナント」という一番単純な入口だけを通していた。
このフォームの主な入口（案件・顧客からの `?customer_id=` 付き遷移）と、保存先（ブラウザ）が誰と共有されるかを
列挙しなかった。「空フォームは保存しない」という意図を書いたのに、その意図を**プリフィルがある入口**で確かめていない。

**再発防止**: 仕組みとしては、今回足した回帰テスト（プリフィルだけでは保存しない・別テナント／別ユーザーは復元しない・
破棄後の支店リセット）。習慣として:
- ブラウザ保存を足すときは、キーに**テナントとユーザー**が入っているかを最初に確認する。
- 状態を保存・復元するコードは、そのフォームの**入口をすべて**（URL プリフィル・AI 起票・編集）列挙し、各入口で1本ずつ通す。
- 回帰テストは、直した箇所を一度戻して**落ちること**を見てから信用する（陰性対照、`M-20260907-no-negative-control` と同じ）。

**追記（同日）**: マージ直前に CodeQL が「平文での機微情報保存」（high）で落ちた。支払条件（`billing_terms_note` 由来）と
宛先の住所・電話をそのまま localStorage に書いていた。自分で DECISION_LOG に「共有端末で住所・電話が見えうる（TTL で緩和のみ）」と
リスクを書いておきながら、**書いたリスクを「注意点」扱いで出荷した**。保存対象から外し、復元時は顧客・支店の登録内容から埋め直すよう直した
（外したことを戻すと落ちるテストを追加）。習慣として: ブラウザに保存する項目は、**残してよい項目を列挙して選ぶ**（全部入れてから外すものを考えない）。

## M-20260923-git-add-all-swept-a-formatted-generated-file 生成ファイルを `git add -A` で巻き込み、3万行の差分を PR に載せた（2026-09-23・型 F）

**Before**: main が動くたびに `git merge` → `git add -A && git commit --no-edit` でコンフリクトを解消していた。
コミット後は `ci-parallel-checks.sh` と `check:migrations` を回し、どちらも緑だったので push した。
検証が通った＝差分は意図どおり、と読んでいた。

**After**: PR の `additions` が 328 → **16,482** に跳ねていた。マージ結果に含まれた
`src/types/db.generated.ts`（18,000 行超の生成ファイル）を `git add -A` が staged にし、
pre-commit の `npx lint-staged`（Prettier）が整形して **32,338 行**の差分を作っていた。
中身はセミコロンの有無と改行位置だけで、スキーマは1文字も変わっていない
（本 PR の変更は CHECK 制約のみで生成型に影響しない）。main の版に戻して `--no-verify` でコミットし、
`git diff --stat origin/main...HEAD` が 8 ファイル・328 insertions に戻ったことを実測した。

**なぜ気づけなかったか**: **検査が緑であることを、差分が意図どおりであることの証明として扱った。**
lint も tsc も「整形された生成ファイル」を正しいと判定する —— 整形は壊れていないので当然通る。
CI は「この差分は出すべきか」を一度も問わない。加えて `git add -A` は打った時点では
何を staged にしたか見えず、hook がその後さらに書き換えるので、**コミットが出来上がるまで
中身が確定しない**。自分が作った成果物を、送る前に1度も見ていなかった。

**再発防止**: 当初は「仕組み無し（判断に依存）」と書いたが、**2026-09-24 に同じことが再発した**
（`git add -A` を避けて名指しで add したのに、マージで staged に入った生成ファイルを
lint-staged が整形した）。習慣では止まらなかったので仕組みにした。

- **仕組み**: `src/types/db.generated.ts` を `.prettierignore` に入れた。
  staged に紛れ込んでも prettier が触らない。わざと整形を崩した行を足して
  `prettier --write` が書き換えないことを確認済み。
- 習慣（引き続き）:
  - **push の直前に `git diff --stat origin/main...HEAD` を打ち、ファイル数と行数を読む。**
    PR 本文に書いた件数と合わない、あるいは触っていないファイルが居たら止まる。
    2回とも、これで気づいた。
  - コンフリクト解消では `git add -A` を使わず、**コンフリクトしたファイルだけを名指しで add する**。
  - 生成ファイル（`*.generated.*`・lock ファイル）が差分に現れたら、
    自分がそれを変える変更をしたかを確認する。していなければ `git checkout origin/main -- <path>` で戻す。

## M-20260923-fixed-url-length-in-one-route-not-its-sibling 品名を URL に並べる照会を工賃計算だけ直し、登録 API に残して本番で 400 を出した（2026-09-23・型 J）

**Before**: #1133 の `/code-review` が「工賃計算（quote）で品名を `in()` に並べると URL が長すぎる」と指摘。
quote ルートは「型式の行をまとめて読みアプリ側で照合」に直した。同じ書き方（`.in("part_key", …200件)`）が
工数の登録 API（`/api/admin/labor-hours` POST の重複確認）にもあったが、見に行かなかった。

**After**: 代表が d-Happy 収集 Excel（JF5・DG5・RP8、443行）をファイル登録したら「サーバーエラーが発生しました」。
本番の API ログで、重複確認の照会 `GET labor_hour_masters?…part_key=in.(日本語の品名200件)` が **400** を
2回返していた（13:52・13:53 UTC）。RS5 の82行のファイルは URL が収まって通っていた（82行登録済み）。
登録 API も型式ごとにまとめて読む形に直し、`in("part_key"` がリポジトリに残っていないことを grep で確認。

**なぜ気づけなかったか**: 指摘を「quote ルートの問題」として受け取り、**同じ書き方の兄弟**を探さなかった。
直した理由（日本語キーを URL に並べると長い）は書き方そのものの性質で、ルートに固有ではない。
加えて、手元の検証（純関数テスト・CSV パース）は PostgREST を通らないので、URL 長の失敗は原理的に映らない。
少件数（RS5 82行）で通ったことも「動く」と見えた。

**再発防止**: 仕組み無し（判断に依存）。習慣として:
- レビュー指摘を直したら、**その指摘の理由が当てはまる書き方をリポジトリ全体で grep する**（今回なら `in("part_key"`）。
  直した箇所の数と、grep で残りが 0 件であることを PR に書く。
- 可変長の文字列（名前・自由記述）を `in()` に渡す照会は作らない。キーの集合で絞るなら短い識別子（型式・ID）で絞り、
  残りはアプリ側で照合する。

## M-20260923-schema-snapshot-missed-again 新表を足して `check:schema` を回さず赤を push した —— 前日と同じ失敗（2026-09-23・型 E）

**Before**: PR #1131 で工数マスタ `labor_hour_masters` と `customer_branches.labor_rate_per_hour` を
追加した。`tsc`・変更ファイルの `eslint`・関連 `vitest`（421件）・`lint:migrations`・
**全マイグレーションの空 DB 再生（499/499）と再生 DB 上での制約の実動作確認**まで回し、
「検証済み」として push した。

**After**: CI の "Lint, Type Check & Unit Tests" が `check:schema` で落ちた
（`テーブル labor_hour_masters が存在しない` ほか6件）。`scripts/schema.snapshot.json` に
1表11列と1列を追記して緑。`bash scripts/ci-parallel-checks.sh` 8/8 通過を確認してから再 push。

**なぜ気づけなかったか**: **前日の `M-20260922-pushed-without-ci-parallel-checks` と同じ形。**
その再発防止は「push 前に `ci-parallel-checks.sh` を回す」という**習慣**で、台帳の中にしか
書かれていなかった。このセッションでは台帳を読まずに作業を始めたので、習慣は発動しなかった。
加えて、依存を `npm ci --ignore-scripts` で入れたため husky（`prepare`）が走らず、
pre-commit / pre-push フックがこの環境で**無効のまま**だった。検証の手を厚くした（空 DB 再生・
制約の実動作）ことで「十分検証した」感覚が強まり、CI と同じ集合かどうかを問わなかった。

**再発防止**: 仕組みあり。
- `.husky/pre-push` に `node scripts/check-schema.mjs`（0.8秒）を追加。snapshot の追記を戻すと
  exit 1、戻すと exit 0 になることを確認した（陰性対照あり）。
- 依存を `--ignore-scripts` で入れた環境では `npx husky` でフックを有効化する（今回実施、
  `core.hooksPath=.husky/_`）。フックが無効だと上の仕組みも効かない。
- 型 E の再発防止が習慣のままだと、台帳を読まないセッションでは効かない。**習慣で書いた
  再発防止は、同じ失敗が2回出たら仕組み（フック・CI 前段）に格上げする。**

## M-20260922-renamed-a-migration-the-preview-db-had-applied プレビュー DB が既に適用済みのマイグレーションを改名し、`Supabase Preview` を赤にした（2026-09-22・型 C）

**Before**: `main` が `20260922140000` を足したので、`lint:migrations` の
`migration-version-before-base-head` に従って `20260922131500` / `131600` を
`141000` / `141100` へ改名した。ローカルの再生 498/498 緑、`ci-parallel-checks.sh` 8/8 緑。
「検証済み」として push した。

**After**: `Supabase Preview` が落ちた。

    Remote migration versions not found in local migrations directory.

**改名する前の push（8dc08c20）で、プレビュー DB は旧い名前のまま適用を終えていた。**
プレビュー分岐の `supabase_migrations.schema_migrations` に `20260922131500` /
`131600` が残り、ローカルには対応するファイルが無い。`supabase db push` は
「台帳にあるがファイルに無い版」を見つけると止まる。
`reset_branch(migration_version = "20260922123100")` で復旧。

**なぜ気づけなかったか**: **改名には行き先が2つあるのに、1つしか見なかった。**
改名の理由は「本番の `supabase db push` を out-of-order で止めないため」で、
そちらは `lint:migrations` が見てくれる。だが**もう1つの消費者 —— この PR に
既に付いていて、旧い名前で適用を済ませているプレビュー DB —— を見ていない。**
ローカルの再生は毎回まっさらな DB を立てるので、この失敗は原理的に映らない。
「ローカルで全部緑」は、**台帳を持ち越す環境については何も言っていない。**

**再発防止**: 仕組み無し（判断に依存）。`lint:migrations` は本番の台帳しか知らず、
プレビュー分岐の状態は手元から見えない。習慣として:
- **既に push 済みの PR でマイグレーションを改名したら、プレビュー DB のリセットまでが1セット。**
  手順は `docs/operations/migrations.md`「適用済みファイルを改名したら、プレビュー DB をリセットする」。
- Supabase の bot が書く「PR を close して reopen しろ」は採らない（CI を蹴り直す行為）。
  `reset_branch` を使う。

---

## M-20260922-enumerated-actions-from-typescript-only 監査 action の語彙を TypeScript だけ grep して数え、本番で機能が3つ止まっているのを「記録が落ちている」と書いた（2026-09-22・型 A、併せて型 C）

**Before**: `insurer_access_logs_action_check` が4値しか許さないのを見つけ、`src/` を grep して
「アプリが書く `action` は 13 種類、うち 11 種類が弾かれている」と OPEN_QUESTIONS に書いた。
被害は「案件操作の監査記録が1件も残っていない」だと結論し、
「語彙の決め方に判断が要るので代表に確認」として PR の対象外に置いた。

**After**: 数も、被害の大きさも、原因の切り分けも間違っていた。

- **書き手は TypeScript だけではない。** 本番の SQL 関数3本が `insurer_access_logs` に
  直接 insert していて、その `action` が `vehicle_search` / `store_search` / `vehicle_view`。
  3本とも例外ハンドラが無く `RETURN QUERY` の**前**に insert するので、
  **関数ごと中断する**。つまり `GET /api/insurer/vehicles`・`/api/insurer/stores`・
  `/api/insurer/vehicles/[id]` は**本番で必ず 500**。記録の欠落ではなく機能停止だった。
- **「11 種類」は誤り。** 正しくは TypeScript 10 + SQL 3 = **13 種類が弾かれる**
  （4値の外にある値の数。`| wc -l` で数え直した）。
- **`issue_certificate` は無関係だった。** `src/lib/ai/jobNextAction.ts` などの別の語彙を
  同じ一覧に混ぜていた。`insurer_access_logs` には一度も書かれない。
- **「`audit.ts` は throw するのでリクエストごと 500」も誤り。**
  `audit.ts` は `AuditAction` を4値に型で縛っているので、そもそも弾かれる値を渡せない。
  実際に落ちているのは、戻り値の `error` を見ていない 10 箇所の直 insert（黙って欠落）と、
  上の SQL 関数3本（500）。

**なぜ気づけなかったか**: **「アプリが書く値」を数える道具として `src/` の grep を選び、
その道具が母集団を覆っているかを確かめなかった。** `insurer_access_logs` に書けるのは
アプリだけではない —— SECURITY DEFINER の SQL 関数も書く。`supabase/migrations/` も
本番の `pg_proc` も、どちらも1クエリで見られる場所にあったのに見ていない。
さらに、被害の大きさを**書き手の側（誰が insert するか）だけで判断し、
読み手の側（その insert が失敗したとき呼び出し元がどうなるか）を見なかった**。
TypeScript の直 insert は結果を捨てるので無害に近いが、SQL 関数の中では
同じ失敗がトランザクション全体を落とす。**同じ制約違反でも、置かれた場所で被害が桁違いになる。**

**再発防止**: 仕組み半分。
- 「この表に何が書かれるか」を数えるときは、**アプリのソースと DB の関数定義の両方**を見る。
  `select proname from pg_proc where pg_get_functiondef(oid) like '%<表名>%'` が1行で効く。
- 列挙した値が本当に弾かれるかは、**本番で insert を試して ROLLBACK する**。
  今回それをやって初めて 23514 を実測した（推論ではなく観測になった）。
- 被害を書く前に、**その insert の直後に何があるか**（`RETURN QUERY` か、結果を捨てる `await` か）
  を1行読む。ここが「記録が落ちる」と「画面が落ちる」を分ける。

**2026-09-23 追記 —— この訂正自体もまだ不完全だった。** (a) で CHECK を広げる作業に入り、
書き込み経路を数え直したところ、**「13 種類」も誤りで、正しくは 16 種類**だった。
落としていたのは `insurer_audit_log` RPC に渡される3つ:
`insurer.export.csv` / `insurer.export.csv.one` / `insurer.export.pdf.one`。
**ドット区切り**なので、訂正時に使った `[a-z_]+` の正規表現では原理的に拾えない。
しかも経路が `.insert({action: ...})` ではなく `rpc("insurer_audit_log", { p_action })` で、
**表名を grep する方法では当たらない**（関数が素通しするので、表名はアプリ側に出てこない）。

つまり同じ数字を2回続けて外した（11 → 13 → 16）。**なぜ2回目も外したか**: 1回目の反省を
「TypeScript だけでなく SQL も見る」と**経路の話に閉じてしまい**、「値そのものの形」を
決め打ちした正規表現を使い回した。**母集団を広げても、掬う網の目が同じなら同じものが落ちる。**

再発防止の追加: 値を列挙する正規表現は、**その値の形を仮定しない**
（`"([^"]*)"` のように引用符の中身を丸ごと取る）。
そして列挙した結果は、**1件ずつ DB に入れて通るか**で裏を取る
（`scripts/replay/checks/insurer_access_logs_action_vocab.sql`。
修正を外すと 16 件ちょうどが弾かれることを実測した）。

**同じ追記の中で3つ目も出た。** 被害の分類も誤っていた。`insurer_audit_log` RPC 経由の
3経路を「TypeScript の直 insert と同じく黙って落ちる」と書いたが、`/code-review` の指摘で
呼び出し元を読み直したところ、`export` / `export-one` / `pdf-one` はいずれも
`if (logErr) return apiValidationError(...)` で**ファイルを出す前に止まる**（fail-closed）。
つまり **CSV/PDF 出力も 400 で壊れていた** —— 落ちていたのは3画面ではなく **6エンドポイント**。
加えて「12 箇所が `error` を見ていない」も誤りで、`audit.ts` 2本は `throw` するので **10 箇所**。

**なぜ3つ目も外したか**: 自分で書いた再発防止「**その insert の直後に何があるか**を1行読む」を、
**直 insert にだけ適用して RPC 経路に適用しなかった。** RPC は「関数の中で insert する」ので
直後を読む対象は関数側だと考え、**呼び出し元がその戻り値をどう扱うか**を見ていない。
同じ型（B. 読まずに分類する）を、同じ調査の中で3回繰り返したことになる。

再発防止の追加: 「黙って落ちる／画面が落ちる」を書く前に、**その経路の呼び出し元まで
1段ずつ降りて、エラーの行き先を全部名指しできるか**を確かめる。名指しできない経路は
「【要確認】」と書く。

---

## M-20260922-copied-a-check-without-checking-the-default 本番から CHECK だけを写し、同じ列の既定値を見ずに新環境の車両登録を壊した（2026-09-22・型 B）

**Before**: 本番にあってマイグレーションが作らない制約9本を取り込むとき、
`vehicles_public_id_format_chk`（`CHECK (public_id ~ '^v_[0-9a-f]{24}$')`）を
本番の `pg_get_constraintdef` からそのまま写した。定義は正しく写せている。
「本番から写したのだから本番と同じ振る舞いになる」と考えて、そこで止めた。

**After**: Codex が P1 で指摘した。**同じ列の既定値が本番とマイグレーションで違っていた。**

    本番            DEFAULT generate_vehicle_public_id()  → 'v_' + 24桁hex  → 通る
    マイグレーション DEFAULT 'veh_' || replace(gen_random_uuid()::text,'-','')
                                                          → 'veh_' + 32桁hex → 弾かれる

アプリは `public_id` を省いて insert するので、**空 DB から作った環境では
通常の車両登録が必ず 23514 で落ちる**。実際に修正を外して再生し、落ちることを確認した。
本番は既定が生成関数なので無傷（実データ27行すべて `v_` 始まり）。

**なぜ気づけなかったか**: **列を「名前」の単位で考えていた。** 列には
生成側（DEFAULT）と検査側（CHECK）があり、**片方だけ揃えると矛盾する**。
自分で書いた `20260922123100` のヘッダに「名前しか見ない検出器には映らない差がある」と
書いておきながら、それは外部キーの発火順の話だと思っていて、**同じ穴が既定値にも空いている**
ことに繋げられなかった。「本番から写した」は定義の正しさの保証であって、
**その定義が新しい環境で満たされるかの保証ではない**。

**再発防止**: 仕組み —— `scripts/replay/checks/vehicles_public_id_default.sql` を足した。
`public_id` を省いて車両を入れ、既定が CHECK を通る形かまで見る。
DEFAULT と CHECK のどちらが変わっても落ちる（修正を外して実際に落ちることを確認済み）。
習慣 —— **列に CHECK を足すときは、その列の DEFAULT と、その列を省く書き込み経路を必ず見る。**

## M-20260922-pushed-without-ci-parallel-checks 新表を足したのに `check:schema` を手元で回さず、赤を push した（2026-09-22・型 E）

**Before**: メーカー通知チャネルで新表 `manufacturer_notifications` を追加した。手元で
`tsc` / `eslint`（変更ファイル）/ `vitest`（FT+api）/ `check:migrations` を回して全部緑を
確認し、「検証済み」として push した。

**After**: CI の "Lint, Type Check & Unit Tests" が `check:schema` で落ちた。
`scripts/schema.snapshot.json` は実スキーマのコピーで、コードが参照する表がここに載って
いないと `check-schema.mjs` が落とす。新表を足したのに snapshot を更新していなかった。
snapshot に1表追記して緑。CI ジョブは `bash scripts/ci-parallel-checks.sh` 一発で回る一式
（lint / lint:migrations / tsc / test:coverage / **check:schema** / check:context-dates /
check:ox-override / check:ledger-ids）だが、これを回さず記憶にある4つで判断していた。

**なぜ気づけなかったか**: リポジトリが「CIと同じ検査」を1コマンドで用意している
（`scripts/ci-parallel-checks.sh`、コメントに M-018 の教訓まで書いてある）のに、それを
回さず「思い出せる検査」で代替した。新表＝マイグレーションの話だと思い込み、
`check:migrations`（空DB再生）は回したが、**コードが参照する表とスナップショットの突き合わせ**
（`check:schema`）は別物だと結びつかなかった。型 E の再発防止（CIと同じ検査を走らせる）が
効かなかったのは、用意された一括スクリプトの存在を確認せず記憶で代替したため。

**再発防止**: 仕組みあり。**push 前に `bash scripts/ci-parallel-checks.sh` を回す**
（"Lint, Type Check & Unit Tests" ジョブと同一の集合）。特に表・列・ビューを増減した PR では
`check:schema` が新規/変更表を要求するので、**新表を足したら `scripts/schema.snapshot.json`
更新をセットで行う**。個別スクリプトの寄せ集めで「全部緑」と判断しない。

## M-20260923-committed-conflict-markers-from-truncated-merge-output マージ出力を `tail -3` で切って衝突1件しか見ず、残り3ファイルの衝突マーカーをコミットした（2026-09-23・型 A）

**Before**
- 信じたこと: 取り込もうとしているコミット（`ed1a055`）の tree は `main` の tree と
  **完全に一致している**。だからこのマージは実質何もしない。衝突は起きようがない。
- したこと: `git merge ... 2>&1 | tail -3` で実行し、出力の末尾に見えた
  `CONFLICT ... RELEASE_LOG.md` の1件だけを直して `git add -A && git commit`。

**After**
- 実際の衝突は **4ファイル**だった（`LEDRA_CURRENT` / `MISTAKE_LEDGER` /
  `NOTE_CANDIDATES` / `RELEASE_LOG`）。`tail -3` が上3件を捨てていた。
- `git add -A` は**衝突マーカーごと**ステージする。`<<<<<<< HEAD` を含む3ファイルが
  そのままコミットされた。
- 前提自体は正しかった。tree は一致している。だが3方向マージの**ベースは
  squash 前の `3901a38`** になるので、git から見れば「squash で入った変更」と
  「元のコミットで入った変更」は別物で、突き合わせて衝突する。
  **「結果が同じ」と「git が同じだと分かる」は違う。**
- 正しい直し方は `-s ours` —— こちらの tree をそのまま保ち、祖先関係だけを記録する。
- push 前に気づけたのは、マージ後に **tree を突き合わせる検証を入れていたから**。
  「内容が変わらないはず」と言った以上、変わっていないことを確かめる、という一手である。

**なぜ気づけなかったか**
- **このセッションで4回のマージすべてに `git grep '^<<<<<<<'` を通していたのに、
  5回目だけ飛ばした。** 理由は「今回は空マージだから」。
  習慣を止めた判断そのものが、確かめずに置いた前提だった。
- `tail -3` は**出力を読みやすくするため**に付けた。出力の量を減らす操作は、
  同時に**見落としの窓を開ける操作**でもある。
  `M-20260915-dupe-count-from-truncated-grep`（切れた grep の件数を報告した）と
  同じ根で、対象が grep からマージ出力に変わっただけである。
- 型 A の再発防止に「検出器を変えたら、一覧から消えたものを1件ずつ確認する」と
  書いてあるが、**`tail` は検出器を変える操作だと思っていなかった。**

**再発防止**
- 仕組み: pre-commit が動けば `check:ledger-ids` などは走るが、
  **衝突マーカー自体を止める検査は無い**（今回は `--no-verify` でもあった）。
  マーカーは lint 対象外の Markdown にも入るので、`git grep` が唯一の網である。
- 習慣: **`git merge` の出力に `tail` / `head` を付けない。** 付けるなら
  `grep -E "^(CONFLICT|Auto-merging)"` のように**落としたい行を名指しする**。
  末尾N行は「何を捨てたか」を言えない。
- 習慣: **衝突の有無にかかわらず、マージ後は必ず `git grep '^<<<<<<<' -- .` を通す。**
  「今回は空マージだから要らない」は、この台帳で何度も出ている言い訳の形である。

---

## M-20260922-said-ten-checks-without-listing-them CI のチェック数を「全10本」と繰り返し報告したが、数えた一覧を一度も見ていなかった（2026-09-22・型 F）

**Before**
- 信じたこと: PR #1115 の CI は「全10本 green（9 success / 1 skipped）」である。
- したこと: この数字を代表への報告に書き、PR 本文にも書き、さらに**自分宛ての
  チェックイン文にも書いて**、以後の周回で前提として使い回した。

**After**
- ワークフロー一覧を実際に取ると、この PR の head で走るのは **4本**
  （CI / CodeQL / Gitleaks / Lines of Code）と、Vercel のコミットステータス1件だった。
- 「10」はおそらく GitHub の Checks 画面がワークフロー内の**ジョブ単位**で並べた数だが、
  **この環境で一度も数えていない**ので出所を言えない。「9 success / 1 skipped」の
  内訳も同じく根拠が無い。
- 結論（緑である）は変わらない。外れていたのは数え方だけである。

**なぜ気づけなかったか**
- **その数字が結論を変えないので、検証の対象だと思っていなかった。**
  「緑かどうか」は確かめたが、「何本あるか」は確かめずに添えた。
  だが CLAUDE.md は「件数を書いたら数え直す。会話で口に出す数字は、言う前に数える」と
  書いてある。結論が正しければ根拠は要らない、ではない ——
  **根拠を言えない数字が1つ混じると、言えるはずの数字まで信用を落とす。**
- 悪化させたのは、**チェックインの引き継ぎ文に書いたこと**。自分で自分に誤った前提を
  配り続け、毎周それを読み直して再確認したつもりになっていた。
  `M-20260921-restated-my-own-summary-as-fact`（自分の要約を事実として扱う）と同じ形が、
  要約ではなく**自分で書いた引き継ぎ文**で起きている。
- 気づいたきっかけは、ワークフロー一覧を実際に取る必要が出たときだけである。
  必要が出なければそのまま通っていた。

**再発防止**
- 仕組み: 無い（判断に依存）。
- 習慣: **「N本」と書く前に、その N を出した一覧をこのセッションで実際に見る。**
  見ていないなら数を書かず「一覧は PR の Checks を参照」と書く。
- 習慣: **自分宛ての引き継ぎ文に書く数字も、代表に言う数字と同じ基準で扱う。**
  読み手が自分でも、未検証の数字は未検証のままである。

---

## M-20260922-said-typegen-red-on-every-merge 自分が編集したワークフローの `on:` を読まず、「マージのたびに赤」と書いた（2026-09-22・型 F）

**Before**: PR #1111 で `db-typegen.yml` に `continue-on-error` を足したとき、その理由を
「`TYPEGEN_TOKEN` が未登録の間、**マージのたびに赤**」と書いた。PR 本文と `RELEASE_LOG` の
両方に同じ文を置き、そのままマージした（`7f66029`）。代表の依頼文の言い回しを、
確かめずにそのまま受け取っている。

**After**: `db-typegen.yml` の `on:` は `workflow_run`（"DB migrate (apply to production)" の完了）
と `workflow_dispatch` だけで、その `db-migrate.yml` は `push: main` の
**`paths: supabase/migrations/**`** に絞られている。**マイグレーションを含まないマージでは
db-typegen は起動しない。** 実測: `main` での直近の db-typegen 実行3件は `a3ed785`(#1104) /
`7d1b72e`(#1106) / `088be98`(#1107) の**いずれもマイグレーションを含むマージ**で、
#1108〜#1110（マイグレーション無し）では1件も走っていない。2026-09-01 以降の `main` への
マージ 101 件のうち `supabase/migrations` を触るのは **27 件**（`git log --first-parent` の
2経路で計数）。「マージのたびに」は実際の**約4倍**だった。

**直したこと自体は変わらない**: 27 件でも赤は赤で、赤が常態になる問題は同じ。
**外れていたのは頻度の主張だけ**だが、代表はその頻度を見て「いつ登録するか」を決める。

**なぜ気づけなかったか**: **そのファイルを自分で開いて編集しているのに、`on:` を一度も
読んでいない。** 触ったのはファイル末尾の PR 作成ステップだけで、視線が冒頭に戻っていない。
前日の3件（`M-20260921-said-the-drift-checker-ignores-policies` ほか）の再発防止に
「名前を出して否定形を書く前に X を `cat` する」と書いたが、**今回は `cat` どころか
編集までしていて、なお読んでいない。** 開くことと読むことは別だった。
もう一つの根は、**依頼文の中の事実主張を検証対象に数えていない**こと。代表の
「マージのたびに赤くなり続けます」は症状の報告であって実測ではないのに、
前提としてそのまま PR 本文へ写した。

**再発防止**:
- 仕組み無し（判断に依存）。習慣は1つ: **ワークフローを編集したら、`on:` と
  `if:` を声に出して読む。** 「いつ走るか」を言えないワークフローの頻度を書かない。
- **依頼文に含まれる事実主張（頻度・件数・「いつも」「毎回」）は、依頼の一部ではなく
  検証対象として扱う。** 代表の言葉でも、PR 本文に写した時点で自分の主張になる。

---

## M-20260921-restated-my-own-summary-as-fact 自分の以前の要約から数字を転記し、環境で確かめ直さずに代表へ報告した（2026-09-21・型 F）

**Before**
- 信じたこと: セッションが長くなり要約を挟んだあと、**その要約に書いてある事実は
  確定済み**だと思っていた。要約は自分が書いたものなので、元の検証も済んでいる、と。
- したこと: 代表への報告に、要約から転記した2つの事実をそのまま載せた。
  1. 「Stripe SDK **22.6.2** の型に `paypay` はゼロ」
  2. 「C2PA 適合性ゲートが CI で**黙ってスキップ**されている」

**After**
- 1 は**バージョンが違った**。実際は `package.json` が `^20.4.1`、解決後も 20.4.1。
  `#1017` の時点からずっとそうで、22.6.2 はどこにも無い。
  結論（`paypay` ゼロ）は変わらないが、**代表には2回とも誤ったバージョンを伝えていた**。
- 2 は**すでに解消していた**。`npm ci` は `@contentauth/c2pa-node` 0.9.5 を実際に入れ、
  ゲート4本は実走して通る。しかも**同じセッションで自分が回した全体テストは
  ずっと `1 skipped` を出していた** —— 「4本がスキップされている」なら 5 になるはずで、
  数字が合っていない。
- どちらも `node -p "require('./node_modules/…/package.json').version"` と
  `npx vitest run` の1回で確定する。

**なぜ気づけなかったか**
- **要約を「検証の結果」ではなく「検証そのもの」として扱った。** 要約は前のやりとりの
  圧縮であって、環境の現在の状態ではない。要約された時点では正しかった事実が、
  数日後・別コンテナでも正しいとは限らない。
- 2 については**反証が自分の手元に出ていた**。全体テストの `1 skipped` を何度も見ておきながら、
  「C2PA が沈黙している」という手持ちの主張と突き合わせていない。
  型 F の説明にある「**自分がこれから追記しようとしているログファイル自身に、
  既に矛盾する記述が無いか確認しない**」の、ログではなく**自分の直前の出力**版である。
- さらに悪いのは、代表に「宿題が残っています」と**繰り返し**報告していたこと。
  誤りが自分の中で止まらず、相手の認識になる。

**再発防止**
- 仕組み: 無い（判断に依存）。「その数字は要約由来か、この環境で取ったか」を
  機械が区別する方法が無い。
- 習慣: **要約をまたいだ事実は、報告の前に1回だけ環境で取り直す。**
  特に (a) バージョン番号 (b) 「〜が動いていない／入っていない」という否定形。
  否定形は状況が変われば黙って真でなくなるのに、更新されずに残りやすい。
- 習慣: **自分が今セッションで出した出力と、これから言う主張が食い違っていないか見る。**
  今回は `1 skipped` という1行がそこにあった。

**追記（同じ日に同じ形をもう一度）**
- 上を書く直前、`node_modules` が無いコンテナで
  `grep node_modules/stripe/types/*.d.ts` と `ls node_modules/@contentauth/c2pa-node` を打ち、
  **「`paypay` 0件」「c2pa-node なし」という結果を得ていた。** どちらも存在しないパスを
  見ただけで、0 も「なし」も何も意味していない。型 A（道具を検証しない）。
- 代表に出す前に気づいて撤回できたのは、**陽性対照を置く習慣が働いたから**である。
  やり直したときに `konbini` が 203 件取れることを先に確かめ、そこで初めて
  `paypay` の 0 が意味を持った。
- **教訓**: 「0件」「無い」という結果は、**その道具が非ゼロを返せることを示すまで結果ではない。**

---

## M-20260921-said-the-drift-checker-ignores-policies ドリフト検出器が何を見ているかを読まずに「ポリシーは見ていない」と書き、論点を1つ捏造した（2026-09-21・型 A）

**Before**: 本番にだけ在る RLS ポリシー3本を見つけたとき、`OPEN_QUESTIONS` に
「**ポリシーの有無を見る検査が無いので、次に同じことが起きても気づけない。
`check-schema-drift.mjs` は表と列しか見ていない**」と書き、「`pg_policies` を
ドリフト検出の対象に入れるか」を未決事項として起票した。PR #1107 でマージ済み。

**After**: `check-schema-drift.mjs` は**今日より前から**ポリシー名を双方向で比べていた
（`55c2faf` の版で確認。`policiesFromDump()` / `prod.policy` / `extraPolicies`、
`LABEL` に「RLS ポリシー」）。「本番にあってマイグレーションに無いポリシー」は
`total` に加算され **exit 1** する。**今日見つけた3本は、この検出器が報告できる対象だった。**
起票した「未決」は最初から決まっていた。

**なぜ気づけなかったか**: **ファイルを開いていない。** `grep -rn "my_insurer_ids"` で
ポリシー側は丁寧に数えたのに、「その差を誰が検出するか」の側は
**437 行のスクリプトを1行も読まずに**「表と列しか見ていない」と書いた。
根拠は無く、**「自分が今見つけたのだから、検出器は見ていなかったのだろう」という推論**だけ。
実際には「検出器は報告していたが、誰も出力を読んでいなかった」かもしれず、
その2つは**打ち手がまったく違う**（検査を足す／赤を放置しない仕組みを作る）。
論点を1つ捏造して、代表に差し出していた。

**今日3件目の同じ形**: 朝は `M-20260921-classified-rls-impact-from-one-policy`
（同じ表の兄弟ポリシーを読まずに影響を分類）、昼は
`M-20260921-detector-covered-half-the-tables-i-had-listed`
（検査が何を数えているか突き合わせず「検証済み」と書いた）。
**3件とも「自分が使った／言及した道具の中身を読んでいない」。**
朝の再発防止に「`pg_policies` を `tablename` で引く」と書いたが、
**それは調べ方の話で、「主張する前にそのファイルを開く」ではなかった。**

**再発防止**:
- 仕組み無し（判断に依存）。習慣にするのは1つだけ:
  **「Xは〜を見ていない」と書く前に、X を `cat` する。** 検出器・スクリプト・
  ワークフロー・ポリシー——**名前を出して否定形を書くときは、必ず開いてから書く。**
  否定形（「〜が無い」「〜は見ていない」）は、肯定形より検証が軽い（1回開けば済む）のに、
  検証されないまま未決事項に化けやすい。
- 起票の形も変える: **「Xが無い」ではなく「Xを開いた結果こうだった」と書く。**
  開いていないなら起票しない。

---

## M-20260921-file-content-read-as-behavior ファイルに在ることを、動いたこと・覆われていることの証拠として扱った（2026-09-21・型 G）

**Before**: 2 件の指摘を同時に踏んだ。どちらも「ファイルの中身」を「振る舞い」の証拠にしていた。

1. `db-migrate` の失敗 17 回について、各実行の `head_sha` 時点の `db-migrate.yml` を取り出し、
   壊れた文言の有無で分類して **「配信 9 回 / 不配信 8 回」** と書いた。
2. `vercel-deploy.yml` に「失敗を Slack に通知」ステップが在ることを確かめて、
   **「17 本中 2 本が失敗通知を持つ」＝案A が進んでいる**と書いた。

**After**: どちらも証拠が足りていなかった。

1. 壊れていないコードが示すのは「**配信できる状態だった**」までで、配信の証明ではない。
   シークレット未設定なら warning を出して `exit 0` する経路も同じく step success になる。
   実際にログで Slack の `ok` を確認できているのは **#76 の 1 件だけ**だった。
2. `vercel-deploy.yml` のトリガーは `workflow_dispatch:` **のみ**（`branches: [main]` は
   コメントアウト）。ヘッダにも「Vercel の GitHub 連携が止まったときに明示的に叩く緊急レバー」と
   書いてある。通常のデプロイは Vercel の Git 連携が行うので、**この起票が想定している
   「無音で止まる」経路は、このワークフローでは覆えない**。つまりカバレッジは実質 1 本のままだった。

- 対処: 1 は「不配信 8 回は確実 / 残り 9 回はステップ成功、うちログ確認は 1 件」と書き直し、
  残りを【要確認】にした。2 は「通知ステップが在ること」と「その経路が監視されていること」を
  分けて書き直した。

**なぜ気づけなかったか**: **ファイルを読むのは安くて、実行を確かめるのは高い。**
安い方で答えが出たように見えると、そこで止まる。1 は 17 件すべてを機械判定できたので
「全件やった」感があり、**全件やったことと、正しいものを測ったことを取り違えた**。
2 は `grep SLACK_WEBHOOK_URL` でファイル名が 2 つ出たのを数えただけで、
**`on:` を読んでいない**。同じファイルの 41 行目を見れば 10 秒で分かった。

同じ日の `M-20260921-two-samples-read-as-all` と根は近いが、あちらは「標本が母集団を
代表していない」、こちらは「測っている量が主張と違う」。前者は数を増やせば直るが、
**後者は数を増やしても直らない**。

**この型の再発防止が効かなかった理由**: 型 G の既存エントリ（M-033）は「grep で語の存在を
確かめてテストを緑にした」ケースで、**自分のコードの話**だった。今回は
**既に動いた他人の実行結果・既存のワークフロー**が対象で、同じ型だと思わなかった。
型 G の説明にその範囲を足した。

**再発防止**: 仕組みは作らない（判断に依存）。習慣を 2 つ。
1. **「動いた」「覆われている」と書く前に、その主張を否定する経路が無いか 1 つ挙げる。**
   今回なら「step success でも配信していない経路は？」（→ シークレット未設定）、
   「通知ステップが在っても鳴らない経路は？」（→ そもそも起動しない）。
2. **ワークフローについて何か主張するときは、必ず `on:` を読む。**
   ファイル名の一覧は、起動条件を教えてくれない。

## M-20260921-two-samples-read-as-all 失敗17回のうち2回を見て「通知は届いている」と報告した（2026-09-21・型 F）

**Before**: 代表から「8月の宿題は未実施か」と聞かれ、`db-migrate` の実行履歴を調べた。
2026-08-16 以降 40 回実行・17 回失敗。そのうち**最古（#44・08-26）と最新（#76・09-19）の
2 件**の通知ステップが success で、#76 のログには Slack webhook の応答 `ok` があった。
そこから「通知は実配信されている。宿題2は実質解決」と代表に報告した。
残り 15 件は「同じステップが同じ条件で動くので配信されたはず」と推定で埋めた。

**After**: **17 回のうち 8 回は配信されていなかった。** `MISTAKE_LEDGER` に
`M-20260906-notify-never-delivered`（jq プログラム内のシングルクォートで通知が毎回落ちる）が
既に書いてあり、**自分が調べる前から答えの一部が台帳にあった**。
各実行の `head_sha` 時点のファイル内容で 17 件すべてを判定し直すと、
不配信 8 回（08-29〜09-06）/ 通知ステップ成功 9 回だった。抜き取った 2 件は、たまたま
壊れた期間の**外側の両端**だった。

- 対処: 17 件を機械判定に切り替え、陽性（#76 のログに `ok`）と陰性（#51 の通知ステップが
  `failure`）の両方で当たりを取ってから数字を出し直した。代表への報告も訂正した。

**なぜ気づけなかったか**: **「最古と最新が両方 OK なら間は埋まっている」と勝手に思った。**
連続量なら通る推論だが、これは**途中で壊れて途中で直った**区間で、両端だけが健全だった。
端点を 2 つ取ったことで「範囲をカバーした」気になったのが罠で、実際にはサンプル数は 2 のままだった。

もう1つ、こちらが重い。**台帳を引かずに調べ始めた。** CLAUDE.md は型 F に
「自分がこれから追記しようとしているログファイル自身に、既に矛盾する記述が無いか確認しない」
と明記しており、まさにそれをやった。`MISTAKE_LEDGER` は「次に別のことでやらかしたときに
『これは前のどれと同じ形か』を引く」ための台帳なのに、**同じ部品（db-migrate の通知）の
事故が既に載っていることを確認しないまま**、その部品について結論を出した。
台帳を「書く場所」としてだけ見て、「引く場所」として使っていなかった。

**この型の再発防止が効かなかった理由**: 型 F の防止策は「確認できる事実は確認する」だが、
今回は**確認しにいく先が台帳自身**で、そこは「自分が書く場所」だと思っていたので
確認対象のリストに入らなかった。件数の数え直し（`| wc -l`）の習慣は働いたが、
**サンプルが母集団を代表しているか**は数えても分からない。

**再発防止**: 仕組みは作らない（判断に依存）。代わりに2つを習慣にする。
1. **ある部品について結論を出す前に、その部品名で `MISTAKE_LEDGER` を grep する。**
   今回なら `grep -i "db-migrate\|通知" docs/context/MISTAKE_LEDGER.md` で一発だった。
2. **母集団が有限で全件見られるなら、抜き取らない。** 17 件は全件判定できる量だった。
   抜き取るのは全件が非現実的なときだけで、そのときは「n 件中 m 件を確認」と分母を明記する。
## M-20260921-claimed-all-db-errors-swept-but-left-booking-upsert 「DBエラー握り潰しを一掃」と書いたのに、還元計上本体の upsert/read を残した（2026-09-21・型 J）

**Before**: 2026-08-06〜08 のレビュー対応（round-8）で「決済/精算/表示パスの
Supabase エラー握り潰しを一掃した」と RELEASE_LOG / DECISION_LOG に書いた。
webhook の paid/refund 遷移・reversal のロード/cancel・payout の share/tenant
照会・checkout の空スコープ判定・tiers 読取に throw を入れ、還元計上関数
`recordVehicleReportRevenueShares` が呼ぶ helper（`getAnchoredCertCountsByTenant`）
と返金 recheck の cancel も throw 化した。「booking パスは全部見た」つもりだった。

**After**: 実際には計上関数の**本体**——order 読取・settings 読取・台帳 upsert の
3つ——は #848 初版の `console.error(...); return;` のまま残っていた。upsert が
転けると加盟店の還元計上が無音で欠落し、webhook は正常完了して Stripe イベントを
processed 化するため `stripe-event-monitor` も鳴らない。Codex が #895（事業ログPR）
のレビューで指摘。2026-09-21、本番実データ（レポート注文まだ0件＝実害は未発生）を
確認のうえ、order/settings/upsert の3つを throw 化して解消（webhook 経路は throw →
monitor cron で replay、unlock フォールバックは buyer のアクセスを止めないため
非致命のまま＝webhook が冪等 re-book）。issue #892 の該当項目をクローズ。

**なぜ気づけなかったか**: 「一掃」と書くとき、計上関数が**呼ぶ helper** を直したこと
で計上関数**全体**を見た気になった。関数本体の各 `await admin.` の error 分岐を
1件ずつ洗い出さず、Codex が挙げた箇所＋目についた数箇所で「全部」と判断した。
型 J（同じ「DBエラーは throw」パターンを兄弟へ適用したのに、最も肝心な計上本体に
適用し損ねた）。加えて型 F（「一掃した」と断定する前に、その関数の残りの DB 呼び出しを
実測しなかった）。

**再発防止**: 仕組み無し寄り（DB エラーの swallow を機械検出する lint は未整備）。
習慣: 「全部／一掃」と書く前に、対象関数の `await admin.`（または該当クライアント）を
grep して各 error 分岐が throw か return かを1件ずつ確認し、**件数を添える**
（例:「この関数の DB 呼び出し5件すべて throw」）。これは常設指示 §7「『すべて／全部』が
あるとき個数を明記」と同じ規律を、握り潰し点検にも適用するということ。
## M-20260921-detector-covered-half-the-tables-i-had-listed 自分で「閉じるべき4表」と書いておいて、検査では2表しか数えなかった（2026-09-21・型 A）

**Before**: RLS 停止ゲートの検査を書き、**3通りの壊し方で検出器自体を検証**した
（`i.status` を落とす／`i.is_active` を落とす／支えのポリシーを落とす）。3つとも
期待どおり落ちたので「検出器は本物」と PR に書いた。

**After**: `/code-review` に「`pii_disclosure_consents` と `ai_usage_logs` を
一度も数えていない」と指摘された。レビュー側で再現もされている ——
`pdc_select_insurer` をゲート前の形（`insurer_users` 直読み）に戻すと、
**停止中の保険会社が PII 開示同意の行を読めるのに、検査は「すべて期待どおり」と出た**。
この2表は `insurer_cases` を経由せず `insurer_id` を直接見るので、
案件が 0 件でも独立に漏れる。フィクスチャと数え直しを足し、
その2つの主張も壊して落ちることを確認した。

**なぜ気づけなかったか**: **検出器の検証を「壊し方」の側からしかやっていない。**
3つの壊し方はどれも `my_insurer_ids()` か支えのポリシーを触るもので、
**検査が既に数えている経路**の上でしか壊していない。数えていない経路は、
どう壊しても落ちない。「検出器を検証した」は、**検出器が見ている範囲の中でしか**
成立しない主張だった。

もっと悪いのは、**閉じるべき表を4つ自分で挙げていた**ことだ
（`insurer_cases` / `insurer_case_messages` / `insurer_case_attachments` /
`pii_disclosure_consents`）。その一覧は調査の段階で書いて `OPEN_QUESTIONS` にも載せた。
**自分の一覧と自分の検査を突き合わせていない。** 突き合わせは1分の作業だった。

**同じ型の前例**: `M-20260919-swept-for-the-literal-not-the-bug-class`
（一覧の作り方が狭くて、同じ壊れ方の兄弟を取りこぼした）。
あのときの再発防止は「走査の対象を、語ではなく壊れ方の種類で決める」だったが、
**今回は対象の一覧は正しく、検査がその一覧を消費していなかった**。段が1つ後ろにずれている。

**再発防止**:
- 仕組み無し（判断に依存）: **「この検査は何を数えているか」を表の名前で書き出し、
  自分が挙げた対象一覧と1対1で突き合わせる。** 壊し方を増やす前にこれをやる。
  壊し方の検証は、数えている範囲の中でしか意味を持たない。
- 検査に書く習慣: 数えない表があるなら、**なぜ数えないかをその場に書く**
  （今回なら「添付は `insurer_cases` 経由なので連れて閉じる」）。書けないなら数える。

---

## M-20260921-classified-rls-impact-from-one-policy 同じ表の兄弟ポリシーを読まずに、RLS 変更の影響を分類して代表の判断待ちにした（2026-09-21・型 B）

**Before**: 「`my_insurer_ids()` に停止判定を入れると、`insurers` / `insurer_users` の
RLS も止まる。停止中の保険会社が自社の行まで見えなくなり、『アカウント停止中』の画面の
周辺が壊れる。だから RLS 側は product 判断が要る」—— これを `OPEN_QUESTIONS.md` と
PR #1101 の本文に書き、代表の判断待ちの項目として残した。根拠は
「14本のポリシーが `my_insurer_ids()` を使っている」という実測だった。

**After**: **`insurers` には `my_insurer_ids()` を使わない SELECT ポリシーが2本
（`insurers_select_own` / `insurers_select_linked_user`）、`insurer_users` には1本
（`insurer_users_select_self`）あった。** permissive ポリシーは OR で評価されるので、
ゲートを入れても自社の1行と自分のメンバーシップ行は読めたままだった。
再生 DB に `authenticated` で降りて数えて確かめた（停止中でも `insurers` は 1 行）。
判断待ちにしていた「画面が壊れる」は起きない。代表の時間を、確かめれば消えた問いで止めていた。

**なぜ気づけなかったか**: **「この関数を使うポリシーを全部数えた」で、調査を終わりにした。**
数えたのは *`my_insurer_ids()` を使う側* だけで、**その表に他に誰が SELECT を許しているか**は
一度も見ていない。RLS で「見える／見えない」を言うには、関数の呼び出し元ではなく
**表ごとのポリシー全部**を見なければならない。`pg_policies` を `tablename` で引き直すのは
1クエリで、実際に引いたら3本すぐ出てきた。**問いの向きが逆だった。**

もう1つ根がある。「壊れる」と書いた時点で**動かして確かめていない**。
`--keep` の再生 DB に行を入れて `authenticated` で数えるのは 10 分の作業で、
それをやっていれば「壊れる」も「壊れない」も同じ日に分かった。
**判断を仰ぐコストは自分では払わないので、確かめるより聞く方が安く見える。**

**同じ型の直前の例**: `M-20260920-asked-for-a-decision-that-was-already-made-in-the-file-i-cited`
（前日）。あのときの再発防止は「**『判断を仰ぐ』と書く前に、その状態を作った変更履歴の散文を
全部読む**」だった。**今回それは効かなかった** —— 散文ではなく **DB の現在状態** に答えが
あったから。「読むべき場所」を散文に限定したのが狭すぎた。

**再発防止**:
- 仕組みあり（一部）: `scripts/replay/checks/insurer_rls_suspension_gate.sql` が
  3本のポリシーを**名前で**確かめ、消えたら落ちる。今回発見した支えが黙って消えることは防げる。
- 仕組み無し（判断に依存）: 「影響を分類する前に、その表のポリシーを全部引く」。
  習慣にするのは **`pg_policies` を `tablename` で引く**こと。関数名で引くのは
  「誰がこの関数を使うか」しか答えず、「この表は誰に見えるか」には答えない。
- 前の型の再発防止を広げる: 「**『判断を仰ぐ』と書く前に、確かめる手が 30 分以内にあるなら
  先に確かめる**」。読む対象を散文に限定しない —— 本番の `pg_policies` / `pg_proc`、
  `--keep` の再生 DB で実際に動かすことを含める。

---

## M-20260919-cancel-2xx-treated-as-final Cancel Terminal Checkout の2xxを「取消済み」と決め、自分のコードにある CANCEL_REQUESTED を見なかった（2026-09-19・型 A）

**Before**: DELETE ルートで `cancelTerminalCheckout` が例外を投げなければ
（2xx）、そのまま `apiOk({ ok: true })` を返していた。400（終端状態からの
遷移不可）のときだけ `getTerminalCheckout` で実際の状態を確認し
COMPLETED を区別する処理を書き、「これで取消済みと決済完了の混同は直った」
と思っていた

**After**: `/code-review` 6回目の指摘で、Square の端末キャンセルは
**物理端末との往復が要るため非同期**で、cancel 呼び出し自体の2xxは
「取消を受け付けた」でしかなく、実際には `CANCEL_REQUESTED`（`CANCELED`
でも `COMPLETED` でもない中間状態）のまま返ってくることがあると判明。
しかも**この中間状態は自分が最初にこのファイルへ書いた
`TerminalCheckoutStatus` 型定義（`"PENDING" | "IN_PROGRESS" |
"CANCEL_REQUESTED" | "CANCELED" | "COMPLETED"`）に既に載っていた**——
Square の非同期性を知っていて型に書いたのに、DELETE ルートの成功パスを
書くときにその型を読み返さなかった。2xxをそのまま `ok:true` にすると、
呼び出し側は取消成功と判断してポーリングを止め、その隙に客が支払いを
完了させても誰も拾えなくなる（COMPLETEDの混同そのもの、対象が400分岐から
2xx分岐に変わっただけ）。修正: cancel 呼び出しが例外を投げなくても、
400分岐と同じ `getTerminalCheckout` 確認を必ず通し、`CANCELED` 以外は
`square_cancel_pending`（502）として「取消未確認」を返す。クライアント側
の `cancelSquareCheckout` は409以外の非okをすべて genuine failure として
扱う設計に既にしてあったため、**クライアント側の変更は不要**だった

**なぜ気づけなかったか**: 「400分岐でCOMPLETEDを区別する」という
/code-review 指摘の**言葉どおりの範囲**だけを直し、「同じ理由（Squareの
状態確認なしにok:trueを返してはいけない）が2xx分岐にも当てはまるか」を
問い直さなかった。型Aの「動作を主張するコメントを、その根拠（型定義）を
確認せずに書く」そのもの——`TerminalCheckoutStatus` という根拠を自分で
書いておきながら、DELETEルートの成功パスを書くときに読み返していない

**再発防止**: 仕組み無し（Square API はこの環境から到達できず、実際に
CANCEL_REQUESTED で返ってくることを再現するテストは書けない。判断に
依存）。習慣を具体化する: 外部APIの非同期操作を「成功したことにする」
コードを書くときは、**その状態を表す型を自分がどこかに定義していないか
grep してから**書く。型に候補が3つ以上あるのに、コードが2値（成功/失敗）
でしか扱っていなければ、抜けている状態がないか疑う

## M-20260919-exclusivity-checked-one-pair-not-all 決済証明の排他チェックを Stripe対Square の1組だけ書き、Square内2種の組を見なかった（2026-09-19・型 C）

**Before**: `M-20260919-exclusivity-guard-only-in-admin-route` で
`checkout_session_id`（Stripe）と `square_checkout_id`/`square_reconcile`
（Square）の排他を共有スキーマに `.refine()` で持たせた。「決済証明は
1つの経路にしか属さない」と書いた時点で、3つのフィールドを**全部**
互いに排他にしたつもりでいた

**After**: `/code-review` 指摘で、この refine が実際にチェックしていたのは
`checkout_session_id` と `(square_checkout_id || square_reconcile)` の
**1組だけ**で、`square_checkout_id` と `square_reconcile` を同時に渡す
組み合わせは素通りしていたと判明。両方渡すと記録ルート側は
`square_checkout_id` を優先し `square_reconcile` を無視するため、
古い端末チェックアウトが `already_recorded` を返し、本来意図した
POS アプリの決済（`square_reconcile`）が未記帳のまま残る。修正:
3フィールドのうち true な個数を数えて `<= 1` を要求する形に書き換え、
どの2つの組み合わせでも排他になるようにした

**なぜ気づけなかったか**: 「決済証明は1つの経路にしか属さない」という
**文章としての結論**を先に決め、それをコードに落とすときに
`checkout_session_id && (square_checkout_id || square_reconcile)` という
**具体的な式**が本当にその結論と等しいかを検算しなかった。3つの選択肢が
あるとき「排他」を実装するなら組み合わせは3通り（Stripe×A、Stripe×B、
A×B）あるはずだが、Stripe を起点にした1つの式だけで済ませた。
`M-20260919-exclusivity-guard-only-in-admin-route`（型C: 経路を1本しか
見ない）を直した直後に、**今度は経路の中の組み合わせを1本しか見ない**
という同じ形の狭さで再発した

**再発防止**: 仕組み無し（Zod の `.refine()` にユニットテストは書いたが、
「組み合わせを全部書いたか」を機械的に確認する仕組みは無い）。習慣を
具体化する: N個のフィールドを互いに排他にするときは、N×(N-1)/2 通りの
組み合わせを**列挙してから**式を書く（今回は3フィールドなので3組）。
テストも同様に、ペアを1つずつ総当たりで書く

## M-20260919-else-fix-not-swept-to-siblings handleCancelQr の else 抜けを直したとき、`cancelSquareCheckout` を呼ぶ他3箇所を確認しなかった（2026-09-19・型 J）

**Before**: `M-20260919-handled-completed-branch-not-failed-branch` で
`handleCancelQr` の `if (!result.ok) { if (completed) {...} }` に
`else`（genuine failure 分岐）を足して直した。再発防止として
「`if (!result.ok) { if (A) {...} }` を書いたら `else` を必ず書く」という
**習慣**を台帳に書き、これで直ったと思っていた

**After**: `/code-review` 5回目の指摘で、`cancelSquareCheckout` を呼ぶ
4箇所のうち**予約切替の `useEffect`** だけが、`completed` 分岐しか持たず
`else`（genuine failure）が無いままだったと判明。この effect は
`M-20260919-cancel-checkout-scattered-across-4-handlers` で「4箇所に散らばった
同じ操作」を1つの `cancelSquareCheckout` に統一した**その時点**から既に
`else` を欠いていた（handleModeSwitch・timeout分岐は当時から3分岐で書けて
いたが、この effect だけ2分岐のまま）。`else` が無いため、取消が genuine
failure（ネットワークエラー等）で終わっても effect は無条件に
`qrSessionId`/`squareRef` をリセットし、**端末に生きたままのQRを見失う**
（客が読めば決済でき、Ledra は二重決済に気づけない）。修正: 同じ関数内の
`else` だけでなく、`cancelSquareCheckout` の**呼び出し元4箇所全部**を
grep し直し、`staleUncancelledCheckouts` という永続バナー+再試行導線を
追加してこの effect にも genuine failure 分岐を持たせた

**なぜ気づけなかったか**: 直前のミス（`M-20260919-handled-completed-branch-not-failed-branch`）
の再発防止を「この関数の中で `else` を書く」という**関数ローカルな習慣**に
留め、「**この習慣が必要になった理由（`cancelSquareCheckout` への統一）自体が
複数箇所に同じ形の分岐を要求している**」という兄弟実装全体の話に広げなかった。
1箇所を直したら安心してしまい、`grep cancelSquareCheckout` で呼び出し元を
数え直すところまでやらなかった。型Jの核心（「同じパターンで書いた」つもりが
実は違う）そのもので、しかも**同じ型の再発防止を書いた直後に、その再発防止の
適用範囲が狭すぎたために起きた**という二重の再発

**再発防止**: 仕組み無し（ユニットテストが無いUIコンポーネント。判断に依存）。
習慣を具体化する: 「同じ関数を複数箇所から呼ぶよう統一した」直後に見つかる
分岐の不備は、**その関数の呼び出し元をまず全部 grep してから**直す
（1箇所直して終わりにしない）。ledger に再発防止を書くときも「この関数で」
ではなく「この関数を呼ぶ全箇所で」と書く

## M-20260919-handled-completed-branch-not-failed-branch handleCancelQr に「完了済み」分岐を足したとき、同じ関数の「取消失敗」分岐を見なかった（2026-09-19・型 J）

**Before**: DELETE ルートが `square_already_completed` を返すようになったのを受け、
`handleCancelQr` に `if (!result.ok && result.completed) { record; return; }` を
足した。これで直ったと思っていた

**After**: `/code-review` の指摘で、同じ `if (!result.ok)` の中の
**もう一方**（`completed` でも `ok` でもない genuine failure）が、そのまま
下の状態リセットへ落ちて `qrSessionId`/`squareRef` を消していたことが判明。
`M-20260919-cancel-checkout-scattered-across-4-handlers` で「4関数に散らばった
同じ操作」を統一した直後、**その統一した1関数の中の分岐**を今度は揃え忘れた

**なぜ気づけなかったか**: 「completed の場合を直す」という指摘の言葉どおりの
範囲だけを直し、`if (!result.ok) { ... }` ブロック全体を読み直して
「completed 以外の道はどこに落ちるか」を辿らなかった。
`M-20260916-timeout-branch-missed-sibling-fix` に書いた再発防止
（「分岐を直すときは関数・ブロック全体を読み直す」）と**全く同じ形**の
再発で、今回は同じセッション内で3回目

**再発防止**: 仕組み無し（判断に依存、この関数群にはユニットテストが無い）。
習慣を具体化する: `if (!result.ok) { if (A) {...} }` のような分岐を書いたら、
**`else` を明示的に書いて「A でないときどうするか」を必ず1行以上書く**。
書かなければ暗黙に下へ落ちることに気づけない。今回は else を書いたことで
気づけたはずが、最初は else を書かずに if の中だけ足していた

## M-20260919-exclusivity-guard-only-in-admin-route 決済証明の排他チェックを admin ルートにだけ書き、同じスキーマを使うモバイル側を見なかった（2026-09-19・型 C）

**Before**: PR #979 の Codex 指摘で「Stripe と Square の決済証明を同時に渡せる」
問題を見つけ、`admin/pos/checkout/route.ts` にルート内チェック
（`if (data2.checkout_session_id && (...))`）を足して直したと思っていた

**After**: `mobile/pos/checkout/route.ts` が**同じ** `posCheckoutSchema` を使い、
**同じ** `recordPosSale` を呼んでいるのに、このチェックが無かった。
モバイル経由なら同じバグ（Square の確認済み payment_id が記録から消える）が
今も再現する。`/code-review` の指摘で判明した

**なぜ気づけなかったか**: 直したときに「このスキーマ・この関数を使っている
ところは他にないか」を grep していない。型Cの再発防止（M-20260918 の
`grep -rl` 習慣）を、**別のPRで一度書いた後**は適用していなかった —— 既に
台帳に書いた再発防止を、次に同種の修正をするときに思い出して実行する
仕組みが無い

**再発防止**: 仕組み。バリデーション（route 個別ではなく共有スキーマ）に
`.refine()` で持たせ直した。`posCheckoutSchema` を使う限り admin/mobile
どちらも自動的に効く。習慣のほうは変わらず: **ルート内に検証ロジックを
書く前に、そのスキーマ・関数を呼んでいる箇所を `grep -rl` で数える。**
複数箇所あるなら、ルートではなく共有側に置く

---

## M-20260919-cancel-checkout-scattered-across-4-handlers Square チェックアウトの取消処理を、関数をまたいで4箇所バラバラに直した（2026-09-19・型 J）

**Before**
- 信じたこと: Codex 指摘「タブ切替 (handleModeSwitch) が取消の応答を確かめていない」
  「タイムアウト分岐が取消確認前に冪等キーを解放している」の2件を、それぞれ
  指摘された関数だけ直せば済む
- したこと: `M-20260916-timeout-branch-missed-sibling-fix` の再発防止（「分岐を
  直すときは同じ関数・ブロック全体を読み直し、同じ後始末が要る終端分岐が
  他にないかを見る」）を実行したが、**見た範囲が「その関数の中」に留まった**。
  同じ「Square チェックアウトを取消して離れる」という操作が、予約切替の
  `useEffect`・`handleCancelQr`（戻るボタン）にも独立した fetch として
  存在することを grep しなかった

**After**
- 次の `/code-review` で、予約切替の effect にも**同じ**「応答を確かめず
  投げっぱなし」が指摘された。さらにその過程で、DELETE ルート自体が
  「終端状態＝取消済み」と早合点し、**取消の直前に決済が完了していた場合も
  取消成功として返す**ことが判明した（二重決済より悪い、売上が消える経路）。
  結局 `qr-checkout?id=` への DELETE を投げている箇所は
  `handleModeSwitch` / 予約切替 effect / `handleCancelQr` / タイムアウト分岐の
  **4箇所**あり、直していたのは2箇所だけだった
- なぜ気づけなかったか: 前回の再発防止が「同じ**関数**の中の兄弟分岐」を
  対象にしており、「同じ**操作**（Square への DELETE 呼び出し）が別の
  ハンドラ・別の trigger（タブ切替／予約選択／明示的な戻るボタン／
  自動タイムアウト）に散らばっている」ケースを想定していなかった。
  型Jの再発防止を、範囲を狭く適用してしまっていた
- 再発防止: 仕組み。共通ロジックを `cancelSquareCheckout()`（モジュール関数）
  に集約し、呼び出し側は全て同じ関数を経由するようにした——今後この操作を
  変える必要があれば1箇所で直る。習慣のほうは: 「同じ関数名・同じ文字列
  リテラル（この場合は `qr-checkout?id=`）を grep して、呼び出し箇所が
  何本あるかをまず数えてから直す」。関数の中だけでなく、**ファイル全体で
  同じ副作用を起こしている箇所**を探す

---

## M-20260919-skipped-the-check-i-had-just-written 同じ穴を同じ日に2度開けた。再発防止を書いた40分後に、その手順を実行していない（2026-09-19・型 F）

## M-20260922-wrote-constraint-bodies-from-their-names 制約の中身を名前から推測して書き、その推測した定義で安全確認まで済ませた（2026-09-22・型 A）

**Before**: 本番から消えた CHECK 制約を戻すマイグレーションを書いた。名前は本番台帳の
`DROP CONSTRAINT` から取れたので、**中身は名前から推測して書いた** ——
`insurers_plan_tier_check` なら `plan_tier IN ('free','standard','pro','enterprise')` だろう、
`market_inquiries_buyer_name_length` なら 1〜100 文字だろう、というように。
そのうえで「本番の既存行がこの制約を満たすか」を確認するクエリを書き、違反0件を確かめた。

**After**: 再生 DB の `pg_get_constraintdef` と突き合わせたら、**5本のうち4本が違っていた**。
`insurers_plan_tier_check` は `('basic','pro','enterprise')`（`free` も `standard` も無い）。
`buyer_name` は 1〜**200**。`market_inquiry_messages_length` は `<= 2000` だけで下限が無い
（私は `BETWEEN 1 AND 2000` と書いていた）。email の正規表現も `\s` ではなく `[:space:]`。

**なぜ気づけなかったか**: **安全確認を、自分が推測した定義で書いた。**
「違反0件」は本物の制約に対してではなく、**自分の想像した制約に対して**確かめたもので、
何も保証していない。型 A の「自分の想定だけで検証する」そのもの。
名前が意味を持って見えるほど危ない —— `_length` と書いてあれば長さ制限だと分かるが、
**その数字は名前に書いていない**。もし推測のまま流していたら、本番の `insurers` は
`basic` を弾く制約を持つことになり、既存行が通らず適用が落ちるか、
通ったとしても本来と違う範囲を強制していた。

**再発防止**: 仕組み —— 無し（判断に依存）。習慣 ——
**制約・索引・ビュー・関数の「中身」を書くときは、必ず実物から `pg_get_*def` で写す。**
名前から書き起こさない。そして**安全確認のクエリは、写した定義をそのまま貼って作る** ——
自分で書き直した時点で、確認は推測の確認に戻る。

## M-20260921-reported-a-subtraction-as-a-measurement 索引の差を「7本」と報告したが、それは引き算の結果で、両方向を一度も数えていなかった（2026-09-21・型 F）

**Before**: 再生 DB の索引 1172 本、本番 1179 本。差を **「本番が7本多い」** と
`OPEN_QUESTIONS` / `RELEASE_LOG` / PR 本文 / 代表への報告に書いた。
「名前の突き合わせは未実施【要確認】」と但し書きは付けたが、**7 という数字は出した**。

**After**: 名前で突き合わせたら **本番にだけ 44 本 / 再生にだけ 36 本**だった。
7 は 44 − 36 の**差し引き**で、片方向すら数えていない。
そして差の中に **`idx_payments_idempotency`（決済の冪等キーの一意性）が入っていた** ——
本番からその保証が消えていたのに、「7本の性能差」に丸めて3日間放置していた。

**なぜ気づけなかったか**: **総数の引き算を「差の件数」と読んだ。** 集合が違えば
|A|−|B| は差の大きさではない —— 中学の集合算だが、数字が出ていると検算しない。
【要確認】を付けたことで**安心してしまった**のも悪い。印は「未検証」を伝えるためのもので、
**数字そのものを正当化しない**。未検証なら数字を出さないか、出すなら測る。

**再発防止**: 仕組み —— `check-schema-drift.mjs` が一意制約を両方向で見るようにした
（一意でない索引は対象外なので、こちらは引き続き仕組み無し）。習慣 ——
**2つの集合の差を書くときは、必ず `comm -23` / `comm -13` の両方を出す。**
総数の引き算は差ではない。片方向だけの件数も差ではない。

## M-20260921-compared-counts-where-names-differed 表ごとの「件数」で突き合わせ、1本消えて1本増えた3表を取りこぼした（2026-09-21・型 A）

**Before**: 273 表の索引を比べるのに、まず**表ごとの件数**（`table:count`）を出して
差のある表だけ名前を見にいった。21 表が差ありと出たので、その 21 表の名前を突き合わせた。

**After**: 表ごとの**索引名の md5** で比べ直したら **23 表**だった。
件数が同じでも名前が違う表 —— `customers` / `insurer_access_logs` / `vehicle_histories` ——
が抜けていた。どれも `remote_schema` が1本落として、別名の1本が在る形で、
**件数で見るとちょうど釣り合って消える**。

**なぜ気づけなかったか**: 件数を「安い代理指標」として使い、
**その代理がどんな差を隠すかを考えなかった**。型 A の「判断の道具そのものを検証する」
そのもので、道具（件数比較）の**取りこぼしの形**を一度も問うていない。
`20260920120500` のときも同じ罠を踏んでいる（表とビューを混ぜて数えた）。

**再発防止**: 仕組み —— 無し（判断に依存）。習慣 ——
**集合を比べるときは最初から集合を比べる。** 件数は集合の要約であって集合ではない。
安い代理指標を使うなら、**その指標が一致していても中身が違う例を1つ作れるか**を先に問う。
今回なら「1本消えて1本増えた表」で、これは3秒で思いつく。

## M-20260920-asked-for-a-decision-that-was-already-made-in-the-file-i-cited 「未決の設計判断」として代表に上げた件が、自分が引用したファイルに1か月前から書いてあった（2026-09-20・型 B）

**Before**: `audit_logs` の8列（`table_name` / `record_id` / `old_values` / `new_values` /
`reason` / `performed_by` / `device_id` / `ip_address`）について、
「**監査テーブルの構造化列をスキーマから正式に削るのは別の判断**だから代表に決めてもらう」
として `OPEN_QUESTIONS` に置き、選択肢2つ（落とす／本番へ足し直す）を出した。
根拠は「本番は12列」「アプリは `query_json` に書く」という実測で、そこは正しい。

**After**: 実装に入って `20260823000000_audit_logs_reconcile.sql` を開いたら、ヘッダに
**「列そのものは次のマイグレーションで落とす（データがある環境で先に落とすと戻せない）」**
と書いてあった。落とす判断は 2026-08-23 に既に下りていて、**来ていなかったのは実行だけ**。
私が「別の判断」と呼んだものは、1か月前の宣言の後始末だった。

**なぜ気づけなかったか**: 差を**現在のスキーマ（`information_schema.columns`）だけで測り**、
**その差を作ったマイグレーションを読んでいない**。
`audit_logs` を触るファイルは grep で15件と分かっていたのに、列名が当たった行だけ見て
ヘッダを読まなかった。**同じ日**の `M-20260920-hashed-a-file-i-never-opened` と同じ形
——**ファイルを「触った」ことを「読んだ」と取り違えている**。
実害は自分の手戻りではなく**代表の時間**で、既に決まっている件を選択肢2つで差し戻した。

**再発防止**: 仕組み —— 無し（判断に依存）。習慣 ——
**「未決だから判断を仰ぐ」と書く前に、その差を作った／直したマイグレーションの
ヘッダを全文読む**。スキーマの差は現在形でしか見えないが、**なぜその形なのかは
必ずどこかのファイルの散文に書いてある**。代表に上げる問いは、
「ファイルを読んだ上でまだ決まっていない」ものだけにする。

## M-20260920-called-it-all-no-op-while-fixing-the-one-statement-that-runs 「本番では全文 no-op」と事業ログに書いた直後に、本番で実際に走る1文のレビュー指摘を直していた（2026-09-20・型 C）

**Before**: `20260920120500`（マイグレーションを本番へ寄せる版）について、`RELEASE_LOG.md` に
「**本番では全文 no-op**（落とす対象は既に無く、足す対象は既に在る）。効くのは再生 DB と
新しいプレビュー分岐だけ」と書いた。`IF EXISTS` / `IF NOT EXISTS` で揃えたので
そう読める、というのが根拠。

**After**: ④ の `CREATE OR REPLACE VIEW public.invoices` は **IF 句を持たず、本番でも必ず走る**。
結果が本番と同じになるだけで、実行はされる。その証拠に、同じ PR で `/code-review` が
「`WITH (security_invoker = on)` が無い」と 🔴 を出し、**本番の RLS を迂回しうる**として直した ——
本番で走らない文なら、この指摘は成立しない。SQL ファイルのヘッダには修正後に
「ただし ④ のビュー置き直しだけは実際に実行される」と正しく書いたのに、
**同じ PR の `RELEASE_LOG.md` は古い文のまま出した**。

**なぜ気づけなかったか**: 同じ事実を SQL のヘッダと事業ログの2箇所に書き、
**レビュー指摘で片方だけ直した**（型 C の文書版）。レビューで直したのは SQL で、
事業ログは「もう書いた文章」として読み返さなかった。
危ないのは中身が食い違うことより、**残った方が「この版は本番に触らない」と読める**ことで、
次に同じ版を読む人が `security_invoker` の一行を安全に消せると判断しうる。

**再発防止**: 仕組み —— 無し（判断に依存）。習慣 ——
**レビュー指摘を反映したら、その指摘が否定した記述が他のファイルに無いか grep する**。
今回なら `no-op` で引けば1件で当たった。「コードを直した」で閉じない。

## M-20260920-counted-12-as-11-again 前日に「件数は数え直す」と台帳へ書いて、翌日また目視で数えて外した（2026-09-20・型 F）

**Before**: 本番に欠けている列を調べ、13件のクエリ結果（`present_now` が true/false）を見て
「**11列が本番で欠けたまま**」と代表に報告し、PR #1102 の本文と事業ログにもそう書いた。
数え方は、返ってきた13行を目で見て false を数えただけ。

**After**: 再生 DB と本番を機械的に突き合わせたら **12列**だった
（`audit_logs` 8 + `insurers.max_users` + `templates` / `tenant_memberships` / `tenants` の
`updated_at`）。13行のうち true は `certificates.certificate_no` の1つだけで、13 − 1 = 12。
**引き算すらしていない。**

**なぜ気づけなかったか**: **前日（2026-09-19）に `M-20260919-wrote-a-replay-count-i-never-read`
を書いたばかりだった。** そこでの再発防止は「検査の件数を書くときは、その行をコピーする。
暗算した数字を書かない」。今回はコピーする行が無く（クエリ結果は行の並びで、件数は出ない）、
**「数えるのはこちら側」になった瞬間に習慣が外れた**。
型 F の再発防止が効かなかったのはここで、**「出力に書いてある数字を写す」しか想定していなかった**。
自分で数える場面では、`count(*) filter (...)` を書くか `| wc -l` を通すか、どちらかに寄せる必要がある。

**再発防止**: 仕組み —— 無し（判断に依存）。習慣 ——
**件数を報告するクエリは、行を返さず件数を返す形で書く**
（`select count(*) filter (where not present_now)` のように、DB に数えさせる）。
目で数えた数字を文章に入れない。行を見て数えたくなったら、それはクエリの書き方が違う合図。

## M-20260920-hashed-a-file-i-never-opened 2日かけた調査の答えが、自分が2回改名して2回ハッシュを取ったファイルの1行目に書いてあった（2026-09-20・型 B）

**Before**: `workshop_capability_profiles` が本番に無いのに台帳は適用済み、という食い違いを
2026-09-19 に見つけた。原因を「なぜ台帳だけ進んだのかは不明」として `20260919150000` で
作り直し、OPEN_QUESTIONS に【要確認】で残した。このとき `20260918142610_remote_schema.sql` は
**2回改名し**（#1093 の改名を戻すとき・main 側で戻すとき）、**2回 sha256 を取って**
`production-ledger` の免除欄へ書いている。本番台帳からは「368文・`db pull` 由来」も引いている。

**After**: 代表に「その件も調べて」と言われて `grep` したら、**repo 側のそのファイルは4行しか無かった**。

```
-- intentionally empty: original remote_schema dump contained
-- destructive operations (DROP TABLE workshop_capability_profiles,
-- DROP COLUMN certificate_no, stale insurer_search_vehicles recreation)
-- that conflict with feature migrations. Cleared to allow clean replay.
```

**1行目から3行目に答えが書いてある。** 本番台帳の368文を引くと実際に
`DROP TABLE "public"."workshop_capability_profiles"` と `DROP COLUMN` 13件が入っていた。

**なぜ気づけなかったか**: **ファイルを「識別子」として扱い、「中身」として扱わなかった。**
改名（パスの操作）・sha256（バイト列の操作）・台帳の文数の照会（DB の操作）は全部やったのに、
**`cat` を一度も打っていない**。しかも `20260918142610` は最初から「出所不明【要確認】」と
自分で書いていた版で、**調べるべき対象だと分かっていた**。分かっていて、隣のファイルの
バイト数だけ測っていた。sha256 を取るコマンドはファイルを開いている —— 開いたのは
プログラムで、私は開いていない。

**再発防止**: 仕組み —— 無し（判断に依存）。lint はファイルの中身を読むが、
「調査者が読んだか」は誰も見ない。
習慣 —— **【要確認】と書いた対象がリポジトリ内のファイルなら、その場で開く。**
外部にしか無い事実（誰がいつ実行したか）と、手元で1コマンドで読める事実（ファイルの中身）を
同じ「不明」に入れない。**`sha256sum` を打ったファイルは、同じ手で `head` も打つ。**

## M-20260919-wrote-a-replay-count-i-never-read 再生の件数を、出力を読まずにコミットメッセージへ書いた（2026-09-19・型 F）

**Before**: 他人のブランチ（#1093）へ push するコミットのメッセージに
「`check:migrations` 再生 **480/480**」と書いた。直前に `npm run check:migrations` は走らせており、
出力の末尾（`再生 OK`）は見ている。**だが件数の行は見ていない。**
マイグレーションを1本足したので「479 + 1 = 480」だと頭の中で数えた。

**After**: 実際の出力は **479/479** だった。足す前が 478 本で、足して 479 本。
`ls supabase/migrations/*.sql | wc -l` = 479 で確認した。
push 済みで、しかも**他人のブランチ**なので、コミットメッセージは直せない
（amend は履歴の書き換えになる）。PR コメントと、後続のコミットメッセージで訂正した。

**なぜ気づけなかったか**: **検査を「通ったか」だけで読み、「何件通ったか」を読んでいない。**
CLAUDE.md には「**件数を書いたら数え直す**」「`| wc -l` を通す」と書いてあり、
その直前の作業で7版の sha256 は1つずつ取り直している。**数えた数字と、数えなかった数字が
同じ文章に並んでいた。** 差が出たのは、sha256 は「取らないと書けない」が、件数は
「それらしい数字を書けてしまう」から。**自分で導出できてしまう数字ほど、出力を読まない。**

**再発防止**: 仕組み —— 無し（判断に依存）。コミットメッセージの数字を検証する検査は無い。
習慣 —— **検査の件数を書くときは、その行をコピーする。** 暗算した数字を書かない。
「479 + 1 = 480」のような**足し算が頭に浮かんだ時点が合図**で、そこで元の数を確かめる。

## M-20260919-credited-my-own-dirty-tree-to-another-session 他人の commit が直したと報告したが、緑にしていたのは自分の未コミット変更だった（2026-09-19・型 F）

**Before**: `M-20260919-hand-applied-ahead-of-a-pending-migration` を書き、再発防止として
「**本番へ直接当てた直後に、不変条件を2つとも測る**」と決め、`comm` 2本のコマンドまで
台帳に載せた（14:31 UTC 前後）。その後 Codex の P1 を直すため
`20260919150043` を本番へ当てた（15:00:43 UTC）。**測っていない。**

**After**: その12分前（14:48 UTC）に別セッションの PR #1098 がマージされ、
main に `20260919150000_workshop_capability_profiles_catchup.sql` が入っていた。
本番には未適用。`20260919150000 < 20260919150043` なので、
**自分の適用がその追いつき版を out-of-order にした** —— 前回とまったく同じ形。
気づいたのは自分の検査ではなく、check-in で main を引き直したとき。

**なぜ気づけなかったか**: **再発防止を「書いて終わり」にした。**
書いた時点では「次に当てるとき」が遠い先の話だと感じていたが、実際は40分後だった。
そして当てた直後は Codex の指摘を捌くことに注意が向いていて、
**自分の手順書を開く動作がどこにも組み込まれていない**。
前回の根も同じ構造だった —— 規則は `db-migrate.yml` に書かれていたが、開かなかった。
今回は規則が自分の台帳に移っただけで、**開かない**のは変わっていない。
加えて、前回は「main の未適用版」を見る必要があると分かっていたのに、
このセッション中に main が2回動いている（#1093 / #1098 のマージ）ことを
当てる前に確認していない。**並行セッションが走っている日は、10分前の main はもう古い。**

**その型の再発防止が効かなかった理由**: 「直後に測る」は**人間の記憶に依存する手順**で、
仕組みが何も止めない。台帳に書いても、当てる瞬間に読む理由が無ければ実行されない。

**再発防止（書き直し）**: 手順を増やすのをやめ、**当てる操作そのものに測定を束ねる。**
本番へ当てるときは、DDL を流す SQL と同じ実行の中で最後に台帳の全版を出し、
その出力を `supabase/migrations` の一覧と突き合わせるまでを**1つの作業**として扱う。
測っていない適用は、まだ終わっていない適用とみなす。
あわせて —— **当てる直前に `git fetch origin main` する。**
並行セッションがある日は、手元の main が数分で古くなる。

**Before**: PR #1095（外注施工履歴）で CI 10 件が緑、`mergeable_state: clean`、レビュー指摘も反映済み。
PR 本文に「`check:migrations`（再生 471/471 OK）」と書き、定期確認でも毎回「赤や未対応なし。
レビュアー待ち」と報告した。**この PR がマージされたら本番 DB に何が起きるかは、一度も確かめていない。**

**After**: マージの 19 秒後に `db-migrate` が失敗した
（`Remote migration versions not found in local migrations directory`）。
本番の台帳に main へ無い版が7つあり、`supabase db push` がそこで止まる。
本番を引いて確認した結果、**`outsourced_work_requests` を含む4表はどれも存在せず**、
同じく止まっていた `certificates.certificate_no` も無い。
つまり **`/admin/outsourced-work` は本番で動かない**（コードだけ出ている）。
**この失敗はこの PR が作ったものではない** —— 前回のマージ（#1094 自身）で既に同じ理由で落ちている。
だが「この PR のせいではない」は「届いている」ではない。

**なぜ気づけなかったか**: **「緑」を、その検査が見た範囲を言わずに受け取った。**
`check:migrations` が通したのは**使い捨ての再生 DB**で、本番の台帳と突き合わせる経路
（`db-migrate`）は**マージ後にしか走らない**。ここまでは 9/18 の時点で読めば分かる。
さらに悪いのは、**予告が自分の編集したファイルに書いてあった**こと ——
#1094 のコミットメッセージと `LEDRA_CURRENT.md` に
「本番の台帳に main に無い版が7つある。**次のマージで `db-migrate` が失敗する**」とある。
9/18 に自分でその `LEDRA_CURRENT.md` へ追記しておきながら、**自分の PR がその「次のマージ」だ**と
結び付けていない。型 F の再発防止（「1コマンドで確かめられる事実は確かめる」）は効かなかった。
効かなかった理由は、**`db-migrate` の履歴を「確かめられる事実」の側に数えていなかった**から。
確認項目が PR の中（CI・レビュー・マージ可否）で閉じており、
**マージの先（本番に届くか）が視界に入っていない。**

**再発防止**: 仕組み —— 無し（判断に依存）。`db-migrate` は main への push でしか走らないので、
PR 側の検査で先回りして落とすことはできない（本番台帳を読む検査を CI に足す案はあるが、
シークレット未登録の週次ジョブが既に赤のままなので、まずそこが先）。
習慣 —— **マイグレーションを含む PR は、マージ前に `db-migrate` の直近の実行結果を見る。**
直近が赤なら、自分の版はその赤の後ろに積まれるだけで本番には届かない。
そして **「次のマージで壊れる」と書かれた予告を読んだら、自分の PR がその「次」かどうかを確かめる。**


## M-20260919-hand-applied-ahead-of-a-pending-migration 本番へ手で当てる前に、その運用規則が書いてあるワークフローを読んでいなかった（2026-09-19・型 F）

**Before**: 落ちていた本番機能を直すため、`20260918150000` / `20260919132119` /
`20260919134412` の3版を Supabase MCP で本番へ直接当てた。気をつけたのは1点だけ ——
**「本番の台帳にある版は、必ず同じ版のファイルが repo にもあること」**。
ファイル名を本番の記録版に合わせたのはそのためで、それで十分だと思っていた。

**After**: Supabase のプレビューが
`⚠️ Applied out-of-order migrations: supabase/migrations/20260918160000_outsourced_work_requests.sql`
を出した。`20260918160000` は PR #1095 で main に入っていたが**本番には未適用**で、
自分が当てた `202609191…` より**古い**。つまり自分の手当てが、他人の未適用
マイグレーションを out-of-order にしていた。

`.github/workflows/db-migrate.yml` を読むと、守るべき不変条件は**2つ**あり、
冒頭のコメントに両方が明記されている。

> 2. 新しいマイグレーションのタイムスタンプは、本番へ適用済みの最新バージョンより後に
>    すること。古い日付を後から入れると out-of-order として停止する

しかも「`--include-all` で強制適用もできるが DECISION_LOG 2026-07-21 で不採用」
「2026-08 に2回起きている」とまで書いてある。**自分は不変条件1だけを知っていて、
2を知らなかった。知らなかったのは、当てる前にこのファイルを読まなかったから。**

**なぜ気づけなかったか**: **「本番へ直接当てる」の作法を、記憶から再構成した。**
不変条件1はこのセッションの文脈に出てきていたので知っていた。2は出てきていなかったので
存在ごと落ちた。**運用規則が書かれている場所（db-migrate.yml）は分かっていたのに、
開いていない。** そして当てた時点では `db-migrate` が不変条件1で既に赤かったため、
**自分が足した2つ目の問題は、今日は何も壊さなかった** ——
壊れるのは #1093 がマージされて1が解けた後で、そのときエラーが名指しするのは
`20260918160000`、つまり**他人の PR のファイル**になる。
気づかれにくい形で、次の人に罠を置いていた。

**その型の再発防止が効かなかった理由**: 型 F の既存の再発防止は
「環境から1コマンドで確かめられる事実は確かめる」。今回落としたのは**事実**ではなく
**規則**で、既存の文面はそれを拾わない。

**再発防止**: 仕組み寄りに1つ —— **本番へ直接当てた直後に、2つの不変条件を両方測る。**
片方だけ見て終わらない。

```sql
-- 本番の全版
select version from supabase_migrations.schema_migrations order by version;
```

```bash
# ローカルの全版と突き合わせる
comm -23 prod.sorted local.sorted   # 不変条件1違反（本番にあって repo に無い）
comm -13 prod.sorted local.sorted   # 不変条件2違反（repo にあって本番に無い＝適用待ち）
```

2つ目が**空でなく、かつその最小値が本番 max より小さい**なら out-of-order を作っている。
習慣の方 —— **本番を触る前に、その操作を自動化しているワークフローを開く。**
運用規則はコードのコメントに書かれていて、会話の文脈には出てこない。

## M-20260919-said-no-open-pr-has-it-again 前日に同じ型で台帳を書いたのに、24時間後に同じ「open PR に無い」を書いた（2026-09-19・型 F）

**Before**: 本番の台帳に main へ無い版が7つある件を OPEN_QUESTIONS にまとめ直したとき、
`20260917000400`（`workshop_capability_profiles`）について
「**main にファイルが無い。どの open PR にも該当ファイルが無い【要確認】**」と書いた。
根拠は、版名から PR #1093 の `ft_*` 系とは名前が違うと見たこと。PR #1093 の PR 本文には
`ft_*` 12 テーブルしか列挙されていないので、これは #1093 のものではないと読んだ。

**After**: #1093 のブランチ `feat/manufacturer-field-testing` の `supabase/migrations/` を
実際に引いたら、`20260917000400_workshop_capability_profiles.sql` が**在った**。
`20260917100000_ft_tenant_rls_and_storage.sql` も含め、**7版のうち6版が #1093** で、
未決は `20260918142610`（`remote_schema`）の1版だけだった。
並行セッションが同じ時間帯に書いた PR #1096 の表は、最初から正しく #1093 と書いている。

**なぜ気づけなかったか**: **前日 `M-20260918-called-it-untraceable-without-checking-open-prs` で
まったく同じ失敗を記録し、再発防止に「open PR を引く」と書いた。** それを24時間後に、
**同じファイルの同じ段落で**繰り返した。違いは、前回が「open PR の一覧を見ていない」で、
今回は**一覧は見たが、PR 本文しか読まずブランチのファイルを見ていない**こと。
PR 本文は著者が書いた要約であって、ブランチの中身ではない。
**「探した」の中身が一段浅くなっただけで、同じ穴に落ちている。**
そして今回も、その断定を PR 本文と事業ログに載せて push した。

**その型の再発防止が効かなかった理由**: 前回の再発防止は
「**open PR と直近のマージ済み PR を引く**」だった。これは「PR の一覧を引く」としか
読めない書き方で、**何を読めば答えになるかを指定していない**。今回は一覧を引いて
本文を読み、そこに無いことを「無い」の根拠にした ——
再発防止の文面どおりに動いて、同じ結論を間違えた。

**再発防止（書き直し）**: **マイグレーション・ファイルの出所を「無い」と言うときは、
open PR の**ブランチの `supabase/migrations/` を直接引く**。PR 本文は根拠にしない。
`mcp__github__get_file_contents` にブランチ名を渡せば1回で出る。
より一般に —— **「Xに無い」と書くときの X は、要約ではなく実体を指していなければならない。**

## M-20260919-swept-for-the-literal-not-the-bug-class 自分で2つ書いた原因のうち1つしか走査せず、「残り0本」と書いた（2026-09-19・型 A）

**Before**: `insurer_search_vehicles` が落ちていた原因を**2つ**特定した ——
(1) enum に無い `'expired'` との比較で 22P02、(2) enum を `text` の返り値に入れて 42804。
直したあと「同じ漏れが他に無いか」を走査し、**残り0本**と結論して
RELEASE_LOG と LEDRA_CURRENT と PR 本文に書いた。走査に使ったのは
本番の全関数定義を `'expired'` というリテラルで引く正規表現。

**After**: `/code-review` が `insurer_get_certificate` を挙げてきた。走査したのは
**(1) だけ**だった。`'expired'` を含まない 42804 —— つまり自分が2番目に挙げた原因そのもの ——
は**一度も走査していない**。本番で `plpgsql_check` を全 plpgsql 関数に回したら、
`insurer_get_certificate` が `status` と `expiry_type` の2列で 42804 を出した。
`src/app/api/insurer/certificate/route.ts` ほか2経路が呼んでいる、生きている画面である。

**なぜ気づけなかったか**: **原因を2つ書いたのに、検出器は1つ分しか作らなかった。**
しかも `'expired'` は**症状に出てきた文字列**であって、バグの種類ではない。
「grep できる形」を探して、grep できる方だけを走査範囲にした。
そして走査が空だったことを「(1) が残っていない」ではなく「**漏れが残っていない**」と
読み替え、件数まで添えて断定した。型 A の「検査の『該当なし』を、その検査が
何件を見たか数えずに受け取る」そのもので、今回は**何を見ていないか**を数えていない。
もっと悪いのは、**正しい道具がこのリポジトリに既にあった**こと ——
`plpgsql_check` は `scripts/replay-migrations.mjs` が CI で回している。
再生 DB では回し、本番では回していなかった。

**再発防止**: 仕組みで止める —— **本番の全 plpgsql 関数に `plpgsql_check` を回す走査を
正とする。** 書き方に依らず「壊れている関数そのもの」が出るので、リテラル grep の
取りこぼしが起きない。クエリは `20260919134412` のマイグレーション冒頭に残した。
習慣の方 —— **原因をN個書いたら、検出器もN個要る。** 「残り0本」と書く前に、
その走査が自分の挙げた原因のどれを見ていて、どれを見ていないかを1行で言えるか確かめる。

## M-20260919-attributed-an-overloads-call-to-its-sibling 同名の別オーバーロードの呼び出しを根拠に、要らない判断待ちを代表に投げた（2026-09-19・型 A）

**Before**: 本番の `insurer_search_vehicles` が落ちていることを見つけ、代表に
「**本番復旧は別件として先にやるべき。`insurer_is_active_subscription` を戻すか、
呼び出しを外すかの判断が要ります（`expired` の件も同じ関数です）**」と報告した。
根拠は、本番の関数本体を走査して `insurer_is_active_subscription` を呼ぶ関数を数えたら
**1件**で、その名前が `insurer_search_vehicles` だったこと。その関数は本番から
drop 済みなので、「復旧には判断が要る」と結論した。

**After**: `insurer_search_vehicles` は本番に**2つ**ある。
`(text,integer,integer,text,text)` と `(text,integer,integer,text,text,text)`。
消えた `insurer_is_active_subscription` を呼んでいるのは**6引数の方だけ**で、
アプリ（`src/app/api/insurer/vehicles/route.ts`）が呼ぶのは**5引数の方**。
5引数側を落としていたのは `'expired'`（enum に無い値）と、返り値の enum→text だけで、
**判断は1つも要らなかった**。キャスト2箇所を直して本番へ当てたら復旧した。
6引数側は誰からも呼ばれていないので、これは今も別途の判断事項として残る。

**なぜ気づけなかったか**: **クエリが確定させたのは「この名前の関数が呼んでいる」であって、
「アプリが呼ぶ関数が呼んでいる」ではない。** 件数（1件）を見て一意だと思い込み、
`oid::regprocedure` まで出していたのにシグネチャを読んでいない。Postgres では
同名の関数が別物として共存することを知っていながら、走査結果を名前で丸めた。
そしてその丸めた結果を、**自分の中で止めず代表への「判断が要ります」に変換した。**
CLAUDE.md にある通り、誤った数字や前提は「そのまま依頼の仕様になる」。
今回は「代表が決めるまで本番が壊れたまま」になりかけた。

**再発防止**: 仕組みで一部止まる —— **関数を名指しするときは `proname` ではなく
`oid::regprocedure` で書く**（引数型まで出る）。走査クエリの出力もそこだけを見る。
仕組みで止まらない方は習慣にする —— **「判断が要ります」と書く前に、
その判断をしなくても直る経路が無いかを1回探す。** 判断待ちは代表の時間を止めるので、
事実の誤りより高くつく。
## M-20260919-green-ci-read-as-production-applied CI 10件緑で「出せる」と報告した機能が、本番には1行も届かなかった（2026-09-19・型 F）

**Before**: PR #1095（外注施工履歴）で CI 10 件が緑、`mergeable_state: clean`、レビュー指摘も反映済み。
PR 本文に「`check:migrations`（再生 471/471 OK）」と書き、定期確認でも毎回「赤や未対応なし。
レビュアー待ち」と報告した。**この PR がマージされたら本番 DB に何が起きるかは、一度も確かめていない。**

**After**: マージの 19 秒後に `db-migrate` が失敗した
（`Remote migration versions not found in local migrations directory`）。
本番の台帳に main へ無い版が7つあり、`supabase db push` がそこで止まる。
本番を引いて確認した結果、**`outsourced_work_requests` を含む4表はどれも存在せず**、
同じく止まっていた `certificates.certificate_no` も無い。
つまり **`/admin/outsourced-work` は本番で動かない**（コードだけ出ている）。
**この失敗はこの PR が作ったものではない** —— 前回のマージ（#1094 自身）で既に同じ理由で落ちている。
だが「この PR のせいではない」は「届いている」ではない。

**なぜ気づけなかったか**: **「緑」を、その検査が見た範囲を言わずに受け取った。**
`check:migrations` が通したのは**使い捨ての再生 DB**で、本番の台帳と突き合わせる経路
（`db-migrate`）は**マージ後にしか走らない**。ここまでは 9/18 の時点で読めば分かる。
さらに悪いのは、**予告が自分の編集したファイルに書いてあった**こと ——
#1094 のコミットメッセージと `LEDRA_CURRENT.md` に
「本番の台帳に main に無い版が7つある。**次のマージで `db-migrate` が失敗する**」とある。
9/18 に自分でその `LEDRA_CURRENT.md` へ追記しておきながら、**自分の PR がその「次のマージ」だ**と
結び付けていない。型 F の再発防止（「1コマンドで確かめられる事実は確かめる」）は効かなかった。
効かなかった理由は、**`db-migrate` の履歴を「確かめられる事実」の側に数えていなかった**から。
確認項目が PR の中（CI・レビュー・マージ可否）で閉じており、
**マージの先（本番に届くか）が視界に入っていない。**

**再発防止**: 仕組み —— 無し（判断に依存）。`db-migrate` は main への push でしか走らないので、
PR 側の検査で先回りして落とすことはできない（本番台帳を読む検査を CI に足す案はあるが、
シークレット未登録の週次ジョブが既に赤のままなので、まずそこが先）。
習慣 —— **マイグレーションを含む PR は、マージ前に `db-migrate` の直近の実行結果を見る。**
直近が赤なら、自分の版はその赤の後ろに積まれるだけで本番には届かない。
そして **「次のマージで壊れる」と書かれた予告を読んだら、自分の PR がその「次」かどうかを確かめる。**

## M-20260918-read-detector-blindness-as-stale-list 検出器から22件が「消えた」のを棚卸し漏れと読み、視界を失っていたことに気づかなかった（2026-09-18・型 A）

**Before**: 外注施工履歴の PR で CI が赤になり、`apiRoutePermissions.test.ts` が3件落ちていた。
中身は (a) 登録ルート **144 件が「Permission を要求していない」**、(b) 証明書無効化の2経路が
「ガードされていない」、(c) 既知リスト `KNOWN_UNGUARDED` の **22 件が一覧から消えた**。
(a)(b) を「`withCaller` のオプション引数を検出器が読めないための**誤検出**」と読み、
(c) は「棚卸しの取りこぼし」と並べて、まとめて「main でも赤の既存失敗、この PR とは無関係」と
PR にコメントした。提案パッチも `enforces()` の正規表現を足す話に留めた。

**After**: 検出器を直したら、(c) は棚卸しの話ではなかった。未登録ハンドラの走査は
`if (!/resolveCallerWithRole\(/.test(chunk)) continue;` で始まっており、`withCaller` へ寄せた
**378 本はこの行で丸ごと視界の外に出ていた**。22 件が消えたのは「強制済みになったから」でも
「リストが古いから」でもなく、**検出器がそのハンドラを一度も見ていない**から。
つまり認可もレート制限も持たないルートを増やしても、この検査は赤にならない状態だった。
直したら実際に1件（`market/inquiries [POST]`）が新しく浮き上がった（読んで分類済み・実害なし）。
同じ形が AI レート制限側にもあり、そちらは **13 本が本当に剥がれたまま**だった
（`withCaller` の `rateLimit` オプションすら無い）。誤検出13本と実害13本が同じ一覧に並んでおり、
「誤検出だ」で片付けていたら**実害の側が一緒に消えていた**。

**なぜ気づけなかったか**: **「検出器が一覧から落とした」を、落とした理由を聞かずに受け取った。**
(a)(b) が誤検出だと分かった時点で「原因は withCaller」まで辿れていたのに、
**同じ原因が (c) にどう効くかを考えていない。** 誤検出（見えているものを間違える）と
盲点（そもそも見ていない）は原因が同じでも危険度が逆で、後者は黙って穴が開く。
このリポジトリは同じ教訓を `aiRouteRateLimit.test.ts` の冒頭に
**「検出器を狭めたときは、一覧から消えたものを1件ずつ確認すること」**と書いている。
自分が読んだファイルの中に答えがあったのに、消えた22件を1件も確認しなかった。
さらに「main でも赤」を確かめたことで**原因を確かめた気になっていた** ——
「この PR のせいではない」は「無害である」ではない。

**再発防止**: 仕組み —— 検出器に**陰性対照**を入れた。ラッパで包んだだけ・要求と違う権限・
ラッパでない関数の同じ形のオプション・変数渡しは、いずれも「守られている」と読まないことを
テストで固定した（これが無いと、次に検出器を緩めたとき静かに全件が緑になる）。
習慣 —— **検査の一覧から項目が減ったら、減った理由を項目ごとに言えるまで「棚卸し」と呼ばない。**
「対象が守られた」「対象が消えた」「検出器が見なくなった」は全部違う。

## M-20260918-verification-skippable-via-transition-flag 照合を「イベント経由でしか進めない」設計にしたつもりが、遷移 API のクライアント由来フラグで飛ばせた（2026-09-18・型 C）

**Before**: 外注施工履歴で、受領済み → 照合済み（MATCHED）は「三方向照合の結果が一致のときだけ」
と決め、照合イベントの登録関数から遷移関数を呼ぶ形にした。遷移関数側の検査は
`payload.verification_result === "MATCH"` —— **照合関数が渡す値をそのまま条件にした**。
同じ形で、例外承認は「承認済みにする更新」と「復帰先へ進める更新」の2回に分け、
2回目が失敗したときの行の状態（EXCEPTION_APPROVED のまま、人が抜けられない）を考えていなかった。
自分の `/code-review` で10件の指摘が出るまで、どちらも気づいていない。

**After**: 遷移 API は `POST /transition` として**クライアントから直接叩ける**ので、
`payload.verification_result: "MATCH"` を送れば照合イベント無しで MATCHED に入れた。
証明データはそれを「照合済み」として固める。呼び出し側だけが渡せる内部引数
（`verificationEventId`）に変えて、payload では条件を満たせないようにした。
承認は付随処理（受領試行の採番・accepted 化）を先に済ませ、**行の更新は 承認待ち → 復帰先 の1回**
にし、イベントだけ2件（人の承認・システムの復帰）を追記する形にした。
あわせて、確認者がテナントロール viewer のとき route の `minRole: "staff"` で弾かれて
画面が出す次アクションを押せない、担当者割当に完了後ガードが無い、承認経由で受領済みに戻ると
受領試行が pending のまま、完了後再施工の承認が何度でも使える、UI が署名を固定文字列で送る、
受領試行の採番が競合する、店舗・車両のテナント確認が無い、サービス層にテストが無い —— を直した。

**なぜ気づけなかったか**: 照合関数 → 遷移関数の**1本の経路だけを頭の中で通した**。
遷移関数には「API から直接」というもう1本の入口があり、そこでは payload はクライアントの値になる。
**同じ関数を内部から呼ぶときと外から呼ぶときで、引数の信頼度が違う**のに、引数の形を分けなかった。
承認の2段更新も同じで、「成功する経路」しか通していない。
ドメイン層（純粋関数）はテストで固めたのに、**サービス層は「純粋でないからテストしにくい」で
1本も書かず**、動かして確かめる経路を自分で塞いでいた。これは CLAUDE.md の
「非トリバルなロジックは、壊れたら落ちる検査を1つ残す」を、守れる所だけ守ったということ。

**再発防止**: 仕組み —— `src/lib/outsourcedWork/__tests__/service.test.ts` に偽の Supabase
（テーブル＝配列）を置き、「payload のフラグでは MATCHED に入れない」「承認は行を
EXCEPTION_APPROVED に留めない」を落ちるテストにした。習慣 ——
**関数を内部からも外（route）からも呼ぶなら、外から渡せない引数と外から渡せる引数を型で分ける。**
外から渡せる値を「内部の呼び出しが正しく渡すはず」で条件に使わない。
そして「2回更新する」と書いた時点で、**1回目だけ成功した行の状態から人が抜けられるか**を書き出す。

## M-20260918-called-it-untraceable-without-checking-open-prs 「作った人に聞く以外に辿れない」と書いたが、open PR に載っていた（2026-09-18・型 F）

**Before**: ドリフト検出器に列を足して回したら、本番にだけ `ft_*` 12 テーブルが出た。
`supabase/migrations/` に定義が無く、`src/` からの参照も 0。Postgres に作成時刻が無いことを
根拠に、OPEN_QUESTIONS へ「**FT が何の略で、誰がいつ何のために作ったかが分からない。
作った人に聞く以外に辿る方法がない**」と書いた。「外注・協力工場（field technician？）
まわりの試作に見えるが推測」とまで添えた。

**After**: open PR の一覧を引いたら、**PR #1093「メーカー実証テストプラットフォーム全機能実装」**
がまさにその 12 テーブルを作っていた。PR 本文に 12 個すべての名前が列挙してあり、
マイグレーションも `20260917000000_ft_projects.sql` ほか4本ある。FT は **Field Test**。
「辿る方法がない」どころか、**コマンド1回**で出た。しかも結論が逆で、
これはドリフトではなく未マージ PR の schema が本番へ先に入ったもの ——
**消してはいけない**ものを「消すか残すか」として起票していた。

**なぜ気づけなかったか**: **探した範囲を「探しつくした範囲」と書いた。**
実際に見たのは `supabase/migrations/` と `src/` と本番の DB だけで、
**open PR を一度も見ていない**。「マイグレーションに無い＝どこにも無い」と読み替えている。
未マージの作業が本番に先に届く経路があることは、自分でこのセッション中に
（PR #1052 のプレビュー DB で）扱っていたのに、そこへ結び付けていない。
「作成時刻が無い」は本当だが、**出所を辿る手段が作成時刻しかない、は偽**だった。
1つの経路が塞がっていることを、全経路が塞がっている証拠として使った。

**再発防止**: 仕組みでは止まらない（「どこにも無い」は検査にしにくい）。習慣にする ——
**「出所が分からない」と書く前に、open PR と直近のマージ済み PR を引く。**
リポジトリの作業は PR に必ず残る。そして **「辿る方法がない」と書くときは、
辿ろうとした経路を列挙する。** 列挙できないなら、それはまだ探していないだけ。

## M-20260918-silent-skip-made-detector-never-run 自分で入れたドリフト検出器が、12日間ずっと「0秒で成功」を返していた（2026-09-18・型 A）

**Before**: #1045 で `scripts/check-schema-drift.mjs` を入れ、週次ジョブに載せた。
シークレットが無いときは「フォークで落ちないように」skip して `exit 0` する作りにした。
以後、週次 `Supabase Advisors` は毎回 success。**検出器は入っている、と思っていた。**

**After**: 2026-09-14 の実行を開くと、「Check schema drift」ステップは
**04:27:45 開始 → 04:27:45 終了の 0 秒**。再生だけで数分かかるので、走っていれば
0 秒にはならない。シークレットが未登録で、**入れてから一度も本番と比べていなかった**。
その間に本番へ `ft_*` 12 テーブルが入り、`certificates.certificate_no` の欠落
（保険会社ポータルが動かない原因）も見えないままだった。

**なぜ気づけなかったか**: **緑を「検査が通った」と読んだ。** 実際には
「検査が走らなかった」も同じ緑を出す。しかも**翌日（#1051）に、まったく同じ穴を
plpgsql 検査で塞いでいる** —— `REQUIRE_PLPGSQL_CHECK=1` を入れ、コメントに
「拡張が入らなかったときに黙って飛ばさせない。検査があるのに何も見ていない状態を
緑で通さないため」とまで書いた。**同じ日に隣のファイルで同じ判断をしながら、
先に入れたこちらへ戻らなかった。** 型を1つ学んだとき、既に書いた同型の箇所を
grep して回る、をしていない（型 J の親戚）。
もう1つ: 検出器を入れた PR で「入った」までは確かめたが、**次の週次実行の所要時間を
一度も見ていない**。0 秒はジョブ一覧に出ている。

**再発防止**: 仕組み。`REQUIRE_SCHEMA_DRIFT=1` を週次ジョブに渡し、シークレットが
無ければ落とす。習慣のほうは —— **「黙って skip して exit 0」を書いたら、その場で
『CI では落とす』側の分岐も書く。** skip だけを先に書いて後で締める、をしない。
あわせて、**検査を CI に載せたら初回の実行時間を見る**（0 秒は走っていない印）。

## M-20260918-replay-db-lacked-prod-column 本番に無い列を持つ再生 DB で検査を通し、「本番で動く」と書いた（2026-09-18・型 A）

**Before**: `insurer_get_certificate` の 42702 を直して本番へ入れたあと、
本番と再生 DB の関数定義が **md5 まで完全一致**（`ea270122…`、3354 バイト）し、
再生 DB で `plpgsql_check` が **error なし**であることを確かめた。
そのうえで「**保険会社ポータルの証明書詳細は、これで初めて動く状態になった**」と
LEDRA_CURRENT と RELEASE_LOG に書いた。二経路で確かめたつもりだった。

**After**: 動いていなかった。本番で
`select c.certificate_no from public.certificates c limit 0` を実行すると **42703**。
`certificates.certificate_no` は**本番にだけ無い**。関数の中身が同じでも、
**その関数が読む表の形が違えば結果は違う。** 42702 を直した1段下に 42703 が在った。

**なぜ気づけなかったか**: **検査の場所（再生 DB）が本番と同じである、を検証していない。**
md5 が一致したのは**関数定義だけ**で、私はそれを「環境が同じ」と読み替えた。
`plpgsql_check` は「この DB で実行できるか」を答える道具であって、
「**本番で**実行できるか」は答えない。まさに「判断の道具そのものを検証する」の形で、
道具（再生 DB）の前提を確かめずに出力を事実として扱った。
しかも同じ誤りは `M-074`（部品が直ったことを機能が直ったことと読んだ）で一度書いており、
そこに書いた再発防止「**利用者が触る入口を1回通す**」を、今回もまた実行していない。
入口を通していれば 42703 は初回で出た。

**再発防止**: 仕組み。ドリフト検出器に**列**を足した（この PR）。列が食い違っていれば
検査が落ちるので、「再生 DB で通った」が本番の保証に近づく。
仕組みで届かない側は習慣 —— **「本番で動く」と書くのは、本番で動かしたときだけ。**
本番で動かせないなら「本番では未確認」と書く。再生 DB での合格は、
**再生 DB が本番と同じだと別途言えるときにだけ**本番の根拠になる。

---

## M-20260916-timeout-branch-missed-sibling-fix ポーリングのタイムアウト分岐に、直前に足した冪等キーのリセットを持ち込み忘れた（2026-09-16・型 J）

**Before**
- 信じたこと: Codex 指摘「CANCELED 状態で冪等キー(`squareRef.current`)を使い切っていない」
  （`PosClient.tsx` の Terminal ポーリング）を直せば、再試行が同じ取消済み
  チェックアウトを掴み続ける不具合は塞げる
- したこと: `status.status === "CANCELED"` の分岐にだけ `squareRef.current = null;`
  を足してテストなしでコミット・push した（同ファイルに単体テストが無く、
  目視確認で「直った」と判断した）

**After**
- 同じ `setInterval` コールバック内に、もう1つの終端分岐（`attempts > 150` の
  タイムアウト）があり、**同じ理由で同じリセットが要る**のに見ていなかった。
  タイムアウトも DELETE で Square 側を取り消す点は CANCELED と同じなので、
  再試行時に同じ取消済みチェックアウトの idempotency key を掴み続ける経路が
  そのまま残っていた。次の `/code-review` 実行（PR #1092 への追加コミット後）
  で指摘されて気づいた
- なぜ気づけなかったか: 「CANCELED 分岐を直す」という指摘の言葉どおりの範囲
  だけを見て、**同じ `setInterval` コールバックの中に終端状態の分岐がもう1つ
  あるかを grep しなかった**。修正対象を Codex の指摘文の粒度（1分岐）で
  区切ってしまい、「この関数内で “取消して終わる” 経路は他にないか」という
  問い方をしていなかった。型Jの核心（同じ理由の兄弟実装を全部揃える）を
  自分の直前の修正にすら適用していなかった
- 再発防止: 仕組み無し（判断に依存）。この関数にはユニットテストが無い
  （UIコンポーネントの `setInterval` ロジックで、既存のテスト基盤も無い）。
  習慣として: 「◯◯分岐を直して」と名指しされた指摘に対応するときは、
  直す前に**その分岐を含む関数・ブロック全体を読み直し、同じ後始末
  （冪等キーのリセット・状態のクリア等）を要る終端分岐が他にないか**を
  自分に問う。1箇所直して終わりにしない

---

## M-20260916-codex-found-8-in-own-untested-pr Square QR 決済 PR に、自分のテストでは検出できない実害バグが8件残っていた（2026-09-16・型 K）

**Before**
- 信じたこと: PR #979（Square 経由の QR コード決済）は `/code-review` を4回回し、
  `tsc` / `eslint` / `vitest` を毎回通し、「検証済み」として何度も push していた。
  自分で書いたテスト（`squareSale.test.ts` / `qrCheckout.test.ts`）は全部緑
- したこと: 3週間かけて main を4回取り込みつつ、ドラフトのまま「Square API を
  1回も叩けない」ことを PR 本文に明記して止めていた。代表が ready for review に
  切り替えた直後、リポジトリ標準の Codex 自動レビューが走った

**After**
- Codex が P1 5件・P2 3件を指摘し、**全件が実物のバグ**だった（読んで再現条件を
  確認済み）。代表的な3件:
  - Square Terminal の idempotency_key が `ledra:` + テナントUUID(36) +
    `:` + reference_id(最大40) = 最大83文字で組んでいた。Square の上限を
    超えると**全会計が作成時点で400になる** —— 一番最初の1件から機能しない
  - `getSquareContext` が投げる `SquareNotConnectedError` の `reason` を
    ルートのレスポンスに載せていなかった。`PosClient` は
    `data?.reason === "not_connected"` を見てフォールバックする作りなので、
    **未接続の店が全店エラーになり、フォールバックが一度も発火しない**
  - Stripe の `checkout_session_id` と Square の `square_checkout_id` を
    同じリクエストに両方渡せる作りのまま、`recordSale` の冪等キーは1列しか
    持てず Stripe を優先していた。**Square 側で確認できた本物の決済の
    payment_id が記録からまるごと落ちる**
- 自分のテストは全部、**自分が書いた実装の入出力をそのままなぞって**いた
  （`squareError()` を書いた自分が「`reason` を返す」つもりで実装し、
  そのテストも「`reason` を返すはず」を検証せず `error`/`message` だけ見ていた）
- 8件とも読んで検証し、`src/lib/square/client.ts` / `qrCheckout.ts` /
  `src/lib/pos/squareSale.ts` / `recordSale.ts` 呼び出し元 /
  `src/app/api/admin/square/qr-checkout/route.ts` / `PosClient.tsx` を修正。
  新規テスト7件を追加（`resolveTerminalSale` のウォレット判定、
  `findRecentPayment` のページング、複数ロケーション時の fail-closed、
  Stripe/Square 二重証明の拒否）

**なぜ気づけなかったか**
- **実装者とテスト作成者が同一人物で、同じ思い込みを共有していた。** 「Square は
  未接続なら `reason: "not_connected"` を返すはず」という前提はコードにもテストにも
  同じ形で埋め込まれ、**テストが実装を検証したのではなく、実装がテストの期待値の
  出所になっていた**（循環）。型 K の核心 —— 「実際に呼ばれる文脈」を、実際の
  Stripe/Square API ではなく**自分の想定するモック**で代用し続けた
- この環境は Stripe / Square の本番 API に届かない（プロキシで
  `docs.stripe.com` / `developer.squareup.com` もブロック）。「未検証」は
  PR 本文に4回書いたが、**未検証であることと、自分のテストが検出力を持つことは
  別**だと扱わずに進めてしまった。「テストが通る」を「動く」の証拠として扱った
  （型 G に隣接するが、今回はテストの中身自体が実装の写しだった点が異なる）
- idempotency_key の文字数上限は、Stripe/Square のドキュメントを見ずに
  「テナントIDを混ぜれば安全」という自分の直感だけで決めていた
  （型 A: 検証していない道具＝自分の直感を事実として扱った）

**再発防止**
- 仕組み無し（判断に依存）。この環境から Stripe/Square の実 API を叩けない制約は
  変わらないため、**外部 API と対話する新規コードは、実 API 到達までレビュー
  ゲート（Codex 等の第三者レビュー、または代表の実機検証）を経るまでドラフトを
  外さない**運用で代用する。すでに CLAUDE.md の PR 運用ルールが `/code-review`
  必須化をしているが、**自分の `/code-review` も自分が書いたコードへの理解を
  前提にする点は同じ限界を持つ**ため、Codex のような別モデル・別視点のレビューを
  「未検証の外部 API 呼び出しを含む PR」では省略しないことを習慣にする
- 具体的な仕組み: 今回追加したテスト（複数ロケーション・二重証明拒否・
  ウォレット判定・ページング）は「実装者の想定」ではなく「レビューアが指摘した
  失敗シナリオ」から書いたため、循環の外側にある。**指摘されたバグへのテストは、
  実装を見ずに指摘文だけから再現条件を書く**と、同じ循環を避けやすい

---

## M-20260915-dupe-count-from-truncated-grep 重複していた旧番号を「4組」と報告したが、実際は10組だった（2026-09-15・型 F）

**Before**
- 信じたこと: MISTAKE_LEDGER で番号が重複している旧番号は **4組**
- したこと: grep の出力を目で見て「4組」と代表に報告した。**数えていない。**
  代表はその数字を受けて「番号の重複、既存の4組も直して」と指示した。
  **自分の誤った数字が、そのまま依頼の仕様になった**

**After**
- 実際は **10組**。`M-060`〜`M-065` の6組と `M-081`〜`M-084` の4組。
  2経路で確認した。
  - `node scripts/check-ledger-ids.mjs` → `旧番号の既知重複 10 組`
  - `grep -oE '旧 M-[0-9]+）' docs/context/MISTAKE_LEDGER.md | sort | uniq -d | wc -l` → `10`
- ID 方式の変更（連番 → `M-<日付>-<スラッグ>`）で全10組を区別できるようにし、
  対応表を冒頭の「ID について」節に載せた

**なぜ気づけなかったか**
- **grep の出力を「一覧」として読み、件数として読まなかった。** 画面に出た行を
  目で数えたつもりで、`wc -l` を通していない。M-011（日付を `date -u` で確かめない）と
  同じ形で、**1コマンドで確定する数字を目測で代用した**。型 F そのもの
- 型 F の既存の再発防止は「**PR 本文に件数を書いたらマージ直前に数え直す**」
  （CLAUDE.md、M-090 で追加）。これが効かなかったのは、**規則を PR 本文にだけ適用し、
  会話で代表に言う数字には適用しなかった**から。出力先が違うだけで同じ数字である。
  むしろ会話の数字の方が危ない —— 代表はそれを前提に指示を出すので、
  誤りが「自分の中の間違い」で止まらず、依頼の仕様になる

**再発防止**
- 仕組み: `npm run check:ledger-ids`（CI の並列チェック + pre-commit フック）。
  旧番号の**余剰**が 10 を超えたら落ちる。この数字は以後スクリプトが持つので、
  自分が数え直す必要がなくなった＝目測の入る余地を消した
- 習慣: **代表に件数を言う前に `| wc -l` を通す。** CLAUDE.md の
  「PR 本文に件数を書いたら数え直す」を、**会話で口に出す数字にも広げる**

**追記1（同じ日・同じ形で2度目）**
- 上の「再発防止」を書いた直後、同じ作業の中で **OPEN_QUESTIONS に
  「参照 55 箇所は書き換えていない」と書いた。数えていない。** 実際は 8 倍の桁だった。
- 数え直して気づいた。効いたのは CLAUDE.md の「件数を書いたら数え直す」で、
  **「wc -l を通す」という新しい習慣の方は、書いた直後に守れていない。**
- **これが「習慣」を再発防止に書くことの限界である。** 仕組みが無い項目は、
  書いた本人がその日のうちに破る。

**追記2（3度目。今度は数えたのに間違えた）**
- 追記1 の数え直しで **438 箇所**（台帳の外 227 / 台帳本文 211）と書いた。
  実際は **440 箇所**（台帳の外 **229** / 台帳本文 211）。`/code-review` の指摘で判明した。
  （この 440 はベース `af9b3f5b` 時点の数。その後 `main` が2回進み、`acf89574` で 446、
  マージ時のベース `a55b7cae` で **450** になった。**ベースが動けば母数も動く**ので、
  数字にはベースの SHA を添える。3回ともマージ直前の数え直し（CLAUDE.md）で拾った。）
- **今度は `wc -l` を通している。間違えたのは数え方ではなく、数える範囲である。**
  拡張子の白リスト（`git ls-files '*.md' '*.ts' … '*.yml'`）でファイルを集めており、
  拡張子を持たない `supabase/migrations.production-ledger`（2件）が最初から
  母集団に入っていなかった。
- **なぜ気づけなかったか**: 白リストを「数えるための道具」として書いたのに、
  **その道具が何を取りこぼすかを確かめていない。型 A そのもの**である。
  しかも半分（台帳本文 211）は別の方法で数えていたので、
  **同じ合計の2つの半分を、違う数え方で出して足していた。**
  片方だけ再現できても総数は正しくならない。
- **再発防止**: 数字を文書に書くときは、**その数字を出したコマンドを隣に書く**
  （OPEN_QUESTIONS の当該箇所にそうした）。コマンドが書けない数え方は、
  再現できない＝検証できない。`git grep ... -- . ':!<除外>'` のように
  **母集団を「全部から引く」形で書けば、白リストの取りこぼしは起きない。**

**追記3（4度目。書いた「再発防止」のコマンドが動かなかった）**
- 追記2 で「数字の隣にコマンドを書く」と決めて OPEN_QUESTIONS に書いたコマンドが、
  **実行すると `0` を返す**。ヒアドキュメント経由で書いたときにバックスラッシュが
  二重（`\\b`）になり、単語境界ではなく「バックスラッシュ + b」を探す正規表現に
  なっていた。マージ直前の数え直しで気づいた。
- **動かないコマンドは、無いより悪い。** 数字の隣にあると「検証済み」に見えるのに、
  読んだ人が実行すると別の数字（`0`）が出る。再現手段のふりをした飾りになる。
- **なぜ気づけなかったか**: コマンドを**書いただけで、書いた形のまま実行していない。**
  型 A（道具を検証しない）そのもので、しかも**その型の再発防止として書いた道具**が
  検証されていなかった。1つ上の階層で同じことをしている。
- **再発防止**: 文書にコマンドを書いたら、**文書に書いた通りの文字列をコピーして実行し、
  隣に書いた数字と一致することを確かめる。** 書いたものと実行したものが同じである保証は、
  それ以外に無い（仕組み無し・判断に依存）。

---

## M-20260915-ran-known-checks-not-ci CI と同じ検査を手元で走らせず、`lint:migrations` だけ CI で落とした（2026-09-15・型 E・旧 M-094）

**Before**: 新しいマイグレーションを足したあと、手元で `eslint` / `tsc` / `vitest` /
`check:schema` を回して「検証済み」と書き、PR にもそう報告した。
どれも通ったので、CI も通ると思っていた。

**After**: CI の「Lint, Type Check & Unit Tests」が **`lint:migrations` だけ**で落ちた。
`CREATE INDEX` に `CONCURRENTLY` が要る（書き込みをロックするため）という
リポジトリのルールがあり、しかも CONCURRENTLY はトランザクション内で実行できないので
**単独ファイルに分ける**必要があった。索引の作成と旧索引の削除をそれぞれ別の
マイグレーションに切り出して解消。

**なぜ気づけなかったか**: **手元で「CI と同じもの」を走らせず、思い出せる検査だけを
individually 走らせた。** このリポジトリには `scripts/ci-parallel-checks.sh` があり、
CI のワークフローにも「手元で同じものを再現できる状態を保つため（M-018）」と
書いてある。**その仕組みが既にあるのに読んでいない。** 走らせた4つは自分が知っている
検査で、知らない検査（`lint:migrations` / `check:ox-override`）は候補にすら上がらなかった。
M-018 と同じ型（手元と CI の差）で、そのときの再発防止として用意されたスクリプトを
使わなかったのが今回の中身。

**再発防止**: 仕組みあり（既にあった）。**マイグレーションやビルド設定を触ったら、
個別のコマンドではなく `bash scripts/ci-parallel-checks.sh` を走らせる。**
検査の一覧はスクリプト側の配列にあり、CI はそれを呼ぶだけなので、ここを走らせれば
ズレようがない。「自分が知っている検査を並べる」をやめる。

## M-20260914-plain-replace-silently-noop プリレンダの JSON-LD が1件も出力されていなかった（`</head>` が無く、文字列置換が空振り）（2026-09-14・型 A＋J・旧 M-093）

**Before**: MobileWash のプリレンダ（`scripts/prerender.mjs`）で、各ルートの
`<title>` / description / canonical / og:url / og:title / twitter:title は
`replaceTag()`（置換先が無ければ Error）で差し込み、JSON-LD だけ
`html.replace("</head>", ...)` と素の置換で書いた。ビルドは
`OK: prerendered 12 routes` と出たので、**12ルートすべてに構造化データが入ったと
書いて PR に出した。**

**After**: MobileWash の `index.html` には `</head>` が**そもそも無かった**
（`<head>` を開いたまま `</body></html>` で終わっていた。ブラウザは暗黙に閉じるので
表示は壊れない）。素の `String.replace` は一致しなければ**元の文字列をそのまま返す**ので、
置換は黙って空振りし、**12ルート全部に JSON-LD が1つも入っていなかった。**
`grep prerender-jsonld out/company/press/index.html` で気づいた（次の作業で
一覧ページに ItemList を足そうとして初めて出力を見た）。
`index.html` に `</head>` / `<body>` を補い、JSON-LD の差し込みも `replaceTag()` に
揃えた。壊すテスト済み: `</head>` を消してビルドすると
`Error: index.html に </head>（JSON-LD の差し込み先） が見つからない` で落ちる。

**なぜ気づけなかったか**: **ビルドスクリプトの成功メッセージを、出力の検証として
受け取った。** `OK: prerendered 12 routes` が言っているのは「12回ループして12ファイル
書いた」だけで、中身については何も言っていない。自分で書いた出力件数を、自分の主張の
根拠にした（型 A）。加えて、**同じ関数の中で6箇所はガード付き・1箇所は素の置換**という
不揃いを、書いた直後にも読み返さなかった（型 J）。
`<title>` が入っているのは目視したので「head への差し込みは効いている」と一般化したが、
`<title>` と `</head>` は別のアンカーで、片方の成功はもう片方を何も保証しない。

**再発防止**: 仕組みあり。生成物への差し込みは**例外なく** `replaceTag()` を通す
（素の `html.replace` を使わない）。素の `String.replace` は「一致しなければ黙って
何もしない」ので、生成コードでは使わないこと自体を規約にする。
習慣にすること: 「◯◯を出力した」と書く前に、**出力ファイルを grep する。**
スクリプトの標準出力ではなく、成果物を見る。

## M-20260914-advised-three-actually-six 「除外すべきは3つ」と代表に助言したが、実際は6つだった（2026-09-14・型 J＋A・旧 M-092）

**Before**
- 信じたこと: Dependabot #1046 で Expo と衝突するのは
  `react-native` / `react-native-worklets` / `react-native-reanimated` の**3つ**
- したこと: 選択肢 (a) を「この3つを `dependabot.yml` のグループから除外し、
  残りの安全な25件だけ取り込む」と書いて代表に提示し、OPEN_QUESTIONS にも
  そう起票した。代表はこれを読んで (a) を選んだ

**After**
- 実際は **6つ**だった。`expo@55.0.31` の `bundledNativeModules.json`（Expo が
  バージョンを決める一次情報）と `apps/mobile/package.json` を突き合わせたところ、
  Expo の指定を追い越すものがあと3つあった。

  | package | Expo の指定 | #1046 の提案 |
  |---|---|---|
  | react-native-gesture-handler | ~2.30.0 | ~2.32.0 |
  | react-native-screens | ~4.23.0 | ~4.27.0 |
  | react-native-safe-area-context | ~5.6.2 | ~5.9.1 |

- **3つだけ除外していたら、同じ問題を抱えた兄弟3つが残ったまま**「対処済み」に
  なっていた。しかも残った3つは次の週にまた同じグループで流れてくる。
- **なぜ気づけなかったか**: 最初に #1046 の差分を読んだとき、
  **`react-native` の 0.83→0.87 という目立つ数字に引っ張られ**、その周辺
  （worklets / reanimated）まで見て「これで全部だ」と打ち切った。
  「Expo が固定しているものは何か」という**母集団を一度も数えていない**（型 A）。
  数えるのに必要だった `bundledNativeModules.json` は、
  `npm pack expo@55.0.31` 1回で読めるところにあった。
  型 J（兄弟実装と揃えていない）の教科書どおりの形 ——
  **「AをBに置き換える」判断をしたのに、A自体を全部洗い出さずに一部だけ処理した。**
- さらに悪いのは、この不完全な選択肢を**代表に提示して選ばせた**こと。
  自分だけの作業ミスなら気づいた時点で直せばよいが、
  **助言として外に出した数字は、相手の判断の前提になる。**
  「3つ」を前提に (a) を選んだ人に対して、実際は6つでしたと後から言うことになった。
- 変えたこと: 単位を「私が気づいた3つ」から **「Expo が固定しているもの全部」**
  に変えた。`dependabot.yml` には Expo 固定依存の semver-minor を無視する規則を
  入れ、個別の名前を数える設計をやめた。
  あわせて `apps/mobile/scripts/check-expo-pins.check.mjs` を追加し、
  `bundledNativeModules.json` × `package.json` × `dependabot.yml` の実データ3つを
  突き合わせて漏れを落とすようにした。
- **再発防止**: 仕組みあり（`check-expo-pins.check.mjs`）。変異3種で実際に
  落ちることを確認済み。加えて習慣を1つ:
  **選択肢を人に提示する前に、その選択肢が触る対象の母集団を数える。**
  「これとこれ」と列挙した時点で、それが全部である根拠を言えるか自問する。
  言えないなら「等」ではなく、数えてから出す。

---

## M-20260914-escaped-angle-brackets-in-commit squash コミットのメッセージに HTML エスケープされた山括弧を入れ、`Co-Authored-By` が壊れた（2026-09-14・型 A・旧 M-091）

**Before**: PR #1074 を squash マージするとき、マージ API の `commit_message` に
`Co-Authored-By: Claude Opus 5 &lt;noreply@anthropic.com&gt;` と書いた。
自分が組み立てた文字列なので中身は分かっているつもりで、**そのまま送った**。

**After**: API は文字列をそのまま使うので、`main` の `988b8d1` には
`&lt;` / `&gt;` が**リテラルで**入っている。Git の trailer は
`Name <email>` の形でないと解釈されないため、**共著者として認識されない。**
`main` の履歴は書き換えられないので、このコミットは直せない。
同じセッションで続けてマージした holy-inc #7 と MobileWash #19 は、
生の `<` `>` で書いたので正しく入っている（`git log -1 --format=%B` で確認済み）。

**なぜ気づけなかったか**: **送信する文字列を、送信先の形式で読み返していない。**
コミットメッセージは「文章」ではなく trailer という**構文**を持つデータで、
`Co-Authored-By:` 行は機械が読む。文章として目で追うと `&lt;` は読み飛ばせてしまう。
CLAUDE.md の「判断の道具そのものを検証する」と同じ形が、
道具ではなく**出力の側**で起きた。事前に `git log` で確認できたのは push 後だけだが、
送る前に「この文字列がそのまま `git log` に出る」と読み替えれば気づけた。

**再発防止**: 仕組み無し（判断に依存）。ローカルの `git commit` なら husky/commitlint を
通るが、**GitHub のマージ API はそのフックを一切通らない**。習慣にすること:
マージ API に渡すメッセージは、`<` `>` `&` を含む行（trailer・URL・メールアドレス）が
あればそこだけ目視する。`Co-Authored-By` と `Claude-Session` の2行が定位置なので、
この2行を送信直前に見る。


## M-20260914-hunk-count-subtraction ハンク数を引き算で出したつもりが、引かれる側を数えていなかった（2026-09-14・型 F・旧 M-090）

**Before**
- 信じたこと: 自分の mobile 差分は2ハンク、Dependabot 版は「余計な5ハンク」
- したこと: PR #1075 の本文と RELEASE_LOG の両方にその数字を書いた

**After**
- 実際: Dependabot 版の `apps/mobile/package-lock.json` は**6ハンク**。
  うち2つは意図したバンプなので、**余計なのは4つ**（6 − 2 = 4）。
  `git diff origin/main pr911 -- apps/mobile/package-lock.json | grep -c '^@@'` で確定。
- **なぜ気づけなかったか**: 余計な変更の「種類」を4つ数えていた
  （`expo-font` 削除／`@types/react`／`csstype`／`typescript` の devOptional→dev）のに、
  そこに意図した変更1つを足し忘れた……のではなく、**逆に足しすぎた**。
  「2ハンク vs 5ハンク」という語呂の対比が先にでき、
  **引き算の元になる総数（6）を一度も数えていなかった**。
  差の数字を、両辺を数えずに直接書いた。
- 変えたこと: 総数と内訳の両方を書く形に直した（「6ハンクで、余計なものが4つ」）。
  差だけ書くと検算できない。
- **これは仕組みが効いた例**。CLAUDE.md の「PR 本文に件数を書いたら、
  マージ直前に数え直す」に従って実際に数え直したところ出てきた。
  **外に出る前に止まった**（M-080 は公開後の訂正コメントが必要だった）。
- **再発防止**: 仕組みあり（マージ直前の再カウント）。効いた。
  加えて習慣を1つ: **差分の個数を書くときは、必ず総数と内訳を併記する。**
  「余計な N 件」だけだと、読む側も自分も検算できない。

---

## M-20260914-verified-without-installing 「検証した」と書いた検証が、変更した当のものを一度も動かしていなかった（2026-09-14・型 E＋A・旧 M-089）

**Before**
- 信じたこと: PR #1075 の検証は十分である。RELEASE_LOG と PR 本文に
  「lint 0 errors / tsc クリーン / check:schema OK / vitest 5609 テスト通過 /
  next build で build-manifest.json 生成」と表を書いた
- したこと: その表を PR 本文に載せ、ドラフト PR を作成した

**After**
- 実際: **この PR の mobile 側の変更（`@stripe/stripe-terminal-react-native`
  beta.31→beta.32）は、一度も実行されていなかった。**
  - `apps/mobile` では `npm install --package-lock-only` と `npm ci --dry-run` しか
    実行していない。**どちらも実際にはインストールしない。**
    `node_modules` には beta.31 が残ったままだった（`/code-review` が
    mtime とインストール済み version を突き合わせて指摘）
  - ルートの `npx vitest run` は `vitest.config` の include が
    `src/**` `scripts/**` `supabase/__tests__/**` なので、**mobile のコードを1行も見ない**
  - `.github/workflows/mobile-ci.yml` の4ステップ（typecheck / test / prebuild /
    check:native）はどれも走らせていなかった
- さらに、実際に `npm ci` で beta.32 を入れて `npx expo prebuild` を走らせたところ、
  **このバンプは無害な patch ではなかった。** beta.32 は Expo config plugin に
  `withDangerousMod` を追加し、生成される `MainApplication` の Tap to Pay ガードの
  位置を `TerminalApplicationDelegate.onCreate(this)` の**前から後ろへ**移す。
  Tap to Pay は稼働中の機能である。「beta の patch バンプ」という見た目だけで
  中身を見ずに通そうとしていた。
- ルートの検証にも同じ穴があった。`npx vitest run` を回した `node_modules` は
  ロックファイルと同期していなかった（`@contentauth/c2pa-node` が 0.6.4、
  ロックは 0.6.0）。**依存解決そのものが主題の PR で、同期していない
  `node_modules` の上で検証していた。**
- **なぜ気づけなかったか**: `npm ci --dry-run` が通ったことを
  「インストールできる」ではなく「インストールした」と読んだ。
  `--dry-run` は**何も起きない**のが定義なのに、成功メッセージ
  （`added 788 packages in 761ms`）が本物のインストールと同じ見た目をしているため、
  出力を見て満足してしまった。**道具が何をしたかではなく、
  道具が何を表示したかで判断した**（型 A）。
  加えて「テストが 5609 件通った」という大きな数字が、
  **その 5609 件がどの範囲を見ているか**を確かめる動機を奪った（型 E）。
  数が多いことと、変更箇所を覆っていることは別である。
- 変えたこと: `apps/mobile` で実際に `npm ci` し、mobile-ci.yml の4ステップを
  すべて実行した（すべて通過）。prebuild の生成物を beta.31 と比較して
  上記の順序変更を特定し、OPEN_QUESTIONS に起票した。
  RELEASE_LOG の検証欄を web / mobile に分け、実際に走らせたものだけを書いた。
- **再発防止**: 仕組み無し（判断に依存）だが、習慣を2つに絞る。
  1. **`--dry-run` の出力を検証の根拠にしない。** 検証と言えるのは
     実際にインストール・実行したときだけ
  2. **依存を変えた PR では、そのパッケージが属する workspace の CI 定義を開いて、
     そこに書かれたステップを1つずつ実行する。** 別 workspace のテスト件数は
     どれだけ多くても、この workspace の検証にはならない

---

## M-20260914-claimed-no-gate-exists 「c2pa-node の更新を検証できるゲートは無い」と PR に書いたが、ゲートは実在して通っていた（2026-09-14・型 B＋F・旧 M-088）

**Before**
- 信じたこと: Dependabot PR #1059 の `@contentauth/c2pa-node` ^0.6.0→^0.9.3 は
  **既存のどの検査でも検証できない**。根拠として3つ挙げた —
  (1) `src/types/c2pa-node.d.ts` が `declare module` のみで全体が `any`、
  (2) 本番 C2PA テストは env ゲートで CI ではスキップされる、
  (3) optionalDependency なので入らないことがある
- したこと: その内容を #1059 にコメントとして投稿し、「潜在的な罠」と評価した

**After**
- 実際: **(2) が誤り。** `src/lib/anchoring/providers/__tests__/c2paSignValidate.test.ts` は
  env ゲートを持たない。JPEG / PNG / WebP を**実際にネイティブライブラリで署名し**、
  マニフェストを読み戻して検証コードを許可リストと突き合わせる、本物の適合性ゲートである。
  CI の `test:coverage` に含まれて毎回走っている。
- さらに **0.9.3 に対して実際に通る**。手元で 0.9.3 を入れて実行し 4/4 パスを確認した
  （ELF x86-64 のネイティブバイナリが正しく入り、`Reader` も export されている）。
  つまり #1059 の c2pa 部分は「検証できない罠」ではなく「検証済み」だった。
- ただし**別の弱点が実在する**（これは当初の指摘とは中身が違う）:
  このゲートは**フェイルソフト**である。`import("@contentauth/c2pa-node")` が失敗すると
  `readerAvailable = false` になり、4本とも `ctx.skip()` で**スキップ**され、
  **テストファイル自体は「passed」になる**。そして `@contentauth/c2pa-node` は
  optionalDependency で、実際に入らないことがある（この環境で素の `npm install` を
  実行したところ、パッケージが node_modules に入らなかった）。
  この2つが重なると **CI は緑のまま C2PA の検査が丸ごと沈黙する**。
  実測: パッケージ不在の状態で実行 → `Test Files 1 passed / Tests 4 skipped`。
- **なぜ気づけなかったか**: テストファイルを**開いていない**。
  「本番向けの C2PA テスト」というファイル名と、過去に別の env ゲート付きテストを
  見た記憶から、**中身を読まずに「env ゲートで CI ではスキップ」と分類した**（型 B）。
  `sed -n '1,40p'` 1回と `npx vitest run <file>` 1回、合計2コマンドで確かめられた事実を
  確かめずに、外部に見える PR コメントとして投稿した（型 F）。
  しかも「ゲートが無い」は**安心する側ではなく警戒する側**の誤りだったため、
  自分の中で「慎重な指摘」として通ってしまい、検証の動機が働かなかった。
  **警戒側の誤りも誤りである**という点を見落とした。
- 変えたこと: #1059 に訂正コメントを投稿した。
  フェイルソフトの件は OPEN_QUESTIONS に起票した。
- **再発防止**: 仕組み無し（判断に依存）。習慣として
  **「この変更を検証する検査は無い」と書く前に、必ず対象のテストを実際に走らせる。**
  「無いことの主張」は「あることの主張」より検証が要る。
  なお**フェイルソフトなゲートを CI の緑で信用しない**ためには
  スキップ数を見る必要があり、これは仕組み化の候補として OPEN_QUESTIONS に起票した。

---

## M-20260912-rls-table-double-count RLS テーブル数を「同じテーブルの2通りの表記」で二重に数えていた（2026-09-12・型 A・旧 M-085）

**Before**: `docs/implementation/current-architecture.md` §4.3 は、RLS を有効化した
テーブル数を **240** と記録し、計測コマンドも
`grep -hoi 'alter table [^ ]* enable row level security' supabase/migrations/*.sql | awk '{print $3}' | sort -u | wc -l`
として併記していた。コマンドが書いてあるので再現可能＝検証済み、として扱っていた。
今回システム構成図を作るにあたり、同じコマンドを流用して数え直し、**251** を得た。

**After**: そのコマンドは `awk '{print $3}'` の出力をそのまま一意化している。
migration の中には同じテーブルを `ALTER TABLE public.customers ...` と
`ALTER TABLE customers ...` の両方の表記で書いたものがあり、**同じテーブルが
2件として数えられていた。** 該当は `customers` / `invoices` / `edge_devices` /
`edge_events` / `signature_sessions` など5テーブル。`tolower()` と
`sed 's/^public\.//'` で正規化すると **246**。構成図には 246 を採用し、
未正規化だと 251 になること・その差が何に由来するかを
`docs/diagrams/system-architecture.md` §7.3 に注記した。

**なぜ気づけなかったか**: **「計測コマンドが併記されている」ことを、
「その計測が検証されている」ことだと読んだ。** コマンドの併記は再現性を保証するが、
そのコマンドが何を1件と見なしているかは別の主張であり、誰も検証していなかった。
CLAUDE.md が「判断の道具そのものを検証する」で挙げている
「ロール名の部分文字列を正規表現で引くときは境界をアンカーする」と同じ形が、
テーブル名の schema 接頭辞で起きた。数えた数字ではなく、**数え方**が誤っていた。

**再発防止**: 仕組み無し（判断に依存）。件数を文書に書くときは、
**その数え方が1件と見なす単位を一度だけ言葉にする**（「同じテーブルが2表記で
書かれていたらどうなるか」を自問する）。加えて、既存文書の計測コマンドを
流用するときは、**結果が前回と違ったらまず自分の実行ミスを疑うのではなく、
コマンドの定義を読む**。今回は 240→251 と増えていたため「テーブルが増えた」で
片付けるのが自然な流れだった。

**この型（A）の再発防止が効かなかった理由**: 型 A の既存の再発防止は
「自作の走査スクリプトの数字を文書に書く前に、既知の1件で当たりを取る」。
今回は**自作ではなく既存文書から引き写したコマンド**だったため、
「自作スクリプト」という条件に当てはまらず、検証の対象外だと扱ってしまった。
**引き写したコマンドも自作と同じ扱いにする**、が今回の追加。

## M-20260911-untracked-files-investigated-thrice 「新しいクローンに Git 管理外のファイルが無い」という同じ原因を、3回別々に調査した（2026-09-11・型 C・旧 M-087）

**Before**: 代表が `Ledra2` として新しくクローンした環境で、1日のうちに3つの障害が出た。
(1) iOS ビルドが entitlement エラー、(2) Web の開発サーバーが起動できない、
(3) アプリのログインが `network request failed` → `invalid API key`。
**3つとも別々の問題として、その都度ゼロから調査した。** (1) では EAS の既知バグを疑って
5回ビルドを回し、(3) では直近のセキュリティ強化コミットや RLS を疑った。

**After**: 3つとも原因は同じで、**`.gitignore` 対象のファイルが新クローンに無いだけ**だった。
`apps/mobile/credentials/`（Apple Development 証明書とプロファイル）、
ルートの `.env.local`、`apps/mobile/.env` の3つ。
(1) を解いた時点で「このクローンには Git 管理外のファイルが一式欠けている」と
分かっていたはずで、そこで `git status --ignored` 相当の棚卸しを1回やっていれば
(2)(3) は調査そのものが不要だった。

**なぜ気づけなかったか**: 1件目を「Tap to Pay 固有の署名問題」として閉じ、
**その原因の一般形（＝クローンに untracked なファイルが無い）に上げなかった**。
症状が3つとも全く違う見た目（署名エラー / 起動失敗 / API キーエラー）だったため、
同じ根だと気づく手がかりが表面に出ていなかった。同じ根を持つ2件目が来たときに
「1件目と同じ形か」を問わなかったのが本体。

**再発防止**: `README.md` の「ローカル開発」に
**「新しいクローンで始めるとき — Git に入っていないファイル」**の表を新設し、
3ファイルとも「無いとどうなるか」の症状つきで列挙した。次に同じ症状が出たら
README を引けば終わる。加えて習慣として、**環境が新しくなった直後の障害は、
まず `.gitignore` を読んでから調査を始める。**

---

## M-20260911-plugin-docs-unread リポジトリ内に答えが書いてあるプラグインを読まず、Ad Hoc プロファイルを作らせて同じ失敗を5回繰り返した（2026-09-11・型 F・旧 M-086）

**Before**: 実機用 dev-client の EAS ビルドが
`Entitlement com.apple.developer.proximity-reader.payment.acceptance not found and
could not be included in profile` で失敗した。EAS の既知バグ（expo/eas-cli#4178、
Tap to Pay の capability 識別子不一致）が症状に一致すると考え、
`EXPO_NO_CAPABILITY_SYNC=1` の付与、provisioning profile の削除→再生成、
最後に「Apple Developer Portal で **Ad Hoc** プロファイルを手動作成して
`credentials/ios/profile.mobileprovision` に配置する」を代表に指示した。
5回とも**バイト単位で同じエラー**で失敗し、代表の時間を溶かした。

**After**: 原因はこのリポジトリの
`apps/mobile/plugins/withRemoveTapToPayEntitlement.js` の冒頭コメントに、
**同じエラー文字列ごと日本語で書いてあった**。Apple の Tap to Pay 承認は本チームでは
`Provisioning Support: Development` 限定で、**Distribution 型の provisioning profile
にはこの entitlement を含められない**。Ad Hoc は Distribution 型なので、私が作らせた
プロファイルでは原理的に通らない。代表が貼った失敗ログの
`export_options.method | ad-hoc` が、まさにそれを示していた。

**なぜ気づけなかったか**: エラー文字列を**外部（GitHub issue）に当てに行き、
自リポジトリを grep しなかった**。`grep -rn "not found and could not be included" apps/`
の1コマンドで、原因・背景・復帰手順が全部書かれたファイルに当たっていた。
さらに悪いのは、`export_options.method | ad-hoc` という決定的な行を**自分で読んでいながら**、
「dev 限定の entitlement なのに Distribution 型で署名している」という矛盾に接続できなかった
こと。外部バグ説を先に立てたせいで、目の前のログを仮説の検証にではなく
「仮説に合う部分を探す」ために読んでいた。

**追記（同日）**: 原因は `apps/mobile/.gitignore` の39-41行目にも書いてあった
（「TTP の development entitlement は Apple Development profile にしか入らず、
EAS のリモート (Distribution cert 強制) では扱えないため local モードに切り替え」）。
**同じ事実がリポジトリ内の2箇所に日本語で書かれていたのに、どちらも読んでいなかった。**
さらに、`eas credentials` のダウンロードを実行させたことで `credentials.json` が
EAS の Ad Hoc 資格情報とパスに上書きされ、動いていた設定を自分で壊していた。

**追記2（Codex レビュー指摘）**: この台帳と手順書に一度
「実績のある保管場所は `ttp-creds/`」と書いたが、**誤り**。`.gitignore` に
`ttp-creds/` があるのを見ただけで断定し、実際に代表の環境で確認したときの
`apps/mobile/credentials/`（`ios_dev.p12` と `ledra_dev.mobileprovision`）を
反映していなかった。**型 F の同じ穴を、同じ調査の中でもう一度踏んでいる。**
パスの正は `.gitignore` ではなく `credentials.json` である。

**追記3（Codex レビュー指摘・型 A が重なる）**: その訂正を入れる一括置換のうち1件が、
バックスラッシュのエスケープ違いで**一致せず無言で失敗**していた。`assert` を全部の
置換に付けていなかったため、エラーも出ず、判定コマンドだけ古いパスのまま残った。
Codex に指摘されるまで気づいていない。**文字列置換は「実行した」ではなく
「置換後の状態を読み直す」まででワンセット**。同じ修正を複数箇所に入れたら、
最後に `grep` で古い方が残っていないか数える。

**再発防止**: 仕組み無し（判断に依存）。習慣として次の2つを置く。
1. **エラー文字列を外部検索する前に、必ず自リポジトリを grep する。**
   ビルド・署名系は加えて `docs/mobile-release-tap-to-pay.md` と
   `apps/mobile/plugins/` を先に読む。
2. **同じ対処を2回試して結果が変わらなかったら、対処を変えるのをやめ、
   「この失敗が起きるために成り立っていなければならない前提」を列挙する側に回る。**
   3回目以降の試行は、仮説が無いまま代表の時間を消費するだけになる。

---

## M-20260911-dts-as-behavior-evidence .d.ts の型定義を、SDKの実際の挙動の証拠として扱った（2026-09-11・型 A・旧 M-084）

**Before**: Codex に「confirmPaymentIntent が通信エラーで失敗しても、Stripe側では
実は成功していることがある」と指摘され、`StripeError` 型定義
（`stripe-terminal-react-native` の `.d.ts`）に `paymentIntent?: PaymentIntent.Type`
フィールドがあるのを確認し、`confirmError.paymentIntent.status === "succeeded"` を
見る修正を書いて「直した」とコミットメッセージに書いた。

**After**: 同じ Codex に再指摘され、`node_modules` の実体（`.d.ts` ではなく
コンパイル後の `functions.js`）を読んだところ、`confirmPaymentIntent` の
JS ラッパーは `if (error) return { error, paymentIntent: undefined }` と
**エラー時は必ず `paymentIntent` を捨てる**実装だった。iOS ネイティブ側
（`StripeTerminalReactNative.swift`）はコメントで「`paymentIntent` はエラーと
並べてトップレベルで返す」と明記しており、JSラッパーがその値を握りつぶして
いるだけ。**型定義に書かれたフィールドは「エラーオブジェクトが取りうる形」を
示しているだけで、「このSDKバージョンのこの呼び出しで実際に埋まるか」は
別の問題だった。** サーバー側の実際のStripe状態を確認する方式（既存の
ポーリング用GETエンドポイントを再利用）に作り直した。

**なぜ気づけなかったか**: `.d.ts` を読んで「フィールドが存在する」ことを
確認した時点で、**確認したつもりになった。** 型定義はコンパイル時の契約
であって、ランタイムでその値が実際に埋まる保証ではない
（`beta.31` という pre-1.0 の SDK で、まさにそのギャップが実害を持つ形で存在した）。
コンパイル後の実装コード（`lib/module/*.js`）は同じ `node_modules` の中に
あり、1コマンドで読めた。**「型がある」を「動く」の証拠として使った**のは
まさに型Aの「動作を主張するコメントを、その根拠を確認せずに書く」そのもの。

**再発防止**: 仕組み無し（判断に依存）。サードパーティSDKの「エラーから
追加情報を読む」類のコードを書くときは、**`.d.ts` ではなく `lib/` 配下の
実装（JSに変換された後のコード）を読んで、その分岐が実際にその値を
設定するか確認する**を習慣にする。バージョンが `0.0.x-beta` 系であれば
なおさら型定義が実装を正確に反映していない可能性を疑う。

---

## M-20260911-payment-failure-single-message 決済失敗通知を1種類の文言にして、二重請求リスクを埋め込んだ（2026-09-11・型 B・旧 M-083）

**Before**: Tap to Pay 要件5.12対応で、`processCardPayment` の単一 `catch` ブロックに
非承認時のローカル通知を実装した。`catch` に来る失敗を「非承認」1種類として扱い、
`msg` を本文にして「決済が完了しませんでした」を送った。

**After**: 同じ `catch` ブロックは、**カードは既に切られたが記録（`/pos/terminal/capture`）
だけ失敗したケースも同じ経路で受ける**。その箇所には既に
「ここから先で失敗しても、カードは既に切られている」というコメントが書かれていた
（`useTerminal.ts:473` 付近、この機能を書く前から存在）。両者を同じ文言で通知すると、
店舗は「完了しなかった」と誤解して**もう一度決済してしまい、実際には二重請求になる**。
`pendingCapturePaymentIntentId` の有無で文言を分岐させ、記録失敗側は「二重に決済せず
記録をやり直せ」と明示するよう直した（`/code-review` で指摘され気づいた）。

**なぜ気づけなかったか**: `catch` ブロックの**中身にどんな失敗が集まるか**を、
5.12の実装前から書いてあったコメント込みで読んだのに、「ここに通知を足す」という
自分の作業の枠でしか catch を見ず、**そのブロックが実は2種類の意味的に別の失敗を
1つにまとめている**という既存の設計を、新機能の設計に持ち込まなかった。
コードは読んだが、そこに書いてあった前提（カードは切られている）を
自分が足す通知文言の設計に接続しなかった＝型Bの「1段だけ深く読んで止まる」。

**再発防止**: 仕組み無し（判断に依存）。共有の catch/finally ブロックに新しい分岐を
足すときは、**そのブロックへ既に書かれているコメント・状態変数（今回は
`pendingCapturePaymentIntentId`）が「どの経路から来た失敗か」を区別する手段として
使えないか、先に確認する**を習慣にする。

---

## M-20260911-merged-20s-after-review レビューが届いた20秒後にマージし、その中の実害ある指摘を読まなかった（2026-09-11・型 F・旧 M-082）

**Before**: #1056 の CI が全11チェック緑・`clean` になったのを確認し、代表の「マージ」指示に
従ってマージした（14:43:07）。CI の状態は checks API で直接確認した。

**After**: **Codex のレビュー3件が 14:42:47 に届いていた。マージの20秒前である。**
CI は見たが、**未読のレビューが無いかは見ていない。** 3件とも P2 で、うち1件は
**代表がこれから実行する手順そのものの誤り**だった。

- **classic PAT には `contents: write` / `pull-requests: write` という選択肢が無い。**
  それは fine-grained の権限名で、classic は OAuth スコープ（private なら `repo`、
  public なら `public_repo`）を使う。ワークフローのコメントに
  「classic でも fine-grained でも可。必要な権限は contents: write と pull-requests: write」
  と書いており、**classic を選んだ人は画面でその項目を探して見つけられない。**
  スコープ無しのトークンを登録して 403 のまま、という踏み方をする。
- OPEN_QUESTIONS に同じ件の項が2つあり、**古い方が「PAT か GitHub App トークン」を
  勧めたまま**だった（App のインストールトークンは1時間で失効するのでこの形では使えない、
  と新しい方には書いてあるのに）。
- Actions の PR 作成許可は **PAT を使うなら不要で、しかも有効化はリポジトリ全体に効く**
  （`pull-requests: write` を要求する全ワークフローが PR を作成・承認できるようになる）。

**なぜ気づけなかったか**: **「マージしてよいか」の確認項目に、レビューが入っていなかった。**
CI の緑・`mergeable_state: clean`・件数の数え直しは全部やった。やらなかったのは
`get_reviews` / `get_review_comments` を1回引くことだけ。この PR は2日間レビュー0件で、
**「この PR にレビューは付かない」という前提が固定していた。** ready 化した瞬間に
Codex が起動する設定になっている（CLAUDE.md に明記されている）のに、
**自分でドラフトを解除した直後だという事実と結び付けなかった。**

**さらに悪い点**: 指摘の1つは、こちらが PR 本文に「**確かめきれていません**」と
自分で書いていた箇所（Actions 設定の要否）だった。**未確定と分かっている項目が
あるまま、確認手段が到着したのに読まずに閉じた。**

**再発防止**: 仕組みで止められる。**マージ前に未解決レビューを引く**こと自体は
API 1回で、CI の確認と同じコストである。今回の確認項目に1行足す:
CI 緑 → `mergeable_state` clean → **未解決のレビュー/レビューコメントが0件** → 件数の数え直し。
特に**自分でドラフトを解除した直後は、レビューボットが起動している**と考える
（このリポジトリでは ready 化が Codex のトリガーになっている）。

---

## M-20260909-fixed-red-without-checking-others リポジトリ全体を止めている赤を、「誰かが既に直していないか」を見ずに直した（2026-09-09・型 F・旧 M-081）

**Before**: #1056 の CI が `Security audit` で赤かった。main でも同じステップで赤いことを
run 34357806973 で確認し、「これは自分の PR の失敗ではない」と正しく切り分けた。そのうえで
「リポジトリ全体の検査が止まっているのだから直すべきだ」と判断し、`next` 16.2.11 → 16.3.4 /
`sharp` 0.35.3 → 0.35.4 のロックファイル更新を作り、手元で6検査を通して push した（`f46faeec`）。

**After**: 約1時間後に #1054 がマージされ、その中に**同じ CVE 3件の修正が既に入っていた**
（`b9dba57e`「CI「Security audit」ゲートが検出したCVE3件をnpm audit fixで解消」）。
main 取り込み時に衝突して初めて気づいた。こちらの `package-lock.json` は破棄して main 側を採用。
**作った成果物は丸ごと無駄になった。** しかも #1054 は `npm audit fix` を通しているので
`fflate` まで直っており、こちらの「high 未満は触らない」判断より広かった。

**なぜ気づけなかったか**: 「これは自分の PR のせいか」は調べたのに、
**「これは誰かが既に直しているか」を一度も調べなかった。** 切り分けの問いが片側しかなかった。
`mcp__github__list_pull_requests` 一発で #1054（`fix(security)` 系、49コミット）は見えた。
main が赤いという事実は「誰も直していない」ことを意味しないのに、そう読んだ。
**赤の原因を特定した達成感で、次に確かめるべきことを飛ばした**とも言える。

さらに、DECISION_LOG に「別 PR に切り出すか／ブランチ制約をどう扱うか」を9項目かけて書いた。
**その議論はすべて、そもそも自分が書く必要の無かった修正についてのものだった。**
選択肢の列挙（項目6）に「既に誰かが直している」が入っていなかった。

**再発防止**: 仕組み無し（判断に依存）。習慣にすることを1つに絞る。
**自分の差分の外側にある赤を直す前に、必ず開いている PR を一覧する。**
「base でも赤い」＝「自分のせいではない」までは正しいが、そこで止めず
**「では誰の担当か」まで進む**。リポジトリ全体を止めている赤ほど、他の誰か（他のセッションを含む）
が同時に見ている確率が高い。lint やテストで止められる種類の誤りではないので、
OPEN_QUESTIONS「誰も何も変えていないのに CI 全体が赤くなる」に運用の論点として残した。

## M-20260913-ci-test-timeout 手元で 2.5 秒だったテストが、CI で 5 秒のタイムアウトに掛かった（2026-09-13・型 E・旧 M-084）

**Before**: 固定列グリッドの検査を構文木ベースに作り替えたとき、`src` 配下の
**全ファイル（3300超）を TypeScript パーサに通す**実装にした。手元では 2.5 秒で
通ったので、そのまま push した。

**After**: **CI で 5000ms のタイムアウトに掛かって落ちた**（PR #1073）。
手元とランナーで数倍の速度差がある。全テスト 5610 件のうち落ちたのはこの1件で、
**私が同じ PR で足した検査が、私の PR を赤にした。**

**なぜ気づけなかったか**: **「通った」だけを見て「どれだけ掛かったか」を見ていない。**
vitest の出力には Duration が出ていて 2.5 秒と読めていたのに、既定のタイムアウトが
5 秒であることと突き合わせていない。**余裕が2倍しかない時点で、環境差で落ちる。**
しかも直前に「手元の検証は CI と同じ範囲だから」と判断して手元の全体実行を
打ち切っており、そこで気づく最後の機会も自分で捨てていた。

**再発防止（仕組み）**: 構文木に通す前に文字列で足切りする
（`grid-cols-` と `<input` の両方を含むファイルだけ）。必要条件なので取りこぼさない。
3300 → 70 ファイル、本体 707ms。あわせて明示的に 30 秒のタイムアウトを置いた。
足切りを入れた後、**変異3通りが今も赤になることを再確認した**（入力集合を変えたため）。

**再発防止（習慣）**: リポジトリ全体を走査する検査を書いたら、**実測時間と既定の
タイムアウトの比**を見る。2倍を切っていたら、速くするか明示的に余裕を取る。
「手元で通った」は CI で通ることを意味しない（型 E の定義そのもの）。

---

## M-20260913-counted-two-populations 直した数を、2つの違う範囲で数えて混ぜた（2026-09-13・型 F・旧 M-083）

**Before**: #924 の作り直しで「対象55箇所のうち35箇所を修正、20箇所は固定が正解」と
RELEASE_LOG とコミットメッセージに書いた。

**After**: **同じコミットに入れたテストが24箇所を意図的なものとして数えていた。**
35 + 24 = 59 で、55 でも 20 でもない。原因は**2つの違う範囲を混ぜたこと** ——
「55」は私が手で分類した対象範囲（カレンダー4箇所を行単位で除外したもの）、
「24」はテストの走査範囲（ディレクトリ単位でしか除外しない）。どちらも正しい数だが、
**同じ文章の中で別々の母集団を指していた**。正しくはグリッド36箇所・`col-span` 4箇所・
計22ファイル（コマンドで数え直した）。

**なぜ気づけなかったか**: 数えはした。**同じものを数えているか**を確かめなかった。
M-080 の再発防止に「書く前にコマンドを打つ」と書いて実際に打ったが、
打ったコマンドの**範囲が文章の主語と一致しているか**は見ていない。
同じセッションで3度目の件数ミス（M-080 → 派生の「18種別」→ これ）。

**再発防止（仕組み）**: 件数は**成果物から逆算して出す**。この PR では
`git diff main` を数えた。手で作った分類表からではなく、実際の差分から数えれば
範囲がずれない。

**再発防止（習慣）**: 「N箇所のうち M箇所」と書くときは、**N と M が同じコマンドの
出力から出ているか**を確認する。違うなら片方を数え直すか、両方の範囲を明示する。

---

## M-20260913-regex-missed-two-digit-cols 検出器の正規表現が2桁の列数に当たらず、国勢調査が不完全だった（2026-09-13・型 A・旧 M-082）

**Before**: 固定列グリッドを数える検出器を `grid-cols-[2-9]` で書き、
「残っている固定列を1件残らず数えて」と docstring に書いた。

**After**: **`grid-cols-10` / `11` / `12` に当たらない。** 本番のコードに
`grid-cols-12` が2箇所あり（`OnboardingFunnelSection` は子も固定で本当に潰れていた）、
どちらも一度も数に入っていなかった。あわせて ``className={`...`}`` の
テンプレートリテラルも読んでおらず、固定10トラック（計664px）の
`DocumentForm` も見えていなかった。いずれも `/code-review` の指摘。

**なぜ気づけなかったか**: 「列数は1桁」と**確かめずに決めつけた**。自己検査は
2/3/4列しか試しておらず、**範囲の端（2桁）を一度も試していない**。
CLAUDE.md の「境界をアンカーする」は書いたが、**上限側の境界を見ていなかった**。

**再発防止（仕組み）**: 構文木で見る形に作り替えた（列数は数値として読む）。
自己検査に12列とテンプレートリテラルの事例を入れ、変異で赤を確認した。

**再発防止（習慣）**: 文字クラスで数値の範囲を書いたら、**その範囲の外に実在の値が
無いか grep する**。「1桁で足りるはず」は仮定であって観察ではない。

---

## M-20260913-ineffective-css-claimed-fixed 効かない CSS を「直した」と書いた（2026-09-13・型 A・旧 M-081）

**Before**: `PageBar` のアクション群が横にはみ出す問題に対し、`flex-wrap` を足して
「アクション群の内部が折り返すようにした」と RELEASE_LOG に書いた。

**After**: **効いていない。** その要素は `shrink-0` のままで、`flex-shrink:0` かつ
`flex-basis:auto` の要素は max-content 幅になる。折り返しコンテナの max-content は
「全項目を1行に並べた幅」なので、**wrap は永久に発火しない**。`/code-review` の指摘。
`shrink-0` を外して `min-w-0` を付ける形に直した。

**なぜ気づけなかったか**: **自分で原因を書いておきながら、半分しか消さなかった。**
RELEASE_LOG に「`shrink-0` かつ `flex-wrap` なし」と2つ並べて書いたのに、
足す方（`flex-wrap`）だけやって外す方（`shrink-0`）を残した。
そして**画面で確認していない**。CSS の変更を、描画を見ずに「直した」と書いた。

**再発防止（習慣）**: レイアウトの修正は、**その変更だけで成立するか**を
仕様の言葉で言えるか確かめる（「shrink-0 の要素は縮まないので wrap しない」）。
言えないなら実際に描画して見る。原因を2つ書いたら、2つとも消えたか確認する。

---

## M-20260911-uncounted-24-types 数えずに「24種別」と書き、6箇所に広げた（2026-09-11・型 F・旧 M-080）

**Before**: M-077 を書くとき、`AuditEventType` の種別数を **24** と書いた。
コードのコメント・DECISION_LOG・RELEASE_LOG・MISTAKE_LEDGER・LEDRA_CURRENT・
**公開 PR のコメント**の6箇所に同じ数字を広げた。

**After**: **23 だった。** `CertificateAuditType` が 8、`AuditEventType` の追加分が 15。
2通りの経路で数え直して一致を確認した（許可リストの `Record` のキー数と、
型宣言の文字列リテラル数）。

**なぜ気づけなかったか**: **一度も数えていない。** union を目で見て「だいたい20台後半」と
当たりを付け、それを確定した数字として書いた。しかも**この誤りは M-077 の中で起きている** ——
「母集団を数えなかった」ことを反省する文章の中で、その母集団の数を数えずに書いた。
数字を書いた時点で `grep -c` が打てる場所にいた（型 F の定義そのもの）。

**再発防止（仕組み）**: `Record<AuditEventType, boolean>` のキー数が union の要素数と
一致することは型が保証するので、**数えるなら Record のキーを数える**（1コマンド）。

**再発防止（習慣）**: 「N種別」「N件」「N箇所」と書こうとしたら、**書く前にコマンドを打つ**。
見て数えた数は書かない。特に**自分の反省文の中の数字**は、文章の勢いで通りやすい。

---

## M-20260911-git-grep-missed-untracked 「分類漏れを拾う」検査を `git grep` で書き、未追跡ファイルを取りこぼした（2026-09-11・型 A・旧 M-079）

**Before**: M-076 の再発を止めるため、「`vehicle_histories` に触るファイルを列挙し、
分類の一覧に載っていなければ落とす」検査を書いた。列挙は `git grep -l` で実装した。

**After**: **`git grep` は追跡済みのファイルしか見ない。** 変異テストで未分類の新しい
ルート（`src/app/api/customer/tmpprobe/route.ts`）を置いたのに、検査は緑のままだった。
`readdirSync` でファイルを歩く方式に変えたら赤になった。

**なぜ気づけなかったか**: `git grep` を「ファイルを探す道具」として選んだが、実際は
「**git が知っているファイルを探す道具**」だった。差が出る条件（未追跡・gitignore）を
一度も考えていない。なお、この誤りは**自分の変異テストが見つけた** —— 型 A の既存対策
「検出器を書いたら、それが拾うべき1件で当たりを取る」は実施していて、効いている。

**再発防止（仕組み）**: 検出器そのものに変異テストを掛ける（実施済み。4通り全てが赤）。

**再発防止（習慣）**: 「そのファイルが対象か」を判定する道具を選ぶとき、**judgment の
条件（追跡状態・拡張子・除外設定）が、守りたい性質と関係あるか**を一度言葉にする。
git の管理下にあるかどうかは、「その経路が外に出るか」と何の関係もない。

---

## M-20260911-git-checkout-destroyed-work 変異テストの後始末で `git checkout --` を打ち、未ステージの実装を3ファイル消した（2026-09-11・型 A・旧 M-078）

**Before**: 検査が本当に赤くなるかを確かめるため、`sed` でコードを壊して実行し、
`git checkout -- <file>` で戻す、を繰り返していた。「壊す・戻す」の対に見えた。

**After**: **戻すのではなく、消していた。** その時点の編集は未ステージだったので、
`git checkout -- <file>` は変異ごと**自分の実装を捨てた**。3ファイル（許可リスト本体と
読み手2つ）が commit 前の状態に戻り、以降の変異結果が壊れた。

**なぜ気づけなかったか**: 変異ごとに落ちるテストが 1→2→3 と増えていったのを、
**「検出器が強い」という良い知らせとして受け取りかけた**。変異1つに対して落ちる数が
増える理由を説明できていないのに、先に進もうとした。説明を試みて初めて、自分が
ファイルを壊していたとわかった。同一セッション内で2回目（1回目は
`serverActionGuards.test.ts`）で、1回目に仕組みを作らなかったのが効いている。

**再発防止（仕組み）**: **変異テストの前にコミットする。** コミット済みなら
`git checkout --` は本当に「戻す」操作になる。今回そうしてから再実行した。

**再発防止（習慣）**: 変異の結果が**予想と違う数**だったら、説明できるまで進まない。
「多めに落ちた」は安全側に見えるが、検査の強さではなく環境の破壊でも同じ形になる。

---

## M-20260911-denylist-default-public 「見せないもの」を並べて塞ぎ、種別の母集団を数えなかった（2026-09-11・型 L・旧 M-077）

**Before**: M-076 を直すとき、uid / IP が本文に入る**5種別**を除外リストにして、
読む側2経路に掛けた。5種別は本番の実データから選んでいて、実際に IP / uid を
含む行の型と一致していた。数えた上で選んだので、正しいと思った。
`certificateLog.ts` に「**監査種別が増えても漏れない**」とコメントまで書いた。

**After**: 増えたら漏れる。`AuditEventType` は**23種別**あり、除外は5つだけ。
**既定が公開**だった。3つの形で実際に破れる。

1. `member_added` の description にはメールアドレスが入る（本番に1件実在）
2. `logAuditEvent({ type: "note", vehicleId })` はパスポート移転で
   「移転先: <メールアドレス>」を書く。呼び出し4箇所**すべてが `vehicleId` を渡す**ので、
   移転を1回使えば公開ページに出る（本番の移転は0件＝未発火だっただけ）
3. `aiAuditLog.ts` は `type: event.action` と**動的に**書くので、union にすら無い
   `ai_auto_action_executed` が DB に入っている。**除外リストは知らない種別を
   原理的に覆えない**

許可リストに反転し、`Record<AuditEventType, boolean>` で分類を強制した。

**なぜ気づけなかったか**: **母集団を数えなかった。** 「漏れている5種別」は本番の
実データから正しく数えたので、**数えた気になっていた**。数えるべきだったのは
「今この列に入っている値」ではなく「**この列に入りうる値は何種類か**」。
実測は「今あるもの」しか映さない。その上で「監査種別が増えても漏れない」と、
確かめずにコメントに書いた（型 A の「動作を主張するコメントを根拠を確認せずに書く」）。

**再発防止（仕組み）**: `Record<AuditEventType, boolean>` により、union に種別を足すと
**その場で型エラー**になる。分類を書くまでコンパイルが通らない＝既定で公開されない。

**再発防止（習慣）**: 「除外リスト」を書こうとしたら、**その列に入りうる値の総数を数える**。
除外の数 < 総数 なら既定が開いている。外向けの経路では許可リストにする。
動的に書かれる列（`type: event.action`）があるなら、総数は型からも決まらない
＝許可リスト以外に閉じる手が無い。

---

## M-20260911-missed-second-caller 漏れを塞いだつもりで、同じ関数を読む2つ目の経路を見なかった（2026-09-11・旧 M-076）

**Before**: PR #1040 で「公開証明書ページに訪問者の IP と担当者の uid が出る」漏れを塞いだ。
`certificates/publicData.ts` の公開クエリに型フィルタを入れ、回帰テスト11件を付け、
修正前のコードで全部落ちることも確認した。**塞いだと思っていた。**

**After**: **同じ漏れが顧客ポータルに残っていた。**
`customerPortalServer.ts` の `listHistoryForCustomer` は service-role で
`vehicle_histories` を型で絞らず引き、`/api/customer/list` が画面に描画し、
`/api/customer/data-export` が書き出しに入れる。

本番で測ると **14 行**（IP 6 / uid 8）、9証明書・4テナント分が、ログイン済み顧客から
自分の証明書の履歴として見えていた。**他の訪問者の IP** と**店舗スタッフの uid** である。

**なぜ気づけなかったか**: **書く側を1つ直して、読む側を数えなかった。**
`logCertificateAction` が危ない description を作る、という理解は正しかった。
だがそこから先を「公開ページ」だけ辿った。`vehicle_histories` は**車両の履歴と
監査ログが同居**しているので、**車両履歴を見せる経路はすべて読む側**である。
`grep 'from("vehicle_histories")'` を1回打てば 18 箇所出る。打っていない。

CLAUDE.md の「バグ修正は根本原因であって症状ではない。**触った関数の呼び出し元を
全部 grep しろ**」に、そのまま書いてある。**書いてあるものを読まずにやった**
（M-033 の「`ponytail:` コメントに書いてあったのに読まなかった」と同じ形）。

型 C（経路を1本しか見ない）。この型の再発防止は
「ガードを1本入れたら、その操作を起こす画面に他の入口が無いか見る」だが、
**今回は「操作の入口」ではなく「データの読み手」だった**ので、頭の中で当てはまらなかった。
**入口と出口の両方**を数える必要がある。

**再発防止**:
- 仕組みあり。`src/lib/audit/__tests__/privateAuditTypes.test.ts` を追加した。
  **テナント外へ出す読み手を名指しで列挙**し、各ファイルの
  `.from("vehicle_histories")` の鎖に除外フィルタが掛かっているかを構文木で見る。
  検出器が空振りしていないことも同じファイルで確かめている。
  3通りの変異（読み手ごとにフィルタを外す・除外する型を1つ減らす）で赤を確認済み
- 除外する型の定義を**書く側**（`audit/certificateLog.ts`）へ移した。
  配列が2箇所にあると、種別が増えたとき片方だけ直る —— 今回の漏れがその形
- 習慣を1つ。**「この値は誰が書き、誰が読むか」を両方数えてから直す。**
  書く側が1つでも、読む側が1つとは限らない

---

## M-20260910-check-covered-28-percent 新しく入れた検査が、対象の 28% しか見ていなかった（2026-09-10・型 A・旧 M-075）

**Before**: plpgsql の本体検査（`plpgsql_check`）を `scripts/replay-migrations.mjs` に
常設した。トリガ関数は `relid` を渡さないと検査できないので、
`(select t.tgrelid from pg_trigger t where t.tgfoid = p.oid limit 1)` と書いて
**その関数を使っているトリガから1つ取って**渡した。陽性・陰性の対照を対で置き、
対照が通ってから本走査に進む作りにして、「plpgsql の検査: 該当なし」を確認した。
事業ログには「**トリガ関数は関数なので plpgsql 検査に含まれる**」「検査できないのは
どのトリガからも使われていない2本だけ」と書いた。

**After**: `/code-review` の指摘で、`limit 1` が対象の大半を落としていた。
(トリガ関数, テーブル) の組は再生 DB に **129 組**あり、関数の実数は 36。
`limit 1` では **36 組しか検査されず、93 組（72%）が未検査**だった。
`set_updated_at` は **88 テーブル**に付いているのに1テーブルしか見ていない。

**この穴が実在の不具合を隠していた。** 全組に広げると1件出る ——
`set_updated_at @ vehicle_histories -> error:42703: record "new" has no field "updated_at"`。
`vehicle_histories.updated_at` は**本番にはあるが再生 DB には無い**（列レベルのドリフト）。
`20260907010100` で本番から書き起こした `trg_vehicle_histories_set_updated_at` が、
列の無い再生 DB では UPDATE のたびに落ちる。**本番は無事**（列があることを実測確認）。

**なぜ気づけなかったか**: 対照を「検査が動いているか」までしか設計していなかった。
陽性・陰性の対照はどちらも**非トリガ関数**で、`relid` を渡す経路を一度も通っていない。
**対照が通ることは、対照が通る経路が正しいことしか言わない。** さらに
「同じ関数でも相手のテーブルが違えば `NEW`/`OLD` の列が違う」という、この検査が
成立する前提そのものを言葉にしていなかった。言葉にしていれば `limit 1` は書けない。
これは MISTAKE_LEDGER 冒頭の「判断の道具そのものを検証する」に真正面から当たる ——
**「該当なし」を、検査が何件を見たか数えずに受け取った。**

**再発防止**: `limit 1` をやめ、トリガの**全テーブル**に対して回す。出力にも
`関数名 @ テーブル名` を出すようにして、どの組で落ちたかが読めるようにした。
仕組みで止まらない側は習慣にする —— **検査を足したら「対象は何件か」を数えて、
その数が母集団と合うか確かめる。** 「該当なし」は件数を伴わないと情報がない。

## M-20260908-part-fixed-read-as-feature 部品が直ったことを、機能が直ったことと書いた（2026-09-08・型 B・旧 M-074）

> 採番の注記: 起票時は M-064 としていたが、並行 PR が先に M-064 を使ってマージされた
> ため M-074 に振り直した（採番衝突は OPEN_QUESTIONS の既存項目）。出来事の日付は
> 2026-09-08 のまま。

**Before**: `is_pii_disclosed()` を本番で直し（#1016）、適用後に
`select is_pii_disclosed(...)` が `false` を返すことを実測した。そのうえで
`LEDRA_CURRENT.md` に「**保険会社ポータルの PII 開示判定が本番で動く**」と書いた。
検証したのは**自分が変更した関数1本**で、その関数を使う機能
（保険会社ポータルの証明書詳細＝`insurer_get_certificate`）は一度も動かしていない。

**After**: 直後に開いた未解決事項の調査で、`insurer_get_certificate` が
**別の理由で壊れたまま**であることが分かった。`RETURNS TABLE` の出力列 `tenant_id` と
`insurer_tenant_access.tenant_id` が同名で、アクセス確認の `IF` に入った時点で
42702（column reference is ambiguous）。`is_pii_disclosed` を**呼ぶ手前で死ぬ**ので、
証明書詳細は一度も成功していなかった。**部品は直ったが、機能は直っていなかった。**

手元にあった証拠が最初から矛盾を示していた —— `insurer_access_logs` の
`action='view'` は本番で**0件**。この行は `is_pii_disclosed` を呼んだ**後**に
INSERT されるので、「関数さえ直れば動く」が本当なら過去に成功した記録が
1件くらいあってよい。0件は「そもそも一度も通っていない」を意味する。

**なぜ気づけなかったか**: **「直した関数が値を返す」を「機能が動く」と読み替えた。**
関数が壊れていたという事実が強すぎて、それが**唯一の**原因だと決めつけた。
1つ見つかった原因を、原因の全部だと扱っている。
`insurer_get_certificate` は #1016 の DECISION_LOG で「呼び出し元」として名前を
書いていたのに、**その定義を一度も読んでいなかった**（型 B そのもの: 名前と役割から
中身を推測して分類した）。読めば出力列と同名の参照は目に入る。

**再発防止**: 仕組みで止める。plpgsql の本体は `CREATE` 時に構文しか検証されないので、
この種の不具合は静的検査から丸ごと漏れていた。`scripts/replay-migrations.mjs` に
**plpgsql_check** による本体検査を足し、`agent_rankings`（`date >= text`）と
この2件を実際に検出させた（陽性・陰性の対照つき。CI では
`REQUIRE_PLPGSQL_CHECK=1` で、拡張が入らなかったときに黙って飛ばさせない）。
仕組みで止まらない側は習慣にする —— **「直した」と書く前に、直した部品ではなく
利用者が触る入口を1回通す。** 通せないなら「部品を直した」までしか書かない。

## M-20260910-estimated-what-grep-answers grep 1回で決まることを【推定・未検証】で出した（2026-09-10・型 F・旧 M-073）

**Before**: ポリシー層のドリフトを起票したとき、こう書いた。

> 公開証明書ページはこの経路で読んでいると思われる【推定・未検証】。

印は正直に付けた。だが**この環境にコードがあり、grep 1回で決着した**。
§4「事実の主張がこの環境で確認可能なとき、そこで確認せよ」に真正面から反する。

**After**: レビュー指摘を受けて実際に見たら、**推測は誤り**だった。

- `/c/[public_id]` は `src/lib/certificates/publicData.ts` が
  `createServiceRoleAdmin()` で読む ＝ **RLS を迂回**する。anon ポリシーに依存しない
- 実際に依存するのは **PDF ルート** `src/app/api/certificate/pdf/route.ts`。
  anon キーで `certificates_public`（`security_invoker=on`）を叩くので、
  再生 DB では anon が 0 行 → **PDF が 404**

ドリフトの存在自体は正しかったが、**困る画面が違った**。しかも起票文には
「まず◯◯を確かめるのが先」と書いており、**自分で「次の一手は grep」と分かっていながら、
それをせずに未決として出した**。

**なぜ気づけなかったか**: 【推定】の印を、**確認しない免罪符として使った**。
印は「確認できないとき」に付けるもので、「確認が面倒なとき」に付けるものではない。
作業の終盤で、本筋（plan_tier の check）が片付いた安心感から、
副産物の起票を「まとめ」の作業として扱い、調査の手を止めていた。

**再発防止**: 仕組み無し（判断に依存）。習慣を1つ。

- **【推定】を書こうとしたら、その場で「これを確実にするには何が要るか」を一言で言う。**
  答えが「この環境でのコマンド1回」なら、印を付けずに実行する。
  印を付けてよいのは、答えが「外部への問い合わせ」「本人にしか分からない文脈」
  「未来の出来事」のときだけ（§8 の3条件と同じ線）。

---

## M-20260908-asked-production-not-replay 「どのポリシーが邪魔しているか」を本番に聞いた。答えは再生 DB にあった（2026-09-08・型 C・旧 M-072）

**Before**: 列の型を enum へ変える版で `alter column ... type` が
`cannot alter type of a column used in a policy definition` で落ちた。
邪魔しているポリシーを特定しようと **本番の `pg_policies`** を引き、
5 本（certificates 2 / templates 1 / tenant_memberships 2）を見つけて、
その 5 本を畳んで作り直すコードを書いた。**同じエラーでまた落ちた。**

**After**: 落ちているのは**再生 DB**であって本番ではない。両者はポリシーの
顔ぶれが違う。実際に再生 DB へ流して初めて原因が出た。

```
DETAIL:  policy vehicle_size_master_admin_all on table vehicle_size_master
         depends on column "role"
```

`pg_depend` で洗い直すと、`tenant_memberships.role` に依存するポリシーは
**7 テーブル・10 本**（admin_audit_logs / academy_lessons ×4 /
academy_quiz_questions ×2 / academy_creator_rewards / vehicle_size_master /
tenant_memberships ×2）。**別テーブルのポリシーが subquery でこの列を読んでいた。**

さらに悪いことに、本番で見つけた 5 本を「再作成」するコードは、
**再生 DB には存在しないポリシーを新たに作る**ものだった。うち 2 本は
`certificates` に対する **anon の SELECT**。気づかずに出していたら、
再生 DB の公開範囲を勝手に広げていた。

**なぜ気づけなかったか**: 問いは「**この DB で**何が ALTER を塞ぐか」なのに、
別の DB（本番）に聞いた。**エラーが出た場所と、原因を探した場所が違う。**
本番と再生 DB が「同じはず」という前提で動いていたが、その前提を検証するのが
この一連の作業の目的そのものだった。前提を疑うために始めた作業の途中で、
同じ前提を使ってしまった。

加えて、**「参照している」を「その表の上のポリシー」だけで探した**。
ポリシーは他表から subquery で列を読める。M-061（アプリだけ見て「未使用」と読んだ）と
同じ形で、経路を 1 本しか見ていない。

**再発防止**: 仕組み有り。**エラーが出た DB に対して `pg_depend` を引く。**
名前や式の文字列検索ではなく依存関係そのものを引けば、他表からの参照も
一度に出る（今回は 10 本が 1 クエリで出た）。

```sql
select pol.polname, pc.relname
from pg_depend d
join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
join pg_class pc on pc.oid = pol.polrelid
where d.refobjid = 'public.<表>'::regclass and d.refobjsubid = <列の attnum>;
```

習慣も 1 つ: **失敗を再現した環境と、原因を調べる環境を一致させる。**
違う環境に聞くなら、「なぜそこで代用できるのか」を先に言えるか確かめる。

---

## M-20260909-contradicted-own-log マージ完了を記録した直後、同じファイルの少し下に既にあった「完了済み」の記述と矛盾する「未着手」を書いた（2026-09-09・型 F・旧 M-071）

（この台帳の連番IDが並行PRで衝突する既知の問題により、本来M-070として
書いたエントリをM-071へ改番。同じ日付にPR #1055が別の事案でM-070を
先にmainへマージしたため。OPEN_QUESTIONS.md「MISTAKE_LEDGERの連番IDが、
並行PRのたびに衝突する」参照）

**Before**: PR #1054 がマージされたと分かり、`docs/context/LEDRA_CURRENT.md`
に「追記(7)」として状況を書いた。その際「次: PR-2（課金・予約・cronの
整合性、未着手）〜PR-5（重複圧縮、未着手）」と書いた。この判断は、直近の
自分のセッション内の記憶だけを根拠にしていた。実際には round 1/round 2の
Codexレビュー対応はPR-1相当の内容だけではなく、Stripe webhook・予約・
AIコストガード等PR-2相当の領域や、モバイルのサインアウト・レジ・push
トークン・ディープリンク等PR-3相当の領域にも及んでいた（PR #1054自体が
既にPR-1〜PR-5全段階を含んだ状態だったため）。にもかかわらず「このセッション
で扱ったのはPR-1相当の指摘対応だけ」という誤った要約に丸め、**その要約と
矛盾する、自分が今まさに編集しているそのファイルの、わずか20行下にある
「追記(2)〜(4)」（2026-09-08付、PR-3〜PR-5は完了済みと明記）を読み返さなかった。**

**After**: 書いた直後に読み返して矛盾に気づいた。実際にコードを
`grep`/`find`で確認したところ、`src/lib/stripe/subscription.ts`の
`getCurrentPeriodEnd`（PR-2）、`register.tsx`のD-A1是正コメント（PR-3）、
`src/app/c/layout.tsx`のnoindex（PR-4）、`src/lib/api/withCaller.ts`
（PR-5）が全て main に実在しており、PR-1〜PR-5は本当に全て完了・
マージ済みだった。「未着手」という自分の記述こそが誤りだった。
追記(8)として訂正した。この訂正自体にも別の誤り（gitleaks CIをPR-5と
誤記。正しくはPR-4／RELEASE_LOGの既存PR-4エントリに記載済み。round1/2の
「13件全件修正」も誤りで、正しくは12件修正・1件はfounder判断待ちで
意図的に保留）があり、PR #1057へのCodexレビューで指摘され再訂正した。

**なぜ気づけなかったか**: 「このセッションで自分が触った作業」を、実際の
作業範囲（PR-2/PR-3領域にも及んでいた）ではなく**「PR-1相当」という
粗い一言に丸めて要約し、その粗い要約を無検証で事実として扱った。**
さらに、**同じログファイルの他のエントリ（自分より前のセッションが
書いたもの）を読まずに上書き的な要約を書いた。** ログファイルは「新しい順の
追記」形式なので、先頭に書く前に既存の内容（特に直近の数エントリ）に
矛盾しないかを確認するのが本来の手順だが、それを省略した。M-047/M-051
（型I: 前提が途中で変わったのに読み直さない）とも近いが、あちらは
「外部の変化」に気づかなかった話で、こちらは**自分がこれから追記しようと
しているまさにそのファイルの中に、既に答えが書いてあった**という点が違う。
さらに「訂正の訂正」でも同型の誤り（gitleaksの帰属、13件の内訳）を
繰り返したことは、**急いで訂正を書くこと自体が新たな未検証の主張を
生みやすい**という追加の教訓を残した。

**再発防止**: 仕組み無し（判断に依存）。「〜未着手」「〜完了済み」「〜件
全件修正」のような状態・件数を主張する文をログに書く前に、そのファイル内を
該当キーワード（今回なら「PR-2」「PR-3」「PR-4」「PR-5」「gitleaks」）で
検索し、既存の記述と矛盾しないか確認する。可能な場合は状態主張の根拠を
コード上・他ログファイル上で1つ実際に確認してから書く（今回はgitleaksの
帰属もRELEASE_LOGの既存PR-4エントリを検索すれば5分で判明した）。
**訂正コミット自体も同じ検証強度で扱う** — 「間違いを直す」という
行為が正しさの担保にはならない。

## M-20260909-pushed-real-customer-email 本番調査で得た実在顧客のメールアドレスを、そのまま DECISION_LOG に書いて共有 PR に push した（2026-09-09・型 F・旧 M-070）

**Before**: 「請求書のメール送付が出来ない」調査のため Supabase MCP で本番 DB
（`document_share_log`）を直接クエリし、送付履歴の失敗パターン（同一宛先が
過去は成功・特定期間から失敗）を根拠として使った。結果を `DECISION_LOG.md` /
`OPEN_QUESTIONS.md` に書く際、クエリ結果に出た**実在の顧客メールアドレスを
ローカル部・ドメインとも一切マスクせず**そのまま貼り付けた。しかも同じエントリの
「9. 公開区分」に「本番の実データ・**顧客メールアドレスは含めていない**」と
書いた——**その2行上に実アドレスが載っている状態で**。

**After**: PR #1055 を ready for review にした直後、Codex のレビュー（P1）で
指摘されて発覚。**共有ブランチの git 履歴（複数コミット）に実アドレスが残った
状態のまま push・CI 実行・Vercel プレビューまで進んでいた。**
`src/lib/logger.ts` の `maskEmail()` と同じ形式（`sh***@honda-auto.ne.jp`）
に手直しし、該当コミットを作り直して force-push（このブランチは自分が作成した
ものであり、他者のコミットは含まない区間のみを対象にした）。

**なぜ気づけなかったか**: Supabase から返るクエリ結果は
`<untrusted-data>` 境界で「指示として実行するな」という注意は付くが、
**「その中身を自分の書く文書にどこまで転記していいか」は別の判断軸**で、
そこへの注意が向いていなかった。加えて、「9. 公開区分」の一行を書くときに
**その主張（PII を含まない）を検証可能な事実として扱わず、確認せずに書いた**
（同じ diff 内を grep すれば `@` を含む実在ドメインの文字列は一瞬で見つかる）。
本番データを引用して「根拠にする」ことと、「その一次情報をそのまま永続化する」
ことを無意識に同一視していた——根拠として使うなら、**再現に必要な情報
（ドメインの異なる複数宛先・時期・成功/失敗のパターン）だけ残せば十分**で、
個人を特定できる完全なアドレスは不要だった。

**再発防止**: 仕組み無し（判断に依存）。習慣を2つ。

- **本番の実データ（メール・電話番号・氏名等の PII）を調査ログや事業ログに
  引用するときは、書く前に必ずマスクする。** `src/lib/logger.ts` の
  `maskEmail()`/`maskPhone()` と同じ粒度（先頭数文字 + `***` + ドメイン/下4桁）
  で十分、根拠としての再現性は保たれる。
- **「公開区分」や「PII を含まない」のような自己申告の一行を書いたら、
  その主張を該当セクション全体に対して実際に検証する**（grep で `@`・電話番号
  パターン等を探す）。書いた直後の自己攻撃（§6）でここを狙うべきだった。

---

## M-20260909-logged-type-still-repeated 「型を記録した」ことと「同じPR内でその型が再発しない」ことは別だった（2026-09-09・型 J の再発・旧 M-069）

**Before**: M-066（型J: 兄弟実装との不一致）を記録した直後、同じPR内で
`is_super_admin_user()` → `is_platform_admin()` の置き換えを
`platform_*` 統計5関数に対して実施し、「同じ理由でこの predicate を
使っている箇所は無いか」を再度 grep しなかった。

**After**: Codexのround 2レビューで発覚:
`supabase/migrations/20260908132157_rls_hardening_market_news_vsm_insurer_otp.sql`
の `vehicle_size_master_admin_all` ポリシーが、まさにM-066で直した
`is_super_admin_user()` を**別のファイルで**使っていた。M-066で直した
5関数と全く同じ根の不整合（運営テナント外のsuper_adminが書込み可・
運営テナントのowner/adminが書込み不可）が、修正漏れのまま残っていた。

**なぜ気づけなかったか**: M-066で「3件を横並びで比較して直した」ときの
grep（`isPlatformAdmin`、`metadata.tenant_id`、`.eq("status"`）は
**その時点で見つかった3件それぞれの周辺**にしか及ばず、
`is_super_admin_user()` という**置き換えの起点そのもの**を全リポジトリで
grepして「他に使っている箇所が無いか」を確認しなかった。M-066の
教訓（既存実装を横に並べて比較する）は個々の指摘への対処法であって、
「この関数名・このpredicateを使っている全箇所」を横断的に洗う習慣には
まだ育っていなかった。

**再発防止**: 仕組み無し（判断に依存）。M-066で「仕組み無し」と正直に
書いたまま次のセキュリティガードの置き換えに進んだ結果がこれ。今後は
「AをBに置き換える」判断をしたら、**その場で `grep -rn "A("` を
リポジトリ全体に対して実行し、ヒットした全箇所を一覧化してから
1件ずつ判断する**（一部だけ直して終わらない）。この作業自体をチェック
リスト化する（PRの説明に「`grep`結果N件、うちM件を置き換え、残りは
理由」を書く）ことを次回から試す。

## M-20260909-unverified-overwrite-assumption 「次回ログイン時に上書きされるので実害は小さい」と自分で書いたコメントの前提を検証していなかった（2026-09-09・型 A の亜種・旧 M-068）

**Before**: PR-3（D-A10）でpush解除の401無限再帰を止めた際、
「解除に失敗しても、次回ログイン時に upsert (onConflict: user_id,token)
で上書きされるので実害は小さい」というコメントを書いた。この文を書いた
時点で、`upsert` の `onConflict: "user_id,token"` が実際に**前ユーザーの
行を上書きするのか**を確認しなかった。

**After**: Codexのround 2レビューで発覚: `UNIQUE(user_id, token)` の
upsertは「同じ(user_id, token)の組」でしか衝突しない。ユーザーが変われば
`user_id` も変わるため、これは**新しい行を追加するだけ**で前ユーザーの
行は消えない。「次回ログイン時に上書きされる」は成立していなかった。
共有端末で前ユーザー宛の通知が届き続ける実害が残っていた。
service-roleで同一token・別user_idの行をreclaim（削除）してから
upsertするよう修正した。

**なぜ気づけなかったか**: 「upsertで上書きされる」という主張は、
UNIQUE制約のキーが何かを1行確認するだけで検算できたのに、
「たぶんそうだろう」で書いた。M-061/M-062/M-064/M-066と同じ根 —
**コードに書く前提（コメントの主張も含む）を、書いた本人が検証していない**。
コメントは「なぜこれで十分か」を説明する文章であり、その文章自体が
検証の要る主張だという意識が薄かった。

**再発防止**: 仕組み無し（判断に依存）。「Xで十分／Xで上書きされる／
Xは効かない」のように**動作を主張するコメントを書くときは、その主張の
根拠になるスキーマ・型・関数定義を1つ実際に開いて確認してから書く**。
今回のケースなら `UNIQUE(user_id, token)` の制約定義を見るだけで
5秒で判明していた。

## M-20260908-401-handler-infinite-loop 401ハンドラに追加した処理が、401で呼ばれた文脈自体で自分を無限に呼び直した（2026-09-08・型 K・旧 M-067）

**Before**: PR-3（D-A10）で `signOutEverywhere()` に
`unregisterPushNotifications()`（push トークンをサーバから解除する
`mobileApi` 呼び出し）を追加した。追加時に実際に叩いて動作確認したのは
「ユーザーがログアウトボタンを押す」経路のみで、ここではセッションが
まだ有効なので何の問題も無く動く。

**After**: code-review（Codex）の指摘で発覚: `signOutEverywhere()` は
`mobileApi` の 401 グローバルハンドラ（`handleUnauthorized()` →
`bindUnauthorizedHandler()` で結線）からも呼ばれる。この経路では
**セッションが既に破棄された後に呼ばれる**ため、
`unregisterPushNotifications()` 内の `mobileApi` 呼び出しは必ず 401 になり、
`handleUnauthorized()` を再度呼び直す。session リセットもログイン画面への
遷移も一切完了しないまま無限に再帰していた。`mobileApi` に
`skipUnauthorizedHandler` オプションを追加して再帰を切った。

**なぜ気づけなかったか**: 「push解除→signOut」という単体の変更が正しく動くかは
確認したが、**この関数が呼ばれる別の入口**（401ハンドラ自身からの呼び出し）
まで遡って「その入口の前提（セッションが既に破棄済み）でも動くか」を
確認しなかった。単体テストも書いていなかったため、機械的な検出手段も無く
実機動作確認だけに依存していた（表面化するのは実際にセッションが失効する
本番トラフィックでのみ）。

**再発防止**: 仕組み — `signOutRecursion.check.ts`
（ソース走査で `skipUnauthorizedHandler` の配線を固定）を追加した。
ただし今回のような**新しい呼び出し経路を追加するたびに、その関数の
既存の呼ばれ方を全部洗い出し、最も制約が厳しい呼ばれ方（今回は
「セッション破棄後」）でも壊れないかを確認する**という習慣そのものは
仕組み化できていない（判断に依存）。共有関数に新しい副作用を追加する
ときは grep で呼び出し元を全部洗い、それぞれの呼び出し時点の前提
（認証済みか、セッションが有効か等）を書き出してから実装する。

## M-20260908-sibling-guard-condition-lost セキュリティ上のガードを複数箇所に追加する際、既存の兄弟実装が持っていた条件を新しい実装にそのまま持ち込まなかった（2026-09-08・型 J・旧 M-066）

**Before**: 3つの独立した箇所で、それぞれ「同じ理由のガードを別の場所にも
足す」という作業をしたが、いずれも**既存の兄弟実装（同じ理由で既に
ガードされている隣の関数・隣のポリシー）と横並びで見比べずに**書いた。

1. `src/app/api/mobile/pos/checkout/qr-status/route.ts`（D-A6 是正,
   2026-09-08）: `tenant_id` の**取得元**をクエリパラメータから
   `caller.tenantId` に固定したが、**取得後にStripeから返るセッション
   自体の所有者**を検証していなかった。同じ日に直した
   `src/lib/pos/terminalCapture.ts`（D-A5 是正、PaymentIntent の
   `metadata.tenant_id` 突合）が、まさに「共有アカウント経由で他テナントの
   セッション/PaymentIntentを読める」問題への正しい直し方の実例として
   隣にあったのに、見比えなかった。
2. `supabase/migrations/20260908140748_platform_stats_allow_service_role.sql`
   （platform_* 統計5関数のガード追加）: `is_super_admin_user()` を
   そのまま転用したが、これはアプリ層の `isPlatformAdmin()`
   （`PLATFORM_TENANT_ID` 所属 + owner/admin/super_admin）とは
   別の判定（tenant_id を見ない、super_admin のみ）だった。
3. `src/app/api/stripe/webhook/route.ts` の `handleShopOrderSessionPaid`
   （E2-2/E2-3 是正）: 同じファイル内の姉妹関数
   `handleVehicleReportSessionPaid` が既に `.eq("status", "pending")` で
   「支払い待ち状態からの遷移だけを許可する」ガードを持っていたのに、
   コピー元として見ていなかったため、shop_orders 側にはこのガードを
   持ち込まなかった。

**After**: いずれも `/code-review`（Codex）の指摘で発覚。全て、
「もう一つの場所」が既に正しい形を持っていた（または正しい形の判定関数が
既に存在していた）のに、そこと揃えるチェックをしなかったために生まれた
過小/過大権限だった。3件とも、既存の正しい実装に揃える形で修正した
（qr-status は metadata.tenant_id 突合、platform統計は新設
`is_platform_admin()`、shop_orders は `.in()` でのステータス絞り込み）。

**なぜ気づけなかったか**: 「同じ理由でガードを足す」ことに意識が向き、
**既にある似た実装を実際に横に並べて条件式を1行ずつ比較する**ことを
省略した。「たぶん同じ形で書けているはず」という自己検証だけで済ませた
（M-061/M-062/M-064 と同じ根 — 判断を決める調査と、実際に書く操作を
別の検証強度で扱ってしまう）。

**再発防止**: 仕組み無し（判断に依存）。ガードを追加するときは、
「この理由で同種のガードを持つ既存実装が他にあるか」を先に grep し、
見つかったら**両方の条件式を並べて diff する**ことを習慣にする。
今回の3件はいずれも grep 一発（`isPlatformAdmin`、`metadata.tenant_id`、
`.eq("status"`）で見つかる距離にあった。

## M-20260908-scan-script-two-errors F-4（未接続モジュール調査）で、自作の走査スクリプトを2種類の誤りに気づかず信用しかけた（2026-09-08・型 A・旧 M-065）

**Before**: F-4「importer 0 の src/lib モジュール25本」の実在確認のため、
プランに例示された10本を `grep -rl "from [\"']@/lib/$mod[\"']" src ...`
で個別に検証し、全10本 importer 0 を確認した。続けて全量把握のため
Python スクリプトで `src/lib` 配下の全ファイルを対象に同様の走査を広域に
実行し、114本が「importer 0」という結果を得た。この数字を
そのまま OPEN_QUESTIONS に書こうとした。

**After**: 書く前に、114本の中身を1件だけ実際に読んで検算した
（`src/lib/envValidation.ts`）。ドキュメントコメントに「Next.js
instrumentation から呼ばれる」と明記されていたのに、自分の検出器は
importer 0 と判定していた。原因はプロジェクトルートの
`instrumentation.ts`（`src/` の外）からの動的 `import()` — 検出器の
走査範囲が `src/` だけで、ルート直下の起動フックファイルを見ていなかった。
走査範囲を「node_modules を除く全体」に広げて再走査したところ、今度は
`auth/stepUp` が新たに importer 6 に化けた。これも中身を読むと、実体は
無関係な `auth/stepUpGuard` への import で、`@/lib/auth/stepUp` という
非アンカーの文字列一致が `stepUpGuard` の途中にもマッチしていた
（CLAUDE.md 常設指示書が名指しする「role 名の部分文字列」と同型の罠に、
自分で作った検出器で実際にはまった）。114 という数字は採用せず、
「広域スキャンの生数字は信用しない。境界をアンカーし、ルート直下の
起動フックまで含めた検出器で作り直すべき」と OPEN_QUESTIONS に明記した。

**なぜ気づけなかったか**: 最初の10本の個別検証（`from ["']...["']` で
クォート境界をアンカーしていた）は正しい書き方をしていたのに、
「全量を広く見る」段階でスクリプトを書き直した際に、同じ厳密さ
（クォート境界のアンカー・走査範囲の網羅性）を引き継がなかった。
件数が大きいほど「集計スクリプトが動いた」こと自体を答えの根拠にしたく
なるが、件数の大きさは正しさの証拠にならない。M-064 と同じ根:
**調査の初手で払った注意を、規模を広げる段階で払わなくなる**。

**再発防止**: 仕組み無し（判断に依存）。習慣として、集計スクリプトの
出力を書く前に必ず最低1件を人力で開いて理由を確認する
（「なぜこのファイルは0件なのか」を1つだけ声に出せるか）。件数が
前回の走査や記載値から大きくずれた（今回: 25本の想定 → 114本）とき、
その乖離自体を「検出器が変わった」ことの警報として扱い、原因を先に
特定してから数字を使う。

## M-20260908-bulk-replace-without-context 複数ファイルへの機械的な文字列置換を、ファイルごとの周辺文脈を見ずに実行した（2026-09-08・型 A・旧 M-064）

**Before**: F-7（重複圧縮）で、6ファイルに散らばる `9 * 60 * 60 * 1000`
（JST オフセットのマジックナンバー）を `src/lib/datetime.ts` の新規 export
`JST_OFFSET_MS` に統一するため、Python スクリプトで「import が無ければ
最後の import 行の直後に挿入 → リテラルを `JST_OFFSET_MS` に置換」を
6ファイル一括で実行した。6ファイルとも同じ形（単純な単一行 import の並び、
ローカル変数名の衝突なし）だろうという想定で、スクリプトの実行が
エラー無く終わったことを「6ファイルとも正しく直った」の根拠にした。

**After**: 実行直後に diff を1ファイルずつ確認したところ、2件の破壊を発見した。
1. `src/app/api/cron/gcal-sync/window.ts` は**既に同名のローカル変数**
   `const JST_OFFSET_MS = 9 * 60 * 60 * 1000;` を持っていた。リテラル部分
   だけを置換したため `const JST_OFFSET_MS = JST_OFFSET_MS;` という
   自己参照の const 宣言になった（TDZ で実行時に確実に例外）。
2. `src/app/api/admin/platform/shop-orders/export/route.ts` は「最後の
   import 行の直後」が**複数行にまたがる import 文の途中**
   （`import {` の次の行）だったため、挿入した1行がその import 文を
   構文エラーに割ってしまった。
どちらも `npx tsc --noEmit` を通すことで機械的に検出でき、実際そこで
発見して直した（tsc を都度実行する習慣自体は機能した）。ただし
「気づけたのは検証を怠らなかったから」であって、「間違えなかったから」
ではない。

**なぜ気づけなかったか**: 6ファイルを「同じパターンの繰り返し」とみなし、
一括処理の対象として扱った。実際には各ファイルの import 文の形（単一行か
複数行か）も、既存のローカル変数名も、ファイルごとに違っていた。
grep で対象箇所を洗い出す段階では6ファイルそれぞれの周辺コードを見ていたのに、
置換を実行する段階では「洗い出した箇所のリスト」だけを見て、
個々のファイルの構造を再確認しなかった。M-061/M-062 と同じ根:
**変更対象を決める調査と、実際に変更を適用する操作を、別の検証強度で
扱ってしまう**。

**再発防止**: 仕組み — `npx tsc --noEmit` を機械的な変更の直後に必ず走らせる
（今回はこれで実際に2件とも検出できた。ただし tsc は「文法・型として妥当か」
までしか見ない。今回のような自己参照 const は TS が構文的に許してしまうため
`ReferenceError` は実行時にしか出ない。**tsc が緑でも、機械的な複数ファイル
編集は1ファイルずつ diff を目視するまで「完了」とみなさない**という習慣を
明文化する。3ファイル以上への同一パターン置換をするときは、置換前に
各ファイルの該当箇所を grep -A/-B で個別に確認してから実行する。

## M-20260908-mixed-axes-in-fix 「存在しない値との比較」を直したら、直した先で別軸を混同した（2026-09-08・型 B・旧 M-063）

**Before**: D-B1 是正で、ホーム画面の「確認待ち」集計が `reservations.status`
に存在しない値 `"awaiting_confirmation"` と比較していたバグを直した。
正しい列 `signoff_status`（`not_requested`/`awaiting`/`signed`）を使うよう
`awaitingConfirmation = todayData.filter((r) => r.signoff_status ===
"awaiting").length` に直し、そのまま「未完了」の計算式
`notStarted = todayTotal - todayCompleted - inProgressCount -
awaitingConfirmation` の `awaitingConfirmation` も新しい正しい値に差し替えた
（旧コードがこの4項目で引き算していた形をそのまま維持した）。テスト
（homeStatusVocab.check.ts）は「存在しない値と比較していないか」
「signoff_status を見ているか」だけを確認し、通した。

**After**: `/code-review` の指摘で発覚: `status` と `signoff_status` は
**独立した別軸**で、`status='completed'` かつ `signoff_status='awaiting'`
（施工完了・お客様サイン待ち）は `src/lib/signoff/state.ts` に明記された
普通に起こる組み合わせ。この予約は `todayCompleted` にも
`awaitingConfirmation` にも同時にカウントされ、`notStarted` の引き算で
**二重に差し引かれ**、「未完了」ピルが過小に出る新しいバグになっていた。
`notStarted` を `todayTotal - todayCompleted - inProgressCount`
（status 単独の3分割）に直し、`awaitingConfirmation` は独立した別ピルに
留めた。

**なぜ気づけなかったか**: 「壊れていた値を正しい値に差し替える」ことに
意識が向き、**その値が使われている計算式全体の前提**（4項目が互いに
排他的であること）を検証し直さなかった。旧コードの `notStarted` の式は
「4つの状態がバケツのように排他的に分割される」という前提で書かれていたが、
その前提は元々 `status` という**単一の列**の値だけを見ている限りでしか
成り立たない。`awaitingConfirmation` の出所を `status` から `signoff_status`
という**別の列**（別の軸）に差し替えた時点で、その前提はもう成り立たない。
「同じ変数名に代入する値の出所を変える」ことは、その変数を使う周りの式の
意味も変えてしまいうる。差し替えた値そのものは正しくても、**それを使う式が
新しい値の性質（他の項目と排他的かどうか）を前提にできているか**を
別途確認しなかった。

**再発防止（仕組み）**: 仕組み無し（判断に依存）。加えたテストも
「新しい値そのもの」しか見ておらず、「新しい値を使う式全体の算術」までは
検証していなかった（テストを書いた後に別の指摘で発覚した点も同型）。

**再発防止（習慣）**:
- **既存の変数の「出所」を変えるとき（別の列・別の関数に差し替える等）は、
  その変数を使っている全ての式を洗い出し、各式が旧い出所の性質
  （排他性・値域・NULL の有無等）を暗黙に前提にしていないか個別に確認する。**
  値そのものの正しさと、それを消費する式の正しさは別の主張であり、
  片方を直しても他方が自動的に正しくなるわけではない。
- テストを書くときは「新しい値が正しく算出されるか」だけでなく、
  「新しい値を使う下流の計算が壊れていないか」も対象に含める。

---

## M-20260908-tested-only-touched-dir セキュリティ修正の直後、変更に直接関係するディレクトリだけ test を回して次に進んだ（2026-09-08・型 A・旧 M-062）

**Before**: B-M1（レート制限の `auth`/`sensitive` プリセットを常時フェイルクローズに
する）を実装した後、`npx vitest run src/lib/api src/app/api/signup src/app/api/join`
のように**変更したファイルに近いディレクトリだけ**回してグリーンを確認し、
次の項目（G-M8）に進んだ。「レート制限の内部実装を直しただけで、呼び出し側の
インターフェースは変えていないから、離れた場所のテストには影響しない」という
想定だった。

**After**: PR-2 全体が終わった時点で `npx vitest run`（全件）を回したところ、
`src/app/api/customer/data-export/__tests__/route.test.ts` の5件が 503 で落ちた。
このルートは `checkRateLimit(req, "sensitive")` を呼んでおり、テストは
`@/lib/api/rateLimit` をモックしていなかった（Redis 未設定でフェイルオープン
＝素通りする、という**テスト環境の暗黙の前提**に乗っていた）。B-M1 の変更は
「呼び出し側のインターフェースを変えていない」という点では正しかったが、
**「Redis 未設定時の既定の挙動」という、モックしていない全呼び出し元が
暗黙に依存していたグローバルな前提**を変えていた。この種の変更の影響範囲は
import グラフでは追えない（何もモックしていないテストほど、この暗黙の前提に
一番強く依存している）。

**なぜ気づけなかったか**: 「関係するディレクトリ」を import 関係やファイルの
物理的な近さで判断していた。実際に影響を受けたのは、`checkRateLimit` を
モックせずに実行時のグローバルな既定挙動（Redis 未設定 = フェイルオープン）に
乗っていた**離れた場所の**テストで、ディレクトリの近さとは無関係だった。
「呼び出し側のインターフェースを変えていない」を「呼び出し側への影響が無い」に
すり替えていた。

**再発防止（仕組み）**: 仕組み無し（判断に依存）。ただしこのリポジトリには
「PR作成前に必ず全件 test を回す」運用がコミット単位で存在しない
（`git commit` 前フックは変更ファイルのみ lint する設計）。

**再発防止（習慣）**:
- **グローバルな既定値・フォールバック挙動（レート制限・タイムアウト・
  フィーチャーフラグの既定 ON/OFF 等）を変えたときは、変更したファイルの
  近さに関わらず、その回の作業を `git push` する前に必ず全件 test を
  1回は回す。** ディレクトリ単位の実行は「その項目の実装が意図通りか」の
  確認には十分だが、「他の項目を壊していないか」の確認にはならない。
- 「呼び出し側のシグネチャ・戻り値の型を変えていない」は「呼び出し側への
  影響が無い」の証明にならない。副作用（Redis 到達性・env 変数・グローバル
  な既定挙動）を変えた場合は別途影響範囲を疑う。

---

## M-20260908-x-forwarded-for-unverified Cloudflare の `x-forwarded-for` の扱いを検証せず「上書きされるはず」で優先順位を書いた（2026-09-08・型 A・旧 M-061）

**Before**: B-H2（PR-1）で `getClientIp()` のヘッダ優先順位を書いた際、
本番が Vercel 直配信（Cloudflare 非経由）であることは `docs/dpa-template.md`
で確認済みだった。そのうえで「`TRUST_CF_HEADERS=1` を明示設定した環境
（Cloudflare 前段構成）でのみ `cf-connecting-ip` を追加で信頼する」という
コードを、`x-forwarded-for` → `x-real-ip` → (`TRUST_CF_HEADERS` なら)
`cf-connecting-ip` の順で書いた。「エッジプロキシは `x-forwarded-for` を
上書きするはず」という Vercel での確認事実を、**Cloudflare 前段構成にも
そのまま適用**していた。

**After**: PR-2 完了後の `/code-review` で指摘: Cloudflare は
クライアントが送った `x-forwarded-for` を**上書きせず、末尾に実IPを
追記するだけ**（ドキュメント化された既知の挙動）。`cf-connecting-ip`
より先に `x-forwarded-for` を見ていたため、`TRUST_CF_HEADERS=1` を
有効にした環境でも、攻撃者が毎リクエスト別の `x-forwarded-for` の
**先頭**を送るだけで、B-H2 が塞いだはずの IP 単位レート制限迂回が
再発する状態だった。`cf-connecting-ip`/`true-client-ip` を最優先に
入れ替えて修正した。

**なぜ気づけなかったか**: 「本番は Vercel 直配信」という**検証済みの
事実**と、「`TRUST_CF_HEADERS=1` を使う将来の Cloudflare 前段構成」という
**検証していない仮定の環境**を、同じコードパス・同じ優先順位ロジックで
扱っていた。Vercel については「エッジが上書きする」ことを確認する動機が
あった（本番で実際に使う設定だから）が、`TRUST_CF_HEADERS` 分岐は
「opt-in の将来設定」として重要度を低く見積もり、**Cloudflare 自体の
ヘッダ書き換え仕様を一度も調べずに、Vercel と同じ前提（上書きされる）を
横流し**した。「プロキシは上書きするもの」という一般化を、個別のベンダーの
挙動を確認せずに適用した。

**再発防止（仕組み）**: 仕組み無し（判断に依存）。IPスプーフィング対策の
ヘッダ優先順位はベンダーごとに検証しないと机上の空論になりやすい。

**再発防止（習慣）**:
- **「エッジ/プロキシがヘッダを上書きする」という前提は、ベンダーごとに
  個別に確認する。** 同じコードパスに複数ベンダー（Vercel と Cloudflare）
  を並べるときは、片方で確認した挙動をもう片方に流用しない。
- opt-in フラグ（`TRUST_CF_HEADERS` 等）で切り替わる分岐は、
  「めったに使わない将来設定」として検証の優先度を下げない。
  有効化された瞬間にそれが**唯一のセキュリティ境界**になる。

---

## M-20260908-null-made-guard-fail-open セキュリティガード `A and B` の A を NULL 混入に気づかず書き、fail-open を作った（2026-09-08・型 A・旧 M-060）

**Before**: PR-1 是正で `platform_regional_stats()` 等5関数に
`is_super_admin_user()` ガードを追加した。`/code-review` の指摘で
「`src/lib/marketing/network.ts` の公開ページが service_role で呼んでおり、
`auth.uid()` が NULL のため常に forbidden になる」回帰が判明したので、
`auth.role() = 'service_role'` を許可条件に足す修正を書いた。
`if auth.role() <> 'service_role' and not is_super_admin_user() then raise` —
自分の頭の中では「service_role なら通す、それ以外は super_admin 必須」の
つもりで、これで正しいと判断した。

**After**: 再生DBで検証していて、`role` クレームを含まない JWT
（`request.jwt.claims = '{"sub":"..."}'` だけ）を authenticated ロールで渡すと、
**ガードが素通りした**。原因は PL/pgSQL の三値論理: `auth.role()` が NULL のとき
`NULL <> 'service_role'` は NULL（false ではない）になり、`NULL and 何か` も
NULL になる。`if NULL then` は PL/pgSQL では false 扱いなので、**例外が
一度も上がらず fail-open していた**。本番の Supabase JWT には常に `role`
クレームが入るので実害は無かった可能性が高いが、**「実害が無かった」は
テストで確かめる前は分からなかった**。`coalesce(auth.role(), '')` で
NULL を空文字に落として fail-closed に直した。

**なぜ気づけなかったか**: `A and B` の形の条件式を書くとき、**A が NULL を
返しうるかを確認しなかった**。`auth.uid() = ...` の比較で NULL 伝播を
気にする習慣は今回の他の修正（`dashboard_tenant_stats` 等）で既に持っていた
のに、`auth.role()` という**別の関数**に対しては同じ注意を払わなかった —
「関数名が違えば別の関数として一から考える」べきところを、
「`auth.*()` はだいたい同じように振る舞うはず」という**自分の想定**で
済ませていた（型Aの「自分の想定だけで検証する」に一致）。実際に気づけたのは、
たまたま検証テストで `role` クレームを省略した JWT を使ったからで、
狙って NULL ケースをテストしたわけではなかった。

**再発防止（仕組み）**: 仕組み無し（判断に依存）。ESLint 等の静的解析では
SQL 文字列内の三値論理は検出できない。

**再発防止（習慣）**:
- **`X <> 'value' and Y` の形でセキュリティガードを書くときは、X が
  NULL を返しうるかを都度確認し、返しうるなら `coalesce(X, '<絶対に
  一致しない値>')` で先に潰す。** 「前に似た関数で NULL 対策をしたから
  今回も大丈夫」という想定はしない。
- **ガードの検証では、正常系・拒否系に加えて「入力が欠けている系」を
  必ず1パターン作る**（今回でいう「JWT に role クレームが無い」）。
  今回はこれを偶然作ったから見つかった。
## M-20260906-stripped-security-invoker 定義を「書き写す」つもりで、ビューの security_invoker を剥がしていた（2026-09-06・型 D・旧 M-063）

**Before**: 本番にしか無いオブジェクトをマイグレーションへ書き起こす作業で、
ビュー `v_insurer_users_list` を `pg_get_viewdef()` の出力どおりに
`create or replace view ... as select ...` で書いた。**本文は本番と一字一句同じ**。
実行権限まで写す配慮もして、「これで同じ DB になる」と考えていた。

**After**: PR レビューの指摘で試したら、**`create or replace view` は reloptions を
引き継がず消す**。手元の PostgreSQL 16 で実測した。

```
作成直後      : security_invoker=on
or replace 後 : (オプション無し ← 消えた)
```

本番の 4 ビューは `20260531000006` が全部 `security_invoker=on` にしてある。
これが消えると、ビューは呼び出し元ではなく**所有者の権限**で走る。
`v_insurer_users_list` は `insurer_users` を読むので、
**全保険会社のユーザーとメールアドレスが RLS を迂回して見える**状態になっていた。
本番へ流していたら、越境アクセスをこちらの手で作り直すところだった。

**なぜ気づけなかったか**: `pg_get_viewdef()` の出力を「ビューの定義」だと思っていた。
**あれは SELECT 文であって、ビューの定義ではない。** 定義にはもう1つ、
`pg_class.reloptions` という側面がある。同じ作業で関数の ACL は
「定義だけ写すと緩くなる」と気づいて写したのに、**ビューにも同じ形の
「本文以外の属性」があることに考えが及ばなかった**。
1つの罠に気づいた時点で「同じ形が他の種類にも無いか」を見ていない。

**再発防止**: 仕組み無し（判断に依存）。習慣を2つ。

- **オブジェクトを書き起こすときは、`pg_dump` の出力と突き合わせる。**
  `pg_get_viewdef()` は本文しか返さないが、`pg_dump` は
  `WITH (security_invoker='on')` まで出す。**書き写す元を、本文を返す関数ではなく
  「復元できる形」を返すツールにする。**
- **属性を1種類守ったら、他の種類にも同じ属性が無いか列挙する。**
  今回は関数の ACL に気づいた時点で、ビュー・テーブル・型の
  「本文以外に持っている設定」を1周見るべきだった。

---

## M-20260906-prototype-numbers-reported 試作の検出器の数字を、検証せずに確定として報告しマージした（2026-09-06・型 A、M-046 の続き・旧 M-062）

**Before**: ドリフト棚卸しで、マイグレーションの**字面**を正規表現で読む検出器を
書いた。M-046 の再発防止どおり陰性対照と陽性対照を埋め、両方通った。
出た数字「68 個（トリガ 15 本）」を PR #1041 と事業ログ 4 か所に書いてマージした。

**After**: 実際に直す段になって、トリガ 15 本のうち **6 本は誤検出**と分かった。
`20260324120000_agent_features.sql` が `execute format('create trigger ...')` で
動的に作っており、**トリガ名がファイルの字面に現れない**。
正しい総数は 68/69 ではなく **63**。

**なぜ気づけなかったか**: **対照が全部「字面にリテラルで書かれたオブジェクト」だった。**
M-046 で足した対照は「検出器が壊れていないか」は見るが、
**「この検出方式そのものが構造的に見落とす形」は見ない**。
陰性対照に動的 SQL で作られるオブジェクトを1つでも入れていれば、その場で落ちていた。

もう1つ、**その数字を「確定」として出した**のが悪い。試作スクリプトの出力であり、
検証したのは対照だけで、**手法の適用範囲は検証していなかった**。

**M-046 の再発防止が効かなかった理由**: 「陰性対照を選んだら、それが陰性である
根拠を1コマンドで出す」は守った。だが対照は**成功例からしか選んでいない**。
検出器の弱点は、成功例を増やしても見えない。

**再発防止**: 仕組み有り。**検出方式を変えた。** 字面を読むのをやめ、
`scripts/check-schema-drift.mjs` は**マイグレーションを実際に流した DB の
`pg_dump`** を読む。動的 SQL で作られようと DO ブロックの中だろうと、
出来た物は dump に出る。**「何が書いてあるか」ではなく「何が出来るか」を見る。**

習慣も1つ: **対照は成功例だけでなく「この方式が苦手そうな形」から選ぶ。**
正規表現なら動的生成、キャッシュなら期限切れ、差分なら改名。

---

## M-20260906-zero-refs-read-as-unused 「アプリから参照ゼロ」を「使われていない」と読み、その分類を PR にして出した（2026-09-06・型 C・旧 M-061）

**Before**: マイグレーション外で本番へ入ったテーブル 23 本について、
`grep -rE "[\"'\`]<表名>[\"'\`]" src apps` で参照を数えた。全部ゼロだった
（`db.generated.ts` の型定義と、無関係なアドオンキー文字列を除く）。
行数も 23 本合計で 2 行。**「23 本は無害。露出は無い」**と結論し、
そのまま PR #1041 と OPEN_QUESTIONS / LEDRA_CURRENT / DECISION_LOG に書いて
**マージした**。

**After**: 翌ステップで削除しようとして `pg_depend` を引いたら、外れていた。

- `dealers` / `dealer_users` を**関数 5 本**が読んでいた
  （`market_my_dealer_id` / `market_is_approved_dealer` / `my_dealer_id` /
  `is_approved_dealer` / ついでに `insurer_subscriptions` を読む
  `insurer_is_active_subscription`）
- その関数を **26 本の RLS ポリシー**が使っていた
- うち `market_is_approved_dealer()` は **`storage.objects` のポリシー 2 本**から
  使われていた。**削除対象外の、別スキーマの実テーブルである。**

そのまま `drop table ... cascade` を流していたら、`storage.objects` のポリシーが
道連れになるか、`drop function` がそこで落ちていた。

**なぜ気づけなかったか**: 「使われている」を確かめる経路が **5 つ**ある
（アプリのコード / RLS ポリシー / 関数本体 / 外部キー / 他スキーマ）のに、
**1 つ目だけを見て「ゼロ」を全体の結論にした**。しかも
「アプリから参照ゼロ」は正しい観測で、そこが厄介だった。
**観測が正しいことと、その観測が問いに答えていることは別。**
問いは「消して安全か」で、`grep src` が答えられるのは
「アプリのコードが壊れないか」だけだった。

さらに悪いのは、**この分類を「無害」と断定してマージした**こと。
検証の途中経過ではなく、確定として事業ログに残した。

**再発防止**: 仕組み有り。**DB オブジェクトを消す前に `pg_depend` を引く。**
これ 1 本で 5 経路がまとまって出る（今回は索引と TOAST 以外の外向き依存が
テーブルには 0、関数には 36 本あることが一度に分かった）。grep は補助に落とす。

```sql
select pg_describe_object(d.classid, d.objid, 0)
from pg_depend d where d.refobjid = 'public.<対象>'::regclass;
```

加えて習慣を 1 つ: **「未使用」「無害」「露出なし」と書くときは、
何を見てそう言えるのかを同じ文に書く。** 「アプリからの参照ゼロ」とだけ
書けたなら、それは「未使用」の根拠として足りていない、と自分で気づける。

## M-20260907-no-negative-control 自作の検査に陽性対照だけ置き、陰性対照を置かなかった（2026-09-07・型 A・旧 M-060）

**Before**: `search_path=''` の SECURITY DEFINER 関数が本体で非修飾のテーブルを
参照していないかを調べる検査を、`pg_get_functiondef()` の全文に正規表現をかけて
書いた。`FROM` / `JOIN` / `INTO` / `UPDATE` の直後の識別子を拾い、public に同名の
実体があるものだけに絞る。空振り防止として、**わざと壊した関数を1本作って拾えることを
確かめる**自己検査も入れた。コメントには `ponytail:` で「CTE や関数呼び出しも拾うが、
public に同名の実体があるものだけに絞るので誤検知は実用上出ない」と書いた。

**After**: `/code-review` が両方向の誤りを再現つきで示した。

1. **誤検知**: 本体は完全修飾なのに、コメントに `-- read from certificates then
   join vehicles` と書いてあるだけで参照と誤認し、健全な関数で CI を落とす。
   正規表現は SQL の構造ではなく**テキスト**を見ているので、コメントも文字列
   リテラルも区別しない。「誤検知は実用上出ない」は**根拠のない主張だった**。
2. **取りこぼし**: 非修飾の**関数呼び出し**（`select gap_helper()`）と `USING` 句の
   非修飾テーブル（`delete from public.a using b`）。どちらも実行時には落ちる。
   拾う対象を4つのキーワードに決め打ちした時点で、それ以外の構文は最初から見えない。

**なぜ気づけなかったか**: **自己検査に陽性対照しか置かなかった。** 「壊れた関数を
検出できるか」は確かめたが、「**健全な関数を検出しないか**」を確かめていない。
陰性対照が1本でもあれば、コメント入りの健全な関数で即座に落ちていた。

M-016 の再発防止は「陽性と陰性の両方で当たりを取る」で、M-046 では
「陰性対照が本当に陰性かを確かめる」まで足していた。**今回はその手前で、陰性対照を
置くこと自体を忘れている。**「壊れたものを見つける検査」を書くと、意識が陽性側に
寄って、陰性側が視野から落ちる。

もう一段深い根は、**既に正解を知っている実装があるのに自分で書いたこと**。
`check_function_bodies` は、その関数自身の SET 句を適用した状態で本体を検証する
——「呼んだら落ちるか」の判定そのものである。自前の正規表現は、その劣化再実装だった。

**再発防止**: 仕組み有り。検査を `pg_get_functiondef()` を**流し直す**方式に変えた。
判定を Postgres 自身にさせるので、非修飾のテーブル・関数呼び出し・USING 句を
同じ1回で拾い、コメントや文字列リテラルは構造上そもそも対象にならない。
加えて習慣を2つ足す:

- **自己検査には陽性対照と陰性対照を必ず対で置く。** 「壊れたものを拾えるか」だけでなく
  「壊れていないものを拾わないか」を同じ場所で確かめる。今回は一時 DB に4形態
  （健全1・壊れ3）を作り、**実際に関数を呼んだ結果**と検査の判定が一致することを
  確かめた（期待値を自分で書かない）。
- **判定器を自分で書く前に、処理系が同じ判定をしていないか探す。**
  「実行したら落ちるか」を知りたいなら、実行するか、処理系の検証器を呼ぶのが
  いちばん短くて正確。

---

## M-20260907-stale-snapshot-ci-claim 4時間半前のスナップショットで、これから走る CI の結果を「対象は2本」と断言した（2026-09-07・型 F・旧 M-059）

**Before**: `stale-migration-check.yml` の初回実行を控えて、対象になる PR を手元で洗った
（2026-09-07 00:05 UTC）。open PR 16本のうち3日超が12本、そのうち `supabase/migrations` を
触るのは **#1016 と #966 の2本だけ**、と出た。両方とも本当に陳腐化していることも確かめた。
ユーザーへの報告に「対象は #1016 と #966 の2本だけです」と表で書いた。
表全体を「推定」と断らず、**個々の行を事実の口調で書いた**。

**After**: 実行は 04:44 UTC（予定の 00:20 から4時間半遅れ）に走り、**3本**にコメントが付いた
——#1016 / #979 / #966。**#979 を数え落としていた。** 3本とも本当に陳腐化していたので
コメント自体は全部正しく、2本は11分以内に直された（workflow としては完全な成功）。
だが私の「2本だけ」は外れていた。

**なぜ気づけなかったか**: **未来に走るものの結果を、過去のスナップショットで断言した。**
CI が走るのは4時間半後で、その間に PR は動きうる。にもかかわらず私は
「00:05 時点でそうだった」を「実行時にもそうである」として書いた。§10 の10番
（古い知識を現在として提示）そのもので、**「〜時点」を付けなかった**。

さらに、#979 を落とした理由は**今も確定できていない**。走査をやり直すと #979 は
migrations 2件を返す。00:05 と 04:45 の間に #979 が migrations を触ったコミットは
見つからない（マージは 04:56 で、コメントより後）。**私の走査が誤ったのか、
ブランチが動いたのか、切り分けられていない。** 切り分けるには、当時の `pr-979` の
tip を控えておく必要があった —— `--force` で取り直したので失われた。
**外れた検出器を、外れた直後に再現できる形で残していなかった**（M-041 と同じ根）。

**再発防止（仕組み）**: 仕組み無し（判断に依存）。

**再発防止（習慣）**:
- **これから走るものの結果を予測して書くときは、必ず「◯◯時点のスナップショット」と
  添え、実行までの時間差を明記する。** 差が数時間あるなら「実行時には変わりうる」と書く。
- **予測が外れたら、外れた側の入力をまず保全する**（ブランチの tip・出力の生ログ）。
  取り直してから原因を考えると、原因ごと消える。
- 検査対象の一覧を出すときは、**その検査自身が使う経路と同じ経路で出す**。
  今回 workflow は `gh pr diff` を使い、私は `git diff` を使った。別経路の一覧を
  「その検査の対象」として提示していた。

---

## M-20260906-public-page-code-only 「公開ページに何が出るか」を、公開ページのコードだけ読んで判断していた（2026-09-06・型 C・旧 M-058）

**Before**: 証明書の無効化で監査ログの `description` を直しているとき、
「タイムラインに何が出るか」を**管理画面のタイムラインの話**として考えていた。
PR #1040 の本文にも「注意点」として、公開ページの閲覧監査行には
「`description` は無いので現状は出ていない」と書いた。

**After**: **逆だった。** `logCertificateAction` は `description` を**省略されたときにこそ**
`Public ID: … / User: <uid> / IP: <IP>` を組み立てる。description を渡さず `ip` を渡す
呼び出しが2つあり（`certificate_public_viewed` / `certificate_public_pdf`）、
**訪問者の IP がその行に入る**。管理画面の閲覧記録には**担当者の uid** が入る。
そして公開証明書ページは `vehicle_histories` を型で絞らず車両単位で全件引いて
`description` をそのまま描画していた。**マージ済み main に実在する漏洩**で、
私は「出ていない」と書いた注意点の根拠を1つも確かめていなかった。

**なぜ気づけなかったか**: 漏洩が**離れた2箇所の組み合わせ**でしか成立しないため、
どちらの側を読んでも単体では気づけない形だった。だが本当の原因はそこではない。
**「出ていない」と書く前に、公開ページを描くコードを開かなかった。**
`/code-review` に指摘されて初めて `publicData.ts` と `UnifiedTimeline.tsx` を開いた。
注意点として書くということは**読み手がそれを信じて行動する**ということで、
§4 の「事実の主張がこの環境で確認可能なら、そこで確認せよ」に真正面から反している。
さらに型 C ——「監査ログを書く経路」は4つ全部数えたのに、
**その行を読む経路**は管理画面の1本しか見ていなかった。書き手だけ見て読み手を見ていない。

**再発防止（仕組み）**: `src/lib/certificate/__tests__/publicTimelinePrivacy.test.ts` を追加。
uid / IP が既定に入る5つの監査種別が公開クエリから除外されていること、
発行・編集・無効化は除外されていないこと、`type IS NULL` の行が巻き添えにならないことを
固定する。修正前のコードで11件すべて落ちることを確認した。

**再発防止（習慣）**: **「公開されない」と書く前に、公開する側のコードを開く。**
書き込む経路を数えたら、**同じ数だけ読み出す経路を数える**。
そして PR 本文の「注意点」は、本文中でいちばん検証が要る箇所として扱う
——読み手はそこだけを頼りに判断する。

---

## M-20260906-unverified-finding-accepted 指摘を検証せずに「実在」と判定し、直さなくていい所を直した（2026-09-06・型 A・旧 M-057）

**Before**: マージ後に着いた Codex の5件を「全部実在」と判定して直した。うち P1 は
「main が**同じ版**を足した場合、リンタは `duplicate-version` を出すので
`migration-version-before-base-head` だけを担当にしている分岐が衝突を素通りさせる」。
もっともらしかったので、担当ルールを2つに広げ、コメント本文も書き換えた。

**After**: `/code-review` が反例を出した。`lint-migrations.js` の判定は
`if (versionOf(file) > baseMax) continue;` で、`versionOf` は**先頭の数字だけ**を返す。
版が等しいと `>` が偽になるので、**同じ版の衝突でも
`migration-version-before-base-head` は出る**。元の grep で既に捕まっていた。

私の「修正」は害の方が大きかった。`duplicate-version` を担当に足すと、
**PR 自身が同じ版のファイルを2つ持っているケース**（その PR の CI は既に赤）にまで
「main と衝突しています」と書いたコメントを貼る。**存在しない穴を塞ぐために、
本物の誤報を1つ作った。**

**なぜ気づけなかったか**: **他人の指摘は検証の対象だ、と思っていなかった。**
自分の書いたコードは「当たりを取る」ところまでやるのに、レビューの指摘は
「指摘された = 実在する」で通していた。しかも今回は
**その主張を確かめる手段が5行の読解**だった（`versionOf` の定義と1本の比較式）。
M-035 と同じ形——条件式は読んだが、その値がどこから来るかを追っていない。
背景に「マージ前にレビューを見落とした（M-053）」の反動があり、
**急いで全部直すことが誠実さだと錯覚した**。

**再発防止（仕組み）**: 仕組み無し（判断に依存）。ただし
**指摘を1件直すごとに、その指摘が主張する「壊れている状態」を先に再現する**を
`/code-review` 対応の手順に入れる。再現できないものは直さず、
**再現できなかったと返す**（今回それをやっていれば、5行読んで終わっていた）。

**再発防止（習慣）**: レビューの指摘には**自分のコードと同じ検証を掛ける**。
「レビューアが言っているから」は根拠ではない。特に**修正が新しい分岐や新しい
出力を増やす**ときは、増える側の誤報を1つずつ数える。

---

## M-20260906-leftover-files-polluted-check 掃除したつもりのファイルが残り、次の PR の検査を汚していた（2026-09-06・型 A・旧 M-056）

**Before**: 陳腐化チェックの workflow で、PR ごとに
`git checkout pr-N -- supabase/migrations` で SQL だけ取り出して検査し、
`git checkout HEAD -- supabase/migrations` と `git clean -fd` で戻していた。
「取り出して、戻す」の対になっていて、正しく見えた。

**After**: **戻っていなかった。** `git checkout pr-N -- path` は取り出したファイルを
**index に載せる**。だから `checkout HEAD -- path` では消えず（HEAD にそのファイルは無い）、
`clean -fd` も**追跡済みとして飛ばす**。結果、前の PR のマイグレーションが作業ツリーに
残り続ける。`lint-migrations.js` は `readdirSync` で作業ツリーを数えるので、
**2本目以降の PR は「main ∪ それまでの全 PR」に対して検査される**。
無関係な PR が追い越し扱いになり、間違ったコメントが貼られる。
手元の git で再現した（`A supabase/migrations/2_pr.sql` が掃除後も残る）。
`git reset HEAD -- path` を先に打つと消える。

**なぜ気づけなかったか**: **掃除処理を一度も走らせていない。** 検査そのものは
実 git で ref を作って当たりを取ったのに、**その後始末は「対になっているから正しい」で
済ませた**。`checkout` が index を触ることを知らなかったのではなく、
**知っているか確かめなかった**。
さらに、この workflow は1本の PR でしか試していないので、**2本目で初めて出る不具合**は
構造上見えなかった。ループの2周目は、1周目とは違う入力を受ける。

**再発防止（仕組み）**: 仕組み無し（Actions 上でしか動かないシェル）。代わりに
**手元の使い捨て git リポジトリで「取り出す → 検査 → 戻す」を2周回して、
2周目の作業ツリーが1周目と同一であることを確認する**手順を残した（今回実行済み）。

**再発防止（習慣）**: **ループの中に状態を変える処理があるなら、必ず2周回す。**
1周目が正しいことは何も証明しない。そして「作った物を消す」コードは、
**作る側と同じだけ実際に走らせる**。

---

## M-20260906-merged-45s-after-review レビューが着いた45秒後にマージした。着いていることを確認しなかった（2026-09-06・型 F・旧 M-053）

**Before**: PR #1027 のマージ手順を「CI が全部緑」「`mergeable_state: clean`」「本文の件数を
数え直す」の3点と決めていた。10:26:55 に `pull_request_read get` を打ち、`comments: 8`・
`mergeable_state: clean` を見て、10:27:06 にマージした。

**After**: Codex は **10:26:21 に5件のレビューを出していた**。マージの45秒前。私が見た
`get` の応答に `comments: 8` はあるが、これは**issue コメントの数**で、レビューコメントは
別の口（`get_review_comments`）にある。5件のうち**2件は私が一本化で持ち込んだ退行**、
1件は P1 だった。全部マージ済みの main に入った。

**なぜ気づけなかったか**: 「Codex のレビューは対応済み」と思っていた。実際、直前のラウンドの
3件は直して push している。**そこで「Codex の番は終わった」と扱った。** だが Codex は
push のたびに走るので、私が最後に push した `2e7e788` に対して**もう一度走っていた**。
「レビューは対応済み」は**過去のコミットについての事実**で、現在の head については何も
言っていない。さらに、確認したつもりの `get` が**レビューコメントを含まない**ことを
知らないまま「8件のコメントを見た」と解釈していた（型 F。1コマンドで確かめられる事実を、
別のフィールドを見て確かめたつもりになった）。

**再発防止（仕組み）**: マージ直前のチェックリストに
**`pull_request_read get_review_comments` を1回打つ**を入れる。`get` の `comments` は
issue コメントであってレビューではない。0件を確認してからマージする。
CI の緑と同じ扱いで、**打った結果を見るまでマージしない**。

**再発防止（習慣）**: 「レビューは対応済み」と考えたら、**どの SHA に対して対応済みかを
言う**。言えないなら対応済みではない。自分が push した後に走る自動レビューは、
**その push を見ていない**。

---

## M-20260906-unification-dropped-guarantees 一本化で、呼び出し側が持っていた保証を2つ落とした（2026-09-06・型 D・旧 M-054）

**Before**: 証明書の無効化5経路を `voidCertificate()` に寄せた。「取得・更新・監査記録は
ヘルパーへ、認可と経路固有の追記は呼び出し側へ」と切り分けを書き、呼び出し側から
重複する処理を消した。挙動は変えていないつもりだった。

**After**: 移設で2つ落ちていた。どちらも Codex の指摘。

1. **`await` が消えた。** ヘルパーは `void logCertificateAction(...)` と fire-and-forget に
   した。API 経路は元から fire-and-forget だったので問題ない。だが**車両詳細の
   Server Action は自前の insert を `await` していて、直後に `redirect()` する**。
   await を外すと、サーバレス実行が insert の前に終了しうる。無効化は成功したのに
   タイムラインと監査に残らない。
2. **`description` の既定が効かなくなった。** ヘルパーで
   `description: input.description ?? "証明書を無効化 (void)"` と既定を作った。
   ところが `logCertificateAction` 自身が `params.description ?? [Public ID / User / IP]`
   という既定を持っている。**ヘルパーが常に非 null を渡すので、その既定が永久に動かない。**
   車両詳細は「description を省略すれば Public ID が入る」つもりで省略していたので、
   全経路のタイムラインが「証明書を無効化 (void)」だけになり、どの証明書を誰が消したのか
   分からなくなった。PR 本文にも「ヘルパーの既定（`Public ID: … / User: …`）が適用される」と
   書いていた。**書いた本人が、その既定が動かないコードを書いていた。**

**なぜ気づけなかったか**: 共通化を**「共通処理に何を入れるか」**の問題として見て、
**「呼び出し側から何が消えるか」**を1行ずつ読まなかった。消える行が持っていた性質
（`await` していた・`Public ID` を書いていた）は、関数名からは見えない。
2 はさらに型 B が重なっている——`logCertificateAction` の**シグネチャは読んだが、
本体で `??` がどう効くかを読まなかった**。既定を2段重ねたら、外側が内側を殺す。

**再発防止（仕組み）**: `src/lib/certificates/__tests__/voidCertificate.test.ts` に
「監査ログの完了を待ってから返す」「`description` を渡さなければ監査ログ側の既定に委ねる」の
2本を追加。どちらも修正前のコードで実際に落ちることを確認済み（テストだけ先に戻して実行した）。

**再発防止（習慣）**: 共通化は**足す作業ではなく引く作業**。着手前に
**「呼び出し側から消える行」を先に列挙し、各行が持っていた性質を1つずつ移設先で名指しする**。
そして**既定値を2段に重ねない**——外側で `?? 既定` を書く前に、内側が既定を持っていないか読む。

---

## M-20260906-tested-only-happy-input 自分が書いた条件式を、通ると思った入力でしか試さなかった（2026-09-06・型 A・旧 M-055）

**Before**: 同じ PR で書いた判定を2つとも「読んで正しい」で済ませた。
(a) コードフェンスの閉じ判定を「同じ文字・同じ長さ以上」で書いた。
(b) ワークフローで「マイグレーションを触っていない PR は見ない」を
`if ! gh pr diff ... | grep -q '^supabase/migrations/'` で書いた。

**After**: どちらも Codex が反例を出した。

- (a) CommonMark の閉じ記号は**情報文字列を持てない**。外側 ```` の中に例として書いた
  ` ````js ` の行が外側を閉じ、続く見出しが未来日検査に晒され、本物の閉じ記号が
  「閉じ忘れ」に見える。**正しい文書をコミット拒否する。**
- (b) `set -e` は `if` の条件では効かない。`gh` が API エラー・認証切れで落ちても、
  grep が空入力で 1 を返すのと**区別が付かない**。検査したい PR を黙って飛ばして緑で終わる。

**なぜ気づけなかったか**: 両方とも**自分が想定した入力**でしか試していない。(a) は
「入れ子のフェンス」のテストを1本書いたが、書いたのは**長さが違う**例だけで、
「同じ長さ＋情報文字列」を試していない。(b) は「移行あり」「移行なし」は確かめたが、
**「コマンド自体が落ちる」を試していない**。M-041（検出器を4件で校正したが4件とも
1行に収まる例だった）と同じ形。**当たりを取る例を自分で作ると、自分の想定の外には出ない。**

**再発防止（仕組み）**: (a) はテストを追加（`情報文字列つきの行は閉じ記号にならない`）。
(b) はシェルなので単体テストが無いため、**スタブで7分岐を実際に走らせて出力を確認**した
（gh 失敗／移行なし／移行あり、および4つのルール分類）。

**再発防止（習慣）**: 条件式を書いたら、**その条件が偽になる経路を列挙して名指しする**。
特に「コマンドが失敗したとき」は、成功して結果が空のときと**必ず別に**試す。
そして仕様（CommonMark など）を実装するときは、**規格の条文を1つずつ潰したか**を数える。
## M-20260907-bot-instruction-over-main ボットの指示を検証したが、検証先に main の判断を入れていなかった（2026-09-07・旧 M-052）

**型: B（読まずに分類する）**

**Before**: `Stale migration dates` ボットが「この PR のマイグレーションが main に
追い越された。新しいバージョンへ改名せよ」とコメントした。**そのまま従わず検証した**
のは正しかった ―― `lint:migrations` を回して落ちる6件を特定し、本番の
`schema_migrations` を引いて自分の2本が適用済みであることも確認した。
そのうえで「改名＋本番の台帳も同じ値に UPDATE」を代表に提案し、承認を得た。

**After**: 改名を実行した直後、main のファイルに
`-- 本番 = 20260906094735（#966 が apply_migration で本番へ直接当てた版。main には無い）`
というコメントがあるのに気づいた。DECISION_LOG を読むと、main は #1042 で
**この状況をすでに分析して判断を書いていた**。

- 本番の自動適用は**今まさに止まっている**。原因は2つ。
  (1) 本番に `20260906094512` / `20260906094735` が適用済みなのに main にファイルが無い
  (2) #1020 の4本が本番の最新より古い
- main は (2) だけを自分で直し、**(1) は #966 に委ねると明記していた**。
  「db-migrate が緑に戻るには #966 のマージが要る」

承認された「改名＋台帳更新」を最後まで実行していたら、**本番の停止が長引いていた**。
改名すると (1) が残り続け、さらに台帳の最新版が `20260907…` に繰り上がるので、
未適用の `20260906100000〜100003` が今度は (2) に引っかかる。**直すつもりで両方壊す。**
改名を戻し、ファイル名を本番の記録と一致させたままにした。

**なぜ気づけなかったか**: **検証の宛先を間違えた。** ボットの主張は
「lint の出力」と「本番の台帳」に対して確かめたが、**「main が同じ問題について
既に何を決めたか」には当たっていない**。決定は DECISION_LOG に、しかも先頭のエントリに
書いてあった。main のマイグレーションファイルには私のバージョン番号が直接書かれており、
`grep` すれば一発で出た。事実だけを検証して、**判断を検証しなかった**。

代表の承認も安全の担保にならなかった。私が提示した選択肢自体が不完全な調査に
基づいていたので、承認は「その前提のもとで」の承認でしかない。
**承認は検証の代わりにならない。**

**再発防止**: 仕組み無し（判断に依存）。習慣として、**自分の変更に他人が言及していないかを
先に見る** ―― 具体的には (a) 触ろうとしているファイル名・バージョン番号で
`grep -rn` を repo 全体にかける、(b) `DECISION_LOG` の直近エントリを読む。
どちらも数秒で終わる。今回は (a) が実際に main のコメント4件を返した。

---

## M-20260905-migration-number-not-rechecked マイグレーションの採番を、main が動いた後に見直さなかった（2026-09-05・旧 M-051）

**型: I（前提が途中で変わったのに読み直さない）**

**Before**: レシート公開用のマイグレーションを `20260904000000` で作った。
根拠は「既存の最新は `20260901000000` だから、これより後ならよい」。
`npm run lint:migrations` は緑で、`check:migrations` の再生も通った。

**After**: その後 `main` を2回取り込んだ。2回目に入った `#1029` / `#1025` が
`20260904060245` と `20260904123252` を持ち込み、**私の採番は main の最新より前**になった。
`supabase db push` はバージョン順に当てるので、後から出てきた古い番号のファイルは
out-of-order で**停止する** ―― 私のマイグレーションは本番に届かず、
それ以降のマイグレーションも止まる。

自分では気づかなかった。**main が同じ日に足した新ルール
`migration-version-before-base-head`** が落として初めて分かった。
`20260905030000` / `20260905030001` に改名して解消。

**なぜ気づけなかったか**: 採番したときの「最新」は正しい観察だった。だが
採番は**ブランチが取り込む先の最新**に対する相対的な位置であって、
取り込むたびに意味が変わる。マージのコンフリクトはマイグレーションには出ない
（別ファイルなので衝突しない）ので、「自動でマージできた＝問題なし」と扱った。
**M-047 とまったく同じ形**。あのときは画面の遷移先、今回はファイルの採番で、
どちらも「衝突しないファイル」に潜んでいた。

**再発防止**: 仕組みあり（自分ではなく main が入れたもの）。lint の
`migration-version-before-base-head` が base の最新と比べて落とす。CI でも
base ref を取ってから走るようになっている（`ci.yml`）。
習慣としては、**main を取り込んだら、衝突しなかったファイルのうち
「順序・番号・経路」に依存するものを名指しで見直す** ―― 型 G の再発防止が
2回続けて効かなかったのは、見直す対象を「衝突したファイル」に限っていたため。

**その後（2026-09-06）**: この採番はさらに2回ずれた。main が `20260905040000` を入れて
`20260905030000` がまた前になり、さらに**本番の記録バージョンは `20260905142740`**
（ファイル名 `20260905040000` とは別物）だった。最終的に本番へ適用してから、
記録された `20260906094512` / `20260906094735` にファイル名を合わせて決着させた。
**PR が長く開いているほど、この形は何度でも再発する。** 採番はマージ直前に確定させるのが正しい。

---

## M-20260904-safety-net-blocked 安全網を置いたつもりで、網の先が塞がっていた（2026-09-04・旧 M-050）

**型: A（道具を検証しない）** — 検出器やスクリプトではなく、**安全網**を検証しなかった形。

**Before**: 起動演出 `AppIntro` はアプリ本体の手前に立つので、固まるとアプリが一切見えなくなる。
そこで `ErrorBoundary` で囲み、コメントにこう書いた。

```tsx
// 演出は本質的に飾りなので、ここで落ちてもアプリ本体には入れるように
// ErrorBoundary の内側に置く。
if (!introDone) {
  return <ErrorBoundary><AppIntro ready={isReady} onFinish={() => setIntroDone(true)} /></ErrorBoundary>;
}
```

**After**: **入れない。** 補足すると `ErrorBoundary` のフォールバック画面が
**この分岐の中に**出るだけで、`introDone` は false のまま。再試行ボタンは同じ
`AppIntro` をもう一度マウントするので、また落ちる。5秒の最後の砦はスプラッシュを
剥がすので、エラーカードが見えるようになるだけだった。
具体的な引き金は、コメント自身が名指ししていたケース ―― expo-video のネイティブが
入っていないビルドでは `useVideoPlayer(require(...))` が描画中に throw する。

同じ砦にもう1つ穴があった。砦はスプラッシュを剥がすが `introDone` を立てない。
`AppIntro` の退場は `ready`（`useAuthInit` の完了）を条件にしているので、
初期化が返ってこないと**演出の最終フレームのまま固まる** ―― スピナーも、
エラーも、再試行も無い一枚絵になる。`/code-review` が両方拾った。

**なぜ気づけなかったか**: 安全網を**置いたこと**で安心し、**網の先がどこに繋がるか**を
辿らなかった。`ErrorBoundary` は「落ちても大丈夫にする道具」という名前と役割を持っており、
その名前を根拠に扱った。実際にやるのは「フォールバックを描く」ことだけで、
**フォールバックの先へ進めるかは置いた側の責任**だった。
コメントに「アプリ本体には入れる」と書いた時点で、それは検証していない主張だった。

**再発防止**: 仕組みあり（半分）。`SPLASH_FAILSAFE_MS` を `introTiming.ts` に移し、
「砦は正常系の最短の2倍以上」を自己チェックで固定した（短くすると普通の起動で演出を切る）。
`ErrorBoundary` には `onError` を足し、`_layout.tsx` は補足したら演出を終わったことにして
本体へ抜ける。**残る仕組み無しの部分**: 「フォールバックから先へ進めるか」は自動では検査できない。
習慣として、**退路を書いたら退路の出口まで指でなぞる** ―― 「落ちたらどうなるか」ではなく
「落ちた後どこへ行くか」を、コメントに書く前に確認する。

---

## M-20260904-rebuilt-existing-thing 既にあるものを見ずに、隣に同じものを作りかけた（2026-09-04・旧 M-049）

**型: F（確認できる事実を確認しない）** — 同じ日に2回出た。どちらも `ls` 一発で分かった。

**Before（1件目・重い方）**: レシートの公開ページを `src/app/r/[public_id]/page.tsx` として作った。
URL は `/r/<token>` のつもり。マイグレーションのコメントにも、モバイルのリンク組み立てにも、
ルートのコメントにも `/r/[public_id]` と書いた。型チェックは0エラー、テストも全部緑だった。

**After**: `src/app/r/` には**既に `[short_id]` があった**。本人確認の入庫リンク
（`src/lib/identity/intakeLinkServer.ts` が `/r/{short_id}?t={token}` を発行）が使っている。
Next.js は同じ階層に別のスラッグ名を置けない（"different slug names for the same dynamic path"）。
つまり **`next build` が落ちる**。仮に通ったとしても `/r/*` は入庫リンクの画面に吸われるので、
お客様に送ったレシートは**また 404 になる**（直そうとしていたバグの再生産）。
`/receipt/[public_id]` に移した。

**Before（2件目・軽い方）**: URL の組み立てを1箇所に集めるため
`apps/mobile/src/lib/receiptUrl.ts` を新規作成した。

**After**: `apps/mobile/src/lib/certificateLinks.ts` が既にモバイルの外部向けリンクの置き場で、
`trimSlash` を持ち、証明書ではない `passportUrl`（`/v/<vin>`）も入っていた。
新規ファイルはその重複。関数を1つ足すだけで済み、`package.json` への self-check の登録も
不要だった（既に登録済み・`checkRegistry.check.ts` の保護下）。統合した。

**なぜ気づけなかったか**: **新しいものを置く前に、置き場所の隣を見ていない。**
2件とも「無いはずだ」という前提の確認を省いた。1件目は `ls src/app/r`、
2件目は `ls apps/mobile/src/lib` で終わる話だった。
型チェックもテストも通っていたのが悪く効いた ―― どちらの誤りも**型に現れない**。
ルートの衝突はビルド時、ファイルの重複はそもそも壊れていないので、
「緑だから大丈夫」が2回とも通ってしまう（M-047 と同じ形）。

**再発防止**:
- 仕組みあり（1件目）: **`npx next build` を push 前に1回通す。** ルートの衝突は
  型チェックでもテストでも出ず、ビルドでしか出ない。今回もビルドを回して初めて
  出力に `/r/[short_id]` と `/receipt/[public_id]` が並ぶのを確認した
- 仕組み無し（2件目・判断に依存）: **新しいファイルを作る前に、置くディレクトリを `ls` する。**
  CLAUDE.md のはしごの2段目（「この codebase に既にあるか」）を、
  ファイル単位でも実行する。「関数を探す」だけでなく「置き場を探す」

---

## M-20260904-copied-link-unread リンクの行き先を読まずにコピーした（2026-09-04・旧 M-048）

**型: B（読まずに分類する）**

**Before**: App Store 要件 5.10（決済後にレシートを SMS / Email で送れること）のため、
飛び込み会計の画面にレシート共有を足した。予約レシート画面に既にあった行

```tsx
<ReceiptShareDialog receiptUrl={`https://app.ledra.co.jp/c/${id}`} ... />
```

をそのまま持ってきた。「既存の実装を再利用した」つもりだった。

**After**: `/c/[public_id]` は**証明書**の公開ページで、`certificates.public_id` を引いて
見つからなければ `notFound()` する。渡していた `id` は `payments.id`（飛び込み）と
`reservations.id`（予約）。**証明書のトークンではないので必ず 404。**
つまり要件 5.10 は、予約経路でも**最初から満たされていなかった**。
私はその壊れたリンクを、飛び込み経路にコピーして**404 を2箇所に増やした**。
`/code-review` が拾って発覚。

**なぜ気づけなかったか**: 変数名が `receiptUrl` で、値が `app.ledra.co.jp` で始まる
自社ドメインだったので、**「レシートのURL」だと読んで中身を見なかった**。
`/c/` が何のルートかを一度も確認していない。既存コードのコピーは
「動いているものを持ってくる」と思いがちだが、**動いていることは確認していなかった**。
UI にも出ない ―― ダイアログは SMS アプリを開くところまでは成功するので、
店側の画面では「送信しました」と出る。**壊れているのは受け取った顧客の側だけ**。

**再発防止**: 仕組みあり。URL の組み立てを `certificateLinks.ts` の1箇所に集め、
`receiptUrl()` の**行き先を self-check で固定した**（`/receipt/` であること、
`/c/` でないこと）。変異テストで、`/r/` や `/c/` に書き換えると落ちることを確認済み。
文字列を画面に直接書かない限り、次は同じ形にならない。

---

## M-20260903-skipped-email-confirmation マージ前の観察を根拠に、サインアップのメール確認を飛ばした（2026-09-03・旧 M-047）

**型: I（前提が途中で変わったのに読み直さない）** — 台帳で初出。
（PR #966 のブランチ上で 2026-09-03 に記録。main へ合流したのは 2026-09-04 で、
採番は main の取り込みのたびに衝突し、M-016 → M-026 → M-047 と変わっている。）

**Before**: App Store 審査対応で `apps/mobile/src/app/(auth)/signup.tsx` を読み、
遷移先の `/(auth)/verify-otp` を開いた。中身は

```js
// ponytail: placeholder for actual OTP verification API call
await new Promise((r) => setTimeout(r, 800));
setVerified(true);
```

で、**どんな6桁でも通るスタブ**だった。これは当時の事実。
「Apple のレビュアーが必ず通る経路に、動作しない検証画面を挟んだままにはできない」と判断し、
signup の遷移先を `/(auth)/select-store?fromSignup=1` に付け替えた。
コミットメッセージにも「あの画面は 800ms 待って無条件に成功するスタブだった」と書いた。

**After**: その後 `main`（`528ffd5` → `33c1692`）を取り込んだ。その中に
**`5f6931b`（#1012「モバイルのサインアップ確認 OTP を実配線」）** が入っていた。
マージ後の `verify-otp.tsx` は

```js
await mobileApi("/auth/otp/verify", { method: "POST", body: { code } });
```

を叩く**本物の実装**で、成功後は `router.replace("/(auth)/select-store?fromSignup=1")` へ送る。
**私が手で書いた遷移先と同一**だった。つまり私の変更は、

- 本物のメール確認を**経路から切り離し**、新規サインアップが確認を素通りする状態にし、
- しかも**同じ遷移を自分で書き直しただけ**の、完全に無駄な差分だった。

`grep -rn "verify-otp" apps/mobile/src` が自分のコメント1件しか返さない状態で push していた。
`/code-review` が拾って発覚。signup の遷移を元に戻した。

**なぜ気づけなかったか**: 変更を決めた時刻とマージした時刻の間に、根拠が入れ替わっていた。
マージのコンフリクトは `package.json` / `(tabs)/index.tsx` / `walk-in.tsx` / 事業ログ4件に出たので、
**そこは注意して解決した**。だが `signup.tsx` と `verify-otp.tsx` は**コンフリクトしなかった**
（私は signup 側、main は verify-otp 側を触ったため）。衝突しなかったファイルを
「マージが自動で解決した＝問題なし」と扱った。**衝突の有無は、意味の整合とは無関係**だった。

さらに、typecheck も 15件の自己チェックも CI 10件も**全部緑だった**。
画面の遷移先を変えるのは型に現れず、既存のテストも経路を固定していない。
「緑だから大丈夫」で最後の読み直しを省いた。

**再発防止**: **仕組み無し（判断に依存）。**
経路の付け替えは型にもテストにも出ないので、静的検査では止められない。習慣にすること:

- **`main` を取り込んだら、そのマージより前に決めた変更を1件ずつ読み直す。**
  特に「相手側のファイルの中身を根拠にした変更」は、相手側が更新されていないか必ず見る。
- **コンフリクトしなかったファイルこそ疑う。** 衝突は「同じ行を触った」の意味しかない。
- **「〜だから外した／消した」と書いた変更は、push 前にその根拠をもう一度確認する。**
  根拠が他ファイルの実装なら、そのファイルを開き直す。
## M-20260906-wrong-control-three-times 対照そのものを間違えた。3回とも仕組みが先に落ちた（2026-09-06・型 A・旧 M-046）

**Before**: マイグレーション外で本番へ入ったオブジェクトを洗う検出器に、M-016 の
再発防止どおり陰性対照（migrations に在ると分かっている名前）と陽性対照（架空の名前）を
組み込んだ。enum を調べるとき、陰性対照に `plan_tier_enum` を選んだ。
「plan_tier は enum なのだから、どこかの `CREATE TYPE` で作られているはず」と考えた。

**After**: 走らせた瞬間に `AssertionError: 陰性対照が落ちた: plan_tier_enum` で止まった。
**migrations 446 本に `CREATE TYPE` は1本も無い。** enum 5個は全部ドリフトだった。
落ちたのは検出器ではなく、私が選んだ対照のほうだった。

同じ日にあと2回、同じ形で止められている。

1. **2回目**: 検出器の結果を別経路で裏取りしようと grep を書いた。既知の関数
   `insurer_accessible_tenant_ids` を陽性対照に入れたら **0 件**。`-i` を付け忘れ、
   大文字の `CREATE OR REPLACE FUNCTION` に当たっていなかった。**対照を入れていなければ、
   全部 0 件を「独立した2経路で一致」と読んで報告していた。**
2. **3回目（報告寸前）**: `pg_class.oid` の並びから「ドリフトは初期構築だけでなく
   継続して起きた」と結論しかけた。当てはめ直すと `market_deals`（2026-03-14 のファイル由来）
   の oid が `insurer_tenant_access`（2026-03-26 由来）より**大きい**。oid 順は
   ファイル日付順と一致しない。時期の断定を取り下げ、【推定】に格下げした。

**なぜ気づけなかったか**: 3件とも根は同じで、**「そうであるはず」を対照に使った**こと。
対照は「検出器が正しいかを測る物差し」なのに、その物差しの目盛りを自分の推測で刻んだ。
M-016 の再発防止は「陽性と陰性の両方で当たりを取る」だったが、**その対照が本当に
陰性なのかを確かめる手順が抜けていた**。oid の件も同じで、「oid は作成順」という
性質は正しくても、**この DB でファイル日付順と一致するかは測っていなかった**。

**再発防止**: 仕組み有り（今回はそれが効いた）。検出器に対照を assert で埋め込んでおくと、
対照が間違っていても検出器が壊れていても、**どちらでも走る前に止まる**。
どちらだったかは走らせてから切り分ければよい。加えて習慣を1つ足す:

- **陰性対照を選んだら、それが陰性である根拠を1コマンドで出してから使う**
  （`grep -rniE 'create +type' supabase/migrations/` を先に打っていれば、
  対照を選ぶ前に「1本も無い」が見えていた）。
- **順序を根拠に使うときは、既知の2点でその順序が成り立つか先に測る。**
  性質として正しいこと（oid は単調増加）と、この環境で使えることは別。

---

## M-20260906-write-token-to-foreign-code 検査を「PR の中で」走らせ、他人のコードに書き込みトークンを渡していた（2026-09-06・型 D・旧 M-042）

**Before**: レビュー待ちの長い PR のマイグレーション日付が陳腐化する件で、
毎日 open PR を見回る workflow を書いた。設計方針は「判定ロジックは書かない。
既存の `lint:migrations` をそのまま回すだけ」で、これは正しかった。
実装は素直に、PR の head を checkout して、そこで `node scripts/lint-migrations.js`
を実行する形にした。**「同じ検査を別のタイミングで回すだけ」のつもりだった。**

**After**: `/code-review` の指摘で2つ出た。どちらも同じ1行が原因。

1. **その job は `pull-requests: write` の `GH_TOKEN` を env に持っている。**
   PR の head を checkout してそこの `scripts/` を実行するということは、
   **PR を開ける人なら誰でも（fork からでも）そのトークンでコードを実行できる**
   ということ。いわゆる pwn request。日付検査のつもりが、書き込み権限の受け渡しになっていた。
2. **走らせていたのは「PR 側の」検査だった。** ルールが入る前に開かれた PR や、
   スクリプトを書き換えた PR は自分で「OK」を返す。
   **それはまさにこの workflow が捕まえたい集合そのもの。**

PR のコードは checkout せず、main のコードのまま `supabase/migrations` の SQL だけを
作業ツリーへ取り出す形に変えた。SQL は読むだけで実行しない。

**なぜ気づけなかったか**:
**「何を実行するか」は考えたのに、「誰が書き換えられるものを実行するか」を考えなかった。**
手元では `git checkout <ref>` は自分の書いたコードを出す操作でしかない。
CI では同じ操作が**他人の書いたコードを持ってくる**操作になる。
実行するファイルの**中身**は同じ名前・同じ役割なので、差が見えない。

型 D（移設で弱める）。**既存の再発防止が効かなかった理由**: 型 D はこれまで
「検査の強さや信号が落ちる」形だけを見ていて、2 はまさにそれなのに気づけなかった。
移設先が**信頼境界をまたいでいる**ことを軸に持っていなかったため、
「強さが落ちるか」を CI の権限モデルの側から点検しなかった。
1（トークンの露出）はその軸を持っていれば同時に見えたはずのもので、
**別の失敗ではなく同じ見落としの2つの出方**である。

**再発防止**: 仕組み無し（判断に依存）。習慣を1つ。

- **workflow を書いたら「この job のトークンで、誰のコードが動くか」を1文で言う。**
  答えに自分以外が出てきたら、そのコードは checkout しない。
  必要なのがデータ（SQL・設定・ログ）なら、**データだけ**を取り出して
  信頼できる側のコードで読む。
- 型 D の点検項目に**信頼境界**を足す。「同じものを別の場所へ置く」とき、
  移した先が (a) 誰の書き換えを受けるか (b) どんな権限を持っているか を見る。
  検査の強さが落ちるのは、たいていこのどちらかが変わったとき。

---

## M-20260905-calibrated-on-single-line-cases 検出器を4件で校正したが、4件とも1行に収まる例だった（2026-09-05・型 A・旧 M-041）

**Before**: エラー表示の `error` / `message` 取り違えを 103 箇所まとめて直すため、
走査スクリプトを書いた。**当たり取りを4件やった**——修正済みファイルが出ないこと、
音声認識イベントの誤検出が消えること、顧客ポータルが出ること、ヘルパー経由も出ること。
4件とも通ったので、検出器は正しいと判断して一括置換を流した。

**After**: 置換後の再走査で `AnchorVerifyClient.tsx` が
`json?.message ?? json?.message ?? json?.error` になっていた。**`message` を二重に入れていた。**
元のコードが `json?.message ??` で改行し、次の行に `json?.error ??` と続く形だったため、
「直前に message を読んでいるか」の判定が**その行しか見ておらず**、見落として挿入した。
逆向きの誤検出も同時に起きていて、`MaterialsManager.tsx` の**正しい3箇所**を
「未修正」として報告していた。

**なぜ気づけなかったか**:
**当たり取りの4件が、たまたま4件とも1行に収まる例だった。**
校正したのは「どの変数を対象にするか」（`.json()` 由来か、イベントか、Supabase か）で、
そこは4通り試した。**しかし「式が何行にまたがるか」は1通りしか試していない。**
検出器には軸が2つあったのに、片方の軸だけで4点取って「4件で校正した」と思っていた。

型 A（道具を検証しない）。M-012 の「検出器を狭めたら消えたものを確認する」は実行して、
そのおかげで95件の取りこぼしを見つけた。**消えたものは見たのに、
自分が書き換えた結果を同じ検出器にもう一度通す**ところで初めて気づいた。

**再発防止**: 仕組みで止めた（テスト）。習慣も1つ。

- **仕組み**: `src/lib/api/__tests__/errorMessageField.test.ts` に、
  **改行をまたいだ正しい形を拾わないこと**を固定するケースを入れた。
  判定は行ではなく直前の文区切りまで遡る。実際にバグを1件戻して落ちることも確認した。
- **習慣**: **当たり取りの件数ではなく、軸の数を数える。**
  「4件で校正した」は、その4件が同じ軸に並んでいれば1件と変わらない。
  検出器の判定条件を書き出し（今回なら「対象変数」と「式の行数」）、
  **各軸に最低1件ずつ**当てる。とくに正規表現が行単位なら、複数行の例を必ず1件入れる。

---

## M-20260906-hash-roundtrip-unchecked 「ハッシュに updated_at が入っている」を確かめて、往復して一致するかを確かめなかった（2026-09-06・旧 M-033）

**Before**: PR #1037 で、公開の確認トークンを「中身＋`updated_at` のハッシュ」にした。
`preview` が印を返し、`publish` が突き合わせる。テストは `publishGate.test.ts` に書いた。

```ts
const hashFn = src.slice(src.indexOf("function contentHash"), ...);
expect(hashFn).toMatch(/c\.updated_at/);   // ← 緑
```

緑を見て「版の印は1回で切れる」と結論し、PR を出した。

**After**: **その状態では、公開が1件も通らなかった。**

- `preview` は自分で作った `new Date().toISOString()`（`2026-09-06T06:00:00.123Z`）をハッシュした
- `publish` は DB から読み直した `updated_at` をハッシュした。PostgREST は timestamptz を
  **`2026-09-06T06:00:00.123+00:00`** で返す

同じ瞬間だが**文字列が違う**ので sha256 は一致しない。`contentHash(reviewed) !== preview_token`
が常に真になり、「確認した内容が最新ではありません」で毎回弾かれる。Codex の指摘で分かった。

直し方は「時刻だけ揃える」ではなく、**両側の出所を DB に揃える**こと。`preview` の
update に `.select("ai_summary, good_points, caution_points, tags, updated_at")` を付け、
**返ってきた行**から印を作り、**画面に見せる文面も同じ行から**出す。
そうすれば表記の食い違いは `updated_at` に限らず起きない
（jsonb 列の正規化など、同じ形の罠は他にもありうる）。

**なぜ気づけなかったか**: テストが**構造しか見ていなかった**。
`toMatch(/c\.updated_at/)` が確かめたのは「ハッシュ関数の本文に `c.updated_at` という
文字列がある」だけで、**preview 側と publish 側が同じ値を渡すか**は一度も見ていない。
片方が `Z`、片方が `+00:00` を渡していても、この検査は緑のままである。

型 A（道具を検証しない）の再発防止「検出器を1件で当たりを取る」は**実施していた** ——
構造テストを壊して落ちることは確認した。だが構造テストを変異させて確かめられるのは
「文字列の変化を検出できる」ことだけで、**その文字列が正しい振る舞いを含意するか**は
そこからは出てこない。型 A の対策が効かない領域なので、型 G として分けた。

**再発防止**:
- 仕組みあり。`src/lib/academy/__tests__/casePresentation.test.ts` に**値の往復**を足した。
  `academyCaseToken()` を `casePresentation.ts` に出して単体で呼べるようにし、
  `"...Z"` と `"...+00:00"` が**別の印になる**ことを固定した（だから DB の値を渡す、
  という理由がテストに残る）。4件とも変異で落ちることを確認済み
  （ハッシュから `updated_at` を外す→2件 / `ai_summary` を外す→1件 /
  列を明示せず行そのものをハッシュする→1件）
- 習慣を1つ。**構造テスト（grep 系）を書いたら、「これが緑のまま壊せる形」を1つ挙げる。**
  挙げられたなら、その形を潰す値のテストを1本足す。挙げられないなら構造テストで足りる
- 一般化その1: **2箇所で作った値を突き合わせるなら、両方を同じ出所から作る。**
  片方が「送った値」、片方が「返ってきた値」になっている時点で、表記の一致は
  保証されていない
- 一般化その2: **その突き合わせは、両側を1回のテストで走らせて確かめる。**
  片側だけを見る検査は、表記の違いを永久に見逃す

**棚卸し（2026-09-06、同日中に実施）**: 「既存の構造テストにも同じ穴が無いか」を
残していたので、ソースを読む検査 **14本すべて**を見た。同じ形が **3本**あった。
いずれも**実害のある呼び出しは 0 件**（latent）だったが、検出器は素通りさせる状態だった。

| 検査 | 何を見ていたか | 素通りする形 |
|---|---|---|
| `aiRouteRateLimit` | `/checkRateLimit\s*\(/` | 呼んで**結果を捨てる**。`checkRateLimit()` は Response か null を返すだけで、return しなければ何も止まらない |
| `activationGates` | 生ソースへの `src.includes(...)` | **コメントの言及**と **import 行**だけで合格。Gate の判定を読まなくても合格 |
| `serverActionGuards` | 呼び出しの存在 | `const ok = requirePermission(...)` と**結果を捨てる**形 |

3本とも、**main の検出器では変異が緑のまま通ることを実測してから**締めた
（AI ルートのレート制限を丸ごと外す／発行ゲートの判定を無視する／認可の結果を捨てる —— 
いずれも旧検出器では合格）。締めた後は3本とも赤になる。
述語を値で動かす「検出器そのものの性質」テストも各検査に足した。

残り11本は同じ形ではなかった。理由も残す ——
`orderCertificates` / `tenantLink` / `piiShield` は**列名の配列を許可リストと `toEqual`**
で突き合わせており、読み取れなければ throw する（コメントでは満たせない）。
`deepLinkRoutes` / `mobileIcons` / `errorMessageField` / `voidCertificate` /
`resourcePdf` は値または実行結果で検査している。`apiRoutePermissions` は
**否定形まで要求する `enforces()` を既に持っていた** —— 今回の3本はここに揃えた。
`permissions` の消費側ピンは私が同日に書いたもので、生ソース照合だったので同じく直した。

**テストの外側でも同じ形が1つ見つかった**: `.husky/pre-push` は
`git diff --name-only HEAD @{push} 2>/dev/null` の結果で doc-only 判定をしていたが、
**`@{push}` は新規ブランチの初回 push では解決できない**。その失敗を `2>/dev/null` で
握りつぶすと出力が空になり、grep が「非 doc ファイル無し」と判定して
**テストが丸ごとスキップ**される。つまり新しいブランチの初回 push は、何を変えていても
一度も走らないまま通っていた（この棚卸しの push 自身がそうなって気づいた ——
`.ts` を6本変えているのに「doc-only push, skipping vitest」と出た）。
「比較できなかった」を「変更なし」と読む形。解決できないときは既定ブランチと比べ、
それも無ければ全部走らせる形に直した。**迷ったら走らせる側に倒す。**

**この棚卸しで型 G の再発防止は「仕組みあり」になった**: `stripComments()` を
`sourceScan.ts` に集約し（2ファイルに複製されていた）、構造テストは全部これを通す。

**なお、締めた述語自体にも穴があった**（マージ直前の数え直しで発覚）。
`checkRateLimit` の呼び出しを「代入形」だけで数えていたが、
`customer/line-login` は `if (await checkRateLimit(req, "auth")) return ...` と
**変数に受けずその場で弾いて**いた。AI ルートがこの書き方をすると誤検知する。
この向きは**誤検知（うるさく落ちる）**なので静かな穴ではないが、直した。
併せて「代入形の数と `checkRateLimit(` の総数が合わなければ false」を足し、
**知らない書き方は「制限あり」に倒さない**（fail closed）ようにした。
—— **検出器を締めた直後にも、その検出器を同じ目で見る。** 一度で終わりにしない。

**そして自動レビューが、締めた述語の穴を さらに 7件 見つけた**（同日、PR #1043）。
すべて**この棚卸しが対象にしていたのと同じ形**だった。私は「呼んでいるか」を
「効いているか」に直したつもりで、実際には**一段浅いところで止めていた**。

| 指摘 | 私が見ていたもの | 素通りする形 |
|---|---|---|
| コメントを落としていない | 生ソース | レート制限の呼び出しとガードを**丸ごとコメントアウト**すれば合格 |
| 弾く向きを見ていない | `if (!?limited)` の両極 | `if (!limited) return limited` —— **通すべきを弾き、弾くべきを通す** |
| 判定を読むだけ | `certGate.ready` がどこかにある | `logger.info(certGate.ready)` の後に無条件で発行 |
| 走行距離が条件になっていない | 呼び出しの存在 | `certificateMileageKm(x);` と結果を捨てる |
| 否定が制御フローに繋がっていない | `!requirePermission(` | `const denied = !requirePermission(...)` の後に書き込み |
| export を1本ずつ見ていない | ファイル全体で1回 | 4本のうち1本からガードを外しても他の3本で合格 |
| 消費側ピンが呼び出しだけ | `requiredPermissionForPath(` / `<AdminRouteGuard>` | 結果を捨てる／`children` を外に出す |

**さらに、直している最中に自分で2つ踏んだ。** どちらも変異テストで出た。

1. 関数の本文を切るとき、**返り値型の中の `{`** を本文の始まりと読んだ
   （`): Promise<ActionResult<{ id: string }>> {`）
2. それを直したら、今度は**型の中の `;` で打ち切って本文なしと判定**し、
   呼び出し側がその export を **`continue` で黙って検査対象から外していた**。
   変異が緑のままだったのはこれが理由。**「分からない」を「合格」に倒していた。**

**なぜ気づけなかったか**: 「構造から振る舞いへ」の一歩を進めた時点で、進んだこと自体に
満足した。**一段深くしただけで、深さが足りているかは確かめていない。**
変異テストも「私が思いついた壊し方」しか試していないので、思いつかなかった形は残る。

**追加の再発防止**:
- **述語を書いたら、その述語自身に対して「緑のまま壊す形」を挙げる。**
  1つ挙げて潰したら、もう1つ挙げる。挙がらなくなるまで続ける
- **分からないものは必ず落とす（fail closed）。** 本文が切れない・書き方が未知・
  数が合わない —— どれも「合格」ではなく「報告」に倒す。
  `continue` と `?? true` は、検査から静かに対象を消す2大経路
- 他人（自動レビュー）に見てもらう工程を飛ばさない。**7件中7件が正しい指摘**で、
  自分の変異テストでは1件も出せていなかった

**2巡目でさらに8件。ここで手段そのものを変えた。**

1巡目の指摘を全部潰した後、2巡目でまた8件出た。しかも複数が
「fresh evidence that the earlier finding remains after the rewrite」—— つまり
**同じ穴が形を変えて残っている**という指摘だった。**収束していなかった。**

並べると根が1つだと分かる。

```
if (limited) logger.warn(); return callModel();   // return が if の外
if (gate.ready) { logger.info(); } activate();    // 分岐が発行を包んでいない
if (a) { const v = f(); if (v) return v; }
if (b) { const v = f(); }                         // 同名・別スコープのガードを流用
export const mutate = async () => { ... }         // function 宣言ではないので見えない
await authorize(); return write();                // throw しないヘルパーの結果を捨てる
void 0; // if (limited) return limited;           // 行末コメントに書いてある
```

**7件とも「その文がその分岐の中にあるか」を問うている。**
これは入れ子構造の話であって文字列の話ではないので、**正規表現では原理的に書けない。**
私は2巡ぶん、書けないものを書こうとして継ぎ足していた。

`ts.createSourceFile` で構文木を歩く形に置き換えた（`src/lib/__tests__/astScan.ts`）。
`typescript` は既に依存にあり、リポジトリ内の `ponytail:` コメント自身が
「誤判定が出たら AST に置き換える」と書いていた —— **道具を替える判断が遅れた。**
木の上なら「then 分岐が必ず抜けるか」「分岐が発行を包むか」「同じスコープの後ろの文か」
がそれぞれ一行で書ける。**コメントは構文木に無いので、M-022 の罠も原理的に消える。**

**なぜ気づけなかったか**: 指摘を1件ずつ「直せる修正」として処理していた。
**7件を並べて共通の形を見る**ことをしなかった。1件ずつ見ると regex の調整に見え、
並べて見ると「regex では書けない種類の問い」だと分かる。
1巡目の時点で並べていれば、2巡ぶん早く手段を替えられた。

**追加の再発防止**:
- **同種の指摘が2巡続いたら、個別に直す前に並べて共通の形を書き出す。**
  「同じ穴が形を変えて出ている」は、直し方ではなく**道具**が違うという合図
- **「この問いは今の道具で表現できるか」を先に問う。** 表現できないものを
  近似で追いかけると、近似の穴が無限に出る
- コード中の `ponytail:` コメントに書いた「限界と乗り換え先」は、**限界に当たった
  時点で読み返す**。今回それが書いてあったのに読まなかった

**3巡目（利用上限に当たる直前）で、さらに6件。うち5件が現行 head にも残っていた。**

AST 化で2件（波括弧の素朴な数え上げ・コメント除去）は消えたが、残りは**別の軸**だった。

| 指摘 | 中身 |
|---|---|
| UTF-16 と コードポイント | `[...src]` はコードポイント配列だが `pos`/`end` は **UTF-16 単位**。絵文字1つで位置がずれる |
| `.ts` を TSX 文法で解いた | 総称のアロー `<T,>(x) => x` が JSX と曖昧になり木が壊れ、以降のコメントを取りこぼす |
| **順序を見ていない** | レート制限が AI 呼び出しの**後**でも合格（弾かれた要求は既に課金済み） |
| **順序を見ていない** | 認可が書き込みの**後**でも合格（`await write(); if (!perm) return;`） |
| 判定が描画を止めているか | `const denied = !can(perm);` と書いて素通りしても合格 |

**「効いているか」には順序も入る。** 木に移して「分岐の中にあるか」は見られるように
なったが、**「その前にあるか」を見ていなかった**。位置（`getStart()` / `getEnd()`）を
比べれば一行なのに、そこに思い至っていない。同じ「一段浅い」を、道具を替えた後にもやった。

文字の数え方も同じ形である。**`[...str]` と `str.slice()` は違う単位**という、
言語の仕様として決まっている事実を確かめずに書いた（型 F: 確認できる事実を確認しない）。

**追加の再発防止**:
- **「守っている」を書くときは、必ず「何より前か」を書く。** 守る対象があるということは
  順序があるということ。分岐の内外だけでは足りない
- **位置を持つ道具（構文木）に移ったら、位置を使う。** 移っただけで満足しない
- 文字列の添字を扱うときは、**その API の単位（UTF-16 / コードポイント）を確かめる**

**なお 3巡目で Codex の利用上限に達した。** 以降の検証は自分の変異テストだけになる。
14通りの変異で赤を確認しているが、**「自分が思いつかなかった形」は依然として残りうる**。
この限界は消えていない。

---

## M-20260906-column-exists-read-as-populated 列が「ある」ことを「中身が入る」と読み、深刻度を過大に報告した（2026-09-06・旧 M-032）

**Before**: PR #1034 で `academy_cases` の公開範囲を絞ったとき、深刻度をこう書いた。

> `academy_cases` は `photos`（施工写真）と `vehicle_info`（車両情報）を持つ。
> 公開時に `anonymized = true` は立つが、それは店名を伏せるだけで写真は伏せない。

これを PR 本文・`DECISION_LOG`・`RELEASE_LOG`・`LEDRA_CURRENT`・マイグレーションの
ヘッダコメントに書いた。根拠は**列がスキーマに存在すること**だけだった。

**After**: **`photos` も `vehicle_info` も、どの書き込み経路でも設定されていない。**
`academy_cases` への書き込みは3箇所（候補作成の upsert / 公開の update / フィードバックの
カウンタ）で、いずれも触っていない。**誰も書かない死んだ列**である。

なお「常に NULL」と書くのも誤り。両列は `NOT NULL DEFAULT`（`photos` は `'[]'`、
`vehicle_info` は `'{}'`）なので、**NULL にはならず空の既定値のまま残る**。
この点は Codex のレビューで指摘されて直した。`IS NULL` で棚卸しすると空振りする。
**1度目は「入っている」と誤り、2度目は「NULL である」と誤った。**
実物を見ずに言い換えただけだと、精度が上がったように見えて誤りが残る。

つまり anon に見えていたのは AI 生成のテキストとメタデータであって、**施工写真ではなかった**。
RLS を絞った判断は変わらないが、**述べた深刻度は実態より重かった**。

なお本番の `academy_cases` は 0 件なので、どちらにせよ露出した実データは無い。
「実害なし」と書いていた点は正しい。

**なぜ気づけなかったか**: スキーマを読んで「列がある」を確認した時点で、確認したつもりに
なった。**列の存在は「入れられる」であって「入っている」ではない。**
書き込み側を1回 grep すれば済んだ（実際、今回はそれで分かった）。

M-031（存在しない関数名で grep）と同じ日に、同じ「読まずに決める」をやっている。
向きが逆なだけで、**確かめずに事実を述べた**点は同一である。

**再発防止**:
- 仕組み無し（判断に依存）。習慣を1つ。
  - **「この列にはXが入る」と書く前に、その列への書き込み経路を grep する。**
    スキーマは入れ物の形しか語らない。中身を語れるのは書き込み側だけ
- 今回の訂正先: `DECISION_LOG` / `RELEASE_LOG` / `LEDRA_CURRENT` /
  `supabase/migrations/20260905142740_*.sql` のヘッダ（いずれも同 PR で修正）

---

## M-20260905-grepped-nonexistent-name 存在しない関数名で grep し、0件を「誰も使っていない」と読んだ（2026-09-05・旧 M-031）

**Before**: PR #1030 のセルフレビューで「画面の権限は誰が見ているのか」を調べた。
`src/lib/auth/permissions.ts` に `ROUTE_PERMISSIONS[pathname]` を返す関数があるのを見て、
**その宣言行を読まずに** `getRequiredPermission` という名前だと思い込み、
`grep -rn "getRequiredPermission" src/` を打った。**0件。** `src/middleware.ts` も無い。

ここから「この表を強制している場所は無い」と結論し、チャット・PR 本文・`LEDRA_CURRENT`・
`RELEASE_LOG`・`DECISION_LOG`・`OPEN_QUESTIONS`・`NOTE_CANDIDATES` に**事実として書いた**。
note候補には「誰にも参照されていない設定表の話」という題まで付けた（社外発信の候補である）。

**After**: 実際の関数名は **`requiredPermissionForPath`**。
`src/app/admin/AdminRouteGuard.tsx` が呼んでおり、その `AdminRouteGuard` は
`src/app/admin/layout.tsx` で**全 admin 画面を包んでいる**。権限が無ければ画面を
「この画面へのアクセス権限がありません。」のカードに差し替える。**表は効いていた。**

正しい状態は「クライアント側では全画面に効いている／サーバ側の強制が無い」。
`/admin/site-content` にサーバ側ガードを足した判断は変えない —— クライアント判定は
`/api/admin/me` の応答待ちで走るため、**Server Component の取得はその前に完了しており**、
権限の無い相手にもクエリが実行されて結果が RSC ペイロードに載る —— が、
**述べていた理由（「押せば必ず forbidden になるボタンが並ぶ」）は誤っていた。**

**なぜ気づけなかったか**: 3つ重なった。

1. **検索語を検証していない。** 固有名詞で引くなら、その名前は**自分が読んだ行から
   取る**べきだった。記憶から打った時点で、grep の結果は「その名前が無い」以上のことを
   言っていない。**0件は答えではなく、検索語を疑えという合図。**
2. **裏取りの経路が1本だった。** 「middleware が無い」も「サーバ側にあるはず」という
   同じ前提で探した結果で、独立していない。`admin/layout.tsx` を上から読むという
   **別経路**を取れば `AdminRouteGuard` が目に入った（実際、今回はそれで見つけた）。
3. **結論が都合よく噛み合った。** ちょうど「画面のガードが足りない」を直していたので、
   「表は誰も見ていない」はその話を強くする。**反証を探す動機が消えていた。**

型 A の再発防止（「自作の走査スクリプトの数字を文書に書く前に、既知の1件で当たりを取る」）は
**検出器には適用したが、grep 1本には適用しなかった**。「スクリプト」と呼べる規模でないと
道具だと思っていない。**grep も検出器である。**

なお、今回の調査で作った検出器の方には当たりを取っている。「表に無い＝無防備」で
数えかけたが、`/admin/report-revenue`（表に無いがサーバ側で判定している）が
正しく分類されるかを見て、その読み方が誤りだと分かった（同型が17枚あった）。
**道具を検証する手順は身についている。grep をその対象に入れていなかっただけ。**

**再発防止**:
- 仕組み無し（判断に依存）。習慣を2つ。
  - **固有名詞で grep する前に、その名前をファイルから1回コピーする。**
    宣言行を開かずに名前を打ったなら、その検索結果は使わない
  - **「無い」と報告する前に、逆方向から1回探す。** 「X を呼ぶ場所」が0件なら、
    次は「X が在るべき場所」（レイアウト・エントリポイント）を開いて読む
- 誤りが既に共有物に出ていたら、**出した先を全部数えて直す。**
  今回は docs 5ファイル + コード内コメント1件 + PR 本文（grep で洗い出した）

---

## M-20260904-check-never-ran-in-ci 「再発防止に入れた検査」が、CI で一度も動いていなかった（2026-09-04・旧 M-028）

**Before**: M-027 の再発防止として `lint-migrations` に
`migration-version-before-base-head` を足した。base ブランチのファイル一覧を
`git ls-tree origin/main:supabase/migrations` で引き、追加ファイルがそれより後の
バージョンかを見る。**手元でわざと壊して落ちることまで確認**し、PR 本文にも
「これで再発しません」と書いた。base ref を引けない場合は「見送る」設計にして、
`ponytail:` で「天井は base ref を持たない CI では効かないこと」と書いた。

**After**: `/code-review` の指摘。**`.github/workflows/ci.yml` の
`actions/checkout@v7` は既定 depth 1 で、`origin/main` も `main` も存在しない。**
つまり CI では毎回「引けない」経路に入り、注記を1行出して exit 0 していた。
**本番の db push を止める変更は、この検査があっても緑で通る。**
自分で「効かない条件」を書いておきながら、その条件が CI そのものだと確かめていない。

- 対処: (a) ci.yml に base ref を depth 1 で取るステップを足し、
  `MIGRATIONS_BASE_REF` で名指しして渡す（PR の base が staging でも正しく比較する）。
  (b) **CI で base ref を引けなかったら落とす**ようにした。見送りは手元だけ。

**なぜ気づけなかったか**: **検査を「手元で落ちること」だけで検証した。**
落ちることは確かめたが、**CI で走る条件を満たすか**を確かめていない。
M-030「手元で全部通ったを実物でも通ると読んだ」と同じ形を、
その M-030 を書いた PR の中でやった。しかも今回は自分で天井を書いており、
**天井を書いたことで検証した気になっていた**のが悪質。
注記は検証ではない。「効かない条件」を書いたなら、その条件に実際に当たるかを
1回引く（`grep fetch-depth .github/workflows/ci.yml` で済んだ）。

**再発防止**: 見送り経路を**CI では失敗にした**ので、同じ形（検査が黙って
何もしない）はもう緑にならない。仕組みで止まる。
一般化: **「〜の場合は見送る」を書いたら、その場合に実際に当たらないことを
1コマンドで確かめる。** 見送り経路が本番経路だった、が M-028 の中身。

**続き（同じ日、同じ検査で2度目）**: その「CI では落とす」を入れた結果、
**既存の `scripts/__tests__/lint-migrations.test.ts` が CI で8件落ちた。**
このテストはスクリプトを一時ディレクトリへコピーして走らせるが、そこは git
リポジトリではないので base ref が引けない。CI では `CI=1` なので、私の新しい
ガードが全呼び出しを exit 1 にしていた。

手元では緑だった。**`CI` を立てずに走らせたから。** M-028 の本文に
「CI で走る条件を満たすか確かめていない」と書いた直後に、同じことをもう一度やった。

- 対処: 「そもそも git リポジトリでない」場合は CI でも見送る
  （`git rev-parse --is-inside-work-tree`）。落とすのは
  **「repo なのに base ref が無い」＝ CI の設定ミス**だけに絞った。
- 検査を足した: 同テストに3件追加（backdated を足すと落ちる / 後ろの日付なら通る /
  git 管理外でも CI で落ちない）。ルールを無効化すると落ちることも確認済み。
- 習慣: **環境変数で分岐を書いたら、その分岐を立てた状態でテスト一式を回す**
  （`CI=1 npx vitest run`）。分岐を足した本人にしか、その必要は見えない。

## M-20260904-six-migrations-blocked-prod 再生を通すために新しいマイグレーションを6本足し、本番の適用を止めるところだった（2026-09-04・旧 M-027）

**Before**: PR #1025 で、空 DB の再生を通すために「依存が揃った位置」へ補いの
マイグレーションを**新しいファイルとして**5本置いた（+ レビュー対応で1本）。
バージョンは `20260313030000` 〜 `20260826000007`。**再生が通ることだけを見ていた。**
`check:migrations` は 447/447、CI も全部緑、`Supabase Preview` も緑だった。

**After**: Codex のレビューが P1 で指摘。**6本すべてが本番の適用済み最新
`20260904123252` より古い。** 本番の `supabase db push` は、最新より古い未適用が
あると out-of-order で停止する。マージしていたら、**この PR 以降のマイグレーションが
本番へ一切届かなくなっていた。** 2026-08-02〜08-15 に同じ形で13日間止まり、
証明書発行が全件停止している。`OPEN_QUESTIONS` によればこの形は5回目。

- 対処: 6本を全部消し、中身を**依存が揃った位置の既適用ファイルの末尾**へ移した
  （`20260313020000_core_tables.sql` 等）。適用済みファイルは版番号が変わらない限り
  再適用されないので、中身をいくら変えても本番に影響が無い。**新しいバージョンは0本**に
  なった。再生は 441/441 で通り、消した6本が作っていたテーブル・列・索引・権限が
  すべて再生 DB に在ることを1件ずつ確認した。
- 権限については本番の `pg_proc.proacl` も引いて、再生 DB と一致することを確認した
  （`{postgres=X,service_role=X}`）。これで「本番へ当てる必要がある変更」ではないと
  確定したので、後ろの日付へ改名する必要も無くなった。

**なぜ気づけなかったか**: **検査が緑であることを、正しさの証明として扱った。**
再生検査もプレビュー DB も「空 DB に流せるか」しか見ていない。本番は空ではなく、
**既に適用された台帳を持っている**。この PR がやっていたのは「空 DB 向けの都合で
過去の位置にファイルを増やす」ことで、台帳を持つ側から見れば最悪の操作だった。
検査の対象が本番でないことに、一度も気づかなかった。

**しかもこれは、このリポジトリが既に文書化していた。** `.github/workflows/db-migrate.yml`
に不変条件として20行書いてあり、`DECISION_LOG` 2026-08-26 には
**「マイグレーションを含む PR は、マージ直前に本番の `schema_migrations` の最新
バージョンと突き合わせる。CI の緑をこの確認の代わりにしない」**と、自分が書いた文が
そのまま残っていた。読まずに、書いてあるとおりのことをやった（M-021 と同じ形）。

**再発防止**: `scripts/lint-migrations.js` に `migration-version-before-base-head` を
追加した。**このブランチが追加したファイルが、base ブランチに在るどのファイルよりも
後のバージョンでなければ落ちる。** base の最新 ≥ 本番の最新 なので、通れば
out-of-order にならない（十分条件）。本番へ問い合わせずに CI だけで判定できる。
わざと古い日付のファイルを置いて落ちることを確認済み。
**ただしこの検査は最初 CI で一度も動いていなかった（M-028）。** ci.yml で base ref を
取り、引けなければ CI では落とすようにして閉じてある。

## M-20260904-missed-second-uploader 「カメラ撮影に限定」を1つのアップローダにだけ入れ、もう1つの入口を見落とした（2026-09-04・旧 M-025）

**型**: C（経路を1本しか見ない）。しかも **同じセッションで M-023（型C）を台帳に取り込んだ直後**にやった。

**Before**: C2PA の `digitalCapture` 過大主張を直すため「施工写真をカメラ撮影に限定」を実装。
`certificates/new/PhotoUploadSection.tsx`（証明書**作成**フロー）からアルバム/DnD を削除し、
「camera-only にした」と GPSA・DECISION_LOG・図に書いてコミットした。tsc/lint/テストも通した。

**After**: **署名パイプライン `/api/certificates/images/upload` に投げる入口はもう1つあった** —
`certificates/[public_id]/CertImageUpload.tsx`（証明書**作成後**に写真を追加する画面）。ここに
multi-file の「写真を追加」ピッカーが残っており、ギャラリー/編集/生成画像が同じ署名経路に流れて
`digitalCapture` を付けられ続けていた。Codex（PR #914, `c2pa-gpsa.md:54`）が指摘。CertImageUpload も
camera-only にして解消。作成フロー（PhotoUploadSection）と作成後フロー（CertImageUpload）は別入口だった。

**なぜ気づけなかったか**: 「カメラ撮影に限定」を **UI コンポーネント1つの話**と読み、
**同じ API エンドポイントに投げる UI を全部**数えなかった。M-023 で main が
「権限を動かしたら文字列を grep して参照元を全部数える」と書いていたのに、
今回の私は「`/api/certificates/images/upload` を叩く UI を全部 grep する」を着手前にやらなかった
（Codex 指摘後に初めて grep した ＝ CertImageUpload と CertNewFormWrapper が出た）。
**台帳に型Cを取り込むことと、自分の作業で型Cを潰すことは別。** 引くのは着手前。

**再発防止**:
- 習慣: **「入力経路を絞る/塞ぐ」変更は、対象の共有先（API エンドポイント・共有ハンドラ）を
  1つ決め、それを叩く UI/呼び出し元を grep して全数え上げてから着手する。**
  今回なら `grep -rl "certificates/images/upload" src` で作成前・作成後の両フローが出る。
- 仕組み: 署名時の `digitalSourceType` は現状「撮影経路に UI を限定している」ことに依存する（コードでは
  保証しない）。将来 `signC2pa` に「検証済み撮影シグナル」を渡して digitalCapture を出し分ける案を
  OPEN_QUESTIONS に起票済み（2026-09-04「digitalCapture 主張の厳密化」）。それが入れば UI 限定漏れが
  あっても過大主張にならない。

## M-20260904-ours-merge-dropped-17 マージ衝突を「HEADが上位集合」と判断して `--ours` で解決し、main の未解決17件を消した（2026-09-04・旧 M-024）

**型**: A（道具を検証しない）。加えて CLAUDE.md「検出器を変えたら、一覧から消えたものを
1件ずつ確認する」の直接違反。

**Before**: PR #914 で `origin/main` を2回マージ。`docs/context/OPEN_QUESTIONS.md` の衝突を
解決するとき、「自分のブランチ(HEAD)は main の内容を含む上位集合だ」と判断し `git checkout --ours`
で HEAD 側を採用した。判断の根拠は、LINE・DB drift・db-typegen など**特定の数エントリが HEAD に
存在すること**を `grep -c` で確認しただけ。

**After**: 実際は HEAD 側が過去にファイルを再編（要約ブロック追加・重複統合）した際に、main 側の
**未解決17件（Phase 0→1 資金閾値・損保初期アプローチ・信用回復ローン法務3件・アプリロック2件など）を
落としていた**。`--ours` はその欠落をそのまま確定させた。Codex レビュー（PR #914, OPEN_QUESTIONS.md:661）
が「stale-file overwrite で未解決記録を消している」と指摘。`diff <(main の見出し) <(HEAD の見出し)` で
消えた17件を特定し、OPEN_QUESTIONS.md を **origin/main を基準に戻して**、自分の正当な新規3件
（C2PA 申請・version 衝突・存在しない列）だけを足し直した（98→101 見出し、17件復活を確認）。

**なぜ気づけなかったか**: 「上位集合」を、集合全体ではなく**自分が思いついた数件の包含**で確認したから。
`grep -c "その数件"` は「消えていないもの」しか見ておらず、「消えたもの」は原理的に映らない。上位集合の
主張は "A ⊇ B" なので、確かめるべきは「B の各要素が A にあるか（＝A から見て何が欠けるか）」だったのに、
「A の一部が存在するか」を見て満足した。まさに型A（道具＝自分の"上位集合"判定を検証せずに事実扱い）。

**再発防止（型Aの対策が効かなかった理由込み）**: 型Aには既に「検出器を変えたら一覧から消えたものを
1件ずつ確認する」という対策がある。今回それを**マージ衝突の解決にも適用すべきと気づけなかった**
（コード検出器の話だと限定して読んでいた）。仕組み化する:
- **マージで生成ファイル以外のドキュメント/データ衝突を `--ours`/`--theirs` で片側採用する前に、
  必ず `diff <(git show <相手>:F | grep '^#') <(git show <自分>:F | grep '^#')` で
  「相手にあって自分に無い見出し」を出力し、0件を確認する。** 0件でなければ片側採用は禁止、両側マージする。
- OPEN_QUESTIONS/DECISION_LOG など追記型ログは「新しい方が上位集合」が成り立たない（両者が別々に追記
  するため）。これらの衝突は原則マージ（両側保持）で解く。片側採用は見出し差分0件を確認できたときだけ。

---

## M-20260904-repeated-m019-shape 「M-019 と同じ形」を書いた PR で、M-019 と同じ形をやった（2026-09-04・旧 M-023）

**Before**: PR #1030 で `site_content:*` を super_admin 限定にした。ナビ
（`adminNav.tsx`）とフィーチャーカタログは `requiredPermission: "site_content:view"` を
見ているので、加盟店のメニューからは消える。Server Action 側も
`requirePermission(caller, "site_content:manage")` で塞いだ。**検査も書き、ガードを消して
落ちることまで確認して**出した。

PR 本文にはこう書いていた——「`site_content:view` は viewer を含む全ロールが持っていたので、
何も変更できない画面のメニューが全員に出ていました（**M-019 と同じ形**）」。

**After**: **画面3枚（一覧・新規・編集）が「ログイン済みか」しか見ていなかった。**

- `src/middleware.ts` は**存在しない**。`ROUTE_PERMISSIONS`（`/admin/site-content` →
  `site_content:view`）を読む関数の**呼び出し元は0件**
  【**2026-09-05 訂正**: これ自体が誤りだった。関数名は `requiredPermissionForPath` で、
  `AdminRouteGuard` が呼んでいる。存在しない名前で grep していた → M-031】。
  つまりこの表はナビの出し分けにしか効いていない
- ナビから消えても URL 直打ち・ブックマーク・履歴では開ける。開くと
  **押せば必ず `forbidden` になる「編集」「削除」「公開」ボタンとフォーム**が並ぶ
- 実害は権限の穴ではない（Server Action と RLS は正しく弾く）。**M-019 で自分が書いた
  「押せば必ず403になるボタンを見せない」に、自分が違反した**

**なぜ気づけなかったか**: 「権限表を直した」を「経路を全部直した」と読み替えた。
権限表の変更は**表を読む側の数だけ**波及するのに、確認したのは
Server Action（`requirePermission` を呼ぶ側）だけだった。**`site_content:view` の
参照元を grep すれば `adminNav.tsx` と `catalog.ts` が出てきて、
「ではナビ以外の入口は？」に到達できた。** 実際、この grep は PR を出した後の
セルフレビューで初めて打った。

もう一つ。**M-019 を引用したことで、確認したつもりになった。** 型を名指しできることと、
その型を潰したことは別である。台帳を引くのは着手前であって、PR 本文を書くときではない。

**再発防止**:
- `serverActionGuards.test.ts` に**3画面が `requireSiteContentAdmin()` を呼んでいること**を
  検査する項目を追加（1枚から外して落ちることを確認済み）
- 習慣: **権限（`Permission` の値）を1つでも動かしたら、その文字列を grep して
  参照元を全部数える。** 画面・ナビ・API 表・Server Action は別々の入口である
- なお `ROUTE_PERMISSIONS` が誰にも強制されていない件は、この PR の範囲を超えるので
  `OPEN_QUESTIONS.md` に起票した

---

## M-20260904-detector-hit-own-comment 自分が書いた説明コメントに、自分の検出器が反応した（2026-09-04・旧 M-022）

**Before**: Server Action の認可を固定するテストを書いた。検出器は
`requirePermission(|requireMinRole(|hasPermission(|hasMinRole(|...` をファイル本文から探す形。
書き終えて緑になったので、**ガードを1本消して落ちるかを試した**。

**After**: **落ちなかった。** 原因は、直した `site-content/actions.ts` に自分で書いた
説明コメントである。

```ts
// ここは長く `hasMinRole(role, "staff")` を要求していたが、DB の RLS は …
```

**「なぜ以前はこう書いていたか」を残した引用が、検出器に認可として拾われた。**
実際のガードを消しても、コメントが残っている限り緑のまま。
照合前にコメントを落とすようにして解決した。

**なぜ気づけなかったか**:
コメントは「読む人向けの説明」であって「コード」ではない、と暗黙に分けていた。
**正規表現から見ればどちらもただの文字列**。
今日ちょうど「なぜこう書いていたかを残す」ことを増やしたので、
**記録を丁寧にするほど検出器が汚染される**という関係になっていた。

M-002（`admin:` が `super_admin:` に部分一致）、M-006（業務ロジックを認可と誤認）と同じ family。
今回違うのは、**誤認の材料を自分で書き足していた**こと。

**もう1つ重要なのは、これが「ガードを消して落ちるか」を試したから見つかったこと。**
テストが緑になった時点で終えていたら、**認可を守らないテストを「守っている」と信じて**
そのまま出していた。

**再発防止**:
- 仕組み: 検出器はコメントを落としてから照合する（`stripComments`）。
- 習慣: **新しい検出器を書いたら、必ずガードを1本消して落ちることを確かめる。**
  緑は「壊れていない」の証拠にならない。**「壊したときに落ちる」ことだけが証拠**

---

## M-20260904-migration-rules-unread 手順書を読まずにマイグレーションを書き、規約の半分を linter に教わった（2026-09-04・旧 M-021）

**Before**: マイグレーションを書くとき `docs/operations/migrations.md` を開かなかった。
`ADD CONSTRAINT ... CHECK` をそのまま書き、`npm run lint:migrations` に
「`NOT VALID` を付けろ」と言われて初めて直した（M-018）。

**After**: その手順書の「新しいマイグレーションを書くとき」の節には、
linter が言ったのと**同じ行に**続きが書いてある。

> `ADD CONSTRAINT ... CHECK` は `NOT VALID` を付け、**`VALIDATE` を別ファイルにする**。

`VALIDATE` の分割は **linter が見ていない**ので、直したつもりで規約の半分しか
満たしていなかった。先例（`20260425000000_shop_money_check_constraints` と
`..._validate`）も既にあった。

同じ節にはもう1つ、本番適用後に効く規約があった。

> 本番へ適用したら、ファイル名と**記録されたバージョンが一致しているか**を確認する。

`apply_migration` は自分でタイムスタンプを振るので、リポジトリの
`20260904000000` に対し本番は `20260904123252` になった。**放置すると、
既に適用済みの `20260904060245` より前のファイルが未適用として残り、
out-of-order で `db-migrate` が止まる。** このリポジトリは同じ形で過去に3回止まっている
（DECISION_LOG 2026-08-30 前後）。ファイル名を記録バージョンに合わせて解消した。

**なぜ気づけなかったか**:
**linter が通ったことを「規約を満たした」と読んだ。** linter は規約の一部しか
機械化できない。M-018 で「CI が何を走らせるか確かめずに、自分が走らせたもので代用した」
と書いたのに、今度は「**linter が見ているものを、規約の全体だと思った**」。
形は同じで、代用したものが「隣のスクリプト」から「機械検査」に変わっただけ。

**再発防止**:
- 仕組み: 無し（`VALIDATE` の分割は linter に追加できるが、
  「適用後にファイル名を合わせる」は機械検査できない）。
- 習慣: **`supabase/migrations/` に新しいファイルを作る前に
  `docs/operations/migrations.md` の「新しいマイグレーションを書くとき」を開く。**
  linter が通ってもそこで終わりにしない。
  本番へ適用したら `list_migrations` で記録バージョンを見て、ファイル名を合わせる

---

## M-20260904-ran-adjacent-script 隣のスクリプトを走らせて「検証した」と書いた（2026-09-04、M-015 の再発・旧 M-018）

**Before**: マイグレーションに `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` を書き、
`npm run check:migrations`（空DBへの再生）が通ったので**「検証: 再生OK」と PR に書いた**。

**After**: CI が走らせるのは **`npm run lint:migrations`**（`scripts/lint-migrations.js`）で、
そちらは落ちる。`add-check-without-not-valid` — `ADD CONSTRAINT ... CHECK` を一発で書くと
ACCESS EXCLUSIVE ロックのまま全行スキャンするため、`NOT VALID` を付けてから
`VALIDATE CONSTRAINT` を別文で打て、という規約がある。`/code-review` の指摘で発覚。
**そのまま push していれば CI が赤になっていた。**

**なぜ気づけなかったか**:
`check:migrations` と `lint:migrations` は名前が似ていて、**どちらもマイグレーションを
検査する**。片方を走らせて「マイグレーションは検証した」と丸めた。
`package.json` に2つ並んでいるのを見れば分かる。

M-015（スタック PR で CI が回らないのに「実行中」と報告した）と**同じ根**。
あのときも `.github/workflows/ci.yml` を読めば7行目に書いてあった。
**CI が何を走らせるかを確かめずに、自分が走らせたもので代用している。**

**再発防止**:
- 仕組み: 無し（判断に依存）。
- 習慣: **PR に「検証」と書く前に `.github/workflows/ci.yml` の該当ジョブを開き、
  そこに並ぶコマンドを上から順に実際に叩く。** 「マイグレーションを検証した」ではなく
  「`lint:migrations` と `check:migrations` を叩いた」と、コマンド名で書く。
  名前で丸めた時点で、どれを走らせたか分からなくなっている

---

## M-20260904-four-screens-dead-buttons 認可を足した経路の「押せないボタン」を4画面ぶん見落とした（2026-09-04・旧 M-019）

**Before**: API の権限を上げた（テナント設定を owner に、削除を admin に）。
サーバ側のガードを入れ、権限表を更新し、テストを書いた。**API の話として完結させた。**

**After**: 画面側の出し分けが古いまま4箇所残っていた。

| 画面 | 出し分け | API | 結果 |
|---|---|---|---|
| 証明書作成の「デフォルトとして保存」 | `settings:edit`（admin可） | owner | admin に**毎回失敗するボタン** |
| 設定画面の「設定を保存」 | ガード無し | owner | admin がフォームを全部入力してから失敗 |
| 顧客一覧の「削除」 | `MutationGuard`（staff可） | admin | staff に**毎回403のボタン** |
| マーケット車両の「削除」 | ガード無し | admin | 同上 |

しかも証明書作成の画面には、**「押せば必ず 403 になるボタンを見せない」という
コメントが自分で書いてあった**。その不変条件を自分で壊した。

**なぜ気づけなかったか**:
「認可を強くする」を**サーバの仕事**だと思っていた。権限は API と画面の2箇所に書いてあり、
**片方だけ動かすと必ずズレる**。M-005 / M-013 と同じ型（経路を1本しか見ない）だが、
今回は「複数の API 経路」ではなく「**API と、それを叩く画面**」という縦の関係だった。

**再発防止**:
- 仕組み: 無し（`MutationGuard` の minRole と API の要求を突き合わせる検査は書けるが、
  権限の表現が両者で違う（Permission と Role）ため機械照合が難しい）。
- 習慣: **API の要求を上げたら、その API を叩いている画面を grep して出し分けを直す。**
  `grep -rn "<そのパス>" src/app` で1分。ガードを入れるだけで終わりにしない

---

## M-20260904-insert-only-guard 「INSERT を塞げば十分」と、UPDATE を読まずに判断した（2026-09-04・旧 M-020）

**Before**: 共有テンプレートをテナントが作れないようにする、と決めたとき、
`templates` の **INSERT ポリシーだけ**を見て「`templates_insert_v2` に scope 条件を足せばよい」
と設計した。

**After**: `templates_update_v2` は **WITH CHECK を持たず、USING も `scope` を見ない**。
既存の自テナント行を `scope='shared'` に**書き換えられる**。INSERT だけ塞いでも無意味だった。
`pg_policies` を cmd 別に一覧して初めて気づいた。

**なぜ気づけなかったか**:
「作れないようにする」という言葉に引きずられて **INSERT を探した**。
行が shared になる経路は INSERT と UPDATE の2つあるのに、片方の名前しか頭に無かった。
**「その状態になる方法」ではなく「その動詞」で探した**のが誤り。

これは型 B（読まずに分類する）でもある。UPDATE ポリシーの存在は知っていたが、
中身（WITH CHECK が無いこと）を読んでいなかった。

**再発防止**:
- 仕組み: 今回は**ポリシーを書き換えるのではなくテーブル制約を1本置いた**。
  `CHECK (scope <> 'shared' OR tenant_id IS NULL)` は INSERT でも UPDATE でも効く。
  **将来ポリシーを足した人が塞ぎ忘れても効く**のが、この選択の主な理由。
- 習慣: 「この状態を作れないようにする」ときは、**その状態に到達する経路を
  INSERT / UPDATE / UPSERT すべてで数える。** RLS なら `pg_policies` を
  `cmd` 別に必ず一覧する（`where tablename='x' order by cmd`）

---

## M-20260904-ignored-input-type 変換コードの形だけを見て、入力欄の `type` を見ずに「同型4件」と数えた（2026-09-04・型 B・旧 M-040）

**Before**: `agent-announcements` の `new Date(naive).toISOString()`（datetime-local を
ブラウザ TZ で解釈してしまう形）を JST 固定に直したあと、同じ形が他に無いかを
`grep -rn "new Date(.*)\.toISOString()"` で探した。4件ヒットしたので、
**「`datetime-local` を naive に UTC 変換している画面が4つ残っている」**として起票し、
表に4画面を並べ、実害の見込みまで書いた。

**After**: 4件目の `LoanerCarsClient.tsx:560` の入力欄は `type="date"` だった。
日付のみの文字列は仕様上 **UTC として解釈される**ので、どの端末でも同じ値になる。
**ブラウザ TZ の問題ではない。** 他の3件とは別の論点（JST の日の境界をどこに置くか）で、
実害の大きさも違う。`/code-review` の指摘（残り3画面のみを列挙していた）で判明。

**なぜ気づけなかったか**:
**`grep` が拾ったのは「変換のコード」で、私が主張したのは「入力欄の種類」だった。**
`new Date(x).toISOString()` という形は、`x` が `datetime-local` か `date` かで
意味がまったく変わる。にもかかわらず、**ヒットした行だけを見て、
その行の `x` がどの `<input type>` から来るかを1件も確かめずに**表を書いた。
`agent-announcements` が `datetime-local` だったので、残り4件もそうだと思い込んだ。

型 B（コードの形から分類し、中身を読んでいない）。CLAUDE.md の
「判断の道具そのものを検証する」に、まさにこの形が書いてある
——「自作の走査スクリプトの数字を文書に書く前に、**既知の1件で当たりを取る**」。
`grep` も走査スクリプトである。4件のうち1件でも入力欄まで辿っていれば止まった。

**再発防止**: 仕組み無し（判断に依存）。習慣を1つ。

- **`grep` の件数を文書の主張にするときは、主張の語彙と `grep` の語彙が
  同じかを言葉にする。** ここでは grep が引いたのは「`new Date(...).toISOString()`」、
  主張は「`datetime-local` の画面」。**語彙がずれているなら、
  ずれている分を1件ずつ埋めないと件数を書いてはいけない。**
- 埋めるコストが高いなら、件数ではなく「この形が N 箇所ある（入力の種類は未確認）」と書く。

---

## M-20260904-escape-hatch-disabled-guard 安全装置に付けた escape hatch が、その安全装置を無効化していた（2026-09-04・型 B・旧 M-039）

**Before**: AI コストキャップの既定が「0（＝ブレーキ無し）」で本番が無防備だったので、
既定を月1万円に倒した。そのとき **「env に明示的な `0` を入れたら上限なし」** という
escape hatch を残した。「止めたいときに止められる逃げ道は要る」と考え、
JSDoc にも「明示的な `0` は『上限なし』の意思表示として尊重する」と書いた。

**After**: `origin/main` の `.env.example` は**長らく `AI_MONTHLY_COST_CAP_JPY=0` を配っている**。
そこから環境変数を作っていれば、本番の env は `0`。
つまり **「意思表示」だと思っていた `0` は、ただの配布既定値**だった。

結果、新しい既定 10000 は**まさに守りたい本番で沈黙して no-op になる**。
ブレーキを付け直したつもりで、付いていない。`/code-review` の指摘で判明。

**なぜ気づけなかったか**:
**`0` に「無効化したい」という意思を読んだが、その `0` がどこから来るかを見なかった。**
`.env.example` は同じ PR で自分が `0` → `10000` に書き換えている。
**書き換えたということは、書き換える前の値が配られていた**ということなのに、
「これから配る値」だけを見て「既に配られた値」を見なかった。

型 B（1段だけ深く読んで止まる）。M-036 で「`capJpy` の既定を追わなかった」と書いた
その同じ関数で、今度は **`0` の出どころ**を追わなかった。
前回は「値がどこから来るか」を追って直したのに、
今回は自分で新しく「`0` という値の意味」を決めるとき、同じ問いを立てなかった。

設計としても筋が悪かった。**安全装置の「切る」設定を、既定値と同じ表現（`0`）で
持たせてはいけない。** 「未設定」と「明示的に切った」が区別できない。

**再発防止**: 仕組みで止めた（テスト）。習慣も1つ。

- **仕組み**: `costCap.test.ts` に「env の 0 は『未設定』として扱い、既定へ倒す」を追加。
  逃げ道は「大きい値を入れる」に変え、それもテストで固定した
  （`AI_MONTHLY_COST_CAP_JPY=99999999` → その値）。
- **習慣**: **安全装置に「切る」値を用意するときは、その値が既定・サンプル・
  過去の配布物に現れていないかを先に見る。** 現れているなら、その値では切れない。
  切る手段は「別の表現」か「用意しない」の二択。

---

## M-20260904-same-eight-in-two-entries 同じ8件を2つのエントリに書き、修正 PR が片方だけを更新した（2026-09-04・型 C・旧 M-038）

**Before**: IMP-046 の遅延 Codex レビュー8件について、OPEN_QUESTIONS に
**2つのエントリ**があった。

- 「8件中2件、指標の定義自体の決め直しが必要」（6件は修正済みと明記）
- 「8件の指摘未修正」（**全部残っている前提**。「次にこのセッションが直すこと」付き）

PR #1009 が6件を実際に修正したとき、更新されたのは前者だけだった。

**After**: 後者の指示どおりに着手し、8件を1つずつ現行コードと突き合わせて、
**6件が既に直っていることを確認するのに時間を使った**（`0c4646b`。PR タイトルが
「8件中6件を修正」そのもの）。古い方を削除し、残る方に修正 PR の SHA を明記した。

**なぜ気づけなかったか**:
着手前に**同じ話題の他のエントリを探さなかった**。片方だけ読んで「未修正だ」と受け取った。
2つのエントリは見出しの文言が違う（「8件中2件」と「8件の指摘未修正」）ので、
見出しを眺めただけでは同じ8件の話だと分からない。

型 C（経路を1本しか見ない）が**文書に出た形**。同じ事実に入口が2つあり、
片方だけ直した（＝ PR #1009 の側の見落とし）ものを、こちらも片方だけ読んだ。

**再発防止**: 仕組み無し（判断に依存）。習慣にするのは次の2つ。

- **未解決事項に着手する前に、その話題の語で OPEN_QUESTIONS 全体を grep する。**
  今回なら `grep -n "IMP-046" docs/context/OPEN_QUESTIONS.md` で2件出る。
  見出しの文言は当てにならない。
- **修正した PR の番号とコミット SHA を、解決したエントリに書き残す。**
  「修正済み」だけでは次の人が確かめられない。SHA があれば `git show` 1回で済む。

補足: 今日だけで「起票時の前提が事実と違う／既に解決済み」が4件出ている
（M-034・M-035・M-036・これ）。**未解決事項は、書かれた時点の主張であって
現在の状態ではない。** 着手時に実測する手順は今のところ人の判断に頼っている。

---

## M-20260904-push-did-not-rerun-ci 「push が再 run を兼ねる」と書いた。競合で CI は4回とも走っていなかった（2026-09-04・型 F、M-015 の再発・旧 M-037）

**Before**: PR #1027 で `Lint, Type Check & Unit Tests` が `npm audit` の
`registry.npmjs.org` 503 で落ちた。この PR の失敗ではないと切り分けたところまでは正しい。
そのうえで **PR コメントと代表への報告に「再 run は今回の push が兼ねます」と書いた。**

**After**: **その後の push 4回で CI は一度も走っていなかった。**
`ci.yml` の run 一覧を引くと、このブランチの run は最初のコミット `c239dd2` の1件だけ。

原因は**マージ競合**。main が #1026 で `docs/context/` を大きく動かしており、
この PR は `mergeable_state: "dirty"` になっていた。**GitHub は競合中の PR の
`refs/pull/N/merge` を作れないので、`pull_request` の workflow がそもそも起動しない。**
main をマージして解消した瞬間、`unstable` に変わり CI が走り出した。

**なぜ気づけなかったか**:
「push すれば `synchronize` で CI が走る」を一般論として知っていたので、
**走ったことを確かめなかった**。`ci.yml` のトリガ条件（base が main/staging）は
以前 M-015 で調べていて、そこは満たしている。今回はもう一段手前、
**「そもそも merge ref が作れる状態か」**を見ていなかった。

M-015 は「チェック0件を『実行中』と読んだ」で、これは
「**push したという自分の行為を、CI が走ったことの証拠として扱った**」。
どちらも**不在を確認しないまま存在を報告している**。M-015 の再発防止に
「`.github/workflows/ci.yml` を開いて確かめる」と書いたが、
確かめる対象がワークフロー定義だけでは足りなかった。

さらに悪いのは、**代表への報告に書いたこと**。「CI は再実行される」という前提で
次の作業に進み、その間ずっと未検証のコミットが積まれていた。

**再発防止**: 仕組み無し（判断に依存）。習慣にするのは次の1つ。

- **「CI が走る／走った」と書く前に、その head SHA の run を実際に引く。**
  `list_workflow_runs` の `head_sha` が今の HEAD と一致するかを見る。
  一致する run が無いなら、走っていない。**push したことは根拠にならない。**
  あわせて PR の `mergeable_state` を見る（`dirty` なら CI は永久に走らない）。

---

## M-20260904-repeated-m035-shape M-035 を書いた直後に、M-035 と同じ形で1段浅く止まった（2026-09-04・型 A + 型 B・旧 M-036）

**Before**: M-035 に「コメントは実装ではない。for ループ本体を読め」と書いた。
その上で本体を読み、こう結論して DECISION_LOG に記録し、コードのコメントにも書いた。

> 費用を止めているのはループ内の月次コストキャップ判定
> （`baseSpentJpy + inJobJpy >= capJpy` で break）。件数上限 80 が守っているのは実行時間。

**After**: **その判定は既定では発火しない。** 条件は `capJpy > 0 && …` で、`capJpy` は
`getCostCapStatus()` 由来。`costCap.ts` は `capJpy <= 0` のとき `null` を返し、
`resolveCapJpy()` の既定は「テナント個別 → env → **0（無効）**」。
`.env.example` の `AI_MONTHLY_COST_CAP_JPY` は 0、本番でテナント個別上限を設定している
テナントは **0件**（2026-09-04、Supabase MCP で実測）。
さらに `withCostCap` は Redis 不在・失敗時に fail-open する。

つまり**費用を止めているものは存在しなかった**。実際に費用を抑えているのは
「1テナント1日1回」「1実行80件」という構造の方で、私が「費用の上限ではない」と
断じた 80 こそが費用の上限だった。**結論を180度取り違えていた。**

**なぜ気づけなかったか**:
M-035 で「ヘッダコメントではなく for ループ本体を読め」と学んで、**本体は読んだ**。
`baseSpentJpy + inJobJpy >= capJpy` も `policy.ts:183` の
`if (enforce && status.exceeded) settings.enabled = false` も読んでいる。
**読んだのに、`capJpy` と `status` がどこから来て既定で何になるかを追わなかった。**

M-035 の教訓を「1段深く読め」として適用し、**ちょうど1段だけ深く読んで止まった**。
必要だったのは「1段」ではなく**値の出どころに突き当たるまで**だった。
「守られている」と分類する前に**その条件式が何と何を比べているか**を言えるか確認する、
という CLAUDE.md の項目がそのまま該当する。`capJpy` が何かを言えていなかった。

同じ形が3件続いている（M-034 型 F・M-035 型 B・これ）。共通するのは
**未解決事項の検証や起票で、根拠を1つ確かめた時点で確かめ終わったことにしている**点。
1つ確かめると「確認した」感覚が出て、その先を見なくなる。

同じ PR で、もう1つ同型をやっている。日付検査の抽出器を
「4書式すべてで落ちることを確認した」と書いたが、確認したのは
**自分が知っている4書式だけ**で、ファイルに実在する書き方と突き合わせていなかった
（実在する見出しを3つ取りこぼしていた）。**自作の検出器を、自分の想定だけで検証した。**
これは型 A そのもので、CLAUDE.md に「既知の1件で当たりを取る」と書いてあるのに、
当たりを取る「既知の1件」を自分で作っていた。

**再発防止**: 一部は仕組みで止めた。残りは習慣。

- **仕組み（入れた）**: 日付検査は、抽出とは**別実装**の当たり判定
  `isStructuredLine()` と突き合わせ、「日付が書かれているのに抽出されていない行」を
  失敗にする。自分の想定の外にある書き方を、自分の想定に頼らずに検出する。
  抽出器を狭めると597件の取りこぼしとして落ちることを確認済み。
- **仕組み無し（判断に依存）**: 既定値の追跡。習慣にするのは次の1つ。
  **「この値が守っている」と書く前に、その値の既定値を `.env.example` と
  解決関数まで辿って、既定で何になるかを1行で言う。**
  言えないなら、それはまだ「守られている」と書ける状態ではない。
  M-035 の「何を守っているか言えるか」に、**「既定で本当に働くか」**を足す。

---

## M-20260904-limit-read-as-cost-guard 件数上限を「費用の安全装置」と読み、答えの出ない問いを起票した（2026-09-04・型 B・旧 M-035）

**Before**: 2026-09-03、AI レート制限を免除した2ジョブについてこう起票した。

> AI のレート制限を免除したのは2つ。どちらもユーザーが繰り返し叩ける経路ではないが、
> **自前で持つ上限が妥当かは検証していない**。
> （…）`LINE_HISTORY_IMPORT_MAX`（既定80）。この80という数字の根拠は不明。**【要確認】**

「レート制限を免除する代わりに、ジョブが自前で持っている件数上限が費用を止めている」
という読みで、その上限の妥当性を問いにした。

**After**: 80 は費用の上限ではない。費用を止めているのはループ内の**別の判定**で、
`line-history-import/route.ts` の for ループは各周で
`baseSpentJpy + inJobJpy >= capJpy` を同期的に見て break する。
`daily-digest` も同じで、`settings.enabled` が月次コストキャップ超過で false に倒れる
（`policy.ts:183`）。80 が守っているのは `maxDuration = 300` 秒の**実行時間**。

つまり**問いの立て方が違っていた。**「80 の根拠」を費用の側から探しても、
そこには最初から何も無い。1日探しても出てこない種類の問いを起票していた。

**なぜ気づけなかったか**:
`route.ts` のヘッダコメントの「設計上の安全策」の箇条書きを読み、
そこに並んでいた「月次コストキャップを尊重」と「1回の実行件数に上限」を
**同じ目的の2つの装置として横並びに読んだ**。実際は前者が費用、後者が時間で、
守っているものが違う。**箇条書きの並びを、目的の同一性と読んだ。**

for ループ本体（`capJpy`/`inJobJpy` の20行）を読めば分かることを、
ヘッダコメントで済ませた。M-004（関数名から中身を推測）と同じ型 B で、
今回は推測の材料がコメントだったというだけ。**コメントは実装ではない。**

M-034 と同じ 2026-09-03 のセッションで、同じ OPEN_QUESTIONS に書いた前提が
2件とも外れている。M-034 の再発防止（断定を書く前にコマンドを打ち、本文に残す）は
**これには効かない** — 打つべきコマンドが無く、必要だったのは
「ヘッダではなく本体を読む」だったから。型が違うので別の歯止めが要る。

**再発防止**: 仕組み無し（判断に依存）。習慣にするのは次の1つ。

- **「この装置は何を守っているか」を1文で言えないうちは、その装置の妥当性を問いにしない。**
  言えないなら、問いは「妥当か」ではなく「何を守っているか」であり、それは
  未解決事項ではなく**まだ読んでいないコード**である。

補足: 今回の答えは両方ともコードに書いた（`maxMessages()` の JSDoc、
`daily-digest` のヘッダ）。次に触る人は同じ読み違いをヘッダの時点で止められる。

---

## M-20260904-unverified-direct-call 未解決事項に、確かめずに「直接叩いている」と書いた（2026-09-04・型 F・旧 M-034）

**Before**: 2026-09-03、OPEN_QUESTIONS に検出器の前提の項目を起票したとき、
最後の一文をこう書いた。

> 未解決なのは、既存の `@/lib/ocr/shakensho` のようにベンダー SDK を直接使っている
> モジュールをどう寄せるか。

`shakensho.ts` が `@anthropic-ai/sdk` を import しているのを見て、
**「SDK を import している」＝「クライアントを自前で作って直接叩いている」と読んだ。**

**After**: `shakensho.ts:369` は `getAnthropicClient()` を呼んでいる。
直接 import しているのは `@anthropic-ai/sdk/helpers/zod` の `zodOutputFormat` だけで、
これはスキーマ整形のヘルパ（課金なし）。同じ形が src 内に44ファイルある。
`new Anthropic(` は `src/lib/ai/client.ts` の1箇所しかない。
**「寄せる作業」は最初から存在しなかった。**

翌日この項目に着手して `grep -rn "new Anthropic" src/` を1回打った時点で分かった。

**なぜ気づけなかったか**:
import 行だけを見て、**呼び出し側の行を読まなかった**。M-004（読まずに分類する）と
同じ動きだが、あちらは「関数名から中身を推測」で、こちらは
**「import のパスから使い方を推測」**。パスは `@anthropic-ai/sdk` と
`@anthropic-ai/sdk/helpers/zod` で違うのに、前方一致で同じものとして扱った。
これは「`admin:` が `super_admin:` にマッチする」（CLAUDE.md の境界アンカーの話）と
同じ形で、**部分文字列の一致を意味の一致として読んでいる**。

もう一つ悪いのは、これが**未解決事項の起票**だったこと。実装の誤りは
テストやレビューが拾うが、**OPEN_QUESTIONS に書いた前提を検査する仕組みは無い**。
1日誰も触らなければ、そのまま「やるべき作業」として残る。実際、
翌日この項目を「実装が要る」前提で開いた。

**再発防止**: 仕組み無し（判断に依存）。習慣にするのは次の1つ。

- **未解決事項に「〜が〜している」と現状の断定を書くときは、その1文の根拠になる
  コマンドを打ってから書き、コマンド自体を本文に残す。**
  今回なら `grep -rn "new Anthropic" src/` の1行。
  DECISION_LOG の日付に `date -u` を義務づけた（M-011）のと同じ形を、
  OPEN_QUESTIONS の事実記述にも適用する。

補足: 検査で止められる部分は止めた。`getAnthropicClient()` が唯一の入口である
という前提自体は `aiRouteRateLimit.test.ts` の構造テストになった
（DECISION_LOG 2026-09-04）。今後この前提が崩れれば人の記憶ではなく CI が言う。
## M-20260904-local-pass-read-as-real 「手元で全部通った」を「実物でも通る」と読んだ（2026-09-04・旧 M-030）

**Before**: マイグレーションの順序逆転を直し、`npm run check:migrations` が
**1パスで 447/447** 通ったので、「Supabase のブランチ機能と同じ条件で全部通る」と
PR に書いた。検査は実際に1パスにしてあり、ファイル名順も停止条件も合わせてあった。

**After**: 実物のプレビュー DB では別の場所で落ちた。

```
ERROR: CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)
```

Supabase は1ファイルの複数文を**パイプライン**で送る。`psql -f` は送らない。
`CREATE INDEX CONCURRENTLY` はパイプラインの中では実行できないので、2文目以降が落ちる。
該当13ファイル。CONCURRENTLY を外し、**静的 lint** で新規ファイルを縛った。

**なぜ気づけなかったか**:
「同じ条件」を**順序と停止条件だけ**で定義していた。実際には
**文をどう送るか（1文ずつか、パイプラインか）**も条件のうちで、そこが違っていた。
自分で「Supabase のブランチ機能と同じ条件」と書いておきながら、
**何を揃えたかを列挙していない。** 揃えた項目を挙げていれば、
挙がっていない項目（送信方法）に気づけた。

もう一つ。PR には「これは Supabase のブランチ機能が緑になったことの直接の証明では
ありません」と**正直に書いていた**。書いたのに、その限界を潰しに行かなかった。
**限界を明記することと、限界を減らすことは別。** 明記して満足していた。

**再発防止**:
- 仕組み: lint ルール `concurrently-in-multi-statement-file` を追加した。
  再生検査では原理的に捕まえられない差なので、静的に止める。
  （わざと壊して落ちることを確認済み）
- 習慣: 「本番/実物と同じ条件で検証した」と書くときは、**揃えた項目を列挙する**。
  順序・停止条件・送信方法・権限・拡張。挙がっていないものが次の穴。
- 習慣: 検証の限界を書いたら、**その限界を消す手段が本当に無いかを1回考える**。
  今回は「別 PR にスロットがあるので取り込んで試す」で消せた（実際そうして判明した）。

---

## M-20260903-skipped-stmt-left-grant 「落ちないようにする」だけを見て、飛ばした文が権限を開けたままにした（2026-09-03・旧 M-029）

**Before**: マイグレーションの順序逆転を直すため、前提が無いときに文を飛ばすガードを
各所に入れた。`20260616000007` の
`revoke execute on function public.auth_uid_by_email(text) from public, anon, authenticated`
も、関数がまだ作られていない（本番にしか無く、`20260826000005` で初めて作られる）ため
「無ければ飛ばす」にした。1パス再生 443/443 になり、緑を確認して PR を出した。

**After**: `/code-review` の指摘。**飛ばしたぶんを誰も引き継いでいなかった。**
関数が後から作られたあと、`anon=X, authenticated=X` のまま残る。これは
`auth.users` の email を引く SECURITY DEFINER なので、**anon 鍵から任意ユーザーの
email が引ける**状態だった。関数が実在する位置に `20260826000007` を足して締め直し、
再生 DB の `pg_proc.proacl` で5関数すべて service_role のみになることを確認した。

**なぜ気づけなかったか**:
**「エラーを消す」という目的だけを見て、消した文の中身を見ていなかった。**
飛ばした文には2種類ある —— 飛ばしても最終状態が変わらないもの（`ADD COLUMN IF NOT
EXISTS`。後ろの CREATE TABLE が同じ列を作る）と、**飛ばすと状態が変わるもの**（revoke。
飛ばせば権限が開いたまま）。私は前者の感覚で後者を扱った。

補い（compensating）のファイルは他の箇所ではちゃんと作っていた。**revoke だけ作らなかった
のは、「テーブル・列を作る文」しか補うものとして数えていなかったから。**
権限は目に見えるオブジェクトではないので、対象から落ちた。

型 D（移設で弱める）の変種。「同じものを別の場所に置くだけ」ですらなく、
**置き忘れた**。

**再発防止**:
- 仕組み: 無し（判断に依存）。1パス再生は「落ちないこと」を見るだけで、
  「飛ばした結果どうなったか」は見ない。今回は proacl を手で確認した。
- 習慣: **ガードで文を飛ばしたら、その文が「実行しない＝安全」なのか
  「実行しない＝開いたまま」なのかを1文ずつ言う。** revoke / drop policy /
  alter default privileges は後者。飛ばすなら必ず補いを作る。
- 習慣: 補いファイルを作るとき、**対象を「テーブルと列」で数えない。**
  権限・ポリシー・トリガー・索引も同じ扱いにする。

---

## M-20260903-accepted-cannot-fix 「直せない」と書かれていたものを、確かめずに「直せない」と報告した（2026-09-03・旧 M-026）

> 採番の注: この番号は**5回目の付け替え**。main と未マージの2本が並行して連番を消費する
> ため、マージのたびに衝突する（M-021/022/023 に続き、M-024/025 も main が先に取った。
> 自分の分は M-029/M-030 へ移した）。連番のまま運用する限りこれは繰り返す。
> 日付ベースの ID にするかは OPEN_QUESTIONS で保留中。

**Before**: `Supabase Preview` が最古のマイグレーションの順序ずれで落ち続けていた。
`docs/operations/migrations.md` に「履歴を書き換えない限り直せない9本」「恒久対応は
baseline 方式」と書いてあり、それを読んで PR #1020 に
**「ポートできる修正は無い。恒久対応はリポジトリ規模の変更になる」**とコメントした。
以後の赤も「既報・この PR のものではない」で通し続けた。

**After**: 代表から「マイグレーションのずれをブランチ切って対応しよう」と言われて
初めて**測った**。ファイル名順に1パスで流すと 438 本中 **203 本**が落ちていた。
うち 170 本は**先頭3本の順序逆転からの連鎖**で、その3本を「前提が無ければ飛ばす」に
変えるだけで 33 本まで落ちた。残りも同じ形の小さな逆転で、
**ファイル名を1つも変えずに 443/443 通るようになった**（所要は半日ぶん）。
baseline 方式は要らなかった。

**なぜ気づけなかったか**:
**リポジトリの文書に書かれた結論を、検証済みの事実として引き継いだ。**
「9本は永久に再生できない」は多重パスの検査から出た数字で、
**1パスで何本落ちるかは誰も測っていなかった**。私も測らなかった。
`scripts/replay-migrations.mjs` を1パスに変えて走らせるだけ（15分）で分かったのに、
「難しいと書いてある」を「難しい」として3日運んだ。

決定的だったのは、**赤の理由を説明できてしまったこと**。「最古のマイグレーションの
順序ずれで、この PR のものではない」は正しい説明で、正しいがゆえにそこで止まった。
**説明がつくことと、直せないことは別。** 説明で満足したときが危ない。

型 F（確認できる事実を確認しない）の変種。今日の日付やバージョンと違って、
ここで確かめるべきだったのは**「直せない」という他人（過去の自分）の判断**だった。

**再発防止**:
- 仕組み: `npm run check:migrations` を**1パス**に変えた。順序が逆転した
  マイグレーションは CI で落ちる。以前は多重パスが逆転を吸収してしまい、
  **Supabase Preview だけが赤いのに CI は緑**という、いちばん気づきにくい形だった。
  （わざと壊して落ちることを確認済み: 存在しないテーブルを ALTER する
  ファイルを先頭日付で置くと exit 1 でファイル名まで出る）
- 習慣（仕組み無し・判断に依存）: **「既知の問題」「仕様」「直せない」と書いてある
  ものを引用するときは、その根拠を1回は自分で走らせる。** 特に、その判断を書いた
  人が使った道具（ここでは多重パスの検査）が、今の問いに答える形になっているかを見る。
- 習慣: **CI が赤いまま「自分のせいではない」で通した回数を数える。** 3回同じ
  コメントを書いたら、それは調査していないという意味。

## M-20260903-900-lines-on-unfixed-premise 未確定の前提の上に900行作り、前提が変わって全部捨てた（2026-09-03・旧 M-043）

**Before**: 「外注職人が自分の施工履歴を見られない」を解こうとして、**外注職人は
ログインアカウントを持たない**という**現状のコード**を前提に、トークン付き URL
（`/w/[token]`）方式を設計・実装した。テーブル3本、公開ページ、API、複数店舗の
束ね機能まで作り、2コミット・約900行を push した。

**After**: 直後に代表から「外注側にも Ledra を導入させる。**利用は必須**。
アカウントを作らない職人は検討しない」。トークン方式が想定していた層が消えたので、
実装を丸ごと撤去してテナント連携方式に作り直した（`696dd2f`、−996行）。

**なぜ気づけなかったか**:
`staff_members.user_id` が外注では null という**実装の事実**を、
「外注はアカウントを持たない」という**事業の前提**として読んでしまった。
コードはその時点の決定の写しでしかなく、変えられる。**変えられるものを制約として
扱った。**

さらに悪いのは、着手前に別の質問（顧客名を見せるか）は代表に投げているのに、
**「外注にアカウントを持たせてよいか」は投げなかった**こと。前者は開示範囲の
チューニングで、後者は**機構そのものを決める**質問だった。**軽い方を聞いて、
重い方を自分で決めていた。**

「本人はログインを持たないので、持ち物を増やさない形が最小」という筋は通っていた。
しかし最小かどうかは前提が正しいときにしか意味がない。**前提を確かめずに最適化した。**

**なぜ検証をすり抜けたか**: 実装は全部緑だった（tsc / lint / test 5316件）。
テストは「作ったものが動くか」しか見ない。**「作るべきものだったか」は
どのテストも見ない。** 検証が通ることは、方向が正しいことを何も意味しない。

**再発防止**:
- 習慣: 着手前に「この設計を決めている前提」を1行で書き出し、その前提が
  **コードから読んだ事実**なのか**依頼者が決めたこと**なのかを分ける。前者なら
  「変えてよいか」を聞く。今回なら「外注にアカウントを持たせる案は無しですか」の一言。
- 判断材料: 質問を1つに絞るとき、**機構を決める質問を優先する**。開示範囲や
  文言は後から変えられるが、機構は作り直しになる。
- 仕組み: 無し（判断に依存）。テストでも lint でも止まらない種類の誤り。

---

## M-20260907-sufficient-condition-false ガードの根拠として書いた「十分条件」が、そもそも成り立っていなかった（2026-09-07・旧 M-064）

**Before**: out-of-order を止める検査 `migration-version-before-base-head` を書いたとき、
根拠をコードのコメントにこう書いた。

```
// base ブランチの最新バージョン >= 本番の最新バージョン なので、
// 「base に在るどのファイルよりも後」であれば out-of-order にならない（十分条件）。
// 本番へ問い合わせずに手元と CI だけで判定できるのが要点。
```

「本番へ問い合わせずに判定できる」ことを利点として書いている。

**After**: **1行目の前提が偽だった。** `apply_migration` で本番へ直接当てた版は main を
通らないので、**base の最新が本番の最新より前になりうる**。#966 が 20260906094512 /
094735 を本番へ直接当てていたため、まさにそうなっていた。

結果、この検査は2方向に外れた。

| いつ | 代用値（base の最新） | 実際（本番の最新） | 何が起きたか |
|---|---|---|---|
| #1020（2026-09-06） | 20260905142740 | 20260906094735 | **低すぎて見逃した。** 4本が緑で通り、本番の適用が全停止 |
| #1044（2026-09-07） | 20260906100003 | 20260906094735 | **高すぎて誤検出した。** 本番に既にある版のファイルを補えない |

- 対処: しきい値を `supabase/migrations.production-ledger`（本番台帳の要約）の最新と
  base の最新の**大きい方**にし、本番が適用済みの版は免除した。
  **これは検査を緩めたのではなく、代用を実物に寄せて強くした。**
  #1020 当時の値（base 20260905142740 / 本番 20260906094735 / 追加 20260906000000）を
  そのまま回帰テストにし、**しきい値を base だけに戻す変異でそのテストだけが落ちること**を
  確認した。免除を外す変異でも免除のテストだけが落ちる。

**なぜ気づけなかったか**: **「十分条件」と書いたことで、証明した気になっていた。**
実際には証明していない。`base の最新 >= 本番の最新` は、
**「本番へはマイグレーション経由でしか入らない」という別の前提**に依存する。
その前提は、同じ 2026-09-06 に自分で棚卸しして
**「マイグレーション外で本番へ入ったオブジェクトが 68 個ある」**（#1041、DECISION_LOG 同日）
と書いたばかりだった。**68 個の証拠を自分で並べた当日に、それが起きない前提のガードを
書いていた。** 型 A（道具を検証しない）。M-027 に天井として書いてはいたが、
「書いた＝担保した」で止まっていた点は M-047 と同じ形。

もう1つ。この検査は**通したいものを通せなかったとき初めて前提の誤りが露見した**。
見逃し（#1020）のときは静かだった。**ガードの誤りは、誤検出では気づけるが見逃しでは
気づけない。** 見逃し側は、既知の事故を回帰テストにするしかない。

**同じ誤りを、直している最中にもう一度やった（同 PR 内、`/code-review` が指摘）**

修正の説明として「台帳ファイルは古くなっても**緩まない**（max が古ければ base 比較に
戻るだけ、免除欄が古ければ落ちるだけ）」と書き、**同じ主張を4つの文書に載せた**
（台帳ファイル本体・DECISION_LOG・OPEN_QUESTIONS・RELEASE_LOG）。**これも偽だった。**

「base 比較に戻る」とは、**#1020 を通してしまった当時の検査に戻る**ということである。
それは誤検出ではなく**見逃し**。しかも OPEN_QUESTIONS ではこの偽の主張を根拠に
「現状維持（手動）でよい」と結論しかけていた。

再現して確認した（base `20260905142740` / 台帳 max も `20260905142740` /
追加 `20260906000000` → **exit 0、素通り**）。

- 対処: `.github/workflows/db-migrate.yml` に「本番が repo より先に進んでいるのに
  台帳に記録が無い」ときジョブを赤くするステップを足した。本番の資格情報を持つのは
  このワークフローだけなので、ここでしか見られない。**push の後に置いた** ——
  台帳の古さで本番への適用を止めては本末転倒だから。
  4シナリオ（通常の push 成功後／今回の事故／記録済み／台帳欠落）で手元検証済み。
- 天井は消えていないのでテストに固定した（`KNOWN CEILING:` で始まる1件）。

**なぜ気づけなかったか（2回目）**: **1回目とまったく同じ形**。「〜なので安全」を、
依存している前提を書き出さずに書いた。今回の依存先は「base 比較は安全な状態である」。
**その前提こそ、この修正が否定しているものだった。** 直した本人が、直した対象を
安全側の基準として使っていた。

さらに悪いのは**4箇所に書いたこと**。一度書いた主張は、書き写すたびに検証済みらしく
見える。**同じ主張を2箇所目に書く時点が、検証する最後の機会**だった。

**再発防止**:
- 回帰テスト7件を `scripts/__tests__/lint-migrations.test.ts` に追加。うち1件は
  **#1020 の実際の値**をそのまま使い、1件は**天井（古い台帳は見逃す）を固定**する。
  この検査を将来どういじっても、#1020 は再び落ちる。
  3種の変異（しきい値を base に戻す／免除を外す／ハッシュ照合を外す）で、
  **それぞれ対応する1件だけが落ちる**ことを確認済み。
- 免除は版番号だけでなく **sha256 で中身も固定**する。版番号だけを鍵にすると、
  免除された版のファイルを後から書き換えられ、本番は再適用しないのに再生だけが
  新しい方を流して静かに食い違う（これも `/code-review` の指摘）。
- **「〜なので安全」と書きたくなったら、その根拠が依存している別の前提を1つ書き出す。**
  書き出せないなら、それは証明ではなく期待である。
- **同じ主張を2箇所目に書こうとしたら、そこで一度止めて検証する。**
  写す作業は検証の代わりにならない。

## M-20260906-notify-never-delivered 「失敗を知らせる」通知が、シェルの引用ミスで一度も飛んでいなかった（2026-09-06・旧 M-065）

**Before**: #1020 をマージしたら `DB migrate (apply to production)` が赤くなった。
本番の適用が止まる事故なので、`db-migrate.yml` には Slack 通知ステップが付いていて、
そのコメントには**「自分が失敗したことを自分で報告できない構造になりやすい。
配信できなかったら必ずステップを赤くする」**と書いてある。

**After**: **その通知ステップ自身が落ちていた。** ログの最後はこれだけ。

```
/home/runner/work/_temp/....sh: line 29: 対象: No such file or directory
```

jq のプログラムはシングルクォートで囲んである。その本文に

```
where version = '<対象>'
```

と**シングルクォートを書いてしまっていた**ので、そこで文字列が終わり、続きがシェルとして
解釈され `<対象>` がリダイレクトになる。**この文言が入って以降、db-migrate の失敗通知は
一度も配信されていない。** 手元で修正前後の両方を実行して確認した（修正前 exit 1、
修正後は JSON を生成して exit 0）。

- 対処: ヒント文を `--arg hint` で渡し、jq プログラムからクォートを追い出した。
  バッククォートとシングルクォートを含むコミットメッセージでも JSON が組めることを確認。

**なぜ気づけなかったか**: **通知は「鳴らないこと」が正常に見える。**
テストも無く、鳴らすには本番の適用を実際に失敗させるしかない。
書いた人（自分を含む）は、書いた時点では絶対に踏まない経路だった。
`if: failure()` の中身は、失敗するまで一度も実行されない。

もう1つ。ステップのコメントに危険を丁寧に書いたことで、**書いた＝担保した**気になっていた。
M-028 と同じ形（「効かない条件」を書いたが、その条件に当たるか確かめていない）。
今回は**書いた本人が、その注意書きの中で違反していた**。

**再発防止**: 最初「仕組み無し（このワークフローを実行せずに検証する手段が無い）」と
書いたが、**それは誤りだった**。原因を見つけた手順そのもの——ステップの `run:` を
YAML から抜き出して実行する——が、そのまま検査になる。
`scripts/__tests__/dbMigrateNotify.test.ts` を追加した。

- 素直なメッセージで payload が組めること
- バッククォート・シングルクォート・ダブルクォート・複数行を含んでも壊れないこと
- jq のプログラム本文にシングルクォートが無いこと（あるとシェルが文字列を閉じる）

修正前のワークフローに戻すと3件とも落ち、修正版で3件とも通ることを確認済み。
**「仕組み無し」と書きかけたら、いま自分がバグを見つけた手順を思い出す。**
その手順が再現できるなら、それは仕組みにできる。

**本番で実証（2026-09-06 15:34 UTC）**: #1042 のマージで走った `DB migrate` run #63 は
不変条件1で赤のままだが、**通知ステップは `ok` で終わっている**（それまでは同じ位置で
exit 1）。つまり **Slack へ「本番DBマイグレーションが失敗しました」が実際に届いたのは
この run が初回**。手元の番人テストだけでなく、本番の経路でも効いていることを確認した。

## M-20260905-migration-version-staled マージ待ちの間に main が新しいマイグレーションを入れ、自分の版番号が陳腐化した（2026-09-05・旧 M-045）

**Before**: #1020 のマイグレーション4本を `20260904210000`〜`210003` へ改名し（本番の
適用済み最新 `20260904123252` より後にするため）、全チェック緑にして代表のマージ判断待ちに
した。**その時点では正しかった。**

**After**: 待っている間に main へ #1034 がマージされ、`20260905040000` が入った。
自分の4本はそれより**古く**なった。#1034 の方が先に本番へ適用されると、自分の4本は
out-of-order になり `db push` が止まる。**「マージ時点で正しい」は「後も正しい」ではない。**

- 対処: `20260905050000`〜`050003` へ再改名。本番の台帳に4本とも無いことを名指しで再確認
  したうえで動かした（適用済みを改名すると不変条件1に抵触する）。

**なぜ気づけなかったか**: 気づけなかったのではなく、**仕組みが気づいた**。
定期チェックで main を取り込んだ直後、`lint:migrations` の
`migration-version-before-base-head` が落ちて「base の最新は 20260905040000」と出した。
M-027 で入れた検査が、初めて**自分以外の原因**で働いた。

この形は `OPEN_QUESTIONS`（2026-08-29 の節）に「レビュー待ちの長い PR が自分自身の
マイグレーションバージョンを陳腐化させる」として**5回**記録されている。今回が6回目で、
**人ではなく検査が先に見つけた最初の回**。過去5回はいずれも本番の `db-migrate` が
止まってから気づいていた。

**再発防止**: 仕組みは既にある（M-027 の検査）。加えて習慣として、
**マイグレーションを含む PR がマージ待ちで滞留している間は、main を取り込むたびに
`lint:migrations` を回す。** 定期チェックの手順に入れた。

**3回目（2026-09-06、マージ直前）**: 代表から「マージ」と言われて着手した時点で、
main に #1035 が入っていた。**本番へ適用済みの版に合わせてファイル名を改名する**PR で、
`20260905040000` → `20260905142740` になっていた。本番の台帳を引くと
`20260905142740` は **applied=true**。つまり本番の最新が動いており、自分の
`20260905050000`〜`050003` はまた古くなっていた。`20260906000000`〜`000003` へ3回目の改名。
**「マージしてよい」と言われた時点の状態が、着手時点でも正しいとは限らない。**
マージ直前にもう一度 `lint:migrations` を回すのが唯一の防ぎ方で、実際それで見つけた。
残る穴: 検査は base との比較なので、**base に入っていないが本番には適用済み**という
状態は見えない。そこは `db-migrate` 側の実物突き合わせに委ねる。

**4回目（2026-09-06、#1020 マージ後）。上に書いた「残る穴」が実際に発火した。**
#966 が `apply_migration` で `20260906094512` / `20260906094735` を**本番へ直接**当てて
おり、main には無い。私の4本（`20260906000000`〜`000003`）は main の最新ではあったが
**本番の最新より古く**、マージした瞬間に `DB migrate` が out-of-order で赤くなり、
**本番へのマイグレーション自動適用が止まった**。#1042 で `20260906100000`〜`100003` へ
改名（通算4回目）。

穴を天井として書いてあったが、書いただけでは防げなかった。**base と本番は別物で、
検査は base しか見ない。** 改名・マージの前に台帳を引く一手は、いまも人の手順のまま
（CI から本番 DB へ繋ぐ是非が未決のため。OPEN_QUESTIONS）。

## M-20260903-mismatch-guard-passed-through 「取り違えを弾く」と書いたガードが、最も多いケースで素通りだった（2026-09-03・旧 M-044）

**Before**: 証明書を発注に紐付けるとき、取り違えが**他社への誤開示**になるので
車両を突き合わせるガードを入れた。既存の `linksToReservation` を流用し、コメントに
「発注導線から入ったあとフォームで別の車両・顧客に変更しても、ここで食い違いを弾く」
と書いて push した。

**After**: `/code-review` の指摘。`linksToReservation` は「**両方に値があって食い違う
ときだけ**弾く」null 寛容な述語で、この用途では誤りだった。`job_orders` は顧客を持たず、
受発注画面 `OrdersClient` は `vehicle_id` を送らない（参照が1箇所も無い）ため
**UI から作られた発注は `vehicle_id = NULL`**。つまり**最も多いケースで判定が常に true**。
`linksToJobOrder` に切り出して非対称にし、検証できない場合は発行フォームで
明示する形にした（`9a6d98f`）。

**なぜ気づけなかったか**:
述語の**シグネチャ**（車両と顧客を突き合わせる）だけを見て、**セマンティクス**
（null をどう扱うか）を確認しなかった。`linkToReservation.ts` には
「両方に値があって食い違うときだけ false にする」と**はっきり書いてあった**。
読めば分かることを、名前で判断して読まなかった。

決定的だったのは、**流用先のデータが実際にどんな形かを見なかった**こと。
`job_orders.vehicle_id` が実運用でどれくらい埋まっているかは、`OrdersClient` を
grep すれば10秒で分かった（0件）。**ガードを書いたのに、そのガードが発火する条件が
実データで成立するかを一度も確かめていない。**

そしてコメントに「ここで弾く」と**断定で書いた**。動作を確かめずに書いた断定は、
後から読む人（と自分）に「確認済み」だと誤解させる。素通りのコードより、
素通りを「弾いている」と説明するコメントの方が害が大きい。

**再発防止**:
- 習慣: null 寛容な述語を**別の用途に流用しない**。流用したくなったら、名前と型を
  分けて別関数にする（今回そうした）。寛容さは元の用途に紐づいた設計判断であって、
  持ち運べる性質ではない。
- 習慣: ガードを書いたら「**このガードが false を返す実データはあるか**」を
  1度は確かめる。無いなら、それはガードではなく飾り。
- 仕組み: `linksToJobOrder` の非対称性をテストで固定した（`linksToReservation` が
  同じ入力で `true` を返すことも並べて assert）。同じ流用をすると落ちる。

---

## M-20260903-fabricated-leak-risk 絞り込んでいないクエリの1行を「デモ用アカウントのもの」と決めつけ、情報漏洩の危険を捏造した（2026-09-03、M-016 の翌日・同じ形・旧 M-017）

**Before**: 保険会社ポータルの検索が0件だった理由を調べるのに

```sql
select tenant_id from public.insurer_tenant_access where is_active and revoked_at is null
```

を実行し、返ってきた**1行（実テナント `HOLY AUTO`）を「デモ保険会社が見られるテナント」と読んだ**。
`insurer_id` で絞っていないのに、返り値が1行だったので「これがデモ保険会社の分だ」と解釈した。
そこから「検索を実行させると実業務の証明書が配布 PDF に載る」と結論し、
**PR コメント・DECISION_LOG・OPEN_QUESTIONS・RELEASE_LOG の4か所に「実データが載る危険がある」と書き**、
代表に「デモ用アカウントが実テナントを照会できる状態です」と確認を求めた。

**After**: `insurer_id` で絞って引き直したら、**デモ保険会社の行は0件**だった。
その1行は別の保険会社（`東京海上日動`、実アカウント、ユーザー1名）のもの。
検索が0件だったのは「デモ保険会社にアクセス可能なテナントが1つも無いから」であって、
**実データが配布物に載る危険は最初から存在しなかった**。原因は
`scripts/setup-demo-insurer.ts` が保険会社とユーザーを作るだけで閲覧許可を付与していなかったこと。
デモ施工店への許可を1行追加し、シードスクリプトにも入れて解消した。

**なぜ気づけなかったか**: **結果が1行だったことを「絞り込めている」ことの証拠として扱った。**
実際には母集団が1行だっただけで、その1行が誰のものかは何も言っていない。
`where` に `insurer_id` が無いのに、頭の中では「デモ保険会社の話をしている」という文脈が
続いていたので、返り値をその文脈に吸い寄せて読んだ。**M-016 と同じ日の、同じ形**
（クエリが何を確定させたのかを確かめずに、確定したつもりになる）。
M-016 の再発防止に「陽性・陰性の両方で当たりを取る」と書いた翌日に、
**今度は「そもそも対象で絞ったか」を見落とした**。前回の教訓が「検索式の書き方」の話として
狭く記憶されていて、「主語が入っているか」という更に手前の話に届いていない。

さらに悪いのは、**この誤りが「危険がある」方向だったこと**。安全側の誤りに見えるが、
実際には存在しないセキュリティ問題を代表に報告し、判断を求め、
配布資料の内容（検索結果を出さない）まで誤った前提で決めていた。

**再発防止**: 仕組み無し（判断に依存）。習慣として、**特定の主体について結論を出すクエリは、
その主体の識別子が `where` に現れているかを声に出して確認してから結果を読む**。
返り値が1行であることは、絞り込めている証拠にならない。
「この行が誰のものか」を答えられないなら、その行から誰についても結論を出さない。

---

## M-20260903-wildcard-substring-match `%...%` の部分一致で「非修飾参照」を判定し、壊れていない関数を壊れていると報告した（2026-09-03・旧 M-016）

**Before**: 保険会社ポータルの検索が本番で HTTP 500 になる原因を調べる際、
`search_path=''` の SECURITY DEFINER 関数のうち非修飾参照を持つものを探すために

```sql
where p.prosrc ilike '%insurer_tenant_access%'
```

で候補を絞り、ヒットした2本（`insurer_accessible_tenant_ids` と
`insurer_get_vehicle_certificates`）を**どちらも「本体が `insurer_tenant_access` を
非修飾参照している」と報告した**。PR コメントと OPEN_QUESTIONS に「同じ形の関数が
もう1つある」と書いた。

**After**: `insurer_get_vehicle_certificates` の本体を実際に読むと、参照は
`public.insurer_users` / `public.vehicles` / `public.insurer_tenant_access` /
`public.insurer_access_logs` / `public.certificates` と**すべて修飾されており、
壊れていなかった**。`%insurer_tenant_access%` は `public.insurer_tenant_access` にも
一致するので、この検索は「非修飾参照を持つ関数」ではなく「その名前に言及する関数」
しか絞れていない。**実際に壊れているのは `insurer_accessible_tenant_ids` の1本だけ**。
訂正を PR と OPEN_QUESTIONS に出し、修正マイグレーションも1本だけにした。

**なぜ気づけなかったか**: 検索がヒットした時点で「非修飾参照が見つかった」と読んでしまい、
**その検索式が何と何を区別できるのかを考えていない**。`%name%` はスキーマ修飾の有無を
区別できない —— 区別するには `prosrc ~ '(^|[^.[:alnum:]_])insurer_tenant_access'` のように
直前がドットでないことを要求する必要がある。CLAUDE.md の「判断の道具そのものを検証する」に
**この失敗が名指しで書いてある**（「他の識別子の部分文字列になりうる名前を正規表現で引くときは
境界をアンカーする」）のに、SQL の LIKE では思い出さなかった。型 A の再発防止（既知の1件で
当たりを取る）が効かなかったのは、**当たりを取る対象を「壊れている1件」でしか考えず、
「壊れていないはずの1件が正しく除外されるか」を試さなかった**ため。陰性対照を取っていない。

**再発防止**: 仕組み無し（判断に依存）。習慣として、**識別子の有無を判定する検索は
陽性・陰性の両方で当たりを取る** —— 「引っかかるべき1件」だけでなく「引っかかっては
いけない1件」を必ず1つ選び、それが結果から外れることを確認してから件数を書く。
スキーマ修飾の有無を見るときは `%name%` を使わず、境界をアンカーした正規表現を使う。

## M-20260903-stacked-pr-ci-not-running スタック PR で CI が回らないのに「実行中」と報告した（2026-09-03・旧 M-015）

**Before**: #1024 を #1023 の上に積み（base を `claude/...-logs` ブランチにし）、
「#1023 がマージされれば base は自動で main に切り替わる」と考えた。
PR を作ったあと、ユーザーに **「CI 実行中」** と報告した。

**After**: `.github/workflows/ci.yml` は

```yaml
on:
  pull_request:
    branches: [main, staging]
```

**base が main / staging の PR でしか起動しない。** #1024 では CI が**一度も走っていなかった**。
Vercel と Supabase（GitHub Actions ではない外部連携）の2つだけが completed になっていたのを、
「Actions がキュー待ち」と読み違えた。base を `main` に付け替えて解消。

**なぜ気づけなかったか**:
「スタック PR」を一般的な GitHub の機能として知っていたので、**このリポジトリで動くかを
確かめなかった**。`ci.yml` を開けば7行目に書いてある。M-011（今日の日付を確かめなかった）と
同じで、**知っている気がするものほど確かめていない。**

さらに悪いのは、**チェック0件を「実行中」と読んだこと**。check_runs が2件しか返らず、
そこに `Lint, Type Check & Unit Tests` が無いのは「まだ始まっていない」ではなく
**「始まる予定が無い」**の可能性がある。**「無い」を「まだ」と読むのは M-003 と同じ形**
（検出器が認識できない ≠ 認可が無い）の裏返しで、今度は不在を待ち時間と解釈した。

**再発防止**:
- 仕組み: 無し（判断に依存）。CI の起動条件は PR ごとに変わるので機械検査に向かない。
- 習慣:
  - **base が main 以外の PR を作ったら、その時点で `ci.yml` の `on:` を読む**
  - **チェック一覧に想定したジョブが無いときは、「まだ」と決めつけずに
    起動条件を確認する。** 完了0件と起動しない、は見た目が同じ

---

## M-20260903-narrowed-detector-unchecked 検出器を狭めたとき、一覧から消えたものを確認しなかった（2026-09-03・旧 M-012）

**Before**: AI を呼ぶルートを洗うのに、まず import の推移到達（`@/lib/ai/client` に
辿り着くか）を使い47本を得た。`isMissingTableError` や `calcSizeClass` のような
純粋関数まで拾うと分かったので、**「ルート自身が `@/lib/ai/client` を import しているか」**
という狭い条件に切り替え、29本にした。47→29 の絞り込みは正しい方向だと思った。

**After**: 絞りすぎていた。`parts/installations/[id]/reconcile` は
`@/lib/ai/deliveryNoteOcr` 経由で、`vehicles/parse-shakken` は `@/lib/ocr/shakensho` 経由で
Vision モデルを叩く。どちらも `@/lib/ai/client` を自分では import しないので**一覧から
消えた**。そのまま「6本を塞いだ、説明のつかないものはゼロ」と PR を出した。
`/code-review` の指摘で発覚。**2本が無防備なまま残っていた。**

**なぜ気づけなかったか**:
`CLAUDE.md` に**「検出器を変えたら、一覧から消えたものを1件ずつ確認する」と自分で書いてある**
（M-002 の再発防止として）。それを実行しなかった。47→29 のとき、消えた18本を見ていない。

理由は、絞り込みの方向が「誤検出を減らす」だったので**安全側だと思い込んだ**こと。
誤検出を減らす操作は、同時に見落としを増やす。**片方だけを疑ったのが誤り。**
M-003 で「検出器には2つの誤り方（見落としと誤検出）がある」と書いたのに、
その片方しか見ていない。

**再発防止**:
- 仕組み: 検出器のテストに**性質の違う既知の経路を名指しで含める**。
  `aiRouteRateLimit.test.ts` の1本目は、ルート自身が client を import する経路・
  下位モジュール経由の経路・包んで export する経路・同一ファイルで GET は呼ばない経路を
  それぞれ名指しで検査する。**件数の下限だけでは数本消えても気づけない。**
- 習慣（仕組み無し・判断に依存）: 検出器を**狭める**変更は、広げる変更より危険だと扱う。
  差分（消えた側）を必ず列挙して1件ずつ読む。「誤検出を減らしただけ」は安全の根拠にならない

---

## M-20260903-searched-only-ai-dir 「AI を呼ぶ経路」を、AI ディレクトリの中だけで探した（2026-09-03・旧 M-013）

**Before**: AI の費用が出る経路は `@/lib/ai/` の下にあると考え、そこから import している
ルートを探した。`admin/academy/*` と `admin/certificates/ai-*` を見つけて塞いだ。

**After**: `vehicles/parse-shakken` は `@/lib/ocr/shakensho`（**`ai` ではなく `ocr`**）から
`parseShakenshoAuto` を呼び、その中で `getAnthropicClient()` + `AI_MODEL_VISION` を叩く。
`parts/installations/[id]/reconcile` は納品書 OCR で同じことをする。
**ディレクトリ名は費用の所在を表さない。**

**なぜ気づけなかったか**:
「AI 機能」という業務上の分類と、「Anthropic API を叩く」という技術上の事実を
同一視していた。OCR は業務上「画像の読み取り」であって「AI 機能」ではないので、
探す場所から外れていた。**費用が出る条件は `getAnthropicClient()` を呼ぶことであって、
どのディレクトリに置いてあるかではない。**

型 C（経路を1本しか見ない）の変種。同じ操作（モデルを叩く）に複数の入口があるのに、
名前で1系統だけ見た。

**再発防止**:
- 仕組み: 検出器の根を**ディレクトリではなく `getAnthropicClient(` の呼び出し**に置いた。
  どこに置いたモジュールでも、クライアントを構築すれば検出対象になる。
- 習慣（仕組み無し・判断に依存）: 「何がコストを生むか」を探すときは、
  **業務上の分類名ではなく、コストが発生する関数呼び出し**から逆に辿る

---

## M-20260903-file-granularity-again 検出器の粒度がまたファイル単位だった（2026-09-03、M-001 の再発・旧 M-014）

**Before**: `checkRateLimit(` をファイル全体に対して正規表現で探した。
1ファイル1ルートなので足りると思った。

**After**: `admin/academy/cases` は GET と POST があり、AI を呼ぶのは POST だけ。
ファイル単位で見ると、**ガードが間違ったハンドラに付いていても緑になる**。
コメントアウトした `// await checkRateLimit(...)` でも一致する。

**なぜ気づけなかったか**:
**M-001 が全く同じ形**（`admin/invoices` の DELETE だけ守られていて POST/PUT が素通り）で、
その再発防止として `apiRoutePermissions.test.ts` に `handlerChunks()` を書いてある。
**同じリポジトリの、同じ目的の、隣のテストファイルに解決済みの道具があったのに使わなかった。**
`sourceScan.ts` から `walkSource` だけを import し、その隣にある `enclosingFunctions` を
見ていない。新しいテストを「新しく書くもの」と扱い、既存の解を探さなかった。

**再発防止**:
- 仕組み: `handlerChunks()` と `moduleChunk()` を `sourceScan.ts` へ移し、
  両方のテストから import するようにした。**次に構造テストを書く人は、
  ハンドラ単位の切り方を自分で書かずに済む。**
- 習慣（仕組み無し・判断に依存）: 構造テストを書く前に、**既存の構造テストのヘッダを読む**。
  そこに前回の失敗と、その解決策が書いてある

---

## M-20260903-wrote-future-date 今日の日付を確認せずに、2日先の日付を記録に書いた（2026-09-03・旧 M-011）

**Before**: 今日を 2026-09-05 だと思い込み、代表判断の日付として
`2026-09-05` を **6つのソースコメント・権限表の見出し・事業ログ4ファイル**に書いた。
「代表判断（2026-09-05）」という形で、コードの中に根拠日として残していた。

**After**: 実際は **2026-09-03**。`date -u` でも `git log --date=short` でも1秒で確かめられた。
マージ直前に PR の本文を読み返して気づき、13ファイルを一括修正した。

**なぜ気づけなかったか**:
前の作業（2026-09-01）の日付は git log から取って正しく書いていた。**「前回はいつか」は
調べたのに、「今日はいつか」は調べなかった。** 過去の日付は自分の記憶に無いから調べる、
今日の日付は知っている気がするから調べない——この非対称が原因。
知っている気がするものほど確かめていない。

さらに悪いのは、これが**事業ログに入る日付**だったこと。コードコメントなら読み手が
git blame で正せるが、DECISION_LOG の「1. 日付」は**その記録自体が唯一の出典**になる。
誤った日付で記録された意思決定は、後から検証する手段が無い。

**なぜ検証をすり抜けたか**: `tsc` も `lint` も `vitest` も日付の内容は見ない。
テストが全部通っていたので「検証済み」だと思っていた。**テストが通ることは、
テストが見ている範囲しか保証しない。** 日付・件数・固有名詞はその範囲の外にある。

**同種の誤りが同じ PR にもう1件**: PR 本文に「28件すべてに分類コメント」と書いていたが、
後続コミットで分類を直した結果 **実数は29件**になっていた。本文を更新していなかった。
数えたのは事実だが、**数え直さなかった**。

**再発防止**:
- 仕組み: `docs/context/` の新規エントリの見出し日付が、そのコミットの
  `git log --date=short` と一致するかを検査する。**未実装**（OPEN_QUESTIONS に起票）
- 習慣（仕組み無し・判断に依存）:
  - 記録に日付を書く前に `date -u` を打つ。**「今日は◯日のはず」で書かない**
  - PR 本文に件数を書いたら、**マージ直前にもう一度数える**。
    後続コミットで実数が動く。書いた時点で正しかったことは、今正しいことを意味しない
  - **テストが通っても、テストが見ていない主張（日付・件数・出典）は未検証**と扱う

---

## M-20260901-file-granularity 検出器の粒度がファイル単位だった（2026-09-01・旧 M-001）

**Before**
- 信じたこと: 「認可チェックの無い変更系ルートは 125本」
- 根拠: 自作の調査スクリプト。`route.ts` を1ファイル読んで、ファイル全体に
  `requirePermission(` 等が1つでもあれば「強制済み」と数えていた
- したこと: この数字を PR・DECISION_LOG・RELEASE_LOG・requirement-trace の4箇所に書いた

**After**
- 実際: **ファイル単位では、同じファイルの別ハンドラのガードが未強制ハンドラを隠す。**
  `admin/invoices` は DELETE だけが `minRole: "admin"` を持ち、**POST/PUT（請求書の
  作成・編集）は素通り**だったのに「強制済み」に数えられていた
- 正しい数: ハンドラ単位で数え直すと **412 中 157 が未強制**（125 ではない）
- **なぜ気づけなかったか**: 構造テスト側では「ファイル全体ではなく書き込みを含む関数の
  中で見る」と**同じ粒度の誤りを先に直していた**。直した場所と数えた場所が別々で、
  片方の教訓をもう片方に持っていかなかった
- 変えたこと: 調査をハンドラ単位に変更。4文書の数字を訂正
- **再発防止**: `src/lib/auth/__tests__/apiRoutePermissions.test.ts` に
  「未登録の変更系ハンドラ」テストを追加。ハンドラ単位で走査し、既知の一覧に無いものが
  出たら落ちる。逆に既知一覧に強制済みが残っていても落ちる（棚卸しの取りこぼし防止）

---

## M-20260903-role-name-substring 正規表現がロール名の部分一致を起こしていた（2026-09-03・旧 M-002）

**Before**
- 信じたこと: 「`billing:manage` は admin も持つ」
- 根拠: `ROLE_PERMISSIONS` から抽出した自作スクリプト。
  `body.match(new RegExp(role + ':\\s*\\[([\\s\\S]*?)\\]'))`
- したこと: 「備品購入は admin 以上」という代表判断を
  `requirePermission(caller, "billing:manage")` で実装。コメント4箇所と
  DECISION_LOG の却下理由にもこの前提を書いた

**After**
- 実際: **`admin:` は `super_admin:` の中にもマッチする。** admin のつもりで
  super_admin の一覧を読んでいた。`billing:manage` を持つのは owner と super_admin だけで、
  **admin は `billing:view` しか持たない**
- 影響: 「admin 以上」と書きながら実装は owner 限定。代表判断と実装が食い違っていた
- **なぜ気づけなかったか**: 抽出結果が「それらしく」見えたので検算しなかった。
  `admin` の権限数が 56 と出て super_admin と同じだった時点で疑うべきだった
  （実際は admin 53 / super_admin 56）
- 変えたこと: `requireMinRole(caller, "admin")` に修正。DECISION_LOG の却下理由も訂正。
  抽出は `'\\n  ' + role + ': \\['` で行頭からアンカーする形に
- **再発防止**: 仕組み無し（判断に依存）。**ロール名・権限名など「他の識別子の部分文字列に
  なりうる名前」を正規表現で引くときは、必ず境界をアンカーする。**
  検算として「抽出件数が別のロールと一致していないか」を見る

---

## M-20260903-incomplete-guard-vocabulary 検出器のガード語彙が不完全なのに、出力を「認可が無い」と読んだ（2026-09-03・旧 M-003）

**Before**
- 信じたこと: 「認可未強制が 24ハンドラ残っている」
- 根拠: 検出器の GUARD 正規表現。`requirePermission` / `requireMinRole` など
  **決め打ちの関数名**を探す作り
- したこと: この24本の方針を代表に判断してもらうつもりで質問を組み立てた

**After**
- 実際: 1本ずつ読んだら **10本は既に別の形で守られていた**
  （`canModifyLesson()` の著者判定、`createLesson.ts` の permission チェック、
  `caller.role !== "super_admin"` のインライン判定、ローカルの `isAuthor()`）。
  さらに **6本は自己完結で現状維持が正しかった**。本当に無防備だったのは **8本**
- 特に `admin/academy/rewards/[id]/apply`（**Stripe の credit を動かす**）を無防備だと
  思い込んでいたが、実際は `super_admin` のみで守られていた
- **なぜ気づけなかったか**: 認可は任意のヘルパーで書けるので、正規表現で網羅することは
  **原理的にできない**。にもかかわらず出力を「認可が無い一覧」として扱った。
  **「検出器が認識できない」と「認可が無い」は別のことだ**という区別をしていなかった
- 変えたこと: 既知リストの**意味を変えた**。「認可が無い」→
  **「この検出器が認可を認識できない」**。29件すべてに分類コメント（自己完結・認証前・
  読み取りのみ・Server Action 委譲・受講・著者判定）を付けた
- **再発防止**: テストのコメントに限界を明記
  （「この一覧は必ず不完全になる。分類コメントが実態を持つ」）。
  **網羅を諦めて、一覧の名前と意味を実態に合わせる**方を選んだ

---

## M-20260903-classified-by-shape コードの形から分類し、中身を読んでいなかった（2026-09-03・旧 M-004）

**Before**
- 信じたこと: `admin/academy/cases` は「所有者判定で守られている」、
  `admin/notifications/[id]/read` は「自己完結（自分のデータだけを操作する）」
- 根拠: 前者は `apiValidationError("この事例への操作権限がありません")` という行があったこと、
  後者は「通知の既読」という**名前から受ける印象**
- したこと: 両方を「対応不要」として既知リストに分類コメント付きで置いた

**After**
- 実際:
  - `academy/cases` は **`existingCase.tenant_id !== caller.tenantId` のテナント判定だけ**。
    所有者判定ではない。**閲覧専用ロールでも事例を公開でき**、公開は AI 要約を呼び（費用が出る）、
    `knowledge_chunks` に `tenant_id: null`（**全加盟店共有**）の行を書く
  - `notifications/[id]/read` は **`tenant_id` だけで絞っている**。`user_id` 列はあるが
    **本番61件すべて null**。誰かが既読にすると**同じテナントの全員の画面から消える**
- **なぜ気づけなかったか**: 「権限がありません」という**文字列を見て認可だと判断した**。
  条件式を読んでいない。通知の方は本番データを一度も見ずに「自分のデータ」と決めつけた
- 変えたこと: `cases` は staff 以上のガードを追加。`notifications` は挙動を変えず
  （user_id で絞ると既存61件が既読にできなくなる）、分類を訂正して OPEN_QUESTIONS に起票
- **再発防止**: 仕組み無し（判断に依存）。**「守られている」と分類する前に、
  その条件式が何と何を比べているかを声に出して言えるか確認する。**
  自己完結だと判断する前に、**本番データでその前提（user_id が埋まっている等）を確認する**

---

## M-20260903-one-of-two-paths 同じ操作に2経路あるのに1本だけ塞いだ（2026-09-03・旧 M-005）

**Before**
- 信じたこと: 「備品購入を admin 以上にした」
- したこと: `admin/shop/checkout`（Stripe 決済）にガードを追加

**After**
- 実際: **同じ買い物が `admin/shop/orders`（請求書払い）からも作れた**。
  `src/app/admin/shop/page.tsx` は支払い方法のラジオで送信先を切り替えるだけで、
  **ラジオを1つ切り替えれば staff で同じ `shop_orders` 行が作れた**
- **なぜ気づけなかったか**: ルート単位で作業しており、**画面から見た「1つの操作」に
  いくつ入口があるかを見ていない**。証明書の無効化で5経路を洗い出したときと同じ構図なのに、
  その経験を適用しなかった
- 変えたこと: 両方を admin 以上に揃えた
- **再発防止**: 仕組み無し（判断に依存）。**ガードを1本入れたら、その操作を起こす画面を
  開いて「他の入口はないか」を見る。** 特に支払い方法・送信手段など**分岐のある UI**は疑う

---

## M-20260903-business-logic-as-authz 検出器を広げたら、業務ロジックを認可と誤認した（2026-09-03・旧 M-006）

**Before**
- したこと: M-003 の対策として GUARD に `caller\.role\s*(===|!==)` を追加。
  インラインのロール判定を認識させるつもりだった

**After**
- 実際: `mobile/account [DELETE]` の
  `const isSoleOwner = caller.role === "owner" && otherOwners.length === 0;`
  （**最後の owner ならテナントを無効化する、という業務ロジック**）にマッチし、
  このハンドラが**既知リストからも消えて、どこにも分類されなくなった**
- **なぜ気づけなかったか**: 検出器を広げたあと、**一覧の差分（何が消えたか）を確認しなかった**。
  数が 46→28 に減ったことを「改善」としか見ていない
- 変えたこと: **弾いている形まで要求する**正規表現に変更
  （`caller\.role\s*!==\s*"..."` の後 80文字以内に `apiForbidden`）。
  `canModifyLesson` / `isAuthor` も呼び出しの存在ではなく否定形を要求する形に揃えた
  （`enforces()` が `!` を要求しているのと同じ理由）
- **再発防止**: 検出器の性質を縛るテストを追加（結果を捨てる書き方を認可と見なさない）。
  **検出器を変えたら、一覧から「消えたもの」を1件ずつ確認する**

---

## M-20260901-exemption-disabled-rule 免除の設定がルールを丸ごと無効化していた（2026-09-01・旧 M-007）

**Before**
- したこと: web から `apps/mobile` の import を禁じる `no-restricted-imports` を
  `eslint.config.mjs` に追加

**After**
- 実際: **ルールが発火しなかった。** 既存の設定に
  ```js
  files: ["src/lib/supabase/admin.ts", "src/lib/**/__tests__/**"],
  rules: { "no-restricted-imports": "off" },
  ```
  があり、admin クライアントの例外のつもりで**ルールを丸ごと無効化**していた。
  そして **main を壊した import はまさにこの免除の内側**（`src/lib/ui-preferences/__tests__/`）にあった
- **なぜ気づけなかったか**: ルールを足して**発火することを確認しなかったら**気づけなかった。
  実際、確認したから見つかった（`--print-config` で severity が `0` になっていた）
- 変えたこと: 免除を admin の `paths` だけに絞り、パターンは残す形に
- **再発防止**: **lint ルールを足したら、必ず「実際に落ちる例」で発火を確認する。**
  設定を書いただけでは何も保証されない

---

## M-20260901-moved-test-got-weaker テストを移設したら弱くなっていた（2026-09-01・旧 M-008）

**Before**
- 信じたこと: 「同じ検査を別の場所に置くだけ」
- したこと: web の vitest テストをモバイルの `*.check.ts` へ移設

**After**
- 実際: **2つ弱くなっていた**
  - `node:assert` の `deepEqual` は `==` 比較で、`3` と `"3"`、`false` と `0` を通す。
    vitest の `toEqual` より弱い
  - 消した web のテストは root の `tsc --noEmit` に含まれていたが、
    `apps/mobile/tsconfig.json` は `**/*.check.ts` を `exclude` していた。**型検査から外れた**
- **なぜ気づけなかったか**: 「移設」という言葉に引きずられて、**移設元と移設先の検査の
  強さを比べなかった**
- 変えたこと: `node:assert/strict` に変更（**既存12本も同じ弱さだったので14本すべて**）。
  tsconfig の exclude を外し `allowImportingTsExtensions` を付けて、**既存13本を含めて**
  型検査の対象に
- **再発防止**: 仕組み無し（判断に依存）。**検査を移すときは「移設先で同じ強さか」を
  1項目ずつ比べる**（比較の厳密さ・型検査の有無・実行されるか）

---

## M-20260901-local-only-pass 手元では通るのに CI だけ落ちる構成を作った（2026-09-01、原因は別の作業者・旧 M-009）

**Before**
- 起きたこと: web のテストが `apps/mobile` のソースを**直接 import** していた
- 手元では通る（`apps/mobile/node_modules` があるため）

**After**
- 実際: ルートの `package.json` に `workspaces` が無く、web の CI は root の `npm ci` しか
  実行しない。`apps/mobile/tsconfig.json` が継承する `expo/tsconfig.base` が解決できず
  **CI だけが落ちる**。main が約9時間赤いままだった
- エラーが `[TSCONFIG_ERROR] Tsconfig not found` で、原因（依存が別々）に結びつかない
- 変えたこと: モバイルの関数はモバイル側の規約（`*.check.ts`）で検査する形に移設
- **再発防止**: `eslint.config.mjs` で `src/**` と `scripts/**` から `**/apps/mobile/**` の
  import を禁止（M-007 の免除も直した上で、実際に落ちることを確認済み）

---

## M-20260901-parallel-ci-log-misread 並列実行の CI ログで失敗元を2回誤読した（2026-09-01・旧 M-010）

**Before**
- 信じかけたこと: 「lint の出力の直後に `exit 1` だから lint が落ちた」

**After**
- 実際: `Lint, Type Check & Unit Tests` は5つのチェックを `&` で並列実行して
  `wait $PID || exit 1` で待つ。**ログの末尾は失敗したチェックの出力とは限らない。**
  `npm run lint` 自体は 0 errors だった
- さらに生ログの配信元（Azure Blob）はこの環境のプロキシで遮断されており、
  GitHub の API も末尾しか返さない
- **なぜ気づけなかったか**: ログの見た目の順序を実行順序だと思った
- 変えたこと: **マージコミットを作り、CI と同条件（`apps/mobile/node_modules` を外す）で
  ローカル再現**して失敗元を特定した
- **再発防止**: ~~仕組み無し（判断に依存）~~ → **2026-09-04 に仕組みが入った。**
  起票していた「CI 側の改善（失敗元の明示）」を実装した（`scripts/ci-parallel-checks.sh`）。
  並列のまま出力をチェックごとに分け、`::group::` で1本ずつ出し、
  **失敗したチェックの出力だけをいちばん最後にもう一度出す**。
  API が末尾しか返さなくてもそこに失敗元が写る（`tail_lines` 75 で結果表まで届くことを
  実ログで確認済み）。詳細は DECISION_LOG 2026-09-04
  「CI の並列チェックを、速度を落とさず失敗元が末尾に写る形にした」。
  **「並列実行のログでは末尾を信用しない」という習慣はもう要らない** —— 末尾が信用できる。

---

## 台帳の使い方

新しく自分の誤りが判明したとき:

0. **ID を `M-<YYYYMMDD>-<スラッグ>` で付ける**（例 `M-20260915-dupe-count-from-truncated-grep`）。
   **連番は採らない** —— 並行セッションが同じ番号を取り合って衝突し続けた（冒頭の「ID について」）。
   スラッグは英小文字・数字・ハイフンで、**何を間違えたか**が分かる語にする。
   旧番号（`旧 M-NNN`）は移行時の別名なので、新規エントリには付けない。
   `npm run check:ledger-ids` が書式・重複・件数の下限を見ている（CI + pre-commit）
1. **次に上の「型」の表を見る。** 同じ型があれば、その型の既存エントリの
   「再発防止」が効かなかった理由を書く（仕組みが無かったのか、あったのに迂回したのか）
2. Before / After を書く。**「なぜ気づけなかったか」を必ず書く。** 直した内容より重要
3. 再発防止を書く。仕組みで止められないなら「仕組み無し（判断に依存）」と正直に書き、
   何を習慣にするかを書く
4. 新しい型なら表に行を足す
