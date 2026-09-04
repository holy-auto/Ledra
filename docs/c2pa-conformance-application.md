# C2PA Conformance Program 申請計画 & GPSA 下書き

> 出典: `c2pa-org/conformance-public` docs/v0.2（Conformance Program / Generator Product
> Security Requirements / GPSA Template, いずれも 2026-07-31 v0.2）。
> Ledra 実装の出典: `src/lib/anchoring/providers/c2paSigner.ts` / `c2pa.ts`、CI 設定
> `.github/workflows/`、`vercel.json`。
> 数値・未確認事項には `【要確認】` を付す。推測は「推定」と明記する。
>
> **本書は内部の計画・ギャップ分析メモであり、提出物ではない**（提出物は `c2pa-gpsa.md`＋
> 運用文書＋図＋サンプル）。方針確定に伴い**古くなった前提が本文に残る**。矛盾する場合は
> `c2pa-gpsa.md`（提出版）と §2 ギャップ表を正とする。とくに次の2点は本文の一部旧記述
> （「AL1 のクリティカルパス／必須」等）を**上書きする**:
> - **O.2 鍵管理**: 現設計（GP 自身が復号鍵を扱う・env at-rest 暗号化・ローテーション手順あり）で
>   **AL1 は充足**。KMS 化は **AL2 向けの改善**であり AL1 の必須要件ではない。
> - **O.1 エンロール**: Ledra は手動プロビジョニングで自動エンロールを使わないため **非該当（N/A）**。
>   自動エンロール実装は AL1 の作業ではない。

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
2. **法的合意（Legal Agreement）締結** ✅ **署名済み（2026-08-25）**。Linux Foundation の署名サービスで GP 用契約に署名。
3. **Program Intake Form 提出** ✅ **提出済み（2026-09-03）**。CPL 掲載用の製品情報（対応メディアタイプ、
   実装クラス=Backend、希望 Max Assurance Level=1）を登録。提出値は §11。
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
| **O.1** 証明書エンロール時の適格性証明 | 自動エンロール時に CA 指定の認証方式（共有秘密/クライアント証明書/チャレンジ応答等）を実装。*自動エンロールを使う場合のみ適用* | Ledra は **手動プロビジョニング**（env var に cert/key を投入）で自動エンロールを使わない → **本要件は非該当（N/A）**。GPSA も O.1 を inapplicable と表明 | ⬜ N/A |
| **O.2** 署名鍵の機密性 | 永続化時は鍵を暗号化保管、業界標準アルゴリズム、最小権限アクセス、**鍵ローテーション可能**であること | 鍵は env var（Vercel が at-rest 暗号化）、ES256/P-256、アクセスは管理者限定、ローテーション手順は `c2pa-gpsa-operational-controls.md` §4 に整備済み。AL1 は「GP/Claim Generator 自身が復号鍵を扱う」形態を許容し、現設計はこれに該当＝**AL1 は現状で充足**（KMS 化は AL2 向けの改善） | ✅（AL1） |
| **O.3** Claim Generator の保護 | **SCA/SBOM** で NVD 脆弱性検知、CRITICAL/HIGH を90日以内に修正 | dependabot（SCA）+ CI。90日ポリシーの明文化が必要 | 🟡 |
| **O.4** 生成時のアセット/アサーション保護 | コンテンツ処理ソフト全般に SCA/SBOM + 90日修正 | O.3 と同じ CI 資産でカバー可。ポリシー明文化が必要 | 🟡 |
| **O.5** サブシステム間通信の保護 | Edge/Backend 間を **TLS 1.3 以上** | Vercel/Supabase が TLS1.3 提供。クライアント↔API も HTTPS | ✅ |
| **O.6** ホスティング環境の保護 | **IAM/RBAC**、依存/API の脆弱性スキャン（**OWASP Top10** カバー）、適時修正（30/90/180日） | Supabase RLS + Vercel/クラウド IAM、CodeQL/Codacy。OWASP カバレッジと修正 SLA の明文化が必要 | 🟡 |

**AL1 達成に向けた実作業（最小）**:
1. **O.2**: AL1 は現設計（GP 自身が復号鍵を扱う・env at-rest 暗号化・ローテーション手順あり）で充足。
   追加の必須作業なし。KMS（AWS/GCP/Azure）への移行は **AL2 向けの改善**であり AL1 の必須要件ではない。
