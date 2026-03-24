import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─── GET: List agent referrals with filtering and pagination ───
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 403 });
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
      .select("*", { count: "exact" })
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.or(
        `shop_name.ilike.%${q}%,contact_name.ilike.%${q}%,contact_email.ilike.%${q}%,referral_code.ilike.%${q}%`
      );
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: referrals, error, count } = await query;

    if (error) {
      console.error("[agent/referrals] db error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({
      referrals: referrals ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e: unknown) {
    console.error("[agent/referrals] GET error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: Create a new referral ───
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 403 });
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;
    const role = agent.role as string;

    // Only admin or staff can create referrals
    if (role !== "admin" && role !== "staff") {
      return NextResponse.json(
        { error: "forbidden", message: "紹介を作成する権限がありません。" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const shopName = ((body?.shop_name as string) ?? "").trim();
    if (!shopName) {
      return NextResponse.json(
        { error: "shop_name_required", message: "shop_name は必須です。" },
        { status: 400 }
      );
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
      .select()
      .single();

    if (insertErr) {
      console.error("[agent/referrals] insert error:", insertErr.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, referral: created }, { status: 201 });
  } catch (e: unknown) {
    console.error("[agent/referrals] POST error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
