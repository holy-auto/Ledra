import { Metadata } from "next";
import NotificationLogsClient from "./NotificationLogsClient";

export const metadata: Metadata = { title: "通知配信状況" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <NotificationLogsClient />;
}
