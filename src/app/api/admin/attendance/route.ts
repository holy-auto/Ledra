import { NextRequest } from "next/server";
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
import { parseJsonBody } from "@/lib/api/parseBody";
import {
  attendanceClockInSchema,
  attendanceClockOutSchema,
  attendanceAdminUpsertSchema,
} from "@/lib/validations/attendance";
import { listTenantStaff, resolveStaffNames, resolveSingleStaffName } from "@/lib/attendance/staffNames";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** admin/owner/super_admin か (= 全スタッフの閲覧 / 任意レコード編集を許可) */
function isAttendanceAdmin(role: string): boolean {
  return role === "admin" || role === "owner" || role === "super_admin";
}

const SELECT_COLUMNS =
  "id, tenant_id, user_id, staff_name, work_date, clock_in, clock_out, break_minutes, work_minutes, note, created_at, updated_at";

type AttendanceRow = {
  id: string;
  user_id: string;
  staff_name: string | null;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  work_minutes: number | null;
  note: string | null;
};

/** 当月の [from, toExclusive) date 文字列を組み立てる。 */
function monthRange(year: number, month: number): { from: string; toExclusive: string } {
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const toExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, toExclusive };
}

/** サーバのローカル日付を YYYY-MM-DD で返す (JST 運用前提)。 */
function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── GET: 月次の勤怠一覧 + ユーザー別サマリ ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year")) || now.getFullYear();
    const monthRaw = Number(url.searchParams.get("month")) || now.getMonth() + 1;
    const month = Math.min(12, Math.max(1, monthRaw));
    const requestedUserId = (url.searchParams.get("user_id") ?? "").trim() || null;

    const admin_ = isAttendanceAdmin(caller.role);
    // 非管理者は自分のレコードのみ。管理者は user_id 指定 or 全員。
    const targetUserId = admin_ ? requestedUserId : caller.userId;

    const { from, toExclusive } = monthRange(year, month);
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("attendance_records")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId) // REQUIRED: admin bypasses RLS
      .gte("work_date", from)
      .lt("work_date", toExclusive)
      .order("work_date", { ascending: true });

    if (targetUserId) query = query.eq("user_id", targetUserId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "attendance GET");

    const records = (data ?? []) as AttendanceRow[];

    // ユーザー別サマリ (合計実働分・出勤日数)。
    const summaryMap = new Map<string, { total_work_minutes: number; days_worked: number }>();
    for (const r of records) {
      const cur = summaryMap.get(r.user_id) ?? { total_work_minutes: 0, days_worked: 0 };
      if (r.work_minutes != null) cur.total_work_minutes += r.work_minutes;
      if (r.clock_in) cur.days_worked += 1;
      summaryMap.set(r.user_id, cur);
    }

    // 表示名解決。管理者で全員表示のときはテナント全スタッフを返し、
    // 出勤実績ゼロのスタッフも overview に行が出るようにする。
    let staffList: { user_id: string; display_name: string }[];
    if (admin_ && !targetUserId) {
      staffList = await listTenantStaff(admin, caller.tenantId);
    } else {
      const ids = new Set<string>(records.map((r) => r.user_id));
      if (targetUserId) ids.add(targetUserId);
      const nameMap = await resolveStaffNames(admin, ids);
      staffList = Array.from(ids).map((user_id) => ({ user_id, display_name: nameMap.get(user_id) ?? user_id }));
    }

    const summary = staffList
      .map((s) => {
        const agg = summaryMap.get(s.user_id) ?? { total_work_minutes: 0, days_worked: 0 };
        return {
          user_id: s.user_id,
          display_name: s.display_name,
          total_work_minutes: agg.total_work_minutes,
          days_worked: agg.days_worked,
        };
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "ja"));

    return apiJson({
      ok: true,
      year,
      month,
      is_admin: admin_,
      caller_user_id: caller.userId,
      records,
      summary,
    });
  } catch (e) {
    return apiInternalError(e, "attendance GET");
  }
}

