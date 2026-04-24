import { parseJsonSafe } from "@/lib/api/safeJson";
import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

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

    const body = await parseJsonSafe(request);
    if (body?.closing_cash == null || typeof body.closing_cash !== "number") {
      return apiValidationError("closing_cash (number) is required");
    }

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
        closing_cash: body.closing_cash,
        note: body.note ?? null,
        closed_by: caller.userId,
        closed_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("tenant_id", caller.tenantId)
      .select("id, register_id, status, opening_cash, closing_cash, note, opened_by, opened_at, closed_by, closed_at")
      .single();

    if (error) return apiInternalError(error, "registers.close");

    // Audit log
    await caller.supabase.from("audit_logs").insert({
      tenant_id: caller.tenantId,
      table_name: "register_sessions",
      record_id: session.id,
      action: "register_session_closed",
      performed_by: caller.userId,
      ip_address: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    });

    return apiOk({ register_session: data });
  } catch (e) {
    return apiInternalError(e, "registers.close");
  }
}
