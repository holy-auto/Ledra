import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const admin = createAdminClient();

  try {
    const base = admin
      .from("insurer_cases")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", caller.insurerId);

    const [openRes, activeRes, todayRes] = await Promise.all([
      base.eq("status", "open"),
      admin
        .from("insurer_cases")
        .select("id", { count: "exact", head: true })
        .eq("insurer_id", caller.insurerId)
        .in("status", ["in_progress", "pending_tenant"]),
      admin
        .from("insurer_cases")
        .select("id", { count: "exact", head: true })
        .eq("insurer_id", caller.insurerId)
        .gte("updated_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

    return NextResponse.json({
      open_count: openRes.count ?? 0,
      active_count: activeRes.count ?? 0,
      today_count: todayRes.count ?? 0,
    });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/cases/summary");
  }
}
