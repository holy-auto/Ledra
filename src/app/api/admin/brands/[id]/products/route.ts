import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { coatingProductCreateSchema, coatingProductUpdateSchema } from "@/lib/validations/brand";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: brand_id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: products, error } = await supabase
      .from("coating_products")
      .select("id, name, product_code, description, tenant_id")
      .eq("brand_id", brand_id)
      .order("name");

    if (error) return apiInternalError(error, "brands/[id]/products GET");

    return apiOk({ products: products ?? [] });
  } catch (e) {
    return apiInternalError(e, "brands/[id]/products GET");
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: brand_id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

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
      .select("id, brand_id, tenant_id, name, product_code, description")
      .single();

    if (error) return apiInternalError(error, "brands/[id]/products POST");

    return apiOk({ product }, 201);
  } catch (e) {
    return apiInternalError(e, "brands/[id]/products POST");
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: brand_id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

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
      .select("id, brand_id, tenant_id, name, product_code, description, updated_at")
      .single();

    if (error || !product) {
      if (!product) return apiNotFound("製品が見つかりません。");
      return apiInternalError(error, "brands/[id]/products PUT");
    }

    return apiOk({ product });
  } catch (e) {
    return apiInternalError(e, "brands/[id]/products PUT");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: _brand_id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await req.json();
    if (!id) return apiValidationError("IDが必要です。");

    const { error } = await supabase
      .from("coating_products")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "brands/[id]/products DELETE");

    return apiOk({ deleted: true });
  } catch (e) {
    return apiInternalError(e, "brands/[id]/products DELETE");
  }
}
