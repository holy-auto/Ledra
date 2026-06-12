import { Metadata } from "next";
import NotificationBroadcastsClient from "./NotificationBroadcastsClient";

export const metadata: Metadata = { title: "一斉配信" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <NotificationBroadcastsClient />;
}
