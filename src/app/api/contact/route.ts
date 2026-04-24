import { NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { contactSchema, parseBody } from "@/lib/validation/schemas";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { notifySlack } from "@/lib/slack";

/** 遅延初期化: ビルド時に API キーが無くてもクラッシュしない */
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "");
}

/** 送信先（問い合わせ受信用アドレス） */
const TO = process.env.CONTACT_TO_EMAIL ?? "info@ledra.co.jp";

/** 送信元: RESEND_FROM（検証済みドメイン）を使用 */
const FROM = process.env.RESEND_FROM ?? "Ledra <support@ledra.co.jp>";

export async function POST(request: Request) {
  // Rate limit: 5 contact form submissions per IP per 15 minutes
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`contact:${ip}`, { limit: 5, windowSec: 900 });
  if (!rl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "送信が多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = parseBody(contactSchema, rawBody);
  if (!parsed.success) {
    return apiValidationError("Missing required fields", { details: parsed.errors });
  }

  const { name, email, company, category, message } = parsed.data;

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[contact] dev mode — would send:", { name, email, category });
      return apiJson({ ok: true });
    }
    console.error("[contact] RESEND_API_KEY is not set in production");
    return apiInternalError(new Error("Mail service not configured"), "contact email send");
  }

  try {
    await getResend().emails.send({
      from: FROM,
      to: TO,
      replyTo: email,
      subject: `[Ledra] お問い合わせ: ${category}（${name}）`,
      text: [
        `お名前: ${name}`,
        `メール: ${email}`,
        company ? `会社名: ${company}` : null,
        `種別: ${category}`,
        "",
        "--- お問い合わせ内容 ---",
        message,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    });

    try {
      await notifySlack(process.env.SLACK_ADMIN_SUPPORT_WEBHOOK_URL, {
        text: `:inbox_tray: 新規お問い合わせ: *${category}*`,
        fields: [
          { title: "お名前", value: name, short: true },
          { title: "メール", value: email, short: true },
          ...(company ? [{ title: "会社名", value: company, short: true }] : []),
          { title: "種別", value: category, short: true },
          { title: "メッセージ", value: message.slice(0, 500) },
        ],
      });
    } catch (err) {
      console.error("[contact] slack notify failed:", err);
    }

    return apiJson({ ok: true });
  } catch (err) {
    return apiInternalError(err, "contact email send");
  }
}
