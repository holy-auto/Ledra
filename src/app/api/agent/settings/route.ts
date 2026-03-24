import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─── GET: Agent profile settings and current user's role ───
export async function GET() {
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

    // Fetch agent profile
    const { data: profile, error: profileErr } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (profileErr || !profile) {
      console.error("[agent/settings] profile fetch error:", profileErr?.message);
      return NextResponse.json({ error: "agent_profile_not_found" }, { status: 404 });
    }

    // Fetch current user's role in this agent org
    const { data: membership, error: memberErr } = await supabase
      .from("agent_users")
      .select("role, display_name")
      .eq("agent_id", agentId)
      .eq("user_id", auth.user.id)
      .single();

    if (memberErr) {
      console.error("[agent/settings] membership fetch error:", memberErr.message);
    }

    return NextResponse.json({
      agent: profile,
      current_user: {
        user_id: auth.user.id,
        role: membership?.role ?? agent.role ?? "viewer",
        display_name: membership?.display_name ?? null,
      },
    });
  } catch (e: unknown) {
    console.error("[agent/settings] GET error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: Update agent profile settings ───
export async function PUT(request: NextRequest) {
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

    // Only admin can update settings
    if (role !== "admin") {
      return NextResponse.json(
        { error: "forbidden", message: "設定を更新する権限がありません。" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    // Build the update object from allowed fields
    const allowedFields = [
      "name",
      "contact_name",
      "contact_email",
      "contact_phone",
      "company_name",
      "company_address",
      "website_url",
      "logo_url",
      "commission_type",
      "commission_rate",
      "bank_name",
      "bank_branch",
      "bank_account_type",
      "bank_account_number",
      "bank_account_holder",
      "notes",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const value = body[field];
        // Trim string values, allow null
        if (typeof value === "string") {
          updates[field] = value.trim() || null;
        } else {
          updates[field] = value;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "no_updates", message: "更新するフィールドがありません。" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", agentId)
      .select()
      .single();

    if (updateErr) {
      console.error("[agent/settings] update error:", updateErr.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, agent: updated });
  } catch (e: unknown) {
    console.error("[agent/settings] PUT error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