2. **O.1**: 手動プロビジョニングのため **非該当**。自動エンロールは採用しないので実装作業なし
   （将来 CA が自動エンロールを要求する場合のみ再検討）。
3. **O.3/O.4/O.6**: 既存 CI（dependabot/CodeQL＋CI の npm audit ゲート）で技術的には充足。
   （Codacy はワークフローはあるが `CODACY_PROJECT_TOKEN` 未設定で自動トリガー無効・手動起動のみ＝継続実行ではない。）
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

> **提出用の完成版は別ファイル `docs/c2pa-gpsa.md`**（2026-09-03 作成、実装事実ベースで §1–§2 を記述、
> 提出前チェックリスト付き）。以下は初期の骨子で、内容は `c2pa-gpsa.md` に移行済み。
>
> テンプレート: `C2PA Generator Product Security Architecture Document Template.md`。
> 提出は Markdown + 図（PNG/JPEG）。以下は Ledra 実装から埋められる範囲を記入し、
> 不明箇所は `【要確認】` とした。**提出前に代表が事実確認すること。**

### 1. Generator Product Information

- **1.1 申請組織**: 株式会社HOLY／登記住所: 東京都港区北青山1-3-1 アールキューブ青山3F／連絡先: info@holy-inc.jp
- **1.2 Conformance Program Version**: 0.2
- **1.3 Spec Version**: **2.4**（代表確定。v0.2 プログラムは 2.2/2.4 を受付。注意: 契約上、申告版に製品が拘束されるため、Intake で提出するサンプルアセットが実際に **v2.4 準拠**のマニフェストを出力していることを要確認）
- **1.4 Distinguished Name**:
  - CN: `Ledra`（対外プロダクト名）
  - O: `HOLY Inc.`（登記英字名。日本語登記名: 株式会社HOLY）
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
- **1.9 対応メディアタイプ**（実コードで確認: `uploadHandler.ts:33` の accept-list）:
  - 生成（署名）: **`image/jpeg` / `image/png` / `image/webp` / `image/heic`**。アップロードで
    magic-byte 判定し、この4種のみ受理→真正性パイプライン→C2PA 署名（`signC2pa`, `c2pa.ts:196`）。
  - 検証（取り込み）: 同4種を ingredient として外部 C2PA 検証（`verifyExternalC2pa`,
    `processUploadedPhoto.ts:105`。strip/再エンコード前の原バイトに実施）。
  - いずれもテンプレート §1.9 の許可リストの部分集合。**各型のサンプルアセット＋.c2pa/.json を Intake で提出**。

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
  1. IAM/RBAC: Vercel/クラウド IAM。GP アップロード経路は service-role で RLS をバイパスし、テナント分離は
     アプリ層で tenant_id にスコープ。**Supabase RLS** はテナント認証済みクライアントの他経路を保護。
  2. プリンシパルアクセス方針: サービスアカウント/本番 ID の方針【要確認】。
  3. クラウドリソース IAM: 【要確認: Supabase プロジェクト/ストレージのアクセス方針】。
  4. 脆弱性スキャン + **OWASP Top10**: CodeQL＋Dependabot＋CI の npm audit ゲートでカバー（Codacy は自動トリガー
     無効・手動起動のみ）【要確認: OWASP 明示カバレッジ】。
  5. 適時修正: 30/90/180日 SLA を【要整備・明文化】。

## 5. 要確認事項（OPEN_QUESTIONS 連携）

1. ~~申告 Spec バージョン~~ → **2.4 で確定・申告済み**（実出力の v2.4 一致はサンプルで要検証）。
2. **CA の選定**と、その自動エンロール認証方式（O.1 / O.2 の設計を左右する最重要事項）。
3. **署名鍵の鍵管理方式**（AL1: 独立鍵管理サービス / AL2: KMS + ハードウェア RoT）。
4. ~~対応メディアタイプの確定~~ → **image/jpeg・png・webp・heic で確定・申告済み**。サンプルアセット準備は残（証拠フェーズ）。
5. ~~会社の登記住所・英字社名・DN 各値~~ → **確定・申告済み**（§11）。残: 郵便番号107-0061 の確認。
6. AL1 で先行するか、AL2 まで作り込んでから申請するか → **AL1 先行で確定・申請中**。

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
- 会社法的情報（登記どおり）: 法人名 `株式会社HOLY`（英字: **HOLY Inc.**）／登記住所: **東京都港区北青山1-3-1 アールキューブ青山3F**／
  Reliable Method of Communication（第三者確認可能な連絡先）: **info@holy-inc.jp**。
