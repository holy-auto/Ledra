/**
 * 顧客に渡す外部向けリンクを組み立てる。**PDF・共有・QR が同じ関数を使う。**
 *
 * 証明書だけの置き場ではない（車両パスポート・レシートも入っている）。
 * 顧客に渡す URL はここに集める ―― 呼び出し側に文字列を書かせない。
 *
 * なぜ切り出したか: 3箇所で別々に組み立てると、片方だけ末尾スラッシュを
 * 落とし忘れて `//` の URL をお客様に渡す、といった事故が起きる。
 *
 * 既定値を持たせないのは、環境変数が無いときに**間違ったドメインのリンクを
 * お客様に渡さない**ため。null を返して呼び出し側に知らせる。
 */

const trimSlash = (s: string) => s.replace(/\/$/, "");

/** 証明書の公開ページ。お客様に見せる／共有するのはこれ */
export function publicCertUrl(publicId: string, base = process.env.EXPO_PUBLIC_CERTIFICATE_BASE_URL): string | null {
  if (!base || !publicId) return null;
  return `${trimSlash(base)}/${encodeURIComponent(publicId)}`;
}

/** PDF は公開ルート（認証不要）。端末のブラウザで開いて保存・印刷してもらう */
export function certPdfUrl(publicId: string, api = process.env.EXPO_PUBLIC_API_URL): string | null {
  if (!api || !publicId) return null;
  return `${trimSlash(api)}/api/certificate/pdf?pid=${encodeURIComponent(publicId)}`;
}

/**
 * 車両パスポートの公開ページ。NFC タグは証明書より優先してこちらを書く。
 * `EXPO_PUBLIC_CERTIFICATE_BASE_URL` は `/c` 込みなので、こちらは API の
 * オリジンから組み立てる。
 */
export function passportUrl(vin: string, api = process.env.EXPO_PUBLIC_API_URL): string | null {
  if (!api || !vin) return null;
  return `${trimSlash(api)}/v/${encodeURIComponent(vin)}`;
}

/**
 * POS レシートの公開ページ。**要件 5.10（決済後に SMS / Email で送れること）の宛先。**
 *
 * なぜここに足したか: 予約レシートと飛び込みレシートの2画面が
 * `https://app.ledra.co.jp/c/${id}` を直接書いていた。この `id` は
 * payments.id / reservations.id で、`/c/` は **証明書**の公開ページ
 * （certificates.public_id を引いて notFound() する）。つまり顧客に送った
 * リンクは必ず 404 だった。**同じ間違いが2箇所にあった**ので組み立てを集約する。
 *
 * 正しい宛先は `/receipt/[public_id]`（documents.public_id、doc_type='receipt' のみ公開）。
 *
 * **`/r/` に短くしないこと。** `/r/[short_id]` は既に本人確認の入庫リンク
 * （src/lib/identity/intakeLinkServer.ts が `/r/{short_id}?t={token}` を発行）で
 * 埋まっている。同じ階層に別のスラッグ名は置けず、Next.js のビルドが落ちる。
 * トークンは pos_checkout 直後に recordPosSale が書くので、書き込みに失敗した
 * 決済では欠けうる。**null のときは共有ボタンを出さないこと。**
 */
export function receiptUrl(
  publicId: string | null | undefined,
  api = process.env.EXPO_PUBLIC_API_URL,
): string | null {
  if (!api || !publicId) return null;
  return `${trimSlash(api)}/receipt/${encodeURIComponent(publicId)}`;
}
