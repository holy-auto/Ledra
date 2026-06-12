import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { couponCreateSchema, couponUpdateSchema } from "@/lib/validations/coupon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT_COLUMNS =
  "id, code, name, description, discount_type, discount_value, min_purchase, max_uses, used_count, valid_from, valid_until, is_active, notes, created_at, updated_at";

/** 8 文字の英大文字+数字コードを生成する (紛らわしい 0/O/1/I は除外)。 */
function generateCouponCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

// ─── GET: クーポン一覧 ───
// クエリ: ?active_only=true (デフォルト true) — false で停止中も含める。
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    // 未指定はデフォルト true。明示的に "false" のときだけ停止中も含める。
    const activeOnly = url.searchParams.get("active_only") !== "false";

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("coupons")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (activeOnly) query = query.eq("is_active", true);

    const { data: coupons, error } = await query;
    if (error) return apiInternalError(error, "coupons GET");

    // 各クーポンの発行済み件数 (coupon_issues の count) を集計する。
    const ids = (coupons ?? []).map((c) => c.id);
    const issuedCounts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: issues } = await admin
        .from("coupon_issues")
        .select("coupon_id")
        .eq("tenant_id", caller.tenantId)
        .in("coupon_id", ids);
      for (const row of issues ?? []) {
        const k = row.coupon_id as string;
        issuedCounts.set(k, (issuedCounts.get(k) ?? 0) + 1);
      }
    }

    const decorated = (coupons ?? []).map((c) => ({
      ...c,
      issued_count: issuedCounts.get(c.id) ?? 0,
    }));

    return apiJson({ coupons: decorated });
  } catch (e) {
    return apiInternalError(e, "coupons GET");
  }
}

// ─── POST: クーポン作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = couponCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { code, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // code 未指定なら自動生成。(tenant_id, code) UNIQUE のため衝突時は数回リトライ。
    let finalCode = (code ?? "").toUpperCase();
    if (!finalCode) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCouponCode();
        const { data: dup } = await admin
          .from("coupons")
          .select("id")
          .eq("tenant_id", caller.tenantId)
          .eq("code", candidate)
          .maybeSingle();
        if (!dup) {
          finalCode = candidate;
          break;
        }
      }
      if (!finalCode) {
        return apiInternalError(new Error("failed to generate unique coupon code"), "coupons code gen");
      }
    }

    const { data: created, error } = await admin
      .from("coupons")
      .insert({
        ...rest,
        code: finalCode,
        used_count: 0,
        is_active: true,
        tenant_id: caller.tenantId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) {
      // (tenant_id, code) UNIQUE 違反は 23505。ユーザ指定コードの重複として返す。
      if ((error as { code?: string }).code === "23505") {
        return apiValidationError("同じコードのクーポンが既に存在します。別のコードを指定してください。");
      }
      return apiInternalError(error, "coupons POST");
    }

    return apiJson({ ok: true, coupon: { ...created, issued_count: 0 } }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "coupons POST");
  }
}

// ─── PATCH: クーポン更新 (is_active 切替 / name / description / valid_until 等。body に id) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = couponUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」として扱う)。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: updated, error } = await admin
      .from("coupons")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "coupons PATCH");
    if (!updated) return apiValidationError("対象のクーポンが見つかりません。");

    return apiJson({ ok: true, coupon: updated });
  } catch (e) {
    return apiInternalError(e, "coupons PATCH");
  }
}