- 申告 Spec バージョン: **2.4**。
- 想定 Max Assurance Level: **1**。
- 補足: EOI 提出後、Linux Foundation の署名サービスで GP 用 Legal Agreement に署名 → Intake Form 案内、
  という流れ（§1 ステップ2-3）。GPSA（§4）とサンプルアセットは Intake 後の証拠提出で使う。

## 9. GP Legal Agreement（Generator Product Agreement v1.0）記入項目とレビュー要点

出典: `conformance-public/legal-agreements/C2PA Generator Product Company Agreement v1.0 (Final 6-25-2025).pdf`
（本セッションで pdfminer によりテキスト抽出して確認）。EOI 送信後、Linux Foundation の署名サービス
経由で**署名可能な版**が届く。**リポジトリの PDF は "NOT FOR SIGNATURE" 透かし付きの参照用**なので、
これ自体に署名しない。

- 契約相手: Joint Development Foundation Projects, LLC — Coalition for Content Provenance and Authenticity
  Series（デラウェア州 LLC、住所 2810 N Church St, PMB 57274 Wilmington, DE 19802-4447, USA）。
- 署名者: 会社を拘束できる権限者（代表取締役 堀越友輔）。署名サービス上で社内の署名者へ転送も可。

### 記入欄と Ledra の確定値

| 契約書の欄 | 入力値 |
|---|---|
| Generator Product Company Name (Applicant) | HOLY Inc.（株式会社HOLY） |
| Name of Contact Person | 堀越友輔（または実担当者）【代表確認】 |
| Contact person's Phone No. | **【要確認: 電話番号】** |
| Email Address for Notice | info@holy-inc.jp |
| Location of Principal Office | 東京都港区北青山1-3-1 アールキューブ青山3F |
| State of Incorporation | 様式は米国前提。**日本法人なので「Japan（Tokyo）」相当を記載**【要確認: 署名サービス上の表記指定】 |
| Signed / Name / Title / Date | 署名／堀越友輔／Representative Director（代表取締役）／署名日 |

### 署名前に代表（または顧問）が確認すべき主要条項

- **準拠法・裁判管轄**: デラウェア州法。紛争は同州。
- **補償（Indemnification）**: Applicant が第三者クレームから C2PA を補償する義務。
- **秘密保持**: Non-Public Information と紛争解決手続きの秘密保持義務。
- **商標ライセンス**: C2PA マークの使用は Conformance Program の範囲・ガイドライン内に限定。逸脱は禁止・取消あり。
- **セキュリティ material change の90日是正**: C2PA がセキュリティ脅威対応で material change を要求した場合、
  全 `conformant` GP に90日（別途通知の期間）以内に是正する義務。
- **解約**: Applicant は10日前の書面通知でいつでも解約可（C2PA 側にも解約条項あり）。
- **費用**: プログラム費用は無料（§7）。
- 注意: 上記は本セッションの抽出に基づく要約であり、法的助言ではない。**契約は全文（PDF）を精読の上で署名**すること。

## 10. 次ステップ: Program Intake Form（GP・CPL レコード用）

Legal Agreement 署名（✅ 2026-08-25）後、**Administrator から Intake Form のリンクがメールで届く**
（連絡先 info@holy-inc.jp に着信するか要確認）。Intake Form は CPL レコードを組み立てるための情報収集で、
GPSA（§4）とサンプルアセットは Intake 後の証拠提出フェーズで使う。詳細フィールドは公式「Companion Guide
for the C2PA Conforming Products List」参照。

### Intake で入力する主な値（確定分）

| Intake 項目 | 値 |
|---|---|
| 役割 | Generator Product |
| 法人・公開レコード情報 | HOLY Inc.（株式会社HOLY）／東京都港区北青山1-3-1 アールキューブ青山3F |
| 実装クラス | Backend |
| Max Assurance Level | 1 |
| 申告 Spec バージョン | 2.4 |
| 生成メディアタイプ | image/jpeg, image/png, image/webp, image/heic（§1.9・実コード確認） |
| 検証メディアタイプ | 同上（ingredient 検証） |
| Date of Earliest Public Disclosure | 【要確認: CPL 公開を遅らせたい日付があれば指定。無ければ即時】 |

