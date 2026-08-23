import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { mobileRegisterCloseSchema } from "@/lib/validations/mobile";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";

export const dynamic = "force-dynamic";

// ─── POST: Close register session ───
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    // Allow register_sessions:operate (staff) or register_sessions:manage (admin)
    if (
      !hasPermission(caller.role, "register_sessions:operate") &&
      !hasPermission(caller.role, "register_sessions:manage")
    ) {
      return apiForbidden();
    }

    const { id } = await params;

    const parsed = await parseJsonBody(request, mobileRegisterCloseSchema);
    if (!parsed.ok) return parsed.response;
    const { closing_cash, note } = parsed.data;

    // Find the open session for this register
    const { data: session } = await caller.supabase
      .from("register_sessions")
      .select("id, status")
      .eq("register_id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .single();

    if (!session) return apiNotFound();

    const { data, error } = await caller.supabase
      .from("register_sessions")
      .update({
        status: "closed",
        closing_cash,
        note: note ?? null,
        closed_by: caller.userId,
        closed_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("tenant_id", caller.tenantId)
      .select("id, register_id, status, opening_cash, closing_cash, note, opened_by, opened_at, closed_by, closed_at")
      .single();

    if (error) return apiInternalError(error, "registers.close");

    // Audit log
    await logTenantAuditEvent(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "register_session_closed",
      table: "register_sessions",
      recordId: session.id,
      req: request,
    });

    return apiOk({ register_session: data });
  } catch (e) {
    return apiInternalError(e, "registers.close");
  }
}
