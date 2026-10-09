/**
 * POST /api/consent/delivery/[token] — お客様が承諾依頼リンクから「電子交付の承諾」をする。 [G3 / 第２ ４（３）]
 *
 * body { consent_version, agreed: true }
 * 認証: リンクのトークン（店舗がメール・LINE・店頭の QR で渡したもの。sha256 で照合）。1回限り・期限付き。
 * 画面に表示した開示文言の版が現行版と一致するときだけ記録する（表示と記録の文言がずれないように）。
 * 記録は顧客ポータルの本人承諾と同じ処理（grantDeliveryConsentAsCustomer）で、経路 via=link と IP/UA を監査ログに残す。
 */
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  DELIVERY_CONSENT_VERSION,
  findConsentRequest,
  grantDeliveryConsentAsCustomer,
} from "@/lib/delivery/deliveryConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  consent_version: z.string().trim().min(1).max(100),
  agreed: z.literal(true),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;
  try {
    const { token } = await params;
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("内容をご確認のうえ、承諾にチェックしてください。");
    if (parsed.data.consent_version !== DELIVERY_CONSENT_VERSION) {
      return apiError({
        code: "conflict",
        message: "承諾の文言が更新されました。ページを再読み込みして、最新の文言をご確認ください。",
        status: 409,
      });
    }

    const admin = createServiceRoleAdmin("delivery-consent link — token-bound customer consent");
    const found = await findConsentRequest(admin, token);
    if (found.state === "error") return apiInternalError(found.error, "consent/delivery lookup");
    if (found.state === "used")
      return apiError({ code: "conflict", message: "このリンクは使用済みです。", status: 409 });
    if (found.state !== "ok")
      return apiNotFound("このリンクは無効か、有効期限が切れています。発行した店舗にお問い合わせください。");

    const r = await grantDeliveryConsentAsCustomer(admin, {
      tenantId: found.tenantId,
      customerId: found.customerId,
      via: "link",
      requestId: found.id,
      req,
    });
    if (!r.ok) return apiInternalError(r.error, "consent/delivery grant");
    // 承諾を記録してから使用済みにする（逆だと、記録に失敗したリンクが使えなくなる）。二重送信は上の
    // grant が「既に承諾済み」で何もしないので、ここが2回走っても害は無い。
    const { error: usedErr } = await admin
      .from("delivery_consent_requests")
      .update({ used_at: new Date().toISOString() })
      .eq("id", found.id)
      .is("used_at", null);
    if (usedErr) console.warn("[consent/delivery] mark used failed:", usedErr.message);
    return apiOk({ status: "granted" });
  } catch (e) {
    return apiInternalError(e, "consent/delivery");
  }
}
