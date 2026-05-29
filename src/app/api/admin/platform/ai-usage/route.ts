/**
 * GET /api/admin/platform/ai-usage
 *
 * 運営ダッシュボードで参照する AI 利用集計。
 *
 * - 期間: ?days=7 / 30 / 90 (デフォルト 30)
 * - 対象: 自テナント (運営ロールは platform_admin で全テナント横断、追加実装は別途)
 *
 * 戻り値:
 *   - byOutcome: outcome 別件数
 *   - byEndpoint: エンドポイント別件数 + 平均 confidence + 累計 token
 *   - dailySeries: 日次のコール数 (チャート用)
 *   - confidenceHistogram: 0.0-0.1, 0.1-0.2, ..., 0.9-1.0 のヒストグラム
 *   - totalLatencyP50/P95: ms
 *
 * テーブル未マイグレーション時は全項目 0 / 空配列で 200 を返す (UI を壊さない)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UsageRow {
  endpoint: string | null;
  outcome: string | null;
  confidence: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string | null;
}

interface EmptyStats {
  byOutcome: Record<string, number>;
  byEndpoint: Array<{
    endpoint: string;
    count: number;
    avgConfidence: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
  }>;
  dailySeries: Array<{ date: string; count: number }>;
  confidenceHistogram: number[];
  totalCount: number;
  okCount: number;
  errorCount: number;
  latencyP50: number | null;
  latencyP95: number | null;
}

function emptyStats(): EmptyStats {
  return {
    byOutcome: {},
    byEndpoint: [],
    dailySeries: [],
    confidenceHistogram: new Array(10).fill(0),
    totalCount: 0,
    okCount: 0,
    errorCount: 0,
    latencyP50: null,
    latencyP95: null,
  };
}

function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get("days") ?? "30");
    const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("ai_usage_logs")
      .select("endpoint, outcome, confidence, input_tokens, output_tokens, latency_ms, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) {
      if (isMissingTableError(error)) {
        return apiOk({
          stats: emptyStats(),
          warning: "ai_usage_logs テーブルが未作成のため空の集計を返しています。",
          days,
        });
      }
      return apiInternalError(error, "ai-usage GET");
    }

    const stats = aggregate((data ?? []) as UsageRow[], days);
    return apiOk({ stats, days });
  } catch (e: unknown) {
    return apiInternalError(e, "ai-usage GET");
  }
}

function aggregate(rows: UsageRow[], days: number): EmptyStats {
  const byOutcome: Record<string, number> = {};
  const byEndpoint = new Map<
    string,
    { count: number; confSum: number; confN: number; inT: number; outT: number }
  >();
  const dayMap = new Map<string, number>();
  const hist = new Array(10).fill(0);
  const latencies: number[] = [];

  let okCount = 0;
  let errorCount = 0;

  for (const r of rows) {
    if (r.outcome) byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    if (r.outcome === "ok") okCount++;
    else if (r.outcome === "error") errorCount++;

    if (r.endpoint) {
      const cur = byEndpoint.get(r.endpoint) ?? { count: 0, confSum: 0, confN: 0, inT: 0, outT: 0 };
      cur.count += 1;
      if (typeof r.confidence === "number") {
        cur.confSum += r.confidence;
        cur.confN += 1;
        const bin = Math.min(9, Math.max(0, Math.floor(r.confidence * 10)));
        hist[bin] += 1;
      }
      cur.inT += r.input_tokens ?? 0;
      cur.outT += r.output_tokens ?? 0;
      byEndpoint.set(r.endpoint, cur);
    }
    if (typeof r.latency_ms === "number") latencies.push(r.latency_ms);

    if (r.created_at) {
      const d = r.created_at.slice(0, 10);
      dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
    }
  }

  latencies.sort((a, b) => a - b);
  const p = (q: number) => (latencies.length === 0 ? null : latencies[Math.floor(latencies.length * q)]);

  // dailySeries: 連続した days 日の 0 埋め
  const series: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({ date: d, count: dayMap.get(d) ?? 0 });
  }

  return {
    byOutcome,
    byEndpoint: [...byEndpoint.entries()]
      .map(([endpoint, v]) => ({
        endpoint,
        count: v.count,
        avgConfidence: v.confN > 0 ? Math.round((v.confSum / v.confN) * 100) / 100 : null,
        totalInputTokens: v.inT,
        totalOutputTokens: v.outT,
      }))
      .sort((a, b) => b.count - a.count),
    dailySeries: series,
    confidenceHistogram: hist,
    totalCount: rows.length,
    okCount,
    errorCount,
    latencyP50: p(0.5),
    latencyP95: p(0.95),
  };
}
