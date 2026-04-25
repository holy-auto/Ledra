/**
 * POST /api/signature/request
 *
 * 署名依頼の作成 API。
 * 施工店（管理画面）から呼び出し、顧客への署名URLを発行する。
 *
 * 処理フロー:
 * 1. 認証・課金チェック
 * 2. 証明書の存在確認（テナント境界チェック）
 * 3. 既存 pending セッションの重複チェック
 * 4. PDF バイト列生成（SHA-256 計算用）
 * 5. 署名セッション作成（ワンタイムURL発行）
 * 6. LINE/メール通知送信
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createSignatureSession, getExistingPendingSession } from "@/lib/signature/session";
import { generateCertificatePdfBytes } from "@/lib/signature/pdfUtils";
import { escapeHtml } from "@/lib/sanitize";

const signatureRequestSchema = z.object({
  certificate_id: z.string().uuid("certificate_id は必須です"),
  signer_name: z.string().trim().max(100).optional(),
  signer_email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  signer_phone: z.string().trim().max(40).optional(),
  notification_method: z.enum(["line", "email", "sms"]).optional(),
});

async function sendSignatureRequestEmail(params: {
  to: string;
  signerName: string | null;
  shopName: string;
  signUrl: string;
  expiresAt: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return;

  const name = escapeHtml(params.signerName ?? "お客様");
  const shop = escapeHtml(params.shopName);
  const signUrl = params.signUrl;
  const expires = escapeHtml(new Date(params.expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #0071e3;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">施工証明書への電子署名のお願い</h2>
      </div>
      <p style="color:#1d1d1f;font-size:14px;">
        ${name} 様<br><br>
        ${shop}より施工証明書への電子署名をお願いしております。<br>
        以下のボタンから署名をお願いいたします。
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${signUrl}" style="background:#0071e3;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
          電子署名を行う
        </a>
      </div>
      <p style="font-size:13px;color:#86868b;">
        有効期限: ${expires}<br>
        このリンクは1回のみ有効です。
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
      body: JSON.stringify({ from, to: params.to, subject: `[${shop}] 施工証明書への電子署名のお願い`, html }),
    });
  } catch (err) {
    console.error("[signature/request] Email send failed:", err);
  }
}

export const dynamic = "force-dynamic";

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_SIGN_BASE_URL ?? "/sign";

export async function POST(req: NextRequest) {
  // Tighter limit than middleware (300/min). Each call generates a PDF
  // (CPU + memory) and sends an email via Resend (cost). 10/min per IP is
  // generous for normal staff workflow but bounds blast radius if a session
  // cookie leaks.
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  // 1. 認証チェック
  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const parsed = signatureRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { certificate_id, signer_name, signer_email, signer_phone, notification_method } = parsed.data;

  // 2. 証明書の存在確認・テナント境界チェック
  const { data: cert, error: certError } = await supabase
    .from("certificates")
    .select("id, tenant_id, public_id")
    .eq("id", certificate_id)
    .eq("tenant_id", caller.tenantId)
    .single();

  if (certError || !cert) {
    return apiError({
      code: "not_found",
      message: "証明書が見つからないか、アクセス権がありません",
      status: 404,
    });
  }

  // 3. 既存の有効な pending セッションがあれば再利用（重複リクエスト防止）
  const existing = await getExistingPendingSession(certificate_id);
  if (existing) {
    const signUrl = `${SIGN_BASE_URL}/${existing.token}`;
    return apiOk({
      session_id: existing.id,
      sign_url: signUrl,
      expires_at: existing.expires_at,
      is_existing: true,
      message: "有効な署名依頼がすでに存在します",
    });
  }

  // 4. PDF バイト列の生成（SHA-256 計算用）
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateCertificatePdfBytes(certificate_id);
  } catch (err) {
    console.error("[signature/request] PDF generation failed:", err);
    return apiError({
      code: "internal_error",
      message: "PDF の生成に失敗しました",
      status: 500,
    });
  }

  // 5. 署名セッションの作成
  let session;
  try {
    session = await createSignatureSession({
      certificate_id,
      tenant_id: caller.tenantId,
      created_by: caller.userId,
      signer_name: signer_name,
      signer_email: signer_email,
      signer_phone: signer_phone,
      notification_method: notification_method ?? "line",
      pdf_bytes: pdfBytes,
    });
  } catch (err) {
    console.error("[signature/request] Session creation failed:", err);
    return apiError({
      code: "db_error",
      message: "署名セッションの作成に失敗しました",
      status: 500,
    });
  }

  const signUrl = `${SIGN_BASE_URL}/${session.token}`;

  // 6. 署名者へメール通知（signer_email が指定されている場合）
  let notified = false;
  if (signer_email) {
    // テナント名を取得して送信者名として使用
    const { data: tenant } = await supabase.from("tenants").select("name").eq("id", caller.tenantId).single();

    void sendSignatureRequestEmail({
      to: signer_email,
      signerName: signer_name ?? null,
      shopName: tenant?.name ?? "Ledra",
      signUrl,
      expiresAt: session.expires_at,
    });
    notified = true;
  }

  return apiOk({
    session_id: session.id,
    sign_url: signUrl,
    expires_at: session.expires_at,
    notified,
  });
}
