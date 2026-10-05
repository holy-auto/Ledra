# C2PA 再提出メール（下書き・2026-10-02）

> 1版目（9/27 送信・9/28 差し戻し）の下書きは git 履歴（c4cc5816 以前）にある。これは再提出用。

- 宛先: Administrator の差し戻しメール（2026-09-28、Record ID `01a06690-d01e-7608-ad8a-cd4f1a49d76e`）に**返信**する
- 添付: `Ledra-C2PA-Resubmission-01a06690.zip`（samples 8ファイル＋GPSA 3ファイル）
- 送信前に代表が確認すること:
  1. ✅ 2026-10-02 確認済み: `www`・`app.ledra.co.jp` とも TLS 1.2 は exit 35、TLS 1.3 は 200・`Server: cloudflare`、
     `http://app.ledra.co.jp` は 301 で `https://` へ。
  2. ✅ 2026-10-02 確認済み: 本番で写真アップロードができる（403 にならない）。
  3. 英文の本文をそのまま送る（下の日本語訳は確認用）。

---

## English (send this)

Subject: Re: C2PA Conformance Program — Resubmission for record 01a06690-d01e-7608-ad8a-cd4f1a49d76e (Ledra, HOLY Inc.)

Dear Conformance Program Administrator,

Thank you for your review of our first submission and of our GPSA document. Please find our revised
package attached as Ledra-C2PA-Resubmission-01a06690.zip.

1. Validation assertion reinstated

Following your recommendation, we reinstate claim validation. Please record:

- Generate: image/jpeg, image/png, image/webp, image/heic
- Validate: image/jpeg, image/png, image/webp, image/heic

Every uploaded file is ingested as the parentOf ingredient of a c2pa.opened action. When it carries a
C2PA manifest, that manifest is validated during claim generation and recorded with its validation
results in the ingredient assertion. For Additional Requirement §2.3 we have a test harness that takes
an asset, a C2PA Trust List, a TSA Trust List and a validation time, and outputs the results in crJSON.
It uses the same validation engine as the product. We are ready to run it on the Program's test inputs.

2. Corrections to the samples

- Backend products do not assert c2pa.created: each manifest now begins with c2pa.opened, referencing
  the uploaded file as its parentOf ingredient.
- The opened action is the first action of the first created actions assertion.
- The custom action parameter has been removed; no custom action parameters remain.
- Every perceptible transformation action carries a digitalSourceType. allActionsIncluded is true.

3. Samples (folder "samples")

| Output        | Input (ingredient) | Actions in the output manifest                    |
| ------------- | ------------------ | ------------------------------------------------- |
| a-sample.jpg  | a-ingredient1.jpg  | c2pa.opened, c2pa.converted, c2pa.edited.metadata |
| b-sample.png  | b-ingredient1.png  | c2pa.opened, c2pa.converted                       |
| c-sample.webp | c-ingredient1.webp | c2pa.opened, c2pa.converted                       |
| d-sample.heic | d-ingredient1.heic | c2pa.opened                                       |

a-ingredient1.jpg and b-ingredient1.png are from the ingredient library you provided. The library has
no WebP or HEIC file, so c-ingredient1.webp and d-ingredient1.heic were made from a library JPEG and
signed with the c2pa-rs test certificate. Each output was produced by Ledra's production signing
pipeline. The Backend's image library does not decode HEVC, so the HEIC input is signed as received
and its manifest lists only c2pa.opened (GPSA section 1.6).

The outputs are signed with the ES256 test certificate from the c2pa-rs test fixtures. In the
Conformulator, each of the four outputs passes the Conformance 0.1 / Spec 2.2, 0.2 / Spec 2.2 and
0.2 / Spec 2.4 rubrics; the only finding is the expected untrusted signing credential.

4. GPSA changes (folder "GPSA")

- O.4: the Target of Evaluation is the Backend only. Web and mobile clients are outside the TOE and
  treated as untrusted input sources (section 1.6 and the diagram).
- O.5: client traffic reaches the Backend through a Cloudflare proxy with Minimum TLS Version 1.3;
  TLS 1.2 handshakes are refused. Photo uploads are accepted only through that proxy. Backend to
  Supabase connections require TLS 1.3 as the minimum version (section 2.5).

Files: Ledra-GPSA.md, Ledra-GPSA-Operational-Controls.md, Ledra-GPSA-TOE-Diagram.png.

Please let us know if you need anything further.

Best regards,

Yusuke Horikoshi
Representative Director, HOLY Inc.
info@holy-inc.jp

---

## 日本語訳（確認用・送らない）

件名: Re: C2PA Conformance Program — 記録 01a06690-… の再提出（Ledra / 株式会社HOLY）

1回目の提出と GPSA の審査ありがとうございました。修正版を zip で添付します。

1. 検証（validate）の申告を戻します
   ご勧告どおり、生成・検証とも jpeg/png/webp/heic で記録してください。アップロードされたファイルは必ず
   `c2pa.opened` の parentOf ingredient として取り込み、C2PA 付きなら署名時にその manifest を検証し、検証結果ごと
   ingredient に記録します。追加要件 §2.3 用に、資産・C2PA Trust List・TSA Trust List・検証時刻を受け取り
   crJSON を出すテストハーネスを用意済み（製品と同じ検証エンジン）。テスト入力をいただければ実行できます。

2. サンプルの修正
   - Backend は `c2pa.created` を主張しない: 各 manifest は `c2pa.opened`（アップロード原本を parentOf で参照）から始まる。
   - opened は最初の created actions アサーションの先頭。
   - カスタムの action パラメータは削除（残っていない）。
   - 知覚可能な変換には必ず digitalSourceType。allActionsIncluded は true。

3. サンプル（samples フォルダ）: 上の表のとおり。a・b の入力は指定ライブラリの素材。ライブラリに WebP/HEIC が無いため、
   c・d の入力はライブラリの JPEG から作り c2pa-rs のテスト証明書で署名。出力は本番の署名パイプラインで作成。
   HEIC はサーバーの画像ライブラリが HEVC を読めないため受け取ったまま署名し、`c2pa.opened` のみ（GPSA §1.6）。
   署名はテスト証明書。Conformulator で4枚とも適合ルーブリック3つに合格、指摘は想定どおりの untrusted のみ。

4. GPSA の変更
   - O.4: TOE は Backend のみ。Web/モバイルは TOE 外の非信頼入力（§1.6 と図）。
   - O.5: クライアントの通信は最低 TLS 1.3 の Cloudflare 経由（TLS 1.2 は拒否）。写真アップロードはその経路のみ受付。
     Backend→Supabase も最低 TLS 1.3（§2.5）。
