# 自社運用 JPKI（公的個人認証）導入ロードマップ

> 作成: 2026-05-27
> ステータス: Phase 0 (要件整理 / 申請準備)
> 関連: `docs/mynumber-identity-research.md` (Phase 1 OCR + Phase 2 として本ドキュメント)

---

## 0. 何を作るのか

マイナンバーカードに搭載された JPKI（公的個人認証サービス）の電子証明書を
**Ledra 自社で**検証し、

1. **基本4情報（氏名・住所・生年月日・性別）の取得**
2. **本人確認済みフラグの付与**（保険会社案件など強い証拠力が必要な局面で利用）
3. **JPKI 電子署名による契約書／同意書への実印相当の署名**

を実現する。eKYC SaaS（TRUSTDOCK 等）を経由せず、J-LIS から直接サービスを
受けることで **1件あたりのランニングコストをほぼゼロ** にする。

### スコープ

| 項目 | 含む | 含まない |
|---|---|---|
| JPKI 署名検証 (CRL / OCSP) | ◯ | 個人番号本体の取得・保存 |
| マイナンバーカード NFC 読取り (モバイル) | ◯ | 券面 OCR（→ Phase 1） |
| Web ⇄ モバイル連携（QR → スマホ NFC） | ◯ | カードリーダー販売 |
| 利用者証明用電子証明書による本人確認 | ◯ | 在留カード / 免許証の JPKI 化（存在しない） |
| 署名用電子証明書による電子署名 (CAdES-T) | ◯ | 行政手続オンライン申請 |

### 非ゴール

- 個人番号（マイナンバー本体）の取得・保存（**番号利用法で不可**）
- 「マイナンバーで本人確認」というブランディング（正しくは「JPKI 本人確認」）
- 紙の同意書フローの全廃（紙併用は残す）

---

## 1. 前提条件と現状把握

### 1.1 J-LIS のサービス区分

| 区分 | 説明 | Ledra が該当するか |
|---|---|---|
| 署名検証者 | 失効情報を取得して JPKI 署名を検証できる事業者。 | ◯（目指す） |
| プラットフォーム事業者 | 民間事業者に署名検証 API を再販する事業者。 | ✗（SaaS 集約事業者向け） |
| 民間事業者 | プラットフォーム事業者経由で利用する事業者。 | △（中間ステップとしてあり） |

→ Ledra の規模・性質では、**最初はプラットフォーム事業者経由の「民間事業者」**として
   申請し、案件が増えてから「署名検証者」へ昇格する 2 段階が現実的。

### 1.2 必要な認定 / 契約

| 認定 / 契約 | 期間 | 対象 |
|---|---|---|
| 民間事業者の認定（プラットフォーム事業者経由） | 約 **3〜6 ヶ月** | 個人情報保護体制 + 技術要件 |
| 署名検証者の認定（直接） | 約 **6〜12 ヶ月** | 加えて施設監査・運用体制監査 |
| プラットフォーム事業者との契約 | 1〜2 ヶ月 | 月額固定 + 検証件数課金 |
| プライバシーマーク or ISMS | 取得済みなら不要 | 監査要件として実質必須 |

Ledra 側の前提（要確認）:
- [ ] **プライバシーマーク** または **ISMS (ISO/IEC 27001)** の保有状況
  → `docs/iso27001-soc2-prep.md` に進捗あり。完了済みでなければ並行取得が必要
- [ ] **個人情報保護管理者**の選任と社内規程の整備
- [ ] **入退室管理・アクセスログ管理**を要するサーバルーム or 同等のクラウド統制
  → Vercel + Supabase + Sentry の構成で代替可能か、要 J-LIS への事前確認

### 1.3 技術要件サマリ

