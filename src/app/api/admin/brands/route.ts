import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { brandCreateSchema, brandUpdateSchema } from "@/lib/validations/brand";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasPermission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiError,
  apiForbidden,
} from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const limited = await checkRateLimit(_req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role as Role, "certificates:view")) return apiForbidden();

    const { data: brands, error } = await supabase
      .from("brands")
      .select("*, coating_products(*)")
      .or(`tenant_id.is.null,tenant_id.eq.${caller.tenantId}`)
      .order("name");

    if (error) return apiInternalError(error, "brands GET");

    return apiOk({ brands: brands ?? [] });
  } catch (e) {
    return apiInternalError(e, "brands GET");
  }
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role as Role, "certificates:edit")) return apiForbidden();

    const billing = await enforceBilling(req, { minPlan: "starter" });
    if (billing) return billing;

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
      .select("*")
      .single();

    if (error) return apiInternalError(error, "brands POST");

    return apiOk({ brand }, 201);
  } catch (e) {
    return apiInternalError(e, "brands POST");
  }
}

export async function PUT(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role as Role, "certificates:edit")) return apiForbidden();

    const billing = await enforceBilling(req, { minPlan: "starter" });
    if (billing) return billing;

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
      .select("*")
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

export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role as Role, "certificates:edit")) return apiForbidden();

    const billing = await enforceBilling(req, { minPlan: "starter" });
    if (billing) return billing;

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
