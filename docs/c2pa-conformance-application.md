# C2PA Conformance Program 申請計画 & GPSA 下書き

> 出典: `c2pa-org/conformance-public` docs/v0.2（Conformance Program / Generator Product
> Security Requirements / GPSA Template, いずれも 2026-07-31 v0.2）。
> Ledra 実装の出典: `src/lib/anchoring/providers/c2paSigner.ts` / `c2pa.ts`、CI 設定
> `.github/workflows/`、`vercel.json`。
> 数値・未確認事項には `【要確認】` を付す。推測は「推定」と明記する。

## 0. 結論（先に要点）

- **役割**: Generator Product（GP）。Validator Product は当面申請しない（判断は §5）。
- **実装クラス**: **Backend**。写真アップロードはクライアント（Web/モバイル）だが、
  アサーション生成・claim 署名・鍵保管はすべてサーバー側で完結する
  （`c2paSigner.ts` の `LocalSigner` はサーバー実行）。Edge 端末では署名しないため
  Distributed ではなく Backend。
- **現実的な初回目標**: **Max Assurance Level 1（Backend）**。
  - AL1 で満たすべき O.1–O.6 の Level 1 要件は、既存資産（Vercel/Supabase の TLS1.3・
    IAM/RLS、CI の CodeQL/Codacy/dependabot）で大部分カバー可能。
  - 主要ギャップは **O.2（署名鍵の保護）** と **O.1（自動証明書エンロール）** の2点のみ。
- **AL2 はフェーズ2**。KMS 化・ハードウェア RoT アテステーション・**呼び出しクライアントの
  端末アテステーション（Play Integrity / App Attest）** が追加で必須。LEDRA_CURRENT でも
  端末アテステーションは「別フェーズ」と記録済み。

## 1. 申請プロセス（GP 経路・8ステップ）

出典: `C2PA Conformance Program.md` §Process Requirements for Applicants。

1. **Expression of Interest Form 提出**（Google フォーム）。会社の法的登記情報＋役割（GP）を選択。
2. **法的合意（Legal Agreement）締結**。Linux Foundation の署名サービスで GP 用契約に署名。
3. **Program Intake Form 提出**。CPL 掲載用の製品情報（対応メディアタイプ、実装クラス=Backend、
   希望 Max Assurance Level=1）を登録。
4. **証拠提出**: (a) **GPSA 文書**（本書 §4 の下書きを完成させる）、(b) 宣言した全メディアタイプの
   **サンプル出力**（署名済みアセット + `.c2pa`/`.json`）。
5. **評価（Assessment）**: Administrator が証拠を審査し **Max Assurance Level を割当**。
6. **承認（Approval）**: 別の Approver が PR レビュー（最低2名関与）。
7. **Notice of Conformance 発行**（デジタル署名レター）。
8. **CA から本番証明書取得**: Trust List 上の認定 CA に Notice を提示し、本番 Claim Signing
   Certificate を取得。CPL 公開日前でも取得可。

- **Conformance Program への登録は必須**。本番 Claim Signing Certificate は「適合認定（Notice of Conformance）→ 認定 CA から取得」の2段構えで、CA は CPL に `conformant` で載る GP にしか発行しない（出典 Conformance Program §Machine-Readable List Operation）。EOI フォームが登録の起点。
- 費用: **無料**（申請料・掲載料ともゼロ。出典 Conformance Program §Business Requirements）。
- **予定期間: 準備状況に応じて 2週間〜6ヶ月**（代表提供情報・2026-08。C2PA PDF には記載がなく、この期間はプログラム外部からの情報として扱う。未検証）。
- 前提バージョン: 本 v0.2 プログラムは **Spec v2.2 / v2.4** を受付。Ledra は §1.3 で申告する。
- 推奨: Intake 提出前に相互運用性テストを実施（プログラムが適合サンプルライブラリを提供）。

## 2. ギャップ分析（O.1–O.6 × Ledra 現状）

出典: `C2PA Generator Product Security Requirements.md`。Backend クラスに適用される要件のみ抽出。
判定: ✅=概ね充足 / 🟡=部分・要整備 / ❌=未対応。

