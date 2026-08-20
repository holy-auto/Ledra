/**
 * IMP-026: 懸念によるブロック判定
 *
 * IMP-028 の Certificate Gate がこのヘルパーを使い、
 * 未解決の顧客懸念がある場合に請求書/証明書発行をブロックする。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { UNRESOLVED_CONCERN_STATUSES } from "./types";

/**
 * 指定ジョブまたは証明書に未解決の顧客懸念があるか判定。
 *
 * @returns 未解決の懸念がある場合 true
 */
export async function hasUnresolvedConcerns(
  supabase: SupabaseClient,
  opts: { jobId?: string; certificateId?: string },
): Promise<boolean> {
  if (!opts.jobId && !opts.certificateId) return false;

  let query = supabase
    .from("customer_concerns")
    .select("id", { count: "exact", head: true })
    .in("status", [...UNRESOLVED_CONCERN_STATUSES]);

  if (opts.jobId) query = query.eq("job_id", opts.jobId);
  if (opts.certificateId) query = query.eq("certificate_id", opts.certificateId);

  const { count } = await query;
  return (count ?? 0) > 0;
}
