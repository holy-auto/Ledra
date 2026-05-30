/**
 * 案件 (予約) 完了時に証明書ドラフトを自動生成する IO 層。
 *
 * 予約の status が "completed" になった時点で、予約更新ルートから
 * **fire-and-forget** で呼ばれる。管理者レスポンスを遅らせないため await しない。
 *
 * 段階:
 *   1. settings をロードし certificate.auto_draft が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_draft) と is_active を確認
 *   3. 予約 → 車両 + 過去事例から下書きを生成し reservations.ai_certificate_draft に保存
 *
 * 壁3:
 *   - 証明書の「行」は作らない。発行 (法的確定) は必ず人が行う。
 *   - 既に下書きがある予約は上書きしない (スタッフの編集を尊重)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { generateCertificateDraft } from "@/lib/ai/draftCertificate";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, filterDraftByPolicy, isSourceAllowed } from "./policy";
import { shouldAutoDraftCertificate } from "./orchestrator";

const AUTO_DRAFT_ENDPOINT = "/api/admin/reservations#auto-draft-certificate";

export interface MaybeAutoDraftCertificateParams {
  tenantId: string;
  reservationId: string;
}

interface ReservationRow {
  vehicle_id: string | null;
  ai_certificate_draft?: unknown;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 完了した予約から証明書ドラフトを自動生成し保存する。失敗しても投げない。
 */
export async function maybeAutoDraftCertificateForReservation(params: MaybeAutoDraftCertificateParams): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    // 完了済みかは呼び出し側 (status==="completed") で担保。ここではアクション opt-in を確認。
    if (!shouldAutoDraftCertificate(settings, { isCompleted: true, hasVehicle: true })) return;

    const admin = createServiceRoleAdmin("AI auto-draft certificate — reservation completion, fire-and-forget");

    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_draft")) return;

    // 予約 + 既存ドラフト有無を確認 (列未作成なら ai_certificate_draft を外して再取得)。
    let reservation: ReservationRow | null = null;
    {
      const sel = await admin
        .from("reservations")
        .select("vehicle_id, ai_certificate_draft")
        .eq("id", reservationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (sel.error && isMissingColumnError(sel.error)) {
        const retry = await admin
          .from("reservations")
          .select("vehicle_id")
          .eq("id", reservationId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        reservation = (retry.data as ReservationRow | null) ?? null;
      } else {
        reservation = (sel.data as ReservationRow | null) ?? null;
      }
    }
    if (!reservation || !reservation.vehicle_id) return; // 車両が無ければ下書きできない
    if (reservation.ai_certificate_draft) return; // 既に生成済み → 上書きしない

    // 車両情報
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("maker, model, year, color, vin")
      .eq("id", reservation.vehicle_id)
      .maybeSingle();
    if (!vehicle) return;

    // 過去事例 (ソース許可時のみ)
    const allowSimilar = isSourceAllowed(settings, "similar_certificates");
    const { data: similar } = allowSimilar
      ? await admin
          .from("certificates")
          .select("service_name, description, material_info, warranty_period")
          .eq("tenant_id", tenantId)
          .not("service_name", "is", null)
          .order("created_at", { ascending: false })
          .limit(5)
      : { data: [] as Array<Record<string, unknown>> };

    const usage = startAiRouteUsage(AUTO_DRAFT_ENDPOINT);
    const draft = await generateCertificateDraft({
      vehicle: {
        maker: vehicle.maker as string | undefined,
        model: vehicle.model as string | undefined,
        year: vehicle.year as number | undefined,
        color: vehicle.color as string | undefined,
        vin: vehicle.vin as string | undefined,
      },
      similarCertificates: (similar ?? []).map((s) => ({
        service_name: (s.service_name as string | null) ?? "",
        description: (s.description as string | null) ?? undefined,
        material_info: (s.material_info as string | null) ?? undefined,
        warranty_period: (s.warranty_period as string | null) ?? undefined,
      })),
    });

    // 生成に失敗 (空ドラフト) なら保存しない。
    if (!draft.title) {
      usage.record({
        tenantId,
        outcome: "error",
        confidence: draft.confidence ?? null,
        meta: { auto: true, empty: true },
      });
      return;
    }

    const filtered = filterDraftByPolicy(draft, settings);
    const snapshot = {
      draft: filtered.draft,
      policies: filtered.policies,
      auto: true,
      generated_at: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("reservations")
      .update({ ai_certificate_draft: snapshot })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId);
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[certificateAuto] draft update failed", { tenantId, err: upErr.message });
    }

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: typeof draft.confidence === "number" ? draft.confidence : null,
      meta: { auto: true, similar_used: similar?.length ?? 0 },
    });
  } catch (e) {
    logger.warn("[certificateAuto] maybeAutoDraftCertificateForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
