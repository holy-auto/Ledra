/**
 * 点検写真 OCR — zod スキーマ + 正規化 (純関数)。
 *
 * 用途: 「写真を撮るだけで点検表が完成」の入力補助。
 * 対応: 走行距離メーター (odometer) / タイヤ残溝・劣化 (tire)。
 *
 * 方針 (身分証 OCR `src/lib/identity/ocrSchema.ts` と同じ思想):
 * - 結果は DB に永続化しない。点検記録フォームへの自動入力のみに使う。
 *   確定 (保存) は必ず人が行う。読み取れない値は null + warning で返し、
 *   AI に数字を「それらしく」創作させない (ハルシネーション禁止)。
 * - 正規化は純関数 (`normalizeInspectionOcr`) に閉じ込め、単体テストで担保する。
 */
import { z } from "zod";

/** 点検 OCR の対象種別。1 リクエスト 1 対象。 */
export const InspectionOcrTargetSchema = z.enum(["odometer", "tire"]);
export type InspectionOcrTarget = z.infer<typeof InspectionOcrTargetSchema>;

/** タイヤの装着位置 (画像から判別できた場合のみ)。 */
export const TirePositionSchema = z.enum(["front_left", "front_right", "rear_left", "rear_right", "unknown"]);
export type TirePosition = z.infer<typeof TirePositionSchema>;

/**
 * Vision に出力させるフラットなスキーマ。
 * discriminated union は structured output で不安定なので、対象に無関係な
 * フィールドは null で返させる (odometer なら tire 系を null、tire なら mileage を null)。
 */
export const InspectionOcrResultSchema = z.object({
  target: InspectionOcrTargetSchema,
  /** モデルの自己評価 (0.0〜1.0)。低いと Opus へ昇格する。 */
  confidence: z.number().min(0).max(1),
  /** 走行距離 (km, 総走行距離。トリップメーターは無視)。読めなければ null。 */
  mileage_km: z.number().int().nonnegative().nullable(),
  /** タイヤ残溝 (mm)。読めなければ null。 */
  tread_depth_mm: z.number().nonnegative().nullable(),
  /** タイヤ装着位置。判別不能は "unknown"、そもそもタイヤでなければ null。 */
  tire_position: TirePositionSchema.nullable(),
  /** スリップサイン露出の有無。判別不能は null。 */
  slip_sign_exposed: z.boolean().nullable(),
  /** 劣化所見 (ひび割れ / 偏摩耗 / 溝内亀裂 など)。無ければ空配列。 */
  condition_notes: z.array(z.string()),
  /** 読み取り上の注意 (ブレ / 反射 / 一部欠け など)。 */
  warnings: z.array(z.string()),
});
export type InspectionOcrResult = z.infer<typeof InspectionOcrResultSchema>;

/** タイヤ残溝の物理的上限 (新品でも 10mm 前後。20 超は誤読とみなす)。 */
const MAX_PLAUSIBLE_TREAD_MM = 20;
/** 走行距離の物理的上限 (200 万 km 超は誤読とみなす)。 */
const MAX_PLAUSIBLE_MILEAGE_KM = 2_000_000;
/** 法定使用限度 (スリップサイン露出) は 1.6mm。これ以下は交換相当。 */
export const TIRE_LEGAL_LIMIT_MM = 1.6;
/** 交換推奨のしきい値 (残 3mm 以下で推奨とする現場基準)。 */
export const TIRE_REPLACE_ADVISE_MM = 3;

/**
 * OCR 生結果を「フォーム自動入力に載せられる形」へ正規化する純関数。
 *
 * - 対象に無関係なフィールドを落とす (odometer なら tire 系、tire なら mileage)。
 * - 物理的にありえない値 (負・上限超・NaN) を null に倒し、warning を積む。
 * - condition_notes / warnings は trim + 空除去 + 重複排除。
 *
 * DB を触らないので API ルート / cron / テストから何度でも呼べる。
 */
export function normalizeInspectionOcr(input: InspectionOcrResult): InspectionOcrResult {
  const warnings = new Set(cleanStrings(input.warnings));
  const conditionNotes = cleanStrings(input.condition_notes);

  let mileageKm = input.mileage_km;
  let treadDepthMm = input.tread_depth_mm;
  let tirePosition = input.tire_position;
  let slipSignExposed = input.slip_sign_exposed;

  if (input.target === "odometer") {
    // 走行距離のみ採用。tire 系は捨てる (混入していても無視)。
    treadDepthMm = null;
    tirePosition = null;
    slipSignExposed = null;
    if (mileageKm != null && (!Number.isFinite(mileageKm) || mileageKm < 0 || mileageKm > MAX_PLAUSIBLE_MILEAGE_KM)) {
      warnings.add("走行距離の読み取り値が妥当範囲外のため破棄しました。手動で確認してください。");
      mileageKm = null;
    }
  } else {
    // タイヤのみ採用。mileage は捨てる。
    mileageKm = null;
    if (
      treadDepthMm != null &&
      (!Number.isFinite(treadDepthMm) || treadDepthMm < 0 || treadDepthMm > MAX_PLAUSIBLE_TREAD_MM)
    ) {
      warnings.add("タイヤ残溝の読み取り値が妥当範囲外のため破棄しました。手動で確認してください。");
      treadDepthMm = null;
    }
    if (tirePosition == null) tirePosition = "unknown";
  }

  return {
    target: input.target,
    confidence: clamp01(input.confidence),
    mileage_km: mileageKm,
    tread_depth_mm: treadDepthMm,
    tire_position: tirePosition,
    slip_sign_exposed: slipSignExposed,
    condition_notes: conditionNotes,
    warnings: [...warnings],
  };
}

/**
 * タイヤの残溝・スリップサインから交換要否の目安を返す (純関数)。
 * 「次回提案」欄の下書きに使う。医療診断ではなく現場基準の目安。
 */
export type TireAdvice = "replace_now" | "replace_soon" | "ok" | "unknown";

export function assessTire(result: Pick<InspectionOcrResult, "tread_depth_mm" | "slip_sign_exposed">): TireAdvice {
  if (result.slip_sign_exposed === true) return "replace_now";
  const mm = result.tread_depth_mm;
  if (mm == null) return "unknown";
  if (mm <= TIRE_LEGAL_LIMIT_MM) return "replace_now";
  if (mm <= TIRE_REPLACE_ADVISE_MM) return "replace_soon";
  return "ok";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function cleanStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
