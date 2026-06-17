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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧で返すカラム。customers / vehicles を join する。
 * customers の実カラムは name / phone (phone_masked は存在しない / core_tables.sql 参照)。
 * vehicles の実カラムは maker / model / plate_display。
 */
const SELECT_COLUMNS = `
  id, reservation_id, customer_id, vehicle_id, stage,
  estimate_amount, insurance_company, claim_number, assigned_staff_id,
  intake_at, estimate_at, bodywork_start_at, paint_start_at, complete_at, delivered_at,
  notes, created_at, updated_at,
  customer:customers ( id, name, phone ),
  vehicle:vehicles ( id, maker, model, plate_display )
`;

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
    const { customer_id, vehicle_id, reservation_id, stage, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const refError = await validateTenantRefs(admin, caller.tenantId, {
      customer_id,
      vehicle_id,
      reservation_id,
    });
    if (refError) return apiValidationError(refError);

    // 作成時の stage に対応する到達タイムスタンプをセットする
    // (既定 intake の場合は intake_at = now())。
    const nowIso = new Date().toISOString();
    const stageTimestamps: Record<string, string> = {
      [STAGE_TIMESTAMP_COLUMN[stage]]: nowIso,
    };

    const { data: created, error } = await admin
      .from("body_repair_jobs")
      .insert({
        ...rest,
        customer_id,
        vehicle_id,
        reservation_id,
        stage,
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
    const { id, stage, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // assigned_staff_id 以外の参照 (customer/vehicle/reservation) は PATCH では
    // 変更しない設計のため、ここでは検証不要。

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」として扱う)。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }

    // ステージ変更時: 対応する到達タイムスタンプが未設定なら now() をセットする
    // (一度入った工程の到達時刻は上書きしない = 出戻りで時刻が消えない)。
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

      updates.stage = stage;
      const tsColumn = STAGE_TIMESTAMP_COLUMN[stage];
      const existingTs = (existing as Record<string, unknown>)[tsColumn];
      if (!existingTs) {
        updates[tsColumn] = new Date().toISOString();
      }
    }

    const { data: updated, error } = await admin
      .from("body_repair_jobs")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "body-repair-jobs PATCH");
    if (!updated) return apiValidationError("対象の案件が見つかりません。");

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
  refs: { customer_id: string | null; vehicle_id: string | null; reservation_id: string | null },
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
  return null;
}
