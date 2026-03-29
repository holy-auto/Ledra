import { NextRequest } from "next/server";
import { apiUnauthorized, apiInternalError, apiOk } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily Maintenance Cron Job
 * 1. Auto-expire certificates past their expiry_date
 * 2. Clean up old stripe_processed_events (>90 days)
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return apiUnauthorized(authError);
  }

  const supabase = getSupabaseAdmin();
  const todayStr = new Date().toISOString().slice(0, 10);
  const results = {
    expired_certificates: 0,
    cleaned_stripe_events: 0,
    errors: [] as string[],
  };

  // ─── 1. Auto-expire certificates past expiry_date ───
  try {
    const { data, error } = await supabase
      .from("certificates")
      .update({ status: "expired" })
      .eq("status", "active")
      .not("expiry_date", "is", null)
      .lt("expiry_date", todayStr)
      .select("id");

    if (error) {
      console.error("[cron/maintenance] expire certificates error:", error.message);
      results.errors.push(`expire: ${error.message}`);
    } else {
      results.expired_certificates = data?.length ?? 0;
      if (results.expired_certificates > 0) {
        console.info(`[cron/maintenance] Expired ${results.expired_certificates} certificates`);
      }
    }
  } catch (err) {
    console.error("[cron/maintenance] expire certificates exception:", err);
    results.errors.push("expire: unexpected error");
  }

  // ─── 2. Clean up old stripe_processed_events (>90 days) ───
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString();

    const { count, error } = await supabase
      .from("stripe_processed_events")
      .delete()
      .lt("created_at", cutoffStr);

    if (error) {
      console.error("[cron/maintenance] cleanup stripe events error:", error.message);
      results.errors.push(`stripe_cleanup: ${error.message}`);
    } else {
      results.cleaned_stripe_events = count ?? 0;
      if (results.cleaned_stripe_events > 0) {
        console.info(`[cron/maintenance] Cleaned ${results.cleaned_stripe_events} old stripe events`);
      }
    }
  } catch (err) {
    console.error("[cron/maintenance] cleanup stripe events exception:", err);
    results.errors.push("stripe_cleanup: unexpected error");
  }

  console.info("[cron/maintenance] Done:", JSON.stringify(results));
  return apiOk(results);
}
