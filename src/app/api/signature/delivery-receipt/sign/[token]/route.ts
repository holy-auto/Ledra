/**
 * POST /api/signature/delivery-receipt/sign/[token]
 *
 * 受領サインの実行 API (顧客向け公開エンドポイント)。
 *
 * 法的強度を高めるため、以下を必須とする:
 *   1. 同意文言 (CONSENT_VERSION) への明示同意
 *   2. メールアドレス確認 (証跡として記録)
 *   3. 二要素認証: 登録時の電話番号下4桁の照合
 *      → 失敗が SECONDARY_FACTOR_MAX_ATTEMPTS 回を超えるとセッションを cancel
 *
 * 署名ペイロード v2 (buildDeliveryReceiptPayload) は document_hash + signed_at +
 * signer_email + phone_last4_hash + consent_version + consent_text_hash +
 * certificate_id + session_id を含み、
 * 「誰が」「いつ」「何に対して」「どの文言で」「どの本人確認手段で」同意したかを
 * 暗号的に binding する。
 *
 * 署名後、Polygon ブロックチェーンへ document_hash をアンカリング (時刻証明) する。
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { signPayloadWithProvider } from "@/lib/signature/signer";
import {
  buildDeliveryReceiptPayload,
  computeConsentTextHash,
  verifyPhoneLast4,
  SECONDARY_FACTOR_MAX_ATTEMPTS,
  type ReceiptPayloadSnapshot,
} from "@/lib/signature/deliveryReceipt";
import { anchorToPolygon } from "@/lib/anchoring/providers/polygon";

export const dynamic = "force-dynamic";

// 受領サインの検証ページは証明書本体の検証ページ (signature_sessions.id 起点) と
// 別物のため、URL prefix を分けておく。検証 API は delivery_receipts.id を ID 引数に取る。
const VERIFY_RECEIPT_BASE_URL = process.env.NEXT_PUBLIC_RECEIPT_VERIFY_BASE_URL ?? "/verify/receipt";

const signSchema = z.object({
  signer_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("有効なメールアドレスを入力してください")
    .max(254, "有効なメールアドレスを入力してください"),
  phone_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "登録の電話番号下4桁 (数字 4桁) を入力してください"),
  agreed: z.literal(true, { message: "同意が必要です" }),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // 公開エンドポイント - bruteforce 対策 (10/min/IP)
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

    const admin = createServiceRoleAdmin("delivery receipt sign — opaque token lookup, customer is unauthenticated");

    // セッション取得 (purpose='delivery_receipt' に限定)
    const { data: session, error: sessErr } = await admin
      .from("signature_sessions")
      .select("*")
      .eq("token", token)
      .eq("purpose", "delivery_receipt")
      .single();

    if (sessErr || !session) {
      return apiError({ code: "not_found", message: "受領サインリンクが無効です", status: 404 });
    }

    if (session.status !== "pending") {
      return apiError({
        code: "conflict",
        message:
          session.status === "signed"
            ? "この受領サインはすでに署名されています"
            : "受領サインリンクが無効または期限切れです",
        status: 409,
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      await admin.from("signature_sessions").update({ status: "expired" }).eq("id", session.id);
      return apiError({ code: "not_found", message: "受領サインリンクの有効期限が切れています", status: 404 });
    }

    // ── 二要素認証: 電話番号下4桁の照合 ──────────────────────
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
      // 試行回数を更新
      const newAttempts =
        factorResult.reason === "mismatch" ? factorResult.attempts : (session.secondary_factor_attempts ?? 0);
      await admin.from("signature_sessions").update({ secondary_factor_attempts: newAttempts }).eq("id", session.id);

      // 監査ログ
      await admin.from("signature_audit_logs").insert({
        session_id: session.id,
        event: "secondary_factor_failed",
        ip,
        user_agent: ua,
        metadata: { reason: factorResult.reason, attempts: newAttempts },
      });

      // 上限超過 → セッションをキャンセル
      if (factorResult.reason === "locked" || newAttempts >= SECONDARY_FACTOR_MAX_ATTEMPTS) {
        await admin
          .from("signature_sessions")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: "secondary_factor_locked",
          })
          .eq("id", session.id);
        await admin
          .from("delivery_receipts")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: "secondary_factor_locked",
          })
          .eq("signature_session_id", session.id);
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

    // 二要素認証 OK - 監査ログ
    await admin.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "secondary_factor_passed",
      ip,
      user_agent: ua,
      metadata: { method: "phone_last4" },
    });

    // ── 署名ペイロード構築 + 署名実行 ─────────────────────────
    const signedAt = new Date().toISOString();
    const consentTextHash = session.consent_text_hash ?? computeConsentTextHash();
    const consentVersion = session.consent_version ?? "delivery-receipt-v1";

    const signingPayload = buildDeliveryReceiptPayload({
      documentHash: session.document_hash,
      signedAt,
      signerEmail: signer_email,
      phoneLast4Hash: session.phone_last4_hash,
      consentVersion,
      consentTextHash,
      certificateId: session.certificate_id,
      sessionId: session.id,
    });

    let signature: string;
    let keyInfo: { version: string; fingerprint: string };
    try {
      // 署名器抽象(SIGNER_PROVIDER=local 既定 / aws-kms で KMS)。既定は現行と同一挙動。
      const signed = await signPayloadWithProvider(signingPayload);
      signature = signed.signature;
      keyInfo = { version: signed.keyVersion, fingerprint: signed.publicKeyFingerprint };
    } catch (err) {
      console.error("[delivery-receipt/sign] signing failed:", err);
      return apiError({ code: "internal_error", message: "署名処理中にエラーが発生しました", status: 500 });
    }

    // signature_sessions 更新 (二重署名防止のため status='pending' フィルタ)
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("status", "pending");

    if (updateErr) {
      console.error("[delivery-receipt/sign] DB update failed:", updateErr);
      return apiError({ code: "db_error", message: "署名の保存中にエラーが発生しました", status: 500 });
    }

    // delivery_receipts 更新 + receipt_payload_json に signed_at を追記
    const { data: receiptRow } = await admin
      .from("delivery_receipts")
      .select("id, receipt_payload_json")
      .eq("signature_session_id", session.id)
      .single();

    const updatedPayload: ReceiptPayloadSnapshot = {
      ...(receiptRow?.receipt_payload_json as Omit<ReceiptPayloadSnapshot, "signed_at">),
      signed_at: signedAt,
    };

    await admin
      .from("delivery_receipts")
      .update({
        status: "signed",
        signed_at: signedAt,
        receipt_payload_json: updatedPayload,
        device_fingerprint_json: { ip, user_agent: ua },
      })
      .eq("signature_session_id", session.id);

    // certificates.delivery_acknowledged_at を更新
    await admin.from("certificates").update({ delivery_acknowledged_at: signedAt }).eq("id", session.certificate_id);

    // 案件サインオフ・ワークフロー由来なら予約側を「署名済み」に遷移させる。
    // これで案件画面のパイプラインがサイン完了を認識する。
    if (session.reservation_id) {
      await admin
        .from("reservations")
        .update({ signoff_status: "signed", signed_off_at: signedAt })
        .eq("id", session.reservation_id)
        .eq("tenant_id", session.tenant_id);
    }

    // 監査ログ
    await admin.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "signed",
      ip,
      user_agent: ua,
      metadata: {
        purpose: "delivery_receipt",
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

    // verify_url は delivery_receipts.id を使う (検証 API
    // /api/signature/delivery-receipt/verify/[id] が delivery_receipts.id で
    // 解決するため。session.id は誤り)。受領レコードは sign 開始時点で必ず
    // 作成されているはずなので、見つからない場合はデータ整合性異常として 500。
    if (!receiptRow?.id) {
      console.error("[delivery-receipt/sign] missing delivery_receipts row for session", session.id);
      return apiError({ code: "internal_error", message: "受領レコードが見つかりません", status: 500 });
    }
    const verifyUrl = `${VERIFY_RECEIPT_BASE_URL}/${receiptRow.id}`;

    // Polygon アンカリング (非同期 - レスポンスをブロックしない)
    void (async () => {
      try {
        const result = await anchorToPolygon(session.document_hash);
        if (result.anchored && result.txHash) {
          await admin
            .from("delivery_receipts")
            .update({ anchor_tx_hash: result.txHash, anchored_at: new Date().toISOString() })
            .eq("signature_session_id", session.id);
          await admin.from("signature_audit_logs").insert({
            session_id: session.id,
            event: "receipt_anchored",
            metadata: { tx_hash: result.txHash, network: result.network },
          });
        }
      } catch (err) {
        console.error("[delivery-receipt/sign] anchoring failed:", err);
      }
    })();

    return apiOk({
      success: true,
      signed_at: signedAt,
      verify_url: verifyUrl,
      session_id: session.id,
      signature_preview: signature.slice(0, 20) + "...",
      consent_version: consentVersion,
    });
  } catch (e) {
    return apiInternalError(e, "signature/delivery-receipt/sign");
  }
}
