/**
 * 帳票 (請求書 / 見積書) を人が「確定」した時点で顧客へ自動送付する IO 層。
 *
 * `/api/admin/documents` の PUT で status が draft → sent に遷移した時点
 * (= 人が「確定/送付済みに変更」した瞬間) に **fire-and-forget** で呼ばれる。
 * 管理者レスポンスを遅らせないため await しない。
 *
 * 段階:
 *   1. settings をロードし opt-in (invoice.auto_send_on_confirm /
 *      quote.auto_send_on_confirm) を確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_invoice_quote) と is_active を確認
 *   3. 顧客のチャネルを自動選択 (LINE 連携あり → LINE / 無ければメール)
 *   4. 請求書: 決済リンク (Stripe Connect) + 書類、見積書: 書類リンク を送付
 *   5. document_share_log に記録 (idempotency_key で二重送付を防止)
 *
 * 壁3:
 *   - 金額/内容の「確定」そのものは人 (draft→sent は人の操作)。ここは送付のみ。
 *   - 決済リンクは「お支払い導線」を提供するだけで、自動課金 (payment.auto_charge)
 *     は行わない。実際の支払いは顧客の操作。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { DOC_TYPES, type DocType } from "@/types/document";
import { resolveBaseUrl } from "@/lib/url";
import { sendDocumentEmail } from "@/lib/documents/share-email";
import { sendDocumentLink, sendCustomerLineText } from "@/lib/line/client";
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

    const channel: Channel | null = customer.line_user_id
      ? "line"
      : customer.email && String(customer.email).includes("@")
        ? "email"
        : null;
    if (!channel) {
      logger.info("auto_send_document_skipped_no_channel", { tenantId, documentId, docType });
      return;
    }

    // 二重送付防止 (idempotency)。同じ帳票の確定送付は 1 回限り。
    const idempotencyKey = `auto-confirm:${documentId}`;
    try {
      const { data: already } = await admin
        .from("document_share_log")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .eq("status", "sent")
        .maybeSingle();
      if (already) return;
    } catch {
      // ログテーブルが無い環境では idempotency を諦めて送付を継続。
    }

    const docLabel = DOC_TYPES[docType]?.label ?? doc.doc_type;
    const recipientName = (doc.recipient_name as string | null) ?? (customer.name as string | null) ?? "お客様";
    const senderName = (tenant.name as string | null) ?? "Ledra";
    const totalYen = Math.round((doc.total as number) ?? 0);
    const isInvoice = INVOICE_TYPES.has(docType);

    // 請求書のみ: 決済リンク (Stripe Connect) を生成して同送する。
    let paymentUrl: string | null = null;
    if (
      isInvoice &&
      totalYen > 0 &&
      tenant.stripe_connect_account_id &&
      tenant.stripe_connect_onboarded
    ) {
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

    let delivered = false;
    const recipient = channel === "line" ? (customer.line_user_id as string) : (customer.email as string);

    if (channel === "line") {
      // 書類リンク
      delivered = await sendDocumentLink({
        tenantId,
        lineUserId: customer.line_user_id as string,
        docType: docLabel,
        docNumber: (doc.doc_number as string | null) ?? `#${(doc.id as string).slice(0, 8)}`,
        totalAmount: totalYen,
        message: `${recipientName} 様\n${docLabel}をお送りいたします。`,
      });
      // 決済リンク (請求書のみ)
      if (paymentUrl) {
        await sendCustomerLineText({
          tenantId,
          customerId: customer.id as string,
          lineUserId: customer.line_user_id as string,
          sentByUserId: params.actorUserId ?? null,
          body: [
            `お支払いのご案内です。`,
            `金額: ¥${totalYen.toLocaleString("ja-JP")}`,
            ``,
            `以下のリンクからクレジットカードでお支払いいただけます:`,
            paymentUrl,
            ``,
            `※リンクは 24 時間有効です。`,
          ].join("\n"),
        });
      }
    } else {
      // email: 書類概要メール。請求書は決済リンクを本文に同梱。
      delivered = await sendDocumentEmail({
        to: customer.email as string,
        docType: docLabel,
        docNumber: (doc.doc_number as string | null) ?? `#${(doc.id as string).slice(0, 8)}`,
        totalAmount: totalYen,
        recipientName,
        senderName,
        message: paymentUrl ? `以下のリンクからクレジットカードでお支払いいただけます:\n${paymentUrl}` : undefined,
      });
    }

    // 送付ログ (履歴 + idempotency)。失敗は非致命的。
    try {
      await admin.from("document_share_log").insert({
        document_id: documentId,
        tenant_id: tenantId,
        channel,
        recipient,
        status: delivered ? "sent" : "failed",
        error_message: delivered ? null : "自動送付に失敗しました",
        sent_by: params.actorUserId ?? null,
        idempotency_key: idempotencyKey,
      });
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
      channel,
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
