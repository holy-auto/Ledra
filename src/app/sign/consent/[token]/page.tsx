import type { Metadata } from "next";
import ConsentSignClient from "./ConsentSignClient";

export const metadata: Metadata = {
  title: "車体整備 同意サイン | Ledra",
  description: "車体整備の作業内容・料金をご確認の上、同意サイン (電子署名) を行ってください。",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ConsentSignPage({ params }: PageProps) {
  const { token } = await params;
  return <ConsentSignClient token={token} />;
}
