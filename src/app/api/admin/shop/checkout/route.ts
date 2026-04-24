import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

/** POST /api/admin/shop/checkout — Stripe Checkout Session作成 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    let body: {
      items: Array<{ product_id: string; quantity: number }>;
      note?: string;
    };

    try {
      body = await req.json();
    } catch {
      return apiValidationError("Invalid JSON");
    }

    if (!body.items?.length) {
      return apiValidationError("商品を1つ以上選択してください。");
    }

    // 商品情報を取得
    const productIds = body.items.map((i) => i.product_id);
    const { data: products, error: pErr } = await supabase
      .from("shop_products")
      .select("id, name, price, tax_rate, unit, min_quantity, meta")
      .in("id", productIds)
      .eq("is_active", true);

    if (pErr) return apiInternalError(pErr, "shop_products lookup");
    if (!products?.length) return apiValidationError("有効な商品が見つかりません。");

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 金額計算 & Stripe line_items構築
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let subtotal = 0;
    let tax = 0;
    const orderItems: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      tax_rate: number;
      amount: number;
      meta: Record<string, unknown>;
    }> = [];

    for (const item of body.items) {
      const product = productMap.get(item.product_id);
      if (!product) continue;

      const amount = product.price * item.quantity;
      const itemTax = Math.floor(amount * product.tax_rate);
      subtotal += amount;
      tax += itemTax;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        tax_rate: product.tax_rate,
        amount,
        meta: product.meta ?? {},
      });

      // 税込み単価
      const unitAmountWithTax = product.price + Math.floor(product.price * product.tax_rate);

      lineItems.push({
        price_data: {
          currency: "jpy",
          product_data: { name: product.name },
          unit_amount: unitAmountWithTax,
        },
        quantity: item.quantity,
      });
    }

    const total = subtotal + tax;

    // テナント情報取得（Stripe Customer ID用）
    const admin = getSupabaseAdmin();
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", caller.tenantId)
      .maybeSingle();

    if (tErr) return apiInternalError(tErr, "read tenants");

    const stripe = getStripe();

    // Stripe Customer確保
    let customerId = tenant?.stripe_customer_id as string | null;
    if (!customerId) {
      const c = await stripe.customers.create({
        name: tenant?.name ?? "Ledra Tenant",
        metadata: { tenant_id: caller.tenantId },
      });
      customerId = c.id;
      await admin.from("tenants").update({ stripe_customer_id: customerId }).eq("id", caller.tenantId);
    }

    // 注文番号生成
    const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;

    // Step 1: 仮レコード作成（order_id を先に確保）
    const { data: order, error: oErr } = await supabase
      .from("shop_orders")
      .insert({
        tenant_id: caller.tenantId,
        order_number: orderNumber,
        status: "pending_checkout",
        payment_method: "stripe",
        subtotal,
        tax,
        total,
        note: body.note ?? null,
        created_by: caller.userId,
      })
      .select("id")
      .single();

    if (oErr) return apiInternalError(oErr, "shop_orders insert");

    // 明細作成（内部DBなので Stripe 前に実行してOK）
    const itemsToInsert = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));
    await supabase.from("shop_order_items").insert(itemsToInsert);

    // Step 2: Stripe Checkout Session作成
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("Missing APP_URL");

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        client_reference_id: caller.tenantId,
        metadata: {
          tenant_id: caller.tenantId,
          shop_order_id: order.id,
          order_number: orderNumber,
        },
        line_items: lineItems,
        success_url: `${appUrl}/admin/shop?status=success&order=${orderNumber}`,
        cancel_url: `${appUrl}/admin/shop?status=cancel&order=${orderNumber}`,
      });
    } catch (stripeErr) {
      // Stripe 失敗 → 仮レコードをクリーンアップして孤立オーダーを防ぐ。
      // shop_order_items も合わせて削除しないと、failed order に対する
      // items が DB に残って在庫集計などが歪む。
      await admin.from("shop_order_items").delete().eq("order_id", order.id);
      await admin.from("shop_orders").update({ status: "checkout_failed" }).eq("id", order.id);
      throw stripeErr;
    }

    // Step 3: セッションID・ステータスを記録
    await admin
      .from("shop_orders")
      .update({ stripe_checkout_session_id: session.id, status: "pending_payment" })
      .eq("id", order.id);

    return apiOk({ url: session.url, order_id: order.id, order_number: orderNumber });
  } catch (e) {
    return apiInternalError(e, "shop checkout");
  }
}
