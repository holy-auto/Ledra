# 個人情報入力の自動化 設計 / 調査ドキュメント

> 作成: 2026-05-27 (v1: JPKI eKYC 案)
> 更新: 2026-05-27 (v2: **OCR + AI 自動入力を Phase 1 推奨に変更**)
> ステータス: Phase 1 設計 / Phase 2 調査
> 対象画面:
> - 電子署名フロー `src/app/sign/[token]/` / `src/app/agent-sign/[token]/`
> - 顧客ポータル登録 `src/app/customer/[tenant]/`, `src/app/c/[public_id]/`, `src/app/my/`
> - モバイルアプリ顧客登録 `apps/mobile/src/app/customers/new.tsx`

---

## 0. TL;DR

- **Phase 1 (即着手・推奨)**: 既存の Anthropic Sonnet 4.6 Vision を使って
  **免許証 / マイナンバーカード顔写真面 / 在留カード / パスポート** を OCR し、
  AI が顧客フォームを自動入力する。**追加コスト 1件あたり約3円・初年度 約50万円**。
- **Phase 2 (6〜12ヶ月で並行)**: JPKI（公的個人認証）路線の意思決定。
  オプションは TRUSTDOCK 等の eKYC SaaS / J-LIS プラットフォーム事業者認定の自社取得 /
  マイナポータル API 連携の 3 つ。
- **Phase 3**: Phase 1 (簡易自動入力) と Phase 2 (本人確認) を共存運用。
  通常案件は OCR、保険会社案件など高証拠力が必要なケースのみ JPKI。
- **マイナンバー本体は触らない**設計を全フェーズで貫く（番号利用法）。

---

## 1. なぜ OCR + AI から始めるのか

### 1.1 既存 Ledra スタックでほぼ追加投資ゼロ

| 既存資産 | 使い道 |
|---|---|
| `src/lib/ai/client.ts` (Anthropic Sonnet 4.6 Vision) | 身分証画像の OCR |
| `src/lib/ai/photoQualityCheck.ts` のパターン | zod structured output + withRetry のテンプレ |
| `src/lib/http/withRetry.ts` | Anthropic API の retry + circuit breaker |
| モバイルの `expo-camera` / `expo-image-picker` | 身分証撮影 UI |
| Web の画像アップロードフロー | 同上 (Web 版) |
| `src/lib/logger.ts` の secret マスク | OCR 結果 PII のログマスク拡張 |

→ **新規 SDK 契約 / DPA / mTLS 設定が一切不要**。1〜2 日でモックレベルが動く。

### 1.2 コスト比較

| 方式 | 1件単価 | 月額固定 | 初期 | 初年度合計 (月1,000件想定) |
|---|---|---|---|---|
| **OCR + AI (Phase 1)** | **約 3円** | **0円** | **0円** | **約 50 万円** (開発工数のみ) |
| TRUSTDOCK eKYC | 280円 | 120,000円 | 750,000円 | 約 755 万円 |
| 自社 JPKI 直接実装 | 0円 | サーバ運用 | 認定取得 6〜12ヶ月 | 数千万円 (J-LIS 認定) |

→ **約 1/15** のコストで顧客入力の手間を大幅削減できる。

### 1.3 UX 連続性

Phase 1 → Phase 3 でフロー骨格が変わらない:
- 「写真撮る → 自動入力 → ユーザー確認 → 登録」が共通の体験
- JPKI が乗っても「撮る」が「カードをかざす」に置き換わるだけ
- 既存の手動入力フォームは常にフォールバックとして残す

---

## 2. 用語整理（v1 と同じだが重要なので再掲）

「マイナンバーを使う」は実は 3 つの別物。法的扱いがまったく違う。

| 用語 | 中身 | Ledra が保存可能か | 用途 |
|---|---|---|---|
| **個人番号（マイナンバー）** | 12 桁の数字 | **不可**（番号利用法 §9） | 税・社保・災害のみ |
| **マイナンバーカード** | 個人番号が印字された IC カード | 顔写真面の撮影は可、**個人番号面は不可** | 物理身分証 |
| **JPKI** | カード IC チップ内の電子証明書 | **可** | 電子署名・本人確認 |

**Ledra の全フェーズで個人番号本体は触らない。**

