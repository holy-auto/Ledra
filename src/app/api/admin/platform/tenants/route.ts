import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/tenants
 * Full tenant list for platform operations — platform admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!isPlatformAdmin(caller)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const url = new URL(req.url);
    const search = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = 50;
    const offset = (page - 1) * limit;

    let query = admin
      .from("tenants")
      .select("id, name, plan_tier, is_active, category, prefecture, created_at, stripe_subscription_id, stripe_customer_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("name", `%${escapeIlike(search)}%`);
    }
    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error("[platform/tenants] query error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // Get member counts per tenant
    const tenantIds = (data ?? []).map((t: any) => t.id);
    const memberCounts: Record<string, number> = {};
    if (tenantIds.length > 0) {
      const { data: members } = await admin
        .from("tenant_memberships")
        .select("tenant_id")
        .in("tenant_id", tenantIds);
      for (const m of members ?? []) {
        const tid = (m as any).tenant_id;
        memberCounts[tid] = (memberCounts[tid] ?? 0) + 1;
      }
    }

    // Get certificate counts per tenant
    const certCounts: Record<string, number> = {};
    if (tenantIds.length > 0) {
      const { data: certs } = await admin
        .from("certificates")
        .select("tenant_id")
        .in("tenant_id", tenantIds);
      for (const c of certs ?? []) {
        const tid = (c as any).tenant_id;
        certCounts[tid] = (certCounts[tid] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      ok: true,
      tenants: (data ?? []).map((t: any) => ({
        ...t,
        memberCount: memberCounts[t.id] ?? 0,
        certCount: certCounts[t.id] ?? 0,
      })),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (e: unknown) {
    console.error("[platform/tenants] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
