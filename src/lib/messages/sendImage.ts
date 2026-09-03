import { storeOutboundImage } from "@/lib/line/media";
import { sendCustomerLineImage } from "@/lib/line/client";
import { detectMagicByteMime } from "@/lib/media/magicBytes";

/** LINE image message の上限 (originalContentUrl 10MB / JPEG・PNG のみ) */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * multipart フォームの `image` フィールドを検証して Storage 保存 → LINE Push 送信。
 * 受信箱スレッド API と顧客メッセージタブ API の共通処理。
 */
export async function sendLineImageFromForm(params: {
  form: FormData;
  tenantId: string;
  customerId: string | null;
  lineUserId: string;
  sentByUserId: string;
}): Promise<{ ok: true; delivered: boolean } | { ok: false; message: string }> {
  const file = params.form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "画像ファイルが指定されていません。" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "画像は 10MB 以下にしてください。" };
  }

  // 宣言された Content-Type は送信側が自由に付けられる。中身の先頭バイトで判定し、
  // Storage には検出した型で保存する (証明書写真のアップロードと同じ扱い)。
  // これをやらないと、image/jpeg と名乗る HTML や実行可能ファイルを
  // 自ドメインの署名付き URL で配信できてしまう。
  const buf = Buffer.from(await file.arrayBuffer());
  const detected = detectMagicByteMime(buf);
  if (!detected || !ALLOWED_TYPES.has(detected)) {
    return { ok: false, message: "画像は JPEG / PNG のみ送信できます (LINE の仕様)。" };
  }

  const stored = await storeOutboundImage({
    tenantId: params.tenantId,
    buf: new Uint8Array(buf),
    contentType: detected,
  });
  if (!stored) return { ok: false, message: "画像の保存に失敗しました。時間をおいて再試行してください。" };

  const delivered = await sendCustomerLineImage({
    tenantId: params.tenantId,
    customerId: params.customerId,
    lineUserId: params.lineUserId,
    imageUrl: stored.url,
    attachmentPath: stored.path,
    attachmentContentType: detected,
    sentByUserId: params.sentByUserId,
  });
  return { ok: true, delivered };
}
