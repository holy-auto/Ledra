import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return apiUnauthorized();
  }

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) {
    return apiValidationError("テナントが見つかりません。");
  }

  const { data: t, error } = await supabase
    .from("tenants")
    .select("id,name,plan_tier,is_active")
    .eq("id", tenantId)
    .single();

  if (error || !t) {
    return apiNotFound("テナントが見つかりません。");
  }

  return NextResponse.json(
    {
      tenant_id: t.id,
      tenant_name: t.name ?? null,
      plan_tier: String(t.plan_tier ?? ""),
      is_active: !!t.is_active,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
