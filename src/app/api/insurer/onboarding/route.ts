import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * GET /api/insurer/onboarding
 * Check onboarding status for the current insurer.
 */
export async function GET() {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const { data: insurer } = await admin
      .from("insurers")
      .select("onboarding_completed_at, name, contact_email, contact_phone, corporate_number, address, plan_tier")
      .eq("id", caller.insurerId)
      .single();

    if (!insurer) {
      return NextResponse.json({ error: "insurer_not_found" }, { status: 404 });
    }

    const isComplete = !!insurer.onboarding_completed_at;

    // Determine what's missing
    const checklist = {
      profile_complete: !!(insurer.name && insurer.contact_email),
      contact_info: !!(insurer.contact_phone),
      plan_selected: !!(insurer.plan_tier && insurer.plan_tier !== "basic"),
    };

    return NextResponse.json({
      completed: isComplete,
      completed_at: insurer.onboarding_completed_at,
      checklist,
      insurer: {
        name: insurer.name,
        contact_email: insurer.contact_email,
        contact_phone: insurer.contact_phone,
        corporate_number: insurer.corporate_number,
        address: insurer.address,
        plan_tier: insurer.plan_tier,
      },
    });
  } catch (e) {
    return apiInternalError(e, "insurer onboarding status");
  }
}

/**
 * POST /api/insurer/onboarding
 * Mark onboarding as completed.
 */
export async function POST() {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const admin = createAdminClient();
    const { error } = await admin
      .from("insurers")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", caller.insurerId);

    if (error) {
      console.error("[insurer/onboarding] update error:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "insurer onboarding complete");
  }
}
