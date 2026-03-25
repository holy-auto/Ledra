import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─── 有効なステータス一覧 ───
const VALID_STATUSES = [
  "pending", "quoting", "accepted", "in_progress",
  "approval_pending", "payment_pending",
  "completed", "rejected", "cancelled",
] as const;

// ─── ステータス遷移ルール ───
// key: 現在のステータス, value: { next: 次ステータス, side: "from" | "to" | "both" }[]
const TRANSITIONS: Record<string, { next: string; side: "from" | "to" | "both" }[]> = {
  pending:          [{ next: "accepted", side: "to" }, { next: "rejected", side: "to" }, { next: "cancelled", side: "from" }],
  quoting:          [{ next: "accepted", side: "to" }, { next: "rejected", side: "to" }, { next: "cancelled", side: "from" }],
  accepted:         [{ next: "in_progress", side: "to" }, { next: "cancelled", side: "from" }],
  in_progress:      [{ next: "approval_pending", side: "to" }],
  approval_pending: [{ next: "payment_pending", side: "from" }],
  payment_pending:  [{ next: "completed", side: "both" }],
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const { searchParams } = new URL(req.url);

    // テナント一覧リクエスト
    if (searchParams.has("_tenants")) {
      const { data: memberships, error: memErr } = await supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", caller.userId);

      if (memErr) {
        console.error("[orders] _tenants memberships failed:", memErr.message);
        return NextResponse.json({ myTenants: [] });
      }

      const tenantIds = (memberships ?? []).map((m) => m.tenant_id as string);
      let tenantMap: Record<string, string> = {};

      if (tenantIds.length > 0) {
        const { data: tenants } = await supabase
          .from("tenants")
          .select("id, name")
          .in("id", tenantIds);
        for (const t of tenants ?? []) {
          tenantMap[t.id] = t.name;
        }
      }

      const myTenants = tenantIds.map((tid) => ({
        tenant_id: tid,
        tenant_name: tenantMap[tid] ?? tid.slice(0, 8),
      }));
      return NextResponse.json({ myTenants });
    }

    const type = searchParams.get("type"); // sent | received | all | browse
    const status = searchParams.get("status");
    const browseQuery = searchParams.get("q"); // search query for browse mode

    // ─── 公開案件ブラウズモード ───
    if (type === "browse") {
      const admin = getSupabaseAdmin();
      let query = admin
        .from("job_orders")
        .select("*")
        .is("to_tenant_id", null)
        .in("status", ["pending"])
        .order("created_at", { ascending: false });

      // 自テナントの案件は除外
      query = query.neq("from_tenant_id", tenantId);

      // カテゴリ or タイトル検索
      if (browseQuery) {
        query = query.or(`title.ilike.%${browseQuery}%,category.ilike.%${browseQuery}%,description.ilike.%${browseQuery}%`);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data: orders, error } = await query.limit(100);
      if (error) {
        console.error("[orders] browse_failed:", error.message);
        return NextResponse.json({ orders: [] });
      }

      // 発注元テナント名を付与
      const tenantIds = [...new Set((orders ?? []).map((o) => o.from_tenant_id))];
      let tenantNameMap: Record<string, string> = {};
      if (tenantIds.length > 0) {
        const { data: tenants } = await admin
          .from("tenants")
          .select("id, name")
          .in("id", tenantIds);
        for (const t of tenants ?? []) {
          tenantNameMap[t.id] = t.name;
        }
      }

      const enriched = (orders ?? []).map((o) => ({
        ...o,
        from_company: tenantNameMap[o.from_tenant_id] ?? "",
      }));

      return NextResponse.json({ orders: enriched });
    }

    let query = supabase
      .from("job_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (type === "sent") {
      query = query.eq("from_tenant_id", tenantId);
    } else if (type === "received") {
      query = query.eq("to_tenant_id", tenantId);
    } else {
      // 発注先未定(to_tenant_id IS NULL)の注文も発注者なら表示
      query = query.or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: orders, error } = await query.limit(100);

    if (error) {
      console.error("[orders] list_failed:", error.message, error.details);
      return NextResponse.json({ orders: [], source: "empty" });
    }

    return NextResponse.json({ orders: orders ?? [] });
  } catch (e: unknown) {
    console.error("[orders] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const body = await req.json();
    const { to_tenant_id, title, description, category, budget, deadline, vehicle_id } = body;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Use admin client to bypass RLS (API already validated auth above)
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("job_orders")
      .insert({
        from_tenant_id: tenantId,
        to_tenant_id: to_tenant_id || null,
        title,
        description: description || null,
        category: category || null,
        budget: budget || null,
        deadline: deadline || null,
        vehicle_id: vehicle_id || null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[orders] insert_failed:", error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ order: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[orders] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: ステータス更新（遷移ルール + 監査ログ付き） ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const body = await req.json();
    const { id, status, cancel_reason } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const admin = getSupabaseAdmin();

    // 現在の注文を取得
    const { data: current, error: fetchError } = await admin
      .from("job_orders")
      .select("*")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }

    // ステータス遷移チェック
    const allowed = TRANSITIONS[current.status] ?? [];
    const transition = allowed.find((t) => t.next === status);
    if (!transition) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${status}'` },
        { status: 400 },
      );
    }

    // 操作権限チェック（from/to のどちら側が操作可能か）
    const isFrom = current.from_tenant_id === tenantId;
    const isTo = current.to_tenant_id != null && current.to_tenant_id === tenantId;
    if (transition.side === "from" && !isFrom) {
      return NextResponse.json({ error: "発注者のみがこの操作を行えます" }, { status: 403 });
    }
    if (transition.side === "to" && !isTo) {
      return NextResponse.json({ error: "受注者のみがこの操作を行えます" }, { status: 403 });
    }

    // 更新データ構築
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "cancelled") {
      updateData.cancelled_by = caller.userId;
      updateData.cancel_reason = cancel_reason || null;
    }
    if (status === "approval_pending") {
      updateData.vendor_completed_at = new Date().toISOString();
    }
    if (status === "payment_pending") {
      updateData.client_approved_at = new Date().toISOString();
    }

    const { data, error } = await admin
      .from("job_orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[orders] update_failed:", error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 監査ログ記録（fire-and-forget、失敗しても本体処理は成功扱い）
    admin
      .from("order_audit_log")
      .insert({
        job_order_id: id,
        actor_user_id: caller.userId,
        actor_tenant_id: tenantId,
        action: "status_changed",
        old_value: { status: current.status },
        new_value: { status },
      })
      .then(() => {});

    return NextResponse.json({ ok: true, order: data });
  } catch (e: unknown) {
    console.error("[orders] PUT failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PATCH: 公開案件の受注（to_tenant_id をセット） ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // 注文取得
    const { data: order, error: fetchErr } = await admin
      .from("job_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }

    // 自テナントの案件は受注不可
    if (order.from_tenant_id === tenantId) {
      return NextResponse.json({ error: "自社の案件は受注できません" }, { status: 400 });
    }

    // 既に受注者がいる場合は不可
    if (order.to_tenant_id) {
      return NextResponse.json({ error: "この案件は既に受注済みです" }, { status: 409 });
    }

    // pending 以外は不可
    if (order.status !== "pending") {
      return NextResponse.json({ error: "申請中の案件のみ受注可能です" }, { status: 400 });
    }

    // 受注: to_tenant_id をセット + ステータスを accepted に
    const { data, error } = await admin
      .from("job_orders")
      .update({
        to_tenant_id: tenantId,
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[orders] accept_failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 監査ログ
    admin
      .from("order_audit_log")
      .insert({
        job_order_id: id,
        actor_user_id: caller.userId,
        actor_tenant_id: tenantId,
        action: "order_accepted_from_browse",
        old_value: { status: order.status, to_tenant_id: null },
        new_value: { status: "accepted", to_tenant_id: tenantId },
      })
      .then(() => {});

    return NextResponse.json({ ok: true, order: data });
  } catch (e: unknown) {
    console.error("[orders] PATCH failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