| 要素 | 技術 | Ledra 既存 |
|---|---|---|
| CRL 取得（24h ごと） | LDAP / HTTP from J-LIS | なし（新規） |
| OCSP リアルタイム失効確認 | RFC 6960 | なし（新規） |
| X.509 検証 | Node `crypto` / `node-forge` | なし（新規） |
| PKCS#7 / CAdES 署名検証 | `node-forge` + custom | なし（新規） |
| RFC 3161 タイムスタンプ | 認定 TSA 連携 (アマノ / セイコー等) | なし（新規） |
| NFC 読取り (iOS) | CoreNFC + Entitlement | `react-native-nfc-manager` 導入済み |
| NFC 読取り (Android) | NfcManager API | 同上 |
| QR ⇄ Web セッション中継 | 既存 `customerPortalServer.ts` 拡張 | 流用可 |

---

## 2. ロードマップ（フェーズ詳細）

```
[2026 Q2]                [2026 Q3]                [2026 Q4]                [2027 Q1]
 ─────────────────────── ─────────────────────── ─────────────────────── ───────────────────────
 Phase 0: 要件整理        Phase 1: 申請+技術検証    Phase 2: 統合実装       Phase 3: 本番運用開始
                                                                          
 ・J-LIS 一次相談         ・民間事業者認定申請      ・JPKI 検証ライブラリ    ・全テナント roll out
 ・PM/ISMS ギャップ確認   ・プラットフォーム契約    ・モバイル NFC 統合      ・OCR (Phase 1) との
 ・社内体制設計           ・PoC: 検証 API 疎通      ・電子署名フロー          共存運用
                         ・社内監査リハ            ・本人確認認定取得審査    ・KPI モニタリング
 (1 ヶ月)                (3 ヶ月)                  (3 ヶ月)                  (継続)
```

### Phase 0: 要件整理 / 申請準備（2026 Q2 / 1 ヶ月）

**目的**: 申請に必要な書類・体制を揃え、技術選定を確定する。

| Week | 作業 |
|---|---|
| 1 | J-LIS 一次相談（オンライン or 訪問）。Ledra の事業概要と利用想定件数を提示し、申請区分の確認 |
| 1 | プラットフォーム事業者の候補リストアップ（NTT データ / 富士通 / NEC / 凸版印刷 等） |
| 2 | プライバシーマーク / ISMS のギャップ分析（`docs/iso27001-soc2-prep.md` の進捗確認） |
| 2 | 個人情報保護管理者の選任・社内規程ドラフト |
| 3 | アーキテクチャ設計レビュー（本ドキュメント §3 を基に） |
| 3 | 候補プラットフォーム事業者 2 社と NDA → 技術仕様書・料金体系を取得 |
| 4 | 申請区分の最終決定（民間事業者 / 署名検証者） |
| 4 | Phase 1 移行 Go/NoGo 判定 |

**成果物**:
- 申請区分決定書
- プラットフォーム事業者選定書
- 体制図 + 個人情報保護規程ドラフト

### Phase 1: 申請 + 技術検証（2026 Q3 / 3 ヶ月）

**目的**: 民間事業者認定を取得しつつ、PoC で技術疎通を確認する。

| Week | 作業 |
|---|---|
| 1-2 | 民間事業者認定の申請書類作成（J-LIS 提出） |
| 1-2 | プラットフォーム事業者と本契約 → PoC 用 API キー取得 |
| 3-4 | `src/lib/jpki/` 配下に検証ライブラリスタブを実装 |
| 5-6 | PoC: マイナンバーカード → 検証 API → 基本4情報取得を疎通 |
| 7-8 | CRL/OCSP キャッシュ機構の実装（Upstash Redis に 24h TTL） |
| 9-10 | 社内監査リハーサル（外部コンサル招聘推奨） |
| 11-12 | J-LIS からの審査対応 + 認定取得 |

**成果物**:
- `src/lib/jpki/*` (検証ライブラリ)
- PoC 動画 + 検証結果レポート
- 民間事業者認定証

### Phase 2: 統合実装（2026 Q4 / 3 ヶ月）

**目的**: Ledra 本体に JPKI フローを統合する。

