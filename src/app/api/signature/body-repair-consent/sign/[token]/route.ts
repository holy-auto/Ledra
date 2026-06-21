/**
 * POST /api/signature/body-repair-consent/sign/[token]
 *
 * 車体整備 作業前/変更同意の署名実行 (顧客向け公開エンドポイント)。
 * 受領サイン (delivery-receipt/sign) と同じ二要素認証・ECDSA 署名・
 * Polygon アンカリングを流用する。purpose は estimate_consent / change_consent。
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { signPayload, getPrivateKey, getActiveKeyInfo } from "@/lib/signature/crypto";
import { verifyPhoneLast4, SECONDARY_FACTOR_MAX_ATTEMPTS } from "@/lib/signature/deliveryReceipt";
import { buildBodyRepairConsentPayload, type BodyRepairConsentKind } from "@/lib/signature/bodyRepairConsent";
import { anchorToPolygon } from "@/lib/anchoring/providers/polygon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONSENT_PURPOSES = ["estimate_consent", "change_consent"];

const signSchema = z.object({
  signer_email: z.string().trim().toLowerCase().email("有効なメールアドレスを入力してください").max(254),
  phone_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "登録の電話番号下4桁 (数字 4桁) を入力してください"),
  agreed: z.literal(true, { message: "同意が必要です" }),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { token } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    const parsed = signSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiError({
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "invalid payload",
        status: 400,
      });
    }
    const { signer_email, phone_last4 } = parsed.data;

    const admin = createServiceRoleAdmin("body-repair consent sign — opaque token lookup, customer is unauthenticated");

    const { data: session, error: sessErr } = await admin
      .from("signature_sessions")
      .select("*, body_repair_consents ( id, kind, body_repair_job_id )")
      .eq("token", token)
      .in("purpose", CONSENT_PURPOSES)
      .single();

    if (sessErr || !session) {
      return apiError({ code: "not_found", message: "同意サインリンクが無効です", status: 404 });
    }

    const consentRaw = session.body_repair_consents as unknown;
    const consent = (Array.isArray(consentRaw) ? consentRaw[0] : consentRaw) as {
      id: string;
      kind: BodyRepairConsentKind;
      body_repair_job_id: string;
    } | null;
    if (!consent) {
      return apiError({ code: "internal_error", message: "同意レコードが見つかりません", status: 500 });
    }

    if (session.status !== "pending") {
      return apiError({
        code: "conflict",
        message:
          session.status === "signed" ? "この同意はすでに署名されています" : "同意サインリンクが無効または期限切れです",
        status: 409,
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      await admin.from("signature_sessions").update({ status: "expired" }).eq("id", session.id);
      await admin.from("body_repair_consents").update({ status: "expired" }).eq("signature_session_id", session.id);
      return apiError({ code: "not_found", message: "同意サインリンクの有効期限が切れています", status: 404 });
    }

    // ── 二要素認証: 電話番号下4桁 ──
    if (!session.phone_last4_hash) {
      return apiError({ code: "internal_error", message: "本人確認情報が見つかりません", status: 500 });
    }

    const factorResult = verifyPhoneLast4({
      tenantId: session.tenant_id,
      storedHash: session.phone_last4_hash,
      input: phone_last4,
      attemptsSoFar: session.secondary_factor_attempts ?? 0,
    });

    if (!factorResult.ok) {
      const newAttempts =
        factorResult.reason === "mismatch" ? factorResult.attempts : (session.secondary_factor_attempts ?? 0);
      await admin.from("signature_sessions").update({ secondary_factor_attempts: newAttempts }).eq("id", session.id);
      await admin.from("signature_audit_logs").insert({
        session_id: session.id,
        event: "secondary_factor_failed",
        ip,
        user_agent: ua,
        metadata: { reason: factorResult.reason, attempts: newAttempts },
      });

      if (factorResult.reason === "locked" || newAttempts >= SECONDARY_FACTOR_MAX_ATTEMPTS) {
        const cancelledAt = new Date().toISOString();
        await admin
          .from("signature_sessions")
          .update({ status: "cancelled", cancelled_at: cancelledAt, cancel_reason: "secondary_factor_locked" })
          .eq("id", session.id);
        await admin.from("body_repair_consents").update({ status: "cancelled" }).eq("signature_session_id", session.id);
        await admin.from("signature_audit_logs").insert({
          session_id: session.id,
          event: "secondary_factor_locked",
          ip,
          user_agent: ua,
          metadata: { attempts: newAttempts },
        });
        return apiError({
          code: "forbidden",
          message: "本人確認の試行回数を超えました。施工店にリンクの再発行を依頼してください。",
          status: 403,
        });
      }

      return apiError({
        code: "forbidden",
        message:
          factorResult.reason === "invalid_format"
            ? "電話番号下4桁は数字 4桁で入力してください"
            : `本人確認に失敗しました (残り ${SECONDARY_FACTOR_MAX_ATTEMPTS - newAttempts} 回)`,
        status: 403,
      });
    }

    await admin.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "secondary_factor_passed",
      ip,
      user_agent: ua,
      metadata: { method: "phone_last4" },
    });

    // ── 署名 ──
    const signedAt = new Date().toISOString();
    const consentVersion = session.consent_version ?? "body-repair-consent-v1";
    const consentTextHash = session.consent_text_hash ?? "";

    const signingPayload = buildBodyRepairConsentPayload({
      documentHash: session.document_hash,
      signedAt,
      signerEmail: signer_email,
      phoneLast4Hash: session.phone_last4_hash,
      consentVersion,
      consentTextHash,
      kind: consent.kind,
      bodyRepairJobId: consent.body_repair_job_id,
      sessionId: session.id,
    });

    let signature: string;
    let keyInfo: { version: string; fingerprint: string };
    try {
      signature = signPayload(signingPayload, getPrivateKey());
      keyInfo = getActiveKeyInfo();
    } catch (err) {
      console.error("[body-repair-consent/sign] signing failed:", err);
      return apiError({ code: "internal_error", message: "署名処理中にエラーが発生しました", status: 500 });
    }

    const { error: updateErr } = await admin
      .from("signature_sessions")
      .update({
        status: "signed",
        signed_at: signedAt,
        signer_ip: ip,
        signer_user_agent: ua,
        signer_confirmed_email: signer_email,
        signature,
        signing_payload: signingPayload,
        public_key_fingerprint: keyInfo.fingerprint,
        key_version: keyInfo.version,
        secondary_factor_verified: true,
        updated_at: signedAt,
      })
      .eq("id", session.id)
      .eq("status", "pending");

    if (updateErr) {
      return apiError({ code: "db_error", message: "署名の保存中にエラーが発生しました", status: 500 });
    }

    await admin
      .from("body_repair_consents")
      .update({ status: "signed", signed_at: signedAt })
      .eq("signature_session_id", session.id);

    await admin.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "signed",
      ip,
      user_agent: ua,
      metadata: {
        purpose: session.purpose,
        kind: consent.kind,
        body_repair_job_id: consent.body_repair_job_id,
        signer_email,
        signed_at: signedAt,
        key_version: keyInfo.version,
        public_key_fingerprint: keyInfo.fingerprint,
        consent_version: consentVersion,
        consent_text_hash: consentTextHash,
        document_hash: session.document_hash,
        signature_preview: signature.slice(0, 32) + "...",
      },
    });

    // Polygon アンカリング (非同期)
    void (async () => {
      try {
        const result = await anchorToPolygon(session.document_hash);
        if (result.anchored && result.txHash) {
          await admin.from("signature_audit_logs").insert({
            session_id: session.id,
            event: "receipt_anchored",
            metadata: { tx_hash: result.txHash, network: result.network },
          });
        }
      } catch (err) {
        console.error("[body-repair-consent/sign] anchoring failed:", err);
      }
    })();

    return apiOk({
      success: true,
      signed_at: signedAt,
      kind: consent.kind,
      signature_preview: signature.slice(0, 20) + "...",
      consent_version: consentVersion,
    });
  } catch (e) {
    return apiInternalError(e, "signature/body-repair-consent/sign");
  }
}
