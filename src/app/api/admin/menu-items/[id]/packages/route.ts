
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/menu-items/:id/packages
 *
 * 指定 menu_item を使っている service_packages を返す逆引き API。
 * 品目マスタ画面の「このメニューを使うパッケージ」セクション用。
 *
 * - is_archived な package_item は除外。
 * - 親 service_packages の is_archived 状態は返却し、UI 側でバッジ表示。
 */
export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {

      const { id } = params;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { data: items, error: itemErr } = await admin
        .from("service_package_items")
        .select("package_id, quantity, override_unit_price")
        .eq("tenant_id", caller.tenantId)
        .eq("menu_item_id", id)
        .eq("is_archived", false);
      if (itemErr) return apiInternalError(itemErr, "menu-item packages items");

      const pkgIds = Array.from(new Set((items ?? []).map((it) => it.package_id as string)));
      if (pkgIds.length === 0) return apiJson({ packages: [] });

      const { data: pkgs, error: pkgErr } = await admin
        .from("service_packages")
        .select("id, name, category, price_strategy, is_archived")
        .eq("tenant_id", caller.tenantId)
        .in("id", pkgIds)
        .order("name", { ascending: true });
      if (pkgErr) return apiInternalError(pkgErr, "menu-item packages list");

      const itemMap = new Map<string, { quantity: number; override_unit_price: number | null }>();
      for (const it of items ?? []) {
        itemMap.set(it.package_id as string, {
          quantity: Number(it.quantity),
          override_unit_price: (it.override_unit_price as number | null) ?? null,
        });
      }

      const decorated = (pkgs ?? []).map((p) => ({
        ...p,
        quantity: itemMap.get(p.id as string)?.quantity ?? 1,
        override_unit_price: itemMap.get(p.id as string)?.override_unit_price ?? null,
      }));

      return apiJson({ packages: decorated });
    } catch (e) {
      return apiInternalError(e, "menu-item packages GET");
    }
  },
  { routeName: "menu-item packages GET" },
);
