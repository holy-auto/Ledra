import { Noto_Sans_JP } from "next/font/google";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/marketing/JsonLd";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import dynamic from "next/dynamic";
import MarketingThemeWrapper from "./MarketingThemeWrapper";

// posthog-js (~80KB) と CTATracker はレンダリングブロックなし (null返し/副作用のみ)。
// ssr:false でクライアントバンドルから初回 SSR チャンクを分離し root bundle を削減。
const PostHogProvider = dynamic(
  () => import("@/components/marketing/PostHogProvider").then((m) => ({ default: m.PostHogProvider })),
  { ssr: false },
);
const CTATracker = dynamic(
  () => import("@/components/marketing/CTATracker").then((m) => ({ default: m.CTATracker })),
  { ssr: false },
);

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
