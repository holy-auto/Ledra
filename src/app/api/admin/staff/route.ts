import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { staffCreateSchema, staffUpdateSchema, staffDeleteSchema } from "@/lib/validations/staff";

/** 紐付け先 user_id が当該テナントのメンバーか確認（他テナントアカウント連携の防止）。 */
async function userInTenant(tenantId: string, userId: string): Promise<boolean> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export const dynamic = "force-dynamic";

function windowToSince(window: string | null): string | null {
  const now = Date.now();
  switch (window) {
    case "30d":
      return new Date(now - 30 * 86_400_000).toISOString();
    case "90d":
      return new Date(now - 90 * 86_400_000).toISOString();
    case "365d":
      return new Date(now - 365 * 86_400_000).toISOString();
    default:
      return null; // all-time
  }
}

type RosterStat = {
  staff_id: string;
  assignments_total: number;
  completed: number;
  cancelled: number;
  avg_work_minutes: number | null;
};

// GET: スタッフ一覧 + 担当者別実績（roster stats）をマージして返す
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 連絡先・メモ・実績を含む管理ロスターは members:view に限定。
    // 案件アサイン用の最小一覧は /api/admin/staff/picker（reservations:view）を使う。
    if (!requirePermission(caller, "members:view")) return apiForbidden();

    const window = new URL(req.url).searchParams.get("window");
    const since = windowToSince(window);

    const [staffRes, statsRes] = await Promise.all([
      supabase
        .from("staff_members")
        .select("id, user_id, name, kind, email, phone, skills, color, is_active, note, commission_rate, created_at")
        .eq("tenant_id", caller.tenantId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true }),
      supabase.rpc("staff_roster_stats", { p_tenant_id: caller.tenantId, p_since: since }),
    ]);

    if (staffRes.error) return apiInternalError(staffRes.error, "staff list");

    const statsMap = new Map<string, RosterStat>();
    for (const s of (statsRes.data ?? []) as RosterStat[]) statsMap.set(s.staff_id, s);

    const staff = (staffRes.data ?? []).map((s) => {
      const st = statsMap.get(s.id);
      return {
        ...s,
        skills: s.skills ?? [],
        stats: {
          assignments_total: st?.assignments_total ?? 0,
          completed: st?.completed ?? 0,
          cancelled: st?.cancelled ?? 0,
          avg_work_minutes: st?.avg_work_minutes ?? null,
        },
      };
    });

    return apiJson({ staff });
  } catch (e) {
    return apiInternalError(e, "staff list");
  }
}

// POST: スタッフ作成
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const parsed = staffCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;
    // user_id を紐付けるなら社内扱い。外注は user_id を持たない。
    const kind = input.user_id ? "internal" : input.kind;
    const userId = kind === "external" ? null : input.user_id;
    if (userId && !(await userInTenant(caller.tenantId, userId))) {
      return apiValidationError("linked_user_not_in_tenant");
    }

    const { data, error } = await supabase
      .from("staff_members")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: caller.tenantId,
        user_id: userId,
        name: input.name,
        kind,
        email: input.email,
        phone: input.phone,
        skills: input.skills,
        color: input.color,
        note: input.note,
        is_active: input.is_active,
        commission_rate: input.commission_rate,
      })
      .select("id")
      .single();
    if (error) return apiInternalError(error, "staff create");

    return apiJson({ ok: true, id: data.id });
  } catch (e) {
    return apiInternalError(e, "staff create");
  }
}

// PUT: スタッフ更新
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const rawBody = await req.json().catch(() => ({}));
    const parsed = staffUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...rest } = parsed.data;

    // 送られたキーだけ更新（部分更新で未指定を上書きしない）
    const sentKeys = new Set(
      rawBody && typeof rawBody === "object" ? Object.keys(rawBody as Record<string, unknown>) : [],
    );
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && sentKeys.has(key)) updates[key] = value;
    }
    // user_id ↔ kind の整合をとる
    if ("user_id" in updates && updates.user_id) updates.kind = "internal";
    if (updates.kind === "external") updates.user_id = null;
    if (
      typeof updates.user_id === "string" &&
      updates.user_id &&
      !(await userInTenant(caller.tenantId, updates.user_id))
    ) {
      return apiValidationError("linked_user_not_in_tenant");
    }

    const { error } = await supabase
      .from("staff_members")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "staff update");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "staff update");
  }
}

// DELETE: スタッフ削除（reservations.assigned_staff_id は SET NULL、shifts は CASCADE）
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const parsed = staffDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { error } = await supabase
      .from("staff_members")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "staff delete");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "staff delete");
  }
}
