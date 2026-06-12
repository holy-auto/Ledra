import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { LINKEDIN_POSTS, LINKEDIN_POST_COUNT } from "@/lib/marketing/linkedinPosts";
import { postToLinkedIn } from "@/lib/marketing/linkedin";
import { resolveLinkedInCredentials } from "@/lib/marketing/linkedinTokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily LinkedIn auto-post cron.
 *
 * Picks the next post from LINKEDIN_POSTS in order (looping back to the start)
 * and publishes it to LinkedIn. The rotation pointer is derived from the number
 * of previously-posted rows in `marketing_linkedin_log`, so failed/skipped
 * runs do not consume a slot — the same post is retried on the next run.
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
      if (LINKEDIN_POST_COUNT === 0) {
        return { skipped: "no-content" as const };
      }

      // Rotation pointer = how many posts we've successfully published so far.
      const { count, error: countError } = await supabase
        .from("marketing_linkedin_log")
        .select("*", { count: "exact", head: true })
        .eq("status", "posted");

      if (countError) {
        throw new Error(`failed to read post log: ${countError.message}`);
      }

      const index = (count ?? 0) % LINKEDIN_POST_COUNT;
      const post = LINKEDIN_POSTS[index];

      const logRow = {
        post_index: index,
        post_day: post.day,
        text_snapshot: post.text,
        status: "skipped" as "posted" | "failed" | "skipped",
        linkedin_urn: null as string | null,
        error: null as string | null,
      };

      // Resolve a valid access token (auto-refreshing if near expiry). When the
      // feature is disabled or unconfigured this returns a skip reason instead
      // of credentials, so the run is recorded as 'skipped' without alerting.
      const resolved = await resolveLinkedInCredentials(supabase);
      if (!resolved.ok) {
        logRow.status = "skipped";
        logRow.error = resolved.reason;
      } else {
        const result = await postToLinkedIn(post.text, resolved.credentials);
        if (result.ok) {
          logRow.status = "posted";
          logRow.linkedin_urn = result.urn || null;
        } else {
          logRow.status = "failed";
          logRow.error = result.error;
        }
      }

      const { error: insertError } = await supabase.from("marketing_linkedin_log").insert(logRow);
      if (insertError) {
        // Posting may have succeeded; surface the logging failure but don't
        // double-post. Throwing here triggers the failure alert.
        throw new Error(`posted=${logRow.status} but failed to write log: ${insertError.message}`);
      }

      return {
        index,
        day: post.day,
        title: post.title,
        status: logRow.status,
        urn: logRow.linkedin_urn ?? undefined,
        reason: logRow.status !== "posted" ? (logRow.error ?? undefined) : undefined,
      };
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
