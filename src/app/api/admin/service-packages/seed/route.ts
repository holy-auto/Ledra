import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { STARTER_PACKAGES, type StarterMenuItem } from "@/lib/service-packages/starter-templates";

export const dynamic = "force-dynamic";

type MenuItemRow = { id: string; name: string };

/**
 * 既存 menu_items から name (case-insensitive) でマッチするものを返す。
 * 同名が複数あればより新しいものを採用。
 */
function indexMenuItemsByName(rows: MenuItemRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(r.name.trim().toLowerCase(), r.id);
  }
  return out;
}

/**
 * POST /api/admin/service-packages/seed
 * --------------------------------------
 * `STARTER_PACKAGES` で定義された標準施工テンプレートを一括投入する。
 *
 * - 同名のパッケージが既に存在する場合はスキップ (冪等)
 * - 明細の menu_items は name (case-insensitive) で find-or-create
 * - スタッフ以上のロールが必要
 *
 * レスポンス: { created_packages, skipped_packages, created_menu_items, package_ids }
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const wantedNames = STARTER_PACKAGES.map((p) => p.name);
    const { data: existingPkgs, error: existingErr } = await admin
      .from("service_packages")
      .select("id, name")
      .eq("tenant_id", caller.tenantId)
      .in("name", wantedNames);
    if (existingErr) return apiInternalError(existingErr, "service-packages/seed:existing");

    const existingNames = new Set((existingPkgs ?? []).map((p) => p.name as string));

    const toCreate = STARTER_PACKAGES.filter((p) => !existingNames.has(p.name));
    if (toCreate.length === 0) {
      return apiJson({
        ok: true,
        created_packages: 0,
        skipped_packages: STARTER_PACKAGES.length,
        created_menu_items: 0,
        package_ids: [],
      });
    }

    const neededItems = new Map<string, StarterMenuItem>();
    for (const pkg of toCreate) {
      for (const it of pkg.items) {
        const k = it.name.trim().toLowerCase();
        if (!neededItems.has(k)) neededItems.set(k, it);
      }
    }

    const { data: existingMenuItems, error: menuErr } = await admin
      .from("menu_items")
      .select("id, name")
      .eq("tenant_id", caller.tenantId)
      .in(
        "name",
        Array.from(neededItems.values()).map((i) => i.name),
      );
    if (menuErr) return apiInternalError(menuErr, "service-packages/seed:menu_items existing");

    const menuByName = indexMenuItemsByName((existingMenuItems ?? []) as MenuItemRow[]);

    const missingItems: StarterMenuItem[] = [];
    for (const [k, it] of neededItems) {
      if (!menuByName.has(k)) missingItems.push(it);
    }

    let createdMenuCount = 0;
    if (missingItems.length > 0) {
      const insertRows = missingItems.map((it) => ({
        tenant_id: caller.tenantId,
        name: it.name,
        unit_price: it.unit_price,
        tax_category: it.tax_category ?? 10,
        is_active: true,
      }));
      const { data: created, error: insertErr } = await admin.from("menu_items").insert(insertRows).select("id, name");
      if (insertErr) return apiInternalError(insertErr, "service-packages/seed:menu_items insert");
      for (const row of (created ?? []) as MenuItemRow[]) {
        menuByName.set(row.name.trim().toLowerCase(), row.id);
      }
      createdMenuCount = missingItems.length;
    }

    const createdPackageIds: string[] = [];

    for (const [idx, pkg] of toCreate.entries()) {
      const { data: pkgRow, error: pkgErr } = await admin
        .from("service_packages")
        .insert({
          tenant_id: caller.tenantId,
          name: pkg.name,
          description: pkg.description,
          category: pkg.category,
          price_strategy: pkg.price_strategy,
          fixed_price: pkg.fixed_price ?? null,
          sort_order: idx,
        })
        .select("id")
        .single();
      if (pkgErr || !pkgRow) {
        logger.warn("service-packages/seed: package insert failed; continuing", {
          tenantId: caller.tenantId,
          packageKey: pkg.key,
          err: pkgErr?.message,
        });
        continue;
      }

      const itemRows = pkg.items
        .map((it, i) => {
          const menuId = menuByName.get(it.name.trim().toLowerCase());
          if (!menuId) return null;
          return {
            package_id: pkgRow.id as string,
            tenant_id: caller.tenantId,
            menu_item_id: menuId,
            quantity: it.quantity,
            override_unit_price: null,
            sort_order: i,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (itemRows.length > 0) {
        const { error: itemErr } = await admin.from("service_package_items").insert(itemRows);
        if (itemErr) {
          logger.warn("service-packages/seed: items insert failed; rolling back package", {
            tenantId: caller.tenantId,
            packageKey: pkg.key,
            err: itemErr.message,
          });
          await admin.from("service_packages").delete().eq("id", pkgRow.id).eq("tenant_id", caller.tenantId);
          continue;
        }
      }

      createdPackageIds.push(pkgRow.id as string);
    }

    return apiJson({
      ok: true,
      created_packages: createdPackageIds.length,
      skipped_packages: STARTER_PACKAGES.length - createdPackageIds.length,
      created_menu_items: createdMenuCount,
      package_ids: createdPackageIds,
    });
  } catch (e) {
    return apiInternalError(e, "service-packages/seed:POST");
  }
}
