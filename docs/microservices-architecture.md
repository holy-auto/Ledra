# Ledra マイクロサービス・アーキテクチャ設計

> 本書は、Ledra を**境界づけられたコンテキスト (bounded context)** の集合として
> 再定義し、サーバーレス基盤の現実に即した**進化的なサービス抽出戦略**を示す。
> `docs/architecture-roadmap.md` (モノリス肥大化への段階対策) の上位設計にあたり、
> 「いつ・どこを・どの順で切り出すか」の判断基準と、切り出し後の通信・データ・
> 可観測性・回復性パターンを規定する。
>
> 関連: `docs/architecture-roadmap.md` / `docs/slo.md` / `docs/operations-guide.md` /
> `docs/disaster-recovery.md` / `docs/parts-installation-integrity-design.md`

---

## 0. 設計原則 — 「分散モノリスを作らない」

Ledra は現在、**Next.js 16 (App Router) の単一デプロイ + Supabase (Postgres/Auth/
Storage) + Upstash (Redis/QStash)** という構成の、約 10 万行のモジュラーモノリスである
(`src/app/api` 配下に 490+ の Route Handler)。これは**欠陥ではなく、現段階では正しい
選択**である。マイクロサービス化はそれ自体が目的ではなく、以下のいずれかの圧力が
実測されたときにのみ正当化される。

| 抽出を正当化する圧力 | 計測指標 (SLI) | 閾値の目安 |
|---|---|---|
| デプロイ独立性の欠如 | 1 PR がブロックする他チームのリリース数 | 慢性的に発生 |
| スケール特性の乖離 | コンテキスト別の CPU/メモリ/同時実行プロファイル | 桁違いの乖離 |
| 障害ブラスト半径 | 1 コンテキストの障害が無関係機能を止める頻度 | 月次インシデント化 |
| データ整合性境界 | トランザクション境界をまたぐ更新の頻度 | 設計を歪めるほど |
| 規制・データ所在 | 損保データ/個人情報の分離要件 | 契約・法令で要求 |

**原則として、上記が観測されるまでコードは「モジュラーモノリス」に留める。**
ただし、後で安価に切り出せるよう、**今から境界を“縫い目 (seam)”として設計しておく**。
本書はその縫い目を定義する。これは Martin Fowler の "MonolithFirst" / Sam Newman の
"evolutionary decomposition" に沿った立場である。

> ⚠️ アンチパターン: Vercel サーバーレス上で Kubernetes/Istio/Kafka を前提にした
> 設計を急ぐと、ネットワーク越しの同期呼び出しが増えた**分散モノリス**になり、
> レイテンシ・障害モード・運用負荷がすべて悪化する。重量級基盤への移行は
> §7 のトリガー条件を満たした後のオプションとする。

---

## 1. ドメイン分析 — 境界づけられたコンテキスト

実コード (`src/app/api/*`, `src/lib/*`, `supabase/migrations/*`) のイベントストーミング
から、以下の bounded context を識別した。各コンテキストは**単一責任**と**集約
(aggregate)** を持ち、サービスごと DB (= Postgres schema 単位の論理分離) を志向する。

### コア・ドメイン (競争優位の源泉 — 自前で磨く)

| Context | 責務 | 集約ルート | 現在の実装位置 |
|---|---|---|---|
| **Certificate** (施工証明) | 証明書のライフサイクル (draft→active→void)、写真必須ガード、PDF 生成 | `certificates` | `api/certificates`, `lib/certificates/*`, `lib/pdfCertificate.tsx` |
| **Parts Integrity** (部品装着真正性) | 装着インジェスト→AI検査→納品書照合→確定署名→アンカー→顧客確認 | `part_installations` | `api/parts`, `lib/parts/*` |
| **Anchoring** (改ざん検知) | Polygon アンカリング + RFC3161 TSA、ハッシュ封緘 | `anchor_records` | `lib/anchoring/*`, `lib/parts/{tsa,rfc3161,anchorService}.ts` |
| **AI Automation** | 写真改ざん検知/不正スコア/膜厚異常などの構造化出力 + auto-action orchestrator | (ステートレス) | `lib/ai/*`, `lib/ai/automation/*` |

### サポート・ドメイン (堅実に作る)

