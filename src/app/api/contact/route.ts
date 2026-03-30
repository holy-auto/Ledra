import { NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { contactSchema, parseBody } from "@/lib/validation/schemas";
import { verifyTurnstile } from "@/lib/turnstile";

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
    return NextResponse.json(
      { error: "rate_limited", message: "送信が多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tsResult = await verifyTurnstile((rawBody as any)?.turnstile_token, ip);
  if (!tsResult.success) {
    return NextResponse.json(
      { error: "captcha_failed", message: "セキュリティ確認に失敗しました。ページを再読み込みして再度お試しください。" },
      { status: 400 },
    );
  }

  const parsed = parseBody(contactSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing required fields", details: parsed.errors }, { status: 400 });
  }

  const { name, email, company, category, message } = parsed.data;

  if (!process.env.RESEND_API_KEY) {
    // 開発環境: APIキー未設定の場合はログだけ出してOK返す
    console.log("[contact] dev mode — would send:", { name, email, category });
    return NextResponse.json({ ok: true });
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] resend error:", err);
    return NextResponse.json({ error: "Mail send failed" }, { status: 500 });
  }
}
