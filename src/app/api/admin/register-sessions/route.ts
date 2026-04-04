import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: レジセッション一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "register_sessions:view")) {
      return apiForbidden();
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
      .select("id, tenant_id, register_id, opened_by, closed_by, opening_cash, closing_cash, expected_cash, cash_difference, total_sales, total_transactions, status, note, opened_at, closed_at, created_at, updated_at")
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
      return apiInternalError(error, "register_sessions list");
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
    return apiInternalError(e, "register_sessions list");
  }
}

// ─── POST: セッション開始（レジ開局） ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "register_sessions:operate")) {
      return apiForbidden();
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const registerId = (String(body?.register_id ?? "")).trim();
    const openingCash = parseInt(String(body?.opening_cash ?? 0), 10) || 0;

    if (!registerId) {
      return apiValidationError("register_idは必須です");
    }

    // レジがテナントに属するか確認
    const { data: register } = await supabase
      .from("registers")
      .select("id, is_active")
      .eq("id", registerId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!register) {
      return apiValidationError("指定されたレジが見つかりません");
    }
    if (!register.is_active) {
      return apiValidationError("このレジは無効になっています");
    }

    // 同じレジで既にopenのセッションがないか確認
    const { count } = await supabase
      .from("register_sessions")
      .select("id", { count: "exact", head: true })
      .eq("register_id", registerId)
      .eq("status", "open");

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "conflict", message: "このレジには既に開いているセッションがあります" },
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
      .select("id, tenant_id, register_id, opened_by, opening_cash, status, note, opened_at, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "register_sessions insert");
    }

    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "register_sessions create");
  }
}

// ─── PUT: セッション更新/閉鎖（レジ閉局） ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "register_sessions:operate")) {
      return apiForbidden();
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return apiValidationError("idは必須です");

    // 現在のセッション取得
    const { data: current } = await supabase
      .from("register_sessions")
      .select("id, expected_cash")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!current) {
      return apiNotFound("セッションが見つかりません");
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
      .select("id, tenant_id, register_id, opened_by, closed_by, opening_cash, closing_cash, expected_cash, cash_difference, total_sales, total_transactions, status, note, opened_at, closed_at, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "register_sessions update");
    }

    return NextResponse.json({ ok: true, session });
  } catch (e: unknown) {
    return apiInternalError(e, "register_sessions update");
  }
}

// ─── DELETE: セッション削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "register_sessions:manage")) {
      return apiForbidden();
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return apiValidationError("idは必須です");

    const { error } = await supabase
      .from("register_sessions")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "register_sessions delete");
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "register_sessions delete");
  }
}
