import { Metadata } from "next";
import ShakenDashboardClient from "./ShakenDashboardClient";

export const metadata: Metadata = { title: "車検管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ShakenDashboardClient />;
}
