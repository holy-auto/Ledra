/**
 * 証明書の外部向けリンクを組み立てる。**PDF・共有・QR が同じ関数を使う。**
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
