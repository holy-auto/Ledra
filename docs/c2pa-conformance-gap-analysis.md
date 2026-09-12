# C2PA Conformance Program v0.2 — Ledra 適合ギャップ分析

対象文書: **C2PA Conformance Program, Version 0.2 (2026-07-31)**（C2PA Technical Working Group Conformance Task Force）
分析日: 2026-08-11 / 対象コード: `src/lib/anchoring/providers/c2pa*.ts`, `src/lib/documents/documentSeal.ts`, `src/lib/anchoring/authenticityGrade.ts`, `certificate_images` 系マイグレーション

各主張には確度を明記する（**確実** = このセッションでコード/文書に照合済み・**推定** = 未検証の推論・**要確認** = 一次資料の参照が必要）。

---

## 0. 結論（先に要点）

- **Ledra はすでに本物の C2PA Generator Product を持っている。**（確実）`@contentauth/c2pa-node ^0.6.0` の `Builder.withJson` → `builder.sign(LocalSigner)` で、画像に C2PA マニフェストを実際に埋め込んで署名している。`c2pa.actions` 台帳＋独自 `com.ledra.capture` アサーションを封入。ダミー JSON ではない。
- **CPL（Conforming Products List）登録の最大ブロッカーはコードではない。** trust-list 上の CA（DigiCert / SSL.com）から本番 Claim Signing 証明書を取得すること。これは社内で既に把握済み（`OPEN_QUESTIONS.md` 2026-07-27、`docs/c2pa-production-deployment.md`）。
- **本分析で新たに特定した技術ギャップ（社内資料に明示なし）: C2PA クレームに RFC3161 タイムスタンプが埋め込まれていない。** `c2paSigner.ts:112` の `LocalSigner.newSigner(cert, key, "es256", undefined)` — 第4引数（TSA URL）が `undefined`。Ledra の RFC3161 TSA トークンは `certificate_images.tsa_token` に**別保存**されるだけで、C2PA マニフェストの署名の中には入らない。C2PA 検証器はこの外部トークンを見ない。（確実 = コード照合済み）
- **適用ロールは Generator Product (GP) 一択を推奨。** Validator Product (VP) は内部利用の域を出ておらず、CA/TSA は該当しない（後述）。

---

## 1. 適用ロールの判定

Program 4.1 が定める参加者ロールに対する Ledra の当てはめ:

| ロール | Ledra の該当 | 判断 |
|--------|--------------|------|
| **Generator Product (GP)** | 施工写真に C2PA マニフェストを署名・埋め込み | **申請対象**（主目的） |
| Validator Product (VP) | `verifyExternalC2pa` で受信画像の外部マニフェストを検証 | **当面申請しない**（下記） |
| Certification Authority (CA) | 該当なし。Ledra は CA の subscriber になる側 | 対象外 |
| Time-Stamping Authority (TSA) | 該当なし。かつ Program は「TSA 単独申請」を受理しない（6.6.1） | 対象外 |

**VP を当面申請しない理由（確実 + 推定）:** `interpretC2paValidation`（`c2paVerify.ts`）は fail-open で、`*.untrusted`（信頼リスト未登録）を致命扱いしない設計になっている。これは Ledra が「受信画像に付いた他社カメラ由来の署名」を素材確認する内部用途としては正しいが、Program 6.1 が VP に課す **150+ の normative 要件（Signature Validation / Validation Result Reporting 等）** に対する完全準拠を意図した実装ではない（推定 = 一次要件リスト未照合だが、fail-open・簡略コード判定は spec 準拠の validation reporting とは別物）。VP は「Ledra が他社に提供する検証プロダクト」ではなく内部関数なので、CPL に載せる実益が薄い。

---

## 2. GP 適合ギャップ表

Program が GP Applicant に課す要素ごとに、現状と差分を並べる。

