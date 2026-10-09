export type ResolveBaseUrlOptions = {
  /**
   * Route handler の Request を渡す（推奨）
   * x-forwarded-* がある場合はそれを優先して origin を組み立てる
   */
  req?: Request;

  /**
   * リクエスト自身のオリジンを APP_URL より優先する。
   *
   * Supabase の PKCE メール認証（マジックリンク / サインアップ確認 / SAML）
   * では、`signInWithOtp` / `signInWithSSO` が code_verifier をリクエスト
   * オリジンの Cookie に書き込む。コールバックが別オリジン（例: APP_URL の
   * 正規ドメイン app.ledra.co.jp）だと Cookie が届かず、`exchangeCodeForSession`
   * が verifier 不一致で失敗する（＝メールリンクを踏んでもログインできない）。
   * これらのフローでは true を指定し、ユーザーが今いるオリジンへ戻す。
   * 通知メール等の「正規ドメインで届けたい」リンクでは指定しない（既定=APP_URL 優先）。
   */
  preferRequestOrigin?: boolean;
};

/** req から origin（proto+host, 末尾スラッシュ無し）を取り出す。取れなければ null。 */
function requestOrigin(req: Request | undefined): string | null {
  if (!req) return null;
  const h = req.headers;
  const xfProto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const xfHost = (h.get("x-forwarded-host") ?? "").split(",")[0].trim();
  const host = (h.get("host") ?? "").trim();

  const proto = xfProto || "https";
  const finalHost = xfHost || host;

  if (finalHost) return `${proto}://${finalHost}`.replace(/\/+$/, "");

  try {
    return new URL(req.url).origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Base URL を決定（末尾スラッシュなし）
 * 優先順位:
 * 1) preferRequestOrigin=true の場合: リクエストオリジン → APP_URL
 *    それ以外（既定）: APP_URL → リクエストオリジン
 * 2) http://localhost:3000
 */
export function resolveBaseUrl(opts: ResolveBaseUrlOptions = {}): string {
  const envAppUrl = (process.env.APP_URL ?? "").trim();
  const appUrl = envAppUrl ? normalize(envAppUrl) : "";
  const origin = requestOrigin(opts.req);

  // PKCE メール認証などでは、verifier Cookie が張られたリクエストオリジンへ
  // 戻す必要があるため、APP_URL より優先する。
  // ponytail: リクエストオリジンは Supabase の Redirect URL 許可リストに
  // 含まれている必要がある（未登録だと Supabase が Site URL に差し替える）。
  if (opts.preferRequestOrigin && origin) return origin;

  if (appUrl) return appUrl;
  if (origin) return origin;

  return "http://localhost:3000";
}

function normalize(u: string): string {
  let s = u.trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s.replace(/\/+$/, "");
}

/**
 * 証明書の公開ページ（/c/<公開ID>）の絶対 URL。証明書 PDF の QR・本文に刷る。
 * **リクエストのヘッダ（host / x-forwarded-host）は使わない**: 匿名で叩ける公開 PDF でヘッダを信じると、偽の
 * ホストを QR に刷った本物そっくりの証明書が作れる。テナントの独自ドメインも使わない（アプリ側に配線されていない）。
 * 環境変数の順は QStash の一括 PDF（batch-pdf）が使っていた順を踏襲。どれも無ければ手元開発用の localhost。
 */
export function certificatePublicUrl(publicId: string): string {
  const base =
    [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL, process.env.NEXT_PUBLIC_BASE_URL, process.env.VERCEL_URL]
      .map((v) => normalize(v ?? ""))
      .find(Boolean) ?? "http://localhost:3000";
  return `${base}/c/${encodeURIComponent(publicId)}`;
}

export function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}
