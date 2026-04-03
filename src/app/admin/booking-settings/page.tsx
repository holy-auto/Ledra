import type { Metadata } from "next";
import BookingSettingsClient from "./BookingSettingsClient";

export const metadata: Metadata = {
  title: "外部予約受付設定",
};

export default function BookingSettingsPage() {
  return <BookingSettingsClient />;
}
