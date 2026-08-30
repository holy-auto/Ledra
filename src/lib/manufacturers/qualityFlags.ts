// ============================================================
// Manufacturer certificate quality flags
// ============================================================
// Objective, rule-based checks (no AI) that flag certificates
// issued under a manufacturer's design which fall below basic
// brand-protection standards. Manufacturers use this to coach
// or, in the worst case, revoke under-performing contractors.
//
// Rules are intentionally conservative: each flag corresponds to
// a clearly-missing required artifact, not a subjective judgement.

export type QualityFlagCode = "no_photos" | "no_warranty" | "no_service_detail" | "no_customer_name";

export const QUALITY_FLAG_LABELS: Record<QualityFlagCode, string> = {
  no_photos: "施工写真なし",
  no_warranty: "保証情報なし",
  no_service_detail: "施工内容の記載なし",
  no_customer_name: "顧客名なし",
};

export const QUALITY_FLAG_DESCRIPTIONS: Record<QualityFlagCode, string> = {
  no_photos: "施工写真が1枚も添付されていません。",
  no_warranty: "保証期間・保証対象外のいずれも記載されていません。",
  no_service_detail: "施工内容（自由記述・コーティング剤・PPF範囲・整備・鈑金）がすべて空です。",
  no_customer_name: "顧客名が入力されていません。",
};

/** Shape needed to evaluate flags. Mirrors a subset of certificates. */
export type QualityEvalInput = {
  customer_name: string | null;
  content_free_text: string | null;
  warranty_period_end: string | null;
  warranty_exclusions: string | null;
  /* eslint-disable @typescript-eslint/no-explicit-any -- DB JSON columns */
  coating_products_json: any;
  ppf_coverage_json: any;
  maintenance_json: any;
  body_repair_json: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  image_count: number;
};

function isEmptyJsonArray(v: unknown): boolean {
  return !Array.isArray(v) || v.length === 0;
}

function isEmptyJsonObject(v: unknown): boolean {
  return !v || typeof v !== "object" || Array.isArray(v) || Object.keys(v as object).length === 0;
}

/**
 * `maintenance_json` は 2026-08-25 から施工種別を問わず走行距離を必ず持つ
 * (`createCertAction` が `mileage` を書き込む)。走行距離は「どの車か」の記録であって
 * 「何をしたか」の記録ではないので、施工内容の有無を判定するときは数に入れない。
 * これを入れると `no_service_detail` がどの証明書でも立たなくなる。
 */
const NON_SERVICE_DETAIL_KEYS = new Set(["mileage"]);

function hasNoServiceDetail(v: unknown): boolean {
  if (isEmptyJsonObject(v)) return true;
  return Object.entries(v as Record<string, unknown>).every(
    ([k, val]) => NON_SERVICE_DETAIL_KEYS.has(k) || val === null || val === undefined || val === "",
  );
}

function isBlank(v: string | null | undefined): boolean {
  return !v || v.trim().length === 0;
}

/**
 * Returns the list of quality flags a certificate trips. Empty array
 * means the certificate meets all baseline standards.
 */
export function evaluateQualityFlags(input: QualityEvalInput): QualityFlagCode[] {
  const flags: QualityFlagCode[] = [];

  if (input.image_count <= 0) flags.push("no_photos");

  if (isBlank(input.warranty_period_end) && isBlank(input.warranty_exclusions)) {
    flags.push("no_warranty");
  }

  const noServiceDetail =
    isBlank(input.content_free_text) &&
    isEmptyJsonArray(input.coating_products_json) &&
    isEmptyJsonArray(input.ppf_coverage_json) &&
    hasNoServiceDetail(input.maintenance_json) &&
    isEmptyJsonObject(input.body_repair_json);
  if (noServiceDetail) flags.push("no_service_detail");

  if (isBlank(input.customer_name)) flags.push("no_customer_name");

  return flags;
}
