import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: Agent profile settings and current user's role ───
export async function GET() {
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

    // Fetch agent profile
    const { data: profile, error: profileErr } = await supabase
      .from("agents")
      .select("id, name, contact_name, contact_email, contact_phone, company_name, company_address, website_url, logo_url, status, commission_type, commission_rate, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder, stripe_account_id, stripe_onboarding_done, notes, created_at, updated_at")
      .eq("id", agentId)
      .single();

    if (profileErr || !profile) {
      return apiNotFound("agent_profile_not_found");
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
    return apiInternalError(e, "agent/settings GET");
  }
}

// ─── PUT: Update agent profile settings ───
export async function PUT(request: NextRequest) {
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

    // Only admin can update settings
    if (role !== "admin") {
      return apiForbidden("設定を更新する権限がありません。");
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
      return apiValidationError("更新するフィールドがありません。");
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", agentId)
      .select("id, name, contact_name, contact_email, contact_phone, company_name, company_address, website_url, logo_url, status, commission_type, commission_rate, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder, stripe_account_id, stripe_onboarding_done, notes, created_at, updated_at")
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "agent/settings update");
    }

    return NextResponse.json({ ok: true, agent: updated });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/settings PUT");
  }
}
