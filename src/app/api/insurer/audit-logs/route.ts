import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiForbidden, apiInternalError } from "@/lib/api/response";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    if (caller.role !== "admin" && caller.role !== "auditor") {
      return apiForbidden("監査ログの閲覧権限がありません。");
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
    const action = url.searchParams.get("action") ?? "";

    const { admin } = createInsurerScopedAdmin(caller.insurerId);
    let query = admin
      .from("insurer_access_logs")
      .select("id, action, meta, ip, user_agent, created_at, certificate_id, insurer_user_id")
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq("action", action);
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "insurer.audit-logs");

    return apiJson({ logs: data ?? [], limit, offset });
  } catch (e) {
    return apiInternalError(e, "GET /api/insurer/audit-logs");
  }
}
