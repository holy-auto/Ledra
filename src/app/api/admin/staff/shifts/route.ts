import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { shiftsPutSchema } from "@/lib/validations/staff";

export const dynamic = "force-dynamic";

// GET: シフト一覧。?staff_id で絞り込み、?from/?to で期間絞り込み（既定は今日以降）
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // シフトは勤務情報のため roster と同じ members:view に限定（staff_id 省略で全件取得を防ぐ）。
    if (!requirePermission(caller, "members:view")) return apiForbidden();

    const url = new URL(req.url);
    const staffId = url.searchParams.get("staff_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    let query = supabase
      .from("staff_shifts")
      .select("id, staff_id, work_date, start_time, end_time, note")
      .eq("tenant_id", caller.tenantId)
      .order("work_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (staffId) query = query.eq("staff_id", staffId);
    if (from) query = query.gte("work_date", from);
    if (to) query = query.lte("work_date", to);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "staff shifts list");

    return apiJson({ shifts: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "staff shifts list");
  }
}

// PUT: 指定スタッフの今後（today 以降）のシフトを一括置換
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const parsed = shiftsPutSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { staff_id, shifts } = parsed.data;

    // 当該スタッフがこのテナントのものか確認（RLS の二重チェック）
    const { data: staff } = await supabase
      .from("staff_members")
      .select("id")
      .eq("id", staff_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!staff) return apiValidationError("staff not found");

    const today = new Date().toISOString().slice(0, 10);
    const futureShifts = shifts.filter((s) => s.work_date >= today);

    // delete + insert を 1 つの RPC（単一トランザクション）で実行し、アトミックに置換する。
    // 挿入が落ちても既存シフトは消えない（部分的なワイプを防ぐ）。
    const { error } = await supabase.rpc("replace_staff_shifts", {
      p_staff_id: staff_id,
      p_shifts: futureShifts,
    });
    if (error) return apiInternalError(error, "staff shifts replace");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "staff shifts replace");
  }
}
