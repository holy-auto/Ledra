import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, plan_tier")
      .eq("id", caller.tenantId)
      .single();

    return NextResponse.json({
      user_id: caller.userId,
      email: (await supabase.auth.getUser()).data?.user?.email ?? null,
      tenant_id: caller.tenantId,
      tenant_name: tenant?.name ?? null,
      plan_tier: tenant?.plan_tier ?? "free",
      role: caller.role ?? "admin",
    });
  } catch (e: unknown) {
    return apiInternalError(e, "me");
  }
}
