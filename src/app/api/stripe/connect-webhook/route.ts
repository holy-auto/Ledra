import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError, apiError } from "@/lib/api/response";
import { captureSecurityEvent } from "@/lib/observability/sentry";
import { escapeHtml } from "@/lib/sanitize";
import { executeOrderPayout } from "@/lib/orders/orderPayout";
import { sendEmail } from "@/lib/email/sendEmail";

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
    await sendEmail({ from, to: params.to, subject: "[Ledra] 振込処理が失敗しました", html });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("connect-webhook: payout failed email error", { error: msg });
  }
}

async function sendTransferPaidEmail(params: {
  to: string;
  recipientName: string;
  amount: number;
  currency: string;
  transferId: string;
  isCommission: boolean;
  idempotencyKey: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return;

  const name = escapeHtml(params.recipientName);
  // Stripe amounts are in the smallest currency unit; JPY is zero-decimal so
  // amount === yen, but other currencies (usd/eur) are in cents.
  const isZeroDecimal = params.currency.toLowerCase() === "jpy";
  const display = isZeroDecimal
    ? params.amount.toLocaleString("ja-JP")
    : (params.amount / 100).toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = isZeroDecimal ? "¥" : params.currency.toUpperCase() + " ";
  const subjectLabel = params.isCommission ? "コミッションが入金されました" : "売上が入金されました";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #34c759;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">${escapeHtml(subjectLabel)}</h2>
      </div>
      <p style="color:#1d1d1f;font-size:14px;">
        ${name} 様<br><br>
        Stripe Connect 経由の${params.isCommission ? "コミッション" : "売上"}入金が完了しました。
      </p>
      <div style="background:#f0fdf4;border-radius:8px;padding:12px;margin:16px 0;font-size:14px;color:#14532d;">
        入金額: <strong>${symbol}${display}</strong><br>
        振込ID: ${escapeHtml(params.transferId)}
      </div>
      <p style="font-size:13px;color:#86868b;">
        振込明細は Stripe ダッシュボードまたは Ledra 管理画面からご確認いただけます。
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra
      </div>
    </div>
  `;

  try {
    await sendEmail({ from, to: params.to, subject: `[Ledra] ${subjectLabel}`, html });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("connect-webhook: transfer paid email error", { error: msg });
  }
}

async function sendConnectOnboardedEmail(params: {
  to: string;
  recipientName: string;
  idempotencyKey: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return;

  const name = escapeHtml(params.recipientName);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #0071e3;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">決済受付・お振込が利用可能になりました</h2>
      </div>
      <p style="color:#1d1d1f;font-size:14px;">
        ${name} 様<br><br>
        Stripe Connect のオンボーディングが完了しました。<br>
        これで Ledra 経由の決済受付と銀行口座へのお振込が可能になります。
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra
      </div>
    </div>
  `;

  try {
    await sendEmail({ from, to: params.to, subject: "[Ledra] 決済受付が利用可能になりました", html });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("connect-webhook: onboarded email error", { error: msg });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe(): Stripe {
  return getStripeClient();
}

// ── connected account ID → tenant / agent を逆引き ──
async function resolveReceiver(
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  accountId: string,
): Promise<{ tenantId: string | null; agentId: string | null }> {
  const [tenantResult, agentResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("stripe_connect_account_id", accountId).limit(1).maybeSingle(),
    supabase.from("agents").select("id").eq("stripe_account_id", accountId).limit(1).maybeSingle(),
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
    captureSecurityEvent("webhook_signature_failed", { provider: "stripe_connect" });
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
    // claim できていない状態で処理を進めると二重振込・コミッション二重計上を
    // 引き起こすため、503 を返して Stripe に再送させる。
    console.error("connect-webhook: idempotency claim failed — requesting Stripe retry", {
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
        const isCommission = meta?.source_type === "commission" && !!meta?.source_id;
        if (isCommission) {
          await supabase
            .from("agent_commissions")
            .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", meta!.source_id);
          console.info("connect-webhook: agent commission paid", {
            commissionId: meta!.source_id,
            transferId: transfer.id,
          });
        }

        // 車両レポート収益の還元送金が着金 → 台帳を paid に確定
        if (meta?.source_type === "vehicle_report" && meta?.source_id) {
          await supabase
            .from("vehicle_report_revenue_shares")
            .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", meta.source_id);
          console.info("connect-webhook: vehicle report share paid", {
            shareId: meta.source_id,
            transferId: transfer.id,
          });
        }

        // 入金完了メール: テナント or 代理店の contact_email に送信
        const destinationAccountId = transfer.destination
          ? typeof transfer.destination === "string"
            ? transfer.destination
            : transfer.destination.id
          : (connectedAccountId ?? "");

        try {
          const { tenantId, agentId } = await resolveReceiver(supabase, destinationAccountId);
          if (tenantId && !isCommission) {
            const { data: tenant } = await supabase
              .from("tenants")
              .select("name, contact_email")
              .eq("id", tenantId)
              .single();
            if (tenant?.contact_email) {
              await sendTransferPaidEmail({
                to: tenant.contact_email,
                recipientName: tenant.name ?? "店舗",
                amount: transfer.amount,
                currency: transfer.currency,
                transferId: transfer.id,
                isCommission: false,
                idempotencyKey: `transfer-paid:${event.id}`,
              });
            }
          } else if (agentId) {
            const { data: agent } = await supabase
              .from("agents")
              .select("name, contact_email")
              .eq("id", agentId)
              .single();
            if (agent?.contact_email) {
              await sendTransferPaidEmail({
                to: agent.contact_email,
                recipientName: agent.name ?? "代理店",
                amount: transfer.amount,
                currency: transfer.currency,
                transferId: transfer.id,
                isCommission,
                idempotencyKey: `transfer-paid:${event.id}`,
              });
            }
          }
        } catch (notifyErr) {
          console.error("connect-webhook: transfer paid notification error:", notifyErr);
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

        // 車両レポート収益の還元送金が取消 → 台帳を reversed に。
        // transfer.reversed は「一部取消」でも発火し、その場合 transfer.reversed
        // は false（全額取消で初めて true）。一部取消で share 全体を terminal な
        // reversed にすると残額を保持中の施工店を誤って完済扱いするため、全額
        // 取消のときだけ台帳を反映する。
        const fullyReversed =
          transfer.reversed === true ||
          (typeof transfer.amount_reversed === "number" && transfer.amount_reversed >= transfer.amount);
        if (meta?.source_type === "vehicle_report" && meta?.source_id && fullyReversed) {
          const { error: revErr } = await supabase
            .from("vehicle_report_revenue_shares")
            .update({ status: "reversed", updated_at: new Date().toISOString() })
            .eq("id", meta.source_id);
          // このイベントは冒頭で claim 済みなので、失敗しても Stripe 再送では
          // duplicate スキップされ再実行されない。money は Stripe 側で戻った
          // のに台帳が paid のまま残る不整合になるため、error で明示的に surface
          // して運用が手動修正できるようにする（silent success にしない）。
          if (revErr) {
            console.error("connect-webhook: vehicle report share reverse update FAILED — ledger/Stripe mismatch", {
              shareId: meta.source_id,
              transferId: transfer.id,
              error: revErr.message,
            });
          } else {
            console.info("connect-webhook: vehicle report share reversed", {
              shareId: meta.source_id,
              transferId: transfer.id,
            });
          }
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

          // オンボーディング完了 → pending_onboarding の案件を自動送金 + 通知
          if (onboarded && tenant.id) {
            const { data: pendingOrders } = await supabase
              .from("job_orders")
              .select("id")
              .eq("to_tenant_id", tenant.id)
              .eq("payout_stripe_transfer_id", "pending_onboarding");

            if (pendingOrders?.length) {
              console.info("connect-webhook: retrying pending payouts", {
                accountId: account.id,
                count: pendingOrders.length,
              });
              for (const order of pendingOrders) {
                executeOrderPayout(order.id as string).catch((e: unknown) =>
                  console.error("connect-webhook: retry payout failed", { orderId: order.id, error: e }),
                );
              }
            }

            void (async () => {
              try {
                const { data: t } = await supabase
                  .from("tenants")
                  .select("name, contact_email")
                  .eq("id", tenant.id)
                  .single();
                if (t?.contact_email) {
                  await sendConnectOnboardedEmail({
                    to: t.contact_email,
                    recipientName: t.name ?? "店舗",
                    idempotencyKey: `connect-onboarded:tenant:${tenant.id}`,
                  });
                }
              } catch (notifyErr) {
                console.error("connect-webhook: tenant onboarded notification error:", notifyErr);
              }
            })();
          }
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

          if (onboarded && agent.id) {
            void (async () => {
              try {
                const { data: a } = await supabase
                  .from("agents")
                  .select("name, contact_email")
                  .eq("id", agent.id)
                  .single();
                if (a?.contact_email) {
                  await sendConnectOnboardedEmail({
                    to: a.contact_email,
                    recipientName: a.name ?? "代理店",
                    idempotencyKey: `connect-onboarded:agent:${agent.id}`,
                  });
                }
              } catch (notifyErr) {
                console.error("connect-webhook: agent onboarded notification error:", notifyErr);
              }
            })();
          }
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
