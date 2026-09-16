

import { apiOk, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/** GET /api/admin/shop/products — アクティブ商品一覧 */
export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {

      const { data, error } = await supabase
        .from("shop_products")
        .select(
          "id, name, description, price, tax_rate, unit, min_quantity, sort_order, is_active, meta, created_at, updated_at",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) return apiInternalError(error, "shop_products select");

      return apiOk({ products: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "admin/shop/products");
    }
  },
  { routeName: "admin/shop/products" },
);
