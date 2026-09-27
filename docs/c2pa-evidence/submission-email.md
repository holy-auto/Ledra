# C2PA 証拠パッケージ 提出メール（下書き）

- 宛先: Administrator からの受理メール（2026-09-03, Record ID `01a06690-d01e-7608-ad8a-cd4f1a49d76e`）に**返信**する
- 添付: `Ledra-C2PA-Evidence-01a06690.zip`（作り方は末尾）
- 送信前に必ずやること（代表）:
  1. Conformulator（https://c2pa-conformulator.netlify.app/）に `samples/` の4ファイルを1つずつ入れ、
     出る指摘が `signingCredential.untrusted`（テスト証明書なので想定内）だけであることを確認する。
     赤いエラー欄の確認に加え、「評価基準」タブで不合格の項目が無いことも見る。概要の黄色ラベルのうち
     "Contains ambiguous actions" は汎用 `c2pa.edited` が原因と見て `c2pa.edited.metadata` に変えた（2026-09-27）ので、
     **新しいサンプルで消えたかを確認**する。"Non-editorial Transformations"（回転・再エンコード）は実際に行った処理の
     表示と推定（未確認）。
     **それ以外の指摘が出たら送らずに Claude に結果を貼る。**
  2. `Ledra-GPSA.md` の §2.2（Vercel の本番環境変数を見られるのは管理者だけ）、§2.6（Vercel/Supabase に
     入れる人）が実態と合っているかを確認する。
  3. 英文の本文をそのまま送る（下の日本語訳は確認用）。

---

## English (send this)

Subject: Re: C2PA Conformance Program — Evidence package for record 01a06690-d01e-7608-ad8a-cd4f1a49d76e (Ledra, HOLY Inc.)

Dear Conformance Program Administrator,

Thank you for accepting our Intake Form. Please find our evidence package for Ledra (record ID
01a06690-d01e-7608-ad8a-cd4f1a49d76e) attached as Ledra-C2PA-Evidence-01a06690.zip.

1. Correction to our Intake Form — validation assertion withdrawn

Our Intake Form asserted claim validation for image/jpeg, image/png, image/webp and image/heic. We
withdraw that assertion and ask that this record cover claim generation only:

- Generate: image/jpeg, image/png, image/webp, image/heic
- Validate: none

Ledra reads incoming C2PA manifests for its own records, but it does not embed incoming assets as
ingredients, because the pre-processing originals carry GPS location data. For that reason we are not
submitting ingredient files. All other Intake Form values are unchanged.

2. Samples (folder "samples")

- a-sample.jpg — image/jpeg
- b-sample.png — image/png
- c-sample.webp — image/webp
- d-sample.heic — image/heic

Each sample was produced by Ledra's production signing pipeline (EXIF/GPS removal and re-encode, then
claim generation and signing). The inputs were synthetic test captures carrying EXIF orientation and GPS
metadata, so the JPEG, PNG and WebP manifests list c2pa.created (digitalCapture), c2pa.orientation,
c2pa.converted and c2pa.edited.metadata with allActionsIncluded = true. For the HEIC
sample the Backend's image library does not decode HEVC, so the asset is signed as received and the
manifest lists only c2pa.created with allActionsIncluded = false. This is the product's behaviour for
that input and is described in the GPSA document, section 1.6.

The samples are signed with the ES256 test certificate from the c2pa-rs test fixtures, because we will
receive a production Claim Signing Certificate only after conformance. We self-tested them in the
Conformulator; the only finding is the expected untrusted signing credential.

3. Architecture (folder "GPSA")

- Ledra-GPSA.md — Generator Product Security Architecture document (template v0.2), Backend class,
  Assurance Level 1
- Ledra-GPSA-Operational-Controls.md — supporting document (scanning, remediation policy, OWASP Top 10
  coverage, key rotation)
- Ledra-GPSA-TOE-Diagram.png — Target of Evaluation diagram

Please let us know if you need anything further.

Best regards,

Yusuke Horikoshi
Representative Director, HOLY Inc.
info@holy-inc.jp

---

## 日本語訳（確認用・送らない）

件名: Re: C2PA Conformance Program — 記録 01a06690-… の証拠パッケージ（Ledra / 株式会社HOLY）

Intake Form の受理ありがとうございます。Ledra の証拠パッケージを zip で添付します。

1. Intake Form の訂正 — 検証（validate）の申告を取り下げます
   Intake Form では jpeg/png/webp/heic の検証も申告しましたが、取り下げ、生成のみの記録にしてください
   （生成: jpeg/png/webp/heic、検証: なし）。Ledra は受け取った C2PA マニフェストを自社記録用に読みますが、
   元写真に GPS が含まれるため ingredient として埋め込みません。そのため ingredient ファイルは提出しません。
   他の項目は変更ありません。

2. サンプル（samples フォルダ）: a〜d の4ファイル。本番の署名パイプライン（EXIF/GPS 除去・再エンコード → 署名）で
   作成。入力は回転情報と GPS 付きの合成テスト画像なので、JPEG/PNG/WebP は「作成・回転・変換・メタデータ除去」の
   4行為を記録し allActionsIncluded=true（メタデータ除去はメタデータ専用の c2pa.edited.metadata）。HEIC はサーバーの画像ライブラリが HEVC を読めないため受け取ったまま署名し、
   「作成」のみ・allActionsIncluded=false（製品の実際の挙動で、GPSA §1.6 に記載）。
   署名は c2pa-rs のテスト用 ES256 証明書（本番証明書は適合後に発行されるため）。Conformulator で自己テスト済み、
   指摘は想定どおりの「信頼されていない証明書」のみ。

3. アーキテクチャ（GPSA フォルダ）: GPSA 本体・運用管理策の補足資料・TOE 構成図。

---

## zip の作り方（リポジトリのルートで）

```sh
rm -rf /tmp/pkg && mkdir -p /tmp/pkg/samples /tmp/pkg/GPSA
cp docs/c2pa-evidence/samples/* /tmp/pkg/samples/
cp docs/c2pa-evidence/Ledra-GPSA.md docs/c2pa-evidence/Ledra-GPSA-Operational-Controls.md /tmp/pkg/GPSA/
cp docs/diagrams/c2pa-gp-toe.png /tmp/pkg/GPSA/Ledra-GPSA-TOE-Diagram.png
(cd /tmp/pkg && zip -r ../Ledra-C2PA-Evidence-01a06690.zip samples GPSA)
```
