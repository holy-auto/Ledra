import { sendResendEmail } from "@/lib/email/resendSend";
import { logger } from "@/lib/logger";

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    "https://ledra.app"
  ).replace(/\/+$/, "");
}

/**
 * Send the transfer-invitation email to the prospective new owner.
 *
 * Fire-and-forget from the caller's perspective for happy path:
 * the caller commits the DB row first, then sends. A delivery
 * failure is logged but not surfaced as an error because the
 * shop can re-send manually from the admin UI.
 */
export async function sendTransferInvitation(args: {
  toEmail: string;
  toName: string | null;
  fromShopName: string;
  vehicleLabel: string; // "Toyota Aqua 2022" — human display only
  passportShortId: string; // last 6 of VIN
  rawToken: string;
  expiresAt: Date;
  message: string | null;
}): Promise<void> {
  const url = `${appBaseUrl()}/passport/transfer/${encodeURIComponent(args.rawToken)}`;
  const expiryDisplay = args.expiresAt.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const greeting = args.toName ? `${args.toName} 様` : "新しいオーナー様";
  const text = [
    `${greeting}`,
    "",
    `${args.fromShopName} より、車両パスポートの所有権移転リクエストが届いています。`,
    "",
    `対象車両: ${args.vehicleLabel}`,
    `パスポートID: ${args.passportShortId}`,
    "",
    args.message ? `▼ メッセージ` : null,
    args.message ?? null,
    args.message ? "" : null,
    "下記リンクから内容を確認のうえ、受け入れまたは辞退してください。",
    url,
    "",
    `※ このリンクは ${expiryDisplay} まで有効です。`,
    "※ 心当たりがない場合はリンクを開かずに破棄してください。",
    "",
    "— Ledra Vehicle Passport",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const subject = `[Ledra] 車両パスポート所有権移転のご案内 — ${args.vehicleLabel}`;

  const res = await sendResendEmail(
    {
      to: args.toEmail,
      subject,
      text,
    },
    { retries: 2 },
  );

  if (!res.ok) {
    logger.warn("passport transfer invitation email failed", {
      status: res.status,
      error: res.error,
      to: args.toEmail,
    });
  }
}

/** Notify the initiating shop that the new owner accepted. */
export async function sendTransferAcceptedNotification(args: {
  toEmail: string;
  shopName: string;
  vehicleLabel: string;
  passportShortId: string;
  acceptedByName: string | null;
  acceptedByEmail: string;
}): Promise<void> {
  const text = [
    `${args.shopName} ご担当者様`,
    "",
    `車両パスポートの所有権移転が完了しました。`,
    "",
    `対象車両: ${args.vehicleLabel}`,
    `パスポートID: ${args.passportShortId}`,
    `新しいオーナー: ${args.acceptedByName ?? "(氏名未登録)"} <${args.acceptedByEmail}>`,
    "",
    "今後の連絡は新しいオーナー様宛てに行ってください。",
    "",
    "— Ledra Vehicle Passport",
  ].join("\n");

  const res = await sendResendEmail(
    {
      to: args.toEmail,
      subject: `[Ledra] 車両パスポート所有権移転が完了しました — ${args.vehicleLabel}`,
      text,
    },
    { retries: 2 },
  );

  if (!res.ok) {
    logger.warn("passport transfer accepted notification email failed", {
      status: res.status,
      error: res.error,
    });
  }
}
