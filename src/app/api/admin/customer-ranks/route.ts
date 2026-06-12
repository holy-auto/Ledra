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
import { customerRankCreateSchema, customerRankUpdateSchema } from "@/lib/validations/customer-rank";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_COLS = "id, rank_name, rank_order, min_visits, min_total_spend, badge_color, created_at, updated_at";

/** numeric(12,0) は文字列で返るため number に正規化する */
function normalizeRank<T extends { min_total_spend: unknown }>(row: T) {
  return {
    ...row,
    min_total_spend: Number(row.min_total_spend ?? 0),
  };
}

/** Postgres unique_violation (23505) かどうか */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

// ─── GET: ランク定義一覧 (rank_order 昇順) ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: rows, error } = await supabase
      .from("customer_rank_rules")
      .select(SELECT_COLS)
      .eq("tenant_id", caller.tenantId)
      .order("rank_order", { ascending: true });
    if (error) return apiInternalError(error, "customer-ranks GET");

    return apiJson({ ranks: (rows ?? []).map(normalizeRank) });
  } catch (e) {
    return apiInternalError(e, "customer-ranks GET");
  }
}

// ─── POST: ランク作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = customerRankCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { rank_name, rank_order, min_visits, min_total_spend, badge_color } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customer_rank_rules")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: caller.tenantId,
        rank_name,
        rank_order,
        min_visits,
        min_total_spend,
        badge_color,
      })
      .select(SELECT_COLS)
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        return apiValidationError("同じ表示順のランクが既に存在します。");
      }
      return apiInternalError(error, "customer-ranks POST");
    }

    return apiJson({ ok: true, rank: normalizeRank(data) });
  } catch (e) {
    return apiInternalError(e, "customer-ranks POST");
  }
}

// ─── PATCH: ランク更新 (body に id) ───
export async function PATCH(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = customerRankUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const body = parsed.data;

    // 対象ランクが自テナントに存在することを確認
    const { data: existing } = await supabase
      .from("customer_rank_rules")
      .select("id")
      .eq("id", body.id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!existing) return apiNotFound("ランクが見つかりません。");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.rank_name !== undefined) updates.rank_name = body.rank_name;
    if (body.rank_order !== undefined) updates.rank_order = body.rank_order;
    if (body.min_visits !== undefined) updates.min_visits = body.min_visits;
    if (body.min_total_spend !== undefined) updates.min_total_spend = body.min_total_spend;
    if (body.badge_color !== undefined) updates.badge_color = body.badge_color;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customer_rank_rules")
      .update(updates)
      .eq("id", body.id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLS)
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        return apiValidationError("同じ表示順のランクが既に存在します。");
      }
      return apiInternalError(error, "customer-ranks PATCH");
    }

    return apiJson({ ok: true, rank: normalizeRank(data) });
  } catch (e) {
    return apiInternalError(e, "customer-ranks PATCH");
  }
}

// ─── DELETE: ランク削除 (?id=uuid) ───
export async function DELETE(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const url = new URL(req.url);
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!UUID_RE.test(id)) {
      return apiValidationError("無効なIDです。");
    }

    // customers.rank_id は ON DELETE SET NULL のため、参照中でも削除可能。
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin.from("customer_rank_rules").delete().eq("id", id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "customer-ranks DELETE");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "customer-ranks DELETE");
  }
}