| Week | 作業 |
|---|---|
| 1-2 | DB マイグレーション (`customer_identity_verifications` テーブル) |
| 3-4 | `src/app/api/jpki/session/route.ts` + `verify/route.ts` 実装 |
| 5-6 | モバイル: `apps/mobile/src/lib/jpki/` + `expo-router/nfc/scan` 統合 |
| 7-8 | Web: QR → スマホ NFC → Web セッション中継 |
| 9-10 | 電子署名フロー (`src/app/sign/[token]/`) に JPKI 署名オプション追加 |
| 11-12 | 1 テナント PoC 運用 + UX 調整 |

**成果物**:
- 統合された Ledra Web + モバイル
- 1 テナントでの本番運用ログ

### Phase 3: 本番運用開始（2027 Q1〜）

**目的**: 全テナント roll out + KPI モニタリング。

| Week | 作業 |
|---|---|
| 1 | 全テナントへの roll out（plan tier ガード経由） |
| 1 | 顧客向けマニュアル + 動画 (`docs/admin-beginner-guide.md` に追記) |
| 4 | KPI レビュー: JPKI 利用率 / 失効率 / NFC 失敗率 / PIN ロック率 |
| 8 | Phase 1 (OCR) からの移行ガイダンス（高額案件は JPKI 推奨） |
| 継続 | 月次で CRL 更新監視 / 失効率トラッキング / J-LIS との連携 |

---

## 3. アーキテクチャ概要

### 3.1 全体構成

```
[マイナンバーカード]
        │ NFC
        ▼
[Ledra モバイル (Expo + react-native-nfc-manager)]
        │  APDU で署名用/利用者証明用電子証明書を読取り
        │  + ユーザが PIN 入力
        │  → 署名・証明書チェーンをサーバ送信
        ▼
[Ledra Bff (Next route handler / src/app/api/jpki/*)]
        │  - X.509 検証 (証明書チェーン)
        │  - 署名検証 (CAdES / PKCS#7)
        │  - CRL/OCSP リアルタイム失効確認
        │  - RFC 3161 タイムスタンプ付与
        │  - 基本4情報を抽出して customers / civ テーブルへ保存
        ▼
[認定 TSA] (アマノ / セイコー等)
        │  タイムスタンプトークン
[J-LIS] (CRL / OCSP)
        │  失効情報
[プラットフォーム事業者 API] (Phase 1 のみ)
        │  検証結果の中継 (民間事業者ステータス時)
```

### 3.2 ディレクトリ設計（提案）

```
src/lib/jpki/
├── client.ts              プラットフォーム事業者 SDK ラッパー (withRetry 通す)
├── crl.ts                 CRL/OCSP 取得 + Redis キャッシュ (24h TTL)
├── verifyCertificate.ts   X.509 検証 (純関数, テスト容易)
├── verifySignature.ts     PKCS#7 / CAdES 検証
├── timestamp.ts           RFC 3161 認定 TSA 連携
├── extractAttributes.ts   基本4情報抽出 (純関数)
├── types.ts               JpkiVerificationResult 等の型
└── __tests__/
    ├── verifyCertificate.test.ts  (期限切れ / 失効 / 自己署名)
    ├── verifySignature.test.ts    (改ざんあり / なし)
    └── extractAttributes.test.ts  (DN parse)

src/app/api/jpki/
├── session/route.ts       本人確認セッション開始 (challenge 発行)
├── verify/route.ts        モバイルからの署名/証明書を検証
├── sign/route.ts          ドキュメントへの JPKI 署名 (CAdES-T)
└── webhook/route.ts       (プラットフォーム事業者から非同期通知が来る場合)

apps/mobile/src/lib/jpki/
├── reader.ts              NFC APDU 実装 (CoreNFC / NfcManager)
├── pinModal.ts            PIN 入力 UI (Paper TextInput + マスキング)
└── session.ts             Web セッション中継 (Deep link / QR scan)
```

### 3.3 DB スキーマ（Phase 2 で追加）

