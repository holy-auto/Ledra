import { NextRequest } from "next/server";
import Stripe from "stripe";
import { apiOk, apiInternalError, apiValidationError, apiNotFound, apiUnauthorized } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addonCheckoutSchema = z.object({
  access_token: z.string().min(1, "アクセストークンは必須です。"),
  items: z.array(z.object({
    type: z.enum(["addon", "nfc"]),
    key: z.string().min(1),
    quantity: z.number().int().min(1).max(100).default(1),
  })).min(1, "購入するアイテムを選択してください。"),
});

/** Add-on / NFC one-time purchase product definitions (amounts in JPY, tax-inclusive) */
const ADDON_PRODUCTS: Record<string, { name: string; amount: number; mode: "subscription" | "payment" }> = {
  additional_store:   { name: "追加店舗",                   amount: 4980,  mode: "subscription" },
  additional_user:    { name: "追加ユーザー",               amount: 1480,  mode: "subscription" },
  invoice_payment:    { name: "請求書機能＋オンライン決済",  amount: 3980,  mode: "subscription" },
  priority_support:   { name: "優先サポート",               amount: 4980,  mode: "subscription" },
  onboarding:         { name: "導入伴走（月額）",           amount: 19800, mode: "subscription" },
  onboarding_pack:    { name: "導入伴走（3ヶ月パック）",    amount: 49800, mode: "payment" },
};

const NFC_PRODUCTS: Record<string, { name: string; amount: number; quantity: number }> = {
  nfc_10:  { name: "NFCタグ 10枚パック",  amount: 980,  quantity: 10 },
  nfc_30:  { name: "NFCタグ 30枚パック",  amount: 2480, quantity: 30 },
  nfc_100: { name: "NFCタグ 100枚パック", amount: 6980, quantity: 100 },
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = addonCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { access_token, items } = parsed.data;

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const u = await supabase.auth.getUser(access_token);
    if (u.error || !u.data?.user) return apiUnauthorized();
    const user_id = u.data.user.id;

    const m = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) return apiInternalError(m.error, "read tenant_memberships");
    if (!m.data?.tenant_id) return apiNotFound("テナントメンバーシップが見つかりません。");

    const tenant_id = m.data.tenant_id;

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!tenant) return apiNotFound("テナントが見つかりません。");

    let customerId = tenant.stripe_customer_id as string | null;
    if (!customerId) {
      const c = await stripe.customers.create({
        name: tenant.name ?? "CARTRUST Tenant",
        metadata: { tenant_id },
      });
      customerId = c.id;
      await supabase.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenant_id);
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("Missing APP_URL");

    // Determine if all items are one-time payments or subscriptions
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let hasSubscription = false;
    let hasPayment = false;

    for (const item of items) {
      if (item.type === "nfc") {
        const nfc = NFC_PRODUCTS[item.key];
        if (!nfc) return apiValidationError(`無効なNFCパック: ${item.key}`);
        lineItems.push({
          price_data: {
            currency: "jpy",
            product_data: { name: nfc.name },
            unit_amount: nfc.amount,
          },
          quantity: item.quantity,
        });
        hasPayment = true;
      } else {
        const addon = ADDON_PRODUCTS[item.key];
        if (!addon) return apiValidationError(`無効なオプション: ${item.key}`);
        if (addon.mode === "subscription") {
          lineItems.push({
            price_data: {
              currency: "jpy",
              product_data: { name: addon.name },
              unit_amount: addon.amount,
              recurring: { interval: "month" },
            },
            quantity: item.quantity,
          });
          hasSubscription = true;
        } else {
          lineItems.push({
            price_data: {
              currency: "jpy",
              product_data: { name: addon.name },
              unit_amount: addon.amount,
            },
            quantity: item.quantity,
          });
          hasPayment = true;
        }
      }
    }

    // Stripe doesn't allow mixing subscription and one-time in the same session,
    // but subscription mode can include one-time items via add_invoice_items.
    // For simplicity, if subscription items exist, use subscription mode.
    // If only one-time items, use payment mode.
    const mode = hasSubscription ? "subscription" : "payment";

    if (mode === "subscription" && hasPayment) {
      // Move one-time items to add_invoice_items on the subscription
      const subscriptionItems = lineItems.filter((li) => {
        const pd = li.price_data as any;
        return pd?.recurring;
      });
      const oneTimeItems = lineItems.filter((li) => {
        const pd = li.price_data as any;
        return !pd?.recurring;
      });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: tenant_id,
        metadata: { tenant_id, purchase_type: "addon" },
        line_items: subscriptionItems,
        subscription_data: {
          metadata: { tenant_id, purchase_type: "addon" },
          add_invoice_items: oneTimeItems.map((li) => ({
            price_data: li.price_data as any,
            quantity: li.quantity,
          })),
        },
        success_url: `${appUrl}/admin/billing?status=success&type=addon`,
        cancel_url: `${appUrl}/admin/billing?status=cancel`,
      } as any);

      return apiOk({ url: session.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      client_reference_id: tenant_id,
      metadata: { tenant_id, purchase_type: mode === "subscription" ? "addon_subscription" : "addon_onetime" },
      line_items: lineItems,
      ...(mode === "subscription" ? { subscription_data: { metadata: { tenant_id, purchase_type: "addon" } } } : {}),
      success_url: `${appUrl}/admin/billing?status=success&type=addon`,
      cancel_url: `${appUrl}/admin/billing?status=cancel`,
    } as any);

    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "stripe addon checkout");
  }
}
