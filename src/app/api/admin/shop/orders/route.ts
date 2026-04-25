import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

const shopOrderInvoiceSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(9999),
      }),
    )
    .min(1, "商品を1つ以上選択してください。")
    .max(100),
  payment_method: z.literal("invoice"),
  note: z.string().trim().max(2000).optional(),
});

export const dynamic = "force-dynamic";

/** GET /api/admin/shop/orders — 自テナントの注文一覧 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const { data: orders, error } = await supabase
    .from("shop_orders")
    .select("*, shop_order_items(*)")
    .eq("tenant_id", caller.tenantId)
    .order("created_at", { ascending: false });

  if (error) return apiInternalError(error, "shop_orders select");

  return apiOk({ orders: orders ?? [] });
}

/** POST /api/admin/shop/orders — 注文作成（請求書払い） */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const parsed = shopOrderInvoiceSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const body = parsed.data;

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

  // 金額計算
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
    if (item.quantity < (product.min_quantity ?? 1)) {
      return apiValidationError(`${product.name}の最小注文数量は${product.min_quantity}${product.unit}です。`);
    }
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
  }

  const total = subtotal + tax;

  // 注文番号生成
  const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;

  // 注文作成
  const { data: order, error: oErr } = await supabase
    .from("shop_orders")
    .insert({
      tenant_id: caller.tenantId,
      order_number: orderNumber,
      status: "pending",
      payment_method: "invoice",
      subtotal,
      tax,
      total,
      note: body.note ?? null,
      created_by: caller.userId,
    })
    .select("id")
    .single();

  if (oErr) return apiInternalError(oErr, "shop_orders insert");

  // 明細作成
  const itemsToInsert = orderItems.map((item) => ({
    ...item,
    order_id: order.id,
  }));

  const { error: iErr } = await supabase.from("shop_order_items").insert(itemsToInsert);

  if (iErr) return apiInternalError(iErr, "shop_order_items insert");

  return apiOk({ order_id: order.id, order_number: orderNumber, total });
}
