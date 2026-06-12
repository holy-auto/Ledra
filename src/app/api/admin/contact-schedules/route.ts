import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import {
  contactScheduleCreateSchema,
  contactScheduleUpdateSchema,
  contactScheduleDeleteSchema,
} from "@/lib/validations/contact-schedule";

export const dynamic = "force-dynamic";

const SELECT_COLS =
  "id, tenant_id, customer_id, vehicle_id, assigned_user_id, contact_type, scheduled_at, status, result, notes, completed_at, created_at, updated_at";

// ─── GET: コンタクト予定一覧 ───
// クエリ: status=pending|completed|all, from=YYYY-MM-DD, to=YYYY-MM-DD
// from/to 未指定時は「今日〜今後7日」をデフォルトレンジにする。
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "pending";
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    // デフォルトレンジ: 今日 00:00 〜 7日後 23:59:59 (ローカルではなく UTC 基準で十分)。
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const defaultTo = new Date(defaultFrom);
    defaultTo.setDate(defaultTo.getDate() + 7);

    const fromIso = fromParam ? new Date(`${fromParam}T00:00:00`).toISOString() : defaultFrom.toISOString();
    const toIso = toParam ? new Date(`${toParam}T23:59:59`).toISOString() : defaultTo.toISOString();

    let query = supabase
      .from("contact_schedules")
      .select(SELECT_COLS)
      .eq("tenant_id", caller.tenantId)
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso)
      .order("scheduled_at", { ascending: true });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: schedules, error } = await query;
    if (error) {
      return apiInternalError(error, "contact-schedules list");
    }

    // ── 顧客情報を取得 (customers(id, name, phone)) ──
    const customerIds = [...new Set((schedules ?? []).map((s) => s.customer_id).filter(Boolean))] as string[];
    const customerMap: Record<string, { id: string; name: string; phone: string | null }> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("tenant_id", caller.tenantId)
        .in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id] = { id: c.id, name: c.name, phone: c.phone ?? null };
      });
    }

    // ── 車両情報を取得 (vehicles: maker/model/plate_display) ──
    const vehicleIds = [...new Set((schedules ?? []).map((s) => s.vehicle_id).filter(Boolean))] as string[];
    const vehicleMap: Record<string, { id: string; label: string; plate: string | null }> = {};
    if (vehicleIds.length > 0) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, maker, model, plate_display")
        .eq("tenant_id", caller.tenantId)
        .in("id", vehicleIds);
      (vehicles ?? []).forEach((v) => {
        const label = [v.maker, v.model].filter(Boolean).join(" ") || "車両";
        vehicleMap[v.id] = { id: v.id, label, plate: v.plate_display ?? null };
      });
    }

    const enriched = (schedules ?? []).map((s) => ({
      ...s,
      customer: s.customer_id ? (customerMap[s.customer_id] ?? null) : null,
      vehicle: s.vehicle_id ? (vehicleMap[s.vehicle_id] ?? null) : null,
    }));

    // 統計 (返却レンジ内の件数)
    const stats = {
      total: enriched.length,
      pending: enriched.filter((s) => s.status === "pending").length,
      completed: enriched.filter((s) => s.status === "completed").length,
    };

    return apiJson(
      { schedules: enriched, stats },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e: unknown) {
    return apiInternalError(e, "contact-schedules list");
  }
}

// ─── POST: コンタクト予定作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // staff 以上のみ作成可 (viewer は閲覧のみ)。
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("コンタクト予定を作成する権限がありません。");
    }

    const parsed = contactScheduleCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id,
      assigned_user_id: input.assigned_user_id,
      contact_type: input.contact_type,
      scheduled_at: input.scheduled_at,
      status: "pending" as const,
      notes: input.notes,
    };

    const { data, error } = await supabase.from("contact_schedules").insert(row).select(SELECT_COLS).single();
    if (error) {
      return apiInternalError(error, "contact-schedules insert");
    }

    return apiJson({ ok: true, schedule: data });
  } catch (e: unknown) {
    return apiInternalError(e, "contact-schedules create");
  }
}

// ─── PATCH: コンタクト予定更新 (完了/スキップ/リスケ + 結果記録) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("コンタクト予定を更新する権限がありません。");
    }

    const parsed = contactScheduleUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, status, result, notes, completed_at } = parsed.data;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (result !== undefined) updates.result = result;
    if (notes !== undefined) updates.notes = notes;

    // status=completed の場合は completed_at を now() で強制セット
    // (client が明示送信した completed_at があればそれを優先)。
    if (status === "completed") {
      updates.completed_at = completed_at ?? new Date().toISOString();
    } else if (status !== undefined) {
      // 完了以外へ戻す場合は完了時刻をクリア
      updates.completed_at = null;
    } else if (completed_at !== null) {
      updates.completed_at = completed_at;
    }

    const { data, error } = await supabase
      .from("contact_schedules")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLS)
      .maybeSingle();

    if (error) {
      return apiInternalError(error, "contact-schedules update");
    }
    if (!data) {
      return apiNotFound("対象のコンタクト予定が見つかりません。");
    }

    return apiJson({ ok: true, schedule: data });
  } catch (e: unknown) {
    return apiInternalError(e, "contact-schedules update");
  }
}

// ─── DELETE: コンタクト予定削除 (クエリ ?id=) ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("コンタクト予定を削除する権限がありません。");
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    const parsed = contactScheduleDeleteSchema.safeParse({ id });
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid id");
    }

    const { data, error } = await supabase
      .from("contact_schedules")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId)
      .select("id")
      .maybeSingle();

    if (error) {
      return apiInternalError(error, "contact-schedules delete");
    }
    if (!data) {
      return apiNotFound("対象のコンタクト予定が見つかりません。");
    }

    return apiJson({ ok: true, deleted: true });
  } catch (e: unknown) {
    return apiInternalError(e, "contact-schedules delete");
  }
}
