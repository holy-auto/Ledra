import type { Metadata } from "next";
import PartConfirmClient from "./PartConfirmClient";

export const metadata: Metadata = {
  title: "部品交換の確認 | Ledra",
  description: "交換部品の内容を確認し、電子署名で確定してください。",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: { token: string };
}

export default function PartConfirmPage({ params }: PageProps) {
  return <PartConfirmClient token={params.token} />;
}
