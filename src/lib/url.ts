export type ResolveBaseUrlOptions = {
  /**
   * Route handler の Request を渡す（推奨）
   * x-forwarded-* がある場合はそれを優先して origin を組み立てる
   */
  req?: Request;

  /**
   * 将来: tenant_custom_domain を渡す（例: "https://cert.holy-auto.jp" or "cert.holy-auto.jp"）
   * 指定されていれば最優先
   */
  tenantCustomDomain?: string | null;
};

/**
 * Base URL を決定（末尾スラッシュなし）
 * 優先順位:
 * 1) tenantCustomDomain（将来）
 * 2) APP_URL（env）
 * 3) x-forwarded-proto/host（req.headers）
 * 4) new URL(req.url).origin
 * 5) http://localhost:3000
 */
export function resolveBaseUrl(opts: ResolveBaseUrlOptions = {}): string {
  const envAppUrl = (process.env.APP_URL ?? "").trim();
  const tenant = (opts.tenantCustomDomain ?? "").trim();

  const normalize = (u: string) => {
    let s = u.trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    s = s.replace(/\/+$/, "");
    return s;
  };

  if (tenant) {
    const n = normalize(tenant);
    if (n) return n;
  }

  if (envAppUrl) {
    const n = normalize(envAppUrl);
    if (n) return n;
  }

  const req = opts.req;
  if (req) {
    const h = req.headers;
    const xfProto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
    const xfHost = (h.get("x-forwarded-host") ?? "").split(",")[0].trim();
    const host = (h.get("host") ?? "").trim();

    const proto = xfProto || "https";
    const finalHost = xfHost || host;

    if (finalHost) {
      return `${proto}://${finalHost}`.replace(/\/+$/, "");
    }

    try {
      return new URL(req.url).origin.replace(/\/+$/, "");
    } catch {
      // ignore
    }
  }

  return "http://localhost:3000";
}

export function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}