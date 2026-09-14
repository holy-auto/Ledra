# Ledra システム構成図

- 作成日: 2026-09-12（`date -u` 実行値）/ 対象コミット: `a7f5aab`（branch `main` 同内容）
- 記載原則: 図中の構成要素・件数はすべてこのリポジトリの実査由来。本番環境の設定値など
  リポジトリから確認できない事項は `【要確認】` と明記し、推測で埋めない。
- 関連: 文章版の現状マップは [`docs/implementation/current-architecture.md`](../implementation/current-architecture.md)、
  将来構想は [`docs/architecture-roadmap.md`](../architecture-roadmap.md) /
  [`docs/microservices-architecture.md`](../microservices-architecture.md)。
  本書は「いま動いているものを絵にする」ことだけを扱う。

計測値（2026-09-12 時点、コマンドは §7.3 に併記）:

| 対象 | 実値 |
|---|---|
| 画面（`page.tsx`） | 301 |
| API Route Handler（`route.ts`） | 649 |
| DB マイグレーション | 464 |
| RLS 有効テーブル | 246 |
| cron ジョブ | 35 |
| ユニットテストファイル | 562 |

---

## 1. 概要 — システム全体の俯瞰

誰が、どの入口から、どの中心処理に触るかだけを描く。詳細は §2 以降。

```mermaid
flowchart LR
  subgraph USERS["利用者"]
    STAFF["加盟店スタッフ<br/>整備・板金・洗車・販売"]
    OWNER["車両オーナー<br/>一般顧客"]
    INSURER["保険会社"]
    MAKER["メーカー / 代理店"]
    ANYONE["第三者<br/>中古車購入検討者・査定"]
  end

  subgraph SURFACES["接点（UI / 端末）"]
    WEB["Web アプリ<br/>Next.js App Router"]
    MOBILE["モバイルアプリ<br/>Expo / React Native"]
    PUBLIC["公開ページ<br/>/c /v /sign /track"]
    API["外部公開 API<br/>/api/v1/*"]
  end

  CORE["Ledra コア<br/>案件 → 作業記録 → 証明書 → 真正性証跡"]

  subgraph DATA["データ・証跡"]
    DB[("Supabase Postgres<br/>RLS 246 テーブル")]
    OBJ[("Supabase Storage<br/>写真・PDF")]
    CHAIN["Polygon / TSA / C2PA<br/>改ざん検知アンカー"]
  end

  STAFF --> WEB
  STAFF --> MOBILE
  OWNER --> PUBLIC
  INSURER --> WEB
  MAKER --> WEB
  ANYONE --> PUBLIC
  INSURER --> API

  WEB --> CORE
  MOBILE --> CORE
  PUBLIC --> CORE
  API --> CORE

  CORE --> DB
  CORE --> OBJ
  CORE --> CHAIN
```

**この図が言いたいこと**: Ledra は「1つの業務アプリ」ではなく、
*同じ作業記録を、立場の違う4種類の相手に、それぞれの権限で見せる*システムである。
中心にあるのは案件（`reservations`）と、そこから生まれる証明書（`certificates`）と写真。
それ以外はすべて、その周りの入口と出口にすぎない。

---

## 2. モジュール定義 — 機能単位のブロック

`src/lib/` 配下のドメインモジュール（直下 105 ディレクトリ）を、責務で9群に束ねたもの。
括弧内は代表的な実装パス。

