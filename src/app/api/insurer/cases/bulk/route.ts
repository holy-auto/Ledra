import { NextRequest, after } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { insurerCaseBulkSchema } from "@/lib/validations/insurer-case";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const parsed = insurerCaseBulkSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { case_ids, status } = parsed.data;

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data: cases, error: fetchErr } = await admin
      .from("insurer_cases")
      .select("id, status, tenant_id, case_number, title")
      .in("id", case_ids)
      .eq("insurer_id", caller.insurerId);

    if (fetchErr) return apiValidationError(fetchErr.message);

    const validCases = (cases ?? []) as Array<{
      id: string;
      status: string;
      tenant_id: string | null;
      case_number: string | null;
      title: string | null;
    }>;
    const validIds = validCases.map((c) => c.id);
    if (validIds.length === 0) {
      return apiValidationError("No matching cases found.");
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { status, updated_at: now };
    if (status === "resolved") updateData.resolved_at = now;
    if (status === "closed") updateData.closed_at = now;

    const { error: updateErr } = await admin.from("insurer_cases").update(updateData).in("id", validIds);

    if (updateErr) return apiValidationError(updateErr.message);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "case_bulk_update",
      meta: { case_ids: validIds, status, route: "PATCH /api/insurer/cases/bulk" },
      ip,
      user_agent: ua,
    });

    // テナント (施工店) の基幹ソフト連携向け webhook。実際にステータスが変わった
    // ケースのみ、対象テナントごとに発火 (購読が無ければ no-op)。
    after(async () => {
      for (const c of validCases) {
        if (!c.tenant_id || c.status === status) continue;
        await emitEntityWebhook(c.tenant_id, "insurer_case.status_changed", c.id, {
          case_id: c.id,
          case_number: c.case_number,
          title: c.title,
          old_status: c.status,
          new_status: status,
          insurer_id: caller.insurerId,
          updated_at: now,
        });
      }
    });

    return apiJson({ updated_count: validIds.length });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/cases/bulk");
  }
}
