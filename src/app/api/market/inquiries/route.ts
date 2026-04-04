import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

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
    const body = await req.json().catch(() => ({} as any));

    const vehicleId = (body?.vehicle_id ?? "").trim();
    const buyerName = (body?.buyer_name ?? "").trim();
    const buyerEmail = (body?.buyer_email ?? "").trim();
    const message = (body?.message ?? "").trim();

    if (!vehicleId || !buyerName || !buyerEmail || !message) {
      return apiValidationError("vehicle_id, buyer_name, buyer_email, and message are required");
    }

    // Look up the vehicle to get seller tenant_id
    const { data: vehicle, error: vErr } = await admin
      .from("market_vehicles")
      .select("tenant_id")
      .eq("id", vehicleId)
      .single();

    if (vErr || !vehicle) {
      return apiNotFound("vehicle_not_found");
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      vehicle_id: vehicleId,
      seller_tenant_id: vehicle.tenant_id,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      message,
      status: "new",
    };

    if (body.buyer_company !== undefined) row.buyer_company = body.buyer_company;
    if (body.buyer_phone !== undefined) row.buyer_phone = body.buyer_phone;

    const { data: inquiry, error } = await admin
      .from("market_inquiries")
      .insert(row)
      .select("id, vehicle_id, seller_tenant_id, buyer_name, buyer_email, buyer_company, buyer_phone, message, status, created_at")
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