```mermaid
flowchart TB
  subgraph L1["① 入口・認可層"]
    PROXY["proxy.ts<br/>CSP nonce / CSRF / レート制限<br/>セッション更新・未ログイン遮断"]
    AUTHZ["認可<br/>resolveCallerWithRole<br/>Role 5段 + Permission 58種<br/>src/lib/auth/"]
    PLAN["プラン制御<br/>free/starter/standard/pro<br/>src/lib/billing/planFeatures.ts"]
  end

  subgraph L2["② 業務コア"]
    RES["案件・予約・工程<br/>src/lib/reservations, workflow"]
    CERT["証明書発行<br/>src/lib/certificates"]
    VEH["車両・顧客マスタ<br/>src/lib/vehicles, customers"]
    PASS["車両パスポート・履歴<br/>src/lib/passport, vehicleReport"]
    PARTS["部品装着証明<br/>src/lib/parts"]
    BODY["板金・PPF・コーティング<br/>src/lib/bodyRepair, ppf"]
  end

  subgraph L3["③ 真正性・暗号"]
    ANCH["アンカリング<br/>canonical digest → Polygon<br/>src/lib/anchoring"]
    PHOTO["写真真正性<br/>SHA-256 / 知覚ハッシュ / EXIF<br/>撮影 nonce / TSA / C2PA"]
    SIGN["電子署名・パスキー<br/>src/lib/webauthn, signature"]
    ZKP["ZKP 選択的開示<br/>src/lib/zkp"]
  end

  subgraph L4["④ 金銭"]
    BILL["請求・売掛元帳<br/>src/lib/invoice, billing"]
    PAY["決済 Stripe / Square<br/>src/lib/payment, stripe, pos"]
    ACC["会計連携 freee / MF<br/>src/lib/accounting"]
  end

  subgraph L5["⑤ AI 自動化"]
    AI["Claude 構造化出力<br/>下書き生成・OCR・写真判定<br/>src/lib/ai（直下 62 ファイル）"]
    CAP["コスト上限ブレーキ<br/>src/lib/ai/costCap.ts"]
  end

  subgraph L6["⑥ 配信・通知"]
    NOTIF["通知<br/>メール / SMS / LINE / Push<br/>src/lib/notifications"]
    OUTBOX["Outbox イベント<br/>src/lib/outbox → 外向き webhook"]
  end

  subgraph L7["⑦ 証跡・監査"]
    AUDIT["監査ログ<br/>audit_logs / admin_audit_logs<br/>vehicle_histories"]
    RET["保持期限・削除<br/>cron/data-retention"]
  end

  subgraph L8["⑧ 外部連携"]
    INTEG["連携カタログ 9種<br/>Slack / LINE / メール取込 / GCal<br/>freee / MF / Stripe / Square / NexPTG"]
    V1["外部公開 API v1<br/>tenant_api_keys + スコープ"]
  end

  subgraph L9["⑨ 基盤"]
    SB["Supabase クライアント<br/>スコープ付きファクトリのみ許可"]
    RL["Upstash Redis<br/>レート制限・冪等性"]
    QS["QStash<br/>非同期ジョブ投入"]
    OBS["監視 Sentry / PostHog"]
  end

  L1 --> L2
  L2 --> L3
  L2 --> L4
  L2 --> L5
  L2 --> L6
  L2 --> L7
  L2 --> L8
  L2 --> L9
```

**分割の原則**（読むとき／足すときの判断基準）:

1. **業務コアの中心は外部 SDK を直接知らない。** `reservations` / `certificates` /
   `vehicles` / `customers` / `workflow` は Stripe・viem・ethers を1件も import していない
   （検証: `grep -rn 'from "stripe"\|from "viem"\|from "ethers"' src/lib/{reservations,certificates,vehicles,customers,workflow}` → 0件）。
   ただし**全体の原則ではない**。これらの SDK を直接 import している lib 群は
   `stripe` / `billing` / `orders` / `agents` / `pos` / `anchoring` / `passport` /
   `academy` / `template-options` の9つで、うち `orders` と `agents` は業務寄りの
   モジュールでありながら Stripe を直接触っている。決済手段の差し替えコストは
   一様ではない、というのが実態。
2. **真正性（③）は業務を止めない。** TSA も C2PA も既定 OFF・fail-open で、
   失敗しても写真の保存は続行し `authenticity_grade` を下げる形で*正直に degrade* する。
3. **状態語彙は1箇所。** Job / Step / Severity / Certificate / Payment / Sync の6軸は
   `src/lib/domain/states.ts` が単一定義源（ADR-0002）。

