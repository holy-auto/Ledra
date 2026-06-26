/**
 * 帳票 (請求書 / 見積書) を顧客へ自動送付する IO 層。
 *
 * 2 つのトリガーで呼ばれる:
 *   A. 人が draft→sent に確定した時点 (auto_send_on_confirm)
 *   B. AI がドラフトを自動確定した時点 (auto_send / auto_finalize)
 *
 * いずれも **fire-and-forget** で呼ばれ、管理者レスポンスを遅らせない。
 *
 * 段階:
 *   1. settings をロードし opt-in を確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_invoice_quote) と is_active を確認
 *   3. 顧客のチャネルを自動選択 (LINE 連携あり → LINE / 無ければメール)
 *   4. 請求書: 決済リンク (Stripe Connect) + 書類、見積書: 書類リンク を送付
 *   5. document_share_log に記録 (idempotency_key で二重送付を防止)
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { DOC_TYPES, type DocType } from "@/types/document";
import { resolveBaseUrl } from "@/lib/url";
import { sendDocumentEmail } from "@/lib/documents/share-email";
import { sendDocumentLink } from "@/lib/line/client";
import { getStripeClient } from "@/lib/stripe/client";
import { createInvoicePaymentLink } from "@/lib/stripe/invoicePaymentLink";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoSendDocument } from "./orchestrator";

export interface MaybeAutoSendDocumentParams {
  tenantId: string;
  documentId: string;
  /** 操作者 (確定したスタッフ) の auth.users.id。ログ用。 */
  actorUserId?: string | null;
  /** 決済リンク生成に使う base URL。未指定なら resolveBaseUrl() にフォールバック。 */
  baseUrl?: string;
}

type Channel = "line" | "email";

const INVOICE_TYPES = new Set(["invoice", "consolidated_invoice"]);

/**
 * 確定した帳票を顧客へ自動送付する。失敗しても投げない (fire-and-forget)。
 *
 * 呼び出し側 (documents PUT) は draft→sent 遷移時のみ呼ぶ前提だが、
 * 念のためここでも opt-in / プラン / チャネルを全てガードする。
 */
