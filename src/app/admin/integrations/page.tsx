import type { Metadata } from "next";
import IntegrationsClient from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API連携 | Ledra",
  description: "基幹ソフト連携のための APIキー・Webhook を管理します。",
};

export default function IntegrationsPage() {
  return <IntegrationsClient />;
}
