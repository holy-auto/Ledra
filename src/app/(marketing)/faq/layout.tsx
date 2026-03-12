import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/marketing/config";

export const metadata: Metadata = {
  title: `よくある質問 | ${siteConfig.siteName}`,
  description:
    "CARTRUSTに関するよくある質問をまとめました。施工証明書の発行方法、料金プラン、保険会社連携など。",
  openGraph: {
    title: `よくある質問 | ${siteConfig.siteName}`,
    description:
      "CARTRUSTに関するよくある質問をまとめました。施工証明書の発行方法、料金プラン、保険会社連携など。",
    url: `${siteConfig.siteUrl}/faq`,
  },
  twitter: {
    title: `よくある質問 | ${siteConfig.siteName}`,
    description:
      "CARTRUSTに関するよくある質問をまとめました。施工証明書の発行方法、料金プラン、保険会社連携など。",
  },
};

export default function FaqLayout({ children }: { children: ReactNode }) {
  return children;
}
