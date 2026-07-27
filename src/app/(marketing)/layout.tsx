import { Noto_Sans_JP } from "next/font/google";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/marketing/JsonLd";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { PostHogProvider } from "@/components/marketing/PostHogProvider";
import { GoogleAnalytics } from "@/components/marketing/GoogleAnalytics";
import { CTATracker } from "@/components/marketing/CTATracker";
import { PromoBannerClient } from "@/components/marketing/PromoBannerClient";
import { StickyMobileCTA } from "@/components/marketing/StickyMobileCTA";
import MarketingThemeWrapper from "./MarketingThemeWrapper";
import { siteConfig } from "@/lib/marketing/config";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "700"], // 500は実質400/700でブラウザ補間、リクエスト削減
  variable: "--font-noto",
  display: "swap",
  preload: true,
});

// ISR: All marketing pages regenerate every 60 seconds (was 3600)
export const revalidate = 60;

export const metadata = {
  title: {
    default: `${siteConfig.siteName}｜${siteConfig.siteTagline}`,
    template: `%s | ${siteConfig.siteName}`,
  },
  description: siteConfig.siteDescription,
  keywords: siteConfig.keywords,
  openGraph: {
    title: `${siteConfig.siteName}｜${siteConfig.siteTagline}`,
    description: siteConfig.siteDescription,
    siteName: siteConfig.siteName,
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
      <GoogleAnalytics />
      <CTATracker />
      <PromoBannerClient />
      <Header />
      <main>{children}</main>
      <Footer />
      <StickyMobileCTA />
      <CookieConsent />
    </MarketingThemeWrapper>
  );
}
