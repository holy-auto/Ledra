import { Metadata } from "next";
import CalendarClient from "./CalendarClient";

export const metadata: Metadata = { title: "入庫カレンダー" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <CalendarClient />;
}
