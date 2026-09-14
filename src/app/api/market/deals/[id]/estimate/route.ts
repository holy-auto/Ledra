import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";
import { dealEstimateLinkSchema } from "@/lib/validations/market";

export const dynamic = "force-dynamic";

// ─── PATCH: 商談に見積ドキュメントを紐付ける ───
// クライアントは先に POST /api/admin/documents で見積 (doc_type='estimate') を作成し、
// 返った id を本エンドポイントで market_deals.estimate_document_id に結線する。
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "market:edit")) return apiForbidden();

    const { id: dealId } = await params;
    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    const parsed = dealEstimateLinkSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { estimate_document_id } = parsed.data;

    // 商談が自テナントのものか確認。
    const { data: deal, error: dealErr } = await admin
      .from("market_deals")
      .select("id, seller_tenant_id")
      .eq("id", dealId)
      .eq("seller_tenant_id", tenantId)
      .single();
    if (dealErr || !deal) return apiNotFound("deal_not_found");

    // 紐付ける見積ドキュメントも自テナント所有かつ estimate であることを確認
    // (他テナント/別種別のドキュメント ID を結線されるのを防ぐ)。
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, doc_type, tenant_id")
      .eq("id", estimate_document_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (docErr) return apiInternalError(docErr, "market-deal estimate link (doc lookup)");
    if (!doc) return apiValidationError("対象の見積ドキュメントが見つかりません。");
    if (doc.doc_type !== "estimate") return apiValidationError("見積 (estimate) 以外は紐付けできません。");

    const { data: updated, error: updateErr } = await admin
      .from("market_deals")
      .update({ estimate_document_id, updated_at: new Date().toISOString() })
      .eq("id", dealId)
      .eq("seller_tenant_id", tenantId)
      .select("id, estimate_document_id, updated_at")
      .single();
    if (updateErr) return apiInternalError(updateErr, "market-deal estimate link");

    return apiJson({ ok: true, deal: updated });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deal estimate link");
  }
}
