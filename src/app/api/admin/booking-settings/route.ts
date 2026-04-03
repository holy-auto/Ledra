import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/booking-settings
 * 外部予約受付設定（スロット一覧 + 定休日一覧）を取得
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const [slotsRes, closedRes] = await Promise.all([
      supabase
        .from("external_booking_slots")
        .select("id, day_of_week, start_time, end_time, max_bookings, is_active, label")
        .eq("tenant_id", caller.tenantId)
        .order("day_of_week")
        .order("start_time"),
      supabase
        .from("closed_days")
        .select("id, type, day_of_week, closed_date, note")
        .eq("tenant_id", caller.tenantId)
        .order("day_of_week", { nullsFirst: false })
        .order("closed_date", { nullsFirst: false }),
    ]);

    if (slotsRes.error) {
      console.error("[booking-settings] slots error:", slotsRes.error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    if (closedRes.error) {
      console.error("[booking-settings] closed_days error:", closedRes.error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({
      slots: slotsRes.data ?? [],
      closed_days: closedRes.data ?? [],
    });
  } catch (e) {
    console.error("[booking-settings] unexpected:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/booking-settings
 * スロット + 定休日を一括保存（差分更新）
 *
 * Body:
 *   slots: Array<{
 *     id?: string           — 既存レコードのID（更新時）
 *     day_of_week: 0–6
 *     start_time: "HH:MM"
 *     end_time: "HH:MM"
 *     max_bookings: number
 *     is_active: boolean
 *     label?: string
 *   }>
 *   closed_days: Array<{
 *     id?: string
 *     type: "weekly" | "specific"
 *     day_of_week?: 0–6     — weekly の場合
 *     closed_date?: string  — specific の場合 YYYY-MM-DD
 *     note?: string
 *   }>
 *   deleted_slot_ids?: string[]
 *   deleted_closed_day_ids?: string[]
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const slots: any[] = body.slots ?? [];
    const closedDays: any[] = body.closed_days ?? [];
    const deletedSlotIds: string[] = body.deleted_slot_ids ?? [];
    const deletedClosedDayIds: string[] = body.deleted_closed_day_ids ?? [];

    // ── スロット削除 ──
    if (deletedSlotIds.length > 0) {
      const { error } = await supabase
        .from("external_booking_slots")
        .delete()
        .in("id", deletedSlotIds)
        .eq("tenant_id", caller.tenantId);
      if (error) {
        console.error("[booking-settings] delete slots error:", error.message);
        return NextResponse.json({ error: "db_error" }, { status: 500 });
      }
    }

    // ── 定休日削除 ──
    if (deletedClosedDayIds.length > 0) {
      const { error } = await supabase
        .from("closed_days")
        .delete()
        .in("id", deletedClosedDayIds)
        .eq("tenant_id", caller.tenantId);
      if (error) {
        console.error("[booking-settings] delete closed_days error:", error.message);
        return NextResponse.json({ error: "db_error" }, { status: 500 });
      }
    }

    // ── スロット upsert ──
    for (const slot of slots) {
      const payload = {
        tenant_id: caller.tenantId,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        max_bookings: slot.max_bookings ?? 1,
        is_active: slot.is_active ?? true,
        label: slot.label ?? null,
      };

      if (slot.id) {
        const { error } = await supabase
          .from("external_booking_slots")
          .update(payload)
          .eq("id", slot.id)
          .eq("tenant_id", caller.tenantId);
        if (error) {
          console.error("[booking-settings] update slot error:", error.message);
          return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
      } else {
        const { error } = await supabase.from("external_booking_slots").insert(payload);
        if (error) {
          console.error("[booking-settings] insert slot error:", error.message);
          return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
      }
    }

    // ── 定休日 upsert ──
    for (const cd of closedDays) {
      const payload: any = {
        tenant_id: caller.tenantId,
        type: cd.type,
        note: cd.note ?? null,
        day_of_week: cd.type === "weekly" ? cd.day_of_week : null,
        closed_date: cd.type === "specific" ? cd.closed_date : null,
      };

      if (cd.id) {
        const { error } = await supabase
          .from("closed_days")
          .update(payload)
          .eq("id", cd.id)
          .eq("tenant_id", caller.tenantId);
        if (error) {
          console.error("[booking-settings] update closed_day error:", error.message);
          return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
      } else {
        const { error } = await supabase.from("closed_days").insert(payload);
        if (error) {
          console.error("[booking-settings] insert closed_day error:", error.message);
          return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[booking-settings] unexpected:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
