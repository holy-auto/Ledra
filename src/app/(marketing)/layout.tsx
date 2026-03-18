import { Noto_Sans_JP } from "next/font/google";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
  display: "swap",
});

// ISR: All marketing pages regenerate every 1 hour
export const revalidate = 3600;

export const metadata = {
  title: {
    default: "CARTRUST | WEB施工証明書SaaS",
    template: "%s | CARTRUST",
  },
  description:
    "施工証明をデジタルで。CARTRUSTは、施工店と保険会社をつなぐWEB施工証明書プラットフォームです。",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${notoSansJP.variable} font-[family-name:var(--font-noto)] bg-[#060a12]`}
    >
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
