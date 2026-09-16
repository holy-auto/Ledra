
import { brandCreateSchema, brandDeleteSchema, brandUpdateSchema } from "@/lib/validations/brand";

import { apiOk, apiInternalError, apiNotFound, apiValidationError, apiError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {

      const { data: brands, error } = await supabase
        .from("brands")
        .select(
          "id, tenant_id, name, description, website_url, created_at, updated_at, coating_products(id, brand_id, name, product_code, description, created_at, updated_at)",
        )
        .or(`tenant_id.is.null,tenant_id.eq.${caller.tenantId}`)
        .order("name");

      if (error) return apiInternalError(error, "brands GET");

      return apiOk({ brands: brands ?? [] });
    } catch (e) {
      return apiInternalError(e, "brands GET");
    }
  },
  { routeName: "brands GET" },
);

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // 商品マスタの変更は admin 以上 (代表判断 2026-09-01)

      const body = await req.json();
      const parsed = brandCreateSchema.safeParse(body);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
      }
      const b = parsed.data;

      const { data: brand, error } = await supabase
        .from("brands")
        .insert({
          tenant_id: caller.tenantId,
          name: b.name,
          description: b.description ?? null,
          website_url: b.website_url ?? null,
        })
        .select("id, tenant_id, name, description, website_url, created_at, updated_at")
        .single();

      if (error) return apiInternalError(error, "brands POST");

      return apiOk({ brand }, 201);
    } catch (e) {
      return apiInternalError(e, "brands POST");
    }
  },
  { permission: "menu_items:manage", routeName: "brands POST" },
);

export const PUT = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // 商品マスタの変更は admin 以上 (代表判断 2026-09-01)

      const body = await req.json();
      const parsed = brandUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
      }
      const { id, ...fields } = parsed.data;

      const { data: brand, error } = await supabase
        .from("brands")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select("id, tenant_id, name, description, website_url, created_at, updated_at")
        .single();

      if (error || !brand) {
        if (!brand) return apiNotFound("ブランドが見つかりません。");
        return apiInternalError(error, "brands PUT");
      }

      return apiOk({ brand });
    } catch (e) {
      return apiInternalError(e, "brands PUT");
    }
  },
  { permission: "menu_items:manage", routeName: "brands PUT" },
);

export const DELETE = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // 商品マスタの変更は admin 以上 (代表判断 2026-09-01)

      const parsed = brandDeleteSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
      }
      const { id } = parsed.data;

      // Check for linked products
      const { count } = await supabase
        .from("coating_products")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", id);

      if ((count ?? 0) > 0) {
        return apiError({
          code: "conflict",
          message: "このブランドには製品が登録されています。先に製品を削除してください。",
          status: 409,
        });
      }

      const { error } = await supabase.from("brands").delete().eq("id", id).eq("tenant_id", caller.tenantId);

      if (error) return apiInternalError(error, "brands DELETE");

      return apiOk({ deleted: true });
    } catch (e) {
      return apiInternalError(e, "brands DELETE");
    }
  },
  { permission: "menu_items:manage", routeName: "brands DELETE" },
);