```sql
-- supabase/migrations/20261001000000_jpki_verifications.sql

CREATE TABLE customer_identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('jpki', 'jpki_signed')),
  status text NOT NULL CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  verified_at timestamptz,
  verified_name text,
  verified_birth_date date,
  verified_postal_code text,
  verified_address text,
  verified_gender text,
  -- JPKI 署名フロー用
  signature_payload_hash text,
  signed_certificate_serial text,
  signed_certificate_issuer text,
  signature_timestamp timestamptz,
  -- 監査
  verification_log jsonb,                  -- 90日でローテーション
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz                   -- 確認結果の有効期限
);

CREATE UNIQUE INDEX idx_civ_signed_cert
  ON customer_identity_verifications (tenant_id, signed_certificate_serial)
  WHERE signed_certificate_serial IS NOT NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verification_id uuid
    REFERENCES customer_identity_verifications(id) ON DELETE SET NULL;

-- 個人番号本体が誤って混入しないための trip wire
ALTER TABLE customers
  ADD CONSTRAINT customers_no_mynumber CHECK (
    note IS NULL OR note !~ '^\d{12}$'
  );

ALTER TABLE customer_identity_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS civ_tenant_select ON customer_identity_verifications;
CREATE POLICY civ_tenant_select ON customer_identity_verifications
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
  );
```

---

## 4. コスト試算

### Phase 0〜2 の初期投資

| 項目 | 金額 | 備考 |
|---|---|---|
| J-LIS 申請手数料 (民間事業者) | 0〜10 万円 | 区分による |
| プライバシーマーク取得 (未取得の場合) | 200〜400 万円 | 1.5 年有効、毎年更新 |
| プラットフォーム事業者契約初期費用 | 50〜200 万円 | NTT データ等の参考値 |
| 外部監査コンサル (PrivacyMark / ISMS) | 100〜300 万円 | |
| 内部開発工数 (3.0 人月) | 約 300 万円 | Phase 0〜2 通算 |
| **初期合計** | **約 650〜1,210 万円** | PM 取得込みの場合 |

### ランニングコスト (年間)

| 項目 | 金額 |
|---|---|
| プラットフォーム事業者月額 | 5〜20 万円/月 × 12 = 60〜240 万円 |
| プラットフォーム事業者従量 | 1件 50〜100 円 × 件数（**TRUSTDOCK の 1/3〜1/5**） |
| 認定 TSA (タイムスタンプ) | 1スタンプ 10〜30 円 |
| CRL/OCSP トラフィック | 実質ゼロ |
| プライバシーマーク更新 | 50〜100 万円/年 |
| **年間合計 (月 1,000 件想定)** | **約 240〜420 万円** |

### TRUSTDOCK との比較（月 1,000 件想定 / 初年度）

| 方式 | 初期 | 年間ランニング | 初年度合計 |
|---|---|---|---|
| TRUSTDOCK | 75 万円 | 480 万円 | **約 755 万円** |
| 自社 JPKI (PM 既保有) | 約 450 万円 | 約 240 万円 | **約 890 万円** |
| 自社 JPKI (PM 新規取得) | 約 1,210 万円 | 約 240 万円 | **約 1,650 万円** |

→ **初年度はほぼ同等 or 高い**が、**2 年目以降は TRUSTDOCK 480 万円/年 vs 自社 240 万円/年**
   で年間 240 万円の差。**3〜4 年で投資回収**。件数が増えるほど自社優位。

### 損益分岐（自社 vs TRUSTDOCK）

| 月間件数 | 自社年間コスト | TRUSTDOCK 年間コスト | 自社優位ライン |
|---|---|---|---|
| 100 | 約 240 万円 | 約 175 万円 | ✗ |
| 500 | 約 250 万円 | 約 312 万円 | ◯ |
| 1,000 | 約 270 万円 | 約 480 万円 | ◎ |
| 3,000 | 約 360 万円 | 約 1,152 万円 | ◎◎◎ |

→ **月 500 件超で自社 JPKI が有利**。月 1,000 件超なら 2 年目で完全に逆転。

---

