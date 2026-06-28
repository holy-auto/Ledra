import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  bodyRepairJobCreateSchema,
  bodyRepairJobUpdateSchema,
  BODY_REPAIR_STAGES,
  type BodyRepairStage,
} from "@/lib/validations/body-repair-job";
import { maybeNotifyBodyRepairStageAdvance } from "@/lib/bodyRepair/stageNotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧で返すカラム。customers / vehicles を join する。
 * customers の実カラムは name / phone (phone_masked は存在しない / core_tables.sql 参照)。
 * vehicles の実カラムは maker / model / plate_display。
 */
const SELECT_COLUMNS = `
  id, reservation_id, customer_id, vehicle_id, stage,
  estimate_amount, actual_amount, due_date, insurance_company, claim_number, assigned_staff_id,
  intake_at, estimate_at, bodywork_start_at, paint_start_at, complete_at, delivered_at,
  notes, created_at, updated_at,
  certificate_id, estimate_document_id, invoice_document_id,
  planned_work_json, actual_work_json, deviation_reason,
  is_specified_maintenance, record_retention_until, recorded_by,
  customer:customers ( id, name, phone ),
  vehicle:vehicles ( id, maker, model, plate_display )
`;

/**
 * 特定整備記録簿は2年保存 (ガイドライン4.2(2))。それ以外の車体整備記録も
 * 事後検証可能性のため一定期間保存する。記録作成日からの保存期限 (date) を返す。
 */
function computeRetentionUntil(isSpecifiedMaintenance: boolean): string {
  const d = new Date();
  // 特定整備=2年、それ以外=1年を最低保存期間とする。
  d.setFullYear(d.getFullYear() + (isSpecifiedMaintenance ? 2 : 1));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** ステージ → そのステージに入った時刻を記録する列名。 */
const STAGE_TIMESTAMP_COLUMN: Record<BodyRepairStage, string> = {
  intake: "intake_at",
  estimate: "estimate_at",
  bodywork: "bodywork_start_at",
  paint: "paint_start_at",
  complete: "complete_at",
  delivered: "delivered_at",
};

// ─── GET: 案件一覧 (stage クエリで絞り込み) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const stageParam = (url.searchParams.get("stage") ?? "").trim();
    const stage = (BODY_REPAIR_STAGES as readonly string[]).includes(stageParam)
      ? (stageParam as BodyRepairStage)
      : null;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("body_repair_jobs")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (stage) query = query.eq("stage", stage);

    const { data: jobs, error } = await query;
    if (error) return apiInternalError(error, "body-repair-jobs GET");

    return apiJson(
      { jobs: jobs ?? [] },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "body-repair-jobs GET");
  }
}

// ─── POST: 案件作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = bodyRepairJobCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const {
      customer_id,
      vehicle_id,
      reservation_id,
      stage,
      // ガイドライン準拠フィールド: JSON 列へリネームして格納するため分離する
      planned_work,
      actual_work,
      certificate_id,
      estimate_document_id,
      invoice_document_id,
      is_specified_maintenance,
      ...rest
    } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const refError = await validateTenantRefs(admin, caller.tenantId, {
      customer_id,
      vehicle_id,
      reservation_id,
      certificate_id,
      estimate_document_id,
      invoice_document_id,
    });
    if (refError) return apiValidationError(refError);

    // 作成時の stage に対応する到達タイムスタンプをセットする
    // (既定 intake の場合は intake_at = now())。
    const nowIso = new Date().toISOString();
    const stageTimestamps: Record<string, string> = {
      [STAGE_TIMESTAMP_COLUMN[stage]]: nowIso,
    };

    const isSpecified = is_specified_maintenance ?? false;

    const { data: created, error } = await admin
      .from("body_repair_jobs")
      .insert({
        ...rest,
        customer_id,
        vehicle_id,
        reservation_id,
        stage,
        certificate_id,
        estimate_document_id,
        invoice_document_id,
        is_specified_maintenance: isSpecified,
        // ガイドライン4.2(2): 記録者と保存期限を作成時に確定する
        recorded_by: caller.userId,
        record_retention_until: computeRetentionUntil(isSpecified),
        ...(planned_work !== undefined ? { planned_work_json: planned_work } : {}),
        ...(actual_work !== undefined ? { actual_work_json: actual_work } : {}),
        ...stageTimestamps,
        tenant_id: caller.tenantId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "body-repair-jobs POST");

    return apiJson({ ok: true, job: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "body-repair-jobs POST");
  }
}

