import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

// ── connected account ID → tenant / agent を逆引き ──
async function resolveReceiver(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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
  const supabase = getSupabaseAdmin();

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
  const connectedAccountId = (event as any).account as string | undefined;

  // Idempotency
  const { error: claimError } = await supabase
    .from("stripe_processed_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      console.log("connect-webhook: duplicate event skipped", { id: event.id, type: event.type });
      return NextResponse.json({ received: true, duplicate: true });
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
            source_type: (meta?.source_type as any) ?? "other",
            source_id: meta?.source_id ?? null,
            status: "created",
            metadata: transfer.metadata ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_transfer_id" },
        );

        console.log("connect-webhook: transfer created", {
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
      case "transfer.paid" as any: {
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
          console.log("connect-webhook: agent commission paid", {
            commissionId: meta.source_id,
            transferId: transfer.id,
          });
        }

        console.log("connect-webhook: transfer paid", { transferId: transfer.id });
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
          console.log("connect-webhook: agent commission reversed", {
            commissionId: meta.source_id,
            transferId: transfer.id,
          });
        }

        console.log("connect-webhook: transfer reversed", { transferId: transfer.id });
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

        console.log("connect-webhook: application_fee created", {
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
        console.log("connect-webhook: payout paid", {
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
        // TODO: 振込失敗メール通知
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
          console.log("connect-webhook: tenant connect synced", { accountId: account.id, onboarded });
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
          console.log("connect-webhook: agent connect synced", { accountId: account.id, onboarded });
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

  return NextResponse.json({ received: true });
}
