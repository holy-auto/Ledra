/**
 * 案件 (予約) 完了時に証明書を **status=draft の「行」** として自動作成する IO 層。
 *
 * 予約更新ルート (`/api/admin/reservations` PUT) の status→"completed" 遷移から
 * **fire-and-forget** で呼ばれる。管理者レスポンスを遅らせないため await しない。
 *
 * `certificate.auto_draft` (= AI 下書き JSON を reservations.ai_certificate_draft に
 * 保存) の一歩先で、実際の `certificates` 行を draft 状態で起票し「発行直前」まで
 * 用意する。発行画面はこの draft 行を編集して発行 (draft→active) する。
 *
 * 壁3:
 *   - 作るのは **下書き (status=draft) のみ**。発行 (draft→active = 法的確定) は
 *     必ず人が行う。`certificate.auto_issue` は NEVER_AUTO_ACTIONS のままで常に false。
 *   - 本人 (customer_name) を捏造しない: 顧客レコードが紐づき名前が取れる案件のみ作成する。
 *   - 既に証明書を自動作成済みの案件 (reservations.ai_certificate_id) は再作成しない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import type { DraftCertificateResult } from "@/lib/ai/draftCertificate";
import { makePublicId } from "@/lib/publicId";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoCreateDraftCertificate } from "./orchestrator";

const AUTO_CREATE_ENDPOINT = "/api/admin/reservations#auto-create-draft-certificate";

export interface MaybeAutoCreateDraftCertificateParams {
  tenantId: string;
  reservationId: string;
}

interface ReservationRow {
  vehicle_id: string | null;
  customer_id: string | null;
  title: string | null;
  ai_certificate_draft?: unknown;
  ai_certificate_id?: string | null;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** DraftMaterial ({ name, maker?, spec?, note? }) を 1 行テキストに畳む。 */
function materialToText(m: unknown): string | null {
  if (typeof m === "string") return nonEmpty(m);
  if (m && typeof m === "object") {
    const o = m as Record<string, unknown>;
    const parts = [o.name, o.maker, o.spec].map((x) => nonEmpty(x)).filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : null;
  }
  return null;
}

/**
 * 完了した予約から証明書を draft 行として自動作成する。失敗しても投げない。
 */
