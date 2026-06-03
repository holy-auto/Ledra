/**
 * GET /api/parts/findings — 装着インテグリティの検知結果一覧（抜き取り監査ダッシュボード用）。
 *
 * 既定は status=open を重大度順に返す。severity / installation_id で絞り込み可。
 * RLS(my_tenant_ids) でテナント越えは自動遮断。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L7
 */

import { apiJson, apiInternalError, apiUnauthorized } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { parseFindingsQuery } from "@/lib/parts/findingsQuery";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const q = parseFindingsQuery(new URL(req.url).searchParams);

  try {
    let query = supabase
      .from("part_integrity_findings")
      .select("id, installation_id, rule, severity, detail, status, created_at")
      .order("created_at", { ascending: false })
      .limit(q.limit);

    query = query.eq("status", q.status ?? "open");
    if (q.severity) query = query.eq("severity", q.severity);
    if (q.installationId) query = query.eq("installation_id", q.installationId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // 重大度サマリ（open のみ・全体）
    const { data: openRows, error: sumErr } = await supabase
      .from("part_integrity_findings")
      .select("severity")
      .eq("status", "open")
      .limit(1000);
    if (sumErr) throw new Error(sumErr.message);

    const summary = { critical: 0, warning: 0, info: 0 };
    for (const r of openRows ?? []) {
      const s = r.severity as keyof typeof summary;
      if (s in summary) summary[s]++;
    }

    return apiJson({ findings: data ?? [], summary });
  } catch (e) {
    return apiInternalError(e, "parts/findings GET");
  }
}
