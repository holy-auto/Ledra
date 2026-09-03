import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiValidationError,
  apiInternalError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { DOC_TYPES, type DocType } from "@/types/document";
import { sendDocumentEmail } from "@/lib/documents/share-email";
import { sendDocumentLink } from "@/lib/line/client";
import { sendSMS } from "@/lib/sms/client";
import { sealDocumentById } from "@/lib/documents/documentSeal";
import { renderAndStoreDocumentPdf } from "@/lib/documents/pdfShare";
import { afterOrInline } from "@/lib/http/afterOrInline";

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
  // メール送信時のみ有効。他の帳票を同封する場合の追加帳票ID。
  // ponytail: 20件は暫定上限（1通のメールが肥大化しすぎない程度の目安）。
  // 上限を上げる場合はメール本文のテーブル表示とUI側のチェックリストも合わせて見直すこと。
  additional_document_ids: z.array(z.string().uuid()).max(20).optional(),
});

/**
 * GET /api/admin/documents/share?document_id=<uuid>
 * 指定帳票の送付履歴（document_share_log）を新しい順で返す。
 * 送付ログは service role でのみ書き込む（RLS ポリシー無し）ため、読み出しも
 * テナントスコープの admin クライアントで tenant_id を明示して絞る。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const documentId = new URL(req.url).searchParams.get("document_id");
    if (!documentId || !z.string().uuid().safeParse(documentId).success) {
      return apiValidationError("document_id は必須です。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("document_share_log")
      .select("id, channel, recipient, sent_at, status, error_message")
      .eq("document_id", documentId)
      .eq("tenant_id", caller.tenantId)
      .order("sent_at", { ascending: false })
      // ponytail: 履歴表示は最新100件で頭打ち（ページングなし）。1帳票の送付回数は
      // 通常わずかなので十分。再送を大量に繰り返す運用が出たらページング追加を検討。
      .limit(100);

    if (error) return apiInternalError(error, "document_share_history");
    return apiOk({ shares: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "document_share_history");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 帳票の顧客送付は staff 以上（2026-09-03 代表判断）。見積書・請求書を送るのは
    // 現場の通常業務。マトリクスに送付の動詞が無いのでロール下限で守る。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

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
    const additionalDocumentIds = [...new Set(channel === "email" ? (additionalDocumentIdsRaw ?? []) : [])].filter(
      (id) => id !== documentId,
    );

    const selectCols =
      "id, tenant_id, customer_id, recipient_name, doc_type, doc_number, status, total, created_at, updated_at";

    // Fetch primary document
    const { data: doc } = await supabase
      .from("documents")
      .select(selectCols)
      .eq("id", documentId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!doc) return apiNotFound("帳票が見つかりません。");

    // 追加帳票は主帳票と同じ顧客の「未送付（下書き）」のものだけを許可する
    // （他顧客の帳票詳細が誤って同封・メール送信されるのを防ぐのに加え、
    // 既に送付済みの帳票を誤って二重送付しないよう status=draft のみに絞る）。
    // 主帳票に顧客が紐付いていない場合は同封不可。
    let extraDocs: NonNullable<typeof doc>[] = [];
    if (additionalDocumentIds.length > 0 && doc.customer_id) {
      const { data: extras } = await supabase
        .from("documents")
        .select(selectCols)
        .in("id", additionalDocumentIds)
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", doc.customer_id)
        .eq("status", "draft");
      extraDocs = extras ?? [];
    }
    const docs = [doc, ...extraDocs];

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

    // 主帳票の PDF をレンダリングして共有 URL を発行する (顧客が LINE/メール/SMS から
    // 開けるようにするため)。生成失敗は致命的ではないので null のまま本文だけ送る (fail-soft)。
    const pdfUrl = (await renderAndStoreDocumentPdf(caller.tenantId, documentId)) ?? undefined;

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
          pdfUrl,
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
          pdfUrl,
        });
      } else if (channel === "sms") {
        const smsBody = `【${senderName}】${docLabel} ${doc.doc_number}\n合計: ¥${doc.total.toLocaleString("ja-JP")}${message ? `\n${message}` : ""}${pdfUrl ? `\nPDF: ${pdfUrl}` : ""}`;
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
          // ponytail: 冪等キーは主帳票のみに付与（追加帳票行でのユニーク制約衝突を避ける）。
          // 上限: 同一キーでのリトライは追加帳票側のログ重複を防げない。追加帳票ごとに
          // 一意なキーを持たせるか document_id を含めた複合キーにするのが本来の直し方。
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

      // 電帳法「真実性の確保」: 共有送付で draft→sent 確定した各帳票にも封印を付ける
      // （PUT / POST と同じ第3の確定パス。id 起点で読み直して封印する best-effort）。
      afterOrInline(async () => {
        for (const id of draftIds) {
          try {
            await sealDocumentById(adminForUpdate, caller.tenantId, id);
          } catch (sealErr) {
            console.error("document_share: integrity seal failed (non-blocking)", sealErr);
          }
        }
      });
    }

    return apiOk({
      document: updatedDoc,
      channel,
      sent: true,
      shared_document_ids: docs.map((d) => d.id),
    });
  } catch (e) {
    return apiInternalError(e, "document_share");
  }
}
