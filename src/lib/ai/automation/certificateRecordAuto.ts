/**
 * 案件 (予約) 完了時に証明書を自動作成する IO 層。
 *
 * 予約更新ルート (`/api/admin/reservations` PUT) の status→"completed" 遷移から
 * **fire-and-forget** で呼ばれる。管理者レスポンスを遅らせないため await しない。
 *
 * `certificate.auto_draft` (= AI 下書き JSON を reservations.ai_certificate_draft に
 * 保存) の一歩先で、実際の `certificates` 行を起票する。
 *
 * 常に status=draft で作成する。certificate.auto_issue が有効かつ Certificate Gate
 * (IMP-028, `evaluateCertificateActivationGate()`) が ready なら、作成直後に active へ
 * update する（他の発行経路と同じ「作成→Gate→active化」の形。実際には写真等の証跡が
 * まだ無いためほぼ常に draft のまま残り、発行画面で人が確認して発行する経路に合流する）。
 *
 * 顧客名が取れる案件のみ作成する。
 * 既に証明書を自動作成済みの案件 (reservations.ai_certificate_id) は再作成しない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import type { DraftCertificateResult } from "@/lib/ai/draftCertificate";
import { makePublicId } from "@/lib/publicId";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { triggerCertificateIssued } from "@/lib/certificates/issueHooks";
import { evaluateCertificateActivationGate } from "@/lib/certificates/activationGate";
import { computeWarrantyEndDate } from "@/lib/ai/followUpContent";
import { certificateMileageKm } from "@/lib/maintenance/mileage";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoCreateDraftCertificate, shouldAutoIssueCertificate } from "./orchestrator";

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
  parts_replacement?: boolean | null;
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
      .select("vehicle_id, customer_id, title, ai_certificate_draft, ai_certificate_id, parts_replacement")
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

    // 顧客名が取れる案件のみ (customer_name は NOT NULL)。
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
    // 複数種類の作業依頼がある予約は drafts[] にカテゴリー別下書きを持つ。その場合は
    // カテゴリーごとに証明書行を 1 件ずつ起票する。無ければ primary draft を 1 件。
    const snapshot = reservation.ai_certificate_draft as {
      draft?: Partial<DraftCertificateResult>;
      drafts?: Array<{ category?: string; draft?: Partial<DraftCertificateResult> }>;
    } | null;

    const draftUnits: Array<{ draft: Partial<DraftCertificateResult> | null; category: string | null }> =
      Array.isArray(snapshot?.drafts) && snapshot!.drafts.length > 0
        ? snapshot!.drafts.map((d) => ({ draft: d?.draft ?? null, category: nonEmpty(d?.category) }))
        : [{ draft: snapshot?.draft ?? null, category: null }];

    const vehicleMaker = nonEmpty(vehicle?.maker);
    const vehicleModel = nonEmpty(vehicle?.model);
    const vehicleLabel = [vehicleMaker, vehicleModel].filter(Boolean).join(" ");
    const vehiclePlate = nonEmpty(vehicle?.plate_display);

    const usage = startAiRouteUsage(AUTO_CREATE_ENDPOINT);

    /** 一意な public_id を採番する。衝突が続いたら null。 */
    async function allocatePublicId(): Promise<string | null> {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = makePublicId();
        const { data: existing } = await admin
          .from("certificates")
          .select("id")
          .eq("public_id", candidate)
          .maybeSingle();
        if (!existing) return candidate;
      }
      return null;
    }

    // カテゴリー別 (または単一) に証明書行を作成する。1 件でも失敗しても他は続行。
    const createdIds: string[] = [];
    let issuedCount = 0;
    let collision = false;
    let insertFailed = false;

    for (const unit of draftUnits) {
      const draft = unit.draft;
      const serviceName =
        nonEmpty(draft?.title) ?? nonEmpty(reservation.title) ?? (vehicleLabel || null) ?? "施工証明書";
      const materials = Array.isArray(draft?.materials)
        ? draft!.materials.map(materialToText).filter((m): m is string => !!m)
        : [];
      const warranty = Array.isArray(draft?.warrantyCandidates) ? nonEmpty(draft!.warrantyCandidates[0]) : null;
      const workAreas = Array.isArray(draft?.workAreas)
        ? draft!.workAreas.map((w) => nonEmpty(w)).filter((w): w is string => !!w)
        : [];
      const description = nonEmpty(draft?.description);
      const cautions = nonEmpty(draft?.cautions);
      // 本文 (content_free_text): 説明 + 注意事項 + 部品交換の事実 (あれば) を改行で連結。
      // 発行前に人が編集・削除できる下書きへの差し込みなので壁3は維持される。
      // parts_replacement は予約単位のフラグ (カテゴリー別ではない) なので、複数カテゴリーに
      // 分かれた下書き (例: 洗車 + オイル交換) に同じ一文を無差別に付けると、部品交換に無関係な
      // 証明書にまで誤った記載をしてしまう。単一カテゴリーのときだけ差し込む。
      const partsNote =
        reservation.parts_replacement && draftUnits.length === 1 ? "本施工において部品交換を実施しました。" : null;
      const freeText = [description, cautions, partsNote].filter(Boolean).join("\n\n") || null;

      const publicId = await allocatePublicId();
      if (!publicId) {
        collision = true;
        continue;
      }

      const draftConfidence = typeof draft?.confidence === "number" ? draft.confidence : 0;
      const autoIssueEligible = shouldAutoIssueCertificate(settings, {
        hasDraft: !!draft,
        photoQualityPassed: false,
        tamperingCheckPassed: false,
        hasRequiredFields: !!customerName && !!serviceName,
        confidence: draftConfidence,
      });

      const certRow: Record<string, unknown> = {
        tenant_id: tenantId,
        public_id: publicId,
        reservation_id: reservationId,
        vehicle_id: reservation.vehicle_id,
        customer_id: reservation.customer_id,
        customer_name: customerName,
        // 施工名・説明・資材・保証期間の専用列は certificates に無い。
        // 実列（service_type / content_free_text / coating_products_json /
        // expiry_value）へ寄せる。以前はこの5列で insert ごと失敗しており、
        // AI が下書きした証明書が1件も作られていなかった
        expiry_value: warranty,
        coating_products_json: materials.length > 0 ? materials : null,
        // 施工日 (発行 ≒ 今日) と保証期間テキストから保証終了日を自動算出して保存する。
        // 解釈できない期間なら null (cron 側でテキストからの算出にフォールバックする)。
        warranty_period_end: computeWarrantyEndDate(new Date().toISOString(), warranty),
        content_free_text: [freeText, description].filter(Boolean).join("\n\n") || null,
        vehicle_info_json: {
          maker: vehicleMaker,
          model: vehicleModel,
          year: vehicle?.year ?? null,
          plate: vehiclePlate,
        },
        // 施工箇所など template に乗らない補助情報は preset_json に退避 (発行画面が活用可能)。
        content_preset_json: {
          ai_auto_draft: true,
          work_areas: workAreas,
          warranty_candidates: Array.isArray(draft?.warrantyCandidates) ? draft!.warrantyCandidates : [],
        },
        // 施工名は service_type が持つ。大カテゴリーしか無ければそちらを入れる
        service_type: serviceName || unit.category,
        status: "draft",
      };

      // 常に draft で作成する。他の発行経路 (admin status / activate-by-key /
      // mobile activate) と同じく「作成」と「active 化」を分け、Certificate Gate
      // (IMP-028, ADR-0005) を経てから active にする。証明書行が無いと写真等の
      // 証跡は作れないため、insert と同じトランザクションで直接 active にはできない。
      const { data: cert, error: certErr } = await admin
        .from("certificates")
        .insert(certRow)
        .select("id, public_id")
        .single();
      if (certErr || !cert) {
        insertFailed = true;
        logger.warn("[certificateRecordAuto] certificate insert failed", {
          tenantId,
          category: unit.category,
          err: certErr?.message,
        });
        continue;
      }

      createdIds.push(cert.id as string);

      // 自動発行 (draft→active): 走行距離必須ルール + Certificate Gate の両方を満たす
      // ときだけ active化する。AI 自動作成直後は写真等の証跡がまだ無いため、実際には
      // ほぼ常に draft のまま残り、承認インボックスで人が確認して手動発行する経路に合流する
      // = 「読み取りは自動・最終確認は人間」。
      let autoIssued = false;
      if (autoIssueEligible && certificateMileageKm(certRow.maintenance_json) !== null) {
        const certGate = await evaluateCertificateActivationGate(admin, {
          certificateId: cert.id as string,
          tenantId,
          serviceType: certRow.service_type as string | null,
          reservationId,
        });
        if (certGate.ready) {
          const { error: activateErr } = await admin
            .from("certificates")
            .update({ status: "active" })
            .eq("id", cert.id)
            .eq("tenant_id", tenantId);
          if (activateErr) {
            logger.warn("[certificateRecordAuto] auto-issue activation failed", {
              tenantId,
              certificateId: cert.id,
              err: activateErr.message,
            });
          } else {
            autoIssued = true;
          }
        }
      }

      if (autoIssued) {
        issuedCount++;
        triggerCertificateIssued({
          tenantId,
          publicId,
          certificateId: cert.id as string,
          customerName,
          customerId: reservation.customer_id,
          vehicleModel: vehicleModel,
          vehiclePlate,
          reservationId,
        }).catch((e) => {
          logger.warn("[certificateRecordAuto] triggerCertificateIssued failed", {
            tenantId,
            err: e instanceof Error ? e.message : String(e),
          });
        });
      }
    }

    // 1 件も作れなかった場合は失敗として記録し、マーカーは書かない (再試行余地を残す)。
    if (createdIds.length === 0) {
      usage.record({
        tenantId,
        outcome: "error",
        confidence: null,
        meta: { auto: true, reason: collision ? "public_id_collision" : insertFailed ? "insert_failed" : "no_drafts" },
      });
      return;
    }

    // 重複防止マーカーを予約に書き戻す (次回以降は再作成しない)。先頭行の id を代表とする。
    const { error: backErr } = await admin
      .from("reservations")
      .update({ ai_certificate_id: createdIds[0] })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId);
    if (backErr && !isMissingColumnError(backErr)) {
      logger.warn("[certificateRecordAuto] reservation back-link failed", { tenantId, err: backErr.message });
    }

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: null,
      meta: { auto: true, created: createdIds.length, auto_issued: issuedCount },
    });
    // 人の確認なしで証明書を自動作成 (下書き or 自動発行) した事実を監査ログに残す。
    // 複数カテゴリー分を 1 度に作りうるため、代表 id + 件数で記録する。
    await logAutoActionExecuted({
      tenantId,
      actionKey: issuedCount > 0 ? "certificate.auto_issue" : "certificate.auto_create_draft_record",
      resource: { kind: "certificate", id: createdIds[0] ?? null },
      detail: {
        reservation_id: reservationId,
        created: createdIds.length,
        auto_issued: issuedCount,
        certificate_ids: createdIds,
      },
    });
  } catch (e) {
    logger.warn("[certificateRecordAuto] maybeAutoCreateDraftCertificateForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