| Context | 責務 | 集約ルート | 現在の実装位置 |
|---|---|---|---|
| **Insurer Cases** (損保案件) | 証明書発行をトリガに案件を起票、損保ユーザー向け共有 | `insurance_cases` | `api/insurer`, `lib/insurer/*` |
| **POS / Payments** | レジ開閉・決済 (現金/カード/QR)・レシート | `pos_sessions` | `api/admin/pos*`, `lib/pos/*` |
| **Billing** (課金) | プラン・Stripe サブスクリプション・ガード | `subscriptions` | `api/stripe`, `lib/billing/*` |
| **Customer Portal** | OTP ベースのマイページ認証、証明書閲覧 | (顧客 email) | `lib/customerPortal*.ts`, `api/customer` |
| **Vehicle Passport / Market** | 車両パスポート・中古車マーケット | `vehicles` | `api/passport`, `api/market`, `lib/{passport,market}/*` |

### 汎用ドメイン (買う/共通基盤化する)

| Context | 責務 | 現在の実装位置 |
|---|---|---|
| **Identity & Access** | テナント/ユーザー/ロール、RLS スコープ | `lib/supabase/admin` (`createTenantScopedAdmin`), Supabase Auth |
| **Notifications** | Email (Resend→SendGrid)、LINE、SMS (Twilio) | `lib/email/*`, `lib/line/*`, `lib/sms/*` |
| **Async/Eventing** | アウトボックス、QStash、cron worker | `lib/outbox/*`, `lib/qstash/*`, `api/cron`, `api/qstash` |
| **Observability** | 構造化ログ、Sentry、Healthchecks heartbeat | `lib/logger.ts`, `lib/observability/*` |

### コンテキストマップ (関係性)

```
                         ┌──────────────────────────┐
        (Conformist)     │   Identity & Access (UL)  │  ← Upstream / 共有カーネル
        全 context が依存 │   tenant_id / RLS scope    │
                         └────────────┬──────────────┘
                                      │
   ┌──────────────┐  cert.issued   ┌──┴───────────┐  case.created  ┌──────────────┐
   │  Certificate ├───────────────▶│ Async/Event  ├───────────────▶│ Insurer Cases│
   │  (core)      │   (outbox)     │  Backbone    │   (QStash)     │  (supporting)│
   └──────┬───────┘                └──────┬───────┘                └──────────────┘
          │ part.confirmed                │ *.* events
          ▼                               ├───────────────▶┌──────────────┐
   ┌──────────────┐  anchor.requested     │                │ Notifications│ (ACL)
   │ Parts        ├──────────────────────▶│                │  Email/LINE  │
   │ Integrity    │                       │                └──────────────┘
   └──────┬───────┘                       │
          │ hash.sealed                   └───────────────▶┌──────────────┐
          ▼                                                │ Observability│
   ┌──────────────┐                                        │ logs/traces  │
   │ Anchoring    │  (Polygon/TSA = 外部, Anti-Corruption  └──────────────┘
   │              │   Layer = lib/http/withRetry でラップ)
   └──────────────┘
```

- **Identity & Access** は全 context が従う共有カーネル / Upstream。`tenant_id` を
  境界の不変条件とし、`createTenantScopedAdmin(tenantId)` を唯一の越境ゲートとする
  (README セキュリティ §1 と一致)。
- 外部 SaaS (Stripe / Polygon / TSA / Square / LINE) はすべて **Anti-Corruption
  Layer** = `lib/http/withRetry.ts` 経由で隔離し、ドメインモデルに外部の都合を
  漏らさない。

---

## 2. 通信パターン — 既存資産を背骨にする

Ledra はすでにイベント駆動の背骨を持っている。**新しいブローカーを足す前に、
これらを「サービス間契約」として昇格させる**のが第一歩。

### 2.1 同期 (Request/Response)

- 現状: HTTP Route Handler (`api/*`)。コンテキスト間呼び出しは**同一プロセス内の
  関数呼び出し** (`lib/*`)。これがモノリスの最大の利点 — ネットワーク障害が無い。
- 抽出後: コンテキストを別デプロイにするときのみ HTTP/JSON (将来 gRPC) に昇格。
  **同期越境は「読み取り」と「強整合が要る書き込み」に限定**し、それ以外は §2.2 へ。
- 越境同期呼び出しは必ず `withRetry("<context>", ...)` でラップ
  (タイムアウト + 指数バックオフ + サーキットブレーカー)。

### 2.2 非同期 (イベント駆動) — 既存の二層アウトボックス

Ledra のアウトボックスは**二層**ある。役割を取り違えないこと。

| 層 | 実装 | 用途 | 配送 |
|---|---|---|---|
| **サーバー側 Transactional Outbox** | `lib/outbox/*` + `outbox_events` テーブル (`20260503000001_outbox_events.sql`) | DB 書き込みと同一トランザクション境界でイベントを残し、at-least-once 配送 | cron `/api/cron/outbox-flush` が `processOutboxBatch()` を回す |
| **クライアント側 Offline Outbox** | `lib/outbox/queue.ts` (IndexedDB) | 不安定 Wi-Fi 下で証明書発行等を止めない | 再接続時に `backgroundSync` がフラッシュ |
| **ジョブ・キュー** | `lib/qstash/publish.ts` (Upstash QStash) | fire-and-forget の重い処理 (案件起票, batch-pdf, polygon-backfill) | QStash → `api/qstash/*` worker、`public_id` 単位で dedup |

