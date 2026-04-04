import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: List agent referrals with filtering and pagination ───
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));

    let query = supabase
      .from("agent_referrals")
      .select("id, agent_id, shop_name, contact_name, contact_email, contact_phone, referral_code, status, notes, contract_date, contracted_at, created_at, updated_at", { count: "exact" })
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      const safeQ = escapePostgrestValue(escapeIlike(q));
      query = query.or(
        `shop_name.ilike.%${safeQ}%,contact_name.ilike.%${safeQ}%,contact_email.ilike.%${safeQ}%,referral_code.ilike.%${safeQ}%`
      );
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: referrals, error, count } = await query;

    if (error) {
      return apiInternalError(error, "agent/referrals query");
    }

    return NextResponse.json({
      referrals: referrals ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/referrals GET");
  }
}

// ─── POST: Create a new referral ───
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;
    const role = agent.role as string;

    // Only admin or staff can create referrals
    if (role !== "admin" && role !== "staff") {
      return apiForbidden("紹介を作成する権限がありません。");
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const shopName = ((body?.shop_name as string) ?? "").trim();
    if (!shopName) {
      return apiValidationError("shop_name は必須です。");
    }

    const row = {
      agent_id: agentId,
      shop_name: shopName,
      contact_name: ((body?.contact_name as string) ?? "").trim() || null,
      contact_email: ((body?.contact_email as string) ?? "").trim() || null,
      contact_phone: ((body?.contact_phone as string) ?? "").trim() || null,
      notes: ((body?.notes as string) ?? "").trim() || null,
    };

    const { data: created, error: insertErr } = await supabase
      .from("agent_referrals")
      .insert(row)
      .select("id, agent_id, shop_name, contact_name, contact_email, contact_phone, referral_code, status, notes, contract_date, contracted_at, created_at, updated_at")
      .single();

    if (insertErr) {
      return apiInternalError(insertErr, "agent/referrals insert");
    }

    return NextResponse.json({ ok: true, referral: created }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/referrals POST");
  }
}
