import { z } from "zod";
import { apiInternalError, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { extractFirstRegistrationYear } from "@/lib/ocr/shakensho";
import { parseShakenshoCode } from "@/lib/ocr/shakensho-qr";
import { loadAiAutomationSettings, filterVehicleOcrByPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 最大 QR テキスト長（電子車検証の仕様でも数百バイト、緩めに制限） */
const MAX_RAW_LENGTH = 4096;

const parseShakkenQrSchema = z.object({
  raw: z
    .string()
    .min(1, "raw フィールド（QR コード文字列）が必要です。")
    .max(MAX_RAW_LENGTH, `raw が長すぎます（上限 ${MAX_RAW_LENGTH} 文字）。`),
});

/**
 * POST /api/vehicles/parse-shakken-qr
 *
 * クライアント側でスキャン済みの 2D コード生テキストを受け取り、
 * `parseShakenshoCode` で構造化データに変換して返す。
 *
 * 画像アップロード版 (`/parse-shakken`) に比べて:
 * - 画像送受信が不要 → レイテンシと帯域を大きく削減
 * - Claude Vision OCR を呼ばない → コストゼロ
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "vehicles:create")) return apiForbidden();

    const parsed = parseShakkenQrSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const automation = await loadAiAutomationSettings(caller.tenantId);
    if (!isSourceAllowed(automation, "identity_documents")) {
      return Response.json({
        ok: true,
        source: "disabled" as const,
        extracted: {
          maker: null,
          model: null,
          year: null,
          vin_code: null,
          plate_display: null,
          expiry_date: null,
          fuel_type: null,
        },
        policies: {},
        ai_disabled: true,
      });
    }

    const result = parseShakenshoCode(parsed.data.raw);
    if (!result) {
      return Response.json(
        {
          ok: false,
          message: "車検証の二次元コード形式として認識できませんでした。",
        },
        { status: 422 },
      );
    }

    const raw = {
      maker: result.maker ?? null,
      model: result.model ?? null,
      year: extractFirstRegistrationYear(result.first_registration),
      vin_code: result.vin ?? null,
      plate_display: result.plate_display ?? null,
      expiry_date: result.expiry_date ?? null,
      fuel_type: result.fuel_type ?? null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
      size_class: null,
    };
    const filtered = filterVehicleOcrByPolicy(raw, automation);

    return Response.json({
      ok: true,
      source: "qr" as const,
      extracted: {
        maker: filtered.extracted.maker,
        model: filtered.extracted.model,
        year: filtered.extracted.year,
        vin_code: filtered.extracted.vin_code,
        plate_display: filtered.extracted.plate_display,
        expiry_date: filtered.extracted.expiry_date,
        fuel_type: filtered.extracted.fuel_type,
      },
      policies: filtered.policies,
    });
  } catch (e) {
    return apiInternalError(e, "parse-shakken-qr");
  }
}
