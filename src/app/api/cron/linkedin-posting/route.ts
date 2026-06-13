import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { runLinkedInPost } from "@/lib/marketing/runLinkedInPost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily LinkedIn auto-post cron.
 *
 * Publishes the next post from the rotation (see runLinkedInPost). The pointer
 * is derived from previously-posted rows in `marketing_linkedin_log`, so
 * failed/skipped runs do not consume a slot — the same post is retried next run.
 *
 * If LinkedIn isn't configured yet (LINKEDIN_AUTOPOST_ENABLED!=="true" or
 * missing credentials), the run records a 'skipped' row and returns ok — it
 * never alerts, so the cron pipeline stays green until LinkedIn is wired up.
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return apiUnauthorized(authError ?? undefined);
  }

  try {
    const supabase = createServiceRoleAdmin(
      "cron:linkedin-posting — publishes one scheduled marketing post to LinkedIn",
    );

    const lock = await withCronLock(supabase, "linkedin-posting", 600, async () => {
      return runLinkedInPost(supabase);
    });

    if (!lock.acquired) {
      return apiJson({ success: true, skipped: "lock-held", timestamp: new Date().toISOString() });
    }

    return apiJson({ success: true, timestamp: new Date().toISOString(), result: lock.value });
  } catch (e) {
    await sendCronFailureAlert("linkedin-posting", e);
    return apiInternalError(e, "linkedin-posting cron");
  }
}
