/**
 * 店舗向け: 在庫品目 (inventory_items) を供給パートナーの商材 (supply_partner_products)
 * に紐付ける / 解除する。
 *
 * - product_id を指定 → inventory_items.supply_partner_product_id をセットし、
 *   先方品番を supplier_sku にミラーする (発注時の品番突合用)。
 * - product_id = null → 紐付け解除。
 *
 * セキュリティ:
 *   - 在庫品目は tenant スコープ (RLS + 明示 .eq("tenant_id"))。
 *   - 紐付け先の商材は「自店が提携済みパートナーの有効商材」に限定する
 *     (spp_select_tenant RLS で読めるものだけ採用 = 越境マッピングを防ぐ)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mapSchema = z.object({
  item_id: z.string().uuid("無効な品目IDです。"),
  product_id: z.string().uuid("無効な商材IDです。").nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("仕入先商材の紐付けは管理者のみ可能です。");
    }

    const parsed = await parseJsonBody(req, mapSchema);
    if (!parsed.ok) return parsed.response;
    const { item_id, product_id } = parsed.data;

    let supplierSku: string | null = null;

    if (product_id) {
      // 紐付け先の商材が「自店が読める (= 提携済みパートナーの有効商材)」か検証。
      // spp_select_tenant RLS によりここで読めなければ越境なので弾く。
      const { data: product, error: pErr } = await supabase
        .from("supply_partner_products")
        .select("id, sku")
        .eq("id", product_id)
        .maybeSingle();
      if (pErr) return apiInternalError(pErr, "supply map-item product lookup");
      if (!product) {
        return apiValidationError("指定された商材が見つからないか、提携していないパートナーの商材です。");
      }
      supplierSku = (product.sku as string | null) ?? null;
    }

    const updates: Record<string, unknown> = {
      supply_partner_product_id: product_id,
    };
    // 先方品番を supplier_sku にミラー (解除時は触らない)。
    if (product_id && supplierSku) updates.supplier_sku = supplierSku;

    const { error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", item_id)
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "supply map-item update");

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "supply map-item POST");
  }
}
