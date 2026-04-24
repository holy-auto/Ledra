import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { priceIdToPlanTier } from "@/lib/stripe/plan";
import { insurerPriceIdToPlanTier } from "@/lib/stripe/insurerPlan";
import { isTemplateOptionEvent } from "@/lib/template-options/stripe";
import { confirmCampaignSlot } from "@/lib/billing/campaign";
import { apiJson, apiValidationError, apiInternalError, apiError } from "@/lib/api/response";
import { logAuditEvent } from "@/lib/audit/certificateLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 運用方針：active/trialing/past_due は有効扱い
function isActiveStatus(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

function asStringId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "id" in v) return String(v.id);
  return String(v);
}

/** Stripe SDK v20+: current_period_end moved from Subscription to SubscriptionItem */
function getCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const subRecord = sub as unknown as Record<string, unknown>;
  return (subRecord.current_period_end as number | undefined) ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

// ── Payment failure notification email ──
const RESEND_API = "https://api.resend.com/emails";

async function sendPaymentFailureEmail(
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
  billingPortalUrl: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("webhook: payment failure email skipped — missing RESEND_API_KEY or RESEND_FROM");
    return;
  }

  // Resolve owner email from tenant membership (try owner first, then admin)
  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin", "super_admin"])
    .limit(1);

  if (!members?.[0]) {
    console.warn("webhook: payment failure email skipped — no owner/admin member found", { tenantId });
    return;
  }

  const { data: userData } = await supabase.auth.admin.getUserById(members[0].user_id);
  const email = userData?.user?.email;
  if (!email) {
    console.warn("webhook: payment failure email skipped — no email for user", {
      tenantId,
      userId: members[0].user_id,
    });
    return;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #ff3b30; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">お支払いに失敗しました</h2>
      </div>
      <p style="color: #1d1d1f; line-height: 1.6;">
        ご利用中のLedraプランのお支払いを処理できませんでした。<br>
        カード情報をご確認のうえ、更新をお願いいたします。
      </p>
      <p style="margin: 24px 0;">
        <a href="${billingPortalUrl}" style="display: inline-block; background: #0071e3; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          カード情報を更新する
        </a>
      </p>
      <p style="color: #86868b; font-size: 13px;">
        お支払いが確認できない場合、一部機能がご利用いただけなくなる場合がございます。
      </p>
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        Ledra — 株式会社HOLY AUTO
      </div>
    </div>
  `;

  const text = `お支払いに失敗しました

ご利用中のLedraプランのお支払いを処理できませんでした。
カード情報をご確認のうえ、更新をお願いいたします。

カード情報の更新はこちら: ${billingPortalUrl}

お支払いが確認できない場合、一部機能がご利用いただけなくなる場合がございます。

---
Ledra — 株式会社HOLY AUTO
`;

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: email,
        reply_to: "support@ledra.co.jp",
        subject: "【Ledra】お支払いについてのご連絡",
        html,
        text,
      }),
    });
    const resBody = await res.text();
    if (!res.ok) {
      console.error("webhook: Resend API error", { status: res.status, body: resBody, tenantId, email });
    } else {
      console.info("webhook: payment failure email sent", { tenantId, email, resendResponse: resBody });
    }
  } catch (e) {
    console.error("webhook: failed to send payment failure email", { tenantId, error: e });
  }
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

type TenantSelector = { by: "id"; value: string } | { by: "slug"; value: string };

async function resolveTenantSelector(params: {
  supabase: ReturnType<typeof createServiceRoleAdmin>;
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
    const { data, error } = await supabase.from("tenants").select("id").eq("stripe_customer_id", customerId).limit(1);
    if (error) throw error;
    if (data?.[0]?.id) return { by: "id", value: data[0].id };
  }

  return null;
}

async function updateTenantBySelector(
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  selector: TenantSelector,
  patch: Record<string, unknown>,
) {
  const q = supabase.from("tenants").update(patch);
  const { error } = selector.by === "id" ? await q.eq("id", selector.value) : await q.eq("slug", selector.value);
  if (error) throw error;
}

async function syncBySubscription(
  stripe: Stripe,
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  sub: Stripe.Subscription,
) {
  const subscriptionId = sub.id;
  const customerId = asStringId(sub.customer);

  const tenant_id = sub.metadata?.tenant_id ?? null;
  const tenant_slug = sub.metadata?.tenant_slug ?? null;

  const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;
  const plan_tier = priceId ? priceIdToPlanTier(priceId) : null;
  const active = isActiveStatus(sub.status);

  const selector = await resolveTenantSelector({ supabase, tenant_id, tenant_slug, customerId, subscriptionId });
  if (!selector) throw new Error(`Unable to resolve tenant for subscription sync. sub=${subscriptionId}`);

  const patch: Record<string, unknown> = {
    stripe_subscription_id: subscriptionId,
    is_active: active,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (plan_tier) patch.plan_tier = plan_tier;

  console.info("webhook: sync subscription", { tenant_id: tenant_id ?? "(lookup)", plan_tier, active, subscriptionId });
  await updateTenantBySelector(supabase, selector, patch);

  // Audit log for billing state change
  const resolvedTenantId = selector.by === "id" ? selector.value : tenant_id;
  if (resolvedTenantId) {
    logAuditEvent({
      type: "invoice_paid",
      tenantId: resolvedTenantId,
      title: "課金状態を同期",
      description: `plan=${plan_tier ?? "unknown"} active=${active} sub=${subscriptionId}`,
    });
  }
}

// ─── Insurer subscription sync ───
async function syncInsurerSubscription(
  stripe: Stripe,
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  sub: Stripe.Subscription,
) {
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
      const { data } = await supabase.from("insurers").select("id").eq("stripe_customer_id", customerId).limit(1);
      if (data?.[0]?.id) resolvedInsurerId = data[0].id;
    }

    if (!resolvedInsurerId) return false; // Not an insurer subscription
    return await doSyncInsurer(supabase, resolvedInsurerId, sub);
  }

  return await doSyncInsurer(supabase, insurerId, sub);
}

async function doSyncInsurer(
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  insurerId: string,
  sub: Stripe.Subscription,
) {
  const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;
  const planTier = priceId ? insurerPriceIdToPlanTier(priceId) : null;
  const active = isActiveStatus(sub.status);
  const customerId = asStringId(sub.customer);

  const patch: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    is_active: active,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (planTier) patch.plan_tier = planTier;

  console.info("webhook: sync insurer subscription", { insurerId, planTier, active, subscriptionId: sub.id });
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

  const supabase = createServiceRoleAdmin("stripe webhook — events can belong to any tenant");

  // Idempotency: claim this event before processing.
  // INSERT with ON CONFLICT to handle concurrent webhook deliveries.
  const { error: claimError } = await supabase
    .from("stripe_processed_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select("id")
    .single();

  if (claimError) {
    // unique constraint violation = already claimed by another worker
    if (claimError.code === "23505") {
      console.info("webhook: duplicate event skipped", { id: event.id, type: event.type });
      return apiJson({ received: true, duplicate: true });
    }
    // 他の DB エラー: claim できていない状態で処理を進めると二重課金・二重
    // サブスク更新を引き起こすため、503 を返して Stripe に再送させる。
    console.error("webhook: idempotency claim failed — requesting Stripe retry", {
      id: event.id,
      type: event.type,
      code: claimError.code,
      message: claimError.message,
    });
    return apiError({
      code: "internal_error",
      message: "Idempotency claim failed; please retry.",
      status: 503,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = asStringId(session.customer);
        const subscriptionId = asStringId(session.subscription);

        // ─── ショップ注文 checkout (mode=payment) ───
        if (session.metadata?.shop_order_id) {
          const shopOrderId = session.metadata.shop_order_id;
          const tenantId = session.metadata.tenant_id;
          const paymentIntentId = asStringId(session.payment_intent);

          // 注文ステータスを paid に更新
          const { error: updateErr } = await supabase
            .from("shop_orders")
            .update({
              status: "paid",
              stripe_payment_intent_id: paymentIntentId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", shopOrderId);

          if (updateErr) {
            console.error("webhook: shop order update failed", { shopOrderId, error: updateErr });
            break;
          }

          // NFCタグの自動プロビジョニング
          if (tenantId) {
            const { data: items } = await supabase
              .from("shop_order_items")
              .select("meta, quantity")
              .eq("order_id", shopOrderId);

            for (const item of items ?? []) {
              const meta = (item.meta as Record<string, unknown>) ?? {};
              const qtyPerPack = (meta.quantity_per_pack as number) ?? 0;
              if (qtyPerPack > 0) {
                // NFCタグ: パックの枚数 × 注文数量分のタグ枠を作成
                const totalTags = qtyPerPack * item.quantity;
                const tagRows = Array.from({ length: totalTags }, (_, i) => ({
                  tenant_id: tenantId,
                  tag_code: `AUTO-${shopOrderId.slice(0, 8)}-${String(i + 1).padStart(4, "0")}`,
                  status: "prepared",
                }));

                if (tagRows.length > 0) {
                  const { error: tagErr } = await supabase.from("nfc_tags").insert(tagRows);
                  if (tagErr) {
                    console.error("webhook: nfc_tags provisioning failed", { shopOrderId, tenantId, error: tagErr });
                  } else {
                    console.info("webhook: nfc_tags provisioned", { shopOrderId, tenantId, count: tagRows.length });
                  }
                }
              }
            }
          }

          console.info("webhook: shop order paid", { shopOrderId, tenantId });
          break;
        }

        // ─── テンプレートオプション checkout ───
        if (isTemplateOptionEvent(session.metadata as Record<string, string> | null)) {
          const tenantId = session.metadata?.tenant_id;
          const optionType = session.metadata?.option_type as "preset" | "custom" | undefined;
          if (tenantId && optionType && subscriptionId) {
            // subscription item ID を取得
            const subRes = await stripe.subscriptions.retrieve(subscriptionId);
            const sub = subRes as unknown as Stripe.Subscription & Record<string, unknown>;
            const recurringItem = sub.items?.data?.find((i) => i.price?.recurring);

            await supabase.from("tenant_option_subscriptions").upsert(
              {
                tenant_id: tenantId,
                option_type: optionType,
                status: "active",
                stripe_subscription_id: subscriptionId,
                stripe_subscription_item_id: recurringItem?.id ?? null,
                started_at: new Date().toISOString(),
                current_period_end: getCurrentPeriodEnd(sub)
                  ? new Date(getCurrentPeriodEnd(sub)! * 1000).toISOString()
                  : null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "tenant_id,option_type" },
            );

            console.info("webhook: template option subscription created", { tenantId, optionType, subscriptionId });
          }
          break;
        }

        // tenant 特定：metadata優先（推奨）→ client_reference_id
        const tenant_id = session.metadata?.tenant_id ?? session.client_reference_id ?? null;
        const tenant_slug = session.metadata?.tenant_slug ?? null;
        const isInsurer = session.metadata?.type === "insurer";

        if (!subscriptionId) throw new Error("checkout.session.completed: missing subscription id");

        const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Stripe.Subscription &
          Record<string, unknown>;

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
            const status =
              sub.status === "canceled"
                ? "cancelled"
                : sub.status === "past_due"
                  ? "past_due"
                  : active
                    ? "active"
                    : "suspended";

            await supabase
              .from("tenant_option_subscriptions")
              .update({
                status,
                current_period_end: getCurrentPeriodEnd(sub)
                  ? new Date(getCurrentPeriodEnd(sub)! * 1000).toISOString()
                  : null,
                cancelled_at: sub.status === "canceled" ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", tenantId)
              .eq("option_type", optionType);

            console.info("webhook: template option subscription synced", { tenantId, optionType, status });
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
        const inv = event.data.object as Stripe.Invoice & Record<string, unknown>;
        // Stripe API v2025+ moved subscription reference:
        //   legacy: inv.subscription (string)
        //   new:    inv.parent?.subscription_details?.subscription (string)
        //   fallback: inv.lines?.data?.[0]?.parent?.subscription_item_details?.subscription (string)
        const rawSubId =
          inv.subscription ??
          inv.subscription_id ??
          inv.parent?.subscription_details?.subscription ??
          inv.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ??
          inv.lines?.data?.[0]?.subscription;
        const subscriptionId = asStringId(rawSubId);
        if (!subscriptionId) {
          console.warn("webhook: invoice has no subscription ID, skipping", { eventType: event.type, invId: inv.id });
          break;
        }

        const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Stripe.Subscription &
          Record<string, unknown>;

        // ─── テンプレートオプション invoice ───
        if (isTemplateOptionEvent(sub.metadata as Record<string, string> | null)) {
          const tenantId = sub.metadata?.tenant_id;
          const optionType = sub.metadata?.option_type;
          if (tenantId && optionType) {
            const isPaid = event.type === "invoice.paid";
            await supabase
              .from("tenant_option_subscriptions")
              .update({
                status: isPaid ? "active" : "past_due",
                current_period_end: getCurrentPeriodEnd(sub)
                  ? new Date(getCurrentPeriodEnd(sub)! * 1000).toISOString()
                  : null,
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", tenantId)
              .eq("option_type", optionType);
            console.info("webhook: template option invoice", { tenantId, optionType, event: event.type });
          }
          break;
        }

        // ─── キャンペーン枠確定（invoice.paid のみ） ───
        if (event.type === "invoice.paid") {
          const tenantId = sub.metadata?.tenant_id;
          const campaignSlug = sub.metadata?.campaign_slug;
          if (tenantId && campaignSlug) {
            await confirmCampaignSlot(supabase, tenantId, campaignSlug);
            console.info("webhook: campaign slot confirmed", { tenantId, campaignSlug });
          }
        }

        // ─── 決済失敗通知メール（テナント向け） ───
        if (event.type === "invoice.payment_failed" && sub.metadata?.type !== "insurer") {
          const tenantId = sub.metadata?.tenant_id;
          const customerId = asStringId(sub.customer);
          if (tenantId || customerId) {
            const resolvedTenantId =
              tenantId ??
              (customerId
                ? (
                    await supabase
                      .from("tenants")
                      .select("id")
                      .eq("stripe_customer_id", customerId)
                      .limit(1)
                      .maybeSingle()
                  ).data?.id
                : null);

            if (resolvedTenantId) {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
              await sendPaymentFailureEmail(supabase, resolvedTenantId, `${appUrl}/admin/billing`);
            }
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
          await supabase.from("tenants").update({ stripe_connect_onboarded: onboarded }).eq("id", tenant.id);
          console.info("webhook: connect account synced", { accountId, onboarded });
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("stripe webhook handler failed", {
      type: event.type,
      id: event.id,
      error: e instanceof Error ? e.message : e,
    });
    return apiInternalError(e, "stripe webhook handler");
  }

  return apiJson({ received: true });
}
