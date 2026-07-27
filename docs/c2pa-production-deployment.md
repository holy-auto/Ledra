# C2PA 本番導入手順（production 署名証明書の取得と切替）

施工写真の C2PA 来歴署名を `dev-signed`（動作確認用・検証器では Invalid）から
`production`（公開検証器で「検証済み」表示）へ切り替えるための手順。

コード側の署名パイプラインは実装・検証済み（`src/lib/anchoring/providers/c2pa.ts` /
`c2paSigner.ts`、PR #831）。**残るブロッカーは「本番署名証明書の取得」だけ**で、
これは C2PA Conformance Program への登録を伴い、コードでは完結しない。

## 1. なぜ普通の証明書ではダメか

C2PA の検証器（Content Credentials Verify 等）は、署名証明書が **公式 C2PA Trust List**
上の root にチェーンするかを見る。チェーンしなければ `validation_state=Invalid` と表示され、
無署名より悪い（「偽の来歴」に見える）。自己署名（`dev-signed`）や社内 CA 単体は Invalid のまま。

- 公式 Trust List: `c2pa-org/conformance-public` リポジトリの
  [`trust-list/C2PA-TRUST-LIST.pem`](https://github.com/c2pa-org/conformance-public/blob/main/trust-list/C2PA-TRUST-LIST.pem)
- 確認時点（2026-07-27）で 28 証明書（root / ICA）。含まれる発行者:
  DigiCert・SSL.com・Google・Adobe・Xiaomi・Huawei・vivo・Irdeto・TrustAsia・
  Snowball・Huanyu・Encypher・Tauth・Trufo・Verimago。
  この多くはデバイスメーカーの自社署名用。**サードパーティに claim signing 証明書を
  商用発行しているのは主に DigiCert と SSL.com**（両社は 2025-09 に conformant CA 化）。

## 2. 取得フロー（Conformance Program）

C2PA Trust List の CA から署名証明書を得るには、Ledra を「Conforming Product」として
登録する必要がある（証明書を買うだけではない）。

1. **Expression of Interest フォーム提出**（C2PA Conformance Program）。
2. プロダクトの**適合性・セキュリティ評価**を受け、Conforming Products List (CPL) に登録。
   - Assurance Level により要件が変わる。上位レベルはハードウェア裏付けの attestation を
     証明書発行時に求められることがある。【要確認: Ledra が狙う Assurance Level】
3. Trust List CA（DigiCert または SSL.com 等）から end-entity 署名証明書を発行。
   - 費用は CA の商用条件次第。【要確認: 発行費用・更新頻度・年額】
   - 【要確認: 日本からの契約可否・請求通貨・審査期間】

> メモ: 一次情報は `c2pa-org/conformance-public` の `docs/current/`（Program 規程）と
> `legal-agreements/`。CA 側は SSL.com / DigiCert の「Content Credentials / C2PA」製品ページ。

## 3. 証明書が用意できたら（env 投入）

`.env` に以下を設定（詳細は `.env.example` の C2PA セクション）:

- `C2PA_MODE=production`
- `C2PA_SIGNER_CERT`: PEM **チェーン**。end-entity（署名用）を先頭に、上位 ICA を続ける
  （root は含めない）。
- `C2PA_SIGNER_KEY`: 上記に対応する秘密鍵。**PKCS#8 PEM**（`-----BEGIN PRIVATE KEY-----`）。
  SEC1 の `EC PRIVATE KEY` は不可 → `openssl pkcs8 -topk8 -nocrypt -in ec.key -out pkcs8.key`。

end-entity 証明書は c2pa-rs の profile を満たすこと（通常 CA 発行なら満たす）:
`KeyUsage=digitalSignature` / `ExtendedKeyUsage=emailProtection`(OID 1.3.6.1.5.5.7.3.4) /
`SubjectKeyIdentifier` / `BasicConstraints CA:FALSE`。署名アルゴリズムは鍵に応じて
`es256`(P-256) / `es384`(P-384) / `ps256`(RSA) 等。現状コードは `es256` 固定
（P-384 や RSA 証明書を使う場合は `c2paSigner.ts` の `newSigner` 第3引数を合わせる）。

## 4. 切替前チェック（必須）

**本番反映の前に、証明書がちゃんと「Trusted」になるかをローカルで確認する。**
このためのプリフライト検証スクリプトを用意した:

```bash
# cert はチェーン PEM、key は PKCS#8 PEM
C2PA_SIGNER_CERT=./chain.pem C2PA_SIGNER_KEY=./key.pk8.pem \
  node scripts/verify-c2pa-cert.mjs
```

- 実際に Ledra と同じ manifest 構成で署名し、公式 Trust List を trust anchor に読み戻す。
- `validation_state === "Trusted"` のときだけ **GO**（exit 0）。
- `Valid`（署名は正しいが Trust List 非チェーン）や `Invalid` は **NO-GO**（exit 1）。
- オフライン検証は `--trust-list=<path>` でローカルの Trust List PEM を指定。
- P-384/RSA 証明書なら `--alg=es384` 等を付ける。

GO を確認してから `C2PA_MODE=production` を本番に反映する。

## 5. 鍵の保管（要決定）

- **env 直置き**（`C2PA_SIGNER_KEY`）: 現行コードが対応。シンプルだが秘密鍵が環境変数に載る。
- **KMS**（推奨・未実装）: `@contentauth/c2pa-node` の `CallbackSigner` を使えば、署名処理を
  外部 KMS（例: AWS KMS / GCP KMS）に委譲でき、秘密鍵をアプリに置かずに済む。導入時は
  `c2paSigner.ts` に CallbackSigner 経路を追加する。【要決定: env か KMS か】

## 6. 当面の推奨：TSA（タイムスタンプ）で撮影時封印を成立させる

C2PA 本番証明書の取得（英語の適合認定プロセス）を待たずに、**各施工写真に第三者の
タイムスタンプ（RFC3161）を付ける**ことで「この画像がこの時刻に存在した」ことを
Ledra のサーバーに依存せず検証可能にできる。実装・配線は完了済み（`processUploadedPhoto`
→ `requestPhotoTimestamp`、`src/lib/anchoring/providers/photoTsa.ts`）なので、**環境変数を
設定するだけ**で有効になる。コード変更不要。

### 有効化手順（Vercel の環境変数に 2 つ追加するだけ）

| 変数 | 値 |
|------|-----|
| `PHOTO_TSA_ENABLED` | `true` |
| `PHOTO_TSA_URL` | `http://timestamp.digicert.com` |

- DigiCert の公開 TS局は無料・口座不要・世界的に信頼される。まずはこれで十分。
- 国内の法的効力（電子帳簿保存法 等）を重視する段階になったら、**JIPDEC 認定 TS局**
  （有料契約: セイコーソリューションズ / アマノ / サイバーリンクス 等）の URL に差し替え、
  必要なら `PHOTO_TSA_USERNAME` / `PHOTO_TSA_PASSWORD`（Basic 認証）も設定する。

### 有効化するとどうなるか（正直なスコープ）

- **効くこと**: 以降にアップロードされる各写真に TSA トークンが付き
  （`certificate_images.tsa_token` / `tsa_timestamp_at` に保存）、第三者が TS局に対して
  独立に「その時刻に存在した」ことを検証できる。撮影時封印（`captureTimeSealOk`）が成立する。
- **これだけでは grade は上がらない**: 公開バッジの `authenticity_grade` が `verified` に
  上がるには、撮影時封印に加えて**デバイス認証**（Play Integrity / App Attest）と
  **使い捨てnonce**も必要（`computeAuthenticityGrade` の三本柱）。TSA はそのうちの 1 本目。
  残り 2 本は別途モバイル撮影経路の有効化が要る。
- 失敗しても安全: TS局が遅い/不達でもアップロードは止まらず、その写真だけ封印なしで
  degrade する（サイレントに担保を騙らない）。

### 動作確認

有効化後、施工写真を 1 枚アップロードし、管理画面の証明書詳細でタイムスタンプが
付いていること（または `certificate_images.tsa_timestamp_at` が入っていること）を確認する。

> 注: サンドボックス環境からは外向き通信ポリシーにより TS局へ到達できないため、
> 本番/ステージング等の通常の外向き通信がある環境で確認すること。RFC3161 クライアント
> 自体は部品確定署名の TSA（`PARTS_TSA_*`）と同一の実装で、`rfc3161.test.ts` で
> エンコード/パースを検証済み。

### C2PA 側は

TSA を入れている間、C2PA は `disabled` のまま、または埋め込みのみの `dev-signed`
（グレード非加算）に留めてよい。C2PA 本番証明書は §2〜§5 の通り後から追加できる。

## 関連

- `.env.example` — C2PA セクション（env 要件）
- `scripts/verify-c2pa-cert.mjs` — 切替前プリフライト検証
- `docs/anchoring-roadmap.md` — 証明書メタデータのオンチェーン anchoring（別系統）
- `docs/context/OPEN_QUESTIONS.md` — 証明書取得・鍵保管の未決事項
