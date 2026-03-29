import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/sanitize";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";

export const runtime = "nodejs";

/**
 * GET /api/admin/insurers/tenant-access/tenants?q=search
 * Search tenants for the grant form autocomplete.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller || !isPlatformAdmin(caller)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const admin = createAdminClient();

  let query = admin
    .from("tenants")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(50);

  if (q) {
    query = query.ilike("name", `%${escapeIlike(q)}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ tenants: data ?? [] });
}
