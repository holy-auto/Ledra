/**
 * 証明書発行時の「連携先（保険会社 / メーカー）へのリアルタイム通知」。
 *
 * 連携先は普段、ポータルで証明書を pull して確認する。本モジュールは発行の瞬間に
 * 「新しい証明書が出ました」と push で知らせ、ポーリングの手間を無くす。
 *
 * 対象（スパムにしないためのスコープ）:
 *   - 保険会社: enterprise プラン + is_active + 連絡先あり（既存ハンドラの想定どおり）
 *   - メーカー: その証明書の manufacturer_id 本人（自ブランドの証明書のみ）+ is_active
 *
 * PII: 連携先向けビューは顧客名を伏字化する方針のため、本通知メールには
 *      **顧客名・ナンバー等の個人情報は載せない**。施工店名・施工種別・公開ID・
 *      ポータル導線のみ。詳細は連携先ポータル（マスキング + アクセスログ付き）で確認させる。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { escapeHtml } from "@/lib/sanitize";
import { logger } from "@/lib/logger";

type Db = ReturnType<typeof createServiceRoleAdmin>;

export interface PartnerIssueEmailParams {
  partnerName: string;
  shopName: string;
  serviceType?: string | null;
  publicId: string;
  portalUrl: string;
}

/**
 * 連携先通知メールの本文（純関数 / PII を含めない）。
 * 顧客名や車両ナンバーは **意図的に受け取らない**（型レベルで PII 混入を防ぐ）。
 */
export function buildPartnerIssueEmail(params: PartnerIssueEmailParams): { subject: string; html: string } {
  const partner = escapeHtml(params.partnerName || "ご担当者");
  const shop = escapeHtml(params.shopName || "施工店");
  const service = escapeHtml(params.serviceType?.trim() || "施工証明書");
  const pid = escapeHtml(params.publicId);
  const url = escapeHtml(params.portalUrl);

  const subject = `【Ledra】新しい施工証明書が発行されました（${shop}）`;
  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1a1f36">
      <p>${partner} 様</p>
      <p>連携先の施工店で新しい施工証明書が発行されました。詳細はポータルでご確認ください。</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#697386">施工店</td><td style="font-weight:600">${shop}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#697386">施工種別</td><td>${service}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#697386">証明書ID</td><td>${pid}</td></tr>
      </table>
      <p><a href="${url}" style="color:#3b5bdb">ポータルで確認する</a></p>
      <p style="font-size:12px;color:#8792a2">※ 顧客の個人情報はポータル上でのみ（適切なマスキングのもと）参照できます。</p>
    </div>`.trim();

  return { subject, html };
}

async function alreadyNotified(admin: Db, type: string, publicId: string, recipient: string): Promise<boolean> {
  const { data } = await admin
    .from("notification_logs")
    .select("id")
    .eq("type", type)
    .eq("target_id", publicId)
    .eq("recipient_email", recipient)
    .limit(1);
  return !!data?.length;
}

async function logSent(admin: Db, tenantId: string, type: string, publicId: string, recipient: string): Promise<void> {
  await admin.from("notification_logs").insert({
    tenant_id: tenantId,
    type,
    target_type: "certificate",
    target_id: publicId,
    recipient_email: recipient,
    status: "sent",
  });
}

/**
 * 発行された証明書について、該当する連携先へリアルタイム通知を送る。
 * fire-and-forget 前提（呼び出し側で catch）。冪等: notification_logs で
 * (type, target_id=public_id, recipient) 重複を防ぎ、Resend にも idempotencyKey を渡す。
 */
export async function notifyPartnersOnIssue(
  admin: Db,
  params: { publicId: string; tenantId: string; shopName: string; serviceType?: string | null },
): Promise<{ insurers: number; manufacturers: number }> {
  const { publicId, tenantId, shopName, serviceType } = params;
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ledra.co.jp";
  let insurers = 0;
  let manufacturers = 0;

  // 1. enterprise プランの保険会社（既存ハンドラの想定スコープ）
  const { data: insurerRows } = await admin
    .from("insurers")
    .select("id, name, contact_email")
    .eq("is_active", true)
    .eq("plan_tier", "enterprise");

  for (const ins of insurerRows ?? []) {
    const email = ins.contact_email as string | null;
    if (!email) continue;
    if (await alreadyNotified(admin, "insurer_issue_notify", publicId, email)) continue;
    const { subject, html } = buildPartnerIssueEmail({
      partnerName: ins.name as string,
      shopName,
      serviceType,
      publicId,
      portalUrl: `${base}/insurer`,
    });
    const res = await sendEmail({ to: email, subject, html, idempotencyKey: `insurer-issue:${publicId}:${ins.id}` });
    if (res.ok) {
      await logSent(admin, tenantId, "insurer_issue_notify", publicId, email);
      insurers += 1;
    } else {
      logger.warn("[issue-notify] insurer email failed", { insurerId: ins.id });
    }
  }

  // 2. その証明書の manufacturer 本人（自ブランドのみ）
  const { data: cert } = await admin
    .from("certificates")
    .select("manufacturer_id")
    .eq("public_id", publicId)
    .maybeSingle();
  const manufacturerId = (cert?.manufacturer_id as string | null | undefined) ?? null;

  if (manufacturerId) {
    const { data: m } = await admin
      .from("manufacturers")
      .select("id, name, contact_email, is_active")
      .eq("id", manufacturerId)
      .maybeSingle();
    const email = (m?.contact_email as string | null) ?? null;
    if (m?.is_active && email && !(await alreadyNotified(admin, "manufacturer_issue_notify", publicId, email))) {
      const { subject, html } = buildPartnerIssueEmail({
        partnerName: m.name as string,
        shopName,
        serviceType,
        publicId,
        portalUrl: `${base}/manufacturer`,
      });
      const res = await sendEmail({
        to: email,
        subject,
        html,
        idempotencyKey: `manufacturer-issue:${publicId}:${m.id}`,
      });
      if (res.ok) {
        await logSent(admin, tenantId, "manufacturer_issue_notify", publicId, email);
        manufacturers += 1;
      } else {
        logger.warn("[issue-notify] manufacturer email failed", { manufacturerId });
      }
    }
  }

  return { insurers, manufacturers };
}