## 5. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| J-LIS 認定が下りない / 延期 | スケジュール遅延 | Phase 1 (OCR + AI) を継続。eKYC SaaS を一時併用も可 |
| プライバシーマーク取得失敗 | 認定取得不能 | PM 取得済みのコンサル会社を早期パートナーに |
| iOS NFC Entitlement 申請却下 | モバイル UX 阻害 | Web + 外付け IC カードリーダー併用フォールバック |
| CRL 取得障害 | 全 JPKI 検証が停止 | 24h キャッシュ + OCSP セカンダリで縮退運用 |
| 利用者の PIN 失念 | コンバージョン落ち | 手書き署名 / OCR にフォールバック明示 |
| マイナンバーカード未保有 | 利用率低 | 「持っている顧客限定の付加機能」として割り切る |
| Android 機種互換性 | 一部読取り不可 | 主要 5 機種で実機テスト、対応機種リスト公開 |

---

## 6. 法令・規格対応チェックリスト

- [ ] **公的個人認証法**（電子署名等に係る地方公共団体情報システム機構の認証業務に関する法律）の遵守
- [ ] **番号利用法**: 個人番号本体を取得・保存しない（CHECK 制約 + コードレビュー）
- [ ] **電子署名法 §3**: JPKI 署名は認定電子署名として有効
- [ ] **電子署名法施行規則 §2 第3項**: 実装が条文要件を満たすか弁護士レビュー
- [ ] **e-文書法**: PDF への CAdES-T 埋め込みで原本性確保
- [ ] **個人情報保護法**: 取得目的の明示、第三者提供の制限
- [ ] **プライバシーマーク** または **ISMS**: 取得・維持
- [ ] **時刻認証業務認定 (TSA)**: 認定 TSA を採用 (JIPDEC 認定)
- [ ] **PIA (個人情報影響評価)**: 申請前に実施
- [ ] **DPA**: プラットフォーム事業者と締結
- [ ] **緊急時連絡体制**: J-LIS / 認定 TSA / プラットフォーム事業者の 24/7 連絡先

---

## 7. Phase 1 (OCR) との関係 / 共存運用

| 観点 | Phase 1: OCR + AI | Phase 2/3: 自社 JPKI |
|---|---|---|
| 法的本人確認 | ✗ | ◎ |
| 即時利用可否 | 既に実装着手済み | 認定取得後 |
| 1件単価 | 約 3 円 | 約 50〜100 円 |
| UX | 写真撮る | カードかざす + PIN |
| 必要前提 | 任意の身分証 | マイナンバーカード保有 |
| 用途 | フォーム自動入力 | 本人確認 + 電子署名 |

**共存戦略**:
- 全顧客には Phase 1 (OCR) を常時提供 → 入力負担軽減
- 保険連携・高額取引・代理店契約には Phase 2/3 (JPKI) を必須化
- 同一顧客で Phase 1 → Phase 2 ランクアップ経路を持つ
- DB の `customers.identity_verified_at` が NULL か否かで切り分け

---

## 8. 次のアクション

### 直近（2026 Q2 中）
1. **J-LIS への一次相談アポ取り**（オンライン窓口）
2. **プライバシーマーク / ISMS 取得状況の確認**（`docs/iso27001-soc2-prep.md` 参照）
3. **プラットフォーム事業者 2 社と NDA**（NTT データ / 富士通 等）
4. **Phase 0 完了で本ドキュメントを v2 へ更新**

### Phase 1 と並行して継続
- 法令アップデートのウォッチ（デジタル庁 / J-LIS のニュース）
- 競合の JPKI 対応状況（Slim Hub / GO / Drivvic 等）の継続調査
- マイナンバーカード普及率の四半期トラッキング（コンバージョン予測材料）

---

## 9. 参考リンク

- 公的個人認証サービスポータルサイト（J-LIS 公式）
- 電子署名法（電子署名及び認証業務に関する法律）
- 電子署名法施行規則 第2条第3項
- 番号利用法 §9（個人番号の利用範囲）
- JIPDEC 時刻認証業務認定一覧
- プライバシーマーク制度
- ISMS (ISO/IEC 27001) 認証
- デジタル庁: マイナンバーカード普及・利活用施策
