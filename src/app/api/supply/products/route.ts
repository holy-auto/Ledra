/**
 * 供給パートナーの商材カタログ CRUD (supply_partner_products)。
 *
 * パートナー本人が自分の商材 (品番・名称・卸値・在庫状況・リードタイム) を登録する。
 * RLS (spp_*_partner) により owner 本人の行しか読み書きできない。
 * 店舗側はこのルートではなく、提携済みカタログを別途参照する (Phase 1 後続)。
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { requireActiveSupplyPartner } from "@/lib/supply/partnerContext";
import { supplyProductSchema, supplyProductUpdateSchema, supplyProductDeleteSchema } from "@/lib/supply/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("supply_partner_products")
      .select("id, sku, name, category, list_price, currency, stock_status, lead_time_days, is_active, updated_at")
      .eq("supply_partner_id", gate.partnerId)
      .order("name");
    if (error) return apiInternalError(error, "supply products list");
    return apiJson({ ok: true, products: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "supply products list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const parsed = await parseJsonBody(req, supplyProductSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("supply_partner_products")
      .insert({ ...parsed.data, supply_partner_id: gate.partnerId })
      .select("id")
      .single();
    if (error) {
      // UNIQUE (supply_partner_id, sku) 違反
      if ((error as { code?: string }).code === "23505") {
        return apiJson({ ok: false, message: "同じ品番が既に登録されています。" }, { status: 409 });
      }
      return apiInternalError(error, "supply product create");
    }
    return apiJson({ ok: true, id: data.id });
  } catch (e: unknown) {
    return apiInternalError(e, "supply product create");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const parsed = await parseJsonBody(req, supplyProductUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, ...rest } = parsed.data;

    const updates: Record<string, unknown> = { ...rest };
    for (const k of Object.keys(updates)) if (updates[k] === undefined) delete updates[k];

    const supabase = await createSupabaseServerClient();
    // RLS で owner 本人に限定されるが、明示的に partner_id も絞る (多層防御)。
    const { error } = await supabase
      .from("supply_partner_products")
      .update(updates)
      .eq("id", id)
      .eq("supply_partner_id", gate.partnerId);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return apiJson({ ok: false, message: "同じ品番が既に登録されています。" }, { status: 409 });
      }
      return apiInternalError(error, "supply product update");
    }
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "supply product update");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const parsed = await parseJsonBody(req, supplyProductDeleteSchema);
    if (!parsed.ok) return parsed.response;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("supply_partner_products")
      .delete()
      .eq("id", parsed.data.id)
      .eq("supply_partner_id", gate.partnerId);
    if (error) return apiInternalError(error, "supply product delete");
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "supply product delete");
  }
}
