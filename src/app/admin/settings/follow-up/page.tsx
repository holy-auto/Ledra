import { Metadata } from "next";
import FollowUpSettingsClient from "./FollowUpSettingsClient";

export const metadata: Metadata = { title: "フォローアップ設定" };

export default function Page() {
  return <FollowUpSettingsClient />;
}
