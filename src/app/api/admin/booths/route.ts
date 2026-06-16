import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { boothCreateSchema, boothUpdateSchema, boothDeleteSchema } from "@/lib/validations/booth";

export const dynamic = "force-dynamic";

// GET: ブース一覧 + 指定日（既定は今日）の予約割当（稼働カレンダー用）
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const date = new URL(req.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const [boothsRes, resRes] = await Promise.all([
      supabase
        .from("booths")
        .select("id, name, booth_type, capacity, color, sort_order, is_active, note, created_at")
        .eq("tenant_id", caller.tenantId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("reservations")
        .select("id, title, scheduled_date, start_time, end_time, status, booth_id, assigned_staff_id")
        .eq("tenant_id", caller.tenantId)
        .eq("scheduled_date", date)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true }),
    ]);

    if (boothsRes.error) return apiInternalError(boothsRes.error, "booths list");

    return apiJson({
      booths: boothsRes.data ?? [],
      date,
      assignments: resRes.data ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "booths list");
  }
}

// POST: ブース作成
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = boothCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const { data, error } = await supabase
      .from("booths")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: caller.tenantId,
        name: input.name,
        booth_type: input.booth_type,
        capacity: input.capacity,
        color: input.color,
        sort_order: input.sort_order,
        note: input.note,
        is_active: input.is_active,
      })
      .select("id")
      .single();
    if (error) return apiInternalError(error, "booth create");

    return apiJson({ ok: true, id: data.id });
  } catch (e) {
    return apiInternalError(e, "booth create");
  }
}

// PUT: ブース更新（送られたキーのみ）
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const rawBody = await req.json().catch(() => ({}));
    const parsed = boothUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...rest } = parsed.data;

    const sentKeys = new Set(
      rawBody && typeof rawBody === "object" ? Object.keys(rawBody as Record<string, unknown>) : [],
    );
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && sentKeys.has(key)) updates[key] = value;
    }

    const { error } = await supabase.from("booths").update(updates).eq("id", id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "booth update");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "booth update");
  }
}

// DELETE: ブース削除（reservations.booth_id は SET NULL）
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = boothDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { error } = await supabase.from("booths").delete().eq("id", parsed.data.id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "booth delete");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "booth delete");
  }
}
