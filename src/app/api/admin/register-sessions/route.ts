import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── GET: レジセッション一覧 ───
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "register_sessions:view")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const registerId = url.searchParams.get("register_id") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const perPage = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10)));

    let query = supabase
      .from("register_sessions")
      .select("*")
      .eq("tenant_id", caller.tenantId)
      .order("opened_at", { ascending: false });

    let countQuery = supabase
      .from("register_sessions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (registerId) {
      query = query.eq("register_id", registerId);
      countQuery = countQuery.eq("register_id", registerId);
    }
    if (status && status !== "all") {
      query = query.eq("status", status);
      countQuery = countQuery.eq("status", status);
    }
    if (from) {
      query = query.gte("opened_at", from);
      countQuery = countQuery.gte("opened_at", from);
    }
    if (to) {
      query = query.lte("opened_at", to);
      countQuery = countQuery.lte("opened_at", to);
    }

    if (page > 0) {
      const offset = (page - 1) * perPage;
      query = query.range(offset, offset + perPage - 1);
    }

    const [{ data: sessions, error }, { count: totalCount }] = await Promise.all([query, countQuery]);
    if (error) {
      console.error("[register_sessions] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const total = totalCount ?? (sessions ?? []).length;

    return NextResponse.json({
      sessions: sessions ?? [],
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
    console.error("register_sessions list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: セッション開始（レジ開局） ───
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "register_sessions:operate")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const registerId = (String(body?.register_id ?? "")).trim();
    const openingCash = parseInt(String(body?.opening_cash ?? 0), 10) || 0;

    if (!registerId) {
      return NextResponse.json({ error: "register_idは必須です" }, { status: 400 });
    }

    // レジがテナントに属するか確認
    const { data: register } = await supabase
      .from("registers")
      .select("id, is_active")
      .eq("id", registerId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!register) {
      return NextResponse.json({ error: "指定されたレジが見つかりません" }, { status: 400 });
    }
    if (!register.is_active) {
      return NextResponse.json({ error: "このレジは無効になっています" }, { status: 400 });
    }

    // 同じレジで既にopenのセッションがないか確認
    const { count } = await supabase
      .from("register_sessions")
      .select("id", { count: "exact", head: true })
      .eq("register_id", registerId)
      .eq("status", "open");

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "このレジには既に開いているセッションがあります" },
        { status: 409 },
      );
    }

    const { data: session, error } = await supabase
      .from("register_sessions")
      .insert({
        tenant_id: caller.tenantId,
        register_id: registerId,
        opened_by: caller.userId,
        opening_cash: openingCash,
        status: "open",
        note: (String(body?.note ?? "")).trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[register_sessions] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (e: unknown) {
    console.error("register_session create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: セッション更新/閉鎖（レジ閉局） ───
export async function PUT(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "register_sessions:operate")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "idは必須です" }, { status: 400 });

    // 現在のセッション取得
    const { data: current } = await supabase
      .from("register_sessions")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!current) {
      return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.note !== undefined) updates.note = (String(body.note ?? "")).trim() || null;
    if (body.total_sales !== undefined) updates.total_sales = parseInt(String(body.total_sales), 10) || 0;
    if (body.total_transactions !== undefined) updates.total_transactions = parseInt(String(body.total_transactions), 10) || 0;
    if (body.expected_cash !== undefined) updates.expected_cash = parseInt(String(body.expected_cash), 10) || 0;

    // closing_cashが設定された場合、セッションを閉鎖
    if (body.closing_cash !== undefined) {
      const closingCash = parseInt(String(body.closing_cash), 10) || 0;
      updates.closing_cash = closingCash;
      updates.status = "closed";
      updates.closed_at = new Date().toISOString();
      updates.closed_by = caller.userId;

      // cash_difference計算: 期待値がある場合はそれとの差額、なければopeningとの差額
      const expectedCash = body.expected_cash !== undefined
        ? parseInt(String(body.expected_cash), 10) || 0
        : current.expected_cash;

      if (expectedCash !== null && expectedCash !== undefined) {
        updates.cash_difference = closingCash - expectedCash;
        updates.expected_cash = expectedCash;
      }
    }

    const { data: session, error } = await supabase
      .from("register_sessions")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) {
      console.error("[register_sessions] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session });
  } catch (e: unknown) {
    console.error("register_session update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: セッション削除 ───
export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "register_sessions:manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "idは必須です" }, { status: 400 });

    const { error } = await supabase
      .from("register_sessions")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[register_sessions] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("register_session delete failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
