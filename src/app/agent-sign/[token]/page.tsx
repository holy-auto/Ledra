import type { Metadata } from "next";
import AgentSignClient from "./AgentSignClient";

export const metadata: Metadata = {
  title: "代理店契約書 電子署名 | Ledra",
  description: "契約書の内容を確認し、電子署名を行ってください。",
  robots: { index: false, follow: false },
};

export default async function AgentSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AgentSignClient token={token} />;
}
