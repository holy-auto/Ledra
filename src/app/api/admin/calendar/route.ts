import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 入庫予定カレンダー用の読み取り専用エンドポイント。
 * 指定期間 (最大 60 日) の予約を返す。新規予約の作成はしない (別画面)。
 *
 * - RLS を尊重する server client でテナント分離 (tenant_id フィルタは belt-and-suspenders)。
 * - 'cancelled' は除外。
 * - 顧客名 / 車両情報は reservations route と同じく別取得で enrich する
 *   (PostgREST の埋め込み join に頼らず、列名差異の影響を局所化)。
 * - by_date: "YYYY-MM-DD" → 予約 id[] のマップを返し、カレンダー描画を容易にする。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 60;

/** "YYYY-MM-DD" を UTC 正午の Date に変換 (DST/tz の影響を避ける) */
function parseDateOnly(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const from = (url.searchParams.get("from") ?? "").trim();
    const to = (url.searchParams.get("to") ?? "").trim();

    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    if (!fromDate || !toDate) {
      return apiValidationError("from / to は YYYY-MM-DD 形式で指定してください。");
    }
    if (toDate < fromDate) {
      return apiValidationError("to は from 以降の日付を指定してください。");
    }
    const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      return apiValidationError(`期間は最大 ${MAX_RANGE_DAYS} 日までです。`);
    }

    const { data: reservations, error } = await supabase
      .from("reservations")
      .select(
        "id, customer_id, vehicle_id, title, note, scheduled_date, start_time, end_time, status, estimated_amount, assigned_user_id",
      )
      .eq("tenant_id", caller.tenantId)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) return apiInternalError(error, "calendar list");

    const rows = reservations ?? [];

    // 顧客名を取得 (RLS スコープ内)。
    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id as string] = c.name as string;
      });
    }

    // 車両情報を取得 (RLS スコープ内)。
    const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
    const vehicleMap: Record<string, { maker: string | null; model: string | null; plate_display: string | null }> = {};
    if (vehicleIds.length > 0) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, maker, model, plate_display")
        .in("id", vehicleIds);
      (vehicles ?? []).forEach((v) => {
        vehicleMap[v.id as string] = {
          maker: (v.maker as string | null) ?? null,
          model: (v.model as string | null) ?? null,
          plate_display: (v.plate_display as string | null) ?? null,
        };
      });
    }

    const enriched = rows.map((r) => {
      const v = r.vehicle_id ? vehicleMap[r.vehicle_id] : null;
      return {
        id: r.id,
        customer_id: r.customer_id,
        vehicle_id: r.vehicle_id,
        title: r.title,
        note: r.note,
        scheduled_date: r.scheduled_date,
        start_time: r.start_time,
        end_time: r.end_time,
        status: r.status,
        estimated_amount: r.estimated_amount,
        customer_name: r.customer_id ? (customerMap[r.customer_id] ?? null) : null,
        vehicle_maker: v?.maker ?? null,
        vehicle_model: v?.model ?? null,
        vehicle_plate: v?.plate_display ?? null,
      };
    });

    // by_date: 日付ごとの予約 id 配列 (カレンダー描画用)。
    const byDate: Record<string, string[]> = {};
    for (const r of enriched) {
      const key = r.scheduled_date as string;
      if (!key) continue;
      (byDate[key] ??= []).push(r.id as string);
    }

    return apiJson(
      { reservations: enriched, by_date: byDate },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "calendar list");
  }
}
