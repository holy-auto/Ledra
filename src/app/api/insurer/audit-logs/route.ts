import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  if (caller.role !== "admin" && caller.role !== "auditor") {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "監査ログの閲覧権限がありません。",
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );
  const action = url.searchParams.get("action") ?? "";

  const admin = createAdminClient();
  let query = admin
    .from("insurer_access_logs")
    .select("id, insurer_id, insurer_user_id, action, certificate_id, meta, ip, user_agent, created_at")
    .eq("insurer_id", caller.insurerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) {
    query = query.eq("action", action);
  }

  const { data, error } = await query;
  if (error) return apiValidationError(error.message);

  return NextResponse.json({ logs: data ?? [], limit, offset });
}
