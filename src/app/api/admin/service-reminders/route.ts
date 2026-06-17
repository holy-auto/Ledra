import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  serviceReminderCreateSchema,
  serviceReminderUpdateSchema,
  SERVICE_REMINDER_STATUS_FILTERS,
  type ServiceReminderStatusFilter,
} from "@/lib/validations/service-reminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧で返すカラム。customers / vehicles を join する。
 * vehicles の実カラムは plate_display / maker / model（core_tables.sql 参照）。
 * next_due_mileage / next_due_date は DB の GENERATED STORED 列。
 */
const SELECT_COLUMNS = `
  id, customer_id, vehicle_id, service_name, reminder_type,
  last_service_mileage, recommended_interval_km, last_service_date, recommended_interval_months,
  next_due_mileage, next_due_date, status, notified_at, completed_at, notes,
  created_at, updated_at,
  customer:customers ( id, name ),
  vehicle:vehicles ( id, plate_display, maker, model )
`;

/** 「まもなく期限」判定の閾値: 残り日数 / 残り走行距離。 */
const DUE_SOON_DAYS = 30;
const DUE_SOON_KM = 5000;

// ─── GET: リマインダー一覧 ───
// クエリ: status=active|due|all, vehicle_id=, customer_id=
//   due = next_due_date < today+30日 or next_due_mileage < current_mileage+5000
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "active").trim();
    const status: ServiceReminderStatusFilter = (SERVICE_REMINDER_STATUS_FILTERS as readonly string[]).includes(
      statusParam,
    )
      ? (statusParam as ServiceReminderStatusFilter)
      : "active";
    const customerId = (url.searchParams.get("customer_id") ?? "").trim();
    const vehicleId = (url.searchParams.get("vehicle_id") ?? "").trim();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("service_reminders")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      // 期限が近い順に並べる (next_due_date 昇順、未設定は末尾)。
      .order("next_due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    // due フィルタは status=active を前提に「期限間近の active のみ」を返す。
    // それ以外 (active / all) はそのまま status で絞る。
    if (status === "due") {
      query = query.eq("status", "active");
    } else if (status !== "all") {
      query = query.eq("status", status);
    }
    if (customerId) query = query.eq("customer_id", customerId);
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);

    const { data: reminders, error } = await query;
    if (error) return apiInternalError(error, "service-reminders GET");

    // 各車両の最新走行距離 (vehicle_mileage_logs の最大 mileage_km) を取得して
    // 「走行距離ベースの期限間近」判定に使う。
    const vehicleIds = [...new Set((reminders ?? []).map((r) => r.vehicle_id).filter(Boolean))] as string[];
    const currentMileage = new Map<string, number>();
    if (vehicleIds.length > 0) {
      const { data: logs } = await admin
        .from("vehicle_mileage_logs")
        .select("vehicle_id, mileage_km")
        .eq("tenant_id", caller.tenantId)
        .in("vehicle_id", vehicleIds);
      for (const row of logs ?? []) {
        const k = row.vehicle_id as string;
        const km = row.mileage_km as number;
        if (!currentMileage.has(k) || km > (currentMileage.get(k) ?? 0)) {
          currentMileage.set(k, km);
        }
      }
    }

    const today = new Date();
    const dueDateCutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DUE_SOON_DAYS);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // 各リマインダーに残量 / 期限間近フラグを付与する。
    const decorated = (reminders ?? []).map((r) => {
      const vehKm = r.vehicle_id ? (currentMileage.get(r.vehicle_id) ?? null) : null;
      const kmRemaining = r.next_due_mileage != null && vehKm != null ? (r.next_due_mileage as number) - vehKm : null;
      const dueByDate = r.next_due_date != null && new Date(`${r.next_due_date}T00:00:00`) <= dueDateCutoff;
      const dueByMileage = kmRemaining != null && kmRemaining <= DUE_SOON_KM;
      const overdueByDate = r.next_due_date != null && (r.next_due_date as string) < todayStr;
      const overdueByMileage = kmRemaining != null && kmRemaining <= 0;
      return {
        ...r,
        current_mileage: vehKm,
        km_remaining: kmRemaining,
        is_due_soon: Boolean(dueByDate || dueByMileage),
        is_overdue: Boolean(overdueByDate || overdueByMileage),
      };
    });

    // due フィルタ時は「期限間近 or 超過」のみに絞る (DB 側で生成列の
    // クロス参照 (mileage) ができないため app 層で最終フィルタ)。
    const filtered = status === "due" ? decorated.filter((r) => r.is_due_soon || r.is_overdue) : decorated;

    const stats = {
      total: decorated.length,
      due_soon: decorated.filter((r) => r.is_due_soon && !r.is_overdue).length,
      overdue: decorated.filter((r) => r.is_overdue).length,
    };

    return apiJson(
      { reminders: filtered, stats },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "service-reminders GET");
  }
}

// ─── POST: リマインダー作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = serviceReminderCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { customer_id, vehicle_id, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const refError = await validateTenantRefs(admin, caller.tenantId, { customer_id, vehicle_id });
    if (refError) return apiValidationError(refError);

    const { data: created, error } = await admin
      .from("service_reminders")
      .insert({
        ...rest,
        customer_id,
        vehicle_id,
        status: "active",
        tenant_id: caller.tenantId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "service-reminders POST");

    return apiJson({ ok: true, reminder: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "service-reminders POST");
  }
}

// ─── PATCH: リマインダー更新 (status 変更 / 通知済みマーク / 直近施工値の再登録) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = serviceReminderUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, mark_notified, status, ...fields } = parsed.data;

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」として扱う)。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (status !== undefined) {
      updates.status = status;
      // 完了に遷移したら completed_at をセット、完了から戻したらクリア。
      updates.completed_at = status === "completed" ? new Date().toISOString() : null;
    }
    if (mark_notified) {
      updates.notified_at = new Date().toISOString();
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: updated, error } = await admin
      .from("service_reminders")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "service-reminders PATCH");
    if (!updated) return apiValidationError("対象のリマインダーが見つかりません。");

    return apiJson({ ok: true, reminder: updated });
  } catch (e) {
    return apiInternalError(e, "service-reminders PATCH");
  }
}

/**
 * customer_id / vehicle_id が指定されている場合、それが caller のテナントに
 * 属するかを検証する。属さない / 存在しない場合はエラーメッセージを返す。
 * null の参照は検証スキップ。
 */
async function validateTenantRefs(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  refs: { customer_id: string | null; vehicle_id: string | null },
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
  return null;
}