---

## 3. モジュールの関係 — データと処理の流れ

### 3.1 主系統: 作業記録が証明書と証跡になるまで

Ledra の存在理由そのものの流れ。ここが壊れると事業が壊れる。

```mermaid
sequenceDiagram
    autonumber
    participant S as スタッフ<br/>Web / モバイル
    participant P as proxy.ts<br/>Edge
    participant A as API Route Handler
    participant AI as Claude API
    participant DB as Postgres + RLS
    participant ST as Storage
    participant AN as アンカリング
    participant C as 公開ページ /c/[public_id]

    S->>P: 作業開始・写真撮影
    P->>P: CSP nonce / CSRF / レート制限
    P->>A: 認証済みリクエスト
    A->>A: resolveCallerWithRole<br/>Role + Permission + プラン判定
    A->>ST: 写真アップロード
    A->>A: SHA-256 + 知覚ハッシュ + EXIF 処理<br/>撮影 nonce の単回消費
    A-->>AN: RFC3161 TSA / C2PA 署名（任意・失敗時は等級を下げる）
    A->>DB: certificate_images + authenticity_grade
    A->>AI: 証明書ドラフト生成（構造化出力）
    AI-->>A: 下書き（人が必ず確認・修正）
    S->>A: 確定（finalize）
    A->>A: WebAuthn 操作署名ゲート<br/>チャレンジを原子的に消費
    A->>DB: certificates.status = active（追記のみ・訂正は版で残す）
    A->>DB: outbox_events へ発行イベント
    A->>AN: canonical digest（PII 非含有を型で保証）
    AN->>AN: certificate_anchors: queued → batched → anchored
    AN-->>C: 公開検証material
    C-->>S: 顧客・第三者がURL/QRで検証
```

**設計上の要点**:

- **AI は下書きまで。確定は人の操作に紐づく。** finalize 直前に WebAuthn の
  操作署名ゲート（ログイン用の生体認証ではなく、*その操作*への署名）が入る。
- **証跡は追記のみ。** 発行済み証明書は書き換えず、訂正は版として積む（ADR-0003 / 0004）。
- **アンカーは非同期。** 即時 Polygon 送信と Merkle バッチの2経路があり、
  cron（`anchor-batch` / `polygon-signer`）が拾う。発行体験はチェーンの遅延に巻き込まれない。

### 3.2 非同期系統: cron と Outbox

同期処理に混ぜると業務を止めるものは、すべてここに逃がしてある。

```mermaid
flowchart LR
  subgraph TRIG["起動元"]
    VC["Vercel Cron<br/>35 ジョブ"]
    QSI["QStash<br/>8 コールバック"]
  end

  subgraph JOBS["主な定期ジョブ"]
    OF["outbox-flush<br/>毎分"]
    AB["anchor-batch / polygon-signer<br/>parts-anchor"]
    BI["billing / monthly-invoices<br/>cycle-invoices / passport-billing"]
    NO["reservation-reminders / follow-up<br/>flow-nudges / daily-digest"]
    SY["square-sync / gcal-sync<br/>accounting-sync"]
    DR["data-retention<br/>cleanup-insurer-logs"]
    MON["monitor / stripe-event-monitor<br/>insurer-sla-alerts"]
  end

  subgraph SINK["出口"]
    HOOK["tenant_webhooks<br/>外向き配信"]
    MAIL["Resend →（5xx/429 時）SendGrid"]
    LINE["LINE Messaging API"]
    SMS["Twilio SMS"]
    SLACK["Slack Incoming Webhook"]
    CHAIN2["Polygon"]
    ALERT["Sentry / Healthchecks.io"]
  end

  VC --> OF & AB & BI & NO & SY & DR & MON
  QSI --> SY & AB

  OF --> HOOK
  NO --> MAIL & LINE & SMS
  AB --> CHAIN2
  MON --> ALERT & SLACK
  DR --> ALERT
```

