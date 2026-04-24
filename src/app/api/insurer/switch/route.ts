import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";

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
    .eq("status", "active");

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("invalid JSON");
  }

  const { insurer_id } = body as { insurer_id?: string };
  if (!insurer_id) {
    return apiValidationError("insurer_id is required");
  }

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
