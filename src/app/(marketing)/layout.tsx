import { Noto_Sans_JP } from "next/font/google";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/marketing/JsonLd";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { PostHogProvider } from "@/components/marketing/PostHogProvider";
import { CTATracker } from "@/components/marketing/CTATracker";
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
      className={`${notoSansJP.variable} font-[family-name:var(--font-noto)] min-h-screen bg-base`}
    >
      <WebSiteJsonLd />
      <OrganizationJsonLd />
      <PostHogProvider />
      <CTATracker />
      <Header />
      <main>{children}</main>
      <Footer />
      <CookieConsent />
    </MarketingThemeWrapper>
  );
}