| 目的 | Level 1 要件（Backend 適用分） | Ledra 現状 | 判定 |
|---|---|---|---|
| **O.1** 証明書エンロール時の適格性証明 | 自動エンロール時に CA 指定の認証方式（共有秘密/クライアント証明書/チャレンジ応答等）を実装。*自動エンロールを使う場合のみ適用* | 現状は env var に手動で cert/key を投入（`C2PA_SIGNER_CERT/KEY`）。自動エンロール未実装 | 🟡 |
| **O.2** 署名鍵の機密性 | 永続化時は鍵を暗号化保管、業界標準アルゴリズム、最小権限アクセス、**鍵ローテーション可能**であること | 鍵は env var の平文 PEM。Vercel は env を at-rest 暗号化するが、専用鍵管理コンポーネントではない。ローテーション手順は未整備 | 🟡 |
| **O.3** Claim Generator の保護 | **SCA/SBOM** で NVD 脆弱性検知、CRITICAL/HIGH を90日以内に修正 | dependabot（SCA）+ CI。90日ポリシーの明文化が必要 | 🟡 |
| **O.4** 生成時のアセット/アサーション保護 | コンテンツ処理ソフト全般に SCA/SBOM + 90日修正 | O.3 と同じ CI 資産でカバー可。ポリシー明文化が必要 | 🟡 |
| **O.5** サブシステム間通信の保護 | Edge/Backend 間を **TLS 1.3 以上** | Vercel/Supabase が TLS1.3 提供。クライアント↔API も HTTPS | ✅ |
| **O.6** ホスティング環境の保護 | **IAM/RBAC**、依存/API の脆弱性スキャン（**OWASP Top10** カバー）、適時修正（30/90/180日） | Supabase RLS + Vercel/クラウド IAM、CodeQL/Codacy。OWASP カバレッジと修正 SLA の明文化が必要 | 🟡 |

**AL1 達成に向けた実作業（最小）**:
1. **O.2**: 署名鍵を専用鍵管理サービスへ移行（AL1 なら Vault / Secrets Manager 等の
   「独立した鍵管理コンポーネント」で可。AL2 を見据えるなら最初から **AWS KMS / GCP KMS /
   Azure Key Vault** を推奨）＋ **鍵ローテーション手順**を文書化。
2. **O.1**: CA を選定し、その自動エンロール方式に合わせた認証を実装
   （方式は CA 依存のため §5 の要確認）。※認証方式の詳細は「適合付与後90日以内の更新提出」でも可。
3. **O.3/O.4/O.6**: 既存 CI（dependabot/CodeQL/Codacy）で技術的には充足。
   **90日修正ポリシー・OWASP Top10 カバレッジ**を運用文書として明文化するだけ。

**AL2 追加要件（フェーズ2の見積り）**:
- O.2 L2: 鍵を **ハードウェア由来ラップ鍵の KMS** に格納し、鍵所持を**ハードウェア RoT で
  アテスト**（または SOC2 Type2 等の第三者監査証明）。
- O.2 L2 (Backend): 署名前に**呼び出しクライアントの端末アテステーション**
  （App Attest / Play Integrity / Android Key Attestation）を検証。
- O.3/O.4 L2: 基本エクスプロイト対策（ASLR 等）+ 静的解析（CodeQL 済）+ パッチ鮮度の
  ハードウェア RoT アテスト。
- O.6 L2: 監査ログ・**HIDS**・ネットワークセグメンテーション + 各証跡レポート添付。

## 3. Validator Product を今回申請しない理由

Ledra は外部 C2PA マニフェスト検証（`c2paVerify.ts`, LEDRA_CURRENT B3）を持つが、
VP は別契約・別 Intake・検証結果サンプル提出が必要でスコープが広がる。
まず GP（自社署名の信頼確立）を優先し、VP は GP 適合後に別途判断する。
（この判断が誤りなら、VP 用の検証エビデンス整備が追加で必要になる。）

## 4. GPSA 文書 下書き（テンプレート準拠）

> テンプレート: `C2PA Generator Product Security Architecture Document Template.md`。
> 提出は Markdown + 図（PNG/JPEG）。以下は Ledra 実装から埋められる範囲を記入し、
> 不明箇所は `【要確認】` とした。**提出前に代表が事実確認すること。**

