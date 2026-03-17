import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dealCreateSchema } from "@/lib/validations/market";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { notifyDealStarted } from "@/lib/market/email";

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

// ─── POST: Create a deal ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const body = await req.json().catch(() => ({} as any));

    const parsed = dealCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { inquiry_id, vehicle_id, buyer_name, buyer_email, buyer_company, agreed_price } = parsed.data;

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      inquiry_id,
      vehicle_id,
      seller_tenant_id: caller.tenantId,
      buyer_name,
      buyer_email,
      status: "negotiating",
    };

    if (buyer_company !== undefined && buyer_company !== null) row.buyer_company = buyer_company;
    if (agreed_price !== undefined && agreed_price !== null) row.agreed_price = agreed_price;

    const { data: deal, error } = await admin
      .from("market_deals")
      .insert(row)
      .select()
      .single();

    if (error) {
      return apiInternalError(error, "market deal insert");
    }

    // Update the inquiry status to "in_negotiation"
    await admin
      .from("market_inquiries")
      .update({ status: "in_negotiation", updated_at: new Date().toISOString() })
      .eq("id", inquiry_id);

    // Update the vehicle status to "reserved"
    await admin
      .from("market_vehicles")
      .update({ status: "reserved", updated_at: new Date().toISOString() })
      .eq("id", vehicle_id);

    // Notify buyer via email (non-blocking)
    if (buyer_email) {
      try {
        const { data: vehicle } = await admin
          .from("market_vehicles")
          .select("maker, model, tenants(name)")
          .eq("id", vehicle_id)
          .single();
        const sellerName = (vehicle as any)?.tenants?.name ?? "出品者";
        const vehicleLabel = [vehicle?.maker, vehicle?.model].filter(Boolean).join(" ") || "車両";
        notifyDealStarted(buyer_email, {
          sellerName,
          vehicleLabel,
          agreedPrice: agreed_price ?? undefined,
        }).catch((e) => console.warn("[market] notifyDealStarted failed:", e));
      } catch (e) {
        console.warn("[market] buyer deal notification failed:", e);
      }
    }

    return apiOk({ deal });
  } catch (e) {
    return apiInternalError(e, "market deal create");
  }
}

// ─── GET: List deals for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return apiUnauthorized();

    const p = parsePagination(req);
    const admin = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = admin
      .from("market_deals")
      .select("*, market_vehicles(maker, model)", { count: "exact" })
      .eq("seller_tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: deals, error, count } = await query.range(p.from, p.to);

    if (error) {
      return apiInternalError(error, "market deals list");
    }

    return NextResponse.json({ deals: deals ?? [], page: p.page, per_page: p.perPage, total: count ?? 0 });
  } catch (e) {
    return apiInternalError(e, "market deals list");
  }
}
