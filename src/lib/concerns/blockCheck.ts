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
 * ゲート判定なので fail-closed: クエリがエラーになった場合は「不明」を
 * 「ブロックすべき」として扱う（true を返す）— src/lib/supabase/admin.ts の
 * tenant_id 必須フィルタと同じ理由で、判定不能を「ブロックなし」に倒さない。
 *
 * @returns 未解決の懸念がある場合、またはクエリ失敗時に true
 */
export async function hasUnresolvedConcerns(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { jobId?: string; certificateId?: string },
): Promise<boolean> {
  if (!opts.jobId && !opts.certificateId) return false;

  // jobId と certificateId の両方が指定された場合は OR で検索
  // （懸念は片方しか持たないことがあるため AND だと漏れる）
  const orParts: string[] = [];
  if (opts.jobId) orParts.push(`job_id.eq.${opts.jobId}`);
  if (opts.certificateId) orParts.push(`certificate_id.eq.${opts.certificateId}`);

  const { count, error } = await supabase
    .from("customer_concerns")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", [...UNRESOLVED_CONCERN_STATUSES])
    .or(orParts.join(","));

  if (error) return true;
  return (count ?? 0) > 0;
}
