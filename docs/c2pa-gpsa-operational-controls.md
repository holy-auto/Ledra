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
- **CodeQL**（`.github/workflows/codeql.yml`）: **`main` ブランチ宛ての** push・pull request、および毎週月曜の
  スケジュール（`cron: "0 3 * * 1"`）で `security-extended` クエリスイートを実行し、静的解析でコードの脆弱性を
  検知する（トリガーは `main` 限定＝他ブランチ宛ての push/PR では走らない）。
- **Codacy**（`.github/workflows/codacy.yml`）: 静的解析・コード品質検査のワークフローは存在するが、
  `CODACY_PROJECT_TOKEN` 未設定のため**自動トリガー（push / pull_request / schedule）は無効化**されており、
  現状 `workflow_dispatch`（手動起動）のみ。したがって継続実行ではない。トークン設定後に自動トリガーを復活させる予定。
  継続的な検査は下記の Dependabot・CodeQL・CI の npm audit ゲートが担う。
- **CI**（`.github/workflows/ci.yml`）: push/PR で **`npm audit --audit-level=high`**（高 severity 以上の
  依存脆弱性を検出すると CI が失敗＝マージ阻止）、Lint、`tsc --noEmit` 型チェック、`test:coverage` を実行する。

これらは Claim Generator（署名系 `@contentauth/c2pa-node`）と、コンテンツ/アサーションを処理するソフト
（画像処理 `sharp`、アップロード処理 `src/lib/certificateImages/*`）を含む GP TOE 全体の依存を対象とする。

## 2. 脆弱性修正ポリシー（O.3 / O.4 / O.6）

検知した脆弱性は重大度に応じて以下の期限内に修正・緩和する。修正は PR ベースで行い、Dependabot/CodeQL の
アラートをトリアージして対応する（Codacy は自動トリガー無効・手動起動のみ。§1 参照）。加えて CI の
`npm audit --audit-level=high` が高 severity 以上の依存脆弱性でビルドを失敗させ、未修正のままのマージを
機械的に阻止する。

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
| A01 アクセス制御の不備 | API のロール確認（`resolveCallerWithRole` / `requireMinRole`）。GP アップロード経路は service-role クライアントで RLS をバイパスするため、テナント分離はアプリ層で tenant_id にスコープして担保（`createTenantScopedAdmin`）。テナント認証済みクライアントでアクセスする他経路は Supabase Row Level Security が担う |
| A02 暗号化の失敗 | 通信は TLS 1.3（Vercel/Supabase）。署名鍵は保存時暗号化（環境変数） |
| A03 インジェクション | CodeQL `security-extended`（SQL/コマンド/XSS 等）、Supabase パラメタライズドクエリ |
| A04 安全でない設計 | 認証・テナント分離・撮影 nonce を設計に内在化（端末アテステーションは実装済みだが既定 OFF＝Phase 3 まで未稼働） |
| A05 セキュリティ設定ミス | CodeQL による設定・コード検査、Vercel/Supabase のマネージド設定（Codacy は自動トリガー無効・手動起動のみ） |
| A06 脆弱・古いコンポーネント | Dependabot（週次）＋ CodeQL＋ CI の npm audit ゲート |
| A07 認証の不備 | Supabase Auth、モバイルは単回使用 nonce（端末アテステーションは既定 OFF＝Phase 3 まで未稼働。将来有効化予定） |
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
