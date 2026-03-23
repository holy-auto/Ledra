import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

// ─── GET: 予約一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";

    let query = supabase
      .from("reservations")
      .select("*")
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

    const { data: reservations, error } = await query;
    if (error) {
      console.error("[reservations] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

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
      stats: {
        total: enriched.length,
        today_count: todayCount,
        active_count: activeCount,
      },
    });
  } catch (e: unknown) {
    console.error("reservations list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: 予約作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const title = (String(body?.title ?? "")).trim();
    if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });

    const scheduledDate = String(body?.scheduled_date ?? "").trim();
    if (!scheduledDate) return NextResponse.json({ error: "missing_scheduled_date" }, { status: 400 });

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: (String(body?.customer_id ?? "")).trim() || null,
      vehicle_id: (String(body?.vehicle_id ?? "")).trim() || null,
      title,
      menu_items_json: body?.menu_items_json ?? [],
      note: (String(body?.note ?? "")).trim() || null,
      scheduled_date: scheduledDate,
      start_time: (String(body?.start_time ?? "")).trim() || null,
      end_time: (String(body?.end_time ?? "")).trim() || null,
      assigned_user_id: (String(body?.assigned_user_id ?? "")).trim() || null,
      status: "confirmed",
      estimated_amount: parseInt(String(body?.estimated_amount ?? 0), 10) || 0,
    };

    const { data, error } = await supabase.from("reservations").insert(row).select().single();
    if (error) {
      console.error("[reservations] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reservation: data });
  } catch (e: unknown) {
    console.error("reservation create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: 予約更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

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

    if (error) {
      console.error("[reservations] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reservation: data });
  } catch (e: unknown) {
    console.error("reservation update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: 予約削除（キャンセル扱い） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const hardDelete = body?.hard_delete === true;

    if (hardDelete) {
      // 完全削除（キャンセル済み or 完了のみ許可）
      const { data: existing } = await supabase
        .from("reservations")
        .select("status")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (existing.status !== "cancelled" && existing.status !== "completed") {
        return NextResponse.json({ error: "active_reservation_cannot_delete" }, { status: 400 });
      }

      const { error: delErr } = await supabase
        .from("reservations")
        .delete()
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);

      if (delErr) {
        console.error("[reservations] hard_delete_failed:", delErr.message);
        return NextResponse.json({ error: "delete_failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: true });
    }

    // ソフトデリート（キャンセル扱い）
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

    if (error) {
      console.error("[reservations] cancel_failed:", error.message);
      return NextResponse.json({ error: "cancel_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reservation: data });
  } catch (e: unknown) {
    console.error("reservation cancel failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