- cron 認証は `CRON_SECRET` の HMAC または Bearer（`src/lib/cronAuth.ts`）。
  多重起動は `cron_locks` で抑止する。
- **`data-retention` だけは不可逆**。保持期限で実データを削除するため、
  設定変更は復元不能な削除に直結する（§7.2 のリスク台帳）。

### 3.3 テナント分離（マルチテナントの効かせ方）

```mermaid
flowchart TB
  REQ["リクエスト"] --> G1
  G1["① Edge: proxy.ts<br/>未ログインを login へ / AAL2 ステップアップ"] --> G2
  G2["② アプリ層: resolveCallerWithRole<br/>Role 5段 + Permission 58種 + プラン4段"] --> G3
  G3["③ DB 層: RLS 246 テーブル<br/>my_tenant_ids / tenant_caller_has_role"] --> OK["データ"]

  ESLINT["ESLint によるアーキテクチャガード<br/>admin クライアントの直接 import を error<br/>createTenantScopedAdmin 等のみ許可"] -.強制.-> G3
```

3層とも独立に効く。アプリ層のガードを1本書き忘れても、DB 層の RLS が最後に止める。
逆に言えば **RLS のポリシー変更は全テナントに即時波及する**ため、最も慎重を要する。

---

## 4. ハードウェア・ネットワーク配置

物理的にどこで動くか。国内リージョンに寄せてある。

```mermaid
flowchart TB
  subgraph FIELD["現場（出張作業・店舗）"]
    PC["PC ブラウザ<br/>PWA / IndexedDB outbox / Service Worker"]
    PHONE["iOS / Android<br/>Expo アプリ"]
    T2P["Tap to Pay 端末<br/>Stripe Terminal"]
    NFC["NFC タグ<br/>車両ひも付け"]
    BAR["バーコード / QR<br/>@zxing"]
    GAUGE["膜厚計 NexPTG"]
    SQ["Square POS"]
  end

  subgraph EDGE["エッジ"]
    CDN["Vercel Edge Network<br/>静的配信 + proxy.ts"]
  end

  subgraph TOKYO["東京リージョン hnd1"]
    FN["Vercel Serverless Functions<br/>Route Handler 649<br/>PDF/画像処理は memory 1024 / maxDuration 30-60s"]
    CRON2["Vercel Cron 35"]
  end

  subgraph MANAGED["マネージドサービス"]
    SUPA[("Supabase<br/>Postgres / Storage / Auth<br/>リージョンは【要確認】")]
    RO[("読み取りレプリカ<br/>任意・未設定なら主系")]
    UP["Upstash Redis / QStash"]
    KMS["AWS KMS<br/>ap-northeast-1<br/>署名鍵"]
  end

  subgraph EXT["外部ネットワーク"]
    POLY["Polygon RPC"]
    TSA2["RFC3161 TSA 局<br/>国内 JIPDEC 認定局"]
    IPFS["IPFS / Pinata<br/>任意"]
    SAAS["Stripe / Square / LINE / Resend<br/>SendGrid / Twilio / Google Calendar<br/>freee / MoneyForward / Anthropic"]
  end

  PC --> CDN
  PHONE --> CDN
  T2P -. Bluetooth/内蔵NFC .-> PHONE
  NFC -. 近接 .-> PHONE
  BAR -. カメラ .-> PHONE
  GAUGE -. 連携API .-> FN
  SQ -. Webhook .-> FN

  CDN --> FN
  CRON2 --> FN
  FN --> SUPA
  FN --> RO
  FN --> UP
  FN --> KMS
  FN --> POLY
  FN --> TSA2
  FN --> IPFS
  FN --> SAAS
```

**現場に効く設計**:

- 出張作業は電波が保証されない。Web は IndexedDB の outbox キュー + Service Worker で
  オフライン投入を受け、復帰時に送る。**モバイルアプリ側の同期キューは未実装**
  （オフライン検知バナーのみ）。