### 1. Generator Product Information

- **1.1 申請組織**: 株式会社HOLY / 【要確認: 登記住所・連絡先】
- **1.2 Conformance Program Version**: 0.2
- **1.3 Spec Version**: 【要確認: 2.2 か 2.4。Ledra が生成するマニフェストの実バージョンで申告】
- **1.4 Distinguished Name**:
  - CN: `Ledra`（対外プロダクト名）
  - O: `株式会社HOLY`（登記名 / 英字表記【要確認】）
  - OU: （任意）
  - C: `JP`
- **1.5 製品説明**: 自動車整備・ボディリペア・コーティング/PPF 店向けマルチテナント SaaS。
  施工写真をサーバー側で真正性パイプライン処理（ハッシュ・EXIF/GPS 除去・RFC3161 TSA 封印・
  段階タグ）し、施工証明書に C2PA マニフェストを付与する。
- **1.6 GP TOE 説明**: TOE 境界＝**写真キャプチャ/アップロード → サーバー側アサーション生成
  → claim 署名 → 署名済みアセットの永続化/配信**。基盤は Next.js（Vercel）+ Supabase
  （Postgres/Storage/Auth）。署名は `@contentauth/c2pa-node` LocalSigner（ES256/P-256）。
  タイムスタンプは独立した RFC3161 TSA トークン（`certificate_images.tsa_token`）。
  **アーキ図を別途添付**（推奨）。
- **1.7 実装クラス**: **Backend**
- **1.8 Target Max Assurance Level**: **1**
- **1.9 対応メディアタイプ**: 生成=【要確認: 実装が署名する型。少なくとも `image/jpeg`
  （施工写真）】。検証=【要確認: `c2paVerify` が受ける型】。※テンプレートの許可リストの
  部分集合で、サンプル提出が必要。

### 2. Security Architecture Details by Objective

- **2.1 [O.1] 自動エンロール適格性**（AL1 必須）:
  1. エンロールプロセス: 【要確認: 選定 CA の方式に依存。現状は手動 cert 投入】。
  2. 認証方式/API: 【要確認 / 90日以内の追加提出も可】。
  3. 認証シークレット管理: env は Vercel 暗号化保管【要確認: ローテーション方針】。
- **2.2 [O.2] 署名鍵の機密性**（AL1 必須）:
  1. 鍵生成/保管: ES256（P-256）。**現状 env 平文 PEM → 独立鍵管理サービスへ移行予定**
     （§2 の実作業1）。
  2. アクセス制御/暗号化: 最小権限。移行後の鍵管理環境で明文化。
  3. エフェメラル平文鍵の扱い: LocalSigner が署名時にメモリ上で使用【要確認: 露出最小化策】。
  4. **鍵ローテーション手順**: 【要整備・要確認】。
  5. サブシステム相互認証（Backend）: クライアント↔API は 【要確認: API キー/セッション認証の詳細】。
- **2.3 [O.3] Claim Generator 保護**（AL1 必須）:
  1. SCA/SBOM ツール: **dependabot**（+ CI）。
  2. **90日修正ポリシー**: 【要整備: パイプラインで CRITICAL/HIGH を90日超で出荷しない運用を明文化】。
- **2.4 [O.4] 生成時保護**（AL1 必須）: O.3 と同一 CI 資産。コンテンツ処理ソフト範囲で
  SCA + 90日ポリシーを適用。
- **2.5 [O.5] 通信保護**（Backend, AL1 必須）: **TLS 1.3**（Vercel/Supabase）。
  暗号スイート詳細は【要確認: 実際のネゴシエーション結果を記録】。
- **2.6 [O.6] ホスティング環境保護**（Backend, AL1 必須）:
  1. IAM/RBAC: **Supabase RLS** + Vercel/クラウド IAM。
  2. プリンシパルアクセス方針: サービスアカウント/本番 ID の方針【要確認】。
  3. クラウドリソース IAM: 【要確認: Supabase プロジェクト/ストレージのアクセス方針】。
  4. 脆弱性スキャン + **OWASP Top10**: CodeQL / Codacy でカバー【要確認: OWASP 明示カバレッジ】。
  5. 適時修正: 30/90/180日 SLA を【要整備・明文化】。

