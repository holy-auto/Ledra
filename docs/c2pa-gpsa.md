# Ledra — Generator Product Security Architecture (GPSA) Document

> C2PA Generator Product Security Architecture Document（提出用）。テンプレート:
> `conformance-public/docs/v0.2/C2PA Generator Product Security Architecture Document Template.md`。
> 対象: Generator Product「Ledra」 / 実装クラス Backend / **Target Max Assurance Level 1**。
> 記述は Ledra 実装（`src/lib/anchoring/providers/*`, `src/lib/certificateImages/*`, CI 設定,
> `vercel.json`）に基づく。未確定は `【要確認】`、未整備の運用は `【要整備】` と明記する。
> 提出前に代表が事実確認すること。

---

## 1. Generator Product Information

### 1.1 Applicant organization details

- 法人名: 株式会社HOLY（英字 **HOLY Inc.**）
- 登記住所: 東京都港区北青山1-3-1 アールキューブ青山3F
- 連絡先: info@holy-inc.jp

### 1.2 C2PA Conformance Program Version

0.2

### 1.3 C2PA Content Credentials Specification Version

2.4（生成マニフェストは claim v2 / `c2pa.actions.v2`。実出力の v2.4 一致はサンプルで確認済み方針）

### 1.4 Distinguished Name

1. **CN**: `Ledra`
2. **O**: `HOLY Inc.`
3. **OU**: （なし）
4. **C**: `JP`

### 1.5 Generator Product Description

自動車整備・ボディリペア・コーティング / PPF 店向けのマルチテナント SaaS「Ledra」。加盟店が撮影した
施工写真をサーバー側の真正性パイプライン（ハッシュ化・EXIF/GPS 除去・RFC3161 TSA 封印・撮影 nonce 消費・
段階タグ）で処理し、施工証明書に紐づく静止画へ C2PA マニフェストを付与・署名する。用途は施工の来歴・
真正性の証明。対象ユーザーは整備/コーティング事業者およびその顧客・損保。

### 1.6 GP TOE Description

TOE 境界は **写真のキャプチャ/アップロード → サーバー側でのアサーション生成 → claim 署名 → 署名済み
アセットの永続化/配信** まで。構成:

- フロント/実行基盤: Next.js（App Router）on **Vercel**（サーバーレス関数）。
- データ/ストレージ/認証: **Supabase**（Postgres + Storage + Auth、Row Level Security）。
- 署名: `@contentauth/c2pa-node` の `LocalSigner`（ES256 / P-256）。実装 `src/lib/anchoring/providers/c2pa.ts`,
  `c2paSigner.ts`。
- タイムスタンプ: 独立した RFC3161 TSA トークン（`certificate_images.tsa_token`）。C2PA 署名とは分離。
- クライアント: Web 管理画面 / モバイルアプリ（撮影はカメラ強制起動・端末非保存で API へ直送）。

アーキテクチャ図は **別途 PNG を添付**【要整備: 図の作成】。

### 1.7 Implementation Class

**Backend**（アサーション生成・claim 署名・鍵保管はすべてサーバー側の Hosting Environment で完結。
クライアントは撮影/アップロードのみ）。

### 1.8 Target Max Assurance Level

**1**

### 1.9 Target Generator Product capabilities

実コード（`src/lib/certificateImages/uploadHandler.ts` の accept-list、`c2pa.ts` / `c2paVerify.ts`）で確認。

- **Claim generation（署名）**: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
- **Claim validation（取り込み ingredient 検証）**: 同上（`image/jpeg`, `image/png`, `image/webp`, `image/heic`）

いずれもテンプレート §1.9 の許可リストの部分集合。各型の署名済みサンプル + `.c2pa`/`.json` を証拠として提出。

---

## 2. Security Architecture Details by Objective

> 対象は AL1。各目的の「Assurance Level 1 & 2 Base Evidence」を記述する。AL2 追加証拠（ハードウェア RoT
> アテステーション、KMS、HIDS 等）は本申請では対象外（フェーズ2）。

