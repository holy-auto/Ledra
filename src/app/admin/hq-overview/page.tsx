import type { Metadata } from "next";
import HQOverviewClient from "./HQOverviewClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "本社横断ビュー | Ledra",
  description: "本社から組織配下の全店舗の顧客・車両・作業履歴を横断閲覧します。",
};

export default function HQOverviewPage() {
  return <HQOverviewClient />;
}
