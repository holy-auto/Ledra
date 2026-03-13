import "./globals.css";
import { Geist_Mono } from "next/font/google";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "HOLY-CERT",
  description: "WEB施工証明書SaaS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={geistMono.variable}>
      <body className="bg-base text-primary antialiased">{children}</body>
    </html>
  );
}