### 2.1 [O.1] Automated Certificate Enrollment Proof of Eligibility (§6.1)

**適用性の前提**: O.1 の要件は「conforming GP instance が自動証明書エンロールに依存する場合のみ」適用される。
**Ledra は自動エンロールを使用しない** — Backend は単一の Claim Signing Credential を運用し、証明書は
インスタンス単位の自動エンロールではなく**手動でプロビジョニング**する（下記）。したがって O.1 の動的証拠
（CA との自動認証）は該当しない。

1. **Certificate Enrollment Process**: 適合認定（Notice of Conformance）後、C2PA Trust List 上の認定 CA から
   本番 Claim Signing Certificate を取得し、Backend の実行環境に安全に投入する（自動 API エンロールではなく
   手動プロビジョニング）。トリガーは「初回発行」および「更新/ローテーション」。【要確認: CA 選定】
2. **Authentication Method & API Details**: 自動エンロール API は未使用。CA との資格情報取得手順は CA 選定後に
   確定し、必要に応じ適合付与後 90 日以内に更新提出する。【要確認】
3. **Management of Authentication Secrets**: 署名資格情報（cert/key）は実行環境の環境変数
   （`C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY`, `c2paSigner.ts`）として保持。Vercel は環境変数を保存時に暗号化し、
   アクセスはプロジェクトの権限保持者に限定。生成・保管・保護の詳細は O.2 に記載。

### 2.2 [O.2] Confidentiality of the Claim Signing Key (§6.2)

1. **Key Generation & Storage**: 署名鍵は **ES256（NIST P-256）**。本番では cert/key を環境変数
   （`C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY`）から読み込み（`c2paSigner.ts:98`）、Vercel が保存時に暗号化。
   実行時は署名関数のメモリ内でのみ復号鍵を扱う。アルゴリズム/鍵長は NIST 準拠（P-256 / ECDSA-SHA256）。
   【要整備: AL2 を見据え、環境変数 PEM から**クラウド KMS（AWS/GCP/Azure KMS）**へ移行予定。AL1 でも鍵管理を
   独立コンポーネント化することを推奨】。
2. **Access Controls & Encryption**: 最小権限。環境変数へのアクセスは Vercel プロジェクトの管理権限保持者に
   限定。実行時の平文鍵は署名処理のメモリ空間内に限られ、外部へ出力しない。保存時は Vercel により暗号化。
3. **Ephemeral Plaintext Key Handling**: `LocalSigner` が署名の瞬間にメモリ上で鍵を使用する。鍵取り扱いの一部は
   非 GP コード（ネイティブ `@contentauth/c2pa-node`）が担うため、その脆弱性監視は **dependabot**（依存 SCA）で
   実施し、更新を適用する。露出は署名処理中の一時的なメモリ保持に限定。
4. **Key Rotation Process**: 鍵ローテーション可能。手順は cert/key（環境変数）の差し替え＋新証明書の再取得で、
   トリガーは有効期限・鍵漏洩懸念・運用方針。【要整備: ローテーション手順書の明文化】
5. **Subsystem Mutual Authentication & Role Validation（Backend）**: 署名を行う Backend は、呼び出し元
   （Web 管理画面 / モバイルアプリ）を認証してからアップロード→署名処理に入る。
   - Web: `resolveCallerWithRole`（Supabase 認証セッション＋テナント分離＋ロール確認）。
   - モバイル: `resolveMobileCaller` + `requireMinRole`、加えて撮影セッション単位の **capture nonce** と
     **device attestation**（`device_token` / `device_provider`）を検証。
   API キー等の資格情報は Backend へのアクセス制限のみに用いる。

### 2.3 [O.3] Protection of the Claim Generator (§6.3)

