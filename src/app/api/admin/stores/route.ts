

import { normalizePlanTier, STORE_LIMITS } from "@/lib/billing/planFeatures";
import { apiJson, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { storeCreateSchema, storeUpdateSchema } from "@/lib/validations/store";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {

      const { data: stores, error } = await supabase
        .from("stores")
        .select(
          "id, name, address, phone, email, manager_name, business_hours, latitude, longitude, is_active, is_default, sort_order, created_at",
        )
        .eq("tenant_id", caller.tenantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        // テーブル未作成またはRLSエラー時は空配列を返す
        console.warn("[stores] GET error:", error.message);
        return apiJson({ stores: [] });
      }

      // Get member counts per store
      const { data: memberships } = await supabase
        .from("store_memberships")
        .select("store_id")
        .eq("tenant_id", caller.tenantId);

      const memberCounts: Record<string, number> = {};
      for (const m of memberships ?? []) {
        memberCounts[m.store_id] = (memberCounts[m.store_id] || 0) + 1;
      }

      const storesWithCounts = (stores ?? []).map((s) => ({
        ...s,
        member_count: memberCounts[s.id] || 0,
      }));

      const res = apiJson({ stores: storesWithCounts });
      res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      return res;
    } catch (e: unknown) {
      return apiInternalError(e, "stores GET");
    }
  },
  { permission: "stores:view", routeName: "admin/stores GET" },
);

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {

      // Check plan store limit
      const { data: tenant } = await supabase.from("tenants").select("plan_tier").eq("id", caller.tenantId).single();

      const planTier = normalizePlanTier(tenant?.plan_tier);
      const limit = STORE_LIMITS[planTier];

      const { count } = await supabase
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId);

      if ((count ?? 0) >= limit) {
        return apiForbidden(`現在のプラン（${planTier}）では店舗は${limit}件までです。`);
      }

      const parsed = storeCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { name, address, phone, email, manager_name, business_hours, latitude, longitude } = parsed.data;

      // If first store, make it default
      const isFirst = (count ?? 0) === 0;

      const { data: store, error } = await supabase
        .from("stores")
        .insert({
          tenant_id: caller.tenantId,
          name,
          address,
          phone,
          email,
          manager_name,
          business_hours,
          latitude,
          longitude,
          is_default: isFirst,
          sort_order: count ?? 0,
        })
        .select(
          "id, tenant_id, name, address, phone, email, manager_name, business_hours, latitude, longitude, is_active, is_default, sort_order, created_at, updated_at",
        )
        .single();

      if (error) return apiInternalError(error, "stores insert");

      return apiJson({ store }, { status: 201 });
    } catch (e: unknown) {
      return apiInternalError(e, "stores create");
    }
  },
  { permission: "stores:manage", routeName: "admin/stores POST" },
);

export const PUT = withCaller(
  async (req, { caller, supabase }) => {
    try {

      const parsed = storeUpdateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { id, ...fields } = parsed.data;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }

      const { data: store, error } = await supabase
        .from("stores")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select(
          "id, tenant_id, name, address, phone, email, manager_name, business_hours, latitude, longitude, is_active, is_default, sort_order, created_at, updated_at",
        )
        .single();

      if (error) return apiInternalError(error, "stores update");

      return apiJson({ store });
    } catch (e: unknown) {
      return apiInternalError(e, "stores update");
    }
  },
  { permission: "stores:manage", routeName: "admin/stores PUT" },
);

export const DELETE = withCaller(
  async (req, { caller, supabase }) => {
    try {

      const { searchParams } = new URL(req.url);
      const id = searchParams.get("id");
      if (!id) return apiValidationError("id is required");

      // Cannot delete default store
      const { data: store } = await supabase
        .from("stores")
        .select("is_default")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (store?.is_default) {
        return apiValidationError("デフォルト店舗は削除できません");
      }

      const { error } = await supabase.from("stores").delete().eq("id", id).eq("tenant_id", caller.tenantId);

      if (error) return apiInternalError(error, "stores delete");

      return apiJson({ ok: true });
    } catch (e: unknown) {
      return apiInternalError(e, "stores delete");
    }
  },
  { permission: "stores:manage", routeName: "admin/stores DELETE" },
);
