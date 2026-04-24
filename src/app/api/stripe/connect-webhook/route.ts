import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { escapeHtml } from "@/lib/sanitize";

async function sendPayoutFailedEmail(params: {
  to: string;
  recipientName: string;
  payoutId: string;
  amount: number;
  failureCode: string | null;
  failureMessage: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return;

  const name = escapeHtml(params.recipientName);
  const amount = (params.amount / 100).toLocaleString("ja-JP");
  const reason = escapeHtml(params.failureMessage ?? params.failureCode ?? "不明なエラー");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #ef4444;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">振込が失敗しました</h2>
      </div>
      <p style="color:#1d1d1f;font-size:14px;">
        ${name} 様<br><br>
        Stripe からの振込処理が失敗しました。銀行口座の情報をご確認ください。
      </p>
      <div style="background:#fef2f2;border-radius:8px;padding:12px;margin:16px 0;font-size:14px;color:#991b1b;">
        振込金額: <strong>¥${amount}</strong><br>
        エラー: ${reason}<br>
        振込ID: ${escapeHtml(params.payoutId)}
      </div>
      <p style="font-size:13px;color:#86868b;">
        お手数ですが、Stripe ダッシュボードで銀行口座情報をご確認ください。
        解決しない場合はサポートまでお問い合わせください。
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra
      </div>
    </div>
  `;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: "[Ledra] 振込処理が失敗しました", html }),
    });
  } catch (err) {
    console.error("connect-webhook: payout failed email error:", err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

// ── connected account ID → tenant / agent を逆引き ──
async function resolveReceiver(
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  accountId: string,
): Promise<{ tenantId: string | null; agentId: string | null }> {
  const [tenantResult, agentResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("stripe_connect_account_id", accountId).limit(1).maybeSingle(),
    supabase.from("agents").select("id").eq("stripe_connect_account_id", accountId).limit(1).maybeSingle(),
  ]);
  return {
    tenantId: tenantResult.data?.id ?? null,
    agentId: agentResult.data?.id ?? null,
  };
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const supabase = createServiceRoleAdmin(
    "stripe connect webhook — events route to any tenant/agent by connected account id",
  );

  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!sig || !whsec) {
    return apiValidationError("Missing stripe-signature or STRIPE_CONNECT_WEBHOOK_SECRET");
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (e) {
    console.error("connect-webhook: signature verify failed", e);
    return apiValidationError("Invalid signature");
  }

  // イベントの送信元 connected account ID（Stripe Connect では event.account に入る）
  const connectedAccountId = (event as unknown as Record<string, unknown>).account as string | undefined;

  // Idempotency
  const { error: claimError } = await supabase
    .from("stripe_processed_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      console.info("connect-webhook: duplicate event skipped", { id: event.id, type: event.type });
      return apiJson({ received: true, duplicate: true });
    }
    console.warn("connect-webhook: idempotency claim error (proceeding)", { id: event.id, error: claimError.message });
  }

  try {
    switch (event.type) {
      // ─────────────────────────────────────────────────
      // transfer.created — プラットフォームが送金を開始
      // ─────────────────────────────────────────────────
      case "transfer.created": {
        const transfer = event.data.object as Stripe.Transfer;
        const accountId = transfer.destination
          ? typeof transfer.destination === "string"
            ? transfer.destination
            : transfer.destination.id
          : (connectedAccountId ?? "");

        const { tenantId, agentId } = await resolveReceiver(supabase, accountId);
        const meta = transfer.metadata as Record<string, string> | null;

        await supabase.from("stripe_connect_transfers").upsert(
          {
            stripe_transfer_id: transfer.id,
            stripe_account_id: accountId,
            stripe_payment_intent_id: meta?.payment_intent_id ?? null,
            stripe_application_fee_id: meta?.application_fee_id ?? null,
            tenant_id: tenantId,
            agent_id: agentId,
            amount: transfer.amount,
            fee_amount: parseInt(meta?.fee_amount ?? "0", 10),
            currency: transfer.currency,
            source_type: (meta?.source_type as string) ?? "other",
            source_id: meta?.source_id ?? null,
            status: "created",
            metadata: transfer.metadata ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_transfer_id" },
        );

        console.info("connect-webhook: transfer created", {
          transferId: transfer.id,
          accountId,
          tenantId,
          agentId,
          amount: transfer.amount,
        });
        break;
      }

      // ─────────────────────────────────────────────────
      // transfer.paid — 送金完了（connected account に着金）
      // ─────────────────────────────────────────────────
      case "transfer.paid" as Stripe.Event["type"]: {
        const transfer = event.data.object as Stripe.Transfer;

        // stripe_connect_transfers のステータスを paid に
        await supabase
          .from("stripe_connect_transfers")
          .update({ status: "paid", transferred_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("stripe_transfer_id", transfer.id);

        // agent_commissions にも反映（source_type=commission の場合）
        const meta = transfer.metadata as Record<string, string> | null;
        if (meta?.source_type === "commission" && meta?.source_id) {
          await supabase
            .from("agent_commissions")
            .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", meta.source_id);
          console.info("connect-webhook: agent commission paid", {
            commissionId: meta.source_id,
            transferId: transfer.id,
          });
        }

        console.info("connect-webhook: transfer paid", { transferId: transfer.id });
        break;
      }

      // ─────────────────────────────────────────────────
      // transfer.reversed — 送金取消・返金（失敗時もこちらで処理）
      // ─────────────────────────────────────────────────
      case "transfer.reversed": {
        const transfer = event.data.object as Stripe.Transfer;

        await supabase
          .from("stripe_connect_transfers")
          .update({ status: "reversed", reversed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("stripe_transfer_id", transfer.id);

        // コミッション送金が取消された場合は failed に戻す
        const meta = transfer.metadata as Record<string, string> | null;
        if (meta?.source_type === "commission" && meta?.source_id) {
          await supabase
            .from("agent_commissions")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", meta.source_id);
          console.info("connect-webhook: agent commission reversed", {
            commissionId: meta.source_id,
            transferId: transfer.id,
          });
        }

        console.info("connect-webhook: transfer reversed", { transferId: transfer.id });
        break;
      }

      // ─────────────────────────────────────────────────
      // application_fee.created — プラットフォーム手数料確定
      // ─────────────────────────────────────────────────
      case "application_fee.created": {
        const fee = event.data.object as Stripe.ApplicationFee;
        const accountId = typeof fee.account === "string" ? fee.account : (fee.account?.id ?? connectedAccountId ?? "");

        // stripe_connect_transfers の fee_amount を更新（charge から transfer を特定）
        const chargeId = typeof fee.charge === "string" ? fee.charge : (fee.charge?.id ?? null);
        if (chargeId) {
          await supabase
            .from("stripe_connect_transfers")
            .update({ stripe_application_fee_id: fee.id, fee_amount: fee.amount, updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", chargeId);
        }

        console.info("connect-webhook: application_fee created", {
          feeId: fee.id,
          accountId,
          amount: fee.amount,
          chargeId,
        });
        break;
      }

      // ─────────────────────────────────────────────────
      // payout.paid — 加盟店/代理店の銀行口座への振込完了
      // ─────────────────────────────────────────────────
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        const accountId = connectedAccountId ?? "";
        console.info("connect-webhook: payout paid", {
          payoutId: payout.id,
          accountId,
          amount: payout.amount,
          arrivalDate: payout.arrival_date,
        });
        break;
      }

      // ─────────────────────────────────────────────────
      // payout.failed — 振込失敗
      // ─────────────────────────────────────────────────
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        const accountId = connectedAccountId ?? "";
        const { tenantId, agentId } = await resolveReceiver(supabase, accountId);

        console.error("connect-webhook: payout failed", {
          payoutId: payout.id,
          accountId,
          tenantId,
          agentId,
          failureCode: payout.failure_code,
          failureMessage: payout.failure_message,
        });

        // 振込失敗メール通知（テナントまたは代理店の contact_email に送信）
        void (async () => {
          try {
            if (tenantId) {
              const { data: tenant } = await supabase
                .from("tenants")
                .select("name, contact_email")
                .eq("id", tenantId)
                .single();
              if (tenant?.contact_email) {
                await sendPayoutFailedEmail({
                  to: tenant.contact_email,
                  recipientName: tenant.name ?? "店舗",
                  payoutId: payout.id,
                  amount: payout.amount,
                  failureCode: payout.failure_code ?? null,
                  failureMessage: payout.failure_message ?? null,
                });
              }
            } else if (agentId) {
              const { data: agent } = await supabase
                .from("agents")
                .select("name, contact_email")
                .eq("id", agentId)
                .single();
              if (agent?.contact_email) {
                await sendPayoutFailedEmail({
                  to: agent.contact_email,
                  recipientName: agent.name ?? "代理店",
                  payoutId: payout.id,
                  amount: payout.amount,
                  failureCode: payout.failure_code ?? null,
                  failureMessage: payout.failure_message ?? null,
                });
              }
            }
          } catch (notifyErr) {
            console.error("connect-webhook: payout failed notification error:", notifyErr);
          }
        })();
        break;
      }

      // ─────────────────────────────────────────────────
      // account.updated — オンボーディング状態変化
      //   ※ main webhook でも処理するが、Connect webhook 側でも受け取れるよう記載
      // ─────────────────────────────────────────────────
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const onboarded = !!(account.charges_enabled && account.payouts_enabled);

        // tenant
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, stripe_connect_onboarded")
          .eq("stripe_connect_account_id", account.id)
          .limit(1)
          .maybeSingle();

        if (tenant && tenant.stripe_connect_onboarded !== onboarded) {
          await supabase.from("tenants").update({ stripe_connect_onboarded: onboarded }).eq("id", tenant.id);
          console.info("connect-webhook: tenant connect synced", { accountId: account.id, onboarded });
        }

        // agent
        const { data: agent } = await supabase
          .from("agents")
          .select("id, stripe_connect_onboarded")
          .eq("stripe_connect_account_id", account.id)
          .limit(1)
          .maybeSingle();

        if (agent && agent.stripe_connect_onboarded !== onboarded) {
          await supabase.from("agents").update({ stripe_connect_onboarded: onboarded }).eq("id", agent.id);
          console.info("connect-webhook: agent connect synced", { accountId: account.id, onboarded });
        }

        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("connect-webhook handler failed", {
      type: event.type,
      id: event.id,
      error: e instanceof Error ? e.message : e,
    });
    return apiInternalError(e, "connect-webhook handler");
  }

  return apiJson({ received: true });
}
