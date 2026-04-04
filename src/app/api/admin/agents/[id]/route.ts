import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiNotFound, apiValidationError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agents")
      .select("id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, line_official_id, notes, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return apiNotFound("agent not found");
    }

    // Get referrals, commissions, and members in parallel
    const [{ data: referrals }, { data: commissions }, { data: members }] = await Promise.all([
      admin
        .from("agent_referrals")
        .select("id, agent_id, customer_name, customer_email, customer_phone, status, note, created_at, updated_at")
        .eq("agent_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("agent_commissions")
        .select("id, agent_id, referral_id, amount, rate, status, period_start, period_end, paid_at, created_at, updated_at")
        .eq("agent_id", id)
        .order("period_start", { ascending: false }),
      admin
        .from("agent_users")
        .select("id, agent_id, user_id, role, display_name, email, created_at, updated_at")
        .eq("agent_id", id)
        .order("created_at", { ascending: true }),
    ]);

    return NextResponse.json({
      agent: data,
      referrals: referrals ?? [],
      commissions: commissions ?? [],
      members: members ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "agents [id] GET");
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();

    // Whitelist of updatable fields
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      "name", "status", "contact_name", "contact_email", "contact_phone",
      "address", "default_commission_rate", "commission_type",
      "default_commission_fixed", "line_official_id", "notes",
    ];

    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("no fields to update");
    }

    const { data, error } = await admin
      .from("agents")
      .update(updates)
      .eq("id", id)
      .select("id, name, contact_name, contact_email, contact_phone, address, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, line_official_id, notes, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "agents [id] PUT");
    }

    return NextResponse.json({ agent: data });
  } catch (e) {
    return apiInternalError(e, "agents [id] PUT");
  }
}
