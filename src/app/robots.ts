import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/marketing/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/insurer/",
          "/customer/",
          "/api/",
          "/login",
          "/register",
        ],
      },
    ],
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
  };
}
