import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiNotFound } from "@/lib/api/response";
import { DOC_TYPES, type DocType } from "@/types/document";
import { sendDocumentEmail } from "@/lib/documents/share-email";
import { sendDocumentLink } from "@/lib/line/client";
import { sendSMS } from "@/lib/sms/client";

export const dynamic = "force-dynamic";

const documentShareSchema = z.object({
  document_id: z.string().uuid("document_id は必須です。"),
  channel: z.enum(["email", "line", "sms"], {
    message: "channel は email, line, sms のいずれかを指定してください。",
  }),
  recipient: z.string().trim().min(1, "recipient は必須です。").max(200),
  message: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  idempotency_key: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  // メール送信時のみ有効。他の帳票を同封する場合の追加帳票ID（最大20件）。
  additional_document_ids: z.array(z.string().uuid()).max(20).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = documentShareSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const {
      document_id: documentId,
      channel,
      recipient,
      message,
      idempotency_key: idempotencyKey,
      additional_document_ids: additionalDocumentIdsRaw,
    } = parsed.data;
    // 追加帳票の同封はメール送信時のみ対応（LINE/SMSは単一帳票のまま）
    const additionalDocumentIds = channel === "email" ? (additionalDocumentIdsRaw ?? []) : [];
    const allDocumentIds = [...new Set([documentId, ...additionalDocumentIds])];

    // Fetch document(s)
    const { data: docs } = await supabase
      .from("documents")
      .select("id, tenant_id, customer_id, recipient_name, doc_type, doc_number, status, total, created_at, updated_at")
      .in("id", allDocumentIds)
      .eq("tenant_id", caller.tenantId);

    const doc = docs?.find((d) => d.id === documentId);
    if (!doc) return apiNotFound("帳票が見つかりません。");
    const extraDocs = (docs ?? []).filter((d) => d.id !== documentId);

    const docType = doc.doc_type as DocType;
    const docLabel = DOC_TYPES[docType]?.label ?? doc.doc_type;

    // 冪等キーがある場合は既送信チェック（二重送信防止）
    if (idempotencyKey) {
      try {
        const { admin } = createTenantScopedAdmin(caller.tenantId);
        const { data: existing } = await admin
          .from("document_share_log")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .eq("channel", channel)
          .eq("status", "sent")
          .maybeSingle();

        if (existing) {
          // 既に送信済み — 冪等レスポンスを返してスキップ
          return apiOk({ document: doc, channel, sent: true, idempotent: true });
        }
      } catch (checkErr) {
        console.error("[document_share] idempotency check failed:", checkErr);
        // チェック失敗は致命的ではないので送信処理を継続
      }
    }

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
          additionalDocuments: extraDocs.map((d) => ({
            docType: DOC_TYPES[d.doc_type as DocType]?.label ?? d.doc_type,
            docNumber: d.doc_number,
            totalAmount: d.total,
          })),
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
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      success = false;
    }

    // Log the share attempt for every included document (non-fatal: table may not exist in all environments)
    try {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      await admin.from("document_share_log").insert(
        (docs ?? []).map((d) => ({
          document_id: d.id,
          tenant_id: caller.tenantId,
          channel,
          recipient,
          status: success ? "sent" : "failed",
          error_message: success ? null : (errorMessage ?? "送信に失敗しました"),
          sent_by: caller.userId,
          // 冪等キーは主帳票のみに付与（追加帳票行でのユニーク制約衝突を避ける）
          ...(d.id === documentId && idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
        })),
      );
    } catch (logErr) {
      console.error("[document_share] Failed to write share log:", logErr);
    }

    if (!success) {
      return apiInternalError(errorMessage ?? "送信に失敗しました", "document_share");
    }

    // Auto-update status from draft to sent for every included document
    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const draftIds = (docs ?? []).filter((d) => d.status === "draft").map((d) => d.id);
    let updatedDoc = doc;
    if (draftIds.length > 0) {
      const { admin: adminForUpdate } = createTenantScopedAdmin(caller.tenantId);
      const { data: updated } = await adminForUpdate
        .from("documents")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .in("id", draftIds)
        .eq("tenant_id", caller.tenantId)
        .select(
          "id, tenant_id, customer_id, recipient_name, doc_type, doc_number, status, total, created_at, updated_at",
        );
      const updatedPrimary = updated?.find((d) => d.id === documentId);
      if (updatedPrimary) updatedDoc = updatedPrimary;
    }

    return apiOk({ document: updatedDoc, channel, sent: true, shared_document_ids: allDocumentIds });
  } catch (e) {
    return apiInternalError(e, "document_share");
  }
}
