import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inquiryCreateSchema } from "@/lib/validations/market";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

export const dynamic = "force-dynamic";

async function resolveCallerTenant(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
  };
}

// ─── POST: Create inquiry (public, no auth required) ───
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({} as any));

    const parsed = inquiryCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { vehicle_id, buyer_name, buyer_email, message, buyer_company, buyer_phone } = parsed.data;

    // Look up the vehicle to get seller tenant_id
    const { data: vehicle, error: vErr } = await admin
      .from("market_vehicles")
      .select("tenant_id")
      .eq("id", vehicle_id)
      .single();

    if (vErr || !vehicle) {
      return apiNotFound("車両が見つかりません。");
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      vehicle_id,
      seller_tenant_id: vehicle.tenant_id,
      buyer_name,
      buyer_email,
      message,
      status: "new",
    };

    if (buyer_company !== undefined && buyer_company !== null) row.buyer_company = buyer_company;
    if (buyer_phone !== undefined && buyer_phone !== null) row.buyer_phone = buyer_phone;

    const { data: inquiry, error } = await admin
      .from("market_inquiries")
      .insert(row)
      .select()
      .single();

    if (error) {
      return apiInternalError(error, "market inquiry insert");
    }

    return apiOk({ inquiry });
  } catch (e) {
    return apiInternalError(e, "market inquiry create");
  }
}

// ─── GET: List inquiries for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = admin
      .from("market_inquiries")
      .select("*, market_vehicles(maker, model)")
      .eq("seller_tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: inquiries, error } = await query;

    if (error) {
      return apiInternalError(error, "market inquiries list");
    }

    return NextResponse.json({ inquiries: inquiries ?? [] });
  } catch (e) {
    return apiInternalError(e, "market inquiries list");
  }
}
