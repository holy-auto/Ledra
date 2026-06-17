/**
 * 運営専用: ショップ注文の帳票 PDF（請求書 / 納品書 / 領収書）を出力する。
 *
 * GET /api/admin/platform/shop-orders/[id]/document?type=invoice|delivery|receipt
 *
 * - 発行元（売り手）は運営テナント（PLATFORM_TENANT_ID）、宛先（買い手）は注文テナント。
 * - shop_orders は RLS でテナント分離されているため、運営が横断参照するには
 *   createPlatformScopedAdmin（service-role）を用いる正規経路。
 *
 * セキュリティ: isPlatformAdmin ゲート（super_admin もしくは運営テナントの owner/admin）。
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import {
  renderShopOrderDocument,
  isShopDocumentKind,
  SHOP_DOCUMENT_LABELS,
  type ShopDocumentSender,
} from "@/lib/shop/shopOrderDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SENDER_COLUMNS =
  "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden("運営権限が必要です。");

    const { id } = await ctx.params;
    const type = new URL(req.url).searchParams.get("type") ?? "invoice";
    if (!isShopDocumentKind(type)) {
      return apiValidationError("帳票の種類が不正です（invoice / delivery / receipt）。");
    }

    const admin = createPlatformScopedAdmin(
      "admin/platform/shop-orders document — 運営によるショップ注文の帳票出力（cross-tenant）",
    );

    const { data: order, error } = await admin
      .from("shop_orders")
      .select("*, tenants:tenant_id(name), shop_order_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return apiNotFound("注文が見つかりません。");

    const recipientName = (order.tenants as { name: string | null } | null)?.name ?? null;

    // 発行元（運営テナント）情報。未設定/未取得でも最低限の名称でフォールバックする。
    let sender: ShopDocumentSender = {
      name: "Ledra",
      address: null,
      contact_email: null,
      contact_phone: null,
      registration_number: null,
      logo_asset_path: null,
      company_seal_path: null,
      bank_info: null,
    };
    const platformTenantId = process.env.PLATFORM_TENANT_ID;
    if (platformTenantId) {
      const { data: pt } = await admin.from("tenants").select(SENDER_COLUMNS).eq("id", platformTenantId).maybeSingle();
      if (pt) sender = pt as unknown as ShopDocumentSender;
    }

    const items = (order.shop_order_items ?? []) as Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      tax_rate: number;
      amount: number;
    }>;

    const pdf = await renderShopOrderDocument({
      kind: type,
      order: {
        order_number: order.order_number,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        note: order.note,
        created_at: order.created_at,
        shipped_at: order.shipped_at,
        completed_at: order.completed_at,
      },
      items,
      sender,
      recipientName,
    });

    const label = SHOP_DOCUMENT_LABELS[type];
    const asciiName = `${type}_${order.order_number}`;
    const jpName = `${label}_${order.order_number}`;
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        // 日本語ファイル名は RFC 5987 (filename*) で渡し、ASCII フォールバックも併記する。
        "content-disposition": `attachment; filename="${asciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(jpName)}.pdf`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return apiInternalError(e, "admin/platform/shop-orders document GET");
  }
}
