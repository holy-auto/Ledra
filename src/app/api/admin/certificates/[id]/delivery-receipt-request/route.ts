/**
 * POST /api/admin/certificates/[id]/delivery-receipt-request
 *
 * 作業完了後の受領サイン依頼を作成する。
 * 店舗側 (テナント管理画面) から呼び出し、顧客への受領サイン URL を発行する。
 *
 * 既存の証明書本体への署名 (/api/signature/request) とは別フローで、
 * 受領サイン専用の signature_sessions (purpose='delivery_receipt') と
 * delivery_receipts レコードを作成する。
 *
 * 処理フロー:
 *   1. 認証 + テナント境界チェック
 *   2. 証明書の存在確認
 *   3. 既存 pending な受領サインがあれば再利用 (idempotent)
 *   4. 証明書 PDF の SHA-256 計算 (改ざん検知のアンカー)
 *   5. signature_sessions (purpose='delivery_receipt') 作成
 *   6. delivery_receipts レコード作成 (受領内容スナップショット)
 *   7. 受領サイン URL をメール送信
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiError, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { computeDocumentHash } from "@/lib/signature/hash";
import { generateCertificatePdfBytes } from "@/lib/signature/pdfUtils";
import { CONSENT_VERSION, computeConsentTextHash, type ReceiptPayloadSnapshot } from "@/lib/signature/deliveryReceipt";
import { escapeHtml } from "@/lib/sanitize";
import { sendEmail } from "@/lib/email/sendEmail";

export const dynamic = "force-dynamic";

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_SIGN_BASE_URL ?? "/sign";
const RECEIPT_SIGN_PATH = `${SIGN_BASE_URL}/receipt`;
const EXPIRES_HOURS = Number(process.env.SIGNATURE_SESSION_EXPIRES_HOURS ?? 72);

const requestSchema = z.object({
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
});

async function sendDeliveryReceiptEmail(params: {
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
  const expires = escapeHtml(new Date(params.expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #0071e3;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">作業完了のご確認 (受領サインのお願い)</h2>
      </div>
      <p style="color:#1d1d1f;font-size:14px;">
        ${name} 様<br><br>
        ${shop} です。本日のお預かり作業が完了いたしました。<br>
        内容をご確認の上、受領サイン (電子署名) をお願いいたします。
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${params.signUrl}" style="background:#0071e3;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
          受領サインを行う
        </a>
      </div>
      <p style="font-size:13px;color:#86868b;">
        ご本人確認のため、ご登録の電話番号下4桁の入力が必要です。<br>
        有効期限: ${expires}<br>
        このリンクは1回のみ有効です。
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra
      </div>
    </div>
  `;

  try {
    await sendEmail({ from, to: params.to, subject: `[${shop}] 作業完了 — 受領サインのお願い`, html });
  } catch (err) {
    console.error("[delivery-receipt/request] Email send failed:", err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // PDF 生成 + メール送信 + DB 書き込みのため auth プリセット (10/min) を採用
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: certificateId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(certificateId)) {
      return apiValidationError("certificate_id が不正です");
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { signer_name, signer_email, signer_phone } = parsed.data;

    // 証明書取得 + テナント境界チェック + 顧客電話番号ハッシュ取得
    const { data: cert, error: certError } = await supabase
      .from("certificates")
      .select(
        `
        id, tenant_id, public_id, customer_name,
        customer_phone_last4, customer_phone_last4_hash,
        cert_type, service_type, created_at,
        vehicles ( car_number, car_name ),
        stores   ( name )
      `,
      )
      .eq("id", certificateId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (certError || !cert) {
      return apiError({
        code: "not_found",
        message: "証明書が見つからないか、アクセス権がありません",
        status: 404,
      });
    }

    if (!cert.customer_phone_last4_hash) {
      return apiError({
        code: "validation_error",
        message:
          "受領サインには本人確認用の電話番号下4桁が必要です。証明書に顧客電話番号を登録してから再度お試しください。",
        status: 400,
      });
    }

    // 既存の pending 受領サインを再利用
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: existing } = await admin
      .from("delivery_receipts")
      .select("id, signature_session_id, status, signature_sessions:signature_sessions(token, expires_at, status)")
      .eq("tenant_id", caller.tenantId)
      .eq("certificate_id", certificateId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingSessRaw = existing?.signature_sessions as unknown as
      | { token: string; expires_at: string; status: string }
      | Array<{ token: string; expires_at: string; status: string }>
      | null;
    const existingSess = Array.isArray(existingSessRaw) ? (existingSessRaw[0] ?? null) : existingSessRaw;
    if (existing && existingSess?.status === "pending" && new Date(existingSess.expires_at) > new Date()) {
      return apiOk({
        delivery_receipt_id: existing.id,
        sign_url: `${RECEIPT_SIGN_PATH}/${existingSess.token}`,
        expires_at: existingSess.expires_at,
        is_existing: true,
        message: "有効な受領サイン依頼がすでに存在します",
      });
    }

    // PDF バイト列生成 (SHA-256 アンカー)
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateCertificatePdfBytes(certificateId);
    } catch (err) {
      console.error("[delivery-receipt/request] PDF generation failed:", err);
      return apiError({ code: "internal_error", message: "PDF の生成に失敗しました", status: 500 });
    }
    const documentHash = computeDocumentHash(pdfBytes);

    // signature_sessions (purpose='delivery_receipt') を作成
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
    const consentTextHash = computeConsentTextHash();

    const { data: session, error: sessErr } = await admin
      .from("signature_sessions")
      .insert({
        certificate_id: certificateId,
        tenant_id: caller.tenantId,
        created_by: caller.userId,
        token,
        expires_at: expiresAt,
        status: "pending",
        document_hash: documentHash,
        document_hash_alg: "SHA-256",
        signer_name: signer_name ?? cert.customer_name ?? null,
        signer_email: signer_email ?? null,
        signer_phone: signer_phone ?? null,
        notification_method: signer_email ? "email" : "line",
        // 受領サイン固有
        purpose: "delivery_receipt",
        secondary_factor_required: true,
        secondary_factor_verified: false,
        secondary_factor_attempts: 0,
        phone_last4_hash: cert.customer_phone_last4_hash,
        consent_version: CONSENT_VERSION,
        consent_text_hash: consentTextHash,
      })
      .select()
      .single();

    if (sessErr || !session) {
      console.error("[delivery-receipt/request] session insert failed:", sessErr);
      return apiError({ code: "db_error", message: "受領サイン依頼の作成に失敗しました", status: 500 });
    }

    await admin.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "session_created",
      metadata: {
        purpose: "delivery_receipt",
        certificate_id: certificateId,
        document_hash: documentHash,
        consent_version: CONSENT_VERSION,
        expires_at: expiresAt,
      },
    });

    // 受領内容スナップショット (Supabase relation は配列で返る場合があるので両対応)
    const vehRaw = cert.vehicles as unknown as
      | { car_number: string | null; car_name: string | null }
      | Array<{ car_number: string | null; car_name: string | null }>
      | null;
    const veh = Array.isArray(vehRaw) ? (vehRaw[0] ?? null) : vehRaw;
    const stoRaw = cert.stores as unknown as { name: string | null } | Array<{ name: string | null }> | null;
    const sto = Array.isArray(stoRaw) ? (stoRaw[0] ?? null) : stoRaw;
    const snapshot: Omit<ReceiptPayloadSnapshot, "signed_at"> = {
      certificate: {
        id: cert.id,
        public_id: cert.public_id ?? null,
        cert_type: cert.cert_type ?? null,
        service_type: cert.service_type ?? null,
        created_at: cert.created_at ?? null,
      },
      vehicle: veh ? { car_number: veh.car_number, car_name: veh.car_name } : null,
      store: sto ? { name: sto.name } : null,
      customer: {
        name: cert.customer_name ?? null,
        phone_last4_masked: cert.customer_phone_last4 ? `***${cert.customer_phone_last4}` : null,
      },
      consent: {
        version: CONSENT_VERSION,
        text_hash: consentTextHash,
      },
    };

    const { data: receipt, error: receiptErr } = await admin
      .from("delivery_receipts")
      .insert({
        tenant_id: caller.tenantId,
        certificate_id: certificateId,
        signature_session_id: session.id,
        status: "pending",
        receipt_payload_json: snapshot,
        created_by: caller.userId,
      })
      .select()
      .single();

    if (receiptErr || !receipt) {
      console.error("[delivery-receipt/request] receipt insert failed:", receiptErr);
      return apiError({ code: "db_error", message: "受領サインレコードの作成に失敗しました", status: 500 });
    }

    const signUrl = `${RECEIPT_SIGN_PATH}/${token}`;

    // 顧客にメール送信 (任意 — メール未指定なら手渡し URL のみ返却)
    let notified = false;
    if (signer_email) {
      const { data: tenant } = await supabase.from("tenants").select("name").eq("id", caller.tenantId).single();

      void sendDeliveryReceiptEmail({
        to: signer_email,
        signerName: signer_name ?? cert.customer_name ?? null,
        shopName: tenant?.name ?? "Ledra",
        signUrl,
        expiresAt,
      });
      notified = true;
    }

    return apiOk({
      delivery_receipt_id: receipt.id,
      sign_url: signUrl,
      expires_at: expiresAt,
      notified,
    });
  } catch (e) {
    return apiInternalError(e, "admin/certificates/[id]/delivery-receipt-request");
  }
}
