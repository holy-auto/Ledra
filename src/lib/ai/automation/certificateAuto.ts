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
import {
  generateCertificateDraft,
  generateCategorizedCertificateDrafts,
  type DraftCertificateResult,
} from "@/lib/ai/draftCertificate";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, filterDraftByPolicy, isSourceAllowed } from "./policy";
import { shouldAutoDraftCertificate } from "./orchestrator";
import { CERT_AI_COLUMNS, certAiFields } from "@/lib/certificates/aiFields";

const AUTO_DRAFT_ENDPOINT = "/api/admin/reservations#auto-draft-certificate";

export interface MaybeAutoDraftCertificateParams {
  tenantId: string;
  reservationId: string;
}

interface MenuItemJson {
  name?: string;
}

interface ReservationRow {
  vehicle_id: string | null;
  menu_items_json?: unknown;
  ai_certificate_draft?: unknown;
}

/** menu_items_json (jsonb 配列) から作業依頼名を取り出す。非配列は空扱い。 */
function extractWorkRequestNames(menuItemsJson: unknown): string[] {
  if (!Array.isArray(menuItemsJson)) return [];
  return menuItemsJson
    .map((m) => (m as MenuItemJson | null)?.name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim());
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
        .select("vehicle_id, menu_items_json, ai_certificate_draft")
        .eq("id", reservationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (sel.error && isMissingColumnError(sel.error)) {
        const retry = await admin
          .from("reservations")
          .select("vehicle_id, menu_items_json")
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
      .select("maker, model, year, vin_code")
      .eq("id", reservation.vehicle_id)
      .maybeSingle();
    if (!vehicle) return;

    // 過去事例 (ソース許可時のみ)
    const allowSimilar = isSourceAllowed(settings, "similar_certificates");
    const { data: similar } = allowSimilar
      ? await admin
          .from("certificates")
          .select(CERT_AI_COLUMNS)
          .eq("tenant_id", tenantId)
          .not("service_type", "is", null)
          .order("created_at", { ascending: false })
          .limit(5)
      : { data: [] as Array<Record<string, unknown>> };

    const vehicleInput = {
      maker: vehicle.maker as string | undefined,
      model: vehicle.model as string | undefined,
      year: vehicle.year as number | undefined,
      vin: vehicle.vin_code as string | undefined,
    };
    const similarInput = (similar ?? []).map((s) => certAiFields(s));
    const model = fastModelForPlanTier(tenant.plan_tier);

    // 複数種類の作業依頼は大カテゴリー単位で 1 枚ずつ下書きを作る。
    // 作業依頼が無い / 分類に失敗した場合は従来どおり単一下書きにフォールバックする。
    const workRequests = extractWorkRequestNames(reservation.menu_items_json);

    const usage = startAiRouteUsage(AUTO_DRAFT_ENDPOINT);

    let categorized: Awaited<ReturnType<typeof generateCategorizedCertificateDrafts>> = [];
    if (workRequests.length > 0) {
      categorized = await generateCategorizedCertificateDrafts(
        { vehicle: vehicleInput, workRequests, similarCertificates: similarInput },
        { model },
      );
    }

    // カテゴリー別に policy を適用。primary (先頭) は後方互換のため snapshot.draft にも入れる。
    const drafts = categorized.map((c) => {
      const filtered = filterDraftByPolicy(c.draft, settings);
      return {
        category: c.category,
        categoryLabel: c.categoryLabel,
        workItems: c.workItems,
        draft: filtered.draft,
        policies: filtered.policies,
      };
    });

    let snapshot: Record<string, unknown> | null = null;
    let primaryDraft: DraftCertificateResult | null = null;

    if (drafts.length > 0) {
      primaryDraft = drafts[0].draft;
      snapshot = {
        draft: drafts[0].draft,
        policies: drafts[0].policies,
        drafts,
        auto: true,
        generated_at: new Date().toISOString(),
      };
    } else {
      // 単一下書き (作業依頼なし or 分類フォールバック)。
      const draft = await generateCertificateDraft(
        { vehicle: vehicleInput, similarCertificates: similarInput },
        { model },
      );
      if (draft.title) {
        const filtered = filterDraftByPolicy(draft, settings);
        primaryDraft = filtered.draft;
        snapshot = {
          draft: filtered.draft,
          policies: filtered.policies,
          auto: true,
          generated_at: new Date().toISOString(),
        };
      }
    }

    // 生成に失敗 (空ドラフト) なら保存しない。
    if (!snapshot || !primaryDraft) {
      usage.record({
        tenantId,
        outcome: "error",
        confidence: null,
        meta: { auto: true, empty: true },
      });
      return;
    }

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
      confidence: typeof primaryDraft.confidence === "number" ? primaryDraft.confidence : null,
      meta: { auto: true, similar_used: similar?.length ?? 0, categories: drafts.length },
    });
  } catch (e) {
    logger.warn("[certificateAuto] maybeAutoDraftCertificateForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
