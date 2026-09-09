/**
 * POST /api/mobile/vehicles/parse-shakken
 *
 * 車検証画像から車両情報を OCR で抽出する. Bearer トークン認証版.
 * Web 版 `/api/vehicles/parse-shakken`（cookie セッション認証）と中身は同じで、
 * 認証方式のみ差し替えている.
 *
 * D-A2 是正 (2026-09-08): モバイルの車両新規登録画面は cookie 認証専用の Web 版
 * ルートを Bearer トークン付きで叩いており、`server.ts` に Bearer 処理が無いため
 * 常に 401 になっていた（モバイルから車検証 OCR が機能しない）。
 *
 * Body: multipart/form-data
 *   - file: File (image/jpeg | image/png | image/gif | image/webp, <= 20 MB)
 */
import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError, apiInternalError, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseShakenshoAuto, extractFirstRegistrationYear, calcSizeClass } from "@/lib/ocr/shakensho";
import {
  loadAiAutomationSettings,
  filterVehicleOcrByPolicy,
  isSourceAllowed,
  resolveFieldPolicy,
} from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { fuzzyMatchCustomer, type CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";
import { logger } from "@/lib/logger";
import { detectMagicByteMime } from "@/lib/media/magicBytes";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 兄弟 OCR ルート (certificates/images/upload, mobile/identity/ocr) と揃えた上限。
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

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

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/mobile/vehicles/parse-shakken");
  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "vehicles:create")) return apiForbidden();

    // 車検証 OCR は Vision モデルを叩くので呼ぶたびに費用が出る。
    // 画像を buffer 化する前に弾く。
    const limited = await checkRateLimit(req, "ai", `parse-shakken:${caller.tenantId}`);
    if (limited) return limited;

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiValidationError("Content-Type は multipart/form-data を指定してください");
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) return apiValidationError("multipart の解析に失敗しました");

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiValidationError("ファイルが見つかりません。");
    }
    if (file.size === 0) return apiValidationError("ファイルが空です");
    if (!ALLOWED_MIME.has(file.type)) {
      return apiValidationError("JPG / PNG / GIF / WEBP 形式の画像を選択してください。");
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_BYTES / 1024 / 1024}MB）。`);
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

    // 申告 MIME ではなく実バイト (マジックバイト) で画像形式を検証してから
    // sharp / base64 / Vision に渡す。HEIC・動画等は allowedTypes 外なので弾かれる。
    const detectedMime = detectMagicByteMime(imageBuffer);
    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) {
      return apiValidationError("JPG / PNG / GIF / WEBP 形式の画像を選択してください。");
    }

    // maker は QR コードには含まれない（OCR 必須）ので requireFields に指定。
    // QR だけでは不足と判定され OCR を併用してマージされる。
    let parsed: Awaited<ReturnType<typeof parseShakenshoAuto>>["data"];
    let source: Awaited<ReturnType<typeof parseShakenshoAuto>>["source"];
    try {
      ({ data: parsed, source } = await parseShakenshoAuto(imageBuffer, { requireFields: ["maker"] }));
    } catch (e) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "error" });
      logger.error("[mobile parse-shakken] OCR failed", { err: e instanceof Error ? e.message : String(e) });
      return apiError({
        code: "internal_error",
        message: "車検証の読み取りに失敗しました（AI OCR に接続できませんでした）。時間をおいて再度お試しください。",
        status: 502,
      });
    }

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
    const customerNameAutomated = resolveFieldPolicy(automation, "customer.name") !== "manual";

    let customer_suggestion: { id: string; name: string; confidence: number; method: string } | null = null;
    try {
      const ownerName = customerNameAutomated ? parsed.owner_name?.trim() || parsed.user_name?.trim() || null : null;
      if (ownerName) {
        const { data: candidates } = await caller.supabase
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
      logger.warn("[mobile parse-shakken] customer suggestion failed", {
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
    return apiInternalError(e, "mobile/vehicles/parse-shakken");
  }
}
