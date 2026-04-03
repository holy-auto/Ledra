import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/api/auth";
import { verifyWebhookSignature, downloadSignedPdf } from "@/lib/agent/cloudsign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/cloudsign
 * CloudSign webhook handler for document status updates.
 *
 * @deprecated
 * このエンドポイントは agent_signing_requests（エージェント契約書/NDA）専用です。
 * 施工証明書（certificates）への顧客電子署名は Ledra 自前実装に完全移行しました:
 *   - 署名依頼 API:   POST /api/signature/request
 *   - 署名実行 API:   POST /api/signature/sign/[token]
 *   - 署名検証 API:   GET  /api/signature/verify/[sessionId]
 *   - 署名ページ:     /sign/[token]
 *   - 検証ページ:     /verify/[sessionId]
 *
 * CloudSign を完全廃止する場合は、agent_signing_requests の全レコードを
 * 新スキーマに移行した後、このファイルと src/lib/agent/cloudsign.ts を削除する。
 *
 * Events:
 *   - document.signed  → Download PDF, store, update status
 *   - document.viewed  → Update status to viewed
 *   - document.rejected → Update status + rejection_reason
 *   - document.expired → Update status to expired
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-cloudsign-signature") ?? "";

    // Verify webhook signature
    const valid = await verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      console.error("[cloudsign-webhook] Invalid signature");
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type as string;
    const documentId = event.data?.document_id as string;

    if (!documentId) {
      return NextResponse.json({ error: "missing_document_id" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Find the signing request by CloudSign document ID
    const { data: record, error: findErr } = await admin
      .from("agent_signing_requests")
      .select("id, agent_id, title, status")
      .eq("cloudsign_document_id", documentId)
      .single();

    if (findErr || !record) {
      console.warn("[cloudsign-webhook] No matching signing request for document:", documentId);
      // Return 200 to acknowledge receipt (avoid retries for unknown documents)
      return NextResponse.json({ ok: true, skipped: true });
    }

    switch (eventType) {
      case "document.signed": {
        // Download signed PDF and store in Supabase Storage
        try {
          const pdfBuffer = await downloadSignedPdf(documentId);
          const safeName = record.title.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${record.agent_id}/signed/${record.id}_${safeName}.pdf`;

          await admin.storage
            .from("agent-shared-files")
            .upload(storagePath, pdfBuffer, {
              contentType: "application/pdf",
              upsert: true,
            });

          await admin
            .from("agent_signing_requests")
            .update({
              status: "signed",
              signed_at: new Date().toISOString(),
              signed_pdf_path: storagePath,
            })
            .eq("id", record.id);
        } catch (e) {
          console.error("[cloudsign-webhook] Failed to process signed PDF:", e);
          // Still update status even if PDF download fails
          await admin
            .from("agent_signing_requests")
            .update({
              status: "signed",
              signed_at: new Date().toISOString(),
            })
            .eq("id", record.id);
        }
        break;
      }

      case "document.viewed": {
        // Only update if still in "sent" status
        if (record.status === "sent") {
          await admin
            .from("agent_signing_requests")
            .update({ status: "viewed" })
            .eq("id", record.id);
        }
        break;
      }

      case "document.rejected": {
        const reason = event.data?.rejection_reason ?? "";
        await admin
          .from("agent_signing_requests")
          .update({
            status: "rejected",
            rejection_reason: reason,
          })
          .eq("id", record.id);
        break;
      }

      case "document.expired": {
        await admin
          .from("agent_signing_requests")
          .update({ status: "expired" })
          .eq("id", record.id);
        break;
      }

      default:
        console.info("[cloudsign-webhook] Unhandled event type:", eventType);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[cloudsign-webhook] Error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
