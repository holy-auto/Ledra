# AWS 運用コスト試算 — Ledra

> 作成: 2026-06 / 対象リージョン: **東京 (ap-northeast-1)** / 為替: **¥150/$ 換算**
> 価格は 2026-06 時点のオンデマンド概算。AWS の値下げ・FX 変動で動くため、
> 最終判断前に [AWS Pricing Calculator](https://calculator.aws/) で再計算すること。
> 関連: `docs/architecture-roadmap.md` §3 (SPOF), `docs/disaster-recovery.md`,
> `docs/slo.md`, `docs/staging-environment.md`, `docs/enterprise-readiness.md`

---

## 0. 結論 (先に要点)

1. **「AWS コスト」として意味があるのはインフラ層だけ**。Stripe / Anthropic /
   Twilio / Polygon ガス / Square / LINE / Sentry / PostHog などの SaaS は、
   AWS に載せても**同額の従量課金がそのまま残る**(パススルー)。
2. **現在の規模では AWS はむしろ割高**。現行 (Vercel + Supabase Pro + Upstash)
   の HA/DR 構成 ≈ **$410/月** に対し、同等の AWS HA 構成は
   **$770–890/月 (オンデマンド)**、Savings Plans 最適化後でも **$560–680/月**。
   **約 1.4–2.2 倍**。さらに**一度きりの移行工数 10–16 週**が乗る。
3. **AWS が逆転するのは「規模 × コミット割引」か「コンプラ要件」が出てきた時**。
   コスト削減目的なら今は移行しない方が安い。
4. **移行するなら "Supabase セルフホスト on AWS" を強く推奨**(後述 §3)。
   `supabase-js` / RLS `auth.uid()` / SSR 認証をそのまま温存でき、最難関の
   「Supabase 脱結合」を**書き直しではなく運用**に変えられる。

---

## (a) 現行コスト vs AWS — 精密比較

### a-1. 現行 (フルマネージド) の内訳

`docs/disaster-recovery.md` の DR 要件 (PITR 7日 + Read Replica 1台) と
`docs/slo.md` の可用性目標 (99.9%/99.5%) を満たす**実運用構成**を前提に積算。

| サービス | プラン / 構成 | 月額 (概算) |
|---|---|---|
| **Vercel** | Pro 2 seat ($40) + Functions/帯域/PDF 等の従量 | ~$100 |
| **Supabase** | Pro $25 + Medium compute $60 + Read Replica $60 + **PITR 7日 $100** + 超過 $20 | ~$265 |
| **Supabase (staging)** | 別プロジェクト (Pro small or Free) | ~$25 |
| **Upstash** | Redis (rate limit) + QStash (非同期) 従量 | ~$20 |
| **合計 (インフラ層のみ)** | | **≈ $410/月 (¥62,000)** |

> レンジ: 概ね **$300–500/月**。Vercel/Supabase の実請求書を引けば精度が上がる
> (→ Phase 0)。Supabase の最大費目は **PITR ($100)** と **Read Replica ($60)**。

### a-2. パススルー SaaS (AWS でも不変)

以下は「どこで動かしても」同じ。AWS 試算には**含めない**が、総コストの実態として把握する。

| SaaS | 課金軸 | AWS で代替可能? |
|---|---|---|
| Stripe | GMV の % + 件数 | 不可 (決済) |
| Anthropic (Sonnet 4.6) | トークン従量 | 不可 |
| Twilio (SMS) | 通数 | SNS で一部代替可 |
| Polygon (anchoring) | ガス代 | 不可 |
| Square / LINE | 各社手数料 | 不可 |
| **Sentry** | Team ~$26–80 | CloudWatch+X-Ray で代替可 (推奨せず) |
| **Resend + SendGrid** | ~$20 + 従量 | **SES で代替 ($0.10/1k)** ← 安くなる |
| PostHog | 従量 (Free 枠厚い) | 代替非推奨 |
| Healthchecks / Slack / Google Cal | Free | — |

### a-3. 横並び比較

| | 現行 (managed) | AWS オンデマンド | AWS + Savings Plans |
|---|---:|---:|---:|
| 本番 (HA) | ~$365 | ~$620–743 | ~$445–525 |
| staging | ~$25 | ~$150 | ~$120 |
| rate limit / queue | ~$20 | (本番に内包) | (内包) |
| **合計 / 月** | **~$410** | **~$770–890** | **~$560–680** |
| **円換算 (¥150/$)** | **~¥62,000** | **~¥116k–134k** | **~¥84k–102k** |
| 一度きり移行工数 | — | **10–16 週** | **10–16 週** |

### a-4. 損益分岐 (いつ AWS が安くなるか)

現行が割安なのは、マネージド PaaS が **HA・Auth・Storage・自動API・バックアップを
バンドル**しているため。AWS は **Multi-AZ RDS ($245〜)**, **NAT GW ($45〜)**,
**Read Replica = フルインスタンス ($123)**, **CloudWatch** など**常時固定費**が積む。
逆転条件は以下のいずれか:

- **コンピュート確約**: 3年 RI / Savings Plans で常時稼働分を 40–60% 削減できる規模。
- **DB 肥大**: Supabase の compute add-on + per-GB + PITR 課金が、RDS/Aurora の
  実コストを上回るデータ量・スループットに到達。
- **巨大 egress**: CloudFront が Vercel 帯域より単価で有利になるトラフィック量。
- **コンプラ/契約**: VPC 閉域・データレジデンシー・SOC2/ISO27001 のインフラ統制
  (`docs/enterprise-readiness.md` / `docs/iso27001-soc2-prep.md`)。
  → **コストではなく要件で動く**ケース。これが現実的な最有力トリガー。

**目安**: Supabase + Vercel の合算が月 **$1,000–2,000** を超えるまでは、現状維持が安い。

---

## (b) 本番 HA 構成の詳細内訳 (Pricing Calculator 相当)

東京リージョン / オンデマンド / 月 730 時間 / 単一リージョン (Multi-AZ で冗長化)。
構成は「ECS Fargate ホスティング + RDS Multi-AZ + ElastiCache + CloudFront」を採用
(Lambda+CloudFront の OpenNext 構成は §補足参照)。

### b-1. 本番 (production)

| # | サービス | 構成 | 数量 | 単価 (東京・概算) | 月額 |
|---|---|---|---|---|---:|
| 1 | **ECS Fargate** (Next.js) | 1 vCPU / 2 GB × 2 task 常時 | 1,460 vCPU-h + 2,920 GB-h | $0.05056/vCPU-h, $0.005552/GB-h | **$90** |
| 2 | **ALB** | 1 本 + 中 LCU | 730 h | $0.0243/h + LCU | **$22** |
| 3 | **RDS PostgreSQL** | db.t4g.large **Multi-AZ** | 730 h | ~$0.336/h (Multi-AZ) | **$245** |
| 4 | RDS ストレージ + バックアップ | gp3 100 GB + backup 30日 | — | $0.138/GB-mo + 超過 | **$25** |
| 5 | **ElastiCache** (Valkey) | cache.t4g.micro × 2 (HA) | 1,460 h | $0.022/h | **$32** |
| 6 | **NAT Gateway** | 1 台 + 処理量 | 730 h | $0.062/h + $0.062/GB | **$50** |
| 7 | **S3** | 200 GB Standard + req | — | $0.025/GB-mo | **$8** |
| 8 | **CloudFront** | ~300 GB egress(日本) + req | — | $0.114/GB | **$40** |
| 9 | **SES** | ~50k 通/月 | — | $0.10/1k 通 | **$5** |
| 10 | **SQS + Lambda** | 非同期ジョブ (QStash 代替) | — | $0.40/M + GB-s | **$5** |
| 11 | **EventBridge Scheduler** | Cron 21 本 (~200k 起動) | — | $1.00/M 起動 | **$1** |
| 12 | **Secrets Manager** | ~25 secrets | — | $0.40/secret-mo | **$10** |
| 13 | **CloudWatch** | Logs ~20 GB + alarms | — | $0.76/GB ingest | **$30** |
| 14 | **AWS WAF** | 1 ACL + ルール + req | — | $5 + $1/rule + $0.60/M | **$20** |
| 15 | Route 53 + その他データ転送 | zone + クエリ + AZ 間転送 | — | — | **$12** |
| | **本番 小計 (レプリカ無)** | | | | **≈ $620** |
| 3' | (任意) **RDS Read Replica** | db.t4g.large 単一AZ ※現行相当 | 730 h | ~$0.168/h | +$123 |
| | **本番 小計 (レプリカ有)** | | | | **≈ $743** |

### b-2. staging (検証環境・冗長化なし)

| サービス | 構成 | 月額 |
|---|---|---:|
| Fargate (app) | 0.5 vCPU / 1 GB × 1 (or Amplify) | $25 |
| RDS PostgreSQL | db.t4g.medium 単一AZ + 50 GB | $95 |
| その他 (S3 / SES / CloudWatch 最小) | — | $30 |
| **staging 小計** | | **≈ $150** |

### b-3. Savings Plans / RI 適用後

常時稼働の Fargate / RDS / ElastiCache / Replica に 1年 RI・Compute Savings Plans
(no upfront) を当てると **約 28–40% 削減**:

| 項目 | オンデマンド | RI/SP 後 |
|---|---:|---:|
| Fargate (本番) | $90 | ~$63 |
| RDS Multi-AZ | $245 | ~$160 |
| Read Replica | $123 | ~$80 |
| ElastiCache | $32 | ~$22 |
| 従量系 (CloudFront/SES/WAF 等) | 変わらず | 同額 |
| **本番合計 (レプリカ有)** | ~$743 | **~$525** |
| **staging** | ~$150 | **~$120** |
| **総合 / 月** | **~$890** | **~$645 (¥97,000)** |

### b-4. 補足: ホスティングを Lambda+CloudFront (OpenNext) にする場合

- トラフィックが波打つ B2B SaaS では、常時稼働の Fargate よりサーバーレスが安いことが多い。
- Lambda (x86 $0.20/M req + $0.0000166667/GB-s) + CloudFront。
  数百万 req/月規模で **$30–80/月**。Fargate+ALB ($112) を下回る公算。
- ただし Next.js 16 / React Compiler / ISR / `proxy.ts` (旧 middleware) / CSP nonce
  ストリーミングの**パリティ検証**が必要 (SST/OpenNext 採用)。Phase 2 で要 PoC。

---

## (c) 段階的移行プラン

Ledra は Supabase に深く結合 (`supabase-js` の `.from()` を 475 route で使用、
RLS が `auth.uid()` 依存、SSR 認証ヘルパ、`createTenantScopedAdmin`)。
**いきなり Cognito + 自前 API へ書き直すと数ヶ月のリスク**。疎結合な周辺から剥がし、
最後に DB/Auth を「セルフホストで温存」する順で進める。

### Phase 0 — 計測と前提固め (1週間)

- [ ] Vercel / Supabase / Upstash の**実請求書**を取得し §(a) の概算を実数化
- [ ] AWS Organization + アカウント分離 (prod / staging) + IAM ベースライン
- [ ] VPC / サブネット / Terraform (or CDK) のスケルトン
- [ ] HA 目標を `docs/slo.md` / `docs/disaster-recovery.md` から確定
      (Multi-AZ 要否 / replica 要否 / PITR 保持日数)
- [ ] **方針決定**: フル移行 vs ハイブリッド (Supabase 残し)

### Phase 1 — 低リスクな周辺移行 (2–3週間, アプリは Vercel のまま)

既存の抽象化が効くので並行作業可能。**ここだけで月数十ドル削れる** (SES 化等)。

| 対象 | 現行 | 移行先 | 勘所 | リスク |
|---|---|---|---|---|
| メール | Resend/SendGrid | **SES** | `sendEmail()` に三次フォールバックとして追加→昇格。roadmap §3 既出 | 低 |
| Cron | Vercel Cron | **EventBridge Scheduler** | 既存 `/api/cron/*` をそのまま叩く。`verifyCronRequest` は `Bearer CRON_SECRET` 対応済 | 低 |
| キュー | QStash | **SQS + Lambda** | `/api/qstash/*` は隔離済。`withRetry` 経由を維持 | 中 |
| Storage | Supabase Storage | **S3 + CloudFront** | storage ヘルパ裏に隠蔽。既存オブジェクト移送 + 署名 URL | 中 |
| rate limit | Upstash Redis | (当面**維持**) | Upstash は REST でクラウド非依存。急がない | — |

### Phase 2 — ホスティング移行 (2–4週間)

- Next.js 16 を **OpenNext/SST (Lambda+CloudFront)** か **ECS Fargate** へ。
- 検証必須: React Compiler / ISR / `proxy.ts` / CSP nonce ストリーミング / 画像最適化 (sharp)。
- `vercel.json` の `functions` (PDF 用 1GB/30–60s) は Fargate タスク or 専用 Lambda にマッピング。
- DNS カットオーバー。**この時点で Vercel を離脱**。DB はまだ Supabase。

### Phase 3 — DB / Auth 移行 (3–6週間, 最難関) ★推奨ルート

**書き直さない。Supabase スタックを AWS にセルフホストする。**

```
RDS for PostgreSQL (Multi-AZ)         ← データ本体 (RLS は PG ネイティブなので無改修で移行)
ECS Fargate 上に Supabase コンテナ群:
  ├─ GoTrue   (Auth: JWT / auth.uid() を温存 → RLS 無改修)
  ├─ PostgREST(supabase-js の .from() をそのまま受ける)
  ├─ Storage API (S3 バックエンド)
  ├─ Realtime (使用時のみ)
  └─ Kong (APIゲートウェイ)
```

- 利点: **アプリ側コードは原則ゼロ改修**。`NEXT_PUBLIC_SUPABASE_URL` を自前エンドポイントに
  差し替えるだけ。最難関を「書き直し」から「コンテナ運用」へ転換。
- データ移送: `pg_dump`/`pg_restore` or DMS。`auth` / `storage` スキーマ込み。
  読み取り専用ウィンドウでカットオーバー。
- 代償: GoTrue/PostgREST/Storage/Kong 用に **Fargate +$60–120/月** と運用責任 (パッチ/監視)。
- 対案 (非推奨): Cognito + 自前 API。RLS 述語と 475 route のデータ層を全面改修 →
  **+数ヶ月**。よほどの理由がなければ避ける。

### Phase 4 — 可観測性・最適化・DR (1–2週間)

- Sentry は**継続推奨** (CloudWatch/X-Ray より B2B SaaS の体験が良い)。
- WAF / GuardDuty / 監査ログ整備 (enterprise-readiness の布石)。
- **右サイジング後に** Savings Plans / RI を購入 (先に買うと無駄が出る)。
- `docs/disaster-recovery.md` を改訂: Supabase PITR → **RDS 自動バックアップ + PITR +
  Multi-AZ フェイルオーバ**へ読み替え。RTO/RPO の再検証。

### 工数・リスクまとめ

| Phase | 期間 | リスク | 離脱できる依存 |
|---|---|---|---|
| 0 計測 | 1週 | 低 | — |
| 1 周辺 | 2–3週 | 低–中 | Resend/SendGrid, QStash, Vercel Cron |
| 2 ホスティング | 2–4週 | 中 | **Vercel** |
| 3 DB/Auth (セルフホスト) | 3–6週 | **高** | **Supabase (マネージド)** |
| 4 最適化 | 1–2週 | 低 | — |
| **合計** | **10–16週** | — | — |

---

## 付録: 単価リファレンス (東京 ap-northeast-1, 2026-06 概算)

| サービス | 単価 |
|---|---|
| Fargate | $0.05056/vCPU-h, $0.005552/GB-h |
| RDS db.t4g.medium | ~$0.084/h (単一) / ~$0.168/h (Multi-AZ) |
| RDS db.t4g.large | ~$0.168/h (単一) / ~$0.336/h (Multi-AZ) |
| RDS gp3 ストレージ | $0.138/GB-mo |
| ElastiCache cache.t4g.micro | ~$0.022/h |
| ALB | $0.0243/h + $0.008/LCU-h |
| NAT Gateway | $0.062/h + $0.062/GB |
| S3 Standard | $0.025/GB-mo |
| CloudFront (日本 egress) | $0.114/GB + $0.0090/万 HTTPS req |
| SES | $0.10/1,000 通 (+ $0.12/GB 添付) |
| SQS | $0.40/100万 req |
| EventBridge Scheduler | $1.00/100万 起動 |
| Lambda (x86) | $0.20/100万 req + $0.0000166667/GB-s |
| Secrets Manager | $0.40/secret-mo + $0.05/万 API |
| CloudWatch Logs | $0.76/GB ingest + $0.033/GB-mo 保管 |
| AWS WAF | $5/ACL-mo + $1/rule-mo + $0.60/100万 req |

> ※ 確定見積りは [AWS Pricing Calculator](https://calculator.aws/) で。
> RI / Savings Plans / Compute Savings Plans の適用可否で 30–60% 変動する。
