import { Metadata } from "next";
import LineBroadcastsClient from "./LineBroadcastsClient";

export const metadata: Metadata = { title: "LINE一斉配信" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <LineBroadcastsClient />;
}
