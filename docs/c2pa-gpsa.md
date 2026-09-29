# Ledra — Generator Product Security Architecture (GPSA) Document

> C2PA Generator Product Security Architecture Document（提出用）。テンプレート:
> `conformance-public/docs/v0.2/C2PA Generator Product Security Architecture Document Template.md`。
> 対象: Generator Product「Ledra」 / 実装クラス Backend / **Target Max Assurance Level 1**。
> 記述は Ledra 実装（`src/lib/anchoring/providers/*`, `src/lib/certificateImages/*`, CI 設定,
> `vercel.json`）に基づき、**現行の設計・運用を現在形で記述する**。運用管理策の詳細は補足資料
> `docs/c2pa-gpsa-operational-controls.md` を参照。提出前に代表が記載内容の正確性を確認すること。

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

自動車整備・ボディリペア・コーティング / PPF 店向けのマルチテナント SaaS「Ledra」。加盟店がアップロードした
施工写真をサーバー側の真正性パイプライン（ハッシュ化・EXIF/GPS 除去・RFC3161 TSA 封印・撮影 nonce 消費・
段階タグ）で処理し、施工証明書に紐づく静止画へ C2PA マニフェストを付与・署名する。用途は施工の来歴・
真正性の証明。対象ユーザーは整備/コーティング事業者およびその顧客・損保。

### 1.6 GP TOE Description

TOE 境界は **アップロードされた写真の受領 → サーバー側でのアサーション生成 → claim 署名 → 署名済み
アセットの永続化/配信** まで。TOE はすべて Backend（Hosting Environment）内にある。構成:

- 実行基盤: Next.js（App Router）の API ルート on **Vercel**（サーバーレス関数、Node ランタイム）。
- データ/ストレージ/認証: **Supabase**（Postgres + Storage + Auth）。Backend からの接続は TLS 1.3 のみ（§2.5）。
- 署名: `@contentauth/c2pa-node` の `LocalSigner`（ES256 / P-256）。実装 `src/lib/anchoring/providers/c2pa.ts`,
  `c2paSigner.ts`。
- タイムスタンプ: 独立した RFC3161 TSA トークン（`certificate_images.tsa_token`）。C2PA 署名とは分離。

**TOE の外（信頼しない入力元）**: Web 管理画面（ブラウザ）とモバイルアプリ。製品方針として撮影入力に
限定しているが（モバイルは `pickImageFromCamera` のみ、Web は `capture="environment"` のみ）、Backend は
受け取ったバイト列が撮影由来であることを検証できない（magic bytes 検証のみ。端末アテステーションは
既定で無効、§2.2-5）。したがって:

- 生成マニフェストは撮影を**主張しない**。`c2pa.created` / `digitalSourceType=digitalCapture` は使わず、
  先頭アクションを **`c2pa.opened`**（アップロードされたファイルを `parentOf` ingredient として参照）とする。
  ingredient は定義（タイトル・形式・関係）のみで追加し、元画像のバイト列は渡さない — 元画像のサムネイルや、
  元画像が持っていた C2PA マニフェスト（GPS を含みうる）をマニフェストへ持ち込まないため。検証時は
  `ingredient.unknownProvenance`（informational）＝「来歴不明のファイルを開いた」という事実どおりになる。
- 続くアクションは Backend 自身が行った処理のみ: 向きの確定（`c2pa.orientation`）、再エンコード
  （`c2pa.converted`）、EXIF/GPS 除去（`c2pa.edited`）。効果のあったものだけを記録する。
- `com.ledra.capture` アサーションに封入するのは Backend が自ら発行・確認した値のみ（証明書 ID、VIN、
  Backend が発行し消費した単回 nonce、Backend が取得した TSA 時刻）。

**アーキテクチャ図: `docs/diagrams/c2pa-gp-toe.png`**（ソース `docs/diagrams/c2pa-gp-toe.mmd`）。TOE 境界
（キャプチャ/アップロード → 認証 → 真正性パイプライン → アサーション生成 → claim 署名 → 署名済みアセット
永続化）と、外部サービス（認定 CA・RFC3161 TSA・Polygon アンカリング）との関係を示す。

### 1.7 Implementation Class

**Backend**（アサーション生成・claim 署名・鍵保管はすべてサーバー側の Hosting Environment で完結。
クライアントは TOE の外で、アップロードのみを行う — §1.6）。

