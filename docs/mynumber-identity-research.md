# マイナンバー（個人番号カード）連携 個人情報入力 調査ドキュメント

> 作成: 2026-05-27
> ステータス: 調査 (実装着手前)
> 対象画面:
> - 電子署名フロー `src/app/sign/[token]/` / `src/app/agent-sign/[token]/`
> - 顧客ポータル登録 `src/app/customer/[tenant]/`, `src/app/c/[public_id]/`, `src/app/my/`
> - モバイルアプリ顧客登録 `apps/mobile/src/app/customers/new.tsx`

---

## 0. TL;DR

- **「マイナンバー（個人番号）そのもの」を Ledra が取得・保存することは法律上できない**。
  番号利用法（マイナンバー法）第9条で利用範囲が **税・社会保障・災害対策** に限定されており、
  自動車整備 SaaS の顧客管理用途は対象外。
- ただし **マイナンバーカードに搭載された JPKI（公的個人認証サービス）** を使えば、
  **個人番号本体は読まずに「基本4情報（氏名・住所・生年月日・性別）」と「本人確認済みの電子署名」を取得できる**。
  これは Ledra のユースケースで合法に使える。
- 実装方式は 3 つ。本ドキュメントでは **eKYC SaaS 経由（TRUSTDOCK / xID / Pocket Sign）** を推奨。
  Web は SDK 埋め込み、モバイルは既に入っている `react-native-nfc-manager` を活用するか
  SaaS の React Native SDK を入れる。
- 概算コスト: **初期 0〜30万円 / 月額 3〜10万円 + 本人確認 1件あたり 200〜500円**。
- Ledra 側のコード変更箇所は **5ファイル + 1マイグレーション** 程度の小規模で着地できる。

---

## 1. 背景: 何を区別すべきか

「マイナンバーを使う」という言葉は実は 3 つの別物を指しており、法的扱いがまったく違う。

| 用語 | 中身 | Ledra が保存可能か | 用途 |
|---|---|---|---|
| **個人番号（マイナンバー）** | 12 桁の数字。 | **不可**（番号利用法 §9 で用途限定） | 税・社保・災害のみ |
| **マイナンバーカード** | 個人番号が印字された IC カード。 | カード券面の撮影画像は eKYC で限定的に可（番号面のマスキング必須） | 本人確認の物理証憑 |
| **JPKI（公的個人認証サービス）** | カード内 IC チップの電子証明書。署名用 + 利用者証明用の 2 種。 | **可**（基本4情報の取得は問題なし） | 電子署名 / 本人確認 |

**Ledra が使うのは 3 つ目の JPKI のみ**。マイナンバー本体は触らない設計にする。

### 1.1 JPKI で取れる情報

| 情報 | 取得元 | 取得方法 |
|---|---|---|
| 氏名 | 署名用電子証明書のサブジェクト | NFC 読取り + PIN(英数字 6-16 桁) |
| 住所 | 同上 | 同上 |
| 生年月日 | 同上 | 同上 |
| 性別 | 同上 | 同上 |
| 電子署名（PKCS#7 / CAdES） | 署名用秘密鍵 | NFC 読取り + 署名用 PIN |
| 本人確認のみ（基本4情報なし） | 利用者証明用電子証明書 | NFC 読取り + 利用者証明用 PIN(数字 4 桁) |

→ Ledra の **顧客登録** は「氏名/住所/生年月日」が取れれば既存フォームを置換できる。
→ Ledra の **電子署名フロー** は JPKI 署名そのものを使えば「実印相当」の証拠力になる。

---

## 2. 現状の Ledra 実装

### 2.1 顧客テーブル

`supabase/migrations/20260313000000_add_service_price_and_customers.sql:6`

```sql
CREATE TABLE customers (
  id, tenant_id, name, name_kana, email, phone,
  postal_code, address, note, created_at, updated_at
);
```

生年月日・性別カラムは現状なし。

### 2.2 入力フォーム

| 画面 | ファイル | 現在の入力項目 |
|---|---|---|
| モバイル顧客新規登録 | `apps/mobile/src/app/customers/new.tsx:14-22` | name, name_kana, email, phone, postal_code, address, note |
| 顧客ポータルログイン | `src/app/customer/[tenant]/login/page.tsx:12-15` | email + 電話下4桁 + OTP コード |
| 電子署名 (Web) | `src/app/sign/[token]/SignatureClient.tsx:28` | signerEmail + 同意チェック → Canvas で手書き署名 |
| 代理店電子署名 | `src/app/agent-sign/[token]/AgentSignClient.tsx` | 同上 |

→ 現状はすべて **自己申告ベース**。JPKI 連携で「本人確認済み」フラグを足せる。

