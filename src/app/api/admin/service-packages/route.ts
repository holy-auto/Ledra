import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { servicePackageCreateSchema } from "@/lib/validations/service-package";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── GET: パッケージ一覧 ───
export const GET = withCaller(
  async (req, { caller }) => {
    try {
      const url = new URL(req.url);
      const includeArchived = url.searchParams.get("include_archived") === "true";
      const category = url.searchParams.get("category");

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      let query = admin
        .from("service_packages")
        .select(
          "id, name, description, category, price_strategy, fixed_price, recommended_template_id, sort_order, is_archived, created_at, updated_at",
        )
        .eq("tenant_id", caller.tenantId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!includeArchived) query = query.eq("is_archived", false);
      if (category) query = query.eq("category", category);

      const { data: packages, error: pkgErr } = await query;
      if (pkgErr) return apiInternalError(pkgErr, "service-packages list");

      const ids = (packages ?? []).map((p) => p.id);
      let itemCounts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: items } = await admin
          .from("service_package_items")
          .select("package_id")
          .eq("tenant_id", caller.tenantId)
          .eq("is_archived", false)
          .in("package_id", ids);
        itemCounts = (items ?? []).reduce<Map<string, number>>((acc, row) => {
          const k = row.package_id as string;
          acc.set(k, (acc.get(k) ?? 0) + 1);
          return acc;
        }, new Map());
      }

      const decorated = (packages ?? []).map((p) => ({
        ...p,
        item_count: itemCounts.get(p.id) ?? 0,
      }));

      return apiJson({ packages: decorated });
    } catch (e) {
      return apiInternalError(e, "service-packages GET");
    }
  },
  { routeName: "service-packages GET" },
);

// ─── POST: パッケージ作成 ───
export const POST = withCaller(
  async (req, { caller }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const parsed = servicePackageCreateSchema.safeParse(body);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const { items, ...pkg } = parsed.data;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      if (items.length > 0) {
        const itemIds = Array.from(new Set(items.map((i) => i.menu_item_id)));
        const { data: validMenu, error: menuErr } = await admin
          .from("menu_items")
          .select("id")
          .eq("tenant_id", caller.tenantId)
          .in("id", itemIds);
        if (menuErr) return apiInternalError(menuErr, "service-packages menu validate");
        const validIds = new Set((validMenu ?? []).map((m) => m.id as string));
        const invalid = itemIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
          return apiValidationError("対象テナントに存在しない menu_item_id が含まれています。");
        }
      }

      const { data: created, error: createErr } = await admin
        .from("service_packages")
        .insert({ ...pkg, tenant_id: caller.tenantId })
        .select(
          "id, name, description, category, price_strategy, fixed_price, recommended_template_id, sort_order, is_archived, created_at, updated_at",
        )
        .single();
      if (createErr) return apiInternalError(createErr, "service-packages insert");

      if (items.length > 0) {
        const rows = items.map((it, idx) => ({
          package_id: created.id as string,
          tenant_id: caller.tenantId,
          menu_item_id: it.menu_item_id,
          quantity: it.quantity,
          override_unit_price: it.override_unit_price ?? null,
          sort_order: it.sort_order ?? idx,
        }));
        const { error: itemErr } = await admin.from("service_package_items").insert(rows);
        if (itemErr) {
          // ロールバック相当: 子失敗時は親を消す (テスト容易性のため try ベース)
          await admin.from("service_packages").delete().eq("id", created.id).eq("tenant_id", caller.tenantId);
          return apiInternalError(itemErr, "service-package-items insert");
        }
      }

      return apiJson({ ok: true, package: created }, { status: 201 });
    } catch (e) {
      return apiInternalError(e, "service-packages POST");
    }
  },
  { minRole: "staff", routeName: "service-packages POST" },
);
