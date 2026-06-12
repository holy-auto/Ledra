import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { staffShiftBulkSchema } from "@/lib/validations/staff-shift";
import { resolveStaffNames } from "@/lib/attendance/staffNames";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isShiftAdmin(role: string): boolean {
  return role === "admin" || role === "owner" || role === "super_admin";
}

const SELECT_COLUMNS =
  "id, tenant_id, user_id, staff_name, shift_date, start_time, end_time, break_minutes, notes, created_at, updated_at";

// ─── POST: 週まとめてシフトを一括 upsert (管理者のみ) ───
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isShiftAdmin(caller.role)) {
      return apiForbidden("シフトの一括登録には管理者権限が必要です。");
    }

    const parsed = await parseJsonBody(req, staffShiftBulkSchema);
    if (!parsed.ok) return parsed.response;
    const { shifts } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // created / updated を判別するため、対象 (user_id, shift_date) の既存を先に取得。
    const userIds = [...new Set(shifts.map((s) => s.user_id))];
    const dates = [...new Set(shifts.map((s) => s.shift_date))];
    const { data: existingRows } = await admin
      .from("staff_shifts")
      .select("user_id, shift_date")
      .eq("tenant_id", caller.tenantId)
      .in("user_id", userIds)
      .in("shift_date", dates);
    const existingKeys = new Set(
      (existingRows ?? []).map(
        (r) => `${(r as { user_id: string }).user_id}|${(r as { shift_date: string }).shift_date}`,
      ),
    );

    // staff_name 補完: 未指定 user_id の表示名を解決。
    const idsNeedingName = new Set<string>(shifts.filter((s) => !s.staff_name).map((s) => s.user_id));
    const nameMap =
      idsNeedingName.size > 0 ? await resolveStaffNames(admin, idsNeedingName) : new Map<string, string>();

    const rows = shifts.map((s) => ({
      tenant_id: caller.tenantId,
      user_id: s.user_id,
      shift_date: s.shift_date,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      notes: s.notes,
      staff_name: s.staff_name ?? nameMap.get(s.user_id) ?? null,
    }));

    const { data: upserted, error } = await admin
      .from("staff_shifts")
      .upsert(rows, { onConflict: "tenant_id,user_id,shift_date" })
      .select(SELECT_COLUMNS);
    if (error) return apiInternalError(error, "staff-shifts/bulk POST");

    let updated = 0;
    let created = 0;
    for (const s of shifts) {
      if (existingKeys.has(`${s.user_id}|${s.shift_date}`)) updated++;
      else created++;
    }

    return apiJson({ ok: true, created, updated, shifts: upserted ?? [] }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "staff-shifts/bulk POST");
  }
}