// ─── POST: 出勤打刻 (今日のレコードを作成、clock_in = now) ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 打刻は staff 以上 (viewer は打刻不可)。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = await parseJsonBody(req, attendanceClockInSchema);
    if (!parsed.ok) return parsed.response;

    const workDate = parsed.data.work_date ?? todayString();
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 既に当日のレコードがあれば重複打刻を拒否する。
    const { data: existing, error: dupErr } = await admin
      .from("attendance_records")
      .select("id, clock_in")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", caller.userId)
      .eq("work_date", workDate)
      .maybeSingle();
    if (dupErr) return apiInternalError(dupErr, "attendance POST dup-check");
    if (existing) return apiValidationError("本日は既に出勤打刻済みです。");

    const staffName = await resolveSingleStaffName(admin, caller.userId);

    const { data: created, error } = await admin
      .from("attendance_records")
      .insert({
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        staff_name: staffName,
        work_date: workDate,
        clock_in: new Date().toISOString(),
        break_minutes: 0,
        note: parsed.data.note,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "attendance POST");

    return apiJson({ ok: true, record: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "attendance POST");
  }
}

// ─── PATCH: 退勤打刻 (staff) または 管理者の手動 upsert ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // ボディに user_id + work_date があれば管理者 upsert として扱う。
    const rawClone = await req
      .clone()
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const isAdminUpsert =
      typeof rawClone === "object" &&
      rawClone !== null &&
      "user_id" in (rawClone as Record<string, unknown>) &&
      "work_date" in (rawClone as Record<string, unknown>);

    if (isAdminUpsert) {
      // 管理者のみ許可。
      if (!isAttendanceAdmin(caller.role)) {
        return apiForbidden("勤怠の手動編集には管理者権限が必要です。");
      }
      const parsed = await parseJsonBody(req, attendanceAdminUpsertSchema);
      if (!parsed.ok) return parsed.response;
      const { user_id, work_date, clock_in, clock_out, break_minutes, note, staff_name } = parsed.data;

      // staff_name 未指定なら表示名を解決してスナップショット。
      const resolvedName = staff_name ?? (await resolveSingleStaffName(admin, user_id));

      const { data: upserted, error } = await admin
        .from("attendance_records")
        .upsert(
          {
            tenant_id: caller.tenantId,
            user_id,
            work_date,
            clock_in,
            clock_out,
            break_minutes,
            note,
            staff_name: resolvedName,
          },
          { onConflict: "tenant_id,user_id,work_date" },
        )
        .select(SELECT_COLUMNS)
        .single();
      if (error) return apiInternalError(error, "attendance PATCH admin-upsert");

      return apiJson({ ok: true, record: upserted });
    }

    // 通常スタッフ: 退勤打刻。自分のレコードの clock_out / break_minutes / note のみ更新。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = await parseJsonBody(req, attendanceClockOutSchema);
    if (!parsed.ok) return parsed.response;
    const { id, clock_out, break_minutes, note } = parsed.data;

    // 対象レコードの所有者を確認 (管理者でも本ブランチは自分のレコードに限定)。
    const { data: target, error: fetchErr } = await admin
      .from("attendance_records")
      .select("id, user_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "attendance PATCH fetch");
    if (!target) return apiNotFound("対象の勤怠記録が見つかりません。");
    if ((target as { user_id: string }).user_id !== caller.userId) {
      return apiValidationError("他のスタッフの勤怠は退勤打刻できません。");
    }

    const updates: Record<string, unknown> = {
      clock_out: clock_out ?? new Date().toISOString(),
      break_minutes,
    };
    if (note !== undefined) updates.note = note;

    const { data: updated, error } = await admin
      .from("attendance_records")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", caller.userId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "attendance PATCH");
    if (!updated) return apiNotFound("対象の勤怠記録が見つかりません。");

    return apiJson({ ok: true, record: updated });
  } catch (e) {
    return apiInternalError(e, "attendance PATCH");
  }
}
