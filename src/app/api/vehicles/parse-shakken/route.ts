import { apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { parseShakenshoAuto } from "@/lib/ocr/shakensho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Convert Japanese era date string to western year, or return null. */
function toWesternYear(firstRegistration: string | undefined): number | null {
  if (!firstRegistration) return null;

  // Already western year: "2022年3月" or "2022/3"
  const westernMatch = firstRegistration.match(/^(\d{4})/);
  if (westernMatch) {
    const y = parseInt(westernMatch[1], 10);
    if (y > 1900 && y < 2100) return y;
  }

  // Japanese era
  const eraPatterns: [RegExp, number][] = [
    [/令和\s*(\d+)/, 2018],  // Reiwa: 2019 = 令和1
    [/平成\s*(\d+)/, 1988],  // Heisei: 1989 = 平成1
    [/昭和\s*(\d+)/, 1925],  // Showa: 1926 = 昭和1
    [/大正\s*(\d+)/, 1911],  // Taisho: 1912 = 大正1
  ];

  for (const [re, base] of eraPatterns) {
    const m = firstRegistration.match(re);
    if (m) return base + parseInt(m[1], 10);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return apiValidationError("ファイルが見つかりません。");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return apiValidationError("JPG / PNG / GIF / WEBP 形式の画像を選択してください。");
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const { data: parsed, source } = await parseShakenshoAuto(imageBuffer);

    return Response.json({
      ok: true,
      source,
      extracted: {
        maker: parsed.maker ?? null,
        model: parsed.model ?? null,
        year: toWesternYear(parsed.first_registration),
        vin_code: parsed.vin ?? null,
        plate_display: parsed.plate_display ?? null,
      },
    });
  } catch (e) {
    return apiInternalError(e, "parse-shakken");
  }
}
