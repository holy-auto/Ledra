import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseShakenshoAuto, calcSizeClass } from "@/lib/ocr/shakensho";
import { escapeIlike } from "@/lib/sanitize";
import { loadAiAutomationSettings, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Maximum image size: 10 MB */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** 兄弟 OCR ルート(thickness/inspection)と揃えた対応画像形式。 */
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** AI 停止 / コストキャップ超過時に返す空レスポンス（フォームは手入力にフォールバック）。 */
const AI_DISABLED_RESPONSE = {
  source: null,
  size_class: null,
  volume_m3: null,
  dimensions: null,
  parsed: {
    maker: null,
    model: null,
    vin: null,
    weight_kg: null,
    displacement_cc: null,
    first_registration: null,
  },
  master_size_class: null,
  message: "AI 自動入力が停止中のため OCR を実行しませんでした。手動で入力してください。",
} as const;

/**
 * POST /api/admin/vehicle-size/ocr
 *
 * Accept a vehicle inspection certificate image (multipart/form-data)
 * and return parsed dimensions, size_class, and other metadata.
 */
export async function POST(req: NextRequest) {
  // 1) IP ベースの rate limit（兄弟 OCR ルートと同じ preset）。Vision コストの暴発を防ぐ。
  const ipLimit = await checkRateLimit(req, "identity_ocr");
  if (ipLimit) return ipLimit;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 2) 認証（staff 以上）。viewer など閲覧専用ロールに Vision を叩かせない。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // 3) テナント単位の rate limit
    const tenantLimit = await checkRateLimit(req, "identity_ocr", `tenant:${caller.tenantId}`);
    if (tenantLimit) return tenantLimit;

    // --- Parse multipart form data ---
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file || !(file instanceof File)) {
      return apiValidationError("画像ファイルが必要です。'image' フィールドにファイルを添付してください。");
    }

    if (file.size === 0) {
      return apiValidationError("ファイルが空です。");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return apiValidationError("画像サイズが大きすぎます（上限 10MB）。");
    }

    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return apiValidationError("対応形式は JPEG / PNG / WebP です。");
    }

    // 4) AI マスタースイッチ OFF / 月次コストキャップ超過時はスキップして手入力にフォールバック。
    // 車検証画像→フィールド抽出なので識別情報系(identity_documents)として判定する。
    const usage = startAiRouteUsage("/api/admin/vehicle-size/ocr");
    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    if (!aiSettings.enabled || !isSourceAllowed(aiSettings, "identity_documents")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk(AI_DISABLED_RESPONSE);
    }

    // Convert to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // --- 2D code → OCR フォールバック ---
    // このルートはサイズクラス判定で寸法（長さ・幅・高さ・重量）が必須。
    // QR には寸法が含まれないため、QR のみでは必ず OCR 併用になる。
    const { data: parsed, source } = await parseShakenshoAuto(imageBuffer, {
      requireFields: ["maker", "length_mm", "width_mm", "height_mm", "weight_kg"],
    });

    // --- Calculate size_class from dimensions if available ---
    let size_class: string | null = null;
    let volume_m3: number | null = null;

    if (parsed.length_mm && parsed.width_mm && parsed.height_mm) {
      size_class = calcSizeClass(parsed.length_mm, parsed.width_mm, parsed.height_mm);
      volume_m3 = Math.round(((parsed.length_mm * parsed.width_mm * parsed.height_mm) / 1e9) * 100) / 100;
    }

    // --- Also try maker/model lookup from master for comparison ---
    let master_size_class: string | null = null;
    if (parsed.maker) {
      const model = parsed.model ?? "";
      const { data: exact } = await supabase
        .from("vehicle_size_master")
        .select("size_class")
        .eq("maker", parsed.maker)
        .eq("model", model)
        .limit(1)
        .maybeSingle();

      if (exact?.size_class) {
        master_size_class = exact.size_class;
      } else if (model) {
        // Partial match fallback
        const { data: partial } = await supabase
          .from("vehicle_size_master")
          .select("size_class")
          .eq("maker", parsed.maker)
          .ilike("model", `%${escapeIlike(model)}%`)
          .limit(1)
          .maybeSingle();

        if (partial?.size_class) {
          master_size_class = partial.size_class;
        }
      }
    }

    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ok" });

    return apiOk({
      source,
      size_class,
      volume_m3,
      dimensions:
        parsed.length_mm && parsed.width_mm && parsed.height_mm
          ? {
              length_mm: parsed.length_mm,
              width_mm: parsed.width_mm,
              height_mm: parsed.height_mm,
            }
          : null,
      parsed: {
        maker: parsed.maker ?? null,
        model: parsed.model ?? null,
        vin: parsed.vin ?? null,
        weight_kg: parsed.weight_kg ?? null,
        displacement_cc: parsed.displacement_cc ?? null,
        first_registration: parsed.first_registration ?? null,
      },
      master_size_class,
    });
  } catch (e) {
    return apiInternalError(e, "vehicle-size/ocr");
  }
}
