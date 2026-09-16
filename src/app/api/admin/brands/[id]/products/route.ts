import { coatingProductCreateSchema, coatingProductUpdateSchema } from "@/lib/validations/brand";

import { apiOk, apiInternalError, apiNotFound, apiValidationError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller<{ id: string }>(
  async (_req, { caller, supabase, params }) => {
    try {
      const { id: brand_id } = params;

      const { data: products, error } = await supabase
        .from("coating_products")
        .select("id, brand_id, tenant_id, name, product_code, description, created_at, updated_at")
        .eq("brand_id", brand_id)
        .order("name");

      if (error) return apiInternalError(error, "brands/[id]/products GET");

      return apiOk({ products: products ?? [] });
    } catch (e) {
      return apiInternalError(e, "brands/[id]/products GET");
    }
  },
  { routeName: "brands/[id]/products GET" },
);

export const POST = withCaller<{ id: string }>(
  async (req, { caller, supabase, params }) => {
    try {
      const { id: brand_id } = params;
      // 商品マスタの変更は admin 以上 (代表判断 2026-09-01)

      const body = await req.json();
      const parsed = coatingProductCreateSchema.safeParse({ ...body, brand_id });
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
      }
      const b = parsed.data;

      const { data: product, error } = await supabase
        .from("coating_products")
        .insert({
          brand_id: b.brand_id,
          tenant_id: caller.tenantId,
          name: b.name,
          product_code: b.product_code ?? null,
          description: b.description ?? null,
        })
        .select("id, brand_id, tenant_id, name, product_code, description, created_at, updated_at")
        .single();

      if (error) return apiInternalError(error, "brands/[id]/products POST");

      return apiOk({ product }, 201);
    } catch (e) {
      return apiInternalError(e, "brands/[id]/products POST");
    }
  },
  { permission: "menu_items:manage", routeName: "brands/[id]/products POST" },
);

export const PUT = withCaller<{ id: string }>(
  async (req, { caller, supabase, params }) => {
    try {
      const { id: brand_id } = params;
      // 商品マスタの変更は admin 以上 (代表判断 2026-09-01)

      const body = await req.json();
      const parsed = coatingProductUpdateSchema.safeParse({ ...body, brand_id });
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
      }
      const { id, ...fields } = parsed.data;
      if (!id) return apiValidationError("IDが必要です。");

      const { data: product, error } = await supabase
        .from("coating_products")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select("id, brand_id, tenant_id, name, product_code, description, created_at, updated_at")
        .single();

      if (error || !product) {
        if (!product) return apiNotFound("製品が見つかりませ��。");
        return apiInternalError(error, "brands/[id]/products PUT");
      }

      return apiOk({ product });
    } catch (e) {
      return apiInternalError(e, "brands/[id]/products PUT");
    }
  },
  { permission: "menu_items:manage", routeName: "brands/[id]/products PUT" },
);

export const DELETE = withCaller<{ id: string }>(
  async (req, { caller, supabase, params }) => {
    try {
      const { id: _brand_id } = params;
      // 商品マスタの変更は admin 以上 (代表判断 2026-09-01)

      const { id } = await req.json();
      if (!id) return apiValidationError("IDが必要です。");

      const { error } = await supabase.from("coating_products").delete().eq("id", id).eq("tenant_id", caller.tenantId);

      if (error) return apiInternalError(error, "brands/[id]/products DELETE");

      return apiOk({ deleted: true });
    } catch (e) {
      return apiInternalError(e, "brands/[id]/products DELETE");
    }
  },
  { permission: "menu_items:manage", routeName: "brands/[id]/products DELETE" },
);
