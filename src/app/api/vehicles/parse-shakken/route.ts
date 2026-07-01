import { apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { parseShakenshoAuto, extractFirstRegistrationYear, calcSizeClass } from "@/lib/ocr/shakensho";
import { loadAiAutomationSettings, filterVehicleOcrByPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { fuzzyMatchCustomer, type CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const EMPTY_VEHICLE_OCR = {
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
};

export async function POST(req: Request) {
  const usage = startAiRouteUsage("/api/vehicles/parse-shakken");
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
    // AI マスタースイッチ OFF / 月次コストキャップ超過時は enabled=false に倒るので
    // OCR (課金) を呼ばず空の抽出結果を返す。identity_documents ソース OFF も同様。
    const automation = await loadAiAutomationSettings(caller.tenantId);
    if (!automation.enabled || !isSourceAllowed(automation, "identity_documents")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return Response.json({
        ok: true,
        source: "disabled",
        extracted: EMPTY_VEHICLE_OCR,
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

    // 実際に Vision を呼んだ場合のトークンを usageContext が捕捉済み。ok 記録で
    // recordRouteUsage が実コストを月次キャップに計上する (QR のみ等トークン0なら課金0)。
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ok", meta: { source } });

    // 車検証の所有者/使用者氏名を既存顧客に名寄せし、連携候補を返す。
    // 生の氏名 (PII) ではなく「一致した既存顧客」だけを返す。決定的マッチのみ
    // (AI オフ) で、confidence >= 0.6 のときのみ候補として提示する。
    let customer_suggestion: { id: string; name: string; confidence: number; method: string } | null = null;
    try {
      const ownerName = parsed.owner_name?.trim() || parsed.user_name?.trim() || null;
      if (ownerName) {
        const { data: candidates } = await supabase
          .from("customers")
          .select("id, name, name_kana, phone, email")
          .eq("tenant_id", caller.tenantId);
        if (candidates && candidates.length > 0) {
          const match = await fuzzyMatchCustomer(
            { query: { name: ownerName }, candidates: candidates as CustomerCandidate[] },
            { ai: false },
          );
          if (match.best && match.confidence >= 0.6) {
            customer_suggestion = {
              id: match.best.candidate.id,
              name: match.best.candidate.name,
              confidence: match.confidence,
              method: match.method,
            };
          }
        }
      }
    } catch (e) {
      logger.warn("[parse-shakken] customer suggestion failed", {
        err: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({
      ok: true,
      source,
      extracted: filtered.extracted,
      policies: filtered.policies,
      customer_suggestion,
    });
  } catch (e) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "parse-shakken");
  }
}
