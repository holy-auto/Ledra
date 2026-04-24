import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { inquiryCreateSchema } from "@/lib/validations/market";

export const dynamic = "force-dynamic";

// ─── POST: Create inquiry (public, rate-limited) ───
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 inquiries per 15 minutes per IP
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`market-inquiry:${ip}`, { limit: 5, windowSec: 900 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "送信回数の上限に達しました。しばらくしてからお試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const admin = createAdminClient();
    const parsed = inquiryCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { vehicle_id, buyer_name, buyer_email, message, buyer_company, buyer_phone } = parsed.data;

    // Look up the vehicle to get seller tenant_id
    const { data: vehicle, error: vErr } = await admin
      .from("market_vehicles")
      .select("tenant_id")
      .eq("id", vehicle_id)
      .single();

    if (vErr || !vehicle) {
      return apiNotFound("vehicle_not_found");
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

    if (buyer_company) row.buyer_company = buyer_company;
    if (buyer_phone) row.buyer_phone = buyer_phone;

    const { data: inquiry, error } = await admin
      .from("market_inquiries")
      .insert(row)
      .select(
        "id, vehicle_id, seller_tenant_id, buyer_name, buyer_email, buyer_company, buyer_phone, message, status, created_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "market-inquiries insert");
    }

    return NextResponse.json({ ok: true, inquiry });
  } catch (e: unknown) {
    return apiInternalError(e, "market-inquiries create");
  }
}

// ─── GET: List inquiries for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
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
      return apiInternalError(error, "market-inquiries list");
    }

    return NextResponse.json({ inquiries: inquiries ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "market-inquiries list");
  }
}
