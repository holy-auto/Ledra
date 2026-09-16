import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { servicePackageUpdateSchema } from "@/lib/validations/service-package";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── GET: パッケージ詳細 ───
export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id } = params;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { data: pkg, error: pkgErr } = await admin
        .from("service_packages")
        .select(
          "id, name, description, category, price_strategy, fixed_price, recommended_template_id, sort_order, is_archived, created_at, updated_at",
        )
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (pkgErr) return apiInternalError(pkgErr, "service-package detail");
      if (!pkg) return apiNotFound("パッケージが見つかりません。");

      const { data: items, error: itemErr } = await admin
        .from("service_package_items")
        .select("id, menu_item_id, quantity, override_unit_price, is_archived, sort_order, created_at")
        .eq("package_id", id)
        .eq("tenant_id", caller.tenantId)
        .order("sort_order", { ascending: true });
      if (itemErr) return apiInternalError(itemErr, "service-package items");

      return apiJson({ package: pkg, items: items ?? [] });
    } catch (e) {
      return apiInternalError(e, "service-package GET");
    }
  },
  { routeName: "service-package GET" },
);

// ─── PATCH: パッケージ更新 (items 配列が来たら全置換) ───
export const PATCH = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const { id } = params;
      const body = await req.json().catch(() => ({}));
      const parsed = servicePackageUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { items, ...patch } = parsed.data;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // 既存パッケージの所有確認
      const { data: existing } = await admin
        .from("service_packages")
        .select("id")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (!existing) return apiNotFound("パッケージが見つかりません。");

      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await admin
          .from("service_packages")
          .update(patch)
          .eq("id", id)
          .eq("tenant_id", caller.tenantId);
        if (updErr) return apiInternalError(updErr, "service-package update");
      }

      if (items !== undefined) {
        if (items.length > 0) {
          const itemIds = Array.from(new Set(items.map((i) => i.menu_item_id)));
          const { data: validMenu } = await admin
            .from("menu_items")
            .select("id")
            .eq("tenant_id", caller.tenantId)
            .in("id", itemIds);
          const validIds = new Set((validMenu ?? []).map((m) => m.id as string));
          const invalid = itemIds.filter((mid) => !validIds.has(mid));
          if (invalid.length > 0) {
            return apiValidationError("対象テナントに存在しない menu_item_id が含まれています。");
          }
        }

        // 全置換セマンティクス。supabase-js にトランザクションがないため、
        // delete 前に既存行のスナップショットを取り、reinsert 失敗時に復元する。
        const { data: snapshot, error: snapErr } = await admin
          .from("service_package_items")
          .select("menu_item_id, quantity, override_unit_price, sort_order, is_archived")
          .eq("package_id", id)
          .eq("tenant_id", caller.tenantId);
        if (snapErr) return apiInternalError(snapErr, "service-package-items snapshot");

        const { error: delErr } = await admin
          .from("service_package_items")
          .delete()
          .eq("package_id", id)
          .eq("tenant_id", caller.tenantId);
        if (delErr) return apiInternalError(delErr, "service-package-items delete");

        if (items.length > 0) {
          const rows = items.map((it, idx) => ({
            package_id: id,
            tenant_id: caller.tenantId,
            menu_item_id: it.menu_item_id,
            quantity: it.quantity,
            override_unit_price: it.override_unit_price ?? null,
            sort_order: it.sort_order ?? idx,
          }));
          const { error: insErr } = await admin.from("service_package_items").insert(rows);
          if (insErr) {
            if ((snapshot ?? []).length > 0) {
              const restoreRows = (snapshot ?? []).map((r) => ({
                package_id: id,
                tenant_id: caller.tenantId,
                menu_item_id: r.menu_item_id as string,
                quantity: r.quantity as number,
                override_unit_price: r.override_unit_price as number | null,
                sort_order: r.sort_order as number,
                is_archived: r.is_archived as boolean,
              }));
              await admin.from("service_package_items").insert(restoreRows);
            }
            return apiInternalError(insErr, "service-package-items reinsert");
          }
        }
      }

      return apiJson({ ok: true });
    } catch (e) {
      return apiInternalError(e, "service-package PATCH");
    }
  },
  { minRole: "staff", routeName: "service-package PATCH" },
);

// ─── DELETE: 論理削除 (is_archived=true) ───
export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id } = params;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { error } = await admin
        .from("service_packages")
        .update({ is_archived: true })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
      if (error) return apiInternalError(error, "service-package archive");

      return apiJson({ ok: true });
    } catch (e) {
      return apiInternalError(e, "service-package DELETE");
    }
  },
  { minRole: "staff", routeName: "service-package DELETE" },
);
