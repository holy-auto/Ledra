# Ledra GPSA — Operational Security Controls (Supporting Document)

> C2PA Generator Product Security Architecture (GPSA) 提出補足資料。GPSA 本体
> `docs/c2pa-gpsa.md` の O.2–O.6 が参照する現行の運用管理策を、**現在有効なものとして**記述する。
> ツール構成は実在の設定（`.github/dependabot.yml`, `.github/workflows/codeql.yml`,
> `.github/workflows/codacy.yml`, `.github/workflows/ci.yml`）に基づく。
> 本書は現行運用の記述であり、記載内容の妥当性は代表が最終確認する。

## 1. 依存関係・脆弱性スキャン（O.3 / O.4 / O.6）

Generator Product とそのコンテンツ処理ソフトのビルド/統合に対し、以下を継続的に実行している。

- **Dependabot**（`.github/dependabot.yml`）: npm 依存（リポジトリルートおよび `/apps/mobile`）と
  GitHub Actions を対象に、毎週月曜に脆弱性・更新を検査し PR を自動起票する。NVD 由来の既知脆弱性を検知する。
- **CodeQL**（`.github/workflows/codeql.yml`）: すべての push・pull request、および毎週月曜のスケジュール
  （`cron: "0 3 * * 1"`）で `security-extended` クエリスイートを実行し、静的解析でコードの脆弱性を検知する。
- **Codacy**（`.github/workflows/codacy.yml`）: 静的解析・コード品質検査を CI で実行する。
- **CI**（`.github/workflows/ci.yml`）: 型チェック・Lint・テストを push/PR で実行する。

これらは Claim Generator（署名系 `@contentauth/c2pa-node`）と、コンテンツ/アサーションを処理するソフト
（画像処理 `sharp`、アップロード処理 `src/lib/certificateImages/*`）を含む GP TOE 全体の依存を対象とする。

## 2. 脆弱性修正ポリシー（O.3 / O.4 / O.6）

検知した脆弱性は重大度に応じて以下の期限内に修正・緩和する。修正は PR ベースで行い、Dependabot/CodeQL/
Codacy のアラートをトリアージして対応する。

| 重大度（CVSS v3+） | 修正/緩和の期限 |
|---|---|
| CRITICAL | 検知から 90 日以内（O.3 / O.4） |
| HIGH | 検知から 90 日以内（O.3 / O.4）／ホスティング環境は 30 日以内（O.6） |
| MODERATE | 90 日以内（O.6） |
| LOW | 180 日以内（O.6） |

Claim Generator ビルドについては、CRITICAL/HIGH の既知脆弱性を検知から 90 日を超えて残したまま出荷しない
運用とする。

## 3. OWASP Top 10 カバレッジ（O.6）

Web アプリケーションの主要脆弱性（OWASP Top 10）を以下の管理策でカバーする。

| OWASP Top 10（2021） | 主な管理策 |
|---|---|
| A01 アクセス制御の不備 | Supabase Row Level Security（テナント分離・行レベル制御）、API のロール確認（`resolveCallerWithRole` / `requireMinRole`） |
| A02 暗号化の失敗 | 通信は TLS 1.3（Vercel/Supabase）。署名鍵は保存時暗号化（環境変数） |
| A03 インジェクション | CodeQL `security-extended`（SQL/コマンド/XSS 等）、Supabase パラメタライズドクエリ |
| A04 安全でない設計 | 認証・テナント分離・撮影 nonce・端末アテステーションを設計に内在化 |
| A05 セキュリティ設定ミス | CodeQL/Codacy による設定・コード検査、Vercel/Supabase のマネージド設定 |
| A06 脆弱・古いコンポーネント | Dependabot（週次）＋ CodeQL |
| A07 認証の不備 | Supabase Auth、モバイルは端末アテステーション＋単回使用 nonce |
| A08 データ完全性の不備 | 依存の脆弱性検査、CI の型/テスト、C2PA 署名による成果物の完全性 |
| A09 ログ・監視の不備 | Sentry によるエラー監視（AL1 範囲。監査ログ拡充は本申請の対象外） |
| A10 SSRF | 外部呼び出しの限定、CodeQL 検査 |

## 4. 署名鍵ローテーション手順（O.2）

Claim Signing Certificate / Key は環境変数 `C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY` で保持する。ローテーションは
次の手順で実施できる。

1. 認定 CA から新しい Claim Signing Certificate（および対応する秘密鍵）を取得する。
2. 実行環境（Vercel）の環境変数 `C2PA_SIGNER_CERT` / `C2PA_SIGNER_KEY` を新しい値へ更新する。
   環境変数は保存時に暗号化され、更新権限はプロジェクトの管理者に限定される。
3. デプロイにより新しい資格情報が有効化される（`c2paSigner.ts` はプロセス起動後の初回署名時に
   環境変数から資格情報を読み込む）。
4. 旧証明書の失効が必要な場合は発行 CA に失効を依頼する。

ローテーションのトリガーは、証明書の有効期限接近、鍵漏洩の懸念、運用方針上の定期更新である。

## 5. 代表確認事項

- 本書記載の重大度別 SLA（90 日 / 30・90・180 日）を現行運用として確定・遵守すること。
- OWASP カバレッジ表の各管理策が実運用と一致することの確認。
- Sentry 等のログ/監視構成の記述が現状と一致することの確認。
