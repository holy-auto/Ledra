import { NextResponse } from "next/server";
import { Resend } from "resend";

/** 遅延初期化: ビルド時に API キーが無くてもクラッシュしない */
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "");
}

/** 送信先（問い合わせ受信用アドレス） */
const TO = process.env.CONTACT_TO_EMAIL ?? "info@cartrust.co.jp";

/** 送信元として表示するアドレス（Resendの検証済みドメインである必要がある） */
const FROM = process.env.CONTACT_FROM_EMAIL ?? "noreply@cartrust.co.jp";

type Body = {
  name: string;
  email: string;
  company?: string;
  category: string;
  message: string;
};

function isValidBody(b: unknown): b is Body {
  if (!b || typeof b !== "object") return false;
  const { name, email, category, message } = b as Record<string, unknown>;
  return (
    typeof name === "string" && name.trim().length > 0 &&
    typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    typeof category === "string" && category.trim().length > 0 &&
    typeof message === "string" && message.trim().length > 0
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { name, email, company, category, message } = body;

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
      subject: `[CARTRUST] お問い合わせ: ${category}（${name}）`,
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