1. **SCA / SBOM Scanning Tools**: **dependabot**（依存の脆弱性検知、NVD 連携）。加えて CI に **CodeQL**・**Codacy**
   （`.github/workflows/codeql.yml`, `codacy.yml`）。
2. **90-Day Remediation Policy**: CRITICAL / HIGH（CVSS v3+）の脆弱性を検知後 90 日以内に修正/緩和し、それを
   超えて出荷しないパイプライン運用。【要整備: 90 日ポリシーを運用文書として明文化し、CI ゲート化】

### 2.4 [O.4] Protection of Assets & Assertions at Generation (§6.4)

コンテンツ/アサーションを処理する GP TOE 内ソフト（画像処理 `sharp`、署名 `@contentauth/c2pa-node`、
アップロード処理 `src/lib/certificateImages/*`）を対象。

1. **SCA / SBOM Scanning Tools**: O.3 と同一（dependabot + CodeQL + Codacy）。上記ソフトの依存を含む。
2. **90-Day Remediation Policy**: O.3 と同一の 90 日修正ポリシーを適用。【要整備: 明文化】

### 2.5 [O.5] Protection of Traffic Between Subsystems (§6.5) — Backend

1. **TLS 1.3 & Cryptographic Protocols**: サブシステム間通信は HTTPS。
   - クライアント（Web/モバイル）↔ API: Vercel が **TLS 1.3** を提供。
   - API ↔ Supabase（Postgres/Storage/Auth）: TLS で保護。
   使用 TLS バージョン・暗号スイートの実ネゴシエーション結果を記録して添付。【要確認: 実測値の記録】

### 2.6 [O.6] Protection of the Hosting Environment (§6.6) — Backend

1. **IAM & RBAC**: **Supabase Row Level Security（RLS）** によるテナント分離・行レベルアクセス制御、および
   Vercel / クラウドプロバイダの IAM。アセット/claim 生成に関わる境界（DB、ストレージ）を保護。
2. **Principal Access Policies**: 人間の管理者アクセスと非人間プリンシパル（サービスアカウント/本番 ID）の
   アクセス方針を分離。【要確認: サービスアカウント/本番 ID の方針を明記】
3. **Cloud Resource IAM Policies**: Supabase プロジェクト（Postgres/Storage）と Vercel リソースへのアクセスを
   IAM で管理。【要確認: 主要リソースの IAM 方針を記述】
4. **Vulnerability Scanning & OWASP Top 10 Coverage**: 依存・API サーフェスの脆弱性スキャン/レビューを
   CodeQL・Codacy・dependabot で実施。**OWASP Top 10** のカバレッジを明示。【要確認: OWASP 明示カバレッジの整理】
5. **Timely Remediation Policy**: 重大度別 SLA（High 30 日 / Moderate 90 日 / Low 180 日）で修正/緩和。
   【要整備: SLA の明文化と運用記録】

---

## 3. AL2 追加証拠（本申請では対象外・参考）

AL2 へ引き上げる場合の追加要件は本書では未記載。概要は `docs/c2pa-conformance-application.md` §2・§6 を参照
（KMS＋ハードウェア RoT アテステーション、呼び出しクライアントの端末アテステーション検証、O.6 の監査ログ/
HIDS/ネットワークセグメンテーション等）。「AL2 フォワードな AL1」として、署名鍵の KMS 化を先行する方針。

---

## 提出前チェックリスト（代表確認）

- [ ] アーキテクチャ図（PNG）を作成し §1.6 に添付
- [ ] CA を選定し §2.1 の記述を確定
- [ ] 署名鍵の管理方式を確定（現状 env / KMS 化予定）し §2.2 を更新
- [ ] 90 日修正ポリシー・OWASP カバレッジ・修正 SLA を運用文書として明文化（§2.3–2.6）
- [ ] TLS 実ネゴシエーション結果を記録（§2.5）
- [ ] 各メディアタイプ（jpeg/png/webp/heic）の署名済みサンプル + `.c2pa`/`.json` を用意（§1.9）