## 5. 要確認事項（OPEN_QUESTIONS 連携）

1. **申告 Spec バージョン**（2.2 / 2.4）— Ledra が実際に生成するマニフェストのバージョン。
2. **CA の選定**と、その自動エンロール認証方式（O.1 / O.2 の設計を左右する最重要事項）。
3. **署名鍵の鍵管理方式**（AL1: 独立鍵管理サービス / AL2: KMS + ハードウェア RoT）。
4. **対応メディアタイプの確定**とサンプルアセット準備。
5. 会社の登記住所・英字社名・DN 各値。
6. AL1 で先行するか、AL2 まで作り込んでから申請するか（AL1 先行を推奨）。

> 次アクション候補: (a) CA 候補の調査、(b) 署名鍵の KMS 移行 PoC、
> (c) 90日修正ポリシー & OWASP カバレッジの運用文書化。いずれも AL1 のクリティカルパス。

## 6. AL1→AL2 移行パスと「AL2 フォワードな AL1」方針

### 6.1 移行は可能（ただし新レコード扱い）

出典: Conformance Program §Definition of Material Change。

- AL は CPL レコードの属性であり、Max Assurance Level を 1→2 に上げることは Security
  Requirements への適合が変わる＝**material change** に該当する。よって既存レコードの
  「格上げ」ではなく、**AL2 要件で再評価を受けて CPL 上に新しい record id を作る再申請**になる。
- **費用は無料**（申請料・掲載料ゼロ）。AL1 で始めて後から AL2 を取り直すことにペナルティはない。
- AL2 適合になれば **AL1・AL2 両方の証明書を発行可能**（Max は上限。実際の証明書レベルは
  登録時の Dynamic Evidence 次第）。AL2 に上がれば下位互換で AL1 もカバー。
- 推定: 移行中は旧 AL1 レコードを残したまま AL2 レコードを並存させられる（本文が新 record id を
  要求するため。実務上の並存の細部は未確認）。

### 6.2 本当のコストは手続きではなく再設計

AL2 の実コストはアーキテクチャの作り替え（§0・§2 の AL2 追加要件）。具体的には
(1) 署名鍵の **KMS 化**、(2) 署名処理の **Confidential Computing 環境**（AWS Nitro Enclave /
GCP Confidential VM 等）への移設＝ハードウェア RoT アテストの取得、(3) **モバイル端末
アテステーション**（App Attest / Play Integrity）。

- 推定: **Vercel サーバーレスは実行インスタンスの HW アテストを出せない** → O.1/O.3/O.4 の
  Dynamic Evidence（HW RoT アテスト）と O.6 L2（HIDS・ネットワークセグメンテーション）は
  Vercel のままでは満たせず、制御可能なクラウドへの移設が要る。未検証（要・実機確認）。
- **仮定**: 「calling client」の解釈（§2.2.3 / 下記 A・B）が AL2 可否そのものを左右する。
  誤って解釈 A で Web 経由も AL2 必須と判断されると、Web パスは AL2 不可のまま。
  - 解釈A（呼び出し元＝エンドユーザー端末）: モバイルは App Attest/Play Integrity で可、
    **Web ブラウザは HW アテスト不可**。
  - 解釈B（呼び出し元＝内部サーバー→署名エンクレーブ）: Nitro Enclave アテストで端末非依存に
    Backend 全体で AL2 を主張しうる。GPSA テンプレ §2.2.3 が例に Nitro を挙げている。

### 6.3 決定した方針: 「AL2 フォワードな AL1」

**AL1 で申請・掲載しつつ、署名鍵だけは最初からクラウド KMS に置く**（env 平文 PEM をやめる）。

- KMS 化は AL1 の O.2「独立した鍵管理」を満たしつつ、そのまま AL2 の土台になる（最も効く一手）。
- 署名処理を独立モジュールに隔離し、後で Nitro Enclave 等へ移設しやすくしておく。
- モバイル撮影に端末アテステーションのフックを見込んでおく。
- 逆に AL1 を env PEM のまま最短で通すと、AL2 移行時に鍵基盤ごと作り直しになり手戻りが大きい。

