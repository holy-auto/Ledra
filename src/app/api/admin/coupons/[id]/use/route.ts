import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiError,
  apiInternalError,
} from "@/lib/api/response";
import { couponUseSchema } from "@/lib/validations/coupon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/coupons/[id]/use
 *
 * 発行済みクーポン (coupon_issues) を「使用済み」にマークする。
 *  1. issue を取得し、対象クーポンに属する & status='issued' を検証
 *  2. coupon_issues.status='used' / used_at=now() に遷移
 *     (status の現在値を WHERE 条件に含めた compare-and-set で二重利用を防ぐ)
 *  3. coupons.used_count を +1
 *
 * Postgres トランザクションを supabase-js から直接張れないため、楽観的
 * compare-and-set + 補償ロールバック (used_count 加算失敗時に issue を戻す)
 * で整合性を担保する。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("coupon id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = couponUseSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { issue_id, document_id, discount_applied } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) 発行レコードを取得 (テナント + 対象クーポンスコープ)。
    const { data: issue, error: fetchErr } = await admin
      .from("coupon_issues")
      .select("id, coupon_id, status")
      .eq("id", issue_id)
      .eq("coupon_id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "coupons use issue fetch");
    if (!issue) return apiNotFound("対象の発行レコードが見つかりません。");
    if (issue.status === "used") return apiValidationError("このクーポンは既に使用済みです。");
    if (issue.status === "revoked") return apiValidationError("取消済みのクーポンは使用できません。");
    if (issue.status === "expired") return apiValidationError("期限切れのクーポンは使用できません。");

    // 2) document_id が指定されていれば自テナント所属を検証。
    if (document_id) {
      const { data: doc, error: docErr } = await admin
        .from("documents")
        .select("id")
        .eq("id", document_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (docErr) return apiInternalError(docErr, "coupons use document check");
      if (!doc) return apiValidationError("指定された帳票が見つかりません。");
    }

    // 3) compare-and-set: status='issued' のときだけ 'used' に更新。
    //    並行リクエストが先にマークしていると 0 行ヒットになり、競合として弾く。
    const usedAt = new Date().toISOString();
    const { data: updatedIssue, error: updErr } = await admin
      .from("coupon_issues")
      .update({
        status: "used",
        used_at: usedAt,
        document_id: document_id,
        discount_applied: discount_applied,
      })
      .eq("id", issue_id)
      .eq("tenant_id", caller.tenantId)
      .eq("status", "issued")
      .select("id, coupon_id, customer_id, status, used_at, document_id, discount_applied")
      .maybeSingle();
    if (updErr) return apiInternalError(updErr, "coupon_issues use update");
    if (!updatedIssue) {
      return apiError({
        code: "conflict",
        message: "他の操作と競合しました。最新の状態を確認して再度お試しください。",
        status: 409,
      });
    }

    // 4) coupons.used_count を +1。issue の compare-and-set (status='issued' →
    //    'used') を通過したリクエストだけがここに到達するため、同一 issue で
    //    二重カウントされることはない。read-modify-write で十分。
    //    失敗時は issue を 'issued' に補償ロールバックして二重利用を防ぐ。
    const { data: cur } = await admin
      .from("coupons")
      .select("used_count")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    const nextCount = ((cur?.used_count as number | undefined) ?? 0) + 1;
    const { data: coupon, error: countErr } = await admin
      .from("coupons")
      .update({ used_count: nextCount, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, used_count, max_uses")
      .maybeSingle();
    if (countErr) {
      // 補償: issue を元に戻す。
      await admin
        .from("coupon_issues")
        .update({ status: "issued", used_at: null, document_id: null, discount_applied: null })
        .eq("id", issue_id)
        .eq("tenant_id", caller.tenantId)
        .eq("status", "used");
      return apiInternalError(countErr, "coupons used_count increment");
    }

    return apiJson({ ok: true, issue: updatedIssue, coupon: coupon ?? null });
  } catch (e) {
    return apiInternalError(e, "coupons use POST");
  }
}
