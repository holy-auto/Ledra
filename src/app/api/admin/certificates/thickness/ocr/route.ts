/**
 * POST /api/admin/certificates/thickness/ocr
 *
 * 膜厚計の表示 / 手書き測定シートの写真から、部位別の施工前後 μm を Vision OCR で抽出し、
 * 証明書フォームの膜厚セクション (FilmThicknessSection) の手打ちを減らす。
 * 結果は DB に永続化しない（抽出値は編集可能な行としてフォームに差し込み、人が確定する）。
 *
 * Body: multipart/form-data
 *   - image: File (image/jpeg | image/png | image/webp, <= 8MB)
 *
 * Auth: 施工店セッション (staff 以上)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { extractThicknessReadings } from "@/lib/ai/thicknessGaugeOcr";
import { mapPanelToPreset } from "@/lib/certificates/thicknessPanels";
import { loadAiAutomationSettings, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  // 1) IP ベースの rate limit（identity OCR と同じ preset を流用）
  const ipLimit = await checkRateLimit(req, "identity_ocr");
  if (ipLimit) return ipLimit;

  // 2) 認証（staff 以上）
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  // 3) テナント単位の rate limit
  const tenantLimit = await checkRateLimit(req, "identity_ocr", `tenant:${caller.tenantId}`);
  if (tenantLimit) return tenantLimit;

  // 4) multipart 解析
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiValidationError("Content-Type は multipart/form-data を指定してください");
  }
  const form = await req.formData().catch(() => null);
  if (!form) return apiValidationError("multipart の解析に失敗しました");

  const file = form.get("image");
  if (!(file instanceof File)) return apiValidationError("image フィールドに画像を添付してください");
  if (file.size === 0) return apiValidationError("ファイルが空です");
  if (file.size > MAX_FILE_BYTES) {
    return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024}MB を超えています`);
  }
  const mime = file.type;
  if (!ALLOWED_MIME.has(mime)) return apiValidationError("対応形式は JPEG / PNG / WebP です");

  // 5) AI マスタースイッチ OFF / 月次コストキャップ超過時はスキップして手打ちにフォールバック
  const usage = startAiRouteUsage("/api/admin/certificates/thickness/ocr");
  const aiSettings = await loadAiAutomationSettings(caller.tenantId);
  // グローバル停止に加え、管理者が「書類画像を Vision に送る」情報源を無効化していれば
  // 画像を Anthropic に送らず手打ちにフォールバックする。膜厚計表示/測定シートの読取は
  // 車検証 OCR (parse-shakken) と同じ「書類画像→フィールド抽出」なので identity_documents で判定。
  if (!aiSettings.enabled || !isSourceAllowed(aiSettings, "identity_documents")) {
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
    return apiOk({
      status: "skipped" as const,
      readings: [],
      notice: "AI 自動入力が停止中のため OCR を実行しませんでした。手動で入力してください。",
    });
  }

  // 6) Vision 呼び出し
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractThicknessReadings(base64, mime as "image/jpeg" | "image/png" | "image/webp");

    // 部位名を標準部位へ寄せる（保守的・純関数）。
    const readings = result.readings.map((r) => ({
      location: mapPanelToPreset(r.location),
      before_um: r.before_um,
      after_um: r.after_um,
      notes: r.notes ?? "",
    }));

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { reading_count: readings.length },
    });

    return apiOk({ status: "ok" as const, readings, confidence: result.confidence });
  } catch (err) {
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "error" });
    return apiInternalError(err, "POST /api/admin/certificates/thickness/ocr");
  }
}