### 1.8 Target Max Assurance Level

**1**

### 1.9 Target Generator Product capabilities

実コード（`src/lib/certificateImages/uploadHandler.ts` の accept-list、`c2pa.ts` / `c2paVerify.ts`）で確認。

- **Claim generation（署名）**: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
- **Claim validation**: 本申請では申告しない（Ledra は Generator Product として生成のみで申請する）。
  製品には取り込み時の C2PA 検証機能（`verifyExternalC2pa`）が存在するが、出力マニフェストの ingredient は
  定義のみ（元写真のバイト列・マニフェストを持ち込まない、§1.6）であり検証対象の来歴を持たないため、
  validation は本申請の対象外とする。

生成メディアタイプはテンプレート §1.9 許可リストの部分集合。各型の署名済みサンプル + `.c2pa`/`.json` を証拠として提出。

---

## 2. Security Architecture Details by Objective

> 本 Generator Product は Assurance Level 1 への適合を主張する。各目的について Level 1 の要件に対する
> 現行の設計・運用を記述する。

### 2.1 [O.1] Automated Certificate Enrollment Proof of Eligibility (§6.1)

**適用性の前提**: O.1 の要件は「conforming GP instance が自動証明書エンロールに依存する場合のみ」適用される。
**Ledra は自動エンロールを使用しない** — Backend は単一の Claim Signing Credential を運用し、証明書は
インスタンス単位の自動エンロールではなく**手動でプロビジョニング**する（下記）。したがって O.1 の動的証拠
（CA との自動認証）は該当しない。

1. **Certificate Enrollment Process**: 適合認定（Notice of Conformance）後、C2PA Trust List 上の認定 CA から
   本番 Claim Signing Certificate を取得し、Backend の実行環境に安全に投入する（自動 API エンロールではなく
   手動プロビジョニング）。証明書は C2PA Trust List 上の認定 CA から取得する。トリガーは初回発行および更新/ローテーション。
2. **Authentication Method & API Details**: Generator Product は自動証明書エンロール API を使用しない。
   したがって O.1 の自動エンロール認証（動的証拠）は該当しない。署名資格情報の投入は手動プロビジョニングによる。
3. **Management of Authentication Secrets**: 署名資格情報（cert/key）は実行環境の環境変数
   （`C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY`, `c2paSigner.ts`）として保持。Vercel は環境変数を保存時に暗号化し、
   アクセスはプロジェクトの権限保持者に限定。生成・保管・保護の詳細は O.2 に記載。

### 2.2 [O.2] Confidentiality of the Claim Signing Key (§6.2)

1. **Key Generation & Storage**: 署名鍵は **ES256（NIST P-256）**。本番では cert/key を環境変数
   （`C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY`）から読み込み（`c2paSigner.ts`）、Vercel が保存時に暗号化。
   アルゴリズム/鍵長は NIST 準拠（P-256 / ECDSA-SHA256）。復号鍵の取り扱いは Generator Product 自身
   （`c2paSigner.ts` / `@contentauth/c2pa-node` LocalSigner）が行う（Assurance Level 1 O.2 の許容形態:
   「GP または Claim Generator 自身が復号鍵を扱う」に該当）。鍵は保存時に暗号化され、ディスクへの書き出し・
   ログ出力は行わない。
2. **Access Controls & Encryption**: 最小権限。環境変数へのアクセスは Vercel プロジェクトの管理権限保持者に
   限定。復号された鍵はサーバーレス実行プロセスのメモリ内に限られ、外部へ出力しない。保存時は Vercel により暗号化。
3. **Plaintext Key Lifetime（現状の正確な記述）**: `c2paSigner.ts` は初回署名時に構築した `LocalSigner` を
   **モジュールスコープでキャッシュ（`cached`）して以後のリクエストで再利用**するため、復号鍵は「単一の署名処理中
   だけ」ではなく **当該サーバーレスインスタンスのプロセス生存期間中はメモリ上に常駐**する（プロセスがリサイクル
   されるまで）。露出面はデプロイされた実行プロセスのメモリに限定され、ディスク/ログには出さない。鍵取り扱いの一部は
   非 GP コード（ネイティブ `@contentauth/c2pa-node`）が担うため、その脆弱性監視は **dependabot**（依存 SCA）で実施する。
   AL2 に向けた改善路: 秘密鍵を GP メモリに載せない KMS/HSM 方式へ移行し常駐を解消する（本申請 AL1 の範囲外）。
