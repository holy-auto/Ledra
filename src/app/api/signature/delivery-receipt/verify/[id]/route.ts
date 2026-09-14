/**
 * GET /api/signature/delivery-receipt/verify/[id]
 *
 * 受領サインの第三者検証 API (公開エンドポイント)。
 * delivery_receipts.id を受け取り、紐付く signature_sessions の
 * 暗号署名を ECDSA P-256 で検証する。
 *
 * Polygon アンカリング情報があれば返却し、検証ページから
 * ブロックチェーン上の存在証明にもアクセスできるようにする。
 */

import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { verifySignature } from "@/lib/signature/crypto";
import { buildExplorerUrl } from "@/lib/anchoring/providers/polygon";

export const dynamic = "force-dynamic";

function maskEmail(email: string | null): string {
  if (!email) return "***";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = Math.min(2, local.length);
  return local.slice(0, visible) + "***" + domain;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const { id } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    const supabase = createServiceRoleAdmin("delivery receipt verify — public verification endpoint");

    const { data: receipt, error } = await supabase
      .from("delivery_receipts")
      .select(
        `
        id,
        status,
        signed_at,
        anchor_tx_hash,
        anchored_at,
        receipt_payload_json,
        signature_sessions:signature_sessions(
          id,
          status,
          document_hash,
          document_hash_alg,
          signed_at,
          signer_confirmed_email,
          signature,
          signing_payload,
          public_key_fingerprint,
          key_version,
          consent_version,
          consent_text_hash,
          purpose
        ),
        certificates:certificates(public_id)
      `,
      )
      .eq("id", id)
      .single();

    if (error || !receipt) {
      return apiError({ code: "not_found", message: "受領サインが見つかりません", status: 404 });
    }

    type SessionShape = {
      id: string;
      status: string;
      document_hash: string;
      document_hash_alg: string;
      signed_at: string | null;
      signer_confirmed_email: string | null;
      signature: string | null;
      signing_payload: string | null;
      public_key_fingerprint: string | null;
      key_version: string | null;
      consent_version: string | null;
      consent_text_hash: string | null;
      purpose: string;
    };
    const sessRaw = receipt.signature_sessions as unknown as SessionShape | SessionShape[] | null;
    const sess: SessionShape | null = Array.isArray(sessRaw) ? (sessRaw[0] ?? null) : sessRaw;

    if (!sess || sess.purpose !== "delivery_receipt") {
      return apiError({ code: "not_found", message: "受領サインが見つかりません", status: 404 });
    }

    if (sess.status !== "signed") {
      return apiOk({
        is_valid: false,
        status: sess.status,
        message: sess.status === "pending" ? "この受領サインはまだ署名されていません" : "無効な受領サインです",
        verified_at: new Date().toISOString(),
      });
    }

    // 公開鍵取得
    const { data: keyRecord } = await supabase
      .from("signature_public_keys")
      .select("public_key, fingerprint")
      .eq("key_version", sess.key_version)
      .single();

    if (!keyRecord) {
      return apiError({ code: "internal_error", message: "検証鍵が見つかりません", status: 500 });
    }

    const isValid = verifySignature(sess.signing_payload ?? "", sess.signature ?? "", keyRecord.public_key);

    await supabase.from("signature_audit_logs").insert({
      session_id: sess.id,
      event: "verified",
      ip,
      user_agent: ua,
      metadata: { is_valid: isValid, purpose: "delivery_receipt", verified_at: new Date().toISOString() },
    });

    const cert = receipt.certificates as { public_id?: string | null } | Array<{ public_id?: string | null }> | null;
    const certPublicId: string | null = Array.isArray(cert) ? (cert[0]?.public_id ?? null) : (cert?.public_id ?? null);

    // Polygon ネットワーク (write 設定を使う - 受領サインは作成時点のネットワークと同一)
    const polygonNetwork = (process.env.POLYGON_NETWORK?.toLowerCase() === "amoy" ? "amoy" : "polygon") as
      "polygon" | "amoy";
    const explorerUrl = buildExplorerUrl(receipt.anchor_tx_hash, polygonNetwork);

    return apiOk({
      is_valid: isValid,
      status: sess.status,
      message: isValid ? "この受領サインは有効です" : "署名が無効です。受領内容が改ざんされている可能性があります",
      receipt: {
        id: receipt.id,
        signed_at: receipt.signed_at,
        signer_email_masked: maskEmail(sess.signer_confirmed_email),
        document_hash: sess.document_hash,
        document_hash_alg: sess.document_hash_alg,
        public_key_fingerprint: sess.public_key_fingerprint,
        key_version: sess.key_version,
        consent_version: sess.consent_version,
        consent_text_hash: sess.consent_text_hash,
      },
      anchor: receipt.anchor_tx_hash
        ? {
            tx_hash: receipt.anchor_tx_hash,
            anchored_at: receipt.anchored_at,
            explorer_url: explorerUrl,
          }
        : null,
      certificate: certPublicId ? { public_id: certPublicId } : null,
      verified_at: new Date().toISOString(),
    });
  } catch (e) {
    return apiInternalError(e, "signature/delivery-receipt/verify");
  }
}