---

## 3. 実装方式の比較

### 3.1 方式A: eKYC SaaS 経由（**推奨**）

**代表的なサービス**:

| サービス | 特徴 | 価格 (公開情報ベース) | RN SDK |
|---|---|---|---|
| TRUSTDOCK | 業界シェア最大、JPKI + 撮影型 eKYC 両対応 | 初期 0〜10万 / 月額 3万〜 / 1件 200〜400円 | ◯ |
| xID | JPKI 特化、デジタルID（xID）の再利用で 2回目以降は数秒 | 初期 〜30万 / 月額 5万〜 / 1件 100〜300円 | ◯ |
| Pocket Sign | JPKI 署名 + eKYC を一体提供。署名フローと相性◎ | 要見積 / 1署名 300〜500円 | ◯（β） |
| ELEMENTS Hubble | 顔認証 + JPKI ハイブリッド | 要見積 / 大規模向け | ◯ |
| LiquidPay (Liquid eKYC) | 銀行向け実績多 | 要見積 | ◯ |

**メリット**:
- プラットフォーム事業者認可（J-LIS 経由）を SaaS 側が肩代わり
- Web/モバイル両対応の SDK 完備
- 行政書類アップデート（住基ネット仕様変更等）の追随を任せられる
- 監査ログ・本人確認記録の長期保存（犯収法 7年）も SaaS 側で保持

**デメリット**:
- ランニングコスト（1件 200〜500円）。年間 1 万件なら 200〜500 万円
- 自社で電子証明書の検証ロジックを持たないので、ベンダーロックイン
- 顧客の基本4情報を一旦 SaaS 側経由で受け取る → DPA 必要

**契約面**:
- 業務委託契約 + 個人情報の取扱いに関する覚書（DPA）が必須
- `docs/dpa-template.md` を流用可能

### 3.2 方式B: JPKI 直接実装（自社で公的個人認証）

**実装内容**:
- J-LIS に「プラットフォーム事業者」または「民間事業者」として認定申請
- 失効リスト (CRL) を J-LIS から取得し、署名用電子証明書を検証
- モバイル: `react-native-nfc-manager` で APDU を直接叩く（ISO/IEC 7816）
- Web: WebUSB / WebNFC は実用未満 → スマホアプリ + QR で Web セッションと連携

**メリット**:
- 1件あたりコストが原則ゼロ
- 個人情報を一切外部に流さない

**デメリット**:
- **認定取得に 6〜12 ヶ月、書類審査・現地監査あり**
- CRL 取得・OCSP・タイムスタンプ署名 (RFC3161) を自前で運用
- iOS は CoreNFC で APDU を叩けるが、Android は機種により JPKI 互換性差あり
- Web 単独ではユーザー体験を作れない → スマホアプリ前提

→ Ledra の規模（マルチテナント SaaS）では **過剰投資**。将来の月間処理件数が
  10 万件を超えた段階で再検討するレベル。

### 3.3 方式C: マイナポータル API 連携

**実装内容**:
- マイナポータルの「自己情報取得 API」「e-私書箱」を OAuth 様のフローで叩く
- ユーザーがマイナポータル側で同意 → コールバックで属性情報取得

**取れる情報**:
- 基本4情報のほか、住民票記載事項、税情報、所得情報、医療費通知など（用途次第）

**メリット**:
- 住所変更などが自動同期される（住基ネット直結）
- 「マイナンバーで本人確認しました」のブランディング訴求が強い

**デメリット**:
- デジタル庁への連携申請（数ヶ月）必要
- 連携先システムとしての要件適合（情報セキュリティ監査）が重い
- 顧客側で「マイナポータル」アプリインストール済が前提

→ Ledra のフェーズ的には早すぎる。次フェーズ（保険会社・損保連携が本格化したら検討）。

---

## 4. 推奨アーキテクチャ（方式A 採用）

### 4.1 全体フロー

```
[ユーザー（顧客）]
    │
    ├─ 1) Ledra で「マイナンバーカードで登録」ボタン押下
    │
    ▼
[Ledra フロント (Next / Expo)]
    │
    ├─ 2) eKYC SaaS の SDK で本人確認セッション開始
    │     POST {eKYC}/sessions → returns session_token
    │
    ▼
[eKYC SaaS フロント (WebView / RN SDK)]
    │
    ├─ 3) ユーザーがカードを NFC かざす + PIN 入力
    │   署名用電子証明書 + 基本4情報を取得 → eKYC SaaS へ送信
    │
    ▼
[eKYC SaaS バックエンド]
    │
    ├─ 4) J-LIS の CRL に問い合わせ → 証明書失効チェック
    ├─ 5) 基本4情報を eKYC SaaS が一時保管 (7年 / 犯収法)
    └─ 6) Ledra Webhook を呼ぶ
            POST /api/identity/webhook
            { session_id, status: "verified",
              name, name_kana, birth_date, gender,
              postal_code, address,
              verification_id, verified_at }
    │
    ▼
[Ledra Bff (Next route handler)]
    │
    ├─ 7) HMAC で webhook 署名検証 (`withRetry` 不要、同期処理)
    ├─ 8) customers / customer_identity_verifications を upsert
    └─ 9) ユーザーをセッションに昇格 (customerPortalServer.ts と統合)
```

