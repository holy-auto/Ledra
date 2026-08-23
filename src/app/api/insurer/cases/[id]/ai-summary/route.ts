/**
 * POST /api/insurer/cases/[id]/ai-summary
 *
 * 保険会社案件の 3 行サマリを生成する。査定担当が案件詳細を開いたとき、
 * 上部バナーに表示する用途。
 */
import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { summarizeCase, buildFallbackLines } from "@/lib/ai/caseSummary";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { certAiFields } from "@/lib/certificates/aiFields";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/insurer/cases/[id]/ai-summary");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("case id is required");

    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const { admin, insurerId } = createInsurerScopedAdmin(caller.insurerId);

    const { data: caseRow, error } = await admin
      .from("insurer_cases")
      .select("title, description, status, priority, certificate_id, vehicle_id")
      .eq("id", id)
      .eq("insurer_id", insurerId)
      .maybeSingle();
    if (error) return apiInternalError(error, "case ai-summary: load");
    if (!caseRow) return apiNotFound("case not found");

    const [vehicleRes, certRes, msgRes] = await Promise.all([
      caseRow.vehicle_id
        ? admin.from("vehicles").select("maker, model").eq("id", caseRow.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
      caseRow.certificate_id
        ? admin.from("certificates").select("service_type, created_at").eq("id", caseRow.certificate_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("insurer_case_messages")
        .select("sender_type, content, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const input = {
      subject: caseRow.title as string | null,
      body: caseRow.description as string | null,
      status: (caseRow.status as string) ?? "open",
      priority: (caseRow.priority as string) ?? "normal",
      vehicle: vehicleRes.data as { maker?: string; model?: string } | null,
      certificate: certRes.data
        ? {
            service_name: certAiFields(certRes.data).service_name,
            issued_at: (certRes.data as { created_at?: string }).created_at,
          }
        : null,
      recentMessages: ((msgRes.data ?? []) as Array<{ sender_type: string; content: string; created_at: string }>).map(
        (m) => ({
          author: m.sender_type,
          body: m.content,
          created_at: m.created_at,
        }),
      ),
    };

    const result = await summarizeCase(input).catch(() => buildFallbackLines(input));
    usage.record({
      insurerId: caller.insurerId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai },
    });
    return apiOk({ summary: result });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "case ai-summary");
  }
}