> 追加の次アクション: AL1 掲載後・AL2 着手前に、Conformance Program へ「純 Backend・
> エンドユーザーはアップロードのみの TOE で calling client / Edge subsystem をどう扱うか」を
> 確認する（§6.2 の A/B 分岐＝AL2 可否の決定点）。

## 7. 費用と予定期間・確定事項（2026-08 時点）

出典区分: 【C2PA doc】=公式 PDF で確認、【代表提供】=このセッションで代表から共有された情報（未検証）。

1. **プロセス／登録要否**【C2PA doc + 代表提供】: Conformance Program への登録は必須。**Expression of
   Interest（関心表明）フォームから開始**する（§1 の8ステップ）。
2. **要件（適合／セキュリティ評価範囲・証明書プロファイル）**【C2PA doc】: §2 のギャップ分析・§4 の GPSA
   下書き・cert-profiles の各スキーマに準拠。GP/Backend/AL1 で申告。
3. **費用**【C2PA doc + 代表提供】: プログラム費用は（現時点）**無料**。
4. **予定期間**【代表提供】: **準備状況に応じて 2週間〜6ヶ月**。GPSA・サンプル・KMS 化の仕上がりが
   期間を左右する（＝準備を前倒すほど短い）。
5. **実施主体**【代表提供】: **日本企業でも申請・受託は可能**。多くの日本企業が関与している。Ledra
   （株式会社HOLY）が申請主体になれる（国籍要件なし）。CA 選定や支援で日本企業を使う選択肢もある。

### コスト構造（プログラム料以外＝エンジニアリング／インフラ／運用）

円建ての具体額は Ledra のコストデータ・クラウド単価が未確定のため出さない（要確認）。相対比較のみ。

| 区分 | AL1続行（AL2フォワード） | AL2移行で"追加"される分 |
|---|---|---|
| C2PAプログラム料 | ¥0 | ¥0（新レコード再申請も無料） |
| 一次開発（人的） | 中: 鍵 env PEM→KMS 署名／CA 自動エンロール／GPSA 完成・サンプル／90日ポリシー・OWASP 文書化 | **大**: 署名を機密環境（Nitro Enclave 等）へ移設／モバイル端末アテステーション／HW RoT アテスト連携／HIDS・監査ログ・セグメンテーション＋証跡 |
| インフラ（継続） | 小〜中: KMS 課金（推定・少額）＋CA 証明書（CA 依存・要確認） | **中〜大**: 機密コンピューティングは常時稼働（Vercel の scale-to-zero と段違い）／監視ツール |
| 運用（継続） | 小: 鍵ローテ・依存スキャン（既存 CI） | **中〜大**: エンクレーブ/アテスト鍵管理・HIDS 監視・定期証跡・IR |

- **費用差の本質**: AL2 は「サーバーレス→常時稼働の機密コンピューティング＋モバイル実装＋監視スタック」
  への段差。AL1 は既存 Vercel/Supabase の延長線。
- 見積りに必要な未確定情報: ①CA と証明書費用、②AL2 署名環境と署名リクエスト量→月額、
  ③モバイルアテスト実装工数（iOS/Android）、④HIDS/監視・セグメンテーションの新設 or 既存流用。

## 8. 今すぐ着手: Expression of Interest フォーム記入項目（GP）

EOI フォームは外部（Google フォーム）で、登記情報を伴う。**このセッションからは送信できない**（アクセス不可・
私的な法的情報を要し、外部・不可逆のため）。代表が下記を用意して送信する。フォーム URL は
Conformance Program 本文 §Expression of Interest Form に記載。

- 申請役割: **Generator Product（GP）**（VP・CA は今回選択しない。§3）。
- 会社法的情報（登記どおり）: 法人名 `株式会社HOLY`（英字表記【要確認】）／登記住所【要確認】／
  Reliable Method of Communication（第三者確認可能な連絡先: 代表メール info@holy-auto.com 等）。
- 申告 Spec バージョン: 【要確認: 2.2 か 2.4】。
- 想定 Max Assurance Level: **1**。
- 補足: EOI 提出後、Linux Foundation の署名サービスで GP 用 Legal Agreement に署名 → Intake Form 案内、
  という流れ（§1 ステップ2-3）。GPSA（§4）とサンプルアセットは Intake 後の証拠提出で使う。
