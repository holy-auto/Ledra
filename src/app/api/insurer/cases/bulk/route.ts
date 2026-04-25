import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { insurerCaseBulkSchema } from "@/lib/validations/insurer-case";

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
      .select("id, status")
      .in("id", case_ids)
      .eq("insurer_id", caller.insurerId);

    if (fetchErr) return apiValidationError(fetchErr.message);

    const validIds = (cases ?? []).map((c: { id: string }) => c.id);
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

    return apiJson({ updated_count: validIds.length });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/cases/bulk");
  }
}