4. **Key Rotation Process**: 鍵ローテーションに対応する。手順は環境変数 `C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY`
   の差し替えと新証明書の再取得で、トリガーは有効期限接近・鍵漏洩の懸念・定期更新。手順詳細は
   `docs/c2pa-gpsa-operational-controls.md` §4 に記載。
5. **Subsystem Mutual Authentication & Role Validation（Backend）**: 署名を行う Backend は、呼び出し元
   （Web 管理画面 / モバイルアプリ）を認証してからアップロード→署名処理に入る。
   - Web: `resolveCallerWithRole`（Supabase 認証セッション＋テナント分離＋ロール確認）。
   - モバイル: `resolveMobileCaller` + `requireMinRole`、加えて撮影セッション単位の **capture nonce** を検証。
     **device attestation**（`device_token` / `device_provider`）は実装済みだが **既定で無効**
     （`DEVICE_ATTESTATION_ENABLED` 既定 false、実機トークン検証の Phase 3 まで OFF、`deviceAttestation.ts`）。
     現時点の有効な認証は Supabase Auth ＋ロール確認＋単回使用 nonce。attestation は将来有効化予定の管理策として扱う。
   API キー等の資格情報は Backend へのアクセス制限のみに用いる。

### 2.3 [O.3] Protection of the Claim Generator (§6.3)

1. **SCA / SBOM Scanning Tools**: Claim Generator（署名系 `@contentauth/c2pa-node`）を含む依存に対し、
   **Dependabot**（週次、NVD 連携、`.github/dependabot.yml`）と **CodeQL**（`main` 宛ての push/PR＋週次、`security-extended`、
   `.github/workflows/codeql.yml`。トリガーは `main` 限定）を継続実行し、加えて CI の `npm audit --audit-level=high` が高 severity 以上の
   依存脆弱性でビルドを失敗させる（`.github/workflows/ci.yml`）。**Codacy**（`.github/workflows/codacy.yml`）は
   ワークフローは存在するが `CODACY_PROJECT_TOKEN` 未設定のため自動トリガーは無効化されており（`workflow_dispatch`
   のみ）、現状は継続実行ではなく手動起動のみ。継続的な検査は Dependabot + CodeQL + npm audit ゲートが担う。
2. **90-Day Remediation Policy**: CRITICAL / HIGH（CVSS v3+）の脆弱性は検知から 90 日以内に修正/緩和し、
   これを超えて残したまま出荷しない。ポリシー詳細は `docs/c2pa-gpsa-operational-controls.md` §1–§2 に記載。

### 2.4 [O.4] Protection of Assets & Assertions at Generation (§6.4)

GP TOE は Backend のみ（§1.6）。created_assertions を生成するのは Backend 内のコードだけで、クライアントの
ソフトウェアは TOE に含まれず、created_assertions の内容にも寄与しない（クライアントから受け取るのは画像の
バイト列だけで、撮影を示す主張は生成しない）。対象は TOE 内でコンテンツ/アサーションを処理するソフト —
画像処理 `sharp`、署名 `@contentauth/c2pa-node`、アップロード処理 `src/lib/certificateImages/*`、
アサーション生成 `src/lib/anchoring/providers/c2pa.ts`。

1. **SCA / SBOM Scanning Tools**: O.3 と同一の Dependabot + CodeQL + npm audit ゲートが上記ソフトの依存を含めて
   検査する（Codacy は自動トリガー無効・手動起動のみ。O.3 参照）。
2. **90-Day Remediation Policy**: O.3 と同一の 90 日修正ポリシーを適用する（`c2pa-gpsa-operational-controls.md` §2）。
3. **生成時の改ざん（T.4）への対処**: TOE の外から来た内容について来歴を主張しない（§1.6）。マニフェストの
   アクションは Backend が実際に行った処理だけで、撮影主張（`digitalCapture`）が混入しないことを実署名→検証の
   テスト（`src/lib/anchoring/providers/__tests__/c2paSignValidate.test.ts`）が CI で確認する。

### 2.5 [O.5] Protection of Traffic Between Subsystems (§6.5) — Backend