| # | Program 要件 | Ledra 現状 | ギャップ | 種別 |
|---|--------------|-----------|----------|------|
| G1 | **本番 Claim Signing 証明書**（trust-list CA 発行、`c2pa-al` 拡張入り、OID `1.3.6.1.4.1.62558.3`） | `dev-signed`（自己署名 ES256・検証器では Invalid）または `production`（env 未投入） | **未取得。CPL 登録の主ブロッカー** | 対外・商用 |
| G2 | **クレーム内タイムスタンプ挿入**（GP 要件「Timestamp Insertion」、TSA Trust List 由来） | C2PA 署名に TSA 未配線（`newSigner(...,undefined)`）。RFC3161 は別列に保存 | **C2PA マニフェスト内に時刻証明が無い** | コード（小） |
| G3 | **GPSA 文書**（Generator Product Security Architecture、Markdown テンプレ） | 未作成 | **要新規作成**（TOE 記述） | 文書 |
| G4 | **Generator Product Security Requirements（AL1 最低）充足** | 署名鍵は env 直置き（`C2PA_SIGNER_KEY`）。KMS/HSM 未実装 | AL1 の具体要件は別文書＝**要確認**。鍵保管が最有力の弱点 | コード/インフラ |
| G5 | **Spec バージョン整合**（Program v0.2 は Spec **v2.2 / v2.4** のみ） | c2pa-node 0.6.0 が出力するマニフェストの spec レベル未確認 | **出力 spec が v2.2/v2.4 か要確認** | 検証 |
| G6 | **300+ GP normative 要件**（Manifest Formatting / Redaction / Claim Signing / Hash Computation / File-type Handling） | ほぼ `c2pa-rs`（c2pa-node）に委譲＝ライブラリ準拠を継承 | G2 以外は概ねライブラリ側で充足（推定）。要 interop テスト | 検証 |
| G7 | **サンプルエビデンス**（署名済み出力メディア + `.json`/`.crjson`、全 media type 分） | 署名機構は稼働。サンプル未整備 | 証明書取得後に**容易に生成可** | 軽微 |
| G8 | **相互運用テスト（推奨）** | 未実施 | C2PA サンプルアセット/テストスイートで検証推奨 | 検証 |
| G9 | **プロセス**（EOI → 法的合意 → Intake → 評価 → Notice of Conformance → CPL 掲載） | 未着手 | 事務手続き。**C2PA 側の費用はゼロ**（6.5.1） | 事務 |

---

## 3. 技術的に重要な発見（G2）— C2PA クレームに時刻が入っていない

**現状（確実）:** `signC2pa` は `com.ledra.capture` に `tsa_timestamp`（RFC3161 の genTime 文字列）を*平文アサーション*として封入するが、これは「Ledra がそう主張している文字列」に過ぎず、**暗号的な第三者時刻証明ではない**。本物の RFC3161 トークン（`certificate_images.tsa_token`）は C2PA マニフェストの外（DB 列）にあり、C2PA 検証器の検証対象に入らない。

**なぜ問題か（推定）:** Program は GP 要件に「Timestamp Insertion」を明記し（6.1.1）、専用の **C2PA TSA Trust List** を運用している（2.18）。C2PA の設計思想では、クレーム署名に **TSA Trust List 上の TSA による RFC3161 タイムスタンプ countersignature** を埋め込むことで、署名証明書失効後も署名時刻を証明できる。埋め込みタイムスタンプが normative な SHALL かどうかは **300+ 要件の一次リスト未照合につき【要確認】** だが、少なくとも Assurance / 長期検証性の観点で C2PA が強く期待する構成であることは確実。

