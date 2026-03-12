import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/lib/marketing/config";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: `${siteConfig.siteName} — 施工証明をデジタルで`,
    template: `%s | ${siteConfig.siteName}`,
  },
  description: siteConfig.siteDescription,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: siteConfig.siteName,
    title: `${siteConfig.siteName} — 施工証明をデジタルで`,
    description: siteConfig.siteDescription,
    url: siteConfig.siteUrl,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${siteConfig.siteName} — 施工証明をデジタルで`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.siteName} — 施工証明をデジタルで`,
    description: siteConfig.siteDescription,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