### Intake 後に用意する証拠（先に準備しておくと期間短縮）

1. **サンプルアセット**: 上記4メディアタイプそれぞれの **C2PA 署名済み出力**＋対応する `.c2pa`/`.json`。
   本番署名は env 有効化（`C2PA_MODE=production` ＋ 鍵）で生成できる（§0・LEDRA_CURRENT の B1）。
2. **GPSA 文書**（§4）を Markdown で仕上げ、アーキ図（PNG/JPEG）を添付。
3. **v2.4 実出力の確認**（OPEN_QUESTIONS）: 申告 2.4 とサンプルの実バージョン一致を検証。
4. AL1 の残タスク: 署名鍵の KMS 化（§6.3）、90日修正ポリシー & OWASP カバレッジの運用文書化。

## 11. Intake Form 提出内容の記録（2026-09-03 提出）

将来の証拠提出フェーズで申告と整合させるための控え。要確認箇所は代表が実提出値で上書きすること。

| 設問 | 提出値 |
|---|---|
| Legal Organization Name | HOLY Inc.（Legal Agreement と一致） |
| Legal Business Street / City / State / Zip / Country | 1-3-1 Kita-Aoyama, R-Cube Aoyama 3F / Minato-ku / Tokyo / 107-0061【要確認】 / Japan |
| Conformance Program Version | 0.2 |
| Product or Service | Generator Product |
| Asserted Spec Version | 2.4 |
| Compressed manifests 対応 | No（圧縮設定なし・要サンプル検証） |
| Product Type | Generator Product |
| Implementation type | Backend |
| Best describes your product | 【代表最終選択・要確認】選択肢2（media capture app）または None of the above |
| DN CN / O / C / OU | Ledra / HOLY Inc. / JP / （空） |
| Minimum Software Version | （空・任意） |
| Max Assurance Level | 1 |
| Attestation methods | None of the above |
| Still image generation | Yes（image/jpeg, png, webp, heic） |
| Video / Text / Audio / Document / Font / ML / Live streaming generation | No |
| Still image validation | Yes（image/jpeg, png, webp, heic・ingredient 検証） |
| Date of Earliest Public Disclosure | 2026-09-03（即時公開）【代表最終値・要確認】 |
| Web address | https://www.ledra.co.jp |

### 次フェーズ: 証拠提出（Administrator レビュー後に依頼される）

1. **サンプルアセット**（4型 × 署名済み画像＋`.c2pa`/`.json`、および検証結果サンプル）。
   本番署名 `C2PA_MODE=production`＋鍵で生成。**この生成時に同時検証すべき3点**:
   - v2.4 準拠マニフェストが出ているか（申告2.4との一致）。
   - HEIC の署名が c2pa-node で実際に通るか（通らなければ heic をメディアタイプから外す）。
   - 圧縮マニフェストになっていないか（Intake で No と申告）。
2. **GPSA 文書**（§4）を Markdown で仕上げ＋アーキ図。
3. **AL1 クリティカルパス**: 署名鍵の KMS 化（§6.3, env PEM 廃止）、90日修正ポリシー & OWASP カバレッジの運用文書化。

## 12. サンプル生成で判明したブロッカー（2026-09-03・実行検証）

証拠フェーズ用サンプルを scratch 環境（pinned `@contentauth/c2pa-node@0.6.0` = c2pa-rs 0.90.0、dev 自己署名証明書）で生成して判明。**現状のサンプルは提出不可**。

### 確実（実行で確認）

- **actions アサーションが C2PA 2.x 非準拠**。製品の `MANIFEST_ACTIONS`（`c2pa.opened`/`converted`/`edited`、`c2pa.ts:42`）は ingredient 参照を持たず、検証で **`assertion.action.ingredientMismatch`** を出す。切り分け結果:
  - `c2pa.opened`（ingredient なし）→ `ingredientMismatch`
  - `c2pa.created`（bare）→ `assertion.action.malformed`
  - **`c2pa.created` + `digitalSourceType` → 検証コードなし（準拠）** ← 修正の方向
  - claim は **v2 / `c2pa.actions.v2`**（2.x 系。申告 2.4 と整合的だが、厳密な 2.4 準拠は assessor/interop で要確認）。
