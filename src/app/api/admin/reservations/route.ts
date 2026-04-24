import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { syncCreateEvent, syncUpdateEvent, syncDeleteEvent } from "@/lib/gcal/client";
import { enforceBilling } from "@/lib/billing/guard";
import { parsePagination } from "@/lib/api/pagination";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import {
  reservationCreateSchema,
  reservationDeleteSchema,
  reservationUpdateSchema,
} from "@/lib/validations/reservation";

export const dynamic = "force-dynamic";

// ─── GET: 予約一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const dateFrom = url.searchParams.get("from") ?? "";
    const dateTo = url.searchParams.get("to") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const pagination = parsePagination(req);

    let query = supabase
      .from("reservations")
      .select(
        "id, customer_id, vehicle_id, title, menu_items_json, note, scheduled_date, start_time, end_time, assigned_user_id, status, estimated_amount, created_at, workflow_template_id, current_step_key, current_step_order, progress_pct",
        { count: "exact" },
      )
      .eq("tenant_id", caller.tenantId)
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (dateFrom) {
      query = query.gte("scheduled_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("scheduled_date", dateTo);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    // Apply pagination if page param was provided
    if (pagination.page > 0) {
      query = query.range(pagination.from, pagination.to);
    }

    const { data: reservations, error, count } = await query;
    if (error) {
      return apiInternalError(error, "reservations list");
    }

    // 顧客名を取得
    const customerIds = [...new Set((reservations ?? []).map((r) => r.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
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

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        reservations: enriched,
        stats: {
          total: count ?? enriched.length,
          today_count: todayCount,
          active_count: activeCount,
        },
        ...(pagination.page > 0 && { page: pagination.page, per_page: pagination.perPage, total: count ?? 0 }),
      },
      { headers },
    );
  } catch (e: unknown) {
    return apiInternalError(e, "reservations list");
  }
}

// ─── POST: 予約作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "reservation_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = reservationCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id,
      title: input.title,
      menu_items_json: input.menu_items_json ?? [],
      note: input.note,
      scheduled_date: input.scheduled_date,
      start_time: input.start_time,
      end_time: input.end_time,
      assigned_user_id: input.assigned_user_id,
      status: input.status,
      estimated_amount: input.estimated_amount ?? 0,
    };

    const { data: reservation, error } = await supabase
      .from("reservations")
      .insert(row)
      .select(
        "id, tenant_id, customer_id, vehicle_id, title, menu_items_json, note, scheduled_date, start_time, end_time, assigned_user_id, status, estimated_amount, created_at, updated_at",
      )
      .single();
    if (error) {
      return apiInternalError(error, "reservations insert");
    }

    // ── Google Calendar 同期（非ブロッキング） ──
    syncCreateEvent(caller.tenantId, {
      id: reservation.id,
      title: reservation.title,
      scheduled_date: reservation.scheduled_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      note: reservation.note,
      customer_name: null,
      vehicle_label: null,
    }).catch((e) => console.error("[reservations] gcal sync create failed:", e));

    return apiJson({ ok: true, reservation });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations create");
  }
}

// ─── PUT: 予約更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "reservation_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = reservationUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, cancel_reason, ...rest } = parsed.data;

    const updates: Record<string, unknown> = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    // menu_items_json が undefined のキーは update で上書きしたくないので剥がす
    for (const key of Object.keys(updates)) {
      if (updates[key] === undefined) delete updates[key];
    }

    // キャンセル時はタイムスタンプと理由を追記
    if (rest.status === "cancelled") {
      updates.cancelled_at = new Date().toISOString();
      updates.cancel_reason = cancel_reason ?? null;
    }

    const { data, error } = await supabase
      .from("reservations")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, customer_id, vehicle_id, title, menu_items_json, note, scheduled_date, start_time, end_time, assigned_user_id, status, estimated_amount, gcal_event_id, cancelled_at, cancel_reason, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "reservations update");
    }

    // ── Google Calendar 同期（非ブロッキング） ──
    if (data.status === "cancelled" && data.gcal_event_id) {
      // キャンセル時は GCal イベントを削除
      syncDeleteEvent(caller.tenantId, data.id, data.gcal_event_id).catch((e) =>
        console.error("[reservations] gcal sync delete failed:", e),
      );
    } else if (data.gcal_event_id) {
      // 既存イベントの更新
      syncUpdateEvent(caller.tenantId, {
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        start_time: data.start_time,
        end_time: data.end_time,
        note: data.note,
        gcal_event_id: data.gcal_event_id,
      }).catch((e) => console.error("[reservations] gcal sync update failed:", e));
    } else {
      // gcal_event_id がまだない場合は新規作成
      syncCreateEvent(caller.tenantId, {
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        start_time: data.start_time,
        end_time: data.end_time,
        note: data.note,
      }).catch((e) => console.error("[reservations] gcal sync create failed:", e));
    }

    return apiJson({ ok: true, reservation: data });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations update");
  }
}

// ─── DELETE: 予約削除（キャンセル扱い） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "reservation_delete",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = reservationDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

    const hardDelete = body.hard_delete === true;

    if (hardDelete) {
      // 完全削除（キャンセル済み or 完了のみ許可）
      const { data: existing } = await supabase
        .from("reservations")
        .select("status")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (!existing) return apiNotFound("not_found");
      if (existing.status !== "cancelled" && existing.status !== "completed") {
        return apiValidationError("active_reservation_cannot_delete");
      }

      const { error: delErr } = await supabase
        .from("reservations")
        .delete()
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);

      if (delErr) {
        return apiInternalError(delErr, "reservations hard_delete");
      }
      return apiJson({ ok: true, deleted: true });
    }

    // ソフトデリート（キャンセル扱い）
    const cancelReason = String(body?.cancel_reason ?? "").trim() || null;

    // キャンセル前に gcal_event_id を取得
    const { data: existing } = await supabase
      .from("reservations")
      .select("gcal_event_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

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
      .select(
        "id, tenant_id, customer_id, vehicle_id, title, status, cancelled_at, cancel_reason, gcal_event_id, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "reservations cancel");
    }

    // ── Google Calendar 同期: イベント削除（非ブロッキング） ──
    if (existing?.gcal_event_id) {
      syncDeleteEvent(caller.tenantId, id, existing.gcal_event_id).catch((e) =>
        console.error("[reservations] gcal sync delete failed:", e),
      );
    }

    return apiJson({ ok: true, reservation: data });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations cancel");
  }
}
