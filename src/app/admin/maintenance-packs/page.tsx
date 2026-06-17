import { Metadata } from "next";
import MaintenancePacksClient from "./MaintenancePacksClient";

export const metadata: Metadata = { title: "メンテパック管理" };

export default function Page() {
  return <MaintenancePacksClient />;
}
