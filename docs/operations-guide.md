# CARTRUST 総合オペレーションガイド

> 対象: 運営チーム・開発者・カスタマーサポート
> 最終更新: 2026-03-27

---

## 目次

1. [システム全体像](#1-システム全体像)
2. [ポータル別機能一覧](#2-ポータル別機能一覧)
3. [アカウント発行・オンボーディング](#3-アカウント発行オンボーディング)
4. [Admin ポータル（加盟店管理画面）](#4-admin-ポータル加盟店管理画面)
5. [Insurer ポータル（保険会社）](#5-insurer-ポータル保険会社)
6. [Agent ポータル（代理店）](#6-agent-ポータル代理店)
7. [Customer ポータル（エンドユーザー）](#7-customer-ポータルエンドユーザー)
8. [Market（中古車マーケット）](#8-market中古車マーケット)
9. [Mobile アプリ](#9-mobile-アプリ)
10. [DB ステータス一覧・状態遷移](#10-db-ステータス一覧状態遷移)
11. [帳票システム](#11-帳票システム)
12. [受発注システム（B2B）](#12-受発注システムb2b)
13. [決済・課金システム](#13-決済課金システム)
14. [テンプレートオプション運用](#14-テンプレートオプション運用)
15. [POS / レジシステム](#15-pos--レジシステム)
16. [NFC タグ管理](#16-nfc-タグ管理)
17. [権限・ロール体系](#17-権限ロール体系)
18. [Cron / 自動処理](#18-cron--自動処理)
19. [外部連携](#19-外部連携)
20. [エスカレーション基準](#20-エスカレーション基準)

---

## 1. システム全体像

### アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                    CARTRUST SaaS                     │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│  Admin   │ Insurer  │  Agent   │ Customer │ Market  │
│ Portal   │ Portal   │ Portal   │ Portal   │         │
├──────────┴──────────┴──────────┴──────────┴─────────┤
│              Next.js 16 + React 19                   │
│              API Routes (181 endpoints)               │
├─────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL + Auth + Storage + Realtime)   │
│  RLS (Row Level Security) による完全テナント分離       │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│  Stripe  │ LINE     │ GCal     │ Square   │ Resend  │
│ 決済/課金 │メッセージ │カレンダー │ POS連携  │ メール   │
└──────────┴──────────┴──────────┴──────────┴─────────┘
```

### ユーザー種別

| ユーザー種別 | ポータル | 説明 |
|---|---|---|
| 加盟店（テナント） | `/admin/*` | 施工店・ディーラー。証明書発行・帳票・POS等を使用 |
| 保険会社 | `/insurer/*` | 証明書の検索・閲覧・監査ログ |
| 代理店（エージェント） | `/agent/*` | 加盟店の紹介・コミッション管理 |
| エンドユーザー（顧客） | `/customer/*` | 自分の証明書を閲覧 |
| マーケット利用者 | `/market/*` | 中古車売買 |
| プラットフォーム管理者 | `/admin/platform/*` | CARTRUST運営。テンプレート管理・全体統計 |

---

## 2. ポータル別機能一覧

### Admin ポータル（加盟店向け）

| 機能 | パス | 概要 |
|---|---|---|
| ダッシュボード | `/admin` | KPI・統計サマリー |
| 証明書管理 | `/admin/certificates` | 発行・一覧・無効化・PDF出力 |
| 車両管理 | `/admin/vehicles` | 車両登録・履歴管理 |
| 顧客管理 | `/admin/customers` | 顧客DB・CRM |
| 帳票管理 | `/admin/documents` | 見積書〜請求書（8種類）の作成・管理 |
| 予約管理 | `/admin/reservations` | 来店予約・施工スケジュール |
| 受発注 | `/admin/orders` | B2B受発注（他テナントとの取引） |
| POS/レジ | `/admin/pos` | レジ管理・精算 |
| 入金管理 | `/admin/payments` | 入金記録・返金処理 |
| NFC管理 | `/admin/nfc` | NFCタグの登録・追跡 |
| メニュー管理 | `/admin/menu-items` | サービスメニュー・単価設定 |
| 店舗管理 | `/admin/stores` | 店舗情報・スタッフ配置 |
| メンバー管理 | `/admin/members` | チームメンバー招待・権限設定 |
| 設定 | `/admin/settings` | テナント情報・ロゴ・銀行口座等 |
| 課金管理 | `/admin/billing` | プラン変更・Stripe請求 |
| ヒアリング | `/admin/hearings` | 施工前ヒアリングシート |
| お知らせ | `/admin/announcements` | 運営からのお知らせ閲覧 |
| ニュース | `/admin/news` | 業界ニュース |
| KPI分析 | `/admin/management-kpi` | 経営管理KPI |
| 価格統計 | `/admin/price-stats` | 施工価格の統計 |
| 監査ログ | `/admin/audit` | 操作履歴 |

### Insurer ポータル（保険会社向け）

| 機能 | パス | 概要 |
|---|---|---|
| 証明書検索 | `/insurer/certificates` | 車台番号・ナンバー等で証明書検索 |
| CSV/PDFエクスポート | `/insurer/export` | 検索結果のダウンロード（pro以上） |
| ユーザー管理 | `/insurer/users` | 保険会社内スタッフ管理 |
| 課金管理 | `/insurer/billing` | プラン変更・Stripe請求 |
| オンボーディング | `/insurer/onboarding` | 初回セットアップウィザード |

### Agent ポータル（代理店向け）

| 機能 | パス | 概要 |
|---|---|---|
| ダッシュボード | `/agent` | KPI・紹介数・コミッション概要 |
| 紹介管理 | `/agent/referrals` | 紹介案件の一覧・進捗 |
| コミッション | `/agent/commissions` | コミッション明細・支払い状況 |
| キャンペーン | `/agent/campaigns` | 営業キャンペーン情報 |
| ランキング | `/agent/rankings` | 代理店成績ランキング |
| レポート | `/agent/reports` | 月次レポート |
| お知らせ | `/agent/announcements` | 本部からのお知らせ |
| FAQ/研修 | `/agent/faq`, `/agent/training` | ナレッジベース |
| 営業資料 | `/agent/materials` | 販促資料ダウンロード |
| サポート | `/agent/support` | サポートチケット |
| メンバー管理 | `/agent/members` | 代理店内スタッフ管理 |
| 設定 | `/agent/settings` | 代理店プロフィール・Stripe Connect |

### Customer ポータル（エンドユーザー向け）

| 機能 | パス | 概要 |
|---|---|---|
| 証明書一覧 | `/customer` | 自分の証明書を閲覧 |
| 公開証明書 | `/c/[public_id]` | 公開URLで証明書を確認（認証不要） |

### Market（中古車マーケット）

| 機能 | パス | 概要 |
|---|---|---|
| 車両一覧 | `/market` | 出品中の車両一覧 |
| 問い合わせ | `/market/inquiries` | 売り手への問い合わせ |
| 商談管理 | `/market/deals` | 成約までの交渉管理 |

---

## 3. アカウント発行・オンボーディング

### 3.1 テナント（加盟店）アカウント発行

```
[新規加盟店]
  │
  ├→ POST /api/signup
  │   ├ 入力: email, password, shop_name, display_name, contact_phone
  │   ├ バリデーション: 必須項目チェック
  │   │
  │   ├→ Supabase Auth ユーザー作成 (email_confirm: true)
  │   ├→ tenants レコード作成
  │   │   ├ name: shop_name
  │   │   ├ slug: 自動生成
  │   │   ├ plan_tier: "free"（初期値）
  │   │   └ is_active: true
  │   ├→ tenant_memberships 作成
  │   │   ├ role: "owner"
  │   │   └ user_id + tenant_id
  │   │
  │   └→ 失敗時: ユーザー + テナント削除（ロールバック）
  │
  ├→ メール認証（Supabase Auth 標準フロー）
  │
  └→ ログイン → /admin ダッシュボード
```

**DB初期状態:**
- `tenants.plan_tier` = `"free"`
- `tenants.is_active` = `true`
- `tenant_memberships.role` = `"owner"`

**プラン一覧（テナント）:**

| プラン | 値 | 説明 |
|---|---|---|
| free | `"free"` | 無料。基本機能のみ |
| starter | `"starter"` | 有料エントリー |
| standard | `"standard"` | 標準プラン |
| pro | `"pro"` | 全機能開放 |

### 3.2 保険会社（Insurer）アカウント発行

```
[新規保険会社]
  │
  ├→ POST /api/join/send-code
  │   └ メールアドレスにOTPコード送信
  │
  ├→ POST /api/join/verify-code
  │   └ OTPコード検証
  │
  ├→ POST /api/join (本登録)
  │   ├ 入力:
  │   │   ├ email, password
  │   │   ├ company_name, contact_person, phone
  │   │   ├ corporate_number（法人番号: 13桁）
  │   │   ├ address, representative_name
  │   │   ├ requested_plan, business_type
  │   │   └ terms_accepted: true（必須）
  │   │
  │   ├ バリデーション:
  │   │   ├ レート制限: 3リクエスト/600秒
  │   │   ├ 法人番号フォーマット（13桁）
  │   │   └ 法人番号重複チェック
  │   │
  │   ├→ Supabase Auth ユーザー作成
  │   ├→ RPC create_insurer_for_user 呼出（アトミック）
  │   │   ├ insurers レコード作成
  │   │   ├ insurer_users レコード作成 (role: "admin")
  │   │   └ plan_tier: requested_plan
  │   │
  │   └→ 失敗時: Auth ユーザー削除（ロールバック）
  │
  ├→ POST /api/insurer/onboarding (オンボーディング完了)
  │   └ onboarding_completed_at = now()
  │
  └→ /insurer ダッシュボード
```

**オンボーディングチェックリスト (GET /api/insurer/onboarding):**

| チェック項目 | 判定条件 |
|---|---|
| profile_complete | name && contact_email が設定済 |
| contact_info | contact_phone が設定済 |
| plan_selected | plan_tier が "basic" 以外 |
| completed_at | onboarding_completed_at が存在 |

**DB初期状態:**
- `insurers.plan_tier` = 申請時の `requested_plan`
- `insurers.is_active` = `true`
- `insurer_users.role` = `"admin"`
- ステータス = `"active_pending_review"`（オンボーディング完了まで読取専用）

**保険会社プラン一覧:**

| プラン | 値 | max_users | CSV/PDF | API |
|---|---|---|---|---|
| basic | `"basic"` | 3 | 不可 | 不可 |
| pro | `"pro"` | 20 | 可 | 不可 |
| enterprise | `"enterprise"` | 9999 | 可 | 可 |

### 3.3 代理店（Agent）アカウント発行

```
[CARTRUST運営]
  │
  ├→ プラットフォーム管理画面から代理店を作成
  │   ├ agents レコード作成 (status: "active_pending_review")
  │   └ agent_users レコード作成 (role: "admin")
  │       └ RPC upsert_agent_user (メールで既存ユーザーを検索 or 招待)
  │
  ├→ 代理店管理者がログイン
  │   └ /agent ダッシュボード
  │
  ├→ Stripe Connect オンボーディング
  │   ├ POST /api/agent/stripe-connect
  │   └ stripe_onboarding_done = true
  │
  └→ 運営が審査 → status: "active" に変更
```

**DB初期状態:**
- `agents.status` = `"active_pending_review"`
- `agents.stripe_onboarding_done` = `false`
- `agent_users.role` = `"admin"`

### 3.4 顧客ポータル認証

```
[エンドユーザー]
  │
  ├→ 証明書のメールアドレス + 電話番号下4桁でOTP送信
  │   └ customer_login_codes テーブルにコードハッシュ保存
  │
  ├→ OTPコード入力・検証
  │   ├ attempts 上限チェック
  │   └ expires_at 有効期限チェック
  │
  ├→ customer_sessions 作成
  │   ├ session_hash でセッション管理
  │   └ expires_at で有効期限設定
  │
  └→ /customer ポータル表示
```

**認証はパスワードレス（OTP方式）。Supabase Auth とは別の独自セッション管理。**

### 3.5 メンバー追加フロー（テナント / 保険会社 / 代理店 共通パターン）

```
[管理者]
  │
  ├→ メンバー管理画面でメールアドレスを入力
  │
  ├→ RPC upsert_*_user
  │   ├ 既存ユーザー → メンバーシップレコード追加
  │   └ 新規ユーザー → 招待メール送信 → ユーザー作成 → メンバーシップ追加
  │
  └→ ロール設定
      ├ テナント: owner / admin / staff / viewer
      ├ 保険会社: admin / viewer / auditor
      └ 代理店: admin / staff / viewer
```

---

## 4. Admin ポータル（加盟店管理画面）

### 4.1 証明書ライフサイクル

```
┌──────────┐    作成     ┌──────────┐   モバイル   ┌──────────┐
│          │───────────→│          │ activate  │          │
│  (なし)  │            │  draft   │──────────→│  active  │
│          │            │  下書き   │            │   有効   │
└──────────┘            └──────────┘            └────┬─────┘
                              │                      │
                              │                      │ void（理由必須）
                         Admin直接作成               │
                         (status:active)             ▼
                              │               ┌──────────┐
                              └──────────────→│   void   │
                                              │   無効   │
                                              └──────────┘

                                              ┌──────────┐
                                              │ expired  │  ← Cron自動
                                              │ 期限切れ  │    (expiry_date超過)
                                              └──────────┘
```

**ステータス一覧:**

| ステータス | DB値 | Badge | 説明 |
|---|---|---|---|
| 有効 | `active` | success(緑) | 発行済み・有効な証明書 |
| 無効 | `void` | danger(赤) | 無効化済み（void_reason必須） |
| 下書き | `draft` | default(グレー) | 未発行。モバイルで activate 可能 |
| 期限切れ | `expired` | warning(黄) | 有効期限超過 |

**作成フロー（API）:**

1. `POST /api/certificates/create`
   - 必須: `tenant_id`, `customer_name`, `customer_phone_last4`
   - 任意: `vehicle_info_json`, `content_free_text`, `content_preset_json`, `expiry_type`, `expiry_value`, `logo_asset_path`, `footer_variant`
   - `public_id` が自動生成 → 公開URL `/c/{public_id}` でアクセス可能
   - 監査ログ: `certificate_issued` が記録

**無効化フロー:**
- Admin: `POST /api/admin/certificates/void` → status を `void` に変更
- Mobile: `POST /api/mobile/certificates/[id]/void` → `void_reason` 必須
- 監査ログ: `certificate_voided` が記録

**PDF出力:**
- `GET /api/certificate/pdf/[id]` — 単体PDF
- `GET /api/admin/certificates` — 一括ZIP出力（pro プラン）

### 4.2 車両管理

```
車両登録 → 証明書に紐付け → 施工履歴(vehicle_histories)に記録
               ↓
         NFC タグ貼付
               ↓
         公開証明書に QR コード掲載
```

**vehicle_histories テーブル:** 施工記録を車両に紐付けて蓄積。`certificate_id` で証明書と連携。

### 4.3 顧客管理

| フィールド | 説明 |
|---|---|
| name, name_kana | 氏名・フリガナ |
| email, phone | 連絡先 |
| postal_code, address | 住所 |
| note | 備考 |

顧客は `certificates`, `documents`, `reservations`, `payments` の各テーブルから参照される。

### 4.4 予約管理（予約→来店→施工→完了）

```
┌───────────┐  checkin  ┌───────────┐  start   ┌─────────────┐  complete ┌───────────┐
│ confirmed │─────────→│  arrived  │────────→│ in_progress │─────────→│ completed │
│  予約確定  │          │   来店    │          │   施工中     │          │   完了    │
└─────┬─────┘          └───────────┘          └─────────────┘          └───────────┘
      │
      │ cancel（随時可能）
      ▼
┌───────────┐
│ cancelled │
│  キャンセル │
└───────────┘
```

**ステータス遷移ルール:**
- `confirmed` → `arrived`（checkin API）
- `arrived` → `in_progress`（start API）
- `in_progress` → `completed`（complete API）
- 任意のステータス → `cancelled`（cancel_reason 必須）

**予約データ:**
- `scheduled_date`, `start_time`, `end_time` — 施工予定日時
- `menu_items_json` — 施工メニュー（JSONで複数対応）
- `estimated_amount` — 見積金額
- `assigned_user_id` — 担当スタッフ
- `store_id` — 店舗

### 4.5 ヒアリングシート

施工前に顧客情報・車両情報・要望を記録するチェックシート。

**ステータス:**
- `draft` — 作成中
- `completed` — ヒアリング完了
- `linked` — 予約or証明書と紐付け済

**サービス種別（service_type）:**
- `coating` / `ppf` / `maintenance` / `body_repair` / `wrapping` / `window_film` / `other`

**車両サイズ（vehicle_size）:**
- `SS` / `S` / `M` / `L` / `LL` / `XL`

---

## 5. Insurer ポータル（保険会社）

### 5.1 全体フロー

```
[保険会社]
  │
  ├→ アカウント登録 (/join)
  │   └ status: active_pending_review（読取専用モード）
  │
  ├→ オンボーディング完了
  │   └ プロフィール入力 → プラン選択 → 完了
  │   └ status → active（全機能利用可能）
  │
  ├→ 証明書検索
  │   ├ GET /api/insurer/certificate — 証明書検索
  │   ├ GET /api/insurer/search — 詳細検索
  │   └ RPC insurer_search_certificates() 呼出
  │       └ insurer_tenant_contracts で契約テナントのみ検索可能
  │
  ├→ 証明書閲覧
  │   ├ RPC insurer_get_certificate() 呼出
  │   └ insurer_access_logs に監査ログ自動記録
  │       └ insurer_id, user_id, certificate_id, action, ip, user_agent
  │
  ├→ エクスポート（pro / enterprise のみ）
  │   ├ GET /api/insurer/export — CSV一括
  │   ├ GET /api/insurer/export-one — 単体CSV
  │   └ GET /api/insurer/pdf-one — 単体PDF
  │
  └→ ユーザー管理
      ├ GET/POST /api/insurer/users
      └ RPC upsert_insurer_user
```

### 5.2 ステータスによる挙動制御

| ステータス | DB値 | 検索 | 閲覧 | エクスポート | ユーザー管理 | 課金変更 |
|---|---|---|---|---|---|---|
| 仮登録 | `active_pending_review` | 可 | 可 | 不可 | 不可 | 不可 |
| 有効 | `active` | 可 | 可 | プラン依存 | 可 | 可 |
| 停止 | `suspended` | 不可 | 不可 | 不可 | 不可 | 不可 |

**`isReadOnly()` 関数:** `status === "active_pending_review"` の場合、書き込み系API全てが403を返す。

### 5.3 プラン別機能ゲート

| 機能 | basic | pro | enterprise |
|---|---|---|---|
| 証明書検索 | o | o | o |
| 証明書閲覧 | o | o | o |
| CSVエクスポート | x | o | o |
| PDFエクスポート | x | o | o |
| 一括ユーザーインポート | x | o | o |
| API直接アクセス | x | x | o |
| 最大ユーザー数 | 3名 | 20名 | 無制限 |

### 5.4 監査ログ（insurer_access_logs）

保険会社による証明書アクセスは全件記録される:

| フィールド | 内容 |
|---|---|
| insurer_id | 保険会社ID |
| insurer_user_id | 操作ユーザーID |
| certificate_id | 閲覧した証明書ID |
| action | 操作種別（search / view / export） |
| meta | 検索条件等のJSON |
| ip | IPアドレス |
| user_agent | ブラウザ情報 |

### 5.5 テナント契約（insurer_tenant_contracts）

保険会社は契約関係にあるテナントの証明書のみ検索可能。

| ステータス | DB値 | 説明 |
|---|---|---|
| 有効 | `active` | 証明書検索・閲覧可能 |
| 停止 | `suspended` | 一時停止中 |
| 終了 | `terminated` | 契約終了 |

---

## 6. Agent ポータル（代理店）

### 6.1 全体フロー

```
[代理店アカウント作成]
  │ status: active_pending_review
  │
  ├→ Stripe Connect オンボーディング
  │   └ POST /api/agent/stripe-connect
  │   └ stripe_onboarding_done = true
  │
  ├→ 運営審査 → status: active
  │
  ├→ 紹介コード発行
  │   └ agent_referrals.referral_code（ユニーク）
  │
  ├→ 加盟店紹介
  │   └ 紹介ステータス遷移（下記参照）
  │
  ├→ コミッション発生
  │   └ 紹介テナントの利用料に基づき計算
  │   └ Stripe Connect で自動振込
  │
  └→ ダッシュボードでKPI確認
      └ RPC agent_dashboard_stats()
```

### 6.2 代理店ステータス

```
┌───────────────────────┐   運営審査OK   ┌──────────┐
│ active_pending_review │──────────────→│  active  │
│       仮登録          │               │   有効    │
└───────────────────────┘               └────┬─────┘
                                             │
                                             │ 違反/停止措置
                                             ▼
                                        ┌──────────┐
                                        │suspended │
                                        │   停止    │
                                        └──────────┘
```

| ステータス | DB値 | Badge | 説明 |
|---|---|---|---|
| 仮登録 | `active_pending_review` | warning(黄) | 審査待ち。機能制限あり |
| 有効 | `active` | success(緑) | 全機能利用可能 |
| 停止 | `suspended` | danger(赤) | アカウント停止。全機能不可 |

### 6.3 紹介（Referral）ステータス遷移

```
┌─────────┐  連絡  ┌───────────┐  商談  ┌────────────────┐  試用  ┌─────────┐  契約  ┌────────────┐
│ pending │──────→│ contacted │─────→│ in_negotiation │─────→│  trial  │─────→│ contracted │
│ 審査待ち │      │  連絡済み  │       │     商談中      │       │トライアル│      │  契約成立   │
└────┬────┘      └─────┬─────┘       └───────┬────────┘       └────┬────┘      └────────────┘
     │                 │                      │                     │
     │                 │                      │                     │
     ▼                 ▼                      ▼                     ▼
┌───────────┐                                                ┌──────────┐
│ cancelled │  ←──── いずれのステータスからもキャンセル可能  ──→│  churned │
│キャンセル  │                                                │   解約   │
└───────────┘                                                └──────────┘
```

| ステータス | DB値 | Badge | 説明 |
|---|---|---|---|
| 審査待ち | `pending` | default(グレー) | 紹介登録直後 |
| 連絡済み | `contacted` | info(青) | 紹介先に連絡済 |
| 商談中 | `in_negotiation` | violet(紫) | 商談進行中 |
| トライアル | `trial` | warning(黄) | 試用期間中 |
| 契約成立 | `contracted` | success(緑) | 正式契約。コミッション発生開始 |
| キャンセル | `cancelled` | default(グレー) | 紹介取消 |
| 解約 | `churned` | danger(赤) | 契約後に解約 |

### 6.4 コミッション（Commission）ステータス

```
┌──────────┐  承認  ┌──────────┐  支払  ┌──────────┐
│ pending  │──────→│ approved │─────→│   paid   │
│  未払い   │      │  承認済み  │       │支払い済み │
└────┬─────┘      └────┬─────┘       └──────────┘
     │                 │
     ▼                 ▼
┌───────────┐    ┌──────────┐
│ cancelled │    │  failed  │
│キャンセル  │    │支払い失敗 │
└───────────┘    └──────────┘
```

**コミッション計算:**
- `commission_type: "percentage"` → `base_amount * commission_rate / 100`
- `commission_type: "fixed"` → `commission_fixed`（固定額）
- `period_start` / `period_end` で期間指定
- Stripe Connect (`stripe_transfer_id`) で自動振込

---

## 7. Customer ポータル（エンドユーザー）

### 7.1 認証フロー

```
[エンドユーザー]
  │
  ├→ メールアドレス + 電話番号下4桁を入力
  │
  ├→ OTPコード送信 → customer_login_codes に保存
  │   ├ code_hash: ハッシュ化されたコード
  │   ├ attempts: 試行回数
  │   └ expires_at: 有効期限
  │
  ├→ OTP検証
  │   ├ 試行回数上限チェック
  │   ├ 有効期限チェック
  │   └ used_at を記録（ワンタイム使用）
  │
  ├→ セッション作成 → customer_sessions
  │   ├ session_hash でクッキー管理
  │   └ expires_at で自動期限切れ
  │
  └→ 自分の証明書一覧を閲覧
```

### 7.2 公開証明書ページ

`/c/[public_id]` — 認証不要。QRコードやNFCからアクセス。
- `GET /api/c/[public_id]` で証明書データ取得
- `GET /api/certificate/public-status/[public_id]` でステータスのみ取得

---

## 8. Market（中古車マーケット）

### 8.1 車両出品フロー

```
┌──────────┐  出品  ┌──────────┐  予約  ┌──────────┐  成約  ┌──────────┐
│  draft   │──────→│  listed  │─────→│ reserved │─────→│   sold   │
│  下書き   │      │   出品中  │       │  商談中   │       │   成約   │
└──────────┘      └────┬─────┘       └──────────┘       └──────────┘
                       │
                       │ 取り下げ
                       ▼
                  ┌───────────┐
                  │ withdrawn │
                  │  取り下げ  │
                  └───────────┘
```

| ステータス | DB値 | 説明 |
|---|---|---|
| 下書き | `draft` | 出品準備中 |
| 出品中 | `listed` | マーケットに公開。listed_at記録 |
| 商談中 | `reserved` | 購入希望者あり |
| 成約 | `sold` | 売買成立。sold_at, sold_price, buyer_info記録 |
| 取り下げ | `withdrawn` | 出品取消 |

### 8.2 問い合わせ（Inquiry）フロー

```
┌──────────┐  返信  ┌───────────┐  商談  ┌────────────────┐  終了  ┌──────────┐
│   new    │──────→│ responded │─────→│ in_negotiation │─────→│  closed  │
│  新規    │      │  返信済み  │       │     商談中      │       │  終了    │
└──────────┘      └───────────┘       └────────────────┘       └──────────┘
```

### 8.3 商談（Deal）フロー

```
┌──────────────┐  合意  ┌──────────┐  完了  ┌───────────┐
│ negotiating  │──────→│  agreed  │─────→│ completed │
│    交渉中     │      │  合意    │       │   完了    │
└──────┬───────┘      └──────────┘       └───────────┘
       │
       │ 破談
       ▼
  ┌───────────┐
  │ cancelled │
  │  キャンセル │
  └───────────┘
```

### 8.4 顧客興味（Vehicle Interests）

CRM機能。顧客の車両への関心度を追跡。

| フィールド | 値 |
|---|---|
| interest_level | `hot` / `warm` / `cold` |
| status | `active` / `converted`（成約） / `lost`（失注） |
| follow_up_date | フォローアップ予定日 |

---

## 9. Mobile アプリ

### 9.1 モバイル専用機能

| 機能 | API | 説明 |
|---|---|---|
| 証明書管理 | `/api/mobile/certificates` | 一覧・詳細閲覧 |
| 証明書有効化 | `/api/mobile/certificates/[id]/activate` | draft → active |
| 証明書無効化 | `/api/mobile/certificates/[id]/void` | active → void (理由必須) |
| NFC書き込み | `/api/mobile/nfc/[id]/write` | prepared → written |
| NFC貼付 | `/api/mobile/nfc/[id]/attach` | written → attached |
| POS | `/api/mobile/pos` | モバイルレジ |
| 予約チェックイン | `/api/mobile/reservations/[id]/checkin` | confirmed → arrived |
| 施工開始 | `/api/mobile/reservations/[id]/start` | arrived → in_progress |
| 施工完了 | `/api/mobile/reservations/[id]/complete` | in_progress → completed |
| 進捗管理 | `/api/mobile/progress` | 施工進捗の更新 |
| プッシュ通知 | `/api/mobile/push` | プッシュ通知登録 |

**認証:** Bearer Token（Authorization ヘッダー）→ `mobileAuth.ts` で検証

---

## 10. DB ステータス一覧・状態遷移

### 全ステータスマスター

#### certificates.status

| 値 | 日本語 | Badge | 遷移元 | 遷移先 |
|---|---|---|---|---|
| `draft` | 下書き | default(グレー) | — | `active` |
| `active` | 有効 | success(緑) | `draft`, 直接作成 | `void`, `expired` |
| `void` | 無効 | danger(赤) | `active` | —（終端） |
| `expired` | 期限切れ | warning(黄) | `active`（Cron自動） | —（終端） |

#### nfc_tags.status

| 値 | 日本語 | Badge | 遷移元 | 遷移先 |
|---|---|---|---|---|
| `prepared` | 準備済 | default(グレー) | — | `written` |
| `written` | 書込済 | info(青) | `prepared` | `attached` |
| `attached` | 貼付済 | success(緑) | `written` | `lost`, `retired` |
| `lost` | 紛失 | warning(黄) | `attached` | — |
| `retired` | 廃止 | default(グレー) | 任意 | —（ソフト削除） |
| `error` | エラー | danger(赤) | 任意 | — |

#### documents.status

| 値 | 日本語 | Badge | 遷移元 | 遷移先 |
|---|---|---|---|---|
| `draft` | 下書き | default(グレー) | — | `sent` |
| `sent` | 送付済 | info(青) | `draft` | `accepted`, `paid`, `rejected`, `cancelled` |
| `accepted` | 受理済 | success(緑) | `sent` | `paid`, `cancelled` |
| `paid` | 入金済 | success(緑) | `sent`, `accepted` | —（終端） |
| `rejected` | 却下 | danger(赤) | `sent` | —（終端） |
| `cancelled` | キャンセル | default(グレー) | `sent`, `accepted` | —（終端） |

**Cron自動処理:**
- `sent` かつ `due_date < today` → 表示上 `overdue`（期限超過）としてバッジ表示

#### documents.doc_type

| 値 | 日本語 | プレフィックス | 色 |
|---|---|---|---|
| `estimate` | 見積書 | EST | info(青) |
| `delivery` | 納品書 | DLV | success(緑) |
| `purchase_order` | 発注書 | PO | warning(黄) |
| `order_confirmation` | 発注請書 | OC | warning(黄) |
| `inspection` | 検収書 | INS | success(緑) |
| `receipt` | 領収書 | RCP | success(緑) |
| `invoice` | 請求書 | INV | danger(赤) |
| `consolidated_invoice` | 合算請求書 | CINV | danger(赤) |

#### invoices.status（レガシー）

| 値 | 日本語 | Badge |
|---|---|---|
| `draft` | 下書き | default(グレー) |
| `sent` | 送付済 | info(青) |
| `paid` | 入金済 | success(緑) |
| `overdue` | 期限超過 | warning(黄) |
| `cancelled` | 取消 | default(グレー) |

#### payments.status

| 値 | 日本語 | Badge | 説明 |
|---|---|---|---|
| `completed` | 完了 | success(緑) | 入金完了 |
| `refunded` | 返金済 | danger(赤) | 全額返金 |
| `partial_refund` | 一部返金 | warning(黄) | 一部返金 |
| `voided` | 取消 | default(グレー) | 決済取消 |

#### payments.payment_method

| 値 | 日本語 |
|---|---|
| `cash` | 現金 |
| `card` | カード |
| `qr` | QR決済 |
| `bank_transfer` | 銀行振込 |
| `other` | その他 |

#### reservations.status

| 値 | 日本語 | 遷移元 | 遷移先 |
|---|---|---|---|
| `confirmed` | 予約確定 | — | `arrived`, `cancelled` |
| `arrived` | 来店 | `confirmed` | `in_progress` |
| `in_progress` | 施工中 | `arrived` | `completed` |
| `completed` | 完了 | `in_progress` | — |
| `cancelled` | キャンセル | 任意 | — |

#### reservations.payment_status（会計ステータス）

| 値 | 日本語 | Badge |
|---|---|---|
| `unpaid` | 未会計 | default(グレー) |
| `paid` | 会計済 | success(緑) |
| `partial` | 一部入金 | warning(黄) |
| `refunded` | 返金済 | danger(赤) |

#### job_orders.status（受発注）

| 値 | 日本語 | 遷移元 | 遷移先 |
|---|---|---|---|
| `pending` | 申請中 | — | `accepted`, `rejected`, `cancelled` |
| `accepted` | 受注 | `pending` | `in_progress`, `cancelled` |
| `in_progress` | 作業中 | `accepted` | `completed`, `cancelled` |
| `completed` | 完了 | `in_progress` | — |
| `rejected` | 辞退 | `pending` | — |
| `cancelled` | 取消 | `pending`, `accepted` | — |

**拡張予定（order-system-redesign-plan.md）:**
- `quoting` — 見積中
- `approval_pending` — 検収待ち
- `payment_pending` — 支払待ち

#### register_sessions.status

| 値 | 日本語 | 説明 |
|---|---|---|
| `open` | 営業中 | レジ精算開始。opening_cash記録 |
| `closed` | 精算済 | レジ精算完了。closing_cash, cash_difference記録 |

#### agents.status

| 値 | 日本語 | Badge |
|---|---|---|
| `active_pending_review` | 仮登録 | warning(黄) |
| `active` | 有効 | success(緑) |
| `suspended` | 停止 | danger(赤) |

#### agent_referrals.status

| 値 | 日本語 | Badge |
|---|---|---|
| `pending` | 審査待ち | default(グレー) |
| `contacted` | 連絡済み | info(青) |
| `in_negotiation` | 商談中 | violet(紫) |
| `trial` | トライアル中 | warning(黄) |
| `contracted` | 契約成立 | success(緑) |
| `cancelled` | キャンセル | default(グレー) |
| `churned` | 解約 | danger(赤) |

#### agent_commissions.status

| 値 | 日本語 | Badge |
|---|---|---|
| `pending` | 未払い | default(グレー) |
| `approved` | 承認済み | info(青) |
| `paid` | 支払い済み | success(緑) |
| `failed` | 支払い失敗 | danger(赤) |
| `cancelled` | キャンセル | default(グレー) |

#### insurer_tenant_contracts.status

| 値 | 日本語 | 説明 |
|---|---|---|
| `active` | 有効 | 証明書検索可 |
| `suspended` | 停止 | 一時停止 |
| `terminated` | 終了 | 契約終了 |

#### market_vehicles.status

| 値 | 日本語 |
|---|---|
| `draft` | 下書き |
| `listed` | 出品中 |
| `reserved` | 商談中 |
| `sold` | 成約 |
| `withdrawn` | 取り下げ |

#### market_inquiries.status

| 値 | 日本語 |
|---|---|
| `new` | 新規 |
| `responded` | 返信済み |
| `in_negotiation` | 商談中 |
| `closed` | 終了 |

#### market_deals.status

| 値 | 日本語 |
|---|---|
| `negotiating` | 交渉中 |
| `agreed` | 合意 |
| `completed` | 完了 |
| `cancelled` | キャンセル |

#### hearings.status

| 値 | 日本語 |
|---|---|
| `draft` | 作成中 |
| `completed` | 完了 |
| `linked` | 紐付け済 |

#### template_orders.status（テンプレートオプション）

| 値 | 日本語 | 説明 |
|---|---|---|
| `pending_payment` | 支払い待ち | 申込直後 |
| `paid` | 支払い済 | Stripe決済完了 |
| `hearing` | ヒアリング中 | 要件確認中 |
| `in_production` | 制作中 | デザイン制作中 |
| `review` | レビュー中 | テナント確認待ち |
| `revision` | 修正中 | フィードバック対応 |
| `test_issued` | テスト発行済 | テスト証明書確認中 |
| `approved` | 承認済 | テナント承認完了 |
| `active` | 稼働中 | 本番利用中 |
| `suspended` | 停止中 | 一時停止 |
| `cancelled` | キャンセル | 取消 |

#### option_subscriptions.status

| 値 | 日本語 |
|---|---|
| `active` | 有効 |
| `past_due` | 支払い遅延 |
| `cancelled` | 解約 |
| `suspended` | 停止 |

---

## 11. 帳票システム

### 11.1 帳票種別と業務フロー

```
見積書(EST) → 発注書(PO) → 発注請書(OC) → 納品書(DLV) → 検収書(INS) → 請求書(INV) → 領収書(RCP)
                                                                          ↓
                                                                    合算請求書(CINV)
```

**典型的なB2B取引フロー:**

```
1. [発注側] 見積書(estimate)作成 → status: draft → sent
2. [受注側] 見積確認 → 発注書(purchase_order)作成
3. [受注側] 発注請書(order_confirmation)作成
4. [受注側] 施工完了 → 納品書(delivery)作成
5. [発注側] 検収完了 → 検収書(inspection)作成
6. [受注側] 請求書(invoice)作成 → sent → paid
7. [受注側] 入金確認 → 領収書(receipt)作成
```

### 11.2 帳票番号の自動採番

フォーマット: `{PREFIX}-{YYYYMM}-{NNN}`

例:
- `EST-202603-001`（見積書）
- `INV-202603-015`（請求書）

月別・種別ごとに連番がインクリメント。

### 11.3 帳票データ構造

| フィールド | 説明 |
|---|---|
| doc_type | 帳票種別（8種類） |
| doc_number | 帳票番号（自動採番） |
| customer_id / customer_name | 顧客情報 |
| vehicle_id / vehicle_info_json | 車両情報 |
| items_json | 明細行（配列）: description, quantity, unit, unit_price, amount, tax_category |
| subtotal / tax / total | 金額計算 |
| tax_rate | 消費税率（10% or 8%軽減税率） |
| is_invoice_compliant | インボイス制度対応 |
| show_seal / show_logo / show_bank_info | PDF表示オプション |
| source_document_id | 元帳票ID（見積→請求の紐付け等） |
| due_date | 支払期限 |

### 11.4 ステータス遷移（再掲・詳細）

```
draft ──→ sent ──→ accepted ──→ paid (終端)
               ├──→ paid (直接)
               ├──→ rejected (終端)
               └──→ cancelled
          accepted ──→ cancelled
```

**禁止遷移:**
- `paid` → 他のステータスへの遷移不可（終端）
- `rejected` → 他のステータスへの遷移不可（終端）
- `cancelled` → 他のステータスへの遷移不可（終端）
- `draft` → `paid`（直接の支払い不可。送付を経る必要あり）

---

## 12. 受発注システム（B2B）

### 12.1 概要

テナント間のB2B受発注管理。`job_orders` テーブルで管理。

### 12.2 ステータスフロー

```
         ┌────────── rejected（辞退）
         │
pending ──┤
(申請中)  │
         └──→ accepted ──→ in_progress ──→ completed
              (受注)       (作業中)        (完了)
               │             │
               └──→ cancelled（取消）
                             │
              pending ──→ cancelled（発注側が取消）
```

**拡張計画（未実装）:**

```
pending → quoting → accepted → in_progress → approval_pending → payment_pending → completed
                                                     ↑                ↑
                                               受注側が完了報告   発注側が検収承認
```

### 12.3 関連テーブル連携

```
job_orders
  ├→ documents (job_order_id FK) — 見積書・請求書等を紐付け
  ├→ payments (job_order_id FK) — 支払い記録を紐付け
  ├→ chat_messages — ジョブ単位のチャット
  ├→ order_audit_log — 監査ログ
  ├→ order_reviews — 相互評価
  └→ notifications — 通知
```

### 12.4 監査ログ（order_audit_log）

| フィールド | 説明 |
|---|---|
| job_order_id | 対象受発注 |
| actor_user_id | 操作ユーザー |
| actor_tenant_id | 操作テナント |
| action | 操作種別: status_changed, amount_set, payment_confirmed, cancelled 等 |
| old_value / new_value | 変更前後のJSON |

### 12.5 CARTRUSTの差別化

**施工証明書 + 受発注 + 車両履歴のトレーサビリティチェーン:**

```
発注作成 → 帳票（見積→発注→検収→請求）→ 施工完了 → 証明書発行 → vehicles.histories に記録
```

---

## 13. 決済・課金システム

### 13.1 Stripe 統合

| 機能 | API | 説明 |
|---|---|---|
| サブスクリプション | `/api/stripe/checkout` | テナント/保険会社のプラン課金 |
| Stripe Connect | `/api/stripe/connect` | 代理店へのコミッション振込 |
| 請求ポータル | `/api/stripe/portal` | 顧客が課金情報を自己管理 |
| Webhook | `/api/stripe/webhook` | 決済イベント受信 |

### 13.2 テナントプラン

| プラン | 月額 | 機能 |
|---|---|---|
| free | ¥0 | 基本機能 |
| starter | 有料 | ロゴ・テンプレート |
| standard | 有料 | CSV出力・複数店舗 |
| pro | 有料 | 全機能（API含む） |

### 13.3 入金管理フロー

```
[施工完了]
  │
  ├→ 帳票作成（請求書 or 領収書）
  │
  ├→ 入金記録（POST /api/admin/payments）
  │   ├ payment_method: cash / card / qr / bank_transfer / other
  │   ├ amount, received_amount, change_amount
  │   ├ register_session_id（レジ紐付け）
  │   └ status: completed
  │
  ├→ 返金処理
  │   ├ refund_amount, refund_reason
  │   └ status: refunded / partial_refund
  │
  └→ 取消
      └ status: voided
```

---

## 14. テンプレートオプション運用

### 14.1 A（ブランド証明書ライト）— セルフサービス

```
[加盟店] 申込・決済 → テンプレ選択 → 設定入力 → プレビュー → テスト発行 → 利用開始
```

運営側作業は基本なし。問い合わせ時のみ対応。

### 14.2 B（ブランド証明書プレミアム）— 受託制作

```
Step 1: 申込受付 → pending_payment → paid（Stripe決済完了）
Step 2: ヒアリング確認 → hearing（1営業日以内）
Step 3: 制作着手 → in_production（5営業日）
Step 4: 初稿レビュー → review（3営業日）
Step 5: 修正 → revision → review（3営業日、max_revisions上限あり）
Step 6: テスト発行 → test_issued
Step 7: 承認・公開 → approved → active（月額¥4,400課金開始）
```

### 14.3 追加作業

| 作業種別 | 金額 | 目安工数 |
|---|---|---|
| 文言修正 | ¥5,500 | 0.5h |
| 文言修正（複数箇所） | ¥8,800 | 1h |
| レイアウト調整（軽微） | ¥11,000 | 1h |
| レイアウト調整（中規模） | ¥22,000 | 2h |
| QR/URL差し替え | ¥3,300 | 0.5h |
| テンプレート追加（既製ベース） | ¥33,000 | 3h |
| テンプレート追加（オリジナル） | ¥55,000 | 5h |
| 大幅再設計 | 別見積 | 要ヒアリング |

---

## 15. POS / レジシステム

### 15.1 構造

```
stores（店舗）
  └→ registers（レジ端末）
       └→ register_sessions（精算セッション）
            └→ payments（入金記録）
```

### 15.2 レジセッションフロー

```
[開店] register_session 作成
  ├ opened_by: スタッフID
  ├ opening_cash: 釣銭準備金
  └ status: open
      │
      ├→ 入金処理（payments 作成）
      │   └ register_session_id で紐付け
      │
      └→ [閉店] レジ精算
          ├ closed_by: スタッフID
          ├ closing_cash: 実際の現金
          ├ expected_cash: 計算上の現金
          ├ cash_difference: 過不足
          ├ total_sales: 売上合計
          ├ total_transactions: 取引件数
          └ status: closed
```

### 15.3 Square POS連携

`/api/webhooks/square/` で Square からの決済イベントを受信。
`/api/cron/square-sync/` で定期同期。

---

## 16. NFC タグ管理

### 16.1 ライフサイクル

```
[登録]         [モバイルで書込]    [車両に貼付]
prepared ────→ written ─────────→ attached
                                      │
                              ┌───────┼────────┐
                              ▼       ▼        ▼
                            lost   retired   error
                           (紛失)  (廃止)   (エラー)
```

### 16.2 各ステータスの操作

| ステータス | 操作API | 説明 |
|---|---|---|
| prepared → written | `POST /api/mobile/nfc/[id]/write` | NFC書き込み完了。written_at記録 |
| written → attached | `POST /api/mobile/nfc/[id]/attach` | 車両貼付完了。attached_at記録 |
| * → retired | `PATCH /api/admin/nfc` | ソフト削除（管理画面から） |
| * → (削除) | `DELETE /api/admin/nfc` | ハード削除（admin/owner権限必須） |

### 16.3 NFC + 証明書の連携

```
nfc_tags
  ├ vehicle_id → vehicles テーブル
  └ certificate_id → certificates テーブル
      └ public_id → /c/{public_id} で公開ページにアクセス
```

NFC読み取り → 公開証明書ページ表示 → 施工履歴確認

---

## 17. 権限・ロール体系

### 17.1 テナント（加盟店）ロール

| ロール | ランク | 説明 |
|---|---|---|
| `super_admin` | 5 | プラットフォーム管理者（CARTRUST運営のみ） |
| `owner` | 4 | テナントオーナー。全権限 |
| `admin` | 3 | テナント管理者。課金・ロゴ以外の全権限 |
| `staff` | 2 | スタッフ。閲覧+作成+編集（削除・設定変更不可） |
| `viewer` | 1 | 閲覧のみ |

**UIで割当可能:** `admin`, `staff`, `viewer`のみ（`owner`, `super_admin` はUI非公開）

### 17.2 権限一覧（47種類）

| カテゴリ | 権限 | viewer | staff | admin | owner |
|---|---|---|---|---|---|
| ダッシュボード | dashboard:view | o | o | o | o |
| 証明書 | certificates:view | o | o | o | o |
| 証明書 | certificates:create | x | o | o | o |
| 証明書 | certificates:edit | x | o | o | o |
| 証明書 | certificates:void | x | x | o | o |
| 車両 | vehicles:view | o | o | o | o |
| 車両 | vehicles:create | x | o | o | o |
| 車両 | vehicles:delete | x | x | o | o |
| 顧客 | customers:view | o | o | o | o |
| 顧客 | customers:create | x | o | o | o |
| 帳票 | invoices:view | o | o | o | o |
| 帳票 | invoices:create | x | o | o | o |
| 帳票 | invoices:edit | x | o | o | o |
| 予約 | reservations:view | o | o | o | o |
| 予約 | reservations:create | x | o | o | o |
| 受発注 | orders:view | o | o | o | o |
| 受発注 | orders:create | x | o | o | o |
| 入金 | payments:view | o | o | o | o |
| 入金 | payments:create | x | o | o | o |
| 入金 | payments:manage | x | x | o | o |
| メンバー | members:view | o | o | o | o |
| メンバー | members:manage | x | x | o | o |
| 設定 | settings:view | o | o | o | o |
| 設定 | settings:edit | x | x | o | o |
| 課金 | billing:view | o | o | o | o |
| 課金 | billing:manage | x | x | x | o |
| 店舗 | stores:view | o | o | o | o |
| 店舗 | stores:manage | x | x | o | o |
| レジ | registers:view | o | o | o | o |
| レジ | registers:manage | x | x | o | o |
| レジ精算 | register_sessions:view | o | o | o | o |
| レジ精算 | register_sessions:operate | x | o | o | o |
| ロゴ | logo:manage | x | x | x | o |
| プラットフォーム | platform:manage | — | — | — | super_admin のみ |

### 17.3 保険会社ロール

| ロール | ランク | 説明 |
|---|---|---|
| `admin` | 3 | 管理者。ユーザー管理・課金変更可 |
| `auditor` | 1 | 監査担当。閲覧+エクスポート |
| `viewer` | 2 | 閲覧のみ |

### 17.4 代理店ロール

| ロール | ランク | 説明 |
|---|---|---|
| `admin` | 3 | 管理者。全機能 |
| `staff` | 2 | スタッフ。紹介登録・閲覧 |
| `viewer` | 1 | 閲覧のみ |

### 17.5 RLS（Row Level Security）

全テーブルにRLSが有効化されている。アクセス制御の基本パターン:

```sql
-- 標準パターン: 自テナントのデータのみアクセス可
SELECT:  tenant_id IN (SELECT my_tenant_ids())
INSERT:  tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN ('owner','admin','staff')
UPDATE:  同上
DELETE:  tenant_id IN (SELECT my_tenant_ids()) AND my_tenant_role(tenant_id) IN ('owner','admin')
```

**特殊ケース:**
- `job_orders`: `from_tenant_id` OR `to_tenant_id` でアクセス判定
- `insurer_*`: `my_insurer_ids()` + 契約テナントのみ
- `agent_*`: `my_agent_ids()` で判定
- `customer_login_codes`, `customer_sessions`: サービスロールのみ

---

## 18. Cron / 自動処理

### 18.1 Cronジョブ一覧

| ジョブ | パス | スケジュール | 内容 |
|---|---|---|---|
| 請求書期限処理 | `/api/cron/billing` | 毎日 | overdue検出、リマインダー送信 |
| データクリーンアップ | `/api/cron/cleanup` | 毎日 | 期限切れデータの整理 |
| フォローアップ | `/api/cron/follow-up` | 毎日 | 施工後フォローメール送信 |
| メンテナンス | `/api/cron/maintenance` | 毎日 | DB最適化・統計更新 |
| ニュース同期 | `/api/cron/news-sync` | 定期 | 外部ニュース取得 |
| Square同期 | `/api/cron/square-sync` | 定期 | Square POS取引同期 |

### 18.2 請求書Cronの詳細

```
毎日実行:
  │
  ├→ Overdue検出
  │   └ status="sent" かつ due_date < today → overdue表示
  │
  ├→ Overdueリマインダー（3日超過）
  │   ├ Resend APIでメール送信
  │   ├ notification_logs に記録（重複送信防止）
  │   └ type: "overdue_reminder"
  │
  └→ 期限間近リマインダー（7日前）
      ├ status="sent" かつ due_date = today + 7
      └ type: "due_soon"
```

### 18.3 フォローアップ自動化

`follow_up_settings` テーブルでテナントごとに設定:
- `reminder_days_before`: 施工予定日の何日前にリマインダーを送るか
- `follow_up_days_after`: 施工完了後の何日後にフォローアップを送るか

---

## 19. 外部連携

### 19.1 連携サービス一覧

| サービス | 用途 | 設定 |
|---|---|---|
| **Stripe** | サブスクリプション課金、Checkout、Connect（代理店振込） | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET |
| **Supabase** | DB, Auth, Storage, Realtime | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| **LINE** | LINE公式アカウント連携、メッセージ配信 | LINE_CHANNEL_ID, LINE_CHANNEL_SECRET |
| **Google Calendar** | 予約のカレンダー同期 | OAuth認証 |
| **Square** | POS決済連携 | SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID |
| **Resend** | メール配信（リマインダー、通知） | RESEND_API_KEY |
| **Upstash** | レート制限（Redis）、ジョブキュー（QStash） | UPSTASH_REDIS_REST_URL, QSTASH_TOKEN |
| **Sentry** | エラー監視 | SENTRY_AUTH_TOKEN |
| **GBIZ** | 法人番号検索（保険会社登録時） | 外部API |

### 19.2 Webhook受信

| エンドポイント | ソース | 内容 |
|---|---|---|
| `/api/stripe/webhook` | Stripe | 決済イベント（支払完了、失敗、サブスクリプション変更等） |
| `/api/webhooks/resend` | Resend | メール配信ステータス |
| `/api/webhooks/square` | Square | POS決済イベント |
| `/api/line/webhook` | LINE | メッセージ受信イベント |

---

## 20. エスカレーション基準

| 状況 | エスカレーション先 | 対応 |
|---|---|---|
| テナントが法的証明書を要求 | PM/経営 | CARTRUSTは法的効力を保証しない旨を再説明 |
| 自由デザイン要求 | PM | B契約の範囲を説明。逸脱は別見積 |
| PDF出力崩れ | 開発 | layout_key / config_json 不具合調査 |
| Stripe課金トラブル | 開発 | Stripe Dashboard確認 + 手動処理 |
| 修正3回以上往復 | PM | 要件再確認。追加作業費の発生を説明 |
| RLSアクセスエラー | 開発 | tenant_memberships / RLSポリシーの確認 |
| 保険会社のデータ不正アクセス疑い | PM/法務 | insurer_access_logs の監査 |
| 代理店コミッション支払い失敗 | 開発 | Stripe Connect設定確認 |
| NFC書き込みエラー頻発 | 開発 | NFC端末/ファームウェアの確認 |
| 顧客ポータルOTP送信不可 | 開発 | Resend APIの確認、レート制限チェック |

---

## 付録A: テーブル一覧（全40+テーブル）

### コアテナント

| テーブル | 説明 |
|---|---|
| `tenants` | 加盟店（テナント）マスタ |
| `tenant_memberships` | テナント-ユーザー紐付け（ロール） |

### 車両・証明書

| テーブル | 説明 |
|---|---|
| `vehicles` | 車両マスタ |
| `certificates` | 施工証明書 |
| `certificate_images` | 証明書画像 |
| `vehicle_histories` | 車両施工履歴 |
| `nfc_tags` | NFCタグ管理 |
| `templates` | 証明書テンプレート |

### 顧客・帳票

| テーブル | 説明 |
|---|---|
| `customers` | 顧客マスタ |
| `documents` | 帳票（8種類統合） |
| `invoices` | 請求書（レガシー） |
| `menu_items` | サービスメニュー |
| `hearings` | ヒアリングシート |

### 予約・決済

| テーブル | 説明 |
|---|---|
| `reservations` | 予約管理 |
| `payments` | 入金管理 |

### 店舗・POS

| テーブル | 説明 |
|---|---|
| `stores` | 店舗マスタ |
| `store_memberships` | 店舗-スタッフ紐付け |
| `registers` | レジ端末 |
| `register_sessions` | レジ精算セッション |

### 受発注（B2B）

| テーブル | 説明 |
|---|---|
| `job_orders` | 受発注 |
| `chat_messages` | ジョブチャット |
| `order_audit_log` | 受発注監査ログ |
| `order_reviews` | 相互評価 |
| `notifications` | 通知 |

### マーケット

| テーブル | 説明 |
|---|---|
| `market_vehicles` | 出品車両 |
| `market_vehicle_images` | 出品画像 |
| `market_inquiries` | 問い合わせ |
| `market_inquiry_messages` | 問い合わせメッセージ |
| `market_deals` | 商談 |
| `vehicle_interests` | 顧客興味（CRM） |

### 保険会社

| テーブル | 説明 |
|---|---|
| `insurers` | 保険会社マスタ |
| `insurer_users` | 保険会社スタッフ |
| `insurer_tenant_contracts` | テナント契約 |
| `insurer_access_logs` | アクセス監査ログ |

### 代理店

| テーブル | 説明 |
|---|---|
| `agents` | 代理店マスタ |
| `agent_users` | 代理店スタッフ |
| `agent_referrals` | 紹介実績 |
| `agent_commissions` | コミッション |
| `agent_announcements` | お知らせ |
| `agent_announcement_reads` | 既読管理 |

### 顧客ポータル

| テーブル | 説明 |
|---|---|
| `customer_login_codes` | OTPコード |
| `customer_sessions` | 顧客セッション |

### その他

| テーブル | 説明 |
|---|---|
| `follow_up_settings` | フォローアップ設定 |
| `announcements` | お知らせ（テナント向け） |
| `news` | ニュース |
| `inquiries` | 問い合わせフォーム |

---

## 付録B: API エンドポイント分類

### 認証系 (6)
- `/api/signup` — テナント登録
- `/api/join/*` — 保険会社登録（OTP + 本登録）
- `/api/auth/*` — 認証フロー

### Admin API (50+)
- `/api/admin/certificates/*` — 証明書CRUD
- `/api/admin/documents/*` — 帳票CRUD
- `/api/admin/customers/*` — 顧客CRUD
- `/api/admin/vehicles/*` — 車両CRUD
- `/api/admin/reservations/*` — 予約CRUD
- `/api/admin/orders/*` — 受発注CRUD
- `/api/admin/payments/*` — 入金CRUD
- `/api/admin/nfc/*` — NFC管理
- `/api/admin/stores/*` — 店舗管理
- `/api/admin/registers/*` — レジ管理
- `/api/admin/members/*` — メンバー管理
- `/api/admin/billing/*` — 課金管理
- `/api/admin/menu-items/*` — メニュー管理
- `/api/admin/settings/*` — テナント設定
- `/api/admin/management-kpi/*` — KPI
- `/api/admin/announcements/*` — お知らせ
- `/api/admin/news/*` — ニュース
- `/api/admin/audit/*` — 監査ログ

### Insurer API (10+)
- `/api/insurer/certificate/*` — 証明書検索・閲覧
- `/api/insurer/search/*` — 詳細検索
- `/api/insurer/export/*` — エクスポート
- `/api/insurer/users/*` — ユーザー管理
- `/api/insurer/billing/*` — 課金管理
- `/api/insurer/onboarding/*` — オンボーディング

### Agent API (15+)
- `/api/agent/referrals/*` — 紹介管理
- `/api/agent/commissions/*` — コミッション
- `/api/agent/dashboard/*` — ダッシュボード
- `/api/agent/members/*` — メンバー管理
- `/api/agent/stripe-connect/*` — Stripe Connect

### Mobile API (10+)
- `/api/mobile/certificates/*` — 証明書（有効化・無効化含む）
- `/api/mobile/nfc/*` — NFC操作
- `/api/mobile/reservations/*` — 予約（チェックイン・施工開始・完了）
- `/api/mobile/pos/*` — モバイルPOS

### Webhook / Cron (10+)
- `/api/stripe/webhook` — Stripe
- `/api/webhooks/*` — Resend, Square
- `/api/line/webhook` — LINE
- `/api/cron/*` — 定期処理

### 公開API (5+)
- `/api/c/[public_id]` — 公開証明書
- `/api/certificate/public-status/*` — 公開ステータス
- `/api/contact` — 問い合わせフォーム
- `/api/health` — ヘルスチェック
- `/api/probe` — 監視プローブ
