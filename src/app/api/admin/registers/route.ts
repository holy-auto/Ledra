import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { registerCreateSchema, registerUpdateSchema } from "@/lib/validations/register";

export const dynamic = "force-dynamic";

// ─── GET: レジ一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "registers:view")) {
      return apiForbidden();
    }

    const url = new URL(req.url);
    const storeId = url.searchParams.get("store_id") ?? "";
    const isActive = url.searchParams.get("is_active") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const perPage = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10)));

    let query = supabase
      .from("registers")
      .select("id, tenant_id, store_id, name, is_active, sort_order, created_at, updated_at")
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    let countQuery = supabase
      .from("registers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (storeId) {
      query = query.eq("store_id", storeId);
      countQuery = countQuery.eq("store_id", storeId);
    }
    if (isActive === "true") {
      query = query.eq("is_active", true);
      countQuery = countQuery.eq("is_active", true);
    } else if (isActive === "false") {
      query = query.eq("is_active", false);
      countQuery = countQuery.eq("is_active", false);
    }

    if (page > 0) {
      const offset = (page - 1) * perPage;
      query = query.range(offset, offset + perPage - 1);
    }

    const [{ data: registers, error }, { count: totalCount }] = await Promise.all([query, countQuery]);
    if (error) {
      return apiInternalError(error, "registers list");
    }

    const total = totalCount ?? (registers ?? []).length;

    return apiJson({
      registers: registers ?? [],
      ...(page > 0 && {
        pagination: {
          page,
          per_page: perPage,
          total,
          total_pages: Math.ceil(total / perPage),
        },
      }),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "registers list");
  }
}

// ─── POST: レジ作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "registers:manage")) {
      return apiForbidden();
    }

    const parsed = registerCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { name, store_id: storeId, is_active, sort_order } = parsed.data;

    // store_idがテナントに属するか確認
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!store) {
      return apiValidationError("指定された店舗が見つかりません");
    }

    const { data: register, error } = await supabase
      .from("registers")
      .insert({
        tenant_id: caller.tenantId,
        store_id: storeId,
        name,
        is_active,
        sort_order,
      })
      .select("id, tenant_id, store_id, name, is_active, sort_order, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "registers insert");
    }

    return apiJson({ register }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "registers create");
  }
}

// ─── PUT: レジ更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "registers:manage")) {
      return apiForbidden();
    }

    const parsed = registerUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }

    const { data: register, error } = await supabase
      .from("registers")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, tenant_id, store_id, name, is_active, sort_order, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "registers update");
    }

    return apiJson({ ok: true, register });
  } catch (e: unknown) {
    return apiInternalError(e, "registers update");
  }
}

// ─── DELETE: レジ削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "registers:manage")) {
      return apiForbidden();
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return apiValidationError("idは必須です");

    // openセッションがある場合は削除不可
    const { count } = await supabase
      .from("register_sessions")
      .select("id", { count: "exact", head: true })
      .eq("register_id", id)
      .eq("status", "open");

    if ((count ?? 0) > 0) {
      return apiValidationError("開いているセッションがあるため削除できません");
    }

    const { error } = await supabase.from("registers").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "registers delete");
    }

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "registers delete");
  }
}
