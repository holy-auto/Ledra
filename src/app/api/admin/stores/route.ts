import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { normalizePlanTier, STORE_LIMITS } from "@/lib/billing/planFeatures";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:view")) {
      return apiForbidden();
    }

    const { data: stores, error } = await supabase
      .from("stores")
      .select(
        "id, name, address, phone, email, manager_name, business_hours, is_active, is_default, sort_order, created_at",
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
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:manage")) {
      return apiForbidden();
    }

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

    const body = await req.json();
    const { name, address, phone, email, manager_name, business_hours } = body;

    if (!name?.trim()) {
      return apiValidationError("店舗名は必須です");
    }

    // If first store, make it default
    const isFirst = (count ?? 0) === 0;

    const { data: store, error } = await supabase
      .from("stores")
      .insert({
        tenant_id: caller.tenantId,
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        manager_name: manager_name?.trim() || null,
        business_hours: business_hours || null,
        is_default: isFirst,
        sort_order: count ?? 0,
      })
      .select(
        "id, tenant_id, name, address, phone, email, manager_name, business_hours, is_active, is_default, sort_order, created_at, updated_at",
      )
      .single();

    if (error) return apiInternalError(error, "stores insert");

    return apiJson({ store }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "stores create");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:manage")) {
      return apiForbidden();
    }

    const body = await req.json();
    const { id, name, address, phone, email, manager_name, business_hours, is_active } = body;

    if (!id) return apiValidationError("id is required");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (address !== undefined) updates.address = address?.trim() || null;
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (email !== undefined) updates.email = email?.trim() || null;
    if (manager_name !== undefined) updates.manager_name = manager_name?.trim() || null;
    if (business_hours !== undefined) updates.business_hours = business_hours;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: store, error } = await supabase
      .from("stores")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, name, address, phone, email, manager_name, business_hours, is_active, is_default, sort_order, created_at, updated_at",
      )
      .single();

    if (error) return apiInternalError(error, "stores update");

    return apiJson({ store });
  } catch (e: unknown) {
    return apiInternalError(e, "stores update");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "stores:manage")) {
      return apiForbidden();
    }

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
}
