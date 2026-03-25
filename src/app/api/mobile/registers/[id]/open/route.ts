import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Open register session ───
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "register_sessions:operate"))
      return apiForbidden();

    const { id } = await params;

    const body = await request.json().catch(() => null);
    if (body?.opening_cash == null || typeof body.opening_cash !== "number") {
      return apiValidationError("opening_cash (number) is required");
    }

    const { data, error } = await caller.supabase
      .from("register_sessions")
      .insert({
        tenant_id: caller.tenantId,
        register_id: id,
        status: "open",
        opening_cash: body.opening_cash,
        opened_by: caller.userId,
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "registers.open");

    return apiOk({ register_session: data }, 201);
  } catch (e) {
    return apiInternalError(e, "registers.open");
  }
}
