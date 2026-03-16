import { Resend } from "resend";
import { contactSchema } from "@/lib/validations/contact";
import { apiOk, apiInternalError, apiValidationError } from "@/lib/api/response";

/** 遅延初期化: ビルド時に API キーが無くてもクラッシュしない */
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "");
}

/** 送信先（問い合わせ受信用アドレス） */
const TO = process.env.CONTACT_TO_EMAIL ?? "info@cartrust.co.jp";

/** 送信元として表示するアドレス（Resendの検証済みドメインである必要がある） */
const FROM = process.env.CONTACT_FROM_EMAIL ?? "noreply@cartrust.co.jp";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("無効なJSONです。");
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
  }

  const { name, email, company, category, message } = parsed.data;

  if (!process.env.RESEND_API_KEY) {
    // 開発環境: APIキー未設定の場合はログだけ出してOK返す
    console.log("[contact] dev mode — would send:", { name, email, category });
    return apiOk({});
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

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "contact mail send");
  }
}
