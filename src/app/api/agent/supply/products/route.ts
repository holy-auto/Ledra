/**
 * 代理店の商材カタログ CRUD (supply_partner_products) — 代理店アカウント統合版。
 *
 * パートナー ≡ 代理店。RLS (spp_*_partner = my_supply_partner_ids 経由) により
 * 自代理店のパートナーの行しか読み書きできない。
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
    if (error) return apiInternalError(error, "agent supply products list");
    return apiJson({ ok: true, products: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "agent supply products list");
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
      if ((error as { code?: string }).code === "23505") {
        return apiJson({ ok: false, message: "同じ品番が既に登録されています。" }, { status: 409 });
      }
      return apiInternalError(error, "agent supply product create");
    }
    return apiJson({ ok: true, id: data.id });
  } catch (e: unknown) {
    return apiInternalError(e, "agent supply product create");
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
    const { error } = await supabase
      .from("supply_partner_products")
      .update(updates)
      .eq("id", id)
      .eq("supply_partner_id", gate.partnerId);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return apiJson({ ok: false, message: "同じ品番が既に登録されています。" }, { status: 409 });
      }
      return apiInternalError(error, "agent supply product update");
    }
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "agent supply product update");
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
    if (error) return apiInternalError(error, "agent supply product delete");
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "agent supply product delete");
  }
}
