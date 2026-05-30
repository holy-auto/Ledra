/**
 * GET /api/announcements/shop?tenant=<tenantId>&lang=<ja|en|zh|vi>
 *
 * 指定テナントの公開済み店舗お知らせを返す (顧客向け・公開エンドポイント)。
 * lang を指定すると translations から該当言語を当て、無ければ原文 (日本語) に
 * フォールバックする。各お知らせの available_langs も返すので、UI は言語切替を
 * 出し分けできる。
 */
import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getTenantIdBySlug } from "@/lib/customerPortalServer";

export const dynamic = "force-dynamic";

const LANGS = ["en", "zh", "vi"] as const;
type Lang = (typeof LANGS)[number];

interface Row {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  translations: Record<string, { title?: string; body?: string }> | null;
}

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`shop-announcements:${getClientIp(req)}`, { limit: 60, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    }

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("tenant is required");
    const tenantId = await getTenantIdBySlug(tenantSlug);
    if (!tenantId) return apiNotFound("unknown tenant");
    const langParam = url.searchParams.get("lang");
    const lang = (LANGS as readonly string[]).includes(langParam ?? "") ? (langParam as Lang) : null;

    const admin = createServiceRoleAdmin("public shop announcements — customer-facing, no auth session");
    const { data, error } = await admin
      .from("shop_announcements")
      .select("id, title, body, published_at, translations")
      .eq("tenant_id", tenantId)
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(20);
    if (error) return apiInternalError(error, "shop-announcements public GET");

    const announcements = ((data as Row[]) ?? []).map((r) => {
      const tr = r.translations ?? {};
      const available = LANGS.filter((l) => tr[l]?.title || tr[l]?.body);
      const picked = lang && tr[lang] ? tr[lang] : null;
      return {
        id: r.id,
        title: picked?.title || r.title,
        body: picked?.body || r.body,
        published_at: r.published_at,
        lang: picked ? lang : "ja",
        available_langs: ["ja", ...available],
      };
    });

    return apiJson({ announcements });
  } catch (e) {
    return apiInternalError(e, "shop-announcements public GET");
  }
}
