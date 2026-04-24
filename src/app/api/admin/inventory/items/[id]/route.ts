import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiNotFound } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function toNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── GET: 個別取得 (履歴含む) ───
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;

    const { data: item, error } = await supabase
      .from("inventory_items")
      .select(
        "id, name, sku, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (error) return apiInternalError(error, "inventory-item get");
    if (!item) return apiNotFound();

    const { data: movements } = await supabase
      .from("inventory_movements")
      .select("id, type, quantity, reason, reservation_id, created_by, created_at")
      .eq("tenant_id", caller.tenantId)
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return apiJson({ ok: true, item, movements: movements ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-item GET");
  }
}

// ─── PUT: 更新 ───
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) return apiValidationError("品目名は必須です");
      updates.name = name;
    }
    if (body.sku !== undefined) updates.sku = String(body.sku ?? "").trim() || null;
    if (body.category !== undefined) updates.category = String(body.category ?? "").trim() || null;
    if (body.unit !== undefined) updates.unit = String(body.unit ?? "").trim() || "個";
    if (body.min_stock !== undefined) updates.min_stock = toNumber(body.min_stock, 0);
    if (body.unit_cost !== undefined) updates.unit_cost = toInt(body.unit_cost);
    if (body.note !== undefined) updates.note = String(body.note ?? "").trim() || null;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    // current_stock は apply_inventory_movement 経由でのみ更新（監査証跡のため）

    const { data, error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, name, sku, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .single();

    if (error) {
      if (typeof error.message === "string" && error.message.includes("uq_inventory_items_tenant_sku")) {
        return apiValidationError("同じ SKU の品目が既に存在します");
      }
      return apiInternalError(error, "inventory-item update");
    }

    return apiJson({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-item PUT");
  }
}

// ─── DELETE: 論理削除 (is_active=false) ───
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;

    const { error } = await supabase
      .from("inventory_items")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "inventory-item delete");

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-item DELETE");
  }
}
