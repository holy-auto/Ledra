import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inquiryCreateSchema } from "@/lib/validations/market";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { notifyNewInquiry } from "@/lib/market/email";

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

    // Notify seller via email (non-blocking)
    try {
      const { data: vDetail } = await admin
        .from("market_vehicles")
        .select("maker, model, tenant_id, tenants(contact_email, name)")
        .eq("id", vehicle_id)
        .single();
      const tenant = (vDetail as any)?.tenants;
      const sellerEmail = tenant?.contact_email;
      const vehicleLabel = [vDetail?.maker, vDetail?.model].filter(Boolean).join(" ") || "車両";
      if (sellerEmail) {
        notifyNewInquiry(sellerEmail, {
          buyerName: buyer_name,
          buyerCompany: buyer_company ?? undefined,
          vehicleLabel,
          message,
        }).catch((e) => console.warn("[market] notifyNewInquiry failed:", e));
      }
    } catch (e) {
      console.warn("[market] seller notification failed:", e);
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

    const p = parsePagination(req);
    const admin = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = admin
      .from("market_inquiries")
      .select("*, market_vehicles(maker, model)", { count: "exact" })
      .eq("seller_tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: inquiries, error, count } = await query.range(p.from, p.to);

    if (error) {
      return apiInternalError(error, "market inquiries list");
    }

    return NextResponse.json({ inquiries: inquiries ?? [], page: p.page, per_page: p.perPage, total: count ?? 0 });
  } catch (e) {
    return apiInternalError(e, "market inquiries list");
  }
}
