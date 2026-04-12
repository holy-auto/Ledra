import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiNotFound } from "@/lib/api/response";
import { getAdminClient } from "@/lib/api/auth";
import { DOC_TYPES, type DocType } from "@/types/document";
import { sendDocumentEmail } from "@/lib/documents/share-email";
import { sendDocumentLink } from "@/lib/line/client";
import { sendSMS } from "@/lib/sms/client";

export const dynamic = "force-dynamic";

const VALID_CHANNELS = ["email", "line", "sms"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as any);
    const documentId = (body?.document_id ?? "").trim();
    const channel = (body?.channel ?? "").trim() as Channel;
    const recipient = (body?.recipient ?? "").trim();
    const message = (body?.message ?? "").trim() || undefined;

    if (!documentId) return apiValidationError("document_id は必須です。");
    if (!VALID_CHANNELS.includes(channel))
      return apiValidationError("channel は email, line, sms のいずれかを指定してください。");
    if (!recipient) return apiValidationError("recipient は必須です。");

    // Fetch document
    const { data: doc } = await supabase
      .from("documents")
      .select("id, tenant_id, customer_id, recipient_name, doc_type, doc_number, status, total, created_at, updated_at")
      .eq("id", documentId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!doc) return apiNotFound("帳票が見つかりません。");

    const docType = doc.doc_type as DocType;
    const docLabel = DOC_TYPES[docType]?.label ?? doc.doc_type;

    // Fetch tenant name for email sender
    const { data: tenant } = await supabase.from("tenants").select("name").eq("id", caller.tenantId).single();
    const senderName = tenant?.name ?? "Ledra";

    // Fetch customer name
    let recipientName = doc.recipient_name ?? "";
    if (!recipientName && doc.customer_id) {
      const { data: cust } = await supabase.from("customers").select("name").eq("id", doc.customer_id).single();
      recipientName = cust?.name ?? "";
    }

    // Send via chosen channel
    let success = false;
    let errorMessage: string | undefined;

    try {
      if (channel === "email") {
        success = await sendDocumentEmail({
          to: recipient,
          docType: docLabel,
          docNumber: doc.doc_number,
          totalAmount: doc.total,
          recipientName: recipientName || recipient,
          senderName,
          message,
        });
      } else if (channel === "line") {
        success = await sendDocumentLink({
          tenantId: caller.tenantId,
          lineUserId: recipient,
          docType: docLabel,
          docNumber: doc.doc_number,
          totalAmount: doc.total,
          message,
        });
      } else if (channel === "sms") {
        const smsBody = `【${senderName}】${docLabel} ${doc.doc_number}\n合計: ¥${doc.total.toLocaleString("ja-JP")}${message ? `\n${message}` : ""}`;
        success = await sendSMS(recipient, smsBody);
      }
    } catch (e: any) {
      errorMessage = e?.message ?? String(e);
      success = false;
    }

    // Log the share attempt (non-fatal: table may not exist in all environments)
    try {
      const admin = getAdminClient();
      await admin.from("document_share_log").insert({
        document_id: documentId,
        tenant_id: caller.tenantId,
        channel,
        recipient,
        status: success ? "sent" : "failed",
        error_message: success ? null : (errorMessage ?? "送信に失敗しました"),
        sent_by: caller.userId,
      });
    } catch (logErr) {
      console.error("[document_share] Failed to write share log:", logErr);
    }

    if (!success) {
      return apiInternalError(errorMessage ?? "送信に失敗しました", "document_share");
    }

    // Auto-update status from draft to sent
    let updatedDoc = doc;
    if (doc.status === "draft") {
      const { data: updated } = await supabase
        .from("documents")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", documentId)
        .eq("tenant_id", caller.tenantId)
        .select(
          "id, tenant_id, customer_id, recipient_name, doc_type, doc_number, status, total, created_at, updated_at",
        )
        .single();
      if (updated) updatedDoc = updated;
    }

    return apiOk({ document: updatedDoc, channel, sent: true });
  } catch (e) {
    return apiInternalError(e, "document_share");
  }
}
