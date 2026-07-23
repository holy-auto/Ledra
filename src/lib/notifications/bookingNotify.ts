import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { notifySlack } from "@/lib/slack";
import { readSecret } from "@/lib/crypto/tenantSecrets";
import { logger, maskEmail } from "@/lib/logger";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type NewBookingNotification = {
  id: string;
  title: string;
  scheduled_date: string;
  all_day?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
  tenant_name: string;
};

/**
 * 顧客予約（customer/booking, external/booking）が入った際、テナントの
 * オーナー/管理者へ「予約が入りました」通知をメール + (設定済みなら) Slack で送る。
 *
 * GCal 同期・LINE 確認通知と同じ non-blocking fire-and-forget 前提で呼ぶこと
 * （呼び出し側で `.catch()` して予約成立自体は阻害しない）。宛先が解決できない
 * 場合や個々の送信失敗は warn/error ログのみでスキップし、例外は投げない。
 */
export async function notifyNewBooking(
  tenantId: string,
  reservation: NewBookingNotification,
  customerName: string,
): Promise<void> {
  const supabase = createServiceRoleAdmin("booking notify: owner email + tenant slack webhook lookup");

  const timeLabel = reservation.all_day
    ? "終日"
    : reservation.start_time && reservation.end_time
      ? `${reservation.start_time.slice(0, 5)} 〜 ${reservation.end_time.slice(0, 5)}`
      : "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
  const reservationUrl = `${appUrl}/admin/reservations`;

  const results = await Promise.allSettled([
    sendOwnerEmail({ supabase, tenantId, reservation, customerName, timeLabel, reservationUrl }),
    sendSlackAlert({ supabase, tenantId, reservation, customerName, timeLabel, reservationUrl }),
  ]);
  // allSettled は reject しないため、呼び出し側の `.catch()` はここでの例外を拾えない。
  // 握りつぶすと原因不明のまま通知が届かなくなるので、ここで明示的にログする。
  for (const r of results) {
    if (r.status === "rejected") {
      logger.error("bookingNotify: unexpected failure", { tenantId, reservationId: reservation.id, error: r.reason });
    }
  }
}

async function sendOwnerEmail(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  tenantId: string;
  reservation: NewBookingNotification;
  customerName: string;
  timeLabel: string;
  reservationUrl: string;
}): Promise<void> {
  const { supabase, tenantId, reservation, customerName, timeLabel, reservationUrl } = params;

  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin", "super_admin"])
    .limit(1);
  if (!members?.[0]) {
    logger.warn("bookingNotify: skipped email — no owner/admin member found", { tenantId });
    return;
  }

  const { data: userData } = await supabase.auth.admin.getUserById(members[0].user_id);
  const to = userData?.user?.email;
  if (!to) {
    logger.warn("bookingNotify: skipped email — no email for user", { tenantId, userId: members[0].user_id });
    return;
  }

  const subject = `【Ledra】新しい予約が入りました（${reservation.scheduled_date} ${customerName}様）`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">新しい予約が入りました</h2>
      </div>
      <p style="color: #1d1d1f; line-height: 1.6;">
        お客様: <strong>${escapeHtml(customerName)}</strong> 様<br>
        日時: <strong>${escapeHtml(reservation.scheduled_date)} ${escapeHtml(timeLabel)}</strong><br>
        内容: ${escapeHtml(reservation.title)}
        ${reservation.note ? `<br>備考: ${escapeHtml(reservation.note)}` : ""}
      </p>
      <p style="margin: 24px 0;">
        <a href="${reservationUrl}" style="display: inline-block; background: #0071e3; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          予約一覧を見る
        </a>
      </p>
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        Ledra — 株式会社HOLY
      </div>
    </div>
  `;
  const text = `新しい予約が入りました

お客様: ${customerName} 様
日時: ${reservation.scheduled_date} ${timeLabel}
内容: ${reservation.title}
${reservation.note ? `備考: ${reservation.note}\n` : ""}
予約一覧: ${reservationUrl}

---
Ledra — 株式会社HOLY
`;

  const sent = await sendEmail({ to, reply_to: "support@ledra.co.jp", subject, html, text });
  if (!sent.ok) {
    logger.error("bookingNotify: email send failed", {
      tenantId,
      reservationId: reservation.id,
      emailMasked: maskEmail(to),
      status: sent.status,
    });
  } else {
    logger.info("bookingNotify: email sent", { tenantId, reservationId: reservation.id, emailMasked: maskEmail(to) });
  }
}

async function sendSlackAlert(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  tenantId: string;
  reservation: NewBookingNotification;
  customerName: string;
  timeLabel: string;
  reservationUrl: string;
}): Promise<void> {
  const { supabase, tenantId, reservation, customerName, timeLabel, reservationUrl } = params;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("booking_notify_slack_webhook_ciphertext")
    .eq("id", tenantId)
    .maybeSingle();
  const ciphertext = tenant?.booking_notify_slack_webhook_ciphertext as string | null | undefined;
  if (!ciphertext) return; // 未設定は無条件でスキップ（notifySlack 自体も no-op だが問い合わせ自体を省く）
  const webhookUrl = await readSecret(ciphertext, "tenants.booking_notify_slack_webhook_ciphertext");
  if (!webhookUrl) return; // 復号失敗（キー不整合等）も通知スキップ。readSecret 側でエラーログ済み

  await notifySlack(webhookUrl, {
    text: `📅 新しい予約が入りました — ${reservation.tenant_name}`,
    color: "#0071e3",
    fields: [
      { title: "お客様", value: `${customerName} 様`, short: true },
      { title: "日時", value: `${reservation.scheduled_date} ${timeLabel}`, short: true },
      { title: "内容", value: reservation.title },
      ...(reservation.note ? [{ title: "備考", value: reservation.note }] : []),
      { title: "予約一覧", value: reservationUrl },
    ],
  });
}
