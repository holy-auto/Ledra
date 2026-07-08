import { storeOutboundImage } from "@/lib/line/media";
import { sendCustomerLineImage } from "@/lib/line/client";

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
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, message: "画像は JPEG / PNG のみ送信できます (LINE の仕様)。" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "画像は 10MB 以下にしてください。" };
  }

  const stored = await storeOutboundImage({
    tenantId: params.tenantId,
    buf: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type,
  });
  if (!stored) return { ok: false, message: "画像の保存に失敗しました。時間をおいて再試行してください。" };

  const delivered = await sendCustomerLineImage({
    tenantId: params.tenantId,
    customerId: params.customerId,
    lineUserId: params.lineUserId,
    imageUrl: stored.url,
    attachmentPath: stored.path,
    attachmentContentType: file.type,
    sentByUserId: params.sentByUserId,
  });
  return { ok: true, delivered };
}
