import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReferralStatus } from "@/types/agent";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** Allowed status transitions: current status → allowed next statuses */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["contacted", "cancelled"],
  contacted: ["in_negotiation", "cancelled"],
  in_negotiation: ["trial", "contracted", "cancelled"],
  trial: ["contracted", "cancelled"],
  contracted: ["churned"],
  cancelled: [], // terminal
  churned: [],   // terminal
};

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET: Fetch single referral by id ───
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    const referralColumns = "id, agent_id, shop_name, contact_name, contact_email, contact_phone, referral_code, status, notes, contract_date, contracted_at, created_at, updated_at";
    const { data: referral, error } = await supabase
      .from("agent_referrals")
      .select(referralColumns)
      .eq("id", id)
      .eq("agent_id", agentId)
      .single();

    if (error || !referral) {
      return apiNotFound("not_found");
    }

    return NextResponse.json({ referral });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/referrals/[id] GET");
  }
}

// ─── PUT: Update referral ───
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    // Only admin or staff can update referrals
    if (role !== "admin" && role !== "staff") {
      return apiForbidden("紹介を更新する権限がありません。");
    }

    // Fetch current referral to validate status transition
    const { data: existing, error: fetchErr } = await supabase
      .from("agent_referrals")
      .select("id, status, contracted_at")
      .eq("id", id)
      .eq("agent_id", agentId)
      .single();

    if (fetchErr || !existing) {
      return apiNotFound("not_found");
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    const updates: Record<string, unknown> = {};

    // Optional field updates
    if (body.contact_name !== undefined) {
      updates.contact_name = ((body.contact_name as string) ?? "").trim() || null;
    }
    if (body.contact_email !== undefined) {
      updates.contact_email = ((body.contact_email as string) ?? "").trim() || null;
    }
    if (body.contact_phone !== undefined) {
      updates.contact_phone = ((body.contact_phone as string) ?? "").trim() || null;
    }
    if (body.notes !== undefined) {
      updates.notes = ((body.notes as string) ?? "").trim() || null;
    }

    // Status transition validation
    if (body.status !== undefined) {
      const newStatus = (body.status as string).trim() as ReferralStatus;
      const currentStatus = existing.status as string;
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

      if (!allowed.includes(newStatus)) {
        return apiValidationError(
          `ステータスを「${currentStatus}」から「${newStatus}」に変更することはできません。`,
          { allowed_transitions: allowed },
        );
      }

      updates.status = newStatus;

      // Automatically set contracted_at when transitioning to contracted
      if (newStatus === "contracted" && !existing.contracted_at) {
        updates.contracted_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新するフィールドがありません。");
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from("agent_referrals")
      .update(updates)
      .eq("id", id)
      .eq("agent_id", agentId)
      .select("id, agent_id, shop_name, contact_name, contact_email, contact_phone, referral_code, status, notes, contract_date, contracted_at, created_at, updated_at")
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "agent/referrals/[id] update");
    }

    return NextResponse.json({ ok: true, referral: updated });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/referrals/[id] PUT");
  }
}