---

## 3. Phase 1: OCR + AI 自動入力（即着手）

### 3.1 対応身分証

| 書類 | 取れる情報 | 取らない情報（破棄必須） |
|---|---|---|
| 運転免許証 | 氏名 / 生年月日 / 住所 / 有効期限 / 免許種別 | **本籍** / 免許証番号下4桁以外 / 顔写真 |
| マイナンバーカード（顔写真面） | 氏名 / 生年月日 / 住所 / 性別 / 有効期限 | **個人番号面は撮影禁止** |
| 在留カード | 氏名 / 生年月日 / 住所 / 在留資格 / 在留期限 | 顔写真 |
| パスポート | 氏名 / 生年月日 / 国籍 / パスポート番号下4桁 | 顔写真 / 完全な番号 |
| 健康保険証 | 氏名 / 生年月日 / 住所 | **保険者番号 / 記号番号 / 枝番**（個人特定子情報） |

### 3.2 アーキテクチャ

```
[ユーザー]
    │
    ├─ 1) 「写真で自動入力」ボタン押下
    ▼
[フロント (Next / Expo)]
    │
    ├─ 2) カメラ/ファイル選択で身分証画像取得
    ├─ 3) クライアント側で画像リサイズ (1600px 長辺) + JPEG 80%
    │     → Sonnet 4.6 Vision の context 削減 (1枚 ~$0.02)
    ├─ 4) POST /api/identity/ocr (multipart)
    ▼
[Next route handler]
    │
    ├─ 5) tenant 認証 (admin) or 顧客セッション (customer)
    ├─ 6) rate limit (mobile_strict プリセット相当を新設)
    ├─ 7) AI 呼び出し (src/lib/ai/identityOcr.ts)
    │     - 画像 + 想定書類タイプ
    │     - zod structured output: name, birth_date, address, postal_code, …
    │     - "個人番号 / 本籍 / 保険者番号は絶対に出力するな" を system に明示
    ├─ 8) PII フィルタ (12桁数字 / 本籍ラベル等を post-validate で reject)
    ├─ 9) 結果を返す (DB 保存はしない、ステートレス)
    ▼
[フロント]
    │
    ├─ 10) 取得結果をフォームに自動充填、すべて編集可能で表示
    ├─ 11) ユーザーが確認・修正して [登録] 押下
    └─ 12) 既存の customers 登録 API へ POST (フロー無変更)
```

**重要**: OCR レスポンスは **DB に保存しない**（ステートレス）。
画像も Storage に **永続化しない**。一時 URL のみ。

### 3.3 新規実装ファイル

| パス | 内容 |
|---|---|
| `src/lib/ai/identityOcr.ts` | Anthropic Vision 呼び出し本体。`photoQualityCheck.ts` をテンプレに |
| `src/lib/identity/ocrSchema.ts` | zod スキーマ。各書類タイプごとに分岐 |
| `src/lib/identity/ocrFilter.ts` | PII フィルタ（マイナンバー検知・本籍除去） |
| `src/app/api/identity/ocr/route.ts` | エンドポイント |
| `src/components/admin/customers/IdentityScanButton.tsx` | Web 撮影 UI |
| `apps/mobile/src/components/IdentityScanButton.tsx` | RN 撮影 UI |
| `src/lib/ai/__tests__/identityOcr.test.ts` | サンプル画像で snapshot テスト |

### 3.4 既存ファイルの変更

| パス | 変更 |
|---|---|
| `apps/mobile/src/app/customers/new.tsx:68-69` | フォーム冒頭に `<IdentityScanButton onComplete={(d) => setForm({...form, ...d})} />` |
| `src/app/customer/[tenant]/login/page.tsx` | 「写真で入力」を追加 |
| `src/app/sign/[token]/SignatureClient.tsx` | 同意前ステップとして「身分証で氏名自動入力」を追加（任意） |
| `src/app/agent-sign/[token]/AgentSignClient.tsx` | 同上 |
| `src/lib/api/rateLimit.ts` | `identity_ocr` プリセット追加（30 req / 1 hour / tenant） |
| `package.json` | （Anthropic SDK 既にあるので変更不要） |

### 3.5 zod スキーマ例

