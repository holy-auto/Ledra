/**
 * 保険会社への個人情報開示に対する「オーナー本人の同意」（代表判断 2026-09-27）。
 *
 * プライバシーポリシーは「保険会社への証明書情報の提供（ユーザーが許可した場合）」と書いているのに、
 * これまで同意していたのは施工店の管理者だけだった。is_pii_disclosed() は
 * 申請・施工店の承認・オーナーの同意の3つが揃ったときだけ真になる
 * （20260927120342_owner_consent_and_transfer_hide.sql）。
 *
 * 同意できるのは、マイページのセッションに customer_id が結び付いている本人だけ。
 * 電話番号下4桁のハッシュだけのセッションは同じテナント内で別人と衝突しうるので、
 * 法的な意思表示には使わない（連絡先の自己登録と同じ線引き）。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { logger } from "@/lib/logger";

export type PendingOwnerConsent = {
  id: string;
  certificate_public_id: string;
  insurer_name: string | null;
  insurer_reason: string | null;
  insurer_requested_at: string;
};

type ConsentRow = {
  id: string;
  insurer_reason: string | null;
  insurer_requested_at: string | null;
  certificate_id: string;
  insurers: { name: string | null } | null;
};

/** このオーナーの証明書に届いていて、まだ本人が同意していない開示申請。 */
export async function listPendingOwnerConsents(tenantId: string, customerId: string): Promise<PendingOwnerConsent[]> {
  const admin = createServiceRoleAdmin("customer portal — pending PII disclosure requests for the session's customer");
  const { data: certs, error: certErr } = await admin
    .from("certificates")
    .select("id, public_id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .is("hidden_from_owner_portal_at", null);
  if (certErr) throw certErr;
  if (!certs || certs.length === 0) return [];

  const publicIdById = new Map(certs.map((c) => [c.id as string, c.public_id as string]));
  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .select("id, certificate_id, insurer_reason, insurer_requested_at, insurers(name)")
    .in("certificate_id", [...publicIdById.keys()])
    .eq("is_active", true)
    .is("revoked_at", null)
    .is("owner_consented_at", null)
    .not("insurer_requested_at", "is", null)
    .order("insurer_requested_at", { ascending: false })
    .returns<ConsentRow[]>();
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    certificate_public_id: publicIdById.get(r.certificate_id) ?? "",
    insurer_name: r.insurers?.name ?? null,
    insurer_reason: r.insurer_reason,
    insurer_requested_at: r.insurer_requested_at as string,
  }));
}

/**
 * 本人の同意を記録する。対象の申請がこの顧客の証明書のものでなければ何もせず false。
 * 既に同意済み・取消済みの行も false（二重に記録しない）。
 */
export async function recordOwnerConsent(tenantId: string, customerId: string, consentId: string): Promise<boolean> {
  const pending = await listPendingOwnerConsents(tenantId, customerId);
  if (!pending.some((p) => p.id === consentId)) return false;

  const admin = createServiceRoleAdmin("customer portal — record owner consent for PII disclosure");
  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .update({ owner_consented_at: new Date().toISOString(), owner_consented_customer_id: customerId })
    .eq("id", consentId)
    .is("owner_consented_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** 保険会社から申請が来たことをオーナーにメールで知らせる（ベストエフォート）。 */
export async function notifyOwnerOfPiiRequest(certificateId: string, insurerId: string): Promise<void> {
  try {
    const admin = createServiceRoleAdmin("insurer PII request — notify the certificate's owner");
    const { data: cert } = await admin
      .from("certificates")
      .select("tenant_id, customer_id, hidden_from_owner_portal_at")
      .eq("id", certificateId)
      .maybeSingle();
    // 移転済み（旧オーナーのマイページから外した）証明書は、旧オーナーに同意を求めない。
    if (!cert?.customer_id || cert.hidden_from_owner_portal_at) return;

    const [{ data: customer }, { data: tenant }, { data: insurer }] = await Promise.all([
      admin
        .from("customers")
        .select("name, email")
        .eq("id", cert.customer_id)
        .eq("tenant_id", cert.tenant_id)
        .maybeSingle(),
      admin.from("tenants").select("name, slug").eq("id", cert.tenant_id).maybeSingle(),
      admin.from("insurers").select("name").eq("id", insurerId).maybeSingle(),
    ]);
    if (!customer?.email || !tenant?.slug) return;

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ledra.app").replace(/\/+$/, "");
    const text = [
      `${customer.name ?? "お客様"} 様`,
      "",
      `${insurer?.name ?? "保険会社"} から、${tenant.name ?? "施工店"} で発行した施工証明書について、`,
      "お客様の氏名の開示申請がありました。",
      "",
      "お客様が同意されるまで、保険会社に氏名は開示されません。",
      "内容の確認と同意は、マイページから行えます。",
      `${base}/customer/${encodeURIComponent(tenant.slug)}`,
      "",
      "お心当たりのない場合は、同意せずにそのままにしてください。",
      "",
      "— Ledra",
    ].join("\n");

    const res = await sendEmail({
      to: customer.email,
      subject: "[Ledra] 保険会社から個人情報の開示申請がありました",
      text,
    });
    if (!res.ok) logger.warn("owner PII request email failed", { status: res.status, error: res.error });
  } catch (e) {
    logger.warn("owner PII request notify failed", { err: e instanceof Error ? e.message : String(e) });
  }
}
