import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { dealCreateSchema } from "@/lib/validations/market";

export const dynamic = "force-dynamic";

// ─── POST: Create a deal ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "market:create")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const parsed = dealCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const data = parsed.data;
    const inquiryId = data.inquiry_id;

    // 問い合わせから車両・買い手情報を引き継ぐ（自テナント所有のもののみ）。
    // クライアントは inquiry_id だけ送れば商談化できる。明示指定があれば上書き。
    const { data: inquiry } = await admin
      .from("market_inquiries")
      .select("id, vehicle_id, buyer_name, buyer_email, buyer_company, seller_tenant_id")
      .eq("id", inquiryId)
      .eq("seller_tenant_id", caller.tenantId)
      .maybeSingle();
    if (!inquiry) return apiValidationError("対象の問い合わせが見つかりません。");

    const vehicleId = data.vehicle_id ?? (inquiry.vehicle_id as string | null);
    const buyerName = data.buyer_name ?? (inquiry.buyer_name as string | null);
    const buyerEmail = data.buyer_email ?? (inquiry.buyer_email as string | null);
    if (!vehicleId || !buyerName || !buyerEmail) {
      return apiValidationError("商談化に必要な車両・買い手情報が問い合わせにありません。");
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      inquiry_id: inquiryId,
      vehicle_id: vehicleId,
      seller_tenant_id: caller.tenantId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      status: "negotiating",
    };

    const buyerCompany = data.buyer_company ?? (inquiry.buyer_company as string | null);
    if (buyerCompany != null) row.buyer_company = buyerCompany;
    if (data.agreed_price !== undefined && data.agreed_price !== null) row.agreed_price = data.agreed_price;

    const { data: deal, error } = await admin
      .from("market_deals")
      .insert(row)
      .select(
        "id, inquiry_id, vehicle_id, seller_tenant_id, buyer_name, buyer_email, buyer_company, agreed_price, status, created_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "market-deals insert");
    }

    // Update the inquiry status to "in_negotiation"
    await admin
      .from("market_inquiries")
      .update({ status: "in_negotiation", updated_at: new Date().toISOString() })
      .eq("id", inquiryId);

    // Update the vehicle status to "reserved"
    await admin
      .from("market_vehicles")
      .update({ status: "reserved", updated_at: new Date().toISOString() })
      .eq("id", vehicleId);

    return apiJson({ ok: true, deal });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deals create");
  }
}

// ─── GET: List deals for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = admin
      .from("market_deals")
      // market_deals は market_vehicles への FK を2本持つ (販売車両 vehicle_id と
      // 下取り車 trade_in_vehicle_id) ため、販売車両の embed は FK 列名で明示する。
      .select("*, market_vehicles!vehicle_id(maker, model)")
      .eq("seller_tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: deals, error } = await query;

    if (error) {
      return apiInternalError(error, "market-deals list");
    }

    const rows = (deals ?? []) as Array<Record<string, unknown>>;

    // 紐付く見積ドキュメントは自テナント所有のもののみ別クエリで取得して添付する。
    // documents を embed すると service-role 経由で RLS が効かず、万一 estimate_document_id が
    // 他テナントのドキュメントを指していても doc_number/total/status が漏れうるため、
    // tenant_id で明示スコープした別取得にして越境参照を遮断する。
    const docIds = Array.from(
      new Set(rows.map((d) => d.estimate_document_id).filter((v): v is string => typeof v === "string")),
    );
    let estimatesById: Record<
      string,
      { id: string; doc_number: string | null; total: number | null; status: string | null }
    > = {};
    if (docIds.length > 0) {
      const { data: docs, error: docErr } = await admin
        .from("documents")
        .select("id, doc_number, total, status")
        .in("id", docIds)
        .eq("tenant_id", caller.tenantId);
      if (docErr) return apiInternalError(docErr, "market-deals list (estimates)");
      estimatesById = Object.fromEntries(
        (docs ?? []).map((d) => [d.id as string, d as (typeof estimatesById)[string]]),
      );
    }

    // 下取り車のラベルも自テナントの在庫のみ別クエリで取得して添付する。
    const tradeInIds = Array.from(
      new Set(rows.map((d) => d.trade_in_vehicle_id).filter((v): v is string => typeof v === "string")),
    );
    let tradeInById: Record<string, { id: string; maker: string | null; model: string | null }> = {};
    if (tradeInIds.length > 0) {
      const { data: tvs, error: tvErr } = await admin
        .from("market_vehicles")
        .select("id, maker, model")
        .in("id", tradeInIds)
        .eq("tenant_id", caller.tenantId);
      if (tvErr) return apiInternalError(tvErr, "market-deals list (trade-in)");
      tradeInById = Object.fromEntries((tvs ?? []).map((v) => [v.id as string, v as (typeof tradeInById)[string]]));
    }

    const withEstimates = rows.map((d) => ({
      ...d,
      estimate: typeof d.estimate_document_id === "string" ? (estimatesById[d.estimate_document_id] ?? null) : null,
      trade_in_vehicle: typeof d.trade_in_vehicle_id === "string" ? (tradeInById[d.trade_in_vehicle_id] ?? null) : null,
    }));

    return apiJson({ deals: withEstimates });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deals list");
  }
}