**対応（コード小・設計注意あり）:**
- `LocalSigner.newSigner` の第4引数に **C2PA TSA Trust List 上の TSA URL** を渡す。
- ただし `c2paSigner.ts` の既存コメントが警告する通り、**TSA を C2PA 署名に配線すると「TSA が遅い/不達のとき署名全体が throw → fail-open で無署名に落ちる」結合が生まれる**。現状はこれを避けるために意図的に分離している。埋め込み時は署名リトライ/タイムアウト方針を再設計する必要がある。
- **DigiCert の `timestamp.digicert.com`（現行 `PHOTO_TSA_URL`）が C2PA TSA Trust List に載っているかは【要確認】**。DigiCert は conformant CA（2.19「CA は TSA も運営しうる」）なので載っている可能性が高い（推定）が、TSA Trust List（`c2pa-org/conformance-public`）で実際に確認すること。載っていなければ TSA Trust List 上の局に差し替える。

---

## 4. Assurance Level の考え方 — 「三本柱」との混同を正す

Ledra の `computeAuthenticityGrade`（`authenticityGrade.ts`）は **デバイス認証（Play Integrity/App Attest）＋使い捨て nonce ＋撮影時刻封印** の「三本柱」でグレードを決める。これは Ledra 独自の真正性モデルであって、**C2PA の Assurance Level とは別軸**である点を明確化しておく（推定・重要）。

- C2PA の **Max Assurance Level** は、GP の実装アーキテクチャの**セキュリティ属性**（Static Evidence = GPSA 文書 + Security Requirements のレビュー）で C2PA が付与する（5, 2.36, 2.44）。
- C2PA の **Assurance Level（インスタンス単位）** は、証明書 enrollment 時に GP インスタンスが提示する **Dynamic Evidence（ハードウェア裏付けの key/platform attestation）** で決まる（2.6, 2.25）。
- Ledra は **Backend 実装クラス**（署名はサーバ側の単一鍵で実行。撮影は edge だが assertion/claim/signature 生成は backend）＝ 2.32。よって C2PA 的には **「サーバ鍵1本の Backend GP」** として評価され、Assurance Level は主に **Static Evidence（鍵保管・TOE のセキュリティ）** で決まる。Ledra のデバイス attestation は「撮影端末の真正性」を担保するが、**C2PA が Dynamic Evidence として想定する『GP インスタンスが CA へ attestation を提示して証明書を得る』構造とは一致しない**。
- **結論:** まずは **AL1（CPL 最低要件、6.2）** を狙うのが現実的。AL1 の具体要件は Generator Product Security Requirements 文書（本 PDF に含まれない別文書）＝**【要確認】**。AL2 以上は署名鍵の HW 保護（HSM/KMS）＋ attestation を求められる可能性が高い（推定）。TOE の境界は「撮影/アップロード → 署名 → 署名済みアセットの配信/永続化」（6.6.4）なので、Ledra の TOE は **モバイル撮影 → upload API → sharp 再エンコード → C2PA 署名（backend）→ Supabase Storage → 署名鍵保管** を含む。

---

## 5. プロセス・費用（Program 6.5–6.6）

- **C2PA への費用: ゼロ**（6.5.1 — CA/GP/VP の申請料なし、trust list 追加も無料）。（確実 = 文書記載）
- **CA 証明書の費用: 別**（DigiCert / SSL.com の商用条件）。金額・日本からの契約可否・請求通貨・審査期間は**【要確認】**（社内 OPEN_QUESTIONS でも未確定）。
- **手順:** ① Expression of Interest フォーム → ② 役割別の法的合意を Linux Foundation の署名サービスで締結 → ③ Program Intake Form（CPL レコード用の product 情報・media type・狙う Max Assurance Level・GPSA 提出）→ ④ Administrator による evidence 評価 → ⑤ Notice of Conformance（Date of Earliest Public Disclosure で公開日を遅延可）→ ⑥ CPL 掲載（Conformance Explorer に反映）。（確実 = 6.6.1–6.6.8）
- **Material change の再申請義務（6.6.9）:** CPL 掲載後に「product の CPL レコード or GP Security Requirements 準拠に明確な変更」が生じたら**新レコード ID で再提出**が必要。→ 署名パイプライン（`MANIFEST_ACTIONS` の変更、鍵保管方式の変更等）は material change に該当しうる。運用上の注意点として認識すべき。
- **バージョン/猶予（6.7.5）:** Program v0.2 は Spec v2.2・v2.4 を受理。v0.1（Spec v2.2）は sunset 2026-10-09。新バージョン移行には最低 90 日の猶予。

