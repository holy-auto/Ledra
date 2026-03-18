import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { priceIdToPlanTier } from "@/lib/stripe/plan";
import { insurerPriceIdToPlanTier } from "@/lib/stripe/insurerPlan";
import { isTemplateOptionEvent } from "@/lib/template-options/stripe";
import { confirmCampaignSlot } from "@/lib/billing/campaign";
import { apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 運用方針：active/trialing/past_due は有効扱い
function isActiveStatus(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

function asStringId(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "id" in v) return String(v.id);
  return String(v);
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type TenantSelector = { by: "id"; value: string } | { by: "slug"; value: string };

async function resolveTenantSelector(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<TenantSelector | null> {
  const { supabase, tenant_id, tenant_slug, customerId, subscriptionId } = params;

  if (tenant_id) return { by: "id", value: tenant_id };
  if (tenant_slug) return { by: "slug", value: tenant_slug };

  // fallback: DB にすでに入っている stripe_id から逆引き
  if (subscriptionId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .limit(1);
    if (error) throw error;
    if (data?.[0]?.id) return { by: "id", value: data[0].id };
  }

  if (customerId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (error) throw error;
    if (data?.[0]?.id) return { by: "id", value: data[0].id };
  }

  return null;
}

async function updateTenantBySelector(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  selector: TenantSelector,
  patch: Record<string, any>
) {
  const q = supabase.from("tenants").update(patch);
  const { error } =
    selector.by === "id" ? await q.eq("id", selector.value) : await q.eq("slug", selector.value);
  if (error) throw error;
}

async function syncBySubscription(stripe: Stripe, supabase: ReturnType<typeof getSupabaseAdmin>, sub: Stripe.Subscription) {
  const subscriptionId = sub.id;
  const customerId = asStringId(sub.customer);

  const tenant_id = sub.metadata?.tenant_id ?? null;
  const tenant_slug = sub.metadata?.tenant_slug ?? null;

  const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;
  const plan_tier = priceId ? priceIdToPlanTier(priceId) : null;
  const active = isActiveStatus(sub.status);

  const selector = await resolveTenantSelector({ supabase, tenant_id, tenant_slug, customerId, subscriptionId });
  if (!selector) throw new Error(`Unable to resolve tenant for subscription sync. sub=${subscriptionId}`);

  const patch: Record<string, any> = {
    stripe_subscription_id: subscriptionId,
    is_active: active,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (plan_tier) patch.plan_tier = plan_tier;

  console.log("webhook: sync subscription", { tenant_id: tenant_id ?? "(lookup)", plan_tier, active, subscriptionId });
  await updateTenantBySelector(supabase, selector, patch);
}

// ─── Insurer subscription sync ───
async function syncInsurerSubscription(stripe: Stripe, supabase: ReturnType<typeof getSupabaseAdmin>, sub: Stripe.Subscription) {
  const insurerId = sub.metadata?.insurer_id;
  if (!insurerId) {
    // Try reverse lookup by stripe_subscription_id or customer_id
    const subscriptionId = sub.id;
    const customerId = asStringId(sub.customer);

    let resolvedInsurerId: string | null = null;

    if (subscriptionId) {
      const { data } = await supabase
        .from("insurers")
        .select("id")
        .eq("stripe_subscription_id", subscriptionId)
        .limit(1);
      if (data?.[0]?.id) resolvedInsurerId = data[0].id;
    }

    if (!resolvedInsurerId && customerId) {
      const { data } = await supabase
        .from("insurers")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .limit(1);
      if (data?.[0]?.id) resolvedInsurerId = data[0].id;
    }

    if (!resolvedInsurerId) return false; // Not an insurer subscription
    return await doSyncInsurer(supabase, resolvedInsurerId, sub);
  }

  return await doSyncInsurer(supabase, insurerId, sub);
}

async function doSyncInsurer(supabase: ReturnType<typeof getSupabaseAdmin>, insurerId: string, sub: Stripe.Subscription) {
  const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;
  const planTier = priceId ? insurerPriceIdToPlanTier(priceId) : null;
  const active = isActiveStatus(sub.status);
  const customerId = asStringId(sub.customer);

  const patch: Record<string, any> = {
    stripe_subscription_id: sub.id,
    is_active: active,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (planTier) patch.plan_tier = planTier;

  console.log("webhook: sync insurer subscription", { insurerId, planTier, active, subscriptionId: sub.id });
  const { error } = await supabase.from("insurers").update(patch).eq("id", insurerId);
  if (error) throw error;
  return true;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();

  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !whsec) {
    return apiValidationError("Missing stripe-signature or STRIPE_WEBHOOK_SECRET");
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (e) {
    console.error("webhook signature verify failed", e);
    return apiValidationError("Invalid signature");
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = asStringId(session.customer);
        const subscriptionId = asStringId(session.subscription);

        // ─── テンプレートオプション checkout ───
        if (isTemplateOptionEvent(session.metadata as Record<string, string> | null)) {
          const tenantId = session.metadata?.tenant_id;
          const optionType = session.metadata?.option_type as "preset" | "custom" | undefined;
          if (tenantId && optionType && subscriptionId) {
            // subscription item ID を取得
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const recurringItem = sub.items?.data?.find(i => i.price?.recurring);

            await supabase.from("tenant_option_subscriptions").upsert({
              tenant_id: tenantId,
              option_type: optionType,
              status: "active",
              stripe_subscription_id: subscriptionId,
              stripe_subscription_item_id: recurringItem?.id ?? null,
              started_at: new Date().toISOString(),
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "tenant_id,option_type" });

            console.log("webhook: template option subscription created", { tenantId, optionType, subscriptionId });
          }
          break;
        }

        // tenant 特定：metadata優先（推奨）→ client_reference_id
        const tenant_id = session.metadata?.tenant_id ?? session.client_reference_id ?? null;
        const tenant_slug = session.metadata?.tenant_slug ?? null;
        const isInsurer = session.metadata?.type === "insurer";

        if (!subscriptionId) throw new Error("checkout.session.completed: missing subscription id");

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        if (isInsurer) {
          // Insurer checkout
          await syncInsurerSubscription(stripe, supabase, sub);
        } else {
          // Tenant checkout
          if (tenant_id && !sub.metadata?.tenant_id) sub.metadata = { ...(sub.metadata ?? {}), tenant_id };
          if (tenant_slug && !sub.metadata?.tenant_slug) sub.metadata = { ...(sub.metadata ?? {}), tenant_slug };
          await syncBySubscription(stripe, supabase, sub);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        // ─── テンプレートオプション subscription ───
        if (isTemplateOptionEvent(sub.metadata as Record<string, string> | null)) {
          const tenantId = sub.metadata?.tenant_id;
          const optionType = sub.metadata?.option_type;
          if (tenantId && optionType) {
            const active = isActiveStatus(sub.status);
            const status = sub.status === "canceled" ? "cancelled"
              : sub.status === "past_due" ? "past_due"
              : active ? "active" : "suspended";

            await supabase.from("tenant_option_subscriptions")
              .update({
                status,
                current_period_end: sub.current_period_end
                  ? new Date(sub.current_period_end * 1000).toISOString()
                  : null,
                cancelled_at: sub.status === "canceled" ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", tenantId)
              .eq("option_type", optionType);

            console.log("webhook: template option subscription synced", { tenantId, optionType, status });
          }
          break;
        }

        // Try insurer first (checks metadata.type or reverse lookup)
        const isInsurer = sub.metadata?.type === "insurer";
        if (isInsurer) {
          await syncInsurerSubscription(stripe, supabase, sub);
        } else {
          // Try tenant sync; if it fails because tenant not found, try insurer
          try {
            await syncBySubscription(stripe, supabase, sub);
          } catch (tenantErr) {
            const handled = await syncInsurerSubscription(stripe, supabase, sub);
            if (!handled) throw tenantErr; // Re-throw if neither tenant nor insurer
          }
        }
        break;
      }

      // ✅ Portal操作後の支払い・失敗でも同期（invoice自体にmetadataが無いので subscription を取得）
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as any;
        const subscriptionId = asStringId(inv.subscription ?? inv.subscription_id);
        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        // ─── テンプレートオプション invoice ───
        if (isTemplateOptionEvent(sub.metadata as Record<string, string> | null)) {
          const tenantId = sub.metadata?.tenant_id;
          const optionType = sub.metadata?.option_type;
          if (tenantId && optionType) {
            const isPaid = event.type === "invoice.paid";
            await supabase.from("tenant_option_subscriptions")
              .update({
                status: isPaid ? "active" : "past_due",
                current_period_end: sub.current_period_end
                  ? new Date(sub.current_period_end * 1000).toISOString()
                  : null,
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", tenantId)
              .eq("option_type", optionType);
            console.log("webhook: template option invoice", { tenantId, optionType, event: event.type });
          }
          break;
        }

        // ─── キャンペーン枠確定（invoice.paid のみ） ───
        if (event.type === "invoice.paid") {
          const tenantId = sub.metadata?.tenant_id;
          const campaignSlug = sub.metadata?.campaign_slug;
          if (tenantId && campaignSlug) {
            await confirmCampaignSlot(supabase, tenantId, campaignSlug);
            console.log("webhook: campaign slot confirmed", { tenantId, campaignSlug });
          }
        }

        const isInsurer = sub.metadata?.type === "insurer";
        if (isInsurer) {
          await syncInsurerSubscription(stripe, supabase, sub);
        } else {
          try {
            await syncBySubscription(stripe, supabase, sub);
          } catch {
            await syncInsurerSubscription(stripe, supabase, sub);
          }
        }
        break;
      }

      // ─── Stripe Connect: アカウントオンボーディング状態の自動同期 ───
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const accountId = account.id;
        const onboarded = !!(account.charges_enabled && account.payouts_enabled);

        // stripe_connect_account_id でテナントを逆引き
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, stripe_connect_onboarded")
          .eq("stripe_connect_account_id", accountId)
          .limit(1)
          .maybeSingle();

        if (tenant && tenant.stripe_connect_onboarded !== onboarded) {
          await supabase
            .from("tenants")
            .update({ stripe_connect_onboarded: onboarded })
            .eq("id", tenant.id);
          console.log("webhook: connect account synced", { accountId, onboarded });
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("stripe webhook handler failed", { type: event.type, id: event.id, error: e instanceof Error ? e.message : e });
    return apiInternalError(e, "stripe webhook handler");
  }

  return NextResponse.json({ received: true });
}
