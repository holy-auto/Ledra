import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

// ─── GET: レジ一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "registers:view")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const storeId = url.searchParams.get("store_id") ?? "";
    const isActive = url.searchParams.get("is_active") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const perPage = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10)));

    let query = supabase
      .from("registers")
      .select("*")
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
      console.error("[registers] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const total = totalCount ?? (registers ?? []).length;

    return NextResponse.json({
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
    console.error("registers list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: レジ作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "registers:manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const name = (String(body?.name ?? "")).trim();
    const storeId = (String(body?.store_id ?? "")).trim();

    if (!name) return NextResponse.json({ error: "レジ名は必須です" }, { status: 400 });
    if (!storeId) return NextResponse.json({ error: "store_idは必須です" }, { status: 400 });

    // store_idがテナントに属するか確認
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!store) {
      return NextResponse.json({ error: "指定された店舗が見つかりません" }, { status: 400 });
    }

    const { data: register, error } = await supabase
      .from("registers")
      .insert({
        tenant_id: caller.tenantId,
        store_id: storeId,
        name,
        is_active: body?.is_active !== false,
        sort_order: typeof body?.sort_order === "number" ? body.sort_order : 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[registers] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ register }, { status: 201 });
  } catch (e: unknown) {
    console.error("register create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: レジ更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "registers:manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "idは必須です" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = (String(body.name)).trim();
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

    const { data: register, error } = await supabase
      .from("registers")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) {
      console.error("[registers] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, register });
  } catch (e: unknown) {
    console.error("register update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: レジ削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "registers:manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idは必須です" }, { status: 400 });

    // openセッションがある場合は削除不可
    const { count } = await supabase
      .from("register_sessions")
      .select("id", { count: "exact", head: true })
      .eq("register_id", id)
      .eq("status", "open");

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "開いているセッションがあるため削除できません" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("registers")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[registers] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("register delete failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
