import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/insurer/audit
 * Fetch audit logs with filters. Admin/auditor only.
 * Query params: action, user_id, date_from, date_to, limit, offset
 */
export async function GET(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  if (caller.role !== "admin" && caller.role !== "auditor") {
    return apiForbidden("監査ログの閲覧権限がありません。");
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const userId = url.searchParams.get("user_id") ?? "";
  const dateFrom = url.searchParams.get("date_from") ?? "";
  const dateTo = url.searchParams.get("date_to") ?? "";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  try {
    const admin = createAdminClient();

    // Build query with join to insurer_users for display_name
    let query = admin
      .from("insurer_access_logs")
      .select(
        "id, action, meta, ip, user_agent, created_at, certificate_id, insurer_user_id, insurer_users!insurer_access_logs_insurer_user_id_fkey(display_name)",
      )
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq("action", action);
    }
    if (userId) {
      query = query.eq("insurer_user_id", userId);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      // Add end-of-day for date_to
      const endDate = dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`;
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query;

    if (error) {
      // Fallback: if join fails, query without join
      const fallbackQuery = admin
        .from("insurer_access_logs")
        .select("id, action, meta, ip, user_agent, created_at, certificate_id, insurer_user_id")
        .eq("insurer_id", caller.insurerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) fallbackQuery.eq("action", action);
      if (userId) fallbackQuery.eq("insurer_user_id", userId);
      if (dateFrom) fallbackQuery.gte("created_at", dateFrom);
      if (dateTo) {
        const endDate = dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`;
        fallbackQuery.lte("created_at", endDate);
      }

      const { data: fallbackData, error: fallbackErr } = await fallbackQuery;
      if (fallbackErr) return apiInternalError(fallbackErr, "insurer audit logs");

      return NextResponse.json({
        logs: (fallbackData ?? []).map((l: any) => ({
          ...l,
          user_display_name: null,
        })),
        limit,
        offset,
      });
    }

    // Flatten the join result
    const logs = (data ?? []).map((l: any) => ({
      id: l.id,
      action: l.action,
      meta: l.meta,
      ip: l.ip,
      user_agent: l.user_agent,
      created_at: l.created_at,
      certificate_id: l.certificate_id,
      insurer_user_id: l.insurer_user_id,
      user_display_name: l.insurer_users?.display_name ?? null,
    }));

    // Also fetch distinct users for the filter dropdown
    const { data: userList } = await admin
      .from("insurer_users")
      .select("id, display_name")
      .eq("insurer_id", caller.insurerId)
      .order("display_name", { ascending: true });

    return NextResponse.json({
      logs,
      users: userList ?? [],
      limit,
      offset,
    });
  } catch (e) {
    return apiInternalError(e, "insurer audit logs");
  }
}
