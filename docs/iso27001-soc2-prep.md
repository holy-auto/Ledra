# ISO 27001 / SOC 2 取得 準備チェックリスト

エンタープライズ顧客との契約獲得のため、ISO 27001 (情報セキュリティ
マネジメント) と SOC 2 Type II (主に米国系顧客向け) の取得準備状況。

## 1. 現状サマリ

| 領域 | ISO 27001 | SOC 2 Trust Services | Ledra 現状 |
|------|-----------|---------------------|-----------|
| アクセス制御 | A.9 | CC6 | ✓ Supabase RLS + RBAC + 2FA scaffolding |
| 暗号化 | A.10 | CC6 | ✓ TLS / Supabase 透過暗号化 / SECRET_ENCRYPTION_KEY |
| 物理セキュリティ | A.11 | CC6 | ✓ サブプロセッサ (Supabase/Vercel) に依存 |
| 運用 (変更管理) | A.12 | CC8 | ⚠ ステージング環境あり、CAB 未整備 |
| 通信セキュリティ | A.13 | CC6 | ✓ HSTS / CSP / proxy.ts CSRF |
| サプライヤー管理 | A.15 | CC9 | ⚠ サブプロセッサ DPA 整備中 |
| インシデント管理 | A.16 | CC7 | ⚠ Sentry + cron alert ある、IR Playbook 未文書化 |
| 事業継続 | A.17 | A1 | ⚠ DR plan 未文書化 |
| 法令遵守 | A.18 | — | ✓ 個人情報保護法 / GDPR DPA テンプレ整備済 |

## 2. ISO 27001 — 必須文書 (Statement of Applicability)

### 整備済
- [x] 情報セキュリティポリシー (本リポジトリの `docs/security-overview.md` 相当)
- [x] アクセス制御ポリシー (`docs/operations-guide.md` + RBAC 実装)
- [x] 暗号化ポリシー (`SECRET_ENCRYPTION_KEY` の運用 = `docs/metamask-signer-setup.md` で部分カバー)
- [x] バックアップポリシー (Supabase 自動 PITR)
- [x] サプライヤー管理 (`docs/dpa-template.md` 整備中)
- [x] データ保持 (`docs/data-retention.md`)
- [x] 監査ログ (`audit_logs` テーブル + admin UI)

### 未整備 (取得前に必須)
- [x] 情報資産台帳 (どのサーバ/ストレージにどのデータがあるか) — `docs/information-asset-inventory.md`（初版。データフロー図/オーナー欄は要記入）
- [ ] リスクアセスメント結果
- [ ] 内部監査計画 + 結果（監査フレームワーク `docs/security-audit-framework.md` で運用化済、結果蓄積は継続）
- [ ] マネジメントレビュー議事録
- [ ] 人的セキュリティ (採用時の身元確認 / 退職時の権限剥奪手順)
- [ ] 物理セキュリティ (リモートワーク環境ポリシー)
- [x] インシデント対応プレイブック — `docs/incident-response-playbook.md`（初版。連絡網/担当者は要記入）
- [ ] 事業継続計画 (BCP) + DR テスト記録（DR は `docs/disaster-recovery.md` 整備済、BCP 文書化・テスト記録は継続）
- [ ] 経営者承認の SoA 文書

## 3. SOC 2 Type II — Trust Services Criteria

Type II は **6 ヶ月以上の運用実績** を監査するため、以下のログを蓄積する
必要がある:

### Common Criteria (CC1〜CC9)

- **CC1 (統制環境)**: 役員会議議事録、組織図、職務分掌
- **CC2 (情報・伝達)**: 内部コミュニケーション記録、顧客通知ログ
- **CC3 (リスク評価)**: 年次リスクアセスメント、変更影響評価
- **CC4 (監視活動)**: Sentry / Vercel アラート、月次セキュリティレビュー
- **CC5 (統制活動)**: アクセス権レビュー結果、コードレビュー記録
- **CC6 (論理アクセス)**: ユーザ追加・削除ログ、特権アクセスログ
- **CC7 (システム運用)**: 変更管理ログ、バックアップ実績、DR テスト
- **CC8 (変更管理)**: PR/MR 履歴 (GitHub で達成済)、リリースノート
- **CC9 (リスク軽減)**: ベンダー評価、脅威インテリ統合

### 追加カテゴリ (オプション、選択して受審)

- **Availability** (A1): SLA / SLO 達成率 (`docs/slo.md` で定義)
- **Confidentiality**: NDA 管理、データ分類
- **Privacy**: 既に GDPR/PIPA 対応で大部分カバー
- **Processing Integrity**: 入力検証 (Zod)、トランザクション整合性 (outbox)

## 4. 推奨進め方

```
Phase 1 (1-2 ヶ月): 文書整備
  ├─ Drata / Vanta / Secureframe 等の自動化ツールを契約
  │  (社内文書テンプレート + 統制エビデンス自動収集)
  ├─ 上記「未整備」項目を Drata の orientation セッションで整備
  └─ サブプロセッサとの DPA を全部締結

Phase 2 (3-6 ヶ月): 運用エビデンス蓄積
  ├─ 月次セキュリティレビュー会議を実施 + 議事録
  ├─ アクセス権レビュー (四半期)
  ├─ DR テスト (半期に 1 回)
  └─ 内部監査 (取得直前)

Phase 3 (1-2 ヶ月): 監査受審
  ├─ ISO 27001: 認証機関を選定 (BSI / DNV GL / JQA 等)
  ├─ SOC 2: 米国 CPA ファームを選定 (Prescient Assurance / A-LIGN 等)
  └─ ギャップ修正 → 認証取得
```

合計 **6-12 ヶ月** + Drata/Vanta 年額 **$10k-30k** + 監査費 **$30k-60k**
が現実的な見積。

## 5. 直近で着手できること (本リポジトリ範囲)

- [ ] `docs/security-overview.md` を作成 (他 doc を index 化)
- [ ] `docs/incident-response-playbook.md` を作成
- [ ] `docs/asset-inventory.md` (Supabase テーブル / Vercel 環境変数 / Storage バケットの一覧)
- [ ] `docs/access-review.md` (四半期アクセスレビューの手順)
- [ ] CI に `npm audit --audit-level=high` を必須化 (現状 PR コメント程度)
- [ ] 全ての secret に対して `.secrets-age.json` で TTL を定義
      (✓ 本コミットで導入済)

## 6. 顧客向けに即出せる材料

- `docs/dpa-template.md` (本コミットで導入)
- `docs/data-retention.md` (本コミットで導入)
- `docs/operations-guide.md` (既存)
- `docs/staging-environment.md` (既存)
- `docs/sso-setup.md` (前コミットで導入)
- セキュリティ概要は `(marketing)/security/page.tsx` で部分公開済

これらを「セキュリティ・コンプラ パッケージ」として 1 PDF にまとめ、
NDA 締結後に共有できるようにする。
