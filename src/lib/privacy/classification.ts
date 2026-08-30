/**
 * IMP-050: 4 段階データ分類（v2.0 §18 / ISO 27001 A.5.12）。
 *
 * docs/information-asset-inventory.md で定義済みの 4 分類を
 * TypeScript 型として正式化し、コードレベルの分類判定を提供する。
 *
 * - Restricted（機密）: 鍵・認証情報・本人確認 OCR・秘密鍵
 * - PII（個人データ）: 顧客氏名/連絡先・VIN・ナンバー
 * - Confidential（社外秘）: 請求/決済・テナント設定・保険案件
 * - Public（公開）: PII リダクト済み証明書ビュー・リファレンスマスタ
 *
 * 純関数。IO なし。
 */

import { VEHICLE_TABLE_PII_COLUMNS } from "@/lib/vehicles/customerRelation";

// ── 分類レベル ──

export const DATA_CLASSIFICATIONS = ["restricted", "pii", "confidential", "public"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/** 分類の厳密さ順序（0 = 最も厳しい） */
const CLASSIFICATION_ORDER: Record<DataClassification, number> = {
  restricted: 0,
  pii: 1,
  confidential: 2,
  public: 3,
};

/** a が b より厳しい分類か */
export function isStricterThan(a: DataClassification, b: DataClassification): boolean {
  return CLASSIFICATION_ORDER[a] < CLASSIFICATION_ORDER[b];
}

/** 2 つの分類のうち厳しい方を返す */
export function stricterOf(a: DataClassification, b: DataClassification): DataClassification {
  return CLASSIFICATION_ORDER[a] <= CLASSIFICATION_ORDER[b] ? a : b;
}

// ── フィールド分類レジストリ ──

/**
 * テーブル.カラム → 分類のマッピング。
 *
 * ponytail: 全カラム網羅はしない。PII/Restricted のフィールドのみ登録し、
 * 登録なし = confidential or public（呼び出し側がデフォルトを決める）。
 * 全カラム列挙は資産台帳の責務（docs/information-asset-inventory.md）。
 */
export type FieldClassificationEntry = {
  table: string;
  column: string;
  classification: DataClassification;
  /** 根拠メモ */
  reason?: string;
};

export const FIELD_CLASSIFICATIONS: readonly FieldClassificationEntry[] = [
  // ── Restricted ──
  { table: "auth.users", column: "encrypted_password", classification: "restricted", reason: "認証情報" },
  // ponytail: tenant_secrets という専用テーブルは存在しない。実際の暗号化シークレットは
  // 複数テーブルの *_ciphertext/*_hash/*_legacy カラムに保存されている（架空のテーブル名で
  // 登録すると getFieldClassification() が常に外れて confidential にフォールバックし、
  // DEFAULT_REQUIRED_VISIBILITY 経由でテナントスタッフに開示されてしまう）。以下は
  // `grep -rn "_ciphertext" supabase/migrations/` で確認した現時点の全カラム
  // （2026-08-30 時点）。新しい暗号化カラムを追加したら、この一覧にも追加すること
  // ——自動検出機構は未実装（スコープ外、将来課題）。
  {
    table: "tenants",
    column: "line_channel_secret_ciphertext",
    classification: "restricted",
    reason: "LINE暗号化シークレット",
  },
  {
    table: "tenants",
    column: "line_channel_access_token_ciphertext",
    classification: "restricted",
    reason: "LINE暗号化アクセストークン",
  },
  {
    table: "square_connections",
    column: "square_access_token_ciphertext",
    classification: "restricted",
    reason: "Square暗号化アクセストークン",
  },
  {
    table: "square_connections",
    column: "square_refresh_token_ciphertext",
    classification: "restricted",
    reason: "Square暗号化リフレッシュトークン",
  },
  {
    table: "tenants",
    column: "booking_notify_slack_webhook_ciphertext",
    classification: "restricted",
    reason: "Slack Webhook URL（暗号化）",
  },
  {
    table: "supply_partner_credentials",
    column: "api_key_ciphertext",
    classification: "restricted",
    reason: "供給パートナーAPIキー（暗号化）",
  },
  {
    table: "supply_partner_credentials",
    column: "api_secret_ciphertext",
    classification: "restricted",
    reason: "供給パートナーAPIシークレット（暗号化）",
  },
  {
    table: "supply_partner_credentials",
    column: "webhook_secret_ciphertext",
    classification: "restricted",
    reason: "Webhook署名検証シークレット（暗号化）",
  },
  {
    table: "accounting_integrations",
    column: "access_token_ciphertext",
    classification: "restricted",
    reason: "会計連携OAuthアクセストークン（暗号化）",
  },
  {
    table: "accounting_integrations",
    column: "refresh_token_ciphertext",
    classification: "restricted",
    reason: "会計連携OAuthリフレッシュトークン（暗号化）",
  },
  {
    table: "tenant_integrations",
    column: "access_token_ciphertext",
    classification: "restricted",
    reason: "外部連携OAuthアクセストークン（暗号化）",
  },
  {
    table: "tenant_integrations",
    column: "refresh_token_ciphertext",
    classification: "restricted",
    reason: "外部連携OAuthリフレッシュトークン（暗号化）",
  },
  {
    table: "tenant_private_secrets",
    column: "gcal_refresh_token_ciphertext",
    classification: "restricted",
    reason: "Googleカレンダー連携トークン（暗号化）",
  },
  {
    table: "tenant_private_secrets",
    column: "email_inbound_token_ciphertext",
    classification: "restricted",
    reason: "受信メールトークン（暗号化）",
  },
  {
    table: "tenant_private_secrets",
    column: "external_api_key_hash",
    classification: "restricted",
    reason: "外部APIキーのハッシュ",
  },
  {
    table: "tenant_private_secrets",
    column: "email_inbound_token_hash",
    classification: "restricted",
    reason: "受信メールトークンのハッシュ",
  },
  // *_legacy は暗号化移行中の平文シークレットの一時退避先（マイグレーション
  // コメント参照）。暗号化列より一段と機密性が高い。
  {
    table: "tenant_private_secrets",
    column: "gcal_refresh_token_legacy",
    classification: "restricted",
    reason: "移行中の平文トークン",
  },
  {
    table: "tenant_private_secrets",
    column: "external_api_key_legacy",
    classification: "restricted",
    reason: "移行中の平文APIキー",
  },
  {
    table: "tenant_private_secrets",
    column: "email_inbound_token_legacy",
    classification: "restricted",
    reason: "移行中の平文トークン",
  },

  // ── PII ──
  { table: "customers", column: "name", classification: "pii", reason: "顧客氏名" },
  { table: "customers", column: "name_kana", classification: "pii", reason: "顧客氏名（カナ）" },
  { table: "customers", column: "email", classification: "pii", reason: "顧客メール" },
  { table: "customers", column: "phone", classification: "pii", reason: "顧客電話番号" },
  { table: "customers", column: "postal_code", classification: "pii", reason: "顧客住所（郵便番号）" },
  { table: "customers", column: "address", classification: "pii", reason: "顧客住所" },
  { table: "customers", column: "birth_date", classification: "pii", reason: "生年月日" },
  { table: "customers", column: "note", classification: "pii", reason: "自由記述（PII 含みうる）" },
  { table: "customers", column: "line_user_id", classification: "pii", reason: "外部ID（LINE連携）" },
  // vehicles の PII カラムは VEHICLE_TABLE_PII_COLUMNS（customerRelation.ts の単一定義源）から
  // 生成する。手書きリストにすると rendition.ts の VEHICLE_PUBLIC_RULES と同じ乖離が起こる
  // （customer_name 等は削除済み、plate_display が抜けていた）。
  ...VEHICLE_TABLE_PII_COLUMNS.map(
    (column) => ({ table: "vehicles", column, classification: "pii", reason: "車両テーブルの顧客/車両PII" }) as const,
  ),
  { table: "vehicle_passports", column: "current_owner_name", classification: "pii", reason: "所有者氏名" },
  { table: "vehicle_passports", column: "current_owner_email", classification: "pii", reason: "所有者メール" },
  { table: "passport_ownership_transfers", column: "from_owner_name", classification: "pii", reason: "前所有者氏名" },
  {
    table: "passport_ownership_transfers",
    column: "from_owner_email",
    classification: "pii",
    reason: "前所有者メール",
  },
  { table: "certificates", column: "customer_name", classification: "pii", reason: "顧客氏名" },
  { table: "certificates", column: "content_free_text", classification: "pii", reason: "PII 含みうる自由記述" },
  // certificateVersion.ts が明示的に PII と識別している（maker/model/plate を含む jsonb）。
  {
    table: "certificates",
    column: "vehicle_info_json",
    classification: "pii",
    reason: "車両情報（ナンバー含む jsonb）",
  },
  // hearings に content カラムは無い。実際の PII は氏名・連絡先・車両識別情報の個別カラム。
  { table: "hearings", column: "customer_name", classification: "pii", reason: "顧客氏名" },
  { table: "hearings", column: "customer_phone", classification: "pii", reason: "顧客電話番号" },
  { table: "hearings", column: "customer_email", classification: "pii", reason: "顧客メール" },
  { table: "hearings", column: "vehicle_plate", classification: "pii", reason: "ナンバープレート" },
  { table: "hearings", column: "vehicle_vin", classification: "pii", reason: "車台番号" },
  { table: "reservations", column: "work_lat", classification: "pii", reason: "顧客宅位置情報" },
  { table: "reservations", column: "work_lng", classification: "pii", reason: "顧客宅位置情報" },

  // ── Confidential ──
  { table: "invoices", column: "total", classification: "confidential", reason: "決済情報" },
  { table: "tenants", column: "stripe_customer_id", classification: "confidential", reason: "決済 ID" },
  // insurer_cases.claim_amount という単独カラムは無く、claim_amount を含む案件情報は
  // meta（jsonb）に格納されている。FieldClassificationEntry はフラットなカラム単位の
  // モデルのため、jsonb 全体を confidential として登録する。
  {
    table: "insurer_cases",
    column: "meta",
    classification: "confidential",
    reason: "保険案件情報（claim_amount 含む jsonb）",
  },
] as const;

// ── ルックアップ ──

const _classificationMap = new Map<string, DataClassification>();
for (const entry of FIELD_CLASSIFICATIONS) {
  _classificationMap.set(`${entry.table}.${entry.column}`, entry.classification);
}

/**
 * テーブル.カラムの分類を取得。
 * 登録なしの場合は defaultClassification を返す（デフォルト: "confidential"）。
 */
export function getFieldClassification(
  table: string,
  column: string,
  defaultClassification: DataClassification = "confidential",
): DataClassification {
  return _classificationMap.get(`${table}.${column}`) ?? defaultClassification;
}

/**
 * フィールド群の最高（最も厳しい）分類を返す。
 * 空配列 → defaultClassification。
 *
 * defaultClassification は「未登録フィールドの分類」としてのみ使う
 * （getFieldClassification の第3引数に渡す）。非空配列の集計にそのまま
 * 混ぜ込むと、defaultClassification が実在フィールドより厳しい場合に
 * 常にその値が最大値として勝ってしまう（例: 全フィールドが confidential
 * でも defaultClassification="pii" を渡すと結果が pii になる）。
 */
export function maxClassification(
  fields: readonly { table: string; column: string }[],
  defaultClassification: DataClassification = "public",
): DataClassification {
  if (fields.length === 0) return defaultClassification;
  let result: DataClassification | undefined;
  for (const f of fields) {
    // defaultClassification は空配列の場合にのみ使う。個々の未登録フィールドは
    // getFieldClassification() 自身の安全なデフォルト（confidential）に
    // フェイルクローズする——ここで defaultClassification（既定 "public"）を
    // 渡すと、呼び出し側が指定しなかった場合に新規の未登録センシティブ
    // カラムが "public" 扱いになってしまう（Codex レビュー指摘）。
    const c = getFieldClassification(f.table, f.column);
    result = result === undefined ? c : stricterOf(result, c);
  }
  return result as DataClassification;
}

/**
 * フィールド群がすべて maxLevel 以下（同じかゆるい）であることを確認。
 * 違反があれば違反フィールドのリストを返す。空 = OK。
 */
export function findClassificationViolations(
  fields: readonly { table: string; column: string }[],
  maxLevel: DataClassification,
): Array<{ table: string; column: string; actual: DataClassification }> {
  const violations: Array<{ table: string; column: string; actual: DataClassification }> = [];
  for (const f of fields) {
    const actual = getFieldClassification(f.table, f.column);
    if (isStricterThan(actual, maxLevel)) {
      violations.push({ table: f.table, column: f.column, actual });
    }
  }
  return violations;
}