**サービス間イベントの正準経路**は「サーバー側 Transactional Outbox」とする。
ドメインの状態遷移の隣で `enqueueOutboxEvent(admin, { topic, aggregateId, payload })`
を呼び、配送は cron worker に委ねる (`lib/outbox/index.ts` の docstring と一致)。

#### イベント命名規約 (契約)

```
<context>.<aggregate>.<past-tense-fact>     例: certificate.certificate.issued
                                                parts.installation.confirmed
                                                insurer.case.created
                                                billing.subscription.canceled
```

- イベントは**過去形の事実 (fact)**。命令 (command) ではない。
- ペイロードは**自己完結**させ、受信側が送信側に問い合わせ直さない (chatty 回避)。
- スキーマは `zod` で定義し (`lib/validations/*` の流儀)、**後方互換のみ許可** (§4.4)。

### 2.3 Saga (分散トランザクションの代替)

部品装着インテグリティの確定フローは、すでに事実上の **オーケストレーション型
Saga** である (`docs/parts-installation-integrity-design.md`)。

```
装着インジェスト → AI検査 → 納品書OCR三方照合 → 確定署名(OTP+事業者署名+TSA)
                                                         → ブロックチェーン・アンカー
                                                         → 顧客LINE確認
   各ステップは補償可能: 署名失敗→draft差戻し / アンカー失敗→pending_anchor で再試行
```

抽出後もこのオーケストレーションは **Parts Integrity context が所有**し、各ステップを
イベント (`parts.*`) で進める。Anchoring の失敗は `pending_anchor` 状態 + cron 再試行で
**結果整合 (eventual consistency)** を担保する (二相コミットは使わない)。

### 2.4 通信パターンの使い分け (決定表)

| 状況 | パターン | 根拠 |
|---|---|---|
| 画面表示のための読み取り | 同期 HTTP (+ Redis キャッシュ) | 低レイテンシが要件 |
| 状態遷移の通知 (証明書発行→案件起票) | Transactional Outbox イベント | 疎結合・at-least-once |
| 重い後処理 (PDF/アンカー/バックフィル) | QStash ジョブ | リトライ保証・非同期 |
| 強整合が要る同一集約の更新 | 同一 DB トランザクション | 集約内は ACID を死守 |
| 集約をまたぐ業務プロセス | Saga (オーケストレーション) | 補償可能・2PC 回避 |

---

## 3. データ整合性戦略 — Database per Context (論理 → 物理)

### 3.1 段階的な所有権の確立

完全な「サービスごと DB」へ一足飛びには行かない。Postgres を活かしつつ所有権を固める。

1. **Phase A (現状〜): スキーマ規約による論理所有権**
   各 context のテーブルは「所有 context だけが書き込む」。他 context は**直接 SELECT
   せず**、所有 context が公開する read API / イベントを使う。RLS (`tenant_id`) は
   そのまま維持。**今すぐ守れるルールであり、抽出コストを将来へ前倒しで下げる。**
2. **Phase B: Postgres schema 分離**
   `certificate.*`, `parts.*`, `insurer.*` のように schema を分け、cross-schema の
   外部キーを禁止 (参照は `*_id` の論理参照 + イベント同期に置換)。
3. **Phase C: 物理分離 (トリガー条件成立時のみ)**
   損保データの所在要件やスケール乖離が実測されたら、その context だけ別 Supabase
   プロジェクト / 別 Postgres へ。`disaster-recovery.md` の PITR 方針を継承。

### 3.2 結果整合性とデータ同期

- 越境の読み取りが頻発する場合は **CQRS の read model** を受信側に持つ。
  例: Insurer ポータルの一覧は `certificate.issued` / `parts.confirmed` イベントを
  購読して自前の read table を更新 → 損保画面は Certificate context に同期問い合わせ
  しない。
- read model は**イベントから再構築可能**にしておく (リプレイ可能性)。
- 集約**内**は常に強整合 (単一トランザクション)。集約**間**は結果整合を既定とする。

### 3.3 冪等性 (Idempotency) — 既存規約の徹底

at-least-once 配送下では受信側の冪等性が必須。Ledra は既にこの規律を持つ:

- Stripe webhook: `stripe_processed_events` への claim、`23505` 以外の失敗は 503 で
  Stripe に再送させる (README セキュリティ §5)。
- QStash: `public_id` 単位 dedup (`lib/qstash/publish.ts`)。
- **新規イベント consumer も同じ規律**: `(topic, aggregate_id, event_id)` を
  processed テーブルに claim してから副作用を実行する。

### 3.4 TOCTOU / 越境書き込みの安全則 (README §2 を昇格)

`[id]` 動的ルートで「所有権 SELECT → 別 UPDATE」を書かない。検証フィルタを UPDATE 側
にコピーする (`api/insurer/cases/[id]/route.ts` が reference)。これは**サービス境界を
またいでも不変**の規約とする。

---

## 4. 回復性 (Resilience) — 既存の柱を契約化

| パターン | 実装 (既存) | サービス境界での扱い |
|---|---|---|
| **Circuit Breaker** | `lib/http/withRetry.ts` (per-key breaker) | 越境同期呼び出しは context 名を key にして必須適用 |
| **Retry + Backoff + Jitter** | 同上 (250→500→1000→2000ms) | 既定 4 attempts。冪等な呼び出しのみ |
| **Timeout** | `withRetry` の `signal` / per-attempt cap | 越境呼び出しは必ずタイムアウト設定 |
| **Bulkhead (隔離)** | Vercel function 単位の分離 | 重い処理は QStash worker に隔離し UI 経路を守る |
| **Rate Limiting** | `lib/api/rateLimit.ts` (Upstash, in-memory fallback) | context 公開 API ごとにプリセット |
| **Graceful Degradation** | `safeJson` / Resend→SendGrid フォールバック / Upstash 未設定時 fallback | 受信 context は送信側ダウン時に縮退動作 |
| **Health Check** | `api/health`, cron heartbeat (`lib/observability/healthchecks.ts`) | 各抽出サービスに `/health` (liveness) + `/ready` (readiness) を持たせる |
| **Dead Letter** | `outbox_events.status='dead_letter'` (SLO B3) | DLQ 監視 + 手動/自動リドライブ手順を runbook 化 |

> **重要**: Supabase Postgrest は pooler 側にリトライがあるため `withRetry` で
> **包まない** (README 運用 §外向き呼び出し)。この区別を抽出後も維持する。

---

## 5. 可観測性 (Observability) — 分散トレースへの橋渡し

### 5.1 既存資産

- **correlationId**: `proxy.ts` が全リクエストに `x-request-id` を採番・伝播し、
  レスポンスにも echo (README 運用)。**これは分散トレースの trace_id の前身**。
- **構造化ログ**: `lib/logger.ts`。`.child({ requestId, tenantId })` で context 付与、
  secret 自動マスク、JSON 一行で Vercel Log Drain と整合。
- **Sentry**: client/server/edge config。`lib/sentryContext.ts` で context 付与。
- **SLI/SLO**: `docs/slo.md` に A1/A2 (可用性), L1/L2 (レイテンシ), B1-B3 (webhook/
  cron/outbox), C1/C2 (OTP/PDF) を定義済み。

### 5.2 サービス境界に向けた拡張

1. **trace_id の正規化**: `x-request-id` を W3C `traceparent` に準拠させ、イベント
   ペイロードと QStash メッセージにも `trace_id` を載せる → 非同期境界を越えて
   1 本のトレースで追える (現状は同期経路のみ)。
2. **イベントの可観測性**: outbox の enqueue→deliver の各段で `trace_id` 付き構造化
   ログ。SLO B3 (outbox 24h 配送 99%) を context 別に分解。
3. **コンテキスト別 SLO**: §1 のコア context (Certificate/Parts/Anchoring) ごとに
   可用性・レイテンシ SLO を切り出し、Error Budget を独立管理 (`slo.md` の拡張)。
4. **RED メトリクス**: 各 context 公開 API の Rate / Errors / Duration を Sentry
   transaction (`op:http.server`) から context タグで集計。

---

## 6. デプロイ & サービスディスカバリ — サーバーレスの作法

| 項目 | サーバーレス現実解 (推奨) | 重量級基盤での対応 (将来) |
|---|---|---|
| **サービスディスカバリ** | 環境変数 + Vercel Edge Config による URL 解決 (DNS で十分) | Kubernetes Service / Istio |
| **デプロイ単位** | Vercel monorepo (Turborepo) の project 分割。context = project | k8s Deployment + HPA |
| **設定外部化** | `.env` + `lib/envValidation.ts` で起動時バリデーション | ConfigMap / Secret |
| **シークレット** | Vercel env (暗号化) + `.secrets-age.json` ローテーション監視 | External Secrets Operator |
| **プログレッシブ・デリバリ** | Vercel preview + skew protection + 段階トラフィック | Argo Rollouts / canary |
| **CI/CD** | 既存 GitHub Actions (`.github/`) + `lint:migrations` + `audit:retry` | GitOps (Argo CD) |