- 競合（同一レコードの同時更新）の検出・解決機構は Web / モバイルどちらにも無い。
- Vercel の関数は東京（`hnd1`）固定。PDF 生成・画像アップロードのみ個別に
  メモリと実行時間を引き上げてある（`vercel.json`）。

---

## 5. インタフェース

### 5.1 入ってくる側

| 種別 | 経路 | 認証 | 件数 |
|---|---|---|---|
| 画面（Server Component） | `src/app/**/page.tsx` | Supabase Auth / 顧客は独自 cookie | 301 |
| 内部 API | `src/app/api/**/route.ts` | `resolveCallerWithRole` + Permission | 649 |
| 外部公開 API | `/api/v1/*`（ingest 3種 / 事故照合 / パスポート検証 等） | `tenant_api_keys` + スコープ | 7 |
| Webhook 受信 | Stripe、Stripe Connect、Square、Resend、LINE、供給パートナー、受信メール、動画プロバイダ | 署名検証 + 重複排除 | 13 |
| QStash コールバック | `/api/qstash/*` | QStash 署名 | 8 |
| cron | `/api/cron/*` | `CRON_SECRET` HMAC / Bearer | 35 |
| 公開検証 | `/api/cert-verify/[public_id]`、`/api/public/verify` | 無認証・PII 非返却 | 2 |

### 5.2 出ていく側

| 相手 | 用途 | 失敗時の扱い |
|---|---|---|
| Supabase Postgres / Storage | 主データ・写真・PDF | 業務停止（必須依存） |
| Upstash Redis | レート制限・冪等性 | env で fail-open / fail-closed を選択 |
| Upstash QStash | 非同期ジョブ | リトライ後 dead letter |
| Stripe | サブスク・Connect・Terminal | 冪等 claim（`stripe_processed_events`） |
| Square | POS 売上同期 | cron で再同期 |
| Anthropic Claude | 下書き・OCR・判定 | テナント月次コスト上限で自動停止 |
| Polygon | 証明書メタのアンカー | `certificate_anchors.status = failed` で再試行 |
| AWS KMS | 署名鍵の保管 | 署名不可（発行は継続、等級が下がる） |
| RFC3161 TSA | 写真のタイムスタンプ | 未設定なら no-op（fail-open） |
| Resend → SendGrid | メール | 一次が 5xx/429 なら自動フォールバック |
| Twilio / LINE | SMS・メッセージ | 通知欠落（業務は継続） |
| Google Calendar / freee / MoneyForward | 予定・会計同期 | cron で再同期 |
| `tenant_webhooks` | 加盟店の自社システムへ配信 | Outbox が再送 |
| Sentry / PostHog / Healthchecks.io | 監視 | 監視欠落のみ |

### 5.3 データストアの境界

| ストア | 持つもの | 境界の引き方 |
|---|---|---|
| Postgres | 案件・証明書・顧客・車両・請求・監査（`create table` ユニーク名 約260） | RLS 246 テーブル。テナント跨ぎは `my_tenant_ids()` のみ |
| Storage | 証明書写真、PDF、資料、LINE メディア | バケット単位（`certificates` / `assets` / `market` / `market-vehicle-images` / `agent-materials` / `agent-shared-files` / `line-media`）+ 署名付き URL |
| Redis | レート制限カウンタ、冪等キー（24h） | 揮発。消えても正しさは壊れない設計 |
| IndexedDB（端末内） | オフライン投入キュー、読み取りキャッシュ | 端末ローカル。送信成功で破棄 |
| Polygon | 証明書メタのダイジェストのみ | **PII は型で除外**。チェーン上に個人情報は乗らない |

---

## 6. 図に書ききれなかった前提

1. **図の「線」はすべて HTTPS**。社内 VPN も専用線も無い。認証は各線で個別に成立する
   （エッジの一括ゲートに頼り切らない）。