```ts
// src/lib/identity/ocrSchema.ts
import { z } from "zod";

export const DocTypeSchema = z.enum([
  "driver_license",
  "mynumber_card_front",  // 顔写真面のみ
  "residence_card",
  "passport",
  "health_insurance_card",
]);

export const OcrResultSchema = z.object({
  doc_type: DocTypeSchema,
  confidence: z.number().min(0).max(1),
  fields: z.object({
    name: z.string().optional(),
    name_kana: z.string().optional(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    postal_code: z.string().regex(/^\d{3}-?\d{4}$/).optional(),
    address: z.string().optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
    expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  rejected_reasons: z.array(z.string()),  // "個人番号が映っていたため処理を中断" 等
  warnings: z.array(z.string()),          // "住所の一部がぼやけています" 等
});
```

### 3.6 System プロンプト要点

```
あなたは日本の身分証から「自動入力補助」のために必要な情報だけを抽出する OCR アシスタントです。

以下は絶対に出力してはいけません:
- マイナンバー（12桁の個人番号）
- 本籍（運転免許証の「本籍」欄）
- 健康保険証の保険者番号 / 記号 / 番号 / 枝番
- パスポート番号の完全な値
- 顔写真の情報

これらが画像に映っている場合、その項目を出力せず、rejected_reasons に理由を記録してください。
マイナンバー裏面（個人番号が大きく印字された面）が送られてきた場合は、
全フィールドを空にして "マイナンバー裏面は処理対象外" を rejected_reasons に入れて返してください。

これは本人確認ではありません。あくまでフォーム入力の自動化です。
読み取れない箇所は空欄のままにし、ユーザーが手で修正します。
```

### 3.7 セキュリティ要件

1. **画像の非永続化**: アップロードされた画像は OCR 完了後に即破棄。
   ステージング/本番ともに Supabase Storage には保存しない（メモリ上のみ）
2. **PII の最小化**: OCR レスポンスを Sentry / `logger` に送る際は `secret マスク` を拡張し、
   `birth_date` / `address` を [REDACTED] に置換
3. **個人番号検出 trip wire**:
   - サーバ側の post-validate で OCR レスポンス全文を `/\b\d{12}\b/` でスキャン
   - ヒットしたら **400 を返してリクエスト全体を破棄**
   - `logger.error({ event: "mynumber_detected" })` を発火（PII 本体は記録せず件数のみ）
4. **rate limit**: tenant あたり 1 時間 30 件、IP あたり 1 時間 100 件
5. **同意取得**: 撮影前に必ず「自動入力のために画像を送信します。保存はしません」を表示
6. **CSP**: 既存の nonce-based CSP は維持。新規 API は同 origin

### 3.8 コスト試算（月1,000件想定）

| 項目 | 金額 |
|---|---|
| Sonnet 4.6 Vision 入力 (1600px JPEG, 約1500 tokens) | $0.0045 |
| Sonnet 4.6 出力 (約300 tokens) | $0.0045 |
| **1件あたり** | **約 $0.01 ≒ 1.5円** ※ 余裕を見て 3円で計上 |
| 月1,000件 | **約 3,000円/月** |
| 年12,000件 | **約 36,000円/年** |
| 開発工数 (1.0 人月相当) | 約 100 万円 |
| **初年度合計** | **約 100 万円**（開発主体、API 費はほぼ誤差） |

※ 開発工数は v1 と同じ前提（エンジニア人月 ~100万円）
※ 翌年度以降は **約 4 万円/年**（API 費のみ）

### 3.9 Phase 1 スケジュール

| Week | 内容 |
|---|---|
| 1 | `identityOcr.ts` + zod schema 実装 + Snapshot テスト |
| 1 | PII フィルタ + 個人番号 trip wire |
| 2 | Web 側 `IdentityScanButton` + 顧客ポータルに統合 |
| 2 | モバイル側 `IdentityScanButton` + `customers/new.tsx` に統合 |
| 3 | 電子署名フローへの組込み (任意) |
| 3 | rate limit / logger マスク / 同意 UI |
| 4 | 本物の身分証サンプルで QA (社内・最低 4 種類 × 各 10 枚) |

→ **約 4 週間で本番投入可能**。

---

## 4. Phase 1 の限界と Phase 2 への接続

### 4.1 OCR + AI でできないこと