export async function maybeAutoSendDocumentOnConfirm(params: MaybeAutoSendDocumentParams): Promise<void> {
  const { tenantId, documentId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);

    const admin = createServiceRoleAdmin("AI auto-send document on confirm (draft→sent), fire-and-forget");

    // 帳票を取得 (doc_type を見て opt-in を判定するので先に取る)
    const { data: doc } = await admin
      .from("documents")
      .select("id, tenant_id, customer_id, recipient_name, doc_type, doc_number, status, total")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!doc) return;

    const docType = doc.doc_type as DocType;
    if (!shouldAutoSendDocument(settings, docType)) return;
    // 念のため: 確定 (sent) 済みのものだけ送る。
    if (doc.status !== "sent") return;

    // テナント (プラン / Connect 状態)
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, plan_tier, is_active, stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return;

    if (!doc.customer_id) return; // 送付先が特定できない

    // 顧客 (チャネル選択)
    const { data: customer } = await admin
      .from("customers")
      .select("id, name, email, line_user_id")
      .eq("id", doc.customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!customer) return;

    const lineUserId = (customer.line_user_id as string | null) ?? null;
    const email = customer.email && String(customer.email).includes("@") ? (customer.email as string) : null;
    if (!lineUserId && !email) {
      logger.info("auto_send_document_skipped_no_channel", { tenantId, documentId, docType });
      return;
    }

    // 二重送付防止をアトミックに行う: 送付前に 'pending' 行を予約する。
    // idempotency_key (auto-confirm:<id>) の部分 UNIQUE インデックスにより、
    // draft→sent がレース (ダブルクリック等) しても 1 つの worker しか claim できない。
    const idempotencyKey = `auto-confirm:${documentId}`;
    let reservationId: string | null = null;
    {
      const { data: claim, error: claimErr } = await admin
        .from("document_share_log")
        .insert({
          document_id: documentId,
          tenant_id: tenantId,
          channel: lineUserId ? "line" : "email",
          recipient: lineUserId ?? email ?? "",
          status: "pending",
          sent_by: params.actorUserId ?? null,
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .single();
      if (claimErr) {
        // 23505 = unique_violation → 既に別 worker が claim 済み (or 送付済み)。送らない。
        if (claimErr.code === "23505") return;
        // テーブル/インデックス未整備等は degraded mode (非アトミック) で続行。
        logger.warn("auto_send_document_reserve_failed", {
          tenantId,
          documentId,
          error: claimErr.message,
        });
      } else {
        reservationId = (claim?.id as string | null) ?? null;
      }
    }

    const docLabel = DOC_TYPES[docType]?.label ?? doc.doc_type;
    const recipientName = (doc.recipient_name as string | null) ?? (customer.name as string | null) ?? "お客様";
    const senderName = (tenant.name as string | null) ?? "Ledra";
    const totalYen = Math.round((doc.total as number) ?? 0);
    const isInvoice = INVOICE_TYPES.has(docType);
    const docNumber = (doc.doc_number as string | null) ?? `#${(doc.id as string).slice(0, 8)}`;

    // 請求書のみ: 決済リンク (Stripe Connect) を生成して同送する。
    let paymentUrl: string | null = null;
    if (isInvoice && totalYen > 0 && tenant.stripe_connect_account_id && tenant.stripe_connect_onboarded) {
      try {
        const link = await createInvoicePaymentLink({
          stripe: getStripeClient(),
          tenantId,
          tenantName: (tenant.name as string | null) ?? null,
          stripeConnectAccountId: tenant.stripe_connect_account_id as string,
          invoiceId: doc.id as string,
          invoiceDocNumber: (doc.doc_number as string | null) ?? null,
          totalYen,
          baseUrl: params.baseUrl ?? resolveBaseUrl(),
        });
        paymentUrl = link.checkoutUrl;
      } catch (e) {
        // 決済リンク生成失敗は致命的でない。書類だけは送る。
        logger.warn("auto_send_document_payment_link_failed", {
          tenantId,
          documentId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const paymentEmailMessage = paymentUrl
      ? `以下のリンクからクレジットカードでお支払いいただけます:\n${paymentUrl}`
      : undefined;

    // LINE は書類概要 + 決済リンクを 1 通にまとめる (sendDocumentLink が doc 種別/番号/
    // 金額を付与し、message に決済リンクを載せる)。送信が 1 回なので「書類は届いたが
    // 決済リンクだけ失敗」という分裂状態が起きず、結果 (delivered) も 1 つで判定できる。
    const lineMessage = [
      `${recipientName} 様`,
      `${docLabel}をお送りいたします。`,
      paymentUrl ? `` : null,
      paymentUrl ? `お支払いは以下のリンクからどうぞ:` : null,
      paymentUrl ? paymentUrl : null,
      paymentUrl ? `※リンクは 24 時間有効です。` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");

    let usedChannel: Channel = lineUserId ? "line" : "email";
    let usedRecipient = lineUserId ?? (email as string);
    let delivered = false;

    if (lineUserId) {
      delivered = await sendDocumentLink({
        tenantId,
        lineUserId,
        docType: docLabel,
        docNumber,
        totalAmount: totalYen,
        message: lineMessage,
      });
    }
    // LINE 未連携、または LINE 送信失敗時はメールにフォールバック (メールアドレスがあれば)。
    // メール本文にも決済リンクを同梱するため、1 通で書類 + 決済が届く。
    if (!delivered && email) {
      usedChannel = "email";
      usedRecipient = email;
      delivered = await sendDocumentEmail({
        to: email,
        docType: docLabel,
        docNumber,
        totalAmount: totalYen,
        recipientName,
        senderName,
        message: paymentEmailMessage,
      });
    }

    const errorMessage = delivered ? null : "自動送付に失敗しました";

    // 予約行を確定 (sent) / 失敗時は claim を解放して再確定でのリトライを許す。
    try {
      if (reservationId) {
        if (delivered) {
          await admin
            .from("document_share_log")
            .update({
              channel: usedChannel,
              recipient: usedRecipient,
              status: "sent",
              error_message: null,
              sent_at: new Date().toISOString(),
            })
            .eq("id", reservationId);
        } else {
          // claim を解放 (UNIQUE を空ける) し、失敗は idempotency_key なしの別行に残す。
          await admin.from("document_share_log").delete().eq("id", reservationId);
          await admin.from("document_share_log").insert({
            document_id: documentId,
            tenant_id: tenantId,
            channel: usedChannel,
            recipient: usedRecipient,
            status: "failed",
            error_message: errorMessage,
            sent_by: params.actorUserId ?? null,
          });
        }
      } else {
        // degraded mode (予約できなかった): 成功時のみ idempotency_key を付けて記録。
        await admin.from("document_share_log").insert({
          document_id: documentId,
          tenant_id: tenantId,
          channel: usedChannel,
          recipient: usedRecipient,
          status: delivered ? "sent" : "failed",
          error_message: errorMessage,
          sent_by: params.actorUserId ?? null,
          idempotency_key: delivered ? idempotencyKey : null,
        });
      }
    } catch (logErr) {
      logger.warn("auto_send_document_log_failed", {
        tenantId,
        documentId,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }

    logger.info("auto_send_document_complete", {
      tenantId,
      documentId,
      docType,
      channel: usedChannel,
      delivered,
      payment_link: Boolean(paymentUrl),
    });
  } catch (e) {
    logger.warn("auto_send_document_failed", {
      tenantId: params.tenantId,
      documentId: params.documentId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
