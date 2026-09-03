import { apiError, apiInternalError, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
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

// 兄弟 OCR ルート (certificates/images/upload) と揃えた 1 ファイル上限。
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

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
    if (!requirePermission(caller, "vehicles:create")) return apiForbidden();

    // 車検証 OCR は Vision モデルを叩くので呼ぶたびに費用が出る。
    // 画像を buffer 化する前に弾く。
    const limited = await checkRateLimit(req, "ai", `parse-shakken:${caller.tenantId}`);
    if (limited) return limited;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return apiValidationError("ファイルが見つかりません。");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    // 申告 MIME はなりすまし可能だが、buffer 化前の安価な早期リジェクトとして残す。
    if (!allowedTypes.includes(file.type)) {
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
    if (!detectedMime || !allowedTypes.includes(detectedMime)) {
      return apiValidationError("JPG / PNG / GIF / WEBP 形式の画像を選択してください。");
    }

    // maker は QR コードには含まれない（OCR 必須）ので requireFields に指定。
    // QR だけでは不足と判定され OCR を併用してマージされる。
    // OCR 基盤側の失敗 (API キー未設定 / レート制限 / サーキットオープン) は
    // 「画像が読めなかった」と区別できる文言で返す — 200 + 全 null を返すと
    // 画面が無反応になり、利用者が原因を切り分けられない。
    let parsed: Awaited<ReturnType<typeof parseShakenshoAuto>>["data"];
    let source: Awaited<ReturnType<typeof parseShakenshoAuto>>["source"];
    try {
      ({ data: parsed, source } = await parseShakenshoAuto(imageBuffer, { requireFields: ["maker"] }));
    } catch (e) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "error" });
      logger.error("[parse-shakken] OCR failed", { err: e instanceof Error ? e.message : String(e) });
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
    // 顧客名フィールドの自動化を manual にしているテナントでは、車検証(身分証)の
    // 氏名から顧客を提案しない (PII 由来の自動連携を無効化する設定を尊重する)。
    const customerNameAutomated = resolveFieldPolicy(automation, "customer.name") !== "manual";

    let customer_suggestion: { id: string; name: string; confidence: number; method: string } | null = null;
    try {
      const ownerName = customerNameAutomated ? parsed.owner_name?.trim() || parsed.user_name?.trim() || null : null;
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
