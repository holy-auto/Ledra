import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { stocktakeSessionCreateSchema, stocktakeSessionUpdateSchema } from "@/lib/validations/stocktake";

export const dynamic = "force-dynamic";

// ─── GET: 棚卸セッション一覧 (新しい順) ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: sessions, error } = await supabase
      .from("stocktake_sessions")
      .select("id, name, status, started_at, closed_at, notes, created_at, updated_at")
      .eq("tenant_id", caller.tenantId)
      .order("started_at", { ascending: false });
    if (error) return apiInternalError(error, "stocktake GET");

    const sessionIds = (sessions ?? []).map((s) => s.id);

    // セッション毎の明細数・カウント済み数を集計 (item_id だけ取得して JS で集計)
    const itemCounts: Record<string, number> = {};
    const countedCounts: Record<string, number> = {};
    if (sessionIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from("stocktake_items")
        .select("session_id, counted_qty")
        .eq("tenant_id", caller.tenantId)
        .in("session_id", sessionIds);
      if (itemsErr) return apiInternalError(itemsErr, "stocktake GET items");

      for (const it of items ?? []) {
        const sid = it.session_id as string;
        itemCounts[sid] = (itemCounts[sid] ?? 0) + 1;
        if (it.counted_qty != null) countedCounts[sid] = (countedCounts[sid] ?? 0) + 1;
      }
    }

    const enriched = (sessions ?? []).map((s) => ({
      ...s,
      item_count: itemCounts[s.id] ?? 0,
      counted_count: countedCounts[s.id] ?? 0,
    }));

    return apiJson({ sessions: enriched });
  } catch (e) {
    return apiInternalError(e, "stocktake GET");
  }
}

// ─── POST: 棚卸セッション新規作成 (有効な menu_items から明細を自動生成) ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = stocktakeSessionCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // セッション作成
    const sessionId = crypto.randomUUID();
    const { data: session, error: sessionErr } = await admin
      .from("stocktake_sessions")
      .insert({
        id: sessionId,
        tenant_id: caller.tenantId,
        name: parsed.data.name,
        notes: parsed.data.notes,
        status: "open",
        created_by: caller.userId,
      })
      .select("id, name, status, started_at, closed_at, notes, created_at, updated_at")
      .single();
    if (sessionErr) return apiInternalError(sessionErr, "stocktake POST session");

    // 有効な品目から明細を自動生成。menu_items に在庫数フィールドが無いため
    // expected_qty は 0 で初期化する (実測後に差異を確認する運用)。
    const { data: menuItems, error: miErr } = await admin
      .from("menu_items")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("is_active", true);
    if (miErr) return apiInternalError(miErr, "stocktake POST menu_items");

    let itemCount = 0;
    if (menuItems && menuItems.length > 0) {
      const rows = menuItems.map((mi) => ({
        id: crypto.randomUUID(),
        tenant_id: caller.tenantId,
        session_id: sessionId,
        menu_item_id: mi.id,
        expected_qty: 0,
        counted_qty: null,
      }));
      const { error: insErr } = await admin.from("stocktake_items").insert(rows);
      if (insErr) return apiInternalError(insErr, "stocktake POST items");
      itemCount = rows.length;
    }

    return apiJson({ ok: true, session: { ...session, item_count: itemCount, counted_count: 0 } });
  } catch (e) {
    return apiInternalError(e, "stocktake POST");
  }
}

// ─── PATCH: 棚卸セッション更新 (name / status / notes) ───
export async function PATCH(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = stocktakeSessionUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, name, status, notes } = parsed.data;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) {
      updates.status = status;
      // 締めるときに closed_at を設定、再オープン時はクリア
      updates.closed_at = status === "closed" ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新内容がありません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("stocktake_sessions")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, name, status, started_at, closed_at, notes, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "stocktake PATCH");
    if (!data) return apiNotFound("棚卸セッションが見つかりません。");

    return apiJson({ ok: true, session: data });
  } catch (e) {
    return apiInternalError(e, "stocktake PATCH");
  }
}
