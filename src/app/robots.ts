import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/marketing/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // NOTE: robots.txt の disallow は前方一致。"/poc" を入れると公開ページの
        // /poc-program まで巻き込むため入れない。個社向け /poc はページ側の
        // noindex メタデータで制御する（robots.txt に載せるとパス自体が公開情報になる）。
        disallow: ["/admin/", "/insurer/", "/customer/", "/api/", "/v/", "/login", "/register"],
      },
    ],
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
  };
}
