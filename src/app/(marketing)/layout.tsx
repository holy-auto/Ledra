import { Noto_Sans_JP } from "next/font/google";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/marketing/JsonLd";
import MarketingThemeWrapper from "./MarketingThemeWrapper";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "700"], // 500は実質400/700でブラウザ補間、リクエスト削減
  variable: "--font-noto",
  display: "swap",
  preload: true,
});

// ISR: All marketing pages regenerate every 1 hour
export const revalidate = 3600;

export const metadata = {
  title: {
    default: "Ledra | WEB施工証明書SaaS",
    template: "%s | Ledra",
  },
  description: "施工証明をデジタルで。Ledraは、施工店と保険会社をつなぐWEB施工証明書プラットフォームです。",
  openGraph: {
    title: "Ledra | WEB施工証明書SaaS",
    description: "施工証明をデジタルで。Ledraは、施工店と保険会社をつなぐWEB施工証明書プラットフォームです。",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingThemeWrapper
      data-theme="marketing"
      className={`${notoSansJP.variable} font-[family-name:var(--font-noto)] bg-[var(--mk-bg-base)]`}
    >
      <WebSiteJsonLd />
      <OrganizationJsonLd />
      <Header />
      <main>{children}</main>
      <Footer />
    </MarketingThemeWrapper>
  );
}
