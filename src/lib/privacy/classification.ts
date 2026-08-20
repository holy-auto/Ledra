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
  {
    table: "tenant_secrets",
    column: "encrypted_value",
    classification: "restricted",
    reason: "AES-256-GCM 暗号化シークレット",
  },

  // ── PII ──
  { table: "customers", column: "name", classification: "pii", reason: "顧客氏名" },
  { table: "customers", column: "email", classification: "pii", reason: "顧客メール" },
  { table: "customers", column: "phone", classification: "pii", reason: "顧客電話番号" },
  { table: "vehicles", column: "customer_name", classification: "pii", reason: "顧客氏名（レガシー）" },
  { table: "vehicles", column: "customer_email", classification: "pii", reason: "顧客メール（レガシー）" },
  { table: "vehicles", column: "customer_phone_masked", classification: "pii", reason: "顧客電話番号（レガシー）" },
  { table: "vehicles", column: "customer_id", classification: "pii", reason: "顧客 FK（間接 PII）" },
  { table: "vehicles", column: "notes", classification: "pii", reason: "自由記述（PII 含みうる）" },
  { table: "vehicle_passports", column: "current_owner_name", classification: "pii", reason: "所有者氏名" },
  { table: "vehicle_passports", column: "current_owner_email", classification: "pii", reason: "所有者メール" },
  { table: "certificates", column: "customer_name", classification: "pii", reason: "顧客氏名" },
  { table: "certificates", column: "content_free_text", classification: "pii", reason: "PII 含みうる自由記述" },
  { table: "hearings", column: "content", classification: "pii", reason: "ヒアリング内容" },
  { table: "reservations", column: "work_lat", classification: "pii", reason: "顧客宅位置情報" },
  { table: "reservations", column: "work_lng", classification: "pii", reason: "顧客宅位置情報" },

  // ── Confidential ──
  { table: "invoices", column: "total_amount", classification: "confidential", reason: "決済情報" },
  { table: "tenants", column: "stripe_customer_id", classification: "confidential", reason: "決済 ID" },
  { table: "insurer_cases", column: "claim_amount", classification: "confidential", reason: "保険案件金額" },
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
 */
export function maxClassification(
  fields: readonly { table: string; column: string }[],
  defaultClassification: DataClassification = "public",
): DataClassification {
  if (fields.length === 0) return defaultClassification;
  let result = defaultClassification;
  for (const f of fields) {
    const c = getFieldClassification(f.table, f.column, defaultClassification);
    result = stricterOf(result, c);
  }
  return result;
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