export async function maybeAutoCreateDraftCertificateForReservation(
  params: MaybeAutoCreateDraftCertificateParams,
): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    // 完了済みかは呼び出し側 (status==="completed") で担保。ここでは opt-in を確認。
    if (!shouldAutoCreateDraftCertificate(settings, { isCompleted: true, hasVehicle: true })) return;

    const admin = createServiceRoleAdmin("AI auto-create draft certificate — reservation completion, fire-and-forget");

    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_draft")) return;

    // 予約 + 既存ドラフト / 既存自動作成証明書を確認。
    // ai_certificate_id 列が無い (マイグレーション未適用) 環境では重複防止できないため作らない。
    const sel = await admin
      .from("reservations")
      .select("vehicle_id, customer_id, title, ai_certificate_draft, ai_certificate_id")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sel.error) {
      if (!isMissingColumnError(sel.error)) {
        logger.warn("[certificateRecordAuto] reservation select failed", { tenantId, err: sel.error.message });
      }
      return;
    }
    const reservation = (sel.data as ReservationRow | null) ?? null;
    if (!reservation || !reservation.vehicle_id) return; // 車両が無ければ作らない
    if (reservation.ai_certificate_id) return; // 既に自動作成済み → 重複作成しない

    // 本人確認: 顧客名が取れる案件のみ (customer_name は NOT NULL。捏造しない = 壁3)。
    if (!reservation.customer_id) return;
    const { data: customer } = await admin
      .from("customers")
      .select("name")
      .eq("id", reservation.customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const customerName = nonEmpty(customer?.name);
    if (!customerName) return;

    // 車両情報 (service_name フォールバック + vehicle_* 列の充填用)。
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("maker, model, year, plate_display")
      .eq("id", reservation.vehicle_id)
      .maybeSingle();

    // AI 下書き (certificate.auto_draft が生成済みなら活用)。無ければ最小限で起票する。
    const snapshot = reservation.ai_certificate_draft as { draft?: Partial<DraftCertificateResult> } | null;
    const draft = snapshot?.draft ?? null;

    const vehicleMaker = nonEmpty(vehicle?.maker);
    const vehicleModel = nonEmpty(vehicle?.model);
    const vehicleLabel = [vehicleMaker, vehicleModel].filter(Boolean).join(" ");
    const serviceName = nonEmpty(draft?.title) ?? nonEmpty(reservation.title) ?? (vehicleLabel || null) ?? "施工証明書";

    const materials = Array.isArray(draft?.materials)
      ? draft!.materials.map(materialToText).filter((m): m is string => !!m)
      : [];
    const warranty = Array.isArray(draft?.warrantyCandidates) ? nonEmpty(draft!.warrantyCandidates[0]) : null;
    const workAreas = Array.isArray(draft?.workAreas)
      ? draft!.workAreas.map((w) => nonEmpty(w)).filter((w): w is string => !!w)
      : [];
    const description = nonEmpty(draft?.description);
    const cautions = nonEmpty(draft?.cautions);
    // 本文 (content_free_text): 説明 + 注意事項を改行で連結 (どちらか欠けても可)。
    const freeText = [description, cautions].filter(Boolean).join("\n\n") || null;

    const usage = startAiRouteUsage(AUTO_CREATE_ENDPOINT);

    // public_id 採番 (衝突回避リトライ)。
    let publicId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      publicId = makePublicId();
      const { data: existing } = await admin.from("certificates").select("id").eq("public_id", publicId).maybeSingle();
      if (!existing) break;
      if (attempt === 4) {
        usage.record({ tenantId, outcome: "error", confidence: null, meta: { auto: true, reason: "public_id_collision" } });
        return;
      }
    }

    const certRow: Record<string, unknown> = {
      tenant_id: tenantId,
      public_id: publicId,
      vehicle_id: reservation.vehicle_id,
      customer_id: reservation.customer_id,
      customer_name: customerName,
      service_name: serviceName,
      description,
      material_info: materials.length > 0 ? materials.join(", ") : null,
      warranty_period: warranty,
      content_free_text: freeText,
      vehicle_maker: vehicleMaker,
      vehicle_model: vehicleModel,
      vehicle_info_json: {
        maker: vehicleMaker,
        model: vehicleModel,
        year: vehicle?.year ?? null,
        plate: nonEmpty(vehicle?.plate_display),
      },
      // 施工箇所など template に乗らない補助情報は preset_json に退避 (発行画面が活用可能)。
      content_preset_json: {
        ai_auto_draft: true,
        work_areas: workAreas,
        warranty_candidates: Array.isArray(draft?.warrantyCandidates) ? draft!.warrantyCandidates : [],
      },
      service_type: null, // 種別 (coating/ppf 等) は発行時に人が選ぶ。
      status: "draft", // 壁3: 発行 (active 化) は必ず人。
      created_by: null, // 自動作成 (人ではない)。
    };

    const { data: cert, error: certErr } = await admin
      .from("certificates")
      .insert(certRow)
      .select("id, public_id")
      .single();
    if (certErr || !cert) {
      usage.record({ tenantId, outcome: "error", confidence: null, meta: { auto: true, reason: "insert_failed" } });
      logger.warn("[certificateRecordAuto] certificate insert failed", { tenantId, err: certErr?.message });
      return;
    }

    // 重複防止マーカーを予約に書き戻す (次回以降は再作成しない)。
    const { error: backErr } = await admin
      .from("reservations")
      .update({ ai_certificate_id: cert.id })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId);
    if (backErr && !isMissingColumnError(backErr)) {
      logger.warn("[certificateRecordAuto] reservation back-link failed", { tenantId, err: backErr.message });
    }

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: typeof draft?.confidence === "number" ? draft.confidence : null,
      meta: { auto: true, status: "draft", from_draft: !!draft },
    });
  } catch (e) {
    logger.warn("[certificateRecordAuto] maybeAutoCreateDraftCertificateForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
