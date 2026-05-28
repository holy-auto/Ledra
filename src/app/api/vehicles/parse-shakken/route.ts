import { apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { parseShakenshoAuto, extractFirstRegistrationYear, calcSizeClass } from "@/lib/ocr/shakensho";
import { loadAiAutomationSettings, filterVehicleOcrByPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

    // テナントの AI 自動入力ポリシーを読む。identity_documents ソースが OFF の
    // 場合は OCR 自体を呼ばずに空の抽出結果を返す (画像は破棄)。
    const automation = await loadAiAutomationSettings(caller.tenantId);
    if (!isSourceAllowed(automation, "identity_documents")) {
      return Response.json({
        ok: true,
        source: "disabled",
        extracted: {
          maker: null,
          model: null,
          year: null,
          vin_code: null,
          plate_display: null,
          expiry_date: null,
          fuel_type: null,
          length_mm: null,
          width_mm: null,
          height_mm: null,
          size_class: null,
        },
        policies: {},
        ai_disabled: true,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // maker は QR コードには含まれない（OCR 必須）ので requireFields に指定。
    // QR だけでは不足と判定され OCR を併用してマージされる。
    const { data: parsed, source } = await parseShakenshoAuto(imageBuffer, {
      requireFields: ["maker"],
    });

    const length_mm = parsed.length_mm ?? null;
    const width_mm = parsed.width_mm ?? null;
    const height_mm = parsed.height_mm ?? null;
    const size_class = length_mm && width_mm && height_mm ? calcSizeClass(length_mm, width_mm, height_mm) : null;

    const raw = {
      maker: parsed.maker ?? null,
      model: parsed.model ?? null,
      year: extractFirstRegistrationYear(parsed.first_registration),
      vin_code: parsed.vin ?? null,
      plate_display: parsed.plate_display ?? null,
      expiry_date: parsed.expiry_date ?? null,
      fuel_type: parsed.fuel_type ?? null,
      length_mm,
      width_mm,
      height_mm,
      size_class,
    };

    const filtered = filterVehicleOcrByPolicy(raw, automation);

    return Response.json({
      ok: true,
      source,
      extracted: filtered.extracted,
      policies: filtered.policies,
    });
  } catch (e) {
    return apiInternalError(e, "parse-shakken");
  }
}