// ─── PATCH: 工程ステージ前進 / フィールド更新 ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = bodyRepairJobUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const {
      id,
      stage,
      planned_work,
      actual_work,
      certificate_id,
      estimate_document_id,
      invoice_document_id,
      is_specified_maintenance,
      ...fields
    } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 新規に紐付ける参照 (証明書 / 帳票) は自テナント所属を検証する。
    // customer/vehicle/reservation は PATCH では変更しない設計のため対象外。
    const refError = await validateTenantRefs(admin, caller.tenantId, {
      customer_id: null,
      vehicle_id: null,
      reservation_id: null,
      certificate_id,
      estimate_document_id,
      invoice_document_id,
    });
    if (refError) return apiValidationError(refError);

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」として扱う)。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    // JSON 列へのリネームマッピング (undefined は変更しない)。
    if (planned_work !== undefined) updates.planned_work_json = planned_work;
    if (actual_work !== undefined) updates.actual_work_json = actual_work;
    if (certificate_id !== undefined) updates.certificate_id = certificate_id;
    if (estimate_document_id !== undefined) updates.estimate_document_id = estimate_document_id;
    if (invoice_document_id !== undefined) updates.invoice_document_id = invoice_document_id;
    // 特定整備フラグ変更時は保存期限 (特定整備=2年) を再計算する。
    if (is_specified_maintenance !== undefined) {
      updates.is_specified_maintenance = is_specified_maintenance;
      updates.record_retention_until = computeRetentionUntil(is_specified_maintenance);
    }
    // この更新で記録に変更を加えた者を記録者として残す (ガイドライン4.2(2))。
    updates.recorded_by = caller.userId;

    // ステージ変更時: 対応する到達タイムスタンプが未設定なら now() をセットする
    // (一度入った工程の到達時刻は上書きしない = 出戻りで時刻が消えない)。
    let previousStage: BodyRepairStage | null = null;
    let isForwardAdvance = false;
    if (stage !== undefined) {
      // 現在の案件を取得して到達タイムスタンプの既存値を確認する。
      const { data: existing, error: fetchErr } = await admin
        .from("body_repair_jobs")
        .select("id, stage, intake_at, estimate_at, bodywork_start_at, paint_start_at, complete_at, delivered_at")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (fetchErr) return apiInternalError(fetchErr, "body-repair-jobs PATCH fetch");
      if (!existing) return apiValidationError("対象の案件が見つかりません。");

      previousStage = (existing as { stage?: BodyRepairStage }).stage ?? null;
      // 工程インデックスが増える「前進」のときだけ顧客通知の対象とする。
      // 後退・補正 (admin/API のやり直し) で「進捗が進んだ」通知を送らない。
      isForwardAdvance =
        previousStage !== null && BODY_REPAIR_STAGES.indexOf(stage) > BODY_REPAIR_STAGES.indexOf(previousStage);
      updates.stage = stage;
      const tsColumn = STAGE_TIMESTAMP_COLUMN[stage];
      const existingTs = (existing as Record<string, unknown>)[tsColumn];
      if (!existingTs) {
        updates[tsColumn] = new Date().toISOString();
      }
    }

    // ステージ遷移時は UPDATE を「現在 stage が previousStage のまま」に条件付ける。
    // 並行 PATCH (二重送信・別タブ) では先勝ちした 1 件だけが行を更新し、後続は
    // updated=null になるため、進捗通知が重複しない (TOCTOU 安全)。
    let updateQuery = admin.from("body_repair_jobs").update(updates).eq("id", id).eq("tenant_id", caller.tenantId);
    if (stage !== undefined && previousStage !== null) {
      updateQuery = updateQuery.eq("stage", previousStage);
    }
    const { data: updated, error } = await updateQuery.select(SELECT_COLUMNS).maybeSingle();
    if (error) return apiInternalError(error, "body-repair-jobs PATCH");
    if (!updated) {
      // stage ガード不一致 = 並行更新で既に遷移済みの可能性。存在すれば現状を返す
      // (通知はしない)。本当に存在しなければ not found。
      if (stage !== undefined) {
        const { data: current } = await admin
          .from("body_repair_jobs")
          .select(SELECT_COLUMNS)
          .eq("id", id)
          .eq("tenant_id", caller.tenantId)
          .maybeSingle();
        if (current) return apiJson({ ok: true, job: current });
      }
      return apiValidationError("対象の案件が見つかりません。");
    }

    // 工程が「前進」したときだけ、opt-in 済みテナントで顧客へ進捗を自動通知する
    // (fire-and-forget; レスポンスは待たせない)。重複は上の stage ガードで防ぐ。
    if (isForwardAdvance && stage !== undefined) {
      void maybeNotifyBodyRepairStageAdvance({
        tenantId: caller.tenantId,
        jobId: id,
        customerId: (updated as { customer_id?: string | null }).customer_id ?? null,
        stage,
      });
    }

    return apiJson({ ok: true, job: updated });
  } catch (e) {
    return apiInternalError(e, "body-repair-jobs PATCH");
  }
}

/**
 * customer_id / vehicle_id / reservation_id が指定されている場合、それが
 * caller のテナントに属するかを検証する。属さない / 存在しない場合はエラー
 * メッセージを返す。null の参照は検証スキップ。
 */
async function validateTenantRefs(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  refs: {
    customer_id?: string | null;
    vehicle_id?: string | null;
    reservation_id?: string | null;
    certificate_id?: string | null;
    estimate_document_id?: string | null;
    invoice_document_id?: string | null;
  },
): Promise<string | null> {
  if (refs.customer_id) {
    const { data, error } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.customer_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された顧客が見つかりません。";
  }
  if (refs.vehicle_id) {
    const { data, error } = await admin
      .from("vehicles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.vehicle_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された車両が見つかりません。";
  }
  if (refs.reservation_id) {
    const { data, error } = await admin
      .from("reservations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.reservation_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された予約が見つかりません。";
  }
  if (refs.certificate_id) {
    const { data, error } = await admin
      .from("certificates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.certificate_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された証明書が見つかりません。";
  }
  // 見積/請求の帳票はいずれも documents テーブル (tenant スコープ) を参照する。
  for (const docId of [refs.estimate_document_id, refs.invoice_document_id]) {
    if (!docId) continue;
    const { data, error } = await admin
      .from("documents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", docId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された帳票が見つかりません。";
  }
  return null;
}