---

## 6. 優先順位付き対応リスト

現実的な着手順（依存関係と「計画を殺すリスク」順、常設指示書§2 に沿う）:

1. **【計画を殺しうる・最優先】狙う Assurance Level を AL1 に確定し、Generator Product Security Requirements 文書を入手して AL1 要件を精査。** ここで「サーバ鍵 env 直置きの Backend GP が AL1 を満たせるか」を確認する。満たせなければ鍵保管（KMS/HSM = `CallbackSigner` 経路、`c2paSigner.ts` 拡張）が先行必須になり計画全体が変わる。→ **要確認の解消が最優先。**
2. **【対外・長リードタイム】DigiCert / SSL.com へ EOI・見積依頼**（費用・日本契約可否・審査期間）。証明書取得は外部プロセスで時間がかかるため早く着手。
3. **【コード小・検証価値大】C2PA クレームへの RFC3161 タイムスタンプ埋め込み（G2）。** ①TSA Trust List で DigiCert TSA の在否を確認 → ②`newSigner` に TSA URL 配線 → ③TSA 不達時の署名リトライ/タイムアウト方針を再設計（fail-open 結合を避ける）。
4. **GPSA 文書の作成（G3）。** テンプレ（Conformance Program documents repo の Markdown）に沿って TOE・実装クラス Backend・鍵保管・撮影→署名フローを記述。§4 の TOE 境界がそのまま骨子になる。
5. **出力 Spec バージョン確認（G5）＋ 相互運用テスト（G8）。** c2pa-node 0.6.0 が v2.2/v2.4 マニフェストを出すか検証。C2PA サンプルアセットで interop 確認。
6. **証明書取得後: `scripts/verify-c2pa-cert.mjs` で `Trusted` を GO 確認 → `C2PA_MODE=production` 反映 → サンプルエビデンス（G7）生成 → Intake Form 提出。**

---

## 7. 要確認事項（一次資料/外部照会が必要）

- **【要確認】** Generator Product Security Requirements 文書の AL1 具体要件（本 PDF 外の別文書）。特にサーバ側単一鍵の env 保管が AL1 を満たすか。
- **【要確認】** c2pa-node 0.6.0 が出力するマニフェストの C2PA Spec バージョン（v2.2/v2.4 整合）。
- **【要確認】** DigiCert `timestamp.digicert.com`（および候補 TSA）が **C2PA TSA Trust List** に載っているか（`c2pa-org/conformance-public`）。
- **【要確認】** 埋め込みタイムスタンプが 300+ GP 要件のうち SHALL（必須）か SHOULD（推奨）か。
- **【要確認】** DigiCert / SSL.com の C2PA claim signing 証明書の費用・更新頻度・日本からの契約可否・請求通貨・審査期間。
- **【要確認】** 狙う Assurance Level（AL1 か AL2 か）— AL2 は HW attestation 要求の可能性。

---

## 参照

- `docs/c2pa-production-deployment.md` — 本番証明書切替手順（G1 の実務）
- `scripts/verify-c2pa-cert.mjs` — 切替前プリフライト（Trusted 判定）
- `src/lib/anchoring/providers/c2pa.ts` / `c2paSigner.ts` / `c2paVerify.ts` — 署名・検証実装
- `src/lib/anchoring/authenticityGrade.ts` — Ledra 独自の真正性グレード（§4 参照）
- `docs/context/OPEN_QUESTIONS.md`（2026-07-27 エントリ）— 証明書取得・鍵保管の未決事項