2. **`middleware.ts` は無い。実体は `src/proxy.ts`**（Next.js 16 の命名）。
   文章版の現状マップ（2026-08-19 監査）は「エッジ一括ゲート無し」と書いているが、
   現在の `proxy.ts` は CSRF・CSP nonce・レート制限・セッション更新・未ログイン遮断・
   AAL2 ステップアップまで担っている。**本書の記述が新しい。**
3. **状態はすべて `text` + CHECK 制約**。Postgres の enum 型は 0 件。
   新しい状態値を足す PR は `src/lib/domain/states.ts` と
   `src/lib/domain/__tests__/` を同一 PR で更新しない限りマージしない（ADR-0002）。
4. **真正性機能の既定は OFF**。`CERT_RECORD_ANCHOR_ENABLED=false` が既定で、
   TSA / C2PA も env 未設定なら no-op。**本番環境で実際にどのフラグが ON かは
   リポジトリからは確認できない【要確認】**。
5. **C2PA は本番署名証明書が未取得**。コードは実装・検証済みで、残ブロッカーは
   証明書の取得のみ（`docs/c2pa-production-deployment.md`）。
6. **DB マイグレーションは main への push で本番へ自動適用される**
   （`.github/workflows/db-migrate.yml`）。図の Postgres は「CI が触れる本番」である。
7. **i18n は実質未適用**。`messages/ja.json` / `en.json` の中身は `errors.*` 8キーのみで、
   画面は日本語ハードコード。多言語の箱はあるが中身はこれから。
8. **E2E は CI から外してある**（実 Supabase / Redis / Stripe 依存）。図の検証経路は
   ユニットテスト 562 ファイルと型検査が支えている。

---

## 7. 付録

### 7.1 この図の読み方（更新するとき）

- ①概要 → ②モジュール → ③関係 → ④配置 → ⑤インタフェース の順で粒度が細かくなる。
  変更を入れるときは、**影響する最も粗い図から**直す。②だけ直して①が古いままになるのが
  いちばん事故る。
- 件数は必ず §7.3 のコマンドで取り直す。「前回 240 だったから今回も 240 くらい」で書かない。

### 7.2 触ると戻れない場所（抜粋）

| 領域 | 不可逆性 |
|---|---|
| マイグレーション | main への push で本番適用。適用済みファイルの書き換え禁止 |
| 証明書・写真の証跡 | ハッシュ・TSA・アンカーは改ざん検知に使用中。既存行の再エンコードは検証を壊す |
| RLS | ポリシー変更は全テナント即時波及 |
| 売掛元帳 `payment_entries` | 差額追記型。遡及修正不可 |
| `cron/data-retention` | 保持期限で実データを削除。復元不能 |
| 保険会社への PII 開示 | `is_pii_disclosed()` ゲート + アクセスログ。変更は法令・契約影響 |

### 7.3 計測コマンド

```bash
find src/app -name page.tsx | wc -l                    # 301
find src/app/api -name route.ts | wc -l                # 649
ls supabase/migrations/*.sql | wc -l                   # 464
grep -rhoiE 'alter table [^ ]+ enable row level security' supabase/migrations \
  | awk '{print tolower($3)}' | sed 's/^public\.//' | sort -u | wc -l   # 246
grep -o '/api/cron/[a-z-]*' vercel.json | sort -u | wc -l              # 35
git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx' | wc -l            # 562
find src/lib -mindepth 1 -maxdepth 1 -type d | wc -l                    # 105
find src/lib/ai -maxdepth 1 -name '*.ts' | wc -l                       # 62
grep -oE '"[a-z_]+:[a-z_]+"' src/lib/auth/permissions.ts | sort -u | wc -l  # 58
```

> **RLS の数え方に注意**: 正規化せずに `awk '{print $3}' | sort -u` とすると **251** になる。
> 同じテーブルが `public.customers` と `customers` の両表記で書かれた migration が5件あり、
> 別テーブルとして二重計上されるため。`docs/implementation/current-architecture.md` の
> 「240」も同じ未正規化コマンド由来で、実数より多い可能性がある。
> 数える前に、**その正規表現が何を1件と見なしているか**を確認すること。
