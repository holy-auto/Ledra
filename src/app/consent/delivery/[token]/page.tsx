import type { Metadata } from "next";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  DELIVERY_CONSENT_VERSION,
  deliveryConsentText,
  findConsentRequest,
  revokedSinceRequest,
} from "@/lib/delivery/deliveryConsent";
import ConsentForm from "./ConsentForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "電子交付のご承諾 | Ledra",
  robots: { index: false, follow: false },
};

/**
 * 電子交付の承諾のお願い（店舗がメール・LINE・店頭の QR で渡したリンク）。 [G3]
 * お客様がご自身の端末で開示文言を読み、承諾する。記録は POST /api/consent/delivery/[token]。
 */
export default async function DeliveryConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createServiceRoleAdmin("delivery-consent link page — token-bound lookup");
  const found = await findConsentRequest(admin, token);

  let shopName: string | null = null;
  let alreadyGranted = false;
  let revokedAfterRequest = false;
  if (found.state === "ok") {
    const [{ data: tenant }, { data: consent }] = await Promise.all([
      admin.from("tenants").select("name").eq("id", found.tenantId).maybeSingle(),
      admin
        .from("delivery_consents")
        .select("status, revoked_at")
        .eq("tenant_id", found.tenantId)
        .eq("customer_id", found.customerId)
        .maybeSingle(),
    ]);
    shopName = (tenant as { name?: string | null } | null)?.name ?? null;
    const c = consent as { status?: string; revoked_at?: string | null } | null;
    alreadyGranted = c?.status === "granted";
    // リンク発行後に撤回されていたら、このリンクでは承諾に戻さない（API と同じ判定）。
    revokedAfterRequest = revokedSinceRequest(c, found.createdAt);
  }

  const notice = alreadyGranted
    ? "ご承諾は記録済みです。ありがとうございました。"
    : revokedAfterRequest
      ? "このリンクを発行した後に承諾が撤回されているため、このリンクは使えません。発行した店舗にお問い合わせください。"
      : found.state === "used"
        ? "このリンクは使用済みです。"
        : found.state === "expired"
          ? "このリンクは有効期限が切れています。お手数ですが、発行した店舗にお問い合わせください。"
          : found.state === "not_found"
            ? "このリンクは無効です。お手数ですが、発行した店舗にお問い合わせください。"
            : found.state === "error"
              ? "現在このリンクを確認できません。時間をおいて再度お試しください。"
              : null;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-md mb-6">
        <span className="text-blue-400 font-bold text-xl tracking-wide">Ledra</span>
        <h1 className="text-white text-2xl font-bold mt-1">電子交付のご承諾</h1>
        {shopName ? <p className="text-gray-200 text-sm mt-1">{shopName} からのお願いです</p> : null}
      </div>
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-5">
        {notice ? (
          <p className="text-gray-100 text-sm leading-relaxed">{notice}</p>
        ) : (
          <ConsentForm token={token} consentText={deliveryConsentText()} consentVersion={DELIVERY_CONSENT_VERSION} />
        )}
      </div>
    </div>
  );
}
