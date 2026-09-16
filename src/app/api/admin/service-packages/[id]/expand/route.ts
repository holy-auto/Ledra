import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiNotFound, apiInternalError } from "@/lib/api/response";
import { expandServicePackage } from "@/lib/service-packages/expand";
import type { MenuItemRow, PackageItemRow, ServicePackageRow } from "@/lib/service-packages/expand";
import type { PriceStrategy } from "@/lib/validations/service-package";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/service-packages/:id/expand
 *
 * パッケージを展開して `{ items[], price, items_total, package }` を返す。
 * 案件 (reservations) や見積フォームに 1 クリック適用するためのスナップショット
 * 取得用エンドポイント。is_archived な package_item や is_active=false な
 * menu_item は除外される。
 *
 * GET でも同じ結果を返す (副作用なし) が、POST も許容して RPC ライクに使える。
 */
const expandHandler = withCaller<{ id: string }>(
  async (_req: NextRequest, { caller, params }) => {
    const { id } = params;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: pkg, error: pkgErr } = await admin
      .from("service_packages")
      .select("id, tenant_id, name, category, price_strategy, fixed_price, recommended_template_id, is_archived")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (pkgErr) return apiInternalError(pkgErr, "service-package expand load");
    if (!pkg || pkg.is_archived) return apiNotFound("パッケージが見つかりません。");

    const { data: items, error: itemErr } = await admin
      .from("service_package_items")
      .select("id, package_id, menu_item_id, quantity, override_unit_price, is_archived, sort_order")
      .eq("package_id", id)
      .eq("tenant_id", caller.tenantId);
    if (itemErr) return apiInternalError(itemErr, "service-package expand items");

    const ids = (items ?? []).map((i) => i.menu_item_id as string);
    const { data: menuRows, error: menuErr } = ids.length
      ? await admin
          .from("menu_items")
          .select("id, name, unit_price, tax_category, unit, is_active")
          .eq("tenant_id", caller.tenantId)
          .in("id", ids)
      : { data: [] as Array<MenuItemRow>, error: null };
    if (menuErr) return apiInternalError(menuErr, "service-package expand menu");

    const result = expandServicePackage(
      pkg as ServicePackageRow & { price_strategy: PriceStrategy },
      (items ?? []) as PackageItemRow[],
      (menuRows ?? []) as MenuItemRow[],
    );

    return apiJson(result);
  },
  { routeName: "service-package expand" },
);

export const GET = expandHandler;
export const POST = expandHandler;
