import "./globals.css";

export const metadata = {
  title: "HOLY-CERT",
  description: "WEB施工証明書SaaS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
