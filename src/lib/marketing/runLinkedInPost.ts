/**
 * Shared "post the next LinkedIn item" runner, used by both the daily cron
 * (`/api/cron/linkedin-posting`) and the manual admin trigger
 * (`/api/admin/marketing/linkedin/test`).
 *
 * Rotation pointer = number of previously-posted rows in
 * `marketing_linkedin_log`, so failed/skipped/dry-run runs never consume a
 * slot — the same post is retried next time.
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { LINKEDIN_POSTS, LINKEDIN_POST_COUNT } from "@/lib/marketing/linkedinPosts";
import { postToLinkedIn } from "@/lib/marketing/linkedin";
import { resolveLinkedInCredentials } from "@/lib/marketing/linkedinTokens";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export interface RunLinkedInPostOptions {
  /** Post a specific post by its `day` instead of the rotation pointer. */
  forcedDay?: number;
  /** Resolve credentials and pick the post, but do not publish or log. */
  dryRun?: boolean;
}

export interface RunLinkedInPostResult {
  index?: number;
  day?: number;
  title?: string;
  /** "posted" | "failed" | "skipped" | "dry-run-ok" | "no-content" | "unknown-day" */
  status: string;
  urn?: string;
  reason?: string;
}

async function nextRotationIndex(admin: Admin): Promise<number> {
  const { count, error } = await admin
    .from("marketing_linkedin_log")
    .select("*", { count: "exact", head: true })
    .eq("status", "posted");
  if (error) throw new Error(`failed to read post log: ${error.message}`);
  return (count ?? 0) % LINKEDIN_POST_COUNT;
}

export async function runLinkedInPost(admin: Admin, opts: RunLinkedInPostOptions = {}): Promise<RunLinkedInPostResult> {
  if (LINKEDIN_POST_COUNT === 0) {
    return { status: "no-content" };
  }

  // Choose which post to publish.
  let index: number;
  if (opts.forcedDay != null) {
    index = LINKEDIN_POSTS.findIndex((p) => p.day === opts.forcedDay);
    if (index < 0) {
      return { status: "unknown-day", reason: `no post with day=${opts.forcedDay}` };
    }
  } else {
    index = await nextRotationIndex(admin);
  }
  const post = LINKEDIN_POSTS[index];

  // Resolve a valid access token (auto-refreshing if near expiry).
  const resolved = await resolveLinkedInCredentials(admin);

  if (opts.dryRun) {
    return {
      index,
      day: post.day,
      title: post.title,
      status: resolved.ok ? "dry-run-ok" : "skipped",
      reason: resolved.ok ? undefined : resolved.reason,
    };
  }

  const logRow = {
    post_index: index,
    post_day: post.day,
    text_snapshot: post.text,
    status: "skipped" as "posted" | "failed" | "skipped",
    linkedin_urn: null as string | null,
    error: null as string | null,
  };

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

  const { error: insertError } = await admin.from("marketing_linkedin_log").insert(logRow);
  if (insertError) {
    // Posting may have succeeded; surface the logging failure but don't
    // double-post. Throwing lets the caller alert / return 500.
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
}