- **HEIC サンプルはこの環境で生成不可**（sharp が HEIF エンコード非対応: "heifsave: Unsupported compression"）。c2pa-node が HEIC 署名を通すかは、HEIF 対応 sharp か実 HEIC ファイルで別途要検証。

### 未確定（本番証明書で要再検証）

- **`claimSignature.mismatch`**（署名が検証を通らない）が dev 自己署名証明書では claim v1/v2・assertion 有無に関係なく**常時発生**。これは **dev-cert ハーネス固有の可能性が高い**（内容非依存のため）が、**本番証明書（`C2PA_SIGNER_CERT/KEY`）での署名が有効か未検証**。証拠フェーズ前に本番署名で1枚検証すること。
- 製品テスト（`c2paManifest.test.ts`/`c2paVerify.test.ts`）は**純関数のみ**で、**実署名画像の検証を一切カバーしていない**（本件が今まで検知されなかった理由）。

### 次アクション（証拠フェーズのクリティカルパス）

1. **actions レジャーを 2.x 準拠に修正**（`c2pa.created`+`digitalSourceType`、または `opened` に実 ingredient を付与）。provenance の意味づけ（撮影→strip→再エンコードの履歴をどう表現するか）は要判断。
2. **本番証明書で署名→検証** し `claimSignature.mismatch` が出ないことを確認。
3. **実署名画像の検証を1本テスト化**（署名→`Reader`→`validation_state===Valid`）。lazy 化の runnable check。
4. HEIC 署名の可否を実ファイルで確認（不可なら申告メディアタイプから heic を外す）。

### 修正済み（本ブランチ・2026-09-03）

`src/lib/anchoring/providers/c2pa.ts` の `MANIFEST_ACTIONS` を修正: 先頭を `c2pa.opened`（ingredient 必須で非準拠）から **`c2pa.created` + `digitalSourceType=digitalCapture`** に変更し、`orientation`/`converted`/`edited` は維持（ingredient 不要で準拠）。正直な処理履歴（向き・再エンコード・EXIF/GPS 除去）は保持。scratch 実測で `ingredientMismatch`/`malformed` が消え、残コードは dev-cert の `signingCredential.untrusted`/`claimSignature.mismatch` のみ。`c2paManifest.test.ts` の期待値を更新し、実署名→検証で action/assertion エラーが無いことを確かめる **`c2paSignValidate.test.ts`** を新設（欠けていた runnable check）。

**HEIC 検証済み（2026-09-03）**: pillow-heif で生成した HEIC を c2pa-node で署名でき、内容エラーなし（残コードは dev-cert のみ）＝**HEIC 署名は対応・準拠**。先の失敗は sharp が HEIF を*エンコード*できないだけで、c2pa-node 自体は HEIC 署名可能。→ 申告メディアタイプに heic を残してよい。
- ただし別論点（プライバシー）: Ledra の strip は sharp。**本番の sharp が HEIF を*デコード*できないと HEIC の EXIF/GPS 除去が効かず**（fail-open で原本署名）位置情報が残りうる。HEIC アップロードの GPS 除去可否は本番環境で要確認。

**署名も検証済み・解決（2026-09-03）**: `claimSignature.mismatch` は **dev 自己署名証明書（`generateDevCert`）だけの癖**と確定。c2patool 公式サンプルの ES256 証明書で同じ署名ロジックを実行すると **`validation_state: Valid`**／`claimSignature` エラーなし（残は `signingCredential.untrusted` のみ＝適合後に CA がトラストリストに載れば解消）。→ **製品の署名ロジックは健全。本番鍵は不要で証明済み**。
- 補足: 本番の Claim Signing Certificate は適合認定後に認定 CA から発行される（プロセス最終段）ため、申請時点で Ledra は保有しない。証拠フェーズのサンプルは適合前でも上記のように正しい署名／準拠マニフェストを提示できる。
- 軽微な残: `dev-signed` モードは自己署名の都合で署名が Valid にならない（ローカル検証専用の限界）。本番挙動には影響しない。将来 `generateDevCert` を c2pa-rs が受容する形に寄せれば dev でも Valid にできる。