**抽出の物理的な第一歩は Turborepo 化** (`architecture-roadmap.md` Phase 2 と一致):
`@ledra/core` (共通) / `@ledra/ui` を抽出し、context を独立 Vercel project へ。
ネットワーク越しの再結線は最後で良い。

---

## 7. 重量級基盤 (Kubernetes / Istio / Kafka) への移行トリガー

以下が**実測で**満たされるまで、この道には進まない。早すぎる採用は純損失。

| トリガー | 具体例 | 移行先 |
|---|---|---|
| サーバーレス限界 | コールドスタート / 実行時間上限 / 同時実行課金が支配的コストに | k8s + HPA |
| トラフィック管理の高度化 | きめ細かい canary / mirror / fault injection が事業要件 | Istio (mTLS, traffic split) |
| イベント量・順序保証 | outbox/QStash で順序・スループットが破綻、ストリーム処理が必要 | Kafka / Redpanda |
| マルチリージョン強整合 | データ所在規制 + 低レイテンシの両立 | k8s マルチリージョン |
| ゼロトラスト要件 | 監査・契約で context 間 mTLS と認可ポリシーが必須 | Istio AuthorizationPolicy |

移行する場合の到達目標 (参考値): context 間 mTLS、分散トレース全経路、p99 < 100ms、
可用性 99.95%、自動ロールバック。**ただしこれは目的地ではなく、痛みが証明された
ときの選択肢である。**

---

## 8. 実行ロードマップ (architecture-roadmap.md への接続)

`architecture-roadmap.md` の Phase と整合させた、境界強化の順序。

| 優先 | アクション | 内容 | 既存ロードマップとの対応 |
|---|---|---|---|
| 1 | **境界の明文化** | 本書の context マップを各 `src/lib/<context>` の README/ドメイン境界として固定。越境 import を ESLint で検知 | 新規 (前提整備) |
| 2 | **イベント契約の昇格** | outbox topic 命名規約 (§2.2) を適用、`zod` スキーマ + 互換規約を整備 | roadmap §3 (Stripe webhook キュー化) と連携 |
| 3 | **CQRS read model** | Insurer ポータル一覧をイベント購読の read model 化 (越境同期 SELECT を排除) | roadmap §4 (キャッシュ戦略) |
| 4 | **trace_id 全経路化** | `x-request-id`→`traceparent`、イベント/QStash に伝播 | slo.md 残作業 (SLO 自動レポート) |
| 5 | **Turborepo 分割** | `@ledra/core` / `@ledra/ui` 抽出、context = Vercel project | roadmap §1 Phase 2/3 |
| 6 | **context 別 SLO** | コア 3 context の Error Budget 独立管理 | slo.md 拡張 |
| 7 | **DLQ runbook** | `outbox_events` dead_letter の監視・リドライブ手順 | operations-guide.md / SLO B3 |
| (gated) | 重量級基盤 | §7 トリガー成立時のみ | — |

---

## 9. マイクロサービス・アーキテクチャ・チェックリスト

本書時点での充足状況 (✅ 充足 / 🟡 部分 / ⬜ 未着手 = ロードマップ管理)。

- ✅ **サービス境界が定義されている** — §1 の bounded context マップ
- ✅ **通信パターンが確立** — 二層 outbox + QStash + 同期 HTTP (§2)
- ✅ **データ整合性戦略が明確** — 集約内 ACID / 集約間 eventual + Saga (§2.3, §3)
- 🟡 **サービスディスカバリ** — env/Edge Config で十分 (抽出時に明示化, §6)
- ✅ **サーキットブレーカー実装済** — `lib/http/withRetry.ts` (§4)
- 🟡 **分散トレース** — correlationId 同期経路は実装済、非同期境界が残課題 (§5.2)
- ✅ **監視・アラート準備** — Sentry + Healthchecks + SLO (§5, `slo.md`)
- ✅ **デプロイ自動化** — GitHub Actions + lint:migrations + audit:retry (§6)

> **結論**: Ledra はマイクロサービスの**運用前提 (回復性・可観測性・イベント駆動)**を
> すでに満たしている希少なモノリスである。よって正しい戦略は「今すぐ分割」ではなく、
> **境界を縫い目として固め、圧力が実測された context から安価に切り出す**進化的
> アプローチである。本書はその縫い目と判断基準を提供する。
