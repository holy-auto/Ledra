/**
 * 運営専用: 全テナントのショップ注文一覧を CSV でエクスポートする。
 *
 * GET /api/admin/platform/shop-orders/export?status=（任意の絞り込み）
 *
 * 用途: 売上集計 / 会計連携 / 出荷管理のバックアップ。
 * Excel が UTF-8 を正しく認識するよう BOM を先頭に付与する。
 *
 * セキュリティ: isPlatformAdmin ゲート。shop_orders は RLS 分離のため
 * createPlatformScopedAdmin（service-role）で横断参照する。
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import {
  SHOP_ORDER_STATUS_LABELS,
  SHOP_PAYMENT_METHOD_LABELS,
  type ShopOrderStatus,
  type ShopPaymentMethod,
} from "@/types/shopProduct";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvEscape(v: unknown): string {
  const str = v == null ? "" : String(v);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** ISO 文字列を "YYYY-MM-DD HH:mm"（JST）へ。空なら空文字。 */
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  // toLocaleString(ja-JP) はロケール依存の区切りが入るため、安定した固定書式で出力する。
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden("運営権限が必要です。");

    const admin = createPlatformScopedAdmin(
      "admin/platform/shop-orders export — 運営による全テナントのショップ注文 CSV 出力（cross-tenant）",
    );

    const statusFilter = new URL(req.url).searchParams.get("status");

    let query = admin
      .from("shop_orders")
      .select("*, tenants:tenant_id(name, slug), shop_order_items(quantity)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data: orders, error } = await query;
    if (error) throw error;

    const header = [
      "注文番号",
      "テナント",
      "ステータス",
      "支払方法",
      "小計",
      "消費税",
      "合計",
      "明細数",
      "数量合計",
      "注文日時",
      "発送日時",
      "完了日時",
      "備考",
    ];

    const lines: string[] = [header.join(",")];
    for (const o of orders ?? []) {
      const tenant = (o.tenants as { name: string | null; slug: string | null } | null) ?? null;
      const items = (o.shop_order_items as Array<{ quantity: number }> | null) ?? [];
      const qtyTotal = items.reduce((sum, it) => sum + (it.quantity ?? 0), 0);
      lines.push(
        [
          csvEscape(o.order_number),
          csvEscape(tenant?.name ?? tenant?.slug ?? o.tenant_id),
          csvEscape(SHOP_ORDER_STATUS_LABELS[o.status as ShopOrderStatus] ?? o.status),
          csvEscape(SHOP_PAYMENT_METHOD_LABELS[o.payment_method as ShopPaymentMethod] ?? o.payment_method),
          csvEscape(o.subtotal),
          csvEscape(o.tax),
          csvEscape(o.total),
          csvEscape(items.length),
          csvEscape(qtyTotal),
          csvEscape(fmtDateTime(o.created_at)),
          csvEscape(fmtDateTime(o.shipped_at)),
          csvEscape(fmtDateTime(o.completed_at)),
          csvEscape(o.note),
        ].join(","),
      );
    }

    const filename = `shop_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    // 先頭に UTF-8 BOM (U+FEFF) を付与して Excel の文字化けを防ぐ。
    return new NextResponse("﻿" + lines.join("\r\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return apiInternalError(e, "admin/platform/shop-orders export");
  }
}
