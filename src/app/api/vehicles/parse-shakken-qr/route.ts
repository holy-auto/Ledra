import { z } from "zod";
import { apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { extractFirstRegistrationYear } from "@/lib/ocr/shakensho";
import { parseShakenshoCode } from "@/lib/ocr/shakensho-qr";

export const runtime = "nodejs";
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

    const parsed = parseShakkenQrSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
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

    return Response.json({
      ok: true,
      source: "qr" as const,
      extracted: {
        maker: result.maker ?? null,
        model: result.model ?? null,
        year: extractFirstRegistrationYear(result.first_registration),
        vin_code: result.vin ?? null,
        plate_display: result.plate_display ?? null,
        expiry_date: result.expiry_date ?? null,
        fuel_type: result.fuel_type ?? null,
      },
    });
  } catch (e) {
    return apiInternalError(e, "parse-shakken-qr");
  }
}
