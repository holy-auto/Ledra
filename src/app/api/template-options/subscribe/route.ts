import { NextRequest } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiError } from "@/lib/api/response";
import { createTemplateOptionCheckout } from "@/lib/template-options/stripe";

const subscribeSchema = z.object({
  option_type: z.enum(["preset", "custom"]),
  platform_template_id: z.string().uuid().optional(),
});

/** POST: テンプレートオプション申込（Stripe Checkout作成） */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { option_type, platform_template_id } = parsed.data;

    // 既存契約チェック
    const { data: existingSub } = await admin
      .from("tenant_option_subscriptions")
      .select("id, status")
      .eq("tenant_id", caller.tenantId)
      .eq("option_type", option_type)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    if (existingSub) {
      return apiError({
        code: "conflict",
        message: `${option_type === "preset" ? "ブランド証明書 ライト" : "ブランド証明書 プレミアム"}は既に契約中です。`,
        status: 409,
      });
    }

    // テナントの stripe_customer_id を取得
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) {
      return apiError({ code: "not_found", message: "テナントが見つかりません。", status: 404 });
    }

    let customerId = tenant.stripe_customer_id as string | null;

    // Stripe Customer がなければ作成
    if (!customerId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
      });
      const customer = await stripe.customers.create({
        name: (tenant.name as string) ?? "Ledra Tenant",
        metadata: { tenant_id: caller.tenantId },
      });
      customerId = customer.id;

      await admin.from("tenants").update({ stripe_customer_id: customerId }).eq("id", caller.tenantId);
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    if (!appUrl) throw new Error("Missing APP_URL");

    const session = await createTemplateOptionCheckout({
      tenantId: caller.tenantId,
      customerId,
      optionType: option_type,
      successUrl: `${appUrl}/admin/template-options?status=success&option_type=${option_type}`,
      cancelUrl: `${appUrl}/admin/template-options?status=cancel`,
    });

    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "template-options/subscribe");
  }
}
