import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { makePublicId } from "@/lib/publicId";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { enforceBilling } from "@/lib/billing/guard";
import {
  apiJson,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
  apiInternalError,
} from "@/lib/api/response";
import { orderAcceptSchema, orderCreateSchema, orderUpdateSchema } from "@/lib/validations/order";
import { sendOrderInvoiceEmail } from "@/lib/orders/orderInvoice";

// ─── ステータス遷移ルール ───
// key: 現在のステータス, value: { next: 次ステータス, side: "from" | "to" | "both" }[]
const TRANSITIONS: Record<string, { next: string; side: "from" | "to" | "both" }[]> = {
  pending: [
    { next: "accepted", side: "to" },
    { next: "rejected", side: "to" },
    { next: "cancelled", side: "from" },
  ],
  quoting: [
    { next: "accepted", side: "to" },
    { next: "rejected", side: "to" },
    { next: "cancelled", side: "from" },
  ],
  accepted: [
    { next: "in_progress", side: "to" },
    { next: "cancelled", side: "from" },
  ],
  in_progress: [{ next: "approval_pending", side: "to" }],
  approval_pending: [{ next: "payment_pending", side: "from" }],
  payment_pending: [{ next: "completed", side: "both" }],
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
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
        return apiJson({ myTenants: [] });
      }

      const tenantIds = (memberships ?? []).map((m) => m.tenant_id as string);
      const tenantMap: Record<string, string> = {};

      if (tenantIds.length > 0) {
        const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        for (const t of tenants ?? []) {
          tenantMap[t.id] = t.name;
        }
      }

      const myTenants = tenantIds.map((tid) => ({
        tenant_id: tid,
        tenant_name: tenantMap[tid] ?? tid.slice(0, 8),
      }));

      // 自社のパートナースコアも返す
      let myScore = null;
      if (tenantId) {
        const { admin: scopedAdmin } = createTenantScopedAdmin(tenantId);
        const { data: ps } = await scopedAdmin
          .from("partner_scores")
          .select("total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        myScore = ps;
      }

      return apiJson({ myTenants, myScore });
    }

    const type = searchParams.get("type"); // sent | received | all | browse
    const status = searchParams.get("status");
    const browseQuery = searchParams.get("q"); // search query for browse mode

    // ─── 公開案件ブラウズモード ───
    if (type === "browse") {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      let query = admin
        .from("job_orders")
        .select(
          "id, public_id, from_tenant_id, to_tenant_id, title, description, category, budget, deadline, vehicle_id, status, created_at, updated_at",
        )
        .is("to_tenant_id", null)
        .in("status", ["pending"])
        .order("created_at", { ascending: false });

      // 自テナントの案件は除外
      query = query.neq("from_tenant_id", tenantId);

      // カテゴリ or タイトル検索（PostgREST特殊文字をエスケープ）
      if (browseQuery) {
        const sanitized = browseQuery.replace(/[%_\\,().]/g, (ch) => `\\${ch}`);
        query = query.or(`title.ilike.%${sanitized}%,category.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data: orders, error } = await query.limit(100);
      if (error) {
        console.error("[orders] browse_failed:", error.message);
        return apiJson({ orders: [] });
      }

      // 発注元テナント名を付与
      const tenantIds = [...new Set((orders ?? []).map((o) => o.from_tenant_id))];
      const tenantNameMap: Record<string, string> = {};
      if (tenantIds.length > 0) {
        const { data: tenants } = await admin.from("tenants").select("id, name").in("id", tenantIds);
        for (const t of tenants ?? []) {
          tenantNameMap[t.id] = t.name;
        }
      }

      const enriched = (orders ?? []).map((o) => ({
        ...o,
        from_company: tenantNameMap[o.from_tenant_id] ?? "",
      }));

      return apiJson({ orders: enriched });
    }

    let query = supabase
      .from("job_orders")
      .select(
        "id, public_id, from_tenant_id, to_tenant_id, title, description, category, budget, deadline, vehicle_id, status, cancelled_by, cancel_reason, vendor_completed_at, client_approved_at, created_at, updated_at",
      )
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
      return apiJson({ orders: [], source: "empty" });
    }

    return apiJson({ orders: orders ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "orders GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "order_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const tenantId = caller.tenantId;

    const parsed = orderCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { to_tenant_id, title, description, category, budget, deadline, vehicle_id, requester_email, requester_company } = parsed.data;

    // Use admin client to bypass RLS (API already validated auth above)
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 発注元の請求タイミング設定を引き継ぐ
    const { data: billingSettings } = await admin
      .from("tenant_billing_settings")
      .select("billing_timing")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const billingTiming = billingSettings?.billing_timing ?? "on_inspection";

    // Build insert payload — only include non-null fields to avoid
    // hitting unexpected NOT NULL constraints on columns with defaults
    const insertPayload: Record<string, unknown> = {
      public_id: makePublicId(),
      from_tenant_id: tenantId,
      title,
      status: "pending",
      billing_timing: billingTiming,
    };
    if (to_tenant_id) insertPayload.to_tenant_id = to_tenant_id;
    if (description) insertPayload.description = description;
    if (category) insertPayload.category = category;
    if (budget != null && budget !== "") insertPayload.budget = Number(budget);
    if (deadline) insertPayload.deadline = deadline;
    if (vehicle_id) insertPayload.vehicle_id = vehicle_id;
    if (requester_email) insertPayload.requester_email = requester_email;
    if (requester_company) insertPayload.requester_company = requester_company;

    const { data, error } = await admin
      .from("job_orders")
      .insert(insertPayload)
      .select(
        "id, public_id, from_tenant_id, to_tenant_id, title, description, category, budget, deadline, vehicle_id, status, created_at, updated_at",
      )
      .single();

    if (error) {
      console.error(
        "[orders] insert_failed:",
        JSON.stringify({ message: error.message, details: error.details, hint: error.hint, code: error.code }),
      );
      return apiInternalError(error, "orders insert");
    }

    return apiJson({ order: data }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "orders POST");
  }
}

// ─── PUT: ステータス更新（遷移ルール + 監査ログ付き） ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "order_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const tenantId = caller.tenantId;

    const parsed = orderUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, status, cancel_reason } = parsed.data;

    // Use admin client to bypass RLS
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 現在の注文を取得
    const { data: current, error: fetchError } = await admin
      .from("job_orders")
      .select("id, status, from_tenant_id, to_tenant_id")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (fetchError || !current) {
      return apiNotFound("order_not_found");
    }

    // ステータス遷移チェック
    const allowed = TRANSITIONS[current.status] ?? [];
    const transition = allowed.find((t) => t.next === status);
    if (!transition) {
      return apiValidationError(`Cannot transition from '${current.status}' to '${status}'`);
    }

    // 操作権限チェック（from/to のどちら側が操作可能か）
    const isFrom = current.from_tenant_id === tenantId;
    const isTo = current.to_tenant_id != null && current.to_tenant_id === tenantId;
    if (transition.side === "from" && !isFrom) {
      return apiForbidden("発注者のみがこの操作を行えます");
    }
    if (transition.side === "to" && !isTo) {
      return apiForbidden("受注者のみがこの操作を行えます");
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

    // UPDATE にも tenant 検証フィルタをコピー (TOCTOU 対策 / README セキュリティお約束 #2)。
    // さらに status 固定で楽観ロック (遷移中に別リクエストが先行していたら no-op)。
    const { data, error } = await admin
      .from("job_orders")
      .update(updateData)
      .eq("id", id)
      .eq("status", current.status)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .select(
        "id, public_id, from_tenant_id, to_tenant_id, title, description, category, budget, deadline, vehicle_id, status, cancelled_by, cancel_reason, vendor_completed_at, client_approved_at, created_at, updated_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[orders] update_failed:", error.message, error.details, error.hint);
      return apiInternalError(error, "orders update");
    }
    if (!data) {
      return apiNotFound("order_not_found_or_conflict");
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
      .then(
        () => {},
        (e: unknown) => console.error("[orders] audit log failed:", e),
      );

    // 検収承認 → payment_pending 遷移時に請求書を自動送付（fire-and-forget）
    if (status === "payment_pending") {
      sendOrderInvoiceEmail(id).catch((e: unknown) =>
        console.error("[orders] invoice email failed:", e),
      );
    }

    return apiJson({ ok: true, order: data });
  } catch (e: unknown) {
    return apiInternalError(e, "orders PUT");
  }
}

// ─── PATCH: 公開案件の受注（to_tenant_id をセット） ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "order_accept",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const tenantId = caller.tenantId;

    const parsed = orderAcceptSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 注文取得
    const { data: order, error: fetchErr } = await admin
      .from("job_orders")
      .select("id, status, from_tenant_id, to_tenant_id")
      .eq("id", id)
      .single();

    if (fetchErr || !order) {
      return apiNotFound("order_not_found");
    }

    // 自テナントの案件は受注不可
    if (order.from_tenant_id === tenantId) {
      return apiValidationError("自社の案件は受注できません");
    }

    // 既に受注者がいる場合は不可
    if (order.to_tenant_id) {
      return apiJson({ error: "この案件は既に受注済みです" }, { status: 409 });
    }

    // pending 以外は不可
    if (order.status !== "pending") {
      return apiValidationError("申請中の案件のみ受注可能です");
    }

    // 受注: to_tenant_id をセット + ステータスを accepted に
    // UPDATE 側に「自テナント以外」「pending」「未受注」の条件を全てコピーし TOCTOU を潰す。
    // 競合する受注リクエストが同時に走っても、DB レベルで先着 1 件だけ成功する。
    const { data, error } = await admin
      .from("job_orders")
      .update({
        to_tenant_id: tenantId,
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .is("to_tenant_id", null)
      .neq("from_tenant_id", tenantId)
      .select(
        "id, public_id, from_tenant_id, to_tenant_id, title, description, category, budget, deadline, vehicle_id, status, created_at, updated_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[orders] accept_failed:", error.message);
      return apiInternalError(error, "orders accept");
    }
    if (!data) {
      return NextResponse.json({ error: "この案件は既に受注済みか、受注できません" }, { status: 409 });
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
      .then(
        () => {},
        (e: unknown) => console.error("[orders] audit log failed:", e),
      );

    return apiJson({ ok: true, order: data });
  } catch (e: unknown) {
    return apiInternalError(e, "orders PATCH");
  }
}
