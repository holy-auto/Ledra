import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCronFailureAlert } from "@/lib/cronAlert";

export const runtime = "nodejs";

/**
 * POST /api/cron/cleanup-insurer-logs
 * Scheduled cleanup of old logs:
 * - insurer_access_logs: 90 days
 * - insurer_email_verifications: 24 hours
 * - admin_audit_logs: 365 days
 *
 * Protected by CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const results: Record<string, number | string> = {};

    // Cleanup insurer_access_logs (90 days)
    try {
      const { data } = await supabase.rpc("cleanup_insurer_access_logs", { p_retention_days: 90 });
      results.insurer_access_logs = data ?? 0;
    } catch (e: unknown) {
      results.insurer_access_logs = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Cleanup email verifications (24h)
    try {
      const { data } = await supabase.rpc("cleanup_insurer_email_verifications");
      results.email_verifications = data ?? 0;
    } catch (e: unknown) {
      results.email_verifications = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Cleanup admin audit logs (365 days)
    try {
      const { data } = await supabase.rpc("cleanup_admin_audit_logs", { p_retention_days: 365 });
      results.admin_audit_logs = data ?? 0;
    } catch (e: unknown) {
      results.admin_audit_logs = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    console.info("[cron/cleanup-insurer-logs] results:", results);

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    await sendCronFailureAlert("cleanup-insurer-logs", e);
    return NextResponse.json({ error: "Cleanup cron failed" }, { status: 500 });
  }
}
