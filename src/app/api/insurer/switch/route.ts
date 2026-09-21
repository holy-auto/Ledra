import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { insurerSwitchSchema } from "@/lib/validations/insurer";
import { INSURER_USABLE_STATUSES } from "@/lib/api/insurerAuth";

export const runtime = "nodejs";

/**
 * GET /api/insurer/switch
 * List all insurers the current user belongs to.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return apiUnauthorized();
  }

  const admin = createServiceRoleAdmin(
    "insurer switch GET — lists every insurer the authenticated user belongs to, pre-resolution",
  );
  const { data: memberships } = await admin
    .from("insurer_users")
    .select("insurer_id, role, is_active")
    .eq("user_id", authData.user.id)
    .eq("is_active", true);

  if (!memberships || memberships.length === 0) {
    return apiJson({ insurers: [] });
  }

  const insurerIds = memberships.map((m) => m.insurer_id);
  const { data: insurers } = await admin
    .from("insurers")
    .select("id, name, slug, status, plan_tier")
    .in("id", insurerIds)
    .eq("is_active", true)
    // resolveInsurerCaller と同じ規則にする。ここだけ status='active' に絞っていたため、
    // **審査中（active_pending_review）の保険会社が切替リストに出てこなかった**
    .in("status", [...INSURER_USABLE_STATUSES]);

  const cookieStore = await cookies();
  const activeId = cookieStore.get("active_insurer_id")?.value;

  const result = (insurers ?? []).map((ins) => ({
    ...ins,
    role: memberships.find((m) => m.insurer_id === ins.id)?.role ?? "viewer",
    is_current: ins.id === activeId,
  }));

  return apiJson({ insurers: result });
}

/**
 * POST /api/insurer/switch
 * Switch the active insurer context.
 * Body: { insurer_id: string }
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return apiUnauthorized();
  }

  const parsed = insurerSwitchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { insurer_id } = parsed.data;

  // Verify user belongs to this insurer — pre-resolution, so cannot use insurer-scoped wrapper here
  const admin = createServiceRoleAdmin("insurer switch POST — verifies membership before switching active_insurer_id");
  const { data: membership } = await admin
    .from("insurer_users")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("insurer_id", insurer_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return apiForbidden("この保険会社のメンバーではありません。");
  }

  // メンバーシップだけでは足りない。**ここは insurers を一度も見ていなかった**ので、
  // 停止中の保険会社へも切り替えられ、後段の resolveInsurerCaller が 401 を返していた
  // （＝利用者には「メンバーではない」でも「停止中」でもない、理由の分からない失敗に見える）。
  const { data: usable } = await admin
    .from("insurers")
    .select("id")
    .eq("id", insurer_id)
    .eq("is_active", true)
    .in("status", [...INSURER_USABLE_STATUSES])
    .limit(1)
    .maybeSingle();

  if (!usable) {
    return apiForbidden("この保険会社のアカウントは現在利用できません。管理者にお問い合わせください。");
  }

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set("active_insurer_id", insurer_id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60, // 1 year
  });

  return apiJson({ ok: true, active_insurer_id: insurer_id });
}
