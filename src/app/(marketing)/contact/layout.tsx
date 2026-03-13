import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/marketing/config";

export const metadata: Metadata = {
  title: `お問い合わせ | ${siteConfig.siteName}`,
  description:
    "CARTRUSTへのお問い合わせはこちらから。導入相談・料金・機能についてお気軽にご連絡ください。",
  openGraph: {
    title: `お問い合わせ | ${siteConfig.siteName}`,
    description:
      "CARTRUSTへのお問い合わせはこちらから。導入相談・料金・機能についてお気軽にご連絡ください。",
    url: `${siteConfig.siteUrl}/contact`,
  },
  twitter: {
    title: `お問い合わせ | ${siteConfig.siteName}`,
    description:
      "CARTRUSTへのお問い合わせはこちらから。導入相談・料金・機能についてお気軽にご連絡ください。",
  },
};

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