| 観点 | OCR + AI | JPKI/eKYC |
|---|---|---|
| 本人確認の法的効力 | ✗（あくまで自動入力） | ◎（犯収法・電子署名法対応） |
| 偽造身分証の検知 | △（AI で違和感は分かるが信頼性低） | ◎（J-LIS の CRL チェック） |
| 「本人確認済み」バッジ表示 | ✗ | ◎ |
| 保険会社からの本人確認エビデンス要求 | ✗ | ◎ |
| 電子署名の証拠力（実印相当） | ✗（手書き署名のまま） | ◎（CAdES-T） |
| ランニングコスト | ほぼゼロ | 1件 200〜500円 |

**結論**: OCR + AI は **顧客体験の向上ツール**であり、**本人確認の代替ではない**。
法的本人確認が必要な局面が出てきた段階で Phase 2 を発動する。

### 4.2 Phase 2 を発動すべきトリガー

- 損保会社との連携で「取引時確認済みの顧客」要件が契約条件になった
- 中古車マーケットで一定額以上の取引が発生し、犯収法対応が必要になった
- 電子署名の証拠力で訴訟対応が必要になり、手書き署名では足りないケースが出た
- 競合（Slim Hub・GO 等）が JPKI 対応を打ち出し、差別化要素として必要になった

→ 上記いずれかが発生したら Phase 2 (TRUSTDOCK or 他 eKYC SaaS or J-LIS 認定) を起動。

---

## 5. Phase 2: JPKI 路線（並行調査・トリガー発生で起動）

### 5.1 3 方式の比較

| 方式 | 1件単価 | 月額固定 | 初期 | 認定/契約期間 | RN SDK |
|---|---|---|---|---|---|
| **TRUSTDOCK** | 280円 | 120,000円 | 750,000円（正式見積） | 1〜2ヶ月 | ◯ |
| xID | 100〜300円 | 50,000円〜 | 〜30万円 | 1〜2ヶ月 | ◯ |
| Pocket Sign | 300〜500円/署名 | 要見積 | 要見積 | 1〜2ヶ月 | ◯（β） |
| 自社 JPKI 直接 | 0円 | サーバ運用 | 数千万円 + J-LIS 認定 | **6〜12ヶ月** | 自前実装 |
| マイナポータル連携 | 0円 | – | デジタル庁申請 | **数ヶ月〜** | 制約あり |

### 5.2 月間件数別 TRUSTDOCK 初年度コスト試算

| 月間件数 | 年間 | 初年度合計 |
|---|---|---|
| 100 件 | 1,200 件 | 約 453 万円 |
| 500 件 | 6,000 件 | 約 587 万円 |
| 1,000 件 | 12,000 件 | 約 755 万円 |
| 3,000 件 | 36,000 件 | 約 1,427 万円 |

**損益分岐**: 月額固定 12万円 ÷ 280円 = **約 428 件/月**
- これ以下なら xID や Pocket Sign の従量プランの方が安い可能性
- これ以上なら TRUSTDOCK の単価優位性が活きる

### 5.3 Phase 2 で追加される DB スキーマ

```sql
-- supabase/migrations/20260801000000_identity_verifications.sql
CREATE TABLE customer_identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  provider text NOT NULL,           -- 'trustdock' | 'xid' | 'pocket_sign'
  provider_verification_id text NOT NULL,
  method text NOT NULL,             -- 'jpki' | 'jpki_signed' | 'document_photo'
  status text NOT NULL,
  verified_at timestamptz,
  verified_name text,
  verified_birth_date date,
  verified_postal_code text,
  verified_address text,
  verified_gender text,
  signature_payload_hash text,
  signed_certificate_serial text,
  raw_provider_payload jsonb,       -- 90日でローテーション
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (provider, provider_verification_id)
);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verification_id uuid
    REFERENCES customer_identity_verifications(id) ON DELETE SET NULL;

-- 誤って個人番号が混入しないための trip wire
ALTER TABLE customers
  ADD CONSTRAINT customers_no_mynumber CHECK (
    note IS NULL OR note !~ '^\d{12}$'
  );
```

---

## 6. Phase 3: OCR + JPKI 共存運用

### 6.1 ユーザー視点のフロー

