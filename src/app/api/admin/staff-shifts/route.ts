import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { staffShiftCreateSchema } from "@/lib/validations/staff-shift";
import { resolveStaffNames, resolveSingleStaffName } from "@/lib/attendance/staffNames";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** admin/owner/super_admin か (= 全スタッフのシフト作成/編集を許可)。 */
function isShiftAdmin(role: string): boolean {
  return role === "admin" || role === "owner" || role === "super_admin";
}

const SELECT_COLUMNS =
  "id, tenant_id, user_id, staff_name, shift_date, start_time, end_time, break_minutes, notes, created_at, updated_at";

const MAX_RANGE_DAYS = 14;

type ShiftRow = {
  id: string;
  user_id: string;
  staff_name: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  notes: string | null;
};

type AttendanceRow = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  work_minutes: number | null;
};

/** "YYYY-MM-DD" の 2 日付差 (to - from)。不正なら null。 */
function rangeDays(from: string, to: string): number | null {
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t)) return null;
  return Math.round((t - f) / 86_400_000);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── GET: 期間内のシフト + 同日勤怠 (予定 vs 実績) ───
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const from = (url.searchParams.get("from") ?? "").trim();
    const to = (url.searchParams.get("to") ?? "").trim();
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return apiValidationError("from / to は YYYY-MM-DD 形式で指定してください。");
    }
    const span = rangeDays(from, to);
    if (span === null || span < 0) return apiValidationError("期間が不正です。");
    if (span > MAX_RANGE_DAYS) return apiValidationError(`期間は最大${MAX_RANGE_DAYS}日までです。`);

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // シフト取得 (期間内、全スタッフ)。
    const { data: shiftData, error: shiftErr } = await admin
      .from("staff_shifts")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId) // REQUIRED: admin bypasses RLS
      .gte("shift_date", from)
      .lte("shift_date", to)
      .order("shift_date", { ascending: true });
    if (shiftErr) return apiInternalError(shiftErr, "staff-shifts GET shifts");
    const shifts = (shiftData ?? []) as ShiftRow[];

    // 同期間の勤怠を取得し、(user_id, shift_date) で突き合わせる。
    const { data: attData, error: attErr } = await admin
      .from("attendance_records")
      .select("id, user_id, work_date, clock_in, clock_out, break_minutes, work_minutes")
      .eq("tenant_id", caller.tenantId)
      .gte("work_date", from)
      .lte("work_date", to);
    if (attErr) return apiInternalError(attErr, "staff-shifts GET attendance");
    const attendance = (attData ?? []) as AttendanceRow[];

    const attByKey = new Map<string, AttendanceRow>();
    for (const a of attendance) attByKey.set(`${a.user_id}|${a.work_date}`, a);

    // 表示名解決 (シフト未登録のスタッフが居ても staff_name は持つので
    // 補完用に、staff_name が無いレコードのみ解決)。
    const idsNeedingName = new Set<string>(shifts.filter((s) => !s.staff_name).map((s) => s.user_id));
    const nameMap =
      idsNeedingName.size > 0 ? await resolveStaffNames(admin, idsNeedingName) : new Map<string, string>();

    const enriched = shifts.map((s) => ({
      ...s,
      staff_name: s.staff_name ?? nameMap.get(s.user_id) ?? null,
      attendance: attByKey.get(`${s.user_id}|${s.shift_date}`) ?? null,
    }));

    return apiJson({
      ok: true,
      from,
      to,
      is_admin: isShiftAdmin(caller.role),
      caller_user_id: caller.userId,
      shifts: enriched,
      attendance,
    });
  } catch (e) {
    return apiInternalError(e, "staff-shifts GET");
  }
}

// ─── POST: 単一シフトの作成 / upsert ───
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = await parseJsonBody(req, staffShiftCreateSchema);
    if (!parsed.ok) return parsed.response;
    const { user_id, shift_date, start_time, end_time, break_minutes, notes, staff_name } = parsed.data;

    // 管理者でなければ自分のシフトのみ操作可。
    if (!isShiftAdmin(caller.role) && user_id !== caller.userId) {
      return apiForbidden("他のスタッフのシフトは管理者のみ編集できます。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolvedName = staff_name ?? (await resolveSingleStaffName(admin, user_id));

    // unique(tenant_id, user_id, shift_date) の衝突は upsert で更新に倒す。
    const { data: upserted, error } = await admin
      .from("staff_shifts")
      .upsert(
        {
          tenant_id: caller.tenantId,
          user_id,
          shift_date,
          start_time,
          end_time,
          break_minutes,
          notes,
          staff_name: resolvedName,
        },
        { onConflict: "tenant_id,user_id,shift_date" },
      )
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "staff-shifts POST");

    return apiJson({ ok: true, shift: upserted }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "staff-shifts POST");
  }
}

// ─── DELETE: シフト削除 (?id=uuid)。自分のシフト or 管理者。 ───
export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const url = new URL(req.url);
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return apiValidationError("シフト ID が不正です。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: target, error: fetchErr } = await admin
      .from("staff_shifts")
      .select("id, user_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle<{ id: string; user_id: string }>();
    if (fetchErr) return apiInternalError(fetchErr, "staff-shifts DELETE fetch");
    if (!target) return apiNotFound("対象のシフトが見つかりません。");
    if (!isShiftAdmin(caller.role) && target.user_id !== caller.userId) {
      return apiForbidden("他のスタッフのシフトは管理者のみ削除できます。");
    }

    const { error } = await admin.from("staff_shifts").delete().eq("id", id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "staff-shifts DELETE");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "staff-shifts DELETE");
  }
}
