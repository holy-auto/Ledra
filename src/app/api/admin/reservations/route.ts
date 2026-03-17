import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { reservationCreateSchema, reservationUpdateSchema, reservationDeleteSchema } from "@/lib/validations/reservation";
import { checkOverlap } from "@/lib/reservations/overlap";
import { syncCreateEvent, syncUpdateEvent, syncDeleteEvent } from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

// ─── GET: 予約一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const p = parsePagination(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";

    let query = supabase
      .from("reservations")
      .select("*", { count: "exact" })
      .eq("tenant_id", caller.tenantId)
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (from) {
      query = query.gte("scheduled_date", from);
    }
    if (to) {
      query = query.lte("scheduled_date", to);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const { data: reservations, error, count } = await query.range(p.from, p.to);
    if (error) return apiInternalError(error, "reservations list query");

    // 顧客名を取得
    const customerIds = [...new Set((reservations ?? []).map((r) => r.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id] = c.name;
      });
    }

    // 車両情報を取得
    const vehicleIds = [...new Set((reservations ?? []).map((r) => r.vehicle_id).filter(Boolean))];
    const vehicleMap: Record<string, string> = {};
    if (vehicleIds.length > 0) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display")
        .in("id", vehicleIds);
      (vehicles ?? []).forEach((v) => {
        const label = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || "車両";
        vehicleMap[v.id] = v.plate_display ? `${label} / ${v.plate_display}` : label;
      });
    }

    const enriched = (reservations ?? []).map((r) => ({
      ...r,
      customer_name: r.customer_id ? (customerMap[r.customer_id] ?? null) : null,
      vehicle_label: r.vehicle_id ? (vehicleMap[r.vehicle_id] ?? null) : null,
    }));

    // 統計
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = enriched.filter((r) => r.scheduled_date === today && r.status !== "cancelled").length;
    const activeCount = enriched.filter((r) => r.status !== "cancelled" && r.status !== "completed").length;

    return NextResponse.json({
      reservations: enriched,
      page: p.page,
      per_page: p.perPage,
      total: count ?? 0,
      stats: {
        total: count ?? 0,
        today_count: todayCount,
        active_count: activeCount,
      },
    });
  } catch (e) {
    return apiInternalError(e, "reservations list");
  }
}

// ─── POST: 予約作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = reservationCreateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(" ");
      return apiValidationError(msg);
    }

    const startTime = (String(body?.start_time ?? "")).trim() || null;
    const endTime = (String(body?.end_time ?? "")).trim() || null;
    const assignedUserId = (String(body?.assigned_user_id ?? "")).trim() || null;

    // ── ダブルブッキングチェック ──
    if (startTime && endTime) {
      const overlaps = await checkOverlap({
        tenantId: caller.tenantId,
        scheduledDate: parsed.data.scheduled_date,
        startTime,
        endTime,
        assignedUserId: assignedUserId ?? undefined,
      });
      if (overlaps.length > 0) {
        return apiError({
          code: "conflict",
          message: `時間帯が重複する予約があります: ${overlaps.map(o => o.overlapping_title).join(", ")}`,
          status: 409,
          data: { overlaps },
        });
      }
    }

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: (String(body?.customer_id ?? "")).trim() || null,
      vehicle_id: (String(body?.vehicle_id ?? "")).trim() || null,
      title: (String(body?.title ?? "")).trim(),
      menu_items_json: body?.menu_items_json ?? [],
      note: (String(body?.note ?? "")).trim() || null,
      scheduled_date: parsed.data.scheduled_date,
      start_time: startTime,
      end_time: endTime,
      assigned_user_id: assignedUserId,
      status: "confirmed",
      estimated_amount: parseInt(String(body?.estimated_amount ?? 0), 10) || 0,
    };

    const { data, error } = await supabase.from("reservations").insert(row).select().single();
    if (error) return apiInternalError(error, "reservation insert");

    // ── Google Calendar 同期（非ブロッキング） ──
    syncCreateEvent(caller.tenantId, {
      id: data.id,
      title: data.title,
      scheduled_date: data.scheduled_date,
      start_time: data.start_time,
      end_time: data.end_time,
      note: data.note,
    }).catch(() => {});

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservation create");
  }
}

// ─── PUT: 予約更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = reservationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(" ");
      return apiValidationError(msg);
    }

    const id = parsed.data.id;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) updates.title = (String(body.title)).trim();
    if (body.customer_id !== undefined) updates.customer_id = (String(body.customer_id)).trim() || null;
    if (body.vehicle_id !== undefined) updates.vehicle_id = (String(body.vehicle_id)).trim() || null;
    if (body.menu_items_json !== undefined) updates.menu_items_json = body.menu_items_json;
    if (body.note !== undefined) updates.note = (String(body.note ?? "")).trim() || null;
    if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date;
    if (body.start_time !== undefined) updates.start_time = (String(body.start_time)).trim() || null;
    if (body.end_time !== undefined) updates.end_time = (String(body.end_time)).trim() || null;
    if (body.assigned_user_id !== undefined) updates.assigned_user_id = (String(body.assigned_user_id)).trim() || null;
    if (body.estimated_amount !== undefined) updates.estimated_amount = parseInt(String(body.estimated_amount), 10) || 0;

    // ── ダブルブッキングチェック（日時変更時のみ） ──
    if (body.scheduled_date || body.start_time || body.end_time) {
      // 現在の予約情報を取得
      const { data: current } = await supabase
        .from("reservations")
        .select("scheduled_date, start_time, end_time, assigned_user_id")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (current) {
        const checkDate = body.scheduled_date ?? current.scheduled_date;
        const checkStart = body.start_time ?? current.start_time;
        const checkEnd = body.end_time ?? current.end_time;
        const checkUser = body.assigned_user_id ?? current.assigned_user_id;

        if (checkStart && checkEnd) {
          const overlaps = await checkOverlap({
            tenantId: caller.tenantId,
            scheduledDate: checkDate,
            startTime: String(checkStart).trim(),
            endTime: String(checkEnd).trim(),
            excludeId: id,
            assignedUserId: checkUser ? String(checkUser).trim() : undefined,
          });
          if (overlaps.length > 0) {
            return apiError({
              code: "conflict",
              message: `時間帯が重複する予約があります: ${overlaps.map(o => o.overlapping_title).join(", ")}`,
              status: 409,
              data: { overlaps },
            });
          }
        }
      }
    }

    // ステータス変更
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
        updates.cancel_reason = (String(body.cancel_reason ?? "")).trim() || null;
      }
    }

    const { data, error } = await supabase
      .from("reservations")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "reservation update");

    // ── Google Calendar 同期（非ブロッキング） ──
    if (body.status === "cancelled") {
      syncDeleteEvent(caller.tenantId, id, data.gcal_event_id).catch(() => {});
    } else {
      syncUpdateEvent(caller.tenantId, {
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        start_time: data.start_time,
        end_time: data.end_time,
        note: data.note,
        gcal_event_id: data.gcal_event_id,
      }).catch(() => {});
    }

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservation update");
  }
}

// ─── DELETE: 予約削除（キャンセル扱い） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = reservationDeleteSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(" ");
      return apiValidationError(msg);
    }

    const id = parsed.data.id;
    const cancelReason = (String(body?.cancel_reason ?? "")).trim() || null;

    const { data, error } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "reservation cancel");

    // ── Google Calendar イベント削除（非ブロッキング） ──
    syncDeleteEvent(caller.tenantId, id, data.gcal_event_id).catch(() => {});

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservation cancel");
  }
}
