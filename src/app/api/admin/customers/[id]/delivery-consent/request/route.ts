import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiError, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { CONSENT_REQUEST_TTL_DAYS, newConsentRequestToken } from "@/lib/delivery/deliveryConsent";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
import { sendEmail } from "@/lib/email/sendEmail";
import { sendCustomerLineText } from "@/lib/line/client";
import { escapeHtml } from "@/lib/sanitize";
import { resolveBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/customers/[id]/delivery-consent/request — 電子交付の承諾を「お願い」するリンクを発行する。 [G3]
 *
 * body { send: "link" | "email" | "line" }
 *   link  … URL を返すだけ（店頭で QR を読んでもらう・店舗が任意の方法で渡す）
 *   email … 顧客のメールアドレスへ送る / line … 顧客の LINE へ送る（送れなくても URL は返す）
 *
 * お客様はリンク先（/consent/delivery/<token>）で開示文言を読み、自分で承諾する。記録は本人承諾（granted_by=null）。
 * 「承諾を記録」ボタン（書面・口頭で得た承諾の店舗記録）と違い、お客様の操作と接続元が証跡として残る。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEND = ["link", "email", "line"] as const;
type Send = (typeof SEND)[number];

export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const customerId = params.id;
      if (!UUID_RE.test(customerId)) return apiValidationError("顧客 ID が不正です。");
      const body = (await req.json().catch(() => ({}))) as { send?: unknown };
      const send: Send = SEND.includes(body.send as Send) ? (body.send as Send) : "link";

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const [{ data: customer, error: custErr }, { data: consent, error: consentErr }, { data: tenant }] =
        await Promise.all([
          admin
            .from("customers")
            .select("id, name, email, line_user_id")
            .eq("tenant_id", caller.tenantId)
            .eq("id", customerId)
            .maybeSingle(),
          admin
            .from("delivery_consents")
            .select("status")
            .eq("tenant_id", caller.tenantId)
            .eq("customer_id", customerId)
            .maybeSingle(),
          admin.from("tenants").select("name").eq("id", caller.tenantId).maybeSingle(),
        ]);
      if (custErr) return apiInternalError(custErr, "delivery-consent request: customer");
      if (consentErr) return apiInternalError(consentErr, "delivery-consent request: consent");
      if (!customer) return apiNotFound("顧客が見つかりません。");
      if ((consent as { status?: string } | null)?.status === "granted") {
        return apiError({ code: "conflict", message: "この顧客は既に承諾済みです。", status: 409 });
      }
      const c = customer as { name: string | null; email: string | null; line_user_id: string | null };
      if (send === "email" && !c.email) return apiValidationError("この顧客にはメールアドレスが登録されていません。");
      if (send === "line" && !c.line_user_id) return apiValidationError("この顧客には LINE が紐付いていません。");

      const { token, tokenHash } = newConsentRequestToken();
      const expiresAt = new Date(Date.now() + CONSENT_REQUEST_TTL_DAYS * 86_400_000).toISOString();
      const { data: inserted, error: insErr } = await admin
        .from("delivery_consent_requests")
        .insert({
          tenant_id: caller.tenantId,
          customer_id: customerId,
          token_hash: tokenHash,
          sent_via: send,
          expires_at: expiresAt,
          created_by: caller.userId,
        })
        .select("id")
        .single();
      if (insErr || !inserted) return apiInternalError(insErr, "delivery-consent request: insert");

      const url = `${resolveBaseUrl({ req })}/consent/delivery/${token}`;
      const shop = (tenant as { name?: string | null } | null)?.name || "施工店";
      const name = c.name || "お客様";
      // 失効は発行の 14×24 時間後ちょうど。日付だけ書くと、その日の夜に開いて切れていることがあるので時刻まで書く。
      const expires = new Date(expiresAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "medium",
        timeStyle: "short",
      });

      let delivered: boolean | null = null;
      if (send === "email") {
        // 差出人は sendEmail が RESEND_FROM を既定で使う（未設定なら ok:false）。
        const r = await sendEmail({
          to: c.email as string,
          subject: `[${shop}] 記録簿の写しの電子交付についてのお願い`,
          html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <p style="color:#1d1d1f;font-size:14px;">${escapeHtml(name)} 様<br><br>
                  ${escapeHtml(shop)} です。点検整備記録簿などの写しを、メール・LINE・ダウンロードでお渡しするために、
                  お客様のご承諾をお願いしております。内容をご確認のうえ、ご承諾いただける場合は下のボタンからお手続きください。</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${url}" style="background:#0071e3;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">内容を確認する</a>
                </div>
                <p style="font-size:13px;color:#86868b;">有効期限: ${escapeHtml(expires)}<br>ご承諾いただかない場合は、書面でお渡しします。</p>
              </div>`,
        });
        delivered = r.ok;
      } else if (send === "line") {
        delivered = await sendCustomerLineText({
          tenantId: caller.tenantId,
          customerId,
          lineUserId: c.line_user_id as string,
          body: [
            `${name} 様`,
            ``,
            `${shop} です。点検整備記録簿などの写しを電子データでお渡しするために、ご承諾をお願いしております。`,
            `内容をご確認のうえ、ご承諾いただける場合は以下のリンクからお手続きください。`,
            url,
            ``,
            `有効期限: ${expires}`,
            `ご承諾いただかない場合は、書面でお渡しします。`,
          ].join("\n"),
          sentByUserId: caller.userId,
        });
      }

      void logTenantAuditEvent(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        action: "delivery_consent_requested",
        table: "delivery_consent_requests",
        recordId: (inserted as { id: string }).id,
        extra: { customer_id: customerId, sent_via: send, delivered },
        req,
      });
      // メール・LINE で届いたときは URL を返さない（店舗の画面にリンクを残さない。届かなかったときは手渡し用に返す）。
      return apiJson({ url: delivered ? null : url, expires_at: expiresAt, sent_via: send, delivered });
    } catch (e) {
      return apiInternalError(e, "delivery-consent request");
    }
  },
  { permission: "customers:edit", routeName: "delivery-consent request POST" },
);
