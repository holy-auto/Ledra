/**
 * POST /api/signature/sign/[token]
 *
 * 署名実行 API（電子署名法第2条の中核実装）。
 * 顧客が署名ページで「署名する」ボタンを押したときに呼び出される。
 *
 * 処理フロー:
 * 1. 同意確認・入力バリデーション
 * 2. トークン検証（有効期限・未使用確認）
 * 3. 署名ペイロードの構築（document_hash + signedAt + email + certId + sessionId）
 * 4. ECDSA P-256 署名の実行（電子署名法第2条第2号：非改ざん性）
 * 5. Supabase への署名証跡記録（電子署名法第2条第1号：本人性）
 * 6. 監査ログ記録
 * 7. PDF 再生成（署名情報埋め込み）※非同期
 * 8. 施工店への完了通知 ※非同期
 */

import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getValidSessionByToken } from "@/lib/signature/session";
import { buildSigningPayload } from "@/lib/signature/hash";
import { signPayload, getPrivateKey, getActiveKeyInfo } from "@/lib/signature/crypto";
import { regenerateSignedPdf } from "@/lib/signature/pdfUtils";
import { escapeHtml } from "@/lib/sanitize";
import type { SignatureSignBody } from "@/lib/signature/types";

export const dynamic = "force-dynamic";

const VERIFY_BASE_URL = process.env.NEXT_PUBLIC_VERIFY_BASE_URL ?? "/verify";

// ── 施工店への署名完了メール通知 ────────────────────────────────────────
async function notifyShopSignatureComplete(params: {
  shopEmail: string;
  shopName: string;
  signerEmail: string;
  signerName: string | null;
  certificateId: string;
  signedAt: string;
  verifyUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return;

  const shop = escapeHtml(params.shopName);
  const signer = escapeHtml(params.signerName ?? params.signerEmail);
  const email = escapeHtml(params.signerEmail);
  const signedAt = escapeHtml(new Date(params.signedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  const verifyUrl = params.verifyUrl;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #0071e3;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">施工証明書への電子署名が完了しました</h2>
      </div>
      <p style="color:#1d1d1f;font-size:14px;">
        ${shop} ご担当者様<br><br>
        以下の顧客が施工証明書への電子署名を完了しました。
      </p>
      <div style="background:#f5f5f7;border-radius:8px;padding:12px;margin:16px 0;font-size:14px;color:#1d1d1f;">
        署名者: <strong>${signer}</strong><br>
        メール: ${email}<br>
        署名日時: <strong>${signedAt}</strong>
      </div>
      <p style="font-size:14px;color:#1d1d1f;">
        <a href="${verifyUrl}" style="color:#0071e3;">署名の検証ページを開く</a>
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra
      </div>
    </div>
  `;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.shopEmail, subject: `[Ledra] 電子署名完了 - ${signer}`, html }),
    });
  } catch (err) {
    console.error("[signature/sign] Shop notification failed:", err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Public signing endpoint — bruteforce protection (10 req / 60s / IP).
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";

  // 1. リクエストボディのバリデーション
  let body: SignatureSignBody;
  try {
    body = await req.json();
  } catch {
    return apiError({ code: "validation_error", message: "リクエストが不正です", status: 400 });
  }

  const { signer_email, agreed } = body;

  if (!agreed) {
    return apiError({ code: "validation_error", message: "内容に同意してください", status: 400 });
  }

  if (!signer_email || !signer_email.includes("@") || signer_email.length > 254) {
    return apiError({ code: "validation_error", message: "有効なメールアドレスを入力してください", status: 400 });
  }

  // 2. セッション検証
  const session = await getValidSessionByToken(token);
  if (!session) {
    return apiError({ code: "not_found", message: "署名リンクが無効または有効期限切れです", status: 404 });
  }

  const supabase = createServiceRoleAdmin("signature flow — opaque token lookup, customer is unauthenticated");
  const signedAt = new Date().toISOString();
  const normalizedEmail = signer_email.toLowerCase().trim();

  // 3. 署名ペイロードの構築
  const signingPayload = buildSigningPayload(
    session.document_hash,
    signedAt,
    normalizedEmail,
    session.certificate_id,
    session.id,
  );

  // 4. ECDSA P-256 署名の実行
  let signature: string;
  let keyInfo: { version: string; fingerprint: string };
  try {
    const privateKey = getPrivateKey();
    signature = signPayload(signingPayload, privateKey);
    keyInfo = getActiveKeyInfo();
  } catch (err) {
    console.error("[signature/sign] Signing failed:", err);
    return apiError({ code: "internal_error", message: "署名処理中にエラーが発生しました", status: 500 });
  }

  // 5. 署名証跡の保存（.eq('status','pending') で二重署名を防止）
  const { error: updateError } = await supabase
    .from("signature_sessions")
    .update({
      status: "signed",
      signed_at: signedAt,
      signer_ip: ip,
      signer_user_agent: ua,
      signer_confirmed_email: normalizedEmail,
      signature,
      signing_payload: signingPayload,
      public_key_fingerprint: keyInfo.fingerprint,
      key_version: keyInfo.version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("status", "pending");

  if (updateError) {
    console.error("[signature/sign] DB update failed:", updateError);
    return apiError({ code: "db_error", message: "署名の保存中にエラーが発生しました", status: 500 });
  }

  // 6. 監査ログ
  await supabase.from("signature_audit_logs").insert({
    session_id: session.id,
    event: "signed",
    ip,
    user_agent: ua,
    metadata: {
      signer_email: normalizedEmail,
      signed_at: signedAt,
      key_version: keyInfo.version,
      public_key_fingerprint: keyInfo.fingerprint,
      document_hash: session.document_hash,
      signature_preview: signature.slice(0, 32) + "...",
    },
  });

  const verifyUrl = `${VERIFY_BASE_URL}/${session.id}`;

  // 7. PDF 再生成（非同期・レスポンスをブロックしない）
  void regenerateSignedPdf(session.certificate_id, {
    signedAt,
    signerEmail: normalizedEmail,
    signerName: session.signer_name ?? undefined,
    signaturePreview: signature.slice(0, 20) + "...",
    publicKeyFingerprint: keyInfo.fingerprint,
    verifyUrl,
    documentHash: session.document_hash,
  });

  // 8. 施工店への完了通知（非同期・テナントの contact_email に送信）
  void (async () => {
    try {
      const { data: cert } = await supabase
        .from("certificates")
        .select("tenant:tenants(name, contact_email)")
        .eq("id", session.certificate_id)
        .single();

      const tenant = cert?.tenant as { name?: string; contact_email?: string | null } | null;
      if (tenant?.contact_email) {
        await notifyShopSignatureComplete({
          shopEmail: tenant.contact_email,
          shopName: tenant.name ?? "Ledra",
          signerEmail: normalizedEmail,
          signerName: session.signer_name ?? null,
          certificateId: session.certificate_id,
          signedAt,
          verifyUrl,
        });
      }
    } catch (err) {
      console.error("[signature/sign] Failed to send shop notification:", err);
    }
  })();

  return apiOk({
    success: true,
    signed_at: signedAt,
    verify_url: verifyUrl,
    session_id: session.id,
    signature_preview: signature.slice(0, 20) + "...",
  });
}
