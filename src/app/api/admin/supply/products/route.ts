/**
 * 店舗向け: 提携済み供給パートナーの商材カタログ閲覧。
 *
 * RLS (spp_select_tenant) により、自店が tenant_supply_links で提携 (is_enabled)
 * しているパートナーの有効な商材のみ閲覧できる。anon クライアントで足りる。
 *
 * クエリ: ?partner_id=<uuid> で 1 パートナーに絞る (在庫品目のマッピング候補表示用)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const partnerId = url.searchParams.get("partner_id");

    let query = supabase
      .from("supply_partner_products")
      .select(
        "id, supply_partner_id, sku, name, category, list_price, currency, stock_status, lead_time_days, is_active",
      )
      .eq("is_active", true)
      .order("name");
    if (partnerId) query = query.eq("supply_partner_id", partnerId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "supply products (store) list");
    return apiJson({ ok: true, products: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "supply products (store) GET");
  }
}
