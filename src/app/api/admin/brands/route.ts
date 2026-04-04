import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { brandCreateSchema, brandUpdateSchema } from "@/lib/validations/brand";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: brands, error } = await supabase
      .from("brands")
      .select("id, tenant_id, name, description, website_url, created_at, updated_at, coating_products(id, brand_id, name, product_code, description, created_at, updated_at)")
      .or(`tenant_id.is.null,tenant_id.eq.${caller.tenantId}`)
      .order("name");

    if (error) return apiInternalError(error, "brands GET");

    return apiOk({ brands: brands ?? [] });
  } catch (e) {
    return apiInternalError(e, "brands GET");
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

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
}

export async function PUT(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

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
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await req.json();
    if (!id) return apiValidationError("IDが必要です。");

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

    const { error } = await supabase
      .from("brands")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "brands DELETE");

    return apiOk({ deleted: true });
  } catch (e) {
    return apiInternalError(e, "brands DELETE");
  }
}