### 4.2 DB 変更（マイグレーション 1 本）

新規テーブル `customer_identity_verifications`:

```sql
CREATE TABLE customer_identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  provider text NOT NULL,           -- 'trustdock' | 'xid' | 'pocket_sign'
  provider_verification_id text NOT NULL,
  method text NOT NULL,             -- 'jpki' | 'jpki_signed' | 'document_photo'
  status text NOT NULL,             -- 'pending' | 'verified' | 'failed' | 'expired'
  verified_at timestamptz,
  -- 基本4情報のスナップショット（後の本人申告との照合用）
  verified_name text,
  verified_birth_date date,
  verified_postal_code text,
  verified_address text,
  verified_gender text,
  -- JPKI 署名フロー用
  signature_payload_hash text,      -- 何に署名したかのハッシュ（PDF 等）
  signed_certificate_serial text,   -- 電子証明書シリアル
  -- 監査
  raw_provider_payload jsonb,       -- 障害解析用（90日でローテーション）
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,           -- 確認結果の有効期限（再確認要否）
  UNIQUE (provider, provider_verification_id)
);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verification_id uuid
    REFERENCES customer_identity_verifications(id) ON DELETE SET NULL;

CREATE INDEX idx_civ_tenant_customer
  ON customer_identity_verifications (tenant_id, customer_id);
```

**重要**: `customers.my_number` のような **個人番号本体カラムは絶対に作らない**。
誤って入ってきた場合のために CHECK 制約も入れる:

```sql
ALTER TABLE customers
  ADD CONSTRAINT customers_no_mynumber CHECK (
    note IS NULL OR note !~ '^\d{12}$'
  );
```

### 4.3 Ledra 側コード変更箇所

| 区分 | パス | 変更内容 |
|---|---|---|
| 新規 | `src/lib/identity/provider.ts` | eKYC SaaS クライアントラッパー（withRetry 通す） |
| 新規 | `src/lib/identity/webhook.ts` | HMAC 検証 + customers upsert |
| 新規 | `src/app/api/identity/session/route.ts` | フロントから本人確認セッション開始 |
| 新規 | `src/app/api/identity/webhook/route.ts` | SaaS からのコールバック |
| 修正 | `src/app/customer/[tenant]/login/page.tsx` | 「マイナンバーカードで登録/ログイン」ボタン追加 |
| 修正 | `src/app/sign/[token]/SignatureClient.tsx` | 手書き署名の代替として JPKI 署名選択 |
| 修正 | `src/app/agent-sign/[token]/AgentSignClient.tsx` | 同上 |
| 修正 | `apps/mobile/src/app/customers/new.tsx` | 「マイナンバーカード読取り」ボタン → NFC SDK 呼び出し |
| 新規 | `apps/mobile/src/lib/identity.ts` | RN SDK ラッパー |
| 新規 | `supabase/migrations/20260601000000_identity_verifications.sql` | 上記 DDL |

### 4.4 セキュリティ要件

1. **TLS 1.3 / mTLS**: eKYC SaaS との通信は mTLS 必須。クライアント証明書を Vercel 環境変数で管理
2. **HMAC Webhook 検証**: `X-Signature` ヘッダを `crypto.timingSafeEqual` で検証
3. **PII の最小化**:
   - `verified_address` は **市区町村まで** で保存し、番地以下は本人申告フィールドへ
   - Sentry に payload を絶対に送らない（既存の `secret マスク` を拡張）
4. **保存期間**: `customer_identity_verifications.raw_provider_payload` は 90 日で NULL 化
5. **削除リクエスト対応**: GDPR/個人情報保護法 33条 の本人削除要請で確実に消える設計
6. **ログ**: `logger.child({ verificationId })` で全 step を相関ID付き JSON ログ化

### 4.5 UX 設計

**Web (顧客ポータル)**:
```
[既存] メール + 電話下4桁 + OTP
    +
[追加] 「マイナンバーカードで登録」ボタン
   → スマホで QR を読む → スマホ側で NFC かざす
   → Web 側はポーリングで完了検知
```