```
[顧客新規登録画面]
   │
   ├─ [写真で自動入力] ボタン   ← Phase 1 (常時提供・無料・本人確認なし)
   │
   └─ [マイナンバーカードで本人確認] ボタン  ← Phase 2 (オプション or 必須案件のみ)
        ├ 本人確認済みバッジ付与
        └ 保険会社向けエビデンス保存
```

### 6.2 customers テーブルの状態遷移

| ステータス | identity_verified_at | 取得方法 | 用途 |
|---|---|---|---|
| 自動入力のみ | NULL | OCR (Phase 1) | 通常案件 |
| 本人確認済み | timestamptz | JPKI (Phase 2) | 保険連携・高額取引 |

→ 同一顧客が Phase 1 → Phase 3 で「ランクアップ」する経路を持つ。
   既存データの再 OCR や移行作業は不要（OCR は DB 保存しないため）。

---

## 7. 法令チェックリスト（全フェーズ共通）

- [ ] **番号利用法**: 個人番号本体を取得・保存しない設計 (Phase 1 で trip wire、Phase 2 で CHECK 制約)
- [ ] **個人情報保護法**: 取得目的（自動入力 / 本人確認）の明示・本人同意の取得
- [ ] **要配慮個人情報**: 本籍・保険者番号を取得しない（OCR フィルタで除外）
- [ ] **画像の保存**: Phase 1 では永続化しない（メモリ上のみ）
- [ ] **犯収法**: Phase 1 は対象外。Phase 2 で eKYC SaaS に依拠
- [ ] **電子署名法**: Phase 1 は手書き署名のまま。Phase 2 で JPKI 署名 (§3 認定)
- [ ] **プライバシーポリシー**: 取得項目・処理委託先（Anthropic / TRUSTDOCK）を記載
- [ ] **PIA**: 生年月日・住所を新規取得するため Phase 1 着手前に実施推奨

---

## 8. オープン課題

1. **モバイル版で身分証画像をどう送るか**:
   現状 Ledra モバイルは Supabase 直接 INSERT が多い（`apps/mobile/src/app/customers/new.tsx:27-28`）。
   OCR 用のサーバエンドポイントは別途必要 → Bff 経由のデザインに統一する
2. **オフライン対応**: `docs/pwa-cert-offline-design.md` で進めている PWA オフライン路線では
   OCR API が叩けない → 手動入力フォールバックを必ず残す
3. **Anthropic API のレート制限**: tier によっては大量同時 OCR でスロットルされる
   → tier アップ or キューイング (QStash) で吸収
4. **多言語身分証**: パスポートが英語表記の場合に氏名カナをどう生成するか
   → 別途プロンプトで「カナ推定」を追加するか、カナは手入力に倒す
5. **AI の誤認識リスク開示**: 「自動入力結果は必ず確認してください」を UI で明示
6. **個人番号面 (裏面) を間違えて送ってきたユーザー対応**: 検出 → 自動破棄 →
   「マイナンバー面は撮影しないでください」を明確に表示
7. **PIN 失念時のフォールバック** (Phase 2): 手書き署名・OCR 自動入力に縮退

---

## 9. 次のアクション

### Phase 1 (即着手)
1. **意思決定**: Phase 1 着手の Go/NoGo (1 営業日)
2. **実装着手**: 上記スケジュール 4 週間
3. **本番投入**: 1 テナント PoC → 全テナント roll out

### Phase 2 (並行調査・トリガー待ち)
1. **TRUSTDOCK / xID / Pocket Sign 3 社の RFP**: 月間件数別単価・JPKI フロー UX サンプル
2. **損保 / 中古車マーケットの本人確認要件ヒアリング**
3. **競合（Slim Hub・GO・Drivvic 等）の本人確認方式の継続ウォッチ**

---

## 10. 参考リンク

- 番号利用法（行政手続における特定の個人を識別するための番号の利用等に関する法律）
- 個人情報保護法・要配慮個人情報の取扱い
- 公的個人認証サービス（JPKI）: J-LIS 公式
- デジタル庁: マイナポータル API 連携ガイドライン
- 電子署名法施行規則 第2条第3項
- 個人情報保護委員会: 個人番号の取扱いに関するガイドライン
- Anthropic Vision API ドキュメント