1. **TLS 1.3 & Cryptographic Protocols**: TOE 内のサブシステム間通信は TLS 1.3 以上に限定する。
   - Backend（Vercel 関数）→ Supabase（Postgres REST / Storage / Auth）: Backend の Supabase クライアントは
     **TLS 1.3 未満のハンドシェイクを拒否する** HTTP クライアントを使う（`src/lib/net/tls13Fetch.ts`、
     `minVersion: "TLSv1.3"`）。サーバー側の全 Supabase クライアント — service-role（`src/lib/supabase/admin.ts`）、
     Web 呼び出し元の認証（`server.ts`）、モバイル呼び出し元の認証（`mobile-server.ts`）、読み取りレプリカ
     （`readReplica.ts`）— に適用する。相手が 1.2 までしか
     話さない場合は接続自体が失敗し、旧版へは落ちない。実ハンドシェイクで 1.2 のみのサーバーを拒否することを
     `src/lib/net/__tests__/tls13Fetch.test.ts` が CI で確認する。
   - クライアント（Web/モバイル）→ API: クライアントは TOE の外（§1.6）であり、この経路は O.5 のいう
     サブシステム間通信ではない。経路は Vercel の HTTPS で保護される。
   暗号スイートは TLS 1.3 の既定（Node / Supabase のマネージド構成）に従う。

### 2.6 [O.6] Protection of the Hosting Environment (§6.6) — Backend

1. **IAM & RBAC（GP TOE の実際の enforcement 境界）**: GP のアップロード/永続化経路は
   `createTenantScopedAdmin(tenantId).admin`（`src/lib/supabase/admin.ts`）＝ **service-role クライアントで、
   RLS をバイパスする**。この経路のテナント分離は **アプリケーション層**で担保する — クライアントは呼び出し元の
   `tenant_id` にスコープして構築し、各クエリ/ストレージ操作をその tenant_id で絞り込む。**Supabase Row Level
   Security（RLS）** は、テナント認証済みクライアントでアクセスする製品内の他経路のアクセス制御を担うが、
   GP のこの特権サーバー経路の enforcement 境界ではない。Vercel / クラウドプロバイダの IAM がリソース境界
   （DB、ストレージ、関数）を保護し、API はロール確認（`resolveCallerWithRole` / `requireMinRole`）を経て
   アセット/claim 生成に入る。
2. **Principal Access Policies**: Supabase プロジェクトと Vercel プロジェクトへのアクセスは管理者に限定し、
   サービス間アクセスは Supabase のサービスロール/キーで制御する。
3. **Cloud Resource IAM Policies**: Supabase（Postgres/Storage）と Vercel の各リソースへのアクセスは、
   各プラットフォームのプロジェクト権限（IAM/RBAC）で管理する。
4. **Vulnerability Scanning & OWASP Top 10 Coverage**: 依存・API サーフェスを CodeQL・Dependabot・CI の npm audit
   ゲートで検査する（Codacy は自動トリガー無効・手動起動のみ）。**OWASP Top 10** の各項目に対する管理策の対応は
   `docs/c2pa-gpsa-operational-controls.md` §3 に記載。
5. **Timely Remediation Policy**: 重大度別 SLA（High 30 日 / Moderate 90 日 / Low 180 日）で修正/緩和する
   （`docs/c2pa-gpsa-operational-controls.md` §2）。

---

## 3. Assurance Level

本 Generator Product は **Assurance Level 1** への適合を主張する。上記 O.1–O.6 の Level 1 要件を現行の設計・
運用で満たす。

---

## 提出前チェックリスト（代表確認）

- [x] アーキテクチャ図（PNG）を §1.6 に添付 → `docs/diagrams/c2pa-gp-toe.png`
- [x] 脆弱性修正ポリシー・OWASP カバレッジ・修正 SLA・鍵ローテ手順を運用文書化 → `docs/c2pa-gpsa-operational-controls.md`
- [ ] 運用文書（`c2pa-gpsa-operational-controls.md`）の SLA・OWASP・ログ構成の記述が実運用と一致するか代表確認
- [ ] 各メディアタイプ（jpeg/png/webp/heic）の署名済みサンプル + `.c2pa`/`.json` を用意（§1.9）
- [ ] 提出時、GPSA 一式（本書＋運用文書＋図）のファイル名に "GPSA" を含める