**モバイル (顧客新規登録)**:
```
[既存] 全項目手入力
    or
[追加] 「カード読取りで自動入力」
   → NFC かざす → PIN 入力 → 氏名/住所/生年月日が自動充填
   → ユーザーは確認して登録
```

**電子署名**:
```
[既存] 手書き署名 (Canvas)
    or
[追加] 「マイナンバーカードで電子署名」
   → JPKI 署名 → PDF に CAdES-T 埋め込み
   → 既存 Polygon アンカリングと併用で「実印 + ブロックチェーン」の二重証拠
```

---

## 5. 概算スケジュール・コスト

### 5.1 スケジュール（方式A）

| Phase | 内容 | 期間 |
|---|---|---|
| 0 | eKYC SaaS 3社見積取得・選定 | 2 週 |
| 1 | DPA / 業務委託契約締結 | 2 週（並行可） |
| 2 | DB マイグレーション + Webhook ハンドラ | 1 週 |
| 3 | Web フロー（顧客ポータル + 電子署名） | 2 週 |
| 4 | モバイルフロー | 2 週 |
| 5 | E2E + 監査ログ確認 + ベンダー本番審査 | 2 週 |
| 合計 | | **約 2 ヶ月** |

### 5.2 コスト（方式A、年間 1 万件想定）

| 項目 | 金額 |
|---|---|
| eKYC SaaS 初期費用 | 0〜30 万円 |
| 月額固定費 | 3〜10 万円/月 × 12 = 36〜120 万円 |
| 従量課金 | 1万件 × 300円 = 300 万円 |
| 内部開発工数 | エンジニア 1.0 人月 × 2ヶ月 = 約 200 万円 |
| **初年度合計** | **約 540〜650 万円** |

→ 顧客あたり 300 円のコストを誰が負担するかは別途事業判断。
   - 保険会社案件のみ必須化 → コストは案件原価に上乗せ
   - 全顧客必須化 → プラン料金に転嫁
   - オプション化 → 必要な顧客のみ

---

## 6. 法令チェックリスト

- [ ] **番号利用法**: 個人番号本体を取得・保存しない設計になっているか（CHECK 制約 + コードレビュー）
- [ ] **個人情報保護法**: 利用目的の明示・本人同意の取得フローがあるか
- [ ] **犯収法**（取引時確認）: Ledra 自身は対象事業者ではないが、損保連携時に必要になる可能性
- [ ] **電子署名法**: JPKI 署名は §3 の「電子署名」として認定済（電子署名法施行規則第2条第3項）
- [ ] **e-文書法**: PDF への JPKI 署名埋め込みで原本性確保
- [ ] **DPA**: eKYC SaaS と締結
- [ ] **PIA (個人情報影響評価)**: 顧客の生年月日・住所を新規取得するため実施推奨
- [ ] **プライバシーポリシー更新**: 取得項目・保管期間・第三者提供の有無

---

## 7. オープン課題

1. **対象テナントの絞り込み**: 全テナント一律で出すか、特定プラン（Enterprise 等）のみか
2. **PIN 失念時の運用**: マイナンバーカード PIN をユーザーが忘れた場合は市役所窓口リセット必須
   → 「手書き署名にフォールバック」を必ず残す
3. **代理店 (agent) 経由の本人確認**: 代理店が顧客に代わって読取りするフローは
   eKYC SaaS 側が認めないことが多い → 顧客本人のスマホ前提にする必要あり
4. **モバイルアプリの NFC 権限**: iOS は Entitlement 申請が必要。
   `apps/mobile/eas.json` への追加設定要
5. **オフライン対応**: `docs/pwa-cert-offline-design.md` で進めている PWA オフライン路線と
   本人確認フローは衝突する（本人確認はオンライン必須） → UX 設計で明示する

---

## 8. 次のアクション

1. **意思決定**: 上記方式 A〜C のどれで進めるかを経営判断 (1 週間以内)
2. **ベンダー選定**: 方式 A 採用なら TRUSTDOCK / xID / Pocket Sign の 3 社に RFP 送付
3. **PoC 設計**: 1 テナントで顧客新規登録フローのみを先行実装し、UX・コスト・運用負荷を実測
4. **正式実装計画**: PoC 結果をもとに本ドキュメントを v2 へ更新

---

## 9. 参考リンク

- 番号利用法（行政手続における特定の個人を識別するための番号の利用等に関する法律）
- 公的個人認証サービス（JPKI）: J-LIS 公式ページ
- デジタル庁: マイナポータル API 連携ガイドライン
- 電子署名法施行規則 第2条第3項
- 個人情報保護委員会: 個人番号の取扱いに関するガイドライン
